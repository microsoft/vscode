/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Settings as ClaudeSettings } from '@anthropic-ai/claude-agent-sdk';
import { URI } from '../../../../util/vs/base/common/uri';
import { createDecorator } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ISessionSettingsService, SessionSettingsFile } from '../../common/sessionSettingsService';

export const IClaudeSettingsService = createDecorator<IClaudeSettingsService>('claudeSettingsService');

export enum ClaudeSettingsLocationType {
	// ~/.claude/settings.json
	User = 'user',
	// <workspace>/.claude/settings.json
	Workspace = 'workspace',
	// <workspace>/.claude/settings.local.json
	WorkspaceLocal = 'workspaceLocal',
}

export type ClaudeSettingsFile = SessionSettingsFile<ClaudeSettingsLocationType, ClaudeSettings>;

export interface IClaudeSettingsService extends ISessionSettingsService<ClaudeSettingsLocationType, ClaudeSettings> {
	/**
	 * Returns the settings URI for the given location and a URI that belongs to a workspace folder.
	 */
	getUri(location: ClaudeSettingsLocationType, workspaceUri: URI): URI;
}
