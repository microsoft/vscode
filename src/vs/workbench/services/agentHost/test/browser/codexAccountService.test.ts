/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Action, SubmenuAction } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentHostCodexAgentEnabledSettingId, CodexPreferAgentHostEditorSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { OpenOptions } from '../../../../../platform/opener/common/opener.js';
import { ICodexAccountService, createCodexAccountMenuActions, openCodexAuthUrl, shouldShowCodexAccount } from '../../browser/codexAccountService.js';

suite('CodexAccountService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function service(status: ICodexAccountService['account']['status'], email?: string): ICodexAccountService & { signInCalls: number; signOutCalls: number } {
		return {
			_serviceBrand: undefined,
			account: { status, email },
			onDidChangeAccount: Event.None,
			signInCalls: 0,
			signOutCalls: 0,
			signIn() { this.signInCalls++; },
			signOut() { this.signOutCalls++; },
		};
	}

	test('shows verified ChatGPT identities with sign-out', async () => {
		const accountService = service('signedIn', 'person@example.com');
		const actions = createCodexAccountMenuActions(accountService);
		const accountAction = actions[0] as SubmenuAction;
		await accountAction.actions[0].run();
		assert.deepStrictEqual({
			label: accountAction.label,
			submenu: accountAction.actions.map(action => action.label),
			signOutCalls: accountService.signOutCalls,
		}, {
			label: 'person@example.com (ChatGPT)',
			submenu: ['Sign Out'],
			signOutCalls: 1,
		});
		assert.deepStrictEqual(createCodexAccountMenuActions(service('unavailable')), []);
	});

	test('does not duplicate the ChatGPT label when email is unavailable', () => {
		const actions = createCodexAccountMenuActions(service('signedIn'));
		assert.strictEqual(actions[0].label, 'ChatGPT');
	});

	test('offers sign-in without claiming an unknown account is signed out', async () => {
		const accountService = service('unknown');
		const actions = createCodexAccountMenuActions(accountService);
		assert.ok(actions[0] instanceof Action);
		disposables.add(actions[0]);
		assert.strictEqual(actions[0].label, 'Sign in to ChatGPT');
		await actions[0].run();
		assert.strictEqual(accountService.signInCalls, 1);
	});

	test('only shows ChatGPT accounts where the Codex agent host is available', () => {
		function configuration(codexEnabled: boolean, preferAgentHost: boolean) {
			return {
				getValue<T>(key: string): T | undefined {
					return ({
						[AgentHostCodexAgentEnabledSettingId]: codexEnabled,
						[CodexPreferAgentHostEditorSettingId]: preferAgentHost,
					} as Record<string, boolean>)[key] as T;
				}
			};
		}

		assert.deepStrictEqual({
			agentsDisabled: shouldShowCodexAccount(configuration(false, false), true),
			agentsEnabled: shouldShowCodexAccount(configuration(true, false), true),
			editorCodexDisabled: shouldShowCodexAccount(configuration(false, true), false),
			editorPreferenceDisabled: shouldShowCodexAccount(configuration(true, false), false),
			editorEnabled: shouldShowCodexAccount(configuration(true, true), false),
		}, {
			agentsDisabled: false,
			agentsEnabled: true,
			editorCodexDisabled: false,
			editorPreferenceDisabled: false,
			editorEnabled: true,
		});
	});

	test('opens generated ChatGPT authentication URLs without validation prompts', async () => {
		let call: { resource: string; options: OpenOptions | undefined } | undefined;
		await openCodexAuthUrl({
			open: async (resource, options) => {
				call = { resource: resource.toString(), options };
				return true;
			}
		}, 'https://auth.openai.com/authorize?token=secret');

		assert.deepStrictEqual(call, {
			resource: 'https://auth.openai.com/authorize?token=secret',
			options: { openExternal: true, skipValidation: true },
		});
	});

});
