/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import * as DOM from 'vs/base/browser/dom';

class NotebookLogger {
	constructor() {
		this._domFrameLog();
	}
	private _frameId = 0;
	private _domFrameLog() {
		// DOM.scheduleAtNextAnimationFrame(() => {
		// 	this._frameId++;

		// 	this._domFrameLog();
		// }, 1000000);
	}

	debug(...args: unknown[]) {
		const date = new Date();
		console.log(`${date.getSeconds()}:${date.getMilliseconds().toString().padStart(3, '0')}`, `frame #${this._frameId}: `, ...args);
	}
}

const instance = new NotebookLogger();
export function notebookDebug(...args: unknown[]) {
	instance.debug(...args);
}

