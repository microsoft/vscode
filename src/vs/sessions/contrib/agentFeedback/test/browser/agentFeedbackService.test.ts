/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { derived, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { AGENT_FEEDBACK_NEW_SESSION_RESOURCE, AgentFeedbackKind, AgentFeedbackService, AgentFeedbackState, IAgentFeedbackService } from '../../browser/agentFeedbackService.js';
import { getSessionEditorComments } from '../../browser/sessionEditorComments.js';
import { IChatEditingService } from '../../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { IChatWidget, IChatWidgetService, IChatAcceptInputOptions, IChatWidgetViewModelChangeEvent } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IAgentFeedbackVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IEditorService, IVisibleEditorsChangeEvent } from '../../../../../workbench/services/editor/common/editorService.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { whenChatWidgetForSession } from '../../../chat/browser/chatWidgetUtils.js';
import { ISession, ISessionFile, SessionFileOperation, SessionStatus } from '../../../../services/sessions/common/session.js';
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
	let onDidDeleteSession: Emitter<ISession>;

	setup(() => {
		const instantiationService = store.add(new TestInstantiationService());
		onDidDeleteSession = store.add(new Emitter<ISession>());

		instantiationService.stub(IChatEditingService, new class extends mock<IChatEditingService>() { });
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override onDidVisibleEditorsChange = Event.None;
			override visibleEditorPanes = [];
			override openEditor(..._args: unknown[]): Promise<undefined> { return Promise.resolve(undefined); }
		});
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override onDidDeleteSession = onDidDeleteSession.event;
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

	test('revealFeedback anchors the matching session editor comment so its widget expands', async () => {
		const f1 = service.addFeedback(session, fileA, r(5), 'A:5');
		const f2 = service.addFeedback(session, fileA, r(20), 'A:20');
		const reveals: { session: string; commentId: string; resource: string }[] = [];
		store.add(service.onDidRevealSessionComment(event => reveals.push({
			session: event.sessionResource.toString(),
			commentId: event.commentId,
			resource: event.resourceUri.toString(),
		})));

		// The editor widget contribution expands the widget whose session
		// editor comment matches the navigation anchor. revealFeedback must set
		// the anchor using the prefixed session-editor-comment id (not the raw
		// feedback id) for that match to succeed.
		await service.revealFeedback(session, f2.id);

		const comments = getSessionEditorComments(session, service.getFeedback(session), undefined, service.getVisibleResolvedFeedbackIds(session));
		const bearing = service.getNavigationBearing(session, comments);
		assert.strictEqual(comments[bearing.activeIdx]?.sourceId, f2.id);

		await service.revealFeedback(session, f1.id);
		const bearingAfter = service.getNavigationBearing(session, comments);
		assert.strictEqual(comments[bearingAfter.activeIdx]?.sourceId, f1.id);
		assert.deepStrictEqual(reveals, [
			{ session: session.toString(), commentId: comments[1].id, resource: fileA.toString() },
			{ session: session.toString(), commentId: comments[0].id, resource: fileA.toString() },
		]);
	});

	test('resolved feedback is visible only after an explicit reveal', async () => {
		const feedback = service.addFeedback(
			session,
			fileA,
			r(5),
			'Resolved feedback',
			undefined,
			undefined,
			undefined,
			AgentFeedbackKind.UserReview,
			AgentFeedbackState.Resolved,
		);
		const visibleComments = () => getSessionEditorComments(
			session,
			service.getFeedback(session),
			undefined,
			service.getVisibleResolvedFeedbackIds(session),
		).map(comment => comment.sourceId);

		const beforeReveal = visibleComments();
		await service.revealFeedback(session, feedback.id);
		const afterReveal = visibleComments();

		service.setFeedbackResolved(session, feedback.id, false);
		const afterUnresolve = visibleComments();
		service.setFeedbackResolved(session, feedback.id, true);
		const afterReresolve = visibleComments();

		service.showFeedbackInEditor(session, [feedback.id]);
		const afterShow = visibleComments();
		service.hideFeedbackInEditor(session, feedback.id);
		const afterHide = visibleComments();

		assert.deepStrictEqual({
			beforeReveal,
			afterReveal,
			afterUnresolve,
			afterReresolve,
			afterShow,
			afterHide,
		}, {
			beforeReveal: [],
			afterReveal: [feedback.id],
			afterUnresolve: [feedback.id],
			afterReresolve: [],
			afterShow: [feedback.id],
			afterHide: [],
		});
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
			replies: [
				{ text: 'first reply', author: 'user' },
				{ text: 'second reply', author: 'user' },
			],
		});
	});

	test('addReply ignores unknown feedback ids', () => {
		service.addFeedback(session, fileA, r(10), 'initial');
		service.addReply(session, 'unknown', 'should not crash');

		const items = service.getFeedback(session);
		assert.strictEqual(items[0].replies, undefined);
	});

	test('deleting a session drops its per-session bookkeeping', () => {
		const feedback = service.addFeedback(session, fileA, r(10), 'comment');
		service.setNavigationAnchor(session, feedback.id);
		service.setFeedbackResolved(session, feedback.id, true);
		service.showFeedbackInEditor(session, [feedback.id]);
		assert.deepStrictEqual([...service.getVisibleResolvedFeedbackIds(session)], [feedback.id]);

		onDidDeleteSession.fire({ resource: session } as ISession);

		assert.deepStrictEqual({
			visibleResolved: [...service.getVisibleResolvedFeedbackIds(session)],
			anchoredIdx: service.getNavigationBearing(session).activeIdx,
		}, {
			visibleResolved: [],
			anchoredIdx: -1,
		});
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

	function makeSession(resource: URI, status: SessionStatus = SessionStatus.InProgress, options?: { folders?: URI[]; changes?: URI[]; externalChanges?: URI[] }): ISession {
		const workspace = options?.folders
			? { folders: options.folders.map(root => ({ root, workingDirectory: root })) }
			: undefined;
		const changes = (options?.changes ?? []).map(uri => ({ modifiedUri: uri, originalUri: uri }));
		const externalChanges = (options?.externalChanges ?? []).map(uri => ({ uri, operation: SessionFileOperation.Modified }));
		return {
			resource,
			status: observableValue<SessionStatus>('status', status),
			isCreated: observableValue('isCreated', status !== SessionStatus.Untitled),
			workspace: observableValue('workspace', workspace),
			changes: observableValue('changes', changes),
			externalChanges: observableValue('externalChanges', externalChanges),
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
			override onDidDeleteSession = Event.None;
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

	test('uses one shared feedback scope for undefined and workspace-less drafts', () => {
		const firstDraft = makeSession(sessionS1, SessionStatus.Untitled);
		const secondDraft = makeSession(sessionS2, SessionStatus.Untitled);

		const withoutSession = service.getFeedbackSessionResource(fileA);
		setActiveSession(firstDraft);
		const withFirstDraft = service.getFeedbackSessionResource(fileA);
		setActiveSession(secondDraft);
		const withSecondDraft = service.getFeedbackSessionResource(fileA);

		assert.deepStrictEqual(
			[withoutSession, withFirstDraft, withSecondDraft].map(resource => resource?.toString()),
			Array(3).fill(AGENT_FEEDBACK_NEW_SESSION_RESOURCE.toString()),
		);
	});

	test('scopes a draft that already picked a workspace to that workspace', () => {
		setActiveSession(makeSession(sessionS1, SessionStatus.Untitled, { folders: [URI.file('/workspace')] }));

		assert.deepStrictEqual({
			inWorkspace: service.getFeedbackSessionResource(URI.file('/workspace/a.ts'))?.toString(),
			outsideWorkspace: service.getFeedbackSessionResource(URI.file('/elsewhere/a.ts'))?.toString(),
		}, {
			inWorkspace: AGENT_FEEDBACK_NEW_SESSION_RESOURCE.toString(),
			outsideWorkspace: undefined,
		});
	});

	test('discards the shared new-session comments when the draft workspace changes', () => {
		const draftInF = makeSession(sessionS1, SessionStatus.Untitled, { folders: [URI.file('/f')] });
		const draftInG = makeSession(sessionS2, SessionStatus.Untitled, { folders: [URI.file('/g')] });

		setActiveSession(draftInF);
		service.addFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE, URI.file('/f/a.ts'), new Range(1, 1, 1, 2), 'Fix this');

		// Visiting a created session leaves the scope dormant, so the comments
		// survive the round trip back to the same draft workspace.
		setActiveSession(sessions.get(sessionS2.toString())!);
		setActiveSession(draftInF);
		const afterCreatedSessionRoundTrip = service.getFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE).length;

		setActiveSession(draftInG);

		assert.deepStrictEqual({
			afterCreatedSessionRoundTrip,
			afterWorkspaceChange: service.getFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE).length,
		}, {
			afterCreatedSessionRoundTrip: 1,
			afterWorkspaceChange: 0,
		});
	});

	test('lets a workspace-less draft adopt its first selection after the comments were cleared', () => {
		const draftInF = makeSession(sessionS1, SessionStatus.Untitled, { folders: [URI.file('/f')] });
		const workspacelessDraft = makeSession(sessionS2, SessionStatus.Untitled);
		const draftInG = makeSession(sessionS2, SessionStatus.Untitled, { folders: [URI.file('/g')] });

		setActiveSession(draftInF);
		const first = service.addFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE, URI.file('/f/a.ts'), new Range(1, 1, 1, 2), 'Fix this');
		service.removeFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE, first.id);

		// The set is empty again, so the binding to /f is released and the comment
		// written without a workspace adopts the next selection instead.
		setActiveSession(workspacelessDraft);
		service.addFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE, URI.file('/g/b.ts'), new Range(1, 1, 1, 2), 'Rename this');
		setActiveSession(draftInG);

		assert.strictEqual(service.getFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE).length, 1);
	});

	test('uses the created session feedback scope after leaving the new-session view', () => {
		setActiveSession(makeSession(sessionS1, SessionStatus.Untitled));
		const draftScope = service.getFeedbackSessionResource(fileA);
		setActiveSession(sessions.get(sessionS2.toString())!);
		const createdScope = service.getFeedbackSessionResource(fileA);

		assert.deepStrictEqual({
			draftScope: draftScope?.toString(),
			createdScope: createdScope?.toString(),
		}, {
			draftScope: AGENT_FEEDBACK_NEW_SESSION_RESOURCE.toString(),
			createdScope: sessionS2.toString(),
		});
	});

	test('explicit resource scope uses its supplied session and announces scope changes', () => {
		setActiveSession(sessions.get(sessionS1.toString())!);
		let scopeChanges = 0;
		store.add(service.onDidChangeFeedbackScope(() => scopeChanges++));

		const registration = service.registerFeedbackResourceScope(fileA, sessionS2);
		const registeredScope = service.getFeedbackSessionResource(fileA);
		registration.dispose();

		assert.deepStrictEqual({
			registeredScope: registeredScope?.toString(),
			scopeAfterDispose: service.getFeedbackSessionResource(fileA)?.toString(),
			scopeChanges,
		}, {
			registeredScope: sessionS2.toString(),
			scopeAfterDispose: sessionS1.toString(),
			scopeChanges: 2,
		});
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

	test('returns a session for files that are part of external changes even outside the workspace', () => {
		const external = URI.file('/home/user/.config/settings.json');
		const wsSession = makeSession(sessionS1, SessionStatus.InProgress, { folders: [URI.file('/workspace')], externalChanges: [external] });
		sessions.set(sessionS1.toString(), wsSession);
		setActiveSession(wsSession);

		assert.strictEqual(service.getSessionForFile(external)?.resource.toString(), sessionS1.toString());
	});

	test('computes the session external changes once for repeated scope checks', () => {
		const external = URI.file('/home/user/.config/settings.json');
		let computations = 0;
		let releasedSubscriptions = 0;
		// Mirrors the agent host provider, which holds a state subscription per
		// chat for as long as its external changes are observed and releases
		// them again once they are not.
		const externalChanges = derived<readonly ISessionFile[]>(reader => {
			computations++;
			reader.store.add(toDisposable(() => releasedSubscriptions++));
			return [{ uri: external, operation: SessionFileOperation.Modified }];
		});
		const wsSession: ISession = { ...makeSession(sessionS1, SessionStatus.InProgress, { folders: [URI.file('/workspace')] }), externalChanges };
		sessions.set(sessionS1.toString(), wsSession);
		setActiveSession(wsSession);

		const scopes = [
			service.getSessionForFile(external)?.resource.toString(),
			service.getSessionForFile(URI.file('/elsewhere/other.ts'))?.resource.toString(),
			service.getSessionForFile(external)?.resource.toString(),
		];

		assert.deepStrictEqual({ scopes, computations, releasedSubscriptions }, {
			scopes: [sessionS1.toString(), undefined, sessionS1.toString()],
			computations: 1,
			releasedSubscriptions: 0,
		});

		// Activating another session releases the previous session's subscriptions.
		setActiveSession(sessions.get(sessionS2.toString())!);

		assert.deepStrictEqual({ computations, releasedSubscriptions }, { computations: 1, releasedSubscriptions: 1 });
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
	/** Resolves when the (possibly queued) request is actually sent, i.e. when `acceptInput` resolves. */
	let acceptInputSent: DeferredPromise<void>;
	/** Whether the widget hands the request over to the chat service. */
	let acceptsRequest: boolean;
	/** Whether the widget has the session's chat model loaded. */
	let sessionLoaded: boolean;
	/** Simulates the widget loading the session's chat model. */
	let loadSession: () => void;

	setup(() => {
		widgetOps = [];
		addedEntries = [];
		acceptInputSent = new DeferredPromise<void>();
		acceptsRequest = true;
		sessionLoaded = true;
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

		const onDidChangeViewModel = store.add(new Emitter<IChatWidgetViewModelChangeEvent>());
		const widget = {
			onDidChangeViewModel: onDidChangeViewModel.event,
			attachmentModel: {
				attachments: [],
				delete: (id: string) => widgetOps.push(`delete:${id}`),
				addContext: (...entries: IAgentFeedbackVariableEntry[]) => {
					addedEntries.push(...entries);
					widgetOps.push(`add:${entries[0]?.id}`);
				},
			},
			acceptInput: async (query: string, options?: IChatAcceptInputOptions) => {
				widgetOps.push(`accept:${query}`);
				if (acceptsRequest) {
					options?.onRequestAccepted?.();
				}
				await acceptInputSent.p;
				widgetOps.push(`sent:${query}`);
				return undefined;
			},
		} as unknown as IChatWidget;
		loadSession = () => {
			sessionLoaded = true;
			onDidChangeViewModel.fire({ previousSessionResource: undefined, currentSessionResource: session });
		};
		instantiationService.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() {
			override onDidAddWidget = Event.None;
			override getAllWidgets(): readonly IChatWidget[] { return [widget]; }
			override getWidgetBySessionResource(_resource: URI): IChatWidget | undefined {
				return sessionLoaded ? widget : undefined;
			}
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

	test('marks feedback as submitted once the request is queued behind an in-progress request', async () => {
		service.addFeedback(session, fileA, r(10), 'Please simplify');

		// `acceptInputSent` is still pending: the request was queued and only runs
		// once the in-progress request completes.
		const submitted = await service.submitFeedback(session);

		assert.deepStrictEqual({
			submitted,
			state: service.getFeedback(session)[0].state,
			sent: widgetOps.includes('sent:/act-on-feedback'),
		}, {
			submitted: true,
			state: AgentFeedbackState.Submitted,
			sent: false,
		});
	});

	test('keeps feedback accepted when the request is not accepted by the widget', async () => {
		acceptsRequest = false;
		acceptInputSent.complete();
		service.addFeedback(session, fileA, r(10), 'Please simplify');

		const submitted = await service.submitFeedback(session);

		assert.deepStrictEqual({
			submitted,
			state: service.getFeedback(session)[0].state,
		}, {
			submitted: false,
			state: AgentFeedbackState.Accepted,
		});
	});

	test('waits for the session model to load into the widget before submitting', async () => {
		sessionLoaded = false;
		service.addFeedback(session, fileA, r(10), 'Please simplify');

		const pending = service.submitFeedback(session);
		await timeout(0);
		const submittedBeforeLoad = widgetOps.length > 0;

		loadSession();

		assert.deepStrictEqual({
			submittedBeforeLoad,
			submitted: await pending,
			state: service.getFeedback(session)[0].state,
			accepted: widgetOps.includes('accept:/act-on-feedback'),
		}, {
			submittedBeforeLoad: false,
			submitted: true,
			state: AgentFeedbackState.Submitted,
			accepted: true,
		});
	});
});

suite('whenChatWidgetForSession', () => {

	const store = new DisposableStore();
	const session = URI.parse('test://session/1');

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Builds a widget service whose single widget only reports the session once `load` is
	 * called, mirroring a chat widget that has not loaded its model yet.
	 */
	function createWidgetHost(): { widget: IChatWidget; service: IChatWidgetService; load: () => void } {
		const onDidChangeViewModel = store.add(new Emitter<IChatWidgetViewModelChangeEvent>());
		const widget = { onDidChangeViewModel: onDidChangeViewModel.event } as unknown as IChatWidget;
		let loaded = false;

		const service = new class extends mock<IChatWidgetService>() {
			override onDidAddWidget = Event.None;
			override getAllWidgets(): readonly IChatWidget[] { return [widget]; }
			override getWidgetBySessionResource(_resource: URI): IChatWidget | undefined {
				return loaded ? widget : undefined;
			}
		};

		return {
			widget,
			service,
			load: () => {
				loaded = true;
				onDidChangeViewModel.fire({ previousSessionResource: undefined, currentSessionResource: session });
			},
		};
	}

	test('resolves immediately when the session is already loaded', async () => {
		const host = createWidgetHost();
		host.load();

		assert.strictEqual(await whenChatWidgetForSession(host.service, session, 0), host.widget);
	});

	test('resolves once a widget loads the session', async () => {
		const host = createWidgetHost();

		const pending = whenChatWidgetForSession(host.service, session, 5000);
		await timeout(0);
		host.load();

		assert.strictEqual(await pending, host.widget);
	});

	test('resolves undefined when no widget loads the session in time', async () => {
		const host = createWidgetHost();

		assert.strictEqual(await whenChatWidgetForSession(host.service, session, 1), undefined);
	});

	test('resolves when a widget that already has the session is added later', async () => {
		const onDidAddWidget = store.add(new Emitter<IChatWidget>());
		const widget = { onDidChangeViewModel: Event.None } as unknown as IChatWidget;
		let widgets: IChatWidget[] = [];

		const service = new class extends mock<IChatWidgetService>() {
			override onDidAddWidget = onDidAddWidget.event;
			override getAllWidgets(): readonly IChatWidget[] { return widgets; }
			override getWidgetBySessionResource(_resource: URI): IChatWidget | undefined { return widgets[0]; }
		};

		const pending = whenChatWidgetForSession(service, session, 5000);
		await timeout(0);
		widgets = [widget];
		onDidAddWidget.fire(widget);

		assert.strictEqual(await pending, widget);
	});
});
