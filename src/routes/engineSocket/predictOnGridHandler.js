import { predictMove } from '../../services/predictionService.js';
import { move2moveString } from '../../../../chss-module-engine/src/engine_new/transformers/move2moveString.js';
import { getMovedBoard } from '../../../../chss-module-engine/src/engine_new/utils/getMovedBoard.js';
import { getBoardPieceBalance } from '../../../../chss-module-engine/src/engine_new/utils/getBoardPieceBalance.js';
import { getUpdatedLmfLmt } from '../../../../chss-module-engine/src/engine_new/utils/getUpdatedLmfLmt.js';
// import { runOnWorker } from '../../services/workersService.js';
import { getMovesFromBooks } from '../../services/openingsService.js';
import { board2fen } from '../../../chss-module-engine/src/engine_new/transformers/board2fen.js';
import { runOnSubWorker } from '../../services/subWorkersService.js';

const getMoveEvaluator = async ({ game, modelName }) => {
  const prediction = await predictMove({ game, modelName });
  return (move) => prediction.moveValues[move];
};

export const predictOnGridHandler = [
  'predictOnGrid',
  async (data, comms) => {
    const { game, aiMultiplier, deepMoveSorters, depth, repeatedFenPenality } = data;
    const { nextMoves, board, lmf, lmt, allPastFens } = game;
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

    const movesFromBooksPromise = getMovesFromBooks(game);

    const progress = {
      total: nextMoves.length,
      completed: 0,
    };

    const { modelName, cutoff } = deepMoveSorters.shift();

    const moveEvaluator = await getMoveEvaluator({ game, modelName: modelName });
    const moveAiValues = nextMoves.map(moveEvaluator);
    const boardPieceBalance = getBoardPieceBalance(board);
    const wantsToDraw = board[64] ? boardPieceBalance < 0 : boardPieceBalance > 0;

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
        busyClients[id]({ cmd, data });
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

          const pastMatchCount = allPastFens.filter((fen) => fen === board2fen(movedBoard)).length;

          let loopValue = 0;
          if (pastMatchCount > 0) {
            loopValue = pastMatchCount === 1 ? repeatedFenPenality * (wantsToDraw ? 1 : -1) : -boardPieceBalance;
          }
          // console.log({ pastMatchCount, loopValue });

          const params = {
            board: movedBoard,
            depth: depth - 1,
            alpha: value,
            beta: 999999,
            valueToAdd: moveAiValue + loopValue,
            deepMoveSorters,
            lmf: nextLm.lmf,
            lmt: nextLm.lmt,
            wantsToDraw,
            move,
          };
          minimaxParamsArr.push(params);

          // const dataHandler = ({ setAlpha }) => {
          //   if (setAlpha && setAlpha > value) {
          //     instructBusyClients('setAlpha', setAlpha);
          //     minimaxParamsArr.forEach((p) => (p.alpha = setAlpha));
          //   }
          // };

          return runOnSubWorker('minimax', params, {
            onWorkerAssign: ({ sendData, key }) => {
              busyClients[key] = sendData;
            },
            onWorkerDeassign: ({ key }) => {
              delete busyClients[key];
            },
            // dataHandler,
          }).then((nmVal) => {
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

        const pastMatchCount = allPastFens.filter((fen) => fen === board2fen(movedBoard)).length;

        let loopValue = 0;
        if (pastMatchCount > 0) {
          loopValue = pastMatchCount === 1 ? repeatedFenPenality * (wantsToDraw ? 1 : -1) : boardPieceBalance;
        }

        const params = {
          board: movedBoard,
          depth: depth - 1,
          alpha: -999999,
          beta: value,
          valueToAdd: moveAiValue - loopValue,
          deepMoveSorters,
          lmf: nextLm.lmf,
          lmt: nextLm.lmt,
          wantsToDraw,
          move,
        };
        minimaxParamsArr.push(params);

        // const dataHandler = ({ setBeta }) => {
        //   if (setBeta && setBeta < value) {
        //     instructBusyClients('setBeta', setBeta);
        //     minimaxParamsArr.forEach((p) => (p.beta = setBeta));
        //   }
        // };

        return runOnSubWorker('minimax', params, {
          onWorkerAssign: ({ sendData, key }) => {
            busyClients[key] = sendData;
          },
          onWorkerDeassign: ({ key }) => {
            delete busyClients[key];
          },
          // dataHandler,
        }).then((nmVal) => {
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

    const movesFromBooks = await movesFromBooksPromise;

    if (movesFromBooks && movesFromBooks.length) {
      let willUseSecondBest = false;

      if (winningMove === movesFromBooks[1]) {
        // random select move
        console.log('chance for random');
        willUseSecondBest = Math.random() < 0.4;
      }

      console.log(`Book move, random: ${willUseSecondBest}`);

      return comms.send({
        value: 0,
        pieceValue: 0,
        move: movesFromBooks[willUseSecondBest ? 1 : 0],
        moveStr: move2moveString(movesFromBooks[willUseSecondBest ? 1 : 0]),
        ms: Date.now() - started,
      });
    }

    return comms.send({
      value,
      pieceValue,
      move: winningMove,
      moveStr: move2moveString(winningMove),
      ms: Date.now() - started,
    });
  },
];
