/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IOpenFileRequest } from 'vs/platform/windows/common/windows';
import { ITerminalNativeService, LinuxDistro } from 'vs/workbench/contrib/terminal/common/terminal';
import { Emitter, Event } from 'vs/base/common/event';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class TerminalNativeService implements ITerminalNativeService {
	public _serviceBrand: any;

	public get linuxDistro(): LinuxDistro { return LinuxDistro.Unknown; }

	private readonly _onOpenFileRequest = new Emitter<IOpenFileRequest>();
	public get onOpenFileRequest(): Event<IOpenFileRequest> { return this._onOpenFileRequest.event; }
	private readonly _onOsResume = new Emitter<void>();
	public get onOsResume(): Event<void> { return this._onOsResume.event; }

	constructor() { }

	public whenFileDeleted(): Promise<void> {
		throw new Error('Not implemented');
	}

	public getWslPath(): Promise<string> {
		throw new Error('Not implemented');
	}

	public getWindowsBuildNumber(): number {
		throw new Error('Not implemented');
	}
}

registerSingleton(ITerminalNativeService, TerminalNativeService, true);
