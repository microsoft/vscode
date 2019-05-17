/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const httpServer = require('http-server');
const opn = require('opn');

const url = 'http://127.0.0.1:8080/out/vs/code/browser/workbench/workbench.html';

httpServer.createServer({ root: '.', cache: 5 }).listen(8080);
console.log(`Open ${url} in your browser`);

opn(url);