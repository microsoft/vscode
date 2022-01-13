/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalChildProcess, TerminalCapability } from 'vs/platform/terminal/common/terminal';

export class NaiveCwdDetectionCapability {
	constructor(private readonly _process: ITerminalChildProcess) { }
	readonly type = TerminalCapability.NaiveCwdDetection;

	getCwd(): Promise<string> {
		if (!this._process) {
			return Promise.resolve('');
		}
		return this._process.getCwd();
	}
}
