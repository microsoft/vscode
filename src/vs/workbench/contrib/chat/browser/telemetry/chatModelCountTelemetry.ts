/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { IChatWidgetService } from '../chat.js';

type ChatModelCountEvent = {
	totalModels: number;
	modelsOpenInWidgets: number;
	backgroundModels: number;
	backgroundModels_modifiedEditsKeepAlive: number;
	backgroundModels_requestInProgressKeepAlive: number;
	backgroundModels_otherHolders: number;
};

type ChatModelCountClassification = {
	totalModels: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of live chat models.' };
	modelsOpenInWidgets: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chat models that are open in a chat widget or editor.' };
	backgroundModels: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chat models with no open widget.' };
	backgroundModels_modifiedEditsKeepAlive: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of background models held alive by the ChatModel#modifiedEditsKeepAlive reference (has pending edits).' };
	backgroundModels_requestInProgressKeepAlive: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of background models held alive by the ChatModel#requestInProgressKeepAlive reference (request is running).' };
	backgroundModels_otherHolders: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of background models with unrecognized holders (potential leaks).' };
};

type ChatModelsAtStartupClassification = ChatModelCountClassification & {
	owner: 'roblourens';
	comment: 'Tracks chat model counts at startup.';
};

type ChatModelCreatedEvent = ChatModelCountEvent & {
	newModelLocation: string;
};

type ChatModelCreatedClassification = ChatModelCountClassification & {
	newModelLocation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ChatAgentLocation of the newly created chat model.' };
	owner: 'roblourens';
	comment: 'Tracks chat model counts each time a new chat model is created, to detect accumulation of background sessions over the lifetime of a window.';
};

/**
 * Logs telemetry about how many chat models are live at two moments:
 * 1. At startup, after sessions with pending edits have been revived.
 * 2. Each time a new chat model is created (skipping the very first one).
 *
 * Both events share the same model-count snapshot logic to track background
 * session accumulation.
 */
export class ChatModelCountTelemetry extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatModelCountTelemetry';

	constructor(
		@IChatService private readonly chatService: IChatService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
		this.logStartupTelemetry();
		this._register(this.chatService.onDidCreateModel(model => this.onDidCreateModel(model.initialLocation)));
	}

	private logStartupTelemetry(): void {
		this.telemetryService.publicLog2<ChatModelCountEvent, ChatModelsAtStartupClassification>('chat.modelsAtStartup', this.getSnapshot());
	}

	private onDidCreateModel(newModelLocation: ChatAgentLocation): void {
		const snapshot = this.getSnapshot();

		// Skip the trivial case of the very first chat model in the window
		if (snapshot.totalModels <= 1) {
			return;
		}

		this.telemetryService.publicLog2<ChatModelCreatedEvent, ChatModelCreatedClassification>('chat.modelCreatedStats', {
			...snapshot,
			newModelLocation,
		});
	}

	private getSnapshot(): ChatModelCountEvent {
		const snapshot = this.chatService.getChatModelReferenceDebugInfo();

		let modelsOpenInWidgets = 0;
		let backgroundModels = 0;
		let backgroundModels_modifiedEditsKeepAlive = 0;
		let backgroundModels_requestInProgressKeepAlive = 0;
		let backgroundModels_otherHolders = 0;

		for (const model of snapshot.models) {
			if (this.chatWidgetService.getWidgetBySessionResource(model.sessionResource)) {
				modelsOpenInWidgets++;
			} else {
				backgroundModels++;
				let hasOther = false;
				for (const { holder } of model.holders) {
					if (holder === 'ChatModel#modifiedEditsKeepAlive') {
						backgroundModels_modifiedEditsKeepAlive++;
					} else if (holder === 'ChatModel#requestInProgressKeepAlive') {
						backgroundModels_requestInProgressKeepAlive++;
					} else {
						hasOther = true;
					}
				}
				if (hasOther) {
					backgroundModels_otherHolders++;
				}
			}
		}

		return {
			totalModels: snapshot.totalModels,
			modelsOpenInWidgets,
			backgroundModels,
			backgroundModels_modifiedEditsKeepAlive,
			backgroundModels_requestInProgressKeepAlive,
			backgroundModels_otherHolders,
		};
	}
}

registerWorkbenchContribution2(ChatModelCountTelemetry.ID, ChatModelCountTelemetry, WorkbenchPhase.AfterRestored);
