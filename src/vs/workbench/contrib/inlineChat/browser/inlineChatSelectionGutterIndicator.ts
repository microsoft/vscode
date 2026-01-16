/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { IAction, IActionRunner } from '../../../../base/common/actions.js';
import { IActionViewItem } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { BaseActionViewItem, IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, debouncedObservable, derived, IObservable, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { Event } from '../../../../base/common/event.js';
import { IActiveCodeEditor, ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { observableCodeEditor, ObservableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IEditorOptions } from '../../../../editor/common/config/editorOptions.js';
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
import { ACTION_START, InlineChatConfigKeys } from '../common/inlineChat.js';
import { ContextMenuHandler } from '../../../../platform/contextview/browser/contextMenuHandler.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { getFlatActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { getSimpleEditorOptions } from '../../codeEditor/browser/simpleEditorOptions.js';
import { PlaceholderTextContribution } from '../../../../editor/contrib/placeholderText/browser/placeholderTextContribution.js';
import { AnchorPosition, IAnchor } from '../../../../base/browser/ui/contextview/contextview.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { InlineChatRunOptions } from './inlineChatController.js';


class InlineChatInputActionViewItem extends BaseActionViewItem {

	private _input: IActiveCodeEditor | undefined;

	override get trapsKeyboardTrigger(): boolean {
		return true;
	}

	constructor(
		action: IAction,
		actionRunner: IActionRunner,
		private readonly _placeholder: string,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IModelService private readonly _modelService: IModelService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super(null, action);
		this.actionRunner = actionRunner;
	}

	override render(container: HTMLElement): void {
		super.render(container);

		const inputContainer = dom.append(container, dom.$('.inline-chat-input-action'));
		inputContainer.style.width = '200px';
		inputContainer.style.height = '26px';
		inputContainer.style.paddingLeft = '22px';
		inputContainer.style.display = 'flex';
		inputContainer.style.alignItems = 'center';
		inputContainer.style.justifyContent = 'center';

		const options = this._createEditorOptions();
		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			isSimpleWidget: true,
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([
				PlaceholderTextContribution.ID,
			])
		};
		this._input = this._register(
			this._instantiationService.createInstance(CodeEditorWidget, inputContainer, options, codeEditorWidgetOptions)
		) as IActiveCodeEditor;

		const model = this._register(
			this._modelService.createModel('', null, URI.parse(`gutter-input:${Date.now()}`), true)
		);
		this._input.setModel(model);

		// Layout the editor with proper dimensions
		this._input.layout({ width: 200, height: 18 });

		// Handle Enter key to submit
		this._register(this._input.onKeyDown(e => {
			if (e.keyCode === KeyCode.Enter && !e.shiftKey) {
				e.preventDefault();
				e.stopPropagation();
				this._submit();
			}
		}));

		// Focus the input
		setTimeout(() => this._input?.focus(), 0);
	}

	private _createEditorOptions(): IEditorOptions {
		const options = getSimpleEditorOptions(this._configurationService);
		options.wordWrap = 'off';
		options.lineNumbers = 'off';
		options.glyphMargin = false;
		options.lineDecorationsWidth = 0;
		options.lineNumbersMinChars = 0;
		options.folding = false;
		options.minimap = { enabled: false };
		options.scrollbar = { vertical: 'hidden', horizontal: 'hidden', alwaysConsumeMouseWheel: false };
		options.renderLineHighlight = 'none';
		options.placeholder = this._keybindingService.appendKeybinding(this._placeholder, ACTION_START);
		return options;
	}

	private _submit(): void {
		const value = this._input?.getModel()?.getValue() ?? '';

		// Run the action with the input value as InlineChatRunOptions
		this.actionRunner.run(this._action, { message: value, autoSend: true } satisfies InlineChatRunOptions);

		// Hide the context menu
		this._contextViewService.hideContextView(false);
	}

	override focus(): void {
		this._input?.focus();
	}

	override blur(): void {
		// no-op - editor doesn't have blur method
	}

	override onClick(): void {
		this._input?.focus();
	}
}

export class InlineChatSelectionIndicator extends Disposable {

	private readonly _gutterIndicator: InlineChatGutterIndicator;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		const enabled = observableConfigValue(InlineChatConfigKeys.ShowGutterMenu, false, configurationService);
		const chatDisabled = observableConfigValue<boolean>('chat.disableAIFeatures', false, configurationService);

		const editorObs = observableCodeEditor(this._editor);
		const focusIsInMenu = observableValue<boolean>(this, false);

		// Observable to suppress the gutter when an action is selected
		const suppressGutter = observableValue<boolean>(this, false);

		// Debounce the selection to add a delay before showing the indicator
		const debouncedSelection = debouncedObservable(editorObs.cursorSelection, 500);

		// Create data observable based on the primary selection
		// Use raw selection for immediate hide, debounced for delayed show
		const data = derived(reader => {
			// Check if feature is enabled or if AI features are disabled
			if (!enabled.read(reader) || chatDisabled.read(reader)) {
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
 * Custom gutter indicator for selection that shows a context menu.
 */
class InlineChatGutterIndicator extends InlineEditsGutterIndicator {

	private readonly _myInstantiationService: IInstantiationService;
	private readonly _contextMenuHandler: ContextMenuHandler;

	constructor(
		private readonly _myEditorObs: ObservableCodeEditor,
		data: IObservable<InlineEditsGutterIndicatorData | undefined>,
		tabAction: IObservable<InlineEditTabAction>,
		verticalOffset: IObservable<number>,
		isHoveringOverInlineEdit: IObservable<boolean>,
		focusIsInMenu: ISettableObservable<boolean>,
		private readonly _suppressGutter: ISettableObservable<boolean>,
		@IMenuService private readonly _menuService: IMenuService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IHoverService hoverService: HoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IThemeService themeService: IThemeService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@ITelemetryService telemetryService: ITelemetryService,
		@INotificationService notificationService: INotificationService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super(_myEditorObs, data, tabAction, verticalOffset, isHoveringOverInlineEdit, focusIsInMenu, hoverService, instantiationService, accessibilityService, themeService);
		this._myInstantiationService = instantiationService;
		this._contextMenuHandler = new ContextMenuHandler(this._contextViewService, telemetryService, notificationService, keybindingService);
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
			// Create menu and get actions
			const actions = getFlatActionBarActions(this._menuService.getMenuActions(MenuId.ChatEditorInlineGutter, this._contextKeyService, { shouldForwardArgs: true }));

			if (actions.length === 0) {
				resolve();
				return;
			}

			// Determine selection direction to position menu above or below
			const selection = this._myEditorObs.cursorSelection.get();
			const direction = selection?.getDirection() ?? SelectionDirection.LTR;

			// Action runner that hides the gutter when an action is run
			const actionRunner: IActionRunner = {
				onDidRun: Event.None,
				onWillRun: Event.None,
				dispose: () => { },
				run: async (action: IAction, context?: unknown) => {
					this._contextViewService.hideContextView();
					this._suppressGutter.set(true, undefined);
					return action.run(context);
				}
			};

			// Show context menu using ContextMenuHandler
			this._contextMenuHandler.showContextMenu({
				actionRunner,
				anchorPosition: direction === SelectionDirection.RTL ? AnchorPosition.ABOVE : AnchorPosition.BELOW,
				getAnchor: () => {
					return { x, y, height } satisfies IAnchor;
				},
				getActions: () => actions,
				getActionViewItem: (action: IAction, options: IActionViewItemOptions): IActionViewItem | undefined => {
					if (action.id === ACTION_START) {
						const placeholder = selection?.isEmpty()
							? localize('placeholder', "Generate code")
							: localize('placeholderWithSelection', "Modify selected code");
						return this._myInstantiationService.createInstance(
							InlineChatInputActionViewItem,
							action,
							actionRunner,
							placeholder,
						);
					}
					return undefined;
				},
				onHide: () => {
					// Focus editor
					const editor = this._myEditorObs.editor;
					editor.focus();

					resolve();
				}
			});
		});
	}
}
