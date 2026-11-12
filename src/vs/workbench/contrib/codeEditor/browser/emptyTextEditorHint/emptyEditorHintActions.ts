/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, clearNode, EventHelper, EventType } from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { ActionBar, ActionsOrientation } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Action, IAction, Separator, WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../../base/common/actions.js';
import { coalesce } from '../../../../../base/common/arrays.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from '../../../../../editor/browser/editorBrowser.js';
import { EditorOption } from '../../../../../editor/common/config/editorOptions.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID } from '../../../../browser/parts/editor/editorCommands.js';
import { WatermarkActionViewItem } from '../../../../browser/parts/editor/editorGroupWatermark.js';
import { ChangeLanguageAction } from '../../../../browser/parts/editor/editorStatus.js';
import { DEFAULT_EDITOR_ASSOCIATION, IEditorCommandsContext } from '../../../../common/editor.js';
import { IEditorResolverService, RegisteredEditorInfo } from '../../../../services/editor/common/editorResolverService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IUntitledDocumentTelemetryService } from '../../../../services/untitled/common/untitledDocumentTelemetry.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ACTION_ID_OPEN_CHAT } from '../../../chat/browser/actions/chatActions.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { ChatAgentLocation } from '../../../chat/common/constants.js';
import { IChatAgentService } from '../../../chat/common/participants/chatAgents.js';
import { EmptyEditorHintAction, logEmptyEditorHintEvent } from './emptyTextEditorHintTelemetry.js';

export const emptyEditorHintActionsSetting = 'workbench.editor.experimental.emptyEditorHintActions';

/** Set in the editor while the list of actions is shown, so that Escape hides it. */
export const EmptyEditorHintActionsVisible = new RawContextKey<boolean>('emptyEditorHintActionsVisible', false, localize('emptyEditorHintActionsVisible', "Whether the empty editor hint shows its list of actions"));

const markdownEditorId = 'vscode.markdown.editor';
const inlineChatStartCommandId = 'inlineChat.start';
const reopenWithEditorCommandId = 'workbench.action.reopenWithEditor';

/** The editor that an untitled file was last reopened in from the hint, offered first next time. */
const lastUntitledEditorStorageKey = 'emptyEditorHint.lastUntitledEditor';

interface IEmptyEditorHintActionEntry {
	readonly action: EmptyEditorHintAction;
	readonly label: string;
	readonly icon: ThemeIcon;
	/** The command whose keybinding is shown next to the label. */
	readonly keybindingCommandId?: string;
	readonly run: () => Promise<unknown>;
	/** Makes the row a split button whose dropdown shows the Reopen Editor With picker. */
	readonly hasEditorPicker?: boolean;
}

export interface IEmptyEditorHintActionsWidgetOptions {
	/** Hides the hint for this editor only. */
	readonly close: () => void;
	/** Hides the hint everywhere (sets `workbench.editor.empty.hint` to `hidden`). */
	readonly dontShowAgain: () => void;
	/** The list no longer fits into the editor (after a resize or when its rows changed), see `requiredSize`. */
	readonly doesNotFit: () => void;
}

/** The size of the editor's content area (without the vertical scrollbar), in pixels. */
export interface IEmptyEditorHintActionsSize {
	readonly width: number;
	readonly height: number;
}

/**
 * The experimental empty editor hint: a list of actions for a new untitled file, rendered like the
 * empty editor group watermark, in the top quarter of the editor. It overlays the editor, so the
 * cursor stays on line 1 and typing dismisses the hint.
 */
export class EmptyEditorHintActionsWidget extends Disposable implements IOverlayWidget {

	private static readonly ID = 'editor.widget.emptyHintActions';

	private readonly _domNode = $('.empty-editor-hint-actions');
	private readonly _rows = append(this._domNode, $('.empty-editor-hint-actions-rows'));
	private readonly _rowsDisposables = this._register(new DisposableStore());
	private _ariaLabel = '';
	private _top = 0;
	private _requiredSize: IEmptyEditorHintActionsSize | undefined;

	private static readonly _preferredWidth = 336;
	/** Narrower than this, the classic hint is shown instead. */
	private static readonly _minWidth = 220;
	/** The space kept free on each side of the list. */
	private static readonly _margin = 8;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _options: IEmptyEditorHintActionsWidgetOptions,
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IEditorResolverService private readonly _editorResolverService: IEditorResolverService,
		@IEditorService private readonly _editorService: IEditorService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IUntitledDocumentTelemetryService private readonly _untitledDocumentTelemetryService: IUntitledDocumentTelemetryService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		const visible = EmptyEditorHintActionsVisible.bindTo(this._contextKeyService);
		visible.set(true);
		this._register(toDisposable(() => visible.reset()));

		this._renderCloseButton();
		this._renderFooter();
		this._renderRows();

		const chatEnabledKeys = new Set([ChatContextKeys.enabled.key]);
		this._register(Event.any(
			this._keybindingService.onDidUpdateKeybindings,
			this._chatAgentService.onDidChangeAgents,
			this._editorResolverService.onDidChangeEditorRegistrations,
			// The editors that can open the file depend on its language
			this._editor.onDidChangeModelLanguage,
			Event.filter(this._contextKeyService.onDidChangeContext, e => e.affectsSome(chatEnabledKeys)),
		)(() => {
			this._renderRows();
			this._layoutAndNotifyFit();
		}));

		this._register(addDisposableListener(this._domNode, EventType.KEY_DOWN, e => {
			if (new StandardKeyboardEvent(e).equals(KeyCode.Escape)) {
				e.preventDefault();
				e.stopPropagation();
				this.close('closeEscape');
			}
		}));

		const onDidFocusEditorText = Event.debounce(this._editor.onDidFocusEditorText, () => undefined, 500);
		this._register(onDidFocusEditorText(() => {
			if (this._editor.hasTextFocus() && this._configurationService.getValue(AccessibilityVerbositySettingId.EmptyEditorHint)) {
				status(this._ariaLabel);
			}
		}));

		this._register(this._editor.onDidLayoutChange(() => this._layoutAndNotifyFit()));
		this._editor.addOverlayWidget(this);
		this.layout();
		if (this.fits) {
			this._logEvent('shown');
		}
	}

	private _layoutAndNotifyFit(): void {
		this.layout();
		if (!this.fits) {
			this._options.doesNotFit();
		}
	}

	override dispose(): void {
		this._editor.removeOverlayWidget(this);
		super.dispose();
	}

	/**
	 * Hides the hint for this editor, with the close button or Escape.
	 */
	close(action: 'close' | 'closeEscape'): void {
		this._logEvent('action', action);
		this._editor.focus();
		this._options.close();
	}

	getId(): string {
		return EmptyEditorHintActionsWidget.ID;
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		const layoutInfo = this._editor.getLayoutInfo();
		// `left` is the center: the widget centers itself with a CSS transform
		const left = Math.round((layoutInfo.width - layoutInfo.verticalScrollbarWidth) / 2);
		return { preference: { top: this._top, left } };
	}

	/**
	 * Whether the list of actions fits into the editor at its current size. If not, `requiredSize` tells
	 * how large the editor has to be, so that the classic hint can be shown until it is.
	 */
	get fits(): boolean {
		return this._requiredSize === undefined;
	}

	get requiredSize(): IEmptyEditorHintActionsSize | undefined {
		return this._requiredSize;
	}

	/**
	 * Fits the list into the editor: it shrinks to the available width and moves up from the top quarter
	 * when the editor is short, but always keeps line 1 (where the cursor blinks) visible above it.
	 */
	layout(): void {
		const layoutInfo = this._editor.getLayoutInfo();
		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
		const availableWidth = layoutInfo.width - layoutInfo.verticalScrollbarWidth - 2 * EmptyEditorHintActionsWidget._margin;
		this._domNode.style.width = `${Math.max(EmptyEditorHintActionsWidget._minWidth, Math.min(EmptyEditorHintActionsWidget._preferredWidth, availableWidth))}px`;

		const contentHeight = this._domNode.offsetHeight;
		const minTop = 3 * lineHeight;
		this._top = Math.max(minTop, Math.min(Math.round(layoutInfo.height / 4), layoutInfo.height - contentHeight));
		const fits = layoutInfo.height === 0 || contentHeight === 0 // not laid out yet
			|| (availableWidth >= EmptyEditorHintActionsWidget._minWidth && this._top + contentHeight <= layoutInfo.height);
		this._requiredSize = fits ? undefined : {
			width: EmptyEditorHintActionsWidget._minWidth + 2 * EmptyEditorHintActionsWidget._margin,
			height: minTop + contentHeight,
		};
		this._editor.layoutOverlayWidget(this);
	}

	/**
	 * The visible entries, in groups that are separated by a divider.
	 */
	private _getEntryGroups(): IEmptyEditorHintActionEntry[][] {
		const resource = this._editor.getModel()?.uri;
		const hasInlineChat = this._chatAgentService.getActivatedAgents().some(agent => agent.locations.includes(ChatAgentLocation.EditorInline));
		const chatEnabled = this._contextKeyService.contextMatchesRules(ChatContextKeys.enabled);
		const otherEditors = resource ? this._getOtherEditors(resource) : [];
		const lastEditorId = this._storageService.get(lastUntitledEditorStorageKey, StorageScope.PROFILE);
		const primaryEditor = otherEditors.find(editor => editor.id === lastEditorId) ?? otherEditors.find(editor => editor.id === markdownEditorId);
		const openWithAnotherEditor: IEmptyEditorHintActionEntry = {
			action: 'openWith',
			label: localize('emptyEditorHintActions.openWith', "Open With Another Editor..."),
			icon: Codicon.files,
			run: () => this._showEditorPicker(),
		};

		const groups: (IEmptyEditorHintActionEntry | undefined)[][] = [[
			hasInlineChat ? {
				action: 'generateCode',
				label: localize('emptyEditorHintActions.generateCode', "Generate Code"),
				icon: Codicon.sparkle,
				keybindingCommandId: inlineChatStartCommandId,
				run: () => this._runCommand(inlineChatStartCommandId, { from: 'hint' }),
			} : undefined,
			chatEnabled ? {
				action: 'newChatEditor',
				label: localize('emptyEditorHintActions.newChatEditor', "New Chat Editor"),
				icon: Codicon.chatSparkle,
				run: () => this._replaceWithNewChatEditor(),
			} : undefined,
			{
				action: 'selectLanguage',
				label: localize('emptyEditorHintActions.selectLanguage', "Select a Language"),
				icon: Codicon.json,
				keybindingCommandId: ChangeLanguageAction.ID,
				run: async () => {
					await this._runCommand(ChangeLanguageAction.ID);
					this._editor.focus();
				},
			},
		], [
			primaryEditor ? {
				action: primaryEditor.id === markdownEditorId ? 'openMarkdownEditor' : 'openEditor',
				label: localize('emptyEditorHintActions.openInEditor', "Open in {0}", primaryEditor.label),
				icon: primaryEditor.id === markdownEditorId ? Codicon.markdown : Codicon.files,
				run: () => this._reopenWith(primaryEditor.id),
				hasEditorPicker: true,
			} : openWithAnotherEditor,
		]];
		return groups.map(group => coalesce(group)).filter(group => group.length > 0);
	}

	/**
	 * The editors other than the text editor that can open this file, e.g. the Markdown Editor for an untitled plain text file.
	 */
	private _getOtherEditors(resource: URI): RegisteredEditorInfo[] {
		return this._editorResolverService.getEditors(resource).filter(editor => editor.id !== DEFAULT_EDITOR_ASSOCIATION.id);
	}

	/**
	 * Shows the Reopen Editor With picker, which lists all editors for an untitled file.
	 */
	private _showEditorPicker(): Promise<void> {
		return this._reopenAndRemember(context => this._commandService.executeCommand(reopenWithEditorCommandId, context));
	}

	private _reopenWith(editorId: string): Promise<void> {
		return this._reopenAndRemember(context => this._commandService.executeCommand(REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID, editorId, context));
	}

	/**
	 * The command context of only this editor. The reopen commands act on all tabs that are selected together
	 * with this editor, so the tab selection is narrowed to this editor first.
	 */
	private async _getSingleEditorContext(): Promise<IEditorCommandsContext | undefined> {
		const pane = this._editorService.visibleEditorPanes.find(pane => pane.getControl() === this._editor);
		const input = pane?.input;
		if (!pane || !input) {
			return undefined;
		}
		if (pane.group.isSelected(input) && pane.group.selectedEditors.length > 1) {
			await pane.group.setSelection(input, []);
		}
		return { groupId: pane.group.id, editorIndex: pane.group.getIndexOfEditor(input) };
	}

	/**
	 * Reopens this file in another editor and remembers that editor, so the hint offers it first next time.
	 */
	private async _reopenAndRemember(reopen: (context: IEditorCommandsContext) => Promise<unknown>): Promise<void> {
		const resource = this._editor.getModel()?.uri;
		const context = await this._getSingleEditorContext();
		if (!context) {
			return;
		}
		await reopen(context);
		const activeEditor = this._editorService.activeEditor;
		if (activeEditor?.editorId && activeEditor.editorId !== DEFAULT_EDITOR_ASSOCIATION.id && isEqual(activeEditor.resource, resource)) {
			this._storageService.store(lastUntitledEditorStorageKey, activeEditor.editorId, StorageScope.PROFILE, StorageTarget.USER);
		}
	}

	private _renderRows(): void {
		clearNode(this._rows);
		this._rowsDisposables.clear();

		const groups = this._getEntryGroups();

		const entriesById = new Map<string, IEmptyEditorHintActionEntry>();
		const actionBar = this._rowsDisposables.add(new ActionBar(this._rows, {
			orientation: ActionsOrientation.VERTICAL,
			ariaLabel: localize('emptyEditorHintActions.ariaLabel', "Empty Editor Actions"),
			actionViewItemProvider: action => {
				const entry = entriesById.get(action.id);
				if (!entry) {
					return undefined;
				}
				if (entry.hasEditorPicker) {
					return this._instantiationService.createInstance(EmptyEditorHintSplitActionViewItem, action, entry.icon, () => {
						this._logEvent('action', 'openWith');
						this._editor.focus();
						void this._showEditorPicker();
					});
				}
				const keybinding = entry.keybindingCommandId ? this._keybindingService.lookupKeybinding(entry.keybindingCommandId) : undefined;
				return this._instantiationService.createInstance(WatermarkActionViewItem, action, entry.icon, keybinding);
			},
		}));
		this._rowsDisposables.add(actionBar.onDidRun(e => {
			if (e.error && !isCancellationError(e.error)) {
				this._notificationService.error(e.error);
			}
		}));

		const toAction = (entry: IEmptyEditorHintActionEntry) => {
			entriesById.set(entry.action, entry);
			return this._rowsDisposables.add(new Action(entry.action, entry.label, undefined, true, async () => {
				this._logEvent('action', entry.action);
				// The commands work on the active editor, so make this editor the active one first
				this._editor.focus();
				await entry.run();
			}));
		};
		actionBar.push(Separator.join(...groups.map(group => group.map(toAction))));

		const labels = groups.flat().map(entry => {
			const keybinding = entry.keybindingCommandId ? this._keybindingService.lookupKeybinding(entry.keybindingCommandId)?.getAriaLabel() : undefined;
			return keybinding ? localize('emptyEditorHintActions.entryAriaLabel', "{0} ({1})", entry.label, keybinding) : entry.label;
		});
		this._ariaLabel = localize(
			'emptyEditorHintActions.hintAriaLabel',
			"Empty editor actions: {0}. Start typing to dismiss. Toggle {1} in settings to disable this hint.",
			labels.join(', '),
			AccessibilityVerbositySettingId.EmptyEditorHint
		);
		this._domNode.setAttribute('aria-label', this._ariaLabel);
	}

	private _renderCloseButton(): void {
		const closeActionBar = this._register(new ActionBar(append(this._domNode, $('.empty-editor-hint-actions-close'))));
		closeActionBar.push(this._register(new Action(
			'emptyEditorHintActions.close',
			localize('emptyEditorHintActions.close', "Hide for This Editor"),
			ThemeIcon.asClassName(Codicon.close),
			true,
			async () => this.close('close')
		)), { icon: true, label: false });
	}

	private _renderFooter(): void {
		const footer = append(this._domNode, $('.empty-editor-hint-actions-footer'));
		append(footer, $('span')).textContent = localize('emptyEditorHintActions.startTyping', "Start typing to dismiss");
		append(footer, $('span.empty-editor-hint-actions-footer-separator')).textContent = '\u00b7';
		const dontShowAgain = append(footer, $('a.empty-editor-hint-actions-dont-show'));
		dontShowAgain.setAttribute('role', 'button');
		dontShowAgain.tabIndex = 0;
		dontShowAgain.textContent = localize('emptyEditorHintActions.dontShowAgain', "Don't Show Again");
		this._register(this._hoverService.setupDelayedHover(dontShowAgain, { content: localize('emptyEditorHintActions.dontShowAgainHover', "Disable the empty editor hint") }));

		const run = () => {
			this._logEvent('action', 'dontShowAgain');
			this._editor.focus();
			this._options.dontShowAgain();
		};
		this._register(addDisposableListener(dontShowAgain, EventType.CLICK, e => {
			e.preventDefault();
			run();
		}));
		this._register(addDisposableListener(dontShowAgain, EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				event.preventDefault();
				run();
			}
		}));
	}

	private async _runCommand(commandId: string, ...args: unknown[]): Promise<void> {
		this._telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: commandId, from: 'hint' });
		await this._commandService.executeCommand(commandId, ...args);
	}

	/**
	 * Turns this blank file into a chat: opens a new chat editor in the group of this editor and closes this editor.
	 */
	private async _replaceWithNewChatEditor(): Promise<void> {
		const resource = this._editor.getModel()?.uri;
		const untitledEditor = resource ? this._editorService.findEditors(resource).find(({ groupId }) => this._editorService.activeEditorPane?.group.id === groupId) : undefined;
		await this._runCommand(ACTION_ID_OPEN_CHAT);
		if (untitledEditor && !untitledEditor.editor.isDirty()) {
			await this._editorService.closeEditor(untitledEditor, { preserveFocus: true });
		}
	}

	private _logEvent(kind: 'shown' | 'action', action?: EmptyEditorHintAction): void {
		logEmptyEditorHintEvent(this._telemetryService, this._untitledDocumentTelemetryService, this._editor.getModel()?.uri, 'actions', kind, action);
	}
}

/**
 * A watermark row with a dropdown button at its end, e.g. "Open in Markdown Editor" with a picker of all editors.
 * Right Arrow or Alt+Down opens the dropdown from the keyboard.
 */
class EmptyEditorHintSplitActionViewItem extends WatermarkActionViewItem {

	constructor(
		action: IAction,
		icon: ThemeIcon,
		private readonly _showPicker: () => void,
		@IHoverService private readonly _dropdownHoverService: IHoverService,
	) {
		super(action, icon, undefined, _dropdownHoverService);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('empty-editor-hint-actions-split');

		const dropdown = append(container, $('a.empty-editor-hint-actions-dropdown'));
		dropdown.setAttribute('role', 'button');
		dropdown.setAttribute('aria-haspopup', 'dialog');
		const label = localize('emptyEditorHintActions.otherEditors', "Open With Another Editor...");
		dropdown.setAttribute('aria-label', label);
		append(dropdown, renderIcon(Codicon.chevronDown)).setAttribute('aria-hidden', 'true');
		this._register(this._dropdownHoverService.setupDelayedHover(dropdown, { content: label }));

		this._register(addDisposableListener(dropdown, EventType.MOUSE_DOWN, e => EventHelper.stop(e, true)));
		this._register(addDisposableListener(dropdown, EventType.CLICK, e => {
			EventHelper.stop(e, true);
			this._showPicker();
		}));
		if (this.element) {
			this._register(addDisposableListener(this.element, EventType.KEY_DOWN, e => {
				const event = new StandardKeyboardEvent(e);
				if (event.equals(KeyCode.RightArrow) || event.equals(KeyMod.Alt | KeyCode.DownArrow)) {
					event.preventDefault();
					event.stopPropagation();
					this._showPicker();
				}
			}));
		}
	}
}