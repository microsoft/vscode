/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/suggest';
import * as nls from 'vs/nls';
import { createMatches } from 'vs/base/common/filters';
import * as strings from 'vs/base/common/strings';
import { Event, Emitter } from 'vs/base/common/event';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable, dispose, toDisposable, DisposableStore, Disposable } from 'vs/base/common/lifecycle';
import { addClass, append, $, hide, removeClass, show, toggleClass, getDomNodePagePosition, hasClass, addDisposableListener } from 'vs/base/browser/dom';
import { IListVirtualDelegate, IListEvent, IListRenderer, IListMouseEvent } from 'vs/base/browser/ui/list/list';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationChangedEvent } from 'vs/editor/common/config/editorOptions';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { Context as SuggestContext, CompletionItem } from './suggest';
import { CompletionModel } from './completionModel';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { attachListStyler } from 'vs/platform/theme/common/styler';
import { IThemeService, ITheme, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { registerColor, editorWidgetBackground, listFocusBackground, activeContrastBorder, listHighlightForeground, editorForeground, editorWidgetBorder, focusBorder, textLinkForeground, textCodeBlockBackground } from 'vs/platform/theme/common/colorRegistry';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { MarkdownRenderer } from 'vs/editor/contrib/markdown/markdownRenderer';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { TimeoutTimer, CancelablePromise, createCancelablePromise, disposableTimeout } from 'vs/base/common/async';
import { CompletionItemKind, completionKindToCssClass } from 'vs/editor/common/modes';
import { IconLabel, IIconLabelValueOptions } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { IModelService } from 'vs/editor/common/services/modelService';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { FileKind } from 'vs/platform/files/common/files';
import { MarkdownString } from 'vs/base/common/htmlContent';

const expandSuggestionDocsByDefault = false;

interface ISuggestionTemplateData {
	root: HTMLElement;
	icon: HTMLElement;
	colorspan: HTMLElement;
	iconLabel: IconLabel;
	typeLabel: HTMLElement;
	readMore: HTMLElement;
	disposables: DisposableStore;
}

/**
 * Suggest widget colors
 */
export const editorSuggestWidgetBackground = registerColor('editorSuggestWidget.background', { dark: editorWidgetBackground, light: editorWidgetBackground, hc: editorWidgetBackground }, nls.localize('editorSuggestWidgetBackground', 'Background color of the suggest widget.'));
export const editorSuggestWidgetBorder = registerColor('editorSuggestWidget.border', { dark: editorWidgetBorder, light: editorWidgetBorder, hc: editorWidgetBorder }, nls.localize('editorSuggestWidgetBorder', 'Border color of the suggest widget.'));
export const editorSuggestWidgetForeground = registerColor('editorSuggestWidget.foreground', { dark: editorForeground, light: editorForeground, hc: editorForeground }, nls.localize('editorSuggestWidgetForeground', 'Foreground color of the suggest widget.'));
export const editorSuggestWidgetSelectedBackground = registerColor('editorSuggestWidget.selectedBackground', { dark: listFocusBackground, light: listFocusBackground, hc: listFocusBackground }, nls.localize('editorSuggestWidgetSelectedBackground', 'Background color of the selected entry in the suggest widget.'));
export const editorSuggestWidgetHighlightForeground = registerColor('editorSuggestWidget.highlightForeground', { dark: listHighlightForeground, light: listHighlightForeground, hc: listHighlightForeground }, nls.localize('editorSuggestWidgetHighlightForeground', 'Color of the match highlights in the suggest widget.'));


const colorRegExp = /^(#([\da-f]{3}){1,2}|(rgb|hsl)a\(\s*(\d{1,3}%?\s*,\s*){3}(1|0?\.\d+)\)|(rgb|hsl)\(\s*\d{1,3}%?(\s*,\s*\d{1,3}%?){2}\s*\))$/i;
function extractColor(item: CompletionItem, out: string[]): boolean {
	if (item.completion.label.match(colorRegExp)) {
		out[0] = item.completion.label;
		return true;
	}
	if (typeof item.completion.documentation === 'string' && item.completion.documentation.match(colorRegExp)) {
		out[0] = item.completion.documentation;
		return true;
	}
	return false;
}

function canExpandCompletionItem(item: CompletionItem | null) {
	if (!item) {
		return false;
	}
	const suggestion = item.completion;
	if (suggestion.documentation) {
		return true;
	}
	return (suggestion.detail && suggestion.detail !== suggestion.label);
}

class Renderer implements IListRenderer<CompletionItem, ISuggestionTemplateData> {

	constructor(
		private widget: SuggestWidget,
		private editor: ICodeEditor,
		private triggerKeybindingLabel: string,
		@IModelService private readonly _modelService: IModelService,
		@IModeService private readonly _modeService: IModeService,
		@IThemeService private readonly _themeService: IThemeService,
	) {

	}

	get templateId(): string {
		return 'suggestion';
	}

	renderTemplate(container: HTMLElement): ISuggestionTemplateData {
		const data = <ISuggestionTemplateData>Object.create(null);
		data.disposables = new DisposableStore();

		data.root = container;
		addClass(data.root, 'show-file-icons');

		data.icon = append(container, $('.icon'));
		data.colorspan = append(data.icon, $('span.colorspan'));

		const text = append(container, $('.contents'));
		const main = append(text, $('.main'));

		data.iconLabel = new IconLabel(main, { supportHighlights: true, supportOcticons: true });
		data.disposables.add(data.iconLabel);

		data.typeLabel = append(main, $('span.type-label'));

		data.readMore = append(main, $('span.readMore'));
		data.readMore.title = nls.localize('readMore', "Read More...{0}", this.triggerKeybindingLabel);

		const configureFont = () => {
			const configuration = this.editor.getConfiguration();
			const fontFamily = configuration.fontInfo.fontFamily;
			const fontSize = configuration.contribInfo.suggestFontSize || configuration.fontInfo.fontSize;
			const lineHeight = configuration.contribInfo.suggestLineHeight || configuration.fontInfo.lineHeight;
			const fontWeight = configuration.fontInfo.fontWeight;
			const fontSizePx = `${fontSize}px`;
			const lineHeightPx = `${lineHeight}px`;

			data.root.style.fontSize = fontSizePx;
			data.root.style.fontWeight = fontWeight;
			main.style.fontFamily = fontFamily;
			main.style.lineHeight = lineHeightPx;
			data.icon.style.height = lineHeightPx;
			data.icon.style.width = lineHeightPx;
			data.readMore.style.height = lineHeightPx;
			data.readMore.style.width = lineHeightPx;
		};

		configureFont();

		data.disposables.add(Event.chain<IConfigurationChangedEvent>(this.editor.onDidChangeConfiguration.bind(this.editor))
			.filter(e => e.fontInfo || e.contribInfo)
			.on(configureFont, null));

		return data;
	}

	renderElement(element: CompletionItem, _index: number, templateData: ISuggestionTemplateData): void {
		const data = <ISuggestionTemplateData>templateData;
		const suggestion = (<CompletionItem>element).completion;

		data.icon.className = 'icon ' + completionKindToCssClass(suggestion.kind);
		data.colorspan.style.backgroundColor = '';


		const labelOptions: IIconLabelValueOptions = {
			labelEscapeNewLines: true,
			matches: createMatches(element.score)
		};

		let color: string[] = [];
		if (suggestion.kind === CompletionItemKind.Color && extractColor(element, color)) {
			// special logic for 'color' completion items
			data.icon.className = 'icon customcolor';
			data.colorspan.style.backgroundColor = color[0];

		} else if (suggestion.kind === CompletionItemKind.File && this._themeService.getIconTheme().hasFileIcons) {
			// special logic for 'file' completion items
			data.icon.className = 'icon hide';
			labelOptions.extraClasses = ([] as string[]).concat(
				getIconClasses(this._modelService, this._modeService, URI.from({ scheme: 'fake', path: suggestion.label }), FileKind.FILE),
				getIconClasses(this._modelService, this._modeService, URI.from({ scheme: 'fake', path: suggestion.detail }), FileKind.FILE)
			);

		} else if (suggestion.kind === CompletionItemKind.Folder && this._themeService.getIconTheme().hasFolderIcons) {
			// special logic for 'folder' completion items
			data.icon.className = 'icon hide';
			labelOptions.extraClasses = ([] as string[]).concat(
				getIconClasses(this._modelService, this._modeService, URI.from({ scheme: 'fake', path: suggestion.label }), FileKind.FOLDER),
				getIconClasses(this._modelService, this._modeService, URI.from({ scheme: 'fake', path: suggestion.detail }), FileKind.FOLDER)
			);
		} else {
			// normal icon
			data.icon.className = 'icon hide';
			labelOptions.extraClasses = [
				`suggest-icon ${completionKindToCssClass(suggestion.kind)}`
			];
		}

		data.iconLabel.setLabel(suggestion.label, undefined, labelOptions);
		data.typeLabel.textContent = (suggestion.detail || '').replace(/\n.*$/m, '');

		if (canExpandCompletionItem(element)) {
			show(data.readMore);
			data.readMore.onmousedown = e => {
				e.stopPropagation();
				e.preventDefault();
			};
			data.readMore.onclick = e => {
				e.stopPropagation();
				e.preventDefault();
				this.widget.toggleDetails();
			};
		} else {
			hide(data.readMore);
			data.readMore.onmousedown = null;
			data.readMore.onclick = null;
		}
	}

	disposeTemplate(templateData: ISuggestionTemplateData): void {
		templateData.disposables.dispose();
	}
}

const enum State {
	Hidden,
	Loading,
	Empty,
	Open,
	Frozen,
	Details
}


class SuggestionDetails {

	private el: HTMLElement;
	private close: HTMLElement;
	private scrollbar: DomScrollableElement;
	private body: HTMLElement;
	private header: HTMLElement;
	private type: HTMLElement;
	private docs: HTMLElement;
	private ariaLabel: string | null;
	private readonly disposables: DisposableStore;
	private renderDisposeable?: IDisposable;
	private borderWidth: number = 1;

	constructor(
		container: HTMLElement,
		private readonly widget: SuggestWidget,
		private readonly editor: ICodeEditor,
		private readonly markdownRenderer: MarkdownRenderer,
		private readonly triggerKeybindingLabel: string,
	) {
		this.disposables = new DisposableStore();

		this.el = append(container, $('.details'));
		this.disposables.add(toDisposable(() => container.removeChild(this.el)));

		this.body = $('.body');

		this.scrollbar = new DomScrollableElement(this.body, {});
		append(this.el, this.scrollbar.getDomNode());
		this.disposables.add(this.scrollbar);

		this.header = append(this.body, $('.header'));
		this.close = append(this.header, $('span.close'));
		this.close.title = nls.localize('readLess', "Read less...{0}", this.triggerKeybindingLabel);
		this.type = append(this.header, $('p.type'));

		this.docs = append(this.body, $('p.docs'));
		this.ariaLabel = null;

		this.configureFont();

		Event.chain<IConfigurationChangedEvent>(this.editor.onDidChangeConfiguration.bind(this.editor))
			.filter(e => e.fontInfo)
			.on(this.configureFont, this, this.disposables);

		markdownRenderer.onDidRenderCodeBlock(() => this.scrollbar.scanDomNode(), this, this.disposables);
	}

	get element() {
		return this.el;
	}

	renderLoading(): void {
		this.type.textContent = nls.localize('loading', "Loading...");
		this.docs.textContent = '';
	}

	renderItem(item: CompletionItem, explainMode: boolean): void {
		this.renderDisposeable = dispose(this.renderDisposeable);

		let { documentation, detail } = item.completion;
		// --- documentation

		if (explainMode) {
			let md = '';
			md += `score: ${item.score[0]}${item.word ? `, compared '${item.completion.filterText && (item.completion.filterText + ' (filterText)') || item.completion.label}' with '${item.word}'` : ' (no prefix)'}\n`;
			md += `distance: ${item.distance}, see localityBonus-setting\n`;
			md += `index: ${item.idx}, based on ${item.completion.sortText && `sortText: "${item.completion.sortText}"` || 'label'}\n`;
			documentation = new MarkdownString().appendCodeblock('empty', md);
			detail = `Provider: ${item.provider._debugDisplayName}`;
		}

		if (!explainMode && !canExpandCompletionItem(item)) {
			this.type.textContent = '';
			this.docs.textContent = '';
			addClass(this.el, 'no-docs');
			this.ariaLabel = null;
			return;
		}
		removeClass(this.el, 'no-docs');
		if (typeof documentation === 'string') {
			removeClass(this.docs, 'markdown-docs');
			this.docs.textContent = documentation;
		} else {
			addClass(this.docs, 'markdown-docs');
			this.docs.innerHTML = '';
			const renderedContents = this.markdownRenderer.render(documentation);
			this.renderDisposeable = renderedContents;
			this.docs.appendChild(renderedContents.element);
		}

		// --- details
		if (detail) {
			this.type.innerText = detail;
			show(this.type);
		} else {
			this.type.innerText = '';
			hide(this.type);
		}

		this.el.style.height = this.header.offsetHeight + this.docs.offsetHeight + (this.borderWidth * 2) + 'px';

		this.close.onmousedown = e => {
			e.preventDefault();
			e.stopPropagation();
		};
		this.close.onclick = e => {
			e.preventDefault();
			e.stopPropagation();
			this.widget.toggleDetails();
		};

		this.body.scrollTop = 0;
		this.scrollbar.scanDomNode();

		this.ariaLabel = strings.format(
			'{0}{1}',
			detail || '',
			documentation ? (typeof documentation === 'string' ? documentation : documentation.value) : '');
	}

	getAriaLabel() {
		return this.ariaLabel;
	}

	scrollDown(much = 8): void {
		this.body.scrollTop += much;
	}

	scrollUp(much = 8): void {
		this.body.scrollTop -= much;
	}

	scrollTop(): void {
		this.body.scrollTop = 0;
	}

	scrollBottom(): void {
		this.body.scrollTop = this.body.scrollHeight;
	}

	pageDown(): void {
		this.scrollDown(80);
	}

	pageUp(): void {
		this.scrollUp(80);
	}

	setBorderWidth(width: number): void {
		this.borderWidth = width;
	}

	private configureFont() {
		const configuration = this.editor.getConfiguration();
		const fontFamily = configuration.fontInfo.fontFamily;
		const fontSize = configuration.contribInfo.suggestFontSize || configuration.fontInfo.fontSize;
		const lineHeight = configuration.contribInfo.suggestLineHeight || configuration.fontInfo.lineHeight;
		const fontWeight = configuration.fontInfo.fontWeight;
		const fontSizePx = `${fontSize}px`;
		const lineHeightPx = `${lineHeight}px`;

		this.el.style.fontSize = fontSizePx;
		this.el.style.fontWeight = fontWeight;
		this.type.style.fontFamily = fontFamily;
		this.close.style.height = lineHeightPx;
		this.close.style.width = lineHeightPx;
	}

	dispose(): void {
		this.disposables.dispose();
		this.renderDisposeable = dispose(this.renderDisposeable);
	}
}

export interface ISelectedSuggestion {
	item: CompletionItem;
	index: number;
	model: CompletionModel;
}

export class SuggestWidget implements IContentWidget, IListVirtualDelegate<CompletionItem>, IDisposable {

	private static readonly ID: string = 'editor.widget.suggestWidget';

	static LOADING_MESSAGE: string = nls.localize('suggestWidget.loading', "Loading...");
	static NO_SUGGESTIONS_MESSAGE: string = nls.localize('suggestWidget.noSuggestions', "No suggestions.");

	// Editor.IContentWidget.allowEditorOverflow
	readonly allowEditorOverflow = true;
	readonly suppressMouseDown = true;

	private state: State | null = null;
	private isAuto: boolean = false;
	private loadingTimeout: IDisposable = Disposable.None;
	private currentSuggestionDetails: CancelablePromise<void> | null = null;
	private focusedItem: CompletionItem | null;
	private ignoreFocusEvents: boolean = false;
	private completionModel: CompletionModel | null = null;

	private element: HTMLElement;
	private messageElement: HTMLElement;
	private listElement: HTMLElement;
	private details: SuggestionDetails;
	private list: List<CompletionItem>;
	private listHeight?: number;

	private readonly suggestWidgetVisible: IContextKey<boolean>;
	private readonly suggestWidgetMultipleSuggestions: IContextKey<boolean>;

	private readonly showTimeout = new TimeoutTimer();
	private readonly toDispose = new DisposableStore();

	private onDidSelectEmitter = new Emitter<ISelectedSuggestion>();
	private onDidFocusEmitter = new Emitter<ISelectedSuggestion>();
	private onDidHideEmitter = new Emitter<this>();
	private onDidShowEmitter = new Emitter<this>();

	readonly onDidSelect: Event<ISelectedSuggestion> = this.onDidSelectEmitter.event;
	readonly onDidFocus: Event<ISelectedSuggestion> = this.onDidFocusEmitter.event;
	readonly onDidHide: Event<this> = this.onDidHideEmitter.event;
	readonly onDidShow: Event<this> = this.onDidShowEmitter.event;

	private readonly maxWidgetWidth = 660;
	private readonly listWidth = 330;
	private readonly storageService: IStorageService;
	private detailsFocusBorderColor?: string;
	private detailsBorderColor?: string;

	private firstFocusInCurrentList: boolean = false;

	private preferDocPositionTop: boolean = false;
	private docsPositionPreviousWidgetY: number | null = null;
	private explainMode: boolean = false;

	constructor(
		private readonly editor: ICodeEditor,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IModeService modeService: IModeService,
		@IOpenerService openerService: IOpenerService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		const kb = keybindingService.lookupKeybinding('editor.action.triggerSuggest');
		const triggerKeybindingLabel = !kb ? '' : ` (${kb.getLabel()})`;
		const markdownRenderer = this.toDispose.add(new MarkdownRenderer(editor, modeService, openerService));

		this.isAuto = false;
		this.focusedItem = null;
		this.storageService = storageService;

		this.element = $('.editor-widget.suggest-widget');
		this.toDispose.add(addDisposableListener(this.element, 'click', e => {
			if (e.target === this.element) {
				this.hideWidget();
			}
		}));

		this.messageElement = append(this.element, $('.message'));
		this.listElement = append(this.element, $('.tree'));
		this.details = instantiationService.createInstance(SuggestionDetails, this.element, this, this.editor, markdownRenderer, triggerKeybindingLabel);

		const applyIconStyle = () => toggleClass(this.element, 'no-icons', !this.editor.getConfiguration().contribInfo.suggest.showIcons);
		applyIconStyle();

		let renderer = instantiationService.createInstance(Renderer, this, this.editor, triggerKeybindingLabel);

		this.list = new List(this.listElement, this, [renderer], {
			useShadows: false,
			openController: { shouldOpen: () => false },
			mouseSupport: false
		});

		this.toDispose.add(attachListStyler(this.list, themeService, {
			listInactiveFocusBackground: editorSuggestWidgetSelectedBackground,
			listInactiveFocusOutline: activeContrastBorder
		}));
		this.toDispose.add(themeService.onThemeChange(t => this.onThemeChange(t)));
		this.toDispose.add(editor.onDidLayoutChange(() => this.onEditorLayoutChange()));
		this.toDispose.add(this.list.onMouseDown(e => this.onListMouseDown(e)));
		this.toDispose.add(this.list.onSelectionChange(e => this.onListSelection(e)));
		this.toDispose.add(this.list.onFocusChange(e => this.onListFocus(e)));
		this.toDispose.add(this.editor.onDidChangeCursorSelection(() => this.onCursorSelectionChanged()));
		this.toDispose.add(this.editor.onDidChangeConfiguration(e => e.contribInfo && applyIconStyle()));


		this.suggestWidgetVisible = SuggestContext.Visible.bindTo(contextKeyService);
		this.suggestWidgetMultipleSuggestions = SuggestContext.MultipleSuggestions.bindTo(contextKeyService);

		this.editor.addContentWidget(this);
		this.setState(State.Hidden);

		this.onThemeChange(themeService.getTheme());
	}

	private onCursorSelectionChanged(): void {
		if (this.state === State.Hidden) {
			return;
		}

		this.editor.layoutContentWidget(this);
	}

	private onEditorLayoutChange(): void {
		if ((this.state === State.Open || this.state === State.Details) && this.expandDocsSettingFromStorage()) {
			this.expandSideOrBelow();
		}
	}

	private onListMouseDown(e: IListMouseEvent<CompletionItem>): void {
		if (typeof e.element === 'undefined' || typeof e.index === 'undefined') {
			return;
		}

		// prevent stealing browser focus from the editor
		e.browserEvent.preventDefault();
		e.browserEvent.stopPropagation();

		this.select(e.element, e.index);
	}

	private onListSelection(e: IListEvent<CompletionItem>): void {
		if (!e.elements.length) {
			return;
		}

		this.select(e.elements[0], e.indexes[0]);
	}

	private select(item: CompletionItem, index: number): void {
		const completionModel = this.completionModel;

		if (!completionModel) {
			return;
		}

		this.onDidSelectEmitter.fire({ item, index, model: completionModel });
		this.editor.focus();
	}

	private _getSuggestionAriaAlertLabel(item: CompletionItem): string {
		if (this.expandDocsSettingFromStorage()) {
			return nls.localize('ariaCurrenttSuggestionReadDetails', "Item {0}, docs: {1}", item.completion.label, this.details.getAriaLabel());
		} else {
			return item.completion.label;
		}
	}

	private _lastAriaAlertLabel: string | null = null;
	private _ariaAlert(newAriaAlertLabel: string | null): void {
		if (this._lastAriaAlertLabel === newAriaAlertLabel) {
			return;
		}
		this._lastAriaAlertLabel = newAriaAlertLabel;
		if (this._lastAriaAlertLabel) {
			alert(this._lastAriaAlertLabel, true);
		}
	}

	private onThemeChange(theme: ITheme) {
		const backgroundColor = theme.getColor(editorSuggestWidgetBackground);
		if (backgroundColor) {
			this.listElement.style.backgroundColor = backgroundColor.toString();
			this.details.element.style.backgroundColor = backgroundColor.toString();
			this.messageElement.style.backgroundColor = backgroundColor.toString();
		}
		const borderColor = theme.getColor(editorSuggestWidgetBorder);
		if (borderColor) {
			this.listElement.style.borderColor = borderColor.toString();
			this.details.element.style.borderColor = borderColor.toString();
			this.messageElement.style.borderColor = borderColor.toString();
			this.detailsBorderColor = borderColor.toString();
		}
		const focusBorderColor = theme.getColor(focusBorder);
		if (focusBorderColor) {
			this.detailsFocusBorderColor = focusBorderColor.toString();
		}
		this.details.setBorderWidth(theme.type === 'hc' ? 2 : 1);
	}

	private onListFocus(e: IListEvent<CompletionItem>): void {
		if (this.ignoreFocusEvents) {
			return;
		}

		if (!e.elements.length) {
			if (this.currentSuggestionDetails) {
				this.currentSuggestionDetails.cancel();
				this.currentSuggestionDetails = null;
				this.focusedItem = null;
			}

			this._ariaAlert(null);
			return;
		}

		if (!this.completionModel) {
			return;
		}

		const item = e.elements[0];
		const index = e.indexes[0];

		this.firstFocusInCurrentList = !this.focusedItem;
		if (item !== this.focusedItem) {


			if (this.currentSuggestionDetails) {
				this.currentSuggestionDetails.cancel();
				this.currentSuggestionDetails = null;
			}

			this.focusedItem = item;

			this.list.reveal(index);

			this.currentSuggestionDetails = createCancelablePromise(async token => {
				const loading = disposableTimeout(() => this.showDetails(true), 250);
				token.onCancellationRequested(() => loading.dispose());
				const result = await item.resolve(token);
				loading.dispose();
				return result;
			});

			this.currentSuggestionDetails.then(() => {
				if (index >= this.list.length || item !== this.list.element(index)) {
					return;
				}

				// item can have extra information, so re-render
				this.ignoreFocusEvents = true;
				this.list.splice(index, 1, [item]);
				this.list.setFocus([index]);
				this.ignoreFocusEvents = false;

				if (this.expandDocsSettingFromStorage()) {
					this.showDetails(false);
				} else {
					removeClass(this.element, 'docs-side');
				}

				this._ariaAlert(this._getSuggestionAriaAlertLabel(item));
			}).catch(onUnexpectedError);
		}

		// emit an event
		this.onDidFocusEmitter.fire({ item, index, model: this.completionModel });
	}

	private setState(state: State): void {
		if (!this.element) {
			return;
		}

		const stateChanged = this.state !== state;
		this.state = state;

		toggleClass(this.element, 'frozen', state === State.Frozen);

		switch (state) {
			case State.Hidden:
				hide(this.messageElement, this.details.element, this.listElement);
				this.hide();
				this.listHeight = 0;
				if (stateChanged) {
					this.list.splice(0, this.list.length);
				}
				this.focusedItem = null;
				break;
			case State.Loading:
				this.messageElement.textContent = SuggestWidget.LOADING_MESSAGE;
				hide(this.listElement, this.details.element);
				show(this.messageElement);
				removeClass(this.element, 'docs-side');
				this.show();
				this.focusedItem = null;
				break;
			case State.Empty:
				this.messageElement.textContent = SuggestWidget.NO_SUGGESTIONS_MESSAGE;
				hide(this.listElement, this.details.element);
				show(this.messageElement);
				removeClass(this.element, 'docs-side');
				this.show();
				this.focusedItem = null;
				break;
			case State.Open:
				hide(this.messageElement);
				show(this.listElement);
				this.show();
				break;
			case State.Frozen:
				hide(this.messageElement);
				show(this.listElement);
				this.show();
				break;
			case State.Details:
				hide(this.messageElement);
				show(this.details.element, this.listElement);
				this.show();
				this._ariaAlert(this.details.getAriaLabel());
				break;
		}
	}

	showTriggered(auto: boolean, delay: number) {
		if (this.state !== State.Hidden) {
			return;
		}

		this.isAuto = !!auto;

		if (!this.isAuto) {
			this.loadingTimeout = disposableTimeout(() => this.setState(State.Loading), delay);
		}
	}

	showSuggestions(completionModel: CompletionModel, selectionIndex: number, isFrozen: boolean, isAuto: boolean): void {
		this.preferDocPositionTop = false;
		this.docsPositionPreviousWidgetY = null;

		this.loadingTimeout.dispose();

		if (this.currentSuggestionDetails) {
			this.currentSuggestionDetails.cancel();
			this.currentSuggestionDetails = null;
		}

		if (this.completionModel !== completionModel) {
			this.completionModel = completionModel;
		}

		if (isFrozen && this.state !== State.Empty && this.state !== State.Hidden) {
			this.setState(State.Frozen);
			return;
		}

		let visibleCount = this.completionModel.items.length;

		const isEmpty = visibleCount === 0;
		this.suggestWidgetMultipleSuggestions.set(visibleCount > 1);

		if (isEmpty) {
			if (isAuto) {
				this.setState(State.Hidden);
			} else {
				this.setState(State.Empty);
			}

			this.completionModel = null;

		} else {

			if (this.state !== State.Open) {
				const { stats } = this.completionModel;
				stats['wasAutomaticallyTriggered'] = !!isAuto;
				/* __GDPR__
					"suggestWidget" : {
						"wasAutomaticallyTriggered" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"${include}": [
							"${ICompletionStats}"
						]
					}
				*/
				this.telemetryService.publicLog('suggestWidget', { ...stats });
			}

			this.focusedItem = null;
			this.list.splice(0, this.list.length, this.completionModel.items);

			if (isFrozen) {
				this.setState(State.Frozen);
			} else {
				this.setState(State.Open);
			}

			this.list.reveal(selectionIndex, 0);
			this.list.setFocus([selectionIndex]);

			// Reset focus border
			if (this.detailsBorderColor) {
				this.details.element.style.borderColor = this.detailsBorderColor;
			}
		}
	}

	selectNextPage(): boolean {
		switch (this.state) {
			case State.Hidden:
				return false;
			case State.Details:
				this.details.pageDown();
				return true;
			case State.Loading:
				return !this.isAuto;
			default:
				this.list.focusNextPage();
				return true;
		}
	}

	selectNext(): boolean {
		switch (this.state) {
			case State.Hidden:
				return false;
			case State.Loading:
				return !this.isAuto;
			default:
				this.list.focusNext(1, true);
				return true;
		}
	}

	selectLast(): boolean {
		switch (this.state) {
			case State.Hidden:
				return false;
			case State.Details:
				this.details.scrollBottom();
				return true;
			case State.Loading:
				return !this.isAuto;
			default:
				this.list.focusLast();
				return true;
		}
	}

	selectPreviousPage(): boolean {
		switch (this.state) {
			case State.Hidden:
				return false;
			case State.Details:
				this.details.pageUp();
				return true;
			case State.Loading:
				return !this.isAuto;
			default:
				this.list.focusPreviousPage();
				return true;
		}
	}

	selectPrevious(): boolean {
		switch (this.state) {
			case State.Hidden:
				return false;
			case State.Loading:
				return !this.isAuto;
			default:
				this.list.focusPrevious(1, true);
				return false;
		}
	}

	selectFirst(): boolean {
		switch (this.state) {
			case State.Hidden:
				return false;
			case State.Details:
				this.details.scrollTop();
				return true;
			case State.Loading:
				return !this.isAuto;
			default:
				this.list.focusFirst();
				return true;
		}
	}

	getFocusedItem(): ISelectedSuggestion | undefined {
		if (this.state !== State.Hidden
			&& this.state !== State.Empty
			&& this.state !== State.Loading
			&& this.completionModel
		) {

			return {
				item: this.list.getFocusedElements()[0],
				index: this.list.getFocus()[0],
				model: this.completionModel
			};
		}
		return undefined;
	}

	toggleDetailsFocus(): void {
		if (this.state === State.Details) {
			this.setState(State.Open);
			if (this.detailsBorderColor) {
				this.details.element.style.borderColor = this.detailsBorderColor;
			}
		} else if (this.state === State.Open && this.expandDocsSettingFromStorage()) {
			this.setState(State.Details);
			if (this.detailsFocusBorderColor) {
				this.details.element.style.borderColor = this.detailsFocusBorderColor;
			}
		}
		this.telemetryService.publicLog2('suggestWidget:toggleDetailsFocus');
	}

	toggleDetails(): void {
		if (!canExpandCompletionItem(this.list.getFocusedElements()[0])) {
			return;
		}

		if (this.expandDocsSettingFromStorage()) {
			this.updateExpandDocsSetting(false);
			hide(this.details.element);
			removeClass(this.element, 'docs-side');
			removeClass(this.element, 'docs-below');
			this.editor.layoutContentWidget(this);
			this.telemetryService.publicLog2('suggestWidget:collapseDetails');
		} else {
			if (this.state !== State.Open && this.state !== State.Details && this.state !== State.Frozen) {
				return;
			}

			this.updateExpandDocsSetting(true);
			this.showDetails(false);
			this._ariaAlert(this.details.getAriaLabel());
			this.telemetryService.publicLog2('suggestWidget:expandDetails');
		}
	}

	showDetails(loading: boolean): void {
		this.expandSideOrBelow();

		show(this.details.element);

		this.details.element.style.maxHeight = this.maxWidgetHeight + 'px';

		if (loading) {
			this.details.renderLoading();
		} else {
			this.details.renderItem(this.list.getFocusedElements()[0], this.explainMode);
		}

		// Reset margin-top that was set as Fix for #26416
		this.listElement.style.marginTop = '0px';

		// with docs showing up widget width/height may change, so reposition the widget
		this.editor.layoutContentWidget(this);

		this.adjustDocsPosition();

		this.editor.focus();
	}

	toggleExplainMode(): void {
		if (this.list.getFocusedElements()[0] && this.expandDocsSettingFromStorage()) {
			this.explainMode = !this.explainMode;
			this.showDetails(false);
		}
	}

	private show(): void {
		const newHeight = this.updateListHeight();
		if (newHeight !== this.listHeight) {
			this.editor.layoutContentWidget(this);
			this.listHeight = newHeight;
		}

		this.suggestWidgetVisible.set(true);

		this.showTimeout.cancelAndSet(() => {
			addClass(this.element, 'visible');
			this.onDidShowEmitter.fire(this);
		}, 100);
	}

	private hide(): void {
		this.suggestWidgetVisible.reset();
		this.suggestWidgetMultipleSuggestions.reset();
		removeClass(this.element, 'visible');
	}

	hideWidget(): void {
		this.loadingTimeout.dispose();
		this.setState(State.Hidden);
		this.onDidHideEmitter.fire(this);
	}

	getPosition(): IContentWidgetPosition | null {
		if (this.state === State.Hidden) {
			return null;
		}

		let preference = [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE];
		if (this.preferDocPositionTop) {
			preference = [ContentWidgetPositionPreference.ABOVE];
		}

		return {
			position: this.editor.getPosition(),
			preference: preference
		};
	}

	getDomNode(): HTMLElement {
		return this.element;
	}

	getId(): string {
		return SuggestWidget.ID;
	}

	private updateListHeight(): number {
		let height = 0;

		if (this.state === State.Empty || this.state === State.Loading) {
			height = this.unfocusedHeight;
		} else {
			const suggestionCount = this.list.contentHeight / this.unfocusedHeight;
			const { maxVisibleSuggestions } = this.editor.getConfiguration().contribInfo.suggest;
			height = Math.min(suggestionCount, maxVisibleSuggestions) * this.unfocusedHeight;
		}

		this.element.style.lineHeight = `${this.unfocusedHeight}px`;
		this.listElement.style.height = `${height}px`;
		this.list.layout(height);
		return height;
	}

	/**
	 * Adds the propert classes, margins when positioning the docs to the side
	 */
	private adjustDocsPosition() {
		if (!this.editor.hasModel()) {
			return;
		}

		const lineHeight = this.editor.getConfiguration().fontInfo.lineHeight;
		const cursorCoords = this.editor.getScrolledVisiblePosition(this.editor.getPosition());
		const editorCoords = getDomNodePagePosition(this.editor.getDomNode());
		const cursorX = editorCoords.left + cursorCoords.left;
		const cursorY = editorCoords.top + cursorCoords.top + cursorCoords.height;
		const widgetCoords = getDomNodePagePosition(this.element);
		const widgetX = widgetCoords.left;
		const widgetY = widgetCoords.top;

		// Fixes #27649
		// Check if the Y changed to the top of the cursor and keep the widget flagged to prefer top
		if (this.docsPositionPreviousWidgetY &&
			this.docsPositionPreviousWidgetY < widgetY &&
			!this.preferDocPositionTop) {
			this.preferDocPositionTop = true;
			this.adjustDocsPosition();
			return;
		}
		this.docsPositionPreviousWidgetY = widgetY;

		if (widgetX < cursorX - this.listWidth) {
			// Widget is too far to the left of cursor, swap list and docs
			addClass(this.element, 'list-right');
		} else {
			removeClass(this.element, 'list-right');
		}

		// Compare top of the cursor (cursorY - lineheight) with widgetTop to determine if
		// margin-top needs to be applied on list to make it appear right above the cursor
		// Cannot compare cursorY directly as it may be a few decimals off due to zoooming
		if (hasClass(this.element, 'docs-side')
			&& cursorY - lineHeight > widgetY
			&& this.details.element.offsetHeight > this.listElement.offsetHeight) {

			// Fix for #26416
			// Docs is bigger than list and widget is above cursor, apply margin-top so that list appears right above cursor
			this.listElement.style.marginTop = `${this.details.element.offsetHeight - this.listElement.offsetHeight}px`;
		}
	}

	/**
	 * Adds the proper classes for positioning the docs to the side or below
	 */
	private expandSideOrBelow() {
		if (!canExpandCompletionItem(this.focusedItem) && this.firstFocusInCurrentList) {
			removeClass(this.element, 'docs-side');
			removeClass(this.element, 'docs-below');
			return;
		}

		let matches = this.element.style.maxWidth!.match(/(\d+)px/);
		if (!matches || Number(matches[1]) < this.maxWidgetWidth) {
			addClass(this.element, 'docs-below');
			removeClass(this.element, 'docs-side');
		} else if (canExpandCompletionItem(this.focusedItem)) {
			addClass(this.element, 'docs-side');
			removeClass(this.element, 'docs-below');
		}
	}

	// Heights

	private get maxWidgetHeight(): number {
		return this.unfocusedHeight * this.editor.getConfiguration().contribInfo.suggest.maxVisibleSuggestions;
	}

	private get unfocusedHeight(): number {
		const configuration = this.editor.getConfiguration();
		return configuration.contribInfo.suggestLineHeight || configuration.fontInfo.lineHeight;
	}

	// IDelegate

	getHeight(element: CompletionItem): number {
		return this.unfocusedHeight;
	}

	getTemplateId(element: CompletionItem): string {
		return 'suggestion';
	}

	private expandDocsSettingFromStorage(): boolean {
		return this.storageService.getBoolean('expandSuggestionDocs', StorageScope.GLOBAL, expandSuggestionDocsByDefault);
	}

	private updateExpandDocsSetting(value: boolean) {
		this.storageService.store('expandSuggestionDocs', value, StorageScope.GLOBAL);
	}

	dispose(): void {
		this.details.dispose();
		this.list.dispose();
		this.toDispose.dispose();
		this.loadingTimeout.dispose();
		this.showTimeout.dispose();
	}
}

registerThemingParticipant((theme, collector) => {
	const matchHighlight = theme.getColor(editorSuggestWidgetHighlightForeground);
	if (matchHighlight) {
		collector.addRule(`.monaco-editor .suggest-widget .monaco-list .monaco-list-row .monaco-highlighted-label .highlight { color: ${matchHighlight}; }`);
	}
	const foreground = theme.getColor(editorSuggestWidgetForeground);
	if (foreground) {
		collector.addRule(`.monaco-editor .suggest-widget { color: ${foreground}; }`);
	}

	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.monaco-editor .suggest-widget a { color: ${link}; }`);
	}

	const codeBackground = theme.getColor(textCodeBlockBackground);
	if (codeBackground) {
		collector.addRule(`.monaco-editor .suggest-widget code { background-color: ${codeBackground}; }`);
	}
});
