/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { combinedDisposable, Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ACTIVE_GROUP, IEditorService, type PreferredGroup } from '../../../../services/editor/common/editorService.js';
import { IEditorGroup, IEditorGroupsService, isEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { ChatViewId, ChatViewPaneTarget, IChatWidget, IChatWidgetService, IQuickChatService, isIChatResourceViewContext, isIChatViewViewContext } from '../chat.js';
import { IChatViewHostService } from '../chatViewHost.js';
import { ChatEditor, IChatEditorOptions } from '../widgetHosts/editor/chatEditor.js';
import { ChatEditorInput } from '../widgetHosts/editor/chatEditorInput.js';

export class ChatWidgetService extends Disposable implements IChatWidgetService {

	declare readonly _serviceBrand: undefined;

	private _widgets: IChatWidget[] = [];
	private _lastFocusedWidget: IChatWidget | undefined = undefined;

	private readonly _onDidAddWidget = this._register(new Emitter<IChatWidget>());
	readonly onDidAddWidget = this._onDidAddWidget.event;

	private readonly _onDidRemoveWidget = this._register(new Emitter<IChatWidget>());
	readonly onDidRemoveWidget = this._onDidRemoveWidget.event;

	private readonly _onDidChangeWidgetVisibility = this._register(new Emitter<IChatWidget>());
	readonly onDidChangeWidgetVisibility = this._onDidChangeWidgetVisibility.event;

	private readonly _onDidBackgroundSession = this._register(new Emitter<URI>());
	readonly onDidBackgroundSession = this._onDidBackgroundSession.event;

	private readonly _onDidChangeFocusedWidget = this._register(new Emitter<IChatWidget | undefined>());
	readonly onDidChangeFocusedWidget = this._onDidChangeFocusedWidget.event;

	private readonly _onDidChangeFocusedSession = this._register(new Emitter<void>());
	readonly onDidChangeFocusedSession = this._onDidChangeFocusedSession.event;

	constructor(
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IViewsService private readonly viewsService: IViewsService,
		@IQuickChatService private readonly quickChatService: IQuickChatService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IEditorService private readonly editorService: IEditorService,
		@IChatService private readonly chatService: IChatService,
		@ILogService private readonly logService: ILogService,
		@IChatViewHostService private readonly chatViewHostService: IChatViewHostService,
	) {
		super();
	}

	get lastFocusedWidget(): IChatWidget | undefined {
		return this._lastFocusedWidget;
	}

	getAllWidgets(): ReadonlyArray<IChatWidget> {
		return this._widgets;
	}

	getWidgetsByLocations(location: ChatAgentLocation): ReadonlyArray<IChatWidget> {
		return this._widgets.filter(w => w.location === location);
	}

	getWidgetByInputUri(uri: URI): IChatWidget | undefined {
		return this._widgets.find(w => isEqual(w.input.inputUri, uri));
	}

	getWidgetBySessionResource(sessionResource: URI, options?: { readonly preferInputRequests?: boolean }): IChatWidget | undefined {
		const matches = (widget: IChatWidget) => isEqual(widget.viewModel?.sessionResource, sessionResource);
		if (options?.preferInputRequests) {
			const widget = this._widgets.find(widget => matches(widget) && widget.supportsInputRequests !== false);
			if (widget) {
				return widget;
			}
		}
		return this._widgets.find(matches);
	}

	async revealWidget(preserveFocus?: boolean): Promise<IChatWidget | undefined> {
		const last = this.lastFocusedWidget;
		// The Chat view's widgets are shown by the host of its chats, which may have replaced the Chat view: what it shows is the result
		if (last && !(isIChatViewViewContext(last.viewContext) && last.viewContext.viewId === ChatViewId) && await this.reveal(last, preserveFocus)) {
			return last;
		}

		return this.revealChatView(preserveFocus);
	}

	revealChatView(preserveFocus?: boolean): Promise<IChatWidget | undefined> {
		return this.chatViewHostService.reveal(preserveFocus);
	}

	async reveal(widget: IChatWidget, preserveFocus?: boolean): Promise<boolean> {
		if (widget.viewModel?.sessionResource) {
			const alreadyOpenWidget = await this.revealSessionIfAlreadyOpen(widget.viewModel.sessionResource, { preserveFocus });
			if (alreadyOpenWidget) {
				return true;
			}
		}

		if (isIChatViewViewContext(widget.viewContext)) {
			if (widget.viewContext.viewId === ChatViewId) {
				return !!await this.chatViewHostService.reveal(preserveFocus);
			}
			const view = await this.viewsService.openView(widget.viewContext.viewId, !preserveFocus);
			if (!preserveFocus) {
				view?.focus();
			}
			return !!view;
		}

		// A chat widget that is hosted outside of the chat view and chat editors,
		// such as the session chat of the Agents window, has nothing to open when
		// it is already showing.
		if (widget.visible && widget.location === ChatAgentLocation.Chat && isIChatResourceViewContext(widget.viewContext) && !widget.viewContext.isQuickChat && !widget.viewContext.isInlineChat) {
			if (!preserveFocus) {
				widget.focusInput();
			}
			return true;
		}

		return false;
	}

	/**
	 * Reveal the session if already open, otherwise open it.
	 */
	openSession(sessionResource: URI, target?: typeof ChatViewPaneTarget, options?: IChatEditorOptions): Promise<IChatWidget | undefined>;
	openSession(sessionResource: URI, target?: PreferredGroup, options?: IChatEditorOptions): Promise<IChatWidget | undefined>;
	async openSession(sessionResource: URI, target?: typeof ChatViewPaneTarget | PreferredGroup, options?: IChatEditorOptions): Promise<IChatWidget | undefined> {
		const t0 = Date.now();
		const targetKind = target === ChatViewPaneTarget ? 'view' : (typeof target === 'undefined' ? 'undefined' : 'editor');
		this.logService.trace(`[ChatWidgetService] openSession start uri=${sessionResource.toString()} target=${targetKind}`);

		// Keep the model alive until the destination has acquired its own reference.
		const modelRef = this.chatService.acquireExistingSession(sessionResource, 'ChatWidgetService#openSession');
		try {
			// Reveal if already open unless instructed otherwise
			if (typeof target === 'undefined' || options?.revealIfOpened) {
				const alreadyOpenWidget = await this.revealSessionIfAlreadyOpen(sessionResource, options);
				if (alreadyOpenWidget) {
					this.logService.trace(`[ChatWidgetService] openSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()} path=reveal`);
					return alreadyOpenWidget;
				}
			} else if (!await this.prepareSessionForMove(sessionResource, target)) {
				this.logService.trace(`[ChatWidgetService] openSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()} path=move cancelled=true`);
				return undefined;
			}

			// Load this session in the host of the Chat view's chats (preferred)
			if (target === ChatViewPaneTarget || typeof target === 'undefined') {
				const widget = await this.chatViewHostService.openSession(sessionResource, { preserveFocus: options?.preserveFocus, sessionTypeSelectionReason: options?.sessionTypeSelectionReason });
				this.logService.trace(`[ChatWidgetService] openSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()} path=view`);
				return widget;
			}

			// Open in chat editor
			const pane = await this.editorService.openEditor({
				resource: sessionResource,
				options: {
					...options,
					revealIfOpened: options?.revealIfOpened ?? true // always try to reveal if already opened unless explicitly told not to
				}
			}, target);
			this.logService.trace(`[ChatWidgetService] openSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()} path=editor`);
			return pane instanceof ChatEditor ? pane.widget : undefined;
		} finally {
			modelRef?.dispose();
		}
	}

	private async revealSessionIfAlreadyOpen(sessionResource: URI, options?: IChatEditorOptions): Promise<IChatWidget | undefined> {
		// Already open in the host of the Chat view's chats?
		const hostWidget = await this.chatViewHostService.revealIfShowing(sessionResource, options);
		if (hostWidget) {
			return hostWidget;
		}

		// Already open in an editor?
		const existingEditor = this.findExistingChatEditorByUri(sessionResource);
		if (existingEditor) {
			const existingEditorWindowId = existingEditor.group.windowId;

			// focus transfer to other documents is async. If we depend on the focus
			// being synchronously transferred in consuming code, this can fail, so
			// wait for it to propagate
			const isGroupActive = () => dom.getWindow(this.layoutService.activeContainer).vscodeWindowId === existingEditorWindowId;

			let ensureFocusTransfer: Promise<void> | undefined;
			if (!isGroupActive() && !options?.preserveFocus) {
				ensureFocusTransfer = Event.toPromise(Event.once(Event.filter(this.layoutService.onDidChangeActiveContainer, isGroupActive)));
			}

			const pane = await existingEditor.group.openEditor(existingEditor.editor, options);
			await ensureFocusTransfer;
			return pane instanceof ChatEditor ? pane.widget : undefined;
		}

		// Already open in quick chat?
		if (isEqual(sessionResource, this.quickChatService.sessionResource)) {
			this.quickChatService.focus();
			return undefined;
		}

		return undefined;
	}

	private async prepareSessionForMove(sessionResource: URI, target: typeof ChatViewPaneTarget | PreferredGroup | undefined): Promise<boolean> {
		const existingWidget = this.getWidgetBySessionResource(sessionResource);
		if (existingWidget) {
			const existingEditor = isIChatViewViewContext(existingWidget.viewContext) ?
				undefined :
				this.findExistingChatEditorByUri(sessionResource);

			if (isIChatViewViewContext(existingWidget.viewContext) && target === ChatViewPaneTarget) {
				return true;
			}

			if (!isIChatViewViewContext(existingWidget.viewContext) && target !== ChatViewPaneTarget && existingEditor && this.isSameEditorTarget(existingEditor.group.id, target)) {
				return true;
			}

			if (existingEditor) {
				// widget.clear() on an editor leaves behind an empty chat editor
				return existingEditor.editor.closeForMove(existingEditor.group);
			} else {
				await existingWidget.clear();
			}
		}
		return true;
	}

	private findExistingChatEditorByUri(sessionUri: URI): { editor: ChatEditorInput; group: IEditorGroup } | undefined {
		for (const group of this.editorGroupsService.groups) {
			for (const editor of group.editors) {
				if (editor instanceof ChatEditorInput && isEqual(editor.sessionResource, sessionUri)) {
					return { editor, group };
				}
			}
		}
		return undefined;
	}

	private isSameEditorTarget(currentGroupId: number, target?: PreferredGroup): boolean {
		return typeof target === 'number' && target === currentGroupId ||
			target === ACTIVE_GROUP && this.editorGroupsService.activeGroup?.id === currentGroupId ||
			isEditorGroup(target) && target.id === currentGroupId;
	}

	private setLastFocusedWidget(widget: IChatWidget | undefined): void {
		if (widget === this._lastFocusedWidget) {
			return;
		}

		this._lastFocusedWidget = widget;
		this._onDidChangeFocusedWidget.fire(widget);
		this._onDidChangeFocusedSession.fire();
	}

	register(newWidget: IChatWidget): IDisposable {
		if (this._widgets.some(widget => widget === newWidget)) {
			throw new Error('Cannot register the same widget multiple times');
		}

		this._widgets.push(newWidget);
		this._onDidAddWidget.fire(newWidget);

		if (!this._lastFocusedWidget) {
			this.setLastFocusedWidget(newWidget);
		}

		return combinedDisposable(
			newWidget.onDidFocus(() => this.setLastFocusedWidget(newWidget)),
			newWidget.onDidShow(() => this._onDidChangeWidgetVisibility.fire(newWidget)),
			newWidget.onDidHide(() => this._onDidChangeWidgetVisibility.fire(newWidget)),
			newWidget.onDidChangeViewModel(({ previousSessionResource, currentSessionResource }) => {
				if (this._lastFocusedWidget === newWidget && !isEqual(previousSessionResource, currentSessionResource)) {
					this._onDidChangeFocusedSession.fire();
				}

				if (!previousSessionResource || (currentSessionResource && isEqual(previousSessionResource, currentSessionResource))) {
					return;
				}

				// Timeout to ensure it wasn't just moving somewhere else
				void timeout(200).then(() => {
					if (!this.getWidgetBySessionResource(previousSessionResource) && this.chatService.getSession(previousSessionResource)) {
						this._onDidBackgroundSession.fire(previousSessionResource);
					}
				});
			}),
			toDisposable(() => {
				this._widgets.splice(this._widgets.indexOf(newWidget), 1);
				if (this._lastFocusedWidget === newWidget) {
					this.setLastFocusedWidget(undefined);
				}
				this._onDidRemoveWidget.fire(newWidget);
			})
		);
	}
}
