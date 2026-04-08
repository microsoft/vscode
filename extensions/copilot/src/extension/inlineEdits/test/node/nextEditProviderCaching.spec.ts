/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { outdent } from 'outdent';
import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';
import { IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../../platform/configuration/common/defaultsOnlyConfigurationService';
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
import { NullRequestLogger } from '../../../../platform/requestLogger/node/nullRequestLogger';
import { IRequestLogger } from '../../../../platform/requestLogger/node/requestLogger';
import { ISnippyService, NullSnippyService } from '../../../../platform/snippy/common/snippyService';
import { IExperimentationService, NullExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { mockNotebookService } from '../../../../platform/test/common/testNotebookService';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { Result } from '../../../../util/common/result';
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
	function createStatelessNextEditProvider(): IStatelessNextEditProvider {
		return {
			ID: 'TestNextEditProvider',
			provideNextEdit: async function* (request: StatelessNextEditRequest, logger: ILogger, logContext: InlineEditRequestLogContext, cancellationToken: CancellationToken) {
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
				for (const edit of lineEdit.replacements) {
					yield new WithStatelessProviderTelemetry({ targetDocument: request.getActiveDocument().id, edit, isFromCursorJump: false }, telemetryBuilder.build(Result.ok(undefined)));
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
});
