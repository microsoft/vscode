/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { LogMemory } from '../../../platform/log/common/logService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';

type ReportIssueSource = 'vscode' | 'extension' | 'marketplace' | 'unknown';

interface IReportCommandOptions {
	readonly title?: string;
	readonly issueSource?: ReportIssueSource;
}

export class FeedbackCommandContribution extends Disposable {
	constructor(
		@IAuthenticationService private readonly authenticationService: IAuthenticationService
	) {
		super();

		this._register(vscode.commands.registerCommand('github.copilot.report', async (options: string | IReportCommandOptions = '') => {
			const title = typeof options === 'string' ? options : options.title ?? '';
			const token = this.authenticationService.copilotToken;
			const isTeamMember = token?.isVscodeTeamMember;
			const output: string[] = isTeamMember ? [`<details><summary>Prompt Details</summary>`] : [`<details><summary>Logs</summary>`];
			appendPromptDetailsSection(output, LogMemory.getLogs().join('\n'), LogMemory.getRequestIds().join('\n'));
			await vscode.commands.executeCommand('workbench.action.openIssueReporter', {
				issueTitle: title,
				issueSource: typeof options === 'string' ? undefined : options.issueSource,
				uri: vscode.Uri.parse('https://github.com/microsoft/vscode'),
				data: output.join('\n'),
				privateUri: isTeamMember ? vscode.Uri.parse('https://github.com/microsoft/vscode-internalbacklog') : undefined,
			});
		}));
	}
}

function appendPromptDetailsSection(output: string[], logs: string, requestIds: string): void {
	output.push(
		`<pre>`,
		logs,
		`</pre>`,
		`</details>`,
		`<details><summary>Request IDs</summary>`,
		`<pre>`,
		requestIds,
		`</pre>`,
		`</details>`,
	);
}
