/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type { ChatResponseStream } from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { ChatHookType } from '../../../vscodeTypes';

/**
 * Error thrown when a hook requests the agent to abort processing.
 * The message should be shown to the user.
 */
export class HookAbortError extends Error {
	constructor(
		public readonly hookType: string,
		public readonly stopReason: string
	) {
		super(`Hook ${hookType} aborted: ${stopReason}`);
		this.name = 'HookAbortError';
	}
}

/**
 * Type guard to check if an error is a HookAbortError.
 */
export function isHookAbortError(error: unknown): error is HookAbortError {
	return error instanceof HookAbortError;
}

/**
 * A hook result from the chat hook service.
 */
export interface HookResult {
	stopReason?: string;
	resultKind: 'success' | 'error' | 'warning';
	warningMessage?: string;
	output: unknown;
}

/**
 * Options for processing hook results.
 */
export interface ProcessHookResultsOptions {
	/** The type of hook being processed */
	hookType: ChatHookType;
	/** The hook results to process */
	results: readonly HookResult[];
	/** The output stream for displaying messages */
	outputStream: ChatResponseStream | undefined;
	/** The log service for logging */
	logService: ILogService;
	/** Callback for handling successful hook results. Called with the output for each success. */
	onSuccess: (output: unknown) => void;
	/**
	 * When true, errors and stopReason are completely ignored (no throw, no warning, no hookProgress).
	 * Use for hooks like SessionStart/SubagentStart where blocking errors should be silently ignored.
	 */
	ignoreErrors?: boolean;
	/**
	 * Callback for handling error results. When provided, errors are passed to this callback
	 * instead of being shown to the user. Use for Stop/SubagentStop hooks where errors
	 * should be collected as blocking reasons.
	 */
	onError?: (errorMessage: string) => void;
}

/**
 * Processes hook results, handling aborts, warnings, errors, and success cases.
 * Warnings are aggregated and displayed together via hookProgress after processing all results.
 *
 * @param options The processing options
 * @throws HookAbortError if any result contains a stopReason or an error result is encountered
 */
export function processHookResults(options: ProcessHookResultsOptions): void {
	const { hookType, results, outputStream, logService, onSuccess, ignoreErrors, onError } = options;

	const warnings: string[] = [];

	for (const result of results) {
		// Check for stopReason - abort immediately (unless ignoreErrors is set)
		// Note: empty string is a valid stopReason (from continue: false without explicit message)
		if (result.stopReason !== undefined) {
			if (ignoreErrors) {
				logService.trace(`[ToolCallingLoop] ${hookType} hook stopReason ignored: ${result.stopReason}`);
				continue;
			}
			logService.info(`[ToolCallingLoop] ${hookType} hook requested abort: ${result.stopReason}`);
			outputStream?.hookProgress(hookType, formatHookErrorMessage(result.stopReason));
			throw new HookAbortError(hookType, result.stopReason);
		}

		// Collect warnings
		if (result.resultKind === 'warning' && result.warningMessage) {
			logService.trace(`[ToolCallingLoop] ${hookType} hook warning: ${result.warningMessage}`);
			warnings.push(result.warningMessage);
		}

		// Handle success
		if (result.resultKind === 'success') {
			if (result.warningMessage) {
				warnings.push(result.warningMessage);
			}
			onSuccess(result.output);
		}

		// Handle error - abort unless ignoreErrors is set or onError is provided
		if (result.resultKind === 'error') {
			const errorMessage = typeof result.output === 'string' && result.output ? result.output : '';
			logService.error(new Error(errorMessage), `[ToolCallingLoop] ${hookType} hook error`);
			if (onError) {
				// Pass error to callback (for Stop/SubagentStop to collect as blocking reason)
				onError(errorMessage);
				continue;
			} else if (ignoreErrors) {
				// Completely ignore error - no throw, no hookProgress (silently continue)
				continue;
			} else {
				outputStream?.hookProgress(hookType, formatHookErrorMessage(errorMessage));
				throw new HookAbortError(hookType, errorMessage);
			}
		}
	}

	// Show aggregated warnings via hookProgress
	if (warnings.length > 0 && outputStream) {
		if (warnings.length === 1) {
			outputStream.hookProgress(hookType, undefined, warnings[0]);
		} else {
			const formattedWarnings = warnings.map((w, i) => `${i + 1}. ${w}`).join('\n');
			outputStream.hookProgress(hookType, undefined, formattedWarnings);
		}
	}
}

/**
 * Formats a localized error message for a failed hook.
 * @param errorMessage The error message from the hook
 * @returns A localized error message string
 */
export function formatHookErrorMessage(errorMessage: string): string {
	if (errorMessage) {
		return l10n.t('A hook prevented chat from continuing. Please check the GitHub Copilot Chat Hooks output channel for more details. \nError message: {0}', errorMessage);
	}
	return l10n.t('A hook prevented chat from continuing. Please check the GitHub Copilot Chat Hooks output channel for more details.');
}
