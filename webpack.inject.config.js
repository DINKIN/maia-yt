const path = require('path');
const merge = require('webpack-merge');
const common = require('./webpack.common.config.js');

module.exports = merge(common, {
  entry: {
    index: './src/app/bootstrap.inject.ts'
  },
  output: {
    filename: 'inject.js',
    path: path.resolve(__dirname, 'dist')
  }
});