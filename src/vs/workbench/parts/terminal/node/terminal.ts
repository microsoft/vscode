/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IMessageFromTerminalProcess {
	type: 'pid' | 'data' | 'title';
	content: number | string;
}

export interface IMessageToTerminalProcess {
	event: 'resize' | 'input' | 'shutdown';
	data?: string;
	cols?: number;
	rows?: number;
}

/**
 * An interface representing a raw terminal child process, this is a subset of the
 * child_process.ChildProcess node.js interface.
 */
export interface ITerminalChildProcess {
	readonly connected: boolean;

	send(message: IMessageToTerminalProcess): boolean;

	on(event: 'exit', listener: (code: number) => void): this;
	on(event: 'message', listener: (message: IMessageFromTerminalProcess) => void): this;
}
