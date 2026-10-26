/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it, vi } from 'vitest';
import packageJson from '../../../../../package.json';

vi.mock('vscode', async () => {
	const actual = await import('../../../../vscodeTypes');
	return {
		...actual,
		commands: {
			registerCommand: vi.fn(() => ({ dispose() { } })),
			executeCommand: vi.fn(async () => undefined),
		},
	};
});

import * as vscode from 'vscode';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../../platform/authentication/common/copilotToken';
import { mock } from '../../../../util/common/test/simpleMock';
import { FeedbackCommandContribution } from '../feedbackContribution';
import { openIssueReporter } from '../feedbackReporter';

class TestAuthenticationService extends mock<IAuthenticationService>() {
	override readonly copilotToken: CopilotToken;

	constructor(isVscodeTeamMember: boolean) {
		super();
		this.copilotToken = new CopilotToken(createTestExtendedTokenInfo({ isVscodeTeamMember }));
	}
}

describe('FeedbackCommandContribution issue routing', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('keeps the public VS Code repository as the primary target for VS Code team members', async () => {
		const contribution = new FeedbackCommandContribution(new TestAuthenticationService(true));
		try {
			const registration = vi.mocked(vscode.commands.registerCommand).mock.calls.find(([id]) => id === 'github.copilot.report');
			if (!registration) {
				throw new Error('Feedback command was not registered');
			}

			await registration[1]();

			expect(vi.mocked(vscode.commands.executeCommand).mock.calls[0]).toEqual([
				'workbench.action.openIssueReporter',
				expect.objectContaining({
					issueSource: 'vscode',
					uri: vscode.Uri.parse('https://github.com/microsoft/vscode'),
					privateUri: vscode.Uri.parse('https://github.com/microsoft/vscode-internalbacklog'),
				}),
			]);
		} finally {
			contribution.dispose();
		}
	});

	it('hides the palette duplicate but keeps the command and reporter-menu contribution', () => {
		expect({
			command: packageJson.contributes.commands.find(command => command.command === 'github.copilot.report')?.command,
			palette: packageJson.contributes.menus.commandPalette.find(item => item.command === 'github.copilot.report'),
			reporterMenu: packageJson.contributes.menus['issue/reporter'],
		}).toEqual({
			command: 'github.copilot.report',
			palette: { command: 'github.copilot.report', when: 'false' },
			reporterMenu: [{ command: 'github.copilot.report' }],
		});
	});

	it('preserves the compatibility command for non-team contextual callers', async () => {
		const contribution = new FeedbackCommandContribution(new TestAuthenticationService(false));
		try {
			const registration = vi.mocked(vscode.commands.registerCommand).mock.calls.find(([id]) => id === 'github.copilot.report');
			if (!registration) {
				throw new Error('Feedback command was not registered');
			}
			await registration[1]('Contextual feedback');
			expect(vi.mocked(vscode.commands.executeCommand).mock.calls[0]).toEqual([
				'workbench.action.openIssueReporter',
				expect.objectContaining({
					issueTitle: 'Contextual feedback',
					issueSource: 'vscode',
					uri: vscode.Uri.parse('https://github.com/microsoft/vscode'),
					privateUri: undefined,
				}),
			]);
		} finally {
			contribution.dispose();
		}
	});

	for (const publicReport of [undefined, true, false]) {
		it(`keeps the debug reporter's explicit public=${publicReport} intent`, async () => {
			await openIssueReporter({ title: 'Debug feedback', data: 'Debug data', public: publicReport });
			const privateUri = publicReport === false ? vscode.Uri.parse('https://github.com/microsoft/vscode-internalbacklog') : undefined;
			expect(vi.mocked(vscode.commands.executeCommand).mock.calls[0]).toEqual([
				'workbench.action.openIssueReporter',
				{ issueTitle: 'Debug feedback', issueSource: 'vscode', data: 'Debug data', issueBody: '', uri: privateUri, privateUri },
			]);
		});
	}
});
