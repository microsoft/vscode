/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, clearNode, EventType } from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { ActionBar, ActionsOrientation } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { Action, Separator, WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../../base/common/actions.js';
import { coalesce } from '../../../../../base/common/arrays.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from '../../../../../editor/browser/editorBrowser.js';
import { EditorOption } from '../../../../../editor/common/config/editorOptions.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID } from '../../../../browser/parts/editor/editorCommands.js';
import { WatermarkActionViewItem } from '../../../../browser/parts/editor/editorGroupWatermark.js';
import { ChangeLanguageAction } from '../../../../browser/parts/editor/editorStatus.js';
import { IEditorResolverService } from '../../../../services/editor/common/editorResolverService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IUntitledDocumentTelemetryService } from '../../../../services/untitled/common/untitledDocumentTelemetry.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ACTION_ID_OPEN_CHAT } from '../../../chat/browser/actions/chatActions.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { ChatAgentLocation } from '../../../chat/common/constants.js';
import { IChatAgentService } from '../../../chat/common/participants/chatAgents.js';
import { EmptyEditorHintAction, logEmptyEditorHintEvent } from './emptyTextEditorHintTelemetry.js';

export const emptyEditorHintActionsSetting = 'workbench.editor.experimental.emptyEditorHintActions';

const markdownEditorId = 'vscode.markdown.editor';
const inlineChatStartCommandId = 'inlineChat.start';
const reopenWithEditorCommandId = 'workbench.action.reopenWithEditor';

interface IEmptyEditorHintActionEntry {
	readonly action: EmptyEditorHintAction;
	readonly label: string;
	readonly icon: ThemeIcon;
	/** The command whose keybinding is shown next to the label. */
	readonly keybindingCommandId?: string;
	readonly run: () => Promise<unknown>;
}

export interface IEmptyEditorHintActionsWidgetOptions {
	/** Hides the hint for this editor only. */
	readonly close: () => void;
	/** Hides the hint everywhere (sets `workbench.editor.empty.hint` to `hidden`). */
	readonly dontShowAgain: () => void;
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
	) {
		super();

		this._renderCloseButton();
		this._renderFooter();
		this._renderRows();

		const chatEnabledKeys = new Set([ChatContextKeys.enabled.key]);
		this._register(Event.any(
			this._keybindingService.onDidUpdateKeybindings,
			this._chatAgentService.onDidChangeAgents,
			this._editorResolverService.onDidChangeEditorRegistrations,
			Event.filter(this._contextKeyService.onDidChangeContext, e => e.affectsSome(chatEnabledKeys)),
		)(() => this._renderRows()));

		this._register(addDisposableListener(this._domNode, EventType.KEY_DOWN, e => {
			if (new StandardKeyboardEvent(e).equals(KeyCode.Escape)) {
				e.preventDefault();
				e.stopPropagation();
				this._editor.focus();
			}
		}));

		const onDidFocusEditorText = Event.debounce(this._editor.onDidFocusEditorText, () => undefined, 500);
		this._register(onDidFocusEditorText(() => {
			if (this._editor.hasTextFocus() && this._configurationService.getValue(AccessibilityVerbositySettingId.EmptyEditorHint)) {
				status(this._ariaLabel);
			}
		}));

		this._register(this._editor.onDidLayoutChange(() => this._editor.layoutOverlayWidget(this)));
		this._editor.addOverlayWidget(this);
		this._logEvent('shown');
	}

	override dispose(): void {
		this._editor.removeOverlayWidget(this);
		super.dispose();
	}

	getId(): string {
		return EmptyEditorHintActionsWidget.ID;
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		const layoutInfo = this._editor.getLayoutInfo();
		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
		// Keep line 1 (where the cursor blinks) visible above the hint
		const top = Math.max(Math.round(layoutInfo.height / 4), 3 * lineHeight);
		// `left` is the center: the widget centers itself with a CSS transform
		const left = Math.round((layoutInfo.width - layoutInfo.verticalScrollbarWidth) / 2);
		return { preference: { top, left } };
	}

	/**
	 * The visible entries, in groups that are separated by a divider.
	 */
	private _getEntryGroups(): IEmptyEditorHintActionEntry[][] {
		const resource = this._editor.getModel()?.uri;
		const hasInlineChat = this._chatAgentService.getActivatedAgents().some(agent => agent.locations.includes(ChatAgentLocation.EditorInline));
		const chatEnabled = this._contextKeyService.contextMatchesRules(ChatContextKeys.enabled);
		const markdownEditorAvailable = !!resource && this._editorResolverService.getEditors(resource).some(editor => editor.id === markdownEditorId);

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
			markdownEditorAvailable ? {
				action: 'openMarkdownEditor',
				label: localize('emptyEditorHintActions.openMarkdownEditor', "Open in Markdown Editor"),
				icon: Codicon.markdown,
				run: () => this._commandService.executeCommand(REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID, markdownEditorId),
			} : undefined,
			{
				action: 'openWith',
				label: localize('emptyEditorHintActions.openWith', "Open With Another Editor..."),
				icon: Codicon.files,
				run: () => this._commandService.executeCommand(reopenWithEditorCommandId),
			},
		]];
		return groups.map(group => coalesce(group)).filter(group => group.length > 0);
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
			async () => {
				this._logEvent('action', 'close');
				this._editor.focus();
				this._options.close();
			}
		)), { icon: true, label: false });
	}

	private _renderFooter(): void {
		const footer = append(this._domNode, $('.empty-editor-hint-actions-footer'));
		append(footer, $('span')).textContent = localize('emptyEditorHintActions.startTyping', "Start typing to dismiss");
		append(footer, $('span.empty-editor-hint-actions-footer-separator')).textContent = '\u00b7';
		const dontShowAgain = append(footer, $('a.empty-editor-hint-actions-dont-show'));
		dontShowAgain.setAttribute('role', 'button');
		dontShowAgain.tabIndex = 0;
		dontShowAgain.textContent = localize('emptyEditorHintActions.dontShowAgain', "Don't show again");
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
