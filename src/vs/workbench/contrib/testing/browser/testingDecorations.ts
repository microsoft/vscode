/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { renderStringAsPlaintext } from 'vs/base/browser/markdownRenderer';
import { Action, IAction, Separator, SubmenuAction } from 'vs/base/common/actions';
import { Event } from 'vs/base/common/event';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableStore, IDisposable, IReference, MutableDisposable } from 'vs/base/common/lifecycle';
import { setImmediate } from 'vs/base/common/platform';
import { removeAnsiEscapeCodes } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidgetPosition, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IRange } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IModelDeltaDecoration, OverviewRulerLane, TrackedRangeStickiness } from 'vs/editor/common/model';
import { editorCodeLensForeground, overviewRulerError, overviewRulerInfo } from 'vs/editor/common/view/editorColorRegistry';
import { localize } from 'vs/nls';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { registerThemingParticipant, themeColorFromId, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { BREAKPOINT_EDITOR_CONTRIBUTION_ID, IBreakpointEditorContribution } from 'vs/workbench/contrib/debug/common/debug';
import { getTestItemContextOverlay } from 'vs/workbench/contrib/testing/browser/explorerProjections/testItemContextOverlay';
import { testingRunAllIcon, testingRunIcon, testingStatesToIcons } from 'vs/workbench/contrib/testing/browser/icons';
import { TestingOutputPeekController } from 'vs/workbench/contrib/testing/browser/testingOutputPeek';
import { testMessageSeverityColors } from 'vs/workbench/contrib/testing/browser/theme';
import { DefaultGutterClickAction, getTestingConfiguration, TestingConfigKeys } from 'vs/workbench/contrib/testing/common/configuration';
import { labelForTestInState } from 'vs/workbench/contrib/testing/common/constants';
import { IncrementalTestCollectionItem, InternalTestItem, IRichLocation, ITestMessage, ITestRunProfile, TestMessageType, TestResultItem, TestResultState, TestRunProfileBitset } from 'vs/workbench/contrib/testing/common/testCollection';
import { isFailedState, maxPriority } from 'vs/workbench/contrib/testing/common/testingStates';
import { buildTestUri, parseTestUri, TestUriType } from 'vs/workbench/contrib/testing/common/testingUri';
import { ITestProfileService } from 'vs/workbench/contrib/testing/common/testProfileService';
import { LiveTestResult } from 'vs/workbench/contrib/testing/common/testResult';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { getContextForTestItem, ITestService, testsInFile } from 'vs/workbench/contrib/testing/common/testService';

function isOriginalInDiffEditor(codeEditorService: ICodeEditorService, codeEditor: ICodeEditor): boolean {
	const diffEditors = codeEditorService.listDiffEditors();

	for (const diffEditor of diffEditors) {
		if (diffEditor.getOriginalEditor() === codeEditor) {
			return true;
		}
	}

	return false;
}

export class TestingDecorations extends Disposable implements IEditorContribution {
	private currentUri?: URI;
	private lastDecorations: ITestDecoration[] = [];
	private readonly expectedWidget = new MutableDisposable<ExpectedLensContentWidget>();
	private readonly actualWidget = new MutableDisposable<ActualLensContentWidget>();

	/**
	 * List of messages that should be hidden because an editor changed their
	 * underlying ranges. I think this is good enough, because:
	 *  - Message decorations are never shown across reloads; this does not
	 *    need to persist
	 *  - Message instances are stable for any completed test results for
	 *    the duration of the session.
	 */
	private invalidatedMessages = new WeakSet<ITestMessage>();

	constructor(
		private readonly editor: ICodeEditor,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITestService private readonly testService: ITestService,
		@ITestResultService private readonly results: ITestResultService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.attachModel(editor.getModel()?.uri);
		this._register(this.editor.onDidChangeModel(e => this.attachModel(e.newModelUrl || undefined)));
		this._register(this.editor.onMouseDown(e => {
			for (const decoration of this.lastDecorations) {
				if (decoration.click(e)) {
					e.event.stopPropagation();
					return;
				}
			}
		}));
		this._register(this.editor.onDidChangeModelContent(e => {
			if (!this.currentUri) {
				return;
			}

			let update = false;
			for (const change of e.changes) {
				for (const deco of this.lastDecorations) {
					if (deco instanceof TestMessageDecoration
						&& deco.location.range.startLineNumber >= change.range.startLineNumber
						&& deco.location.range.endLineNumber <= change.range.endLineNumber
					) {
						this.invalidatedMessages.add(deco.testMessage);
						update = true;
					}
				}
			}

			if (update) {
				this.setDecorations(this.currentUri);
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

		this._register(this.results.onTestChanged(({ item: result }) => {
			if (this.currentUri && result.item.uri && result.item.uri.toString() === this.currentUri.toString()) {
				this.setDecorations(this.currentUri);
			}
		}));

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TestingConfigKeys.GutterEnabled)) {
				this.setDecorations(this.currentUri);
			}
		}));

		this._register(Event.any(
			this.results.onResultsChanged,
			this.testService.excluded.onTestExclusionsChanged,
			this.testService.showInlineOutput.onDidChange,
			this.testService.onDidProcessDiff,
		)(() => this.setDecorations(this.currentUri)));
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
			this.clearDecorations();
			return;
		}

		(async () => {
			for await (const _test of testsInFile(this.testService.collection, uri)) {
				// consume the iterator so that all tests in the file get expanded. Or
				// at least until the URI changes. If new items are requested, changes
				// will be trigged in the `onDidProcessDiff` callback.
				if (this.currentUri !== uri) {
					break;
				}
			}
		})();

		this.setDecorations(uri);
	}

	private setDecorations(uri: URI | undefined): void {
		if (!uri) {
			this.clearDecorations();
			return;
		}

		const gutterEnabled = getTestingConfiguration(this.configurationService, TestingConfigKeys.GutterEnabled);

		this.editor.changeDecorations(accessor => {
			const newDecorations: ITestDecoration[] = [];
			if (gutterEnabled) {
				for (const test of this.testService.collection.all) {
					if (!test.item.range || test.item.uri?.toString() !== uri.toString()) {
						continue;
					}

					const stateLookup = this.results.getStateById(test.item.extId);
					const line = test.item.range.startLineNumber;
					const resultItem = stateLookup?.[1];
					const existing = newDecorations.findIndex(d => d instanceof RunTestDecoration && d.line === line);
					if (existing !== -1) {
						newDecorations[existing] = (newDecorations[existing] as RunTestDecoration).merge(test, resultItem);
					} else {
						newDecorations.push(this.instantiationService.createInstance(RunSingleTestDecoration, test, this.editor, stateLookup?.[1]));
					}
				}
			}

			const lastResult = this.results.results[0];
			if (this.testService.showInlineOutput.value && lastResult instanceof LiveTestResult) {
				for (const task of lastResult.tasks) {
					for (const m of task.otherMessages) {
						if (!this.invalidatedMessages.has(m) && hasValidLocation(uri, m)) {
							newDecorations.push(this.instantiationService.createInstance(TestMessageDecoration, m, uri, m.location, this.editor));
						}
					}
				}

				for (const test of lastResult.tests) {
					for (let taskId = 0; taskId < test.tasks.length; taskId++) {
						const state = test.tasks[taskId];
						for (let i = 0; i < state.messages.length; i++) {
							const m = state.messages[i];
							if (!this.invalidatedMessages.has(m) && hasValidLocation(uri, m)) {
								const uri = m.type === TestMessageType.Info ? undefined : buildTestUri({
									type: TestUriType.ResultActualOutput,
									messageIndex: i,
									taskIndex: taskId,
									resultId: lastResult.id,
									testExtId: test.item.extId,
								});

								newDecorations.push(this.instantiationService.createInstance(TestMessageDecoration, m, uri, m.location, this.editor));
							}
						}
					}
				}
			}

			accessor
				.deltaDecorations(this.lastDecorations.map(d => d.id), newDecorations.map(d => d.editorDecoration))
				.forEach((id, i) => newDecorations[i].id = id);

			this.lastDecorations = newDecorations;
		});
	}

	private clearDecorations(): void {
		if (!this.lastDecorations.length) {
			return;
		}

		this.editor.changeDecorations(accessor => {
			for (const decoration of this.lastDecorations) {
				accessor.removeDecoration(decoration.id);
			}

			this.lastDecorations = [];
		});
	}
}

interface ITestDecoration extends IDisposable {
	/**
	 * ID of the decoration after being added to the editor, set after the
	 * decoration is applied.
	 */
	id: string;

	readonly editorDecoration: IModelDeltaDecoration;

	/**
	 * Handles a click event, returns true if it was handled.
	 */
	click(e: IEditorMouseEvent): boolean;
}

const hasValidLocation = <T extends { location?: IRichLocation }>(editorUri: URI, t: T): t is T & { location: IRichLocation } =>
	t.location?.uri.toString() === editorUri.toString();

const firstLineRange = (originalRange: IRange) => ({
	startLineNumber: originalRange.startLineNumber,
	endLineNumber: originalRange.startLineNumber,
	startColumn: 0,
	endColumn: 1,
});

const createRunTestDecoration = (tests: readonly IncrementalTestCollectionItem[], states: readonly (TestResultItem | undefined)[]): IModelDeltaDecoration => {
	const range = tests[0]?.item.range;
	if (!range) {
		throw new Error('Test decorations can only be created for tests with a range');
	}

	let computedState = TestResultState.Unset;
	let hoverMessageParts: string[] = [];
	let testIdWithMessages: string | undefined;
	let retired = false;
	for (let i = 0; i < tests.length; i++) {
		const test = tests[i];
		const resultItem = states[i];
		const state = resultItem?.computedState ?? TestResultState.Unset;
		hoverMessageParts.push(labelForTestInState(test.item.label, state));
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

	const hoverMessage = new MarkdownString('', true).appendText(hoverMessageParts.join(', ') + '.');
	if (testIdWithMessages) {
		const args = encodeURIComponent(JSON.stringify([testIdWithMessages]));
		hoverMessage.appendMarkdown(`[${localize('peekTestOutout', 'Peek Test Output')}](command:vscode.peekTestError?${args})`);
	}

	let glyphMarginClassName = ThemeIcon.asClassName(icon) + ' testing-run-glyph';
	if (retired) {
		glyphMarginClassName += ' retired';
	}

	return {
		range: firstLineRange(range),
		options: {
			description: 'run-test-decoration',
			isWholeLine: true,
			hoverMessage,
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
		setImmediate(() => {
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

abstract class RunTestDecoration extends Disposable {
	/** @inheritdoc */
	public id = '';

	public get line() {
		return this.editorDecoration.range.startLineNumber;
	}

	constructor(
		public editorDecoration: IModelDeltaDecoration,
		protected readonly editor: ICodeEditor,
		@ITestService protected readonly testService: ITestService,
		@IContextMenuService protected readonly contextMenuService: IContextMenuService,
		@ICommandService protected readonly commandService: ICommandService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@ITestProfileService protected readonly testProfileService: ITestProfileService,
		@IContextKeyService protected readonly contextKeyService: IContextKeyService,
		@IMenuService protected readonly menuService: IMenuService,
	) {
		super();
		editorDecoration.options.glyphMarginHoverMessage = new MarkdownString().appendText(this.getGutterLabel());
	}

	/** @inheritdoc */
	public click(e: IEditorMouseEvent): boolean {
		if (e.target.position?.lineNumber !== this.line || e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN) {
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
	 * Adds the test to this decoration.
	 */
	public abstract merge(other: IncrementalTestCollectionItem, resultItem: TestResultItem | undefined): RunTestDecoration;

	/**
	 * Called when the decoration is clicked on.
	 */
	protected abstract getContextMenuActions(e: IEditorMouseEvent): IReference<IAction[]>;

	/**
	 * Default run action.
	 */
	protected abstract defaultRun(): void;

	/**
	 * Default debug action.
	 */
	protected abstract defaultDebug(): void;

	private showContextMenu(e: IEditorMouseEvent) {
		let actions = this.getContextMenuActions(e);

		const model = this.editor.getModel();
		if (model) {
			actions = {
				dispose: actions.dispose,
				object: Separator.join(
					actions.object,
					this.editor
						.getContribution<IBreakpointEditorContribution>(BREAKPOINT_EDITOR_CONTRIBUTION_ID)
						.getContextMenuActionsAtPosition(this.line, model)
				)
			};
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
		return { object: Separator.join(testActions, contributed.object), dispose: contributed.dispose };
	}

	private getContributedTestActions(test: InternalTestItem, capabilities: number): IReference<IAction[]> {
		const contextOverlay = this.contextKeyService.createOverlay(getTestItemContextOverlay(test, capabilities));
		const menu = this.menuService.createMenu(MenuId.TestItemGutter, contextOverlay);

		try {
			const target: IAction[] = [];
			const arg = getContextForTestItem(this.testService.collection, test.item.extId);
			const actionsDisposable = createAndFillInContextMenuActions(menu, { shouldForwardArgs: true, arg }, target);
			return { object: target, dispose: () => actionsDisposable.dispose };
		} finally {
			menu.dispose();
		}
	}
}

class MultiRunTestDecoration extends RunTestDecoration implements ITestDecoration {
	constructor(
		private readonly tests: {
			test: IncrementalTestCollectionItem,
			resultItem: TestResultItem | undefined,
		}[],
		editor: ICodeEditor,
		@ITestService testService: ITestService,
		@ICommandService commandService: ICommandService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITestProfileService testProfiles: ITestProfileService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService,
	) {
		super(createRunTestDecoration(tests.map(t => t.test), tests.map(t => t.resultItem)), editor, testService, contextMenuService, commandService, configurationService, testProfiles, contextKeyService, menuService);
	}

	public override merge(test: IncrementalTestCollectionItem, resultItem: TestResultItem | undefined): RunTestDecoration {
		this.tests.push({ test, resultItem });
		this.editorDecoration = createRunTestDecoration(this.tests.map(t => t.test), this.tests.map(t => t.resultItem));
		return this;
	}

	protected override getContextMenuActions() {
		const allActions: IAction[] = [];
		if (this.tests.some(({ test }) => this.testProfileService.capabilitiesForTest(test) & TestRunProfileBitset.Run)) {
			allActions.push(new Action('testing.gutter.runAll', localize('run all test', 'Run All Tests'), undefined, undefined, () => this.defaultRun()));
		}

		if (this.tests.some(({ test }) => this.testProfileService.capabilitiesForTest(test) & TestRunProfileBitset.Debug)) {
			allActions.push(new Action('testing.gutter.debugAll', localize('debug all test', 'Debug All Tests'), undefined, undefined, () => this.defaultDebug()));
		}

		const disposable = new DisposableStore();
		const testSubmenus = this.tests.map(({ test, resultItem }) => {
			const actions = this.getTestContextMenuActions(test, resultItem);
			disposable.add(actions);
			return new SubmenuAction(test.item.extId, test.item.label, actions.object);
		});

		return { object: Separator.join(allActions, testSubmenus), dispose: () => disposable.dispose() };
	}

	protected override defaultRun() {
		return this.testService.runTests({
			tests: this.tests.map(({ test }) => test),
			group: TestRunProfileBitset.Run,
		});
	}

	protected override defaultDebug() {
		return this.testService.runTests({
			tests: this.tests.map(({ test }) => test),
			group: TestRunProfileBitset.Run,
		});
	}
}

class RunSingleTestDecoration extends RunTestDecoration implements ITestDecoration {
	constructor(
		private readonly test: IncrementalTestCollectionItem,
		editor: ICodeEditor,
		private readonly resultItem: TestResultItem | undefined,
		@ITestService testService: ITestService,
		@ICommandService commandService: ICommandService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITestProfileService testProfiles: ITestProfileService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService,
	) {
		super(createRunTestDecoration([test], [resultItem]), editor, testService, contextMenuService, commandService, configurationService, testProfiles, contextKeyService, menuService);
	}

	public override merge(test: IncrementalTestCollectionItem, resultItem: TestResultItem | undefined): RunTestDecoration {
		return new MultiRunTestDecoration([
			{ test: this.test, resultItem: this.resultItem },
			{ test, resultItem },
		], this.editor, this.testService, this.commandService, this.contextMenuService, this.configurationService, this.testProfileService, this.contextKeyService, this.menuService);
	}

	protected override getContextMenuActions(e: IEditorMouseEvent) {
		return this.getTestContextMenuActions(this.test, this.resultItem);
	}

	protected override defaultRun() {
		return this.testService.runTests({
			tests: [this.test],
			group: TestRunProfileBitset.Run,
		});
	}

	protected override defaultDebug() {
		return this.testService.runTests({
			tests: [this.test],
			group: TestRunProfileBitset.Debug,
		});
	}
}

class TestMessageDecoration implements ITestDecoration {
	public static readonly inlineClassName = 'test-message-inline-content';

	public id = '';

	public readonly editorDecoration: IModelDeltaDecoration;
	private readonly decorationId = `testmessage-${generateUuid()}`;
	private readonly contentIdClass = `test-message-inline-content-id${this.decorationId}`;

	constructor(
		public readonly testMessage: ITestMessage,
		private readonly messageUri: URI | undefined,
		public readonly location: IRichLocation,
		private readonly editor: ICodeEditor,
		@ICodeEditorService private readonly editorService: ICodeEditorService,
	) {
		const severity = testMessage.type;
		const message = typeof testMessage.message === 'string' ? removeAnsiEscapeCodes(testMessage.message) : testMessage.message;
		editorService.registerDecorationType('test-message-decoration', this.decorationId, {}, undefined, editor);

		const options = editorService.resolveDecorationOptions(this.decorationId, true);
		options.hoverMessage = typeof message === 'string' ? new MarkdownString().appendText(message) : message;
		options.zIndex = 10; // todo: in spite of the z-index, this appears behind gitlens
		options.className = `testing-inline-message-severity-${severity}`;
		options.isWholeLine = true;
		options.stickiness = TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;
		options.collapseOnReplaceEdit = true;
		options.after = {
			content: renderStringAsPlaintext(message),
			inlineClassName: `test-message-inline-content test-message-inline-content-s${severity} ${this.contentIdClass}`
		};

		const rulerColor = severity === TestMessageType.Error
			? overviewRulerError
			: overviewRulerInfo;

		if (rulerColor) {
			options.overviewRuler = { color: themeColorFromId(rulerColor), position: OverviewRulerLane.Right };
		}

		const lineLength = editor.getModel()?.getLineLength(location.range.startLineNumber);
		const column = lineLength ? (lineLength + 1) : location.range.endColumn;
		this.editorDecoration = {
			options,
			range: {
				startLineNumber: location.range.startLineNumber,
				startColumn: column,
				endColumn: column,
				endLineNumber: location.range.startLineNumber,
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
			TestingOutputPeekController.get(this.editor).toggle(this.messageUri);
		}

		return false;
	}

	dispose(): void {
		this.editorService.removeDecorationType(this.decorationId);
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
