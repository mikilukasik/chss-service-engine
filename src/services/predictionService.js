import * as tf from '@tensorflow/tfjs-node';
import fetch from 'node-fetch';

const PRELOAD_MODELS = []; //['oneHot', 'inc'];
const loadedModels = {};

export const withDots = (str) =>
  str
    .replace(/-dot-/g, '.')
    .replace(/-dollar-/g, '$')
    .replace(/-slash-/g, '/');

const getModel = async ({ modelName: mn }) => {
  const modelName = withDots(mn.replace(/models-slash-/, ''));
  if (loadedModels[modelName]) return loadedModels[modelName];

  console.log(`Loading model ? ${modelName}...`);

  let loader;
  eval(await (await fetch(`http://localhost:3300/models/${modelName}/loader.js`)).text());

  const { predict } = await loader({
    tf,
    modelUrl: modelName.startsWith('py-')
      ? `http://localhost:3600/predict`
      : `http://localhost:3300/models/${modelName}/model.json`,
  });

  loadedModels[modelName] = { predict };
  return loadedModels[modelName];
};

export const predictMove = async ({ game, modelName }) => {
  try {
    const { predict } = await getModel({ modelName });
    return await predict({ game });
  } catch (e) {
    console.error(e);
    return {};
  }
};

PRELOAD_MODELS.forEach((modelName) => getModel({ modelName }));
