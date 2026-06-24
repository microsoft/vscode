/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AgentInfo, Query } from '@anthropic-ai/claude-agent-sdk';
import { Event } from '../../../../util/vs/base/common/event';
import { createDecorator } from '../../../../util/vs/platform/instantiation/common/instantiation';

export const IClaudeRuntimeDataService = createDecorator<IClaudeRuntimeDataService>('claudeRuntimeDataService');

export interface IClaudeRuntimeDataService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires when cached runtime data is updated (e.g. after a new session initializes).
	 */
	readonly onDidChange: Event<void>;

	/**
	 * Returns the cached list of agents from the most recent Claude session.
	 * Returns an empty array if no session has been initialized yet.
	 */
	getAgents(): readonly AgentInfo[];

	/**
	 * Updates the cached runtime data by querying the given SDK Query instance.
	 * Called by ClaudeCodeSession after a new Query is created.
	 */
	update(query: Query): Promise<void>;
}
