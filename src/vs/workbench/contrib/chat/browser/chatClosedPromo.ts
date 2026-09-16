/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService, isConfigured } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { localChatSessionType } from '../common/chatSessionsService.js';
import { ChatClosedPromoNotification, ChatConfiguration } from '../common/constants.js';
import { COPILOT_VENDOR_ID, ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../common/languageModels.js';
import { getChatSessionType } from '../common/model/chatUri.js';
import { ChatViewId, IChatWidgetService } from './chat.js';
import { DISMISSED_PROMOS_STORAGE_KEY, SEEN_PROMOS_STORAGE_KEY } from './chatPromoNotification.js';
import { readDismissedNotificationIds } from './widget/input/chatInputNotificationService.js';

export const CHAT_CLOSED_PROMO_TREATMENT = `config.${ChatConfiguration.ChatClosedPromoNotification}`;

/**
 * An eligible closed-Chat promo with the treatment chosen for it.
 * `treatment` is undefined while an experiment lookup is in flight.
 */
export interface IChatClosedPromoDecision {
	readonly model: ILanguageModelChatMetadataAndIdentifier;
	readonly promoId: string;
	readonly treatment: ChatClosedPromoNotification | undefined;
}

/**
 * Decides whether a closed-Chat promo should run and which treatment to use.
 * Owned by the promo contribution; not a workbench DI service.
 */
export class ChatClosedPromo extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _experimentTreatment: boolean | undefined;
	private _experimentPending = false;
	private _experimentGeneration = 0;

	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IStorageService private readonly storageService: IStorageService,
		@IViewsService private readonly viewsService: IViewsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._register(this.languageModelsService.onDidChangeLanguageModels(() => this._onDidChange.fire()));
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, DISMISSED_PROMOS_STORAGE_KEY, this._store)(() => this._onDidChange.fire()));
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, SEEN_PROMOS_STORAGE_KEY, this._store)(() => this._onDidChange.fire()));
		this._register(this.viewsService.onDidChangeViewVisibility(e => {
			if (e.id === ChatViewId) {
				this._onDidChange.fire();
			}
		}));
		this._register(this.chatWidgetService.onDidChangeFocusedSession(() => this._onDidChange.fire()));
		this._register(this.chatWidgetService.onDidChangeFocusedWidget(() => this._onDidChange.fire()));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.ChatClosedPromoNotification)) {
				this._onDidChange.fire();
			}
		}));
		this._register(this.assignmentService.onDidRefetchAssignments(() => {
			this._experimentGeneration++;
			this._experimentTreatment = undefined;
			this._experimentPending = false;
			this._onDidChange.fire();
		}));
	}

	/**
	 * Returns a decision when Local Chat is closed and an eligible sale exists.
	 * Treatment is resolved only after eligibility so ExP is not queried otherwise.
	 * `treatment` is undefined while TAS is still loading.
	 */
	getDecision(hasRenderAnchor: boolean): IChatClosedPromoDecision | undefined {
		const opportunity = this.getOpportunity();
		if (!opportunity) {
			return undefined;
		}
		return {
			model: opportunity.model,
			promoId: opportunity.promoId,
			treatment: this.resolveTreatment(hasRenderAnchor),
		};
	}

	private getOpportunity(): { model: ILanguageModelChatMetadataAndIdentifier; promoId: string } | undefined {
		if (this.isLocalChatVisible()) {
			return undefined;
		}

		const dismissed = readDismissedNotificationIds(this.storageService, DISMISSED_PROMOS_STORAGE_KEY);
		const seen = readDismissedNotificationIds(this.storageService, SEEN_PROMOS_STORAGE_KEY);
		for (const id of this.languageModelsService.getLanguageModelIds()) {
			const meta = this.languageModelsService.lookupLanguageModel(id);
			if (!meta || !ILanguageModelChatMetadata.hasPromoBanner(meta) || !ILanguageModelChatMetadata.hasPromoDiscount(meta)) {
				continue;
			}
			const promoId = meta.promo.id;
			if (dismissed.has(promoId) || seen.has(promoId)) {
				continue;
			}
			const model = { identifier: id, metadata: meta };
			if (!this.isGitHubCopilotPromo(model)) {
				continue;
			}
			return { model, promoId };
		}
		return undefined;
	}

	private resolveTreatment(hasRenderAnchor: boolean): ChatClosedPromoNotification | undefined {
		const config = this.configurationService.inspect<ChatClosedPromoNotification>(ChatConfiguration.ChatClosedPromoNotification);
		if (isConfigured(config) || config.policyValue !== undefined || config.memoryValue !== undefined) {
			return config.value ?? ChatClosedPromoNotification.None;
		}
		if (!hasRenderAnchor) {
			return ChatClosedPromoNotification.None;
		}
		if (this._experimentTreatment === undefined && !this._experimentPending) {
			void this.resolveExperimentTreatment();
			return undefined;
		}
		if (this._experimentPending && this._experimentTreatment === undefined) {
			return undefined;
		}
		return this._experimentTreatment ? ChatClosedPromoNotification.CopilotIconPopup : ChatClosedPromoNotification.None;
	}

	private async resolveExperimentTreatment(): Promise<void> {
		const generation = this._experimentGeneration;
		this._experimentPending = true;
		let enabled = false;
		try {
			enabled = await this.assignmentService.getTreatment<ChatClosedPromoNotification>(CHAT_CLOSED_PROMO_TREATMENT) === ChatClosedPromoNotification.CopilotIconPopup;
		} catch (error) {
			this.logService.warn('[ChatClosedPromo] Failed to resolve promo treatment', error);
		}
		if (this._store.isDisposed || generation !== this._experimentGeneration) {
			return;
		}
		this._experimentPending = false;
		this._experimentTreatment = enabled;
		this._onDidChange.fire();
	}

	private isLocalChatVisible(): boolean {
		if (!this.viewsService.isViewVisible(ChatViewId)) {
			return false;
		}
		const resource = this.chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource;
		return !resource || getChatSessionType(resource) === localChatSessionType;
	}

	private isGitHubCopilotPromo(model: ILanguageModelChatMetadataAndIdentifier): boolean {
		const harness = model.metadata.targetChatSessionType ?? localChatSessionType;
		if (harness !== localChatSessionType) {
			return false;
		}
		const vendor = model.metadata.vendor;
		return !vendor || vendor === COPILOT_VENDOR_ID;
	}
}
