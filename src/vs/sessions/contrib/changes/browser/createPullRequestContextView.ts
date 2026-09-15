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
import { CreatePullRequestWidget, ICreatePullRequestFormContent, ICreatePullRequestWidgetOptions } from './createPullRequestWidget.js';

export class CreatePullRequestContextView extends Disposable {
	private readonly view = this._register(new MutableDisposable());
	private readonly formContextView: ContextViewHandler;
	private readonly preferences: CreatePullRequestPreferences;
	private readonly savedContent = new WeakMap<ISessionPullRequestCreation, {
		readonly branchName: string | undefined;
		readonly baseBranchName: string | undefined;
		readonly content: ICreatePullRequestFormContent;
	}>();

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
		const saved = this.savedContent.get(creation);
		const initialContent = saved?.branchName === options?.branchName && saved?.baseBranchName === options?.baseBranchName ? saved?.content : undefined;
		this.savedContent.delete(creation);
		const previouslyFocused = dom.getActiveElement();
		let widget: CreatePullRequestWidget;
		let active = true;
		let restoreFocus = true;
		let preserveContent = true;
		let submittedContent: ICreatePullRequestFormContent | undefined;
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
					initialContent,
					preferences: this.preferences.read(),
					onDidChangePreferences: change => this.preferences.update(change),
					onCancel: () => {
						preserveContent = false;
						this.close();
					},
					onDismiss: () => this.close(),
					onWillCreate: () => {
						submittedContent = widget.getFormContent();
						this.savedContent.set(creation, {
							branchName: options?.branchName,
							baseBranchName: options?.baseBranchName,
							content: submittedContent,
						});
						this.close();
					},
					onCreated: (options, message) => {
						preserveContent = false;
						if (submittedContent && this.savedContent.get(creation)?.content === submittedContent) {
							this.savedContent.delete(creation);
						}
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
						preserveContent = false;
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
				if (preserveContent && !widget.isSubmitting) {
					this.savedContent.set(creation, {
						branchName: options?.branchName,
						baseBranchName: options?.baseBranchName,
						content: widget.getFormContent(),
					});
				}
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
