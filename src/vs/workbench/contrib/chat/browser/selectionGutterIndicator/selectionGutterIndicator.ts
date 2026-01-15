/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { ActionBar, ActionsOrientation } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, debouncedObservable, derived, IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from '../../../../../editor/browser/editorBrowser.js';
import { EditorCommand, EditorContributionInstantiation, registerEditorCommand, registerEditorContribution } from '../../../../../editor/browser/editorExtensions.js';
import { observableCodeEditor, ObservableCodeEditor } from '../../../../../editor/browser/observableCodeEditor.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { LineRange } from '../../../../../editor/common/core/ranges/lineRange.js';
import { IEditorContribution } from '../../../../../editor/common/editorCommon.js';
import { InlineEditTabAction } from '../../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/inlineEditsViewInterface.js';
import { InlineEditsGutterIndicator, InlineEditsGutterIndicatorData, InlineSuggestionGutterMenuData, SimpleInlineSuggestModel } from '../../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/components/gutterIndicatorView.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../platform/hover/browser/hoverService.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { localize } from '../../../../../nls.js';
import { IMenu, IMenuService, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { getFlatActionBarActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { ACTION_START } from '../../../inlineChat/common/inlineChat.js';

const CONTEXT_SELECTION_GUTTER_OVERLAY_VISIBLE = new RawContextKey<boolean>('selectionGutterOverlayVisible', false, localize('selectionGutterOverlayVisible', "Whether the selection gutter overlay is visible"));

// Register menu items for the selection gutter overlay
MenuRegistry.appendMenuItems([
	// Group 1: Inline Chat
	{
		id: MenuId.SelectionGutterOverlay,
		item: {
			command: {
				id: ACTION_START,
				title: localize('inlineChat', "Inline Chat"),
			},
			group: '1_chat',
			order: 1,
		}
	},
	// Group 2: Explain and Add Selection to Chat
	{
		id: MenuId.SelectionGutterOverlay,
		item: {
			command: {
				id: 'chat.internal.explain',
				title: localize('explain', "Explain"),
			},
			group: '2_context',
			order: 1,
		}
	},
	{
		id: MenuId.SelectionGutterOverlay,
		item: {
			command: {
				id: 'workbench.action.chat.attachSelection',
				title: localize('addSelectionToChat', "Add Selection to Chat"),
			},
			group: '2_context',
			order: 2,
		}
	},
	// Group 3: Debug
	{
		id: MenuId.SelectionGutterOverlay,
		item: {
			command: {
				id: 'editor.debug.action.toggleBreakpoint',
				title: localize('toggleBreakpoint', "Toggle Breakpoint"),
			},
			group: '3_debug',
			order: 1,
		}
	},
]);

interface TopLeftPosition {
	top: number;
	left: number;
}

/**
 * Overlay widget that shows actions near the gutter indicator.
 */
class SelectionOverlayWidget extends Disposable implements IOverlayWidget {

	readonly allowEditorOverflow = true;

	private readonly _domNode: HTMLDivElement;
	private readonly _actionBar: ActionBar;
	private readonly _menuDisposables = this._store.add(new DisposableStore());
	private _menu: IMenu | undefined;
	private _topLeft: TopLeftPosition | undefined;
	private _anchorElement: HTMLElement | undefined;
	private _visible = false;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _ctxOverlayVisible: IContextKey<boolean>,
		editorObs: ObservableCodeEditor,
		@IMenuService private readonly _menuService: IMenuService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();

		// Create container DOM node
		this._domNode = dom.$('.selection-gutter-overlay');
		this._domNode.style.position = 'absolute';
		this._domNode.style.display = 'none';
		this._domNode.style.zIndex = '100';
		this._domNode.style.padding = '8px';
		this._domNode.style.backgroundColor = 'var(--vscode-editorWidget-background)';
		this._domNode.style.border = '1px solid var(--vscode-editorWidget-border)';
		this._domNode.style.borderRadius = '4px';
		this._domNode.style.boxShadow = '0 2px 8px var(--vscode-widget-shadow)';

		// Create action bar with horizontal layout showing labels
		this._actionBar = this._store.add(new ActionBar(this._domNode, {
			orientation: ActionsOrientation.VERTICAL
		}));
		// Hide menu and clear selection when an action runs
		this._store.add(this._actionBar.onDidRun(() => {
			this.hide();
			// Collapse selection to cursor position to also hide the gutter indicator
			const position = this._editor.getPosition();
			if (position) {
				this._editor.setPosition(position);
			}
		}));
		// Register the overlay widget with the editor
		this._editor.addOverlayWidget(this);

		// Reactively reposition on layout changes (scroll, resize)
		this._store.add(autorun(reader => {
			editorObs.layoutInfo.read(reader);
			editorObs.scrollTop.read(reader);
			if (this._visible && this._anchorElement) {
				this._placeAtAnchor(this._anchorElement);
			}
		}));

		// Auto-dismiss on cursor movement
		this._store.add(autorun(reader => {
			editorObs.cursorSelection.read(reader);
			if (this._visible) {
				this.hide();
			}
		}));
	}

	override dispose(): void {
		this._editor.removeOverlayWidget(this);
		super.dispose();
	}

	getId(): string {
		return 'selectionGutterOverlay';
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return this._topLeft ? { preference: this._topLeft } : null;
	}

	show(anchor: HTMLElement): void {
		if (this._visible) {
			return;
		}
		this._visible = true;
		this._anchorElement = anchor;
		this._domNode.style.display = 'block';
		this._ctxOverlayVisible.set(true);

		// Create menu and populate action bar
		this._updateActions();

		this._placeAtAnchor(anchor);
	}

	private _updateActions(): void {
		this._menuDisposables.clear();

		// Create menu
		this._menu = this._menuDisposables.add(this._menuService.createMenu(MenuId.SelectionGutterOverlay, this._contextKeyService));

		// Get actions from menu
		const groups = this._menu.getActions({ shouldForwardArgs: true });
		const actions = getFlatActionBarActions(groups);

		// Clear and fill action bar
		this._actionBar.clear();
		this._actionBar.push(actions, { icon: false, label: true });

		// Listen for menu changes
		this._menuDisposables.add(this._menu.onDidChange(() => {
			this._updateActions();
		}));
	}

	hide(): void {
		if (!this._visible) {
			return;
		}
		this._visible = false;
		this._anchorElement = undefined;
		this._domNode.style.display = 'none';
		this._ctxOverlayVisible.set(false);
		this._topLeft = undefined;
		this._editor.layoutOverlayWidget(this);
	}

	private _placeAtAnchor(anchor: HTMLElement): void {
		const anchorBox = anchor.getBoundingClientRect();
		const bodyBox = dom.getClientArea(this._domNode.ownerDocument.body);

		// Get actual widget dimensions after rendering
		const widgetHeight = this._domNode.offsetHeight || 50;
		const widgetWidth = this._domNode.offsetWidth || 200;

		// Calculate available space above and below the anchor
		const spaceAbove = anchorBox.top;
		const spaceBelow = bodyBox.height - anchorBox.bottom;

		// Prefer above if there's enough space, otherwise below
		let top: number;
		if (spaceAbove >= widgetHeight) {
			// Place above the anchor
			top = anchorBox.top - widgetHeight;
		} else if (spaceBelow >= widgetHeight) {
			// Place below the anchor
			top = anchorBox.bottom;
		} else {
			// Not enough space either way, choose the side with more space
			if (spaceAbove > spaceBelow) {
				top = Math.max(0, anchorBox.top - widgetHeight);
			} else {
				top = anchorBox.bottom;
			}
		}

		// Position horizontally centered over the anchor
		const anchorCenterX = anchorBox.left + anchorBox.width / 2;
		let left = anchorCenterX - widgetWidth / 2;

		// Convert page coordinates to editor-relative coordinates
		const editorDomNode = this._editor.getDomNode();
		if (editorDomNode) {
			const editorBoundingBox = editorDomNode.getBoundingClientRect();
			top -= editorBoundingBox.top;
			left -= editorBoundingBox.left;
		}

		this._topLeft = { top, left };
		this._editor.layoutOverlayWidget(this);
	}
}


export class SelectionGutterIndicatorContribution extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.selectionGutterIndicator';

	public static get(editor: ICodeEditor): SelectionGutterIndicatorContribution | null {
		return editor.getContribution<SelectionGutterIndicatorContribution>(SelectionGutterIndicatorContribution.ID);
	}

	private readonly _overlayWidget: SelectionOverlayWidget;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();

		const editorObs = observableCodeEditor(this._editor);
		const focusIsInMenu = observableValue<boolean>(this, false);

		// Create context key for overlay visibility
		const ctxOverlayVisible = CONTEXT_SELECTION_GUTTER_OVERLAY_VISIBLE.bindTo(this._contextKeyService);

		// Create the overlay widget
		this._overlayWidget = this._store.add(this._instantiationService.createInstance(SelectionOverlayWidget, this._editor, ctxOverlayVisible, editorObs));

		// Debounce the selection to add a delay before showing the indicator
		const debouncedSelection = debouncedObservable(editorObs.cursorSelection, 500);

		// Create data observable based on the primary selection
		const data = derived(reader => {
			const selection = debouncedSelection.read(reader);

			// Always show when we have a selection (even if empty)
			if (!selection || selection.isEmpty()) {
				return undefined;
			}

			// Use the cursor position (active end of selection) to determine the line
			const cursorPosition = selection.getPosition();
			const lineRange = new LineRange(cursorPosition.lineNumber, cursorPosition.lineNumber + 1);

			// Create minimal gutter menu data (empty for prototype)
			const gutterMenuData = new InlineSuggestionGutterMenuData(
				undefined, // action
				'', // displayName
				[], // extensionCommands
				undefined, // alternativeAction
				undefined, // modelInfo
				undefined, // setModelId
			);

			// Create model with console.log actions for prototyping
			const model = new SimpleInlineSuggestModel(
				() => console.log('[SelectionGutterIndicator] accept'),
				() => console.log('[SelectionGutterIndicator] jump'),
			);

			return new InlineEditsGutterIndicatorData(
				gutterMenuData,
				lineRange,
				model,
				undefined, // altAction
				{
					// styles: {
					// 	background: 'var(--vscode-inlineEdit-gutterIndicator-primaryBackground)',
					// 	foreground: 'var(--vscode-inlineEdit-gutterIndicator-primaryForeground)',
					// 	border: 'var(--vscode-inlineEdit-gutterIndicator-primaryBorder)',
					// },
					icon: Codicon.pencil,
				}
			);
		});

		// Instantiate the gutter indicator
		this._store.add(this._instantiationService.createInstance(
			SelectionGutterIndicator,
			editorObs,
			data,
			constObservable(InlineEditTabAction.Jump), // tabAction - not used with custom styles
			constObservable(0), // verticalOffset
			constObservable(false), // isHoveringOverInlineEdit
			focusIsInMenu,
			this._overlayWidget,
		));
	}

	hideOverlay(): void {
		this._overlayWidget.hide();
	}
}

/**
 * Custom gutter indicator for selection that shows a custom hover.
 */
class SelectionGutterIndicator extends InlineEditsGutterIndicator {
	constructor(
		editorObs: ObservableCodeEditor,
		data: IObservable<InlineEditsGutterIndicatorData | undefined>,
		tabAction: IObservable<InlineEditTabAction>,
		verticalOffset: IObservable<number>,
		isHoveringOverInlineEdit: IObservable<boolean>,
		focusIsInMenu: ISettableObservable<boolean>,
		private readonly _overlayWidget: SelectionOverlayWidget,
		@IHoverService hoverService: HoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IThemeService themeService: IThemeService,
	) {
		super(editorObs, data, tabAction, verticalOffset, isHoveringOverInlineEdit, focusIsInMenu, hoverService, instantiationService, accessibilityService, themeService);
	}

	protected override _showHover(): void {
		// Use the icon element from the base class as anchor
		const iconElement = this._iconRef.element;
		if (iconElement) {
			this._overlayWidget.show(iconElement);
		}
	}
}

registerEditorContribution(
	SelectionGutterIndicatorContribution.ID,
	SelectionGutterIndicatorContribution,
	EditorContributionInstantiation.AfterFirstRender,
);

// Command to hide the overlay widget (ESC key)
const SelectionGutterCommand = EditorCommand.bindToContribution<SelectionGutterIndicatorContribution>(SelectionGutterIndicatorContribution.get);

registerEditorCommand(new SelectionGutterCommand({
	id: 'editor.action.selectionGutterIndicator.hideOverlay',
	precondition: CONTEXT_SELECTION_GUTTER_OVERLAY_VISIBLE,
	handler: x => x.hideOverlay(),
	kbOpts: {
		weight: KeybindingWeight.EditorContrib + 50,
		kbExpr: EditorContextKeys.focus,
		primary: KeyCode.Escape,
	}
}));
