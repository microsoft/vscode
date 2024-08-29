/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Action, IAction, Separator, SubmenuAction } from 'vs/base/common/actions';
import { equals } from 'vs/base/common/arrays';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { stripIcons } from 'vs/base/common/iconLabels';
import { Iterable } from 'vs/base/common/iterator';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore, IReference, MutableDisposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { isMacintosh } from 'vs/base/common/platform';
import { ThemeIcon } from 'vs/base/common/themables';
import { Constants } from 'vs/base/common/uint';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidgetPosition, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { overviewRulerError, overviewRulerInfo } from 'vs/editor/common/core/editorColorRegistry';
import { IRange } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { GlyphMarginLane, IModelDecorationOptions, IModelDeltaDecoration, ITextModel, OverviewRulerLane, TrackedRangeStickiness } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { localize } from 'vs/nls';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { EditorLineNumberContextMenu, GutterActionsRegistry } from 'vs/workbench/contrib/codeEditor/browser/editorLineNumberMenu';
import { getTestItemContextOverlay } from 'vs/workbench/contrib/testing/browser/explorerProjections/testItemContextOverlay';
import { testingDebugAllIcon, testingDebugIcon, testingRunAllIcon, testingRunIcon, testingStatesToIcons } from 'vs/workbench/contrib/testing/browser/icons';
import { renderTestMessageAsText } from 'vs/workbench/contrib/testing/browser/testMessageColorizer';
import { DefaultGutterClickAction, TestingConfigKeys, getTestingConfiguration } from 'vs/workbench/contrib/testing/common/configuration';
import { Testing, labelForTestInState } from 'vs/workbench/contrib/testing/common/constants';
import { TestId } from 'vs/workbench/contrib/testing/common/testId';
import { ITestProfileService } from 'vs/workbench/contrib/testing/common/testProfileService';
import { ITestResult, LiveTestResult } from 'vs/workbench/contrib/testing/common/testResult';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { ITestService, getContextForTestItem, simplifyTestsToExecute, testsInFile } from 'vs/workbench/contrib/testing/common/testService';
import { IRichLocation, ITestMessage, ITestRunProfile, IncrementalTestCollectionItem, InternalTestItem, TestDiffOpType, TestMessageType, TestResultItem, TestResultState, TestRunProfileBitset } from 'vs/workbench/contrib/testing/common/testTypes';
import { ITestDecoration as IPublicTestDecoration, ITestingDecorationsService, TestDecorations } from 'vs/workbench/contrib/testing/common/testingDecorations';
import { ITestingPeekOpener } from 'vs/workbench/contrib/testing/common/testingPeekOpener';
import { isFailedState, maxPriority } from 'vs/workbench/contrib/testing/common/testingStates';
import { TestUriType, buildTestUri, parseTestUri } from 'vs/workbench/contrib/testing/common/testingUri';

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
	private readonly messages = new Map<ITestMessage, TestMessageDecoration>();

	public get size() {
		return this.runByIdKey.size + this.messages.size;
	}

	/** Gets a test run decoration that contains exactly the given test IDs */
	public getForExactTests(testIds: string[]) {
		const key = testIds.sort().join('\0\0');
		return this.runByIdKey.get(key);
	}

	/** Gets the decoration that corresponds to the given test message */
	public getMessage(message: ITestMessage) {
		return this.messages.get(message);
	}

	/** Removes the decoration for the given test messsage */
	public removeMessage(message: ITestMessage) {
		this.messages.delete(message);
	}

	/** Adds a new test message decoration */
	public addMessage(d: TestMessageDecoration) {
		this.messages.set(d.testMessage, d);
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
		for (const d of this.messages.values()) {
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
		for (const d of this.messages.values()) {
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
			this.testService.showInlineOutput.onDidChange,
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
		const uriStr = model.uri.toString();
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

			const messageLines = new Set<number>();
			if (getTestingConfiguration(this.configurationService, TestingConfigKeys.ShowAllMessages)) {
				this.results.results.forEach(lastResult => this.applyDecorationsFromResult(lastResult, messageLines, uriStr, lastDecorations, model, newDecorations));
			} else {
				this.applyDecorationsFromResult(this.results.results[0], messageLines, uriStr, lastDecorations, model, newDecorations);
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

	private applyDecorationsFromResult(lastResult: ITestResult, messageLines: Set<Number>, uriStr: string, lastDecorations: CachedDecorations, model: ITextModel, newDecorations: CachedDecorations) {
		if (this.testService.showInlineOutput.value && lastResult instanceof LiveTestResult) {
			for (const task of lastResult.tasks) {
				for (const m of task.otherMessages) {
					if (!this.invalidatedMessages.has(m) && m.location?.uri.toString() === uriStr) {
						const decoration = lastDecorations.getMessage(m) || this.instantiationService.createInstance(TestMessageDecoration, m, undefined, model);
						newDecorations.addMessage(decoration);
					}
				}
			}

			for (const test of lastResult.tests) {
				for (let taskId = 0; taskId < test.tasks.length; taskId++) {
					const state = test.tasks[taskId];
					// push error decorations first so they take precedence over normal output
					for (const kind of [TestMessageType.Error, TestMessageType.Output]) {
						for (let i = 0; i < state.messages.length; i++) {
							const m = state.messages[i];
							if (m.type !== kind || this.invalidatedMessages.has(m) || m.location?.uri.toString() !== uriStr) {
								continue;
							}

							// Only add one message per line number. Overlapping messages
							// don't appear well, and the peek will show all of them (#134129)
							const line = m.location.range.startLineNumber;
							if (!messageLines.has(line)) {
								const decoration = lastDecorations.getMessage(m) || this.instantiationService.createInstance(TestMessageDecoration, m, buildTestUri({
									type: TestUriType.ResultActualOutput,
									messageIndex: i,
									taskIndex: taskId,
									resultId: lastResult.id,
									testExtId: test.item.extId,
								}), model);

								newDecorations.addMessage(decoration);
								messageLines.add(line);
							}
						}
					}
				}
			}
		}
	}
}

export class TestingDecorations extends Disposable implements IEditorContribution {
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

	constructor(
		private readonly editor: ICodeEditor,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@ITestService private readonly testService: ITestService,
		@ITestingDecorationsService private readonly decorations: ITestingDecorationsService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
	) {
		super();

		codeEditorService.registerDecorationType('test-message-decoration', TestMessageDecoration.decorationId, {}, undefined, editor);

		this.attachModel(editor.getModel()?.uri);
		this._register(decorations.onDidChange(() => {
			if (this._currentUri) {
				decorations.syncDecorations(this._currentUri);
			}
		}));

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

			const currentDecorations = decorations.syncDecorations(this._currentUri);
			if (!currentDecorations.size) {
				return;
			}

			for (const e of evts) {
				for (const change of e.changes) {
					const modelDecorations = model.getLinesDecorations(change.range.startLineNumber, change.range.endLineNumber);
					for (const { id } of modelDecorations) {
						const decoration = currentDecorations.getById(id);
						if (decoration instanceof TestMessageDecoration) {
							decorations.invalidateResultMessage(decoration.testMessage);
						}
					}
				}
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

		const target: IAction[] = [];
		const arg = getContextForTestItem(this.testService.collection, test.item.extId);
		const menu = this.menuService.getMenuActions(MenuId.TestItemGutter, contextOverlay, { shouldForwardArgs: true, arg });
		createAndFillInContextMenuActions(menu, target);
		return target;
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
	public readonly location: IRichLocation;
	public readonly line: number;

	private readonly contentIdClass = `test-message-inline-content-id${generateUuid()}`;

	constructor(
		public readonly testMessage: ITestMessage,
		private readonly messageUri: URI | undefined,
		textModel: ITextModel,
		@ITestingPeekOpener private readonly peekOpener: ITestingPeekOpener,
		@ICodeEditorService editorService: ICodeEditorService,
	) {
		this.location = testMessage.location!;
		this.line = this.location.range.startLineNumber;
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
			content: ' '.repeat(4) + inlineText,
			inlineClassName: `test-message-inline-content test-message-inline-content-s${severity} ${this.contentIdClass} ${messageUri ? 'test-message-inline-content-clickable' : ''}`
		};
		options.showIfCollapsed = true;

		const rulerColor = severity === TestMessageType.Error
			? overviewRulerError
			: overviewRulerInfo;

		if (rulerColor) {
			options.overviewRuler = { color: themeColorFromId(rulerColor), position: OverviewRulerLane.Right };
		}

		const lineLength = textModel.getLineLength(this.location.range.startLineNumber);
		const column = lineLength ? (lineLength + 1) : this.location.range.endColumn;
		this.editorDecoration = {
			options,
			range: {
				startLineNumber: this.location.range.startLineNumber,
				startColumn: column,
				endColumn: column,
				endLineNumber: this.location.range.startLineNumber,
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
