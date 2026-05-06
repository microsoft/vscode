/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatWidget.css';
import './media/newChatInSession.css';
import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { derived } from '../../../../base/common/observable.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { NewChatInputWidget } from './newChatInput.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';

// #region --- New Chat In Session Widget ---

const STORAGE_KEY_SUB_SESSION_TIP_DISMISSED = 'sessions.subSessionTipDismissed';

/**
 * A widget for composing a secondary chat within an existing session.
 * Reuses {@link NewChatInputWidget} but without workspace/session type pickers,
 * since the session already exists.
 */
class NewChatInSessionWidget extends Disposable {

	private readonly _newChatInput: NewChatInputWidget;
	private readonly _tipDisposable = this._register(new MutableDisposable());

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		const canSendRequest = derived(reader => {
			const session = this.sessionsManagementService.activeSession.read(reader);
			return !!session;
		});

		const loading = derived(_reader => false);

		this._newChatInput = this._register(this.instantiationService.createInstance(NewChatInputWidget, {
			getContextFolderUri: () => this._getContextFolderUri(),
			sendRequest: async (text: string, attachedContext?: IChatRequestVariableEntry[]) => this._send(text, attachedContext),
			canSendRequest,
			loading,
			minEditorHeight: 64,
			placeholder: localize('newChatInSessionPlaceholder', 'Ask a follow-up question or start a new topic within this session...'),
		}));
	}

	// --- Rendering ---

	render(parent: HTMLElement): void {
		const element = dom.append(parent, dom.$('.sessions-chat-widget.new-chat-in-session'));
		const chatWidgetContainer = dom.append(element, dom.$('.new-chat-widget-container'));
		const chatWidgetContent = dom.append(chatWidgetContainer, dom.$('.new-chat-widget-content'));

		this._renderSubSessionTip(chatWidgetContent);
		this._newChatInput.render(chatWidgetContent, parent);

		chatWidgetContainer.classList.add('revealed');
	}

	private _renderSubSessionTip(container: HTMLElement): void {
		if (this.storageService.getBoolean(STORAGE_KEY_SUB_SESSION_TIP_DISMISSED, StorageScope.PROFILE, false)) {
			return;
		}

		const tipContainer = dom.append(container, dom.$('.sub-session-tip-container'));
		const tipWidget = dom.append(tipContainer, dom.$('.sub-session-tip-widget'));
		tipWidget.setAttribute('role', 'status');
		tipWidget.setAttribute('aria-label', localize('subSessionTip.ariaLabel', "Sub-session tip"));

		// Tip icon
		const iconEl = dom.append(tipWidget, renderIcon(Codicon.lightbulb));
		iconEl.classList.add('sub-session-tip-icon');

		// Tip text
		const textEl = dom.append(tipWidget, dom.$('span.sub-session-tip-text'));
		textEl.textContent = localize(
			'subSessionTip.message',
			"This is a sub-session, a new chat in the same workspace. Use it to ask questions, run tasks, or explore ideas with fresh context."
		);

		// Dismiss button
		const dismissBtn = dom.append(tipWidget, dom.$('button.sub-session-tip-dismiss')) as HTMLButtonElement;
		dismissBtn.type = 'button';
		dismissBtn.setAttribute('aria-label', localize('subSessionTip.dismiss', "Dismiss tip"));
		dom.append(dismissBtn, renderIcon(Codicon.close));

		const dismiss = () => {
			this.storageService.store(STORAGE_KEY_SUB_SESSION_TIP_DISMISSED, true, StorageScope.PROFILE, StorageTarget.USER);
			tipContainer.remove();
			this._tipDisposable.clear();
		};

		const handleDismiss = (e: Event) => {
			dom.EventHelper.stop(e, true);
			dismiss();
		};

		const store = new DisposableStore();
		store.add(Gesture.addTarget(dismissBtn));
		store.add(dom.addDisposableListener(dismissBtn, dom.EventType.CLICK, handleDismiss));
		store.add(dom.addDisposableListener(dismissBtn, TouchEventType.Tap, handleDismiss));
		this._tipDisposable.value = store;
	}

	/**
	 * Returns the workspace URI from the active session's workspace.
	 */
	private _getContextFolderUri(): URI | undefined {
		const session = this.sessionsManagementService.activeSession.get();
		const workspace = session?.workspace.get();
		return workspace?.repositories[0]?.workingDirectory ?? workspace?.repositories[0]?.uri;
	}

	// --- Send ---

	private async _send(query: string, attachedContext?: IChatRequestVariableEntry[]): Promise<void> {
		const activeSession = this.sessionsManagementService.activeSession.get();
		if (!activeSession) {
			return;
		}
		const activeChat = activeSession.activeChat.get();
		try {
			await this.sessionsManagementService.sendRequest(activeSession, activeChat, { query, attachedContext });
		} catch (e) {
			this.logService.error('Failed to send secondary chat request:', e);
		}
	}

	layout(height: number, width: number): void {
		this._newChatInput.layout(height, width);
	}

	focusInput(): void {
		this._newChatInput.focus();
	}
}

// #endregion

// #region --- New Chat In Session View Pane ---

export const NewChatInSessionViewId = 'workbench.view.sessions.newChatInSession';

/**
 * A view pane that hosts the new-chat-in-session widget.
 * Shown when the user wants to compose a secondary chat within the active session.
 */
export class NewChatInSessionViewPane extends ViewPane {

	private _widget: NewChatInSessionWidget | undefined;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._widget = this._register(this.instantiationService.createInstance(
			NewChatInSessionWidget,
		));

		this._widget.render(container);
		this._widget.focusInput();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this._widget?.layout(height, width);
	}

	override focus(): void {
		super.focus();
		this._widget?.focusInput();
	}

	override setVisible(visible: boolean): void {
		super.setVisible(visible);
		if (visible) {
			this._widget?.focusInput();
		}
	}
}

// #endregion
