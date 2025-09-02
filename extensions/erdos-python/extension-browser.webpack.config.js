/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Posit Software, PBC.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const config = require('./build/webpack/webpack.extension.browser.config');

module.exports = {
    context: __dirname,
    ...config
};

