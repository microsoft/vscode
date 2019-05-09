/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const httpServer = require('http-server');
const opn = require('opn');

httpServer.createServer({ root: '.', cache: 5 }).listen(8080);
console.log('LISTENING on 8080');

opn('http://127.0.0.1:8080/out/vs/code/browser/workbench/workbench.html');