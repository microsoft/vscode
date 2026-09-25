/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import { localize } from '../../../../../nls.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService, isConfigured } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { ITooltipWithCommands } from '../../../../services/statusbar/browser/statusbar.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { localChatSessionType } from '../../common/chatSessionsService.js';
import { ChatClosedPromoNotification, ChatConfiguration } from '../../common/constants.js';
import { COPILOT_VENDOR_ID, ILanguageModelChatMetadata, ILanguageModelsService } from '../../common/languageModels.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { ChatViewId, IChatWidgetService, isIChatViewViewContext } from '../chat.js';
import { DISMISSED_PROMOS_STORAGE_KEY, SEEN_PROMOS_STORAGE_KEY } from '../chatPromoNotification.js';
import { addDismissedNotificationId, readDismissedNotificationIds } from '../widget/input/chatInputNotificationService.js';
import { getModelProviderIcon } from '../widget/input/modelPicker/modelProviderIcons.js';
import type { ChatViewPane } from '../widgetHosts/viewPane/chatViewPane.js';

const TRY_MODEL_COMMAND_ID = '_chat.tryPromoModel';
const TREATMENT = `config.${ChatConfiguration.ChatClosedPromoNotification}`;

type PromoTelemetry = { promoId: string };
type PromoClassification = {
	promoId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the model promo shown on the Copilot status entry.' };
	owner: 'rfeltis';
	comment: 'Tracks model promo visibility.';
};
type PromoActionTelemetry = PromoTelemetry & { action: 'tryModel' };
type PromoActionClassification = PromoClassification & {
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The action taken on the model promo.' };
};

interface IPromo {
	readonly id: string;
	readonly modelIdentifier: string;
	readonly modelName: string;
	readonly message: string;
	readonly description: string | undefined;
	readonly icon: string;
}

/** Supplies a model-sale tooltip to the existing Copilot status entry. */
export class ChatStatusPromo extends Disposable {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	private readonly viewListener = this._register(new MutableDisposable());
	private treatment: boolean | undefined;
	private pending = false;
	private generation = 0;
	private promo: IPromo | undefined;
	private tooltip: ITooltipWithCommands | undefined;
	private readonly shownPromos = new Set<string>();

	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IStorageService private readonly storageService: IStorageService,
		@IViewsService private readonly viewsService: IViewsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
		this._register(this.languageModelsService.onDidChangeLanguageModels(() => this._onDidChange.fire()));
		for (const key of [DISMISSED_PROMOS_STORAGE_KEY, SEEN_PROMOS_STORAGE_KEY]) {
			this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, key, this._store)(() => this._onDidChange.fire()));
		}
		this._register(this.viewsService.onDidChangeViewVisibility(e => {
			if (e.id === ChatViewId) {
				this._onDidChange.fire();
			}
		}));
		this._register(Event.any(this.chatWidgetService.onDidAddWidget, this.chatWidgetService.onDidRemoveWidget)(() => this.trackChatView()));
		this.trackChatView();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.ChatClosedPromoNotification)) {
				this._onDidChange.fire();
			}
		}));
		this._register(this.assignmentService.onDidRefetchAssignments(() => {
			this.generation++;
			this.pending = false;
			this.treatment = undefined;
			this._onDidChange.fire();
		}));
		this._register(CommandsRegistry.registerCommand(TRY_MODEL_COMMAND_ID, async (_accessor, modelIdentifier: string, promoId: string) => {
			this.telemetryService.publicLog2<PromoActionTelemetry, PromoActionClassification>('chatPromoWidgetAction', { promoId, action: 'tryModel' });
			const view = await this.viewsService.openView<ChatViewPane>(ChatViewId, true);
			if (!view) {
				throw new Error(localize('chat.promo.openFailed', "Unable to open Chat to try this model."));
			}
			await view.whenSessionRestored();
			const resource = view.widget.viewModel?.sessionResource;
			if (!resource || getChatSessionType(resource) !== localChatSessionType) {
				await view.startNewLocalSession();
			}
			if (!view.widget.input.switchModelByIdentifier(modelIdentifier, true, true) && !await view.widget.input.requestModelByIdentifier(modelIdentifier)) {
				throw new Error(localize('chat.promo.modelUnavailable', "The promoted model is no longer available."));
			}
			addDismissedNotificationId(this.storageService, DISMISSED_PROMOS_STORAGE_KEY, promoId);
			view.focusInput();
		}));
	}

	getEntryProps(visible: boolean): { showPip: boolean; ariaLabel: string; tooltip: ITooltipWithCommands } | undefined {
		const promo = visible ? this.getOpportunity() : undefined;
		const treatment = promo ? this.resolveTreatment() : false;
		if (!promo || treatment === false) {
			this.promo = undefined;
			this.tooltip = undefined;
			return undefined;
		}
		if (treatment === undefined && !this.promo) {
			return undefined;
		}
		if (!this.tooltip || !equals(this.promo, promo)) {
			this.promo = promo;
			this.tooltip = {
				content: {
					element: () => {
						const icon = renderIcon({ id: promo.icon });
						icon.setAttribute('aria-hidden', 'true');
						const content = dom.$('div', undefined, dom.$('p', undefined, icon, ' ', dom.$('strong', undefined, promo.message)));
						if (promo.description) {
							dom.append(content, dom.$('p', undefined, promo.description));
						}
						return content;
					},
				},
				commands: [{ id: TRY_MODEL_COMMAND_ID, title: localize('chat.promo.tryModel', "Try {0}", promo.modelName), arguments: [promo.modelIdentifier, promo.id] }],
				onDidShow: () => {
					if (!this.shownPromos.has(promo.id)) {
						this.shownPromos.add(promo.id);
						addDismissedNotificationId(this.storageService, SEEN_PROMOS_STORAGE_KEY, promo.id);
						this.telemetryService.publicLog2<PromoTelemetry, PromoClassification>('chatPromoWidgetShown', { promoId: promo.id });
					}
				},
			};
		}
		return {
			showPip: !this.shownPromos.has(promo.id),
			ariaLabel: localize('chat.promo.pipAria', "{0}. Open the sale offer.", promo.message),
			tooltip: this.tooltip,
		};
	}

	private trackChatView(): void {
		const widget = this.chatWidgetService.getAllWidgets().find(widget => isIChatViewViewContext(widget.viewContext) && widget.viewContext.viewId === ChatViewId);
		this.viewListener.value = widget?.onDidChangeViewModel(() => this._onDidChange.fire());
		this._onDidChange.fire();
	}

	private getOpportunity(): IPromo | undefined {
		if (this.viewsService.isViewVisible(ChatViewId)) {
			const resource = this.viewsService.getViewWithId<ChatViewPane>(ChatViewId)?.widget?.viewModel?.sessionResource;
			if (!resource || getChatSessionType(resource) === localChatSessionType) {
				return undefined;
			}
		}
		const dismissed = readDismissedNotificationIds(this.storageService, DISMISSED_PROMOS_STORAGE_KEY);
		const seen = readDismissedNotificationIds(this.storageService, SEEN_PROMOS_STORAGE_KEY);
		for (const identifier of this.languageModelsService.getLanguageModelIds()) {
			const metadata = this.languageModelsService.lookupLanguageModel(identifier);
			if (!metadata || !ILanguageModelChatMetadata.hasPromoBanner(metadata) || !ILanguageModelChatMetadata.hasPromoDiscount(metadata)
				|| (metadata.targetChatSessionType ?? localChatSessionType) !== localChatSessionType
				|| (metadata.vendor && metadata.vendor !== COPILOT_VENDOR_ID) || dismissed.has(metadata.promo.id)
				|| (seen.has(metadata.promo.id) && !this.shownPromos.has(metadata.promo.id))) {
				continue;
			}
			return {
				id: metadata.promo.id,
				modelIdentifier: identifier,
				modelName: metadata.name,
				message: metadata.promo.message,
				description: ILanguageModelChatMetadata.getPromoEndsAtLabel(metadata.promo.endsAt),
				icon: getModelProviderIcon({ identifier, metadata }).id,
			};
		}
		return undefined;
	}

	private resolveTreatment(): boolean | undefined {
		const config = this.configurationService.inspect<ChatClosedPromoNotification>(ChatConfiguration.ChatClosedPromoNotification);
		if (isConfigured(config) || config.policyValue !== undefined || config.memoryValue !== undefined) {
			return config.value === ChatClosedPromoNotification.CopilotIconPopup;
		}
		if (this.treatment === undefined && !this.pending) {
			void this.resolveExperiment();
		}
		return this.treatment;
	}

	private async resolveExperiment(): Promise<void> {
		const generation = this.generation;
		this.pending = true;
		let enabled = false;
		try {
			enabled = await this.assignmentService.getTreatment<ChatClosedPromoNotification>(TREATMENT) === ChatClosedPromoNotification.CopilotIconPopup;
		} catch (error) {
			this.logService.warn('[ChatStatusPromo] Failed to resolve promo treatment', error);
		}
		if (this._store.isDisposed || generation !== this.generation) {
			return;
		}
		this.pending = false;
		this.treatment = enabled;
		this._onDidChange.fire();
	}
}
