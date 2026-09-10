/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { AnchorAlignment, AnchorPosition } from '../../../../base/common/layout.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { ContextViewHandler } from '../../../../platform/contextview/browser/contextViewService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ISessionPullRequestCreation, ISessionPullRequestOptions } from '../common/pullRequestCreation.js';
import { CreatePullRequestFocusedContext } from '../common/changes.js';
import { CreatePullRequestPreferences } from '../common/createPullRequestPreferences.js';
import { CreatePullRequestWidget, ICreatePullRequestWidgetOptions } from './createPullRequestWidget.js';

export class CreatePullRequestContextView extends Disposable {
	private readonly view = this._register(new MutableDisposable());
	private readonly formContextView: ContextViewHandler;
	private readonly preferences: CreatePullRequestPreferences;

	constructor(
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILayoutService layoutService: ILayoutService,
		@IHoverService private readonly hoverService: IHoverService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IStorageService storageService: IStorageService,
		@ILogService logService: ILogService,
	) {
		super();
		// Keep the form alive when Accessibility Help uses the shared context view.
		this.formContextView = this._register(new ContextViewHandler(layoutService));
		this.preferences = new CreatePullRequestPreferences(storageService, logService);
	}

	show(anchor: HTMLElement, creation: ISessionPullRequestCreation, options?: Pick<ICreatePullRequestWidgetOptions, 'branchName' | 'baseBranchName' | 'initialDraft' | 'sendToChat'> & { readonly onHide?: () => void; readonly onRestoreFocus?: () => void }, onCreated?: (options: ISessionPullRequestOptions) => void): void {
		this.close();
		const previouslyFocused = dom.getActiveElement();
		let widget: CreatePullRequestWidget;
		let active = true;
		let restoreFocus = true;
		const view = this.formContextView.showContextView({
			getAnchor: () => anchor,
			anchorAlignment: AnchorAlignment.RIGHT,
			anchorPosition: AnchorPosition.BELOW,
			layer: -1,
			render: container => {
				const store = new DisposableStore();
				widget = store.add(new CreatePullRequestWidget({
					...options,
					creation,
					preferences: this.preferences.read(),
					onDidChangePreferences: change => this.preferences.update(change),
					onCancel: () => this.close(),
					onCreated: (options, message) => {
						if (message) {
							this.notificationService.info(message);
						}
						onCreated?.(options);
						if (active) {
							this.close();
						}
					},
					onDetachedError: error => this.notificationService.error(error),
					onDidSendToChat: () => {
						if (active) {
							this.close();
						}
					},
					onLayout: () => this.formContextView.layout(),
				}, this.hoverService, this.contextMenuService));
				container.appendChild(widget.domNode);
				store.add(toDisposable(() => widget.domNode.remove()));
				const contextKeyService = store.add(this.contextKeyService.createScoped(widget.domNode));
				CreatePullRequestFocusedContext.bindTo(contextKeyService).set(true);
				widget.layout();
				return store;
			},
			focus: () => widget.focus(),
			layout: () => widget.layout(),
			onDOMEvent: (event: Event | StandardMouseEvent) => {
				if (!(event instanceof StandardMouseEvent) || event.browserEvent.type !== dom.EventType.CLICK) {
					return;
				}
				const path = event.browserEvent.composedPath();
				if (!widget.isSubmitting && !path.includes(widget.domNode) && !path.includes(anchor) && !path.includes(this.contextViewService.getContextViewElement())) {
					restoreFocus = false;
					this.close();
				}
			},
			onHide: () => {
				active = false;
				if (restoreFocus) {
					if (dom.isHTMLElement(previouslyFocused) && previouslyFocused.isConnected) {
						previouslyFocused.focus();
					} else if (options?.onRestoreFocus) {
						options.onRestoreFocus();
					} else {
						anchor.focus();
					}
				}
				options?.onHide?.();
			},
		});
		this.view.value = toDisposable(() => view.close());
	}

	close(): void {
		this.view.clear();
	}
}
