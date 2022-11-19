import { predictMoveHandler } from './engineSocket/predictMoveHandler.js';
import { predictOnGridHandler } from './engineSocket/predictOnGridHandler.js';

let engineSocket;
const engineSocketResolvers = [];

export const getEngineSocket = () =>
  new Promise((resolve) => {
    if (engineSocket) return resolve(engineSocket);
    engineSocketResolvers.push(resolve);
  });

export const initRoutes = ({ msg }) => {
  msg.on(...predictOnGridHandler);

  engineSocket = msg.ws('/engineSocket');
  engineSocketResolvers.forEach((resolve) => resolve(engineSocket));

  engineSocket.on(...predictMoveHandler);
  engineSocket.on(...predictOnGridHandler);
};
