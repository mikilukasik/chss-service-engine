import { getEngineSocket } from '../routes/routes.js';

const WORKER_TIMEOUT = 30000;

const nextAvailableConnectionResolvers = [];
const connectionMetas = {};

const assignConnectionMeta = ({ key }, valueObj) => {
  connectionMetas[key] = Object.assign(connectionMetas[key] || {}, valueObj);
};

const getConnMeta = ({ key }) => connectionMetas[key] || {};

const onSocketOpen = (connection) => {
  assignConnectionMeta(connection, { busy: true });
  connection.do('init').then(() => {
    const pendingConnectionResolver = nextAvailableConnectionResolvers.pop();
    if (pendingConnectionResolver) {
      pendingConnectionResolver(connection);
      return;
    }

    assignConnectionMeta(connection, { busy: false });
  });
};

const onSocketClose = ({ key }) => delete connectionMetas[key];

const getNextAvailableConnection = async () => {
  const { connections } = await getEngineSocket();
  const availableConnection = connections
    .filter((c) => !getConnMeta(c).busy)
    .sort((a, b) => {
      const timeoutCountDiff = (getConnMeta(b).timeoutCount || 0) - (getConnMeta(a).timeoutCount || 0);
      if (timeoutCountDiff !== 0) return timeoutCountDiff;

      return a.cookies.get('CHSS_CLIENT_SPEED') - b.cookies.get('CHSS_CLIENT_SPEED');
    })
    .pop();

  if (!availableConnection) return new Promise((resolve) => nextAvailableConnectionResolvers.unshift(resolve));

  assignConnectionMeta(availableConnection, { busy: true });
  return availableConnection;
};

export const runOnWorker = async (command, data, cb) => {
  const connection = await getNextAvailableConnection();
  let timedOut = false;
  const response = await new Promise((resolve) => {
    const timeout = setTimeout(async () => {
      // worker timed out
      timedOut = true;
      assignConnectionMeta(connection, { timeoutCount: (getConnMeta(connection).timeoutCount || 0) + 1 });
      console.log('A worker timed out', getConnMeta(connection));

      return resolve(await runOnWorker(command, data, cb));
    }, WORKER_TIMEOUT);

    connection
      .do(command, data, ({ data: sendData }) => cb({ sendData, key: connection.key }))
      .then((result) => {
        clearTimeout(timeout);
        if (!timedOut) return resolve(result);

        console.log('slow worker returned', connection.key, getConnMeta(connection));
        assignConnectionMeta(connection, { busy: false });
      });
  });

  if (timedOut) return response;

  const pendingConnectionResolver = nextAvailableConnectionResolvers.pop();
  if (pendingConnectionResolver) {
    pendingConnectionResolver(connection);
    return response;
  }

  assignConnectionMeta(connection, { busy: false });
  return response;
};

export const initWorkersService = async () => {
  const engineSocket = await getEngineSocket();

  engineSocket.onEvt('open', onSocketOpen);
  engineSocket.onEvt('close', onSocketClose);
};
