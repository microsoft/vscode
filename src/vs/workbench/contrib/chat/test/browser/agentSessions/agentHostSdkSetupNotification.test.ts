/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { IAgentSdkSetupInfo } from '../../../../../../platform/agentHost/common/agentSdkSetup.js';
import { AGENT_SDK_SETUP_DOWNLOAD_COMMAND_ID, AGENT_SDK_SETUP_GITHUB_SIGN_IN_COMMAND_ID, AGENT_SDK_SETUP_OPEN_DOCS_COMMAND_ID, AGENT_SDK_SETUP_SIGN_IN_COMMAND_ID, agentSdkSetupNotificationId, createAgentSdkSetupNotification, getAgentDisplayNames, getAgentSdkSetupState, getAgentSdkSetupStateToReport, hasAgentSdkSetupNotification, type IAgentSdkSetupStateInputs } from '../../../browser/agentSessions/agentHost/agentHostSdkSetupNotification.js';
import type { AgentSdkSetupState } from '../../../../../services/agentHost/browser/agentSdkSetupService.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, type IChatInputNotification, type IChatInputNotificationAction, type IChatInputNotificationService } from '../../../browser/widget/input/chatInputNotificationService.js';
import { SessionType } from '../../../common/chatSessionsService.js';

/** Signed out, flag on, entitlement settled, SDK missing — the case this feature exists for. */
const BLOCKED_USER: IAgentSdkSetupStateInputs = {
	allowSignedOutWhenUsable: true,
	signedIn: false,
	entitlementResolved: true,
	download: 'notDownloaded',
	downloadRequested: false,
	hasModels: false,
};

function commandIds(actions: readonly IChatInputNotificationAction[]): string[] {
	return actions.map(action => action.kind === ChatInputNotificationActionKind.Command ? action.commandId : action.kind);
}

suite('Agent SDK setup banner', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('state', () => {
		const cases: readonly { readonly name: string; readonly inputs: IAgentSdkSetupStateInputs; readonly expected: AgentSdkSetupState | undefined }[] = [
			{ name: 'signed-out user with no SDK is offered the download', inputs: BLOCKED_USER, expected: 'downloadOffered' },
			{ name: 'a fetch in flight has nothing to ask for, since the host shows its own progress', inputs: { ...BLOCKED_USER, download: 'downloading' }, expected: undefined },
			// The host answers a download request over IPC, so it keeps saying
			// `notDownloaded` for a moment after we ask. Offering the button again in
			// that gap would re-ask a user who has already consented.
			{ name: 'a request the host has not answered yet is not a fresh offer', inputs: { ...BLOCKED_USER, downloadRequested: true }, expected: undefined },
			{ name: 'SDK on disk reporting no models means no account', inputs: { ...BLOCKED_USER, download: 'ready' }, expected: 'noAccount' },
			{ name: 'models are the honest end state, whatever the status says', inputs: { ...BLOCKED_USER, download: 'ready', hasModels: true }, expected: 'resolved' },
			{ name: 'a signed-in user already has Copilot models', inputs: { ...BLOCKED_USER, signedIn: true }, expected: undefined },
			{ name: 'nothing shows until entitlement settles, since "signed out" is not yet a fact', inputs: { ...BLOCKED_USER, entitlementResolved: false }, expected: undefined },
			{ name: 'the whole feature stays behind its flag', inputs: { ...BLOCKED_USER, allowSignedOutWhenUsable: false }, expected: undefined },
			{ name: 'a signed-in user mid-download is still shown nothing', inputs: { ...BLOCKED_USER, signedIn: true, download: 'downloading' }, expected: undefined },
		];

		for (const { name, inputs, expected } of cases) {
			test(name, () => {
				assert.strictEqual(getAgentSdkSetupState(inputs), expected);
			});
		}
	});

	suite('presentation', () => {
		const claude: IAgentSdkSetupInfo = { agent: 'claude', download: 'notDownloaded', setupDocsUrl: 'https://example.test/claude' };

		test('the download offer names the SDK, explains it, and carries a single Download button', () => {
			const notification = createAgentSdkSetupNotification(claude, 'Claude', 'downloadOffered');

			assert.ok(notification);
			assert.strictEqual(notification.id, agentSdkSetupNotificationId('claude'));
			assert.deepStrictEqual(notification.sessionTypes, [SessionType.AgentHostClaude]);
			assert.strictEqual(notification.message, 'Download the Claude Agent');
			// An ask that expects a decision explains itself, and does so without
			// tying the SDK to an account: the same download serves the Copilot
			// proxy, a Claude subscription and a BYO key alike.
			assert.strictEqual(notification.description, 'To use the Claude Agent, we need to download the Claude Agent SDK.');
			assert.deepStrictEqual(commandIds(notification.actions), [AGENT_SDK_SETUP_DOWNLOAD_COMMAND_ID]);
			assert.deepStrictEqual(notification.actions[0].kind === ChatInputNotificationActionKind.Command ? notification.actions[0].commandArgs : undefined, ['claude']);
		});

		test('every noun comes from the agent, so a second agent needs no entry here', () => {
			const codex: IAgentSdkSetupInfo = { agent: 'codex', download: 'notDownloaded', signInProviderName: 'ChatGPT' };

			assert.deepStrictEqual({
				sessionTypes: createAgentSdkSetupNotification(codex, 'Codex', 'downloadOffered')?.sessionTypes,
				download: createAgentSdkSetupNotification(codex, 'Codex', 'downloadOffered')?.message,
				noAccount: createAgentSdkSetupNotification(codex, 'Codex', 'noAccount')?.message,
			}, {
				sessionTypes: [SessionType.AgentHostCodex],
				download: 'Download the Codex Agent',
				noAccount: 'Choose how you want to use Codex.',
			});
		});

		test('a missing account offers every route the agent declared, GitHub sign-in last', () => {
			// Last is the primary button in the widget, and GitHub is the route that
			// works whatever the user has (or has not) set up elsewhere.
			const codex: IAgentSdkSetupInfo = { agent: 'codex', download: 'ready', setupDocsUrl: 'https://example.test/codex', signInProviderName: 'ChatGPT' };
			const buttons = (setup: IAgentSdkSetupInfo, displayName: string) =>
				commandIds(createAgentSdkSetupNotification(setup, displayName, 'noAccount')?.actions ?? []);

			assert.deepStrictEqual({
				docsOnly: buttons({ ...claude, download: 'ready' }, 'Claude'),
				signInOnly: buttons({ ...codex, setupDocsUrl: undefined }, 'Codex'),
				both: buttons(codex, 'Codex'),
				neither: buttons({ agent: 'some-future-agent', download: 'ready' }, 'Future'),
			}, {
				docsOnly: [AGENT_SDK_SETUP_OPEN_DOCS_COMMAND_ID, AGENT_SDK_SETUP_GITHUB_SIGN_IN_COMMAND_ID],
				signInOnly: [AGENT_SDK_SETUP_SIGN_IN_COMMAND_ID, AGENT_SDK_SETUP_GITHUB_SIGN_IN_COMMAND_ID],
				both: [AGENT_SDK_SETUP_OPEN_DOCS_COMMAND_ID, AGENT_SDK_SETUP_SIGN_IN_COMMAND_ID, AGENT_SDK_SETUP_GITHUB_SIGN_IN_COMMAND_ID],
				neither: [AGENT_SDK_SETUP_GITHUB_SIGN_IN_COMMAND_ID],
			});
		});

		test('every button is addressed to the agent, and the sign-in one is labelled by its provider', () => {
			const notification = createAgentSdkSetupNotification({ agent: 'codex', download: 'ready', signInProviderName: 'ChatGPT' }, 'Codex', 'noAccount');

			assert.ok(notification);
			// The agent id, not the URL or the provider: each command resolves what it
			// needs from the agent's own declaration rather than trusting the banner.
			assert.deepStrictEqual(notification.actions.map(action => action.kind === ChatInputNotificationActionKind.Command ? action.commandArgs : undefined), [['codex'], ['codex']]);
			assert.deepStrictEqual(notification.actions.map(action => action.label), ['Sign in to ChatGPT', 'Sign in to GitHub']);
		});

		test('the routes named in the copy are the ones the agent declared', () => {
			// One whole sentence per combination rather than joined clauses, since a
			// translator reorders them freely. GitHub appears in all four: every agent
			// behind this banner reaches models through our proxy once signed in.
			const noAccount = (setup: Omit<IAgentSdkSetupInfo, 'agent' | 'download'>) =>
				createAgentSdkSetupNotification({ agent: 'claude', download: 'ready', ...setup }, 'Claude', 'noAccount')?.description;

			assert.deepStrictEqual({
				gitHubOnly: noAccount({}),
				docs: noAccount({ setupDocsUrl: 'https://example.test/claude' }),
				signIn: noAccount({ signInProviderName: 'ChatGPT' }),
				both: noAccount({ setupDocsUrl: 'https://example.test/claude', signInProviderName: 'ChatGPT' }),
			}, {
				gitHubOnly: 'Sign in to GitHub to use GitHub Copilot models.',
				docs: 'Sign in to GitHub to use GitHub Copilot models, or read the instructions for other ways to set up Claude.',
				signIn: 'Sign in to GitHub to use GitHub Copilot models, or sign in to ChatGPT to use your ChatGPT subscription.',
				both: 'Sign in to GitHub to use GitHub Copilot models, sign in to ChatGPT to use your ChatGPT subscription, or read the instructions for other ways to set up Claude.',
			});
		});

		test('the banner cannot be dismissed, since it is the only route to a working agent', () => {
			const notification = createAgentSdkSetupNotification(claude, 'Claude', 'downloadOffered');

			assert.ok(notification);
			assert.strictEqual(notification.dismissible, false);
			assert.strictEqual(notification.autoDismissOnMessage, false);
		});

		test('nothing is rendered once the user is set up, or for an agent the host has not named yet', () => {
			assert.strictEqual(createAgentSdkSetupNotification(claude, 'Claude', undefined), undefined);
			assert.strictEqual(createAgentSdkSetupNotification({ ...claude, download: 'ready' }, 'Claude', 'resolved'), undefined);
			// "Download the  Agent" is worse than no banner; the next root-state
			// change carries the name.
			assert.strictEqual(createAgentSdkSetupNotification({ agent: 'some-future-agent', download: 'notDownloaded' }, '', 'downloadOffered'), undefined);
		});
	});

	suite('display names', () => {
		test('reads each agent name the host published, and skips what it did not', () => {
			assert.deepStrictEqual([...getAgentDisplayNames({
				agents: [
					{ provider: 'claude', displayName: 'Claude', description: '', models: [] },
					{ provider: 'nameless', displayName: '', description: '', models: [] },
				],
			})], [['claude', 'Claude']]);
		});

		test('a host that has not reported, or failed, names nobody', () => {
			assert.deepStrictEqual([...getAgentDisplayNames(undefined)], []);
			assert.deepStrictEqual([...getAgentDisplayNames(new Error('host is down'))], []);
		});
	});

	suite('reachability', () => {
		/** A notification service holding the given notifications, none dismissed. */
		function notificationService(notifications: readonly IChatInputNotification[]): IChatInputNotificationService {
			return new class extends mock<IChatInputNotificationService>() {
				override getActiveNotification(filter?: (notification: IChatInputNotification) => boolean): IChatInputNotification | undefined {
					return notifications.find(notification => !filter || filter(notification));
				}
			}();
		}

		function bannersFor(...agents: readonly string[]): readonly IChatInputNotification[] {
			return agents.flatMap(agent => {
				const notification = createAgentSdkSetupNotification({ agent, download: 'notDownloaded' }, agent, 'downloadOffered');
				return notification ? [notification] : [];
			});
		}

		test('a banner is found for the session type it is scoped to, and only that one', () => {
			const service = notificationService(bannersFor('claude'));

			assert.deepStrictEqual({
				claude: hasAgentSdkSetupNotification(service, SessionType.AgentHostClaude),
				codex: hasAgentSdkSetupNotification(service, SessionType.AgentHostCodex),
				copilot: hasAgentSdkSetupNotification(service, SessionType.AgentHostCopilot),
			}, { claude: true, codex: false, copilot: false });
		});

		test('an unscoped notification is not mistaken for a setup banner', () => {
			// The session-type filter alone passes a notification with no
			// `sessionTypes` — a quota warning applies everywhere — so the id
			// carries the "this is a setup ask" bit.
			const service = notificationService([{
				id: 'chat.quotaExceeded',
				severity: ChatInputNotificationSeverity.Warning,
				message: 'Out of quota',
				description: undefined,
				actions: [],
				dismissible: true,
				autoDismissOnMessage: false,
			}]);

			assert.strictEqual(hasAgentSdkSetupNotification(service, SessionType.AgentHostClaude), false);
		});

		test('nothing on offer means nothing to reach', () => {
			assert.strictEqual(hasAgentSdkSetupNotification(notificationService([]), SessionType.AgentHostClaude), false);
		});
	});

	suite('funnel', () => {
		const cases: readonly {
			readonly name: string;
			/** The last state *reported* for this agent, not the last one computed. */
			readonly previous: AgentSdkSetupState | undefined;
			readonly state: AgentSdkSetupState | undefined;
			readonly expected: AgentSdkSetupState | undefined;
		}[] = [
				{ name: 'first sight of the offer counts', previous: undefined, state: 'downloadOffered', expected: 'downloadOffered' },
				{ name: 'an SDK that found no account is where users get stuck', previous: 'downloadOffered', state: 'noAccount', expected: 'noAccount' },
				{ name: 'a stuck user who then has models is the conversion', previous: 'noAccount', state: 'resolved', expected: 'resolved' },
				// Counted once per user: re-renders are constant, and a download that
				// failed back to the offer is the same person still being asked.
				{ name: 'a re-render, or a failed download returning to the offer, is not a second offer', previous: 'downloadOffered', state: 'downloadOffered', expected: undefined },
				{ name: 'a conversion is not re-counted on every later render', previous: 'resolved', state: 'resolved', expected: undefined },
				{ name: 'a fetch in flight, or giving up, moves the user nowhere', previous: 'downloadOffered', state: undefined, expected: undefined },
				{ name: 'a user this feature was never for is not a convert', previous: undefined, state: 'resolved', expected: undefined },
			];

		for (const { name, previous, state, expected } of cases) {
			test(name, () => {
				assert.strictEqual(getAgentSdkSetupStateToReport(previous, state), expected);
			});
		}
	});
});
