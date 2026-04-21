/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/planReviewFeedback.css';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from '../../../../../editor/browser/editorBrowser.js';
import { IEditorContribution, IEditorDecorationsCollection } from '../../../../../editor/common/editorCommon.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../../editor/browser/editorExtensions.js';
import { EditorOption } from '../../../../../editor/common/config/editorOptions.js';
import { SelectionDirection } from '../../../../../editor/common/core/selection.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { OverviewRulerLane } from '../../../../../editor/common/model.js';
import { themeColorFromId } from '../../../../../platform/theme/common/themeService.js';
import { overviewRulerInfo } from '../../../../../editor/common/core/editorColorRegistry.js';
import { addStandardDisposableListener, getWindow, ModifierKeyEmitter } from '../../../../../base/browser/dom.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { localize } from '../../../../../nls.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { IPlanReviewFeedbackService } from './planReviewFeedbackService.js';
import { hasPlanReviewFeedback, navigationBearingFakeActionId, PlanReviewFeedbackMenuId, submitPlanReviewFeedbackActionId } from './planReviewFeedbackEditorActions.js';
import { ActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';

class PlanReviewFeedbackInputWidget implements IOverlayWidget {

	private static readonly _ID = 'planReviewFeedback.inputWidget';
	private static readonly _MIN_WIDTH = 150;
	private static readonly _MAX_WIDTH = 400;

	readonly allowEditorOverflow = false;

	private readonly _domNode: HTMLElement;
	private readonly _inputElement: HTMLTextAreaElement;
	private readonly _measureElement: HTMLElement;
	private readonly _actionBar: ActionBar;
	private readonly _addAction: Action;
	private readonly _addAndSubmitAction: Action;
	private _position: IOverlayWidgetPosition | null = null;
	private _lineHeight = 22;

	private readonly _onDidTriggerAdd = new Emitter<void>();
	readonly onDidTriggerAdd: Event<void> = this._onDidTriggerAdd.event;

	private readonly _onDidTriggerAddAndSubmit = new Emitter<void>();
	readonly onDidTriggerAddAndSubmit: Event<void> = this._onDidTriggerAddAndSubmit.event;

	constructor(
		private readonly _editor: ICodeEditor,
	) {
		this._domNode = document.createElement('div');
		this._domNode.classList.add('plan-review-feedback-input-widget');
		this._domNode.style.display = 'none';

		this._inputElement = document.createElement('textarea');
		this._inputElement.rows = 1;
		this._inputElement.placeholder = localize('planReviewFeedback.addFeedback', "Add Feedback");
		this._domNode.appendChild(this._inputElement);

		// Hidden element used to measure text width for auto-growing
		this._measureElement = document.createElement('span');
		this._measureElement.classList.add('plan-review-feedback-input-measure');
		this._domNode.appendChild(this._measureElement);

		// Action bar with add/submit actions
		const actionsContainer = document.createElement('div');
		actionsContainer.classList.add('plan-review-feedback-input-actions');
		this._domNode.appendChild(actionsContainer);

		this._addAction = new Action(
			'planReviewFeedback.add',
			localize('planReviewFeedback.add', "Add Feedback (Enter)"),
			ThemeIcon.asClassName(Codicon.plus),
			false,
			() => { this._onDidTriggerAdd.fire(); return Promise.resolve(); }
		);

		this._addAndSubmitAction = new Action(
			'planReviewFeedback.addAndSubmit',
			localize('planReviewFeedback.addAndSubmit', "Add Feedback and Submit (Alt+Enter)"),
			ThemeIcon.asClassName(Codicon.send),
			false,
			() => { this._onDidTriggerAddAndSubmit.fire(); return Promise.resolve(); }
		);

		this._actionBar = new ActionBar(actionsContainer);
		this._actionBar.push(this._addAction, { icon: true, label: false, keybinding: localize('enter', "Enter") });

		// Toggle to alt action when Alt key is held
		const modifierKeyEmitter = ModifierKeyEmitter.getInstance();
		modifierKeyEmitter.event(status => {
			this._updateActionForAlt(status.altKey);
		});

		this._inputElement.style.lineHeight = `${this._lineHeight}px`;
	}

	private _isShowingAlt = false;

	private _updateActionForAlt(altKey: boolean): void {
		if (altKey && !this._isShowingAlt) {
			this._isShowingAlt = true;
			this._actionBar.clear();
			this._actionBar.push(this._addAndSubmitAction, { icon: true, label: false, keybinding: localize('altEnter', "Alt+Enter") });
		} else if (!altKey && this._isShowingAlt) {
			this._isShowingAlt = false;
			this._actionBar.clear();
			this._actionBar.push(this._addAction, { icon: true, label: false, keybinding: localize('enter', "Enter") });
		}
	}

	getId(): string {
		return PlanReviewFeedbackInputWidget._ID;
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return this._position;
	}

	get inputElement(): HTMLTextAreaElement {
		return this._inputElement;
	}

	setPosition(position: IOverlayWidgetPosition | null): void {
		this._position = position;
		this._editor.layoutOverlayWidget(this);
	}

	show(): void {
		this._domNode.style.display = '';
	}

	hide(): void {
		this._domNode.style.display = 'none';
	}

	clearInput(): void {
		this._inputElement.value = '';
		this._updateActionEnabled();
		this._autoSize();
	}

	autoSize(): void {
		this._autoSize();
	}

	updateActionEnabled(): void {
		this._updateActionEnabled();
	}

	private _updateActionEnabled(): void {
		const hasText = this._inputElement.value.trim().length > 0;
		this._addAction.enabled = hasText;
		this._addAndSubmitAction.enabled = hasText;
	}

	private _autoSize(): void {
		const text = this._inputElement.value || this._inputElement.placeholder;

		// Measure the text width using the hidden span
		this._measureElement.textContent = text;
		const textWidth = this._measureElement.scrollWidth;

		// Clamp width between min and max
		const width = Math.max(PlanReviewFeedbackInputWidget._MIN_WIDTH, Math.min(textWidth + 10, PlanReviewFeedbackInputWidget._MAX_WIDTH));
		this._inputElement.style.width = `${width}px`;

		// Reset height to auto then expand to fit all content, with a minimum of 1 line
		this._inputElement.style.height = 'auto';
		const newHeight = Math.max(this._inputElement.scrollHeight, this._lineHeight);
		this._inputElement.style.height = `${newHeight}px`;
	}

	dispose(): void {
		this._actionBar.dispose();
		this._addAction.dispose();
		this._addAndSubmitAction.dispose();
		this._onDidTriggerAdd.dispose();
		this._onDidTriggerAddAndSubmit.dispose();
	}
}

class PlanReviewFeedbackOverlayWidget implements IOverlayWidget {

	private static readonly _ID = 'planReviewFeedback.overlayWidget';

	private readonly _domNode: HTMLElement;
	private readonly _toolbarNode: HTMLElement;
	private readonly _showStore = new DisposableStore();
	private readonly _navigationBearings = observableValue<{ activeIdx: number; totalCount: number }>('planReviewFeedbackBearings', { activeIdx: -1, totalCount: 0 });

	constructor(
		_codeEditor: ICodeEditor,
		private readonly _instaService: IInstantiationService,
	) {
		this._domNode = document.createElement('div');
		this._domNode.classList.add('plan-review-feedback-overlay-widget');
		this._domNode.style.display = 'none';

		this._toolbarNode = document.createElement('div');
		this._toolbarNode.classList.add('plan-review-feedback-overlay-toolbar');
		this._domNode.appendChild(this._toolbarNode);
	}

	getId(): string {
		return PlanReviewFeedbackOverlayWidget._ID;
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return { preference: OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER };
	}

	show(navigationBearings: { activeIdx: number; totalCount: number }): void {
		this._showStore.clear();
		this._navigationBearings.set(navigationBearings, undefined);
		this._domNode.style.display = '';

		this._showStore.add(this._instaService.createInstance(MenuWorkbenchToolBar, this._toolbarNode, PlanReviewFeedbackMenuId, {
			telemetrySource: 'planReviewFeedback.overlayToolbar',
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			toolbarOptions: {
				primaryGroup: () => true,
				useSeparatorsInPrimaryActions: true,
			},
			menuOptions: { renderShortTitle: true },
			actionViewItemProvider: (action, options) => {
				if (action.id === navigationBearingFakeActionId) {
					const that = this;
					return new class extends ActionViewItem {
						constructor() {
							super(undefined, action, { ...options, icon: false, label: true, keybindingNotRenderedWithLabel: true });
						}

						override render(container: HTMLElement): void {
							super.render(container);
							container.classList.add('label-item');

							this._store.add(autorun(r => {
								if (!this.label) {
									return;
								}
								const { activeIdx, totalCount } = that._navigationBearings.read(r);
								if (totalCount > 0) {
									const current = activeIdx === -1 ? 1 : activeIdx + 1;
									this.label.innerText = localize('nOfM', '{0}/{1}', current, totalCount);
								} else {
									this.label.innerText = localize('zero', '0/0');
								}
							}));
						}
					};
				}

				const isPrimary = action.id === submitPlanReviewFeedbackActionId;
				return new class extends ActionViewItem {
					constructor() {
						super(undefined, action, { ...options, icon: !isPrimary, label: isPrimary, keybindingNotRenderedWithLabel: true });
					}

					override render(container: HTMLElement): void {
						super.render(container);
						if (isPrimary) {
							this.element?.classList.add('primary');
						}
					}
				};
			},
		}));
	}

	hide(): void {
		this._showStore.clear();
		this._domNode.style.display = 'none';
		this._navigationBearings.set({ activeIdx: -1, totalCount: 0 }, undefined);
	}

	dispose(): void {
		this._showStore.dispose();
	}
}

export class PlanReviewFeedbackEditorContribution extends Disposable implements IEditorContribution {

	static readonly ID = 'planReviewFeedback.editorContribution';

	private _widget: PlanReviewFeedbackInputWidget | undefined;
	private _overlayWidget: PlanReviewFeedbackOverlayWidget | undefined;
	private _visible = false;
	private _mouseDown = false;
	private _suppressSelectionChangeOnce = false;
	private _isActivePlan = false;
	private readonly _widgetListeners = this._register(new DisposableStore());
	private readonly _decorations: IEditorDecorationsCollection;
	private readonly _hasFeedbackContextKey;

	constructor(
		private readonly _editor: ICodeEditor,
		@IPlanReviewFeedbackService private readonly _planReviewFeedbackService: IPlanReviewFeedbackService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._decorations = this._editor.createDecorationsCollection();
		this._hasFeedbackContextKey = hasPlanReviewFeedback.bindTo(contextKeyService);

		this._register(this._editor.onDidChangeCursorSelection(() => this._onSelectionChanged()));
		this._register(this._editor.onDidChangeModel(() => this._onModelChanged()));
		this._register(this._editor.onDidScrollChange(() => {
			if (this._visible) {
				this._updatePosition();
			}
		}));
		this._register(this._editor.onMouseDown((e) => {
			if (this._isWidgetTarget(e.event.target)) {
				return;
			}
			this._mouseDown = true;
			this._hide();
		}));
		this._register(this._editor.onMouseUp((e) => {
			this._mouseDown = false;
			if (this._isWidgetTarget(e.event.target)) {
				return;
			}
			this._onSelectionChanged();
		}));
		this._register(this._editor.onDidBlurEditorWidget(() => {
			if (!this._visible) {
				return;
			}
			getWindow(this._editor.getDomNode()!).setTimeout(() => {
				if (!this._visible) {
					return;
				}
				if (this._isWidgetTarget(getWindow(this._editor.getDomNode()!).document.activeElement)) {
					return;
				}
				this._hide();
			}, 0);
		}));
		this._register(this._editor.onDidFocusEditorText(() => this._onSelectionChanged()));
		this._register(this._planReviewFeedbackService.onDidChangeRegistrations(() => this._onModelChanged()));
		this._register(this._planReviewFeedbackService.onDidChangeFeedback(() => this._updateDecorations()));
		this._register(this._planReviewFeedbackService.onDidChangeNavigation(() => this._updateDecorations()));
	}

	private _isWidgetTarget(target: EventTarget | Element | null): boolean {
		return !!this._widget && !!target && this._widget.getDomNode().contains(target as Node);
	}

	private _ensureWidget(): PlanReviewFeedbackInputWidget {
		if (!this._widget) {
			this._widget = new PlanReviewFeedbackInputWidget(this._editor);
			this._register(this._widget.onDidTriggerAdd(() => this._addFeedback()));
			this._register(this._widget.onDidTriggerAddAndSubmit(() => this._addFeedbackAndSubmit()));
			this._editor.addOverlayWidget(this._widget);
		}
		return this._widget;
	}

	private _onModelChanged(): void {
		this._hide();
		this._suppressSelectionChangeOnce = false;

		const model = this._editor.getModel();
		this._isActivePlan = !!model && this._planReviewFeedbackService.isActivePlanReview(model.uri);
		this._updateDecorations();
	}

	private _onSelectionChanged(): void {
		if (this._suppressSelectionChangeOnce) {
			this._suppressSelectionChangeOnce = false;
			return;
		}

		if (this._mouseDown || !this._editor.hasTextFocus()) {
			return;
		}

		if (!this._isActivePlan) {
			this._hide();
			return;
		}

		const selection = this._editor.getSelection();
		if (!selection) {
			this._hide();
			return;
		}

		const model = this._editor.getModel();
		if (!model) {
			this._hide();
			return;
		}

		this._show();
	}

	private _show(): void {
		const widget = this._ensureWidget();

		if (!this._visible) {
			this._visible = true;
			this._registerWidgetListeners(widget);
		}

		widget.clearInput();
		widget.show();
		this._updatePosition();
	}

	private _hide(): void {
		if (!this._visible) {
			return;
		}

		this._visible = false;
		this._widgetListeners.clear();

		if (this._widget) {
			this._widget.hide();
			this._widget.setPosition(null);
			this._widget.clearInput();
		}
	}

	private _registerWidgetListeners(widget: PlanReviewFeedbackInputWidget): void {
		this._widgetListeners.clear();

		const editorDomNode = this._editor.getDomNode();
		if (editorDomNode) {
			this._widgetListeners.add(addStandardDisposableListener(editorDomNode, 'keydown', e => {
				if (!this._visible) {
					return;
				}

				if (!this._editor.hasTextFocus()) {
					return;
				}

				if (e.keyCode === KeyCode.Ctrl || e.keyCode === KeyCode.Shift || e.keyCode === KeyCode.Alt || e.keyCode === KeyCode.Meta) {
					return;
				}

				if (e.keyCode === KeyCode.Escape) {
					this._hide();
					this._editor.focus();
					return;
				}

				// Ctrl+I / Cmd+I explicitly focuses the feedback input
				if ((e.ctrlKey || e.metaKey) && e.keyCode === KeyCode.KeyI) {
					e.preventDefault();
					e.stopPropagation();
					widget.inputElement.focus();
					return;
				}

				if (e.ctrlKey || e.altKey || e.metaKey) {
					return;
				}

				// Keep caret/navigation keys in the editor
				if (
					e.keyCode === KeyCode.UpArrow
					|| e.keyCode === KeyCode.DownArrow
					|| e.keyCode === KeyCode.LeftArrow
					|| e.keyCode === KeyCode.RightArrow
				) {
					return;
				}

				// Only auto-focus the input on typing when the document is readonly
				if (!this._editor.getOption(EditorOption.readOnly)) {
					return;
				}

				if (getWindow(widget.inputElement).document.activeElement !== widget.inputElement) {
					widget.inputElement.focus();
				}
			}));
		}

		// Listen for keydown on the input element
		this._widgetListeners.add(addStandardDisposableListener(widget.inputElement, 'keydown', e => {
			if (e.keyCode === KeyCode.Escape) {
				e.preventDefault();
				e.stopPropagation();
				this._hide();
				this._editor.focus();
				return;
			}

			if (e.keyCode === KeyCode.Enter && e.altKey) {
				e.preventDefault();
				e.stopPropagation();
				this._addFeedbackAndSubmit();
				return;
			}

			if (e.keyCode === KeyCode.Enter) {
				e.preventDefault();
				e.stopPropagation();
				this._addFeedback();
				return;
			}
		}));

		// Stop propagation of input events so the editor doesn't handle them
		this._widgetListeners.add(addStandardDisposableListener(widget.inputElement, 'keypress', e => {
			e.stopPropagation();
		}));

		// Auto-size the textarea as the user types
		this._widgetListeners.add(addStandardDisposableListener(widget.inputElement, 'input', () => {
			widget.autoSize();
			widget.updateActionEnabled();
			this._updatePosition();
		}));

		// Hide when input loses focus to something outside both editor and widget
		this._widgetListeners.add(addStandardDisposableListener(widget.inputElement, 'blur', () => {
			const win = getWindow(widget.inputElement);
			win.setTimeout(() => {
				if (!this._visible) {
					return;
				}
				if (this._editor.hasWidgetFocus()) {
					return;
				}
				this._hide();
			}, 0);
		}));
	}

	private _hideAndRefocusEditor(): void {
		this._suppressSelectionChangeOnce = true;
		this._hide();
		this._editor.focus();
	}

	private _addFeedback(): boolean {
		if (!this._widget) {
			return false;
		}

		const text = this._widget.inputElement.value.trim();
		if (!text) {
			return false;
		}

		const selection = this._editor.getSelection();
		const model = this._editor.getModel();
		if (!selection || !model) {
			return false;
		}

		const line = selection.startLineNumber;
		const column = selection.startColumn;
		this._planReviewFeedbackService.addFeedback(model.uri, line, column, text);
		this._hideAndRefocusEditor();
		return true;
	}

	private _addFeedbackAndSubmit(): void {
		if (!this._widget) {
			return;
		}

		const text = this._widget.inputElement.value.trim();
		if (!text) {
			return;
		}

		const selection = this._editor.getSelection();
		const model = this._editor.getModel();
		if (!selection || !model) {
			return;
		}

		const line = selection.startLineNumber;
		const column = selection.startColumn;
		this._planReviewFeedbackService.addFeedback(model.uri, line, column, text);
		this._hideAndRefocusEditor();
		this._planReviewFeedbackService.submitAllFeedback(model.uri);
	}

	private _updatePosition(): void {
		if (!this._widget || !this._visible) {
			return;
		}

		const selection = this._editor.getSelection();
		if (!selection) {
			this._hide();
			return;
		}

		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
		const layoutInfo = this._editor.getLayoutInfo();
		const widgetDom = this._widget.getDomNode();
		const widgetHeight = widgetDom.offsetHeight || 30;
		const widgetWidth = widgetDom.offsetWidth || 150;

		const cursorPosition = selection.getDirection() === SelectionDirection.LTR
			? selection.getEndPosition()
			: selection.getStartPosition();

		const scrolledPosition = this._editor.getScrolledVisiblePosition(cursorPosition);
		if (!scrolledPosition) {
			this._widget.setPosition(null);
			return;
		}

		// Place below for LTR, above for RTL, with flip if out of bounds
		let top: number;
		if (selection.getDirection() === SelectionDirection.LTR) {
			top = scrolledPosition.top + lineHeight;
			if (top + widgetHeight > layoutInfo.height) {
				top = scrolledPosition.top - widgetHeight;
			}
		} else {
			top = scrolledPosition.top - widgetHeight;
			if (top < 0) {
				top = scrolledPosition.top + lineHeight;
			}
		}

		top = Math.max(0, Math.min(top, layoutInfo.height - widgetHeight));
		const left = Math.max(0, Math.min(scrolledPosition.left, layoutInfo.width - widgetWidth));

		this._widget.setPosition({ preference: { top, left } });
	}

	private _updateDecorations(): void {
		const model = this._editor.getModel();
		if (!model || !this._isActivePlan) {
			this._decorations.clear();
			this._hasFeedbackContextKey.set(false);
			this._hideOverlayToolbar();
			return;
		}

		const items = this._planReviewFeedbackService.getFeedback(model.uri);
		this._hasFeedbackContextKey.set(items.length > 0);

		if (items.length > 0) {
			const bearings = this._planReviewFeedbackService.getNavigationBearing(model.uri);
			this._showOverlayToolbar(bearings);
		} else {
			this._hideOverlayToolbar();
		}

		this._decorations.set(
			items.map(item => ({
				range: new Range(item.line, item.column, item.line, item.column),
				options: {
					description: 'plan-review-feedback',
					glyphMarginClassName: ThemeIcon.asClassName(Codicon.comment),
					glyphMarginHoverMessage: { value: item.text },
					overviewRuler: {
						color: themeColorFromId(overviewRulerInfo),
						position: OverviewRulerLane.Center,
					},
					lineNumberClassName: 'plan-review-feedback-line-number',
				}
			}))
		);
	}

	private _ensureOverlayWidget(): PlanReviewFeedbackOverlayWidget {
		if (!this._overlayWidget) {
			this._overlayWidget = new PlanReviewFeedbackOverlayWidget(this._editor, this._instantiationService);
			this._editor.addOverlayWidget(this._overlayWidget);
		}
		return this._overlayWidget;
	}

	private _showOverlayToolbar(bearings: { activeIdx: number; totalCount: number }): void {
		const widget = this._ensureOverlayWidget();
		widget.show(bearings);
	}

	private _hideOverlayToolbar(): void {
		if (this._overlayWidget) {
			this._overlayWidget.hide();
		}
	}

	override dispose(): void {
		if (this._widget) {
			this._editor.removeOverlayWidget(this._widget);
			this._widget.dispose();
			this._widget = undefined;
		}
		if (this._overlayWidget) {
			this._editor.removeOverlayWidget(this._overlayWidget);
			this._overlayWidget.dispose();
			this._overlayWidget = undefined;
		}
		super.dispose();
	}
}

registerEditorContribution(PlanReviewFeedbackEditorContribution.ID, PlanReviewFeedbackEditorContribution, EditorContributionInstantiation.Eventually);
