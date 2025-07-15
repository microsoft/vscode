/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriComponents } from '../../../base/common/uri.js';
import { ISerializableEnvironmentVariableCollection, ISerializableEnvironmentVariableCollections } from './environmentVariable.js';
import { IFixedTerminalDimensions, IRawTerminalTabLayoutInfo, IReconnectionProperties, ITerminalEnvironment, ITerminalTabAction, ITerminalTabLayoutInfoById, TerminalIcon, TerminalType, TitleEventSource, WaitOnExitValue } from './terminal.js';

export interface ISingleTerminalConfiguration<T> {
	userValue: T | undefined;
	value: T | undefined;
	defaultValue: T | undefined;
}

export interface ICompleteTerminalConfiguration {
	'terminal.integrated.env.windows': ISingleTerminalConfiguration<ITerminalEnvironment>;
	'terminal.integrated.env.osx': ISingleTerminalConfiguration<ITerminalEnvironment>;
	'terminal.integrated.env.linux': ISingleTerminalConfiguration<ITerminalEnvironment>;
	'terminal.integrated.cwd': string;
	'terminal.integrated.detectLocale': 'auto' | 'off' | 'on';
}

export type ITerminalEnvironmentVariableCollections = [string, ISerializableEnvironmentVariableCollection][];

export interface IWorkspaceFolderData {
	uri: UriComponents;
	name: string;
	index: number;
}

export interface ISetTerminalLayoutInfoArgs {
	workspaceId: string;
	tabs: ITerminalTabLayoutInfoById[];
}

export interface IGetTerminalLayoutInfoArgs {
	workspaceId: string;
}

export interface IProcessDetails {
	id: number;
	pid: number;
	title: string;
	titleSource: TitleEventSource;
	cwd: string;
	workspaceId: string;
	workspaceName: string;
	isOrphan: boolean;
	icon: TerminalIcon | undefined;
	color: string | undefined;
	fixedDimensions: IFixedTerminalDimensions | undefined;
	environmentVariableCollections: ISerializableEnvironmentVariableCollections | undefined;
	reconnectionProperties?: IReconnectionProperties;
	waitOnExit?: WaitOnExitValue;
	hideFromUser?: boolean;
	isFeatureTerminal?: boolean;
	type?: TerminalType;
	hasChildProcesses: boolean;
	shellIntegrationNonce: string;
	tabActions?: ITerminalTabAction[];
}

export type ITerminalTabLayoutInfoDto = IRawTerminalTabLayoutInfo<IProcessDetails>;

export interface ReplayEntry {
	cols: number;
	rows: number;
	data: string;
}

const enum Constants {
	/**
	 * Writing large amounts of data can be corrupted for some reason, after looking into this is
	 * appears to be a race condition around writing to the FD which may be based on how powerful
	 * the hardware is. The workaround for this is to space out when large amounts of data is being
	 * written to the terminal. See https://github.com/microsoft/vscode/issues/38137
	 */
	WriteMaxChunkSize = 50,
}

/**
 * Splits incoming pty data into chunks to try prevent data corruption that could occur when pasting
 * large amounts of data.
 */
export function chunkInput(data: string): string[] {
	const chunks: string[] = [];
	let nextChunkStartIndex = 0;
	for (let i = 0; i < data.length - 1; i++) {
		if (
			// If the max chunk size is reached
			i - nextChunkStartIndex + 1 >= Constants.WriteMaxChunkSize ||
			// If the next character is ESC, send the pending data to avoid splitting the escape
			// sequence.
			data[i + 1] === '\x1b'
		) {
			chunks.push(data.substring(nextChunkStartIndex, i + 1));
			nextChunkStartIndex = i + 1;
			// Skip the next character as the chunk would be a single character
			i++;
		}
	}
	// Push final chunk
	if (nextChunkStartIndex !== data.length) {
		chunks.push(data.substring(nextChunkStartIndex));
	}
	return chunks;
}
