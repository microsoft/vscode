/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { IAction } from '../../../../base/common/actions.js';
import { ActionBar, ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { Emitter } from '../../../../base/common/event.js';
import { IActiveCodeEditor, ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from '../../../../editor/browser/editorBrowser.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { localize } from '../../../../nls.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { ACTION_START } from '../common/inlineChat.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { getFlatActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { getSimpleEditorOptions } from '../../codeEditor/browser/simpleEditorOptions.js';
import { PlaceholderTextContribution } from '../../../../editor/contrib/placeholderText/browser/placeholderTextContribution.js';
import { InlineChatRunOptions } from './inlineChatController.js';
import { Position } from '../../../../editor/common/core/position.js';

/**
 * Overlay widget that displays a vertical action bar menu.
 */
export class InlineChatOverlayWidget extends Disposable implements IOverlayWidget {

	private static _idPool = 0;

	private readonly _id = `inline-chat-gutter-menu-${InlineChatOverlayWidget._idPool++}`;
	private readonly _domNode: HTMLElement;
	private readonly _inputContainer: HTMLElement;
	private readonly _actionBar: ActionBar;
	private readonly _input: IActiveCodeEditor;
	private _position: IOverlayWidgetPosition | null = null;
	private readonly _onDidHide = this._store.add(new Emitter<void>());
	readonly onDidHide = this._onDidHide.event;

	private _isVisible = false;
	private _inlineStartAction: IAction | undefined;

	readonly allowEditorOverflow = true;

	constructor(
		private readonly _editor: ICodeEditor,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IMenuService private readonly _menuService: IMenuService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
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
		options.placeholder = this._keybindingService.appendKeybinding(localize('placeholderWithSelection', "Edit selection"), ACTION_START);

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

		// Handle Enter key to submit and ArrowDown to focus action bar
		this._store.add(this._input.onKeyDown(e => {
			if (e.keyCode === KeyCode.Enter && !e.shiftKey) {
				const value = this._input.getModel().getValue() ?? '';
				// TODO@jrieken this isn't nice
				if (this._inlineStartAction && value) {
					e.preventDefault();
					e.stopPropagation();
					this._actionBar.actionRunner.run(
						this._inlineStartAction,
						{ message: value, autoSend: true } satisfies InlineChatRunOptions
					);
				}
			} else if (e.keyCode === KeyCode.Escape) {
				// Hide overlay if input is empty
				const value = this._input.getModel().getValue() ?? '';
				if (!value) {
					e.preventDefault();
					e.stopPropagation();
					this.hide();
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

		// Create vertical action bar
		this._actionBar = this._store.add(new ActionBar(this._domNode, {
			orientation: ActionsOrientation.VERTICAL,
			preventLoopNavigation: true,
		}));

		// Track focus - hide when focus leaves
		const focusTracker = this._store.add(dom.trackFocus(this._domNode));
		this._store.add(focusTracker.onDidBlur(() => this.hide()));

		// Handle action bar cancel (Escape key)
		this._store.add(this._actionBar.onDidCancel(() => this.hide()));
		this._store.add(this._actionBar.onWillRun(() => this.hide()));
	}

	/**
	 * Show the widget at the specified position.
	 * @param top Top offset relative to editor
	 * @param left Left offset relative to editor
	 * @param anchorAbove Whether to anchor above the position (widget grows upward)
	 */
	show(top: number, left: number, anchorAbove: boolean): void {

		// Clear input state
		this._input.getModel().setValue('');
		this._inputContainer.style.height = '26px';
		this._input.layout({ width: 200, height: 18 });

		// Refresh actions from menu
		this._refreshActions();

		// Set initial position
		this._position = {
			preference: { top, left },
			stackOrdinal: 10000,
		};

		// Add widget to editor
		if (!this._isVisible) {
			this._editor.addOverlayWidget(this);
			this._isVisible = true;

		} else if (!anchorAbove) {
			this._editor.layoutOverlayWidget(this);
		}

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

	/**
	 * Hide the widget (removes from editor but does not dispose).
	 */
	hide(): void {
		if (!this._isVisible) {
			return;
		}
		this._isVisible = false;
		this._editor.removeOverlayWidget(this);
		this._onDidHide.fire();
	}

	private _refreshActions(): void {
		// Clear existing actions
		this._actionBar.clear();
		this._inlineStartAction = undefined;

		// Get fresh actions from menu
		const actions = getFlatActionBarActions(this._menuService.getMenuActions(MenuId.ChatEditorInlineGutter, this._contextKeyService, { shouldForwardArgs: true }));

		// Set actions with keybindings (skip ACTION_START since we have the input editor)
		for (const action of actions) {
			if (action.id === ACTION_START) {
				this._inlineStartAction = action;
				continue;
			}
			const keybinding = this._keybindingService.lookupKeybinding(action.id)?.getLabel();
			this._actionBar.push(action, { icon: false, label: true, keybinding });
		}
	}

	private _updateInputHeight(contentHeight: number): void {
		const lineHeight = this._input.getOption(EditorOption.lineHeight);
		const maxHeight = 3 * lineHeight;
		const clampedHeight = Math.min(contentHeight, maxHeight);
		const containerPadding = 8;

		this._inputContainer.style.height = `${clampedHeight + containerPadding}px`;
		this._input.layout({ width: 200, height: clampedHeight });
		if (this._isVisible) {
			this._editor.layoutOverlayWidget(this);
		}
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
		if (this._isVisible) {
			this._editor.removeOverlayWidget(this);
		}
		super.dispose();
	}
}
