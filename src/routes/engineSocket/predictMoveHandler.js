import { predictMove } from '../../services/predictionService.js';

export const predictMoveHandler = [
  'predictMove',
  async (data, comms) => {
    comms.send(await predictMove(data));
  },
];
