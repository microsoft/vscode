/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { raceCancellablePromises, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { combinedDisposable, Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ACTIVE_GROUP, IEditorService, type PreferredGroup } from '../../../../services/editor/common/editorService.js';
import { IEditorGroup, IEditorGroupsService, isEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { ChatViewId, ChatViewPaneTarget, IChatWidget, IChatWidgetService, IQuickChatService, isIChatViewViewContext } from '../chat.js';
import { ChatEditor, IChatEditorOptions } from '../widgetHosts/editor/chatEditor.js';
import { ChatEditorInput } from '../widgetHosts/editor/chatEditorInput.js';
import { ChatViewPane } from '../widgetHosts/viewPane/chatViewPane.js';

export class ChatWidgetService extends Disposable implements IChatWidgetService {

	declare readonly _serviceBrand: undefined;

	private _widgets: IChatWidget[] = [];
	private _lastFocusedWidget: IChatWidget | undefined = undefined;

	private readonly _onDidAddWidget = this._register(new Emitter<IChatWidget>());
	readonly onDidAddWidget = this._onDidAddWidget.event;

	private readonly _onDidBackgroundSession = this._register(new Emitter<URI>());
	readonly onDidBackgroundSession = this._onDidBackgroundSession.event;

	constructor(
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IViewsService private readonly viewsService: IViewsService,
		@IQuickChatService private readonly quickChatService: IQuickChatService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IEditorService private readonly editorService: IEditorService,
		@IChatService private readonly chatService: IChatService,
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

	getWidgetBySessionResource(sessionResource: URI): IChatWidget | undefined {
		return this._widgets.find(w => isEqual(w.viewModel?.sessionResource, sessionResource));
	}

	async revealWidget(preserveFocus?: boolean): Promise<IChatWidget | undefined> {
		const last = this.lastFocusedWidget;
		if (last && await this.reveal(last, preserveFocus)) {
			return last;
		}

		return (await this.viewsService.openView<ChatViewPane>(ChatViewId, !preserveFocus))?.widget;
	}

	async reveal(widget: IChatWidget, preserveFocus?: boolean): Promise<boolean> {
		if (widget.viewModel?.sessionResource) {
			const alreadyOpenWidget = await this.revealSessionIfAlreadyOpen(widget.viewModel.sessionResource, { preserveFocus });
			if (alreadyOpenWidget) {
				return true;
			}
		}

		if (isIChatViewViewContext(widget.viewContext)) {
			const view = await this.viewsService.openView(widget.viewContext.viewId, !preserveFocus);
			if (!preserveFocus) {
				view?.focus();
			}
			return !!view;
		}

		return false;
	}

	/**
	 * Reveal the session if already open, otherwise open it.
	 */
	openSession(sessionResource: URI, target?: typeof ChatViewPaneTarget): Promise<IChatWidget | undefined>;
	openSession(sessionResource: URI, target?: PreferredGroup, options?: IChatEditorOptions): Promise<IChatWidget | undefined>;
	async openSession(sessionResource: URI, target?: typeof ChatViewPaneTarget | PreferredGroup, options?: IChatEditorOptions): Promise<IChatWidget | undefined> {
		// Reveal if already open unless instructed otherwise
		if (typeof target === 'undefined' || options?.revealIfOpened) {
			const alreadyOpenWidget = await this.revealSessionIfAlreadyOpen(sessionResource, options);
			if (alreadyOpenWidget) {
				return alreadyOpenWidget;
			}
		} else {
			await this.prepareSessionForMove(sessionResource, target);
		}

		// Load this session in chat view
		if (target === ChatViewPaneTarget) {
			const chatView = await this.viewsService.openView<ChatViewPane>(ChatViewId, !options?.preserveFocus);
			if (chatView) {
				await chatView.loadSession(sessionResource);
				if (!options?.preserveFocus) {
					chatView.focusInput();
				}
			}
			return chatView?.widget;
		}

		// Open in chat editor
		const pane = await this.editorService.openEditor({
			resource: sessionResource,
			options: {
				...options,
				revealIfOpened: options?.revealIfOpened ?? true // always try to reveal if already opened unless explicitly told not to
			}
		}, target);
		return pane instanceof ChatEditor ? pane.widget : undefined;
	}

	private async revealSessionIfAlreadyOpen(sessionResource: URI, options?: IChatEditorOptions): Promise<IChatWidget | undefined> {
		// Already open in chat view?
		const chatView = this.viewsService.getViewWithId<ChatViewPane>(ChatViewId);
		if (chatView?.widget.viewModel?.sessionResource && isEqual(chatView.widget.viewModel.sessionResource, sessionResource)) {
			const view = await this.viewsService.openView(ChatViewId, !options?.preserveFocus);
			if (!options?.preserveFocus) {
				view?.focus();
			}
			return chatView.widget;
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
			if (!isGroupActive()) {
				ensureFocusTransfer = raceCancellablePromises([
					timeout(500),
					Event.toPromise(Event.once(Event.filter(this.layoutService.onDidChangeActiveContainer, isGroupActive))),
				]);
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

	private async prepareSessionForMove(sessionResource: URI, target: typeof ChatViewPaneTarget | PreferredGroup | undefined): Promise<void> {
		const existingWidget = this.getWidgetBySessionResource(sessionResource);
		if (existingWidget) {
			const existingEditor = isIChatViewViewContext(existingWidget.viewContext) ?
				undefined :
				this.findExistingChatEditorByUri(sessionResource);

			if (isIChatViewViewContext(existingWidget.viewContext) && target === ChatViewPaneTarget) {
				return;
			}

			if (!isIChatViewViewContext(existingWidget.viewContext) && target !== ChatViewPaneTarget && existingEditor && this.isSameEditorTarget(existingEditor.group.id, target)) {
				return;
			}

			if (existingEditor) {
				// widget.clear() on an editor leaves behind an empty chat editor
				await this.editorService.closeEditor({ editor: existingEditor.editor, groupId: existingEditor.group.id }, { preserveFocus: true });
			} else {
				await existingWidget.clear();
			}
		}
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
	}

	register(newWidget: IChatWidget): IDisposable {
		if (this._widgets.some(widget => widget === newWidget)) {
			throw new Error('Cannot register the same widget multiple times');
		}

		this._widgets.push(newWidget);
		this._onDidAddWidget.fire(newWidget);

		return combinedDisposable(
			newWidget.onDidFocus(() => this.setLastFocusedWidget(newWidget)),
			newWidget.onDidChangeViewModel(({ previousSessionResource, currentSessionResource }) => {
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
			toDisposable(() => this._widgets.splice(this._widgets.indexOf(newWidget), 1))
		);
	}
}
