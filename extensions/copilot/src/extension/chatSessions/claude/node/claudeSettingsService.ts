/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Settings as ClaudeSettings } from '@anthropic-ai/claude-agent-sdk';
import { INativeEnvService } from '../../../../platform/env/common/envService';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { URI } from '../../../../util/vs/base/common/uri';
import { ClaudeSettingsLocationType, IClaudeSettingsService } from '../common/claudeSettingsService';
import { SessionSettingsLocationDescriptor } from '../../common/sessionSettingsService';
import { SessionSettingsService } from '../../common/baseSessionSettingsService';

const CLAUDE_LOCATIONS: readonly SessionSettingsLocationDescriptor<ClaudeSettingsLocationType>[] = [
	{
		type: ClaudeSettingsLocationType.WorkspaceLocal,
		priority: 0,
		getUris: (workspaceFolders) => workspaceFolders.map(f => URI.joinPath(f, '.claude', 'settings.local.json')),
	},
	{
		type: ClaudeSettingsLocationType.Workspace,
		priority: 1,
		getUris: (workspaceFolders) => workspaceFolders.map(f => URI.joinPath(f, '.claude', 'settings.json')),
	},
	{
		type: ClaudeSettingsLocationType.User,
		priority: 2,
		getUris: (_workspaceFolders, userHome) => [URI.joinPath(userHome, '.claude', 'settings.json')],
	},
];

export class ClaudeSettingsService extends SessionSettingsService<ClaudeSettingsLocationType, ClaudeSettings> implements IClaudeSettingsService {

	constructor(
		@IWorkspaceService workspaceService: IWorkspaceService,
		@IFileSystemService fileSystemService: IFileSystemService,
		@INativeEnvService envService: INativeEnvService,
	) {
		super(CLAUDE_LOCATIONS, workspaceService, fileSystemService, envService);
	}

	protected getDefaultSettings(): ClaudeSettings {
		return {};
	}
}
