/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { $, getWindow } from '../../../../../base/browser/dom.js';
import { IContextKey, IContextKeyService, ContextKeyExpr, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyMod, KeyCode } from '../../../../../base/common/keyCodes.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { SimpleFindWidget } from '../../../codeEditor/browser/find/simpleFindWidget.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { BrowserEditor, BrowserEditorContribution, CONTEXT_BROWSER_HAS_ERROR, CONTEXT_BROWSER_HAS_URL } from '../browserEditor.js';
import { BROWSER_EDITOR_ACTIVE, BrowserActionCategory, BrowserActionGroup } from '../browserViewActions.js';

const CONTEXT_BROWSER_FIND_WIDGET_VISIBLE = new RawContextKey<boolean>('browserFindWidgetVisible', false, localize('browser.findWidgetVisible', "Whether the browser find widget is visible"));
const CONTEXT_BROWSER_FIND_WIDGET_FOCUSED = new RawContextKey<boolean>('browserFindWidgetFocused', false, localize('browser.findWidgetFocused', "Whether the browser find widget is focused"));

/**
 * Find widget for the integrated browser view.
 * Uses the SimpleFindWidget base class and communicates with the browser view model
 * to perform find operations in the rendered web page.
 */
class BrowserFindWidget extends SimpleFindWidget {
	private _model: IBrowserViewModel | undefined;
	private readonly _modelDisposables = this._register(new DisposableStore());
	private readonly _findWidgetVisible: IContextKey<boolean>;
	private readonly _findWidgetFocused: IContextKey<boolean>;
	private _lastFindResult: { resultIndex: number; resultCount: number } | undefined;
	private _hasFoundMatch = false;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	constructor(
		container: HTMLElement,
		@IContextViewService contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHoverService hoverService: IHoverService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IConfigurationService configurationService: IConfigurationService,
		@IAccessibilityService accessibilityService: IAccessibilityService
	) {
		super({
			showCommonFindToggles: true,
			checkImeCompletionState: true,
			showResultCount: true,
			enableSash: true,
			initialWidth: 350,
			previousMatchActionId: BrowserViewCommandId.FindPrevious,
			nextMatchActionId: BrowserViewCommandId.FindNext,
			closeWidgetActionId: BrowserViewCommandId.HideFind
		}, contextViewService, contextKeyService, hoverService, keybindingService, configurationService, accessibilityService);

		this._findWidgetVisible = CONTEXT_BROWSER_FIND_WIDGET_VISIBLE.bindTo(contextKeyService);
		this._findWidgetFocused = CONTEXT_BROWSER_FIND_WIDGET_FOCUSED.bindTo(contextKeyService);

		const domNode = this.getDomNode();
		container.appendChild(domNode);

		let lastHeight = domNode.offsetHeight;
		const resizeObserver = new (getWindow(container).ResizeObserver)(() => {
			const newHeight = domNode.offsetHeight;
			if (newHeight !== lastHeight) {
				lastHeight = newHeight;
				this._onDidChangeHeight.fire();
			}
		});
		resizeObserver.observe(domNode);
		this._register(toDisposable(() => resizeObserver.disconnect()));
	}

	/**
	 * Set the browser view model to use for find operations.
	 * This should be called whenever the editor input changes.
	 */
	setModel(model: IBrowserViewModel | undefined): void {
		this._modelDisposables.clear();
		this._model = model;
		this._lastFindResult = undefined;
		this._hasFoundMatch = false;

		if (model) {
			this._modelDisposables.add(model.onDidFindInPage(result => {
				this._lastFindResult = {
					resultIndex: result.activeMatchOrdinal - 1, // Convert to 0-based index
					resultCount: result.matches
				};
				this._hasFoundMatch = result.matches > 0;
				this.updateButtons(this._hasFoundMatch);
				this.updateResultCount();
			}));

			this._modelDisposables.add(model.onWillDispose(() => {
				this.setModel(undefined);
			}));
		}
	}

	override reveal(initialInput?: string): void {
		const wasVisible = this.isVisible();
		super.reveal(initialInput);
		this._findWidgetVisible.set(true);

		// Focus the find input
		this.focusFindBox();

		// If there's existing input and the widget wasn't already visible, trigger a search
		if (this.inputValue && !wasVisible) {
			this._onInputChanged();
		}
	}

	override hide(): void {
		super.hide(false);
		this._findWidgetVisible.reset();

		// Stop find and clear highlights in the browser view
		this._model?.stopFindInPage(true);
		this._model?.focus();
		this._lastFindResult = undefined;
		this._hasFoundMatch = false;
	}

	find(previous: boolean): void {
		const value = this.inputValue;
		if (value && this._model) {
			this._model.findInPage(value, {
				forward: !previous,
				recompute: false,
				matchCase: this._getCaseSensitiveValue()
			});
		}
	}

	findFirst(): void {
		const value = this.inputValue;
		if (value && this._model) {
			this._model.findInPage(value, {
				forward: true,
				recompute: true,
				matchCase: this._getCaseSensitiveValue()
			});
		}
	}

	clear(): void {
		if (this._model) {
			this._model.stopFindInPage(false);
			this._lastFindResult = undefined;
			this._hasFoundMatch = false;
		}
	}

	protected _onInputChanged(): boolean {
		if (this.inputValue) {
			this.findFirst();
		} else if (this._model) {
			this.clear();
		}
		return false;
	}

	protected async _getResultCount(): Promise<{ resultIndex: number; resultCount: number } | undefined> {
		return this._lastFindResult;
	}

	protected _onFocusTrackerFocus(): void {
		this._findWidgetFocused.set(true);
	}

	protected _onFocusTrackerBlur(): void {
		this._findWidgetFocused.reset();
	}

	protected _onFindInputFocusTrackerFocus(): void {
		// No-op
	}

	protected _onFindInputFocusTrackerBlur(): void {
		// No-op
	}
}

/**
 * Browser editor contribution that manages the find-in-page widget.
 *
 * Creates a container just below the toolbar and lazily instantiates the
 * {@link BrowserFindWidget}.  When the find widget's height changes the
 * browser container is re-laid-out so that the web-contents view stays in
 * sync.
 */
export class BrowserEditorFindContribution extends BrowserEditorContribution {
	private readonly _findWidgetContainer: HTMLElement;
	private readonly _findWidget: Lazy<BrowserFindWidget>;

	constructor(
		editor: BrowserEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(editor);

		this._findWidgetContainer = $('.browser-find-widget-wrapper');

		this._findWidget = new Lazy(() => {
			const findWidget = this.instantiationService.createInstance(
				BrowserFindWidget,
				this._findWidgetContainer
			);
			if (editor.model) {
				findWidget.setModel(editor.model);
			}
			findWidget.onDidChangeHeight(() => {
				editor.layoutBrowserContainer();
			});
			return findWidget;
		});
		this._register(toDisposable(() => this._findWidget.rawValue?.dispose()));
	}

	/**
	 * The container element to insert below the toolbar.
	 */
	override get toolbarElements(): readonly HTMLElement[] {
		return [this._findWidgetContainer];
	}

	protected override subscribeToModel(model: IBrowserViewModel, _store: DisposableStore): void {
		this._findWidget.rawValue?.setModel(model);
	}

	override clear(): void {
		this._findWidget.rawValue?.setModel(undefined);
		this._findWidget.rawValue?.hide();
	}

	override layout(width: number): void {
		this._findWidget.rawValue?.layout(width);
	}

	/**
	 * Show the find widget, optionally pre-populated with selected text from the browser view
	 */
	async showFind(): Promise<void> {
		const selectedText = (await this.editor.model?.getSelectedText())?.trim();
		const textToReveal = selectedText && !/[\r\n]/.test(selectedText) ? selectedText : undefined;
		this._findWidget.value.reveal(textToReveal);
		this._findWidget.value.layout(this._findWidgetContainer.clientWidth);
	}

	/**
	 * Hide the find widget
	 */
	hideFind(): void {
		this._findWidget.rawValue?.hide();
	}

	/**
	 * Find the next match
	 */
	findNext(): void {
		this._findWidget.rawValue?.find(false);
	}

	/**
	 * Find the previous match
	 */
	findPrevious(): void {
		this._findWidget.rawValue?.find(true);
	}
}

BrowserEditor.registerContribution(BrowserEditorFindContribution);

// -- Actions ----------------------------------------------------------------

class ShowBrowserFindAction extends Action2 {
	static readonly ID = BrowserViewCommandId.ShowFind;

	constructor() {
		super({
			id: ShowBrowserFindAction.ID,
			title: localize2('browser.showFindAction', 'Find in Page'),
			category: BrowserActionCategory,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate()),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: BrowserActionGroup.Page,
				order: 1,
			},
			keybinding: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyF
			}
		});
	}

	run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): void {
		if (browserEditor instanceof BrowserEditor) {
			void browserEditor.getContribution(BrowserEditorFindContribution)?.showFind();
		}
	}
}

class HideBrowserFindAction extends Action2 {
	static readonly ID = BrowserViewCommandId.HideFind;

	constructor() {
		super({
			id: HideBrowserFindAction.ID,
			title: localize2('browser.hideFindAction', 'Close Find Widget'),
			category: BrowserActionCategory,
			f1: false,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_FIND_WIDGET_VISIBLE),
			keybinding: {
				weight: KeybindingWeight.EditorContrib + 5,
				primary: KeyCode.Escape
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const browserEditor = accessor.get(IEditorService).activeEditorPane;
		if (browserEditor instanceof BrowserEditor) {
			browserEditor.getContribution(BrowserEditorFindContribution)?.hideFind();
		}
	}
}

class BrowserFindNextAction extends Action2 {
	static readonly ID = BrowserViewCommandId.FindNext;

	constructor() {
		super({
			id: BrowserFindNextAction.ID,
			title: localize2('browser.findNextAction', 'Find Next'),
			category: BrowserActionCategory,
			f1: false,
			precondition: BROWSER_EDITOR_ACTIVE,
			keybinding: [{
				when: CONTEXT_BROWSER_FIND_WIDGET_FOCUSED,
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.Enter
			}, {
				when: CONTEXT_BROWSER_FIND_WIDGET_VISIBLE,
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.F3,
				mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyG }
			}]
		});
	}

	run(accessor: ServicesAccessor): void {
		const browserEditor = accessor.get(IEditorService).activeEditorPane;
		if (browserEditor instanceof BrowserEditor) {
			browserEditor.getContribution(BrowserEditorFindContribution)?.findNext();
		}
	}
}

class BrowserFindPreviousAction extends Action2 {
	static readonly ID = BrowserViewCommandId.FindPrevious;

	constructor() {
		super({
			id: BrowserFindPreviousAction.ID,
			title: localize2('browser.findPreviousAction', 'Find Previous'),
			category: BrowserActionCategory,
			f1: false,
			precondition: BROWSER_EDITOR_ACTIVE,
			keybinding: [{
				when: CONTEXT_BROWSER_FIND_WIDGET_FOCUSED,
				weight: KeybindingWeight.EditorContrib,
				primary: KeyMod.Shift | KeyCode.Enter
			}, {
				when: CONTEXT_BROWSER_FIND_WIDGET_VISIBLE,
				weight: KeybindingWeight.EditorContrib,
				primary: KeyMod.Shift | KeyCode.F3,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG }
			}]
		});
	}

	run(accessor: ServicesAccessor): void {
		const browserEditor = accessor.get(IEditorService).activeEditorPane;
		if (browserEditor instanceof BrowserEditor) {
			browserEditor.getContribution(BrowserEditorFindContribution)?.findPrevious();
		}
	}
}

registerAction2(ShowBrowserFindAction);
registerAction2(HideBrowserFindAction);
registerAction2(BrowserFindNextAction);
registerAction2(BrowserFindPreviousAction);
