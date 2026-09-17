/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ShellOptions {
	executable: string;
	args: string[];
	cwd: string;
	env: NodeJS.ProcessEnv;
	cols: number;
	rows: number;
}

export type PtyHostRequest =
	| { type: 'start'; options: ShellOptions }
	| { type: 'input'; data: string }
	| { type: 'resize'; cols: number; rows: number }
	| { type: 'pause' | 'resume' | 'kill' };

export type PtyHostEvent =
	| { type: 'data'; data: string }
	| { type: 'exit'; exitCode: number; signal?: number }
	| { type: 'error'; message: string };
