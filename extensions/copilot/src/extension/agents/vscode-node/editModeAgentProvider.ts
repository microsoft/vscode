/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AGENT_FILE_EXTENSION } from '../../../platform/customInstructions/common/promptTypes';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { ILogService } from '../../../platform/log/common/logService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { AgentConfig, buildAgentMarkdown } from './agentTypes';

const BASE_EDIT_MODE_AGENT_CONFIG: AgentConfig = {
	name: 'Edit',
	description: 'Edit-only mode restricted to the currently active file and any files explicitly attached in the request context.',
	argumentHint: 'Describe the edit to apply in the active or attached files',
	target: 'vscode',
	disableModelInvocation: true,
	userInvocable: true,
	tools: ['read', 'edit'],
	agents: [],
	handoffs: [
		{
			label: 'Continue with Agent Mode',
			agent: 'agent',
			prompt: 'You are now switching to Agent Mode, where you can read and edit any file in the codebase. Continue with the task without the previous restrictions of Edit Mode.',
			send: true,
		},
	],
	body: `You are a focused allowlist editing agent.

## Rules
- Allowed files are strictly: (1) the currently active file and (2) files explicitly attached in the request context.
- Only read and edit files in that allowlist.
- Create a new file only when the user explicitly asks to create that file.
- Never create, delete, rename, or modify any file outside that allowlist.
- Never propose or use terminal commands.
- If a request requires touching files outside the allowlist, stop and explain that Edit Mode is restricted to the active file plus attached files.

## Workflow
1. Build the allowed-file set from context: active file + attached files.
2. Confirm every requested edit target is in that allowed-file set before editing, unless it is an explicitly user-requested new file creation.
3. Make the minimum required edits only within allowed files.
4. Summarize exactly what changed and list touched files.
5. If further changes are needed outside the allowlist, suggest switching to Agent Mode to complete the task without restrictions.`
};

export class EditModeAgentProvider extends Disposable implements vscode.ChatCustomAgentProvider {
	readonly label = vscode.l10n.t('Edit Mode Agent');

	private static readonly CACHE_DIR = 'edit-mode-agent';
	private static readonly AGENT_FILENAME = `EditMode${AGENT_FILE_EXTENSION}`;

	constructor(
		@IVSCodeExtensionContext private readonly _extensionContext: IVSCodeExtensionContext,
		@IFileSystemService private readonly _fileSystemService: IFileSystemService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async provideCustomAgents(
		_context: unknown,
		_token: vscode.CancellationToken
	): Promise<vscode.ChatResource[]> {
		const content = buildAgentMarkdown(BASE_EDIT_MODE_AGENT_CONFIG);
		const fileUri = await this._writeCacheFile(content);
		return [{ uri: fileUri }];
	}

	private async _writeCacheFile(content: string): Promise<vscode.Uri> {
		const cacheDir = vscode.Uri.joinPath(
			this._extensionContext.globalStorageUri,
			EditModeAgentProvider.CACHE_DIR
		);

		try {
			await this._fileSystemService.stat(cacheDir);
		} catch {
			await this._fileSystemService.createDirectory(cacheDir);
		}

		const fileUri = vscode.Uri.joinPath(cacheDir, EditModeAgentProvider.AGENT_FILENAME);
		await this._fileSystemService.writeFile(fileUri, new TextEncoder().encode(content));
		this._logService.trace(`[EditModeAgentProvider] Wrote agent file: ${fileUri.toString()}`);
		return fileUri;
	}
}
