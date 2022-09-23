/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { renderStringAsPlaintext } from 'vs/base/browser/markdownRenderer';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { IIdentityProvider } from 'vs/base/browser/ui/list/list';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { Orientation, Sizing, SplitView } from 'vs/base/browser/ui/splitview/splitview';
import { ICompressedTreeElement, ICompressedTreeNode } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
import { ICompressibleTreeRenderer } from 'vs/base/browser/ui/tree/objectTree';
import { ITreeContextMenuEvent, ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { Action, IAction, Separator } from 'vs/base/common/actions';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Codicon } from 'vs/base/common/codicons';
import { Color } from 'vs/base/common/color';
import { Emitter, Event } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { stripIcons } from 'vs/base/common/iconLabels';
import { Iterable } from 'vs/base/common/iterator';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable, DisposableStore, IDisposable, IReference, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { clamp } from 'vs/base/common/numbers';
import { count } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor, IDiffEditorConstructionOptions, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction2 } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EmbeddedCodeEditorWidget, EmbeddedDiffEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { IDiffEditorOptions, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution, ScrollType } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { MarkdownRenderer } from 'vs/editor/contrib/markdownRenderer/browser/markdownRenderer';
import { getOuterEditor, IPeekViewService, peekViewResultsBackground, peekViewResultsMatchForeground, peekViewResultsSelectionBackground, peekViewResultsSelectionForeground, peekViewTitleForeground, peekViewTitleInfoForeground, PeekViewWidget } from 'vs/editor/contrib/peekView/browser/peekView';
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
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { textLinkActiveForeground, textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { IColorTheme, IThemeService, registerThemingParticipant, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { CATEGORIES } from 'vs/workbench/common/actions';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';
import { flatTestItemDelimiter } from 'vs/workbench/contrib/testing/browser/explorerProjections/display';
import { getTestItemContextOverlay } from 'vs/workbench/contrib/testing/browser/explorerProjections/testItemContextOverlay';
import * as icons from 'vs/workbench/contrib/testing/browser/icons';
import { ITestingOutputTerminalService } from 'vs/workbench/contrib/testing/browser/testingOutputTerminalService';
import { testingPeekBorder, testingPeekHeaderBackground } from 'vs/workbench/contrib/testing/browser/theme';
import { AutoOpenPeekViewWhen, getTestingConfiguration, TestingConfigKeys } from 'vs/workbench/contrib/testing/common/configuration';
import { Testing } from 'vs/workbench/contrib/testing/common/constants';
import { IObservableValue, MutableObservableValue } from 'vs/workbench/contrib/testing/common/observableValue';
import { StoredValue } from 'vs/workbench/contrib/testing/common/storedValue';
import { ITestExplorerFilterState } from 'vs/workbench/contrib/testing/common/testExplorerFilterState';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { ITestingPeekOpener } from 'vs/workbench/contrib/testing/common/testingPeekOpener';
import { isFailedState } from 'vs/workbench/contrib/testing/common/testingStates';
import { buildTestUri, ParsedTestUri, parseTestUri, TestUriType } from 'vs/workbench/contrib/testing/common/testingUri';
import { ITestProfileService } from 'vs/workbench/contrib/testing/common/testProfileService';
import { ITestResult, maxCountPriority, resultItemParents, TestResultItemChange, TestResultItemChangeReason } from 'vs/workbench/contrib/testing/common/testResult';
import { ITestResultService, ResultChangeEvent } from 'vs/workbench/contrib/testing/common/testResultService';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { IRichLocation, ITestErrorMessage, ITestItem, ITestMessage, ITestRunTask, ITestTaskState, TestMessageType, TestResultItem, TestResultState, TestRunProfileBitset } from 'vs/workbench/contrib/testing/common/testTypes';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

class TestDto {
	public readonly test: ITestItem;
	public readonly messages: ITestMessage[];
	public readonly expectedUri: URI;
	public readonly actualUri: URI;
	public readonly messageUri: URI;
	public readonly revealLocation: IRichLocation | undefined;

	public get isDiffable() {
		const message = this.messages[this.messageIndex];
		return message.type === TestMessageType.Error && isDiffable(message);
	}

	constructor(public readonly resultId: string, test: TestResultItem, public readonly taskIndex: number, public readonly messageIndex: number) {
		this.test = test.item;
		this.messages = test.tasks[taskIndex].messages;
		this.messageIndex = messageIndex;

		const parts = { messageIndex, resultId, taskIndex, testExtId: test.item.extId };
		this.expectedUri = buildTestUri({ ...parts, type: TestUriType.ResultExpectedOutput });
		this.actualUri = buildTestUri({ ...parts, type: TestUriType.ResultActualOutput });
		this.messageUri = buildTestUri({ ...parts, type: TestUriType.ResultMessage });

		const message = this.messages[this.messageIndex];
		this.revealLocation = message.location ?? (test.item.uri && test.item.range ? { uri: test.item.uri, range: Range.lift(test.item.range) } : undefined);
	}
}

/** Iterates through every message in every result */
function* allMessages(results: readonly ITestResult[]) {
	for (const result of results) {
		for (const test of result.tests) {
			for (let taskIndex = 0; taskIndex < test.tasks.length; taskIndex++) {
				for (let messageIndex = 0; messageIndex < test.tasks[taskIndex].messages.length; messageIndex++) {
					yield { result, test, taskIndex, messageIndex };
				}
			}
		}
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
	public tryPeekFirstError(result: ITestResult, test: TestResultItem, options?: Partial<ITextEditorOptions>) {
		const candidate = this.getFailedCandidateMessage(test);
		if (!candidate) {
			return false;
		}

		const message = candidate.message;
		this.showPeekFromUri({
			type: TestUriType.ResultMessage,
			documentUri: message.location!.uri,
			taskIndex: candidate.taskId,
			messageIndex: candidate.index,
			resultId: result.id,
			testExtId: test.item.extId,
		}, { selection: message.location!.range, ...options });
		return true;
	}

	/** @inheritdoc */
	public peekUri(uri: URI, options?: Partial<ITextEditorOptions>) {
		const parsed = parseTestUri(uri);
		const result = parsed && this.testResults.getResult(parsed.resultId);
		if (!parsed || !result) {
			return false;
		}

		const message = result.getStateById(parsed.testExtId)?.tasks[parsed.taskIndex].messages[parsed.messageIndex];
		if (!message?.location) {
			return false;
		}

		this.showPeekFromUri({
			type: TestUriType.ResultMessage,
			documentUri: message.location.uri,
			taskIndex: parsed.taskIndex,
			messageIndex: parsed.messageIndex,
			resultId: result.id,
			testExtId: parsed.testExtId,
		}, { selection: message.location.range, ...options });
		return true;
	}

	/** @inheritdoc */
	public closeAllPeeks() {
		for (const editor of this.codeEditorService.listCodeEditors()) {
			TestingOutputPeekController.get(editor)?.removePeek();
		}
	}

	/** @inheritdoc */
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
		TestingOutputPeekController.get(control)?.show(buildTestUri(this.lastUri));
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

		if (evt.result.request.isAutoRun && !getTestingConfiguration(this.configuration, TestingConfigKeys.AutoOpenPeekViewDuringAutoRun)) {
			return;
		}

		const editors = this.codeEditorService.listCodeEditors();
		const cfg = getTestingConfiguration(this.configuration, TestingConfigKeys.AutoOpenPeekView);

		// don't show the peek if the user asked to only auto-open peeks for visible tests,
		// and this test is not in any of the editors' models.
		switch (cfg) {
			case AutoOpenPeekViewWhen.FailureVisible: {
				const editorUris = new Set(editors.map(e => e.getModel()?.uri.toString()));
				if (!Iterable.some(resultItemParents(evt.result, evt.item), i => i.item.uri && editorUris.has(i.item.uri.toString()))) {
					return;
				}
				break; //continue
			}
			case AutoOpenPeekViewWhen.FailureAnywhere:
				break; //continue

			default:
				return; // never show
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
		let best: { taskId: number; index: number; message: ITestMessage } | undefined;
		mapFindTestMessage(test, (task, message, messageIndex, taskId) => {
			if (!isFailedState(task.state) || !message.location) {
				return;
			}

			if (best && message.type !== TestMessageType.Error) {
				return;
			}

			best = { taskId, index: messageIndex, message };
		});

		return best;
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
	public static get(editor: ICodeEditor): TestingOutputPeekController | null {
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

	/**
	 * Whether the history part of the peek view should be visible.
	 */
	public readonly historyVisible = MutableObservableValue.stored(new StoredValue<boolean>({
		key: 'testHistoryVisibleInPeek',
		scope: StorageScope.PROFILE,
		target: StorageTarget.USER,
	}, this.storageService), true);

	constructor(
		private readonly editor: ICodeEditor,
		@IEditorService private readonly editorService: IEditorService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITestResultService private readonly testResults: ITestResultService,
		@IStorageService private readonly storageService: IStorageService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService,
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

	public openCurrentInEditor() {
		const current = this.peek.value?.current;
		if (!current) {
			return;
		}

		const options = { pinned: false, revealIfOpened: true };
		const message = current.messages[current.messageIndex];

		if (current.isDiffable) {
			this.editorService.openEditor({
				original: { resource: current.expectedUri },
				modified: { resource: current.actualUri },
				options,
			});
		} else if (typeof message.message === 'string') {
			this.editorService.openEditor({ resource: current.messageUri, options });
		} else {
			this.commandService.executeCommand('markdown.showPreview', current.messageUri);
		}
	}

	/**
	 * Shows a peek for the message in the editor.
	 */
	public async show(uri: URI) {
		const dto = this.retrieveTest(uri);
		if (!dto) {
			return;
		}

		const message = dto.messages[dto.messageIndex];
		if (!this.peek.value) {
			this.peek.value = this.instantiationService.createInstance(TestingOutputPeek, this.editor, this.historyVisible);
			this.peek.value.onDidClose(() => {
				this.visible.set(false);
				this.currentPeekUri = undefined;
				this.peek.value = undefined;
			});

			this.visible.set(true);
			this.peek.value!.create();
		}

		alert(renderStringAsPlaintext(message.message));
		this.peek.value.setModel(dto);
		this.currentPeekUri = uri;
	}

	public async openAndShow(uri: URI) {
		const dto = this.retrieveTest(uri);
		if (!dto) {
			return;
		}

		if (!dto.revealLocation || dto.revealLocation.uri.toString() === this.editor.getModel()?.uri.toString()) {
			return this.show(uri);
		}

		const otherEditor = await this.codeEditorService.openCodeEditor({
			resource: dto.revealLocation.uri,
			options: { pinned: false, revealIfOpened: true }
		}, this.editor);

		if (otherEditor) {
			TestingOutputPeekController.get(otherEditor)?.removePeek();
			return TestingOutputPeekController.get(otherEditor)?.show(uri);
		}
	}

	/**
	 * Disposes the peek view, if any.
	 */
	public removePeek() {
		this.peek.clear();
	}

	/**
	 * Shows the next message in the peek, if possible.
	 */
	public next() {
		const dto = this.peek.value?.current;
		if (!dto) {
			return;
		}

		let found = false;
		for (const { messageIndex, taskIndex, result, test } of allMessages(this.testResults.results)) {
			if (found) {
				this.openAndShow(buildTestUri({
					type: TestUriType.ResultMessage,
					messageIndex,
					taskIndex,
					resultId: result.id,
					testExtId: test.item.extId
				}));
				return;
			} else if (dto.test.extId === test.item.extId && dto.messageIndex === messageIndex && dto.taskIndex === taskIndex && dto.resultId === result.id) {
				found = true;
			}
		}
	}

	/**
	 * Shows the previous message in the peek, if possible.
	 */
	public previous() {
		const dto = this.peek.value?.current;
		if (!dto) {
			return;
		}

		let previous: { messageIndex: number; taskIndex: number; result: ITestResult; test: TestResultItem } | undefined;
		for (const m of allMessages(this.testResults.results)) {
			if (dto.test.extId === m.test.item.extId && dto.messageIndex === m.messageIndex && dto.taskIndex === m.taskIndex && dto.resultId === m.result.id) {
				if (!previous) {
					return;
				}

				this.openAndShow(buildTestUri({
					type: TestUriType.ResultMessage,
					messageIndex: previous.messageIndex,
					taskIndex: previous.taskIndex,
					resultId: previous.result.id,
					testExtId: previous.test.item.extId
				}));
				return;
			}

			previous = m;
		}
	}

	/**
	 * Removes the peek view if it's being displayed on the given test ID.
	 */
	public removeIfPeekingForTest(testId: string) {
		if (this.peek.value?.current?.test.extId === testId) {
			this.peek.clear();
		}
	}

	/**
	 * If the test we're currently showing has its state change to something
	 * else, then clear the peek.
	 */
	private closePeekOnTestChange(evt: TestResultItemChange) {
		if (evt.reason !== TestResultItemChangeReason.OwnStateChange || evt.previousState === evt.item.ownComputedState) {
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
	private static lastHeightInLines?: number;
	private static lastSplitWidth?: number;

	private readonly visibilityChange = this._disposables.add(new Emitter<boolean>());
	private readonly didReveal = this._disposables.add(new Emitter<TestDto>());
	private dimension?: dom.Dimension;
	private splitView!: SplitView;
	private contentProviders!: IPeekOutputRenderer[];

	public current?: TestDto;

	constructor(
		editor: ICodeEditor,
		private readonly historyVisible: IObservableValue<boolean>,
		@IThemeService themeService: IThemeService,
		@IPeekViewService peekViewService: IPeekViewService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITextModelService protected readonly modelService: ITextModelService,
	) {
		super(editor, { showFrame: true, frameWidth: 1, showArrow: true, isResizeable: true, isAccessible: true, className: 'test-output-peek' }, instantiationService);

		TestingContextKeys.isInPeek.bindTo(contextKeyService);
		this._disposables.add(themeService.onDidColorThemeChange(this.applyTheme, this));
		this._disposables.add(this.onDidClose(() => this.visibilityChange.fire(false)));
		this.applyTheme(themeService.getColorTheme());
		peekViewService.addExclusiveWidget(editor, this);
	}

	private applyTheme(theme: IColorTheme) {
		const borderColor = theme.getColor(testingPeekBorder) || Color.transparent;
		const headerBg = theme.getColor(testingPeekHeaderBackground) || Color.transparent;
		this.style({
			arrowColor: borderColor,
			frameColor: borderColor,
			headerBackgroundColor: headerBg,
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
		const initialSpitWidth = TestingOutputPeek.lastSplitWidth;
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
			this.editor,
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
				TestingOutputPeek.lastSplitWidth = width;
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

		const historyViewIndex = 1;
		this.splitView.setViewVisible(historyViewIndex, this.historyVisible.value);
		this._disposables.add(this.historyVisible.onDidChange(visible => {
			this.splitView.setViewVisible(historyViewIndex, visible);
		}));

		if (initialSpitWidth) {
			queueMicrotask(() => this.splitView.resizeView(0, initialSpitWidth));
		}
	}

	/**
	 * Updates the test to be shown.
	 */
	public setModel(dto: TestDto): Promise<void> {
		const message = dto.messages[dto.messageIndex];
		const previous = this.current;

		if (!dto.revealLocation && !previous) {
			return Promise.resolve();
		}

		this.current = dto;
		if (!dto.revealLocation) {
			return this.showInPlace(dto);
		}

		this.show(dto.revealLocation.range, TestingOutputPeek.lastHeightInLines || hintMessagePeekHeight(message));
		this.editor.revealPositionNearTop(dto.revealLocation.range.getStartPosition(), ScrollType.Smooth);

		return this.showInPlace(dto);
	}

	/**
	 * Shows a message in-place without showing or changing the peek location.
	 * This is mostly used if peeking a message without a location.
	 */
	public async showInPlace(dto: TestDto) {
		const message = dto.messages[dto.messageIndex];
		this.setTitle(firstLine(renderStringAsPlaintext(message.message)), stripIcons(dto.test.label));
		this.didReveal.fire(dto);
		this.visibilityChange.fire(true);
		await Promise.all(this.contentProviders.map(p => p.update(dto, message)));
	}

	protected override _relayout(newHeightInLines: number): void {
		super._relayout(newHeightInLines);
		TestingOutputPeek.lastHeightInLines = newHeightInLines;
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
	links: true,
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
	wordWrap: 'on',
};

const diffEditorOptions: IDiffEditorConstructionOptions = {
	...commonEditorOptions,
	enableSplitViewResizing: true,
	isInEmbeddedEditor: true,
	renderOverviewRuler: false,
	ignoreTrimWhitespace: false,
	renderSideBySide: true,
	originalAriaLabel: localize('testingOutputExpected', 'Expected result'),
	modifiedAriaLabel: localize('testingOutputActual', 'Actual result'),
	diffAlgorithm: 'smart',
};

const isDiffable = (message: ITestMessage): message is ITestErrorMessage & { actualOutput: string; expectedOutput: string } =>
	message.type === TestMessageType.Error && message.actual !== undefined && message.expected !== undefined;

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

	public async update({ expectedUri, actualUri }: TestDto, message: ITestErrorMessage) {
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
			isMultiline(message.expected) || isMultiline(message.actual)
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
	private readonly scrollable: DomScrollableElement;
	private readonly element: HTMLElement;

	constructor(container: HTMLElement, markdown: MarkdownRenderer, message: IMarkdownString) {
		super();

		const rendered = this._register(markdown.render(message, {}));
		rendered.element.style.height = '100%';
		rendered.element.style.userSelect = 'text';
		container.appendChild(rendered.element);
		this.element = rendered.element;

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
		// Remove padding of `.monaco-editor .zone-widget.test-output-peek .preview-text`
		this.scrollable.setScrollDimensions({
			width: width - 32,
			height: height - 16,
			scrollWidth: this.element.scrollWidth,
			scrollHeight: this.element.scrollHeight
		});
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

	public update(_dto: TestDto, message: ITestErrorMessage): void {
		if (isDiffable(message) || typeof message.message === 'string') {
			return this.textPreview.clear();
		}

		this.textPreview.value = new ScrollableMarkdownMessage(
			this.container,
			this.markdown.getValue(),
			message.message as IMarkdownString,
		);
	}

	public layout(dimension: dom.IDimension): void {
		this.textPreview.value?.layout(dimension.height, dimension.width);
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

	public async update({ messageUri }: TestDto, message: ITestErrorMessage) {
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

const hintMessagePeekHeight = (msg: ITestMessage) =>
	isDiffable(msg)
		? Math.max(hintPeekStrHeight(msg.actual), hintPeekStrHeight(msg.expected))
		: hintPeekStrHeight(typeof msg.message === 'string' ? msg.message : msg.message.value);

const firstLine = (str: string) => {
	const index = str.indexOf('\n');
	return index === -1 ? str : str.slice(0, index);
};

const isMultiline = (str: string | undefined) => !!str && str.includes('\n');
const hintPeekStrHeight = (str: string | undefined) =>
	clamp(str ? Math.max(count(str, '\n'), Math.ceil(str.length / 80)) + 3 : 0, 14, 24);

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
		TestingOutputPeekController.get(parent ?? editor)?.removePeek();
	}
}

interface ITreeElement {
	type: string;
	context: unknown;
	id: string;
	label: string;
	labelWithIcons?: readonly (HTMLSpanElement | string)[];
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
	public readonly labelWithIcons = renderLabelWithIcons(this.label);
	public readonly description?: string;

	public get icon() {
		return icons.testingStatesToIcons.get(this.test.computedState);
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

	constructor(results: ITestResult, public readonly test: TestResultItem, index: number) {
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
	public readonly uri: URI;
	public readonly location?: IRichLocation;
	public readonly description?: string;

	constructor(
		public readonly result: ITestResult,
		public readonly test: TestResultItem,
		public readonly taskIndex: number,
		public readonly messageIndex: number,
	) {
		const { message, location } = test.tasks[taskIndex].messages[messageIndex];

		this.location = location;
		this.uri = this.context = buildTestUri({
			type: TestUriType.ResultMessage,
			messageIndex,
			resultId: result.id,
			taskIndex,
			testExtId: test.item.extId
		});

		this.id = this.uri.toString();

		const asPlaintext = renderStringAsPlaintext(message);
		const lines = count(asPlaintext.trimRight(), '\n');
		this.label = firstLine(asPlaintext);
		if (lines > 0) {
			this.description = lines > 1
				? localize('messageMoreLinesN', '+ {0} more lines', lines)
				: localize('messageMoreLines1', '+ 1 more line');
		}
	}
}

type TreeElement = TestResultElement | TestCaseElement | TestMessageElement | TestTaskElement;

class OutputPeekTree extends Disposable {
	private disposed = false;
	private readonly tree: WorkbenchCompressibleObjectTree<TreeElement, FuzzyScore>;
	private readonly treeActions: TreeActionsProvider;

	constructor(
		editor: ICodeEditor,
		container: HTMLElement,
		onDidChangeVisibility: Event<boolean>,
		onDidReveal: Event<TestDto>,
		peekController: TestingOutputPeek,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@ITestResultService results: ITestResultService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITestExplorerFilterState explorerFilter: ITestExplorerFilterState,
	) {
		super();

		this.treeActions = instantiationService.createInstance(TreeActionsProvider);
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
			[instantiationService.createInstance(TestRunElementRenderer, this.treeActions)],
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

		const getRootChildren = () => results.results.map(result => {
			const element = cachedCreate(result, () => new TestResultElement(result));
			return {
				element,
				incompressible: true,
				collapsed: this.tree.hasElement(element) ? this.tree.isCollapsed(element) : true,
				children: getResultChildren(result)
			};
		});

		// Queued result updates to prevent spamming CPU when lots of tests are
		// completing and messaging quickly (#142514)
		const resultsToUpdate = new Set<ITestResult>();
		const resultUpdateScheduler = this._register(new RunOnceScheduler(() => {
			for (const result of resultsToUpdate) {
				const resultNode = creationCache.get(result);
				if (resultNode && this.tree.hasElement(resultNode)) {
					this.tree.setChildren(resultNode, getResultChildren(result), { diffIdentityProvider });
				}
			}
			resultsToUpdate.clear();
		}, 300));

		this._register(results.onTestChanged(e => {
			const itemNode = creationCache.get(e.item);
			if (itemNode && this.tree.hasElement(itemNode)) { // update to existing test message/state
				this.tree.setChildren(itemNode, getTestChildren(e.result, e.item));
				return;
			}

			const resultNode = creationCache.get(e.result);
			if (resultNode && this.tree.hasElement(resultNode)) { // new test, update result children
				if (!resultUpdateScheduler.isScheduled) {
					resultsToUpdate.add(e.result);
					resultUpdateScheduler.schedule();
				}
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
			this.tree.domFocus();
		}));

		this._register(this.tree.onDidOpen(async e => {
			if (!(e.element instanceof TestMessageElement)) {
				return;
			}

			const dto = new TestDto(e.element.result.id, e.element.test, e.element.taskIndex, e.element.messageIndex);
			if (!dto.revealLocation) {
				peekController.showInPlace(dto);
			} else {
				TestingOutputPeekController.get(editor)?.openAndShow(dto.messageUri);
			}
		}));

		this._register(this.tree.onDidChangeSelection(evt => {
			for (const element of evt.elements) {
				if (element && 'test' in element) {
					explorerFilter.reveal.value = element.test.item.extId;
					break;
				}
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
			getActions: () => actions.secondary.length
				? [...actions.primary, new Separator(), ...actions.secondary]
				: actions.primary,
			getActionsContext: () => evt.element?.context
		});
	}

	public override dispose() {
		super.dispose();
		this.disposed = true;
	}
}

interface TemplateData {
	label: HTMLElement;
	icon: HTMLElement;
	actionBar: ActionBar;
	elementDisposable: DisposableStore;
	templateDisposable: DisposableStore;
}

class TestRunElementRenderer implements ICompressibleTreeRenderer<ITreeElement, FuzzyScore, TemplateData> {
	public static readonly ID = 'testRunElementRenderer';
	public readonly templateId = TestRunElementRenderer.ID;

	constructor(
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
		const label = dom.append(wrapper, dom.$('.name'));

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
		if (element.labelWithIcons) {
			dom.reset(templateData.label, ...element.labelWithIcons);
		} else if (element.description) {
			dom.reset(templateData.label, element.label, dom.$('span.test-label-description', {}, element.description));
		} else {
			dom.reset(templateData.label, element.label);
		}

		const icon = element.icon;
		templateData.icon.className = `computed-state ${icon ? ThemeIcon.asClassName(icon) : ''}`;

		const actions = this.treeActions.provideActionBar(element);
		templateData.actionBar.clear();
		templateData.actionBar.context = element;
		templateData.actionBar.push(actions.primary, { icon: true, label: false });
	}
}

class TreeActionsProvider {
	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ITestingOutputTerminalService private readonly testTerminalService: ITestingOutputTerminalService,
		@IMenuService private readonly menuService: IMenuService,
		@ICommandService private readonly commandService: ICommandService,
		@ITestProfileService private readonly testProfileService: ITestProfileService,
	) { }

	public provideActionBar(element: ITreeElement) {
		const test = element instanceof TestCaseElement ? element.test : undefined;
		const capabilities = test ? this.testProfileService.capabilitiesForTest(test) : 0;
		const contextOverlay = this.contextKeyService.createOverlay([
			['peek', Testing.OutputPeekContributionId],
			[TestingContextKeys.peekItemType.key, element.type],
			...getTestItemContextOverlay(test, capabilities),
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

				if (capabilities & TestRunProfileBitset.Debug) {
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
				const extId = element.test.item.extId;
				primary.push(new Action(
					'testing.outputPeek.goToFile',
					localize('testing.goToFile', "Go to File"),
					Codicon.goToFile.classNames,
					undefined,
					() => this.commandService.executeCommand('vscode.revealTest', extId),
				));

				secondary.push(new Action(
					'testing.outputPeek.revealInExplorer',
					localize('testing.revealInExplorer', "Reveal in Test Explorer"),
					Codicon.listTree.classNames,
					undefined,
					() => this.commandService.executeCommand('_revealTestInExplorer', extId),
				));

				if (capabilities & TestRunProfileBitset.Run) {
					primary.push(new Action(
						'testing.outputPeek.runTest',
						localize('run test', 'Run Test'),
						ThemeIcon.asClassName(icons.testingRunIcon),
						undefined,
						() => this.commandService.executeCommand('vscode.runTestsById', TestRunProfileBitset.Run, extId),
					));
				}

				if (capabilities & TestRunProfileBitset.Debug) {
					primary.push(new Action(
						'testing.outputPeek.debugTest',
						localize('debug test', 'Debug Test'),
						ThemeIcon.asClassName(icons.testingDebugIcon),
						undefined,
						() => this.commandService.executeCommand('vscode.runTestsById', TestRunProfileBitset.Debug, extId),
					));
				}
			}

			const result = { primary, secondary };
			createAndFillInActionBarActions(menu, {
				shouldForwardArgs: true,
			}, result, 'inline');

			return result;
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

const navWhen = ContextKeyExpr.and(
	EditorContextKeys.focus,
	TestingContextKeys.isPeekVisible,
);

/**
 * Gets the editor where the peek may be shown, bubbling upwards if the given
 * editor is embedded (i.e. inside a peek already).
 */
const getPeekedEditor = (accessor: ServicesAccessor, editor: ICodeEditor) => {
	if (TestingOutputPeekController.get(editor)?.isVisible) {
		return editor;
	}

	if (editor instanceof EmbeddedCodeEditorWidget) {
		return editor.getParentEditor();
	}

	const outer = getOuterEditorFromDiffEditor(accessor);
	if (outer) {
		return outer;
	}

	return editor;
};

export class GoToNextMessageAction extends EditorAction2 {
	public static readonly ID = 'testing.goToNextMessage';
	constructor() {
		super({
			id: GoToNextMessageAction.ID,
			f1: true,
			title: { value: localize('testing.goToNextMessage', "Go to Next Test Failure"), original: 'Go to Next Test Failure' },
			icon: Codicon.arrowDown,
			category: CATEGORIES.Test,
			keybinding: {
				primary: KeyMod.Alt | KeyCode.F8,
				weight: KeybindingWeight.EditorContrib + 1,
				when: navWhen,
			},
			menu: [{
				id: MenuId.TestPeekTitle,
				group: 'navigation',
				order: 2,
			}, {
				id: MenuId.CommandPalette,
				when: navWhen
			}],
		});
	}

	public runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor) {
		TestingOutputPeekController.get(getPeekedEditor(accessor, editor))?.next();
	}
}

export class GoToPreviousMessageAction extends EditorAction2 {
	public static readonly ID = 'testing.goToPreviousMessage';
	constructor() {
		super({
			id: GoToPreviousMessageAction.ID,
			f1: true,
			title: { value: localize('testing.goToPreviousMessage', "Go to Previous Test Failure"), original: 'Go to Previous Test Failure' },
			icon: Codicon.arrowUp,
			category: CATEGORIES.Test,
			keybinding: {
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.F8,
				weight: KeybindingWeight.EditorContrib + 1,
				when: navWhen
			},
			menu: [{
				id: MenuId.TestPeekTitle,
				group: 'navigation',
				order: 1,
			}, {
				id: MenuId.CommandPalette,
				when: navWhen
			}],
		});
	}

	public runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor) {
		TestingOutputPeekController.get(getPeekedEditor(accessor, editor))?.previous();
	}
}

export class OpenMessageInEditorAction extends EditorAction2 {
	public static readonly ID = 'testing.openMessageInEditor';
	constructor() {
		super({
			id: OpenMessageInEditorAction.ID,
			f1: false,
			title: { value: localize('testing.openMessageInEditor', "Open in Editor"), original: 'Open in Editor' },
			icon: Codicon.linkExternal,
			category: CATEGORIES.Test,
			menu: [{ id: MenuId.TestPeekTitle }],
		});
	}

	public runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor) {
		TestingOutputPeekController.get(getPeekedEditor(accessor, editor))?.openCurrentInEditor();
	}
}

export class ToggleTestingPeekHistory extends EditorAction2 {
	public static readonly ID = 'testing.toggleTestingPeekHistory';
	constructor() {
		super({
			id: ToggleTestingPeekHistory.ID,
			f1: true,
			title: { value: localize('testing.toggleTestingPeekHistory', "Toggle Test History in Peek"), original: 'Toggle Test History in Peek' },
			icon: Codicon.history,
			category: CATEGORIES.Test,
			menu: [{
				id: MenuId.TestPeekTitle,
				group: 'navigation',
				order: 3,
			}],
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Alt | KeyCode.KeyH,
				when: TestingContextKeys.isPeekVisible.isEqualTo(true),
			},
		});
	}

	public runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor) {
		const ctrl = TestingOutputPeekController.get(getPeekedEditor(accessor, editor));
		if (ctrl) {
			ctrl.historyVisible.value = !ctrl.historyVisible.value;
		}
	}
}
