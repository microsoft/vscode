/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/inlineChatSessionOverlay.css';
import * as dom from '../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction, Separator } from '../../../../base/common/actions.js';
import { ActionBar, ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, observableFromEventOpts, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { ContentWidgetPositionPreference, IActiveCodeEditor, IContentWidgetPosition, IOverlayWidgetPosition } from '../../../../editor/browser/editorBrowser.js';
import { ObservableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { localize } from '../../../../nls.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatEditingAcceptRejectActionViewItem } from '../../chat/browser/chatEditing/chatEditingEditorOverlay.js';
import { ACTION_START } from '../common/inlineChat.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { getFlatActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { getSimpleEditorOptions } from '../../codeEditor/browser/simpleEditorOptions.js';
import { PlaceholderTextContribution } from '../../../../editor/contrib/placeholderText/browser/placeholderTextContribution.js';
import { InlineChatRunOptions } from './inlineChatController.js';
import { IInlineChatSession2 } from './inlineChatSessionService.js';
import { Position } from '../../../../editor/common/core/position.js';
import { SelectionDirection } from '../../../../editor/common/core/selection.js';
import { CancelChatActionId } from '../../chat/browser/actions/chatExecuteActions.js';
import { assertType } from '../../../../base/common/types.js';

/**
 * Overlay widget that displays a vertical action bar menu.
 */
export class InlineChatInputWidget extends Disposable {

	private readonly _domNode: HTMLElement;
	private readonly _inputContainer: HTMLElement;
	private readonly _actionBar: ActionBar;
	private readonly _input: IActiveCodeEditor;
	private readonly _position = observableValue<IOverlayWidgetPosition | null>(this, null);
	readonly position: IObservable<IOverlayWidgetPosition | null> = this._position;
	readonly minContentWidthInPx = constObservable(0);

	private readonly _showStore = this._store.add(new DisposableStore());
	private _inlineStartAction: IAction | undefined;
	private _anchorLineNumber: number = 0;
	private _anchorLeft: number = 0;
	private _anchorAbove: boolean = false;

	readonly allowEditorOverflow = true;

	constructor(
		private readonly _editorObs: ObservableCodeEditor,
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
					this._hide();
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

		// Handle ArrowUp on first action bar item to focus input editor
		this._store.add(dom.addDisposableListener(this._actionBar.domNode, 'keydown', e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.UpArrow) && this._actionBar.isFocused(this._actionBar.viewItems.findIndex(item => item.action.id !== Separator.ID))) {
				event.preventDefault();
				event.stopPropagation();
				this._input.focus();
			}
		}, true));

		// Track focus - hide when focus leaves
		const focusTracker = this._store.add(dom.trackFocus(this._domNode));
		this._store.add(focusTracker.onDidBlur(() => this._hide()));

		// Handle action bar cancel (Escape key)
		this._store.add(this._actionBar.onDidCancel(() => this._hide()));
		this._store.add(this._actionBar.onWillRun(() => this._hide()));
	}

	/**
	 * Show the widget at the specified line.
	 * @param lineNumber The line number to anchor the widget to
	 * @param left Left offset relative to editor
	 * @param anchorAbove Whether to anchor above the position (widget grows upward)
	 */
	show(lineNumber: number, left: number, anchorAbove: boolean): void {
		this._showStore.clear();

		// Clear input state
		this._input.getModel().setValue('');
		this._inputContainer.style.height = '26px';
		this._input.layout({ width: 200, height: 18 });

		// Refresh actions from menu
		this._refreshActions();

		// Store anchor info for scroll updates
		this._anchorLineNumber = lineNumber;
		this._anchorLeft = left;
		this._anchorAbove = anchorAbove;

		// Set initial position
		this._updatePosition();

		// Create overlay widget via observable pattern
		this._showStore.add(this._editorObs.createOverlayWidget({
			domNode: this._domNode,
			position: this._position,
			minContentWidthInPx: this.minContentWidthInPx,
			allowEditorOverflow: this.allowEditorOverflow,
		}));

		// If anchoring above, adjust position after render to account for widget height
		if (anchorAbove) {
			this._updatePosition();
		}

		// Update position on scroll, hide if anchor line is out of view
		this._showStore.add(this._editorObs.editor.onDidScrollChange(() => {
			const visibleRanges = this._editorObs.editor.getVisibleRanges();
			const isLineVisible = visibleRanges.some(range =>
				this._anchorLineNumber >= range.startLineNumber && this._anchorLineNumber <= range.endLineNumber
			);
			if (!isLineVisible) {
				this._hide();
			} else {
				this._updatePosition();
			}
		}));

		// Focus the input editor
		setTimeout(() => this._input.focus(), 0);
	}

	private _updatePosition(): void {
		const editor = this._editorObs.editor;
		const top = editor.getTopForLineNumber(this._anchorLineNumber) - editor.getScrollTop();
		let adjustedTop = top;

		if (this._anchorAbove) {
			const widgetHeight = this._domNode.offsetHeight;
			adjustedTop = top - widgetHeight;
		}

		this._position.set({
			preference: { top: adjustedTop, left: this._anchorLeft },
			stackOrdinal: 10000,
		}, undefined);
	}

	/**
	 * Hide the widget (removes from editor but does not dispose).
	 */
	private _hide(): void {
		this._position.set(null, undefined);
		this._showStore.clear();
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
	}
}

/**
 * Overlay widget that displays progress messages during inline chat requests.
 */
export class InlineChatSessionOverlayWidget extends Disposable {

	private readonly _domNode: HTMLElement = document.createElement('div');
	private readonly _container: HTMLElement;
	private readonly _progressNode: HTMLElement;
	private readonly _progressMessage: HTMLElement;
	private readonly _toolbarNode: HTMLElement;

	private readonly _showStore = this._store.add(new DisposableStore());
	private readonly _session = observableValue<IInlineChatSession2 | undefined>(this, undefined);
	private readonly _position = observableValue<IContentWidgetPosition | null>(this, null);

	constructor(
		private readonly _editorObs: ObservableCodeEditor,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super();

		this._container = document.createElement('div');
		this._domNode.appendChild(this._container);
		this._container.classList.add('inline-chat-session-overlay-widget');

		// Create progress node
		this._progressNode = document.createElement('div');
		this._progressNode.classList.add('progress');
		dom.append(this._progressNode, renderIcon(ThemeIcon.modify(Codicon.loading, 'spin')));
		this._progressMessage = dom.append(this._progressNode, dom.$('span.progress-message'));
		this._container.appendChild(this._progressNode);

		// Create toolbar node
		this._toolbarNode = document.createElement('div');
		this._toolbarNode.classList.add('toolbar');

		// Set up progress message observable
		const requestMessage = derived(r => {
			const session = this._session.read(r);
			const chatModel = session?.chatModel;
			if (!session || !chatModel) {
				return undefined;
			}

			const response = chatModel.lastRequestObs.read(r)?.response;
			if (!response) {
				return { message: localize('working', "Working...") };
			}

			const lastPart = observableFromEventOpts({ equalsFn: () => false }, response.onDidChange, () => response.response.value)
				.read(r)
				.filter(part => part.kind === 'progressMessage' || part.kind === 'toolInvocation')
				.at(-1);

			if (lastPart?.kind === 'toolInvocation') {
				return { message: lastPart.invocationMessage };
			} else if (lastPart?.kind === 'progressMessage') {
				return { message: lastPart.content };
			} else {
				return { message: localize('working', "Working...") };
			}
		});

		this._store.add(autorun(r => {
			const value = requestMessage.read(r);
			if (value) {
				this._progressMessage.innerText = renderAsPlaintext(value.message);
			} else {
				this._progressMessage.innerText = '';
			}
		}));
	}

	show(session: IInlineChatSession2): void {
		assertType(this._editorObs.editor.hasModel());
		this._showStore.clear();

		this._session.set(session, undefined);

		// Derived entry observable for this session
		const entry = derived(r => session.editingSession.readEntry(session.uri, r));

		// Keep busy class in sync with whether edits are being streamed
		this._showStore.add(autorun(r => {
			const e = entry.read(r);
			const isBusy = !e || !!e.isCurrentlyBeingModifiedBy.read(r);
			this._container.classList.toggle('busy', isBusy);
		}));

		// Add toolbar
		this._container.appendChild(this._toolbarNode);
		this._showStore.add(toDisposable(() => this._toolbarNode.remove()));

		const that = this;

		this._showStore.add(this._instaService.createInstance(MenuWorkbenchToolBar, this._toolbarNode, MenuId.ChatEditorInlineExecute, {
			telemetrySource: 'inlineChatProgress.overlayToolbar',
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			toolbarOptions: {
				primaryGroup: () => true,
				useSeparatorsInPrimaryActions: true
			},
			menuOptions: { renderShortTitle: true },
			actionViewItemProvider: (action, options) => {
				const primaryActions = [CancelChatActionId, 'inlineChat2.keep'];
				const labeledActions = primaryActions.concat(['inlineChat2.undo']);

				if (!labeledActions.includes(action.id)) {
					return undefined; // use default action view item with label
				}

				return new ChatEditingAcceptRejectActionViewItem(action, options, entry, undefined, that._keybindingService, primaryActions);
			}
		}));

		// Position based on diff info, updating as changes stream in
		const selection = this._editorObs.cursorSelection.get()!;
		const above = selection.getDirection() === SelectionDirection.RTL;

		this._showStore.add(autorun(r => {
			let newPosition = selection.getPosition();
			const e = entry.read(r);
			const diffInfo = e?.diffInfo?.read(r);
			const position = that._position.read(undefined)?.position;
			if (diffInfo && position) {
				for (const change of diffInfo.changes) {
					if (change.modified.contains(position.lineNumber)) {
						newPosition = new Position(change.modified.startLineNumber - 1, 1);
						break;
					}
				}
			}

			this._position.set({
				position: newPosition,
				preference: [above ? ContentWidgetPositionPreference.ABOVE : ContentWidgetPositionPreference.BELOW]
			}, undefined);
		}));

		// Create content widget
		this._showStore.add(this._editorObs.createContentWidget({
			domNode: this._domNode,
			position: this._position,
			allowEditorOverflow: true,
		}));
	}

	hide(): void {
		this._position.set(null, undefined);
		this._session.set(undefined, undefined);
		this._showStore.clear();
	}
}
