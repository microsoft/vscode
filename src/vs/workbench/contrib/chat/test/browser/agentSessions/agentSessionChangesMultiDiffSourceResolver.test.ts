/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { IReference } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ChangesetStatus, type ChangesetState, type ComponentToState, SessionLifecycle, SessionStatus, type SessionState, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { AgentSessionChangesMultiDiffSourceResolver } from '../../../browser/agentSessions/agentSessionChangesMultiDiffSourceResolver.js';
import { createAgentSessionChangesEditorInput, IAgentSession, IAgentSessionsModel } from '../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../browser/agentSessions/agentSessionsService.js';
import { IMultiDiffSourceResolverService } from '../../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';

function createSubscription<T>(value: T): IAgentSubscription<T> {
	return {
		value,
		verifiedValue: value,
		onDidChange: Event.None,
		onWillApplyAction: Event.None,
		onDidApplyAction: Event.None,
	};
}

function createAgentSessionsService(session: IAgentSession): IAgentSessionsService {
	const model = new class extends mock<IAgentSessionsModel>() {
		override observeSession() {
			return constObservable(session);
		}
	};
	return new class extends mock<IAgentSessionsService>() {
		declare readonly _serviceBrand: undefined;
		override readonly model = model;
		override readonly onDidChangeSessionArchivedState = Event.None;
		override getSession() { return session; }
	};
}

function createResolver(
	session: IAgentSession,
	connectionsService: IAgentHostConnectionsService,
): AgentSessionChangesMultiDiffSourceResolver {
	const sourceResolverService = new class extends mock<IMultiDiffSourceResolverService>() {
		declare readonly _serviceBrand: undefined;
		override registerResolver() { return { dispose() { } }; }
	};
	return new AgentSessionChangesMultiDiffSourceResolver(
		createAgentSessionsService(session),
		connectionsService,
		sourceResolverService,
	);
}

function createSession(
	providerType: string,
	resource: URI,
	changes: IAgentSession['changes'],
): IAgentSession {
	return new class extends mock<IAgentSession>() {
		override readonly providerType = providerType;
		override readonly resource = resource;
		override readonly label = 'Fix issue';
		override readonly changes = changes;
	};
}

suite('AgentSessionChangesMultiDiffSourceResolver', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves explicit file changes', async () => {
		const sessionResource = URI.parse('test-session:/1');
		const original = URI.file('/workspace/original.ts');
		const modified = URI.file('/workspace/modified.ts');
		const created = URI.file('/workspace/created.ts');
		const session = createSession('test-session', sessionResource, [
			{ uri: modified, originalUri: original, modifiedUri: modified, insertions: 4, deletions: 2 },
			{ uri: created, modifiedUri: created, insertions: 1, deletions: 0 },
		]);
		const connectionsService = new class extends mock<IAgentHostConnectionsService>() {
			declare readonly _serviceBrand: undefined;
			override readonly onDidChangeConnections = Event.None;
			override readonly connections = [];
			override resolveSessionResource() { return undefined; }
		};
		const resolver = disposables.add(createResolver(session, connectionsService));
		const input = createAgentSessionChangesEditorInput(session);
		assert.ok(input?.multiDiffSource);

		const source = await resolver.resolveDiffSource(input.multiDiffSource);
		assert.deepStrictEqual(source.resources.value.map(item => ({
			original: item.originalUri,
			modified: item.modifiedUri,
			goToFile: item.goToFileUri,
		})), [{
			original,
			modified,
			goToFile: modified,
		}, {
			original: undefined,
			modified: created,
			goToFile: created,
		}]);
	});

	test('resolves Branch Changes and maps remote resources', async () => {
		const sessionResource = URI.parse('remote-test-copilot:/1');
		const backendSession = URI.parse('copilot:/1');
		const sessionChangeset = URI.parse('copilot:/1/changeset/session');
		const branchChangeset = URI.parse('copilot:/1/changeset/branch');
		const sessionState: SessionState = {
			provider: 'copilot',
			title: 'Fix issue',
			status: SessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			changesets: [
				{ label: 'Session Changes', changeKind: 'session', uriTemplate: sessionChangeset.toString() },
				{ label: 'Branch Changes', changeKind: 'branch', uriTemplate: branchChangeset.toString() },
			],
		};
		const changesetState: ChangesetState = {
			status: ChangesetStatus.Ready,
			files: [{
				id: 'file:///workspace/file.ts',
				edit: {
					before: {
						uri: 'file:///workspace/file.ts',
						content: { uri: 'agenthost-content:/before/file.ts' },
					},
					after: {
						uri: 'file:///workspace/file.ts',
						content: { uri: 'file:///workspace/file.ts' },
					},
				},
			}],
		};
		const requested: URI[] = [];
		const connection = {
			getSubscription: <T extends StateComponents>(kind: T, resource: URI, _owner: string): IReference<IAgentSubscription<ComponentToState[T]>> => {
				requested.push(resource);
				const subscription = kind === StateComponents.Session
					? createSubscription(sessionState)
					: createSubscription(changesetState);
				return {
					object: subscription as unknown as IAgentSubscription<ComponentToState[T]>,
					dispose() { },
				};
			},
		} as IAgentConnection;
		const connectionsService = new class extends mock<IAgentHostConnectionsService>() {
			declare readonly _serviceBrand: undefined;
			override readonly onDidChangeConnections = Event.None;
			override readonly connections = [{
				authority: 'test',
				address: 'test',
				name: 'Test',
				isAmbient: false,
				connection,
			}];
			override resolveSessionResource() { return { connection, backendSession }; }
		};
		const session = createSession('remote-test-copilot', sessionResource, { files: 1, insertions: 4, deletions: 2 });
		const resolver = disposables.add(createResolver(session, connectionsService));
		const input = createAgentSessionChangesEditorInput(session);
		assert.ok(input?.multiDiffSource);

		const source = await resolver.resolveDiffSource(input.multiDiffSource);
		const [item] = source.resources.value;
		assert.deepStrictEqual({
			requested: requested.map(resource => resource.toString()),
			original: item.originalUri?.toString(),
			modified: item.modifiedUri?.toString(),
			goToFile: item.goToFileUri?.toString(),
		}, {
			requested: [backendSession.toString(), branchChangeset.toString()],
			original: toAgentHostUri(URI.parse('agenthost-content:/before/file.ts'), 'test').toString(),
			modified: toAgentHostUri(URI.file('/workspace/file.ts'), 'test').toString(),
			goToFile: toAgentHostUri(URI.file('/workspace/file.ts'), 'test').toString(),
		});
	});
});
