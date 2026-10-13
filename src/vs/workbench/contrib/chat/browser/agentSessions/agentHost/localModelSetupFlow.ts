/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TimeoutTimer } from '../../../../../../base/common/async.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { computeLocalModelConsentScope, LocalModelEnabledSettingId, LocalModelLlamaServerPathSettingId, type ILocalModelConsent, type ILocalModelFamilyV1, type ILocalModelLoadV1, type ILocalModelOfferV1, type ILocalModelStatusV1 } from '../../../../../../platform/agentHost/common/localModel.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { Severity } from '../../../../../../platform/notification/common/notification.js';
import { observableConfigValue, observableContextKey } from '../../../../../../platform/observable/common/platformObservableUtils.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { ILocalModelInteractionHandler } from '../../../../../services/agentHost/common/localModelService.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';

/** Error code of an approved `llama-server` that changed on disk since approval and was not run. */
export const LOCAL_MODEL_RUNTIME_CHANGED_CODE = 'runtimeChanged';

/** Error code of an installed model whose detected `llama-server` was never approved, so it was not run. */
export const LOCAL_MODEL_RUNTIME_APPROVAL_REQUIRED_CODE = 'runtimeApprovalRequired';

/**
 * Opens the model picker of the most relevant chat input on the On This Device
 * tab, showing the detail page of the on-device model family given as the only
 * argument. The download consent and llama.cpp approval happen on that page.
 */
export const LOCAL_MODEL_SHOW_DETAILS_COMMAND_ID = 'workbench.action.chat.localModel.showDetails';

/** Whether the status reports that the approved `llama-server` changed since approval, for `family` or the active model. */
export function isLocalModelRuntimeChanged(status: ILocalModelStatusV1, family?: Pick<ILocalModelFamilyV1, 'familyId'>): boolean {
	return status.active?.error?.code === LOCAL_MODEL_RUNTIME_CHANGED_CODE
		|| status.families.some(candidate => (!family || candidate.familyId === family.familyId) && candidate.operation?.error?.code === LOCAL_MODEL_RUNTIME_CHANGED_CODE);
}

// #region Gate

/**
 * Whether any on-device model UI may show: the opt-in setting is on and AI
 * features are enabled (`ChatContextKeys.enabled`). Each surface adds its own
 * conditions (the chat's session type, status published by the connection).
 */
export function observeLocalModelUiEnabled(configurationService: IConfigurationService, contextKeyService: IContextKeyService): IObservable<boolean> {
	const setting = observableConfigValue<boolean>(LocalModelEnabledSettingId, false, configurationService);
	const chatEnabled = observableContextKey<boolean>(ChatContextKeys.enabled.key, contextKeyService);
	return derived(reader => setting.read(reader) === true && chatEnabled.read(reader) === true);
}

/** Opens the Settings editor at `chat.copilot.localModel.llamaServerPath`. */
export function openLocalModelServerPathSetting(commandService: ICommandService): Promise<unknown> {
	return commandService.executeCommand('workbench.action.openSettings', `@id:${LocalModelLlamaServerPathSettingId}`);
}

// #endregion

// #region Telemetry

export type LocalModelFlowStep = 'consentShown' | 'consentAccepted' | 'consentCancelled' | 'readyOfferShown' | 'readyOfferAction';
/** What setup acquires: the model is downloaded (`modelOnly`), or its files on this device are used (`none`). */
export type LocalModelEntryPath = 'modelOnly' | 'none';
export type LocalModelReadyOfferAction = 'useWithAuto' | 'newAutoChat' | 'switchDirect' | 'useAuto' | 'notNow';
export type LocalModelCurrentModelKind = 'auto' | 'server' | 'other';

/** The `localModel.flow` event. Fields that don't apply to a step are omitted. */
export interface ILocalModelFlowEvent {
	readonly step: LocalModelFlowStep;
	readonly entryPath?: LocalModelEntryPath;
	readonly action?: LocalModelReadyOfferAction;
	readonly currentModelKind?: LocalModelCurrentModelKind;
}

type LocalModelFlowTelemetryEvent = {
	step: LocalModelFlowStep;
	entryPath: LocalModelEntryPath | undefined;
	action: LocalModelReadyOfferAction | undefined;
	currentModelKind: LocalModelCurrentModelKind | undefined;
};

type LocalModelFlowClassification = {
	step: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The on-device model flow step: consentShown, consentAccepted, consentCancelled, readyOfferShown or readyOfferAction.' };
	entryPath: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'For consent steps, what setup acquires: modelOnly (download the model) or none (use its files already on this device).' };
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'For readyOfferAction, the action chosen: useWithAuto, newAutoChat, switchDirect, useAuto or notNow.' };
	currentModelKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'For ready-offer steps, the kind of model the chat had selected: auto, server or other.' };
	owner: 'lramos15';
	comment: 'Tracks the on-device model setup flow: consent outcomes and engagement with the ready offer.';
};

/** Logs one `localModel.flow` event. */
export function logLocalModelFlow(telemetryService: ITelemetryService, event: ILocalModelFlowEvent): void {
	telemetryService.publicLog2<LocalModelFlowTelemetryEvent, LocalModelFlowClassification>('localModel.flow', {
		step: event.step,
		entryPath: event.entryPath,
		action: event.action,
		currentModelKind: event.currentModelKind,
	});
}

// #endregion

// #region Formatting

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

/** Formats a size the way the picker and dialogs show it, e.g. "56.7 GB". */
export function formatLocalModelBytes(bytes: number): string {
	if (bytes >= GB) {
		return localize('localModel.size.gb', "{0} GB", (bytes / GB).toFixed(1));
	}
	if (bytes >= MB) {
		return localize('localModel.size.mb', "{0} MB", Math.round(bytes / MB));
	}
	return localize('localModel.size.kb', "{0} KB", Math.max(1, Math.round(bytes / KB)));
}

/** Formats a remaining duration, e.g. "35 min" or "2 hr 5 min". */
export function formatLocalModelDuration(ms: number): string {
	const minutes = Math.round(ms / 60_000);
	if (minutes < 1) {
		return localize('localModel.duration.lessThanMinute', "less than a minute");
	}
	if (minutes < 60) {
		return localize('localModel.duration.minutes', "{0} min", minutes);
	}
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest === 0
		? localize('localModel.duration.hours', "{0} hr", hours)
		: localize('localModel.duration.hoursMinutes', "{0} hr {1} min", hours, rest);
}

/** A load's bar stops short of full until the model is ready: the estimate is only the last comparable load's duration. */
const LOAD_PROGRESS_CAP_PERCENT = 95;

/** The load of `family`'s model, while it is the active model and its server starts. */
export function getLocalModelLoad(status: Pick<ILocalModelStatusV1, 'active'>, family: Pick<ILocalModelFamilyV1, 'familyId'>): ILocalModelLoadV1 | undefined {
	const active = status.active;
	return active?.familyId === family.familyId && active.server === 'starting' ? active.load : undefined;
}

/**
 * The step of a load that its text and announcements follow: `loading` or
 * `warmingUp`, or, through both steps of a retry, why it retries, so the
 * retry is said once.
 */
export function getLocalModelLoadStepKey(load: ILocalModelLoadV1): string {
	return load.retry ?? load.step;
}

/**
 * Whether `family`'s running swap reloads its own model, e.g. for a new
 * context size: the host swaps the active model to itself, unloading it
 * (after its running responses) and loading it again.
 */
export function isLocalModelReload(status: Pick<ILocalModelStatusV1, 'active'>, family: Pick<ILocalModelFamilyV1, 'familyId' | 'operation'>): boolean {
	const active = status.active;
	return family.operation?.kind === 'swap' && family.operation.state === 'running' && active?.familyId === family.familyId && active.swapTo === family.familyId;
}

/**
 * The number of responses a drain of `family`'s operation waits for, or
 * `undefined` when none are running: the host is then unloading the model,
 * which reads as part of loading the next one.
 */
export function getLocalModelDrainingStreams(status: Pick<ILocalModelStatusV1, 'active'>, family: Pick<ILocalModelFamilyV1, 'usage'>): number | undefined {
	const streams = status.active?.drain?.runningStreams ?? family.usage.runningStreams;
	return streams > 0 ? streams : undefined;
}

/** How far a model load is, estimated from the last comparable load. */
export interface ILocalModelLoadProgress {
	/** At most 95 until the model is ready; `undefined` for a first load, which has no estimate. */
	readonly percent: number | undefined;
	/** E.g. "20 s" or "2 min", counting down a second at a time under a minute, while the estimate hasn't run out. */
	readonly remaining: string | undefined;
	/** The load takes longer than the last comparable one: it reads as almost done while the bar holds. */
	readonly overdue: boolean;
}

/**
 * The estimated progress of `load` at `now`: the time it has taken so far
 * against the last comparable load's duration, capped at 95% until the model
 * is ready.
 */
export function getLocalModelLoadProgress(load: ILocalModelLoadV1, now: number): ILocalModelLoadProgress {
	const expectedMs = load.expectedMs;
	if (!expectedMs || expectedMs <= 0) {
		return { percent: undefined, remaining: undefined, overdue: false };
	}
	const elapsedMs = Math.max(0, now - load.startedAt);
	const remainingMs = expectedMs - elapsedMs;
	const seconds = Math.ceil(remainingMs / 1_000);
	const remaining = remainingMs <= 0
		? undefined
		: seconds < 60
			? localize('localModel.duration.seconds', "{0} s", seconds)
			: formatLocalModelDuration(remainingMs);
	return { percent: Math.min(LOAD_PROGRESS_CAP_PERCENT, Math.floor(elapsedMs / expectedMs * 100)), remaining, overdue: remainingMs <= 0 };
}

/**
 * Runs `tick` whenever the countdown of the estimated load `getLoad` returns
 * moves on: at each next whole second of its time remaining, so it counts down
 * one second at a time however late a timer fires. It stops once the estimate
 * runs out (the bar then holds) or there is no estimated load, and when disposed.
 */
export class LocalModelLoadTicker extends Disposable {

	private readonly _timer = this._register(new TimeoutTimer());

	constructor(private readonly _getLoad: () => ILocalModelLoadV1 | undefined, private readonly _tick: () => void) {
		super();
		this._schedule();
	}

	private _schedule(): void {
		const load = this._getLoad();
		const expectedMs = load?.expectedMs;
		const remainingMs = load && expectedMs ? expectedMs - Math.max(0, Date.now() - load.startedAt) : 0;
		if (remainingMs <= 0) {
			this._timer.cancel();
			return;
		}
		// The countdown shows whole seconds rounded up: the next one starts when this one's remainder has passed.
		this._timer.cancelAndSet(() => {
			this._tick();
			if (!this._store.isDisposed) {
				this._schedule();
			}
		}, remainingMs % 1_000 || 1_000);
	}
}

// #endregion

// #region Consent content

/** What a consent button on a model's detail page means: agreeing to download (or set up) the model. */
export type LocalModelConsentChoice = 'accept';

/** A license the user can open; only a plain public `https:` URL. */
export interface ILocalModelLicenseLink {
	readonly name: string;
	readonly url: string;
}

/**
 * The download consent a model's detail page shows, built purely from status.
 * It covers only the model: its license, size and source, or reusing its files
 * already on this device. llama.cpp is needed (and asked for) only to load it.
 */
export interface ILocalModelSetUpConsent {
	/** `notEnoughDisk` explains why the download can't start; only `consent` leads to a request. */
	readonly kind: 'consent' | 'notEnoughDisk';
	/** The section title. */
	readonly title: string;
	/** One paragraph each. */
	readonly details: readonly string[];
	readonly license?: ILocalModelLicenseLink;
	/** The first is the primary button. */
	readonly buttons: readonly { readonly label: string; readonly choice: LocalModelConsentChoice }[];
	readonly entryPath: LocalModelEntryPath;
}

/** The setup entry path (whether the model is downloaded or its files on this device are used), for telemetry. */
export function getLocalModelEntryPath(family: Pick<ILocalModelFamilyV1, 'install' | 'entry'>): LocalModelEntryPath {
	return !family.install && !family.entry?.modelFilesPresent ? 'modelOnly' : 'none';
}

function sourceLine(offer: ILocalModelOfferV1): string {
	const license = offer.licenseName;
	return license
		? localize('localModel.consent.sourceLicense', "Source: Azure ML registry. License: {0}.", license)
		: localize('localModel.consent.source', "Source: Azure ML registry.");
}

/** The offer's license as a link, only for a plain public `https:` URL. */
export function getLocalModelLicenseLink(offer: ILocalModelOfferV1 | undefined): ILocalModelLicenseLink | undefined {
	const url = offer?.licenseUrl;
	if (!offer?.licenseName || !url || !/^https:\/\/[^\s()<>]+$/.test(url)) {
		return undefined;
	}
	return { name: offer.licenseName, url };
}

/** Hex characters of the install's runtime digest (a SHA-256 over the executable and its libraries) shown in the approval text. */
const SHA256_SHORT_LENGTH = 12;

function runtimeApprovalMessage(path: string, version: string | undefined, sha256: string | undefined): string {
	if (sha256) {
		// The consent is bound to this hash; the short form lets the user recognize the file.
		const short = sha256.slice(0, SHA256_SHORT_LENGTH);
		return version
			? localize('localModel.consent.runtimeApprovalWithHash', "Use llama.cpp found at {0} ({1})? Runtime digest {2}...", path, version, short)
			: localize('localModel.consent.runtimeApprovalNoVersionWithHash', "Use llama.cpp found at {0}? Runtime digest {1}...", path, short);
	}
	return version
		? localize('localModel.consent.runtimeApproval', "Use llama.cpp found at {0} ({1})?", path, version)
		: localize('localModel.consent.runtimeApprovalNoVersion', "Use llama.cpp found at {0}?", path);
}

function keepWorkingLine(): string {
	return localize('localModel.consent.keepWorking', "You can keep using Copilot while it downloads.");
}

/** Why a detected `llama-server` needs approval: never approved, or changed on disk since it was. */
function runtimeTrustLine(changed: boolean): string {
	return changed
		? localize('localModel.consent.runtimeChangedTrust', "This llama-server changed since you approved it, so it wasn't run. Use it only if you trust it.")
		: localize('localModel.consent.runtimeApprovalTrust', "VS Code didn't install this llama-server. Use it only if you trust it.");
}

/**
 * Builds the download consent of `family`'s detail page: what is downloaded
 * (or reused), from where and under which license, near fit and disk space.
 * Without an approved llama.cpp it says that loading the model needs one,
 * which VS Code doesn't install. Its buttons are the consent; see
 * {@link getLocalModelSetUpAgreement}.
 */
export function buildLocalModelSetUpConsent(status: ILocalModelStatusV1, family: ILocalModelFamilyV1): ILocalModelSetUpConsent {
	const name = family.displayName;
	const entryPath = getLocalModelEntryPath(family);
	const offer = family.offer;
	const downloads = !family.entry?.modelFilesPresent && !!offer;
	const disk = family.entry?.disk;

	if (disk && disk.availableBytes < disk.requiredBytes) {
		return {
			kind: 'notEnoughDisk',
			title: localize('localModel.consent.notEnoughDiskTitle', "Not Enough Disk Space"),
			details: [
				localize('localModel.consent.notEnoughDisk', "Not enough free space on {0} ({1} available, {2} needed).", disk.volume, formatLocalModelBytes(disk.availableBytes), formatLocalModelBytes(disk.requiredBytes)),
				localize('localModel.consent.notEnoughDiskDetail', "Free up space on {0}, then download {1} again.", disk.volume, name),
			],
			buttons: [],
			entryPath,
		};
	}

	const details: string[] = [];
	if (downloads) {
		details.push(disk
			? localize('localModel.consent.downloadSizeOnVolume', "Download size: {0}. Free space needed during setup: {1} on {2}.", formatLocalModelBytes(offer.downloadBytes), formatLocalModelBytes(disk.requiredBytes), disk.volume)
			: localize('localModel.consent.downloadSize', "Download size: {0}. Free space needed during setup: {1}.", formatLocalModelBytes(offer.downloadBytes), formatLocalModelBytes(offer.peakDiskBytes)));
		details.push(sourceLine(offer));
		details.push(localize('localModel.consent.storage', "Stored in ~/.copilot/azureml-models and shared with other Copilot apps."));
	} else {
		details.push(localize('localModel.consent.alreadyPresent', "Uses {0}, which is already on this device.", name));
	}
	if (status.runtime.trust !== 'userApproved') {
		details.push(downloads
			? localize('localModel.consent.runtimeNeededDownload', "Loading {0} needs llama.cpp, which VS Code doesn't install. You can get it while the model downloads.", name)
			: localize('localModel.consent.runtimeNeeded', "Loading {0} needs llama.cpp, which VS Code doesn't install.", name));
	}
	if (offer?.fit === 'near') {
		details.push(status.device.capacityBytes
			? localize('localModel.consent.nearFit', "This device has about {0} of GPU memory; the model needs about {1}. Part of it will run from system memory, so responses may be slower.", formatLocalModelBytes(status.device.capacityBytes), formatLocalModelBytes(offer.requiredGpuBytes))
			: localize('localModel.consent.nearFitUnknown', "The model needs about {0} of GPU memory, a little more than this device has. Part of it will run from system memory, so responses may be slower.", formatLocalModelBytes(offer.requiredGpuBytes)));
	}
	if (downloads) {
		details.push(keepWorkingLine());
	}

	return {
		kind: 'consent',
		title: downloads ? localize('localModel.consent.titleDownload', "Download") : localize('localModel.consent.titleSetUp', "Set Up"),
		details,
		license: downloads ? getLocalModelLicenseLink(offer) : undefined,
		buttons: [{ label: downloads ? localize('localModel.consent.download', "Download") : localize('localModel.consent.setUp', "Set Up"), choice: 'accept' }],
		entryPath,
	};
}

/** What agreeing to the download consent sends. */
export interface ILocalModelSetUpAgreement {
	/** The consent over exactly the facts {@link buildLocalModelSetUpConsent} showed for the same status. */
	readonly consent: ILocalModelConsent;
	/** The entry path agreed to, for telemetry. */
	readonly entryPath: LocalModelEntryPath;
}

/**
 * The consent for agreeing to the download consent built for `family`. Pass
 * the family the page showed, so the scope covers exactly what the user saw:
 * the host compares it with its own projection before acting.
 */
export function getLocalModelSetUpAgreement(family: ILocalModelFamilyV1): ILocalModelSetUpAgreement {
	return {
		consent: { scope: computeLocalModelConsentScope({ family }) },
		entryPath: getLocalModelEntryPath(family),
	};
}

/** The approval of a detected `llama-server` an installed model's detail page shows. */
export interface ILocalModelRuntimeApproval {
	readonly message: string;
	/** One paragraph each. */
	readonly details: readonly string[];
}

/**
 * The approval of the detected `llama-server`, also after an approved one
 * changed on disk (`runtimeChanged`), or `undefined` when none awaits approval.
 */
export function buildLocalModelRuntimeApproval(status: ILocalModelStatusV1): ILocalModelRuntimeApproval | undefined {
	const { path, version, sha256, trust } = status.runtime;
	if (trust !== 'pendingApproval' || !path) {
		return undefined;
	}
	return {
		message: runtimeApprovalMessage(path, version, sha256),
		details: [
			runtimeTrustLine(isLocalModelRuntimeChanged(status)),
			localize('localModel.approve.detail', "VS Code runs it to serve on-device models."),
		],
	};
}

/** The approval consent for the detected `llama-server` of the status the page showed. */
export function getLocalModelRuntimeApprovalConsent(status: ILocalModelStatusV1): ILocalModelConsent {
	return { scope: computeLocalModelConsentScope({ runtime: status.runtime }) };
}

/** "{n} chats are using it" text for a family, or `undefined` when nothing uses it. */
function usageSentence(chats: number, streams: number): string | undefined {
	if (chats > 0) {
		return chats === 1
			? localize('localModel.usage.oneChat', "1 chat is using it. Running responses will finish first.")
			: localize('localModel.usage.chats', "{0} chats are using it. Running responses will finish first.", chats);
	}
	if (streams > 0) {
		return streams === 1
			? localize('localModel.usage.oneStream', "1 running response will finish first.")
			: localize('localModel.usage.streams', "{0} running responses will finish first.", streams);
	}
	return undefined;
}

// #endregion

/**
 * The confirmations of the on-device model flow that stay dialogs: Stop Now
 * and Remove. Loading another model needs none: it starts at once, and the
 * notice above the chat input can cancel it. Setup consent and runtime
 * approval are given on the model's detail page in the model picker instead.
 */
export class LocalModelSetupFlow implements ILocalModelInteractionHandler {

	constructor(
		@IDialogService private readonly _dialogService: IDialogService,
	) { }

	async confirmStopNow(_connection: IAgentConnection, status: ILocalModelStatusV1): Promise<boolean> {
		const activeFamily = status.families.find(candidate => candidate.familyId === status.active?.familyId);
		const streams = status.active?.drain?.runningStreams ?? activeFamily?.usage.runningStreams ?? 0;
		const { confirmed } = await this._dialogService.confirm({
			type: Severity.Warning,
			message: streams === 1
				? localize('localModel.stopNow.titleOne', "Stop 1 running response?")
				: localize('localModel.stopNow.title', "Stop {0} running responses?", streams),
			detail: localize('localModel.stopNow.detail', "They will end without finishing."),
			primaryButton: localize('localModel.stopNow.stop', "Stop Now"),
		});
		return confirmed;
	}

	async confirmRemove(_connection: IAgentConnection, _status: ILocalModelStatusV1, family: ILocalModelFamilyV1): Promise<boolean> {
		const usage = usageSentence(family.usage.boundDirectChats + family.usage.liveAutoRoutes, family.usage.runningStreams);
		let files: string;
		if (!family.install) {
			files = localize('localModel.remove.partial', "Files downloaded so far are deleted.");
		} else if (!family.install.owned) {
			files = localize('localModel.remove.notOwned', "VS Code didn't download these model files, so they stay on this device.");
		} else {
			files = localize('localModel.remove.owned', "Its model files are deleted from this device.");
		}
		const { confirmed } = await this._dialogService.confirm({
			type: Severity.Warning,
			message: localize('localModel.remove.title', "Remove {0}?", family.displayName),
			detail: [usage, files].filter(line => !!line).join('\n\n'),
			primaryButton: localize('localModel.remove.remove', "Remove"),
		});
		return confirmed;
	}
}
