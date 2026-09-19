/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { stub } from 'sinon';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { FEEDBACK_ANNOTATION_META_KEY, readFeedbackAnnotationMeta } from '../../../../../../platform/agentHost/common/meta/agentFeedbackAnnotations.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { Annotation, AnnotationsState, ComponentToState, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';
import { IUntypedEditorInput } from '../../../../../common/editor.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { AgentHostFeedbackReviewCommands } from '../../../browser/agentSessions/agentHost/agentHostFeedbackReviewCommands.js';
import { AgentFeedbackReviewCommandId, IChatAgentFeedbackReviewComment } from '../../../common/chatService/chatService.js';

suite('AgentHostFeedbackReviewCommands', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.parse('agent-host-codex:/session#peer-chat');
	const backendSession = URI.parse('codex:/session');

	function annotation(id: string, kind = 'codeReview', state = 'created', pendingAgentReveal = false): Annotation {
		return {
			id,
			origin: { session: backendSession.toString() },
			resource: 'file:///workspace/example.ts',
			range: { start: { line: 2, character: 4 }, end: { line: 3, character: 5 } },
			resolved: false,
			entries: [{ id: id + ':0', text: 'Review ' + id }, { id: id + ':1', text: { markdown: 'Reply' } }],
			_meta: { unrelated: 'preserve', [FEEDBACK_ANNOTATION_META_KEY]: { kind, state, pendingAgentReveal, sessionResource: backendSession.toString() } },
		};
	}

	function setup(initial: AnnotationsState | Error | undefined) {
		let value = initial;
		let references = 0;
		let connected = true;
		const changes = store.add(new Emitter<AnnotationsState>());
		const errors = store.add(new Emitter<Error>());
		const requests: { kind: StateComponents; channel: string }[] = [];
		const writes: { channel: string; action: Parameters<IAgentConnection['dispatch']>[1] }[] = [];
		const opened: (EditorInput | IUntypedEditorInput)[] = [];
		const resolved: string[] = [];
		const subscription: IAgentSubscription<AnnotationsState> = {
			get value() { return value; },
			get verifiedValue() { return value instanceof Error ? undefined : value; },
			onDidChange: changes.event,
			onDidError: errors.event,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
		const connection = new class extends mock<IAgentConnection>() {
			override readonly resourceUris = {
				fromAgentHost: (uri: URI) => uri.with({ scheme: 'vscode-remote', authority: 'wsl+Ubuntu' }),
				toAgentHost: (uri: URI) => uri.with({ scheme: 'file', authority: '' }),
			};
			override getSubscription<T extends StateComponents>(kind: T, channel: URI) {
				assert.strictEqual(kind, StateComponents.Annotations);
				requests.push({ kind, channel: channel.toString() });
				references++;
				return { object: subscription as IAgentSubscription<ComponentToState[T]>, dispose: () => { references--; } };
			}
			override dispatch(channel: string, action: Parameters<IAgentConnection['dispatch']>[1]): void {
				writes.push({ channel, action });
			}
		};
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IAgentHostConnectionsService, {
			resolveSessionResource: (uri: URI) => {
				resolved.push(uri.toString());
				return connected ? { connection, backendSession, connectionAuthority: 'local' } : undefined;
			},
		});
		instantiation.stub(IEditorService, { openEditor: async input => { opened.push(input); return undefined; } });
		const contribution = store.add(instantiation.createInstance(AgentHostFeedbackReviewCommands));
		return {
			writes, requests, opened, resolved, contribution,
			get references() { return references; },
			disconnect: () => { connected = false; },
			setState: (next: AnnotationsState) => { value = next; changes.fire(next); },
			fail: (error: Error) => { value = error; errors.fire(error); },
			run: <T>(command: AgentFeedbackReviewCommandId, ...args: (string | readonly string[])[]): Promise<T> => instantiation.invokeFunction(accessor => CommandsRegistry.getCommand(command)!.handler(accessor, resource, ...args)) as unknown as Promise<T>,
		};
	}

	test('registers commands without resolving an agent host or editor service', () => {
		const instantiation = store.add(new TestInstantiationService());
		store.add(instantiation.createInstance(AgentHostFeedbackReviewCommands));
		assert.ok(CommandsRegistry.getCommand(AgentFeedbackReviewCommandId.GetComments));
	});

	test('editor commands load only reviewable comments from the owning WSL session', async () => {
		const resolved = { ...annotation('resolved'), resolved: true };
		const fixture = setup({ annotations: [annotation('new'), annotation('pr', 'prReview'), annotation('pending', 'prReview', 'accepted', true), annotation('user', 'user'), annotation('accepted', 'codeReview', 'accepted'), resolved] });
		const comments = await fixture.run<IChatAgentFeedbackReviewComment[]>(AgentFeedbackReviewCommandId.GetComments);
		assert.deepStrictEqual({
			ids: comments.map(comment => comment.id),
			text: comments[0].text,
			file: URI.revive(comments[0].fileUri).toString(),
			resolved: fixture.resolved,
			channels: fixture.requests.map(request => request.channel),
			references: fixture.references,
		}, {
			ids: ['new', 'pr', 'pending'], text: 'Review new\n\nReply',
			file: URI.parse('vscode-remote://wsl+Ubuntu/workspace/example.ts').toString(),
			resolved: [resource.toString()], channels: ['codex:/session/annotations'], references: 0,
		});
	});

	test('waits for hydration instead of returning a transient empty list', async () => {
		const fixture = setup(undefined);
		let settled = false;
		const pending = fixture.run<IChatAgentFeedbackReviewComment[]>(AgentFeedbackReviewCommandId.GetComments).then(value => { settled = true; return value; });
		await Promise.resolve();
		assert.strictEqual(settled, false);
		fixture.setState({ annotations: [annotation('loaded')] });
		assert.deepStrictEqual((await pending).map(comment => comment.id), ['loaded']);
		assert.strictEqual(fixture.references, 0);
	});

	test('returns an authoritative empty list', async () => {
		const fixture = setup({ annotations: [] });
		assert.deepStrictEqual(await fixture.run(AgentFeedbackReviewCommandId.GetComments), []);
	});

	test('propagates initial and asynchronous subscription failures and releases references', async () => {
		const fixture = setup(new Error('load failed'));
		await assert.rejects(fixture.run(AgentFeedbackReviewCommandId.GetComments), /load failed/);
		fixture.setState({ annotations: [] });
		fixture.disconnect();
		await assert.rejects(fixture.run(AgentFeedbackReviewCommandId.GetComments), /not connected/);
		assert.strictEqual(fixture.references, 0);
	});

	test('rejects a later hydration failure', async () => {
		const fixture = setup(undefined);
		const pending = fixture.run(AgentFeedbackReviewCommandId.GetComments);
		fixture.fail(new Error('remote failed'));
		await assert.rejects(pending, /remote failed/);
		assert.strictEqual(fixture.references, 0);
	});

	test('completed commands release their parent cancellation listeners before contribution disposal', async () => {
		const fixture = setup({ annotations: [] });
		await fixture.run(AgentFeedbackReviewCommandId.GetComments);
		// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Inspect the lifetime token without adding a public test-only API.
		const token = fixture.contribution['_commands'].value!['_cancellation'].token;
		const subscribe = token.onCancellationRequested;
		let listeners = 0;
		const event: typeof subscribe = (listener, thisArgs, disposables) => {
			const subscription = subscribe(listener, thisArgs, disposables);
			listeners++;
			return toDisposable(() => {
				listeners--;
				subscription.dispose();
			});
		};
		const replacement = stub(token, 'onCancellationRequested').get(() => event);
		try {
			for (let i = 0; i < 3; i++) {
				await fixture.run(AgentFeedbackReviewCommandId.GetComments);
			}
			fixture.fail(new Error('load failed'));
			await assert.rejects(fixture.run(AgentFeedbackReviewCommandId.GetComments), /load failed/);
			assert.strictEqual(listeners, 0);
		} finally {
			replacement.restore();
		}
	});

	test('cancels pending hydration on disposal', async () => {
		const fixture = setup(undefined);
		const pending = fixture.run(AgentFeedbackReviewCommandId.GetComments);
		fixture.contribution.dispose();
		await assert.rejects(pending, /Canceled/);
		assert.strictEqual(fixture.references, 0);
	});

	test('accepts only selected comments without losing entries or unrelated metadata', async () => {
		const selected = annotation('selected');
		const fixture = setup({ annotations: [selected, annotation('other')] });
		await fixture.run(AgentFeedbackReviewCommandId.Accept, ['selected', 'selected']);
		assert.deepStrictEqual(fixture.writes, [{ channel: 'codex:/session/annotations', action: {
			type: ActionType.AnnotationsSet,
			annotation: { ...selected, _meta: { ...selected._meta, [FEEDBACK_ANNOTATION_META_KEY]: { ...readFeedbackAnnotationMeta(selected), state: 'accepted', pendingAgentReveal: true } } },
		} }]);
	});

	test('unchecking a pending reveal prevents it from leaking into the selection', async () => {
		const fixture = setup({ annotations: [annotation('selected'), annotation('pending', 'prReview', 'accepted', true)] });
		await fixture.run(AgentFeedbackReviewCommandId.Accept, ['selected']);
		assert.deepStrictEqual(fixture.writes.map(({ action }) => {
			assert.strictEqual(action.type, ActionType.AnnotationsSet);
			return { id: action.annotation.id, pending: readFeedbackAnnotationMeta(action.annotation)?.pendingAgentReveal };
		}), [{ id: 'selected', pending: true }, { id: 'pending', pending: false }]);
	});

	test('rejects empty or stale selections before any annotation write', async () => {
		const fixture = setup({ annotations: [annotation('exists')] });
		await assert.rejects(fixture.run(AgentFeedbackReviewCommandId.Accept, []), /no longer available/);
		await assert.rejects(fixture.run(AgentFeedbackReviewCommandId.Accept, ['exists', 'missing']), /no longer available/);
		assert.deepStrictEqual(fixture.writes, []);
	});

	test('opens the remote file at its annotation range', async () => {
		const fixture = setup({ annotations: [annotation('open')] });
		await fixture.run(AgentFeedbackReviewCommandId.Reveal, 'open');
		assert.deepStrictEqual(fixture.opened, [{ resource: URI.parse('vscode-remote://wsl+Ubuntu/workspace/example.ts'), options: { selection: { startLineNumber: 3, startColumn: 5, endLineNumber: 4, endColumn: 6 } } }]);
	});

	test('deletes only reviewable feedback', async () => {
		const fixture = setup({ annotations: [annotation('review'), annotation('user', 'user')] });
		await fixture.run(AgentFeedbackReviewCommandId.Delete, 'user');
		await fixture.run(AgentFeedbackReviewCommandId.Delete, 'review');
		assert.deepStrictEqual(fixture.writes, [{ channel: 'codex:/session/annotations', action: { type: ActionType.AnnotationsRemoved, annotationId: 'review' } }]);
	});
});
