/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const { bootstrap } = require('./bootstrap-amd');

bootstrap('vs/code/node/driver', ({ connect }) => {
	console.log(connect);
});