// import { move2moveString } from '../../../chss-module-engine/src/engine_new/transformers/move2moveString.js';
import { getEngineSocket } from '../routes/routes.js';

const WORKER_TIMEOUT = 30000;

const nextAvailableConnectionResolvers = [];
const connectionMetas = {};
const ongoingTasks = {};

const assignConnectionMeta = ({ key }, valueObj) => {
  connectionMetas[key] = Object.assign(connectionMetas[key] || {}, valueObj);
};

const getConnMeta = ({ key }) => connectionMetas[key] || {};

const tryToHelpOngoingTask = () => {};

const onSocketOpen = (connection) => {
  assignConnectionMeta(connection, { busy: true });
  connection
    .do('init')
    .then((a) => {
      console.log(a);
      const pendingConnectionResolver = nextAvailableConnectionResolvers.pop();
      if (pendingConnectionResolver) {
        pendingConnectionResolver(connection);
        return;
      }

      if (tryToHelpOngoingTask(connection)) return;

      assignConnectionMeta(connection, { busy: false });
    })
    .catch(console.error);
};

const onSocketClose = ({ key }) => delete connectionMetas[key];

const getNextAvailableConnection = async () => {
  const { connections } = await getEngineSocket();
  const availableConnection = connections
    .filter((c) => !getConnMeta(c).busy)
    .sort((a, b) => {
      const timeoutCountDiff = (getConnMeta(b).timeoutCount || 0) - (getConnMeta(a).timeoutCount || 0);
      if (timeoutCountDiff !== 0) return timeoutCountDiff;

      return b.cookies.get('CHSS_CLIENT_SPEED_V2') - a.cookies.get('CHSS_CLIENT_SPEED_V2');
    })
    .pop();

  if (!availableConnection) return new Promise((resolve) => nextAvailableConnectionResolvers.unshift(resolve));

  assignConnectionMeta(availableConnection, { busy: true });
  return availableConnection;
};

export const runOnSubWorker = async (
  command,
  data,
  {
    onWorkerAssign = () => {
      console.log('empty');
    },
    onWorkerDeassign = () => {
      console.log('empty');
    },
    taskId = Math.random(),
    // dataHandler = () => {},
  } = {},
) => {
  const connection = await getNextAvailableConnection();

  let timedOut = false;
  const response = await new Promise((resolve) => {
    const timeout = setTimeout(async () => {
      // worker timed out
      timedOut = true;
      assignConnectionMeta(connection, { timeoutCount: (getConnMeta(connection).timeoutCount || 0) + 1 });
      console.log('A worker timed out', getConnMeta(connection));

      onWorkerDeassign({ key: taskId });
      return resolve(await runOnSubWorker(command, data, { onWorkerAssign, onWorkerDeassign, taskId }));
    }, WORKER_TIMEOUT);

    connection
      .do(command, data, ({ data: sendData /* , onData */ }) => {
        // onData(dataHandler);
        onWorkerAssign({ sendData, key: taskId });

        if (!ongoingTasks[taskId])
          ongoingTasks[taskId] = {
            taskId,
            command,
            data,
            onWorkerAssign,
            onWorkerDeassign,
            resolve,
            connections: {},
          };
        ongoingTasks[taskId].connections[connection.key] = { connection, sendData, startedAt: Date.now() };
      })
      .then((result) => {
        clearTimeout(timeout);
        delete ongoingTasks[taskId].connections[connection.key];

        // ongoingTasks[taskId].connections.forEach(({ sendData }) => {
        //   sendData;
        // });

        if (!timedOut) {
          onWorkerDeassign({ key: taskId });
          return resolve(result);
        }

        console.log('slow worker returned', connection.key, getConnMeta(connection));
        // we will not try to use this worker to speed up any ongoing tasks, it was already too slow.. maybe next time
        assignConnectionMeta(connection, { busy: false });
      });
  });

  if (timedOut) return response;

  const pendingConnectionResolver = nextAvailableConnectionResolvers.pop();
  if (pendingConnectionResolver) {
    pendingConnectionResolver(connection);
    return response;
  }

  if (tryToHelpOngoingTask(connection)) return response;

  assignConnectionMeta(connection, { busy: false });
  return response;
};

export const initSubWorkersService = async () => {
  const engineSocket = await getEngineSocket();

  engineSocket.onEvt('open', onSocketOpen);
  engineSocket.onEvt('close', onSocketClose);
};
