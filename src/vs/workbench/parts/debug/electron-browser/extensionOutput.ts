/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IDebugService } from 'vs/workbench/parts/debug/common/debug';
import errors = require('vs/base/common/errors');
import types = require('vs/base/common/types');
import severity from 'vs/base/common/severity';
import { ILogEntry, PLUGIN_LOG_BROADCAST_CHANNEL } from 'vs/workbench/services/thread/electron-browser/threadService';
import { IWindowService, IBroadcast } from 'vs/workbench/services/window/electron-browser/windowService';

import ipc = require('ipc');

export class ExtensionOutputHandler implements IWorkbenchContribution {

	static ID = 'debug.extensionOutputHandler';

	constructor(
		@IDebugService private debugService: IDebugService,
		@IWindowService private windowService: IWindowService
	) {
		this.registerListeners();
	}

	private registerListeners(): void {
		this.windowService.onBroadcast.add(this.onBroadcast, this);
	}

	private onBroadcast(broadcast: IBroadcast): void {
		let session = this.debugService.getActiveSession();
		if (!session || session.getType() !== 'extensionHost') {
			return; // we are only intersted if we have an active debug session for extensionHost
		}

		// A plugin logged output, show it inside the REPL
		if (broadcast.channel === PLUGIN_LOG_BROADCAST_CHANNEL) {
			let extensionOutput: ILogEntry = broadcast.payload;
			let sev = extensionOutput.severity === 'warn' ? severity.Warning : extensionOutput.severity === 'error' ? severity.Error : severity.Info;

			let args: any[] = [];
			try {
				let parsed = JSON.parse(extensionOutput.arguments);
				args.push(...Object.getOwnPropertyNames(parsed).map(o => parsed[o]));
			} catch (error) {
				args.push(extensionOutput.arguments);
			}

			// Add output for each argument logged
			let simpleVals: any[] = [];
			for (let i = 0; i < args.length; i++) {
				let a = args[i];

				// Undefined gets printed as 'undefined'
				if (typeof a === 'undefined') {
					simpleVals.push('undefined');
				}

				// Null gets printed as 'null'
				else if (a === null) {
					simpleVals.push('null');
				}

				// Objects & Arrays are special because we want to inspect them in the REPL
				else if (types.isObject(a) || Array.isArray(a)) {

					// Flush any existing simple values logged
					if (simpleVals.length) {
						this.debugService.logToRepl(simpleVals.join(' '), sev);
						simpleVals = [];
					}

					// Show object
					this.debugService.logToRepl(a, sev);
				}

				// String: watch out for % replacement directive
				// String substitution and formatting @ https://developer.chrome.com/devtools/docs/console
				else if (typeof a === 'string') {
					let buf = '';

					for (let j = 0, len = a.length; j < len; j++) {
						if (a[j] === '%' && (a[j + 1] === 's' || a[j + 1] === 'i' || a[j + 1] === 'd')) {
							i++; // read over substitution
							buf += !types.isUndefinedOrNull(args[i]) ? args[i] : ''; // replace
							j++; // read over directive
						} else {
							buf += a[j];
						}
					}

					simpleVals.push(buf);
				}

				// number or boolean is joined together
				else {
					simpleVals.push(a);
				}
			}

			// Flush simple values
			if (simpleVals.length) {
				this.debugService.logToRepl(simpleVals.join(' '), sev);
			}

			// Show repl
			this.debugService.revealRepl(true /* in background */).done(null, errors.onUnexpectedError);
		}
	}

	public getId(): string {
		return ExtensionOutputHandler.ID;
	}
}