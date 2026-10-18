/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readdirSync, readFileSync } from 'fs';
import { join } from '../../../../base/common/path.js';
import { FileAccess } from '../../../../base/common/network.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { hasKey } from '../../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ActionType } from '../../common/state/sessionActions.js';
import {
	AgentSession,
	resolveAgentChatOrigin,
	resolveAgentHostCustomizations,
	resolveSubagentChatParent,
	type IAgentChatContext,
} from '../../common/agentService.js';
import { fixedChatOwnerRef, resolveSessionBackedStorage } from '../../common/agent.js';
import {
	buildChatUri,
	buildDefaultChatUri,
	buildSubagentChatUri,
	ChatOriginKind,
	CustomizationType,
	SessionLifecycle,
	SessionStatus,
	type ChatOrigin,
	type Customization,
	type SessionSummary,
} from '../../common/state/sessionState.js';
import { AgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';
import { AgentHostPromptCache } from '../../node/agentHostPromptCache.js';
import { AgentHostSessionTitleSignal } from '../../node/agentHostSessionTitleSignal.js';
import { createAgentChatContext, getSessionChatsForFanOut } from '../../node/agentChatContext.js';
import { AgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { AhpErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import type { IAgentHostCredentialSource } from '../../common/agentHostCredentials.js';

suite('Agent Host provider seams', () => {

	const disposables = new DisposableStore();
	const session = AgentSession.uri('copilot', 'seam-session');
	const sessionKey = session.toString();
	const defaultChat = URI.parse(buildDefaultChatUri(sessionKey));
	const peerChat = URI.parse(buildChatUri(sessionKey, 'peer'));
	const subagentChat = URI.parse(buildSubagentChatUri(sessionKey, 'tool-1'));

	let manager: AgentHostStateManager;
	let authenticationService: AgentHostAuthenticationService;

	function summary(): SessionSummary & { readonly defaultChat: string } {
		return {
			resource: sessionKey,
			provider: 'copilot',
			title: 'Seams',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
			defaultChat: buildDefaultChatUri(sessionKey),
		};
	}

	function customization(id: string, enabled: boolean): Customization {
		return {
			type: CustomizationType.Directory,
			id,
			name: id,
			uri: `file:///${id}`,
			enabled,
			contents: CustomizationType.Skill,
			writable: false,
		};
	}

	setup(() => {
		manager = disposables.add(new AgentHostStateManager(new NullLogService()));
		authenticationService = disposables.add(new AgentHostAuthenticationService(new NullLogService()));
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- Exhaustive origin + customizations on every context ---------------

	suite('createAgentChatContext', () => {

		test('anchors session customizations to the default chat\'s own folders, not the shared folders older builds read', () => {
			manager.createSession(summary());
			const chatEntry = (isDefault: boolean, launchWorkingDirectories: readonly string[]) => ({
				isDefault, storage: undefined, title: undefined, titleSource: undefined, isRead: undefined, workingDirectories: undefined, launchWorkingDirectories, changes: undefined,
			});
			const context = createAgentChatContext(manager, authenticationService, session, defaultChat, manager.resolveChatStorageResource(session.toString(), defaultChat.toString()), {
				session: sessionKey,
				authority: 2,
				revision: 1,
				// What a chat-only move of the default chat from `f1` writes for older builds.
				values: new Map([['copilot.sharedCustomizationDirectories', JSON.stringify(['file:///f1'])], ['copilot.customizationDirectory', 'file:///f1']]),
				folders: new Map(),
				chats: new Map([[defaultChat.toString(), chatEntry(true, ['file:///f2', 'file:///f3'])], [peerChat.toString(), chatEntry(false, ['file:///f1'])]]),
			});
			assert.deepStrictEqual({
				customizationDirectory: context.sessionSettings?.customizationDirectory?.toString(),
				additionalCustomizationDirectories: context.sessionSettings?.additionalCustomizationDirectories.map(directory => directory.toString()),
			}, {
				customizationDirectory: 'file:///f2',
				additionalCustomizationDirectories: ['file:///f3'],
			});
		});

		test('stamps resource and origin for the session-backed default chat', () => {
			manager.createSession(summary());
			const context = createAgentChatContext(manager, authenticationService, session, defaultChat, manager.resolveChatStorageResource(session.toString(), defaultChat.toString()), undefined);
			assert.deepStrictEqual({
				resource: context.resource.toString(),
				origin: context.origin,
				parent: resolveSubagentChatParent(context),
				customizations: context.customizations,
			}, {
				// The default chat's provider-owned storage scope is its session.
				resource: sessionKey,
				origin: { kind: ChatOriginKind.User },
				parent: undefined,
				customizations: undefined,
			});
		});

		test('carries the catalog origin and host customizations for a spawned subagent chat', () => {
			manager.createSession(summary());
			manager.setSessionCustomizations(sessionKey, [customization('alpha', true), customization('beta', false)]);
			manager.addChat(sessionKey, subagentChat.toString(), creationTimeChatStorageResource(sessionKey, subagentChat.toString(), buildDefaultChatUri(sessionKey)), {
				origin: { kind: ChatOriginKind.Tool, chat: buildDefaultChatUri(sessionKey), toolCallId: 'tool-1' },
			});

			const context = createAgentChatContext(manager, authenticationService, session, subagentChat, manager.resolveChatStorageResource(session.toString(), subagentChat.toString()), undefined);
			assert.deepStrictEqual({
				resource: context.resource.toString(),
				origin: context.origin,
				parent: resolveSubagentChatParent(context)?.toolCallId,
				customizations: context.customizations?.map(c => [c.id, c.type === CustomizationType.Directory ? c.enabled : undefined]),
			}, {
				resource: subagentChat.toString(),
				origin: { kind: ChatOriginKind.Tool, chat: buildDefaultChatUri(sessionKey), toolCallId: 'tool-1' },
				parent: 'tool-1',
				customizations: [['alpha', true], ['beta', false]],
			});
		});

		test('resolves the origin of a restored chat before its state is hydrated', () => {
			manager.createSession(summary());
			manager.registerRestoredChatSummary(sessionKey, peerChat.toString(), {
				storageResource: creationTimeChatStorageResource(sessionKey, peerChat.toString(), buildDefaultChatUri(sessionKey)),
				title: 'Restored',
				origin: { kind: ChatOriginKind.Fork, chat: buildDefaultChatUri(sessionKey), turnId: 'turn-1' },
				resolver: async () => ({ turns: [] }),
			});

			assert.deepStrictEqual({
				// Restored chats have no ChatState until they are resolved…
				state: manager.getChatState(peerChat.toString()),
				// …but their origin is authoritative from the moment they are registered.
				origin: createAgentChatContext(manager, authenticationService, session, peerChat, manager.resolveChatStorageResource(session.toString(), peerChat.toString()), undefined).origin,
			}, {
				state: undefined,
				origin: { kind: ChatOriginKind.Fork, chat: buildDefaultChatUri(sessionKey), turnId: 'turn-1' },
			});
		});

		for (const sessionSponsored of [false, true]) {
			test(`attaches an unavailable source to a cold principal-bound chat with session sponsor=${sessionSponsored}`, () => {
				manager.createSession(summary());
				const principal = { apiOrigin: 'https://api.github.com', userId: '42' };
				authenticationService.restoreSessionCredentialPrincipal(sessionKey, principal);
				if (sessionSponsored) {
					authenticationService.bindSessionCredentials(sessionKey, { principal, getCredential: () => undefined });
				}
				const context = createAgentChatContext(manager, authenticationService, session, peerChat, peerChat.toString(), undefined);
				assert.throws(() => context.credentials?.getCredential({ resource: principal.apiOrigin }), error => error instanceof ProtocolError && error.code === AhpErrorCodes.AuthRequired);
			});
		}

		test('supplies only the exact chat binding and leaves untouched legacy chats uncredentialed', () => {
			manager.createSession(summary());
			const legacy = createAgentChatContext(manager, authenticationService, session, defaultChat, sessionKey, undefined);
			const source: IAgentHostCredentialSource = {
				principal: { apiOrigin: 'https://api.github.com', userId: '42' },
				getCredential: () => undefined,
			};
			authenticationService.bindSessionCredentials(sessionKey, source, peerChat.toString());
			const context = createAgentChatContext(manager, authenticationService, sessionKey, peerChat.toString(), peerChat.toString(), undefined);
			assert.deepStrictEqual({ legacyHasCredentials: hasKey(legacy, { credentials: true }), exactBinding: context.credentials === source }, { legacyHasCredentials: false, exactBinding: true });
		});
	});

	suite('chat owner reference', () => {

		test('a context built before session registration reads the later opaque default chat', () => {
			const chat = URI.parse('ahp-chat:/new-default');
			const context = createAgentChatContext(manager, authenticationService, session, chat, sessionKey, undefined);
			const beforeRegistration = {
				defaultChat: manager.getDefaultChat(sessionKey),
				format: context.owner.getSubagentChatUriFormat(),
			};
			manager.createSession({ ...summary(), defaultChat: chat.toString() });

			assert.deepStrictEqual({
				beforeRegistration,
				owner: context.owner.get().toString(),
				format: context.owner.getSubagentChatUriFormat(),
			}, {
				beforeRegistration: { defaultChat: undefined, format: 'shaped' },
				owner: sessionKey,
				format: 'opaque',
			});
		});

		test('follows the chat registry: the issuing session before registration, the recorded owner, reassignments, and the last owner after removal', () => {
			const other = AgentSession.uri('copilot', 'seam-other');
			manager.createSession(summary());
			manager.createSession({ ...summary(), resource: other.toString(), defaultChat: 'ahp-chat:/seam-other-default' });
			const context = createAgentChatContext(manager, authenticationService, session, peerChat, creationTimeChatStorageResource(sessionKey, peerChat.toString(), buildDefaultChatUri(sessionKey)), undefined);
			const changes: string[] = [];
			disposables.add(context.owner.onDidChange(change => changes.push(`${change.previous.toString()} -> ${change.current.toString()}`)));

			const beforeRegistration = context.owner.get().toString();
			const beforeRegistrationFormat = context.owner.getSubagentChatUriFormat();
			manager.addChat(sessionKey, peerChat.toString(), creationTimeChatStorageResource(sessionKey, peerChat.toString(), buildDefaultChatUri(sessionKey)));
			const registered = context.owner.get().toString();
			const registeredFormat = context.owner.getSubagentChatUriFormat();
			manager.reassignChatOwner(peerChat.toString(), other.toString());
			const reassigned = context.owner.get().toString();
			const reassignedFormat = context.owner.getSubagentChatUriFormat();
			manager.reassignChatOwner(peerChat.toString(), other.toString());
			// Reassignment changes only the registry, so the chat is still listed by its original session.
			manager.removeChat(sessionKey, peerChat.toString());
			const afterRemoval = context.owner.get().toString();
			const afterRemovalFormat = context.owner.getSubagentChatUriFormat();

			assert.deepStrictEqual({ beforeRegistration, beforeRegistrationFormat, registered, registeredFormat, reassigned, reassignedFormat, afterRemoval, afterRemovalFormat, changes }, {
				beforeRegistration: sessionKey,
				beforeRegistrationFormat: 'shaped',
				registered: sessionKey,
				registeredFormat: 'shaped',
				reassigned: other.toString(),
				reassignedFormat: 'opaque',
				afterRemoval: other.toString(),
				afterRemovalFormat: 'opaque',
				changes: [`${sessionKey} -> ${other.toString()}`],
			});
		});

		test('reports a chat that registers again under another session as an owner change', () => {
			const other = AgentSession.uri('copilot', 'seam-other');
			manager.createSession(summary());
			manager.createSession({ ...summary(), resource: other.toString(), defaultChat: buildDefaultChatUri(other.toString()) });
			const context = createAgentChatContext(manager, authenticationService, session, peerChat, creationTimeChatStorageResource(sessionKey, peerChat.toString(), buildDefaultChatUri(sessionKey)), undefined);
			const changes: string[] = [];
			disposables.add(context.owner.onDidChange(change => changes.push(`${change.previous.toString()} -> ${change.current.toString()}`)));

			manager.addChat(sessionKey, peerChat.toString(), creationTimeChatStorageResource(sessionKey, peerChat.toString(), buildDefaultChatUri(sessionKey)));
			manager.removeChat(sessionKey, peerChat.toString());
			manager.addChat(other.toString(), peerChat.toString(), peerChat.toString());

			assert.deepStrictEqual({ owner: context.owner.get().toString(), changes }, { owner: other.toString(), changes: [`${sessionKey} -> ${other.toString()}`] });
		});

		test('reassigning a chat to an unknown session throws', () => {
			manager.createSession(summary());
			manager.addChat(sessionKey, peerChat.toString(), creationTimeChatStorageResource(sessionKey, peerChat.toString(), buildDefaultChatUri(sessionKey)));

			assert.throws(() => manager.reassignChatOwner(peerChat.toString(), AgentSession.uri('copilot', 'seam-unknown').toString()), /unknown session/);
		});

		test('a host context addresses a registered chat only under its current owner and with its recorded storage', () => {
			const other = AgentSession.uri('copilot', 'seam-other');
			manager.createSession(summary());
			manager.createSession({ ...summary(), resource: other.toString(), defaultChat: buildDefaultChatUri(other.toString()) });
			const storage = creationTimeChatStorageResource(sessionKey, peerChat.toString(), buildDefaultChatUri(sessionKey));
			const outcome = (build: () => unknown) => { try { build(); return 'built'; } catch { return 'rejected'; } };

			const beforeRegistration = outcome(() => createAgentChatContext(manager, authenticationService, other, peerChat, sessionKey, undefined));
			manager.addChat(sessionKey, peerChat.toString(), storage);
			const registered = outcome(() => createAgentChatContext(manager, authenticationService, session, peerChat, storage, undefined));
			const otherOwner = outcome(() => createAgentChatContext(manager, authenticationService, other, peerChat, storage, undefined));
			const otherStorage = outcome(() => createAgentChatContext(manager, authenticationService, session, peerChat, sessionKey, undefined));
			manager.reassignChatOwner(peerChat.toString(), other.toString());
			const reassigned = outcome(() => createAgentChatContext(manager, authenticationService, other, peerChat, storage, undefined));
			const previousOwner = outcome(() => createAgentChatContext(manager, authenticationService, session, peerChat, storage, undefined));

			assert.deepStrictEqual({ beforeRegistration, registered, otherOwner, otherStorage, reassigned, previousOwner }, {
				beforeRegistration: 'built',
				registered: 'built',
				otherOwner: 'rejected',
				otherStorage: 'rejected',
				reassigned: 'built',
				previousOwner: 'rejected',
			});
		});

		test('reassigning an unknown chat throws', () => {
			assert.throws(() => manager.reassignChatOwner(peerChat.toString(), sessionKey));
		});

		test('resolveSessionBackedStorage reports a session database only for a chat stored outside its own resource', () => {
			manager.createSession(summary());
			const base = { sessionSettings: undefined, launchWorkingDirectories: undefined, owner: fixedChatOwnerRef(session) };
			assert.deepStrictEqual({
				sessionBacked: resolveSessionBackedStorage({ ...base, resource: session }, defaultChat)?.toString(),
				ownStorage: resolveSessionBackedStorage({ ...base, resource: peerChat }, peerChat),
			}, {
				sessionBacked: sessionKey,
				ownStorage: undefined,
			});
		});
	});

	// ---- Context readers ----------------------------------------------------

	suite('context readers', () => {

		test('tolerate a legacy session-only context', () => {
			assert.deepStrictEqual({
				origin: resolveAgentChatOrigin(session),
				parent: resolveSubagentChatParent(session),
				// No snapshot at all — deliberately not an empty list, which
				// would assert "this session has no customizations".
				customizations: resolveAgentHostCustomizations(session),
				noContext: resolveAgentHostCustomizations(undefined),
			}, {
				origin: undefined,
				parent: undefined,
				customizations: undefined,
				noContext: undefined,
			});
		});

		test('resolveSubagentChatParent only reports tool spawn edges', () => {
			const fork: IAgentChatContext = {
				sessionSettings: undefined,
				launchWorkingDirectories: undefined,
				resource: peerChat,
				owner: fixedChatOwnerRef(session),
				origin: { kind: ChatOriginKind.Fork, chat: buildDefaultChatUri(sessionKey), turnId: 'turn-1' },
			};
			const tool: IAgentChatContext = {
				sessionSettings: undefined,
				launchWorkingDirectories: undefined,
				resource: subagentChat,
				owner: fixedChatOwnerRef(session),
				origin: { kind: ChatOriginKind.Tool, chat: buildDefaultChatUri(sessionKey), toolCallId: 'tool-9' },
			};
			assert.deepStrictEqual({
				fork: resolveSubagentChatParent(fork),
				tool: resolveSubagentChatParent(tool) && {
					chat: resolveSubagentChatParent(tool)!.chat.toString(),
					toolCallId: resolveSubagentChatParent(tool)!.toolCallId,
				},
			}, {
				fork: undefined,
				tool: { chat: buildDefaultChatUri(sessionKey), toolCallId: 'tool-9' },
			});
		});
	});

	// ---- Host-owned active-client fan-out -----------------------------------

	suite('getSessionChatsForFanOut', () => {

		test('distinguishes an absent session from an authoritative catalog', () => {
			const unknown = getSessionChatsForFanOut(manager, session);
			manager.createSession(summary());
			const created = getSessionChatsForFanOut(manager, session)?.map(c => c.toString());
			manager.addChat(sessionKey, peerChat.toString(), creationTimeChatStorageResource(sessionKey, peerChat.toString(), buildDefaultChatUri(sessionKey)));
			manager.addChat(sessionKey, subagentChat.toString(), creationTimeChatStorageResource(sessionKey, subagentChat.toString(), buildDefaultChatUri(sessionKey)));
			const withPeers = getSessionChatsForFanOut(manager, session)?.map(c => c.toString());

			assert.deepStrictEqual({ unknown, created, withPeers }, {
				// No host state means no authoritative membership to fan out —
				// the default chat is NOT fabricated on the session's behalf.
				unknown: undefined,
				created: [defaultChat.toString()],
				// Default chat first, then the catalog, de-duplicated.
				withPeers: [defaultChat.toString(), peerChat.toString(), subagentChat.toString()],
			});
		});
	});

	// ---- Exhaustive catalog origin ------------------------------------------

	suite('catalog origin', () => {

		test('keeps the default user origin when no explicit origin is supplied', () => {
			manager.createSession(summary());
			manager.addChat(sessionKey, peerChat.toString(), creationTimeChatStorageResource(sessionKey, peerChat.toString(), buildDefaultChatUri(sessionKey)));
			manager.registerRestoredChatSummary(sessionKey, URI.parse(buildChatUri(sessionKey, 'restored')).toString(), { storageResource: creationTimeChatStorageResource(sessionKey, URI.parse(buildChatUri(sessionKey, 'restored')).toString(), buildDefaultChatUri(sessionKey)) });

			assert.deepStrictEqual({
				peer: manager.getChatOrigin(peerChat.toString()),
				restored: manager.getChatOrigin(buildChatUri(sessionKey, 'restored')),
				defaultChat: manager.getChatOrigin(defaultChat.toString()),
			}, {
				peer: { kind: ChatOriginKind.User },
				restored: { kind: ChatOriginKind.User },
				defaultChat: { kind: ChatOriginKind.User },
			});
		});

		test('records an explicit origin verbatim', () => {
			manager.createSession(summary());
			const fork: ChatOrigin = { kind: ChatOriginKind.Fork, chat: buildDefaultChatUri(sessionKey), turnId: 'turn-7' };
			manager.addChat(sessionKey, peerChat.toString(), creationTimeChatStorageResource(sessionKey, peerChat.toString(), buildDefaultChatUri(sessionKey)), { origin: fork });

			assert.deepStrictEqual(manager.getChatOrigin(peerChat.toString()), fork);
		});
	});

	// ---- Narrow prompt-cache metadata seam ----------------------------------

	suite('AgentHostPromptCache', () => {

		test('reads, writes, and merges the prompt-cache slot without clobbering sibling metadata', () => {
			manager.createSession(summary());
			manager.setSessionMeta(sessionKey, { 'vscode.other': 'keep' });
			const promptCache = new AgentHostPromptCache(manager);

			const initial = promptCache.read(session);
			const written = promptCache.write(session, { modelId: 'model-a', cacheExpiresAt: '2030-01-01T00:00:00.000Z' });
			const readBack = promptCache.read(session);
			// A repeat write of the same value is a no-op that reports the persisted state.
			const repeat = promptCache.write(session, { modelId: 'model-a', cacheExpiresAt: '2030-01-01T00:00:00.000Z' });
			const cleared = promptCache.write(session, undefined);

			assert.deepStrictEqual({
				initial,
				written,
				readBack,
				repeat,
				cleared,
				afterClear: promptCache.read(session),
				siblingMeta: manager.getSessionSummary(sessionKey)?._meta?.['vscode.other'],
			}, {
				initial: undefined,
				written: { modelId: 'model-a', cacheExpiresAt: '2030-01-01T00:00:00.000Z' },
				readBack: { modelId: 'model-a', cacheExpiresAt: '2030-01-01T00:00:00.000Z' },
				repeat: { modelId: 'model-a', cacheExpiresAt: '2030-01-01T00:00:00.000Z' },
				cleared: undefined,
				afterClear: undefined,
				siblingMeta: 'keep',
			});
		});

		test('does not persist for a session the host does not know', () => {
			const promptCache = new AgentHostPromptCache(manager);
			const unknown = AgentSession.uri('copilot', 'nope');
			assert.deepStrictEqual({
				read: promptCache.read(unknown),
				written: promptCache.write(unknown, { modelId: 'model-a', cacheExpiresAt: 'later' }),
				persisted: promptCache.read(unknown),
			}, {
				read: undefined,
				written: { modelId: 'model-a', cacheExpiresAt: 'later' },
				persisted: undefined,
			});
		});
	});

	// ---- Narrow session-title signal ----------------------------------------

	suite('AgentHostSessionTitleSignal', () => {

		test('centralizes the provider filter and conversation-id derivation', () => {
			const signal = disposables.add(new AgentHostSessionTitleSignal(manager));
			const fired: { provider: string; session: string; conversationId: string; title: string }[] = [];
			disposables.add(signal.onDidChangeSessionTitle(e => fired.push({
				provider: e.provider,
				session: e.session.toString(),
				conversationId: e.conversationId,
				title: e.title,
			})));

			manager.createSession(summary());
			manager.dispatchServerAction(sessionKey, { type: ActionType.SessionTitleChanged, title: 'Renamed' });

			assert.deepStrictEqual(fired, [{
				provider: 'copilot',
				session: sessionKey,
				conversationId: 'seam-session',
				title: 'Renamed',
			}]);
		});
	});

	test('a created session is usable by every seam', () => {
		const state = manager.createSession(summary());
		assert.strictEqual(state.lifecycle, SessionLifecycle.Creating);
	});
});

/**
 * Guards of the provider seam split (Block 3c), read from the built production
 * sources of the agent host so a later change cannot quietly bring the old
 * shape back.
 */
suite('AgentHost seam split guards', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function productionSources(): { readonly path: string; readonly text: string }[] {
		const root = FileAccess.asFileUri('vs/platform/agentHost').fsPath;
		const sources: { path: string; text: string }[] = [];
		const visit = (directory: string, relative: string) => {
			for (const entry of readdirSync(directory, { withFileTypes: true })) {
				const path = relative ? `${relative}/${entry.name}` : entry.name;
				if (entry.isDirectory()) {
					if (entry.name !== 'test') {
						visit(join(directory, entry.name), path);
					}
				} else if (entry.name.endsWith('.js')) {
					sources.push({ path, text: readFileSync(join(directory, entry.name), 'utf8') });
				}
			}
		};
		visit(root, '');
		return sources;
	}

	test('the chat context names no configuration scope: only the chat\'s storage and its live owner', () => {
		const noConfigurationResource: 'configurationResource' extends keyof IAgentChatContext ? false : true = true;
		const sources = productionSources();
		const scanned = new Set(sources.map(source => source.path));
		assert.deepStrictEqual({
			noConfigurationResource,
			// The scan reads the built production sources, so an empty or misdirected scan fails here instead of passing vacuously.
			scannedProviders: ['common/agent.js', 'node/agentService.js', 'node/agentChatContext.js', 'node/claude/claudeAgent.js', 'node/codex/codexAgent.js', 'node/copilot/copilotAgent.js'].filter(path => scanned.has(path)).length,
			productionUses: sources.filter(source => source.text.includes('configurationResource')).map(source => source.path),
		}, { noConfigurationResource: true, scannedProviders: 6, productionUses: [] });
	});

	test('production builds a fixed owner only for the legacy session-only form and runtimes no host context records', () => {
		assert.deepStrictEqual(productionSources().filter(source => source.text.includes('fixedChatOwnerRef(')).map(source => source.path).sort(), [
			// The definition and the legacy bare-session-URI context.
			'common/agent.js',
			// A runtime created before any chat binds to it.
			'node/codex/codexAgent.js',
			// A legacy resume of a chat no host context recorded.
			'node/copilot/copilotAgent.js',
		]);
	});

	test('no production field stores a chat\'s owner, directly or through a local, except a launch snapshot', () => {
		// An owner read (`owner.get()`, `_owner.get()`, `ownerRef.get()`, optionally stringified), across lines.
		const ownerRead = String.raw`(?:[\w$]+\.)*_?owner(?:Ref)?\.get\(\)(?:\.toString\(\))?`;
		const storedInField = (value: string) => new RegExp(String.raw`[\w$\]\)]\.(?<field>[A-Za-z_$][\w$]*)\s*=\s*` + value + String.raw`\s*[;,)\n]`, 'g');
		const stored: string[] = [];
		for (const source of productionSources()) {
			for (const match of source.text.matchAll(storedInField(ownerRead))) {
				stored.push(`${source.path} ${match.groups!.field}`);
			}
			// `const o = owner.get(); this.x = o;`: follow the local until it is declared again.
			for (const declaration of source.text.matchAll(new RegExp(String.raw`\b(?:const|let|var)\s+(?<local>[A-Za-z_$][\w$]*)\s*=\s*` + ownerRead + String.raw`\s*[;,\n]`, 'g'))) {
				const local = declaration.groups!.local.replace(/\$/g, '\\$');
				const scope = source.text.slice(declaration.index + declaration[0].length, declaration.index + declaration[0].length + 4000);
				const redeclared = scope.search(new RegExp(String.raw`\b(?:const|let|var|function)\s+` + local + String.raw`\b`));
				for (const match of (redeclared < 0 ? scope : scope.slice(0, redeclared)).matchAll(storedInField(local))) {
					stored.push(`${source.path} ${match.groups!.field}`);
				}
			}
		}
		// The owner a runtime was launched or materialized with (relaunch at the next turn when the chat's owner
		// differs), and the owner Codex last published MCP state under (re-keyed on the next MCP event).
		const launchSnapshots = new Set(['launchOwner', 'threadOwner', '_materializedOwner', 'mcpPublisherOwner']);
		assert.deepStrictEqual({
			// The launch snapshots are found, so a scan that stops matching fails here instead of passing vacuously.
			snapshotsFound: stored.some(entry => entry.endsWith(' launchOwner')) && stored.some(entry => entry.endsWith(' _materializedOwner')),
			otherFields: stored.filter(entry => !launchSnapshots.has(entry.split(' ')[1])),
		}, { snapshotsFound: true, otherFields: [] });
	});
});
