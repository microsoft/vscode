/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { renderIcon } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { IntervalTimer } from 'vs/base/common/async';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { EDITOR_FONT_DEFAULTS } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { BracketMatchingController } from 'vs/editor/contrib/bracketMatching/browser/bracketMatching';
import { ContextMenuController } from 'vs/editor/contrib/contextmenu/browser/contextmenu';
import { IMarkdownRenderResult, MarkdownRenderer } from 'vs/editor/contrib/markdownRenderer/browser/markdownRenderer';
import { ViewportSemanticTokensContribution } from 'vs/editor/contrib/semanticTokens/browser/viewportSemanticTokens';
import { SmartSelectController } from 'vs/editor/contrib/smartSelect/browser/smartSelect';
import { WordHighlighterContribution } from 'vs/editor/contrib/wordHighlighter/browser/wordHighlighter';
import { localize } from 'vs/nls';
import { MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILogService } from 'vs/platform/log/common/log';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';
import { MenuPreventer } from 'vs/workbench/contrib/codeEditor/browser/menuPreventer';
import { SelectionClipboardContributionID } from 'vs/workbench/contrib/codeEditor/browser/selectionClipboard';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { IInteractiveSessionCodeBlockActionContext } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionCodeblockActions';
import { InteractiveSessionEditorOptions } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionOptions';
import { interactiveSessionResponseHasProviderId } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionContextKeys';
import { IInteractiveSessionResponseCommandFollowup } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionModel';
import { IInteractiveSlashCommand } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { IInteractiveRequestViewModel, IInteractiveResponseViewModel, isRequestVM, isResponseVM } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionViewModel';
import { getNWords } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionWordCounter';

const $ = dom.$;

export type InteractiveTreeItem = IInteractiveRequestViewModel | IInteractiveResponseViewModel;

interface IInteractiveListItemTemplate {
	rowContainer: HTMLElement;
	titleToolbar: MenuWorkbenchToolBar;
	avatar: HTMLElement;
	username: HTMLElement;
	value: HTMLElement;
	contextKeyService: IContextKeyService;
	templateDisposables: IDisposable;
	elementDisposables: DisposableStore;
}

interface IItemHeightChangeParams {
	element: InteractiveTreeItem;
	height: number;
}

const forceVerboseLayoutTracing = false;

export interface IInteractiveSessionRendererDelegate {
	getListLength(): number;
	getSlashCommands(): IInteractiveSlashCommand[];
}

export class InteractiveListItemRenderer extends Disposable implements ITreeRenderer<InteractiveTreeItem, FuzzyScore, IInteractiveListItemTemplate> {
	static readonly cursorCharacter = '\u258c';
	static readonly ID = 'item';

	private readonly renderer: MarkdownRenderer;

	protected readonly _onDidChangeItemHeight = this._register(new Emitter<IItemHeightChangeParams>());
	readonly onDidChangeItemHeight: Event<IItemHeightChangeParams> = this._onDidChangeItemHeight.event;

	protected readonly _onDidSelectFollowup = this._register(new Emitter<string>());
	readonly onDidSelectFollowup: Event<string> = this._onDidSelectFollowup.event;

	private readonly _editorPool: EditorPool;

	private _currentLayoutWidth: number = 0;

	constructor(
		private readonly editorOptions: InteractiveSessionEditorOptions,
		private readonly delegate: IInteractiveSessionRendererDelegate,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@ICommandService private readonly commandService: ICommandService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();
		this.renderer = this.instantiationService.createInstance(MarkdownRenderer, {});
		this._editorPool = this._register(this.instantiationService.createInstance(EditorPool, this.editorOptions));
	}

	get templateId(): string {
		return InteractiveListItemRenderer.ID;
	}

	private traceLayout(method: string, message: string) {
		if (forceVerboseLayoutTracing) {
			this.logService.info(`InteractiveListItemRenderer#${method}: ${message}`);
		} else {
			this.logService.trace(`InteractiveListItemRenderer#${method}: ${message}`);
		}
	}

	private shouldRenderProgressively(element: IInteractiveResponseViewModel): boolean {
		return !this.configService.getValue('interactive.experimental.disableProgressiveRendering') && element.progressiveResponseRenderingEnabled;
	}

	private getProgressiveRenderRate(element: IInteractiveResponseViewModel): number {
		const configuredRate = this.configService.getValue('interactive.experimental.progressiveRenderingRate');
		if (typeof configuredRate === 'number') {
			return configuredRate;
		}

		if (element.isComplete) {
			return 40;
		}

		if (element.contentUpdateTimings && element.contentUpdateTimings.impliedWordLoadRate) {
			// This doesn't account for dead time after the last update. When the previous update is the final one and the model is only waiting for followupQuestions, that's good.
			// When there was one quick update and then you are waiting longer for the next one, that's not good since the rate should be decreasing.
			// If it's an issue, we can change this to be based on the total time from now to the beginning.
			const rateBoost = 1.5;
			return element.contentUpdateTimings.impliedWordLoadRate * rateBoost;
		}

		return 8;
	}

	layout(width: number): void {
		this._currentLayoutWidth = width;
		this._editorPool.inUse.forEach(editor => {
			editor.layout(width);
		});
	}

	renderTemplate(container: HTMLElement): IInteractiveListItemTemplate {
		const templateDisposables = new DisposableStore();
		const rowContainer = dom.append(container, $('.interactive-item-container'));
		const header = dom.append(rowContainer, $('.header'));
		const user = dom.append(header, $('.user'));
		const avatar = dom.append(user, $('.avatar'));
		const username = dom.append(user, $('h3.username'));
		const value = dom.append(rowContainer, $('.value'));
		const elementDisposables = new DisposableStore();

		const contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(rowContainer));
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService]));
		const titleToolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, header, MenuId.InteractiveSessionTitle, {
			menuOptions: {
				shouldForwardArgs: true
			}
		}));


		const template: IInteractiveListItemTemplate = { avatar, username, value, rowContainer, elementDisposables, titleToolbar, templateDisposables, contextKeyService };
		return template;
	}

	renderElement(node: ITreeNode<InteractiveTreeItem, FuzzyScore>, index: number, templateData: IInteractiveListItemTemplate): void {
		const { element } = node;
		const kind = isRequestVM(element) ? 'request' : 'response';
		this.traceLayout('renderElement', `${kind}, index=${index}`);

		interactiveSessionResponseHasProviderId.bindTo(templateData.contextKeyService).set(isResponseVM(element) && !!element.providerResponseId && !element.isPlaceholder);

		templateData.titleToolbar.context = element;

		templateData.rowContainer.classList.toggle('interactive-request', isRequestVM(element));
		templateData.rowContainer.classList.toggle('interactive-response', isResponseVM(element));
		templateData.username.textContent = element.username;

		if (element.avatarIconUri) {
			const avatarIcon = dom.$<HTMLImageElement>('img.icon');
			avatarIcon.src = element.avatarIconUri.toString();
			templateData.avatar.replaceChildren(avatarIcon);
		} else {
			const defaultIcon = isRequestVM(element) ? Codicon.account : Codicon.hubot;
			const avatarIcon = dom.$(ThemeIcon.asCSSSelector(defaultIcon));
			templateData.avatar.replaceChildren(avatarIcon);
		}

		// Do a progressive render if
		// - This the last response in the list
		// - And the response is not complete
		//   - Or, we previously started a progressive rendering of this element (if the element is complete, we will finish progressive rendering with a very fast rate)
		// - And, the feature is not disabled in configuration
		if (isResponseVM(element) && index === this.delegate.getListLength() - 1 && (!element.isComplete || element.renderData) && this.shouldRenderProgressively(element)) {
			this.traceLayout('renderElement', `start progressive render ${kind}, index=${index}`);
			const progressiveRenderingDisposables = templateData.elementDisposables.add(new DisposableStore());
			const timer = templateData.elementDisposables.add(new IntervalTimer());
			const runProgressiveRender = (initial?: boolean) => {
				if (this.doNextProgressiveRender(element, index, templateData, !!initial, progressiveRenderingDisposables)) {
					timer.cancel();
				}
			};
			runProgressiveRender(true);
			timer.cancelAndSet(runProgressiveRender, 100);
		} else if (isResponseVM(element)) {
			this.basicRenderElement(element.response.value, element, index, templateData);
		} else {
			this.basicRenderElement(element.message, element, index, templateData);
		}
	}

	private basicRenderElement(markdownValue: string, element: InteractiveTreeItem, index: number, templateData: IInteractiveListItemTemplate) {
		const result = this.renderMarkdown(new MarkdownString(markdownValue), element, templateData.elementDisposables, templateData);
		dom.clearNode(templateData.value);
		templateData.value.appendChild(result.element);
		templateData.elementDisposables.add(result);

		if (isResponseVM(element) && element.errorDetails) {
			const errorDetails = dom.append(templateData.value, $('.interactive-response-error-details', undefined, renderIcon(Codicon.error)));
			errorDetails.appendChild($('span', undefined, element.errorDetails.message));
		}

		if (isResponseVM(element) && index === this.delegate.getListLength() - 1) {
			const followupsContainer = dom.append(templateData.value, $('.interactive-response-followups'));
			const followups = element.commandFollowups ?? element.followups ?? [];
			followups.forEach(q => this.renderFollowup(followupsContainer, templateData, q));
		}
	}

	private renderFollowup(container: HTMLElement, templateData: IInteractiveListItemTemplate, followup: string | IInteractiveSessionResponseCommandFollowup): void {
		const button = templateData.elementDisposables.add(new Button(container, { ...defaultButtonStyles, supportIcons: typeof followup !== 'string' }));
		const label = typeof followup === 'string' ? `"${followup}"` : followup.title;
		button.label = label;
		if (typeof followup === 'string') {
			// This should probably be a command as well?
			templateData.elementDisposables.add(button.onDidClick(() => this._onDidSelectFollowup.fire(followup)));
		} else {
			templateData.elementDisposables.add(button.onDidClick(() => {
				this.commandService.executeCommand(followup.commandId, ...(followup.args ?? []));
			}));
		}
	}

	private doNextProgressiveRender(element: IInteractiveResponseViewModel, index: number, templateData: IInteractiveListItemTemplate, isInRenderElement: boolean, disposables: DisposableStore): boolean {
		disposables.clear();

		// TODO- this method has the side effect of updating element.renderData
		const toRender = this.getProgressiveMarkdownToRender(element);
		const isFullyRendered = element.renderData?.isFullyRendered;
		if (isFullyRendered) {
			// We've reached the end of the available content, so do a normal render
			this.traceLayout('runProgressiveRender', `end progressive render, index=${index}`);
			if (element.isComplete) {
				this.traceLayout('runProgressiveRender', `and disposing renderData, response is complete, index=${index}`);
				element.renderData = undefined;
			} else {
				this.traceLayout('runProgressiveRender', `Rendered all available words, but model is not complete.`);
			}
			disposables.clear();
			this.basicRenderElement(element.response.value, element, index, templateData);
		} else if (toRender) {
			// Doing the progressive render
			const plusCursor = toRender.match(/```.*$/) ? toRender + `\n${InteractiveListItemRenderer.cursorCharacter}` : toRender + ` ${InteractiveListItemRenderer.cursorCharacter}`;
			const result = this.renderMarkdown(new MarkdownString(plusCursor), element, disposables, templateData, true);
			dom.clearNode(templateData.value);
			templateData.value.appendChild(result.element);
			disposables.add(result);
		} else {
			// Nothing new to render, not done, keep waiting
			return false;
		}

		// Some render happened - update the height
		const height = templateData.rowContainer.offsetHeight;
		element.currentRenderedHeight = height;
		if (!isInRenderElement) {
			this._onDidChangeItemHeight.fire({ element, height: templateData.rowContainer.offsetHeight });
		}

		return !!isFullyRendered;
	}

	private renderMarkdown(markdown: IMarkdownString, element: InteractiveTreeItem, disposables: DisposableStore, templateData: IInteractiveListItemTemplate, fillInIncompleteTokens = false): IMarkdownRenderResult {
		const disposablesList: IDisposable[] = [];
		let codeBlockIndex = 0;

		// TODO if the slash commands stay completely dynamic, this isn't quite right
		const slashCommands = this.delegate.getSlashCommands();
		const usedSlashCommand = slashCommands.find(s => markdown.value.startsWith(`/${s.command} `));
		const toRender = usedSlashCommand ? markdown.value.slice(usedSlashCommand.command.length + 2) : markdown.value;
		markdown = new MarkdownString(toRender);
		const result = this.renderer.render(markdown, {
			fillInIncompleteTokens,
			codeBlockRendererSync: (languageId, text) => {
				const ref = this.renderCodeBlock({ languageId, text, index: codeBlockIndex++, element, parentContextKeyService: templateData.contextKeyService }, disposables);
				disposablesList.push(ref);
				return ref.object.element;
			}
		});

		if (usedSlashCommand) {
			const slashCommandElement = $('span.interactive-slash-command', { title: usedSlashCommand.detail }, `/${usedSlashCommand.command} `);
			if (result.element.firstChild?.nodeName.toLowerCase() === 'p') {
				result.element.firstChild.insertBefore(slashCommandElement, result.element.firstChild.firstChild);
			} else {
				result.element.insertBefore($('p', undefined, slashCommandElement), result.element.firstChild);
			}
		}

		disposablesList.reverse().forEach(d => disposables.add(d));
		return result;
	}

	private renderCodeBlock(data: IInteractiveResultCodeBlockData, disposables: DisposableStore): IDisposableReference<IInteractiveResultCodeBlockPart> {
		const ref = this._editorPool.get();
		const editorInfo = ref.object;
		editorInfo.render(data);

		const layoutEditor = (context: string) => {
			editorInfo.layout(this._currentLayoutWidth);
		};

		layoutEditor('init');

		disposables.add(editorInfo.textModel.onDidChangeContent(() => {
			layoutEditor('textmodel');
		}));

		return ref;
	}

	private getProgressiveMarkdownToRender(element: IInteractiveResponseViewModel): string | undefined {
		const renderData = element.renderData ?? { renderedWordCount: 0, lastRenderTime: 0 };
		const rate = this.getProgressiveRenderRate(element);
		const numWordsToRender = renderData.lastRenderTime === 0 ?
			1 :
			renderData.renderedWordCount +
			// Additional words to render beyond what's already rendered
			Math.floor((Date.now() - renderData.lastRenderTime) / 1000 * rate);

		if (numWordsToRender === renderData.renderedWordCount) {
			return undefined;
		}

		const result = getNWords(element.response.value, numWordsToRender);

		element.renderData = {
			renderedWordCount: result.actualWordCount,
			lastRenderTime: Date.now(),
			isFullyRendered: result.isFullString
		};

		return result.value;
	}

	disposeElement(node: ITreeNode<InteractiveTreeItem, FuzzyScore>, index: number, templateData: IInteractiveListItemTemplate): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: IInteractiveListItemTemplate): void {
		templateData.templateDisposables.dispose();
	}
}

export class InteractiveSessionListDelegate implements IListVirtualDelegate<InteractiveTreeItem> {
	constructor(
		@ILogService private readonly logService: ILogService
	) { }

	private _traceLayout(method: string, message: string) {
		if (forceVerboseLayoutTracing) {
			this.logService.info(`InteractiveSessionListDelegate#${method}: ${message}`);
		} else {
			this.logService.trace(`InteractiveSessionListDelegate#${method}: ${message}`);
		}
	}

	getHeight(element: InteractiveTreeItem): number {
		const kind = isRequestVM(element) ? 'request' : 'response';
		const height = element.currentRenderedHeight ?? 40;
		this._traceLayout('getHeight', `${kind}, height=${height}`);
		return height;
	}

	getTemplateId(element: InteractiveTreeItem): string {
		return InteractiveListItemRenderer.ID;
	}

	hasDynamicHeight(element: InteractiveTreeItem): boolean {
		return true;
	}
}

export class InteractiveSessionAccessibilityProvider implements IListAccessibilityProvider<InteractiveTreeItem> {

	getWidgetAriaLabel(): string {
		return localize('interactiveSession', "Interactive Session");
	}

	getAriaLabel(element: InteractiveTreeItem): string {
		if (isRequestVM(element)) {
			return localize('interactiveRequest', "Request: {0}", element.message);
		}

		if (isResponseVM(element)) {
			return localize('interactiveResponse', "Response: {0}", element.response.value);
		}

		return '';
	}
}

interface IInteractiveResultCodeBlockData {
	text: string;
	languageId: string;
	index: number;
	element: InteractiveTreeItem;
	parentContextKeyService: IContextKeyService;
}

interface IInteractiveResultCodeBlockPart {
	readonly element: HTMLElement;
	readonly textModel: ITextModel;
	layout(width: number): void;
	render(data: IInteractiveResultCodeBlockData): void;
	dispose(): void;
}

class CodeBlockPart extends Disposable implements IInteractiveResultCodeBlockPart {
	private readonly editor: CodeEditorWidget;
	private readonly toolbar: MenuWorkbenchToolBar;
	private readonly contextKeyService: IContextKeyService;

	public readonly textModel: ITextModel;
	public readonly element: HTMLElement;

	constructor(
		private readonly options: InteractiveSessionEditorOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IModelService private readonly modelService: IModelService,
	) {
		super();
		this.element = $('.interactive-result-editor-wrapper');

		this.contextKeyService = this._register(contextKeyService.createScoped(this.element));
		const scopedInstantiationService = instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService]));
		this.toolbar = this._register(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, this.element, MenuId.InteractiveSessionCodeBlock, {
			menuOptions: {
				shouldForwardArgs: true
			}
		}));

		const editorElement = dom.append(this.element, $('.interactive-result-editor'));
		this.editor = this._register(scopedInstantiationService.createInstance(CodeEditorWidget, editorElement, {
			...getSimpleEditorOptions(),
			readOnly: true,
			wordWrap: 'off',
			lineNumbers: 'off',
			selectOnLineNumbers: true,
			scrollBeyondLastLine: false,
			lineDecorationsWidth: 8,
			dragAndDrop: false,
			bracketPairColorization: this.options.configuration.resultEditor.bracketPairColorization,
			padding: { top: 2, bottom: 2 },
			fontFamily: this.options.configuration.resultEditor.fontFamily === 'default' ? EDITOR_FONT_DEFAULTS.fontFamily : this.options.configuration.resultEditor.fontFamily,
			fontSize: this.options.configuration.resultEditor.fontSize,
			fontWeight: this.options.configuration.resultEditor.fontWeight,
			lineHeight: this.options.configuration.resultEditor.lineHeight,
			mouseWheelZoom: false,
			scrollbar: {
				alwaysConsumeMouseWheel: false
			}
		}, {
			isSimpleWidget: false,
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([
				MenuPreventer.ID,
				SelectionClipboardContributionID,
				ContextMenuController.ID,

				WordHighlighterContribution.ID,
				ViewportSemanticTokensContribution.ID,
				BracketMatchingController.ID,
				SmartSelectController.ID,
			])
		}));

		this._register(this.editor.onDidBlurEditorWidget(() => {
			WordHighlighterContribution.get(this.editor)?.stopHighlighting();
		}));
		this._register(this.editor.onDidFocusEditorWidget(() => {
			WordHighlighterContribution.get(this.editor)?.restoreViewState(true);
		}));

		const vscodeLanguageId = this.languageService.getLanguageIdByLanguageName('javascript');
		this.textModel = this._register(this.modelService.createModel('', this.languageService.createById(vscodeLanguageId), undefined));
		this.editor.setModel(this.textModel);
	}

	layout(width: number): void {
		const realContentHeight = this.editor.getContentHeight();
		this.editor.layout({ width, height: realContentHeight });
	}

	render(data: IInteractiveResultCodeBlockData): void {
		this.contextKeyService.updateParent(data.parentContextKeyService);
		this.setText(data.text);
		this.setLanguage(data.languageId);
		this.toolbar.context = <IInteractiveSessionCodeBlockActionContext>{
			code: data.text,
			codeBlockIndex: data.index,
			element: data.element
		};
	}

	private setText(newText: string): void {
		let currentText = this.textModel.getLinesContent().join('\n');
		if (newText === currentText) {
			return;
		}

		let removedChars = 0;
		if (currentText.endsWith(` ${InteractiveListItemRenderer.cursorCharacter}`)) {
			removedChars = 2;
		} else if (currentText.endsWith(InteractiveListItemRenderer.cursorCharacter)) {
			removedChars = 1;
		}

		if (removedChars > 0) {
			currentText = currentText.slice(0, currentText.length - removedChars);
		}

		if (newText.startsWith(currentText)) {
			const text = newText.slice(currentText.length);
			const lastLine = this.textModel.getLineCount();
			const lastCol = this.textModel.getLineMaxColumn(lastLine);
			const insertAtCol = lastCol - removedChars;
			this.textModel.applyEdits([{ range: new Range(lastLine, insertAtCol, lastLine, lastCol), text }]);
		} else {
			// console.log(`Failed to optimize setText`);
			this.textModel.setValue(newText);
		}
	}

	private setLanguage(languageId: string): void {
		const vscodeLanguageId = this.languageService.getLanguageIdByLanguageName(languageId);
		if (vscodeLanguageId) {
			this.textModel.setLanguage(vscodeLanguageId);
		}
	}
}

interface IDisposableReference<T> extends IDisposable {
	object: T;
}

class EditorPool extends Disposable {
	private _pool: ResourcePool<IInteractiveResultCodeBlockPart>;

	public get inUse(): ReadonlySet<IInteractiveResultCodeBlockPart> {
		return this._pool.inUse;
	}

	constructor(
		private readonly options: InteractiveSessionEditorOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this._pool = this._register(new ResourcePool(() => this.editorFactory()));

		// TODO listen to changes on options
	}

	private editorFactory(): IInteractiveResultCodeBlockPart {
		return this.instantiationService.createInstance(CodeBlockPart, this.options);
	}

	get(): IDisposableReference<IInteractiveResultCodeBlockPart> {
		const object = this._pool.get();
		return {
			object,
			dispose: () => this._pool.release(object)
		};
	}
}

// TODO does something in lifecycle.ts cover this?

class ResourcePool<T extends IDisposable> extends Disposable {
	private readonly pool: T[] = [];

	private _inUse = new Set<T>;
	public get inUse(): ReadonlySet<T> {
		return this._inUse;
	}

	constructor(
		private readonly _itemFactory: () => T,
	) {
		super();
	}

	get(): T {
		if (this.pool.length > 0) {
			const item = this.pool.pop()!;
			this._inUse.add(item);
			return item;
		}

		const item = this._register(this._itemFactory());
		this._inUse.add(item);
		return item;
	}

	release(item: T): void {
		this._inUse.delete(item);
		this.pool.push(item);
	}
}
