/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';
import { t } from '@vscode/l10n';
import type * as vscode from 'vscode';
import { MarkdownString, LanguageModelTextPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { ToolName } from '../common/toolNames';
import { IOctoKitService } from '../../../platform/github/common/githubService';

export interface GithubCreateIssueToolParams {
	title: string;
	text: string;
	owner: string;
	repo: string;
}

export class GithubCreateIssueTool implements ICopilotTool<GithubCreateIssueToolParams> {
	public static readonly toolName = ToolName.GithubCreateIssue;

	constructor(
		@IOctoKitService private readonly _octoKitService: IOctoKitService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<GithubCreateIssueToolParams>, _token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const { title, text, owner, repo } = options.input;
		const { url } = await this._octoKitService.createIssue(owner, repo, title, text, { createIfNone: { detail: 'Github authentication is required to create an issue.' } });

		return new LanguageModelToolResult([new LanguageModelTextPart(url)]);
	}

	async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<GithubCreateIssueToolParams>, _token: vscode.CancellationToken): Promise<vscode.PreparedToolInvocation> {
		return {
			confirmationMessages: {
				title: t(`Allow Issue to be Posted on ${options.input.owner}/${options.input.repo}`),
				message: new MarkdownString(
					`**Repository:** ${options.input.owner} / ${options.input.repo} \n\n` +
					`**Title:** ${options.input.title} \n\n` +
					`**Body:** ${options.input.text} `
				)
			},
			presentation: 'hiddenAfterComplete'
		};
	}
}

ToolRegistry.registerTool(GithubCreateIssueTool);
