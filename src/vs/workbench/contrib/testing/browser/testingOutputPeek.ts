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
import { Delayer, Limiter, RunOnceScheduler } from 'vs/base/common/async';
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
import { count } from 'vs/base/common/strings';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./testingOutputPeek';
import { ICodeEditor, IDiffEditorConstructionOptions, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction2 } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { DiffEditorWidget2 } from 'vs/editor/browser/widget/diffEditorWidget2/diffEditorWidget2';
import { EmbeddedCodeEditorWidget, EmbeddedDiffEditorWidget2 } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { IDiffEditorOptions, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditor, IEditorContribution, ScrollType } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { MarkdownRenderer } from 'vs/editor/contrib/markdownRenderer/browser/markdownRenderer';
import { IPeekViewService, PeekViewWidget, peekViewResultsBackground, peekViewTitleForeground, peekViewTitleInfoForeground } from 'vs/editor/contrib/peekView/browser/peekView';
import { localize } from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { MenuEntryActionViewItem, createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { Action2, IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { WorkbenchCompressibleObjectTree } from 'vs/platform/list/browser/listService';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { TerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/terminalCapabilityStore';
import { IColorTheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IViewPaneOptions, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';
import { PANEL_BACKGROUND, SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { IViewDescriptorService, IViewsService, ViewContainerLocation } from 'vs/workbench/common/views';
import { IDetachedXtermTerminal, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { getXtermScaledDimensions } from 'vs/workbench/contrib/terminal/browser/xterm/xtermTerminal';
import { TERMINAL_BACKGROUND_COLOR } from 'vs/workbench/contrib/terminal/common/terminalColorRegistry';
import { flatTestItemDelimiter } from 'vs/workbench/contrib/testing/browser/explorerProjections/display';
import { getTestItemContextOverlay } from 'vs/workbench/contrib/testing/browser/explorerProjections/testItemContextOverlay';
import * as icons from 'vs/workbench/contrib/testing/browser/icons';
import { testingPeekBorder, testingPeekHeaderBackground } from 'vs/workbench/contrib/testing/browser/theme';
import { AutoOpenPeekViewWhen, TestingConfigKeys, getTestingConfiguration } from 'vs/workbench/contrib/testing/common/configuration';
import { Testing } from 'vs/workbench/contrib/testing/common/constants';
import { IObservableValue, MutableObservableValue, staticObservableValue } from 'vs/workbench/contrib/testing/common/observableValue';
import { StoredValue } from 'vs/workbench/contrib/testing/common/storedValue';
import { ITestExplorerFilterState } from 'vs/workbench/contrib/testing/common/testExplorerFilterState';
import { ITestProfileService } from 'vs/workbench/contrib/testing/common/testProfileService';
import { ITestResult, LiveTestResult, TestResultItemChange, TestResultItemChangeReason, maxCountPriority, resultItemParents } from 'vs/workbench/contrib/testing/common/testResult';
import { ITestResultService, ResultChangeEvent } from 'vs/workbench/contrib/testing/common/testResultService';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { IRichLocation, ITestErrorMessage, ITestItem, ITestMessage, ITestRunTask, ITestTaskState, TestMessageType, TestResultItem, TestResultState, TestRunProfileBitset } from 'vs/workbench/contrib/testing/common/testTypes';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { IShowResultOptions, ITestingPeekOpener } from 'vs/workbench/contrib/testing/common/testingPeekOpener';
import { cmpPriority, isFailedState } from 'vs/workbench/contrib/testing/common/testingStates';
import { ParsedTestUri, TestUriType, buildTestUri, parseTestUri } from 'vs/workbench/contrib/testing/common/testingUri';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

class MessageSubject {
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

class TaskSubject {
	public readonly outputUri: URI;
	public readonly revealLocation: undefined;

	constructor(public readonly resultId: string, public readonly taskIndex: number) {
		this.outputUri = buildTestUri({ resultId, taskIndex, type: TestUriType.TaskOutput });
	}
}

type InspectSubject = MessageSubject | TaskSubject;

const equalsSubject = (a: InspectSubject, b: InspectSubject) =>
	a.resultId === b.resultId && a.taskIndex === b.taskIndex && (
		(a instanceof MessageSubject && b instanceof MessageSubject && a.messageIndex === b.messageIndex) ||
		(a instanceof TaskSubject && b instanceof TaskSubject)
	);

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

	/** @inheritdoc */
	public readonly historyVisible = MutableObservableValue.stored(this._register(new StoredValue<boolean>({
		key: 'testHistoryVisibleInPeek',
		scope: StorageScope.PROFILE,
		target: StorageTarget.USER,
	}, this.storageService)), false);

	constructor(
		@IConfigurationService private readonly configuration: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@ITestResultService private readonly testResults: ITestResultService,
		@ITestService private readonly testService: ITestService,
		@IStorageService private readonly storageService: IStorageService,
		@IViewsService private readonly viewsService: IViewsService,
		@ICommandService private readonly commandService: ICommandService,
		@INotificationService private readonly notificationService: INotificationService,
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
		}, undefined, { selection: message.location!.range, ...options });
		return true;
	}

	/** @inheritdoc */
	public peekUri(uri: URI, options: IShowResultOptions = {}) {
		const parsed = parseTestUri(uri);
		const result = parsed && this.testResults.getResult(parsed.resultId);
		if (!parsed || !result || !('testExtId' in parsed)) {
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
		}, options.inEditor, { selection: message.location.range, ...options.options });
		return true;
	}

	/** @inheritdoc */
	public closeAllPeeks() {
		for (const editor of this.codeEditorService.listCodeEditors()) {
			TestingOutputPeekController.get(editor)?.removePeek();
		}
	}

	public openCurrentInEditor(): void {
		const current = this.getActiveControl();
		if (!current) {
			return;
		}

		const options = { pinned: false, revealIfOpened: true };
		if (current instanceof TaskSubject) {
			this.editorService.openEditor({ resource: current.outputUri, options });
			return;
		}

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
			this.commandService.executeCommand('markdown.showPreview', current.messageUri).catch(err => {
				this.notificationService.error(localize('testing.markdownPeekError', 'Could not open markdown preview: {0}.\n\nPlease make sure the markdown extension is enabled.', err.message));
			});
		}
	}

	private getActiveControl(): InspectSubject | undefined {
		const editor = getPeekedEditorFromFocus(this.codeEditorService);
		const controller = editor && TestingOutputPeekController.get(editor);
		return controller?.subject ?? this.viewsService.getActiveViewWithId<TestResultsView>(Testing.ResultsViewId)?.subject;
	}

	/** @inheritdoc */
	private async showPeekFromUri(uri: TestUriWithDocument, editor?: IEditor, options?: ITextEditorOptions) {
		if (isCodeEditor(editor)) {
			this.lastUri = uri;
			TestingOutputPeekController.get(editor)?.show(buildTestUri(this.lastUri));
			return true;
		}

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

		if (evt.result.request.continuous && !getTestingConfiguration(this.configuration, TestingConfigKeys.AutoOpenPeekViewDuringContinuousRun)) {
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
		if (controllers.some(c => c?.subject)) {
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
	private readonly peek = this._register(new MutableDisposable<TestResultsPeek>());

	/**
	 * URI of the currently-visible peek, if any.
	 */
	private currentPeekUri: URI | undefined;

	/**
	 * Context key updated when the peek is visible/hidden.
	 */
	private readonly visible: IContextKey<boolean>;

	/**
	 * Gets the currently display subject. Undefined if the peek is not open.
	 */
	public get subject() {
		return this.peek.value?.current;
	}

	constructor(
		private readonly editor: ICodeEditor,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
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
	 * Shows a peek for the message in the editor.
	 */
	public async show(uri: URI) {
		const subject = this.retrieveTest(uri);
		if (!subject) {
			return;
		}

		if (!this.peek.value) {
			this.peek.value = this.instantiationService.createInstance(TestResultsPeek, this.editor);
			this.peek.value.onDidClose(() => {
				this.visible.set(false);
				this.currentPeekUri = undefined;
				this.peek.value = undefined;
			});

			this.visible.set(true);
			this.peek.value!.create();
		}

		if (subject instanceof MessageSubject) {
			const message = subject.messages[subject.messageIndex];
			alert(renderStringAsPlaintext(message.message));
		}

		this.peek.value.setModel(subject);
		this.currentPeekUri = uri;
	}

	public async openAndShow(uri: URI) {
		const subject = this.retrieveTest(uri);
		if (!subject) {
			return;
		}

		if (!subject.revealLocation || subject.revealLocation.uri.toString() === this.editor.getModel()?.uri.toString()) {
			return this.show(uri);
		}

		const otherEditor = await this.codeEditorService.openCodeEditor({
			resource: subject.revealLocation.uri,
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
		const subject = this.peek.value?.current;
		if (!subject) {
			return;
		}

		let found = false;
		for (const { messageIndex, taskIndex, result, test } of allMessages(this.testResults.results)) {
			if (subject instanceof TaskSubject && result.id === subject.resultId) {
				found = true; // open the first message found in the current result
			}

			if (found) {
				this.openAndShow(buildTestUri({
					type: TestUriType.ResultMessage,
					messageIndex,
					taskIndex,
					resultId: result.id,
					testExtId: test.item.extId
				}));
				return;
			} if (subject instanceof MessageSubject && subject.test.extId === test.item.extId && subject.messageIndex === messageIndex && subject.taskIndex === taskIndex && subject.resultId === result.id) {
				found = true;
			}
		}
	}

	/**
	 * Shows the previous message in the peek, if possible.
	 */
	public previous() {
		const subject = this.peek.value?.current;
		if (!subject) {
			return;
		}

		let previous: { messageIndex: number; taskIndex: number; result: ITestResult; test: TestResultItem } | undefined;
		for (const m of allMessages(this.testResults.results)) {
			if (subject instanceof TaskSubject) {
				if (m.result.id === subject.resultId) {
					break;
				}
				continue;
			}

			if (subject.test.extId === m.test.item.extId && subject.messageIndex === m.messageIndex && subject.taskIndex === m.taskIndex && subject.resultId === m.result.id) {
				break;
			}

			previous = m;
		}

		if (previous) {
			this.openAndShow(buildTestUri({
				type: TestUriType.ResultMessage,
				messageIndex: previous.messageIndex,
				taskIndex: previous.taskIndex,
				resultId: previous.result.id,
				testExtId: previous.test.item.extId
			}));
		}
	}

	/**
	 * Removes the peek view if it's being displayed on the given test ID.
	 */
	public removeIfPeekingForTest(testId: string) {
		const c = this.peek.value?.current;
		if (c && c instanceof MessageSubject && c.test.extId === testId) {
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

	private retrieveTest(uri: URI): InspectSubject | undefined {
		const parts = parseTestUri(uri);
		if (!parts) {
			return undefined;
		}

		if (parts.type === TestUriType.TaskOutput) {
			return new TaskSubject(parts.resultId, parts.taskIndex);
		}

		const { resultId, testExtId, taskIndex, messageIndex } = parts;
		const test = this.testResults.getResult(parts.resultId)?.getStateById(testExtId);
		if (!test || !test.tasks[parts.taskIndex]) {
			return;
		}

		return new MessageSubject(resultId, test, taskIndex, messageIndex);
	}
}

class TestResultsViewContent extends Disposable {
	private static lastSplitWidth?: number;

	private readonly didReveal = this._register(new Emitter<{ subject: InspectSubject; preserveFocus: boolean }>());
	private dimension?: dom.Dimension;
	private splitView!: SplitView;
	private contentProviders!: IPeekOutputRenderer[];
	private contentProvidersUpdateLimiter = this._register(new Limiter(1));

	public current?: InspectSubject;

	/** Fired when a tree item is selected. Populated only on .fillBody() */
	public onDidRequestReveal!: Event<InspectSubject>;

	constructor(
		private readonly editor: ICodeEditor | undefined,
		private readonly options: {
			historyVisible: IObservableValue<boolean>;
			showRevealLocationOnMessages: boolean;
		},
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextModelService protected readonly modelService: ITextModelService,
	) {
		super();
	}

	public fillBody(containerElement: HTMLElement): void {
		const initialSpitWidth = TestResultsViewContent.lastSplitWidth;
		this.splitView = new SplitView(containerElement, { orientation: Orientation.HORIZONTAL });

		const { historyVisible, showRevealLocationOnMessages } = this.options;
		const isInPeekView = this.editor !== undefined;
		const messageContainer = dom.append(containerElement, dom.$('.test-output-peek-message-container'));
		this.contentProviders = [
			this._register(this.instantiationService.createInstance(DiffContentProvider, this.editor, messageContainer)),
			this._register(this.instantiationService.createInstance(MarkdownTestMessagePeek, messageContainer)),
			this._register(this.instantiationService.createInstance(TerminalMessagePeek, messageContainer, isInPeekView)),
			this._register(this.instantiationService.createInstance(PlainTextMessagePeek, this.editor, messageContainer)),
		];

		const treeContainer = dom.append(containerElement, dom.$('.test-output-peek-tree'));
		const tree = this._register(this.instantiationService.createInstance(
			OutputPeekTree,
			treeContainer,
			this.didReveal.event,
			{ showRevealLocationOnMessages }
		));

		this.onDidRequestReveal = tree.onDidRequestReview;

		this.splitView.addView({
			onDidChange: Event.None,
			element: messageContainer,
			minimumSize: 200,
			maximumSize: Number.MAX_VALUE,
			layout: width => {
				TestResultsViewContent.lastSplitWidth = width;
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
		this.splitView.setViewVisible(historyViewIndex, historyVisible.value);
		this._register(historyVisible.onDidChange(visible => {
			this.splitView.setViewVisible(historyViewIndex, visible);
		}));

		if (initialSpitWidth) {
			queueMicrotask(() => this.splitView.resizeView(0, initialSpitWidth));
		}
	}

	/**
	 * Shows a message in-place without showing or changing the peek location.
	 * This is mostly used if peeking a message without a location.
	 */
	public async reveal(opts: { subject: InspectSubject; preserveFocus: boolean }) {
		this.didReveal.fire(opts);

		if (!this.current || !equalsSubject(this.current, opts.subject)) {
			this.current = opts.subject;
			await this.contentProvidersUpdateLimiter.queue(() => Promise.all(
				this.contentProviders.map(p => p.update(opts.subject))));
		}
	}

	public onLayoutBody(height: number, width: number) {
		this.dimension = new dom.Dimension(width, height);
		this.splitView.layout(width);
	}

	public onWidth(width: number) {
		this.splitView.layout(width);
	}
}

class TestResultsPeek extends PeekViewWidget {
	private static lastHeightInLines?: number;

	private readonly visibilityChange = this._disposables.add(new Emitter<boolean>());
	private content!: TestResultsViewContent;
	private scopedContextKeyService!: IContextKeyService;
	private dimension?: dom.Dimension;
	public current?: InspectSubject;

	constructor(
		editor: ICodeEditor,
		@IThemeService themeService: IThemeService,
		@IPeekViewService peekViewService: IPeekViewService,
		@ITestingPeekOpener private readonly testingPeek: ITestingPeekOpener,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITextModelService protected readonly modelService: ITextModelService,
	) {
		super(editor, { showFrame: true, frameWidth: 1, showArrow: true, isResizeable: true, isAccessible: true, className: 'test-output-peek' }, instantiationService);

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

	protected override _fillContainer(container: HTMLElement): void {
		if (!this.scopedContextKeyService) {
			this.scopedContextKeyService = this._disposables.add(this.contextKeyService.createScoped(container));
			TestingContextKeys.isInPeek.bindTo(this.scopedContextKeyService).set(true);
			const instaService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService]));
			this.content = this._disposables.add(instaService.createInstance(TestResultsViewContent, this.editor, { historyVisible: this.testingPeek.historyVisible, showRevealLocationOnMessages: false }));
		}

		super._fillContainer(container);
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
		this.content.fillBody(containerElement);
		this.content.onDidRequestReveal(sub => {
			TestingOutputPeekController.get(this.editor)?.show(sub instanceof MessageSubject ? sub.messageUri : sub.outputUri);
		});
	}

	/**
	 * Updates the test to be shown.
	 */
	public setModel(subject: InspectSubject): Promise<void> {
		if (subject instanceof TaskSubject) {
			this.current = subject;
			return this.showInPlace(subject);
		}

		const message = subject.messages[subject.messageIndex];
		const previous = this.current;
		if (!subject.revealLocation && !previous) {
			return Promise.resolve();
		}

		this.current = subject;
		if (!subject.revealLocation) {
			return this.showInPlace(subject);
		}

		this.show(subject.revealLocation.range, TestResultsPeek.lastHeightInLines || hintMessagePeekHeight(message));
		this.editor.revealPositionNearTop(subject.revealLocation.range.getStartPosition(), ScrollType.Smooth);

		return this.showInPlace(subject);
	}

	/**
	 * Shows a message in-place without showing or changing the peek location.
	 * This is mostly used if peeking a message without a location.
	 */
	public async showInPlace(subject: InspectSubject) {
		if (subject instanceof MessageSubject) {
			const message = subject.messages[subject.messageIndex];
			this.setTitle(firstLine(renderStringAsPlaintext(message.message)), stripIcons(subject.test.label));
		} else {
			this.setTitle(localize('testOutputTitle', 'Test Output'));
		}
		await this.content.reveal({ subject: subject, preserveFocus: false });
	}

	protected override _relayout(newHeightInLines: number): void {
		super._relayout(newHeightInLines);
		TestResultsPeek.lastHeightInLines = newHeightInLines;
	}

	/** @override */
	protected override _doLayoutBody(height: number, width: number) {
		super._doLayoutBody(height, width);
		this.content.onLayoutBody(height, width);
	}

	/** @override */
	protected override _onWidth(width: number) {
		super._onWidth(width);
		if (this.dimension) {
			this.dimension = new dom.Dimension(width, this.dimension.height);
		}

		this.content.onWidth(width);
	}
}

export class TestResultsView extends ViewPane {
	private readonly content = this._register(this.instantiationService.createInstance(TestResultsViewContent, undefined, {
		historyVisible: staticObservableValue(true),
		showRevealLocationOnMessages: true,
	}));

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ITestResultService private readonly resultService: ITestResultService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);
	}

	public get subject() {
		return this.content.current;
	}

	public showLatestRun(preserveFocus = false) {
		const result = this.resultService.results.find(r => r.tasks.length);
		if (!result) {
			return;
		}

		this.content.reveal({
			preserveFocus,
			subject: new TaskSubject(result.id, 0),
		});
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.content.fillBody(container);
		this.content.onDidRequestReveal(subject => this.content.reveal({ preserveFocus: true, subject }));

		const [lastResult] = this.resultService.results;
		if (lastResult && lastResult.tasks.length) {
			this.content.reveal({ preserveFocus: true, subject: new TaskSubject(lastResult.id, 0) });
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.content.onLayoutBody(height, width);
	}
}

interface IPeekOutputRenderer extends IDisposable {
	/** Updates the displayed test. Should clear if it cannot display the test. */
	update(subject: InspectSubject): void;
	/** Recalculate content layout. */
	layout(dimension: dom.IDimension): void;
	/** Dispose the content provider. */
	dispose(): void;
}

const commonEditorOptions: IEditorOptions = {
	scrollBeyondLastLine: false,
	links: true,
	lineNumbers: 'off',
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
	diffAlgorithm: 'advanced',
};

const isDiffable = (message: ITestMessage): message is ITestErrorMessage & { actual: string; expected: string } =>
	message.type === TestMessageType.Error && message.actual !== undefined && message.expected !== undefined;

class DiffContentProvider extends Disposable implements IPeekOutputRenderer {
	private readonly widget = this._register(new MutableDisposable<DiffEditorWidget2>());
	private readonly model = this._register(new MutableDisposable());
	private dimension?: dom.IDimension;

	constructor(
		private readonly editor: ICodeEditor | undefined,
		private readonly container: HTMLElement,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextModelService private readonly modelService: ITextModelService,
	) {
		super();
	}

	public async update(subject: InspectSubject) {
		if (!(subject instanceof MessageSubject)) {
			return this.clear();
		}
		const message = subject.messages[subject.messageIndex];
		if (!isDiffable(message)) {
			return this.clear();
		}

		const [original, modified] = await Promise.all([
			this.modelService.createModelReference(subject.expectedUri),
			this.modelService.createModelReference(subject.actualUri),
		]);

		const model = this.model.value = new SimpleDiffEditorModel(original, modified);
		if (!this.widget.value) {
			this.widget.value = this.editor ? this.instantiationService.createInstance(
				EmbeddedDiffEditorWidget2,
				this.container,
				diffEditorOptions,
				{},
				this.editor,
			) : this.instantiationService.createInstance(
				DiffEditorWidget2,
				this.container,
				diffEditorOptions,
				{},
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

	public update(subject: InspectSubject): void {
		if (!(subject instanceof MessageSubject)) {
			return this.textPreview.clear();
		}

		const message = subject.messages[subject.messageIndex];
		if (isDiffable(message) || typeof message.message === 'string') {
			return this.textPreview.clear();
		}

		this.textPreview.value = new ScrollableMarkdownMessage(
			this.container,
			this.markdown.value,
			message.message as IMarkdownString,
		);
	}

	public layout(dimension: dom.IDimension): void {
		this.textPreview.value?.layout(dimension.height, dimension.width);
	}
}

class PlainTextMessagePeek extends Disposable implements IPeekOutputRenderer {
	private readonly widget = this._register(new MutableDisposable<CodeEditorWidget>());
	private readonly model = this._register(new MutableDisposable());
	private dimension?: dom.IDimension;

	constructor(
		private readonly editor: ICodeEditor | undefined,
		private readonly container: HTMLElement,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextModelService private readonly modelService: ITextModelService,
	) {
		super();
	}

	public async update(subject: InspectSubject) {
		if (!(subject instanceof MessageSubject)) {
			return this.clear();
		}

		const message = subject.messages[subject.messageIndex];
		if (isDiffable(message) || typeof message.message !== 'string') {
			return this.clear();
		}


		const modelRef = this.model.value = await this.modelService.createModelReference(subject.messageUri);
		if (!this.widget.value) {
			this.widget.value = this.editor ? this.instantiationService.createInstance(
				EmbeddedCodeEditorWidget,
				this.container,
				commonEditorOptions,
				{},
				this.editor,
			) : this.instantiationService.createInstance(
				CodeEditorWidget,
				this.container,
				commonEditorOptions,
				{ isSimpleWidget: true }
			);

			if (this.dimension) {
				this.widget.value.layout(this.dimension);
			}
		}

		this.widget.value.setModel(modelRef.object.textEditorModel);
		this.widget.value.updateOptions(commonEditorOptions);
	}

	private clear() {
		this.model.clear();
		this.widget.clear();
	}

	public layout(dimensions: dom.IDimension) {
		this.dimension = dimensions;
		this.widget.value?.layout(dimensions);
	}
}

class TerminalMessagePeek extends Disposable implements IPeekOutputRenderer {
	private dimensions?: dom.IDimension;
	private readonly terminalCwd = this._register(new MutableObservableValue<string>(''));
	private readonly xtermLayoutDelayer = this._register(new Delayer(50));

	/** Active terminal instance. */
	private readonly terminal = this._register(new MutableDisposable<IDetachedXtermTerminal>());
	/** Listener for streaming result data */
	private readonly outputDataListener = this._register(new MutableDisposable());

	constructor(
		private readonly container: HTMLElement,
		private readonly isInPeekView: boolean,
		@ITestResultService private readonly resultService: ITestResultService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IWorkspaceContextService private readonly workspaceContext: IWorkspaceContextService,
	) {
		super();
	}

	private async makeTerminal() {
		const prev = this.terminal.value;
		if (prev) {
			prev.clearBuffer();
			prev.clearSearchDecorations();
			// clearBuffer tries to retain the prompt line, but this doesn't exist for tests.
			// So clear the screen (J) and move to home (H) to ensure previous data is cleaned up.
			prev.write(`\x1b[2J\x1b[0;0H`);
			return prev;
		}

		const capabilities = new TerminalCapabilityStore();
		const cwd = this.terminalCwd;
		capabilities.add(TerminalCapability.CwdDetection, {
			type: TerminalCapability.CwdDetection,
			get cwds() { return [cwd.value]; },
			onDidChangeCwd: cwd.onDidChange,
			getCwd: () => cwd.value,
			updateCwd: () => { },
		});

		return this.terminal.value = await this.terminalService.createDetachedXterm({
			rows: 10,
			cols: 80,
			readonly: true,
			capabilities,
			colorProvider: {
				getBackgroundColor: theme => {
					const terminalBackground = theme.getColor(TERMINAL_BACKGROUND_COLOR);
					if (terminalBackground) {
						return terminalBackground;
					}
					if (this.isInPeekView) {
						return theme.getColor(peekViewResultsBackground);
					}
					const location = this.viewDescriptorService.getViewLocationById(Testing.ResultsViewId);
					return location === ViewContainerLocation.Panel
						? theme.getColor(PANEL_BACKGROUND)
						: theme.getColor(SIDE_BAR_BACKGROUND);
				},
			}
		});
	}

	public async update(subject: InspectSubject) {
		this.outputDataListener.clear();
		if (!(subject instanceof TaskSubject)) {
			return this.clear();
		}

		const result = this.resultService.getResult(subject.resultId);
		const task = result?.tasks[subject.taskIndex];
		if (!task) {
			return this.clear();
		}

		// Update the cwd and use the first test to try to hint at the correct cwd,
		// but often this will fall back to the first workspace folder.
		this.updateCwd(Iterable.find(result.tests, t => !!t.item.uri)?.item.uri);

		const terminal = await this.makeTerminal();
		if (result instanceof LiveTestResult) {
			let hadData = false;
			for (const buffer of task.output.buffers) {
				hadData ||= buffer.byteLength > 0;
				terminal.write(buffer.buffer);
			}
			if (!hadData && !task.running) {
				this.writeNotice(terminal, localize('runNoOutout', 'The test run did not record any output.'));
			}
		} else {
			this.writeNotice(terminal, localize('runNoOutputForPast', 'Test output is only available for new test runs.'));
		}

		this.attachTerminalToDom(terminal);
		this.outputDataListener.value = task.output.onDidWriteData(e => terminal.write(e.buffer));
	}

	private updateCwd(testUri?: URI) {
		const wf = (testUri && this.workspaceContext.getWorkspaceFolder(testUri))
			|| this.workspaceContext.getWorkspace().folders[0];
		if (wf) {
			this.terminalCwd.value = wf.uri.fsPath;
		}
	}

	private writeNotice(terminal: IDetachedXtermTerminal, str: string) {
		terminal.write(`\x1b[2m${str}\x1b[0m`);
	}

	private attachTerminalToDom(terminal: IDetachedXtermTerminal) {
		terminal.write('\x1b[?25l'); // hide cursor
		requestAnimationFrame(() => this.layoutTerminal(terminal));
		terminal.attachToElement(this.container, { enableGpu: false });
	}

	private clear() {
		this.outputDataListener.clear();
		this.xtermLayoutDelayer.cancel();
		this.terminal.clear();
	}

	public layout(dimensions: dom.IDimension) {
		this.dimensions = dimensions;
		if (this.terminal.value) {
			this.layoutTerminal(this.terminal.value, dimensions.width, dimensions.height);
		}
	}

	private layoutTerminal(
		xterm: IDetachedXtermTerminal,
		width = this.dimensions?.width ?? this.container.clientWidth,
		height = this.dimensions?.height ?? this.container.clientHeight
	) {
		width -= 10 + 20; // scrollbar width + margin
		this.xtermLayoutDelayer.trigger(() => {
			const scaled = getXtermScaledDimensions(xterm.getFont(), width, height);
			if (scaled) {
				xterm.resize(scaled.cols, scaled.rows);
			}
		});
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

// add 5ish lines for the size of the title and decorations in the peek.
const hintPeekStrHeight = (str: string) => Math.min(count(str, '\n') + 5, 24);

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

function getOuterEditorFromDiffEditor(codeEditorService: ICodeEditorService): ICodeEditor | null {
	const diffEditors = codeEditorService.listDiffEditors();

	for (const diffEditor of diffEditors) {
		if (diffEditor.hasTextFocus() && diffEditor instanceof EmbeddedDiffEditorWidget2) {
			return diffEditor.getParentEditor();
		}
	}

	return null;
}

export class CloseTestPeek extends EditorAction2 {
	constructor() {
		super({
			id: 'editor.closeTestPeek',
			title: localize('close', 'Close'),
			icon: Codicon.close,
			precondition: ContextKeyExpr.or(TestingContextKeys.isInPeek, TestingContextKeys.isPeekVisible),
			keybinding: {
				weight: KeybindingWeight.EditorContrib - 101,
				primary: KeyCode.Escape,
				when: ContextKeyExpr.not('config.editor.stablePeek')
			}
		});
	}

	runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const parent = getPeekedEditorFromFocus(accessor.get(ICodeEditorService));
		TestingOutputPeekController.get(parent ?? editor)?.removePeek();
	}
}

interface ITreeElement {
	type: string;
	context: unknown;
	id: string;
	label: string;
	onDidChange: Event<void>;
	labelWithIcons?: readonly (HTMLSpanElement | string)[];
	icon?: ThemeIcon;
	description?: string;
	ariaLabel?: string;
}

class TestResultElement implements ITreeElement {
	public readonly changeEmitter = new Emitter<void>();
	public readonly onDidChange = this.changeEmitter.event;
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

class TestCaseElement implements ITreeElement {
	public readonly changeEmitter = new Emitter<void>();
	public readonly onDidChange = this.changeEmitter.event;
	public readonly type = 'test';
	public readonly context = this.test.item.extId;
	public readonly id = `${this.results.id}/${this.test.item.extId}`;
	public readonly description?: string;

	public get state() {
		return this.test.tasks[this.taskIndex].state;
	}

	public get label() {
		return this.test.item.label;
	}

	public get labelWithIcons() {
		return renderLabelWithIcons(this.label);
	}

	public get icon() {
		return icons.testingStatesToIcons.get(this.state);
	}

	constructor(
		private readonly results: ITestResult,
		public readonly test: TestResultItem,
		public readonly taskIndex: number,
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

class TaskElement implements ITreeElement {
	public readonly changeEmitter = new Emitter<void>();
	public readonly onDidChange = this.changeEmitter.event;
	public readonly type = 'task';
	public readonly context: string;
	public readonly id: string;
	public readonly label: string;
	public readonly itemsCache = new CreationCache<TestCaseElement>();

	public get icon() {
		return this.results.tasks[this.index].running ? icons.testingStatesToIcons.get(TestResultState.Running) : undefined;
	}

	constructor(public readonly results: ITestResult, public readonly task: ITestRunTask, public readonly index: number) {
		this.id = `${results.id}/${index}`;
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
	public readonly marker?: number;
	public readonly onDidChange = Event.None;

	constructor(
		public readonly result: ITestResult,
		public readonly test: TestResultItem,
		public readonly taskIndex: number,
		public readonly messageIndex: number,
	) {
		const m = test.tasks[taskIndex].messages[messageIndex];

		this.location = m.location;
		this.marker = m.type === TestMessageType.Output ? m.marker : undefined;
		this.uri = this.context = buildTestUri({
			type: TestUriType.ResultMessage,
			messageIndex,
			resultId: result.id,
			taskIndex,
			testExtId: test.item.extId
		});

		this.id = this.uri.toString();

		const asPlaintext = renderStringAsPlaintext(m.message);
		const lines = count(asPlaintext.trimRight(), '\n');
		this.label = firstLine(asPlaintext);
		if (lines > 0) {
			this.description = lines > 1
				? localize('messageMoreLinesN', '+ {0} more lines', lines)
				: localize('messageMoreLines1', '+ 1 more line');
		}
	}
}

type TreeElement = TestResultElement | TestCaseElement | TestMessageElement | TaskElement;

class OutputPeekTree extends Disposable {
	private disposed = false;
	private readonly tree: WorkbenchCompressibleObjectTree<TreeElement, FuzzyScore>;
	private readonly treeActions: TreeActionsProvider;
	private readonly requestReveal = this._register(new Emitter<InspectSubject>());

	public readonly onDidRequestReview = this.requestReveal.event;

	constructor(
		container: HTMLElement,
		onDidReveal: Event<{ subject: InspectSubject; preserveFocus: boolean }>,
		options: { showRevealLocationOnMessages: boolean },
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@ITestResultService results: ITestResultService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITestExplorerFilterState explorerFilter: ITestExplorerFilterState,
	) {
		super();

		this.treeActions = instantiationService.createInstance(TreeActionsProvider, options.showRevealLocationOnMessages, this.requestReveal,);
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
				sorter: {
					compare(a, b) {
						if (a instanceof TestCaseElement && b instanceof TestCaseElement) {
							return cmpPriority(a.state, b.state);
						}

						return 0;
					},
				},
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

		const cc = new CreationCache<TreeElement>();
		const getTaskChildren = (taskElem: TaskElement): Iterable<ICompressedTreeElement<TreeElement>> => {
			const tests = Iterable.filter(taskElem.results.tests, test => test.tasks[taskElem.index].state >= TestResultState.Running || test.tasks[taskElem.index].messages.length > 0);

			return Iterable.map(tests, test => ({
				element: taskElem.itemsCache.getOrCreate(test, () => new TestCaseElement(taskElem.results, test, taskElem.index)),
				incompressible: true,
				children: getTestChildren(taskElem.results, test, taskElem.index),
			}));
		};

		const getTestChildren = (result: ITestResult, test: TestResultItem, taskIndex: number): Iterable<ICompressedTreeElement<TreeElement>> => {
			return Iterable.map(test.tasks[taskIndex].messages, (m, messageIndex) => ({
				element: cc.getOrCreate(m, () => new TestMessageElement(result, test, taskIndex, messageIndex)),
				incompressible: true,
			}));
		};

		const getResultChildren = (result: ITestResult): Iterable<ICompressedTreeElement<TreeElement>> => {
			return result.tasks.map((task, taskIndex) => {
				const taskElem = cc.getOrCreate(task, () => new TaskElement(result, task, taskIndex));
				return ({
					element: taskElem,
					incompressible: false,
					children: getTaskChildren(taskElem),
				});
			});
		};

		const getRootChildren = () => results.results.map(result => {
			const element = cc.getOrCreate(result, () => new TestResultElement(result));
			return {
				element,
				incompressible: true,
				collapsed: this.tree.hasElement(element) ? this.tree.isCollapsed(element) : true,
				children: getResultChildren(result)
			};
		});

		// Queued result updates to prevent spamming CPU when lots of tests are
		// completing and messaging quickly (#142514)
		const taskChildrenToUpdate = new Set<TaskElement>();
		const taskChildrenUpdate = this._register(new RunOnceScheduler(() => {
			for (const taskNode of taskChildrenToUpdate) {
				if (this.tree.hasElement(taskNode)) {
					this.tree.setChildren(taskNode, getTaskChildren(taskNode), { diffIdentityProvider });
				}
			}
			taskChildrenToUpdate.clear();
		}, 300));

		const attachToResults = (result: LiveTestResult) => {
			const resultNode = cc.get(result)! as TestResultElement;
			const disposable = new DisposableStore();
			disposable.add(result.onNewTask(() => {
				if (result.tasks.length === 1) {
					this.requestReveal.fire(new TaskSubject(result.id, 0)); // reveal the first task in new runs
				}

				if (this.tree.hasElement(resultNode)) {
					this.tree.setChildren(resultNode, getResultChildren(result), { diffIdentityProvider });
				}
			}));
			disposable.add(result.onEndTask(index => {
				(cc.get(result.tasks[index]) as TaskElement | undefined)?.changeEmitter.fire();
			}));

			disposable.add(result.onChange(e => {
				// try updating the item in each of its tasks
				for (const [index, task] of result.tasks.entries()) {
					const taskNode = cc.get(task) as TaskElement;
					if (!this.tree.hasElement(taskNode)) {
						continue;
					}

					const itemNode = taskNode.itemsCache.get(e.item);
					if (itemNode && this.tree.hasElement(itemNode)) {
						if (e.reason === TestResultItemChangeReason.NewMessage) {
							this.tree.setChildren(itemNode, getTestChildren(result, e.item, index), { diffIdentityProvider });
						}
						itemNode.changeEmitter.fire();
						return;
					}

					taskChildrenToUpdate.add(taskNode);
					if (!taskChildrenUpdate.isScheduled()) {
						taskChildrenUpdate.schedule();
					}
				}
			}));

			disposable.add(result.onComplete(() => {
				resultNode.changeEmitter.fire();
				disposable.dispose();
			}));

			return resultNode;
		};

		this._register(results.onResultsChanged(e => {
			// little hack here: a result change can cause the peek to be disposed,
			// but this listener will still be queued. Doing stuff with the tree
			// will cause errors.
			if (this.disposed) {
				return;
			}

			if ('completed' in e) {
				(cc.get(e.completed) as TestResultElement | undefined)?.changeEmitter.fire();
				return;
			}

			this.tree.setChildren(null, getRootChildren(), { diffIdentityProvider });

			// done after setChildren intentionally so that the ResultElement exists in the cache.
			if ('started' in e) {
				for (const child of this.tree.getNode(null).children) {
					this.tree.collapse(child.element, false);
				}

				this.tree.expand(attachToResults(e.started), true);
			}
		}));

		const revealItem = (element: TreeElement, preserveFocus: boolean) => {
			this.tree.setFocus([element]);
			this.tree.setSelection([element]);
			if (!preserveFocus) {
				this.tree.domFocus();
			}
		};

		this._register(onDidReveal(async ({ subject, preserveFocus = false }) => {
			if (subject instanceof TaskSubject) {
				const resultItem = this.tree.getNode(null).children.find(c => (c.element as TestResultElement)?.id === subject.resultId);
				if (resultItem) {
					revealItem(resultItem.element as TestResultElement, preserveFocus);
				}
				return;
			}

			const messageNode = cc.get(subject.messages[subject.messageIndex]);
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

			revealItem(messageNode, preserveFocus);
		}));

		this._register(this.tree.onDidOpen(async e => {
			if (e.element instanceof TestMessageElement) {
				this.requestReveal.fire(new MessageSubject(e.element.result.id, e.element.test, e.element.taskIndex, e.element.messageIndex));
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
		for (const result of results.results) {
			if (!result.completedAt && result instanceof LiveTestResult) {
				attachToResults(result);
			}
		}
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
		if (lastElement instanceof TaskElement && chain.length >= 2) {
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

	/** Called to render a new element */
	private doRender(element: ITreeElement, templateData: TemplateData) {
		templateData.elementDisposable.clear();
		templateData.elementDisposable.add(element.onDidChange(() => this.doRender(element, templateData)));
		this.doRenderInner(element, templateData);
	}

	/** Called, and may be re-called, to render or re-render an element */
	private doRenderInner(element: ITreeElement, templateData: TemplateData) {
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
		private readonly showRevealLocationOnMessages: boolean,
		private readonly requestReveal: Emitter<InspectSubject>,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService,
		@ICommandService private readonly commandService: ICommandService,
		@ITestProfileService private readonly testProfileService: ITestProfileService,
		@IEditorService private readonly editorService: IEditorService,
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

			if (element instanceof TaskElement) {
				primary.push(new Action(
					'testing.outputPeek.showResultOutput',
					localize('testing.showResultOutput', "Show Result Output"),
					ThemeIcon.asClassName(Codicon.terminal),
					undefined,
					() => this.requestReveal.fire(new TaskSubject(element.results.id, element.index)),
				));
			}

			if (element instanceof TestResultElement) {
				// only show if there are no collapsed test nodes that have more specific choices
				if (element.value.tasks.length === 1) {
					primary.push(new Action(
						'testing.outputPeek.showResultOutput',
						localize('testing.showResultOutput', "Show Result Output"),
						ThemeIcon.asClassName(Codicon.terminal),
						undefined,
						() => this.requestReveal.fire(new TaskSubject(element.value.id, 0)),
					));
				}

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

			if (element instanceof TestCaseElement) {
				const extId = element.test.item.extId;
				primary.push(new Action(
					'testing.outputPeek.goToFile',
					localize('testing.goToFile', "Go to Source"),
					ThemeIcon.asClassName(Codicon.goToFile),
					undefined,
					() => this.commandService.executeCommand('vscode.revealTest', extId),
				));

				secondary.push(new Action(
					'testing.outputPeek.revealInExplorer',
					localize('testing.revealInExplorer', "Reveal in Test Explorer"),
					ThemeIcon.asClassName(Codicon.listTree),
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

			if (element instanceof TestMessageElement) {
				if (this.showRevealLocationOnMessages && element.location) {
					primary.push(new Action(
						'testing.outputPeek.goToError',
						localize('testing.goToError', "Go to Source"),
						ThemeIcon.asClassName(Codicon.goToFile),
						undefined,
						() => this.editorService.openEditor({
							resource: element.location!.uri,
							options: {
								selection: element.location!.range,
								preserveFocus: true,
							}
						}),
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

const navWhen = ContextKeyExpr.and(
	EditorContextKeys.focus,
	TestingContextKeys.isPeekVisible,
);

/**
 * Gets the appropriate editor for peeking based on the currently focused editor.
 */
const getPeekedEditorFromFocus = (codeEditorService: ICodeEditorService) => {
	const editor = codeEditorService.getFocusedCodeEditor() || codeEditorService.getActiveCodeEditor();
	return editor && getPeekedEditor(codeEditorService, editor);
};

/**
 * Gets the editor where the peek may be shown, bubbling upwards if the given
 * editor is embedded (i.e. inside a peek already).
 */
const getPeekedEditor = (codeEditorService: ICodeEditorService, editor: ICodeEditor) => {
	if (TestingOutputPeekController.get(editor)?.subject) {
		return editor;
	}

	if (editor instanceof EmbeddedCodeEditorWidget) {
		return editor.getParentEditor();
	}

	const outer = getOuterEditorFromDiffEditor(codeEditorService);
	if (outer) {
		return outer;
	}

	return editor;
};

export class GoToNextMessageAction extends Action2 {
	public static readonly ID = 'testing.goToNextMessage';
	constructor() {
		super({
			id: GoToNextMessageAction.ID,
			f1: true,
			title: { value: localize('testing.goToNextMessage', "Go to Next Test Failure"), original: 'Go to Next Test Failure' },
			icon: Codicon.arrowDown,
			category: Categories.Test,
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

	public override run(accessor: ServicesAccessor) {
		const editor = getPeekedEditorFromFocus(accessor.get(ICodeEditorService));
		if (editor) {
			TestingOutputPeekController.get(editor)?.next();
		}
	}
}

export class GoToPreviousMessageAction extends Action2 {
	public static readonly ID = 'testing.goToPreviousMessage';
	constructor() {
		super({
			id: GoToPreviousMessageAction.ID,
			f1: true,
			title: { value: localize('testing.goToPreviousMessage', "Go to Previous Test Failure"), original: 'Go to Previous Test Failure' },
			icon: Codicon.arrowUp,
			category: Categories.Test,
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

	public override run(accessor: ServicesAccessor) {
		const editor = getPeekedEditorFromFocus(accessor.get(ICodeEditorService));
		if (editor) {
			TestingOutputPeekController.get(editor)?.previous();
		}
	}
}

export class OpenMessageInEditorAction extends Action2 {
	public static readonly ID = 'testing.openMessageInEditor';
	constructor() {
		super({
			id: OpenMessageInEditorAction.ID,
			f1: false,
			title: { value: localize('testing.openMessageInEditor', "Open in Editor"), original: 'Open in Editor' },
			icon: Codicon.goToFile,
			category: Categories.Test,
			menu: [{ id: MenuId.TestPeekTitle }],
		});
	}

	public override run(accessor: ServicesAccessor) {
		accessor.get(ITestingPeekOpener).openCurrentInEditor();
	}
}

export class ToggleTestingPeekHistory extends Action2 {
	public static readonly ID = 'testing.toggleTestingPeekHistory';
	constructor() {
		super({
			id: ToggleTestingPeekHistory.ID,
			f1: true,
			title: { value: localize('testing.toggleTestingPeekHistory', "Toggle Test History in Peek"), original: 'Toggle Test History in Peek' },
			icon: Codicon.history,
			category: Categories.Test,
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

	public override run(accessor: ServicesAccessor) {
		const opener = accessor.get(ITestingPeekOpener);
		opener.historyVisible.value = !opener.historyVisible.value;
	}
}

class CreationCache<T> {
	private readonly v = new WeakMap<object, T>();

	public get(key: object) {
		return this.v.get(key);
	}

	public getOrCreate<T2 extends T>(ref: object, factory: () => T2): T2 {
		const existing = this.v.get(ref);
		if (existing) {
			return existing as T2;
		}

		const fresh = factory();
		this.v.set(ref, fresh);
		return fresh;
	}
}
