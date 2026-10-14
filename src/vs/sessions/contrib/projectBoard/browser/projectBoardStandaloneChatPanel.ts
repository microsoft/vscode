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
import { ProjectBoardChatOpenTelemetry } from './projectBoardChatOpenTelemetry.js';
import { createProjectBoardChatLoading, ProjectBoardChatContent } from './projectBoardChatSidePanel.js';

export class ProjectBoardStandaloneChatState {
	readonly viewStates = new LRUCache<string, IChatWidgetViewState>(CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT);
	readonly pendingInputs = new LRUCache<string, IChatModelInputState>(CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT);
}

export class ProjectBoardStandaloneChatPanel extends Disposable {
	private readonly request = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly loading = this._register(new MutableDisposable<{ element: HTMLElement; dispose(): void }>());
	private readonly activeObserver = this._register(new MutableDisposable());
	private readonly contents: ProjectBoardChatContent[] = [];
	private content: ProjectBoardChatContent | undefined;
	private pendingContent: ProjectBoardChatContent | undefined;
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
		this.disposePendingContent();
		const request = new CancellationTokenSource();
		this.request.value = request;
		const token = request.token;
		const cardId = getProjectBoardCardId(card.session, card.chat);
		const reusable = this.contents.find(content => content.hasLoadedModel() && content.cardId.get() === cardId);
		const telemetry = this.instantiationService.createInstance(ProjectBoardChatOpenTelemetry, 'standaloneSidePanel', card.session.providerId, !!reusable);
		this.onClose = onClose;
		try {
			if (!reusable) {
				this.deactivateContent();
				this.loading.clear();
				this.loading.value = createProjectBoardChatLoading(this.container, card, () => this.close(), this.instantiationService);
				telemetry.loadingPresented();
				this._visible.set(true, undefined);
				this.layoutContent();
			}
			const trusted = await telemetry.measure('trustDurationMs', () => raceCancellationError(this.sessionsService.canOpenSession(card.session), token));
			if (token.isCancellationRequested) {
				return;
			}
			if (!trusted) {
				telemetry.finish('denied');
				this.close();
				return;
			}
			if (!reusable || !reusable.hasLoadedModel()) {
				if (this.loading.value) {
					await telemetry.measure('loadingPaintDurationMs', () => renderChatLoadingProgress(this.loading.value!.element, token));
				}
				if (token.isCancellationRequested) {
					return;
				}
				this.loading.clear();
				const content = this.instantiationService.createInstance(ProjectBoardChatContent, { ...card, container: this.container }, this.state.viewStates, this.state.pendingInputs, () => this.close());
				this.pendingContent = content;
				this.content = content;
				this.container.appendChild(content.element);
				content.setVisible(true);
				this.layoutContent();
				await raceCancellationError(content.load(token, telemetry), token);
				if (token.isCancellationRequested || this.pendingContent !== content || !content.hasLoadedModel()) {
					return;
				}
				this.pendingContent = undefined;
				this.contents.push(content);
				this.activateContent(content);
				this.evictInactiveContent();
			} else {
				this.activateContent(reusable);
			}
			if (!token.isCancellationRequested && this.container.ownerDocument.hasFocus()) {
				this.content?.focus();
				try {
					await this.managementService.markRead(card.session);
				} catch (error) {
					this.logService.error('[ProjectBoard] Failed to mark standalone panel chat read', error);
					this.notificationService.error(localize('projectBoard.standalonePanelMarkReadFailed', "The chat opened, but its read state could not be updated."));
				}
			}
			await this.content?.waitForTranscriptPaint(token);
			telemetry.transcriptPaintOpportunity();
			telemetry.finish('success');
		} catch (error) {
			if (!token.isCancellationRequested && !isCancellationError(error)) {
				telemetry.finish('failure');
				this.close(false);
				throw error;
			}
		} finally {
			telemetry.finish('cancelled');
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
			this.content?.layout(height, width);
		}
	}

	private activateContent(content: ProjectBoardChatContent): void {
		if (this.content !== content) {
			this.deactivateContent();
			this.content = content;
		}
		this.loading.clear();
		content.element.style.display = '';
		content.setVisible(true);
		this.layoutContent();
		const index = this.contents.indexOf(content);
		if (index >= 0 && index !== this.contents.length - 1) {
			this.contents.splice(index, 1);
			this.contents.push(content);
		}
		this.activeObserver.value = autorun(reader => this._activeCardId.set(content.cardId.read(reader), undefined));
	}

	private deactivateContent(): void {
		this.activeObserver.clear();
		this._activeCardId.set(undefined, undefined);
		if (this.content) {
			this.content.setVisible(false);
			this.content.element.style.display = 'none';
			this.content = undefined;
		}
	}

	private evictInactiveContent(): void {
		while (this.contents.length > 2) {
			const content = this.contents.shift()!;
			if (content === this.content) {
				this.contents.push(content);
				continue;
			}
			content.dispose();
		}
	}

	private disposePendingContent(): void {
		const pending = this.pendingContent;
		if (!pending) {
			return;
		}
		this.pendingContent = undefined;
		if (this.content === pending) {
			this.content = undefined;
		}
		pending.dispose();
	}

	private clear(): void {
		this.deactivateContent();
		this.disposePendingContent();
		this.loading.clear();
		for (const content of this.contents.splice(0)) {
			content.dispose();
		}
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
