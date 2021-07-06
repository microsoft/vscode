/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderStringAsPlaintext } from 'vs/base/browser/markdownRenderer';
import { Action, IAction, Separator, SubmenuAction } from 'vs/base/common/actions';
import { Event } from 'vs/base/common/event';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IRange } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IModelDeltaDecoration, OverviewRulerLane, TrackedRangeStickiness } from 'vs/editor/common/model';
import { overviewRulerError, overviewRulerInfo, overviewRulerWarning } from 'vs/editor/common/view/editorColorRegistry';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService, themeColorFromId, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { TestMessageSeverity, TestResultState } from 'vs/workbench/api/common/extHostTypes';
import { BREAKPOINT_EDITOR_CONTRIBUTION_ID, IBreakpointEditorContribution } from 'vs/workbench/contrib/debug/common/debug';
import { testingRunAllIcon, testingRunIcon, testingStatesToIcons } from 'vs/workbench/contrib/testing/browser/icons';
import { TestingOutputPeekController } from 'vs/workbench/contrib/testing/browser/testingOutputPeek';
import { testMessageSeverityColors } from 'vs/workbench/contrib/testing/browser/theme';
import { DefaultGutterClickAction, getTestingConfiguration, TestingConfigKeys } from 'vs/workbench/contrib/testing/common/configuration';
import { labelForTestInState } from 'vs/workbench/contrib/testing/common/constants';
import { identifyTest, IncrementalTestCollectionItem, InternalTestItem, IRichLocation, ITestMessage, TestResultItem } from 'vs/workbench/contrib/testing/common/testCollection';
import { maxPriority } from 'vs/workbench/contrib/testing/common/testingStates';
import { buildTestUri, TestUriType } from 'vs/workbench/contrib/testing/common/testingUri';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { IMainThreadTestCollection, ITestService, testsInFile } from 'vs/workbench/contrib/testing/common/testService';

function isOriginalInDiffEditor(codeEditorService: ICodeEditorService, codeEditor: ICodeEditor): boolean {
	const diffEditors = codeEditorService.listDiffEditors();

	for (const diffEditor of diffEditors) {
		if (diffEditor.getOriginalEditor() === codeEditor) {
			return true;
		}
	}

	return false;
}

const FONT_FAMILY_VAR = `--testMessageDecorationFontFamily`;

export class TestingDecorations extends Disposable implements IEditorContribution {
	private currentUri?: URI;
	private lastDecorations: ITestDecoration[] = [];

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
			this.editor.getContainerDomNode().style.setProperty(FONT_FAMILY_VAR, editor.getOption(EditorOption.fontFamily));
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

		this._register(Event.any(this.results.onResultsChanged, this.testService.excludeTests.onDidChange)(() => {
			if (this.currentUri) {
				this.setDecorations(this.currentUri);
			}
		}));

		this._register(this.testService.onDidProcessDiff(() => {
			if (this.currentUri) {
				this.setDecorations(this.currentUri);
			}
		}));
	}

	private attachModel(uri?: URI) {
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

	private setDecorations(uri: URI): void {
		this.editor.changeDecorations(accessor => {
			const newDecorations: ITestDecoration[] = [];
			for (const test of this.testService.collection.all) {
				const stateLookup = this.results.getStateById(test.item.extId);
				if (test.item.range && test.item.uri?.toString() === uri.toString()) {
					const line = test.item.range.startLineNumber;
					const resultItem = stateLookup?.[1];
					const existing = newDecorations.findIndex(d => d instanceof RunTestDecoration && d.line === line);
					if (existing !== -1) {
						newDecorations[existing] = (newDecorations[existing] as RunTestDecoration).merge(test, resultItem);
					} else {
						newDecorations.push(this.instantiationService.createInstance(RunSingleTestDecoration, test, this.editor, stateLookup?.[1]));
					}
				}

				if (!stateLookup) {
					continue;
				}

				const [result, stateItem] = stateLookup;
				if (stateItem.retired) {
					continue; // do not show decorations for outdated tests
				}

				for (let taskId = 0; taskId < stateItem.tasks.length; taskId++) {
					const state = stateItem.tasks[taskId];
					for (let i = 0; i < state.messages.length; i++) {
						const m = state.messages[i];
						if (!this.invalidatedMessages.has(m) && hasValidLocation(uri, m)) {
							const uri = buildTestUri({
								type: TestUriType.ResultActualOutput,
								messageIndex: i,
								taskIndex: taskId,
								resultId: result.id,
								testExtId: stateItem.item.extId,
							});

							newDecorations.push(this.instantiationService.createInstance(TestMessageDecoration, m, uri, m.location, this.editor));
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
	protected abstract getContextMenuActions(e: IEditorMouseEvent): IAction[];

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
			actions = Separator.join(
				actions,
				this.editor
					.getContribution<IBreakpointEditorContribution>(BREAKPOINT_EDITOR_CONTRIBUTION_ID)
					.getContextMenuActionsAtPosition(this.line, model)
			);
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => ({ x: e.event.posx, y: e.event.posy }),
			getActions: () => actions,
			onHide: () => dispose(actions),
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
	protected getTestContextMenuActions(collection: IMainThreadTestCollection, test: InternalTestItem) {
		const testActions: IAction[] = [];
		if (test.item.runnable) {
			testActions.push(new Action('testing.gutter.run', localize('run test', 'Run Test'), undefined, undefined, () => this.testService.runTests({
				debug: false,
				tests: [identifyTest(test)],
			})));
		}

		if (test.item.debuggable) {
			testActions.push(new Action('testing.gutter.debug', localize('debug test', 'Debug Test'), undefined, undefined, () => this.testService.runTests({
				debug: true,
				tests: [identifyTest(test)],
			})));
		}

		testActions.push(new Action('testing.gutter.reveal', localize('reveal test', 'Reveal in Test Explorer'), undefined, undefined, async () => {
			const path = [test];
			while (true) {
				const parentId = path[0].parent;
				const parent = parentId && collection.getNodeById(parentId);
				if (!parent) {
					break;
				}

				path.unshift(parent);
			}

			await this.commandService.executeCommand('vscode.revealTestInExplorer', path.map(t => t.item.extId));
		}));

		return testActions;
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
	) {
		super(createRunTestDecoration(tests.map(t => t.test), tests.map(t => t.resultItem)), editor, testService, contextMenuService, commandService, configurationService);
	}

	public override merge(test: IncrementalTestCollectionItem, resultItem: TestResultItem | undefined): RunTestDecoration {
		this.tests.push({ test, resultItem });
		this.editorDecoration = createRunTestDecoration(this.tests.map(t => t.test), this.tests.map(t => t.resultItem));
		return this;
	}

	protected override getContextMenuActions() {
		const allActions: IAction[] = [];
		if (this.tests.some(({ test }) => test.item.runnable)) {
			allActions.push(new Action('testing.gutter.runAll', localize('run all test', 'Run All Tests'), undefined, undefined, () => this.defaultRun()));
		}

		if (this.tests.some(({ test }) => test.item.debuggable)) {
			allActions.push(new Action('testing.gutter.debugAll', localize('debug all test', 'Debug All Tests'), undefined, undefined, () => this.defaultDebug()));
		}

		const testSubmenus = this.tests.map(({ test }) =>
			new SubmenuAction(test.item.extId, test.item.label, this.getTestContextMenuActions(this.testService.collection, test)));

		return Separator.join(allActions, testSubmenus);
	}

	protected override defaultRun() {
		return this.testService.runTests({
			tests: this.tests
				.filter(({ test }) => test.item.runnable)
				.map(({ test }) => identifyTest(test)),
			debug: false,
		});
	}

	protected override defaultDebug() {
		return this.testService.runTests({
			tests: this.tests
				.filter(({ test }) => test.item.debuggable)
				.map(({ test }) => identifyTest(test)),
			debug: true,
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
	) {
		super(createRunTestDecoration([test], [resultItem]), editor, testService, contextMenuService, commandService, configurationService);
	}

	public override merge(test: IncrementalTestCollectionItem, resultItem: TestResultItem | undefined): RunTestDecoration {
		return new MultiRunTestDecoration([
			{ test: this.test, resultItem: this.resultItem },
			{ test, resultItem },
		], this.editor, this.testService, this.commandService, this.contextMenuService, this.configurationService);
	}

	protected override getContextMenuActions(e: IEditorMouseEvent) {
		return this.getTestContextMenuActions(this.testService.collection, this.test);
	}

	protected override defaultRun() {
		if (!this.test.item.runnable) {
			return;
		}

		return this.testService.runTests({
			tests: [identifyTest(this.test)],
			debug: false,
		});
	}

	protected override defaultDebug() {
		if (!this.test.item.debuggable) {
			return;
		}

		return this.testService.runTests({
			tests: [identifyTest(this.test)],
			debug: true,
		});
	}
}

class TestMessageDecoration implements ITestDecoration {
	public id = '';

	public readonly editorDecoration: IModelDeltaDecoration;
	private readonly decorationId = `testmessage-${generateUuid()}`;

	constructor(
		public readonly testMessage: ITestMessage,
		private readonly messageUri: URI,
		public readonly location: IRichLocation,
		private readonly editor: ICodeEditor,
		@ICodeEditorService private readonly editorService: ICodeEditorService,
		@IThemeService themeService: IThemeService,
	) {
		const { severity = TestMessageSeverity.Error, message } = testMessage;
		const colorTheme = themeService.getColorTheme();
		editorService.registerDecorationType('test-message-decoration', this.decorationId, {
			after: {
				contentText: renderStringAsPlaintext(message),
				color: `${colorTheme.getColor(testMessageSeverityColors[severity].decorationForeground)}`,
				fontSize: `${editor.getOption(EditorOption.fontSize)}px`,
				fontFamily: `var(${FONT_FAMILY_VAR})`,
				padding: `0px 12px 0px 24px`,
			},
		}, undefined, editor);

		const options = editorService.resolveDecorationOptions(this.decorationId, true);
		options.hoverMessage = typeof message === 'string' ? new MarkdownString().appendText(message) : message;
		options.afterContentClassName = `${options.afterContentClassName} testing-inline-message-content`;
		options.zIndex = 10; // todo: in spite of the z-index, this appears behind gitlens
		options.className = `testing-inline-message-margin testing-inline-message-severity-${severity}`;
		options.isWholeLine = true;
		options.stickiness = TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;
		options.collapseOnReplaceEdit = true;

		const rulerColor = severity === TestMessageSeverity.Error
			? overviewRulerError
			: severity === TestMessageSeverity.Warning
				? overviewRulerWarning
				: severity === TestMessageSeverity.Information
					? overviewRulerInfo
					: undefined;

		if (rulerColor) {
			options.overviewRuler = { color: themeColorFromId(rulerColor), position: OverviewRulerLane.Right };
		}

		this.editorDecoration = { range: firstLineRange(location.range), options };
	}

	click(e: IEditorMouseEvent): boolean {
		if (e.event.rightButton) {
			return false;
		}

		if (e.target.element?.className.includes(this.decorationId)) {
			TestingOutputPeekController.get(this.editor).toggle(this.messageUri);
		}

		return false;
	}

	dispose(): void {
		this.editorService.removeDecorationType(this.decorationId);
	}
}
