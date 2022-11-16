import { predictMoveHandler } from './engineSocket/predictMoveHandler.js';
import { predictOnGridHandler } from './engineSocket/predictOnGridHandler.js';

export const initRoutes = ({ msg }) => {
  const engineSocket = msg.ws('/engineSocket');
  engineSocket.on(...predictMoveHandler);
  engineSocket.on(...predictOnGridHandler);
};
