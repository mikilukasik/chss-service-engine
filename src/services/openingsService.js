import fs from 'fs';
import path from 'path';
import { board2fen } from '../../../chss-module-engine/src/engine_new/transformers/board2fen';
import chessTools from '../../chess-tools';
import { moveString2move } from '../../chss-module-engine/src/engine/engine';

const binFile = path.resolve('./data/openings/codekiddy.bin');
let _finder;
const finderAwaiters = [];

const getFinder = () => new Promise(resolve => {
  if (_finder) return resolve(_finder);
  finderAwaiters.push(resolve);
});

const book = new chessTools.OpeningBooks.Polyglot;
const readStream = fs.createReadStream(binFile);
book.load_book(readStream);

book.on('loaded', () => {
  _finder = book.find.bind(book);
  finderAwaiters.forEach(resolve => resolve(_finder));
});

export const getMoveFromBooks = async(game) => {
  const finder = await getFinder();
  const fen = board2fen(game.board);

  const entries = finder(fen);
  if (!entries) return null;

  return moveString2move(entries[0]._algebraic_move);
};
