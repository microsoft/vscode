/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { IAction } from '../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Color } from '../../../../base/common/color.js';
import { Event } from '../../../../base/common/event.js';
import { stripIcons } from '../../../../base/common/iconLabels.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, disposableObservableValue, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditor, isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorAction2 } from '../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { EmbeddedCodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { EmbeddedDiffEditorWidget } from '../../../../editor/browser/widget/diffEditor/embeddedDiffEditorWidget.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IEditor, IEditorContribution, ScrollType } from '../../../../editor/common/editorCommon.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IPeekViewService, PeekViewWidget, peekViewTitleForeground, peekViewTitleInfoForeground } from '../../../../editor/contrib/peekView/browser/peekView.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { fillInActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ITextEditorOptions, TextEditorSelectionRevealType } from '../../../../platform/editor/common/editor.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { AutoOpenPeekViewWhen, TestingConfigKeys, getTestingConfiguration } from '../common/configuration.js';
import { Testing } from '../common/constants.js';
import { MutableObservableValue, staticObservableValue } from '../common/observableValue.js';
import { StoredValue } from '../common/storedValue.js';
import { ITestResult, TestResultItemChange, TestResultItemChangeReason, resultItemParents } from '../common/testResult.js';
import { ITestResultService, ResultChangeEvent } from '../common/testResultService.js';
import { ITestService } from '../common/testService.js';
import { IRichLocation, ITestMessage, TestMessageType, TestResultItem } from '../common/testTypes.js';
import { TestingContextKeys } from '../common/testingContextKeys.js';
import { IShowResultOptions, ITestingPeekOpener } from '../common/testingPeekOpener.js';
import { isFailedState } from '../common/testingStates.js';
import { ParsedTestUri, TestUriType, buildTestUri, parseTestUri } from '../common/testingUri.js';
import { renderTestMessageAsText } from './testMessageColorizer.js';
import { InspectSubject, MessageSubject, TaskSubject, TestOutputSubject, inspectSubjectHasStack, mapFindTestMessage } from './testResultsView/testResultsSubject.js';
import { TestResultsViewContent } from './testResultsView/testResultsViewContent.js';
import { testingMessagePeekBorder, testingPeekBorder, testingPeekHeaderBackground, testingPeekMessageHeaderBackground } from './theme.js';


/** Iterates through every message in every result */
function* allMessages([result]: readonly ITestResult[]) {
	if (!result) {
		return;
	}

	for (const test of result.tests) {
		for (let taskIndex = 0; taskIndex < test.tasks.length; taskIndex++) {
			const messages = test.tasks[taskIndex].messages;
			for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {

				if (messages[messageIndex].type === TestMessageType.Error) {
					yield { result, test, taskIndex, messageIndex };
				}
			}
		}
	}
}

interface IMessageIteratedReference {
	messageIndex: number;
	taskIndex: number;
	result: ITestResult;
	test: TestResultItem;
}

function messageItReferenceToUri({ result, test, taskIndex, messageIndex }: IMessageIteratedReference) {
	return buildTestUri({
		type: TestUriType.ResultMessage,
		resultId: result.id,
		testExtId: test.item.extId,
		taskIndex,
		messageIndex,
	});
}

type TestUriWithDocument = ParsedTestUri & { documentUri: URI };

export class TestingPeekOpener extends Disposable implements ITestingPeekOpener {
	declare _serviceBrand: undefined;

	private lastUri?: TestUriWithDocument;

	/** @inheritdoc */
	public readonly historyVisible = this._register(MutableObservableValue.stored(new StoredValue<boolean>({
		key: 'testHistoryVisibleInPeek',
		scope: StorageScope.PROFILE,
		target: StorageTarget.USER,
	}, this.storageService), false));

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

		this.showPeekFromUri({
			type: TestUriType.ResultMessage,
			documentUri: candidate.location.uri,
			taskIndex: candidate.taskId,
			messageIndex: candidate.index,
			resultId: result.id,
			testExtId: test.item.extId,
		}, undefined, { selection: candidate.location.range, selectionRevealType: TextEditorSelectionRevealType.NearTopIfOutsideViewport, ...options });
		return true;
	}

	/** @inheritdoc */
	public peekUri(uri: URI, options: IShowResultOptions = {}) {
		const parsed = parseTestUri(uri);
		const result = parsed && this.testResults.getResult(parsed.resultId);
		if (!parsed || !result || !('testExtId' in parsed)) {
			return false;
		}

		if (!('messageIndex' in parsed)) {
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
		if (current instanceof TaskSubject || current instanceof TestOutputSubject) {
			this.editorService.openEditor({ resource: current.outputUri, options });
			return;
		}

		if (current instanceof TestOutputSubject) {
			this.editorService.openEditor({ resource: current.outputUri, options });
			return;
		}

		const message = current.message;
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
		return controller?.subject.get() ?? this.viewsService.getActiveViewWithId<TestResultsView>(Testing.ResultsViewId)?.subject;
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
				const visibleEditors = this.editorService.visibleTextEditorControls;
				const editorUris = new Set(visibleEditors.filter(isCodeEditor).map(e => e.getModel()?.uri.toString()));
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
		if (controllers.some(c => c?.subject.get())) {
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
				if (message.type !== TestMessageType.Error || !message.location || message.location.uri.toString() !== demandedUriStr) {
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
		const fallbackLocation = test.item.uri && test.item.range
			? { uri: test.item.uri, range: test.item.range }
			: undefined;

		let best: { taskId: number; index: number; message: ITestMessage; location: IRichLocation } | undefined;
		mapFindTestMessage(test, (task, message, messageIndex, taskId) => {
			const location = message.location || fallbackLocation;
			if (!isFailedState(task.state) || !location) {
				return;
			}

			if (best && message.type !== TestMessageType.Error) {
				return;
			}

			best = { taskId, index: messageIndex, message, location };
		});

		return best;
	}
}

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
	private readonly peek = this._register(disposableObservableValue<TestResultsPeek | undefined>('TestingOutputPeek', undefined));

	/**
	 * Context key updated when the peek is visible/hidden.
	 */
	private readonly visible: IContextKey<boolean>;

	/**
	 * Gets the currently display subject. Undefined if the peek is not open.
	 */
	public readonly subject = derived(reader => this.peek.read(reader)?.current.read(reader));

	constructor(
		private readonly editor: ICodeEditor,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITestResultService private readonly testResults: ITestResultService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {

		super();
		this.visible = TestingContextKeys.isPeekVisible.bindTo(contextKeyService);
		this._register(editor.onDidChangeModel(() => this.peek.set(undefined, undefined)));
		this._register(testResults.onResultsChanged(this.closePeekOnCertainResultEvents, this));
		this._register(testResults.onTestChanged(this.closePeekOnTestChange, this));
	}

	/**
	 * Shows a peek for the message in the editor.
	 */
	public async show(uri: URI) {
		const subject = this.retrieveTest(uri);
		if (subject) {
			this.showSubject(subject);
		}
	}

	/**
	 * Shows a peek for the existing inspect subject.
	 */
	public async showSubject(subject: InspectSubject) {
		if (!this.peek.get()) {
			const peek = this.instantiationService.createInstance(TestResultsPeek, this.editor);
			this.peek.set(peek, undefined);
			peek.onDidClose(() => {
				this.visible.set(false);
				this.peek.set(undefined, undefined);
			});

			this.visible.set(true);
			peek.create();
		}

		if (subject instanceof MessageSubject) {
			alert(renderTestMessageAsText(subject.message.message));
		}

		this.peek.get()!.setModel(subject);
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
		this.peek.set(undefined, undefined);
	}

	/**
	 * Collapses all displayed stack frames.
	 */
	public collapseStack() {
		this.peek.get()?.collapseStack();
	}

	/**
	 * Shows the next message in the peek, if possible.
	 */
	public next() {
		const subject = this.peek.get()?.current.get();
		if (!subject) {
			return;
		}

		let first: IMessageIteratedReference | undefined;

		let found = false;
		for (const m of allMessages(this.testResults.results)) {
			first ??= m;
			if (subject instanceof TaskSubject && m.result.id === subject.result.id) {
				found = true; // open the first message found in the current result
			}

			if (found) {
				this.openAndShow(messageItReferenceToUri(m));
				return;
			}

			if (subject instanceof TestOutputSubject && subject.test.item.extId === m.test.item.extId && subject.taskIndex === m.taskIndex && subject.result.id === m.result.id) {
				found = true;
			}

			if (subject instanceof MessageSubject && subject.test.extId === m.test.item.extId && subject.messageIndex === m.messageIndex && subject.taskIndex === m.taskIndex && subject.result.id === m.result.id) {
				found = true;
			}
		}

		if (first) {
			this.openAndShow(messageItReferenceToUri(first));
		}
	}

	/**
	 * Shows the previous message in the peek, if possible.
	 */
	public previous() {
		const subject = this.subject.get();
		if (!subject) {
			return;
		}

		let previous: IMessageIteratedReference | undefined; // pointer to the last message
		let previousLockedIn = false; // whether the last message was verified as previous to the current subject
		let last: IMessageIteratedReference | undefined; // overall last message
		for (const m of allMessages(this.testResults.results)) {
			last = m;

			if (!previousLockedIn) {
				if (subject instanceof TaskSubject) {
					if (m.result.id === subject.result.id) {
						previousLockedIn = true;
					}
					continue;
				}

				if (subject instanceof TestOutputSubject) {
					if (m.test.item.extId === subject.test.item.extId && m.result.id === subject.result.id && m.taskIndex === subject.taskIndex) {
						previousLockedIn = true;
					}
					continue;
				}

				if (subject.test.extId === m.test.item.extId && subject.messageIndex === m.messageIndex && subject.taskIndex === m.taskIndex && subject.result.id === m.result.id) {
					previousLockedIn = true;
					continue;
				}

				previous = m;
			}
		}

		const target = previous || last;
		if (target) {
			this.openAndShow(messageItReferenceToUri(target));
		}
	}

	/**
	 * Removes the peek view if it's being displayed on the given test ID.
	 */
	public removeIfPeekingForTest(testId: string) {
		const c = this.subject.get();
		if (c && c instanceof MessageSubject && c.test.extId === testId) {
			this.peek.set(undefined, undefined);
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
			this.peek.set(undefined, undefined); // close peek when runs start
		}

		if ('removed' in evt && this.testResults.results.length === 0) {
			this.peek.set(undefined, undefined); // close the peek if results are cleared
		}
	}

	private retrieveTest(uri: URI): InspectSubject | undefined {
		const parts = parseTestUri(uri);
		if (!parts) {
			return undefined;
		}

		const result = this.testResults.results.find(r => r.id === parts.resultId);
		if (!result) {
			return;
		}

		if (parts.type === TestUriType.TaskOutput) {
			return new TaskSubject(result, parts.taskIndex);
		}

		if (parts.type === TestUriType.TestOutput) {
			const test = result.getStateById(parts.testExtId);
			if (!test) { return; }
			return new TestOutputSubject(result, parts.taskIndex, test);
		}

		const { testExtId, taskIndex, messageIndex } = parts;
		const test = result?.getStateById(testExtId);
		if (!test || !test.tasks[parts.taskIndex]) {
			return;
		}

		return new MessageSubject(result, test, taskIndex, messageIndex);
	}
}


class TestResultsPeek extends PeekViewWidget {
	public readonly current = observableValue<InspectSubject | undefined>('testPeekCurrent', undefined);
	private resizeOnNextContentHeightUpdate = false;
	private content!: TestResultsViewContent;
	private scopedContextKeyService!: IContextKeyService;
	private dimension?: dom.Dimension;

	constructor(
		editor: ICodeEditor,
		@IThemeService private readonly themeService: IThemeService,
		@IPeekViewService peekViewService: IPeekViewService,
		@ITestingPeekOpener private readonly testingPeek: ITestingPeekOpener,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITextModelService protected readonly modelService: ITextModelService,
		@ICodeEditorService protected readonly codeEditorService: ICodeEditorService,
		@IUriIdentityService protected readonly uriIdentityService: IUriIdentityService,
	) {
		super(editor, { showFrame: true, frameWidth: 1, showArrow: true, isResizeable: true, isAccessible: true, className: 'test-output-peek' }, instantiationService);

		this._disposables.add(themeService.onDidColorThemeChange(this.applyTheme, this));
		peekViewService.addExclusiveWidget(editor, this);
	}

	protected override _getMaximumHeightInLines(): number | undefined {
		const defaultMaxHeight = super._getMaximumHeightInLines();
		const contentHeight = this.content?.contentHeight;
		if (!contentHeight) { // undefined or 0
			return defaultMaxHeight;
		}

		if (this.testingPeek.historyVisible.value) { // don't cap height with the history split
			return defaultMaxHeight;
		}

		const lineHeight = this.editor.getOption(EditorOption.lineHeight);
		// 41 is experimentally determined to be the overhead of the peek view itself
		// to avoid showing scrollbars by default in its content.
		const basePeekOverhead = 41;

		return Math.min(defaultMaxHeight || Infinity, (contentHeight + basePeekOverhead) / lineHeight + 1);
	}

	private applyTheme() {
		const theme = this.themeService.getColorTheme();
		const current = this.current.get();
		const isError = current instanceof MessageSubject && current.message.type === TestMessageType.Error;
		const borderColor = (isError ? theme.getColor(testingPeekBorder) : theme.getColor(testingMessagePeekBorder)) || Color.transparent;
		const headerBg = (isError ? theme.getColor(testingPeekHeaderBackground) : theme.getColor(testingPeekMessageHeaderBackground)) || Color.transparent;
		const editorBg = theme.getColor(editorBackground);
		this.style({
			arrowColor: borderColor,
			frameColor: borderColor,
			headerBackgroundColor: editorBg && headerBg ? headerBg.makeOpaque(editorBg) : headerBg,
			primaryHeadingColor: theme.getColor(peekViewTitleForeground),
			secondaryHeadingColor: theme.getColor(peekViewTitleInfoForeground)
		});
	}

	protected override _fillContainer(container: HTMLElement): void {
		if (!this.scopedContextKeyService) {
			this.scopedContextKeyService = this._disposables.add(this.contextKeyService.createScoped(container));
			TestingContextKeys.isInPeek.bindTo(this.scopedContextKeyService).set(true);
			const instaService = this._disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
			this.content = this._disposables.add(instaService.createInstance(TestResultsViewContent, this.editor, { historyVisible: this.testingPeek.historyVisible, showRevealLocationOnMessages: false, locationForProgress: Testing.ResultsViewId }));

			this._disposables.add(this.content.onClose(() => {
				TestingOutputPeekController.get(this.editor)?.removePeek();
			}));
		}

		super._fillContainer(container);
	}

	protected override _fillHead(container: HTMLElement): void {
		super._fillHead(container);

		const menuContextKeyService = this._disposables.add(this.contextKeyService.createScoped(container));
		this._disposables.add(bindContextKey(
			TestingContextKeys.peekHasStack,
			menuContextKeyService,
			reader => inspectSubjectHasStack(this.current.read(reader)),
		));

		const menu = this.menuService.createMenu(MenuId.TestPeekTitle, menuContextKeyService);
		const actionBar = this._actionbarWidget!;
		this._disposables.add(menu.onDidChange(() => {
			actions.length = 0;
			fillInActionBarActions(menu.getActions(), actions);
			while (actionBar.getAction(1)) {
				actionBar.pull(0); // remove all but the view's default "close" button
			}
			actionBar.push(actions, { label: false, icon: true, index: 0 });
		}));

		const actions: IAction[] = [];
		fillInActionBarActions(menu.getActions(), actions);
		actionBar.push(actions, { label: false, icon: true, index: 0 });
	}

	protected override _fillBody(containerElement: HTMLElement): void {
		this.content.fillBody(containerElement);

		// Resize on height updates for a short time to allow any heights made
		// by editor contributions to come into effect before.
		const contentHeightSettleTimer = this._disposables.add(new RunOnceScheduler(() => {
			this.resizeOnNextContentHeightUpdate = false;
		}, 500));

		this._disposables.add(this.content.onDidChangeContentHeight(height => {
			if (!this.resizeOnNextContentHeightUpdate || !height) {
				return;
			}

			const displayed = this._getMaximumHeightInLines();
			if (displayed) {
				this._relayout(Math.min(displayed, this.getVisibleEditorLines() / 2), true);
				if (!contentHeightSettleTimer.isScheduled()) {
					contentHeightSettleTimer.schedule();
				}
			}
		}));

		this._disposables.add(this.content.onDidRequestReveal(sub => {
			TestingOutputPeekController.get(this.editor)?.show(sub instanceof MessageSubject
				? sub.messageUri
				: sub.outputUri);
		}));
	}

	/**
	 * Updates the test to be shown.
	 */
	public setModel(subject: InspectSubject): Promise<void> {
		if (subject instanceof TaskSubject || subject instanceof TestOutputSubject) {
			this.current.set(subject, undefined);
			return this.showInPlace(subject);
		}

		const previous = this.current;
		const revealLocation = subject.revealLocation?.range.getStartPosition();
		if (!revealLocation && !previous) {
			return Promise.resolve();
		}

		this.current.set(subject, undefined);
		if (!revealLocation) {
			return this.showInPlace(subject);
		}

		this.resizeOnNextContentHeightUpdate = true;
		this.show(revealLocation, 10); // 10 is just a random number, we resize once content is available
		this.editor.revealRangeNearTopIfOutsideViewport(Range.fromPositions(revealLocation), ScrollType.Smooth);

		return this.showInPlace(subject);
	}

	/**
	 * Collapses all displayed stack frames.
	 */
	public collapseStack() {
		this.content.collapseStack();
	}

	private getVisibleEditorLines() {
		// note that we don't use the view ranges because we don't want to get
		// thrown off by large wrapping lines. Being approximate here is okay.
		return Math.round(this.editor.getDomNode()!.clientHeight / this.editor.getOption(EditorOption.lineHeight));
	}

	/**
	 * Shows a message in-place without showing or changing the peek location.
	 * This is mostly used if peeking a message without a location.
	 */
	public async showInPlace(subject: InspectSubject) {
		if (subject instanceof MessageSubject) {
			const message = subject.message;
			this.setTitle(firstLine(renderTestMessageAsText(message.message)), stripIcons(subject.test.label));
		} else {
			this.setTitle(localize('testOutputTitle', 'Test Output'));
		}
		this.applyTheme();
		await this.content.reveal({ subject, preserveFocus: false });
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
	private readonly content = new Lazy(() => this._register(this.instantiationService.createInstance(TestResultsViewContent, undefined, {
		historyVisible: staticObservableValue(true),
		showRevealLocationOnMessages: true,
		locationForProgress: Testing.ExplorerViewId,
	})));

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
		@IHoverService hoverService: IHoverService,
		@ITestResultService private readonly resultService: ITestResultService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	public get subject() {
		return this.content.rawValue?.current;
	}

	public showLatestRun(preserveFocus = false) {
		const result = this.resultService.results.find(r => r.tasks.length);
		if (!result) {
			return;
		}

		this.content.rawValue?.reveal({ preserveFocus, subject: new TaskSubject(result, 0) });
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		// Avoid rendering into the body until it's attached the DOM, as it can
		// result in rendering issues in the terminal (#194156)
		if (this.isBodyVisible()) {
			this.renderContent(container);
		} else {
			this._register(Event.once(Event.filter(this.onDidChangeBodyVisibility, Boolean))(() => this.renderContent(container)));
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.content.rawValue?.onLayoutBody(height, width);
	}

	private renderContent(container: HTMLElement) {
		const content = this.content.value;
		content.fillBody(container);
		this._register(content.onDidRequestReveal(subject => content.reveal({ preserveFocus: true, subject })));

		const [lastResult] = this.resultService.results;
		if (lastResult && lastResult.tasks.length) {
			content.reveal({ preserveFocus: true, subject: new TaskSubject(lastResult, 0) });
		}
	}
}

const firstLine = (str: string) => {
	const index = str.indexOf('\n');
	return index === -1 ? str : str.slice(0, index);
};

function getOuterEditorFromDiffEditor(codeEditorService: ICodeEditorService): ICodeEditor | null {
	const diffEditors = codeEditorService.listDiffEditors();

	for (const diffEditor of diffEditors) {
		if (diffEditor.hasTextFocus() && diffEditor instanceof EmbeddedDiffEditorWidget) {
			return diffEditor.getParentEditor();
		}
	}

	return null;
}

export class CloseTestPeek extends EditorAction2 {
	constructor() {
		super({
			id: 'editor.closeTestPeek',
			title: localize2('close', 'Close'),
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
	if (TestingOutputPeekController.get(editor)?.subject.get()) {
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
			title: localize2('testing.goToNextMessage', 'Go to Next Test Failure'),
			metadata: {
				description: localize2('testing.goToNextMessage.description', 'Shows the next failure message in your file')
			},
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
			title: localize2('testing.goToPreviousMessage', 'Go to Previous Test Failure'),
			metadata: {
				description: localize2('testing.goToPreviousMessage.description', 'Shows the previous failure message in your file')
			},
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

export class CollapsePeekStack extends Action2 {
	public static readonly ID = 'testing.collapsePeekStack';
	constructor() {
		super({
			id: CollapsePeekStack.ID,
			title: localize2('testing.collapsePeekStack', 'Collapse Stack Frames'),
			icon: Codicon.collapseAll,
			category: Categories.Test,
			menu: [{
				id: MenuId.TestPeekTitle,
				when: TestingContextKeys.peekHasStack,
				group: 'navigation',
				order: 4,
			}],
		});
	}

	public override run(accessor: ServicesAccessor) {
		const editor = getPeekedEditorFromFocus(accessor.get(ICodeEditorService));
		if (editor) {
			TestingOutputPeekController.get(editor)?.collapseStack();
		}
	}
}

export class OpenMessageInEditorAction extends Action2 {
	public static readonly ID = 'testing.openMessageInEditor';
	constructor() {
		super({
			id: OpenMessageInEditorAction.ID,
			f1: false,
			title: localize2('testing.openMessageInEditor', 'Open in Editor'),
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
			title: localize2('testing.toggleTestingPeekHistory', 'Toggle Test History in Peek'),
			metadata: {
				description: localize2('testing.toggleTestingPeekHistory.description', 'Shows or hides the history of test runs in the peek view')
			},
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
