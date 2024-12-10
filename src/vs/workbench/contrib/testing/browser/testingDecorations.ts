/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { renderStringAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { Action, IAction, Separator, SubmenuAction } from '../../../../base/common/actions.js';
import { equals } from '../../../../base/common/arrays.js';
import { mapFindFirst } from '../../../../base/common/arraysFind.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { stripIcons } from '../../../../base/common/iconLabels.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableMap, DisposableStore, IReference, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { clamp } from '../../../../base/common/numbers.js';
import { autorun } from '../../../../base/common/observable.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { count, truncateMiddle } from '../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Constants } from '../../../../base/common/uint.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition, IContentWidgetRenderedCoordinate, IEditorMouseEvent, MouseTargetType } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { overviewRulerError, overviewRulerInfo } from '../../../../editor/common/core/editorColorRegistry.js';
import { Position } from '../../../../editor/common/core/position.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { GlyphMarginLane, IModelDecorationOptions, IModelDecorationsChangeAccessor, IModelDeltaDecoration, ITextModel, OverviewRulerLane, TrackedRangeStickiness } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { localize } from '../../../../nls.js';
import { getFlatContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { EditorLineNumberContextMenu, GutterActionsRegistry } from '../../codeEditor/browser/editorLineNumberMenu.js';
import { DefaultGutterClickAction, TestingConfigKeys, getTestingConfiguration } from '../common/configuration.js';
import { Testing, labelForTestInState } from '../common/constants.js';
import { TestId } from '../common/testId.js';
import { ITestProfileService } from '../common/testProfileService.js';
import { ITestResult, LiveTestResult, TestResultItemChangeReason } from '../common/testResult.js';
import { ITestResultService } from '../common/testResultService.js';
import { ITestService, getContextForTestItem, simplifyTestsToExecute, testsInFile } from '../common/testService.js';
import { ITestErrorMessage, ITestMessage, ITestRunProfile, IncrementalTestCollectionItem, InternalTestItem, TestDiffOpType, TestMessageType, TestResultItem, TestResultState, TestRunProfileBitset } from '../common/testTypes.js';
import { ITestDecoration as IPublicTestDecoration, ITestingDecorationsService, TestDecorations } from '../common/testingDecorations.js';
import { ITestingPeekOpener } from '../common/testingPeekOpener.js';
import { isFailedState, maxPriority } from '../common/testingStates.js';
import { TestUriType, buildTestUri, parseTestUri } from '../common/testingUri.js';
import { getTestItemContextOverlay } from './explorerProjections/testItemContextOverlay.js';
import { testingDebugAllIcon, testingDebugIcon, testingRunAllIcon, testingRunIcon, testingStatesToIcons } from './icons.js';
import { renderTestMessageAsText } from './testMessageColorizer.js';
import { MessageSubject } from './testResultsView/testResultsSubject.js';
import { TestingOutputPeekController } from './testingOutputPeek.js';

const MAX_INLINE_MESSAGE_LENGTH = 128;
const MAX_TESTS_IN_SUBMENU = 30;
const GLYPH_MARGIN_LANE = GlyphMarginLane.Center;

function isOriginalInDiffEditor(codeEditorService: ICodeEditorService, codeEditor: ICodeEditor): boolean {
	const diffEditors = codeEditorService.listDiffEditors();

	for (const diffEditor of diffEditors) {
		if (diffEditor.getOriginalEditor() === codeEditor) {
			return true;
		}
	}

	return false;
}

interface ITestDecoration extends IPublicTestDecoration {
	id: string;
	click(e: IEditorMouseEvent): boolean;
}

/** Value for saved decorations, providing fast accessors for the hot 'syncDecorations' path */
class CachedDecorations {
	private readonly runByIdKey = new Map<string, RunTestDecoration>();

	public get size() {
		return this.runByIdKey.size;
	}

	/** Gets a test run decoration that contains exactly the given test IDs */
	public getForExactTests(testIds: string[]) {
		const key = testIds.sort().join('\0\0');
		return this.runByIdKey.get(key);
	}
	/** Adds a new test run decroation */
	public addTest(d: RunTestDecoration) {
		const key = d.testIds.sort().join('\0\0');
		this.runByIdKey.set(key, d);
	}

	/** Finds an extension by VS Code event ID */
	public getById(decorationId: string) {
		for (const d of this.runByIdKey.values()) {
			if (d.id === decorationId) {
				return d;
			}
		}
		return undefined;
	}

	/** Iterate over all decorations */
	*[Symbol.iterator](): IterableIterator<ITestDecoration> {
		for (const d of this.runByIdKey.values()) {
			yield d;
		}
	}
}

export class TestingDecorationService extends Disposable implements ITestingDecorationsService {
	declare public _serviceBrand: undefined;

	private generation = 0;
	private readonly changeEmitter = new Emitter<void>();
	private readonly decorationCache = new ResourceMap<{
		/** The document version at which ranges have been updated, requiring rerendering */
		rangeUpdateVersionId?: number;
		/** Counter for the results rendered in the document */
		generation: number;
		isAlt?: boolean;
		value: CachedDecorations;
	}>();

	/**
	 * List of messages that should be hidden because an editor changed their
	 * underlying ranges. I think this is good enough, because:
	 *  - Message decorations are never shown across reloads; this does not
	 *    need to persist
	 *  - Message instances are stable for any completed test results for
	 *    the duration of the session.
	 */
	private readonly invalidatedMessages = new WeakSet<ITestMessage>();

	/** @inheritdoc */
	public readonly onDidChange = this.changeEmitter.event;

	constructor(
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITestService private readonly testService: ITestService,
		@ITestResultService private readonly results: ITestResultService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
	) {
		super();
		codeEditorService.registerDecorationType('test-message-decoration', TestMessageDecoration.decorationId, {}, undefined);

		this._register(modelService.onModelRemoved(e => this.decorationCache.delete(e.uri)));

		const debounceInvalidate = this._register(new RunOnceScheduler(() => this.invalidate(), 100));

		// If ranges were updated in the document, mark that we should explicitly
		// sync decorations to the published lines, since we assume that everything
		// is up to date. This prevents issues, as in #138632, #138835, #138922.
		this._register(this.testService.onWillProcessDiff(diff => {
			for (const entry of diff) {
				if (entry.op !== TestDiffOpType.DocumentSynced) {
					continue;
				}

				const rec = this.decorationCache.get(entry.uri);
				if (rec) {
					rec.rangeUpdateVersionId = entry.docv;
				}
			}

			if (!debounceInvalidate.isScheduled()) {
				debounceInvalidate.schedule();
			}
		}));

		this._register(Event.any(
			this.results.onResultsChanged,
			this.results.onTestChanged,
			this.testService.excluded.onTestExclusionsChanged,
			Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(TestingConfigKeys.GutterEnabled)),
		)(() => {
			if (!debounceInvalidate.isScheduled()) {
				debounceInvalidate.schedule();
			}
		}));

		this._register(GutterActionsRegistry.registerGutterActionsGenerator((context, result) => {
			const model = context.editor.getModel();
			const testingDecorations = TestingDecorations.get(context.editor);
			if (!model || !testingDecorations?.currentUri) {
				return;
			}

			const currentDecorations = this.syncDecorations(testingDecorations.currentUri);
			if (!currentDecorations.size) {
				return;
			}

			const modelDecorations = model.getLinesDecorations(context.lineNumber, context.lineNumber);
			for (const { id } of modelDecorations) {
				const decoration = currentDecorations.getById(id);
				if (decoration) {
					const { object: actions } = decoration.getContextMenuActions();
					for (const action of actions) {
						result.push(action, '1_testing');
					}
				}
			}
		}));
	}

	/** @inheritdoc */
	public invalidateResultMessage(message: ITestMessage) {
		this.invalidatedMessages.add(message);
		this.invalidate();
	}

	/** @inheritdoc */
	public syncDecorations(resource: URI): CachedDecorations {
		const model = this.modelService.getModel(resource);
		if (!model) {
			return new CachedDecorations();
		}

		const cached = this.decorationCache.get(resource);
		if (cached && cached.generation === this.generation && (cached.rangeUpdateVersionId === undefined || cached.rangeUpdateVersionId !== model.getVersionId())) {
			return cached.value;
		}

		return this.applyDecorations(model);
	}

	/** @inheritdoc */
	public getDecoratedTestPosition(resource: URI, testId: string) {
		const model = this.modelService.getModel(resource);
		if (!model) {
			return undefined;
		}

		const decoration = Iterable.find(this.syncDecorations(resource), v => v instanceof RunTestDecoration && v.isForTest(testId));
		if (!decoration) {
			return undefined;
		}

		// decoration is collapsed, so the range is meaningless; only position matters.
		return model.getDecorationRange(decoration.id)?.getStartPosition();
	}

	private invalidate() {
		this.generation++;
		this.changeEmitter.fire();
	}

	/**
	 * Sets whether alternate actions are shown for the model.
	 */
	public updateDecorationsAlternateAction(resource: URI, isAlt: boolean) {
		const model = this.modelService.getModel(resource);
		const cached = this.decorationCache.get(resource);
		if (!model || !cached || cached.isAlt === isAlt) {
			return;
		}

		cached.isAlt = isAlt;
		model.changeDecorations(accessor => {
			for (const decoration of cached.value) {
				if (decoration instanceof RunTestDecoration && decoration.editorDecoration.alternate) {
					accessor.changeDecorationOptions(
						decoration.id,
						isAlt ? decoration.editorDecoration.alternate : decoration.editorDecoration.options,
					);
				}
			}
		});
	}

	/**
	 * Applies the current set of test decorations to the given text model.
	 */
	private applyDecorations(model: ITextModel) {
		const gutterEnabled = getTestingConfiguration(this.configurationService, TestingConfigKeys.GutterEnabled);
		const cached = this.decorationCache.get(model.uri);
		const testRangesUpdated = cached?.rangeUpdateVersionId === model.getVersionId();
		const lastDecorations = cached?.value ?? new CachedDecorations();

		const newDecorations = model.changeDecorations(accessor => {
			const newDecorations = new CachedDecorations();
			const runDecorations = new TestDecorations<{ line: number; id: ''; test: IncrementalTestCollectionItem; resultItem: TestResultItem | undefined }>();
			for (const test of this.testService.collection.getNodeByUrl(model.uri)) {
				if (!test.item.range) {
					continue;
				}

				const stateLookup = this.results.getStateById(test.item.extId);
				const line = test.item.range.startLineNumber;
				runDecorations.push({ line, id: '', test, resultItem: stateLookup?.[1] });
			}

			for (const [line, tests] of runDecorations.lines()) {
				const multi = tests.length > 1;
				let existing = lastDecorations.getForExactTests(tests.map(t => t.test.item.extId));

				// see comment in the constructor for what's going on here
				if (existing && testRangesUpdated && model.getDecorationRange(existing.id)?.startLineNumber !== line) {
					existing = undefined;
				}

				if (existing) {
					if (existing.replaceOptions(tests, gutterEnabled)) {
						accessor.changeDecorationOptions(existing.id, existing.editorDecoration.options);
					}
					newDecorations.addTest(existing);
				} else {
					newDecorations.addTest(multi
						? this.instantiationService.createInstance(MultiRunTestDecoration, tests, gutterEnabled, model)
						: this.instantiationService.createInstance(RunSingleTestDecoration, tests[0].test, tests[0].resultItem, model, gutterEnabled));
				}
			}

			const saveFromRemoval = new Set<string>();
			for (const decoration of newDecorations) {
				if (decoration.id === '') {
					decoration.id = accessor.addDecoration(decoration.editorDecoration.range, decoration.editorDecoration.options);
				} else {
					saveFromRemoval.add(decoration.id);
				}
			}

			for (const decoration of lastDecorations) {
				if (!saveFromRemoval.has(decoration.id)) {
					accessor.removeDecoration(decoration.id);
				}
			}

			this.decorationCache.set(model.uri, {
				generation: this.generation,
				rangeUpdateVersionId: cached?.rangeUpdateVersionId,
				value: newDecorations,
			});

			return newDecorations;
		});

		return newDecorations || lastDecorations;
	}
}

export class TestingDecorations extends Disposable implements IEditorContribution {
	/**
	 * Results invalidated by editor changes.
	 */
	public static invalidatedTests = new WeakSet<TestResultItem | ITestMessage>();

	/**
	 * Gets the decorations associated with the given code editor.
	 */
	public static get(editor: ICodeEditor): TestingDecorations | null {
		return editor.getContribution<TestingDecorations>(Testing.DecorationsContributionId);
	}

	public get currentUri() { return this._currentUri; }

	private _currentUri?: URI;
	private readonly expectedWidget = new MutableDisposable<ExpectedLensContentWidget>();
	private readonly actualWidget = new MutableDisposable<ActualLensContentWidget>();

	private readonly errorContentWidgets = this._register(new DisposableMap<ITestMessage, TestErrorContentWidget>());
	private readonly loggedMessageDecorations = new Map<ITestMessage, {
		id: string;
		line: number;
		resultItem: TestResultItem | undefined;
	}>();

	constructor(
		private readonly editor: ICodeEditor,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@ITestService private readonly testService: ITestService,
		@ITestingDecorationsService private readonly decorations: ITestingDecorationsService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ITestResultService private readonly results: ITestResultService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		codeEditorService.registerDecorationType('test-message-decoration', TestMessageDecoration.decorationId, {}, undefined, editor);

		this.attachModel(editor.getModel()?.uri);
		this._register(decorations.onDidChange(() => {
			if (this._currentUri) {
				decorations.syncDecorations(this._currentUri);
			}
		}));

		this._register(Event.any(
			this.results.onResultsChanged,
			editor.onDidChangeModel,
			Event.filter(this.results.onTestChanged, c => c.reason === TestResultItemChangeReason.NewMessage),
			this.testService.showInlineOutput.onDidChange,
		)(() => this.applyResults()));

		const win = dom.getWindow(editor.getDomNode());
		this._register(dom.addDisposableListener(win, 'keydown', e => {
			if (new StandardKeyboardEvent(e).keyCode === KeyCode.Alt && this._currentUri) {
				decorations.updateDecorationsAlternateAction(this._currentUri, true);
			}
		}));
		this._register(dom.addDisposableListener(win, 'keyup', e => {
			if (new StandardKeyboardEvent(e).keyCode === KeyCode.Alt && this._currentUri) {
				decorations.updateDecorationsAlternateAction(this._currentUri, false);
			}
		}));
		this._register(dom.addDisposableListener(win, 'blur', () => {
			if (this._currentUri) {
				decorations.updateDecorationsAlternateAction(this._currentUri, false);
			}
		}));
		this._register(this.editor.onKeyUp(e => {
			if (e.keyCode === KeyCode.Alt && this._currentUri) {
				decorations.updateDecorationsAlternateAction(this._currentUri!, false);
			}
		}));
		this._register(this.editor.onDidChangeModel(e => this.attachModel(e.newModelUrl || undefined)));
		this._register(this.editor.onMouseDown(e => {
			if (e.target.position && this.currentUri) {
				const modelDecorations = editor.getModel()?.getLineDecorations(e.target.position.lineNumber) ?? [];
				if (!modelDecorations.length) {
					return;
				}

				const cache = decorations.syncDecorations(this.currentUri);
				for (const { id } of modelDecorations) {
					if ((cache.getById(id) as ITestDecoration | undefined)?.click(e)) {
						e.event.stopPropagation();
						return;
					}
				}
			}
		}));
		this._register(Event.accumulate(this.editor.onDidChangeModelContent, 0, this._store)(evts => {
			const model = editor.getModel();
			if (!this._currentUri || !model) {
				return;
			}

			let changed = false;
			for (const [message, deco] of this.loggedMessageDecorations) {
				// invalidate decorations if either the line they're on was changed,
				// or if the range of the test was changed. The range of the test is
				// not always present, so check bo.
				const invalidate = evts.some(e => e.changes.some(c =>
					c.range.startLineNumber <= deco.line && c.range.endLineNumber >= deco.line
					|| (deco.resultItem?.item.range && deco.resultItem.item.range.startLineNumber <= c.range.startLineNumber && deco.resultItem.item.range.endLineNumber >= c.range.endLineNumber)
				));

				if (invalidate) {
					changed = true;
					TestingDecorations.invalidatedTests.add(deco.resultItem || message);
				}
			}

			if (changed) {
				this.applyResults();
			}
		}));

		const updateFontFamilyVar = () => {
			this.editor.getContainerDomNode().style.setProperty('--testMessageDecorationFontFamily', editor.getOption(EditorOption.fontFamily));
			this.editor.getContainerDomNode().style.setProperty('--testMessageDecorationFontSize', `${editor.getOption(EditorOption.fontSize)}px`);
		};
		this._register(this.editor.onDidChangeConfiguration((e) => {
			if (e.hasChanged(EditorOption.fontFamily)) {
				updateFontFamilyVar();
			}
		}));
		updateFontFamilyVar();
	}

	private attachModel(uri?: URI) {
		switch (uri && parseTestUri(uri)?.type) {
			case TestUriType.ResultExpectedOutput:
				this.expectedWidget.value = new ExpectedLensContentWidget(this.editor);
				this.actualWidget.clear();
				break;
			case TestUriType.ResultActualOutput:
				this.expectedWidget.clear();
				this.actualWidget.value = new ActualLensContentWidget(this.editor);
				break;
			default:
				this.expectedWidget.clear();
				this.actualWidget.clear();
		}

		if (isOriginalInDiffEditor(this.codeEditorService, this.editor)) {
			uri = undefined;
		}

		this._currentUri = uri;

		if (!uri) {
			return;
		}

		this.decorations.syncDecorations(uri);

		(async () => {
			for await (const _test of testsInFile(this.testService, this.uriIdentityService, uri, false)) {
				// consume the iterator so that all tests in the file get expanded. Or
				// at least until the URI changes. If new items are requested, changes
				// will be trigged in the `onDidProcessDiff` callback.
				if (this._currentUri !== uri) {
					break;
				}
			}
		})();
	}

	private applyResults() {
		const model = this.editor.getModel();
		if (!model) {
			return this.clearResults();
		}

		const uriStr = model.uri.toString();
		const seenLines = new Set<number>();
		this.applyResultsContentWidgets(uriStr, seenLines);
		this.applyResultsLoggedMessages(uriStr, seenLines);
	}

	private clearResults() {
		this.errorContentWidgets.clearAndDisposeAll();
	}

	private isMessageInvalidated(message: ITestMessage) {
		return TestingDecorations.invalidatedTests.has(message);
	}

	private applyResultsContentWidgets(uriStr: string, seenLines: Set<number>) {
		const seen = new Set<ITestMessage>();
		if (getTestingConfiguration(this.configurationService, TestingConfigKeys.ShowAllMessages)) {
			this.results.results.forEach(lastResult => this.applyContentWidgetsFromResult(lastResult, uriStr, seen, seenLines));
		} else if (this.results.results.length) {
			this.applyContentWidgetsFromResult(this.results.results[0], uriStr, seen, seenLines);
		}

		for (const message of this.errorContentWidgets.keys()) {
			if (!seen.has(message)) {
				this.errorContentWidgets.deleteAndDispose(message);
			}
		}
	}

	private applyContentWidgetsFromResult(lastResult: ITestResult, uriStr: string, seen: Set<ITestMessage>, seenLines: Set<number>) {
		for (const test of lastResult.tests) {
			if (TestingDecorations.invalidatedTests.has(test)) {
				continue;
			}
			for (let taskId = 0; taskId < test.tasks.length; taskId++) {
				const state = test.tasks[taskId];
				// push error decorations first so they take precedence over normal output
				for (let i = 0; i < state.messages.length; i++) {
					const m = state.messages[i];
					if (m.type !== TestMessageType.Error || this.isMessageInvalidated(m)) {
						continue;
					}

					const line: number | undefined = m.location?.uri.toString() === uriStr
						? m.location.range.startLineNumber
						: m.stackTrace && mapFindFirst(m.stackTrace, (f) => f.position && f.uri?.toString() === uriStr ? f.position.lineNumber : undefined);
					if (line === undefined || seenLines.has(line)) {
						continue;
					}

					seenLines.add(line);
					let deco = this.errorContentWidgets.get(m);
					if (!deco) {
						const lineLength = this.editor.getModel()?.getLineLength(line) ?? 100;
						deco = this.instantiationService.createInstance(
							TestErrorContentWidget,
							this.editor,
							new Position(line, lineLength + 1),
							m,
							test,
							buildTestUri({
								type: TestUriType.ResultActualOutput,
								messageIndex: i,
								taskIndex: taskId,
								resultId: lastResult.id,
								testExtId: test.item.extId,
							})
						);
						this.errorContentWidgets.set(m, deco);
					}
					seen.add(m);
				}
			}
		}
	}

	private applyResultsLoggedMessages(uriStr: string, messageLines: Set<number>) {
		this.editor.changeDecorations(accessor => {
			const seen = new Set<ITestMessage>();
			if (getTestingConfiguration(this.configurationService, TestingConfigKeys.ShowAllMessages)) {
				this.results.results.forEach(r => this.applyLoggedMessageFromResult(r, uriStr, seen, messageLines, accessor));
			} else if (this.results.results.length) {
				this.applyLoggedMessageFromResult(this.results.results[0], uriStr, seen, messageLines, accessor);
			}

			for (const [message, { id }] of this.loggedMessageDecorations) {
				if (!seen.has(message)) {
					accessor.removeDecoration(id);
				}
			}
		});
	}

	private applyLoggedMessageFromResult(lastResult: ITestResult, uriStr: string, seen: Set<ITestMessage>, messageLines: Set<number>, accessor: IModelDecorationsChangeAccessor) {
		if (!this.testService.showInlineOutput.value || !(lastResult instanceof LiveTestResult)) {
			return;
		}

		const tryAdd = (resultItem: TestResultItem | undefined, m: ITestMessage, uri?: URI) => {
			if (this.isMessageInvalidated(m) || m.location?.uri.toString() !== uriStr) {
				return;
			}

			seen.add(m);
			const line = m.location.range.startLineNumber;
			if (messageLines.has(line) || this.loggedMessageDecorations.has(m)) {
				return;
			}

			const deco = this.instantiationService.createInstance(TestMessageDecoration, m, uri, this.editor.getModel()!);

			messageLines.add(line);
			const id = accessor.addDecoration(
				deco.editorDecoration.range,
				deco.editorDecoration.options,
			);
			this.loggedMessageDecorations.set(m, { id, line, resultItem });
		};

		for (const test of lastResult.tests) {
			if (TestingDecorations.invalidatedTests.has(test)) {
				continue;
			}

			for (let taskId = 0; taskId < test.tasks.length; taskId++) {
				const state = test.tasks[taskId];
				for (let i = state.messages.length - 1; i >= 0; i--) {
					const m = state.messages[i];
					if (m.type === TestMessageType.Output) {
						tryAdd(test, m, buildTestUri({
							type: TestUriType.ResultActualOutput,
							messageIndex: i,
							taskIndex: taskId,
							resultId: lastResult.id,
							testExtId: test.item.extId,
						}));
					}
				}
			}
		}

		for (const task of lastResult.tasks) {
			for (const m of task.otherMessages) {
				tryAdd(undefined, m);
			}
		}
	}
}

const collapseRange = (originalRange: IRange) => ({
	startLineNumber: originalRange.startLineNumber,
	endLineNumber: originalRange.startLineNumber,
	startColumn: originalRange.startColumn,
	endColumn: originalRange.startColumn,
});

const createRunTestDecoration = (
	tests: readonly IncrementalTestCollectionItem[],
	states: readonly (TestResultItem | undefined)[],
	visible: boolean,
	defaultGutterAction: DefaultGutterClickAction,
): IModelDeltaDecoration & { alternate?: IModelDecorationOptions } => {
	const range = tests[0]?.item.range;
	if (!range) {
		throw new Error('Test decorations can only be created for tests with a range');
	}

	if (!visible) {
		return {
			range: collapseRange(range),
			options: { isWholeLine: true, description: 'run-test-decoration' },
		};
	}

	let computedState = TestResultState.Unset;
	const hoverMessageParts: string[] = [];
	let testIdWithMessages: string | undefined;
	let retired = false;
	for (let i = 0; i < tests.length; i++) {
		const test = tests[i];
		const resultItem = states[i];
		const state = resultItem?.computedState ?? TestResultState.Unset;
		if (hoverMessageParts.length < 10) {
			hoverMessageParts.push(labelForTestInState(test.item.label, state));
		}
		computedState = maxPriority(computedState, state);
		retired = retired || !!resultItem?.retired;
		if (!testIdWithMessages && resultItem?.tasks.some(t => t.messages.length)) {
			testIdWithMessages = test.item.extId;
		}
	}

	const hasMultipleTests = tests.length > 1 || tests[0].children.size > 0;

	const primaryIcon = computedState === TestResultState.Unset
		? (hasMultipleTests ? testingRunAllIcon : testingRunIcon)
		: testingStatesToIcons.get(computedState)!;

	const alternateIcon = defaultGutterAction === DefaultGutterClickAction.Debug
		? (hasMultipleTests ? testingRunAllIcon : testingRunIcon)
		: (hasMultipleTests ? testingDebugAllIcon : testingDebugIcon);

	let hoverMessage: IMarkdownString | undefined;

	let glyphMarginClassName = 'testing-run-glyph';
	if (retired) {
		glyphMarginClassName += ' retired';
	}

	const defaultOptions: IModelDecorationOptions = {
		description: 'run-test-decoration',
		showIfCollapsed: true,
		get hoverMessage() {
			if (!hoverMessage) {
				const building = hoverMessage = new MarkdownString('', true).appendText(hoverMessageParts.join(', ') + '.');
				if (testIdWithMessages) {
					const args = encodeURIComponent(JSON.stringify([testIdWithMessages]));
					building.appendMarkdown(` [${localize('peekTestOutout', 'Peek Test Output')}](command:vscode.peekTestError?${args})`);
				}
			}

			return hoverMessage;
		},
		glyphMargin: { position: GLYPH_MARGIN_LANE },
		glyphMarginClassName: `${ThemeIcon.asClassName(primaryIcon)} ${glyphMarginClassName}`,
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		zIndex: 10000,
	};

	const alternateOptions: IModelDecorationOptions = {
		...defaultOptions,
		glyphMarginClassName: `${ThemeIcon.asClassName(alternateIcon)} ${glyphMarginClassName}`,
	};

	return {
		range: collapseRange(range),
		options: defaultOptions,
		alternate: alternateOptions,
	};
};

const enum LensContentWidgetVars {
	FontFamily = 'testingDiffLensFontFamily',
	FontFeatures = 'testingDiffLensFontFeatures',
}

abstract class TitleLensContentWidget {
	/** @inheritdoc */
	public readonly allowEditorOverflow = false;
	/** @inheritdoc */
	public readonly suppressMouseDown = true;

	private readonly _domNode = dom.$('span');
	private viewZoneId?: string;

	constructor(private readonly editor: ICodeEditor) {
		queueMicrotask(() => {
			this.applyStyling();
			this.editor.addContentWidget(this);
		});
	}

	private applyStyling() {
		let fontSize = this.editor.getOption(EditorOption.codeLensFontSize);
		let height: number;
		if (!fontSize || fontSize < 5) {
			fontSize = (this.editor.getOption(EditorOption.fontSize) * .9) | 0;
			height = this.editor.getOption(EditorOption.lineHeight);
		} else {
			height = (fontSize * Math.max(1.3, this.editor.getOption(EditorOption.lineHeight) / this.editor.getOption(EditorOption.fontSize))) | 0;
		}

		const editorFontInfo = this.editor.getOption(EditorOption.fontInfo);
		const node = this._domNode;
		node.classList.add('testing-diff-lens-widget');
		node.textContent = this.getText();
		node.style.lineHeight = `${height}px`;
		node.style.fontSize = `${fontSize}px`;
		node.style.fontFamily = `var(--${LensContentWidgetVars.FontFamily})`;
		node.style.fontFeatureSettings = `var(--${LensContentWidgetVars.FontFeatures})`;

		const containerStyle = this.editor.getContainerDomNode().style;
		containerStyle.setProperty(LensContentWidgetVars.FontFamily, this.editor.getOption(EditorOption.codeLensFontFamily) ?? 'inherit');
		containerStyle.setProperty(LensContentWidgetVars.FontFeatures, editorFontInfo.fontFeatureSettings);

		this.editor.changeViewZones(accessor => {
			if (this.viewZoneId) {
				accessor.removeZone(this.viewZoneId);
			}

			this.viewZoneId = accessor.addZone({
				afterLineNumber: 0,
				afterColumn: Constants.MAX_SAFE_SMALL_INTEGER,
				domNode: document.createElement('div'),
				heightInPx: 20,
			});
		});
	}

	/** @inheritdoc */
	public abstract getId(): string;

	/** @inheritdoc */
	public getDomNode() {
		return this._domNode;
	}

	/** @inheritdoc */
	public dispose() {
		this.editor.changeViewZones(accessor => {
			if (this.viewZoneId) {
				accessor.removeZone(this.viewZoneId);
			}
		});

		this.editor.removeContentWidget(this);
	}

	/** @inheritdoc */
	public getPosition(): IContentWidgetPosition {
		return {
			position: { column: 0, lineNumber: 0 },
			preference: [ContentWidgetPositionPreference.ABOVE],
		};
	}

	protected abstract getText(): string;
}

class ExpectedLensContentWidget extends TitleLensContentWidget {
	public getId() {
		return 'expectedTestingLens';
	}

	protected override getText() {
		return localize('expected.title', 'Expected');
	}
}


class ActualLensContentWidget extends TitleLensContentWidget {
	public getId() {
		return 'actualTestingLens';
	}

	protected override getText() {
		return localize('actual.title', 'Actual');
	}
}

abstract class RunTestDecoration {
	/** @inheritdoc */
	public id = '';

	public get line() {
		return this.editorDecoration.range.startLineNumber;
	}

	public get testIds() {
		return this.tests.map(t => t.test.item.extId);
	}

	public editorDecoration: IModelDeltaDecoration & { alternate?: IModelDecorationOptions };
	public displayedStates: readonly (TestResultState | undefined)[];

	constructor(
		protected tests: readonly {
			test: IncrementalTestCollectionItem;
			resultItem: TestResultItem | undefined;
		}[],
		private visible: boolean,
		protected readonly model: ITextModel,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@ITestService protected readonly testService: ITestService,
		@IContextMenuService protected readonly contextMenuService: IContextMenuService,
		@ICommandService protected readonly commandService: ICommandService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@ITestProfileService protected readonly testProfileService: ITestProfileService,
		@IContextKeyService protected readonly contextKeyService: IContextKeyService,
		@IMenuService protected readonly menuService: IMenuService,
	) {
		this.displayedStates = tests.map(t => t.resultItem?.computedState);
		this.editorDecoration = createRunTestDecoration(
			tests.map(t => t.test),
			tests.map(t => t.resultItem),
			visible,
			getTestingConfiguration(this.configurationService, TestingConfigKeys.DefaultGutterClickAction),
		);
		this.editorDecoration.options.glyphMarginHoverMessage = new MarkdownString().appendText(this.getGutterLabel());
	}

	/** @inheritdoc */
	public click(e: IEditorMouseEvent): boolean {
		if (e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN
			|| e.target.detail.glyphMarginLane !== GLYPH_MARGIN_LANE
			// handled by editor gutter context menu
			|| e.event.rightButton
			|| isMacintosh && e.event.leftButton && e.event.ctrlKey
		) {
			return false;
		}

		const alternateAction = e.event.altKey;
		switch (getTestingConfiguration(this.configurationService, TestingConfigKeys.DefaultGutterClickAction)) {
			case DefaultGutterClickAction.ContextMenu:
				this.showContextMenu(e);
				break;
			case DefaultGutterClickAction.Debug:
				this.runWith(alternateAction ? TestRunProfileBitset.Run : TestRunProfileBitset.Debug);
				break;
			case DefaultGutterClickAction.Coverage:
				this.runWith(alternateAction ? TestRunProfileBitset.Debug : TestRunProfileBitset.Coverage);
				break;
			case DefaultGutterClickAction.Run:
			default:
				this.runWith(alternateAction ? TestRunProfileBitset.Debug : TestRunProfileBitset.Run);
				break;
		}

		return true;
	}

	/**
	 * Updates the decoration to match the new set of tests.
	 * @returns true if options were changed, false otherwise
	 */
	public replaceOptions(newTests: readonly {
		test: IncrementalTestCollectionItem;
		resultItem: TestResultItem | undefined;
	}[], visible: boolean): boolean {
		const displayedStates = newTests.map(t => t.resultItem?.computedState);
		if (visible === this.visible && equals(this.displayedStates, displayedStates)) {
			return false;
		}

		this.tests = newTests;
		this.displayedStates = displayedStates;
		this.visible = visible;

		const { options, alternate } = createRunTestDecoration(
			newTests.map(t => t.test),
			newTests.map(t => t.resultItem),
			visible,
			getTestingConfiguration(this.configurationService, TestingConfigKeys.DefaultGutterClickAction)
		);

		this.editorDecoration.options = options;
		this.editorDecoration.alternate = alternate;
		this.editorDecoration.options.glyphMarginHoverMessage = new MarkdownString().appendText(this.getGutterLabel());
		return true;
	}

	/**
	 * Gets whether this decoration serves as the run button for the given test ID.
	 */
	public isForTest(testId: string) {
		return this.tests.some(t => t.test.item.extId === testId);
	}

	/**
	 * Called when the decoration is clicked on.
	 */
	abstract getContextMenuActions(): IReference<IAction[]>;

	protected runWith(profile: TestRunProfileBitset) {
		return this.testService.runTests({
			tests: simplifyTestsToExecute(this.testService.collection, this.tests.map(({ test }) => test)),
			group: profile,
		});
	}

	private showContextMenu(e: IEditorMouseEvent) {
		const editor = this.codeEditorService.listCodeEditors().find(e => e.getModel() === this.model);
		editor?.getContribution<EditorLineNumberContextMenu>(EditorLineNumberContextMenu.ID)?.show(e);
	}

	private getGutterLabel() {
		switch (getTestingConfiguration(this.configurationService, TestingConfigKeys.DefaultGutterClickAction)) {
			case DefaultGutterClickAction.ContextMenu:
				return localize('testing.gutterMsg.contextMenu', 'Click for test options');
			case DefaultGutterClickAction.Debug:
				return localize('testing.gutterMsg.debug', 'Click to debug tests, right click for more options');
			case DefaultGutterClickAction.Coverage:
				return localize('testing.gutterMsg.coverage', 'Click to run tests with coverage, right click for more options');
			case DefaultGutterClickAction.Run:
			default:
				return localize('testing.gutterMsg.run', 'Click to run tests, right click for more options');
		}
	}

	/**
	 * Gets context menu actions relevant for a singel test.
	 */
	protected getTestContextMenuActions(test: InternalTestItem, resultItem?: TestResultItem): IReference<IAction[]> {
		const testActions: IAction[] = [];
		const capabilities = this.testProfileService.capabilitiesForTest(test.item);

		[
			{ bitset: TestRunProfileBitset.Run, label: localize('run test', 'Run Test') },
			{ bitset: TestRunProfileBitset.Debug, label: localize('debug test', 'Debug Test') },
			{ bitset: TestRunProfileBitset.Coverage, label: localize('coverage test', 'Run with Coverage') },
		].forEach(({ bitset, label }) => {
			if (capabilities & bitset) {
				testActions.push(new Action(`testing.gutter.${bitset}`, label, undefined, undefined,
					() => this.testService.runTests({ group: bitset, tests: [test] })));
			}
		});

		if (capabilities & TestRunProfileBitset.HasNonDefaultProfile) {
			testActions.push(new Action('testing.runUsing', localize('testing.runUsing', 'Execute Using Profile...'), undefined, undefined, async () => {
				const profile: ITestRunProfile | undefined = await this.commandService.executeCommand('vscode.pickTestProfile', { onlyForTest: test });
				if (!profile) {
					return;
				}

				this.testService.runResolvedTests({
					group: profile.group,
					targets: [{
						profileId: profile.profileId,
						controllerId: profile.controllerId,
						testIds: [test.item.extId]
					}]
				});
			}));
		}

		if (resultItem && isFailedState(resultItem.computedState)) {
			testActions.push(new Action('testing.gutter.peekFailure', localize('peek failure', 'Peek Error'), undefined, undefined,
				() => this.commandService.executeCommand('vscode.peekTestError', test.item.extId)));
		}

		testActions.push(new Action('testing.gutter.reveal', localize('reveal test', 'Reveal in Test Explorer'), undefined, undefined,
			() => this.commandService.executeCommand('_revealTestInExplorer', test.item.extId)));

		const contributed = this.getContributedTestActions(test, capabilities);
		return { object: Separator.join(testActions, contributed), dispose() { } };
	}

	private getContributedTestActions(test: InternalTestItem, capabilities: number): IAction[] {
		const contextOverlay = this.contextKeyService.createOverlay(getTestItemContextOverlay(test, capabilities));

		const arg = getContextForTestItem(this.testService.collection, test.item.extId);
		const menu = this.menuService.getMenuActions(MenuId.TestItemGutter, contextOverlay, { shouldForwardArgs: true, arg });
		return getFlatContextMenuActions(menu);
	}
}

interface IMultiRunTest {
	currentLabel: string;
	parent: TestId | undefined;
	testItem: {
		test: IncrementalTestCollectionItem;
		resultItem: TestResultItem | undefined;
	};
}

class MultiRunTestDecoration extends RunTestDecoration implements ITestDecoration {
	constructor(
		tests: readonly {
			test: IncrementalTestCollectionItem;
			resultItem: TestResultItem | undefined;
		}[],
		visible: boolean,
		model: ITextModel,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ITestService testService: ITestService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ICommandService commandService: ICommandService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITestProfileService testProfileService: ITestProfileService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) {
		super(tests, visible, model, codeEditorService, testService, contextMenuService, commandService, configurationService, testProfileService, contextKeyService, menuService);
	}

	public override getContextMenuActions() {
		const allActions: IAction[] = [];

		[
			{ bitset: TestRunProfileBitset.Run, label: localize('run all test', 'Run All Tests') },
			{ bitset: TestRunProfileBitset.Coverage, label: localize('run all test with coverage', 'Run All Tests with Coverage') },
			{ bitset: TestRunProfileBitset.Debug, label: localize('debug all test', 'Debug All Tests') },
		].forEach(({ bitset, label }, i) => {
			const canRun = this.tests.some(({ test }) => this.testProfileService.capabilitiesForTest(test.item) & bitset);
			if (canRun) {
				allActions.push(new Action(`testing.gutter.run${i}`, label, undefined, undefined, () => this.runWith(bitset)));
			}
		});

		const testItems = this.tests.map((testItem): IMultiRunTest => ({
			currentLabel: testItem.test.item.label,
			testItem,
			parent: TestId.fromString(testItem.test.item.extId).parentId,
		}));

		const getLabelConflicts = (tests: typeof testItems) => {
			const labelCount = new Map<string, number>();
			for (const test of tests) {
				labelCount.set(test.currentLabel, (labelCount.get(test.currentLabel) || 0) + 1);
			}

			return tests.filter(e => labelCount.get(e.currentLabel)! > 1);
		};

		let conflicts, hasParent = true;
		while ((conflicts = getLabelConflicts(testItems)).length && hasParent) {
			for (const conflict of conflicts) {
				if (conflict.parent) {
					const parent = this.testService.collection.getNodeById(conflict.parent.toString());
					conflict.currentLabel = parent?.item.label + ' > ' + conflict.currentLabel;
					conflict.parent = conflict.parent.parentId;
				} else {
					hasParent = false;
				}
			}
		}

		testItems.sort((a, b) => {
			const ai = a.testItem.test.item;
			const bi = b.testItem.test.item;
			return (ai.sortText || ai.label).localeCompare(bi.sortText || bi.label);
		});

		const disposable = new DisposableStore();
		let testSubmenus: IAction[] = testItems.map(({ currentLabel, testItem }) => {
			const actions = this.getTestContextMenuActions(testItem.test, testItem.resultItem);
			disposable.add(actions);
			let label = stripIcons(currentLabel);
			const lf = label.indexOf('\n');
			if (lf !== -1) {
				label = label.slice(0, lf);
			}

			return new SubmenuAction(testItem.test.item.extId, label, actions.object);
		});


		const overflow = testSubmenus.length - MAX_TESTS_IN_SUBMENU;
		if (overflow > 0) {
			testSubmenus = testSubmenus.slice(0, MAX_TESTS_IN_SUBMENU);
			testSubmenus.push(new Action(
				'testing.gutter.overflow',
				localize('testOverflowItems', '{0} more tests...', overflow),
				undefined,
				undefined,
				() => this.pickAndRun(testItems),
			));
		}

		return { object: Separator.join(allActions, testSubmenus), dispose: () => disposable.dispose() };
	}

	private async pickAndRun(testItems: IMultiRunTest[]) {
		const doPick = <T extends IQuickPickItem>(items: T[], title: string) => new Promise<T | undefined>(resolve => {
			const disposables = new DisposableStore();
			const pick = disposables.add(this.quickInputService.createQuickPick<T>());
			pick.placeholder = title;
			pick.items = items;
			disposables.add(pick.onDidHide(() => {
				resolve(undefined);
				disposables.dispose();
			}));
			disposables.add(pick.onDidAccept(() => {
				resolve(pick.selectedItems[0]);
				disposables.dispose();
			}));
			pick.show();
		});

		const item = await doPick(
			testItems.map(({ currentLabel, testItem }) => ({ label: currentLabel, test: testItem.test, result: testItem.resultItem })),
			localize('selectTestToRun', 'Select a test to run'),
		);

		if (!item) {
			return;
		}

		const actions = this.getTestContextMenuActions(item.test, item.result);
		try {
			(await doPick(actions.object, item.label))?.run();
		} finally {
			actions.dispose();
		}
	}
}

class RunSingleTestDecoration extends RunTestDecoration implements ITestDecoration {
	constructor(
		test: IncrementalTestCollectionItem,
		resultItem: TestResultItem | undefined,
		model: ITextModel,
		visible: boolean,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ITestService testService: ITestService,
		@ICommandService commandService: ICommandService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITestProfileService testProfiles: ITestProfileService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService,
	) {
		super([{ test, resultItem }], visible, model, codeEditorService, testService, contextMenuService, commandService, configurationService, testProfiles, contextKeyService, menuService);
	}

	override getContextMenuActions() {
		return this.getTestContextMenuActions(this.tests[0].test, this.tests[0].resultItem);
	}
}

const lineBreakRe = /\r?\n\s*/g;

class TestMessageDecoration implements ITestDecoration {
	public static readonly inlineClassName = 'test-message-inline-content';
	public static readonly decorationId = `testmessage-${generateUuid()}`;

	public id = '';

	public readonly editorDecoration: IModelDeltaDecoration;
	public readonly line: number;

	private readonly contentIdClass = `test-message-inline-content-id${generateUuid()}`;

	constructor(
		public readonly testMessage: ITestMessage,
		private readonly messageUri: URI | undefined,
		textModel: ITextModel,
		@ITestingPeekOpener private readonly peekOpener: ITestingPeekOpener,
		@ICodeEditorService editorService: ICodeEditorService,
	) {
		const location = testMessage.location!;
		this.line = clamp(location.range.startLineNumber, 0, textModel.getLineCount());
		const severity = testMessage.type;
		const message = testMessage.message;

		const options = editorService.resolveDecorationOptions(TestMessageDecoration.decorationId, true);
		options.hoverMessage = typeof message === 'string' ? new MarkdownString().appendText(message) : message;
		options.zIndex = 10; // todo: in spite of the z-index, this appears behind gitlens
		options.className = `testing-inline-message-severity-${severity}`;
		options.isWholeLine = true;
		options.stickiness = TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;
		options.collapseOnReplaceEdit = true;

		let inlineText = renderTestMessageAsText(message).replace(lineBreakRe, ' ');
		if (inlineText.length > MAX_INLINE_MESSAGE_LENGTH) {
			inlineText = inlineText.slice(0, MAX_INLINE_MESSAGE_LENGTH - 1) + '…';
		}

		options.after = {
			content: inlineText,
			inlineClassName: `test-message-inline-content test-message-inline-content-s${severity} ${this.contentIdClass} ${messageUri ? 'test-message-inline-content-clickable' : ''}`
		};
		options.showIfCollapsed = true;

		const rulerColor = severity === TestMessageType.Error
			? overviewRulerError
			: overviewRulerInfo;

		if (rulerColor) {
			options.overviewRuler = { color: themeColorFromId(rulerColor), position: OverviewRulerLane.Right };
		}

		const lineLength = textModel.getLineLength(this.line);
		const column = lineLength ? (lineLength + 1) : location.range.endColumn;
		this.editorDecoration = {
			options,
			range: {
				startLineNumber: this.line,
				startColumn: column,
				endColumn: column,
				endLineNumber: this.line,
			}
		};
	}

	click(e: IEditorMouseEvent): boolean {
		if (e.event.rightButton) {
			return false;
		}

		if (!this.messageUri) {
			return false;
		}

		if (e.target.element?.className.includes(this.contentIdClass)) {
			this.peekOpener.peekUri(this.messageUri);
		}

		return false;
	}

	getContextMenuActions() {
		return { object: [], dispose: () => { } };
	}
}

const ERROR_CONTENT_WIDGET_HEIGHT = 20;

class TestErrorContentWidget extends Disposable implements IContentWidget {
	private readonly id = generateUuid();

	/** @inheritdoc */
	public readonly allowEditorOverflow = false;

	private readonly node = dom.h('div.test-error-content-widget', [
		dom.h('div.inner@inner', [
			dom.h('div.arrow@arrow'),
			dom.h(`span${ThemeIcon.asCSSSelector(testingStatesToIcons.get(TestResultState.Failed)!)}`),
			dom.h('span.content@name'),
		]),
	]);

	public get line() {
		return this.position.lineNumber;
	}

	constructor(
		private readonly editor: ICodeEditor,
		private position: Position,
		public readonly message: ITestErrorMessage,
		public readonly resultItem: TestResultItem,
		uri: URI,
		@ITestingPeekOpener readonly peekOpener: ITestingPeekOpener,
	) {
		super();

		const setMarginTop = () => {
			const lineHeight = editor.getOption(EditorOption.lineHeight);
			this.node.root.style.marginTop = (lineHeight - ERROR_CONTENT_WIDGET_HEIGHT) / 2 + 'px';
		};

		setMarginTop();
		this._register(editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.lineHeight)) {
				setMarginTop();
			}
		}));

		let text: string;
		if (message.expected !== undefined && message.actual !== undefined) {
			text = `${truncateMiddle(message.actual.replace(/\s+/g, ' '), 30)} != ${truncateMiddle(message.expected.replace(/\s+/g, ' '), 30)}`;
		} else {
			const msg = renderStringAsPlaintext(message.message);
			const lf = msg.indexOf('\n');
			text = lf === -1 ? msg : msg.slice(0, lf);
		}

		this.node.root.addEventListener('click', e => {
			this.peekOpener.peekUri(uri);
			e.preventDefault();
		});

		const ctrl = TestingOutputPeekController.get(editor);
		if (ctrl) {
			this._register(autorun(reader => {
				const subject = ctrl.subject.read(reader);
				const isCurrent = subject instanceof MessageSubject && subject.message === message;
				this.node.root.classList.toggle('is-current', isCurrent);
			}));
		}

		this.node.name.innerText = text || 'Test Failed';

		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '15');
		svg.setAttribute('height', '10');
		svg.setAttribute('preserveAspectRatio', 'none');
		svg.setAttribute('viewBox', '0 0 15 10');

		const leftArrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		leftArrow.setAttribute('d', 'M15 0 L10 0 L0 5 L10 10 L15 10 Z');
		svg.append(leftArrow);

		this.node.arrow.appendChild(svg);

		this._register(editor.onDidChangeModelContent(e => {
			for (const c of e.changes) {
				if (c.range.startLineNumber > this.line) {
					continue;
				}
				if (
					c.range.startLineNumber <= this.line && c.range.endLineNumber >= this.line
					|| (resultItem.item.range && resultItem.item.range.startLineNumber <= c.range.startLineNumber && resultItem.item.range.endLineNumber >= c.range.endLineNumber)
				) {
					TestingDecorations.invalidatedTests.add(this.resultItem);
					this.dispose(); // todo
				}

				const adjust = count(c.text, '\n') - (c.range.endLineNumber - c.range.startLineNumber);
				if (adjust !== 0) {
					this.position = this.position.delta(adjust);
					this.editor.layoutContentWidget(this);
				}
			}
		}));

		editor.addContentWidget(this);
		this._register(toDisposable(() => editor.removeContentWidget(this)));
	}

	public getId(): string {
		return this.id;
	}

	public getDomNode(): HTMLElement {
		return this.node.root;
	}

	public getPosition(): IContentWidgetPosition | null {
		return {
			position: this.position,
			preference: [ContentWidgetPositionPreference.EXACT],
		};
	}

	afterRender(_position: ContentWidgetPositionPreference | null, coordinate: IContentWidgetRenderedCoordinate | null): void {
		if (coordinate) {
			const { verticalScrollbarWidth } = this.editor.getLayoutInfo();
			const scrollWidth = this.editor.getScrollWidth();
			this.node.inner.style.maxWidth = `${scrollWidth - verticalScrollbarWidth - coordinate.left - 20}px`;
		}
	}
}
