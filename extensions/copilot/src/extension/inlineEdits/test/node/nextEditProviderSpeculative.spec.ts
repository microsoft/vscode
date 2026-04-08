/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, assert, beforeEach, describe, expect, it } from 'vitest';
import { ConfigKey } from '../../../../platform/configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { IGitExtensionService } from '../../../../platform/git/common/gitExtensionService';
import { NullGitExtensionService } from '../../../../platform/git/common/nullGitExtensionService';
import { DocumentId } from '../../../../platform/inlineEdits/common/dataTypes/documentId';
import { SpeculativeRequestsAutoExpandEditWindowLines, SpeculativeRequestsEnablement } from '../../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { InlineEditRequestLogContext } from '../../../../platform/inlineEdits/common/inlineEditLogContext';
import { ObservableGit } from '../../../../platform/inlineEdits/common/observableGit';
import { MutableObservableWorkspace } from '../../../../platform/inlineEdits/common/observableWorkspace';
import { EditStreamingWithTelemetry, IStatelessNextEditProvider, NoNextEditReason, RequestEditWindow, RequestEditWindowWithCursorJump, StatelessNextEditRequest, StatelessNextEditTelemetryBuilder, WithStatelessProviderTelemetry } from '../../../../platform/inlineEdits/common/statelessNextEditProvider';
import { NesHistoryContextProvider } from '../../../../platform/inlineEdits/common/workspaceEditTracker/nesHistoryContextProvider';
import { NesXtabHistoryTracker } from '../../../../platform/inlineEdits/common/workspaceEditTracker/nesXtabHistoryTracker';
import { ILogger, ILogService, LogServiceImpl } from '../../../../platform/log/common/logService';
import { NullRequestLogger } from '../../../../platform/requestLogger/node/nullRequestLogger';
import { IRequestLogger } from '../../../../platform/requestLogger/node/requestLogger';
import { ISnippyService, NullSnippyService } from '../../../../platform/snippy/common/snippyService';
import { IExperimentationService, NullExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { mockNotebookService } from '../../../../platform/test/common/testNotebookService';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { Result } from '../../../../util/common/result';
import { DeferredPromise } from '../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { generateUuid } from '../../../../util/vs/base/common/uuid';
import { LineReplacement } from '../../../../util/vs/editor/common/core/edits/lineEdit';
import { StringEdit } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { LineRange } from '../../../../util/vs/editor/common/core/ranges/lineRange';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { NESInlineCompletionContext, NextEditProvider } from '../../node/nextEditProvider';
import { ILlmNESTelemetry, NextEditProviderTelemetryBuilder, ReusedRequestKind } from '../../node/nextEditProviderTelemetry';

interface ICallRecord {
	readonly request: StatelessNextEditRequest;
	readonly cancellationRequested: DeferredPromise<void>;
	readonly completed: DeferredPromise<void>;
	wasCancelled: boolean;
}

type ProviderBehavior =
	| {
		kind: 'yieldEditThenNoSuggestions';
		edit: LineReplacement;
	}
	| {
		kind: 'yieldEditThenWait';
		edit: LineReplacement;
		continueSignal: DeferredPromise<void>;
	}
	| {
		kind: 'yieldEditThenWaitThenYieldEditsThenNoSuggestions';
		firstEdit: LineReplacement;
		continueSignal: DeferredPromise<void>;
		remainingEdits: readonly LineReplacement[];
	}
	| {
		kind: 'waitForCancellation';
	};

class TestStatelessNextEditProvider implements IStatelessNextEditProvider {
	public readonly ID = 'TestStatelessNextEditProvider';

	private readonly _behaviors: ProviderBehavior[] = [];
	public readonly calls: ICallRecord[] = [];
	private readonly _callDeferreds: DeferredPromise<void>[] = [];

	/**
	 * When set, each `provideNextEdit` call will assign this to `request.requestEditWindow`
	 * (mirroring how the real XtabProvider sets the edit window early in its execution).
	 */
	public editWindow: RequestEditWindow | RequestEditWindowWithCursorJump | undefined;

	public enqueueBehavior(behavior: ProviderBehavior): void {
		this._behaviors.push(behavior);
	}

	/** Returns a promise that resolves when the Nth call (1-based) arrives. */
	public waitForCall(callNumber: number): Promise<void> {
		if (this.calls.length >= callNumber) {
			return Promise.resolve();
		}
		while (this._callDeferreds.length < callNumber) {
			this._callDeferreds.push(new DeferredPromise<void>());
		}
		return this._callDeferreds[callNumber - 1].p;
	}

	private _resolveCallDeferred(): void {
		const callIdx = this.calls.length - 1;
		if (callIdx < this._callDeferreds.length) {
			this._callDeferreds[callIdx].complete();
		}
	}

	public async *provideNextEdit(request: StatelessNextEditRequest, _logger: ILogger, _logContext: InlineEditRequestLogContext, cancellationToken: CancellationToken): EditStreamingWithTelemetry {
		const behavior = this._behaviors.shift();
		if (!behavior) {
			throw new Error('Missing provider behavior');
		}

		if (this.editWindow) {
			request.requestEditWindow = this.editWindow;
		}

		const streamedEditWindow = this.editWindow?.window;
		const streamedOriginalWindow = this.editWindow instanceof RequestEditWindowWithCursorJump ? this.editWindow.originalWindow : undefined;
		const telemetryBuilder = new StatelessNextEditTelemetryBuilder(request.headerRequestId);
		const activeDocId = request.getActiveDocument().id;
		const cancellationRequested = new DeferredPromise<void>();
		const completed = new DeferredPromise<void>();
		const call: ICallRecord = {
			request,
			cancellationRequested,
			completed,
			wasCancelled: false,
		};

		this.calls.push(call);
		this._resolveCallDeferred();
		const cancellationDisposable = cancellationToken.onCancellationRequested(() => {
			call.wasCancelled = true;
			if (!cancellationRequested.isSettled) {
				cancellationRequested.complete();
			}
		});

		try {
			if (behavior.kind === 'waitForCancellation') {
				await cancellationRequested.p;
				const cancelled = new NoNextEditReason.GotCancelled('testCancellation');
				return new WithStatelessProviderTelemetry(cancelled, telemetryBuilder.build(Result.error(cancelled)));
			}

			if (behavior.kind === 'yieldEditThenWaitThenYieldEditsThenNoSuggestions') {
				yield new WithStatelessProviderTelemetry({ edit: behavior.firstEdit, isFromCursorJump: false, targetDocument: activeDocId, window: streamedEditWindow, originalWindow: streamedOriginalWindow }, telemetryBuilder.build(Result.ok(undefined)));
				await Promise.race([behavior.continueSignal.p, cancellationRequested.p]);
				if (!call.wasCancelled) {
					for (const edit of behavior.remainingEdits) {
						yield new WithStatelessProviderTelemetry({ edit, isFromCursorJump: false, targetDocument: activeDocId, window: streamedEditWindow, originalWindow: streamedOriginalWindow }, telemetryBuilder.build(Result.ok(undefined)));
					}
				}
				const noSuggestions = new NoNextEditReason.NoSuggestions(request.documentBeforeEdits, streamedEditWindow);
				return new WithStatelessProviderTelemetry(noSuggestions, telemetryBuilder.build(Result.error(noSuggestions)));
			}

			yield new WithStatelessProviderTelemetry({ edit: behavior.edit, isFromCursorJump: false, targetDocument: activeDocId, window: streamedEditWindow, originalWindow: streamedOriginalWindow }, telemetryBuilder.build(Result.ok(undefined)));

			if (behavior.kind === 'yieldEditThenWait') {
				await Promise.race([behavior.continueSignal.p, cancellationRequested.p]);
			}

			const noSuggestions = new NoNextEditReason.NoSuggestions(request.documentBeforeEdits, streamedEditWindow);
			return new WithStatelessProviderTelemetry(noSuggestions, telemetryBuilder.build(Result.error(noSuggestions)));
		} finally {
			cancellationDisposable.dispose();
			if (!completed.isSettled) {
				completed.complete();
			}
		}
	}
}

function createInlineContext(): NESInlineCompletionContext {
	return {
		triggerKind: 1,
		selectedCompletionInfo: undefined,
		requestUuid: generateUuid(),
		requestIssuedDateTime: Date.now(),
		earliestShownDateTime: Date.now(),
		enforceCacheDelay: false,
	};
}

async function flushMicrotasks(ticks = 20): Promise<void> {
	for (let i = 0; i < ticks; i++) {
		await Promise.resolve();
	}
}

function lineReplacement(lineNumberOneBased: number, newLine: string): LineReplacement {
	return new LineReplacement(new LineRange(lineNumberOneBased, lineNumberOneBased + 1), [newLine]);
}

describe('NextEditProvider speculative requests', () => {
	let disposables: DisposableStore;
	let configService: InMemoryConfigurationService;
	let snippyService: ISnippyService;
	let gitExtensionService: IGitExtensionService;
	let logService: ILogService;
	let expService: IExperimentationService;
	let workspaceService: IWorkspaceService;
	let requestLogger: IRequestLogger;

	beforeEach(() => {
		disposables = new DisposableStore();
		workspaceService = disposables.add(new TestWorkspaceService());
		configService = new InMemoryConfigurationService(new DefaultsOnlyConfigurationService());
		snippyService = new NullSnippyService();
		gitExtensionService = new NullGitExtensionService();
		logService = new LogServiceImpl([]);
		expService = new NullExperimentationService();
		requestLogger = new NullRequestLogger();
	});

	afterEach(() => {
		disposables.dispose();
	});

	function createProviderAndWorkspace(statelessProvider: IStatelessNextEditProvider): { nextEditProvider: NextEditProvider; workspace: MutableObservableWorkspace } {
		const workspace = new MutableObservableWorkspace();
		const git = new ObservableGit(gitExtensionService);
		const nextEditProvider = new NextEditProvider(
			workspace,
			statelessProvider,
			new NesHistoryContextProvider(workspace, git),
			new NesXtabHistoryTracker(workspace, undefined, configService, expService),
			undefined,
			configService,
			snippyService,
			logService,
			expService,
			requestLogger,
		);
		return { nextEditProvider, workspace };
	}

	async function getNextEdit(nextEditProvider: NextEditProvider, docId: DocumentId) {
		const context = createInlineContext();
		const logContext = new InlineEditRequestLogContext(docId.toString(), 1, context);
		const telemetryBuilder = new NextEditProviderTelemetryBuilder(gitExtensionService, mockNotebookService, workspaceService, nextEditProvider.ID, undefined);
		try {
			return await nextEditProvider.getNextEdit(docId, context, logContext, CancellationToken.None, telemetryBuilder.nesBuilder);
		} finally {
			telemetryBuilder.dispose();
		}
	}

	async function getNextEditWithTelemetry(nextEditProvider: NextEditProvider, docId: DocumentId): Promise<{ suggestion: Awaited<ReturnType<typeof getNextEdit>>; telemetry: ILlmNESTelemetry }> {
		const context = createInlineContext();
		const logContext = new InlineEditRequestLogContext(docId.toString(), 1, context);
		const telemetryBuilder = new NextEditProviderTelemetryBuilder(gitExtensionService, mockNotebookService, workspaceService, nextEditProvider.ID, undefined);
		try {
			const suggestion = await nextEditProvider.getNextEdit(docId, context, logContext, CancellationToken.None, telemetryBuilder.nesBuilder);
			const telemetry = telemetryBuilder.nesBuilder.build(false);
			return { suggestion, telemetry };
		} finally {
			telemetryBuilder.dispose();
		}
	}

	it('does not trigger speculative request when feature is off', async () => {
		await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.Off);

		const statelessProvider = new TestStatelessNextEditProvider();
		statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'const value = 2;') });
		const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

		const doc = workspace.addDocument({
			id: DocumentId.create(URI.file('/test/spec-off.ts').toString()),
			initialValue: 'const value = 1;\nconsole.log(value);',
		});
		doc.setSelection([new OffsetRange(0, 0)], undefined);

		const suggestion = await getNextEdit(nextEditProvider, doc.id);
		assert(suggestion.result?.edit);

		nextEditProvider.handleShown(suggestion);
		await flushMicrotasks();

		expect(statelessProvider.calls.length).toBe(1);
	});

	it('triggers speculative request when feature is on', async () => {
		await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);

		const statelessProvider = new TestStatelessNextEditProvider();
		statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'const value = 2;') });
		statelessProvider.enqueueBehavior({ kind: 'waitForCancellation' });
		const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

		const doc = workspace.addDocument({
			id: DocumentId.create(URI.file('/test/spec-on.ts').toString()),
			initialValue: 'const value = 1;\nconsole.log(value);',
		});
		doc.setSelection([new OffsetRange(0, 0)], undefined);

		const suggestion = await getNextEdit(nextEditProvider, doc.id);
		assert(suggestion.result?.edit);

		nextEditProvider.handleShown(suggestion);
		await statelessProvider.waitForCall(2);

		expect(statelessProvider.calls.length).toBe(2);
		nextEditProvider.handleRejection(doc.id, suggestion);
		await statelessProvider.calls[1].completed.p;
	});

	it('reuses speculative request after acceptance without creating a third request', async () => {
		await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);

		const statelessProvider = new TestStatelessNextEditProvider();
		statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'const value = 2;') });
		statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(2, 'console.log(value + 1);') });
		const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

		const doc = workspace.addDocument({
			id: DocumentId.create(URI.file('/test/spec-reuse.ts').toString()),
			initialValue: 'const value = 1;\nconsole.log(value);',
		});
		doc.setSelection([new OffsetRange(0, 0)], undefined);

		const firstSuggestion = await getNextEdit(nextEditProvider, doc.id);
		assert(firstSuggestion.result?.edit);
		nextEditProvider.handleShown(firstSuggestion);
		await statelessProvider.waitForCall(2);
		await statelessProvider.calls[1].completed.p;

		nextEditProvider.handleAcceptance(doc.id, firstSuggestion);
		doc.applyEdit(firstSuggestion.result.edit.toEdit());

		const secondSuggestion = await getNextEdit(nextEditProvider, doc.id);
		assert(secondSuggestion.result?.edit);

		expect(statelessProvider.calls.length).toBe(2);
		expect(secondSuggestion.result.edit.newText).toBe('console.log(value + 1);');
	});

	it('cancels speculative request on rejection', async () => {
		await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);

		const statelessProvider = new TestStatelessNextEditProvider();
		statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'const value = 2;') });
		statelessProvider.enqueueBehavior({ kind: 'waitForCancellation' });
		const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

		const doc = workspace.addDocument({
			id: DocumentId.create(URI.file('/test/spec-reject.ts').toString()),
			initialValue: 'const value = 1;\nconsole.log(value);',
		});
		doc.setSelection([new OffsetRange(0, 0)], undefined);

		const suggestion = await getNextEdit(nextEditProvider, doc.id);
		assert(suggestion.result?.edit);
		nextEditProvider.handleShown(suggestion);
		await statelessProvider.waitForCall(2);

		nextEditProvider.handleRejection(doc.id, suggestion);
		await statelessProvider.calls[1].cancellationRequested.p;

		expect(statelessProvider.calls[1].wasCancelled).toBe(true);
	});

	it('cancels speculative request on ignored when suggestion was shown and not superseded', async () => {
		await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);

		const statelessProvider = new TestStatelessNextEditProvider();
		statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'const value = 2;') });
		statelessProvider.enqueueBehavior({ kind: 'waitForCancellation' });
		const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

		const doc = workspace.addDocument({
			id: DocumentId.create(URI.file('/test/spec-ignored.ts').toString()),
			initialValue: 'const value = 1;\nconsole.log(value);',
		});
		doc.setSelection([new OffsetRange(0, 0)], undefined);

		const suggestion = await getNextEdit(nextEditProvider, doc.id);
		assert(suggestion.result?.edit);
		nextEditProvider.handleShown(suggestion);
		await statelessProvider.waitForCall(2);

		nextEditProvider.handleIgnored(doc.id, suggestion, undefined);
		await statelessProvider.calls[1].cancellationRequested.p;

		expect(statelessProvider.calls[1].wasCancelled).toBe(true);
	});

	it('does not cancel speculative request on unrelated open-document changes', async () => {
		await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);

		const statelessProvider = new TestStatelessNextEditProvider();
		statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'const value = 2;') });
		statelessProvider.enqueueBehavior({ kind: 'waitForCancellation' });
		const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

		const activeDoc = workspace.addDocument({
			id: DocumentId.create(URI.file('/test/spec-active.ts').toString()),
			initialValue: 'const value = 1;\nconsole.log(value);',
		});
		activeDoc.setSelection([new OffsetRange(0, 0)], undefined);

		const unrelatedDoc = workspace.addDocument({
			id: DocumentId.create(URI.file('/test/spec-other.ts').toString()),
			initialValue: 'export const other = 1;',
		});
		unrelatedDoc.setSelection([new OffsetRange(0, 0)], undefined);

		const suggestion = await getNextEdit(nextEditProvider, activeDoc.id);
		assert(suggestion.result?.edit);
		nextEditProvider.handleShown(suggestion);
		await statelessProvider.waitForCall(2);

		unrelatedDoc.applyEdit(StringEdit.insert(0, '// unrelated change\n'));
		await flushMicrotasks();

		expect(statelessProvider.calls[1].wasCancelled).toBe(false);

		nextEditProvider.handleRejection(activeDoc.id, suggestion);
		await statelessProvider.calls[1].completed.p;
	});

	it('does not cancel speculative request when active document diverges from expected post-edit state', async () => {
		await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);

		const statelessProvider = new TestStatelessNextEditProvider();
		statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'const value = 2;') });
		statelessProvider.enqueueBehavior({ kind: 'waitForCancellation' });
		const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

		const doc = workspace.addDocument({
			id: DocumentId.create(URI.file('/test/spec-diverge.ts').toString()),
			initialValue: 'const value = 1;\nconsole.log(value);',
		});
		doc.setSelection([new OffsetRange(0, 0)], undefined);

		const suggestion = await getNextEdit(nextEditProvider, doc.id);
		assert(suggestion.result?.edit);
		nextEditProvider.handleShown(suggestion);
		await statelessProvider.waitForCall(2);

		// Editing the active document should NOT cancel the speculative request.
		// The speculative request targets a future post-edit state, not the current
		// document value, so keystroke-level changes should not invalidate it.
		doc.applyEdit(StringEdit.insert(0, '/* diverged */\n'));
		await flushMicrotasks();

		expect(statelessProvider.calls[1].wasCancelled).toBe(false);

		// Clean up: reject so the speculative request gets cancelled properly
		nextEditProvider.handleRejection(doc.id, suggestion);
		await statelessProvider.calls[1].completed.p;
	});

	it('keeps speculative request alive when user types in the active document', async () => {
		await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);

		const statelessProvider = new TestStatelessNextEditProvider();
		statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'const value = 2;') });
		statelessProvider.enqueueBehavior({ kind: 'waitForCancellation' });
		const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

		const doc = workspace.addDocument({
			id: DocumentId.create(URI.file('/test/spec-typing.ts').toString()),
			initialValue: 'const value = 1;\nconsole.log(value);',
		});
		doc.setSelection([new OffsetRange(0, 0)], undefined);

		const suggestion = await getNextEdit(nextEditProvider, doc.id);
		assert(suggestion.result?.edit);
		nextEditProvider.handleShown(suggestion);
		await statelessProvider.waitForCall(2);

		// Simulate multiple keystrokes in the active document while the speculative
		// request is in flight — none of them should cancel it.
		doc.applyEdit(StringEdit.insert(0, 'a'));
		await flushMicrotasks();
		expect(statelessProvider.calls[1].wasCancelled).toBe(false);

		doc.applyEdit(StringEdit.insert(1, 'b'));
		await flushMicrotasks();
		expect(statelessProvider.calls[1].wasCancelled).toBe(false);

		doc.applyEdit(StringEdit.insert(2, 'c'));
		await flushMicrotasks();
		expect(statelessProvider.calls[1].wasCancelled).toBe(false);

		// Clean up via rejection
		nextEditProvider.handleRejection(doc.id, suggestion);
		await statelessProvider.calls[1].completed.p;
	});

	it('cancels mismatched speculative request when starting a request for another document', async () => {
		await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);

		const statelessProvider = new TestStatelessNextEditProvider();
		statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'const value = 2;') });
		statelessProvider.enqueueBehavior({ kind: 'waitForCancellation' });
		statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'export const second = 2;') });
		const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

		const doc1 = workspace.addDocument({
			id: DocumentId.create(URI.file('/test/spec-cross-doc-1.ts').toString()),
			initialValue: 'const value = 1;\nconsole.log(value);',
		});
		doc1.setSelection([new OffsetRange(0, 0)], undefined);

		const doc2 = workspace.addDocument({
			id: DocumentId.create(URI.file('/test/spec-cross-doc-2.ts').toString()),
			initialValue: 'export const second = 1;\nconsole.log(second);',
		});
		doc2.setSelection([new OffsetRange(0, 0)], undefined);

		const suggestion = await getNextEdit(nextEditProvider, doc1.id);
		assert(suggestion.result?.edit);
		nextEditProvider.handleShown(suggestion);
		await statelessProvider.waitForCall(2);

		const secondDocSuggestion = await getNextEdit(nextEditProvider, doc2.id);
		assert(secondDocSuggestion.result?.edit);
		await statelessProvider.calls[1].cancellationRequested.p;

		expect(statelessProvider.calls[1].wasCancelled).toBe(true);
		expect(statelessProvider.calls.length).toBe(3);
	});

	describe('telemetry', () => {
		it('fresh request has normal headerRequestId and no reusedRequest', async () => {
			const statelessProvider = new TestStatelessNextEditProvider();
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'const value = 2;') });
			const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

			const doc = workspace.addDocument({
				id: DocumentId.create(URI.file('/test/telemetry-fresh.ts').toString()),
				initialValue: 'const value = 1;\nconsole.log(value);',
			});
			doc.setSelection([new OffsetRange(0, 0)], undefined);

			const { suggestion, telemetry } = await getNextEditWithTelemetry(nextEditProvider, doc.id);
			assert(suggestion.result?.edit);

			expect(telemetry.headerRequestId).toBeDefined();
			expect(telemetry.headerRequestId!.startsWith('sp-')).toBe(false);
			expect(telemetry.isFromCache).toBe(false);
			expect(telemetry.reusedRequest).toBeUndefined();
		});

		it('reused speculative request has sp- headerRequestId and reusedRequest=speculative', async () => {
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);

			const statelessProvider = new TestStatelessNextEditProvider();
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'const value = 2;') });
			// The speculative request yields an edit but stays in-flight until we signal it,
			// so the second getNextEdit joins the pending speculative request rather than hitting cache.
			const specContinue = new DeferredPromise<void>();
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenWait', edit: lineReplacement(2, 'console.log(value + 1);'), continueSignal: specContinue });
			const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

			const doc = workspace.addDocument({
				id: DocumentId.create(URI.file('/test/telemetry-spec-reuse.ts').toString()),
				initialValue: 'const value = 1;\nconsole.log(value);',
			});
			doc.setSelection([new OffsetRange(0, 0)], undefined);

			// First request: fresh
			const firstSuggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(firstSuggestion.result?.edit);
			nextEditProvider.handleShown(firstSuggestion);
			await statelessProvider.waitForCall(2);
			// Speculative request is now in-flight (yielded edit but waiting on continueSignal)

			// Accept and apply the edit
			nextEditProvider.handleAcceptance(doc.id, firstSuggestion);
			doc.applyEdit(firstSuggestion.result.edit.toEdit());

			// Second request: should join the still-in-flight speculative request
			const { suggestion: secondSuggestion, telemetry } = await getNextEditWithTelemetry(nextEditProvider, doc.id);
			assert(secondSuggestion.result?.edit);

			expect(telemetry.headerRequestId).toBeDefined();
			expect(telemetry.headerRequestId!.startsWith('sp-')).toBe(true);
			expect(telemetry.isFromCache).toBe(false);
			expect(telemetry.reusedRequest).toBe(ReusedRequestKind.Speculative);

			// Clean up: let the speculative request finish
			specContinue.complete();
			await statelessProvider.calls[1].completed.p;
		});

		it('skips cache delay for edits from speculative requests even when enforceCacheDelay is true', async () => {
			const CACHE_DELAY_MS = 5_000;
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsCacheDelay, CACHE_DELAY_MS);
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequestDelay, 0);

			const statelessProvider = new TestStatelessNextEditProvider();
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'const value = 2;') });
			const specContinue = new DeferredPromise<void>();
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenWait', edit: lineReplacement(2, 'console.log(value + 1);'), continueSignal: specContinue });
			const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

			const doc = workspace.addDocument({
				id: DocumentId.create(URI.file('/test/spec-skip-delay.ts').toString()),
				initialValue: 'const value = 1;\nconsole.log(value);',
			});
			doc.setSelection([new OffsetRange(0, 0)], undefined);

			// First request (fresh, no cache delay since enforceCacheDelay=false)
			const firstSuggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(firstSuggestion.result?.edit);
			nextEditProvider.handleShown(firstSuggestion);
			await statelessProvider.waitForCall(2);

			// Accept and apply the suggestion — doc now matches speculative request's postEditContent
			nextEditProvider.handleAcceptance(doc.id, firstSuggestion);
			doc.applyEdit(firstSuggestion.result.edit.toEdit());

			// Second request with enforceCacheDelay=true — should still return fast because the result
			// comes from a speculative request, which uses speculativeRequestDelay (0) instead of cacheDelay (5000)
			const context: NESInlineCompletionContext = {
				triggerKind: 1,
				selectedCompletionInfo: undefined,
				requestUuid: generateUuid(),
				requestIssuedDateTime: Date.now(),
				earliestShownDateTime: Date.now(),
				enforceCacheDelay: true,
			};
			const logContext = new InlineEditRequestLogContext(doc.id.toString(), 1, context);
			const telemetryBuilder = new NextEditProviderTelemetryBuilder(gitExtensionService, mockNotebookService, workspaceService, nextEditProvider.ID, undefined);
			const start = Date.now();
			try {
				const secondSuggestion = await nextEditProvider.getNextEdit(doc.id, context, logContext, CancellationToken.None, telemetryBuilder.nesBuilder);
				const elapsed = Date.now() - start;
				assert(secondSuggestion.result?.edit);
				expect(elapsed).toBeLessThan(100);
			} finally {
				telemetryBuilder.dispose();
				specContinue.complete();
				await statelessProvider.calls[1].completed.p;
			}
		});

		it('cached speculative result has sp- headerRequestId and isFromCache=true', async () => {
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);

			const statelessProvider = new TestStatelessNextEditProvider();
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'const value = 2;') });
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(2, 'console.log(value + 1);') });
			const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

			const doc = workspace.addDocument({
				id: DocumentId.create(URI.file('/test/telemetry-spec-cache.ts').toString()),
				initialValue: 'const value = 1;\nconsole.log(value);',
			});
			doc.setSelection([new OffsetRange(0, 0)], undefined);

			// First request: fresh
			const firstSuggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(firstSuggestion.result?.edit);
			nextEditProvider.handleShown(firstSuggestion);
			await statelessProvider.waitForCall(2);
			await statelessProvider.calls[1].completed.p;

			// Accept and apply (speculative result is now cached)
			nextEditProvider.handleAcceptance(doc.id, firstSuggestion);
			doc.applyEdit(firstSuggestion.result.edit.toEdit());

			// Clear the speculative pending request by requesting once (consumes it from pending)
			const consumeResult = await getNextEdit(nextEditProvider, doc.id);
			assert(consumeResult.result?.edit);

			// Now the result is in cache. Request again at same document state.
			const { suggestion: cachedSuggestion, telemetry } = await getNextEditWithTelemetry(nextEditProvider, doc.id);
			assert(cachedSuggestion.result?.edit);

			expect(telemetry.headerRequestId).toBeDefined();
			expect(telemetry.headerRequestId!.startsWith('sp-')).toBe(true);
			expect(telemetry.isFromCache).toBe(true);
			expect(telemetry.reusedRequest).toBeUndefined();
		});
	});

	describe('isSpeculative and isSubsequentEdit flags', () => {
		it('normal request result has isSpeculative = false and isSubsequentEdit = false', async () => {
			const statelessProvider = new TestStatelessNextEditProvider();
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'const value = 2;') });
			const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

			const doc = workspace.addDocument({
				id: DocumentId.create(URI.file('/test/flags-normal.ts').toString()),
				initialValue: 'const value = 1;\nconsole.log(value);',
			});
			doc.setSelection([new OffsetRange(0, 0)], undefined);

			const suggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(suggestion.result?.edit);

			expect(suggestion.source.isSpeculative).toBe(false);
			expect(suggestion.result.isSubsequentEdit).toBe(false);
		});

		it('reused speculative result has isSpeculative = true on source', async () => {
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);

			const statelessProvider = new TestStatelessNextEditProvider();
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'const value = 2;') });
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(2, 'console.log(value + 1);') });
			const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

			const doc = workspace.addDocument({
				id: DocumentId.create(URI.file('/test/flags-speculative.ts').toString()),
				initialValue: 'const value = 1;\nconsole.log(value);',
			});
			doc.setSelection([new OffsetRange(0, 0)], undefined);

			const firstSuggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(firstSuggestion.result?.edit);
			expect(firstSuggestion.source.isSpeculative).toBe(false);

			nextEditProvider.handleShown(firstSuggestion);
			await statelessProvider.waitForCall(2);
			await statelessProvider.calls[1].completed.p;

			nextEditProvider.handleAcceptance(doc.id, firstSuggestion);
			doc.applyEdit(firstSuggestion.result.edit.toEdit());

			const secondSuggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(secondSuggestion.result?.edit);

			expect(secondSuggestion.source.isSpeculative).toBe(true);
		});
	});

	describe('SpeculativeRequestsAutoExpandEditWindowLines', () => {
		it('Off: speculative request has expandedEditWindowNLines = undefined', async () => {
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequestsAutoExpandEditWindowLines, SpeculativeRequestsAutoExpandEditWindowLines.Off);

			const statelessProvider = new TestStatelessNextEditProvider();
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'const value = 2;') });
			statelessProvider.enqueueBehavior({ kind: 'waitForCancellation' });
			const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

			const doc = workspace.addDocument({
				id: DocumentId.create(URI.file('/test/expand-off.ts').toString()),
				initialValue: 'const value = 1;\nconsole.log(value);',
			});
			doc.setSelection([new OffsetRange(0, 0)], undefined);

			const suggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(suggestion.result?.edit);

			nextEditProvider.handleShown(suggestion);
			await statelessProvider.waitForCall(2);

			expect(statelessProvider.calls[1].request.expandedEditWindowNLines).toBeUndefined();

			nextEditProvider.handleRejection(doc.id, suggestion);
			await statelessProvider.calls[1].completed.p;
		});

		it('Always: speculative request has expandedEditWindowNLines from base config', async () => {
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequestsAutoExpandEditWindowLines, SpeculativeRequestsAutoExpandEditWindowLines.Always);
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsAutoExpandEditWindowLines, 20);

			const statelessProvider = new TestStatelessNextEditProvider();
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'const value = 2;') });
			statelessProvider.enqueueBehavior({ kind: 'waitForCancellation' });
			const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

			const doc = workspace.addDocument({
				id: DocumentId.create(URI.file('/test/expand-always.ts').toString()),
				initialValue: 'const value = 1;\nconsole.log(value);',
			});
			doc.setSelection([new OffsetRange(0, 0)], undefined);

			const suggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(suggestion.result?.edit);

			nextEditProvider.handleShown(suggestion);
			await statelessProvider.waitForCall(2);

			expect(statelessProvider.calls[1].request.expandedEditWindowNLines).toBe(20);

			nextEditProvider.handleRejection(doc.id, suggestion);
			await statelessProvider.calls[1].completed.p;
		});

		it('Smart: expandedEditWindowNLines is undefined for first non-speculative edit', async () => {
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequestsAutoExpandEditWindowLines, SpeculativeRequestsAutoExpandEditWindowLines.Smart);
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsAutoExpandEditWindowLines, 20);

			const statelessProvider = new TestStatelessNextEditProvider();
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'const value = 2;') });
			statelessProvider.enqueueBehavior({ kind: 'waitForCancellation' });
			const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

			const doc = workspace.addDocument({
				id: DocumentId.create(URI.file('/test/expand-smart-first.ts').toString()),
				initialValue: 'const value = 1;\nconsole.log(value);',
			});
			doc.setSelection([new OffsetRange(0, 0)], undefined);

			// First suggestion is from a normal (non-speculative) request
			const suggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(suggestion.result?.edit);

			nextEditProvider.handleShown(suggestion);
			await statelessProvider.waitForCall(2);

			// The speculative request triggered from a non-speculative first edit
			// should NOT expand the edit window in Smart mode
			expect(statelessProvider.calls[1].request.expandedEditWindowNLines).toBeUndefined();

			nextEditProvider.handleRejection(doc.id, suggestion);
			await statelessProvider.calls[1].completed.p;
		});

		it('Smart: expandedEditWindowNLines uses base config when triggered by speculative chain', async () => {
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequestsAutoExpandEditWindowLines, SpeculativeRequestsAutoExpandEditWindowLines.Smart);
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsAutoExpandEditWindowLines, 20);

			const statelessProvider = new TestStatelessNextEditProvider();
			// First normal request
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'const value = 2;') });
			// Speculative request after first edit
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(2, 'console.log(value + 1);') });
			// Speculative request after second (speculative-sourced) edit
			statelessProvider.enqueueBehavior({ kind: 'waitForCancellation' });
			const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

			const doc = workspace.addDocument({
				id: DocumentId.create(URI.file('/test/expand-smart-chain.ts').toString()),
				initialValue: 'const value = 1;\nconsole.log(value);',
			});
			doc.setSelection([new OffsetRange(0, 0)], undefined);

			// Step 1: Get first edit (normal, non-speculative)
			const firstSuggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(firstSuggestion.result?.edit);

			// Step 2: Show → triggers speculative request (call 2)
			nextEditProvider.handleShown(firstSuggestion);
			await statelessProvider.waitForCall(2);
			await statelessProvider.calls[1].completed.p;

			// Step 3: Accept and apply → doc matches speculative post-edit state
			nextEditProvider.handleAcceptance(doc.id, firstSuggestion);
			doc.applyEdit(firstSuggestion.result.edit.toEdit());

			// Step 4: Get second edit → reuses speculative result (source.isSpeculative = true)
			const secondSuggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(secondSuggestion.result?.edit);
			assert(secondSuggestion.source.isSpeculative);

			// Step 5: Show second suggestion → triggers another speculative request (call 3)
			nextEditProvider.handleShown(secondSuggestion);
			await statelessProvider.waitForCall(3);

			// The 3rd call is a speculative request triggered by a speculative-sourced edit,
			// so in Smart mode, isModelOnRightTrack = true and edit window should be expanded
			expect(statelessProvider.calls[2].request.expandedEditWindowNLines).toBe(20);

			nextEditProvider.handleRejection(doc.id, secondSuggestion);
			await statelessProvider.calls[2].completed.p;
		});
	});

	describe('scheduled speculative requests for multi-edit streams', () => {
		it('does not trigger speculative when shown edit is not the last in a multi-edit stream', async () => {
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);

			const statelessProvider = new TestStatelessNextEditProvider();
			const continueSignal = new DeferredPromise<void>();
			statelessProvider.enqueueBehavior({
				kind: 'yieldEditThenWaitThenYieldEditsThenNoSuggestions',
				firstEdit: lineReplacement(1, 'const value = 2;'),
				continueSignal,
				remainingEdits: [lineReplacement(2, 'console.log(value + 1);')],
			});
			const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

			const doc = workspace.addDocument({
				id: DocumentId.create(URI.file('/test/spec-multi-not-last.ts').toString()),
				initialValue: 'const value = 1;\nconsole.log(value);',
			});
			doc.setSelection([new OffsetRange(0, 0)], undefined);

			// Get first edit (E0) — stream is paused on continueSignal
			const suggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(suggestion.result?.edit);

			// Show E0 — stream still running → speculative is scheduled (not fired)
			nextEditProvider.handleShown(suggestion);

			// Resume stream — E1 arrives → clears the scheduled speculative
			continueSignal.complete();
			await statelessProvider.calls[0].completed.p;
			await flushMicrotasks();

			// Only the original request was made — no speculative request
			expect(statelessProvider.calls.length).toBe(1);
		});

		it('triggers speculative after stream completes when shown edit is the last one', async () => {
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);

			const statelessProvider = new TestStatelessNextEditProvider();
			const continueSignal = new DeferredPromise<void>();
			statelessProvider.enqueueBehavior({
				kind: 'yieldEditThenWait',
				edit: lineReplacement(1, 'const value = 2;'),
				continueSignal,
			});
			statelessProvider.enqueueBehavior({ kind: 'waitForCancellation' });
			const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

			const doc = workspace.addDocument({
				id: DocumentId.create(URI.file('/test/spec-last-edit.ts').toString()),
				initialValue: 'const value = 1;\nconsole.log(value);',
			});
			doc.setSelection([new OffsetRange(0, 0)], undefined);

			// Get first edit (E0) — stream paused on continueSignal
			const suggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(suggestion.result?.edit);

			// Show E0 — stream still running → speculative is scheduled
			nextEditProvider.handleShown(suggestion);

			// Resume stream — no more edits → stream ends → scheduled speculative fires
			continueSignal.complete();
			// The speculative fires from handleStreamEnd (background IIFE), so we need
			// microtasks to propagate through the async chain before the call arrives.
			await flushMicrotasks();

			expect(statelessProvider.calls.length).toBe(2);
			expect(statelessProvider.calls[1].request.isSpeculative).toBe(true);

			nextEditProvider.handleRejection(doc.id, suggestion);
			await statelessProvider.calls[1].completed.p;
		});

		it('clears scheduled speculative on rejection before stream completes', async () => {
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);

			const statelessProvider = new TestStatelessNextEditProvider();
			const continueSignal = new DeferredPromise<void>();
			statelessProvider.enqueueBehavior({
				kind: 'yieldEditThenWait',
				edit: lineReplacement(1, 'const value = 2;'),
				continueSignal,
			});
			const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

			const doc = workspace.addDocument({
				id: DocumentId.create(URI.file('/test/spec-reject-before-end.ts').toString()),
				initialValue: 'const value = 1;\nconsole.log(value);',
			});
			doc.setSelection([new OffsetRange(0, 0)], undefined);

			// Get E0, stream paused
			const suggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(suggestion.result?.edit);

			// Show → schedules speculative
			nextEditProvider.handleShown(suggestion);

			// Reject before stream completes → clears schedule
			nextEditProvider.handleRejection(doc.id, suggestion);

			// Let stream finish
			continueSignal.complete();
			await statelessProvider.calls[0].completed.p;
			await flushMicrotasks();

			// No speculative request was created
			expect(statelessProvider.calls.length).toBe(1);
		});

		it('clears scheduled speculative on handleIgnored (shown, not superseded) before stream completes', async () => {
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);

			const statelessProvider = new TestStatelessNextEditProvider();
			const continueSignal = new DeferredPromise<void>();
			statelessProvider.enqueueBehavior({
				kind: 'yieldEditThenWait',
				edit: lineReplacement(1, 'const value = 2;'),
				continueSignal,
			});
			const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

			const doc = workspace.addDocument({
				id: DocumentId.create(URI.file('/test/spec-ignored-before-end.ts').toString()),
				initialValue: 'const value = 1;\nconsole.log(value);',
			});
			doc.setSelection([new OffsetRange(0, 0)], undefined);

			const suggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(suggestion.result?.edit);

			// Show → schedules speculative
			nextEditProvider.handleShown(suggestion);

			// Ignored (shown, not superseded) before stream completes → clears schedule
			nextEditProvider.handleIgnored(doc.id, suggestion, undefined);

			// Let stream finish
			continueSignal.complete();
			await statelessProvider.calls[0].completed.p;
			await flushMicrotasks();

			// No speculative request was created
			expect(statelessProvider.calls.length).toBe(1);
		});

		it('fires speculative immediately when stream already completed before handleShown', async () => {
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);

			const statelessProvider = new TestStatelessNextEditProvider();
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'const value = 2;') });
			statelessProvider.enqueueBehavior({ kind: 'waitForCancellation' });
			const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

			const doc = workspace.addDocument({
				id: DocumentId.create(URI.file('/test/spec-stream-done.ts').toString()),
				initialValue: 'const value = 1;\nconsole.log(value);',
			});
			doc.setSelection([new OffsetRange(0, 0)], undefined);

			const suggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(suggestion.result?.edit);

			// Ensure the background IIFE has completed (stream is done, pending request cleared)
			await flushMicrotasks();

			// Now handleShown sees no pending request → fires immediately (not scheduled)
			nextEditProvider.handleShown(suggestion);
			await statelessProvider.waitForCall(2);

			expect(statelessProvider.calls.length).toBe(2);
			expect(statelessProvider.calls[1].request.isSpeculative).toBe(true);

			nextEditProvider.handleRejection(doc.id, suggestion);
			await statelessProvider.calls[1].completed.p;
		});

		it('clears scheduled speculative when a new getNextEdit supersedes the originating stream', async () => {
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);

			const statelessProvider = new TestStatelessNextEditProvider();
			// Stream A: yields E0, then waits (simulating a paused multi-edit stream)
			const streamAContinue = new DeferredPromise<void>();
			statelessProvider.enqueueBehavior({
				kind: 'yieldEditThenWait',
				edit: lineReplacement(1, 'const value = 2;'),
				continueSignal: streamAContinue,
			});
			// Stream B: the new request that supersedes stream A
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'const value = 3;') });
			const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

			const doc = workspace.addDocument({
				id: DocumentId.create(URI.file('/test/spec-stale-schedule.ts').toString()),
				initialValue: 'const value = 1;\nconsole.log(value);',
			});
			doc.setSelection([new OffsetRange(0, 0)], undefined);

			// 1. Get E0 from stream A — stream is paused on streamAContinue
			const suggestionA = await getNextEdit(nextEditProvider, doc.id);
			assert(suggestionA.result?.edit);

			// 2. handleShown(E0) → speculative is scheduled (not fired, stream A still running)
			nextEditProvider.handleShown(suggestionA);

			// 3. A new getNextEdit supersedes stream A — should clear the scheduled speculative
			const suggestionB = await getNextEdit(nextEditProvider, doc.id);
			assert(suggestionB.result?.edit);

			// 4. Let stream A's background IIFE finish (after cancellation).
			//    Without the fix, handleStreamEnd would see the stale scheduled speculative
			//    and fire _triggerSpeculativeRequest for stream A's E0.
			streamAContinue.complete();
			await statelessProvider.calls[0].completed.p;
			await flushMicrotasks();

			// Only 2 calls: stream A and stream B. No stale speculative request fired.
			expect(statelessProvider.calls.length).toBe(2);
		});

		it('second handleShown replaces a previously scheduled speculative', async () => {
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);

			const statelessProvider = new TestStatelessNextEditProvider();
			const continueSignal = new DeferredPromise<void>();
			statelessProvider.enqueueBehavior({
				kind: 'yieldEditThenWait',
				edit: lineReplacement(1, 'const value = 2;'),
				continueSignal,
			});
			statelessProvider.enqueueBehavior({ kind: 'waitForCancellation' });
			const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

			const doc = workspace.addDocument({
				id: DocumentId.create(URI.file('/test/spec-replace-schedule.ts').toString()),
				initialValue: 'const value = 1;\nconsole.log(value);',
			});
			doc.setSelection([new OffsetRange(0, 0)], undefined);

			const suggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(suggestion.result?.edit);

			// First handleShown → schedules speculative (stream still running)
			nextEditProvider.handleShown(suggestion);

			// Second handleShown for the same suggestion → clears the previous schedule
			// and sets a new one for the same headerRequestId
			nextEditProvider.handleShown(suggestion);

			// Resume stream → stream ends → the (second) scheduled speculative fires
			continueSignal.complete();
			await flushMicrotasks();

			// Exactly one speculative request was created (not two)
			expect(statelessProvider.calls.length).toBe(2);
			expect(statelessProvider.calls[1].request.isSpeculative).toBe(true);

			nextEditProvider.handleRejection(doc.id, suggestion);
			await statelessProvider.calls[1].completed.p;
		});
	});

	describe('edit window cursor check for request reuse', () => {
		beforeEach(async () => {
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsCheckEditWindowOnReuse, true);
		});

		it('does not reuse in-flight request when cursor moves outside edit window', async () => {
			const statelessProvider = new TestStatelessNextEditProvider();
			// Edit window covers offsets 0–20 of the document
			statelessProvider.editWindow = new RequestEditWindow(new OffsetRange(0, 20));
			const continueSignal1 = new DeferredPromise<void>();
			const continueSignal2 = new DeferredPromise<void>();
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenWait', edit: lineReplacement(1, 'const value = 2;'), continueSignal: continueSignal1 });
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenWait', edit: lineReplacement(1, 'const value = 3;'), continueSignal: continueSignal2 });
			const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

			const doc = workspace.addDocument({
				id: DocumentId.create(URI.file('/test/ew-outside.ts').toString()),
				initialValue: 'const value = 1;\nconsole.log(value);\nconst other = 3;\n',
			});
			doc.setSelection([new OffsetRange(0, 0)], undefined);

			// First request — yields first edit, stream still running in background
			const firstSuggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(firstSuggestion.result?.edit);
			expect(statelessProvider.calls.length).toBe(1);

			// Move cursor far outside the edit window (offset 40)
			doc.setSelection([new OffsetRange(40, 40)], undefined);

			// Second request — should NOT reuse the in-flight request because cursor is outside edit window
			// The first request's stream is still running, but cursor is outside its edit window, so a new request is made
			const secondSuggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(secondSuggestion.result?.edit);

			// Two separate provider calls were made
			expect(statelessProvider.calls.length).toBe(2);

			// Clean up
			continueSignal1.complete();
			continueSignal2.complete();
			await statelessProvider.calls[0].completed.p;
			await statelessProvider.calls[1].completed.p;
		});

		it('reuses in-flight request when cursor stays within edit window', async () => {
			const statelessProvider = new TestStatelessNextEditProvider();
			// Edit window covers offsets 0–50 (whole document)
			statelessProvider.editWindow = new RequestEditWindow(new OffsetRange(0, 50));
			const continueSignal = new DeferredPromise<void>();
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenWait', edit: lineReplacement(1, 'const value = 2;'), continueSignal });
			const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

			const doc = workspace.addDocument({
				id: DocumentId.create(URI.file('/test/ew-inside.ts').toString()),
				initialValue: 'const value = 1;\nconsole.log(value);\n',
			});
			doc.setSelection([new OffsetRange(0, 0)], undefined);

			// First request — yields first edit, stream still running
			const firstSuggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(firstSuggestion.result?.edit);
			expect(statelessProvider.calls.length).toBe(1);

			// Move cursor but still within the edit window (offset 10)
			doc.setSelection([new OffsetRange(10, 10)], undefined);

			// Second request — should reuse the in-flight request
			const secondSuggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(secondSuggestion.result?.edit);

			// Only one provider call was made (reused)
			expect(statelessProvider.calls.length).toBe(1);

			// Clean up
			continueSignal.complete();
			await statelessProvider.calls[0].completed.p;
		});

		it('reuses in-flight request when editWindow is undefined (graceful fallback)', async () => {
			const statelessProvider = new TestStatelessNextEditProvider();
			// No editWindow set — should allow reuse
			const continueSignal = new DeferredPromise<void>();
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenWait', edit: lineReplacement(1, 'const value = 2;'), continueSignal });
			const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

			const doc = workspace.addDocument({
				id: DocumentId.create(URI.file('/test/ew-undefined.ts').toString()),
				initialValue: 'const value = 1;\nconsole.log(value);\nconst other = 3;\n',
			});
			doc.setSelection([new OffsetRange(0, 0)], undefined);

			// First request — yields first edit, stream still running
			const firstSuggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(firstSuggestion.result?.edit);
			expect(statelessProvider.calls.length).toBe(1);

			// Move cursor far away — but editWindow is undefined so reuse is allowed
			doc.setSelection([new OffsetRange(40, 40)], undefined);

			// Second request — should reuse (no edit window to check)
			const secondSuggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(secondSuggestion.result?.edit);

			expect(statelessProvider.calls.length).toBe(1);

			// Clean up
			continueSignal.complete();
			await statelessProvider.calls[0].completed.p;
		});

		it('does not reuse speculative request when cursor moves outside edit window', async () => {
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);

			const statelessProvider = new TestStatelessNextEditProvider();
			// Edit window covers offsets 0–20
			statelessProvider.editWindow = new RequestEditWindow(new OffsetRange(0, 20));
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'const value = 2;') });
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(2, 'console.log(value + 1);') });
			// Third behavior for the new request that will be needed since speculative won't be reused
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(2, 'console.log(value + 1);') });
			const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

			const doc = workspace.addDocument({
				id: DocumentId.create(URI.file('/test/ew-spec-outside.ts').toString()),
				initialValue: 'const value = 1;\nconsole.log(value);\nconst other = 3;\n',
			});
			doc.setSelection([new OffsetRange(0, 0)], undefined);

			const firstSuggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(firstSuggestion.result?.edit);
			nextEditProvider.handleShown(firstSuggestion);
			await statelessProvider.waitForCall(2);
			await statelessProvider.calls[1].completed.p;

			// Accept and apply the edit
			nextEditProvider.handleAcceptance(doc.id, firstSuggestion);
			doc.applyEdit(firstSuggestion.result.edit.toEdit());

			// Move cursor outside the speculative request's edit window
			doc.setSelection([new OffsetRange(40, 40)], undefined);

			// This should NOT reuse the speculative request (cursor is outside)
			await getNextEdit(nextEditProvider, doc.id);

			// Three calls: original, speculative, and a new one (speculative was not reused)
			expect(statelessProvider.calls.length).toBe(3);
		});

		it('reuses in-flight request when cursor is within originalWindow of cursor jump edit window', async () => {
			const statelessProvider = new TestStatelessNextEditProvider();
			// Cursor jump: new window is at 30–50, original window is at 0–20
			statelessProvider.editWindow = new RequestEditWindowWithCursorJump(new OffsetRange(30, 50), new OffsetRange(0, 20));
			const continueSignal = new DeferredPromise<void>();
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenWait', edit: lineReplacement(1, 'const value = 2;'), continueSignal });
			const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

			const doc = workspace.addDocument({
				id: DocumentId.create(URI.file('/test/ew-cursorjump.ts').toString()),
				initialValue: 'const value = 1;\nconsole.log(value);\nconst other = 3;\nconst extra = 4;\n',
			});
			doc.setSelection([new OffsetRange(0, 0)], undefined);

			// First request — yields first edit, stream still running
			const firstSuggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(firstSuggestion.result?.edit);
			expect(statelessProvider.calls.length).toBe(1);

			// Move cursor to offset 10 — inside originalWindow (0–20) but outside jump target (30–50)
			doc.setSelection([new OffsetRange(10, 10)], undefined);

			// Second request — should reuse because cursor is in originalWindow
			const secondSuggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(secondSuggestion.result?.edit);

			expect(statelessProvider.calls.length).toBe(1);

			// Clean up
			continueSignal.complete();
			await statelessProvider.calls[0].completed.p;
		});
	});

	describe('cached speculative result delay', () => {
		it('uses speculativeRequestDelay (not cacheDelay) when speculative result is served from cache', async () => {
			const CACHE_DELAY_MS = 5_000;
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, SpeculativeRequestsEnablement.On);
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsCacheDelay, CACHE_DELAY_MS);
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequestDelay, 0);

			const statelessProvider = new TestStatelessNextEditProvider();
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(1, 'const value = 2;') });
			statelessProvider.enqueueBehavior({ kind: 'yieldEditThenNoSuggestions', edit: lineReplacement(2, 'console.log(value + 1);') });
			const { nextEditProvider, workspace } = createProviderAndWorkspace(statelessProvider);

			const doc = workspace.addDocument({
				id: DocumentId.create(URI.file('/test/spec-cache-delay.ts').toString()),
				initialValue: 'const value = 1;\nconsole.log(value);',
			});
			doc.setSelection([new OffsetRange(0, 0)], undefined);

			// First request (fresh)
			const firstSuggestion = await getNextEdit(nextEditProvider, doc.id);
			assert(firstSuggestion.result?.edit);

			// Show → triggers speculative request; wait for it to complete and cache
			nextEditProvider.handleShown(firstSuggestion);
			await statelessProvider.waitForCall(2);
			await statelessProvider.calls[1].completed.p;

			// Accept and apply — doc now matches speculative request's postEditContent
			nextEditProvider.handleAcceptance(doc.id, firstSuggestion);
			doc.applyEdit(firstSuggestion.result.edit.toEdit());

			// Next getNextEdit hits the cache path (speculative result already cached).
			// With enforceCacheDelay=true, it should use speculativeRequestDelay (0ms),
			// NOT the normal cacheDelay (5000ms).
			const context: NESInlineCompletionContext = {
				triggerKind: 1,
				selectedCompletionInfo: undefined,
				requestUuid: generateUuid(),
				requestIssuedDateTime: Date.now(),
				earliestShownDateTime: Date.now(),
				enforceCacheDelay: true,
			};
			const logContext = new InlineEditRequestLogContext(doc.id.toString(), 1, context);
			const telemetryBuilder = new NextEditProviderTelemetryBuilder(gitExtensionService, mockNotebookService, workspaceService, nextEditProvider.ID, undefined);
			const start = Date.now();
			try {
				const cachedSuggestion = await nextEditProvider.getNextEdit(doc.id, context, logContext, CancellationToken.None, telemetryBuilder.nesBuilder);
				const elapsed = Date.now() - start;
				assert(cachedSuggestion.result?.edit);

				// The result comes from a speculative request's cache, so it should
				// use the speculative delay (0ms) rather than the cache delay (5000ms)
				expect(elapsed).toBeLessThan(100);
			} finally {
				telemetryBuilder.dispose();
			}
		});
	});
});
