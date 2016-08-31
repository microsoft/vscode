/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

let request = require('request');
let unzip = require('unzip');

request.get("https://github.com/Khan/KaTeX/releases/download/v0.6.0/katex.zip")
	.pipe(unzip.Extract({ path: __dirname + "/../media"}));
