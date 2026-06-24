/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken, ChatHookCommand } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';

export const IHookExecutor = createServiceIdentifier<IHookExecutor>('IHookExecutor');

export const enum HookCommandResultKind {
	Success = 1,
	/** Blocking error - shown to model (exit code 2) */
	Error = 2,
	/** Non-blocking error - shown to user only (other non-zero exit codes) */
	NonBlockingError = 3
}

export interface IHookCommandResult {
	readonly kind: HookCommandResultKind;
	/**
	 * For success: stdout parsed as JSON if valid, otherwise as string.
	 * For errors: stderr content.
	 */
	readonly result: string | object;
	/**
	 * The normalized exit code for the command.
	 * 0 = success, 2 = blocking error, other non-zero = non-blocking error.
	 * Terminations without a numeric exit code (e.g., by signal) are normalized to 1.
	 */
	readonly exitCode?: number;
}

export interface IHookExecutor {
	readonly _serviceBrand: undefined;

	/**
	 * Execute a single hook command, writing JSON input to stdin
	 * and capturing stdout/stderr.
	 *
	 * Exit code semantics:
	 * - 0: Success (stdout parsed as JSON if valid)
	 * - non-zero: Error (stderr returned)
	 */
	executeCommand(
		hookCommand: ChatHookCommand,
		input: unknown,
		token: CancellationToken
	): Promise<IHookCommandResult>;
}
