/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IClaudeToolPermissionHandlerCtor } from './claudeToolPermission';
import { ClaudeToolNames } from './claudeTools';

/**
 * Registry entry for tool permission handlers
 */
export interface IToolPermissionHandlerRegistration {
	readonly toolNames: readonly ClaudeToolNames[];
	readonly ctor: IClaudeToolPermissionHandlerCtor;
}

/**
 * Registry of tool permission handlers.
 * Handlers can register from common/, node/, or vscode-node/ folders.
 */
const handlerRegistry: IToolPermissionHandlerRegistration[] = [];

/**
 * Register a tool permission handler for one or more tools.
 * Handlers are instantiated lazily via the instantiation service.
 *
 * @param toolNames The tool name(s) to register the handler for
 * @param ctor The handler constructor
 */
export function registerToolPermissionHandler<T extends ClaudeToolNames>(
	toolNames: readonly T[],
	ctor: IClaudeToolPermissionHandlerCtor<T>
): void {
	handlerRegistry.push({ toolNames, ctor });
}

/**
 * Get all registered tool permission handlers.
 * Used by ClaudeToolPermissionService to look up handlers.
 */
export function getToolPermissionHandlerRegistry(): readonly IToolPermissionHandlerRegistration[] {
	return handlerRegistry;
}
