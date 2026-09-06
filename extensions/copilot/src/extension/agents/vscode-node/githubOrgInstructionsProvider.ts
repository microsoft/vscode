/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { INSTRUCTION_FILE_EXTENSION, PromptsType } from '../../../platform/customInstructions/common/promptTypes';
import { IOctoKitService } from '../../../platform/github/common/githubService';
import { ILogService } from '../../../platform/log/common/logService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IGitHubOrgChatResourcesService } from './githubOrgChatResourcesService';

const INSTRUCTIONS_BASE_FILE_NAME = 'default';
const REFRESH_INTERVAL_MS = 2 * 60 * 1000;

export class GitHubOrgInstructionsProvider extends Disposable implements vscode.ChatInstructionsProvider {

	private readonly _onDidChangeInstructions = this._register(new vscode.EventEmitter<void>());
	readonly onDidChangeInstructions = this._onDidChangeInstructions.event;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IOctoKitService private readonly octoKitService: IOctoKitService,
		@IGitHubOrgChatResourcesService private readonly githubOrgChatResourcesService: IGitHubOrgChatResourcesService,
	) {
		super();

		// Set up polling with provider-specific interval
		this._register(this.githubOrgChatResourcesService.startPolling(REFRESH_INTERVAL_MS, this.pollInstructions.bind(this)));
	}

	async provideInstructions(
		_options: unknown,
		token: vscode.CancellationToken
	): Promise<vscode.ChatResource[]> {
		try {
			const orgId = await this.githubOrgChatResourcesService.getPreferredOrganizationName();
			if (!orgId) {
				this.logService.trace('[GitHubOrgInstructionsProvider] No organization available for providing agents');
				return [];
			}

			if (token.isCancellationRequested) {
				this.logService.trace('[GitHubOrgInstructionsProvider] provideCustomAgents was cancelled');
				return [];
			}

			return await this.githubOrgChatResourcesService.listCachedFiles(PromptsType.instructions, orgId);
		} catch (error) {
			this.logService.error(`[GitHubOrgInstructionsProvider] Error reading from cache: ${error}`);
			return [];
		}
	}

	private async pollInstructions(orgId: string): Promise<void> {
		try {
			const instructions = await this.octoKitService.getOrgCustomInstructions(orgId, {});
			if (!instructions) {
				await this.githubOrgChatResourcesService.clearCache(PromptsType.instructions, orgId);
				this.logService.trace(`[GitHubOrgInstructionsProvider] No custom instructions found for org ${orgId}`);
				return;
			}

			// Write the instructions to cache
			const fileName = `${INSTRUCTIONS_BASE_FILE_NAME}${INSTRUCTION_FILE_EXTENSION}`;
			const content = `---
applyTo: '**'
---
${instructions}`;
			const contentChanged = await this.githubOrgChatResourcesService.writeCacheFile(PromptsType.instructions, orgId, fileName, content, { checkForChanges: true });

			// If no changes, we can return
			if (!contentChanged) {
				this.logService.trace(`[GitHubOrgInstructionsProvider] No changes detected in cache for org ${orgId}`);
				return;
			}

			// Otherwise, fire event to notify consumers that instructions have changed
			this._onDidChangeInstructions.fire();
		} catch (error) {
			this.logService.error(`[GitHubOrgInstructionsProvider] Error polling for instructions: ${error}`);
		}
	}
}
