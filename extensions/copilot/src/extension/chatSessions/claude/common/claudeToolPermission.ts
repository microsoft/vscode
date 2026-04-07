/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import type * as vscode from 'vscode';
import { ClaudeToolInputMap, ClaudeToolNames } from './claudeTools';

/**
 * Result type for tool permission checks, matching the Claude SDK canUseTool return type
 */
export type ClaudeToolPermissionResult =
	| { behavior: 'allow'; updatedInput: Record<string, unknown> }
	| { behavior: 'deny'; message: string };

/**
 * Context passed to tool permission handlers
 */
export interface ClaudeToolPermissionContext {
	readonly toolInvocationToken: vscode.ChatParticipantToolToken;
	readonly permissionMode?: PermissionMode;
	readonly stream?: vscode.ChatResponseStream;
}

/**
 * Parameters for showing a confirmation dialog to the user
 */
export interface IClaudeToolConfirmationParams {
	readonly title: string;
	readonly message: string;
}

/**
 * Handler interface for tool permission checks.
 * Implement any combination of these methods to customize behavior:
 * - canAutoApprove: Return true to skip confirmation dialog
 * - getConfirmationParams: Customize the confirmation dialog
 * - handle: Full implementation that bypasses default confirmation flow
 *
 * @template TToolName The tool name(s) this handler supports
 */
export interface IClaudeToolPermissionHandler<TToolName extends ClaudeToolNames = ClaudeToolNames> {
	/**
	 * The tool name(s) this handler is registered for
	 */
	readonly toolNames: readonly TToolName[];

	/**
	 * Check if the tool can be auto-approved without user confirmation.
	 * If not implemented or returns false, continues to confirmation dialog.
	 */
	canAutoApprove?(
		toolName: TToolName,
		input: ClaudeToolInputMap[TToolName],
		context: ClaudeToolPermissionContext
	): Promise<boolean>;

	/**
	 * Get custom confirmation dialog parameters.
	 * If not implemented, uses default confirmation params.
	 */
	getConfirmationParams?(
		toolName: TToolName,
		input: ClaudeToolInputMap[TToolName]
	): IClaudeToolConfirmationParams;

	/**
	 * Full custom handler implementation.
	 * If implemented, bypasses canAutoApprove and getConfirmationParams entirely.
	 * Use this for tools like AskUserQuestion that need complete custom behavior.
	 */
	handle?(
		toolName: TToolName,
		input: ClaudeToolInputMap[TToolName],
		context: ClaudeToolPermissionContext
	): Promise<ClaudeToolPermissionResult>;
}

/**
 * Constructor type for tool permission handlers
 */
export type IClaudeToolPermissionHandlerCtor<TToolName extends ClaudeToolNames = ClaudeToolNames> =
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Constructor types for DI require 'any' for parameter compatibility
	new (...args: any[]) => IClaudeToolPermissionHandler<TToolName>;
