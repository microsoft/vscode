/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from 'vs/platform/files/common/files';

export class ResourceServiceWorkerService {

	constructor(
		@IFileService private readonly _fileService: IFileService,
	) {
		console.log(this._fileService);
	}
}

// const url = require.toUrl('./resourceServiceWorkerMain.js');
const url = './resourceServiceWorkerMain.js';

navigator.serviceWorker.register(
	url,
	// { scope: './out/vs/workbench/contrib/resources/browser/' }
).then(value => {
	console.log(value);
	console.log(navigator.serviceWorker.controller);
}).catch(err => {
	console.error(err);
});

