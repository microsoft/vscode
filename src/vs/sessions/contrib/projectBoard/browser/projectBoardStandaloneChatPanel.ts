/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { size } from '../../../../base/browser/dom.js';
import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../base/common/map.js';
import { autorun, IObservable, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT, IChatWidgetViewState } from '../../../../workbench/contrib/chat/browser/chat.js';
import { renderChatLoadingProgress } from '../../../../workbench/contrib/chat/browser/chatLoadingProgress.js';
import { IChatModelInputState } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { getProjectBoardCardId, IProjectBoardCard } from '../common/projectBoardModel.js';
import { createProjectBoardChatLoading, ProjectBoardChatContent } from './projectBoardChatSidePanel.js';

export class ProjectBoardStandaloneChatState {
	readonly viewStates = new LRUCache<string, IChatWidgetViewState>(CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT);
	readonly pendingInputs = new LRUCache<string, IChatModelInputState>(CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT);
}

export class ProjectBoardStandaloneChatPanel extends Disposable {
	private readonly request = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly content = this._register(new MutableDisposable<ProjectBoardChatContent>());
	private readonly loading = this._register(new MutableDisposable<{ element: HTMLElement; dispose(): void }>());
	private readonly activeObserver = this._register(new MutableDisposable());
	private readonly _activeCardId = observableValue<string | undefined>(this, undefined);
	readonly activeCardId: IObservable<string | undefined> = this._activeCardId;
	private readonly _visible = observableValue(this, false);
	readonly visible: IObservable<boolean> = this._visible;
	private dimensions: { width: number; height: number } | undefined;
	private onClose: (() => void) | undefined;

	constructor(
		private readonly container: HTMLElement,
		private readonly state: ProjectBoardStandaloneChatState,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService private readonly managementService: ISessionsManagementService,
		@IChatEntitlementService private readonly entitlementService: IChatEntitlementService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this._register(entitlementService.onDidChangeSentiment(() => {
			if (entitlementService.sentiment.hidden) {
				this.close(false);
			}
		}));
	}

	async open(card: Pick<IProjectBoardCard, 'session' | 'chat'>, onClose: () => void): Promise<void> {
		if (this._store.isDisposed || this.entitlementService.sentiment.hidden) {
			throw new Error(localize('projectBoard.standalonePanelUnavailable', "The Agents Hub chat panel is not available."));
		}
		this.request.value?.cancel();
		const request = new CancellationTokenSource();
		this.request.value = request;
		const token = request.token;
		const reusable = this.content.value?.hasLoadedModel() && this.activeCardId.get() === getProjectBoardCardId(card.session, card.chat) ? this.content.value : undefined;
		this.onClose = onClose;
		try {
			if (!reusable) {
				this.clear();
				this.loading.value = createProjectBoardChatLoading(this.container, card, () => this.close(), this.instantiationService);
				this._visible.set(true, undefined);
				this.layoutContent();
			}
			const trusted = await raceCancellationError(this.sessionsService.canOpenSession(card.session), token);
			if (token.isCancellationRequested) {
				return;
			}
			if (!trusted) {
				this.close();
				return;
			}
			if (!reusable || this.content.value !== reusable || !reusable.hasLoadedModel()) {
				if (this.loading.value) {
					await renderChatLoadingProgress(this.loading.value.element, token);
				}
				if (token.isCancellationRequested) {
					return;
				}
				this.loading.clear();
				const content = this.instantiationService.createInstance(ProjectBoardChatContent, { ...card, container: this.container }, this.state.viewStates, this.state.pendingInputs, () => this.close());
				this.content.value = content;
				this.container.appendChild(content.element);
				content.setVisible(true);
				this.layoutContent();
				await raceCancellationError(content.load(token), token);
				if (token.isCancellationRequested || this.content.value !== content || !content.hasLoadedModel()) {
					return;
				}
				this.activeObserver.value = autorun(reader => this._activeCardId.set(content.cardId.read(reader), undefined));
			}
			if (!token.isCancellationRequested && this.container.ownerDocument.hasFocus()) {
				this.content.value?.focus();
				try {
					await this.managementService.markRead(card.session);
				} catch (error) {
					this.logService.error('[ProjectBoard] Failed to mark standalone panel chat read', error);
					this.notificationService.error(localize('projectBoard.standalonePanelMarkReadFailed', "The chat opened, but its read state could not be updated."));
				}
			}
		} catch (error) {
			if (!token.isCancellationRequested && !isCancellationError(error)) {
				this.close(false);
				throw error;
			}
		}
	}

	layout(height: number, width: number): void {
		this.dimensions = { height, width };
		this.layoutContent();
	}

	private layoutContent(): void {
		if (this.dimensions) {
			const { height, width } = this.dimensions;
			size(this.container, width, height);
			if (this.loading.value) {
				size(this.loading.value.element, width, height);
			}
			this.content.value?.layout(height, width);
		}
	}

	private clear(): void {
		this.activeObserver.clear();
		this._activeCardId.set(undefined, undefined);
		this.loading.clear();
		this.content.clear();
	}

	close(restoreFocus = true): void {
		const onClose = this.onClose;
		this.onClose = undefined;
		this.request.value?.cancel();
		this.request.clear();
		this.clear();
		this._visible.set(false, undefined);
		if (restoreFocus && this.container.ownerDocument.hasFocus()) {
			onClose?.();
		}
	}

	override dispose(): void {
		this.close(false);
		super.dispose();
	}
}
