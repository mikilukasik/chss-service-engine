import { predictMoveHandler } from './engineSocket/predictMoveHandler.js';
import { predictOnGridHandler } from './engineSocket/predictOnGridHandler.js';

let engineSocket;
const engineSocketResolvers = [];

let mainWorkerSocket;

let _msg;
let msgResolvers = [];

export const getMsg = () =>
  new Promise((resolve) => {
    if (_msg) return resolve(_msg);
    msgResolvers.push(resolve);
  });

export const getEngineSocket = () =>
  new Promise((resolve) => {
    if (engineSocket) return resolve(engineSocket);
    engineSocketResolvers.push(resolve);
  });

export const initRoutes = ({ msg }) => {
  _msg = msg;
  msgResolvers.forEach((resolve) => resolve(msg));

  msg.on(...predictOnGridHandler);

  engineSocket = msg.ws('/engineSocket');
  engineSocketResolvers.forEach((resolve) => resolve(engineSocket));

  engineSocket.on(...predictMoveHandler);
  engineSocket.on(...predictOnGridHandler);
};

export const getMainWorkerSocket = () =>
  new Promise((resolve) => {
    if (mainWorkerSocket) return resolve(mainWorkerSocket);

    getMsg().then((msg) => {
      mainWorkerSocket = msg.ws('/mainWorkerSocket');
      return resolve(mainWorkerSocket);
    });
  });
