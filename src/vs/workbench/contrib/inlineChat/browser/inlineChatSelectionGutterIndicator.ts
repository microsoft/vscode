/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { IAction } from '../../../../base/common/actions.js';
import { ActionBar, ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, debouncedObservable, derived, IObservable, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { Emitter } from '../../../../base/common/event.js';
import { IActiveCodeEditor, ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from '../../../../editor/browser/editorBrowser.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { observableCodeEditor, ObservableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { LineRange } from '../../../../editor/common/core/ranges/lineRange.js';
import { SelectionDirection } from '../../../../editor/common/core/selection.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { InlineEditTabAction } from '../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/inlineEditsViewInterface.js';
import { InlineEditsGutterIndicator, InlineEditsGutterIndicatorData, InlineSuggestionGutterMenuData, SimpleInlineSuggestModel } from '../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/components/gutterIndicatorView.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../platform/hover/browser/hoverService.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { localize } from '../../../../nls.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { ACTION_START, CTX_INLINE_CHAT_GUTTER_VISIBLE, InlineChatConfigKeys } from '../common/inlineChat.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { getFlatActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { getSimpleEditorOptions } from '../../codeEditor/browser/simpleEditorOptions.js';
import { PlaceholderTextContribution } from '../../../../editor/contrib/placeholderText/browser/placeholderTextContribution.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { InlineChatRunOptions } from './inlineChatController.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { Position } from '../../../../editor/common/core/position.js';


export class InlineChatSelectionIndicator extends Disposable {

	private readonly _gutterIndicator: InlineChatGutterIndicator;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IChatEntitlementService chatEntiteldService: IChatEntitlementService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super();

		const enabled = observableConfigValue(InlineChatConfigKeys.ShowGutterMenu, false, configurationService);

		const editorObs = observableCodeEditor(this._editor);
		const focusIsInMenu = observableValue<boolean>(this, false);

		// Observable to suppress the gutter when an action is selected
		const suppressGutter = observableValue<boolean>(this, false);

		// Debounce the selection to add a delay before showing the indicator
		const debouncedSelection = debouncedObservable(editorObs.cursorSelection, 500);

		// Context key for gutter visibility
		const gutterVisibleCtxKey = CTX_INLINE_CHAT_GUTTER_VISIBLE.bindTo(contextKeyService);
		this._store.add({ dispose: () => gutterVisibleCtxKey.reset() });

		// Create data observable based on the primary selection
		// Use raw selection for immediate hide, debounced for delayed show
		const data = derived(reader => {
			// Check if feature is enabled or if AI features are disabled
			if (!enabled.read(reader) || chatEntiteldService.sentiment.hidden) {
				return undefined;
			}

			// Hide when suppressed (e.g., after an action is selected)
			if (suppressGutter.read(reader)) {
				return undefined;
			}

			// Read raw selection - if empty, immediately hide
			const rawSelection = editorObs.cursorSelection.read(reader);
			if (!rawSelection || rawSelection.isEmpty()) {
				return undefined;
			}

			// Read debounced selection for showing - this adds delay
			const selection = debouncedSelection.read(reader);
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
			const model = new SimpleInlineSuggestModel(() => { }, () => { });

			return new InlineEditsGutterIndicatorData(
				gutterMenuData,
				lineRange,
				model,
				undefined, // altAction
				{
					icon: Codicon.sparkle,
				}
			);
		});

		// Instantiate the gutter indicator
		this._gutterIndicator = this._store.add(this._instantiationService.createInstance(
			InlineChatGutterIndicator,
			editorObs,
			data,
			constObservable(InlineEditTabAction.Jump), // tabAction - not used with custom styles
			constObservable(0), // verticalOffset
			constObservable(false), // isHoveringOverInlineEdit
			focusIsInMenu,
			suppressGutter,
		));

		// Reset suppressGutter when the selection changes
		this._store.add(autorun(reader => {
			editorObs.cursorSelection.read(reader);
			suppressGutter.set(false, undefined);
		}));

		// Update context key when gutter visibility changes
		this._store.add(autorun(reader => {
			const isVisible = data.read(reader) !== undefined;
			gutterVisibleCtxKey.set(isVisible);
		}));
	}

	/**
	 * Show the gutter menu at the specified coordinates.
	 * @returns Promise that resolves when menu closes
	 */
	showMenuAt(x: number, y: number, height: number = 0): Promise<void> {
		return this._gutterIndicator.showMenuAt(x, y, height);
	}
}

/**
 * Overlay widget that displays a vertical action bar menu.
 */
class InlineChatGutterMenuWidget extends Disposable implements IOverlayWidget {

	private static _idPool = 0;

	private readonly _id = `inline-chat-gutter-menu-${InlineChatGutterMenuWidget._idPool++}`;
	private readonly _domNode: HTMLElement;
	private readonly _inputContainer: HTMLElement;
	private readonly _actionBar: ActionBar;
	private readonly _input: IActiveCodeEditor;
	private _position: IOverlayWidgetPosition | null = null;
	private readonly _onDidHide = this._register(new Emitter<void>());
	readonly onDidHide = this._onDidHide.event;

	readonly allowEditorOverflow = true;

	constructor(
		private readonly _editor: ICodeEditor,
		top: number,
		left: number,
		anchorAbove: boolean,
		@IKeybindingService keybindingService: IKeybindingService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModelService modelService: IModelService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		// Create container
		this._domNode = dom.$('.inline-chat-gutter-menu');

		// Create input editor container
		this._inputContainer = dom.append(this._domNode, dom.$('.input'));
		this._inputContainer.style.width = '200px';
		this._inputContainer.style.height = '26px';
		this._inputContainer.style.display = 'flex';
		this._inputContainer.style.alignItems = 'center';
		this._inputContainer.style.justifyContent = 'center';

		// Create editor options
		const options = getSimpleEditorOptions(configurationService);
		options.wordWrap = 'off';
		options.lineNumbers = 'off';
		options.glyphMargin = false;
		options.lineDecorationsWidth = 0;
		options.lineNumbersMinChars = 0;
		options.folding = false;
		options.minimap = { enabled: false };
		options.scrollbar = { vertical: 'auto', horizontal: 'hidden', alwaysConsumeMouseWheel: true, verticalSliderSize: 6 };
		options.renderLineHighlight = 'none';
		options.placeholder = keybindingService.appendKeybinding(localize('placeholderWithSelection', "Edit selection"), ACTION_START);

		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			isSimpleWidget: true,
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([
				PlaceholderTextContribution.ID,
			])
		};

		this._input = this._store.add(instantiationService.createInstance(CodeEditorWidget, this._inputContainer, options, codeEditorWidgetOptions)) as IActiveCodeEditor;

		const model = this._store.add(modelService.createModel('', null, URI.parse(`gutter-input:${Date.now()}`), true));
		this._input.setModel(model);
		this._input.layout({ width: 200, height: 18 });

		// Listen to content size changes and resize the input editor (max 3 lines)
		this._store.add(this._input.onDidContentSizeChange(e => {
			if (e.contentHeightChanged) {
				this._updateInputHeight(e.contentHeight);
			}
		}));

		let inlineStartAction: IAction | undefined;

		// Handle Enter key to submit and ArrowDown to focus action bar
		this._store.add(this._input.onKeyDown(e => {
			if (e.keyCode === KeyCode.Enter && !e.shiftKey) {
				const value = this._input.getModel().getValue() ?? '';
				// TODO@jrieken this isn't nice
				if (inlineStartAction && value) {
					e.preventDefault();
					e.stopPropagation();
					this._actionBar.actionRunner.run(
						inlineStartAction,
						{ message: value, autoSend: true } satisfies InlineChatRunOptions
					);
				}
			} else if (e.keyCode === KeyCode.DownArrow) {
				// Focus first action bar item when at the end of the input
				const inputModel = this._input.getModel();
				const position = this._input.getPosition();
				const lastLineNumber = inputModel.getLineCount();
				const lastLineMaxColumn = inputModel.getLineMaxColumn(lastLineNumber);
				if (Position.equals(position, new Position(lastLineNumber, lastLineMaxColumn))) {
					e.preventDefault();
					e.stopPropagation();
					this._actionBar.focus();
				}
			}
		}));

		// Get actions from menu
		const actions = getFlatActionBarActions(menuService.getMenuActions(MenuId.ChatEditorInlineGutter, contextKeyService, { shouldForwardArgs: true }));

		// Create vertical action bar
		this._actionBar = this._store.add(new ActionBar(this._domNode, {
			orientation: ActionsOrientation.VERTICAL,
		}));

		// Set actions with keybindings (skip ACTION_START since we have the input editor)
		for (const action of actions) {
			if (action.id === ACTION_START) {
				inlineStartAction = action;
				continue;
			}
			const keybinding = keybindingService.lookupKeybinding(action.id)?.getLabel();
			this._actionBar.push(action, { icon: false, label: true, keybinding });
		}

		// Set initial position
		this._position = {
			preference: { top, left },
			stackOrdinal: 10000,
		};

		// Track focus - hide when focus leaves
		const focusTracker = this._store.add(dom.trackFocus(this._domNode));
		this._store.add(focusTracker.onDidBlur(() => this._hide()));

		// Handle action bar cancel (Escape key)
		this._store.add(this._actionBar.onDidCancel(() => this._hide()));
		this._store.add(this._actionBar.onWillRun(() => this._hide()));

		// Add widget to editor
		this._editor.addOverlayWidget(this);

		// If anchoring above, adjust position after render to account for widget height
		if (anchorAbove) {
			const widgetHeight = this._domNode.offsetHeight;
			this._position = {
				preference: { top: top - widgetHeight, left },
				stackOrdinal: 10000,
			};
			this._editor.layoutOverlayWidget(this);
		}

		// Focus the input editor
		setTimeout(() => this._input.focus(), 0);
	}

	private _hide(): void {
		this._onDidHide.fire();
	}

	private _updateInputHeight(contentHeight: number): void {
		const lineHeight = this._input.getOption(EditorOption.lineHeight);
		const maxHeight = 3 * lineHeight;
		const clampedHeight = Math.min(contentHeight, maxHeight);
		const containerPadding = 8;

		this._inputContainer.style.height = `${clampedHeight + containerPadding}px`;
		this._input.layout({ width: 200, height: clampedHeight });
		this._editor.layoutOverlayWidget(this);
	}

	getId(): string {
		return this._id;
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return this._position;
	}

	override dispose(): void {
		this._editor.removeOverlayWidget(this);
		super.dispose();
	}
}

/**
 * Custom gutter indicator for selection that shows a menu overlay widget.
 */
class InlineChatGutterIndicator extends InlineEditsGutterIndicator {

	private readonly _myInstantiationService: IInstantiationService;
	private _currentMenuWidget: InlineChatGutterMenuWidget | undefined;

	constructor(
		private readonly _myEditorObs: ObservableCodeEditor,
		data: IObservable<InlineEditsGutterIndicatorData | undefined>,
		tabAction: IObservable<InlineEditTabAction>,
		verticalOffset: IObservable<number>,
		isHoveringOverInlineEdit: IObservable<boolean>,
		focusIsInMenu: ISettableObservable<boolean>,
		private readonly _suppressGutter: ISettableObservable<boolean>,
		@IHoverService hoverService: HoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IThemeService themeService: IThemeService,
	) {
		super(_myEditorObs, data, tabAction, verticalOffset, isHoveringOverInlineEdit, focusIsInMenu, hoverService, instantiationService, accessibilityService, themeService);
		this._myInstantiationService = instantiationService;
	}

	protected override _showHover(): void {

		if (this._hoverVisible.get()) {
			return;
		}

		// Use the icon element from the base class as anchor
		const iconElement = this._iconRef.element;
		if (!iconElement) {
			return;
		}

		this._hoverVisible.set(true, undefined);
		const rect = iconElement.getBoundingClientRect();

		this.showMenuAt(rect.left, rect.top, rect.height).finally(() => {
			this._hoverVisible.set(false, undefined);
		});
	}

	/**
	 * Show the gutter menu at the specified coordinates.
	 * @returns Promise that resolves when menu closes
	 */
	showMenuAt(x: number, y: number, height: number = 0): Promise<void> {
		return new Promise<void>(resolve => {
			// Clean up existing widget if any
			this._currentMenuWidget?.dispose();
			this._currentMenuWidget = undefined;

			// Determine selection direction to position menu above or below
			const selection = this._myEditorObs.cursorSelection.get();
			const direction = selection?.getDirection() ?? SelectionDirection.LTR;

			// Convert screen coordinates to editor-relative coordinates
			const editor = this._myEditorObs.editor;
			const editorDomNode = editor.getDomNode();
			if (!editorDomNode) {
				resolve();
				return;
			}

			const editorRect = editorDomNode.getBoundingClientRect();
			const padding = 1;

			// Calculate position relative to editor
			// For RTL (above), we pass the top of the gutter indicator; widget will adjust after measuring its height
			// For LTR (below), we pass the bottom of the gutter indicator
			const anchorAbove = direction === SelectionDirection.RTL;
			let top: number;
			if (anchorAbove) {
				// Pass the top of the gutter indicator minus padding
				top = y - editorRect.top - padding;
			} else {
				// Menu appears below - position at bottom of gutter indicator
				top = y - editorRect.top + height + padding;
			}
			const left = x - editorRect.left;

			const store = new DisposableStore();

			// Create and show overlay widget
			this._currentMenuWidget = this._myInstantiationService.createInstance(
				InlineChatGutterMenuWidget,
				editor,
				top,
				left,
				anchorAbove,
			);

			// Handle widget hide
			store.add(this._currentMenuWidget.onDidHide(() => {
				this._suppressGutter.set(true, undefined);
				store.dispose();
				this._currentMenuWidget?.dispose();
				this._currentMenuWidget = undefined;

				// Focus editor
				editor.focus();

				resolve();
			}));
		});
	}
}
