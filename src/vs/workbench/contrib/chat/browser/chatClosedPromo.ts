/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService, isConfigured } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { localChatSessionType } from '../common/chatSessionsService.js';
import { ChatClosedPromoNotification, ChatConfiguration } from '../common/constants.js';
import { COPILOT_VENDOR_ID, ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../common/languageModels.js';
import { getChatSessionType } from '../common/model/chatUri.js';
import { ChatViewId, IChatWidgetService } from './chat.js';
import { DISMISSED_PROMOS_STORAGE_KEY, SEEN_PROMOS_STORAGE_KEY } from './chatPromoNotification.js';
import { ChatPromoIconPopup, findChatIconAnchor } from './chatPromoWidget.js';
import { readDismissedNotificationIds } from './widget/input/chatInputNotificationService.js';

export const CHAT_CLOSED_PROMO_TREATMENT = `config.${ChatConfiguration.ChatClosedPromoNotification}`;

/**
 * Background controller for closed-Chat model promos. Listens for sale/eligibility
 * changes, chooses a treatment, and drives presentation (today: status-bar icon popup).
 */
export class ChatClosedPromoContribution extends Disposable implements IWorkbenchContribution {

	/** Stable id kept from the former widget contribution registration. */
	static readonly ID = 'workbench.contrib.chatPromoWidget';

	private _experimentTreatment: boolean | undefined;
	private _experimentPending = false;
	private _experimentGeneration = 0;

	private readonly popup: ChatPromoIconPopup;
	private activePromoId: string | undefined;

	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IStorageService private readonly storageService: IStorageService,
		@IViewsService private readonly viewsService: IViewsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@ILogService private readonly logService: ILogService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.popup = this._register(instantiationService.createInstance(ChatPromoIconPopup));

		this._register(this.languageModelsService.onDidChangeLanguageModels(() => this.sync()));
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, DISMISSED_PROMOS_STORAGE_KEY, this._store)(() => this.sync()));
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, SEEN_PROMOS_STORAGE_KEY, this._store)(() => this.sync()));
		this._register(this.viewsService.onDidChangeViewVisibility(e => {
			if (e.id === ChatViewId) {
				this.sync();
			}
		}));
		this._register(this.chatWidgetService.onDidChangeFocusedSession(() => this.sync()));
		this._register(this.chatWidgetService.onDidChangeFocusedWidget(() => this.sync()));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.ChatClosedPromoNotification)) {
				this.sync();
			}
		}));
		this._register(this.assignmentService.onDidRefetchAssignments(() => {
			this._experimentGeneration++;
			this._experimentTreatment = undefined;
			this._experimentPending = false;
			this.sync();
		}));
		this._register(this.layoutService.onDidLayoutMainContainer(() => this.sync()));

		this.sync();
	}

	/**
	 * Recompute opportunity + treatment and update presentation.
	 */
	private sync(): void {
		const opportunity = this.getOpportunity();
		if (!opportunity) {
			this.hidePresentation();
			return;
		}

		const anchor = findChatIconAnchor(this.layoutService.mainContainer);
		const treatment = this.resolveTreatment(!!anchor?.getClientRects().length);

		// Branch as additional closed-Chat treatments are added.
		if (treatment === ChatClosedPromoNotification.CopilotIconPopup) {
			if (this.activePromoId !== opportunity.promoId) {
				this.activePromoId = opportunity.promoId;
				this.popup.show(opportunity.model);
			}
			return;
		}

		// undefined = experiment still loading; keep current presentation stable.
		if (treatment === undefined) {
			return;
		}

		this.hidePresentation();
	}

	private hidePresentation(): void {
		if (this.activePromoId !== undefined) {
			this.activePromoId = undefined;
			this.popup.hide();
		}
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
		this.sync();
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
