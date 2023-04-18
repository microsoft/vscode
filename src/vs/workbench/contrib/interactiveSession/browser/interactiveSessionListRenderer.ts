/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IActionViewItemOptions } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { renderIcon } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { IAction } from 'vs/base/common/actions';
import { IntervalTimer } from 'vs/base/common/async';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { FileAccess } from 'vs/base/common/network';
import { ThemeIcon } from 'vs/base/common/themables';
import { withNullAsUndefined } from 'vs/base/common/types';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { EDITOR_FONT_DEFAULTS, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { BracketMatchingController } from 'vs/editor/contrib/bracketMatching/browser/bracketMatching';
import { ContextMenuController } from 'vs/editor/contrib/contextmenu/browser/contextmenu';
import { IMarkdownRenderResult, MarkdownRenderer } from 'vs/editor/contrib/markdownRenderer/browser/markdownRenderer';
import { ViewportSemanticTokensContribution } from 'vs/editor/contrib/semanticTokens/browser/viewportSemanticTokens';
import { SmartSelectController } from 'vs/editor/contrib/smartSelect/browser/smartSelect';
import { WordHighlighterContribution } from 'vs/editor/contrib/wordHighlighter/browser/wordHighlighter';
import { localize } from 'vs/nls';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
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
import { InteractiveSessionFollowups } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionFollowups';
import { InteractiveSessionEditorOptions } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionOptions';
import { CONTEXT_RESPONSE_HAS_PROVIDER_ID, CONTEXT_RESPONSE_VOTE } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionContextKeys';
import { IInteractiveSessionReplyFollowup, IInteractiveSessionService, IInteractiveSlashCommand, InteractiveSessionVoteDirection } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { IInteractiveRequestViewModel, IInteractiveResponseViewModel, IInteractiveWelcomeMessageViewModel, isRequestVM, isResponseVM, isWelcomeVM } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionViewModel';
import { IWordCountResult, getNWords } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionWordCounter';

const $ = dom.$;

export type InteractiveTreeItem = IInteractiveRequestViewModel | IInteractiveResponseViewModel | IInteractiveWelcomeMessageViewModel;

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

	protected readonly _onDidClickFollowup = this._register(new Emitter<IInteractiveSessionReplyFollowup>());
	readonly onDidClickFollowup: Event<IInteractiveSessionReplyFollowup> = this._onDidClickFollowup.event;

	protected readonly _onDidChangeItemHeight = this._register(new Emitter<IItemHeightChangeParams>());
	readonly onDidChangeItemHeight: Event<IItemHeightChangeParams> = this._onDidChangeItemHeight.event;

	private readonly _editorPool: EditorPool;

	private _currentLayoutWidth: number = 0;
	private _isVisible = true;

	constructor(
		private readonly editorOptions: InteractiveSessionEditorOptions,
		private readonly delegate: IInteractiveSessionRendererDelegate,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@ICommandService private readonly commandService: ICommandService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInteractiveSessionService private readonly interactiveSessionService: IInteractiveSessionService,
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

	private progressiveRenderEnabled(): boolean {
		return !this.configService.getValue('interactive.experimental.disableProgressiveRendering');
	}

	private getProgressiveRenderRate(element: IInteractiveResponseViewModel): number {
		const configuredRate = this.configService.getValue('interactive.experimental.progressiveRenderingRate');
		if (typeof configuredRate === 'number') {
			return configuredRate;
		}

		if (element.isComplete) {
			return 60;
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

	setVisible(visible: boolean): void {
		this._isVisible = visible;
	}

	layout(width: number): void {
		this._currentLayoutWidth = width - 40; // TODO Padding
		this._editorPool.inUse.forEach(editor => {
			editor.layout(this._currentLayoutWidth);
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
			},
			actionViewItemProvider: (action: IAction, options: IActionViewItemOptions) => {
				if (action instanceof MenuItemAction) {
					return scopedInstantiationService.createInstance(InteractiveSessionVoteButton, action, options as IMenuEntryActionViewItemOptions);
				}

				return undefined;
			}
		}));


		const template: IInteractiveListItemTemplate = { avatar, username, value, rowContainer, elementDisposables, titleToolbar, templateDisposables, contextKeyService };
		return template;
	}

	renderElement(node: ITreeNode<InteractiveTreeItem, FuzzyScore>, index: number, templateData: IInteractiveListItemTemplate): void {
		const { element } = node;
		const kind = isRequestVM(element) ? 'request' :
			isResponseVM(element) ? 'response' :
				'welcome';
		this.traceLayout('renderElement', `${kind}, index=${index}`);

		CONTEXT_RESPONSE_HAS_PROVIDER_ID.bindTo(templateData.contextKeyService).set(isResponseVM(element) && !!element.providerResponseId);
		if (isResponseVM(element)) {
			CONTEXT_RESPONSE_VOTE.bindTo(templateData.contextKeyService).set(element.vote === InteractiveSessionVoteDirection.Up ? 'up' : element.vote === InteractiveSessionVoteDirection.Down ? 'down' : '');
		} else {
			CONTEXT_RESPONSE_VOTE.bindTo(templateData.contextKeyService).set('');
		}

		templateData.titleToolbar.context = element;

		templateData.rowContainer.classList.toggle('interactive-request', isRequestVM(element));
		templateData.rowContainer.classList.toggle('interactive-response', isResponseVM(element));
		templateData.rowContainer.classList.toggle('interactive-welcome', isWelcomeVM(element));
		templateData.rowContainer.classList.toggle('filtered-response', !!(isResponseVM(element) && element.errorDetails?.responseIsFiltered));
		templateData.username.textContent = element.username;

		if (element.avatarIconUri) {
			const avatarIcon = dom.$<HTMLImageElement>('img.icon');
			avatarIcon.src = FileAccess.uriToBrowserUri(element.avatarIconUri).toString(true);
			templateData.avatar.replaceChildren(avatarIcon);
		} else {
			const defaultIcon = isRequestVM(element) ? Codicon.account : Codicon.hubot;
			const avatarIcon = dom.$(ThemeIcon.asCSSSelector(defaultIcon));
			templateData.avatar.replaceChildren(avatarIcon);
		}

		// Do a progressive render if
		// - This the last response in the list
		// - And it is not a placeholder response ("Thinking...")
		// - And the response is not complete
		//   - Or, we previously started a progressive rendering of this element (if the element is complete, we will finish progressive rendering with a very fast rate)
		// - And, the feature is not disabled in configuration
		if (isResponseVM(element) && index === this.delegate.getListLength() - 1 && !element.isPlaceholder && (!element.isComplete || element.renderData) && this.progressiveRenderEnabled()) {
			this.traceLayout('renderElement', `start progressive render ${kind}, index=${index}`);
			const progressiveRenderingDisposables = templateData.elementDisposables.add(new DisposableStore());
			const timer = templateData.elementDisposables.add(new IntervalTimer());
			const runProgressiveRender = (initial?: boolean) => {
				try {
					if (this.doNextProgressiveRender(element, index, templateData, !!initial, progressiveRenderingDisposables)) {
						timer.cancel();
					}
				} catch (err) {
					// Kill the timer if anything went wrong, avoid getting stuck in a nasty rendering loop.
					timer.cancel();
					throw err;
				}
			};
			timer.cancelAndSet(runProgressiveRender, 50);
			runProgressiveRender(true);
		} else if (isResponseVM(element)) {
			this.basicRenderElement(element.response.value, element, index, templateData);
		} else if (isRequestVM(element)) {
			this.basicRenderElement(element.messageText, element, index, templateData);
		} else {
			this.renderWelcomeMessage(element, templateData);
		}
	}

	private basicRenderElement(markdownValue: string, element: InteractiveTreeItem, index: number, templateData: IInteractiveListItemTemplate) {
		const fillInIncompleteTokens = isResponseVM(element) && (!element.isComplete || element.isCanceled || element.errorDetails?.responseIsFiltered || element.errorDetails?.responseIsIncomplete);
		const result = this.renderMarkdown(new MarkdownString(markdownValue), element, templateData.elementDisposables, templateData, fillInIncompleteTokens);
		dom.clearNode(templateData.value);
		templateData.value.appendChild(result.element);
		templateData.elementDisposables.add(result);

		if (isResponseVM(element) && element.errorDetails?.message) {
			const icon = element.errorDetails.responseIsFiltered ? Codicon.info : Codicon.error;
			const errorDetails = dom.append(templateData.value, $('.interactive-response-error-details', undefined, renderIcon(icon)));
			errorDetails.appendChild($('span', undefined, element.errorDetails.message));
		}

		if (isResponseVM(element) && element.commandFollowups?.length) {
			const followupsContainer = dom.append(templateData.value, $('.interactive-response-followups'));
			templateData.elementDisposables.add(new InteractiveSessionFollowups(
				followupsContainer,
				element.commandFollowups,
				defaultButtonStyles,
				followup => {
					this.interactiveSessionService.notifyUserAction({
						providerId: element.providerId,
						action: {
							kind: 'command',
							command: followup
						}
					});
					return this.commandService.executeCommand(followup.commandId, ...(followup.args ?? []));
				}));
		}
	}

	private renderWelcomeMessage(element: IInteractiveWelcomeMessageViewModel, templateData: IInteractiveListItemTemplate) {
		dom.clearNode(templateData.value);
		const slashCommands = this.delegate.getSlashCommands();

		for (const item of element.content) {
			if (Array.isArray(item)) {
				templateData.elementDisposables.add(new InteractiveSessionFollowups(
					templateData.value,
					item,
					undefined,
					followup => this._onDidClickFollowup.fire(followup)));
			} else {
				const result = this.renderMarkdown(item as IMarkdownString, element, templateData.elementDisposables, templateData);
				for (const codeElement of result.element.querySelectorAll('code')) {
					if (codeElement.textContent && slashCommands.find(command => codeElement.textContent === `/${command.command}`)) {
						codeElement.classList.add('interactive-slash-command');
					}
				}
				templateData.value.appendChild(result.element);
				templateData.elementDisposables.add(result);
			}
		}
	}

	/**
	 *	@returns true if progressive rendering should be considered complete- the element's data is fully rendered or the view is not visible
	 */
	private doNextProgressiveRender(element: IInteractiveResponseViewModel, index: number, templateData: IInteractiveListItemTemplate, isInRenderElement: boolean, disposables: DisposableStore): boolean {
		if (!this._isVisible) {
			return true;
		}

		disposables.clear();

		let isFullyRendered = false;
		if (element.isCanceled) {
			this.traceLayout('runProgressiveRender', `canceled, index=${index}`);
			element.renderData = undefined;
			this.basicRenderElement(element.response.value, element, index, templateData);
			isFullyRendered = true;
		} else {
			const renderValue = this.getWordsForProgressiveRender(element);
			isFullyRendered = !!element.renderData?.isFullyRendered;
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
			} else if (renderValue) {
				element.renderData = {
					renderedWordCount: renderValue.actualWordCount,
					lastRenderTime: Date.now(),
					isFullyRendered: renderValue.isFullString
				};

				// Don't add the cursor if it will go after a codeblock, since this will always cause layout shifting
				// when the codeblock is the last thing in the response, and that happens often.
				const plusCursor = renderValue.value.match(/```\s*$/) ?
					renderValue.value :
					renderValue.value + ` ${InteractiveListItemRenderer.cursorCharacter}`;
				const result = this.renderMarkdown(new MarkdownString(plusCursor), element, disposables, templateData, true);
				// Doing the progressive render
				dom.clearNode(templateData.value);
				templateData.value.appendChild(result.element);
				disposables.add(result);
			} else {
				// Nothing new to render, not done, keep waiting
				return false;
			}
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
				const ref = this.renderCodeBlock({ languageId, text, codeBlockIndex: codeBlockIndex++, element, parentContextKeyService: templateData.contextKeyService }, disposables);

				// Attach this after updating text/layout of the editor, so it should only be fired when the size updates later (horizontal scrollbar, wrapping)
				// not during a renderElement OR a progressive render (when we will be firing this event anyway at the end of the render)
				disposables.add(ref.object.onDidChangeContentHeight(() => {
					ref.object.layout(this._currentLayoutWidth);
					this._onDidChangeItemHeight.fire({ element, height: templateData.rowContainer.offsetHeight });
				}));

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
		editorInfo.render(data, this._currentLayoutWidth);

		return ref;
	}

	private getWordsForProgressiveRender(element: IInteractiveResponseViewModel): IWordCountResult | undefined {
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

		return getNWords(element.response.value, numWordsToRender);
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
		const height = ('currentRenderedHeight' in element ? element.currentRenderedHeight : undefined) ?? 200;
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
			return element.messageText;
		}

		if (isResponseVM(element)) {
			return element.response.value;
		}

		if (isWelcomeVM(element)) {
			return element.content.map(c => 'value' in c ? c.value : c.map(followup => followup.message).join('\n')).join('\n');
		}

		return '';
	}
}

interface IInteractiveResultCodeBlockData {
	text: string;
	languageId: string;
	codeBlockIndex: number;
	element: InteractiveTreeItem;
	parentContextKeyService: IContextKeyService;
}

interface IInteractiveResultCodeBlockPart {
	readonly onDidChangeContentHeight: Event<number>;
	readonly element: HTMLElement;
	readonly textModel: ITextModel;
	layout(width: number): void;
	render(data: IInteractiveResultCodeBlockData, width: number): void;
	dispose(): void;
}

export interface IInteractiveResultCodeBlockInfo {
	providerId: string;
	responseId: string;
	codeBlockIndex: number;
}

export const codeBlockInfosByModelUri = new ResourceMap<IInteractiveResultCodeBlockInfo>();

const defaultCodeblockPadding = 10;

class CodeBlockPart extends Disposable implements IInteractiveResultCodeBlockPart {
	private readonly _onDidChangeContentHeight = this._register(new Emitter<number>());
	public readonly onDidChangeContentHeight = this._onDidChangeContentHeight.event;

	private readonly editor: CodeEditorWidget;
	private readonly toolbar: MenuWorkbenchToolBar;
	private readonly contextKeyService: IContextKeyService;

	public readonly textModel: ITextModel;
	public readonly element: HTMLElement;

	private currentScrollWidth = 0;

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
			lineNumbers: 'off',
			selectOnLineNumbers: true,
			scrollBeyondLastLine: false,
			lineDecorationsWidth: 8,
			dragAndDrop: false,
			padding: { top: defaultCodeblockPadding, bottom: defaultCodeblockPadding },
			mouseWheelZoom: false,
			scrollbar: {
				alwaysConsumeMouseWheel: false
			},
			...this.getEditorOptionsFromConfig()
		}, {
			isSimpleWidget: true,
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


		this._register(this.options.onDidChange(() => {
			this.editor.updateOptions(this.getEditorOptionsFromConfig());
		}));

		this._register(this.editor.onDidScrollChange(e => {
			this.currentScrollWidth = e.scrollWidth;
		}));
		this._register(this.editor.onDidContentSizeChange(e => {
			if (e.contentHeightChanged) {
				this._onDidChangeContentHeight.fire(e.contentHeight);
			}
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

	private updatePaddingForLayout() {
		// scrollWidth = "the width of the content that needs to be scrolled"
		// contentWidth = "the width of the area where content is displayed"
		const horizontalScrollbarVisible = this.currentScrollWidth > this.editor.getLayoutInfo().contentWidth;
		const scrollbarHeight = this.editor.getLayoutInfo().horizontalScrollbarHeight;
		const bottomPadding = horizontalScrollbarVisible ?
			Math.max(defaultCodeblockPadding - scrollbarHeight, 2) :
			defaultCodeblockPadding;
		this.editor.updateOptions({ padding: { top: defaultCodeblockPadding, bottom: bottomPadding } });
	}

	private getEditorOptionsFromConfig(): IEditorOptions {
		return {
			wordWrap: this.options.configuration.resultEditor.wordWrap,
			fontLigatures: this.options.configuration.resultEditor.fontLigatures,
			bracketPairColorization: this.options.configuration.resultEditor.bracketPairColorization,
			fontFamily: this.options.configuration.resultEditor.fontFamily === 'default' ?
				EDITOR_FONT_DEFAULTS.fontFamily :
				this.options.configuration.resultEditor.fontFamily,
			fontSize: this.options.configuration.resultEditor.fontSize,
			fontWeight: this.options.configuration.resultEditor.fontWeight,
			lineHeight: this.options.configuration.resultEditor.lineHeight,
		};
	}

	layout(width: number): void {
		const realContentHeight = this.editor.getContentHeight();
		const editorBorder = 2;
		this.editor.layout({ width: width - editorBorder, height: realContentHeight });
		this.updatePaddingForLayout();
	}

	render(data: IInteractiveResultCodeBlockData, width: number): void {
		this.contextKeyService.updateParent(data.parentContextKeyService);

		if (this.options.configuration.resultEditor.wordWrap === 'on') {
			// Intialize the editor with the new proper width so that getContentHeight
			// will be computed correctly in the next call to layout()
			this.layout(width);
		}

		const text = this.fixCodeText(data.text, data.languageId);
		this.setText(text);

		const vscodeLanguageId = withNullAsUndefined(this.languageService.getLanguageIdByLanguageName(data.languageId));
		this.setLanguage(vscodeLanguageId);

		this.layout(width);

		if (isResponseVM(data.element) && data.element.providerResponseId) {
			// For telemetry reporting
			codeBlockInfosByModelUri.set(this.textModel.uri, {
				providerId: data.element.providerId,
				responseId: data.element.providerResponseId,
				codeBlockIndex: data.codeBlockIndex
			});
		} else {
			codeBlockInfosByModelUri.delete(this.textModel.uri);
		}

		this.toolbar.context = <IInteractiveSessionCodeBlockActionContext>{
			code: data.text,
			codeBlockIndex: data.codeBlockIndex,
			element: data.element,
			languageId: vscodeLanguageId
		};
	}

	private fixCodeText(text: string, languageId: string): string {
		if (languageId === 'php') {
			if (!text.trim().startsWith('<')) {
				return `<?php\n${text}\n?>`;
			}
		}

		return text;
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

	private setLanguage(vscodeLanguageId: string | undefined): void {
		this.textModel.setLanguage(vscodeLanguageId ?? PLAINTEXT_LANGUAGE_ID);
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

class InteractiveSessionVoteButton extends MenuEntryActionViewItem {
	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.toggle('checked', this.action.checked);
	}
}
