/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../../workbench/services/authentication/common/authentication.js';
import { ChatEntitlement } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { getAccountProfileImageUrl, getAccountTitleBarBadgeKey, getAccountTitleBarState, getCopilotAccountMenuPresentation, IAccountTitleBarStateContext, resolveAccountInfo } from '../../../../browser/accountTitleBarState.js';
import { CopilotAccountContext } from '../../../../../platform/agentHost/common/copilotAccountContext.js';

suite('Sessions - Account Title Bar State', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createState(overrides: Partial<IAccountTitleBarStateContext> = {}): IAccountTitleBarStateContext {
		return {
			isAccountLoading: false,
			accountName: 'lee@example.com',
			accountProviderLabel: 'GitHub',
			entitlement: ChatEntitlement.Pro,
			sentiment: {},
			quotas: {},
			...overrides,
		};
	}

	test('resolves only the selected Microsoft identity and never falls back to an arbitrary GitHub account', async () => {
		const context: CopilotAccountContext = {
			kind: 'ready', entraAccountId: 'selected', discoveryId: 'discovery', derivedFrom: 'base',
			choice: { service: 'm365', selectionId: 'selection', resource: 'https://m365.example', host: 'https://m365.example', accountName: 'provider-coordinate', displayName: 'Provider name' },
		};
		const authentication = new class extends mock<IAuthenticationService>() {
			override async getSessions(provider: string) {
				assert.strictEqual(provider, 'microsoft');
				return [{ id: 'a', accessToken: '', scopes: [], account: { id: 'other', label: 'Other account' } }, { id: 'b', accessToken: '', scopes: [], account: { id: 'selected', label: 'Selected account' } }];
			}
		}();
		const defaults = new class extends mock<IDefaultAccountService>() { }();
		const info = await resolveAccountInfo(defaults, authentication, context);
		const presentation = getAccountTitleBarState(createState({
			copilotAccountContext: context, accountName: info?.accountName, accountProviderLabel: info?.accountProviderLabel,
			entitlement: ChatEntitlement.Free, quotas: { chat: { percentRemaining: 0, unlimited: false } },
		}));
		assert.deepStrictEqual({
			info, signedOut: await resolveAccountInfo(defaults, authentication, { kind: 'signedOut' }),
			badge: presentation.badge, label: presentation.ariaLabel,
		}, {
			info: { accountName: 'Selected account', accountProviderId: 'microsoft', accountProviderLabel: 'Microsoft 365 Copilot', accountIcon: undefined },
			signedOut: undefined, badge: undefined, label: 'Signed in as Selected account with Microsoft 365 Copilot',
		});
	});

	test('account menu uses only the selected service and matching GitHub subscription', () => {
		const github: CopilotAccountContext = {
			kind: 'ready', entraAccountId: 'account', discoveryId: 'discovery', derivedFrom: 'base',
			choice: { service: 'github', selectionId: 'selection', resource: 'https://github.com', host: 'https://github.com', accountName: 'emu', displayName: 'EMU' },
		};
		const microsoft365: CopilotAccountContext = { ...github, choice: { ...github.choice, service: 'm365' } };
		const snapshot = (context: IAccountTitleBarStateContext, login = 'emu', host = 'https://github.com/') => {
			const { showIdentity, showSetup, showUsage } = getCopilotAccountMenuPresentation(context, login, host);
			return { showIdentity, showSetup, showUsage };
		};
		const state = createState({ copilotAccountContext: github, accountName: 'EMU' });
		assert.deepStrictEqual({
			github: snapshot(state),
			otherLogin: snapshot(state, 'other'),
			otherHost: snapshot(state, 'emu', 'https://other.ghe.com/'),
			microsoft365: snapshot({ ...state, copilotAccountContext: microsoft365 }),
			incomplete: snapshot({ ...state, copilotAccountContext: { kind: 'incomplete', entraAccountId: 'account' } }),
			hidden: snapshot({ ...state, copilotAccountContext: microsoft365, sentiment: { ...state.sentiment, hidden: true } }),
		}, {
			github: { showIdentity: true, showSetup: false, showUsage: true },
			otherLogin: { showIdentity: true, showSetup: false, showUsage: false },
			otherHost: { showIdentity: true, showSetup: false, showUsage: false },
			microsoft365: { showIdentity: true, showSetup: false, showUsage: false },
			incomplete: { showIdentity: true, showSetup: true, showUsage: false },
			hidden: { showIdentity: false, showSetup: false, showUsage: false },
		});
	});

	test('shows low token badge for Copilot Free users', () => {
		const state = getAccountTitleBarState(createState({
			entitlement: ChatEntitlement.Free,
			quotas: { chat: { percentRemaining: 10, unlimited: false } },
		}));

		assert.deepStrictEqual({
			source: state.source,
			label: state.label,
			badge: state.badge,
			dotBadge: state.dotBadge,
			kind: state.kind,
		}, {
			source: 'copilot',
			label: 'Tokens Remaining',
			badge: '10%',
			dotBadge: 'error',
			kind: 'warning',
		});

		assert.strictEqual(getAccountTitleBarBadgeKey(state), 'copilot:error:10%');
	});

	test('shows warning dot badge for low but non-critical tokens', () => {
		const state = getAccountTitleBarState(createState({
			entitlement: ChatEntitlement.Free,
			quotas: { chat: { percentRemaining: 20, unlimited: false } },
		}));

		assert.deepStrictEqual({
			source: state.source,
			label: state.label,
			badge: state.badge,
			dotBadge: state.dotBadge,
			kind: state.kind,
		}, {
			source: 'copilot',
			label: 'Tokens Remaining',
			badge: '20%',
			dotBadge: 'warning',
			kind: 'accent',
		});
	});

	test('shows quota reached warning when free quota is exhausted', () => {
		const state = getAccountTitleBarState(createState({
			entitlement: ChatEntitlement.Free,
			quotas: { completions: { percentRemaining: 0, unlimited: false } },
		}));

		assert.deepStrictEqual({
			source: state.source,
			label: state.label,
			dotBadge: state.dotBadge,
			kind: state.kind,
		}, {
			source: 'copilot',
			label: 'Quota Reached',
			dotBadge: 'error',
			kind: 'warning',
		});

		assert.strictEqual(getAccountTitleBarBadgeKey(state), 'copilot:error:');
	});

	test('falls back to signed-in account label when no higher-priority state exists', () => {
		const state = getAccountTitleBarState(createState());

		assert.deepStrictEqual({
			source: state.source,
			label: state.label,
			kind: state.kind,
			revealLabelOnHover: state.revealLabelOnHover,
		}, {
			source: 'account',
			label: 'lee@example.com',
			kind: 'default',
			revealLabelOnHover: true,
		});
	});

	test('reveals loading account label only on hover', () => {
		const state = getAccountTitleBarState(createState({
			isAccountLoading: true,
			accountName: undefined,
			accountProviderLabel: undefined,
			entitlement: ChatEntitlement.Unknown,
		}));

		assert.deepStrictEqual({
			source: state.source,
			label: state.label,
			kind: state.kind,
			revealLabelOnHover: state.revealLabelOnHover,
		}, {
			source: 'account',
			label: 'Loading Account...',
			kind: 'default',
			revealLabelOnHover: true,
		});
	});

	test('offers a calm sign-in when signed out', () => {
		const state = getAccountTitleBarState(createState({
			accountName: undefined,
			accountProviderLabel: undefined,
			entitlement: ChatEntitlement.Unknown,
		}));

		assert.deepStrictEqual({
			source: state.source,
			label: state.label,
			kind: state.kind,
		}, {
			source: 'copilot',
			label: 'Sign In',
			kind: 'default',
		});
	});

	test('returns a GitHub profile image URL for GitHub accounts', () => {
		assert.strictEqual(
			getAccountProfileImageUrl('github', 'mona lisa'),
			'https://github.com/mona%20lisa.png?size=64'
		);
	});

	test('prefers the account icon supplied by the authentication provider', () => {
		assert.strictEqual(
			getAccountProfileImageUrl('github', 'mona lisa', URI.parse('https://avatars.githubusercontent.com/u/1?v=4')),
			'https://avatars.githubusercontent.com/u/1?v=4'
		);
		assert.strictEqual(
			getAccountProfileImageUrl('github-enterprise', 'octocat', URI.parse('https://example.com/avatar.png')),
			'https://example.com/avatar.png'
		);
	});

	test('converts a provider supplied file icon into a browser safe URL', () => {
		const icon = URI.file('/home/octocat/avatar.png');

		assert.strictEqual(
			getAccountProfileImageUrl('github', 'octocat', icon),
			FileAccess.uriToBrowserUri(icon).toString(true)
		);
	});

	test('falls back to the codicon when no GitHub profile image URL is available', () => {
		assert.strictEqual(getAccountProfileImageUrl(undefined, 'octocat'), undefined);
		assert.strictEqual(getAccountProfileImageUrl('github-enterprise', 'octocat'), undefined);
		assert.strictEqual(getAccountProfileImageUrl('github', undefined), undefined);
	});

	test('resolves the default account icon by session id, not by label', async () => {
		const sessions: AuthenticationSession[] = [
			{ id: 'stale-session', accessToken: 'token', scopes: ['scope'], account: { id: 'account', label: 'octocat', icon: URI.parse('https://example.com/stale.png') } },
			{ id: 'default-session', accessToken: 'token', scopes: ['scope'], account: { id: 'account', label: 'octocat', icon: URI.parse('https://example.com/default.png') } },
		];
		const defaultAccountService = new class extends mock<IDefaultAccountService>() {
			override async getDefaultAccount(): Promise<IDefaultAccount> {
				return {
					authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false },
					accountName: 'octocat',
					sessionId: 'default-session',
					enterprise: false,
				};
			}
		};
		const authenticationService = new class extends mock<IAuthenticationService>() {
			override async getSessions(): Promise<ReadonlyArray<AuthenticationSession>> {
				return sessions;
			}
		};

		assert.deepStrictEqual(
			await resolveAccountInfo(defaultAccountService, authenticationService),
			{
				accountName: 'octocat',
				accountProviderId: 'github',
				accountProviderLabel: 'GitHub',
				accountIcon: URI.parse('https://example.com/default.png'),
			}
		);
	});
});
