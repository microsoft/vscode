/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, toAction } from '../../../../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { formatTokenCount } from '../../../../../../../base/common/numbers.js';
import { autorun, IObservable } from '../../../../../../../base/common/observable.js';
import { isDefined } from '../../../../../../../base/common/types.js';
import { localize } from '../../../../../../../nls.js';
import { ActionListItemKind, IActionListItem } from '../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetDropdownAction } from '../../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IAgentConnection, IAgentHostService } from '../../../../../../../platform/agentHost/common/agentService.js';
import { deriveLocalModelReadiness, ILocalModelConsent, ILocalModelErrorV1, ILocalModelFamilyV1, ILocalModelLoadV1, ILocalModelStatusV1, LOCAL_MODEL_SENTINEL_PROVIDER_NAME, LocalModelEnabledSettingId, LocalModelReadiness } from '../../../../../../../platform/agentHost/common/localModel.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { getLocalModelStopNowId, ILocalModelService } from '../../../../../../services/agentHost/common/localModelService.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { SessionType } from '../../../../common/chatSessionsService.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../common/languageModels.js';
import { runLocalModelErrorAction } from '../../../agentSessions/agentHost/localModelErrorActions.js';
import { formatLocalModelBytes, getLocalModelDrainingStreams, getLocalModelLoad, isLocalModelReload, LocalModelEntryPath, logLocalModelFlow } from '../../../agentSessions/agentHost/localModelSetupFlow.js';
import { getModelConfigProperty, getModelConfigValueLabel, IModelConfigProperty, IModelConfigurationAccess, MODEL_CONFIG_GROUP_EFFORT, ModelConfigChangeListener } from './modelPickerModelConfig.js';

/** Prefix of the ids of the "On This Device" rows that don't select a model; the rest is the family id. */
export const LOCAL_MODEL_PICKER_ITEM_PREFIX = 'localModel:';
/** Id of the row action that opens a family's detail page. */
export const LOCAL_MODEL_DETAILS_ACTION_ID = 'chat.modelPicker.localModelDetails';
const LOCAL_MODEL_ROW_CLASS = 'chat-model-picker-local-model';
/** CSS class of the rows of families that aren't downloaded, which can't be selected. */
const LOCAL_MODEL_UNAVAILABLE_ROW_CLASS = 'chat-model-picker-local-model-unavailable';
/** CSS class of the rows whose button is a call to action ({@link ILocalModelDownloadSlot.action}), by action. */
const LOCAL_MODEL_SLOT_ACTION_ROW_CLASS: Record<NonNullable<ILocalModelDownloadSlot['action']>, string> = {
	download: 'chat-model-picker-local-model-call chat-model-picker-local-model-download',
	setUp: 'chat-model-picker-local-model-call',
};
/** Progress-only changes refresh an open picker at most this often. */
const PROGRESS_REFRESH_INTERVAL_MS = 1000;

/** What a detail page of the "On This Device" tab asks the on-device model service to do. */
export type LocalModelPickerAction =
	| 'setUp'
	| 'cancel'
	| 'resume'
	| 'retry'
	| 'update'
	| 'remove'
	| 'makeActive'
	| 'start'
	| 'stop'
	| 'stopNow'
	| 'stopPrevious'
	| 'openSettings'
	| 'getLlamaCpp'
	| 'toggleAuto'
	| 'setContextSize';

/** One invocation of a detail page affordance. */
export interface ILocalModelPickerActionRequest {
	readonly action: LocalModelPickerAction;
	readonly familyId: string;
	/** The operation acted on, for operation actions. A `retry` without one restarts the active server. */
	readonly operationId?: string;
	/** The readiness the page showed when the user acted. */
	readonly readiness: LocalModelReadiness;
	/** The new value of the Use in Auto switch. */
	readonly value?: boolean;
	/** The chosen context size, for `setContextSize`: one of the family's context options. */
	readonly contextTokens?: number;
	/** What the user agreed to on the detail page, for `setUp`. */
	readonly consent?: ILocalModelConsent;
	/** The setup entry path the consent covered, for telemetry. */
	readonly entryPath?: LocalModelEntryPath;
}

/** Receives the affordances of the "On This Device" detail pages; the rows only select a model or open its page. */
export interface ILocalModelPickerActions {
	run(request: ILocalModelPickerActionRequest): void;
	/** Reports that a detail page showed the setup consent, or was left without agreeing to it. */
	logConsent?(step: 'consentShown' | 'consentCancelled', entryPath: LocalModelEntryPath): void;
}

/** The thinking level and context size an installed family runs with, shown on its Details button and the selected model's readout. */
export interface ILocalModelConfigSummary {
	/** The thinking level and context size joined by a middle dot, e.g. "Medium" and "128K", or just "128K" without a thinking level. */
	readonly label: string;
	/** E.g. "Effort Level: Medium, Context: 128K", for assistive technology. */
	readonly description: string;
}

/** How the direct-selection model of an installed family is described where it is listed on its own, e.g. in search results. */
export interface ILocalModelDirectModelPresentation {
	readonly familyId: string;
	/** Whether the family is the active (loaded) model; selecting another one makes that one active, unloading this one. */
	readonly active: boolean;
	/** A short state while the model isn't ready, e.g. "Not loaded". */
	readonly state: string | undefined;
	readonly summary: ILocalModelConfigSummary | undefined;
	readonly ariaDescription: string;
	/** The readout beside the selected model's name: its short state while not ready, otherwise its summary; its description says both. */
	readonly readout: ILocalModelConfigSummary;
}

/** What the "On This Device" rows need from the picker showing them: the direct models they can select and the detail pages they open. */
export interface ILocalModelPickerHost {
	readonly models: readonly ILanguageModelChatMetadataAndIdentifier[];
	readonly selectedModelId: string | undefined;
	/** The chat's model configuration, for the thinking level of a direct model. */
	readonly configurationAccess?: IModelConfigurationAccess;
	select(model: ILanguageModelChatMetadataAndIdentifier): void;
	showDetails(familyId: string): void;
}

/** A family's direct model with the chat's configuration of it, whose thinking level its detail page sets. */
export interface ILocalModelDirectModelConfig {
	readonly model: ILanguageModelChatMetadataAndIdentifier;
	readonly configurationAccess: IModelConfigurationAccess;
	/** Reports a saved change, e.g. so the picker can refresh its rows. */
	readonly onDidChangeConfiguration?: ModelConfigChangeListener;
}

/** What one family's detail page shows, and where its affordances go. */
export interface ILocalModelDetails {
	readonly status: ILocalModelStatusV1;
	readonly family: ILocalModelFamilyV1;
	readonly readiness: LocalModelReadiness;
	readonly actions: ILocalModelPickerActions;
	/** The family's direct model, when the picker lists it; the page offers its thinking level. */
	readonly directModel?: ILocalModelDirectModelConfig;
	/** Operations whose stop was sent and hasn't taken effect yet, shown as in progress. */
	readonly pendingStops?: ReadonlySet<string>;
}

/** The on-device model content of one picker showing, listed in the picker's "On This Device" tab. */
export interface IModelPickerLocalModels {
	/** One row per family, installed ones selecting their model from `host`. Never empty. */
	getItems(host?: ILocalModelPickerHost): IActionListItem<IActionWidgetDropdownAction>[];
	/** The presentation of `model` when it is the direct row of an installed family, with its thinking level from `configurationAccess`. */
	getDirectModel(model: ILanguageModelChatMetadataAndIdentifier, configurationAccess?: IModelConfigurationAccess): ILocalModelDirectModelPresentation | undefined;
	/** The detail page content of `familyId`, or `undefined` when the family isn't listed. */
	getDetails(familyId: string): ILocalModelDetails | undefined;
}

function percent(completed: number | undefined, total: number | undefined): number | undefined {
	if (completed === undefined || !total) {
		return undefined;
	}
	return Math.min(100, Math.max(0, Math.floor(completed / total * 100)));
}

/** The download percentage of an operation, while its bytes are known. */
export function getLocalModelOperationPercent(family: ILocalModelFamilyV1): number | undefined {
	return percent(family.operation?.completedBytes, family.operation?.totalBytes);
}

/** A short label for an error; the host's full message is on the detail page. */
export function getLocalModelErrorLabel(error: ILocalModelErrorV1): string {
	switch (error.code) {
		case 'runtimeBlocked': return localize('localModel.error.runtimeBlocked', "Blocked by policy");
		case 'runtimeNotFound': return localize('localModel.error.runtimeNotFound', "Needs llama.cpp");
		case 'runtimeTooOld': return localize('localModel.error.runtimeTooOld', "llama.cpp is too old");
		case 'runtimeUnsupportedModel': return localize('localModel.error.runtimeUnsupportedModel', "Needs a newer llama.cpp");
		case 'runtimeLibraryMissing': return localize('localModel.error.runtimeLibraryMissing', "Missing system library");
		case 'gpuRuntimeMissing': return localize('localModel.error.gpuRuntimeMissing', "GPU driver needed");
		case 'insufficientMemory': return localize('localModel.error.insufficientMemory', "Not enough GPU memory");
		case 'memoryBusy': return localize('localModel.error.memoryBusy', "GPU memory busy");
		case 'ownedElsewhere': return localize('localModel.error.ownedElsewhere', "Running in another window");
		case 'orphan': return localize('localModel.error.orphan', "Previous server still running");
		case 'crashed': return localize('localModel.error.crashed', "Stopped unexpectedly");
		case 'startFailed': return localize('localModel.error.startFailed', "Couldn't start");
		case 'integrity': return localize('localModel.error.integrity', "Download didn't verify");
		case 'identityChanged': return localize('localModel.error.identityChanged', "Model was updated");
		case 'diskFull': return localize('localModel.error.diskFull', "Not enough disk space");
		case 'network': return localize('localModel.error.network', "Download interrupted");
		case 'accessExpired': return localize('localModel.error.accessExpired', "Download link expired");
		case 'filesInUse': return localize('localModel.error.filesInUse', "Files in use");
		case 'modelNotActive': return localize('localModel.error.modelNotActive', "Not loaded");
		case 'notImplemented': return localize('localModel.error.notImplemented', "Not available yet");
		default: return localize('localModel.error.unknown', "Error");
	}
}

/** Why an operation paused, when it wasn't the user. */
export function getLocalModelPausedReasonLabel(family: ILocalModelFamilyV1): string | undefined {
	switch (family.operation?.pausedReason) {
		case 'diskFull': return localize('localModel.paused.diskFull', "Not enough disk space");
		case 'network': return localize('localModel.paused.network', "Connection lost");
		case 'quit': return localize('localModel.paused.quit', "Interrupted");
		case 'consentChanged': return localize('localModel.paused.consentChanged', "Needs your approval again");
		default: return undefined;
	}
}

/** "Paused", or "Paused at 42%" while the download's bytes are known. */
export function getLocalModelPausedLabel(family: ILocalModelFamilyV1): string {
	const value = getLocalModelOperationPercent(family);
	return value === undefined
		? localize('localModel.paused', "Paused")
		: localize('localModel.pausedAt', "Paused at {0}%", value);
}

/** The phase of a running operation, e.g. "Downloading 42%"; a drain with no responses left reads as loading. */
export function getLocalModelPreparingLabel(family: ILocalModelFamilyV1, status: ILocalModelStatusV1): string {
	const operation = family.operation;
	switch (operation?.phase) {
		case 'checkingDevice': return localize('localModel.phase.checkingDevice', "Checking this device\u2026");
		case 'downloading': {
			const value = getLocalModelOperationPercent(family);
			return value === undefined
				? localize('localModel.phase.downloadingUnknown', "Downloading\u2026")
				: localize('localModel.phase.downloading', "Downloading {0}%", value);
		}
		case 'verifying': return localize('localModel.phase.verifying', "Verifying\u2026");
		case 'draining': {
			const streams = getLocalModelDrainingStreams(status, family);
			if (streams !== undefined) {
				return streams === 1
					? localize('localModel.phase.drainingOne', "Waiting for 1 response\u2026")
					: localize('localModel.phase.draining', "Waiting for {0} responses\u2026", streams);
			}
			break;
		}
		case 'loading': return getLocalModelLoadStepLabel(getLocalModelLoad(status, family), isLocalModelReload(status, family));
	}
	if (operation?.kind === 'swap') {
		return getLocalModelLoadStepLabel(undefined, isLocalModelReload(status, family));
	}
	return operation?.kind === 'remove'
		? localize('localModel.phase.removing', "Removing\u2026")
		: localize('localModel.phase.preparing', "Preparing\u2026");
}

/** The error a family shows: its operation's, or its active server's. */
export interface ILocalModelFamilyError {
	readonly error: ILocalModelErrorV1;
	/** The failed operation; `undefined` for the active server, whose retry restarts it. */
	readonly operationId: string | undefined;
}

/** The family's error, if its readiness is `error`. */
export function getLocalModelFamilyError(family: ILocalModelFamilyV1, status: ILocalModelStatusV1): ILocalModelFamilyError | undefined {
	const operation = family.operation;
	if (operation?.state === 'error') {
		return { error: operation.error ?? { code: 'unknown', message: localize('localModel.error.generic', "{0} ran into a problem.", family.displayName), actions: ['retry'] }, operationId: operation.id };
	}
	const active = status.active?.familyId === family.familyId ? status.active : undefined;
	if (family.install && active?.server === 'error') {
		return { error: active.error ?? { code: 'unknown', message: localize('localModel.error.generic', "{0} ran into a problem.", family.displayName), actions: ['retry'] }, operationId: undefined };
	}
	return undefined;
}

/** Whether the family's detail page asks for download consent: it needs setting up, or its paused download changed since the user agreed. */
export function needsLocalModelSetUpConsent(family: ILocalModelFamilyV1, readiness: LocalModelReadiness): boolean {
	if (family.install) {
		return false;
	}
	const operation = family.operation;
	return readiness === 'requiresSetup' || (operation?.state === 'paused' && operation.pausedReason === 'consentChanged');
}

/** A short state of the family, for its detail page's badge and the selected model's readout. */
export function getLocalModelStateLabel(family: ILocalModelFamilyV1, readiness: LocalModelReadiness, status: ILocalModelStatusV1): string {
	switch (readiness) {
		case 'requiresSetup': return localize('localModel.state.requiresSetup', "Not set up");
		case 'preparing': return getLocalModelPreparingLabel(family, status);
		case 'paused': return localize('localModel.paused', "Paused");
		case 'error': return localize('localModel.state.error', "Error");
		case 'ready': return localize('localModel.ready', "Ready");
		case 'installed': {
			const active = status.active?.familyId === family.familyId ? status.active : undefined;
			return active?.server === 'starting'
				? getLocalModelLoadStepLabel(active.load)
				: active?.server === 'stopping'
					? localize('localModel.stopping', "Stopping\u2026")
					: !active && status.active?.swapTo === family.familyId
						? localize('localModel.loadingModel', "Loading model\u2026")
						: localize('localModel.notLoaded', "Not loaded");
		}
	}
}

/**
 * How the detail page stops a running operation: Cancel takes back a model change or stops a load, Stop Now ends
 * the responses an update's drain waits for, and Pause stops a setup or update (kept to resume).
 */
export interface ILocalModelRunningAction {
	readonly id: string;
	readonly label: string;
	readonly request: Pick<ILocalModelPickerActionRequest, 'action' | 'operationId'>;
	/** The stop was sent and hasn't taken effect yet: the action shows it and can't be chosen again. */
	readonly pending: boolean;
}

/** The action that stops `family`'s running operation; a stop among `pendingStops` reads as in progress, e.g. "Pausing...". */
export function getLocalModelRunningAction(family: ILocalModelFamilyV1, status: ILocalModelStatusV1, pendingStops?: ReadonlySet<string>): ILocalModelRunningAction | undefined {
	const operation = family.operation;
	if (operation?.state !== 'running' || operation.kind === 'remove') {
		return undefined;
	}
	const pending = !!pendingStops?.has(operation.id);
	if (operation.kind === 'swap') {
		return { id: 'localModel.cancel', label: pending ? localize('localModel.action.cancelling', "Cancelling\u2026") : localize('localModel.action.cancel', "Cancel"), request: { action: 'cancel', operationId: operation.id }, pending };
	}
	// A drain with no response running is the model being unloaded, part of loading the next one.
	if (operation.phase === 'draining' && getLocalModelDrainingStreams(status, family) !== undefined) {
		const stopNowPending = !!pendingStops?.has(getLocalModelStopNowId(operation.id));
		return status.active?.drain && status.active.familyId === family.familyId
			? { id: 'localModel.stopNow', label: stopNowPending ? localize('localModel.action.stopping', "Stopping\u2026") : localize('localModel.action.stopNow', "Stop Now"), request: { action: 'stopNow' }, pending: stopNowPending }
			: undefined;
	}
	return { id: 'localModel.pause', label: pending ? localize('localModel.action.pausing', "Pausing\u2026") : localize('localModel.action.pause', "Pause"), request: { action: 'cancel', operationId: operation.id }, pending };
}

/** The step of a loading model, e.g. "Loading model...", "Warming up...", "Reloading..." or "Retrying...". */
export function getLocalModelLoadStepLabel(load: ILocalModelLoadV1 | undefined, reload = false): string {
	if (load?.retry) {
		return localize('localModel.retrying', "Retrying\u2026");
	}
	if (load?.step === 'warmingUp') {
		return localize('localModel.warmingUp', "Warming up\u2026");
	}
	return reload
		? localize('localModel.reloading', "Reloading\u2026")
		: localize('localModel.loadingModel', "Loading model\u2026");
}

/** The short state the selected model's readout shows instead of its thinking level and context size, keeping the toolbar narrow; `undefined` once ready. */
function getLocalModelReadoutState(family: ILocalModelFamilyV1, readiness: LocalModelReadiness, status: ILocalModelStatusV1): string | undefined {
	const loading = localize('localModel.readout.loading', "Loading\u2026");
	switch (readiness) {
		case 'ready':
			return undefined;
		case 'requiresSetup':
			return getLocalModelStateLabel(family, readiness, status);
		case 'preparing': {
			const operation = family.operation;
			if (operation?.kind === 'swap' || operation?.phase === 'loading') {
				return isLocalModelReload(status, family) ? localize('localModel.reloading', "Reloading\u2026") : loading;
			}
			return getLocalModelPreparingLabel(family, status);
		}
		case 'paused':
			return localize('localModel.paused', "Paused");
		case 'error': {
			const failure = getLocalModelFamilyError(family, status);
			return failure ? getLocalModelErrorLabel(failure.error) : getLocalModelStateLabel(family, readiness, status);
		}
		case 'installed': {
			const active = status.active?.familyId === family.familyId ? status.active : undefined;
			if (active) {
				return active.server === 'starting'
					? loading
					: active.server === 'stopping'
						? localize('localModel.stopping', "Stopping\u2026")
						: localize('localModel.notLoaded', "Not loaded");
			}
			return status.active?.swapTo === family.familyId ? loading : localize('localModel.notLoaded', "Not loaded");
		}
	}
}

interface ILocalModelRowState {
	/** The family's short state while the model isn't ready, read with its row and shown in the readout. */
	readonly state: string | undefined;
	/** What else the row's tooltip and accessible description say, e.g. that an update is available. */
	readonly notes: readonly string[];
}

/** The short state (only while not ready) and notes of one family's row; a `selectable` row also says what using its model costs. */
function getFamilyRowState(family: ILocalModelFamilyV1, readiness: LocalModelReadiness, status: ILocalModelStatusV1, selectable: boolean): ILocalModelRowState {
	const active = status.active?.familyId === family.familyId ? status.active : undefined;
	const notes: string[] = [];
	let state: string | undefined;

	switch (readiness) {
		case 'requiresSetup': {
			if (family.entry?.modelFilesPresent) {
				state = localize('localModel.foundOnDevice', "Found on this device");
			} else if (family.offer) {
				state = localize('localModel.downloadSize', "{0} download", formatLocalModelBytes(family.offer.downloadBytes));
			}
			if (family.offer?.fit === 'near') {
				notes.push(localize('localModel.nearFit', "May run slower on this device"));
			}
			break;
		}
		case 'preparing': {
			state = getLocalModelPreparingLabel(family, status);
			break;
		}
		case 'paused': {
			state = getLocalModelPausedLabel(family);
			const reason = getLocalModelPausedReasonLabel(family);
			if (reason) {
				notes.push(reason);
			}
			break;
		}
		case 'error': {
			const failure = getLocalModelFamilyError(family, status);
			state = failure ? getLocalModelErrorLabel(failure.error) : getLocalModelStateLabel(family, readiness, status);
			break;
		}
		case 'installed': {
			if (!active) {
				state = status.active?.swapTo === family.familyId
					? localize('localModel.loadingModel', "Loading model\u2026")
					: localize('localModel.notLoaded', "Not loaded");
			} else {
				state = active.server === 'starting'
					? getLocalModelLoadStepLabel(active.load)
					: active.server === 'stopping'
						? localize('localModel.stopping', "Stopping\u2026")
						: localize('localModel.startsWhenNeeded', "Starts when needed");
			}
			break;
		}
		case 'ready': {
			if (active?.autoEligible === false) {
				notes.push(localize('localModel.tooSlowForAuto', "Too slow for Auto"));
			} else if (selectable) {
				notes.push(localize('localModel.noUsageLimit', "No usage limit"));
			}
			break;
		}
	}

	if (family.memoryWarning) {
		notes.push(localize('localModel.memoryWarning.short', "Needs more GPU memory than this device has"));
	}
	if (!family.autoCapable) {
		notes.push(localize('localModel.notAutoCapable', "Not available for Auto yet"));
	}
	const update = family.install?.update;
	if (update && readiness !== 'preparing') {
		notes.push(localize('localModel.updateAvailable', "Update available ({0})", formatLocalModelBytes(update.downloadBytes)));
	}
	return { state, notes };
}

/** Whether `family` is the active model and is loaded or loading: its row's Active badge. */
export function isLocalModelLoadedOrLoading(family: ILocalModelFamilyV1, status: Pick<ILocalModelStatusV1, 'active'>): boolean {
	const active = status.active;
	return active?.familyId === family.familyId && (active.server === 'ready' || active.server === 'starting');
}

/** A context size, e.g. "128K". llama.cpp sizes are binary (131,072 tokens read as 128K); decimal sizes read as they do for cloud models. */
export function formatLocalModelContextTokens(tokens: number): string {
	const mega = 1024 * 1024;
	if (tokens % 1000 !== 0) {
		if (tokens % mega === 0) {
			return `${tokens / mega}M`;
		}
		if (tokens % 1024 === 0) {
			return `${tokens / 1024}K`;
		}
	}
	return formatTokenCount(tokens);
}

/** The thinking level of an on-device direct model, when its chat template supports one: the same per-chat setting as a cloud model's. */
export function getLocalModelThinkingProperty(model: ILanguageModelChatMetadataAndIdentifier | undefined, configurationAccess: IModelConfigurationAccess | undefined): IModelConfigProperty | undefined {
	return model && configurationAccess ? getModelConfigProperty(model, configurationAccess, MODEL_CONFIG_GROUP_EFFORT) : undefined;
}

/** The name of an on-device model's thinking level setting. */
export function getLocalModelThinkingTitle(property: IModelConfigProperty): string {
	return property.schema.title ?? localize('localModel.thinking', "Effort Level");
}

function describeSetting(title: string, value: string): string {
	return localize('localModel.setting', "{0}: {1}", title, value);
}

/** The context size the active family's loaded model serves with while ready or starting; it can differ from the selected size. */
export function getLocalModelServingContextTokens(family: ILocalModelFamilyV1, status: Pick<ILocalModelStatusV1, 'active'>): number | undefined {
	const active = status.active?.familyId === family.familyId ? status.active : undefined;
	return active?.server === 'ready' || active?.server === 'starting' ? active.contextTokens : undefined;
}

/** The thinking level of the family's direct `model` and its context size (serving, else selected); `undefined` when neither is known. */
export function getLocalModelConfigSummary(family: ILocalModelFamilyV1, status: Pick<ILocalModelStatusV1, 'active'>, model: ILanguageModelChatMetadataAndIdentifier | undefined, configurationAccess: IModelConfigurationAccess | undefined): ILocalModelConfigSummary | undefined {
	if (!family.install) {
		return undefined;
	}
	const labels: string[] = [];
	const descriptions: string[] = [];
	const thinking = getLocalModelThinkingProperty(model, configurationAccess);
	if (thinking && thinking.value !== undefined && thinking.schema.enum?.includes(thinking.value)) {
		const label = getModelConfigValueLabel(thinking.schema, thinking.value);
		labels.push(label);
		descriptions.push(describeSetting(getLocalModelThinkingTitle(thinking), label));
	}
	const contextTokens = getLocalModelServingContextTokens(family, status) ?? family.context?.tokens;
	if (contextTokens !== undefined) {
		const label = formatLocalModelContextTokens(contextTokens);
		labels.push(label);
		descriptions.push(describeSetting(localize('localModel.context', "Context"), label));
	}
	return labels.length ? { label: labels.join(' \u00b7 '), description: descriptions.join(', ') } : undefined;
}

/** Whether `model` is the direct-selection row of the installed `family`. */
function isDirectModelOf(model: ILanguageModelChatMetadataAndIdentifier, family: ILocalModelFamilyV1): boolean {
	return model.metadata.targetChatSessionType === SessionType.AgentHostCopilot && matchesLocalModelRowId(family.install?.modelId, model.metadata.id);
}

/** The action on a family's row that opens its detail page, labelled with `summary` like a cloud model's. */
export function createLocalModelDetailsAction(displayName: string, run: () => void, summary?: string): IAction {
	return toAction({
		id: LOCAL_MODEL_DETAILS_ACTION_ID,
		label: summary ?? localize('localModel.action.details', "Details"),
		tooltip: summary
			? localize('localModel.action.detailsTooltipWithSummary', "{0} Details, {1}", displayName, summary)
			: localize('localModel.action.detailsTooltip', "{0} Details", displayName),
		run,
	});
}

/** What the row of a family that isn't downloaded shows in place of an installed model's thinking level and context size. */
export interface ILocalModelDownloadSlot {
	/** "Download", "Set Up", the download's progress, e.g. "42%", "Paused", or a short error. */
	readonly label: string;
	/** Its accessible name and tooltip, e.g. "Download Example Flash 1.0". */
	readonly tooltip: string;
	/** Set when the slot is a call to action (Download, or Set Up) rather than a state, so it reads as one. */
	readonly action?: 'download' | 'setUp';
}

/** The slot of a family's row while its model isn't downloaded (Download, Set Up, progress, Paused or an error); `undefined` once installed. */
export function getLocalModelDownloadSlot(family: ILocalModelFamilyV1, readiness: LocalModelReadiness, status: ILocalModelStatusV1): ILocalModelDownloadSlot | undefined {
	if (family.install) {
		return undefined;
	}
	const name = family.displayName;
	const details = (state: string) => localize('localModel.action.detailsTooltipWithSummary', "{0} Details, {1}", name, state);
	switch (readiness) {
		case 'preparing': {
			const value = family.operation?.phase === 'downloading' ? getLocalModelOperationPercent(family) : undefined;
			return {
				label: value === undefined ? getLocalModelPreparingLabel(family, status) : localize('localModel.slot.percent', "{0}%", value),
				tooltip: details(getLocalModelPreparingLabel(family, status)),
			};
		}
		case 'paused':
			return { label: localize('localModel.paused', "Paused"), tooltip: details(getLocalModelPausedLabel(family)) };
		case 'error': {
			const failure = getLocalModelFamilyError(family, status);
			const label = failure ? getLocalModelErrorLabel(failure.error) : getLocalModelStateLabel(family, readiness, status);
			return { label, tooltip: details(label) };
		}
		default:
			return family.entry?.modelFilesPresent
				? { label: localize('localModel.action.setUp', "Set Up"), tooltip: localize('localModel.action.setUpTooltip', "Set Up {0}", name), action: 'setUp' }
				: { label: localize('localModel.action.download', "Download"), tooltip: localize('localModel.action.downloadTooltip', "Download {0}", name), action: 'download' };
	}
}

/** Whether the family's row reads as not downloaded (its files aren't on this device yet) rather than not set up. */
function isLocalModelNotDownloaded(family: ILocalModelFamilyV1): boolean {
	const phase = family.operation?.phase;
	return !family.entry?.modelFilesPresent && phase !== 'verifying' && phase !== 'placing' && phase !== 'loading';
}

/**
 * Builds the single-line row of one family, like a cloud model's: check, name, Active badge and a Details button
 * labelled with its thinking level and context size. An installed family with a direct model in `host` selects it;
 * any other row opens its detail page. A family that isn't downloaded can't be selected but stays keyboard
 * reachable, showing its Download button or progress in place of the summary.
 */
function buildFamilyRow(family: ILocalModelFamilyV1, readiness: LocalModelReadiness, status: ILocalModelStatusV1, host: ILocalModelPickerHost | undefined): IActionListItem<IActionWidgetDropdownAction> {
	const model = family.install ? host?.models.find(candidate => isDirectModelOf(candidate, family)) : undefined;
	const row = getFamilyRowState(family, readiness, status, !!model);
	const summary = getLocalModelConfigSummary(family, status, model, host?.configurationAccess);
	const slot = getLocalModelDownloadSlot(family, readiness, status);
	const showDetails = () => host?.showDetails(family.familyId);

	const badge = isLocalModelLoadedOrLoading(family, status) ? localize('localModel.badge.active', "Active") : undefined;
	const unavailable = slot && (isLocalModelNotDownloaded(family) ? localize('localModel.notDownloaded', "Not downloaded") : localize('localModel.notSetUp', "Not set up"));
	const ariaDescription = [unavailable, row.state, summary?.description, ...row.notes].filter(isDefined).join(', ');
	const tooltip = [family.displayName, badge, unavailable, row.state, summary?.label, ...row.notes].filter(isDefined).join(' \u00b7 ');
	const checked = !!model && model.identifier === host?.selectedModelId;
	const item: IActionWidgetDropdownAction = model && host ? {
		id: model.identifier,
		enabled: true,
		checked,
		class: undefined,
		label: family.displayName,
		tooltip,
		run: () => host.select(model),
	} : {
		id: `${LOCAL_MODEL_PICKER_ITEM_PREFIX}${family.familyId}`,
		enabled: true,
		checked: false,
		class: undefined,
		label: family.displayName,
		tooltip,
		run: showDetails,
	};
	return {
		item,
		kind: ActionListItemKind.Action,
		label: family.displayName,
		badge,
		ariaDescription: ariaDescription || undefined,
		opensDialog: true,
		// Like a model row, only the selected model has an icon.
		group: { title: '', icon: checked ? Codicon.check : Codicon.blank },
		hideIcon: false,
		className: [
			LOCAL_MODEL_ROW_CLASS,
			...(checked ? ['chat-model-picker-current'] : []),
			...(badge ? ['chat-model-picker-badge-active'] : []),
			...(slot ? [LOCAL_MODEL_UNAVAILABLE_ROW_CLASS] : []),
			...(slot?.action ? [LOCAL_MODEL_SLOT_ACTION_ROW_CLASS[slot.action]] : []),
		].join(' '),
		toolbarActions: [slot
			? toAction({ id: LOCAL_MODEL_DETAILS_ACTION_ID, label: slot.label, tooltip: slot.tooltip, run: showDetails })
			: createLocalModelDetailsAction(family.displayName, showDetails, summary?.label)],
		toolbarLabels: true,
		toolbarDialogActionIds: [LOCAL_MODEL_DETAILS_ACTION_ID],
	};
}

/** Builds the rows of the "On This Device" tab, one per listed family; none when the status lists no family, so users who haven't opted in see no change. */
export function buildLocalModelPickerItems(status: ILocalModelStatusV1, host?: ILocalModelPickerHost): IActionListItem<IActionWidgetDropdownAction>[] {
	const rows: IActionListItem<IActionWidgetDropdownAction>[] = [];
	for (const family of status.families) {
		const readiness = deriveLocalModelReadiness(family, status);
		if (readiness) {
			rows.push(buildFamilyRow(family, readiness, status, host));
		}
	}
	return rows;
}

/** The picker content for `status`, or `undefined` when it has no row to show; detail page affordances go to `actions`. */
export function createLocalModelPickerPresentation(status: ILocalModelStatusV1, actions: ILocalModelPickerActions, pendingStops?: ReadonlySet<string>): IModelPickerLocalModels | undefined {
	if (!status.families.some(family => deriveLocalModelReadiness(family, status))) {
		return undefined;
	}
	return {
		getItems: host => buildLocalModelPickerItems(status, host),
		getDirectModel: (model, configurationAccess) => getLocalModelDirectModelPresentation(model, status, configurationAccess),
		getDetails: familyId => {
			const family = status.families.find(candidate => candidate.familyId === familyId);
			const readiness = family && deriveLocalModelReadiness(family, status);
			return family && readiness ? { status, family, readiness, actions, pendingStops } : undefined;
		},
	};
}

/** The installed family whose direct-selection row is `model`: the local Copilot host row whose id is the install's model id. */
export function findLocalModelFamilyForModel(model: ILanguageModelChatMetadataAndIdentifier, status: ILocalModelStatusV1 | undefined): ILocalModelFamilyV1 | undefined {
	return status?.families.find(family => isDirectModelOf(model, family));
}

const LOCAL_MODEL_ROW_ID_PREFIX = `${LOCAL_MODEL_SENTINEL_PROVIDER_NAME}/`;

/** Whether `model` is an on-device direct row, known from its id alone so it stays out of the cloud tabs even without status. */
export function isLocalModelDirectRow(model: ILanguageModelChatMetadataAndIdentifier): boolean {
	return model.metadata.targetChatSessionType === SessionType.AgentHostCopilot && model.metadata.id.startsWith(LOCAL_MODEL_ROW_ID_PREFIX);
}

/** An on-device model's name where it is selected or answered, e.g. "MAI Code 1.1 Flash · On-device", as the Copilot CLI and app show it. */
export function formatLocalModelOnDeviceName(name: string): string {
	return localize({ key: 'localModel.onDeviceName', comment: ['{0} is the name of a model that runs on this device'] }, "{0} \u00b7 On-device", name);
}

function withoutRowIdPrefix(id: string): string {
	return id.startsWith(LOCAL_MODEL_ROW_ID_PREFIX) ? id.slice(LOCAL_MODEL_ROW_ID_PREFIX.length) : id;
}

/** Whether `modelId` names the row whose id is `installModelId`; the runtime may report the bare alias, so the sentinel prefix is optional on either side. */
export function matchesLocalModelRowId(installModelId: string | undefined, modelId: string | undefined): boolean {
	return !!installModelId && !!modelId && (installModelId === modelId || withoutRowIdPrefix(installModelId) === withoutRowIdPrefix(modelId));
}

/**
 * The presentation of a direct-selection row listed on its own (e.g. a search result) and the readout of the
 * selected one: its short state while not ready, else its summary, never both, keeping the toolbar narrow.
 */
export function getLocalModelDirectModelPresentation(model: ILanguageModelChatMetadataAndIdentifier, status: ILocalModelStatusV1 | undefined, configurationAccess?: IModelConfigurationAccess): ILocalModelDirectModelPresentation | undefined {
	const family = findLocalModelFamilyForModel(model, status);
	if (!family || !status) {
		return undefined;
	}
	const readiness = deriveLocalModelReadiness(family, status) ?? 'installed';
	const state = getFamilyRowState(family, readiness, status, true).state;
	const summary = getLocalModelConfigSummary(family, status, model, configurationAccess);
	const description = [state, summary?.description].filter(isDefined).join(', ') || getLocalModelStateLabel(family, readiness, status);
	const readout = {
		label: getLocalModelReadoutState(family, readiness, status) ?? summary?.label ?? getLocalModelStateLabel(family, readiness, status),
		description,
	};
	return { familyId: family.familyId, active: status.active?.familyId === family.familyId, state, summary, ariaDescription: description, readout };
}

/** Everything rows and detail pages show except progress, so progress-only changes leave it unchanged. */
function getStateSignature(status: ILocalModelStatusV1 | undefined, pendingStops: ReadonlySet<string>): string {
	if (!status) {
		return '';
	}
	return JSON.stringify({
		...status,
		families: status.families.map(({ usage: _usage, operation, ...family }) => ({
			...family,
			operation: operation && { ...operation, completedBytes: undefined, bytesPerSecond: undefined },
		})),
		active: status.active && { ...status.active, drain: undefined },
		pendingStops: [...pendingStops].sort(),
	});
}

/** An action invoked from a detail page of the picker, or the load a selection started, reported as `localModel.pickerAction`. */
export interface ILocalModelPickerActionEvent {
	readonly action: LocalModelPickerAction;
	readonly fromReadiness: LocalModelReadiness | 'none';
	readonly installedFamilies: number;
	/** Selecting the model's row started it ({@link ModelPickerLocalModels.loadOnSelect}), rather than its detail page. */
	readonly fromSelection?: boolean;
}

/**
 * Binds the "On This Device" rows and detail pages of one model picker to its chat's Agent Host connection, and
 * signals refreshes: on state transitions at once, on progress at most once a second.
 */
export class ModelPickerLocalModels extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	/** Fires when the content of {@link getPresentation} changed. */
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private readonly _connection: IAgentConnection;
	private readonly _status: IObservable<ILocalModelStatusV1 | undefined>;
	private readonly _pendingStops: IObservable<ReadonlySet<string>>;
	private readonly _progressRefresh = this._register(new RunOnceScheduler(() => this._onDidChange.fire(), PROGRESS_REFRESH_INTERVAL_MS));

	/** @param connection The chat's Agent Host connection; the local Agent Host when omitted. */
	constructor(
		connection: IAgentConnection | undefined,
		private readonly _logAction: (event: ILocalModelPickerActionEvent) => void,
		@ILocalModelService private readonly _localModelService: ILocalModelService,
		@IAgentHostService agentHostService: IAgentHostService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ICommandService private readonly _commandService: ICommandService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
		this._connection = connection ?? agentHostService;
		this._status = this._localModelService.getStatus(this._connection);
		this._pendingStops = this._localModelService.getPendingStops(this._connection);

		let signature: string | undefined;
		let lastStatus: ILocalModelStatusV1 | undefined;
		this._register(autorun(reader => {
			const status = this._status.read(reader);
			// A stop that was just sent shows at once, as one that took effect does.
			const next = getStateSignature(status, this._pendingStops.read(reader));
			if (signature === undefined) {
				signature = next;
				lastStatus = status;
				return;
			}
			if (next !== signature) {
				signature = next;
				lastStatus = status;
				this._progressRefresh.cancel();
				this._onDidChange.fire();
			} else if (status !== lastStatus) {
				lastStatus = status;
				if (!this._progressRefresh.isScheduled()) {
					this._progressRefresh.schedule();
				}
			}
		}));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(LocalModelEnabledSettingId)) {
				this._onDidChange.fire();
			}
		}));
		const enabledKey = new Set([ChatContextKeys.enabled.key]);
		this._register(this._contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(enabledKey)) {
				this._onDidChange.fire();
			}
		}));
	}

	/** The status to show, or `undefined` when the rows are hidden. */
	private _getVisibleStatus(): ILocalModelStatusV1 | undefined {
		if (this._configurationService.getValue<boolean>(LocalModelEnabledSettingId) !== true || !this._contextKeyService.contextMatchesRules(ChatContextKeys.enabled)) {
			return undefined;
		}
		const status = this._status.get();
		return status && status.families.length > 0 ? status : undefined;
	}

	/** The picker content for the current status, or `undefined` when nothing is shown. */
	getPresentation(): IModelPickerLocalModels | undefined {
		const status = this._getVisibleStatus();
		return status && createLocalModelPickerPresentation(status, {
			run: request => this._run(request),
			logConsent: (step, entryPath) => logLocalModelFlow(this._telemetryService, { step, entryPath }),
		}, this._pendingStops.get());
	}

	/**
	 * Loads the model of the direct row `model` as selecting it does, without asking: an inactive installed family
	 * becomes active and an unloaded active one starts. Returns whether a load was requested.
	 */
	loadOnSelect(model: ILanguageModelChatMetadataAndIdentifier): boolean {
		const status = this._getVisibleStatus();
		const family = findLocalModelFamilyForModel(model, status);
		if (!status || !family?.install) {
			return false;
		}
		const readiness = deriveLocalModelReadiness(family, status) ?? 'installed';
		const active = status.active;
		let action: 'makeActive' | 'start' | undefined;
		if (active?.familyId !== family.familyId) {
			action = active?.swapTo === family.familyId ? undefined : 'makeActive';
		} else if (active.server === 'stopped' || active.server === 'error') {
			action = 'start';
		}
		const sent = action === 'makeActive'
			? this._localModelService.makeActive(this._connection, family.familyId)
			: action === 'start' && this._localModelService.start(this._connection);
		if (action && sent) {
			this._log(action, readiness, status, true);
		}
		return sent;
	}

	private _log(action: ILocalModelPickerActionEvent['action'], readiness: LocalModelReadiness | undefined, status: ILocalModelStatusV1 | undefined, fromSelection?: boolean): void {
		this._logAction({
			action,
			fromReadiness: readiness ?? 'none',
			installedFamilies: status?.families.filter(family => !!family.install).length ?? 0,
			...(fromSelection ? { fromSelection } : {}),
		});
	}

	private _run(request: ILocalModelPickerActionRequest): void {
		const connection = this._connection;
		const service = this._localModelService;
		const status = this._status.get();
		const { consent, operationId } = request;
		switch (request.action) {
			case 'setUp': {
				if (consent && service.setUp(connection, request.familyId, consent) && request.entryPath) {
					logLocalModelFlow(this._telemetryService, { step: 'consentAccepted', entryPath: request.entryPath });
				}
				break;
			}
			case 'cancel': if (operationId) { service.cancel(connection, operationId); } break;
			case 'resume': if (operationId) { service.resume(connection, operationId); } break;
			case 'update': service.update(connection, request.familyId); break;
			case 'remove': void service.remove(connection, request.familyId); break;
			case 'makeActive': service.makeActive(connection, request.familyId); break;
			case 'start': service.start(connection); break;
			case 'stop': service.stop(connection); break;
			case 'stopNow': void service.stopNow(connection); break;
			// An error's fixes run the same wherever the error shows.
			case 'retry':
			case 'stopPrevious':
			case 'openSettings':
			case 'getLlamaCpp':
				void runLocalModelErrorAction(request.action, operationId, { connection, localModelService: service, commandService: this._commandService, openerService: this._openerService });
				break;
			case 'toggleAuto': void service.setUseInAuto(request.value === true); break;
			case 'setContextSize': if (request.contextTokens !== undefined) { service.setContextSize(connection, request.familyId, request.contextTokens); } break;
		}
		this._log(request.action, request.readiness, status);
	}
}
