/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { createCommandUri } from '../../../../../../base/common/htmlContent.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { remoteAgentHostSessionTypeId } from '../../../../../../platform/agentHost/common/agentHostSessionType.js';
import type { IAgentSdkSetupInfo } from '../../../../../../platform/agentHost/common/agentSdkSetup.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { AGENT_SDK_SETUP_DOWNLOAD_COMMAND_ID, AGENT_SDK_SETUP_GITHUB_SIGN_IN_COMMAND_ID, AGENT_SDK_SETUP_OPEN_DOCS_COMMAND_ID, AGENT_SDK_SETUP_RELOAD_COMMAND_ID, AGENT_SDK_SETUP_SIGN_IN_COMMAND_ID, AgentHostSdkSetupNotificationContribution, agentSdkSetupNotificationId, createAgentSdkSetupNotification, getAgentSdkSetupState, getAgentSdkSetupStateToReport, hasAgentSdkSetupForSessionType, type IAgentSdkSetupStateInputs } from '../../../browser/agentSessions/agentHost/agentHostSdkSetupNotification.js';
import { IAgentSdkSetupService, type AgentSdkSetupState, type IAgentSdkSetup } from '../../../../../services/agentHost/browser/agentSdkSetupService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { ChatInputNotificationActionKind, IChatInputNotificationService, type IChatInputNotification, type IChatInputNotificationAction } from '../../../browser/widget/input/chatInputNotificationService.js';
import { SessionType } from '../../../common/chatSessionsService.js';
import { ILanguageModelsService, type ILanguageModelChatMetadata } from '../../../common/languageModels.js';

/** Signed out, flag on, entitlement settled, SDK missing — the case this feature exists for. */
const BLOCKED_USER: IAgentSdkSetupStateInputs = {
	allowSignedOutWhenUsable: true,
	signedIn: false,
	entitlementResolved: true,
	download: 'notDownloaded',
	downloadRequested: false,
	hasModels: false,
};

function createHost(authority: string = AMBIENT_AGENT_HOST_AUTHORITY, clientId = generateUuid()) {
	return {
		setupId: generateUuid(),
		authority,
		address: authority === AMBIENT_AGENT_HOST_AUTHORITY ? undefined : authority,
		name: authority === AMBIENT_AGENT_HOST_AUTHORITY ? 'Local' : authority,
		isAmbient: authority === AMBIENT_AGENT_HOST_AUTHORITY,
		connection: new class extends mock<IAgentConnection>() {
			override readonly clientId = clientId;
			override readonly rootState = new class extends mock<IAgentConnection['rootState']>() {
				override readonly value = { agents: [{ provider: 'claude', displayName: 'Claude', description: '', models: [] }] };
				override readonly onDidChange = Event.None;
			}();
		}(),
	};
}

const AMBIENT_HOST = createHost();

function createSetup(setup: IAgentSdkSetupInfo, displayName: string, host: ReturnType<typeof createHost>): IAgentSdkSetup {
	return {
		...setup,
		id: host.isAmbient ? setup.agent : `${host.setupId}.${setup.agent}`,
		displayName,
		host,
	};
}

function commandIds(actions: readonly IChatInputNotificationAction[]): string[] {
	return actions.map(action => action.kind === ChatInputNotificationActionKind.Command ? action.commandId : action.kind);
}

suite('Agent SDK setup banner', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('state', () => {
		const cases: readonly { readonly name: string; readonly inputs: IAgentSdkSetupStateInputs; readonly expected: AgentSdkSetupState | undefined }[] = [
			{ name: 'signed-out user with no SDK is offered the download', inputs: BLOCKED_USER, expected: 'downloadOffered' },
			{ name: 'standing consent waits quietly for the SDK to be used', inputs: { ...BLOCKED_USER, download: 'downloadOnUse' }, expected: undefined },
			{ name: 'a fetch in flight has nothing to ask for, since the host shows its own progress', inputs: { ...BLOCKED_USER, download: 'downloading' }, expected: undefined },
			// The host answers a download request over IPC, so it keeps saying
			// `notDownloaded` for a moment after we ask. Offering the button again in
			// that gap would re-ask a user who has already consented.
			{ name: 'a request the host has not answered yet is not a fresh offer', inputs: { ...BLOCKED_USER, downloadRequested: true }, expected: undefined },
			{ name: 'SDK on disk reporting no models means no account', inputs: { ...BLOCKED_USER, download: 'ready' }, expected: 'noAccount' },
			{ name: 'models are the honest end state, whatever the status says', inputs: { ...BLOCKED_USER, download: 'ready', hasModels: true }, expected: 'resolved' },
			{ name: 'nothing shows until entitlement settles, since "signed out" is not yet a fact', inputs: { ...BLOCKED_USER, download: 'ready', entitlementResolved: false }, expected: undefined },
			{ name: 'the missing-account explanation stays behind its flag', inputs: { ...BLOCKED_USER, download: 'ready', allowSignedOutWhenUsable: false }, expected: undefined },
			{ name: 'a signed-in user is never told they have no account', inputs: { ...BLOCKED_USER, download: 'ready', signedIn: true }, expected: undefined },
			{ name: 'a signed-in user mid-download is still shown nothing', inputs: { ...BLOCKED_USER, signedIn: true, download: 'downloading' }, expected: undefined },

			// The download is offered to everyone: each of these users can work
			// today, and still has an SDK we are about to fetch onto their machine.
			{ name: 'a signed-in user is offered the download too', inputs: { ...BLOCKED_USER, signedIn: true }, expected: 'downloadOffered' },
			{ name: 'having models does not hide the download', inputs: { ...BLOCKED_USER, signedIn: true, hasModels: true }, expected: 'downloadOffered' },
			{ name: 'the download offer does not wait for entitlement', inputs: { ...BLOCKED_USER, entitlementResolved: false }, expected: 'downloadOffered' },
			{ name: 'the download offer is not behind the signed-out flag', inputs: { ...BLOCKED_USER, allowSignedOutWhenUsable: false }, expected: 'downloadOffered' },
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
			const notification = createAgentSdkSetupNotification(createSetup(claude, 'Claude', AMBIENT_HOST), 'downloadOffered');

			assert.ok(notification);
			assert.strictEqual(notification.id, agentSdkSetupNotificationId('claude'));
			assert.deepStrictEqual(notification.sessionTypes, [SessionType.AgentHostClaude]);
			assert.strictEqual(notification.message, 'Download the Claude Agent');
			// An ask that expects a decision explains itself, and does so without
			// tying the SDK to an account: the same download serves the Copilot
			// proxy, a Claude subscription and a BYO key alike.
			assert.strictEqual(notification.description, 'To use the Claude Agent, we need to download the Claude Agent SDK.');
			assert.deepStrictEqual(commandIds(notification.actions), [AGENT_SDK_SETUP_DOWNLOAD_COMMAND_ID]);
			assert.deepStrictEqual(notification.actions[0].kind === ChatInputNotificationActionKind.Command ? notification.actions[0].commandArgs : undefined, ['claude', AMBIENT_AGENT_HOST_AUTHORITY]);
		});

		test('models add the send-a-message option without changing the Download action', () => {
			assert.deepStrictEqual(createAgentSdkSetupNotification(createSetup(claude, 'Claude', AMBIENT_HOST), 'downloadOffered', true), {
				...createAgentSdkSetupNotification(createSetup(claude, 'Claude', AMBIENT_HOST), 'downloadOffered'),
				description: 'Click Download or send a message to download the Claude Agent SDK.',
			});
		});

		test('every noun comes from the agent, so a second agent needs no entry here', () => {
			const codex: IAgentSdkSetupInfo = { agent: 'codex', download: 'notDownloaded', signInProviderName: 'ChatGPT' };

			assert.deepStrictEqual({
				sessionTypes: createAgentSdkSetupNotification(createSetup(codex, 'Codex', AMBIENT_HOST), 'downloadOffered')?.sessionTypes,
				download: createAgentSdkSetupNotification(createSetup(codex, 'Codex', AMBIENT_HOST), 'downloadOffered')?.message,
				noAccount: createAgentSdkSetupNotification(createSetup(codex, 'Codex', AMBIENT_HOST), 'noAccount')?.message,
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
				commandIds(createAgentSdkSetupNotification(createSetup(setup, displayName, AMBIENT_HOST), 'noAccount')?.actions ?? []);

			assert.deepStrictEqual({
				docsOnly: buttons({ ...claude, download: 'ready' }, 'Claude'),
				signInOnly: buttons({ ...codex, setupDocsUrl: undefined }, 'Codex'),
				both: buttons(codex, 'Codex'),
				neither: buttons({ agent: 'some-future-agent', download: 'ready' }, 'Future'),
			}, {
				// Docs are a link in the description, never a button — so declaring a
				// docs URL and declaring nothing produce the same row of buttons.
				docsOnly: [AGENT_SDK_SETUP_GITHUB_SIGN_IN_COMMAND_ID],
				signInOnly: [AGENT_SDK_SETUP_SIGN_IN_COMMAND_ID, AGENT_SDK_SETUP_GITHUB_SIGN_IN_COMMAND_ID],
				both: [AGENT_SDK_SETUP_SIGN_IN_COMMAND_ID, AGENT_SDK_SETUP_GITHUB_SIGN_IN_COMMAND_ID],
				neither: [AGENT_SDK_SETUP_GITHUB_SIGN_IN_COMMAND_ID],
			});
		});

		test('every button is addressed to the agent, and the sign-in one is labelled by its provider', () => {
			const notification = createAgentSdkSetupNotification(createSetup({ agent: 'codex', download: 'ready', signInProviderName: 'ChatGPT' }, 'Codex', AMBIENT_HOST), 'noAccount');

			assert.ok(notification);
			// The agent id, not the URL or the provider: each command resolves what it
			// needs from the agent's own declaration rather than trusting the banner.
			assert.deepStrictEqual(notification.actions.map(action => action.kind === ChatInputNotificationActionKind.Command ? action.commandArgs : undefined), [['codex', AMBIENT_AGENT_HOST_AUTHORITY], ['codex', AMBIENT_AGENT_HOST_AUTHORITY]]);
			assert.deepStrictEqual(notification.actions.map(action => action.label), ['Sign in to ChatGPT', 'Sign in to GitHub']);
		});

		test('the routes named in the copy are the ones the agent declared, ranked as the buttons rank them', () => {
			// One whole sentence per combination rather than joined clauses, since a
			// translator reorders them freely. GitHub appears in all four: every agent
			// behind this banner reaches models through our proxy once signed in.
			const noAccount = (setup: Omit<IAgentSdkSetupInfo, 'agent' | 'download'>) => {
				const description = createAgentSdkSetupNotification(createSetup({ agent: 'claude', download: 'ready', ...setup }, 'Claude', AMBIENT_HOST), 'noAccount')?.description;
				return typeof description === 'string' ? description : description?.value;
			};
			// Leads every variant, as the primary button does.
			const gitHub = 'Sign in to GitHub to use GitHub Copilot models';
			// Unconditional: setup finished in a terminal has no completion signal, so
			// every agent needs the "look again" route whatever else it declares.
			const reload = `[reload the configuration](${createCommandUri(AGENT_SDK_SETUP_RELOAD_COMMAND_ID, 'claude', AMBIENT_AGENT_HOST_AUTHORITY)}) if you have set up Claude elsewhere.`;
			// The agent id, like every button carries — the command resolves the URL
			// from the agent's own declaration rather than trusting the banner's copy.
			const docs = `For other ways to set up Claude, [learn more](${createCommandUri(AGENT_SDK_SETUP_OPEN_DOCS_COMMAND_ID, 'claude', AMBIENT_AGENT_HOST_AUTHORITY)}) on their docs.`;

			assert.deepStrictEqual({
				gitHubOnly: noAccount({}),
				docs: noAccount({ setupDocsUrl: 'https://example.test/claude' }),
				signIn: noAccount({ signInProviderName: 'ChatGPT' }),
				both: noAccount({ setupDocsUrl: 'https://example.test/claude', signInProviderName: 'ChatGPT' }),
			}, {
				gitHubOnly: `${gitHub} or ${reload}`,
				docs: `${gitHub} or ${reload} ${docs}`,
				signIn: `${gitHub}, sign in to ChatGPT to use your ChatGPT subscription, or ${reload}`,
				both: `${gitHub}, sign in to ChatGPT to use your ChatGPT subscription, or ${reload} ${docs}`,
			});
		});

		test('a name carrying markdown is escaped, so the host cannot forge a third link', () => {
			// Both nouns arrive from the host, and this description is trusted for two
			// commands — an unescaped `[]()` in either would render as a link to one of
			// them instead of as the name.
			const description = createAgentSdkSetupNotification(createSetup({ agent: 'claude', download: 'ready', setupDocsUrl: 'https://example.test/claude', signInProviderName: 'Chat[G]PT' }, 'Claude [x](command:evil)', AMBIENT_HOST), 'noAccount')?.description;
			const name = 'Claude \\[x\\]\\(command:evil\\)';

			assert.strictEqual(typeof description === 'string' ? description : description?.value,
				`Sign in to GitHub to use GitHub Copilot models, sign in to Chat\\[G\\]PT to use your Chat\\[G\\]PT subscription, or [reload the configuration](${createCommandUri(AGENT_SDK_SETUP_RELOAD_COMMAND_ID, 'claude', AMBIENT_AGENT_HOST_AUTHORITY)}) if you have set up ${name} elsewhere. For other ways to set up ${name}, [learn more](${createCommandUri(AGENT_SDK_SETUP_OPEN_DOCS_COMMAND_ID, 'claude', AMBIENT_AGENT_HOST_AUTHORITY)}) on their docs.`);
		});

		test('the copy is trusted for its own two commands alone, so its links render and reach nothing else', () => {
			// Untrusted markdown renders a `command:` link as inert text, which would
			// leave both routes with no affordance at all now that neither has a button.
			const description = createAgentSdkSetupNotification(createSetup({ agent: 'claude', download: 'ready', setupDocsUrl: 'https://example.test/claude' }, 'Claude', AMBIENT_HOST), 'noAccount')?.description;

			assert.ok(description !== undefined && typeof description !== 'string');
			assert.deepStrictEqual(description.isTrusted, { enabledCommands: [AGENT_SDK_SETUP_OPEN_DOCS_COMMAND_ID, AGENT_SDK_SETUP_RELOAD_COMMAND_ID] });
		});

		test('the banner cannot be dismissed, since it is the only route to a working agent', () => {
			const notification = createAgentSdkSetupNotification(createSetup(claude, 'Claude', AMBIENT_HOST), 'downloadOffered');

			assert.ok(notification);
			assert.strictEqual(notification.dismissible, false);
			assert.strictEqual(notification.autoDismissOnMessage, false);
		});

		test('nothing is rendered once the user is set up', () => {
			assert.strictEqual(createAgentSdkSetupNotification(createSetup(claude, 'Claude', AMBIENT_HOST), undefined), undefined);
			assert.strictEqual(createAgentSdkSetupNotification(createSetup({ ...claude, download: 'ready' }, 'Claude', AMBIENT_HOST), 'resolved'), undefined);
		});

		test('remote offers name the host and scope every action to its connection', () => {
			const host = createHost('build-server');
			const notification = createAgentSdkSetupNotification(createSetup(claude, 'Claude', host), 'downloadOffered');
			assert.ok(notification);
			assert.deepStrictEqual({
				sessionTypes: notification.sessionTypes,
				commandArgs: notification.actions.map(action => action.kind === ChatInputNotificationActionKind.Command ? action.commandArgs : undefined),
				description: notification.description,
				idContainsHostName: notification.id.includes(host.name),
			}, {
				sessionTypes: [remoteAgentHostSessionTypeId(host.authority, 'claude')],
				commandArgs: [['claude', host.authority]],
				description: 'To use the Claude Agent on build-server, we need to download the Claude Agent SDK to that host.',
				idContainsHostName: false,
			});
		});

		test('remote setup links and sign-in buttons keep the same target host', () => {
			const host = createHost('build-server');
			const notification = createAgentSdkSetupNotification(createSetup({
				agent: 'codex', download: 'ready', setupDocsUrl: 'https://example.test/codex', signInProviderName: 'ChatGPT',
			}, 'Codex', host), 'noAccount');
			assert.ok(notification);
			const description = notification.description;
			assert.ok(description && typeof description !== 'string');
			assert.deepStrictEqual({
				message: notification.message,
				reloadTarget: description.value.includes(createCommandUri(AGENT_SDK_SETUP_RELOAD_COMMAND_ID, 'codex', host.authority).toString()),
				docsTarget: description.value.includes(createCommandUri(AGENT_SDK_SETUP_OPEN_DOCS_COMMAND_ID, 'codex', host.authority).toString()),
				actionTargets: notification.actions.map(action => action.kind === ChatInputNotificationActionKind.Command ? action.commandArgs : undefined),
			}, {
				message: 'Choose how you want to use Codex on build-server.',
				reloadTarget: true,
				docsTarget: true,
				actionTargets: [['codex', host.authority], ['codex', host.authority]],
			});
		});

	});

	suite('model availability', () => {
		function createFixture(initialSessionTypes: readonly (string | undefined)[] = [], initialSetups: readonly IAgentSdkSetup[] = [createSetup({ agent: 'claude', download: 'notDownloaded' }, 'Claude', AMBIENT_HOST)]) {
			const instantiationService = store.add(new TestInstantiationService());
			const onDidChangeLanguageModels = store.add(new Emitter<string>());
			const models = new Map<string, ILanguageModelChatMetadata>();
			const notifications: IChatInputNotification[] = [];
			const deletedNotifications: string[] = [];
			const reportedStates: AgentSdkSetupState[] = [];
			const activeNotifications = new Map<string, IChatInputNotification>();
			const onDidChangeSetups = store.add(new Emitter<readonly IAgentSdkSetup[]>());
			const onDidChangeSentiment = store.add(new Emitter<void>());
			let setups = initialSetups;
			let pendingConnection: IAgentConnection | undefined;
			let hidden = false;
			const setModels = (sessionTypes: readonly (string | undefined)[]) => {
				models.clear();
				for (const [index, targetChatSessionType] of sessionTypes.entries()) {
					models.set(`model-${index}`, new class extends mock<ILanguageModelChatMetadata>() {
						override readonly targetChatSessionType = targetChatSessionType;
					}());
				}
				onDidChangeLanguageModels.fire('test');
			};

			instantiationService.stub(IChatInputNotificationService, {
				setNotification: notification => {
					notifications.push(notification);
					activeNotifications.set(notification.id, notification);
				},
				deleteNotification: id => {
					deletedNotifications.push(id);
					activeNotifications.delete(id);
				},
			});
			instantiationService.stub(IAgentSdkSetupService, {
				get setups() { return setups; },
				onDidChangeSetups: onDidChangeSetups.event,
				isDownloadPending: (_agent, connection) => connection === pendingConnection,
				reportSetupState: (_agent, state) => reportedStates.push(state),
			});
			instantiationService.stub(IDefaultAccountService, {
				currentDefaultAccount: null,
				onDidChangeDefaultAccount: Event.None,
			});
			instantiationService.stub(ILanguageModelsService, {
				onDidChangeLanguageModels: onDidChangeLanguageModels.event,
				getLanguageModelIds: () => [...models.keys()],
				lookupLanguageModel: id => models.get(id),
			});
			instantiationService.stub(IConfigurationService, new TestConfigurationService());
			instantiationService.stub(IChatEntitlementService, {
				entitlement: ChatEntitlement.Pro,
				onDidChangeEntitlement: Event.None,
				onDidChangeSentiment: onDidChangeSentiment.event,
				get sentiment() { return { hidden }; },
			});

			setModels(initialSessionTypes);
			store.add(instantiationService.createInstance(AgentHostSdkSetupNotificationContribution));

			return {
				notifications, deletedNotifications, reportedStates, setModels, activeNotifications,
				setSetups: (value: readonly IAgentSdkSetup[]) => {
					setups = value;
					onDidChangeSetups.fire(setups);
				},
				setPendingConnection: (connection: IAgentConnection) => {
					pendingConnection = connection;
					onDidChangeSetups.fire(setups);
				},
				hideAI: () => {
					hidden = true;
					onDidChangeSentiment.fire();
				},
			};
		}

		test('explains download-on-use when models are already available', () => {
			const fixture = createFixture([SessionType.AgentHostClaude]);

			assert.deepStrictEqual(fixture.notifications.map(notification => notification.description), [
				'Click Download or send a message to download the Claude Agent SDK.',
			]);
		});

		test('updates the visible offer when models for its agent appear and disappear', () => {
			const fixture = createFixture();
			fixture.setModels([SessionType.AgentHostCodex, undefined]);
			fixture.setModels([SessionType.AgentHostCodex, undefined, SessionType.AgentHostClaude]);
			fixture.setModels([SessionType.AgentHostClaude]);
			fixture.setModels([]);

			assert.deepStrictEqual({
				descriptions: fixture.notifications.map(notification => notification.description),
				actions: fixture.notifications.map(notification => commandIds(notification.actions)),
				deletedNotifications: fixture.deletedNotifications,
				reportedStates: fixture.reportedStates,
			}, {
				descriptions: [
					'To use the Claude Agent, we need to download the Claude Agent SDK.',
					'Click Download or send a message to download the Claude Agent SDK.',
					'To use the Claude Agent, we need to download the Claude Agent SDK.',
				],
				actions: [
					[AGENT_SDK_SETUP_DOWNLOAD_COMMAND_ID],
					[AGENT_SDK_SETUP_DOWNLOAD_COMMAND_ID],
					[AGENT_SDK_SETUP_DOWNLOAD_COMMAND_ID],
				],
				deletedNotifications: [],
				reportedStates: ['downloadOffered'],
			});
		});

		test('keeps local and multiple remote offers independent through pending, disconnect, and reconnect', () => {
			const first = createHost('first-remote');
			const second = createHost('second-remote');
			const hosts = [AMBIENT_HOST, first, second];
			const setups = hosts.map(host => createSetup({ agent: 'claude', download: 'notDownloaded' }, 'Claude', host));
			const fixture = createFixture([], setups);
			const initialIds = [...fixture.activeNotifications.keys()];
			fixture.setPendingConnection(first.connection);
			const afterPending = [...fixture.activeNotifications.values()].flatMap(notification => notification.sessionTypes ?? []);
			fixture.setSetups([setups[0]]);
			const afterDisconnect = [...fixture.activeNotifications.values()].flatMap(notification => notification.sessionTypes ?? []);
			const replacement = createHost(second.authority);
			const replacementSetup = createSetup({ agent: 'claude', download: 'notDownloaded' }, 'Claude', replacement);
			fixture.setSetups([setups[0], replacementSetup]);
			const afterReconnect = [...fixture.activeNotifications.keys()];

			assert.deepStrictEqual({
				initialCount: new Set(initialIds).size,
				afterPending,
				afterDisconnect,
				replacementShown: afterReconnect.includes(agentSdkSetupNotificationId(replacementSetup.id)),
				staleRemoved: !afterReconnect.includes(agentSdkSetupNotificationId(setups[2].id)),
			}, {
				initialCount: 3,
				afterPending: [SessionType.AgentHostClaude, remoteAgentHostSessionTypeId(second.authority, 'claude')],
				afterDisconnect: [SessionType.AgentHostClaude],
				replacementShown: true,
				staleRemoved: true,
			});
		});

		test('only uses models for the banner host and removes banners when AI is hidden', () => {
			const remote = createHost('remote');
			const remoteType = remoteAgentHostSessionTypeId(remote.authority, 'claude');
			const fixture = createFixture([SessionType.AgentHostClaude], [createSetup({ agent: 'claude', download: 'notDownloaded' }, 'Claude', remote)]);
			const initialDescription = fixture.notifications[0].description;
			fixture.setModels([remoteType]);
			const withModels = fixture.notifications.at(-1)?.description;
			fixture.hideAI();

			assert.deepStrictEqual({
				initialDescription,
				withModels,
				remainingBanners: fixture.activeNotifications.size,
			}, {
				initialDescription: 'To use the Claude Agent on remote, we need to download the Claude Agent SDK to that host.',
				withModels: 'Click Download or send a message to download the Claude Agent SDK on remote.',
				remainingBanners: 0,
			});
		});

		test('keeps both remote banners when the hosts share a protocol client ID', () => {
			const hosts = [createHost('first', 'shared-client'), createHost('second', 'shared-client')];
			const fixture = createFixture([], hosts.map(host => createSetup({ agent: 'claude', download: 'notDownloaded' }, 'Claude', host)));
			assert.deepStrictEqual(
				[...fixture.activeNotifications.values()].flatMap(notification => notification.sessionTypes ?? []),
				hosts.map(host => remoteAgentHostSessionTypeId(host.authority, 'claude')),
			);
		});
	});

	suite('commands', () => {
		function createFixture() {
			const instantiationService = store.add(new TestInstantiationService());
			const connections = new Map<string, IAgentConnection>();
			const calls: { action: string; agent: string; connection?: IAgentConnection; source?: string }[] = [];
			instantiationService.stub(IAgentHostConnectionsService, {
				getConnectionByAuthority: authority => connections.get(authority),
			});
			instantiationService.stub(IAgentSdkSetupService, {
				requestDownload: (agent, connection, options) => { calls.push({ action: 'download', agent, connection, source: options.source }); },
				requestReload: (agent, connection) => { calls.push({ action: 'reload', agent, connection }); },
				openSetupDocs: (agent, connection) => { calls.push({ action: 'docs', agent, connection }); },
				signIn: (agent, connection) => { calls.push({ action: 'signIn', agent, connection }); },
				signInToGitHub: agent => { calls.push({ action: 'github', agent }); },
			});
			const invoke = (id: string, ...args: unknown[]) => {
				const command = CommandsRegistry.getCommand(id);
				assert.ok(command);
				return instantiationService.invokeFunction(accessor => command.handler(accessor, ...args));
			};
			return { connections, calls, invoke };
		}

		test('routes every host-specific command to the supplied host, not the default host', () => {
			const fixture = createFixture();
			const hosts = [AMBIENT_HOST, createHost('first'), createHost('second')];
			for (const host of hosts) {
				fixture.connections.set(host.authority, host.connection);
				fixture.invoke(AGENT_SDK_SETUP_DOWNLOAD_COMMAND_ID, 'codex', host.authority);
				fixture.invoke(AGENT_SDK_SETUP_RELOAD_COMMAND_ID, 'codex', host.authority);
				fixture.invoke(AGENT_SDK_SETUP_OPEN_DOCS_COMMAND_ID, 'codex', host.authority);
				fixture.invoke(AGENT_SDK_SETUP_SIGN_IN_COMMAND_ID, 'codex', host.authority);
			}
			assert.deepStrictEqual(fixture.calls, hosts.flatMap(host => [
				{ action: 'download', agent: 'codex', connection: host.connection, source: 'setup' },
				{ action: 'reload', agent: 'codex', connection: host.connection },
				{ action: 'docs', agent: 'codex', connection: host.connection },
				{ action: 'signIn', agent: 'codex', connection: host.connection },
			]));
		});

		test('resolves a saved button against the replacement connection after reconnect', () => {
			const fixture = createFixture();
			const original = createHost('remote');
			fixture.connections.set(original.authority, original.connection);
			const notification = createAgentSdkSetupNotification(createSetup({ agent: 'claude', download: 'notDownloaded' }, 'Claude', original), 'downloadOffered');
			assert.ok(notification);
			const action = notification.actions[0];
			assert.strictEqual(action.kind, ChatInputNotificationActionKind.Command);
			const replacement = createHost(original.authority);
			fixture.connections.set(original.authority, replacement.connection);
			fixture.invoke(action.commandId, ...action.commandArgs ?? []);

			assert.deepStrictEqual(fixture.calls, [{
				action: 'download', agent: 'claude', connection: replacement.connection, source: 'setup',
			}]);
		});

		test('a stale or incomplete command never falls back to the ambient host', () => {
			const fixture = createFixture();
			fixture.connections.set(AMBIENT_HOST.authority, AMBIENT_HOST.connection);
			for (const id of [AGENT_SDK_SETUP_DOWNLOAD_COMMAND_ID, AGENT_SDK_SETUP_RELOAD_COMMAND_ID, AGENT_SDK_SETUP_OPEN_DOCS_COMMAND_ID, AGENT_SDK_SETUP_SIGN_IN_COMMAND_ID, AGENT_SDK_SETUP_GITHUB_SIGN_IN_COMMAND_ID]) {
				assert.throws(() => fixture.invoke(id, 'claude', 'disconnected'), /disconnected/);
				assert.throws(() => fixture.invoke(id, 'claude'), /agent host are required/);
			}
			assert.deepStrictEqual(fixture.calls, []);
		});
	});


	suite('activation reachability', () => {
		test('an advertised setup is found for its session type and only that one', () => {
			const setups = [createSetup({ agent: 'claude', download: 'ready' }, 'Claude', AMBIENT_HOST)];
			assert.deepStrictEqual({
				claude: hasAgentSdkSetupForSessionType(setups, SessionType.AgentHostClaude),
				codex: hasAgentSdkSetupForSessionType(setups, SessionType.AgentHostCodex),
				copilot: hasAgentSdkSetupForSessionType(setups, SessionType.AgentHostCopilot),
			}, { claude: true, codex: false, copilot: false });
		});

		test('no advertised setup leaves the harness gated', () => {
			assert.strictEqual(hasAgentSdkSetupForSessionType([], SessionType.AgentHostClaude), false);
		});

		test('remote setup makes only its own host and provider reachable without a visible banner', () => {
			const host = createHost('remote');
			const setup = createSetup({ agent: 'claude', download: 'ready' }, 'Claude', host);
			assert.deepStrictEqual({
				banner: createAgentSdkSetupNotification(setup, 'resolved'),
				selectedHost: hasAgentSdkSetupForSessionType([setup], remoteAgentHostSessionTypeId(host.authority, 'claude')),
				otherHost: hasAgentSdkSetupForSessionType([setup], remoteAgentHostSessionTypeId('other', 'claude')),
				otherAgent: hasAgentSdkSetupForSessionType([setup], remoteAgentHostSessionTypeId(host.authority, 'codex')),
				ambient: hasAgentSdkSetupForSessionType([setup], SessionType.AgentHostClaude),
			}, { banner: undefined, selectedHost: true, otherHost: false, otherAgent: false, ambient: false });
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
