/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Action, SubmenuAction } from '../../../../../base/common/actions.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullAgentHostService } from '../../../../../platform/agentHost/browser/nullAgentHostService.js';
import { CODEX_ACCOUNT_META_KEY } from '../../../../../platform/agentHost/common/codexAccount.js';
import { AgentHostCodexAgentEnabledSettingId, CodexPreferAgentHostEditorSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { CODEX_AGENT_PROVIDER_ID } from '../../../../../platform/agentHost/common/agent.js';
import type { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import type { RootState } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { ChatAIDisabledSettingId } from '../../../../../platform/chat/common/chatSettings.js';
import { OpenOptions } from '../../../../../platform/opener/common/opener.js';
import { NullOpenerService } from '../../../../../platform/opener/test/common/nullOpenerService.js';
import { ContentEncoding } from '../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { CodexAccountService, ICodexAccountService, createCodexAccountMenuActions, hasSignedInCodexChatGPTAccount, openCodexAuthUrl, readCodexProfileImageDataUri, shouldShowCodexAccount } from '../../browser/codexAccountService.js';

suite('CodexAccountService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function service(status: ICodexAccountService['account']['status'], email?: string): ICodexAccountService & { signInCalls: number; signOutCalls: number } {
		return {
			_serviceBrand: undefined,
			agent: CODEX_AGENT_PROVIDER_ID,
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

	test('only presents a verified visible ChatGPT identity in shared account chrome', () => {
		assert.strictEqual(hasSignedInCodexChatGPTAccount(service('signedIn').account), true);
		assert.strictEqual(hasSignedInCodexChatGPTAccount(service('signedIn').account, false), false);
		assert.strictEqual(hasSignedInCodexChatGPTAccount(service('unknown').account), false);
		assert.strictEqual(hasSignedInCodexChatGPTAccount(service('signedOut').account), false);
		assert.strictEqual(hasSignedInCodexChatGPTAccount(service('unavailable').account), false);
		assert.strictEqual(hasSignedInCodexChatGPTAccount(service('error').account), false);
	});

	test('offers sign-in without claiming an unknown account is signed out', async () => {
		const accountService = service('unknown');
		const actions = createCodexAccountMenuActions(accountService);
		assert.ok(actions[0] instanceof Action);
		disposables.add(actions[0] as Action);
		assert.strictEqual(actions[0].label, 'Sign in to ChatGPT');
		await actions[0].run();
		assert.strictEqual(accountService.signInCalls, 1);
	});

	test('shows download status instead of sign-in while the Codex binary is downloading', () => {
		const accountService = service('downloading');
		const actions = createCodexAccountMenuActions(accountService);
		disposables.add(actions[0] as Action);

		assert.deepStrictEqual(actions.map(action => ({ label: action.label, enabled: action.enabled })), [
			{ label: 'Downloading Codex agent…', enabled: false },
		]);
	});

	test('hides signed-in and sign-in actions when the account surface is unavailable', () => {
		assert.deepStrictEqual(createCodexAccountMenuActions(service('signedIn'), false), []);
		assert.deepStrictEqual(createCodexAccountMenuActions(service('signedOut'), false), []);
	});

	test('only shows ChatGPT accounts where the Codex agent host is available', () => {
		function configuration(codexEnabled: boolean, preferAgentHost: boolean, aiDisabled = false) {
			return {
				getValue<T>(key: string): T | undefined {
					return ({
						[AgentHostCodexAgentEnabledSettingId]: codexEnabled,
						[CodexPreferAgentHostEditorSettingId]: preferAgentHost,
						[ChatAIDisabledSettingId]: aiDisabled,
					} as Record<string, boolean>)[key] as T;
				}
			};
		}

		assert.deepStrictEqual({
			agentsDisabled: shouldShowCodexAccount(configuration(false, false), true),
			agentsEnabled: shouldShowCodexAccount(configuration(true, false), true),
			agentsAIHidden: shouldShowCodexAccount(configuration(true, false, true), true),
			editorCodexDisabled: shouldShowCodexAccount(configuration(false, true), false),
			editorPreferenceDisabled: shouldShowCodexAccount(configuration(true, false), false),
			editorEnabled: shouldShowCodexAccount(configuration(true, true), false),
			editorAIHidden: shouldShowCodexAccount(configuration(true, true, true), false),
		}, {
			agentsDisabled: false,
			agentsEnabled: true,
			agentsAIHidden: false,
			editorCodexDisabled: false,
			editorPreferenceDisabled: false,
			editorEnabled: true,
			editorAIHidden: false,
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

	test('reads profile-image bytes through the Agent Host resource connection', async () => {
		const nonce = 'a'.repeat(64);
		const reference = {
			uri: `vscode-codex-profile-image:/profile-${nonce}.jpg`,
			contentType: 'image/jpeg',
			sizeHint: 3,
			nonce,
		};
		const dataUri = await readCodexProfileImageDataUri({
			resourceRead: async () => ({ data: 'AQID', encoding: ContentEncoding.Base64, contentType: 'image/jpg' }),
		}, reference);
		assert.strictEqual(dataUri, 'data:image/jpeg;base64,AQID');

		const invalidDataUri = await readCodexProfileImageDataUri({
			resourceRead: async () => ({ data: 'AQID', encoding: ContentEncoding.Base64, contentType: 'image/png' }),
		}, reference);
		assert.strictEqual(invalidDataUri, undefined);
	});

	test('retries a failed profile-image read for the same reference', async () => {
		const nonce = 'a'.repeat(64);
		const reference = {
			uri: `vscode-codex-profile-image:/profile-${nonce}.png`,
			contentType: 'image/png',
			sizeHint: 3,
			nonce,
		};
		const state: RootState = {
			agents: [],
			_meta: { [CODEX_ACCOUNT_META_KEY]: { status: 'signedIn', profileImage: reference } },
		};
		const rootStateEmitter = new Emitter<RootState>();
		const rootState: IAgentSubscription<RootState> = {
			value: state,
			verifiedValue: state,
			onDidChange: rootStateEmitter.event,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
		const firstReadStarted = new DeferredPromise<void>();
		let readCount = 0;
		const agentHostService = new class extends NullAgentHostService {
			override get rootState(): IAgentSubscription<RootState> {
				return rootState;
			}

			override async resourceRead(_uri: URI, _encoding?: ContentEncoding) {
				if (++readCount === 1) {
					firstReadStarted.complete();
					throw new Error('transient read failure');
				}
				return { data: 'AQID', encoding: ContentEncoding.Base64, contentType: 'image/png' };
			}
		}();
		const accountService = disposables.add(new CodexAccountService(agentHostService, NullOpenerService));
		disposables.add(rootStateEmitter);

		await firstReadStarted.p;
		await timeout(0);
		const loadedAccount = Event.toPromise(Event.filter(accountService.onDidChangeAccount, account => !!account.profileImageDataUri));
		rootStateEmitter.fire(state);

		assert.deepStrictEqual({
			readCount,
			profileImageDataUri: (await loadedAccount).profileImageDataUri,
		}, {
			readCount: 2,
			profileImageDataUri: 'data:image/png;base64,AQID',
		});
	});

});
