import { predictMove } from '../../services/predictionService.js';
import { move2moveString } from '../../../../chss-module-engine/src/engine_new/transformers/move2moveString.js';
import { getMovedBoard } from '../../../../chss-module-engine/src/engine_new/utils/getMovedBoard.js';
import { getBoardPieceBalance } from '../../../../chss-module-engine/src/engine_new/utils/getBoardPieceBalance.js';
import { getUpdatedLmfLmt } from '../../../../chss-module-engine/src/engine_new/utils/getUpdatedLmfLmt.js';
import { runOnWorker } from '../../services/workersService.js';
// import { getMoveFromBooks } from '../../services/openingsService';

const getMoveEvaluator = async ({ game, modelName }) => {
  const prediction = await predictMove({ game, modelName });
  return (move) => prediction.moveValues[move];
};

export const predictOnGridHandler = [
  'predictOnGrid',
  async (data, comms) => {
    const { game, aiMultiplier, deepMoveSorters, depth } = data;
    const { nextMoves, board, lmf, lmt } = game;
    const started = Date.now();

    if (nextMoves.length === 1) {
      await new Promise((r) => setTimeout(r, 750));

      return comms.send({
        value: 0,
        pieceValue: 0,
        move: nextMoves[0],
        moveStr: move2moveString(nextMoves[0]),
        ms: Date.now() - started,
      });
    }

    // const moveFromBooks = await getMoveFromBooks(game);
    // if (moveFromBooks) {
    //   console.log({ moveFromBooks });
    // }

    const progress = {
      total: nextMoves.length,
      completed: 0,
    };

    const { modelName, cutoff } = deepMoveSorters.shift();

    const moveEvaluator = await getMoveEvaluator({ game, modelName: modelName });
    const moveAiValues = nextMoves.map(moveEvaluator);
    const wantsToDraw = board[64] ? getBoardPieceBalance(board) < 0 : getBoardPieceBalance(board) > 0;

    const sortedMoves = new Array(nextMoves.length)
      .fill(0)
      .map((e, i) => i)
      .filter((i) => moveAiValues[i] >= moveAiValues[0] * (cutoff || 0))
      .sort((a, b) => moveAiValues[b] - moveAiValues[a])
      .map((i) => nextMoves[i]);

    let winningMove;
    let pieceValue;
    const busyClients = {};

    const instructBusyClients = (cmd, data) => {
      Object.keys(busyClients).forEach((id) => {
        busyClients[id]({ cmd, data, id });
      });
    };

    if (board[64]) {
      let value = -999999;
      const minimaxParamsArr = [];
      await Promise.all(
        sortedMoves.map((move) => {
          const moveAiValue = moveEvaluator(move) * aiMultiplier; // / 3;
          const movedBoard = Array.from(getMovedBoard(move, board));
          const nextLm = getUpdatedLmfLmt({ move, lmf, lmt });

          const params = {
            board: movedBoard,
            depth: depth - 1,
            alpha: value,
            beta: 999999,
            valueToAdd: moveAiValue,
            deepMoveSorters,
            lmf: nextLm.lmf,
            lmt: nextLm.lmt,
            wantsToDraw,
            move,
          };
          minimaxParamsArr.push(params);

          let id;
          return runOnWorker('minimax', params, ({ sendData, key }) => {
            id = key;
            busyClients[key] = sendData;
          }).then((nmVal) => {
            delete busyClients[id];
            progress.completed += 1;

            if (nmVal > value) {
              value = nmVal;
              instructBusyClients('setAlpha', nmVal);
              minimaxParamsArr.forEach((p) => (p.alpha = nmVal));

              pieceValue = nmVal - moveAiValue;
              winningMove = move;
            }

            comms.data(progress);
          });
        }),
      );

      return comms.send({
        value,
        pieceValue,
        move: winningMove,
        moveStr: move2moveString(winningMove),
        ms: Date.now() - started,
      });
    }

    let value = 999999;
    const minimaxParamsArr = [];
    await Promise.all(
      sortedMoves.map((move) => {
        const moveAiValue = moveEvaluator(move) * -aiMultiplier; // / -3;
        const movedBoard = Array.from(getMovedBoard(move, board));
        const nextLm = getUpdatedLmfLmt({ move, lmf, lmt });

        const params = {
          board: movedBoard,
          depth: depth - 1,
          alpha: -999999,
          beta: value,
          valueToAdd: moveAiValue,
          deepMoveSorters,
          lmf: nextLm.lmf,
          lmt: nextLm.lmt,
          wantsToDraw,
          move,
        };
        minimaxParamsArr.push(params);

        let id;
        return runOnWorker('minimax', params, ({ sendData, key }) => {
          id = key;
          busyClients[key] = sendData;
        }).then((nmVal) => {
          delete busyClients[id];
          progress.completed += 1;

          if (nmVal < value) {
            value = nmVal;
            instructBusyClients('setBeta', nmVal);
            minimaxParamsArr.forEach((p) => (p.beta = nmVal));

            pieceValue = nmVal - moveAiValue;
            winningMove = move;
          }

          comms.data(progress);
        });
      }),
    );

    return comms.send({
      value,
      pieceValue,
      move: winningMove,
      moveStr: move2moveString(winningMove),
      ms: Date.now() - started,
    });
  },
];
