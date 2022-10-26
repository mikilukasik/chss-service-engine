import { predictMoveHandler } from './predictionSocket/predictMoveHandler.js';

export const initRoutes = ({ msg }) => {
  const predictionSocket = msg.ws('/predictionSocket');
  predictionSocket.on(...predictMoveHandler);
};
