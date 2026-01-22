/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/inlineChatSessionOverlay.css';
import * as dom from '../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
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
		options.wordWrap = 'on';
		options.lineNumbers = 'off';
		options.glyphMargin = false;
		options.lineDecorationsWidth = 0;
		options.lineNumbersMinChars = 0;
		options.folding = false;
		options.minimap = { enabled: false };
		options.scrollbar = { vertical: 'auto', horizontal: 'hidden', alwaysConsumeMouseWheel: true, verticalSliderSize: 6 };
		options.renderLineHighlight = 'none';

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

		// Update placeholder based on selection state
		this._store.add(autorun(r => {
			const selection = this._editorObs.cursorSelection.read(r);
			const hasSelection = selection && !selection.isEmpty();
			const placeholderText = hasSelection
				? localize('placeholderWithSelection', "Edit selection")
				: localize('placeholderNoSelection', "Generate code");
			this._input.updateOptions({
				placeholder: this._keybindingService.appendKeybinding(placeholderText, ACTION_START)
			});
		}));

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
		} else {
			const lineHeight = editor.getOption(EditorOption.lineHeight);
			adjustedTop = top + lineHeight;
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
	private readonly _statusNode: HTMLElement;
	private readonly _icon: HTMLElement;
	private readonly _message: HTMLElement;
	private readonly _toolbarNode: HTMLElement;

	private readonly _showStore = this._store.add(new DisposableStore());
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

		// Create status node with icon and message
		this._statusNode = document.createElement('div');
		this._statusNode.classList.add('status');
		this._icon = dom.append(this._statusNode, dom.$('span'));
		this._message = dom.append(this._statusNode, dom.$('span.message'));
		this._container.appendChild(this._statusNode);

		// Create toolbar node
		this._toolbarNode = document.createElement('div');
		this._toolbarNode.classList.add('toolbar');
	}

	show(session: IInlineChatSession2): void {
		assertType(this._editorObs.editor.hasModel());
		this._showStore.clear();

		// Derived entry observable for this session
		const entry = derived(r => session.editingSession.readEntry(session.uri, r));

		// Set up status message observable
		const requestMessage = derived(r => {
			const chatModel = session?.chatModel;
			if (!session || !chatModel) {
				return undefined;
			}

			const response = chatModel.lastRequestObs.read(r)?.response;
			if (!response) {
				return { message: localize('working', "Working...") };
			}

			if (response.isComplete) {
				const changes = entry.read(r)?.changesCount.read(r) ?? 0;
				return {
					message: changes === 0
						? localize('done', "Done")
						: changes === 1
							? localize('done1', "Done, 1 change")
							: localize('doneN', "Done, {0} changes", changes)
				};
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

		this._showStore.add(autorun(r => {
			const value = requestMessage.read(r);
			if (value) {
				this._message.innerText = renderAsPlaintext(value.message);
			} else {
				this._message.innerText = '';
			}
		}));

		// Keep active class in sync with whether edits are being streamed or done
		this._showStore.add(autorun(r => {
			const e = entry.read(r);
			const isBusy = !e || !!e.isCurrentlyBeingModifiedBy.read(r);
			const isDone = e?.lastModifyingResponse.read(r)?.isComplete;
			this._container.classList.toggle('active', isBusy || isDone);

			this._icon.className = '';
			this._icon.classList.add(...ThemeIcon.asClassNameArray(isDone ? Codicon.check : ThemeIcon.modify(Codicon.loading, 'spin')));
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
			const e = entry.read(r);
			const diffInfo = e?.diffInfo?.read(r);

			// Build combined range from selection and all diff changes
			let startLine = selection.startLineNumber;
			let endLineExclusive = selection.endLineNumber + 1;

			if (diffInfo) {
				for (const change of diffInfo.changes) {
					startLine = Math.min(startLine, change.modified.startLineNumber);
					endLineExclusive = Math.max(endLineExclusive, change.modified.endLineNumberExclusive);
				}
			}

			// Position at start (above) or end (below) of the combined range
			const newPosition = above
				? new Position(startLine, 1)
				: new Position(endLineExclusive - 1, 1);

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
		this._showStore.clear();
	}
}
