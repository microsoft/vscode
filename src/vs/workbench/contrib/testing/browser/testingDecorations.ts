/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { renderStringAsPlaintext } from 'vs/base/browser/markdownRenderer';
import { Action, IAction, Separator, SubmenuAction } from 'vs/base/common/actions';
import { equals } from 'vs/base/common/arrays';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableStore, IReference, MutableDisposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { Constants } from 'vs/base/common/uint';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidgetPosition, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { editorCodeLensForeground, overviewRulerError, overviewRulerInfo } from 'vs/editor/common/core/editorColorRegistry';
import { IRange, Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IModelDeltaDecoration, ITextModel, OverviewRulerLane, TrackedRangeStickiness } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { localize } from 'vs/nls';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { registerThemingParticipant, themeColorFromId, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { BREAKPOINT_EDITOR_CONTRIBUTION_ID, IBreakpointEditorContribution } from 'vs/workbench/contrib/debug/common/debug';
import { getTestItemContextOverlay } from 'vs/workbench/contrib/testing/browser/explorerProjections/testItemContextOverlay';
import { testingRunAllIcon, testingRunIcon, testingStatesToIcons } from 'vs/workbench/contrib/testing/browser/icons';
import { testMessageSeverityColors } from 'vs/workbench/contrib/testing/browser/theme';
import { DefaultGutterClickAction, getTestingConfiguration, TestingConfigKeys } from 'vs/workbench/contrib/testing/common/configuration';
import { labelForTestInState, Testing } from 'vs/workbench/contrib/testing/common/constants';
import { IncrementalTestCollectionItem, InternalTestItem, IRichLocation, ITestMessage, ITestRunProfile, TestDiffOpType, TestMessageType, TestResultItem, TestResultState, TestRunProfileBitset } from 'vs/workbench/contrib/testing/common/testTypes';
import { ITestDecoration as IPublicTestDecoration, ITestingDecorationsService, TestDecorations } from 'vs/workbench/contrib/testing/common/testingDecorations';
import { ITestingPeekOpener } from 'vs/workbench/contrib/testing/common/testingPeekOpener';
import { isFailedState, maxPriority } from 'vs/workbench/contrib/testing/common/testingStates';
import { buildTestUri, parseTestUri, TestUriType } from 'vs/workbench/contrib/testing/common/testingUri';
import { ITestProfileService } from 'vs/workbench/contrib/testing/common/testProfileService';
import { LiveTestResult } from 'vs/workbench/contrib/testing/common/testResult';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { getContextForTestItem, ITestService, testsInFile } from 'vs/workbench/contrib/testing/common/testService';
import { stripIcons } from 'vs/base/common/iconLabels';

const MAX_INLINE_MESSAGE_LENGTH = 128;

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

export class TestingDecorationService extends Disposable implements ITestingDecorationsService {
	declare public _serviceBrand: undefined;

	private generation = 0;
	private readonly changeEmitter = new Emitter<void>();
	private readonly decorationCache = new ResourceMap<{
		/** The document version at which ranges have been updated, requiring rerendering */
		rangeUpdateVersionId?: number;
		/** Counter for the results rendered in the document */
		generation: number;
		value: TestDecorations<ITestDecoration>;
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

		modelService.onModelRemoved(e => this.decorationCache.delete(e.uri));

		const debounceInvalidate = this._register(new RunOnceScheduler(() => this.invalidate(), 100));

		// If ranges were updated in the document, mark that we should explicitly
		// sync decorations to the published lines, since we assume that everything
		// is up to date. This prevents issues, as in #138632, #138835, #138922.
		this._register(this.testService.onWillProcessDiff(diff => {
			for (const entry of diff) {
				if (entry.op !== TestDiffOpType.Update || entry.item.docv === undefined || entry.item.item?.range === undefined) {
					continue;
				}

				const uri = this.testService.collection.getNodeById(entry.item.extId)?.item.uri;
				const rec = uri && this.decorationCache.get(uri);
				if (rec) {
					rec.rangeUpdateVersionId = entry.item.docv;
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
	}

	/** @inheritdoc */
	public invalidateResultMessage(message: ITestMessage) {
		this.invalidatedMessages.add(message);
		this.invalidate();
	}

	/** @inheritdoc */
	public syncDecorations(resource: URI): TestDecorations {
		const model = this.modelService.getModel(resource);
		if (!model) {
			return new TestDecorations();
		}

		const cached = this.decorationCache.get(resource);
		if (cached && cached.generation === this.generation && (cached.rangeUpdateVersionId === undefined || cached.rangeUpdateVersionId !== model.getVersionId())) {
			return cached.value;
		}

		return this.applyDecorations(model);
	}

	/** @inheritdoc */
	public getDecoratedRangeForTest(resource: URI, testId: string) {
		const model = this.modelService.getModel(resource);
		if (!model) {
			return undefined;
		}

		const decoration = this.syncDecorations(resource).value.find(v => v instanceof RunTestDecoration && v.isForTest(testId));
		if (!decoration) {
			return undefined;
		}

		return model.getDecorationRange(decoration.id) || undefined;
	}

	private invalidate() {
		this.generation++;
		this.changeEmitter.fire();
	}

	/**
	 * Applies the current set of test decorations to the given text model.
	 */
	private applyDecorations(model: ITextModel) {
		const gutterEnabled = getTestingConfiguration(this.configurationService, TestingConfigKeys.GutterEnabled);
		const uriStr = model.uri.toString();
		const cached = this.decorationCache.get(model.uri);
		const testRangesUpdated = cached?.rangeUpdateVersionId === model.getVersionId();
		const lastDecorations = cached?.value ?? new TestDecorations();
		const newDecorations = new TestDecorations<ITestDecoration>();

		model.changeDecorations(accessor => {
			const runDecorations = new TestDecorations<{ line: number; id: ''; test: IncrementalTestCollectionItem; resultItem: TestResultItem | undefined }>();
			for (const test of this.testService.collection.all) {
				if (!test.item.range || test.item.uri?.toString() !== uriStr) {
					continue;
				}

				const stateLookup = this.results.getStateById(test.item.extId);
				const line = test.item.range.startLineNumber;
				runDecorations.push({ line, id: '', test, resultItem: stateLookup?.[1] });
			}

			for (const [line, tests] of runDecorations.lines()) {
				const multi = tests.length > 1;
				let existing = lastDecorations.findOnLine(line, d => multi ? d instanceof MultiRunTestDecoration : d instanceof RunSingleTestDecoration) as RunTestDecoration | undefined;

				// see comment in the constructor for what's going on here
				if (existing && testRangesUpdated && model.getDecorationRange(existing.id)?.startLineNumber !== line) {
					existing = undefined;
				}

				if (existing) {
					if (existing.replaceOptions(tests, gutterEnabled)) {
						accessor.changeDecorationOptions(existing.id, existing.editorDecoration.options);
					}
					newDecorations.push(existing);
				} else {
					newDecorations.push(multi
						? this.instantiationService.createInstance(MultiRunTestDecoration, tests, gutterEnabled, model)
						: this.instantiationService.createInstance(RunSingleTestDecoration, tests[0].test, tests[0].resultItem, model, gutterEnabled));
				}
			}

			const lastResult = this.results.results[0];
			if (this.testService.showInlineOutput.value && lastResult instanceof LiveTestResult) {
				for (const task of lastResult.tasks) {
					for (const m of task.otherMessages) {
						if (!this.invalidatedMessages.has(m) && m.location?.uri.toString() === uriStr) {
							const decoration = lastDecorations.findOnLine(m.location.range.startLineNumber, l => l instanceof TestMessageDecoration && l.testMessage === m)
								|| this.instantiationService.createInstance(TestMessageDecoration, m, undefined, model);
							newDecorations.push(decoration);
						}
					}
				}

				const messageLines = new Set<number>();
				for (const test of lastResult.tests) {
					for (let taskId = 0; taskId < test.tasks.length; taskId++) {
						const state = test.tasks[taskId];
						for (let i = 0; i < state.messages.length; i++) {
							const m = state.messages[i];
							if (this.invalidatedMessages.has(m) || m.location?.uri.toString() !== uriStr) {
								continue;
							}

							// Only add one message per line number. Overlapping messages
							// don't appear well, and the peek will show all of them (#134129)
							const line = m.location.range.startLineNumber;
							if (messageLines.has(line)) {
								continue;
							}
							messageLines.add(line);

							const previous = lastDecorations.findOnLine(line, l => l instanceof TestMessageDecoration && l.testMessage === m);
							if (previous) {
								newDecorations.push(previous);
								continue;
							}

							const messageUri = buildTestUri({
								type: TestUriType.ResultActualOutput,
								messageIndex: i,
								taskIndex: taskId,
								resultId: lastResult.id,
								testExtId: test.item.extId,
							});

							newDecorations.push(this.instantiationService.createInstance(TestMessageDecoration, m, messageUri, model));
						}
					}
				}
			}

			const saveFromRemoval = new Set<string>();
			for (const decoration of newDecorations.value) {
				if (decoration.id === '') {
					decoration.id = accessor.addDecoration(decoration.editorDecoration.range, decoration.editorDecoration.options);
				} else {
					saveFromRemoval.add(decoration.id);
				}
			}

			for (const decoration of lastDecorations.value) {
				if (!saveFromRemoval.has(decoration.id)) {
					accessor.removeDecoration(decoration.id);
				}
			}

			this.decorationCache.set(model.uri, {
				generation: this.generation,
				rangeUpdateVersionId: cached?.rangeUpdateVersionId,
				value: newDecorations,
			});
		});

		return newDecorations;
	}
}

export class TestingDecorations extends Disposable implements IEditorContribution {
	/**
	 * Gets the decorations associated with the given code editor.
	 */
	public static get(editor: ICodeEditor): TestingDecorations | null {
		return editor.getContribution<TestingDecorations>(Testing.DecorationsContributionId);
	}

	private currentUri?: URI;
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
			if (this.currentUri) {
				decorations.syncDecorations(this.currentUri);
			}
		}));
		this._register(this.editor.onDidChangeModel(e => this.attachModel(e.newModelUrl || undefined)));
		this._register(this.editor.onMouseDown(e => {
			if (e.target.position && this.currentUri) {
				const modelDecorations = editor.getModel()?.getDecorationsInRange(Range.fromPositions(e.target.position)) ?? [];
				for (const { id } of modelDecorations) {
					const cache = decorations.syncDecorations(this.currentUri) as TestDecorations<ITestDecoration>;
					if (cache.get(id)?.click(e)) {
						e.event.stopPropagation();
						return;
					}
				}
			}
		}));
		this._register(this.editor.onDidChangeModelContent(e => {
			const model = editor.getModel();
			if (!this.currentUri || !model) {
				return;
			}

			const currentDecorations = decorations.syncDecorations(this.currentUri);
			for (const change of e.changes) {
				const modelDecorations = model.getLinesDecorations(change.range.startLineNumber, change.range.endLineNumber);
				for (const { id } of modelDecorations) {
					const decoration = currentDecorations.get(id);
					if (decoration instanceof TestMessageDecoration) {
						decorations.invalidateResultMessage(decoration.testMessage);
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

		this.currentUri = uri;

		if (!uri) {
			return;
		}

		this.decorations.syncDecorations(uri);

		(async () => {
			for await (const _test of testsInFile(this.testService.collection, this.uriIdentityService, uri)) {
				// consume the iterator so that all tests in the file get expanded. Or
				// at least until the URI changes. If new items are requested, changes
				// will be trigged in the `onDidProcessDiff` callback.
				if (this.currentUri !== uri) {
					break;
				}
			}
		})();
	}
}

const firstLineRange = (originalRange: IRange) => ({
	startLineNumber: originalRange.startLineNumber,
	endLineNumber: originalRange.startLineNumber,
	startColumn: 0,
	endColumn: 1,
});

const createRunTestDecoration = (tests: readonly IncrementalTestCollectionItem[], states: readonly (TestResultItem | undefined)[], visible: boolean): IModelDeltaDecoration => {
	const range = tests[0]?.item.range;
	if (!range) {
		throw new Error('Test decorations can only be created for tests with a range');
	}

	if (!visible) {
		return { range: firstLineRange(range), options: { isWholeLine: true, description: 'run-test-decoration' } };
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
	const icon = computedState === TestResultState.Unset
		? (hasMultipleTests ? testingRunAllIcon : testingRunIcon)
		: testingStatesToIcons.get(computedState)!;

	let hoverMessage: IMarkdownString | undefined;

	let glyphMarginClassName = ThemeIcon.asClassName(icon) + ' testing-run-glyph';
	if (retired) {
		glyphMarginClassName += ' retired';
	}

	return {
		range: firstLineRange(range),
		options: {
			description: 'run-test-decoration',
			isWholeLine: true,
			get hoverMessage() {
				if (!hoverMessage) {
					const building = hoverMessage = new MarkdownString('', true).appendText(hoverMessageParts.join(', ') + '.');
					if (testIdWithMessages) {
						const args = encodeURIComponent(JSON.stringify([testIdWithMessages]));
						building.appendMarkdown(`[${localize('peekTestOutout', 'Peek Test Output')}](command:vscode.peekTestError?${args})`);
					}
				}

				return hoverMessage;
			},
			glyphMarginClassName,
			stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		}
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

	public editorDecoration: IModelDeltaDecoration;

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
		this.editorDecoration = createRunTestDecoration(tests.map(t => t.test), tests.map(t => t.resultItem), visible);
		this.editorDecoration.options.glyphMarginHoverMessage = new MarkdownString().appendText(this.getGutterLabel());
	}

	/** @inheritdoc */
	public click(e: IEditorMouseEvent): boolean {
		if (e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN) {
			return false;
		}

		if (e.event.rightButton) {
			this.showContextMenu(e);
			return true;
		}

		switch (getTestingConfiguration(this.configurationService, TestingConfigKeys.DefaultGutterClickAction)) {
			case DefaultGutterClickAction.ContextMenu:
				this.showContextMenu(e);
				break;
			case DefaultGutterClickAction.Debug:
				this.defaultDebug();
				break;
			case DefaultGutterClickAction.Run:
			default:
				this.defaultRun();
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
		if (visible === this.visible
			&& equals(this.tests.map(t => t.test.item.extId), newTests.map(t => t.test.item.extId))
			&& this.tests.map(t => t.resultItem?.computedState) === newTests.map(t => t.resultItem?.computedState)) {
			return false;
		}

		this.tests = newTests;
		this.visible = visible;
		this.editorDecoration.options = createRunTestDecoration(newTests.map(t => t.test), newTests.map(t => t.resultItem), visible).options;
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
	protected abstract getContextMenuActions(): IReference<IAction[]>;

	protected defaultRun() {
		return this.testService.runTests({
			tests: this.tests.map(({ test }) => test),
			group: TestRunProfileBitset.Run,
		});
	}

	protected defaultDebug() {
		return this.testService.runTests({
			tests: this.tests.map(({ test }) => test),
			group: TestRunProfileBitset.Debug,
		});
	}

	private showContextMenu(e: IEditorMouseEvent) {
		let actions = this.getContextMenuActions();
		const editor = this.codeEditorService.listCodeEditors().find(e => e.getModel() === this.model);
		if (editor) {
			const contribution = editor.getContribution<IBreakpointEditorContribution>(BREAKPOINT_EDITOR_CONTRIBUTION_ID);
			if (contribution) {
				actions = {
					dispose: actions.dispose,
					object: Separator.join(
						actions.object,
						contribution.getContextMenuActionsAtPosition(this.line, this.model)
					)
				};
			}
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => ({ x: e.event.posx, y: e.event.posy }),
			getActions: () => actions.object,
			onHide: () => actions.dispose,
		});
	}

	private getGutterLabel() {
		switch (getTestingConfiguration(this.configurationService, TestingConfigKeys.DefaultGutterClickAction)) {
			case DefaultGutterClickAction.ContextMenu:
				return localize('testing.gutterMsg.contextMenu', 'Click for test options');
			case DefaultGutterClickAction.Debug:
				return localize('testing.gutterMsg.debug', 'Click to debug tests, right click for more options');
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
		const capabilities = this.testProfileService.capabilitiesForTest(test);
		if (capabilities & TestRunProfileBitset.Run) {
			testActions.push(new Action('testing.gutter.run', localize('run test', 'Run Test'), undefined, undefined, () => this.testService.runTests({
				group: TestRunProfileBitset.Run,
				tests: [test],
			})));
		}

		if (capabilities & TestRunProfileBitset.Debug) {
			testActions.push(new Action('testing.gutter.debug', localize('debug test', 'Debug Test'), undefined, undefined, () => this.testService.runTests({
				group: TestRunProfileBitset.Debug,
				tests: [test],
			})));
		}

		if (capabilities & TestRunProfileBitset.HasNonDefaultProfile) {
			testActions.push(new Action('testing.runUsing', localize('testing.runUsing', 'Execute Using Profile...'), undefined, undefined, async () => {
				const profile: ITestRunProfile | undefined = await this.commandService.executeCommand('vscode.pickTestProfile', { onlyForTest: test });
				if (!profile) {
					return;
				}

				this.testService.runResolvedTests({
					targets: [{
						profileGroup: profile.group,
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
		const menu = this.menuService.createMenu(MenuId.TestItemGutter, contextOverlay);

		try {
			const target: IAction[] = [];
			const arg = getContextForTestItem(this.testService.collection, test.item.extId);
			createAndFillInContextMenuActions(menu, { shouldForwardArgs: true, arg }, target);
			return target;
		} finally {
			menu.dispose();
		}
	}
}

class MultiRunTestDecoration extends RunTestDecoration implements ITestDecoration {
	public get testIds() {
		return this.tests.map(t => t.test.item.extId);
	}

	public get displayedStates() {
		return this.tests.map(t => t.resultItem?.computedState);
	}

	protected override getContextMenuActions() {
		const allActions: IAction[] = [];
		if (this.tests.some(({ test }) => this.testProfileService.capabilitiesForTest(test) & TestRunProfileBitset.Run)) {
			allActions.push(new Action('testing.gutter.runAll', localize('run all test', 'Run All Tests'), undefined, undefined, () => this.defaultRun()));
		}

		if (this.tests.some(({ test }) => this.testProfileService.capabilitiesForTest(test) & TestRunProfileBitset.Debug)) {
			allActions.push(new Action('testing.gutter.debugAll', localize('debug all test', 'Debug All Tests'), undefined, undefined, () => this.defaultDebug()));
		}

		const testItems = this.tests.map(testItem => ({
			currentLabel: testItem.test.item.label,
			testItem,
			parent: testItem.test.parent,
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
					const parent = this.testService.collection.getNodeById(conflict.parent);
					conflict.currentLabel = parent?.item.label + ' > ' + conflict.currentLabel;
					conflict.parent = parent?.parent ? parent.parent : null;
				} else {
					hasParent = false;
				}
			}
		}

		const disposable = new DisposableStore();
		const testSubmenus = testItems.map(({ currentLabel, testItem }) => {
			const actions = this.getTestContextMenuActions(testItem.test, testItem.resultItem);
			disposable.add(actions);
			return new SubmenuAction(testItem.test.item.extId, stripIcons(currentLabel), actions.object);
		});

		return { object: Separator.join(allActions, testSubmenus), dispose: () => disposable.dispose() };
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

	protected override getContextMenuActions() {
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

		let inlineText = renderStringAsPlaintext(message).replace(lineBreakRe, ' ');
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
}

registerThemingParticipant((theme, collector) => {
	const codeLensForeground = theme.getColor(editorCodeLensForeground);
	if (codeLensForeground) {
		collector.addRule(`.testing-diff-lens-widget { color: ${codeLensForeground}; }`);
	}

	for (const [severity, { decorationForeground }] of Object.entries(testMessageSeverityColors)) {
		collector.addRule(`.test-message-inline-content-s${severity} { color: ${theme.getColor(decorationForeground)} !important }`);
	}
});
