/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { AgentFeedbackKind, AgentFeedbackService, AgentFeedbackState, IAgentFeedbackService } from '../../browser/agentFeedbackService.js';
import { IChatEditingService } from '../../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IAgentFeedbackVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IEditorService, IVisibleEditorsChangeEvent } from '../../../../../workbench/services/editor/common/editorService.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';

function r(startLine: number, endLine: number = startLine): Range {
	return new Range(startLine, 1, endLine, 1);
}

function feedbackSummary(items: readonly { resourceUri: URI; range: { startLineNumber: number } }[]): string[] {
	return items.map(f => `${f.resourceUri.path}:${f.range.startLineNumber}`);
}

suite('AgentFeedbackService - Ordering', () => {

	const store = new DisposableStore();
	let service: IAgentFeedbackService;
	let session: URI;
	let fileA: URI;
	let fileB: URI;
	let fileC: URI;

	setup(() => {
		const instantiationService = store.add(new TestInstantiationService());

		instantiationService.stub(IChatEditingService, new class extends mock<IChatEditingService>() { });
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override onDidVisibleEditorsChange = Event.None;
			override visibleEditorPanes = [];
		});
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override getSession(_resource: URI) { return undefined; }
		});
		instantiationService.stub(ISessionsService, { activeSession: observableValue<IActiveSession | undefined>('activeSession', undefined) } as unknown as ISessionsService);

		service = store.add(instantiationService.createInstance(AgentFeedbackService));
		session = URI.parse('test://session/1');
		fileA = URI.parse('file:///a.ts');
		fileB = URI.parse('file:///b.ts');
		fileC = URI.parse('file:///c.ts');
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('single file - items sorted by line number', () => {
		service.addFeedback(session, fileA, r(20), 'line 20');
		service.addFeedback(session, fileA, r(5), 'line 5');
		service.addFeedback(session, fileA, r(10), 'line 10');

		assert.deepStrictEqual(feedbackSummary(service.getFeedback(session)), [
			'/a.ts:5',
			'/a.ts:10',
			'/a.ts:20',
		]);
	});

	test('multiple files - files ordered by recency, items within file sorted by line', () => {
		service.addFeedback(session, fileA, r(10), 'A:10');
		service.addFeedback(session, fileA, r(5), 'A:5');
		service.addFeedback(session, fileB, r(20), 'B:20');
		service.addFeedback(session, fileB, r(3), 'B:3');

		assert.deepStrictEqual(feedbackSummary(service.getFeedback(session)), [
			'/a.ts:5',
			'/a.ts:10',
			'/b.ts:3',
			'/b.ts:20',
		]);
	});

	test('new file appended to end', () => {
		service.addFeedback(session, fileA, r(1), 'A:1');
		service.addFeedback(session, fileB, r(1), 'B:1');
		service.addFeedback(session, fileC, r(1), 'C:1');

		assert.deepStrictEqual(feedbackSummary(service.getFeedback(session)), [
			'/a.ts:1',
			'/b.ts:1',
			'/c.ts:1',
		]);
	});

	test('adding to existing file does not change file ordering', () => {
		service.addFeedback(session, fileA, r(10), 'A:10');
		service.addFeedback(session, fileB, r(10), 'B:10');
		// Add more feedback to fileA — should stay before fileB
		service.addFeedback(session, fileA, r(5), 'A:5');
		service.addFeedback(session, fileA, r(20), 'A:20');

		assert.deepStrictEqual(feedbackSummary(service.getFeedback(session)), [
			'/a.ts:5',
			'/a.ts:10',
			'/a.ts:20',
			'/b.ts:10',
		]);
	});

	test('interleaved adds across files maintain file recency and line sort', () => {
		service.addFeedback(session, fileA, r(30), 'A:30');
		service.addFeedback(session, fileB, r(50), 'B:50');
		service.addFeedback(session, fileA, r(10), 'A:10');
		service.addFeedback(session, fileC, r(1), 'C:1');
		service.addFeedback(session, fileB, r(5), 'B:5');
		service.addFeedback(session, fileA, r(20), 'A:20');

		assert.deepStrictEqual(feedbackSummary(service.getFeedback(session)), [
			'/a.ts:10',
			'/a.ts:20',
			'/a.ts:30',
			'/b.ts:5',
			'/b.ts:50',
			'/c.ts:1',
		]);
	});

	test('navigation follows sorted order', () => {
		service.addFeedback(session, fileA, r(20), 'A:20');
		service.addFeedback(session, fileB, r(10), 'B:10');
		service.addFeedback(session, fileA, r(5), 'A:5');

		// Expected order: A:5, A:20, B:10
		const first = service.getNextFeedback(session, true)!;
		assert.strictEqual(first.resourceUri.path, '/a.ts');
		assert.strictEqual(first.range.startLineNumber, 5);

		const second = service.getNextFeedback(session, true)!;
		assert.strictEqual(second.resourceUri.path, '/a.ts');
		assert.strictEqual(second.range.startLineNumber, 20);

		const third = service.getNextFeedback(session, true)!;
		assert.strictEqual(third.resourceUri.path, '/b.ts');
		assert.strictEqual(third.range.startLineNumber, 10);

		// Wraps around
		const fourth = service.getNextFeedback(session, true)!;
		assert.strictEqual(fourth.resourceUri.path, '/a.ts');
		assert.strictEqual(fourth.range.startLineNumber, 5);
	});

	test('navigation bearings reflect sorted position', () => {
		service.addFeedback(session, fileA, r(20), 'A:20');
		service.addFeedback(session, fileA, r(5), 'A:5');
		service.addFeedback(session, fileB, r(1), 'B:1');

		// Before navigation, no anchor
		let bearing = service.getNavigationBearing(session);
		assert.strictEqual(bearing.activeIdx, -1);
		assert.strictEqual(bearing.totalCount, 3);

		// Navigate to first (A:5)
		service.getNextFeedback(session, true);
		bearing = service.getNavigationBearing(session);
		assert.strictEqual(bearing.activeIdx, 0);

		// Navigate to second (A:20)
		service.getNextFeedback(session, true);
		bearing = service.getNavigationBearing(session);
		assert.strictEqual(bearing.activeIdx, 1);

		// Navigate to third (B:1)
		service.getNextFeedback(session, true);
		bearing = service.getNavigationBearing(session);
		assert.strictEqual(bearing.activeIdx, 2);
	});

	test('removing feedback preserves ordering', () => {
		const f1 = service.addFeedback(session, fileA, r(30), 'A:30');
		service.addFeedback(session, fileA, r(10), 'A:10');
		service.addFeedback(session, fileA, r(20), 'A:20');

		assert.deepStrictEqual(feedbackSummary(service.getFeedback(session)), [
			'/a.ts:10',
			'/a.ts:20',
			'/a.ts:30',
		]);

		service.removeFeedback(session, f1.id);
		assert.deepStrictEqual(feedbackSummary(service.getFeedback(session)), [
			'/a.ts:10',
			'/a.ts:20',
		]);
	});

	test('same line number items are stable', () => {
		const f1 = service.addFeedback(session, fileA, r(10), 'first');
		const f2 = service.addFeedback(session, fileA, r(10), 'second');

		const items = service.getFeedback(session);
		assert.strictEqual(items[0].id, f1.id);
		assert.strictEqual(items[1].id, f2.id);
	});

	test('preserves optional feedback context fields', () => {
		const feedback = service.addFeedback(session, fileA, r(10), 'with context', undefined, {
			codeSelection: 'const value = 1;',
			diffHunks: '@@ -1,1 +1,1 @@\n-const value = 0;\n+const value = 1;',
		});

		assert.strictEqual(feedback.codeSelection, 'const value = 1;');
		assert.strictEqual(feedback.diffHunks, '@@ -1,1 +1,1 @@\n-const value = 0;\n+const value = 1;');
	});

	test('addReply appends replies to the comment thread', () => {
		const feedback = service.addFeedback(session, fileA, r(10), 'initial');
		service.addReply(session, feedback.id, 'first reply');
		service.addReply(session, feedback.id, 'second reply');

		const items = service.getFeedback(session);
		assert.deepStrictEqual({
			text: items[0].text,
			replies: items[0].replies,
		}, {
			text: 'initial',
			replies: ['first reply', 'second reply'],
		});
	});

	test('addReply ignores unknown feedback ids', () => {
		service.addFeedback(session, fileA, r(10), 'initial');
		service.addReply(session, 'unknown', 'should not crash');

		const items = service.getFeedback(session);
		assert.strictEqual(items[0].replies, undefined);
	});
});

suite('AgentFeedbackService - getSessionForFile', () => {

	const store = new DisposableStore();

	let service: IAgentFeedbackService;
	let visibleEditorsEmitter: Emitter<IVisibleEditorsChangeEvent>;
	let visiblePanes: any[];
	let activeSessionObs: ISettableObservable<IActiveSession | undefined>;
	let sessions: Map<string, ISession>;

	let sessionS1: URI;
	let sessionS2: URI;
	let fileA: URI;
	let fileB: URI;

	function pane(...resources: URI[]): any {
		// Single resource: a plain editor input with `.resource`.
		// Two resources: a resource-side-by-side shaped input so that
		// `EditorResourceAccessor.getOriginalUri(..., supportSideBySide: BOTH)`
		// surfaces both URIs.
		const input = resources.length === 1
			? { resource: resources[0] }
			: { primary: { resource: resources[0] }, secondary: { resource: resources[1] } };
		return { input };
	}

	function makeSession(resource: URI, status: SessionStatus = SessionStatus.InProgress, options?: { folders?: URI[]; changes?: URI[] }): ISession {
		const workspace = options?.folders
			? { folders: options.folders.map(root => ({ root, workingDirectory: root })) }
			: undefined;
		const changes = (options?.changes ?? []).map(uri => ({ modifiedUri: uri, originalUri: uri }));
		return {
			resource,
			status: observableValue<SessionStatus>('status', status),
			workspace: observableValue('workspace', workspace),
			changes: observableValue('changes', changes),
		} as unknown as ISession;
	}

	function setActiveSession(s: ISession | undefined): void {
		activeSessionObs.set(s as IActiveSession | undefined, undefined);
	}

	function setVisibleEditors(panes: any[]): void {
		visiblePanes.length = 0;
		visiblePanes.push(...panes);
		visibleEditorsEmitter.fire({} as IVisibleEditorsChangeEvent);
	}

	setup(() => {
		visibleEditorsEmitter = store.add(new Emitter<IVisibleEditorsChangeEvent>());
		visiblePanes = [];
		activeSessionObs = observableValue<IActiveSession | undefined>('activeSession', undefined);
		sessions = new Map<string, ISession>();

		const instantiationService = store.add(new TestInstantiationService());

		instantiationService.stub(IChatEditingService, new class extends mock<IChatEditingService>() { });
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override onDidVisibleEditorsChange = visibleEditorsEmitter.event;
			override get visibleEditorPanes() { return visiblePanes; }
		});
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override getSession(resource: URI) { return sessions.get(resource.toString()); }
		});
		instantiationService.stub(ISessionsService, { activeSession: activeSessionObs } as unknown as ISessionsService);

		service = store.add(instantiationService.createInstance(AgentFeedbackService));

		sessionS1 = URI.parse('test://session/1');
		sessionS2 = URI.parse('test://session/2');
		fileA = URI.parse('file:///a.ts');
		fileB = URI.parse('file:///b.ts');

		sessions.set(sessionS1.toString(), makeSession(sessionS1));
		sessions.set(sessionS2.toString(), makeSession(sessionS2));
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns undefined when there is no active session and no tracked file', () => {
		assert.strictEqual(service.getSessionForFile(fileA), undefined);
	});

	test('untracked file falls back to the active session', () => {
		setActiveSession(sessions.get(sessionS1.toString())!);
		assert.strictEqual(service.getSessionForFile(fileA)?.resource.toString(), sessionS1.toString());
	});

	test('captures active session when file becomes visible', () => {
		setActiveSession(sessions.get(sessionS1.toString())!);
		setVisibleEditors([pane(fileA)]);

		assert.strictEqual(service.getSessionForFile(fileA)?.resource.toString(), sessionS1.toString());
	});

	test('preserves captured session after active session switches without a visibility change', () => {
		setActiveSession(sessions.get(sessionS1.toString())!);
		setVisibleEditors([pane(fileA)]);

		// Switch active session without firing a visibility change
		setActiveSession(sessions.get(sessionS2.toString())!);

		assert.strictEqual(service.getSessionForFile(fileA)?.resource.toString(), sessionS1.toString());
		// Untracked file falls back to the current active session
		assert.strictEqual(service.getSessionForFile(fileB)?.resource.toString(), sessionS2.toString());
	});

	test('most recent visibility wins when the same file is seen under a different session', () => {
		setActiveSession(sessions.get(sessionS1.toString())!);
		setVisibleEditors([pane(fileA)]);

		setActiveSession(sessions.get(sessionS2.toString())!);
		setVisibleEditors([pane(fileA)]);

		assert.strictEqual(service.getSessionForFile(fileA)?.resource.toString(), sessionS2.toString());
	});

	test('distinct files captured under different active sessions retain their own mapping', () => {
		setActiveSession(sessions.get(sessionS1.toString())!);
		setVisibleEditors([pane(fileA)]);

		setActiveSession(sessions.get(sessionS2.toString())!);
		setVisibleEditors([pane(fileB)]);

		assert.strictEqual(service.getSessionForFile(fileA)?.resource.toString(), sessionS1.toString());
		assert.strictEqual(service.getSessionForFile(fileB)?.resource.toString(), sessionS2.toString());
	});

	test('multi-resource editor pane tracks every resource under the active session', () => {
		setActiveSession(sessions.get(sessionS1.toString())!);
		setVisibleEditors([pane(fileA, fileB)]);

		assert.strictEqual(service.getSessionForFile(fileA)?.resource.toString(), sessionS1.toString());
		assert.strictEqual(service.getSessionForFile(fileB)?.resource.toString(), sessionS1.toString());
	});

	test('returns undefined when the active session has Untitled status', () => {
		sessions.set(sessionS1.toString(), makeSession(sessionS1, SessionStatus.Untitled));
		setActiveSession(sessions.get(sessionS1.toString())!);

		assert.strictEqual(service.getSessionForFile(fileA), undefined);
	});

	test('returns undefined when the mapped session is unknown to the management service', () => {
		setActiveSession(sessions.get(sessionS1.toString())!);
		setVisibleEditors([pane(fileA)]);
		sessions.delete(sessionS1.toString());
		setActiveSession(undefined);

		assert.strictEqual(service.getSessionForFile(fileA), undefined);
	});

	test('does not return a session for files outside the session workspace folders', () => {
		const wsSession = makeSession(sessionS1, SessionStatus.InProgress, { folders: [URI.file('/workspace')] });
		sessions.set(sessionS1.toString(), wsSession);
		setActiveSession(wsSession);

		// A user-data file outside the workspace is out of scope.
		assert.strictEqual(service.getSessionForFile(URI.file('/home/user/settings.json')), undefined);
		// A file inside the workspace folder is in scope.
		assert.strictEqual(service.getSessionForFile(URI.file('/workspace/a.ts'))?.resource.toString(), sessionS1.toString());
	});

	test('returns a session for files that are part of its changes even outside the workspace', () => {
		const changed = URI.file('/outside/changed.ts');
		const wsSession = makeSession(sessionS1, SessionStatus.InProgress, { folders: [URI.file('/workspace')], changes: [changed] });
		sessions.set(sessionS1.toString(), wsSession);
		setActiveSession(wsSession);

		assert.strictEqual(service.getSessionForFile(changed)?.resource.toString(), sessionS1.toString());
	});

	test('does not return a session for output view resources', () => {
		const wsSession = makeSession(sessionS1, SessionStatus.InProgress, { folders: [URI.file('/workspace')] });
		sessions.set(sessionS1.toString(), wsSession);
		setActiveSession(wsSession);

		assert.strictEqual(service.getSessionForFile(URI.from({ scheme: 'output', path: '/workspace/foo' })), undefined);
	});
});

suite('AgentFeedbackService - State', () => {

	const store = new DisposableStore();
	let service: IAgentFeedbackService;
	let session: URI;
	let fileA: URI;
	/** When set, getSession reports the session under this provider id. */
	let sessionProviderId: string | undefined;

	setup(() => {
		sessionProviderId = undefined;
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IChatEditingService, new class extends mock<IChatEditingService>() { });
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override onDidVisibleEditorsChange = Event.None;
			override visibleEditorPanes = [];
		});
		instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
			override getProvider<T extends ISessionsProvider>(_providerId: string): T | undefined { return undefined; }
		});
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override onDidDeleteSession = Event.None;
			override getSession(_resource: URI) {
				return sessionProviderId
					? { providerId: sessionProviderId, sessionId: 'session-1' } as unknown as ISession
					: undefined;
			}
		});
		instantiationService.stub(ISessionsService, { activeSession: observableValue<IActiveSession | undefined>('activeSession', undefined) } as unknown as ISessionsService);

		service = store.add(instantiationService.createInstance(AgentFeedbackService));
		session = URI.parse('test://session/1');
		fileA = URI.parse('file:///a.ts');
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('feedback defaults to the accepted state', () => {
		const feedback = service.addFeedback(session, fileA, r(10), 'hello');
		assert.strictEqual(feedback.state, AgentFeedbackState.Accepted);
	});

	test('created feedback transitions to accepted on acceptFeedback', () => {
		const created = service.addFeedback(session, fileA, r(10), 'pending', undefined, undefined, undefined, AgentFeedbackKind.AgentReview, AgentFeedbackState.Created);
		assert.strictEqual(created.state, AgentFeedbackState.Created);

		service.acceptFeedback(session, created.id);
		assert.strictEqual(service.getFeedback(session)[0].state, AgentFeedbackState.Accepted);
	});

	test('markFeedbackSubmitted resolves accepted items directly for non-agent-host sessions', () => {
		const accepted = service.addFeedback(session, fileA, r(10), 'accepted');
		const created = service.addFeedback(session, fileA, r(20), 'created', undefined, undefined, undefined, AgentFeedbackKind.AgentReview, AgentFeedbackState.Created);

		service.markFeedbackSubmitted(session);

		const stateById = new Map(service.getFeedback(session).map(item => [item.id, item.state]));
		assert.deepStrictEqual({
			accepted: stateById.get(accepted.id),
			created: stateById.get(created.id),
		}, {
			accepted: AgentFeedbackState.Resolved,
			created: AgentFeedbackState.Created,
		});
	});

	test('markFeedbackSubmitted keeps accepted items submitted for agent-host sessions', () => {
		sessionProviderId = LOCAL_AGENT_HOST_PROVIDER_ID;
		service.addFeedback(session, fileA, r(10), 'accepted');

		service.markFeedbackSubmitted(session);

		assert.strictEqual(service.getFeedback(session)[0].state, AgentFeedbackState.Submitted);
	});

	test('resolving and un-resolving moves between resolved and submitted', () => {
		const feedback = service.addFeedback(session, fileA, r(10), 'feedback');
		// Non-agent-host submit resolves the comment directly.
		service.markFeedbackSubmitted(session);
		assert.strictEqual(service.getFeedback(session)[0].state, AgentFeedbackState.Resolved);

		service.setFeedbackResolved(session, feedback.id, false);
		assert.strictEqual(service.getFeedback(session)[0].state, AgentFeedbackState.Submitted);

		service.setFeedbackResolved(session, feedback.id, true);
		assert.strictEqual(service.getFeedback(session)[0].state, AgentFeedbackState.Resolved);
	});
});

suite('AgentFeedbackService - Submit (agent host)', () => {

	const store = new DisposableStore();
	let service: IAgentFeedbackService;
	let session: URI;
	let fileA: URI;
	let widgetOps: string[];
	let addedEntries: IAgentFeedbackVariableEntry[];

	setup(() => {
		widgetOps = [];
		addedEntries = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IChatEditingService, new class extends mock<IChatEditingService>() { });
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override onDidVisibleEditorsChange = Event.None;
			override visibleEditorPanes = [];
		});
		instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
			override getProvider<T extends ISessionsProvider>(_providerId: string): T | undefined { return undefined; }
		});
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override onDidDeleteSession = Event.None;
			override getSession(_resource: URI) {
				return { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionId: 'session-1' } as unknown as ISession;
			}
		});
		instantiationService.stub(ISessionsService, { activeSession: observableValue<IActiveSession | undefined>('activeSession', undefined) } as unknown as ISessionsService);

		const widget = {
			attachmentModel: {
				attachments: [],
				delete: (id: string) => widgetOps.push(`delete:${id}`),
				addContext: (...entries: IAgentFeedbackVariableEntry[]) => {
					addedEntries.push(...entries);
					widgetOps.push(`add:${entries[0]?.id}`);
				},
			},
			acceptInput: async (query: string) => { widgetOps.push(`accept:${query}`); return undefined; },
		} as unknown as IChatWidget;
		instantiationService.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() {
			override getWidgetBySessionResource(_resource: URI): IChatWidget { return widget; }
		});

		service = store.add(instantiationService.createInstance(AgentFeedbackService));
		session = URI.parse('test://session/1');
		fileA = URI.parse('file:///a.ts');
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('attaches the just-submitted feedback to the request and clears the attachment afterwards', async () => {
		service.addFeedback(session, fileA, r(10), 'Please simplify');

		await service.submitFeedback(session);

		const attachmentId = `agentFeedback:${session.toString()}`;
		assert.deepStrictEqual(widgetOps, [
			`delete:${attachmentId}`,
			`add:${attachmentId}`,
			'accept:/act-on-feedback',
			`delete:${attachmentId}`,
		]);
		assert.deepStrictEqual({
			count: addedEntries.length,
			kind: addedEntries[0]?.kind,
			texts: addedEntries[0]?.feedbackItems.map(item => item.text),
			state: service.getFeedback(session)[0].state,
		}, {
			count: 1,
			kind: 'agentFeedback',
			texts: ['Please simplify'],
			state: AgentFeedbackState.Submitted,
		});
	});
});

