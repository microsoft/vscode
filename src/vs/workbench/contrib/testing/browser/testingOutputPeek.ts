/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { renderStringAsPlaintext } from 'vs/base/browser/markdownRenderer';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { IIdentityProvider } from 'vs/base/browser/ui/list/list';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { Orientation, Sizing, SplitView } from 'vs/base/browser/ui/splitview/splitview';
import { ICompressedTreeElement, ICompressedTreeNode } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
import { ICompressibleTreeRenderer } from 'vs/base/browser/ui/tree/objectTree';
import { ITreeContextMenuEvent, ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { Action, IAction, Separator } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { Color } from 'vs/base/common/color';
import { Emitter, Event } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Iterable } from 'vs/base/common/iterator';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable, DisposableStore, IDisposable, IReference, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { clamp } from 'vs/base/common/numbers';
import { count } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { MarkdownRenderer } from 'vs/editor/browser/core/markdownRenderer';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction2 } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EmbeddedCodeEditorWidget, EmbeddedDiffEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { IDiffEditorOptions, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { getOuterEditor, IPeekViewService, peekViewResultsBackground, peekViewResultsMatchForeground, peekViewResultsSelectionBackground, peekViewResultsSelectionForeground, peekViewTitleBackground, peekViewTitleForeground, peekViewTitleInfoForeground, PeekViewWidget } from 'vs/editor/contrib/peekView/peekView';
import { localize } from 'vs/nls';
import { createAndFillInActionBarActions, MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { WorkbenchCompressibleObjectTree } from 'vs/platform/list/browser/listService';
import { textLinkActiveForeground, textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { IColorTheme, IThemeService, registerThemingParticipant, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { TestResultState } from 'vs/workbench/api/common/extHostTypes';
import { IResourceLabel, ResourceLabels } from 'vs/workbench/browser/labels';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';
import { flatTestItemDelimiter } from 'vs/workbench/contrib/testing/browser/explorerProjections/display';
import * as icons from 'vs/workbench/contrib/testing/browser/icons';
import { ITestingOutputTerminalService } from 'vs/workbench/contrib/testing/browser/testingOutputTerminalService';
import { testingPeekBorder } from 'vs/workbench/contrib/testing/browser/theme';
import { AutoOpenPeekViewWhen, getTestingConfiguration, TestingConfigKeys } from 'vs/workbench/contrib/testing/common/configuration';
import { Testing } from 'vs/workbench/contrib/testing/common/constants';
import { IRichLocation, ITestItem, ITestMessage, ITestRunTask, ITestTaskState, TestResultItem } from 'vs/workbench/contrib/testing/common/testCollection';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { ITestingPeekOpener } from 'vs/workbench/contrib/testing/common/testingPeekOpener';
import { isFailedState } from 'vs/workbench/contrib/testing/common/testingStates';
import { buildTestUri, ParsedTestUri, parseTestUri, TestUriType } from 'vs/workbench/contrib/testing/common/testingUri';
import { getPathForTestInResult, ITestResult, maxCountPriority, resultItemParents, TestResultItemChange, TestResultItemChangeReason } from 'vs/workbench/contrib/testing/common/testResult';
import { ITestResultService, ResultChangeEvent } from 'vs/workbench/contrib/testing/common/testResultService';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';

class TestDto {
	test: ITestItem;
	messageIndex: number;
	messages: ITestMessage[];
	expectedUri: URI;
	actualUri: URI;
	messageUri: URI;

	constructor(resultId: string, test: TestResultItem, taskIndex: number, messageIndex: number) {
		this.test = test.item;
		this.messages = test.tasks[taskIndex].messages;
		this.messageIndex = messageIndex;

		const parts = { messageIndex, resultId, taskIndex, testExtId: test.item.extId };
		this.expectedUri = buildTestUri({ ...parts, type: TestUriType.ResultExpectedOutput });
		this.actualUri = buildTestUri({ ...parts, type: TestUriType.ResultActualOutput });
		this.messageUri = buildTestUri({ ...parts, type: TestUriType.ResultMessage });
	}
}

type TestUriWithDocument = ParsedTestUri & { documentUri: URI };

export class TestingPeekOpener extends Disposable implements ITestingPeekOpener {
	declare _serviceBrand: undefined;

	private lastUri?: TestUriWithDocument;

	constructor(
		@IConfigurationService private readonly configuration: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@ITestResultService private readonly testResults: ITestResultService,
		@ITestService private readonly testService: ITestService,
	) {
		super();
		this._register(testResults.onTestChanged(this.openPeekOnFailure, this));
	}

	/** @inheritdoc */
	public async open() {
		let uri: TestUriWithDocument | undefined;
		const active = this.editorService.activeTextEditorControl;
		if (isCodeEditor(active) && active.getModel()?.uri) {
			const modelUri = active.getModel()?.uri;
			if (modelUri) {
				uri = await this.getFileCandidateMessage(modelUri, active.getPosition());
			}
		}

		if (!uri) {
			uri = this.lastUri;
		}

		if (!uri) {
			uri = this.getAnyCandidateMessage();
		}

		if (!uri) {
			return false;
		}

		return this.showPeekFromUri(uri);
	}

	/** @inheritdoc */
	public async tryPeekFirstError(result: ITestResult, test: TestResultItem, options?: Partial<ITextEditorOptions>) {
		const candidate = this.getFailedCandidateMessage(test);
		if (!candidate) {
			return false;
		}

		const message = candidate.message;
		return this.showPeekFromUri({
			type: TestUriType.ResultMessage,
			documentUri: message.location!.uri,
			taskIndex: candidate.taskId,
			messageIndex: candidate.index,
			resultId: result.id,
			testExtId: test.item.extId,
		}, { selection: message.location!.range, ...options });
	}

	/** @inheritdoc */
	public closeAllPeeks() {
		for (const editor of this.codeEditorService.listCodeEditors()) {
			TestingOutputPeekController.get(editor)?.removePeek();
		}
	}

	private async showPeekFromUri(uri: TestUriWithDocument, options?: ITextEditorOptions) {
		const pane = await this.editorService.openEditor({
			resource: uri.documentUri,
			options: { revealIfOpened: true, ...options }
		});

		const control = pane?.getControl();
		if (!isCodeEditor(control)) {
			return false;
		}

		this.lastUri = uri;
		TestingOutputPeekController.get(control).show(buildTestUri(this.lastUri));
		return true;
	}

	/**
	 * Opens the peek view on a test failure, based on user preferences.
	 */
	private openPeekOnFailure(evt: TestResultItemChange) {
		if (evt.reason !== TestResultItemChangeReason.OwnStateChange) {
			return;
		}

		const candidate = this.getFailedCandidateMessage(evt.item);
		if (!candidate) {
			return;
		}

		if (evt.result.isAutoRun && !getTestingConfiguration(this.configuration, TestingConfigKeys.AutoOpenPeekViewDuringAutoRun)) {
			return;
		}

		const editors = this.codeEditorService.listCodeEditors();
		const cfg = getTestingConfiguration(this.configuration, TestingConfigKeys.AutoOpenPeekView);

		// don't show the peek if the user asked to only auto-open peeks for visible tests,
		// and this test is not in any of the editors' models.
		if (cfg === AutoOpenPeekViewWhen.FailureVisible) {
			const editorUris = new Set(editors.map(e => e.getModel()?.uri.toString()));
			if (!Iterable.some(resultItemParents(evt.result, evt.item), i => i.item.uri && editorUris.has(i.item.uri.toString()))) {
				return;
			}
		}

		const controllers = editors.map(TestingOutputPeekController.get);
		if (controllers.some(c => c?.isVisible)) {
			return;
		}

		this.tryPeekFirstError(evt.result, evt.item);
	}

	/**
	 * Gets the message closest to the given position from a test in the file.
	 */
	private async getFileCandidateMessage(uri: URI, position: Position | null) {
		let best: TestUriWithDocument | undefined;
		let bestDistance = Infinity;

		// Get all tests for the document. In those, find one that has a test
		// message closest to the cursor position.
		const demandedUriStr = uri.toString();
		for (const test of this.testService.collection.all) {
			const result = this.testResults.getStateById(test.item.extId);
			if (!result) {
				continue;
			}

			mapFindTestMessage(result[1], (_task, message, messageIndex, taskIndex) => {
				if (!message.location || message.location.uri.toString() !== demandedUriStr) {
					return;
				}

				const distance = position ? Math.abs(position.lineNumber - message.location.range.startLineNumber) : 0;
				if (!best || distance <= bestDistance) {
					bestDistance = distance;
					best = {
						type: TestUriType.ResultMessage,
						testExtId: result[1].item.extId,
						resultId: result[0].id,
						taskIndex,
						messageIndex,
						documentUri: uri,
					};
				}
			});
		}

		return best;
	}

	/**
	 * Gets any possible still-relevant message from the results.
	 */
	private getAnyCandidateMessage() {
		const seen = new Set<string>();
		for (const result of this.testResults.results) {
			for (const test of result.tests) {
				if (seen.has(test.item.extId)) {
					continue;
				}

				seen.add(test.item.extId);
				const found = mapFindTestMessage(test, (task, message, messageIndex, taskIndex) => (
					message.location && {
						type: TestUriType.ResultMessage,
						testExtId: test.item.extId,
						resultId: result.id,
						taskIndex,
						messageIndex,
						documentUri: message.location.uri,
					}
				));

				if (found) {
					return found;
				}
			}
		}

		return undefined;
	}

	/**
	 * Gets the first failed message that can be displayed from the result.
	 */
	private getFailedCandidateMessage(test: TestResultItem) {
		return mapFindTestMessage(test, (task, message, messageIndex, taskId) =>
			isFailedState(task.state) && message.location
				? { taskId, index: messageIndex, message }
				: undefined
		);
	}
}

const mapFindTestMessage = <T>(test: TestResultItem, fn: (task: ITestTaskState, message: ITestMessage, messageIndex: number, taskIndex: number) => T | undefined) => {
	for (let taskIndex = 0; taskIndex < test.tasks.length; taskIndex++) {
		const task = test.tasks[taskIndex];
		for (let messageIndex = 0; messageIndex < task.messages.length; messageIndex++) {
			const r = fn(task, task.messages[messageIndex], messageIndex, taskIndex);
			if (r !== undefined) {
				return r;
			}
		}
	}

	return undefined;
};

/**
 * Adds output/message peek functionality to code editors.
 */
export class TestingOutputPeekController extends Disposable implements IEditorContribution {
	/**
	 * Gets the controller associated with the given code editor.
	 */
	public static get(editor: ICodeEditor): TestingOutputPeekController {
		return editor.getContribution<TestingOutputPeekController>(Testing.OutputPeekContributionId);
	}

	/**
	 * Currently-shown peek view.
	 */
	private readonly peek = this._register(new MutableDisposable<TestingOutputPeek>());

	/**
	 * URI of the currently-visible peek, if any.
	 */
	private currentPeekUri: URI | undefined;

	/**
	 * Context key updated when the peek is visible/hidden.
	 */
	private readonly visible: IContextKey<boolean>;

	/**
	 * Gets whether a peek is currently shown in the associated editor.
	 */
	public get isVisible() {
		return this.peek.value;
	}

	constructor(
		private readonly editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITestResultService private readonly testResults: ITestResultService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this.visible = TestingContextKeys.isPeekVisible.bindTo(contextKeyService);
		this._register(editor.onDidChangeModel(() => this.peek.clear()));
		this._register(testResults.onResultsChanged(this.closePeekOnCertainResultEvents, this));
		this._register(testResults.onTestChanged(this.closePeekOnTestChange, this));
	}

	/**
	 * Toggles peek visibility for the URI.
	 */
	public toggle(uri: URI) {
		if (this.currentPeekUri?.toString() === uri.toString()) {
			this.peek.clear();
		} else {
			this.show(uri);
		}
	}

	/**
	 * Shows a peek for the message in th editor.
	 */
	public async show(uri: URI) {
		const dto = this.retrieveTest(uri);
		if (!dto) {
			return;
		}

		const message = dto.messages[dto.messageIndex];
		if (!message?.location) {
			return;
		}


		if (!this.peek.value) {
			this.peek.value = this.instantiationService.createInstance(TestingOutputPeek, this.editor);
			this.peek.value.onDidClose(() => {
				this.visible.set(false);
				this.currentPeekUri = undefined;
				this.peek.value = undefined;
			});

			this.visible.set(true);
			this.peek.value!.create();
		}

		alert(renderStringAsPlaintext(message.message));
		this.peek.value!.setModel(dto);
		this.currentPeekUri = uri;
	}

	/**
	 * Disposes the peek view, if any.
	 */
	public removePeek() {
		this.peek.clear();
	}

	/**
	 * Removes the peek view if it's being displayed on the given test ID.
	 */
	public removeIfPeekingForTest(testId: string) {
		if (this.peek.value?.currentTest?.extId === testId) {
			this.peek.clear();
		}
	}

	/**
	 * If the test we're currently showing has its state change to something
	 * else, then clear the peek.
	 */
	private closePeekOnTestChange(evt: TestResultItemChange) {
		if (evt.reason !== TestResultItemChangeReason.OwnStateChange || evt.previous === evt.item.ownComputedState) {
			return;
		}

		this.removeIfPeekingForTest(evt.item.item.extId);
	}

	private closePeekOnCertainResultEvents(evt: ResultChangeEvent) {
		if ('started' in evt) {
			this.peek.clear(); // close peek when runs start
		}

		if ('removed' in evt && this.testResults.results.length === 0) {
			this.peek.clear(); // close the peek if results are cleared
		}
	}

	private retrieveTest(uri: URI): TestDto | undefined {
		const parts = parseTestUri(uri);
		if (!parts) {
			return undefined;
		}

		const { resultId, testExtId, taskIndex, messageIndex } = parts;
		const test = this.testResults.getResult(parts.resultId)?.getStateById(testExtId);
		if (!test || !test.tasks[parts.taskIndex]) {
			return;
		}

		return new TestDto(resultId, test, taskIndex, messageIndex);
	}
}

class TestingOutputPeek extends PeekViewWidget {
	private readonly visibilityChange = this._disposables.add(new Emitter<boolean>());
	private readonly didReveal = this._disposables.add(new Emitter<TestDto>());
	private dimension?: dom.Dimension;
	private splitView!: SplitView;
	private contentProviders!: IPeekOutputRenderer[];

	public currentTest?: ITestItem;

	constructor(
		editor: ICodeEditor,
		@IThemeService themeService: IThemeService,
		@IPeekViewService peekViewService: IPeekViewService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITextModelService protected readonly modelService: ITextModelService,
	) {
		super(editor, { showFrame: false, showArrow: true, isResizeable: true, isAccessible: true, className: 'test-output-peek' }, instantiationService);

		TestingContextKeys.isInPeek.bindTo(contextKeyService);
		this._disposables.add(themeService.onDidColorThemeChange(this.applyTheme, this));
		this._disposables.add(this.onDidClose(() => this.visibilityChange.fire(false)));
		this.applyTheme(themeService.getColorTheme());
		peekViewService.addExclusiveWidget(editor, this);
	}

	private applyTheme(theme: IColorTheme) {
		const borderColor = theme.getColor(testingPeekBorder) || Color.transparent;
		this.style({
			arrowColor: borderColor,
			frameColor: borderColor,
			headerBackgroundColor: theme.getColor(peekViewTitleBackground) || Color.transparent,
			primaryHeadingColor: theme.getColor(peekViewTitleForeground),
			secondaryHeadingColor: theme.getColor(peekViewTitleInfoForeground)
		});
	}

	protected override _fillHead(container: HTMLElement): void {
		super._fillHead(container);

		const actions: IAction[] = [];
		const menu = this.menuService.createMenu(MenuId.TestPeekTitle, this.contextKeyService);
		createAndFillInActionBarActions(menu, undefined, actions);
		this._actionbarWidget!.push(actions, { label: false, icon: true, index: 0 });
		menu.dispose();
	}

	protected override _fillBody(containerElement: HTMLElement): void {
		this.splitView = new SplitView(containerElement, { orientation: Orientation.HORIZONTAL });

		const messageContainer = dom.append(containerElement, dom.$('.test-output-peek-message-container'));
		this.contentProviders = [
			this._disposables.add(this.instantiationService.createInstance(DiffContentProvider, this.editor, messageContainer)),
			this._disposables.add(this.instantiationService.createInstance(MarkdownTestMessagePeek, messageContainer)),
			this._disposables.add(this.instantiationService.createInstance(PlainTextMessagePeek, this.editor, messageContainer)),
		];

		const treeContainer = dom.append(containerElement, dom.$('.test-output-peek-tree'));
		const tree = this._disposables.add(this.instantiationService.createInstance(
			OutputPeekTree,
			treeContainer,
			this.visibilityChange.event,
			this.didReveal.event,
		));

		this.splitView.addView({
			onDidChange: Event.None,
			element: messageContainer,
			minimumSize: 200,
			maximumSize: Number.MAX_VALUE,
			layout: width => {
				if (this.dimension) {
					for (const provider of this.contentProviders) {
						provider.layout({ height: this.dimension.height, width });
					}
				}
			},
		}, Sizing.Distribute);

		this.splitView.addView({
			onDidChange: Event.None,
			element: treeContainer,
			minimumSize: 100,
			maximumSize: Number.MAX_VALUE,
			layout: width => {
				if (this.dimension) {
					tree.layout(this.dimension.height, width);
				}
			},
		}, Sizing.Distribute);
	}

	/**
	 * Updates the test to be shown.
	 */
	public setModel(dto: TestDto): Promise<void> {
		const message = dto.messages[dto.messageIndex];
		if (!message?.location) {
			return Promise.resolve();
		}

		this.currentTest = dto.test;
		this.show(message.location.range, hintDiffPeekHeight(message));
		return this.showInPlace(dto);
	}

	/**
	 * Shows a message in-place without showing or changing the peek location.
	 * This is mostly used if peeking a message without a location.
	 */
	public async showInPlace(dto: TestDto) {
		const message = dto.messages[dto.messageIndex];
		this.setTitle(firstLine(renderStringAsPlaintext(message.message)), dto.test.label);
		this.didReveal.fire(dto);
		this.visibilityChange.fire(true);
		await Promise.all(this.contentProviders.map(p => p.update(dto, message)));
	}

	/** @override */
	protected override _doLayoutBody(height: number, width: number) {
		super._doLayoutBody(height, width);
		this.dimension = new dom.Dimension(width, height);
		this.splitView.layout(width);
	}

	/** @override */
	protected override _onWidth(width: number) {
		super._onWidth(width);
		if (this.dimension) {
			this.dimension = new dom.Dimension(width, this.dimension.height);
		}

		this.splitView.layout(width);
	}
}

interface IPeekOutputRenderer extends IDisposable {
	/** Updates the displayed test. Should clear if it cannot display the test. */
	update(dto: TestDto, message: ITestMessage): void;
	/** Recalculate content layout. */
	layout(dimension: dom.IDimension): void;
	/** Dispose the content provider. */
	dispose(): void;
}

const commonEditorOptions: IEditorOptions = {
	scrollBeyondLastLine: false,
	scrollbar: {
		verticalScrollbarSize: 14,
		horizontal: 'auto',
		useShadows: true,
		verticalHasArrows: false,
		horizontalHasArrows: false,
		alwaysConsumeMouseWheel: false
	},
	fixedOverflowWidgets: true,
	readOnly: true,
	minimap: {
		enabled: false
	},
};

const diffEditorOptions: IDiffEditorOptions = {
	...commonEditorOptions,
	enableSplitViewResizing: true,
	isInEmbeddedEditor: true,
	renderOverviewRuler: false,
	ignoreTrimWhitespace: false,
	renderSideBySide: true,
	originalAriaLabel: localize('testingOutputExpected', 'Expected result'),
	modifiedAriaLabel: localize('testingOutputActual', 'Actual result'),
};

const isDiffable = (message: ITestMessage): message is ITestMessage & { actualOutput: string; expectedOutput: string } =>
	message.actualOutput !== undefined && message.expectedOutput !== undefined;

class DiffContentProvider extends Disposable implements IPeekOutputRenderer {
	private readonly widget = this._register(new MutableDisposable<EmbeddedDiffEditorWidget>());
	private readonly model = this._register(new MutableDisposable());
	private dimension?: dom.IDimension;

	constructor(
		private readonly editor: ICodeEditor,
		private readonly container: HTMLElement,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextModelService private readonly modelService: ITextModelService,
	) {
		super();
	}

	public async update({ expectedUri, actualUri }: TestDto, message: ITestMessage) {
		if (!isDiffable(message)) {
			return this.clear();
		}

		const [original, modified] = await Promise.all([
			this.modelService.createModelReference(expectedUri),
			this.modelService.createModelReference(actualUri),
		]);

		const model = this.model.value = new SimpleDiffEditorModel(original, modified);
		if (!this.widget.value) {
			this.widget.value = this.instantiationService.createInstance(
				EmbeddedDiffEditorWidget,
				this.container,
				diffEditorOptions,
				this.editor,
			);

			if (this.dimension) {
				this.widget.value.layout(this.dimension);
			}
		}

		this.widget.value.setModel(model);
		this.widget.value.updateOptions(this.getOptions(
			isMultiline(message.expectedOutput) || isMultiline(message.actualOutput)
		));
	}

	private clear() {
		this.model.clear();
		this.widget.clear();
	}

	public layout(dimensions: dom.IDimension) {
		this.dimension = dimensions;
		this.widget.value?.layout(dimensions);
	}

	protected getOptions(isMultiline: boolean): IDiffEditorOptions {
		return isMultiline
			? { ...diffEditorOptions, lineNumbers: 'on' }
			: { ...diffEditorOptions, lineNumbers: 'off' };
	}
}

class ScrollableMarkdownMessage extends Disposable {
	private scrollable: DomScrollableElement;

	constructor(container: HTMLElement, markdown: MarkdownRenderer, message: IMarkdownString) {
		super();

		const rendered = this._register(markdown.render(message, {}));
		rendered.element.style.height = '100%';
		container.appendChild(rendered.element);

		this.scrollable = this._register(new DomScrollableElement(rendered.element, {
			className: 'preview-text',
		}));
		container.appendChild(this.scrollable.getDomNode());

		this._register(toDisposable(() => {
			container.removeChild(this.scrollable.getDomNode());
		}));

		this.scrollable.scanDomNode();
	}

	public layout(height: number, width: number) {
		this.scrollable.setScrollDimensions({ width, height });
	}
}

class MarkdownTestMessagePeek extends Disposable implements IPeekOutputRenderer {
	private readonly markdown = new Lazy(
		() => this._register(this.instantiationService.createInstance(MarkdownRenderer, {})),
	);

	private readonly textPreview = this._register(new MutableDisposable<ScrollableMarkdownMessage>());

	constructor(private readonly container: HTMLElement, @IInstantiationService private readonly instantiationService: IInstantiationService) {
		super();
	}

	public update(_dto: TestDto, message: ITestMessage): void {
		if (isDiffable(message) || typeof message.message === 'string') {
			return this.textPreview.clear();
		}

		this.textPreview.value = new ScrollableMarkdownMessage(
			this.container,
			this.markdown.getValue(),
			message.message as IMarkdownString,
		);
	}

	public layout(): void {
		// no-op
	}
}

class PlainTextMessagePeek extends Disposable implements IPeekOutputRenderer {
	private readonly widget = this._register(new MutableDisposable<EmbeddedCodeEditorWidget>());
	private readonly model = this._register(new MutableDisposable());
	private dimension?: dom.IDimension;

	constructor(
		private readonly editor: ICodeEditor,
		private readonly container: HTMLElement,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextModelService private readonly modelService: ITextModelService,
	) {
		super();
	}

	public async update({ messageUri }: TestDto, message: ITestMessage) {
		if (isDiffable(message) || typeof message.message !== 'string') {
			return this.clear();
		}

		const modelRef = this.model.value = await this.modelService.createModelReference(messageUri);
		if (!this.widget.value) {
			this.widget.value = this.instantiationService.createInstance(
				EmbeddedCodeEditorWidget,
				this.container,
				commonEditorOptions,
				this.editor,
			);

			if (this.dimension) {
				this.widget.value.layout(this.dimension);
			}
		}

		this.widget.value.setModel(modelRef.object.textEditorModel);
		this.widget.value.updateOptions(this.getOptions(isMultiline(message.message)));
	}

	private clear() {
		this.model.clear();
		this.widget.clear();
	}

	public layout(dimensions: dom.IDimension) {
		this.dimension = dimensions;
		this.widget.value?.layout(dimensions);
	}

	protected getOptions(isMultiline: boolean): IDiffEditorOptions {
		return isMultiline
			? { ...diffEditorOptions, lineNumbers: 'on' }
			: { ...diffEditorOptions, lineNumbers: 'off' };
	}
}

const hintDiffPeekHeight = (message: ITestMessage) =>
	Math.max(hintPeekStrHeight(message.actualOutput), hintPeekStrHeight(message.expectedOutput));

const firstLine = (str: string) => {
	const index = str.indexOf('\n');
	return index === -1 ? str : str.slice(0, index);
};

const isMultiline = (str: string | undefined) => !!str && str.includes('\n');
const hintPeekStrHeight = (str: string | undefined) => clamp(count(str || '', '\n'), 8, 20);

class SimpleDiffEditorModel extends EditorModel {
	public readonly original = this._original.object.textEditorModel;
	public readonly modified = this._modified.object.textEditorModel;

	constructor(
		private readonly _original: IReference<IResolvedTextEditorModel>,
		private readonly _modified: IReference<IResolvedTextEditorModel>,
	) {
		super();
	}

	public override dispose() {
		super.dispose();
		this._original.dispose();
		this._modified.dispose();
	}
}

function getOuterEditorFromDiffEditor(accessor: ServicesAccessor): ICodeEditor | null {
	const diffEditors = accessor.get(ICodeEditorService).listDiffEditors();

	for (const diffEditor of diffEditors) {
		if (diffEditor.hasTextFocus() && diffEditor instanceof EmbeddedDiffEditorWidget) {
			return diffEditor.getParentEditor();
		}
	}

	return getOuterEditor(accessor);
}

export class CloseTestPeek extends EditorAction2 {
	constructor() {
		super({
			id: 'editor.closeTestPeek',
			title: localize('close', 'Close'),
			icon: Codicon.close,
			precondition: ContextKeyExpr.and(
				ContextKeyExpr.or(TestingContextKeys.isInPeek, TestingContextKeys.isPeekVisible),
				ContextKeyExpr.not('config.editor.stablePeek')
			),
			keybinding: {
				weight: KeybindingWeight.EditorContrib - 101,
				primary: KeyCode.Escape
			}
		});
	}

	runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const parent = getOuterEditorFromDiffEditor(accessor);
		TestingOutputPeekController.get(parent ?? editor).removePeek();
	}
}

interface ITreeElement {
	type: string;
	context: unknown;
	id: string;
	label: string;
	icon?: ThemeIcon;
	description?: string;
	ariaLabel?: string;
}

export class TestResultElement implements ITreeElement {
	public readonly type = 'result';
	public readonly context = this.value.id;
	public readonly id = this.value.id;
	public readonly label = this.value.name;

	public get icon() {
		return icons.testingStatesToIcons.get(
			this.value.completedAt === undefined
				? TestResultState.Running
				: maxCountPriority(this.value.counts)
		);
	}

	constructor(public readonly value: ITestResult) { }
}

export class TestCaseElement implements ITreeElement {
	public readonly type = 'test';
	public readonly context = this.test.item.extId;
	public readonly id = `${this.results.id}/${this.test.item.extId}`;
	public readonly label = this.test.item.label;
	public readonly description?: string;

	public get icon() {
		return icons.testingStatesToIcons.get(this.test.computedState);
	}

	public get path() {
		return getPathForTestInResult(this.test, this.results);
	}

	constructor(
		private readonly results: ITestResult,
		public readonly test: TestResultItem,
	) {
		for (const parent of resultItemParents(results, test)) {
			if (parent !== test) {
				this.description = this.description
					? parent.item.label + flatTestItemDelimiter + this.description
					: parent.item.label;
			}
		}
	}
}

class TestTaskElement implements ITreeElement {
	public readonly type = 'task';
	public readonly task: ITestRunTask;
	public readonly context: string;
	public readonly id: string;
	public readonly label: string;
	public readonly icon = undefined;

	public get path() {
		return getPathForTestInResult(this.test, this.results);
	}

	constructor(private readonly results: ITestResult, public readonly test: TestResultItem, index: number) {
		this.id = `${results.id}/${test.item.extId}/${index}`;
		this.task = results.tasks[index];
		this.context = String(index);
		this.label = this.task.name ?? localize('testUnnamedTask', 'Unnamed Task');
	}
}

class TestMessageElement implements ITreeElement {
	public readonly type = 'message';
	public readonly context: URI;
	public readonly id: string;
	public readonly label: string;
	public readonly icon: ThemeIcon | undefined;
	public readonly uri: URI;
	public readonly location: IRichLocation | undefined;

	constructor(
		public readonly result: ITestResult,
		public readonly test: TestResultItem,
		public readonly taskIndex: number,
		public readonly messageIndex: number,
	) {
		const { message, severity, location } = test.tasks[taskIndex].messages[messageIndex];

		this.location = location;
		this.uri = this.context = buildTestUri({
			type: TestUriType.ResultMessage,
			messageIndex,
			resultId: result.id,
			taskIndex,
			testExtId: test.item.extId
		});

		this.id = this.uri.toString();
		this.label = firstLine(renderStringAsPlaintext(message));
		this.icon = icons.testMessageSeverityToIcons.get(severity);
	}
}

type TreeElement = TestResultElement | TestCaseElement | TestMessageElement | TestTaskElement;

class OutputPeekTree extends Disposable {
	private disposed = false;
	private readonly tree: WorkbenchCompressibleObjectTree<TreeElement, FuzzyScore>;
	private readonly treeActions: TreeActionsProvider;

	constructor(
		container: HTMLElement,
		onDidChangeVisibility: Event<boolean>,
		onDidReveal: Event<TestDto>,
		peekController: TestingOutputPeek,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@ITestResultService results: ITestResultService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorService editorService: IEditorService,
	) {
		super();

		this.treeActions = instantiationService.createInstance(TreeActionsProvider);
		const labels = instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility });
		const diffIdentityProvider: IIdentityProvider<TreeElement> = {
			getId(e: TreeElement) {
				return e.id;
			}
		};

		this.tree = this._register(instantiationService.createInstance(
			WorkbenchCompressibleObjectTree,
			'Test Output Peek',
			container,
			{
				getHeight: () => 22,
				getTemplateId: () => TestRunElementRenderer.ID,
			},
			[instantiationService.createInstance(TestRunElementRenderer, labels, this.treeActions)],
			{
				compressionEnabled: true,
				hideTwistiesOfChildlessElements: true,
				identityProvider: diffIdentityProvider,
				accessibilityProvider: {
					getAriaLabel(element: ITreeElement) {
						return element.ariaLabel || element.label;
					},
					getWidgetAriaLabel() {
						return localize('testingPeekLabel', 'Test Result Messages');
					}
				}
			},
		)) as WorkbenchCompressibleObjectTree<TreeElement, FuzzyScore>;

		const creationCache = new WeakMap<object, TreeElement>();
		const cachedCreate = <T extends TreeElement>(ref: object, factory: () => T): TreeElement => {
			const existing = creationCache.get(ref);
			if (existing) {
				return existing;
			}

			const fresh = factory();
			creationCache.set(ref, fresh);
			return fresh;
		};

		const getTaskChildren = (result: ITestResult, test: TestResultItem, taskId: number): Iterable<ICompressedTreeElement<TreeElement>> => {
			return Iterable.map(test.tasks[0].messages, (m, messageIndex) => ({
				element: cachedCreate(m, () => new TestMessageElement(result, test, taskId, messageIndex)),
				incompressible: true,
			}));
		};

		const getTestChildren = (result: ITestResult, test: TestResultItem): Iterable<ICompressedTreeElement<TreeElement>> => {
			const tasks = Iterable.filter(test.tasks, task => task.messages.length > 0);
			return Iterable.map(tasks, (t, taskId) => ({
				element: cachedCreate(t, () => new TestTaskElement(result, test, taskId)),
				incompressible: false,
				children: getTaskChildren(result, test, taskId),
			}));
		};

		const getResultChildren = (result: ITestResult): Iterable<ICompressedTreeElement<TreeElement>> => {
			const tests = Iterable.filter(result.tests, test => test.tasks.some(t => t.messages.length > 0));
			return Iterable.map(tests, test => ({
				element: cachedCreate(test, () => new TestCaseElement(result, test)),
				incompressible: true,
				children: getTestChildren(result, test),
			}));
		};

		const getRootChildren = () => results.results.map(result => ({
			element: cachedCreate(result, () => new TestResultElement(result)),
			incompressible: true,
			collapsed: true,
			children: getResultChildren(result)
		}));

		this._register(results.onTestChanged(e => {
			const itemNode = creationCache.get(e.item);
			if (itemNode && this.tree.hasElement(itemNode)) { // update to existing test message/state
				this.tree.setChildren(itemNode, getTestChildren(e.result, e.item));
				return;
			}

			const resultNode = creationCache.get(e.result);
			if (resultNode && this.tree.hasElement(resultNode)) { // new test
				this.tree.setChildren(null, getRootChildren(), { diffIdentityProvider });
				return;
			}

			// should be unreachable?
			this.tree.setChildren(null, getRootChildren(), { diffIdentityProvider });
		}));

		this._register(results.onResultsChanged(e => {
			// little hack here: a result change can cause the peek to be disposed,
			// but this listener will still be queued. Doing stuff with the tree
			// will cause errors.
			if (this.disposed) {
				return;
			}

			if ('completed' in e) {
				const resultNode = creationCache.get(e.completed);
				if (resultNode && this.tree.hasElement(resultNode)) {
					this.tree.setChildren(resultNode, getResultChildren(e.completed));
					return;
				}
			}

			this.tree.setChildren(null, getRootChildren(), { diffIdentityProvider });
		}));

		this._register(onDidReveal(dto => {
			const messageNode = creationCache.get(dto.messages[dto.messageIndex]);
			if (!messageNode || !this.tree.hasElement(messageNode)) {
				return;
			}

			const parents: TreeElement[] = [];
			for (let parent = this.tree.getParentElement(messageNode); parent; parent = this.tree.getParentElement(parent)) {
				parents.unshift(parent);
			}

			for (const parent of parents) {
				this.tree.expand(parent);
			}

			if (this.tree.getRelativeTop(messageNode) === null) {
				this.tree.reveal(messageNode, 0.5);
			}

			this.tree.setFocus([messageNode]);
			this.tree.setSelection([messageNode]);
		}));

		this._register(this.tree.onDidOpen(async e => {
			if (!(e.element instanceof TestMessageElement)) {
				return;
			}

			const location = e.element.location;
			if (!location) {
				peekController.showInPlace(new TestDto(e.element.result.id, e.element.test, e.element.taskIndex, e.element.messageIndex));
				return;
			}

			const pane = await editorService.openEditor({
				resource: location.uri,
				options: {
					pinned: e.editorOptions.pinned,
					selection: location.range,
					preserveFocus: e.editorOptions.preserveFocus,
				},
			}, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);

			const control = pane?.getControl();
			if (isCodeEditor(control)) {
				TestingOutputPeekController.get(control).show(e.element.uri);
			}
		}));


		this._register(this.tree.onContextMenu(e => this.onContextMenu(e)));

		this.tree.setChildren(null, getRootChildren());
	}

	public layout(height: number, width: number) {
		this.tree.layout(height, width);
	}

	private onContextMenu(evt: ITreeContextMenuEvent<ITreeElement | null>) {
		if (!evt.element) {
			return;
		}

		const actions = this.treeActions.provideActionBar(evt.element);
		this.contextMenuService.showContextMenu({
			getAnchor: () => evt.anchor,
			getActions: () => actions.value.secondary.length
				? [...actions.value.primary, new Separator(), ...actions.value.secondary]
				: actions.value.primary,
			getActionsContext: () => evt.element?.context,
			onHide: () => actions.dispose(),
		});
	}

	public override dispose() {
		super.dispose();
		this.disposed = true;
	}
}

interface TemplateData {
	label: IResourceLabel;
	icon: HTMLElement;
	actionBar: ActionBar;
	elementDisposable: DisposableStore;
	templateDisposable: DisposableStore;
}

class TestRunElementRenderer implements ICompressibleTreeRenderer<ITreeElement, FuzzyScore, TemplateData> {
	public static readonly ID = 'testRunElementRenderer';
	public readonly templateId = TestRunElementRenderer.ID;

	constructor(
		private readonly labels: ResourceLabels,
		private readonly treeActions: TreeActionsProvider,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	/** @inheritdoc */
	public renderCompressedElements(node: ITreeNode<ICompressedTreeNode<ITreeElement>, FuzzyScore>, _index: number, templateData: TemplateData): void {
		const chain = node.element.elements;
		const lastElement = chain[chain.length - 1];
		if (lastElement instanceof TestTaskElement && chain.length >= 2) {
			this.doRender(chain[chain.length - 2], templateData);
		} else {
			this.doRender(lastElement, templateData);
		}
	}

	/** @inheritdoc */
	public renderTemplate(container: HTMLElement): TemplateData {
		const templateDisposable = new DisposableStore();
		const wrapper = dom.append(container, dom.$('.test-peek-item'));
		const icon = dom.append(wrapper, dom.$('.state'));
		const name = dom.append(wrapper, dom.$('.name'));

		const label = this.labels.create(name, { supportHighlights: true });
		templateDisposable.add(label);

		const actionBar = new ActionBar(wrapper, {
			actionViewItemProvider: action =>
				action instanceof MenuItemAction
					? this.instantiationService.createInstance(MenuEntryActionViewItem, action, undefined)
					: undefined
		});

		templateDisposable.add(actionBar);

		return {
			icon,
			label,
			actionBar,
			elementDisposable: new DisposableStore(),
			templateDisposable,
		};
	}

	/** @inheritdoc */
	public renderElement(element: ITreeNode<ITreeElement, FuzzyScore>, _index: number, templateData: TemplateData): void {
		this.doRender(element.element, templateData);
	}

	/** @inheritdoc */
	public disposeTemplate(templateData: TemplateData): void {
		templateData.templateDisposable.dispose();
	}

	private doRender(element: ITreeElement, templateData: TemplateData) {
		templateData.elementDisposable.clear();
		templateData.label.setLabel(element.label, element.description);

		const icon = element.icon;
		templateData.icon.className = `computed-state ${icon ? ThemeIcon.asClassName(icon) : ''}`;

		const actions = this.treeActions.provideActionBar(element);
		templateData.elementDisposable.add(actions);
		templateData.actionBar.clear();
		templateData.actionBar.context = element;
		templateData.actionBar.push(actions.value.primary, { icon: true, label: false });
	}
}

class TreeActionsProvider {
	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ITestingOutputTerminalService private readonly testTerminalService: ITestingOutputTerminalService,
		@IMenuService private readonly menuService: IMenuService,
		@ICommandService private readonly commandService: ICommandService,
	) { }

	public provideActionBar(element: ITreeElement) {
		const test = element instanceof TestCaseElement ? element.test : undefined;
		const contextOverlay = this.contextKeyService.createOverlay([
			['peek', Testing.OutputPeekContributionId],
			[TestingContextKeys.peekItemType.key, element.type],
			[TestingContextKeys.testItemExtId.key, test?.item.extId],
			[TestingContextKeys.testItemHasUri.key, !!test?.item.uri],
			[TestingContextKeys.hasDebuggableTests.key, test?.item.debuggable],
			[TestingContextKeys.hasRunnableTests.key, test?.item.debuggable],
		]);
		const menu = this.menuService.createMenu(MenuId.TestPeekElement, contextOverlay);

		try {
			const primary: IAction[] = [];
			const secondary: IAction[] = [];

			if (element instanceof TestResultElement) {
				primary.push(new Action(
					'testing.outputPeek.showResultOutput',
					localize('testing.showResultOutput', "Show Result Output"),
					Codicon.terminal.classNames,
					undefined,
					() => this.testTerminalService.open(element.value)
				));

				primary.push(new Action(
					'testing.outputPeek.reRunLastRun',
					localize('testing.reRunLastRun', "Rerun Test Run"),
					ThemeIcon.asClassName(icons.testingRunIcon),
					undefined,
					() => this.commandService.executeCommand('testing.reRunLastRun', element.value.id),
				));

				if (Iterable.some(element.value.tests, t => t.item.debuggable)) {
					primary.push(new Action(
						'testing.outputPeek.debugLastRun',
						localize('testing.debugLastRun', "Debug Test Run"),
						ThemeIcon.asClassName(icons.testingDebugIcon),
						undefined,
						() => this.commandService.executeCommand('testing.debugLastRun', element.value.id),
					));
				}
			}

			if (element instanceof TestCaseElement || element instanceof TestTaskElement) {
				primary.push(new Action(
					'testing.outputPeek.revealInExplorer',
					localize('testing.revealInExplorer', "Reveal in Test Explorer"),
					Codicon.listTree.classNames,
					undefined,
					() => this.commandService.executeCommand('vscode.revealTestInExplorer', element.path),
				));

				if (element.test.item.runnable) {
					primary.push(new Action(
						'testing.outputPeek.runTest',
						localize('run test', 'Run Test'),
						ThemeIcon.asClassName(icons.testingRunIcon),
						undefined,
						() => this.commandService.executeCommand('vscode.runTestsByPath', false, element.path),
					));
				}

				if (element.test.item.debuggable) {
					primary.push(new Action(
						'testing.outputPeek.debugTest',
						localize('debug test', 'Debug Test'),
						ThemeIcon.asClassName(icons.testingDebugIcon),
						undefined,
						() => this.commandService.executeCommand('vscode.runTestsByPath', true, element.path),
					));
				}
			}

			const result = { primary, secondary };
			const actionsDisposable = createAndFillInActionBarActions(menu, {
				shouldForwardArgs: true,
			}, result, 'inline');

			return { value: result, dispose: () => actionsDisposable.dispose };
		} finally {
			menu.dispose();
		}
	}
}

registerThemingParticipant((theme, collector) => {
	const resultsBackground = theme.getColor(peekViewResultsBackground);
	if (resultsBackground) {
		collector.addRule(`.monaco-editor .test-output-peek .test-output-peek-tree { background-color: ${resultsBackground}; }`);
	}
	const resultsMatchForeground = theme.getColor(peekViewResultsMatchForeground);
	if (resultsMatchForeground) {
		collector.addRule(`.monaco-editor .test-output-peek .test-output-peek-tree { color: ${resultsMatchForeground}; }`);
	}
	const resultsSelectedBackground = theme.getColor(peekViewResultsSelectionBackground);
	if (resultsSelectedBackground) {
		collector.addRule(`.monaco-editor .test-output-peek .test-output-peek-tree .monaco-list:focus .monaco-list-rows > .monaco-list-row.selected:not(.highlighted) { background-color: ${resultsSelectedBackground}; }`);
	}
	const resultsSelectedForeground = theme.getColor(peekViewResultsSelectionForeground);
	if (resultsSelectedForeground) {
		collector.addRule(`.monaco-editor .test-output-peek .test-output-peek-tree .monaco-list:focus .monaco-list-rows > .monaco-list-row.selected:not(.highlighted) { color: ${resultsSelectedForeground} !important; }`);
	}

	const textLinkForegroundColor = theme.getColor(textLinkForeground);
	if (textLinkForegroundColor) {
		collector.addRule(`.monaco-editor .test-output-peek .test-output-peek-message-container a { color: ${textLinkForegroundColor}; }`);
	}

	const textLinkActiveForegroundColor = theme.getColor(textLinkActiveForeground);
	if (textLinkActiveForegroundColor) {
		collector.addRule(`.monaco-editor .test-output-peek .test-output-peek-message-container a :hover { color: ${textLinkActiveForegroundColor}; }`);
	}
});
