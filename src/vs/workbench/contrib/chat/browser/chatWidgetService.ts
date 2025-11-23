/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { raceCancellablePromises, timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { combinedDisposable, Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { IEditorService, PreferredGroup } from '../../../../workbench/services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ChatAgentLocation } from '../common/constants.js';
import { ChatViewId, ChatViewPaneTarget, IChatWidget, IChatWidgetService, IQuickChatService, isIChatViewViewContext } from './chat.js';
import { ChatEditor, IChatEditorOptions } from './chatEditor.js';
import { findExistingChatEditorByUri } from './chatSessions/common.js';
import { ChatViewPane } from './chatViewPane.js';

export class ChatWidgetService extends Disposable implements IChatWidgetService {

	declare readonly _serviceBrand: undefined;

	private _widgets: IChatWidget[] = [];
	private _lastFocusedWidget: IChatWidget | undefined = undefined;

	private readonly _onDidAddWidget = this._register(new Emitter<IChatWidget>());
	readonly onDidAddWidget: Event<IChatWidget> = this._onDidAddWidget.event;

	constructor(
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IViewsService private readonly viewsService: IViewsService,
		@IQuickChatService private readonly quickChatService: IQuickChatService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IEditorService private readonly editorService: IEditorService,
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
			const alreadyOpenWidget = await this.revealSessionIfAlreadyOpen(widget.viewModel.sessionResource, preserveFocus);
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
		const alreadyOpenWidget = await this.revealSessionIfAlreadyOpen(sessionResource, options?.preserveFocus);
		if (alreadyOpenWidget) {
			return alreadyOpenWidget;
		}

		// Load this session in chat view
		if (target === ChatViewPaneTarget) {
			const chatViewPane = await this.viewsService.openView<ChatViewPane>(ChatViewId, true);
			if (chatViewPane) {
				await chatViewPane.loadSession(sessionResource);
				if (!options?.preserveFocus) {
					chatViewPane.focusInput();
				}
			}
			return chatViewPane?.widget;
		}

		// Open in chat editor
		const pane = await this.editorService.openEditor({ resource: sessionResource, options }, target);
		return pane instanceof ChatEditor ? pane.widget : undefined;
	}

	private async revealSessionIfAlreadyOpen(sessionResource: URI, preserveFocus?: boolean): Promise<IChatWidget | undefined> {
		// Already open in chat view?
		const chatView = this.viewsService.getViewWithId<ChatViewPane>(ChatViewId);
		if (chatView?.widget.viewModel?.sessionResource && isEqual(chatView.widget.viewModel.sessionResource, sessionResource)) {
			const view = await this.viewsService.openView(ChatViewId, true);
			if (!preserveFocus) {
				view?.focus();
			}
			return chatView.widget;
		}

		// Already open in an editor?
		const existingEditor = findExistingChatEditorByUri(sessionResource, this.editorGroupsService);
		if (existingEditor) {
			// focus transfer to other documents is async. If we depend on the focus
			// being synchronously transferred in consuming code, this can fail, so
			// wait for it to propagate
			const isGroupActive = () => dom.getWindowId(dom.getWindow(this.layoutService.activeContainer)) === existingEditor.group.windowId;

			let ensureFocusTransfer: Promise<void> | undefined;
			if (!isGroupActive()) {
				ensureFocusTransfer = raceCancellablePromises([
					timeout(500),
					Event.toPromise(Event.once(Event.filter(this.layoutService.onDidChangeActiveContainer, isGroupActive))),
				]);
			}

			const pane = await this.editorService.openEditor(existingEditor.editor, { preserveFocus }, existingEditor.group);
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
			toDisposable(() => this._widgets.splice(this._widgets.indexOf(newWidget), 1))
		);
	}
}
