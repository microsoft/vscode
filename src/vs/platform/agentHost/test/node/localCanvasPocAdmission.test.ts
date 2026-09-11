/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, realpath, rm } from 'fs/promises';
import { join } from '../../../../base/common/path.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IProductService } from '../../../product/common/productService.js';
import type { IAgentHostChatContributionContext, IIncomingRequest } from '../../common/agentHostChatContributionsService.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import { AgentHostLaunchKind, AgentHostLaunchKindEnvVar, createUnknownAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { buildChatUri, buildDefaultChatUri, MessageKind, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { LocalCanvasPocContribution } from '../../node/chatContributions/localCanvasPoc/localCanvasPocContribution.js';
import { LocalCommandContribution } from '../../node/chatContributions/localCommand/localCommandContribution.js';
import { LocalCanvasPoc, LocalCanvasPocRootEnvVar } from '../../node/copilot/localCanvasPoc.js';
import { createNoopGitService, createSessionDataService } from '../common/sessionTestHelpers.js';
import { createTestAgentService, registerTestAgentProvider } from './agentServiceTestUtils.js';
import { MockAgent } from './mockAgent.js';

class CanvasAdmissionAgent extends MockAgent {
	readonly materialized: URI[] = [];
	override async materializeChat(chat: URI): Promise<void> {
		this.materialized.push(chat);
	}
}

class TestLocalCanvasPocContribution extends LocalCanvasPocContribution {
	protected override readonly _poc: LocalCanvasPoc | undefined;

	constructor(context: IAgentHostChatContributionContext, state: AgentHostStateManager, poc: LocalCanvasPoc) {
		super(context, state);
		this._poc = poc;
	}
}

suite('Local canvas PoC launch containment', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let store: DisposableStore;
	let root: string;
	let poc: LocalCanvasPoc;
	const context = upcastPartial<IAgentHostChatContributionContext>({ contributionId: 'localCanvasPoc' });

	setup(async () => {
		store = disposables.add(new DisposableStore());
		root = join(process.cwd(), '.build', `canvas-admission-${generateUuid()}`);
		for (const directory of ['home/.config', 'copilot-home/extensions', 'workspace']) {
			await mkdir(join(root, directory), { recursive: true });
		}
		root = await realpath(root);
		const value = LocalCanvasPoc.read(false, { [LocalCanvasPocRootEnvVar]: root, [AgentHostLaunchKindEnvVar]: AgentHostLaunchKind.VSCodeMainProcess });
		assert.ok(value);
		poc = value;
	});

	teardown(async () => {
		store.dispose();
		await rm(root, { recursive: true, force: true });
	});

	function request(session: string, source: IIncomingRequest['source'], text = 'cached automation'): IIncomingRequest {
		const chat = buildChatUri(session, 'peer');
		return {
			session, chat, turnChannel: chat, turnId: 'turn', source, clientId: undefined,
			message: { text, origin: { kind: MessageKind.User } },
			clientContext: createUnknownAgentHostClientTelemetryContext(AgentHostClientType.Unknown),
		};
	}

	function stateFor(workingDirectories: readonly URI[]) {
		const state = store.add(new AgentHostStateManager(new NullLogService()));
		const session = 'copilot:/canvas-admission';
		state.createSession({
			resource: session, provider: 'copilot', title: 'Canvas', status: SessionStatus.Idle, createdAt: '', modifiedAt: '',
			project: { uri: poc.workspace.toString(), displayName: 'Fixture' },
			workingDirectories: workingDirectories.map(directory => directory.toString()),
		});
		return { state, session };
	}

	function serviceFor(scope?: LocalCanvasPoc) {
		const log = new NullLogService();
		const files = store.add(new FileService(log));
		const service = store.add(createTestAgentService(
			log, files, createSessionDataService(), upcastPartial<IProductService>({ _serviceBrand: undefined }), createNoopGitService(),
			undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
			scope,
		));
		const agent = new CanvasAdmissionAgent('copilot');
		registerTestAgentProvider(service, agent);
		return { service, agent };
	}

	test('rejects direct, queued and local-command turns before local command interception', () => {
		const { state, session } = stateFor([URI.file(join(root, 'cached-workspace'))]);
		const contribution = store.add(new TestLocalCanvasPocContribution(context, state, poc));
		const localCommand = store.add(new LocalCommandContribution(context, upcastPartial({}), upcastPartial({})));
		const dispositions = [
			contribution.onIncomingRequest(request(session, 'direct')),
			contribution.onIncomingRequest(request(session, 'queued')),
			contribution.onIncomingRequest(request(session, 'direct', '!cached-command')),
		];
		assert.deepStrictEqual({
			beforeLocalCommands: contribution.order < localCommand.order,
			dispositions: dispositions.map(value => value?.kind === 'reject' ? [value.kind, value.error.errorType, value.stage] : value),
		}, { beforeLocalCommands: true, dispositions: Array(3).fill(['reject', 'localCanvasPocWorkspace', 'validation']) });
		assert.ok(dispositions.every(value => value?.kind === 'reject'
			&& value.error.message.includes(poc.workspace.fsPath)
			&& value.error.message.includes(join(root, 'cached-workspace'))));
	});

	test('admits demo peers, rejects missing/multi-root state and is inert without an opt-in', () => {
		const valid = stateFor([poc.workspace]);
		const multiple = stateFor([poc.workspace, URI.file(root)]);
		const enabled = store.add(new TestLocalCanvasPocContribution(context, valid.state, poc));
		const multi = store.add(new TestLocalCanvasPocContribution(context, multiple.state, poc));
		const normal = store.add(new LocalCanvasPocContribution(context, multiple.state));
		assert.deepStrictEqual([
			enabled.onIncomingRequest(request(valid.session, 'direct')),
			enabled.onIncomingRequest(request('copilot:/missing', 'direct'))?.kind,
			multi.onIncomingRequest(request(multiple.session, 'queued'))?.kind,
			normal.onIncomingRequest(request(multiple.session, 'direct')),
		], [undefined, 'reject', 'reject', undefined]);
	});

	test('rejects cached automation creation before provider work and allows only the demo folder', async () => {
		const { service, agent } = serviceFor(poc);
		await assert.rejects(service.createSession({ provider: agent.id, workingDirectories: [URI.file(join(root, 'cached-workspace'))] }), /dedicated workspace/);
		await assert.rejects(service.createSession({ provider: agent.id }), /dedicated workspace/);
		await assert.rejects(service.createSession({ provider: agent.id, workingDirectories: [poc.workspace, URI.file(root)] }), /dedicated workspace/);
		await assert.rejects(service.createSession({ provider: agent.id, workingDirectories: [poc.workspace], config: { [SessionConfigKey.Isolation]: 'worktree' } }), /folder isolation/);
		assert.deepStrictEqual({ config: agent.lastCreateSessionConfig }, { config: undefined });
		await service.createSession({ provider: agent.id, workingDirectories: [poc.workspace], config: { [SessionConfigKey.Isolation]: 'folder' } });
		assert.deepStrictEqual(agent.lastCreateSessionConfig?.workingDirectories, [poc.workspace]);
	});

	test('refuses cached non-demo restore before the provider materializes a chat', async () => {
		const { service, agent } = serviceFor(poc);
		const session = URI.parse('copilot:/cached-session');
		const chat = URI.parse(buildDefaultChatUri(session));
		await agent.chats.createChat(chat, session, {});
		agent.sessionMetadataOverrides = { workingDirectories: [URI.file(join(root, 'cached-workspace'))] };
		await assert.rejects(service.restoreSession(session), /dedicated workspace/);
		assert.deepStrictEqual(agent.materialized, []);
	});

	test('normal launches still create sessions outside the demo workspace', async () => {
		const { service, agent } = serviceFor();
		const directory = URI.file(join(root, 'normal-workspace'));
		await service.createSession({ provider: agent.id, workingDirectories: [directory] });
		assert.deepStrictEqual(agent.lastCreateSessionConfig?.workingDirectories, [directory]);
	});
});
