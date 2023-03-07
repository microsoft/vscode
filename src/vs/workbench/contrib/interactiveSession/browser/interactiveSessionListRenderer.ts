/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
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
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';
import { FloatingClickMenu } from 'vs/workbench/browser/codeeditor';
import { MenuPreventer } from 'vs/workbench/contrib/codeEditor/browser/menuPreventer';
import { SelectionClipboardContributionID } from 'vs/workbench/contrib/codeEditor/browser/selectionClipboard';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { InteractiveSessionEditorOptions } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionOptions';
import { IInteractiveSessionResponseCommandFollowup } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionModel';
import { IInteractiveRequestViewModel, IInteractiveResponseViewModel, isRequestVM, isResponseVM } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionViewModel';

const $ = dom.$;

export type InteractiveTreeItem = IInteractiveRequestViewModel | IInteractiveResponseViewModel;

interface IInteractiveListItemTemplate {
	rowContainer: HTMLElement;
	header: HTMLElement;
	avatar: HTMLElement;
	username: HTMLElement;
	value: HTMLElement;
	elementDisposables: DisposableStore;
}

interface IItemHeightChangeParams {
	element: InteractiveTreeItem;
	height: number;
}

const forceVerboseLayoutTracing = false;

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
		private readonly delegate: { getListLength(): number },
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@ICommandService private readonly commandService: ICommandService,
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
			this.logService.info(`${method}: ${message}`);
		} else {
			this.logService.trace(`${method}: ${message}`);
		}
	}

	private shouldRenderProgressively(element: IInteractiveResponseViewModel): boolean {
		return !this.configService.getValue('interactive.experimental.disableProgressiveRendering') && element.progressiveResponseRenderingEnabled;
	}

	private getProgressiveRenderRate(): number {
		return this.configService.getValue('interactive.experimental.progressiveRenderingRate') ?? 8;
	}

	layout(width: number): void {
		this._currentLayoutWidth = width;
		this._editorPool.inUse.forEach(editor => {
			editor.layout(width);
		});
	}

	renderTemplate(container: HTMLElement): IInteractiveListItemTemplate {
		const rowContainer = dom.append(container, $('.interactive-item-container'));
		const header = dom.append(rowContainer, $('.header'));
		const avatar = dom.append(header, $('.avatar'));
		const username = document.createElement('h3');
		header.appendChild(username);
		const value = dom.append(rowContainer, $('.value'));
		const elementDisposables = new DisposableStore();

		const template: IInteractiveListItemTemplate = { header, avatar, username, value, rowContainer, elementDisposables };
		return template;
	}

	renderElement(node: ITreeNode<InteractiveTreeItem, FuzzyScore>, index: number, templateData: IInteractiveListItemTemplate): void {
		const { element } = node;
		const kind = isRequestVM(element) ? 'request' : 'response';
		this.traceLayout('renderElement', `${kind}, index=${index}`);

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

		if (isResponseVM(element) && index === this.delegate.getListLength() - 1 && (!element.isComplete || element.renderData) && this.shouldRenderProgressively(element)) {
			this.traceLayout('renderElement', `start progressive render ${kind}, index=${index}`);
			const progressiveRenderingDisposables = templateData.elementDisposables.add(new DisposableStore());
			const timer = templateData.elementDisposables.add(new IntervalTimer());
			const runProgressiveRender = () => {
				if (this.doNextProgressiveRender(element, index, templateData, progressiveRenderingDisposables)) {
					timer.cancel();
				}
			};
			runProgressiveRender();
			timer.cancelAndSet(runProgressiveRender, 1000 / this.getProgressiveRenderRate());
		} else if (isResponseVM(element)) {
			this.basicRenderElement(element.response.value, element, index, templateData);
		} else {
			this.basicRenderElement(element.message, element, index, templateData);
		}
	}

	private basicRenderElement(markdownValue: string, element: InteractiveTreeItem, index: number, templateData: IInteractiveListItemTemplate) {
		const result = this.renderMarkdown(element, index, new MarkdownString(markdownValue), templateData.elementDisposables, templateData);
		dom.clearNode(templateData.value);
		templateData.value.appendChild(result.element);
		templateData.elementDisposables.add(result);

		if (isResponseVM(element) && index === this.delegate.getListLength() - 1) {
			const followupsContainer = dom.append(templateData.value, $('.interactive-response-followups'));
			const followups = element.commandFollowups ?? element.followups ?? [];
			followups.forEach(q => this.renderFollowup(followupsContainer, templateData, q));
		}
	}

	private renderFollowup(container: HTMLElement, templateData: IInteractiveListItemTemplate, followup: string | IInteractiveSessionResponseCommandFollowup): void {
		const button = templateData.elementDisposables.add(new Button(container, defaultButtonStyles));
		const label = typeof followup === 'string' ? `"${followup}"` : followup.title;
		button.label = label; // todo icons
		if (typeof followup === 'string') {
			// This should probably be a command as well?
			templateData.elementDisposables.add(button.onDidClick(() => this._onDidSelectFollowup.fire(followup)));
		} else {
			templateData.elementDisposables.add(button.onDidClick(() => {
				this.commandService.executeCommand(followup.commandId, ...(followup.args ?? []));
			}));
		}
	}

	private doNextProgressiveRender(element: IInteractiveResponseViewModel, index: number, templateData: IInteractiveListItemTemplate, disposables: DisposableStore): boolean {
		disposables.clear();
		const toRender = this.getProgressiveMarkdownToRender(element);
		if (toRender) {
			const isFullyRendered = element.renderData?.isFullyRendered;
			if (isFullyRendered) {
				this.traceLayout('runProgressiveRender', `end progressive render, index=${index}`);
				if (element.isComplete) {
					this.traceLayout('runProgressiveRender', `and disposing renderData, response is complete, index=${index}`);
					element.renderData = undefined;
				}
				disposables.clear();
				this.basicRenderElement(element.response.value, element, index, templateData);
			} else {
				const plusCursor = toRender.match(/```.*$/) ? toRender + `\n${InteractiveListItemRenderer.cursorCharacter}` : toRender + ` ${InteractiveListItemRenderer.cursorCharacter}`;
				const result = this.renderMarkdown(element, index, new MarkdownString(plusCursor), disposables, templateData, true);
				dom.clearNode(templateData.value);
				templateData.value.appendChild(result.element);
				disposables.add(result);
			}

			const height = templateData.rowContainer.offsetHeight;
			element.currentRenderedHeight = height;
			this._onDidChangeItemHeight.fire({ element, height: templateData.rowContainer.offsetHeight });
			return !!isFullyRendered;
		}

		return false;
	}

	private renderMarkdown(element: InteractiveTreeItem, index: number, markdown: IMarkdownString, disposables: DisposableStore, templateData: IInteractiveListItemTemplate, fillInIncompleteTokens = false): IMarkdownRenderResult {
		const disposablesList: IDisposable[] = [];
		const result = this.renderer.render(markdown, {
			fillInIncompleteTokens,
			codeBlockRendererSync: (languageId, value) => {
				const editorInfo = this._editorPool.get();
				disposablesList.push(editorInfo);
				editorInfo.setText(value);
				editorInfo.setLanguage(languageId);

				const layoutEditor = (context: string) => {
					editorInfo.layout(this._currentLayoutWidth);
				};

				layoutEditor('init');

				disposables.add(editorInfo.textModel.onDidChangeContent(() => {
					layoutEditor('textmodel');
				}));

				return editorInfo.element;
			}
		});

		disposablesList.reverse().forEach(d => disposables.add(d));
		return result;
	}

	private getProgressiveMarkdownToRender(element: IInteractiveResponseViewModel): string | undefined {
		const renderData = element.renderData ?? { renderPosition: 0, renderTime: 0 };
		const numWordsToRender = renderData.renderTime === 0 ?
			1 :
			renderData.renderPosition + Math.floor((Date.now() - renderData.renderTime) / 1000 * this.getProgressiveRenderRate());

		if (numWordsToRender === renderData.renderPosition) {
			return undefined;
		}

		let wordCount = numWordsToRender;
		let i = 0;
		const wordSeparatorCharPattern = /[\s\|\-]/;
		while (i < element.response.value.length && wordCount > 0) {
			// Consume word separator chars
			while (i < element.response.value.length && element.response.value[i].match(wordSeparatorCharPattern)) {
				i++;
			}

			// Consume word chars
			while (i < element.response.value.length && !element.response.value[i].match(wordSeparatorCharPattern)) {
				i++;
			}

			wordCount--;
		}

		const value = element.response.value.substring(0, i);

		element.renderData = {
			renderPosition: numWordsToRender - wordCount,
			renderTime: Date.now(),
			isFullyRendered: i >= element.response.value.length
		};

		return value;
	}

	disposeElement(node: ITreeNode<InteractiveTreeItem, FuzzyScore>, index: number, templateData: IInteractiveListItemTemplate): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: IInteractiveListItemTemplate): void {
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

interface IInteractiveResultEditorInfo {
	readonly element: HTMLElement;
	readonly textModel: ITextModel;
	layout(width: number): void;
	setLanguage(langugeId: string): void;
	setText(text: string): void;
	dispose(): void;
}

class EditorPool extends Disposable {
	private _pool: ResourcePool<IInteractiveResultEditorInfo>;

	public get inUse(): ReadonlySet<IInteractiveResultEditorInfo> {
		return this._pool.inUse;
	}

	constructor(
		private readonly options: InteractiveSessionEditorOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IModelService private readonly modelService: IModelService,
	) {
		super();
		this._pool = this._register(new ResourcePool(() => this.editorFactory()));

		// TODO listen to changes on options
	}

	private editorFactory(): IInteractiveResultEditorInfo {
		const disposables = new DisposableStore();
		const wrapper = $('.interactive-result-editor-wrapper');
		const editor = disposables.add(this.instantiationService.createInstance(CodeEditorWidget, wrapper, {
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

				ViewportSemanticTokensContribution.ID,
				BracketMatchingController.ID,
				FloatingClickMenu.ID,
				SmartSelectController.ID,
			])
		}));

		const vscodeLanguageId = this.languageService.getLanguageIdByLanguageName('javascript');
		const textModel = disposables.add(this.modelService.createModel('', this.languageService.createById(vscodeLanguageId), undefined));
		editor.setModel(textModel);

		return {
			element: wrapper,
			textModel,
			layout: (width: number) => {
				const realContentHeight = editor.getContentHeight();
				editor.layout({ width, height: realContentHeight });
			},
			setText: (newText: string) => {
				let currentText = textModel.getLinesContent().join('\n');
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
					const lastLine = textModel.getLineCount();
					const lastCol = textModel.getLineMaxColumn(lastLine);
					const insertAtCol = lastCol - removedChars;
					textModel.applyEdits([{ range: new Range(lastLine, insertAtCol, lastLine, lastCol), text }]);
				} else {
					// console.log(`Failed to optimize setText`);
					textModel.setValue(newText);
				}
			},
			setLanguage: (languageId: string) => {
				const vscodeLanguageId = this.languageService.getLanguageIdByLanguageName(languageId);
				if (vscodeLanguageId) {
					textModel.setLanguage(vscodeLanguageId);
				}
			},
			dispose: () => {
				disposables.dispose();
			}
		};
	}

	get(): IInteractiveResultEditorInfo {
		const object = this._pool.get();
		return {
			...object,
			dispose: () => this._pool.release(object)
		};
	}
}

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
