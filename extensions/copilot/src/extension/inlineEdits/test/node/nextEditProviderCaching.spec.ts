/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { outdent } from 'outdent';
import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';
import { ConfigKey, ExperimentBasedConfig, ExperimentBasedConfigType, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { IGitExtensionService } from '../../../../platform/git/common/gitExtensionService';
import { NullGitExtensionService } from '../../../../platform/git/common/nullGitExtensionService';
import { DocumentId } from '../../../../platform/inlineEdits/common/dataTypes/documentId';
import { InlineEditRequestLogContext } from '../../../../platform/inlineEdits/common/inlineEditLogContext';
import { ObservableGit } from '../../../../platform/inlineEdits/common/observableGit';
import { MutableObservableWorkspace } from '../../../../platform/inlineEdits/common/observableWorkspace';
import { IStatelessNextEditProvider, NoNextEditReason, StatelessNextEditRequest, StatelessNextEditTelemetryBuilder, WithStatelessProviderTelemetry } from '../../../../platform/inlineEdits/common/statelessNextEditProvider';
import { NesHistoryContextProvider } from '../../../../platform/inlineEdits/common/workspaceEditTracker/nesHistoryContextProvider';
import { NesXtabHistoryTracker } from '../../../../platform/inlineEdits/common/workspaceEditTracker/nesXtabHistoryTracker';
import { ILogger, ILogService, LogServiceImpl } from '../../../../platform/log/common/logService';
import { IRequestLogger } from '../../../../platform/requestLogger/common/requestLogger';
import { NullRequestLogger } from '../../../../platform/requestLogger/node/nullRequestLogger';
import { ISnippyService, NullSnippyService } from '../../../../platform/snippy/common/snippyService';
import { IExperimentationService, NullExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { mockNotebookService } from '../../../../platform/test/common/testNotebookService';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { Result } from '../../../../util/common/result';
import { DeferredPromise, timeout } from '../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { generateUuid } from '../../../../util/vs/base/common/uuid';
import { LineEdit, LineReplacement } from '../../../../util/vs/editor/common/core/edits/lineEdit';
import { StringEdit } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { LineRange } from '../../../../util/vs/editor/common/core/ranges/lineRange';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { NESInlineCompletionContext, NextEditProvider } from '../../node/nextEditProvider';
import { NextEditProviderTelemetryBuilder } from '../../node/nextEditProviderTelemetry';

describe('NextEditProvider Caching', () => {

	let configService: IConfigurationService;
	let snippyService: ISnippyService;
	let gitExtensionService: IGitExtensionService;
	let logService: ILogService;
	let expService: IExperimentationService;
	let disposableStore: DisposableStore;
	let workspaceService: IWorkspaceService;
	let requestLogger: IRequestLogger;
	beforeAll(() => {
		disposableStore = new DisposableStore();
		workspaceService = disposableStore.add(new TestWorkspaceService());
		configService = new DefaultsOnlyConfigurationService();
		snippyService = new NullSnippyService();
		gitExtensionService = new NullGitExtensionService();
		logService = new LogServiceImpl([]);
		expService = new NullExperimentationService();
		requestLogger = new NullRequestLogger();
	});
	afterAll(() => {
		disposableStore.dispose();
	});
	function createStatelessNextEditProvider(patchIndices?: readonly (number | undefined)[]): IStatelessNextEditProvider {
		return {
			ID: 'TestNextEditProvider',
			provideNextEdit: async function*(request: StatelessNextEditRequest, logger: ILogger, logContext: InlineEditRequestLogContext, cancellationToken: CancellationToken) {
				const telemetryBuilder = new StatelessNextEditTelemetryBuilder(request.headerRequestId);
				const lineEdit = LineEdit.createFromUnsorted(
					[
						new LineReplacement(
							new LineRange(11, 12),
							['const myPoint = new Point3D(0, 1, 2);']
						),
						new LineReplacement(
							new LineRange(5, 5),
							['\t\tprivate readonly z: number,']
						),
						new LineReplacement(
							new LineRange(6, 9),
							[
								'\tgetDistance() {',
								'\t\treturn Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2);',
								'\t}'
							]
						)
					]
				);
				let editIndex = 0;
				for (const edit of lineEdit.replacements) {
					const patchIndex = patchIndices ? patchIndices[editIndex] : undefined;
					editIndex++;
					yield new WithStatelessProviderTelemetry({ targetDocument: request.getActiveDocument().id, edit, isFromCursorJump: false, patchIndex }, telemetryBuilder.build(Result.ok(undefined)));
				}
				const noSuggestions = new NoNextEditReason.NoSuggestions(request.documentBeforeEdits, undefined);
				return new WithStatelessProviderTelemetry(noSuggestions, telemetryBuilder.build(Result.error(noSuggestions)));
			}
		};
	}

	it('caches a response with multiple edits and reuses them correctly with rebasing', async () => {
		const obsWorkspace = new MutableObservableWorkspace();
		const obsGit = new ObservableGit(gitExtensionService);
		const statelessNextEditProvider = createStatelessNextEditProvider();

		const nextEditProvider: NextEditProvider = new NextEditProvider(obsWorkspace, statelessNextEditProvider, new NesHistoryContextProvider(obsWorkspace, obsGit), new NesXtabHistoryTracker(obsWorkspace, undefined, configService, expService), undefined, configService, snippyService, logService, expService, requestLogger);

		const doc = obsWorkspace.addDocument({
			id: DocumentId.create(URI.file('/test/test.ts').toString()),
			initialValue: outdent`
			class Point {
				constructor(
					private readonly x: number,
					private readonly y: number,
				) { }
				getDistance() {
					return Math.sqrt(this.x ** 2 + this.y ** 2);
				}
			}

			const myPoint = new Point(0, 1);`.trimStart()
		});
		doc.setSelection([new OffsetRange(1, 1)], undefined);

		doc.applyEdit(StringEdit.insert(11, '3D'));

		const context: NESInlineCompletionContext = { triggerKind: 1, selectedCompletionInfo: undefined, requestUuid: generateUuid(), requestIssuedDateTime: Date.now(), earliestShownDateTime: Date.now() + 200, enforceCacheDelay: false };
		const logContext = new InlineEditRequestLogContext(doc.id.toString(), 1, context);
		const cancellationToken = CancellationToken.None;
		const tb1 = new NextEditProviderTelemetryBuilder(gitExtensionService, mockNotebookService, workspaceService, nextEditProvider.ID, doc);

		let result = await nextEditProvider.getNextEdit(doc.id, context, logContext, cancellationToken, tb1.nesBuilder);

		tb1.dispose();

		assert(result.result?.edit);

		doc.applyEdit(result.result.edit.toEdit());

		expect(doc.value.get().value).toMatchInlineSnapshot(`
			"class Point3D {
				constructor(
					private readonly x: number,
					private readonly y: number,
					private readonly z: number,
				) { }
				getDistance() {
					return Math.sqrt(this.x ** 2 + this.y ** 2);
				}
			}

			const myPoint = new Point(0, 1);"
		`);

		const tb2 = new NextEditProviderTelemetryBuilder(gitExtensionService, mockNotebookService, workspaceService, nextEditProvider.ID, doc);

		result = await nextEditProvider.getNextEdit(doc.id, context, logContext, cancellationToken, tb2.nesBuilder);

		tb2.dispose();

		assert(result.result?.edit);

		doc.applyEdit(result.result.edit.toEdit());

		expect(doc.value.get().value).toMatchInlineSnapshot(`
			"class Point3D {
				constructor(
					private readonly x: number,
					private readonly y: number,
					private readonly z: number,
				) { }
				getDistance() {
					return Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2);
				}
			}

			const myPoint = new Point(0, 1);"
		`);

		const tb3 = new NextEditProviderTelemetryBuilder(gitExtensionService, mockNotebookService, workspaceService, nextEditProvider.ID, doc);

		result = await nextEditProvider.getNextEdit(doc.id, context, logContext, cancellationToken, tb3.nesBuilder);

		tb3.dispose();

		assert(result.result?.edit);

		doc.applyEdit(result.result.edit.toEdit());

		expect(doc.value.get().value).toMatchInlineSnapshot(`
			"class Point3D {
				constructor(
					private readonly x: number,
					private readonly y: number,
					private readonly z: number,
				) { }
				getDistance() {
					return Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2);
				}
			}

			const myPoint = new Point3D(0, 1, 2);"
		`);
	});

	it('caches a response with multiple edits correctly when document uses CRLF line endings', async () => {
		const obsWorkspace = new MutableObservableWorkspace();
		const obsGit = new ObservableGit(gitExtensionService);
		const statelessNextEditProvider = createStatelessNextEditProvider();

		const nextEditProvider: NextEditProvider = new NextEditProvider(obsWorkspace, statelessNextEditProvider, new NesHistoryContextProvider(obsWorkspace, obsGit), new NesXtabHistoryTracker(obsWorkspace, undefined, configService, expService), undefined, configService, snippyService, logService, expService, requestLogger);

		// Use \r\n line endings to simulate a Windows document
		const initialValue = [
			'class Point {',
			'\tconstructor(',
			'\t\tprivate readonly x: number,',
			'\t\tprivate readonly y: number,',
			'\t) { }',
			'\tgetDistance() {',
			'\t\treturn Math.sqrt(this.x ** 2 + this.y ** 2);',
			'\t}',
			'}',
			'',
			'const myPoint = new Point(0, 1);',
		].join('\r\n');

		const doc = obsWorkspace.addDocument({
			id: DocumentId.create(URI.file('/test/test.ts').toString()),
			initialValue,
		});
		doc.setSelection([new OffsetRange(1, 1)], undefined);

		// Insert "3D" after "Point" at offset 11 (same offset, within first line before any line ending)
		doc.applyEdit(StringEdit.insert(11, '3D'));

		const context: NESInlineCompletionContext = { triggerKind: 1, selectedCompletionInfo: undefined, requestUuid: generateUuid(), requestIssuedDateTime: Date.now(), earliestShownDateTime: Date.now() + 200, enforceCacheDelay: false };
		const logContext = new InlineEditRequestLogContext(doc.id.toString(), 1, context);
		const cancellationToken = CancellationToken.None;
		const tb1 = new NextEditProviderTelemetryBuilder(gitExtensionService, mockNotebookService, workspaceService, nextEditProvider.ID, doc);

		// First edit: should add z parameter
		let result = await nextEditProvider.getNextEdit(doc.id, context, logContext, cancellationToken, tb1.nesBuilder);
		tb1.dispose();
		assert(result.result?.edit);
		doc.applyEdit(result.result.edit.toEdit());

		// Verify CRLF line endings are preserved
		expect(doc.value.get().value).toContain('\r\n');
		expect(doc.value.get().value).not.toMatch(/[^\r]\n/);

		// Second edit: should update getDistance method — this uses a cached edit
		const tb2 = new NextEditProviderTelemetryBuilder(gitExtensionService, mockNotebookService, workspaceService, nextEditProvider.ID, doc);
		result = await nextEditProvider.getNextEdit(doc.id, context, logContext, cancellationToken, tb2.nesBuilder);
		tb2.dispose();
		assert(result.result?.edit, 'second cached edit should be found');
		doc.applyEdit(result.result.edit.toEdit());

		expect(doc.value.get().value).not.toMatch(/[^\r]\n/);

		// Third edit: should update the variable — also from cache
		const tb3 = new NextEditProviderTelemetryBuilder(gitExtensionService, mockNotebookService, workspaceService, nextEditProvider.ID, doc);
		result = await nextEditProvider.getNextEdit(doc.id, context, logContext, cancellationToken, tb3.nesBuilder);
		tb3.dispose();
		assert(result.result?.edit, 'third cached edit should be found');
		doc.applyEdit(result.result.edit.toEdit());

		// Final state should match expected content with CRLF throughout
		const expectedLines = [
			'class Point3D {',
			'\tconstructor(',
			'\t\tprivate readonly x: number,',
			'\t\tprivate readonly y: number,',
			'\t\tprivate readonly z: number,',
			'\t) { }',
			'\tgetDistance() {',
			'\t\treturn Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2);',
			'\t}',
			'}',
			'',
			'const myPoint = new Point3D(0, 1, 2);',
		].join('\r\n');
		expect(doc.value.get().value).toBe(expectedLines);
	});

	it('exposes the cache entry on NextEditResult and preserves the wasRenderedAsInlineSuggestion flag across lookups', async () => {
		const obsWorkspace = new MutableObservableWorkspace();
		const obsGit = new ObservableGit(gitExtensionService);
		const statelessNextEditProvider = createStatelessNextEditProvider();

		const nextEditProvider: NextEditProvider = new NextEditProvider(obsWorkspace, statelessNextEditProvider, new NesHistoryContextProvider(obsWorkspace, obsGit), new NesXtabHistoryTracker(obsWorkspace, undefined, configService, expService), undefined, configService, snippyService, logService, expService, requestLogger);

		const doc = obsWorkspace.addDocument({
			id: DocumentId.create(URI.file('/test/test.ts').toString()),
			initialValue: outdent`
			class Point {
				constructor(
					private readonly x: number,
					private readonly y: number,
				) { }
				getDistance() {
					return Math.sqrt(this.x ** 2 + this.y ** 2);
				}
			}

			const myPoint = new Point(0, 1);`.trimStart()
		});
		doc.setSelection([new OffsetRange(1, 1)], undefined);

		doc.applyEdit(StringEdit.insert(11, '3D'));

		const context: NESInlineCompletionContext = { triggerKind: 1, selectedCompletionInfo: undefined, requestUuid: generateUuid(), requestIssuedDateTime: Date.now(), earliestShownDateTime: Date.now() + 200, enforceCacheDelay: false };
		const logContext = new InlineEditRequestLogContext(doc.id.toString(), 1, context);
		const cancellationToken = CancellationToken.None;

		// First call: edit comes fresh from the (mock) provider but is also cached.
		const tb1 = new NextEditProviderTelemetryBuilder(gitExtensionService, mockNotebookService, workspaceService, nextEditProvider.ID, doc);
		const first = await nextEditProvider.getNextEdit(doc.id, context, logContext, cancellationToken, tb1.nesBuilder);
		tb1.dispose();
		assert(first.result?.edit);
		const firstCacheEntry = first.result.cacheEntry;
		assert(firstCacheEntry, 'expected a cacheEntry reference on the first (fresh) NextEditResult');
		expect(firstCacheEntry.wasRenderedAsInlineSuggestion).toBeFalsy();

		// Simulate the inline-completion-provider marking the entry as having been
		// rendered as an inline (ghost text) suggestion.
		firstCacheEntry.wasRenderedAsInlineSuggestion = true;

		// Second call (no document changes): we should still get the same cached
		// edit back, and the flag must have been preserved on the same entry.
		const tb2 = new NextEditProviderTelemetryBuilder(gitExtensionService, mockNotebookService, workspaceService, nextEditProvider.ID, doc);
		const second = await nextEditProvider.getNextEdit(doc.id, context, logContext, cancellationToken, tb2.nesBuilder);
		tb2.dispose();
		assert(second.result?.edit);
		const secondCacheEntry = second.result.cacheEntry;
		assert(secondCacheEntry, 'expected a cacheEntry reference on the second (cached) NextEditResult');
		expect(secondCacheEntry).toBe(firstCacheEntry);
		expect(secondCacheEntry.wasRenderedAsInlineSuggestion).toBe(true);
	});

	it('attributes each served edit to its originating model patch via sourcePatchIndex', async () => {
		const obsWorkspace = new MutableObservableWorkspace();
		const obsGit = new ObservableGit(gitExtensionService);
		// Edits are served in line order: the z parameter (patch 0), the getDistance
		// body (also patch 0, i.e. a split of the same model patch per PR #322438),
		// then the variable declaration (patch 1).
		const statelessNextEditProvider = createStatelessNextEditProvider([0, 0, 1]);

		const nextEditProvider: NextEditProvider = new NextEditProvider(obsWorkspace, statelessNextEditProvider, new NesHistoryContextProvider(obsWorkspace, obsGit), new NesXtabHistoryTracker(obsWorkspace, undefined, configService, expService), undefined, configService, snippyService, logService, expService, requestLogger);

		const doc = obsWorkspace.addDocument({
			id: DocumentId.create(URI.file('/test/test.ts').toString()),
			initialValue: outdent`
			class Point {
				constructor(
					private readonly x: number,
					private readonly y: number,
				) { }
				getDistance() {
					return Math.sqrt(this.x ** 2 + this.y ** 2);
				}
			}

			const myPoint = new Point(0, 1);`.trimStart()
		});
		doc.setSelection([new OffsetRange(1, 1)], undefined);
		doc.applyEdit(StringEdit.insert(11, '3D'));

		const context: NESInlineCompletionContext = { triggerKind: 1, selectedCompletionInfo: undefined, requestUuid: generateUuid(), requestIssuedDateTime: Date.now(), earliestShownDateTime: Date.now() + 200, enforceCacheDelay: false };
		const logContext = new InlineEditRequestLogContext(doc.id.toString(), 1, context);
		const cancellationToken = CancellationToken.None;

		const servedPatchIndices: (number | undefined)[] = [];
		for (let i = 0; i < 3; i++) {
			const tb = new NextEditProviderTelemetryBuilder(gitExtensionService, mockNotebookService, workspaceService, nextEditProvider.ID, doc);
			const result = await nextEditProvider.getNextEdit(doc.id, context, logContext, cancellationToken, tb.nesBuilder);
			assert(result.result?.edit, `expected an edit on call ${i + 1}`);
			servedPatchIndices.push(tb.nesBuilder.build(false).sourcePatchIndex);
			tb.dispose();
			doc.applyEdit(result.result.edit.toEdit());
		}

		// The first (fresh) edit must be attributed too, not just the cached ones;
		// the split pair shares patch 0 while the final edit comes from patch 1.
		expect(servedPatchIndices).toEqual([0, 0, 1]);
	});

	/**
	 * Configuration that disables the cross-document cache purge (which otherwise deletes
	 * cross-file cache entries whenever *any* document is edited, by setting
	 * `InlineEditsTriggerOnEditorChangeAfterSeconds` to `undefined`). With the purge off, a
	 * cross-file entry survives an edit to its target document, so the read-path staleness guard
	 * — rather than the purge — becomes responsible for not serving the now-stale suggestion.
	 */
	class PurgeDisabledConfigurationService extends InMemoryConfigurationService {
		override getExperimentBasedConfig<T extends ExperimentBasedConfigType>(key: ExperimentBasedConfig<T>, experimentationService: IExperimentationService): T {
			if (key === ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds) {
				return undefined as T;
			}
			return super.getExperimentBasedConfig(key, experimentationService);
		}
	}

	/**
	 * Stateless provider that yields a single edit targeting a *different* document than the
	 * active one, and only on its first invocation. Later invocations yield nothing, so any
	 * subsequently served suggestion can only originate from the cache.
	 *
	 * Exposes the number of times it was invoked (to distinguish a cache hit from a fresh
	 * fetch) and a promise that resolves once the first request's stream has fully ended (so
	 * tests can re-request only after the no-suggestions stream-end handling has run).
	 */
	function createCrossFileStatelessProvider(targetDocId: DocumentId, targetEdit: LineReplacement, activeDocWindow?: OffsetRange): { provider: IStatelessNextEditProvider; getCallCount: () => number; whenFirstStreamEnded: Promise<void> } {
		let callCount = 0;
		const firstStreamEnded = new DeferredPromise<void>();
		const provider: IStatelessNextEditProvider = {
			ID: 'TestCrossFileNextEditProvider',
			provideNextEdit: async function*(request: StatelessNextEditRequest, logger: ILogger, logContext: InlineEditRequestLogContext, cancellationToken: CancellationToken) {
				const telemetryBuilder = new StatelessNextEditTelemetryBuilder(request.headerRequestId);
				callCount++;
				const isFirstCall = callCount === 1;
				try {
					if (isFirstCall) {
						yield new WithStatelessProviderTelemetry({ targetDocument: targetDocId, edit: targetEdit, isFromCursorJump: false, window: activeDocWindow, patchIndex: undefined }, telemetryBuilder.build(Result.ok(undefined)));
					}
					const noSuggestions = new NoNextEditReason.NoSuggestions(request.documentBeforeEdits, undefined);
					return new WithStatelessProviderTelemetry(noSuggestions, telemetryBuilder.build(Result.error(noSuggestions)));
				} finally {
					if (isFirstCall) {
						firstStreamEnded.complete();
					}
				}
			}
		};
		return { provider, getCallCount: () => callCount, whenFirstStreamEnded: firstStreamEnded.p };
	}

	async function runCrossFileScenario(options?: { activeDocWindow?: OffsetRange; disposeTargetBeforeSecondRequest?: boolean; mutateTargetBeforeSecondRequest?: boolean; disableEditorChangeTrigger?: boolean }) {
		const obsWorkspace = new MutableObservableWorkspace();
		const obsGit = new ObservableGit(gitExtensionService);

		// DocumentId is interned, so we can compute the ids before adding the documents.
		const docAId = DocumentId.create(URI.file('/test/a.ts').toString());
		const docBId = DocumentId.create(URI.file('/test/b.ts').toString());

		// By default the shared (defaults-only) config keeps the cross-document cache purge on.
		// Opt into the purge-disabled config to isolate the read-path staleness guard.
		const scenarioConfigService = options?.disableEditorChangeTrigger ? new PurgeDisabledConfigurationService(new DefaultsOnlyConfigurationService()) : configService;

		// Suggestion (for the non-active document B) replacing its `return 1;` line.
		const targetEdit = new LineReplacement(new LineRange(2, 3), ['\treturn 42;']);
		const { provider: statelessNextEditProvider, getCallCount, whenFirstStreamEnded } = createCrossFileStatelessProvider(docBId, targetEdit, options?.activeDocWindow);

		const nextEditProvider: NextEditProvider = new NextEditProvider(obsWorkspace, statelessNextEditProvider, new NesHistoryContextProvider(obsWorkspace, obsGit), new NesXtabHistoryTracker(obsWorkspace, undefined, scenarioConfigService, expService), undefined, scenarioConfigService, snippyService, logService, expService, requestLogger);

		const docB = obsWorkspace.addDocument({ id: docBId, initialValue: ['export function helper() {', '\treturn 1;', '}'].join('\n') });
		const docA = obsWorkspace.addDocument({ id: docAId, initialValue: ['class Point {', '\tconstructor(', '\t\tprivate readonly x: number,', '\t) { }', '}'].join('\n') });

		docB.setSelection([new OffsetRange(0, 0)], undefined);
		// The active document's cursor sits at offset 1 — relevant to the edit-window gating tests.
		docA.setSelection([new OffsetRange(1, 1)], undefined);

		// Give document B a recent edit so it is part of the active document's history
		// context (required for the cross-file edit to be processed against it). Append at
		// the end so B's `return 1;` line stays put.
		docB.applyEdit(StringEdit.insert(docB.value.get().value.length, '\n// touched'));
		// Edit document A so it is the active document and has history ("Point" -> "Point3D").
		docA.applyEdit(StringEdit.insert(11, '3D'));

		const context: NESInlineCompletionContext = { triggerKind: 1, selectedCompletionInfo: undefined, requestUuid: generateUuid(), requestIssuedDateTime: Date.now(), earliestShownDateTime: Date.now() + 200, enforceCacheDelay: false };
		const logContext = new InlineEditRequestLogContext(docA.id.toString(), 1, context);
		const cancellationToken = CancellationToken.None;

		const tb1 = new NextEditProviderTelemetryBuilder(gitExtensionService, mockNotebookService, workspaceService, nextEditProvider.ID, docA);
		const first = await nextEditProvider.getNextEdit(docA.id, context, logContext, cancellationToken, tb1.nesBuilder);
		tb1.dispose();

		// Wait until the first request's stream has fully ended before re-requesting. The
		// cross-file edit is processed synchronously (so `first` already has it), but the
		// terminal no-suggestions handling — which clears the pending request and would clobber
		// the active-doc cache entry via `setNoNextEdit` if not guarded — runs afterwards in the
		// background. Draining it here makes the second request deterministically observe the
		// post-stream-end cache state (cache hit vs. fresh fetch), so these tests are not vacuous.
		await whenFirstStreamEnded;
		await timeout(0);

		// Optionally close the target document B before re-requesting, so the cached cross-file
		// entry can no longer be resolved against live content.
		if (options?.disposeTargetBeforeSecondRequest) {
			docB.dispose();
		}
		// Optionally mutate the target document B so its live content no longer matches the
		// snapshot the cross-file edit was produced against, making the cached edit stale.
		if (options?.mutateTargetBeforeSecondRequest) {
			docB.applyEdit(StringEdit.insert(0, '// header\n'));
		}

		// Second request with no change to the active document A: the provider is now silent,
		// so any served suggestion must come from the cache.
		const tb2 = new NextEditProviderTelemetryBuilder(gitExtensionService, mockNotebookService, workspaceService, nextEditProvider.ID, docA);
		const second = await nextEditProvider.getNextEdit(docA.id, context, logContext, cancellationToken, tb2.nesBuilder);
		tb2.dispose();

		// Tear down the provider (which registers autoruns/watchers on `openDocuments` in its
		// constructor) and the documents so each scenario run is self-contained and does not
		// accumulate observers across the cross-file tests. Dispose the provider first so its
		// autoruns no longer react to the documents being removed; document disposal is
		// idempotent, so re-disposing `docB` after `disposeTargetBeforeSecondRequest` is safe.
		nextEditProvider.dispose();
		docA.dispose();
		docB.dispose();

		return { first, second, docBId, getCallCount };
	}

	it('re-serves a cross-file suggestion from cache while the cursor stays in the active document (surviving the no-suggestions stream end)', async () => {
		const { first, second, docBId, getCallCount } = await runCrossFileScenario();

		// Fresh: the provider produced a suggestion that targets the other document.
		assert(first.result?.edit, 'expected a cross-file edit on the first request');
		expect(first.result.targetDocumentId).toBe(docBId);

		// Cached: re-served from the entry keyed under the active document, even though the
		// first request's stream ended with no suggestions *for the active document* (which must
		// not clobber the cross-file entry) and the provider no longer yields anything. It is the
		// very same suggestion (and target), served from cache without re-invoking the provider.
		assert(second.result?.edit, 'expected the cross-file edit to be re-served from cache');
		expect(second.result.targetDocumentId).toBe(docBId);
		expect(second.result.edit).toBe(first.result.edit);
		expect(getCallCount()).toBe(1);
	});

	it('re-serves a cross-file suggestion from cache when the cursor is within the cached edit window', async () => {
		// The active document's cursor is at offset 1, which falls inside [0, 14).
		const { first, second, docBId, getCallCount } = await runCrossFileScenario({ activeDocWindow: new OffsetRange(0, 14) });

		assert(first.result?.edit, 'expected a cross-file edit on the first request');
		expect(first.result.targetDocumentId).toBe(docBId);

		assert(second.result?.edit, 'expected the cross-file edit to be re-served from cache');
		expect(second.result.targetDocumentId).toBe(docBId);
		expect(second.result.edit).toBe(first.result.edit);
		expect(getCallCount()).toBe(1);
	});

	it('does not re-serve a cross-file suggestion from cache when the cursor is outside the cached edit window', async () => {
		// The active document's cursor is at offset 1, which is outside [20, 30). Window gating
		// only applies to cache hits, so the fresh suggestion is unaffected.
		const { first, second, docBId, getCallCount } = await runCrossFileScenario({ activeDocWindow: new OffsetRange(20, 30) });

		assert(first.result?.edit, 'expected a cross-file edit on the first request');
		expect(first.result.targetDocumentId).toBe(docBId);

		// The cached entry is gated out by the edit window, so the second request misses the
		// cache and falls through to a fresh fetch (a second provider call), which is silent.
		expect(second.result?.edit).toBeUndefined();
		expect(getCallCount()).toBe(2);
	});

	it('refetches instead of serving a stale cross-file suggestion when the target document is no longer open', async () => {
		// Same setup as the happy path, but the target document B is closed before the second
		// request. The only difference from the happy path (which serves from cache with a single
		// provider call) is the closed target, so a second provider call proves the closed-target
		// validity check turned the cache hit into a miss rather than serving an unplaceable edit.
		const { first, second, docBId, getCallCount } = await runCrossFileScenario({ disposeTargetBeforeSecondRequest: true });

		assert(first.result?.edit, 'expected a cross-file edit on the first request');
		expect(first.result.targetDocumentId).toBe(docBId);

		// The cross-file entry is found but its target document is closed, so it cannot be
		// resolved against live content; the read path treats it as a cache miss and refetches
		// (a second, silent provider call) instead of getting stuck re-serving the dead entry.
		expect(second.result?.edit).toBeUndefined();
		expect(getCallCount()).toBe(2);
	});

	it('re-serves a cross-file suggestion (with the purge disabled) while the target document is unchanged', async () => {
		// Control for the staleness test below: with the cross-document purge disabled, the
		// cross-file entry survives into the second request, and while the target document is
		// unchanged it is served straight from cache (a single provider call). This isolates the
		// staleness guard — any refetch in the sibling test must come from the content change,
		// not from the entry being absent.
		const { first, second, docBId, getCallCount } = await runCrossFileScenario({ disableEditorChangeTrigger: true });

		assert(first.result?.edit, 'expected a cross-file edit on the first request');
		expect(first.result.targetDocumentId).toBe(docBId);

		assert(second.result?.edit, 'expected the cross-file edit to be re-served from cache');
		expect(second.result.targetDocumentId).toBe(docBId);
		expect(second.result.edit).toBe(first.result.edit);
		expect(getCallCount()).toBe(1);
	});

	it('refetches instead of serving a stale cross-file suggestion when the target document changed since it was produced', async () => {
		// Disable the cross-document purge so the cross-file entry survives the edit to B; the
		// read-path staleness guard is then the only thing standing between a changed target and a
		// misplaced suggestion. Paired with the unchanged-target control above, the extra provider
		// call here is attributable to the content change rather than to a missing entry.
		const { first, second, docBId, getCallCount } = await runCrossFileScenario({ mutateTargetBeforeSecondRequest: true, disableEditorChangeTrigger: true });

		assert(first.result?.edit, 'expected a cross-file edit on the first request');
		expect(first.result.targetDocumentId).toBe(docBId);

		// The target document changed after the suggestion was produced, so the cached edit's
		// offsets are stale and would land at the wrong location. The read path treats the hit as
		// a cache miss and refetches (a second provider call) rather than serving a misplaced edit.
		expect(second.result?.edit).toBeUndefined();
		expect(getCallCount()).toBe(2);
	});

	it('does not serve a stale cross-file suggestion when the target document changed under the default (purge-enabled) configuration', async () => {
		// In the default configuration, editing the target document B purges every cross-document
		// cache entry (including the active-document-keyed cross-file entry) before the next
		// request, so the stale suggestion is never re-served and the provider is consulted again.
		const { first, second, docBId, getCallCount } = await runCrossFileScenario({ mutateTargetBeforeSecondRequest: true });

		assert(first.result?.edit, 'expected a cross-file edit on the first request');
		expect(first.result.targetDocumentId).toBe(docBId);

		expect(second.result?.edit).toBeUndefined();
		expect(getCallCount()).toBe(2);
	});
});
