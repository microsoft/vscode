/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/suggest';
import 'vs/base/browser/ui/codicons/codiconStyles'; // The codicon symbol styles are defined here and must be loaded
import 'vs/editor/contrib/documentSymbols/outlineTree'; // The codicon symbol colors are defined here and must be loaded
import * as nls from 'vs/nls';
import * as strings from 'vs/base/common/strings';
import { Event, Emitter } from 'vs/base/common/event';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable, DisposableStore, Disposable } from 'vs/base/common/lifecycle';
import { append, $, hide, show, getDomNodePagePosition, addDisposableListener, addStandardDisposableListener } from 'vs/base/browser/dom';
import { IListVirtualDelegate, IListEvent, IListMouseEvent, IListGestureEvent } from 'vs/base/browser/ui/list/list';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition, IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { Context as SuggestContext, CompletionItem } from './suggest';
import { CompletionModel } from './completionModel';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { attachListStyler } from 'vs/platform/theme/common/styler';
import { IThemeService, IColorTheme, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { registerColor, editorWidgetBackground, listFocusBackground, activeContrastBorder, listHighlightForeground, editorForeground, editorWidgetBorder, focusBorder, textLinkForeground, textCodeBlockBackground } from 'vs/platform/theme/common/colorRegistry';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { MarkdownRenderer } from 'vs/editor/contrib/markdown/markdownRenderer';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { TimeoutTimer, CancelablePromise, createCancelablePromise, disposableTimeout } from 'vs/base/common/async';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { SuggestionDetails, canExpandCompletionItem } from './suggestWidgetDetails';
import { SuggestWidgetStatus } from 'vs/editor/contrib/suggest/suggestWidgetStatus';
import { getAriaId, ItemRenderer } from './suggestWidgetRenderer';

const expandSuggestionDocsByDefault = false;



/**
 * Suggest widget colors
 */
export const editorSuggestWidgetBackground = registerColor('editorSuggestWidget.background', { dark: editorWidgetBackground, light: editorWidgetBackground, hc: editorWidgetBackground }, nls.localize('editorSuggestWidgetBackground', 'Background color of the suggest widget.'));
export const editorSuggestWidgetBorder = registerColor('editorSuggestWidget.border', { dark: editorWidgetBorder, light: editorWidgetBorder, hc: editorWidgetBorder }, nls.localize('editorSuggestWidgetBorder', 'Border color of the suggest widget.'));
export const editorSuggestWidgetForeground = registerColor('editorSuggestWidget.foreground', { dark: editorForeground, light: editorForeground, hc: editorForeground }, nls.localize('editorSuggestWidgetForeground', 'Foreground color of the suggest widget.'));
export const editorSuggestWidgetSelectedBackground = registerColor('editorSuggestWidget.selectedBackground', { dark: listFocusBackground, light: listFocusBackground, hc: listFocusBackground }, nls.localize('editorSuggestWidgetSelectedBackground', 'Background color of the selected entry in the suggest widget.'));
export const editorSuggestWidgetHighlightForeground = registerColor('editorSuggestWidget.highlightForeground', { dark: listHighlightForeground, light: listHighlightForeground, hc: listHighlightForeground }, nls.localize('editorSuggestWidgetHighlightForeground', 'Color of the match highlights in the suggest widget.'));




const enum State {
	Hidden,
	Loading,
	Empty,
	Open,
	Frozen,
	Details
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
	readonly suppressMouseDown = false;

	private state: State = State.Hidden;
	private isAddedAsContentWidget: boolean = false;
	private isAuto: boolean = false;
	private loadingTimeout: IDisposable = Disposable.None;
	private currentSuggestionDetails?: CancelablePromise<void>;
	private focusedItem?: CompletionItem;
	private ignoreFocusEvents: boolean = false;
	private completionModel?: CompletionModel;

	private element: HTMLElement;
	private messageElement: HTMLElement;
	private mainElement: HTMLElement;
	private listContainer: HTMLElement;
	private list: List<CompletionItem>;
	private status: SuggestWidgetStatus;
	private details: SuggestionDetails;
	private listHeight?: number;

	private readonly ctxSuggestWidgetVisible: IContextKey<boolean>;
	private readonly ctxSuggestWidgetDetailsVisible: IContextKey<boolean>;
	private readonly ctxSuggestWidgetMultipleSuggestions: IContextKey<boolean>;

	private readonly showTimeout = new TimeoutTimer();
	private readonly _disposables = new DisposableStore();

	private readonly onDidSelectEmitter = new Emitter<ISelectedSuggestion>();
	private readonly onDidFocusEmitter = new Emitter<ISelectedSuggestion>();
	private readonly onDidHideEmitter = new Emitter<this>();
	private readonly onDidShowEmitter = new Emitter<this>();

	readonly onDidSelect: Event<ISelectedSuggestion> = this.onDidSelectEmitter.event;
	readonly onDidFocus: Event<ISelectedSuggestion> = this.onDidFocusEmitter.event;
	readonly onDidHide: Event<this> = this.onDidHideEmitter.event;
	readonly onDidShow: Event<this> = this.onDidShowEmitter.event;

	private readonly maxWidgetWidth = 660;
	private readonly listWidth = 330;
	private detailsFocusBorderColor?: string;
	private detailsBorderColor?: string;

	private firstFocusInCurrentList: boolean = false;

	private preferDocPositionTop: boolean = false;
	private docsPositionPreviousWidgetY?: number;
	private explainMode: boolean = false;

	private readonly _onDetailsKeydown = new Emitter<IKeyboardEvent>();
	public readonly onDetailsKeyDown: Event<IKeyboardEvent> = this._onDetailsKeydown.event;

	constructor(
		private readonly editor: ICodeEditor,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService private readonly storageService: IStorageService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IModeService modeService: IModeService,
		@IOpenerService openerService: IOpenerService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		const markdownRenderer = this._disposables.add(new MarkdownRenderer(editor, modeService, openerService));
		const kbToggleDetails = keybindingService.lookupKeybinding('toggleSuggestionDetails')?.getLabel() ?? '';

		this.element = $('.editor-widget.suggest-widget');
		this._disposables.add(addDisposableListener(this.element, 'click', e => {
			if (e.target === this.element) {
				this.hideWidget();
			}
		}));

		this.messageElement = append(this.element, $('.message'));
		this.mainElement = append(this.element, $('.tree'));

		this.details = instantiationService.createInstance(SuggestionDetails, this.element, this.editor, markdownRenderer, kbToggleDetails);
		this.details.onDidClose(this.toggleDetails, this, this._disposables);
		hide(this.details.element);

		const applyIconStyle = () => this.element.classList.toggle('no-icons', !this.editor.getOption(EditorOption.suggest).showIcons);
		applyIconStyle();

		this.listContainer = append(this.mainElement, $('.list-container'));

		const renderer = instantiationService.createInstance(ItemRenderer, this.editor, kbToggleDetails);
		this._disposables.add(renderer);
		this._disposables.add(renderer.onDidToggleDetails(() => this.toggleDetails()));

		this.list = new List('SuggestWidget', this.listContainer, this, [renderer], {
			useShadows: false,
			mouseSupport: false,
			accessibilityProvider: {
				getRole: () => 'option',
				getAriaLabel: (item: CompletionItem) => {
					const textLabel = typeof item.completion.label === 'string' ? item.completion.label : item.completion.label.name;
					if (item.isResolved && this._isDetailsVisible()) {
						const { documentation, detail } = item.completion;
						const docs = strings.format(
							'{0}{1}',
							detail || '',
							documentation ? (typeof documentation === 'string' ? documentation : documentation.value) : '');

						return nls.localize('ariaCurrenttSuggestionReadDetails', "{0}, docs: {1}", textLabel, docs);
					} else {
						return textLabel;
					}
				},
				getWidgetAriaLabel: () => nls.localize('suggest', "Suggest"),
				getWidgetRole: () => 'listbox'
			}
		});

		this.status = instantiationService.createInstance(SuggestWidgetStatus, this.mainElement);
		const applyStatusBarStyle = () => this.element.classList.toggle('with-status-bar', this.editor.getOption(EditorOption.suggest).statusBar.visible);
		applyStatusBarStyle();

		this._disposables.add(attachListStyler(this.list, themeService, {
			listInactiveFocusBackground: editorSuggestWidgetSelectedBackground,
			listInactiveFocusOutline: activeContrastBorder
		}));
		this._disposables.add(themeService.onDidColorThemeChange(t => this.onThemeChange(t)));
		this._disposables.add(editor.onDidLayoutChange(() => this.onEditorLayoutChange()));
		this._disposables.add(this.list.onMouseDown(e => this.onListMouseDownOrTap(e)));
		this._disposables.add(this.list.onTap(e => this.onListMouseDownOrTap(e)));
		this._disposables.add(this.list.onDidChangeSelection(e => this.onListSelection(e)));
		this._disposables.add(this.list.onDidChangeFocus(e => this.onListFocus(e)));
		this._disposables.add(this.editor.onDidChangeCursorSelection(() => this.onCursorSelectionChanged()));
		this._disposables.add(this.editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.suggest)) {
				applyStatusBarStyle();
				applyIconStyle();
			}
		}));

		this.ctxSuggestWidgetVisible = SuggestContext.Visible.bindTo(contextKeyService);
		this.ctxSuggestWidgetDetailsVisible = SuggestContext.DetailsVisible.bindTo(contextKeyService);
		this.ctxSuggestWidgetMultipleSuggestions = SuggestContext.MultipleSuggestions.bindTo(contextKeyService);

		this.onThemeChange(themeService.getColorTheme());

		this._disposables.add(addStandardDisposableListener(this.details.element, 'keydown', e => {
			this._onDetailsKeydown.fire(e);
		}));

		this._disposables.add(this.editor.onMouseDown((e: IEditorMouseEvent) => this.onEditorMouseDown(e)));
	}

	private onEditorMouseDown(mouseEvent: IEditorMouseEvent): void {
		// Clicking inside details
		if (this.details.element.contains(mouseEvent.target.element)) {
			this.details.element.focus();
		}
		// Clicking outside details and inside suggest
		else {
			if (this.element.contains(mouseEvent.target.element)) {
				this.editor.focus();
			}
		}
	}

	private onCursorSelectionChanged(): void {
		if (this.state !== State.Hidden) {
			this.editor.layoutContentWidget(this);
		}
	}

	private onEditorLayoutChange(): void {
		if ((this.state === State.Open || this.state === State.Details) && this._isDetailsVisible()) {
			this.expandSideOrBelow();
		}
	}

	private onListMouseDownOrTap(e: IListMouseEvent<CompletionItem> | IListGestureEvent<CompletionItem>): void {
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

	private onThemeChange(theme: IColorTheme) {
		const backgroundColor = theme.getColor(editorSuggestWidgetBackground);
		if (backgroundColor) {
			this.mainElement.style.backgroundColor = backgroundColor.toString();
			this.details.element.style.backgroundColor = backgroundColor.toString();
			this.messageElement.style.backgroundColor = backgroundColor.toString();
		}
		const borderColor = theme.getColor(editorSuggestWidgetBorder);
		if (borderColor) {
			this.mainElement.style.borderColor = borderColor.toString();
			this.status.element.style.borderTopColor = borderColor.toString();
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
				this.currentSuggestionDetails = undefined;
				this.focusedItem = undefined;
			}

			this.editor.setAriaOptions({ activeDescendant: undefined });
			return;
		}

		if (!this.completionModel) {
			return;
		}

		const item = e.elements[0];
		const index = e.indexes[0];

		this.firstFocusInCurrentList = !this.focusedItem;
		if (item !== this.focusedItem) {

			this.currentSuggestionDetails?.cancel();
			this.currentSuggestionDetails = undefined;

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

				if (this._isDetailsVisible()) {
					this.showDetails(false);
				} else {
					this.element.classList.remove('docs-side');
				}

				this.editor.setAriaOptions({ activeDescendant: getAriaId(index) });
			}).catch(onUnexpectedError);
		}

		// emit an event
		this.onDidFocusEmitter.fire({ item, index, model: this.completionModel });
	}

	private setState(state: State): void {
		if (!this.element) {
			return;
		}

		if (!this.isAddedAsContentWidget && state !== State.Hidden) {
			this.isAddedAsContentWidget = true;
			this.editor.addContentWidget(this);
		}

		const stateChanged = this.state !== state;
		this.state = state;

		this.element.classList.toggle('frozen', state === State.Frozen);

		switch (state) {
			case State.Hidden:
				hide(this.messageElement, this.details.element, this.mainElement);
				this.hide();
				this.listHeight = 0;
				if (stateChanged) {
					this.list.splice(0, this.list.length);
				}
				this.focusedItem = undefined;
				break;
			case State.Loading:
				this.messageElement.textContent = SuggestWidget.LOADING_MESSAGE;
				hide(this.mainElement, this.details.element);
				show(this.messageElement);
				this.element.classList.remove('docs-side');
				this.show();
				this.focusedItem = undefined;
				break;
			case State.Empty:
				this.messageElement.textContent = SuggestWidget.NO_SUGGESTIONS_MESSAGE;
				hide(this.mainElement, this.details.element);
				show(this.messageElement);
				this.element.classList.remove('docs-side');
				this.show();
				this.focusedItem = undefined;
				break;
			case State.Open:
				hide(this.messageElement);
				show(this.mainElement);
				this.show();
				break;
			case State.Frozen:
				hide(this.messageElement);
				show(this.mainElement);
				this.show();
				break;
			case State.Details:
				hide(this.messageElement);
				show(this.details.element, this.mainElement);
				this.show();
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
		this.docsPositionPreviousWidgetY = undefined;

		this.loadingTimeout.dispose();

		this.currentSuggestionDetails?.cancel();
		this.currentSuggestionDetails = undefined;

		if (this.completionModel !== completionModel) {
			this.completionModel = completionModel;
		}

		if (isFrozen && this.state !== State.Empty && this.state !== State.Hidden) {
			this.setState(State.Frozen);
			return;
		}

		let visibleCount = this.completionModel.items.length;

		const isEmpty = visibleCount === 0;
		this.ctxSuggestWidgetMultipleSuggestions.set(visibleCount > 1);

		if (isEmpty) {
			if (isAuto) {
				this.setState(State.Hidden);
			} else {
				this.setState(State.Empty);
			}

			this.completionModel = undefined;

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

			this.focusedItem = undefined;
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
		} else if (this.state === State.Open && this._isDetailsVisible()) {
			this.setState(State.Details);
			if (this.detailsFocusBorderColor) {
				this.details.element.style.borderColor = this.detailsFocusBorderColor;
			}
		}
		this.telemetryService.publicLog2('suggestWidget:toggleDetailsFocus');
	}

	toggleDetails(): void {
		if (this._isDetailsVisible()) {
			// hide details widget
			this.ctxSuggestWidgetDetailsVisible.set(false);
			this._setDetailsVisible(false);
			hide(this.details.element);
			this.element.classList.remove('docs-side', 'doc-below');
			this.editor.layoutContentWidget(this);
			this.telemetryService.publicLog2('suggestWidget:collapseDetails');

		} else if (canExpandCompletionItem(this.list.getFocusedElements()[0]) && (this.state === State.Open || this.state === State.Details || this.state === State.Frozen)) {
			// show details widget (iff possible)
			this.ctxSuggestWidgetDetailsVisible.set(true);
			this._setDetailsVisible(true);
			this.showDetails(false);
			this.telemetryService.publicLog2('suggestWidget:expandDetails');
		}
	}

	showDetails(loading: boolean): void {
		if (!loading) {
			// When loading, don't re-layout docs, as item is not resolved yet #88731
			this.expandSideOrBelow();
		}

		show(this.details.element);

		this.details.element.style.maxHeight = this.maxWidgetHeight + 'px';

		if (loading) {
			this.details.renderLoading();
		} else {
			this.details.renderItem(this.list.getFocusedElements()[0], this.explainMode);
		}


		// with docs showing up widget width/height may change, so reposition the widget
		this.editor.layoutContentWidget(this);

		this.adjustDocsPosition();

		this.editor.focus();
	}

	toggleExplainMode(): void {
		if (this.list.getFocusedElements()[0] && this._isDetailsVisible()) {
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

		this.ctxSuggestWidgetVisible.set(true);

		this.showTimeout.cancelAndSet(() => {
			this.element.classList.add('visible');
			this.onDidShowEmitter.fire(this);
		}, 100);
	}

	private hide(): void {
		// let the editor know that the widget is hidden
		this.editor.layoutContentWidget(this);
		this.ctxSuggestWidgetVisible.reset();
		this.ctxSuggestWidgetMultipleSuggestions.reset();
		this.element.classList.remove('visible');
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

	isFrozen(): boolean {
		return this.state === State.Frozen;
	}

	private updateListHeight(): number {
		let height = this.unfocusedHeight;

		if (this.state !== State.Empty && this.state !== State.Loading) {
			const suggestionCount = this.list.contentHeight / this.unfocusedHeight;
			const { maxVisibleSuggestions } = this.editor.getOption(EditorOption.suggest);
			height = Math.min(suggestionCount, maxVisibleSuggestions) * this.unfocusedHeight;
		}

		this.element.style.lineHeight = `${this.unfocusedHeight}px`;
		this.listContainer.style.height = `${height}px`;
		this.mainElement.style.height = `${height + (this.editor.getOption(EditorOption.suggest).statusBar.visible ? this.unfocusedHeight : 0)}px`;
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

		const lineHeight = this.editor.getOption(EditorOption.lineHeight);
		const cursorCoords = this.editor.getScrolledVisiblePosition(this.editor.getPosition());
		const editorCoords = getDomNodePagePosition(this.editor.getDomNode());
		const cursorX = editorCoords.left + cursorCoords.left;
		const cursorY = editorCoords.top + cursorCoords.top + cursorCoords.height;
		const widgetCoords = getDomNodePagePosition(this.element);
		const widgetX = widgetCoords.left;
		const widgetY = widgetCoords.top;

		// Fixes #27649
		// Check if the Y changed to the top of the cursor and keep the widget flagged to prefer top
		if (this.docsPositionPreviousWidgetY !== undefined &&
			this.docsPositionPreviousWidgetY < widgetY &&
			!this.preferDocPositionTop
		) {
			this.preferDocPositionTop = true;
			this.adjustDocsPosition();
			return;
		}
		this.docsPositionPreviousWidgetY = widgetY;

		const aboveCursor = cursorY - lineHeight > widgetY;
		const rowMode = this.element.classList.contains('docs-side');

		// row mode: reverse doc/list when being too far right
		// column mode: reverse doc/list when being too far down
		this.element.classList.toggle(
			'reverse',
			(rowMode && widgetX < cursorX - this.listWidth) || (!rowMode && aboveCursor)
		);

		// row mode: when detail is higher and when showing above the cursor then align
		// the list at the bottom
		this.mainElement.classList.toggle(
			'docs-higher',
			rowMode && aboveCursor && this.details.element.offsetHeight > this.mainElement.offsetHeight
		);
	}

	/**
	 * Adds the proper classes for positioning the docs to the side or below depending on item
	 */
	private expandSideOrBelow() {
		if (!canExpandCompletionItem(this.focusedItem) && this.firstFocusInCurrentList) {
			this.element.classList.remove('docs-side', 'docs-below');
			return;
		}

		let matches = this.element.style.maxWidth.match(/(\d+)px/);
		if (!matches || Number(matches[1]) < this.maxWidgetWidth) {
			this.element.classList.add('docs-below');
			this.element.classList.remove('docs-side');
		} else if (canExpandCompletionItem(this.focusedItem)) {
			this.element.classList.add('docs-side');
			this.element.classList.remove('docs-below');
		}
	}

	// Heights

	private get maxWidgetHeight(): number {
		return this.unfocusedHeight * this.editor.getOption(EditorOption.suggest).maxVisibleSuggestions;
	}

	private get unfocusedHeight(): number {
		const options = this.editor.getOptions();
		return options.get(EditorOption.suggestLineHeight) || options.get(EditorOption.fontInfo).lineHeight;
	}

	// IDelegate

	getHeight(_element: CompletionItem): number {
		return this.unfocusedHeight;
	}

	getTemplateId(_element: CompletionItem): string {
		return 'suggestion';
	}

	private _isDetailsVisible(): boolean {
		return this.storageService.getBoolean('expandSuggestionDocs', StorageScope.GLOBAL, expandSuggestionDocsByDefault);
	}

	private _setDetailsVisible(value: boolean) {
		this.storageService.store('expandSuggestionDocs', value, StorageScope.GLOBAL);
	}

	dispose(): void {
		this.details.dispose();
		this.list.dispose();
		this.status.dispose();
		this._disposables.dispose();
		this.loadingTimeout.dispose();
		this.showTimeout.dispose();
		this.editor.removeContentWidget(this);
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
