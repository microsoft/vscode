/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../../../../base/common/uuid.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { TelemetryTrustedValue } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { getTelemetryModelIdentifier, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService, isUserProvidedModel } from '../../../../common/languageModels.js';
import { MODEL_CONFIG_GROUP_CONTEXT, MODEL_CONFIG_GROUP_EFFORT } from './modelPickerModelConfig.js';

/** How the user opened a model picker surface. */
export type ModelPickerEntryPoint =
	/** The model name pill in the chat input. */
	| 'modelName'
	/** The configuration readout next to the model name. */
	| 'configuration'
	/** The configure button in a model's hover in the flat picker. */
	| 'hoverConfigure'
	/** A command, keybinding, or host surface that opens the picker programmatically. */
	| 'command';

/** The input the user opened a picker with; `unknown` when opened by a command or host. */
export type ModelPickerOpenInputMethod = 'keyboard' | 'mouse' | 'unknown';

/** How a picker surface was opened. */
export interface IModelPickerOpenTrigger {
	readonly entryPoint: ModelPickerEntryPoint;
	readonly inputMethod: ModelPickerOpenInputMethod;
}

type ChatModelPickerOpenedClassification = {
	owner: 'lramos15';
	comment: 'Reporting when a model picker surface is opened, to measure picker interactions from open to close';
	pickerSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'A random id for this picker open, used to correlate the open, change, and close events of one interaction' };
	entryPoint: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the picker was opened: modelName, configuration, hoverConfigure, or command' };
	inputMethod: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The input the picker was opened with: keyboard, mouse, or unknown when opened by a command' };
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The model selected when the picker opened; "unknown" for models the user brought' };
	chatSessionId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The id of the current chat session, used to correlate the picker interaction with the session.' };
};

type ChatModelPickerOpenedEvent = {
	pickerSessionId: string;
	entryPoint: ModelPickerEntryPoint;
	inputMethod: ModelPickerOpenInputMethod;
	model: string | TelemetryTrustedValue<string>;
	chatSessionId?: string;
};

type ChatModelPickerClosedClassification = {
	owner: 'lramos15';
	comment: 'Reporting when a model picker surface is closed, to measure how long picker interactions take. Changes made while it was open are reported by their own events with the same pickerSessionId.';
	pickerSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The id of the picker open this close belongs to' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Time in milliseconds from opening to closing the picker' };
	searched: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the user searched or filtered the model list, including when they closed the picker without switching. The search text is not collected.' };
};

type ChatModelPickerClosedEvent = {
	pickerSessionId: string;
	durationMs: number;
	searched: boolean;
};

type ChatModelChangeClassification = {
	owner: 'lramos15';
	comment: 'Reporting when the model picker is switched';
	fromModel?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous chat model' };
	toModel: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The new chat model' };
	chatSessionId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The id of the current chat session, used to correlate the model switch with the session.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Time in milliseconds from opening the picker to this model change' };
	searched: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the user searched or filtered the model list in this picker before this change. The search text is not collected.' };
	otherModelsExpanded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the user expanded the Other Models section in this picker before this change' };
	pickerSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The id of the picker open this change was made in' };
};

type ChatModelChangeEvent = {
	fromModel: string | TelemetryTrustedValue<string> | undefined;
	toModel: string | TelemetryTrustedValue<string>;
	chatSessionId?: string;
	durationMs: number;
	searched: boolean;
	otherModelsExpanded: boolean;
	pickerSessionId: string;
};

type ChatThinkingEffortChangeClassification = {
	owner: 'lramos15';
	comment: 'Reporting when a model configuration value (e.g. thinking effort, or the Auto routing tier) is changed';
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The model the configuration was changed for' };
	property: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The first-party configuration property that was changed (reasoningEffort, or tier for the Auto model); "unknown" for third-party providers, which choose their own keys' };
	fromValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous value of the configuration property' };
	toValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The new value of the configuration property' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Time in milliseconds from opening the picker to when the user requested this configuration change' };
	pickerSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The id of the picker open this change was made in' };
};

type ChatThinkingEffortChangeEvent = {
	model: string | TelemetryTrustedValue<string>;
	property: string;
	fromValue: string;
	toValue: string;
	durationMs: number;
	pickerSessionId: string;
};

type ChatContextSizeChangeClassification = {
	owner: 'lramos15';
	comment: 'Reporting when the context window size is changed';
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The model the context size was changed for' };
	fromValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous context size value' };
	toValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The new context size value' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Time in milliseconds from opening the picker to when the user requested this configuration change' };
	pickerSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The id of the picker open this change was made in' };
};

type ChatContextSizeChangeEvent = {
	model: string | TelemetryTrustedValue<string>;
	fromValue: string;
	toValue: string;
	durationMs: number;
	pickerSessionId: string;
};

/**
 * Reports one open of a model picker surface: an open event, each model and
 * configuration change made while it is open, and a close event. Every event
 * carries the same `pickerSessionId` so an interaction can be followed end to end,
 * and each change reports how long after opening it was made.
 */
export class ModelPickerTelemetrySession {

	readonly id = generateUuid();
	private readonly _openedAt: number;
	private _searched = false;
	private _otherModelsExpanded = false;
	private _closed = false;

	constructor(
		private readonly _telemetryService: ITelemetryService,
		private readonly _languageModelsService: ILanguageModelsService,
		trigger: IModelPickerOpenTrigger,
		model: ILanguageModelChatMetadataAndIdentifier | undefined,
		chatSessionId: string | undefined,
		private readonly _now: () => number = () => Date.now(),
	) {
		this._openedAt = this._now();
		this._telemetryService.publicLog2<ChatModelPickerOpenedEvent, ChatModelPickerOpenedClassification>('chat.modelPickerOpened', {
			pickerSessionId: this.id,
			entryPoint: trigger.entryPoint,
			inputMethod: trigger.inputMethod,
			model: getTelemetryModelIdentifier(model, this._languageModelsService),
			chatSessionId,
		});
	}

	/** Records that the user searched or filtered the model list. */
	logSearch(): void {
		this._searched = true;
	}

	/** Records that the user expanded the Other Models section. */
	logOtherModelsExpanded(): void {
		this._otherModelsExpanded = true;
	}

	private _elapsed(at = this._now()): number {
		return Math.max(0, Math.round(at - this._openedAt));
	}

	logModelChange(
		fromModel: ILanguageModelChatMetadataAndIdentifier | undefined,
		toModel: ILanguageModelChatMetadataAndIdentifier,
		chatSessionId: string | undefined,
	): void {
		this._telemetryService.publicLog2<ChatModelChangeEvent, ChatModelChangeClassification>('chat.modelChange', {
			fromModel: getTelemetryModelIdentifier(fromModel, this._languageModelsService),
			toModel: getTelemetryModelIdentifier(toModel, this._languageModelsService),
			chatSessionId,
			durationMs: this._elapsed(),
			searched: this._searched,
			otherModelsExpanded: this._otherModelsExpanded,
			pickerSessionId: this.id,
		});
	}

	/**
	 * Reports a model configuration change. Shared by both model pickers so the same
	 * change reports identically wherever the user makes it.
	 */
	logConfigurationChange(
		model: ILanguageModelChatMetadataAndIdentifier,
		group: string,
		key: string,
		fromValue: unknown,
		toValue: unknown,
		requestedAt: number,
	): void {
		const isFirstParty = !isUserProvidedModel(model, this._languageModelsService);
		if (group === MODEL_CONFIG_GROUP_CONTEXT) {
			this._telemetryService.publicLog2<ChatContextSizeChangeEvent, ChatContextSizeChangeClassification>('chat.contextSizeChange', {
				model: getTelemetryModelIdentifier(model, this._languageModelsService),
				fromValue: String(fromValue ?? ''),
				toValue: String(toValue),
				durationMs: this._elapsed(requestedAt),
				pickerSessionId: this.id,
			});
			return;
		}
		if (group === MODEL_CONFIG_GROUP_EFFORT) {
			this._telemetryService.publicLog2<ChatThinkingEffortChangeEvent, ChatThinkingEffortChangeClassification>('chat.thinkingEffortChange', {
				model: getTelemetryModelIdentifier(model, this._languageModelsService),
				// Models the user brought choose their own property keys.
				property: isFirstParty ? key : 'unknown',
				fromValue: String(fromValue ?? ''),
				toValue: String(toValue),
				durationMs: this._elapsed(requestedAt),
				pickerSessionId: this.id,
			});
		}
	}

	/**
	 * Reports the close once; later calls are ignored. The duration is measured
	 * now, but when configuration saves are still pending the event waits for
	 * them, so changes made in this picker are always reported before its close.
	 */
	close(pendingChanges?: Promise<unknown>): void {
		if (this._closed) {
			return;
		}
		this._closed = true;
		const durationMs = this._elapsed();
		const report = () => this._telemetryService.publicLog2<ChatModelPickerClosedEvent, ChatModelPickerClosedClassification>('chat.modelPickerClosed', {
			pickerSessionId: this.id,
			durationMs,
			searched: this._searched,
		});
		if (pendingChanges) {
			pendingChanges.then(report, report);
		} else {
			report();
		}
	}
}
