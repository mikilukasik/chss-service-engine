require('babel-register')({
  presets: [[ 'env', { targets: { node: '14' } }]],
  ignore: [/\/node_modules\/(?!chss-engine)/]
});

module.exports = require('./server.js').default();
