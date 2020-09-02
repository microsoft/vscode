/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Typefox. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

const os = require('os');
const path = require('path');
const product = require('../product.json');

let dataFolderName = product.dataFolderName;
// Running out of sources
if (process.env['VSCODE_DEV']) {
	dataFolderName += '-dev';
}
const userDataDir = path.join(os.homedir(), dataFolderName);
module.exports = {
	userDataDir
};