/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import { spawn } from 'node-pty';

setTimeout(() => {
	process!.send({
		type: 'data',
		content: 'test'
	});
}, 1000);

console.log('log test');
