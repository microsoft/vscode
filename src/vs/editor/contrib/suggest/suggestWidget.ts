/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/suggest';
import 'vs/base/browser/ui/codicons/codiconStyles'; // The codicon symbol styles are defined here and must be loaded
import 'vs/editor/contrib/documentSymbols/outlineTree'; // The codicon symbol colors are defined here and must be loaded
import * as nls from 'vs/nls';
import * as strings from 'vs/base/common/strings';
import * as dom from 'vs/base/browser/dom';
import { Event, Emitter } from 'vs/base/common/event';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable, DisposableStore, Disposable } from 'vs/base/common/lifecycle';
import { IListEvent, IListMouseEvent, IListGestureEvent } from 'vs/base/browser/ui/list/list';
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
import { MarkdownRenderer } from 'vs/editor/browser/core/markdownRenderer';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { TimeoutTimer, CancelablePromise, createCancelablePromise, disposableTimeout } from 'vs/base/common/async';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { SuggestDetailsWidget, canExpandCompletionItem, SuggestDetailsOverlay } from './suggestWidgetDetails';
import { SuggestWidgetStatus } from 'vs/editor/contrib/suggest/suggestWidgetStatus';
import { getAriaId, ItemRenderer } from './suggestWidgetRenderer';
import { ResizableHTMLElement } from './resizable';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';

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

class PersistedWidgetSize {

	private readonly _key: string;

	constructor(
		private readonly _service: IStorageService,
		editor: ICodeEditor
	) {
		this._key = `suggestWidget.size/${editor.getEditorType()}/${editor instanceof EmbeddedCodeEditorWidget}`;
	}

	restore(): dom.Dimension | undefined {
		const raw = this._service.get(this._key, StorageScope.GLOBAL) ?? '';
		try {
			const obj = JSON.parse(raw);
			if (dom.Dimension.is(obj)) {
				return dom.Dimension.lift(obj);
			}
		} catch {
			// ignore
		}
		return undefined;
	}

	store(size: dom.Dimension) {
		this._service.store(this._key, JSON.stringify(size), StorageScope.GLOBAL);
	}
}

export class SuggestWidget implements IContentWidget, IDisposable {

	private static readonly ID: string = 'editor.widget.suggestWidget';

	private static LOADING_MESSAGE: string = nls.localize('suggestWidget.loading', "Loading...");
	private static NO_SUGGESTIONS_MESSAGE: string = nls.localize('suggestWidget.noSuggestions', "No suggestions.");

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

	private element: ResizableHTMLElement;
	private messageElement: HTMLElement;
	private listElement: HTMLElement;
	private list: List<CompletionItem>;
	private status: SuggestWidgetStatus;
	private _details: SuggestDetailsOverlay;

	private readonly ctxSuggestWidgetVisible: IContextKey<boolean>;
	private readonly ctxSuggestWidgetDetailsVisible: IContextKey<boolean>;
	private readonly ctxSuggestWidgetMultipleSuggestions: IContextKey<boolean>;

	private readonly showTimeout = new TimeoutTimer();
	private readonly _disposables = new DisposableStore();

	private readonly _persistedSize: PersistedWidgetSize;

	private readonly onDidSelectEmitter = new Emitter<ISelectedSuggestion>();
	private readonly onDidFocusEmitter = new Emitter<ISelectedSuggestion>();
	private readonly onDidHideEmitter = new Emitter<this>();
	private readonly onDidShowEmitter = new Emitter<this>();

	readonly onDidSelect: Event<ISelectedSuggestion> = this.onDidSelectEmitter.event;
	readonly onDidFocus: Event<ISelectedSuggestion> = this.onDidFocusEmitter.event;
	readonly onDidHide: Event<this> = this.onDidHideEmitter.event;
	readonly onDidShow: Event<this> = this.onDidShowEmitter.event;

	private _resizePosition?: ContentWidgetPositionPreference;
	private _widgetPosition?: ContentWidgetPositionPreference;

	private detailsFocusBorderColor?: string;
	private detailsBorderColor?: string;

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
		const markdownRenderer = this._disposables.add(new MarkdownRenderer({ editor }, modeService, openerService));
		const kbToggleDetails = keybindingService.lookupKeybinding('toggleSuggestionDetails')?.getLabel() ?? '';

		this.element = new ResizableHTMLElement();
		this.element.domNode.classList.add('editor-widget', 'suggest-widget');

		this._persistedSize = new PersistedWidgetSize(storageService, editor);

		let persistedSize: dom.Dimension | undefined;
		let persistHeight = false;
		let persistWidth = false;
		this._disposables.add(this.element.onDidWillResize(() => {
			this._resizePosition = this._widgetPosition;
			persistedSize = this._persistedSize.restore();
		}));
		this._disposables.add(this.element.onDidResize(e => {
			this._layout(e.dimension);
			persistHeight = persistHeight || !!e.north || !!e.south;
			persistWidth = persistWidth || !!e.east || !!e.west;
			if (e.done) {

				// only store width or height value that have changed
				let { width, height } = this.element.size;
				if (persistedSize) {
					if (!persistHeight) {
						height = persistedSize.height;
					}
					if (!persistWidth) {
						width = persistedSize.width;
					}
				}
				this._persistedSize.store(new dom.Dimension(width, height));

				// reset working state
				this._resizePosition = undefined;
				persistedSize = undefined;
				persistHeight = false;
				persistWidth = false;
			}
		}));

		this.messageElement = dom.append(this.element.domNode, dom.$('.message'));
		this.listElement = dom.append(this.element.domNode, dom.$('.tree'));

		const details = instantiationService.createInstance(SuggestDetailsWidget, this.editor, markdownRenderer, kbToggleDetails);
		details.onDidClose(this.toggleDetails, this, this._disposables);
		this._details = new SuggestDetailsOverlay(details, this.editor);

		const applyIconStyle = () => this.element.domNode.classList.toggle('no-icons', !this.editor.getOption(EditorOption.suggest).showIcons);
		applyIconStyle();


		const renderer = instantiationService.createInstance(ItemRenderer, this.editor, kbToggleDetails);
		this._disposables.add(renderer);
		this._disposables.add(renderer.onDidToggleDetails(() => this.toggleDetails()));

		this.list = new List('SuggestWidget', this.listElement, {
			getHeight: (_element: CompletionItem): number => this._getLayoutInfo().itemHeight,
			getTemplateId: (_element: CompletionItem): string => 'suggestion'
		}, [renderer], {
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

		this.status = instantiationService.createInstance(SuggestWidgetStatus, this.element.domNode);
		const applyStatusBarStyle = () => this.element.domNode.classList.toggle('with-status-bar', this.editor.getOption(EditorOption.suggest).statusBar.visible);
		applyStatusBarStyle();

		this._disposables.add(attachListStyler(this.list, themeService, {
			listInactiveFocusBackground: editorSuggestWidgetSelectedBackground,
			listInactiveFocusOutline: activeContrastBorder
		}));
		this._disposables.add(themeService.onDidColorThemeChange(t => this.onThemeChange(t)));
		this.onThemeChange(themeService.getColorTheme());

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


		this._disposables.add(dom.addStandardDisposableListener(this._details.widget.domNode, 'keydown', e => {
			this._onDetailsKeydown.fire(e);
		}));

		this._disposables.add(this.editor.onMouseDown((e: IEditorMouseEvent) => this.onEditorMouseDown(e)));
	}

	dispose(): void {
		this._details.widget.dispose();
		this._details.dispose();
		this.list.dispose();
		this.status.dispose();
		this._disposables.dispose();
		this.loadingTimeout.dispose();
		this.showTimeout.dispose();
		this.editor.removeContentWidget(this);
		this.element.dispose();
	}

	private onEditorMouseDown(mouseEvent: IEditorMouseEvent): void {
		// Clicking inside details
		if (this._details.widget.domNode.contains(mouseEvent.target.element)) {
			this._details.widget.domNode.focus();
		}
		// Clicking outside details and inside suggest
		else {
			if (this.element.domNode.contains(mouseEvent.target.element)) {
				this.editor.focus();
			}
		}
	}

	private onCursorSelectionChanged(): void {
		if (this.state !== State.Hidden) {
			this.editor.layoutContentWidget(this);
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
			this.element.domNode.style.backgroundColor = backgroundColor.toString();
			this.messageElement.style.backgroundColor = backgroundColor.toString();
			this._details.widget.domNode.style.backgroundColor = backgroundColor.toString();
		}
		const borderColor = theme.getColor(editorSuggestWidgetBorder);
		if (borderColor) {
			this.element.domNode.style.borderColor = borderColor.toString();
			this.messageElement.style.borderColor = borderColor.toString();
			this.status.element.style.borderTopColor = borderColor.toString();
			this._details.widget.domNode.style.borderColor = borderColor.toString();
			this.detailsBorderColor = borderColor.toString();
		}
		const focusBorderColor = theme.getColor(focusBorder);
		if (focusBorderColor) {
			this.detailsFocusBorderColor = focusBorderColor.toString();
		}
		this._details.widget.borderWidth = theme.type === 'hc' ? 2 : 1;
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

		if (item !== this.focusedItem) {

			this.currentSuggestionDetails?.cancel();
			this.currentSuggestionDetails = undefined;

			this.focusedItem = item;

			this.list.reveal(index);

			this.currentSuggestionDetails = createCancelablePromise(async token => {
				const loading = disposableTimeout(() => {
					if (this._isDetailsVisible()) {
						this.showDetails(true);
					}
				}, 250);
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
					this.element.domNode.classList.remove('docs-side');
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

		this.element.domNode.classList.toggle('frozen', state === State.Frozen);

		switch (state) {
			case State.Hidden:
				dom.hide(this.messageElement, this.listElement, this.status.element);
				this._details.hide();
				this.hide();
				// this.listHeight = 0;
				if (stateChanged) {
					this.list.splice(0, this.list.length);
				}
				this.focusedItem = undefined;
				break;
			case State.Loading:
				this.messageElement.textContent = SuggestWidget.LOADING_MESSAGE;
				dom.hide(this.listElement, this.status.element);
				dom.show(this.messageElement);
				this._details.hide();
				this.show();
				this.focusedItem = undefined;
				break;
			case State.Empty:
				this.messageElement.textContent = SuggestWidget.NO_SUGGESTIONS_MESSAGE;
				dom.hide(this.listElement, this.status.element);
				dom.show(this.messageElement);
				this._details.hide();
				this.show();
				this.focusedItem = undefined;
				break;
			case State.Open:
				dom.hide(this.messageElement);
				dom.show(this.listElement, this.status.element);
				this.show();
				break;
			case State.Frozen:
				dom.hide(this.messageElement);
				dom.show(this.listElement, this.status.element);
				this.show();
				break;
			case State.Details:
				dom.hide(this.messageElement);
				dom.show(this.listElement, this.status.element);
				this._details.show();
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

		const visibleCount = this.completionModel.items.length;
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
				this._details.widget.domNode.style.borderColor = this.detailsBorderColor;
			}
		}
	}

	selectNextPage(): boolean {
		switch (this.state) {
			case State.Hidden:
				return false;
			case State.Details:
				this._details.widget.pageDown();
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
				this._details.widget.scrollBottom();
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
				this._details.widget.pageUp();
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
				this._details.widget.scrollTop();
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
				this._details.widget.domNode.style.borderColor = this.detailsBorderColor;
			}
		} else if (this.state === State.Open && this._isDetailsVisible()) {
			this.setState(State.Details);
			if (this.detailsFocusBorderColor) {
				this._details.widget.domNode.style.borderColor = this.detailsFocusBorderColor;
			}
		}
		this.telemetryService.publicLog2('suggestWidget:toggleDetailsFocus');
	}

	toggleDetails(): void {
		if (this._isDetailsVisible()) {
			// hide details widget
			this.ctxSuggestWidgetDetailsVisible.set(false);
			this._setDetailsVisible(false);
			this._details.hide();
			this.element.domNode.classList.remove('shows-details');
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
		if (loading) {
			this._details.widget.renderLoading();
		} else {
			this._details.widget.renderItem(this.list.getFocusedElements()[0], this.explainMode);
		}
		this._details.show();
		this._positionDetails();
		this.editor.focus();
		this.element.domNode.classList.add('shows-details');
	}

	toggleExplainMode(): void {
		if (this.list.getFocusedElements()[0] && this._isDetailsVisible()) {
			this.explainMode = !this.explainMode;
			this.showDetails(false);
		}
	}

	private show(): void {
		this._layout(this._persistedSize.restore());
		this.ctxSuggestWidgetVisible.set(true);

		this.showTimeout.cancelAndSet(() => {
			this.element.domNode.classList.add('visible');
			this.onDidShowEmitter.fire(this);
		}, 100);
	}

	private hide(): void {
		this.editor.layoutContentWidget(this);
		this.ctxSuggestWidgetVisible.reset();
		this.ctxSuggestWidgetMultipleSuggestions.reset();
		this.element.domNode.classList.remove('visible');
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
		if (!this._widgetPosition) {
			return null;
		}
		return {
			position: this.editor.getPosition(),
			preference: [this._resizePosition ?? this._widgetPosition]
		};
	}

	getDomNode(): HTMLElement {
		return this.element.domNode;
	}

	getId(): string {
		return SuggestWidget.ID;
	}

	isFrozen(): boolean {
		return this.state === State.Frozen;
	}

	beforeRender() {
		const { height, width } = this.element.size;
		const { borderWidth } = this._getLayoutInfo();
		return new dom.Dimension(width + 2 * borderWidth, height + 2 * borderWidth);
	}

	afterRender(position: ContentWidgetPositionPreference | null) {
		if (position === null) {
			if (this._isDetailsVisible()) {
				this._details.hide(); //todo@jrieken soft-hide
			}
			return;
		}
		if (this.state === State.Empty || this.state === State.Loading) {
			// no special positioning when widget isn't showing list
			return;
		}
		if (this._isDetailsVisible()) {
			this._details.show();
		}
		this._positionDetails();
	}

	private _layout(size: dom.Dimension | undefined): void {
		if (!this.editor.hasModel()) {
			return;
		}
		if (!this.editor.getDomNode()) {
			// happens when running tests
			return;
		}

		let height = size?.height;
		let width = size?.width;

		const bodyBox = dom.getClientArea(document.body);
		const { itemHeight, statusBarHeight, borderHeight, typicalHalfwidthCharacterWidth } = this._getLayoutInfo();

		if (this.state === State.Empty || this.state === State.Loading) {
			// showing a message only
			height = itemHeight + borderHeight;
			width = 230;
			this.element.enableSashes(false, false, false, false);
			this.element.minSize = this.element.maxSize = new dom.Dimension(width, height);
			this._widgetPosition = ContentWidgetPositionPreference.BELOW;

		} else {
			// showing items

			// width math
			const maxWidth = bodyBox.width - borderHeight;
			if (width === undefined) {
				width = 430;
			}
			if (width > maxWidth) {
				width = maxWidth;
			}
			const preferredWidth = this.completionModel ? this.completionModel.stats.avgLabelLen.value * typicalHalfwidthCharacterWidth : width;

			// height math
			const fullHeight = statusBarHeight + this.list.contentHeight + borderHeight;
			const preferredHeight = statusBarHeight + (itemHeight * this.editor.getOption(EditorOption.suggest).maxVisibleSuggestions) + borderHeight;
			const minHeight = itemHeight + statusBarHeight;
			const editorBox = dom.getDomNodePagePosition(this.editor.getDomNode());
			const cursorBox = this.editor.getScrolledVisiblePosition(this.editor.getPosition());
			const cursorBottom = editorBox.top + cursorBox.top + cursorBox.height;
			const maxHeightBelow = bodyBox.height - cursorBottom;
			const maxHeightAbove = editorBox.top + cursorBox.top - 22 /*TOP_PADDING of contentWidget#_layoutBoxInPage*/;
			let maxHeight = Math.min(Math.max(maxHeightAbove, maxHeightBelow) - borderHeight, fullHeight);


			if (height === undefined) {
				height = Math.min(preferredHeight, fullHeight);
			}
			if (height < minHeight) {
				height = minHeight;
			}
			if (height > maxHeight) {
				height = maxHeight;
			}

			if (height > maxHeightBelow) {
				this._widgetPosition = ContentWidgetPositionPreference.ABOVE;
				this.element.enableSashes(true, true, false, false);
				maxHeight = maxHeightAbove;

			} else {
				this._widgetPosition = ContentWidgetPositionPreference.BELOW;
				this.element.enableSashes(false, true, true, false);
				maxHeight = maxHeightBelow;
			}

			this.list.layout(height - statusBarHeight, width);
			this.listElement.style.height = `${height - statusBarHeight}px`;

			this.element.preferredSize = new dom.Dimension(preferredWidth, preferredHeight);
			this.element.maxSize = new dom.Dimension(maxWidth, maxHeight);
			this.element.minSize = new dom.Dimension(220, minHeight);
		}


		this.element.layout(height, width);
		this.editor.layoutContentWidget(this);

		this._positionDetails();
	}

	private _positionDetails(): void {
		if (this._isDetailsVisible()) {
			this._details.placeAtAnchor(this.element.domNode);
		}
	}

	private _getLayoutInfo() {
		const fontInfo = this.editor.getOption(EditorOption.fontInfo);
		const itemHeight = this.editor.getOption(EditorOption.suggestLineHeight) || fontInfo.lineHeight;
		const statusBarHeight = !this.editor.getOption(EditorOption.suggest).statusBar.visible || this.state === State.Empty || this.state === State.Loading ? 0 : itemHeight;
		const borderWidth = this._details.widget.borderWidth;
		const borderHeight = 2 * borderWidth;
		return { itemHeight, statusBarHeight, borderWidth, borderHeight, typicalHalfwidthCharacterWidth: fontInfo.typicalHalfwidthCharacterWidth };
	}

	private _isDetailsVisible(): boolean {
		return this.storageService.getBoolean('expandSuggestionDocs', StorageScope.GLOBAL, false);
	}

	private _setDetailsVisible(value: boolean) {
		this.storageService.store('expandSuggestionDocs', value, StorageScope.GLOBAL);
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
