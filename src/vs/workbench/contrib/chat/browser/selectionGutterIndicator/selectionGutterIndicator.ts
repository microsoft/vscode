/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { IAction } from '../../../../../base/common/actions.js';
import { IActionViewItem } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { BaseActionViewItem, IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, debouncedObservable, derived, IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IActiveCodeEditor, ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { EditorContributionInstantiation, EditorExtensionsRegistry, registerEditorContribution } from '../../../../../editor/browser/editorExtensions.js';
import { observableCodeEditor, ObservableCodeEditor } from '../../../../../editor/browser/observableCodeEditor.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IEditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { LineRange } from '../../../../../editor/common/core/ranges/lineRange.js';
import { ISelection } from '../../../../../editor/common/core/selection.js';
import { IEditorContribution } from '../../../../../editor/common/editorCommon.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { InlineEditTabAction } from '../../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/inlineEditsViewInterface.js';
import { InlineEditsGutterIndicator, InlineEditsGutterIndicatorData, InlineSuggestionGutterMenuData, SimpleInlineSuggestModel } from '../../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/components/gutterIndicatorView.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../platform/hover/browser/hoverService.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { localize } from '../../../../../nls.js';
import { IMenuService, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ACTION_START } from '../../../inlineChat/common/inlineChat.js';
import { ContextMenuHandler } from '../../../../../platform/contextview/browser/contextMenuHandler.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { getFlatActionBarActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { getSimpleEditorOptions } from '../../../codeEditor/browser/simpleEditorOptions.js';
import { PlaceholderTextContribution } from '../../../../../editor/contrib/placeholderText/browser/placeholderTextContribution.js';

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


/**
 * Custom action view item that renders an editor input for inline chat.
 */
class InlineChatInputActionViewItem extends BaseActionViewItem {

	private _input: IActiveCodeEditor | undefined;

	override get trapsKeyboardTrigger(): boolean {
		return true;
	}

	constructor(
		action: IAction,
		private readonly _initialSelection: ISelection,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IModelService private readonly _modelService: IModelService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ICommandService private readonly _commandService: ICommandService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super(null, action);
	}

	override render(container: HTMLElement): void {
		super.render(container);

		const inputContainer = dom.append(container, dom.$('.inline-chat-input-action'));
		inputContainer.style.width = '200px';
		inputContainer.style.height = '24px';

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
		this._input.layout({ width: 200, height: 24 });

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
		options.placeholder = this._getPlaceholder();
		return options;
	}

	private _getPlaceholder(): string {
		const keybinding = this._keybindingService.lookupKeybinding(ACTION_START)?.getLabel();
		return keybinding
			? localize('inlineChatPlaceholderWithKb', "Edit selected code ({0})", keybinding)
			: localize('inlineChatPlaceholder', "Edit selected code");
	}

	private _submit(): void {
		const value = this._input?.getModel()?.getValue() ?? '';

		// Hide the context menu
		this._contextViewService.hideContextView(false);

		// Run the inline chat action with the message and selection
		this._commandService.executeCommand(ACTION_START, {
			message: value,
			autoSend: value.length > 0,
			initialSelection: this._initialSelection,
		});
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

export class SelectionGutterIndicatorContribution extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.selectionGutterIndicator';

	public static get(editor: ICodeEditor): SelectionGutterIndicatorContribution | null {
		return editor.getContribution<SelectionGutterIndicatorContribution>(SelectionGutterIndicatorContribution.ID);
	}

	private readonly _contextMenuHandler: ContextMenuHandler;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextViewService contextViewService: IContextViewService,
		@ITelemetryService telemetryService: ITelemetryService,
		@INotificationService notificationService: INotificationService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super();

		const editorObs = observableCodeEditor(this._editor);
		const focusIsInMenu = observableValue<boolean>(this, false);

		// Create the context menu handler
		this._contextMenuHandler = new ContextMenuHandler(
			contextViewService,
			telemetryService,
			notificationService,
			keybindingService
		);

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
			this._contextMenuHandler,
		));
	}
}

/**
 * Custom gutter indicator for selection that shows a context menu.
 */
class SelectionGutterIndicator extends InlineEditsGutterIndicator {

	private readonly _myInstantiationService: IInstantiationService;

	constructor(
		private readonly _myEditorObs: ObservableCodeEditor,
		data: IObservable<InlineEditsGutterIndicatorData | undefined>,
		tabAction: IObservable<InlineEditTabAction>,
		verticalOffset: IObservable<number>,
		isHoveringOverInlineEdit: IObservable<boolean>,
		focusIsInMenu: ISettableObservable<boolean>,
		private readonly _contextMenuHandler: ContextMenuHandler,
		@IMenuService private readonly _menuService: IMenuService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IHoverService hoverService: HoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IThemeService themeService: IThemeService,
	) {
		super(_myEditorObs, data, tabAction, verticalOffset, isHoveringOverInlineEdit, focusIsInMenu, hoverService, instantiationService, accessibilityService, themeService);
		this._myInstantiationService = instantiationService;
	}

	protected override _showHover(): void {
		// Use the icon element from the base class as anchor
		const iconElement = this._iconRef.element;
		if (!iconElement) {
			return;
		}

		// Create menu and get actions
		const menu = this._menuService.createMenu(MenuId.SelectionGutterOverlay, this._contextKeyService);
		const groups = menu.getActions({ shouldForwardArgs: true });
		const actions = getFlatActionBarActions(groups);
		menu.dispose();

		if (actions.length === 0) {
			return;
		}

		// Show context menu using ContextMenuHandler
		this._contextMenuHandler.showContextMenu({
			getAnchor: () => iconElement,
			getActions: () => actions,
			getActionViewItem: (action: IAction, options: IActionViewItemOptions): IActionViewItem | undefined => {
				if (action.id === ACTION_START) {
					const selection = this._myEditorObs.editor.getSelection();
					if (selection) {
						return this._myInstantiationService.createInstance(
							InlineChatInputActionViewItem,
							action,
							selection,
						);
					}
				}
				return undefined;
			},
			onHide: () => {
				// Collapse selection to cursor position to also hide the gutter indicator
				const editor = this._myEditorObs.editor;
				const position = editor.getPosition();
				if (position) {
					editor.setPosition(position);
				}
			}
		});
	}
}

registerEditorContribution(
	SelectionGutterIndicatorContribution.ID,
	SelectionGutterIndicatorContribution,
	EditorContributionInstantiation.AfterFirstRender,
);
