import { predictMoveHandler } from './engineSocket/predictMoveHandler.js';

export const initRoutes = ({ msg }) => {
  const engineSocket = msg.ws('/engineSocket');
  engineSocket.on(...predictMoveHandler);
};
