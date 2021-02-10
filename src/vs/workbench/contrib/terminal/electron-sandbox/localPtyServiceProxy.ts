/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILocalPtyService } from 'vs/platform/terminal/electron-sandbox/terminal';
import { IShellLaunchConfig, ITerminalLaunchError, TerminalIpcChannels } from 'vs/platform/terminal/common/terminal';
import { ISharedProcessService } from 'vs/platform/ipc/electron-sandbox/sharedProcessService';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IProcessEnvironment } from 'vs/base/common/platform';

export class LocalPtyServiceProxy implements ILocalPtyService {

	declare readonly _serviceBrand: undefined;

	private readonly _channel: IChannel;

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService
	) {
		this._channel = sharedProcessService.getChannel(TerminalIpcChannels.LocalPty);
	}

	// onProcessData: Event<{ id: number; event: string | IProcessDataEvent; }>;
	// onProcessExit: Event<{ id: number; event: number | undefined; }>;
	// onProcessReady: Event<{ id: number; event: { pid: number; cwd: string; }; }>;
	// onProcessTitleChanged: Event<{ id: number; event: string; }>;
	// onProcessOverrideDimensions: Event<{ id: number; event: ITerminalDimensionsOverride | undefined; }>;
	// onProcessResolvedShellLaunchConfig: Event<{ id: number; event: IShellLaunchConfig; }>;

	createProcess(shellLaunchConfig: IShellLaunchConfig, cwd: string, cols: number, rows: number, env: IProcessEnvironment, executableEnv: IProcessEnvironment, windowsEnableConpty: boolean): Promise<number> {
		return this._channel.call('$createProcess', Array.prototype.slice.call(arguments));
	}
	start(id: number): Promise<ITerminalLaunchError | { remoteTerminalId: number; } | undefined> {
		return this._channel.call('$start', Array.prototype.slice.call(arguments));
	}
	shutdown(id: number, immediate: boolean): Promise<void> {
		return this._channel.call('$shutdown', Array.prototype.slice.call(arguments));
	}
	input(id: number, data: string): Promise<void> {
		return this._channel.call('$input', Array.prototype.slice.call(arguments));
	}
	resize(id: number, cols: number, rows: number): Promise<void> {
		return this._channel.call('$resize', Array.prototype.slice.call(arguments));
	}
	acknowledgeDataEvent(id: number, charCount: number): Promise<void> {
		return this._channel.call('$acknowledgeDataEvents', Array.prototype.slice.call(arguments));
	}
	getInitialCwd(id: number): Promise<string> {
		return this._channel.call('$getInitialCwd', Array.prototype.slice.call(arguments));
	}
	getCwd(id: number): Promise<string> {
		return this._channel.call('$getCwd', Array.prototype.slice.call(arguments));
	}
	getLatency(id: number): Promise<number> {
		return this._channel.call('$getLatency', Array.prototype.slice.call(arguments));
	}
}
