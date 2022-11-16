// import { predictMove } from '../../services/predictionService.js';

import { getMovedBoard } from '../../../../chss-module-engine/src/engine_new/utils/getMovedBoard.js';
import { predictMove } from '../../services/predictionService.js';

export const predictOnGridHandler = [
  'predictOnGrid',
  async (data, comms) => {
    const { game, aiMultiplier, deepMoveSorters } = data;

    const started = Date.now();

    const prediction = await predictMove({ game, modelName: deepMoveSorters[0].modelName });

    getMovedBoard;

    return comms.send({ a: 1 });
  },
];
