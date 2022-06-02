const msgService = require('./msg/src/service');
const { initRoutes } = require('./src/routes/routes');

const SERVICE_NAME = 'chss-service-engine';
const PORT = 5768;
const MSG_GATEWAY_ADDRESS = '0.0.0.0:3300';

export default () => {
  const msg = msgService({
    PORT,
    serviceName: SERVICE_NAME,
    gatewayAddress: MSG_GATEWAY_ADDRESS,
  });

  msg
    .connect()
    .then(() => {
      console.log('MSG connected: ' + SERVICE_NAME);
      initRoutes({ msg });
    })
    .catch(console.error);
};
