/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { createTestCodeEditor } from '../../../../../../editor/test/browser/testCodeEditor.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import type { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { StateComponents, type ComponentToState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { TerminalClaimKind, TerminalLifecycleStatus, type TerminalState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ChatTerminalOutputResource, ChatTerminalOutputTextModelService } from '../../../browser/agentSessions/agentHost/chatTerminalOutputTextModelContentProvider.js';

class TestTerminalSubscription extends Disposable implements IAgentSubscription<TerminalState> {
	private readonly _onDidChange = this._register(new Emitter<TerminalState>());
	private readonly _onDidError = this._register(new Emitter<Error>());
	readonly onDidChange = this._onDidChange.event;
	readonly onDidError = this._onDidError.event;
	readonly onWillApplyAction = Event.None;
	readonly onDidApplyAction = Event.None;

	constructor(private _value: TerminalState | Error | undefined) {
		super();
	}

	get value(): TerminalState | Error | undefined {
		return this._value;
	}

	get verifiedValue(): TerminalState | undefined {
		return this._value instanceof Error ? undefined : this._value;
	}

	setState(state: TerminalState): void {
		this._value = state;
		this._onDidChange.fire(state);
	}

	setError(error: Error): void {
		this._value = error;
		this._onDidError.fire(error);
	}
}

suite('ChatTerminalOutputTextModelService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sessionResource = URI.parse('vscode-chat-session://test/session');
	const terminalResource = URI.parse('agenthost-terminal://shell/session/tool');
	const modelResource = ChatTerminalOutputResource.create(sessionResource, 'tool', terminalResource, 'terminal-output.txt');
	const claim = {
		kind: TerminalClaimKind.Session,
		session: 'copilot:/session',
		chat: 'ahp-chat://default/session',
		toolCallId: 'tool',
	} as const;

	function createService(initialState: TerminalState | Error | undefined) {
		const subscription = store.add(new TestTerminalSubscription(initialState));
		let acquisitions = 0;
		let releases = 0;
		const connection = new class extends mock<IAgentConnection>() {
			override getSubscription<T extends StateComponents>(_kind: T, resource: URI): { readonly object: IAgentSubscription<ComponentToState[T]>; dispose(): void } {
				assert.strictEqual(resource.toString(), terminalResource.toString());
				acquisitions++;
				return {
					object: subscription as unknown as IAgentSubscription<ComponentToState[T]>,
					dispose: () => releases++,
				};
			}
		};
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override getSession(resource: URI) {
				return resource.toString() === sessionResource.toString() ? {} as ReturnType<IChatService['getSession']> : undefined;
			}
		});
		instantiationService.stub(IAgentHostConnectionsService, new class extends mock<IAgentHostConnectionsService>() {
			override resolveSessionResource(resource: URI) {
				return resource.toString() === sessionResource.toString()
					? { connectionAuthority: 'local', backendSession: sessionResource, connection }
					: undefined;
			}
		});
		const service = store.add(instantiationService.createInstance(ChatTerminalOutputTextModelService));
		return {
			service,
			subscription,
			get acquisitions() { return acquisitions; },
			get releases() { return releases; },
		};
	}

	test('resource identities round-trip their session and terminal', () => {
		const unsafe = ChatTerminalOutputResource.create(sessionResource, 'tool/with?#reserved', terminalResource, `../../My unsafe output ${'x'.repeat(100)}.txt`);
		const name = unsafe.path.split('/').at(-1);
		assert.deepStrictEqual({
			parsed: (() => {
				const parsed = ChatTerminalOutputResource.parse(modelResource);
				return parsed && { sessionResource: parsed.sessionResource.toString(), terminal: parsed.terminal.toString() };
			})(),
			invalid: ChatTerminalOutputResource.parse(modelResource.with({ scheme: 'invalid' })),
			name,
			nameLength: name?.length,
		}, {
			parsed: { sessionResource: sessionResource.toString(), terminal: terminalResource.toString() },
			invalid: undefined,
			name: `My-unsafe-output-${'x'.repeat(47)}`,
			nameLength: 64,
		});
	});

	test('updates the same model from terminal state while preserving selection', async () => {
		const fixture = createService({
			title: 'Bash',
			content: [{ type: 'unclassified', value: 'line one\n' }],
			lifecycle: { status: TerminalLifecycleStatus.Running },
			claim,
			isPty: false,
		});
		assert.strictEqual(await fixture.service.canResolve(modelResource), true);
		const model = await fixture.service.provideTextContent(modelResource);
		assert.ok(model);
		store.add(model);
		const editor = store.add(createTestCodeEditor(model));
		editor.setPosition({ lineNumber: 1, column: 3 });

		fixture.subscription.setState({
			title: 'Bash',
			content: [{ type: 'unclassified', value: 'line one\nline two\n' }],
			lifecycle: { status: TerminalLifecycleStatus.Exited, exitCode: 0 },
			claim,
			isPty: false,
		});
		const position = editor.getPosition();

		assert.deepStrictEqual({
			value: model.getValue(),
			position: position && { lineNumber: position.lineNumber, column: position.column },
			acquisitions: fixture.acquisitions,
			releasesBeforeDispose: fixture.releases,
		}, {
			value: 'line one\nline two\n',
			position: { lineNumber: 1, column: 3 },
			acquisitions: 2,
			releasesBeforeDispose: 1,
		});
		model.dispose();
		assert.strictEqual(fixture.releases, 2);
	});

	test('reports unavailable subscriptions without creating a model', async () => {
		const fixture = createService(new Error('Terminal output unavailable'));

		assert.deepStrictEqual({
			canResolve: await fixture.service.canResolve(modelResource),
			model: await fixture.service.provideTextContent(modelResource).then(
				value => value,
				error => error instanceof Error ? error.message : String(error),
			),
			acquisitions: fixture.acquisitions,
			releases: fixture.releases,
		}, {
			canResolve: false,
			model: 'Terminal output unavailable',
			acquisitions: 2,
			releases: 2,
		});
	});

	test('shows late errors in an empty model without replacing existing output', async () => {
		const emptyFixture = createService({
			title: 'Bash',
			content: [],
			lifecycle: { status: TerminalLifecycleStatus.Running },
			claim,
			isPty: false,
		});
		const emptyModel = await emptyFixture.service.provideTextContent(modelResource);
		assert.ok(emptyModel);
		store.add(emptyModel);
		emptyFixture.subscription.setError(new Error('connection lost'));

		const populatedFixture = createService({
			title: 'Bash',
			content: [{ type: 'unclassified', value: 'retained output' }],
			lifecycle: { status: TerminalLifecycleStatus.Running },
			claim,
			isPty: false,
		});
		const populatedModel = await populatedFixture.service.provideTextContent(modelResource);
		assert.ok(populatedModel);
		store.add(populatedModel);
		populatedFixture.subscription.setError(new Error('connection lost'));

		assert.deepStrictEqual({
			empty: emptyModel.getValue(),
			populated: populatedModel.getValue(),
		}, {
			empty: 'Terminal output is unavailable: connection lost',
			populated: 'retained output',
		});
	});
});
