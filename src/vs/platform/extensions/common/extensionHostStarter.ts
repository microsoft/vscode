/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SerializedError } from 'vs/base/common/errors';
import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IExtensionHostStarter = createDecorator<IExtensionHostStarter>('extensionHostStarter');

export const ipcExtensionHostStarterChannelName = 'extensionHostStarter';

export interface IExtensionHostProcessOptions {
	env: { [key: string]: string | undefined; };
	detached: boolean;
	execArgv: string[] | undefined;
	silent: boolean;
}

export interface IExtensionHostStarter {
	readonly _serviceBrand: undefined;

	onScopedStdout(id: string): Event<string>;
	onScopedStderr(id: string): Event<string>;
	onScopedMessage(id: string): Event<any>;
	onScopedError(id: string): Event<{ error: SerializedError; }>;
	onScopedExit(id: string): Event<{ code: number; signal: string }>;

	createExtensionHost(): Promise<{ id: string; }>;
	start(id: string, opts: IExtensionHostProcessOptions): Promise<{ pid: number; }>;
	enableInspectPort(id: string): Promise<boolean>;
	kill(id: string): Promise<void>;

}
