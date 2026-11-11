/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status as ariaStatus } from '../../../../../../base/browser/ui/aria/aria.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../../base/common/observable.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import type { ILocalModelErrorV1, ILocalModelFamilyV1, ILocalModelLoadV1, ILocalModelOperationV1, ILocalModelStatusV1, LocalModelOperationKind, LocalModelOperationPhase, LocalModelOperationState } from '../../../../../../platform/agentHost/common/localModel.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { getLocalModelServerStopId, getLocalModelStopNowId, ILocalModelService } from '../../../../../services/agentHost/common/localModelService.js';
import { SessionType } from '../../../common/chatSessionsService.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationAction, IChatInputNotificationGroup, IChatInputNotificationProgress, IChatInputNotificationService } from '../../widget/input/chatInputNotificationService.js';
import { getLocalModelErrorActionLabel, runLocalModelErrorAction } from './localModelErrorActions.js';
import { formatLocalModelBytes, formatLocalModelDuration, getLocalModelDrainingStreams, getLocalModelLoadProgress, getLocalModelLoadStepKey, ILocalModelLoadProgress, isLocalModelReload, LOCAL_MODEL_SHOW_DETAILS_COMMAND_ID, LocalModelLoadTicker, observeLocalModelUiEnabled } from './localModelSetupFlow.js';

/** Minimum time between updates of a download's text within one phase; the bar still moves. */
const DOWNLOAD_MESSAGE_INTERVAL_MS = 5_000;
/** The same, while a screen reader is in use: the notice's accessible name changes with its text. */
const DOWNLOAD_MESSAGE_INTERVAL_SCREEN_READER_MS = 60_000;

/** The one notice above the chat input that reports on-device model operations, pauses and failures. */
export const LOCAL_MODEL_STATUS_NOTICE_ID = 'localModel.status';

/** Which on-device model notice shows when several apply to a chat input, highest first. */
export const enum LocalModelNoticePriority {
	/** The ready offer and the loading, not loaded and cloud fallback notices. */
	Other = 0,
	/** A paused operation, one the agent host stopped, or one that found the device can't run the model. */
	Paused = 1,
	/** A running operation, or a standalone llama.cpp install or upgrade. */
	Running = 2,
	/** A failed operation, llama.cpp install or upgrade, or a model that failed to start. */
	Error = 3,
}

/** The group of every on-device model notice above the chat input, so only the most important one shows. */
export function getLocalModelNoticeGroup(priority: LocalModelNoticePriority): IChatInputNotificationGroup {
	return { id: 'localModel', priority };
}

/** Runs an action of {@link LOCAL_MODEL_STATUS_NOTICE_ID}; the argument names it. */
const LOCAL_MODEL_NOTICE_ACTION_COMMAND_ID = '_workbench.action.chat.localModel.noticeAction';
const noticeActions = new Map<string, () => unknown>();
CommandsRegistry.registerCommand(LOCAL_MODEL_NOTICE_ACTION_COMMAND_ID, (_accessor, id: unknown) => typeof id === 'string' ? noticeActions.get(id)?.() : undefined);

/** The phase-specific text of a running operation. */
export function getLocalModelProgressMessage(status: ILocalModelStatusV1, family: ILocalModelFamilyV1, operation: ILocalModelOperationV1): string {
	const name = family.displayName;
	switch (operation.phase) {
		case 'resolving':
			return localize('localModel.progress.resolving', "Setting up {0}\u2026", name);
		case 'checkingDevice':
			return localize('localModel.progress.checkingDevice', "Setting up {0}: Checking this device\u2026", name);
		case 'downloading': {
			const { completedBytes, totalBytes, bytesPerSecond } = operation;
			if (totalBytes && completedBytes !== undefined) {
				if (bytesPerSecond && bytesPerSecond > 0) {
					const remainingMs = Math.max(0, totalBytes - completedBytes) / bytesPerSecond * 1000;
					return localize('localModel.progress.downloading', "Downloading {0}: {1} of {2}, about {3} remaining", name, formatLocalModelBytes(completedBytes), formatLocalModelBytes(totalBytes), formatLocalModelDuration(remainingMs));
				}
				return localize('localModel.progress.downloadingNoRate', "Downloading {0}: {1} of {2}", name, formatLocalModelBytes(completedBytes), formatLocalModelBytes(totalBytes));
			}
			return localize('localModel.progress.downloadingIndeterminate', "Downloading {0}\u2026", name);
		}
		case 'verifying':
			return localize('localModel.progress.verifying', "Setting up {0}: Verifying\u2026", name);
		case 'placing':
			return localize('localModel.progress.placing', "Setting up {0}: Finishing\u2026", name);
		case 'draining': {
			// With no response running, the model is being unloaded: the operation's own text says what it is for.
			const streams = getLocalModelDrainingStreams(status, family);
			if (streams === undefined) {
				break;
			}
			if (operation.kind === 'swap') {
				// The active model stays loaded until they finish; Cancel keeps it.
				const reload = isLocalModelReload(status, family);
				return streams === 1
					? reload
						? localize('localModel.progress.drainingOneReload', "Waiting for 1 response to finish before reloading {0}\u2026", name)
						: localize('localModel.progress.drainingOneSwap', "Waiting for 1 response to finish before loading {0}\u2026", name)
					: reload
						? localize('localModel.progress.drainingReload', "Waiting for {0} responses to finish before reloading {1}\u2026", streams, name)
						: localize('localModel.progress.drainingSwap', "Waiting for {0} responses to finish before loading {1}\u2026", streams, name);
			}
			return streams === 1
				? localize('localModel.progress.drainingOne', "Waiting for 1 response to finish\u2026")
				: localize('localModel.progress.draining', "Waiting for {0} responses to finish\u2026", streams);
		}
		case 'loading':
			return isLocalModelReload(status, family)
				? localize('localModel.progress.reloading', "Reloading {0}\u2026", name)
				: localize('localModel.progress.loading', "Loading {0}\u2026", name);
	}
	switch (operation.kind) {
		case 'update': return localize('localModel.progress.update', "Updating {0}\u2026", name);
		case 'remove': return localize('localModel.progress.remove', "Removing {0}\u2026", name);
		case 'swap': return isLocalModelReload(status, family)
			? localize('localModel.progress.reloading', "Reloading {0}\u2026", name)
			: localize('localModel.progress.swap', "Loading {0}\u2026", name);
		default: return localize('localModel.progress.setup', "Setting up {0}\u2026", name);
	}
}

/** Download percentage, only while bytes are known. */
export function getLocalModelProgressPercent(operation: ILocalModelOperationV1): number | undefined {
	if (operation.phase !== 'downloading' || !operation.totalBytes || operation.completedBytes === undefined) {
		return undefined;
	}
	return Math.max(0, Math.min(100, Math.floor(operation.completedBytes / operation.totalBytes * 100)));
}

/** The text of a model load: its step and the time remaining from the last comparable load (or that it's almost done); a retry says why. */
export function getLocalModelLoadMessage(name: string, load: ILocalModelLoadV1, progress: ILocalModelLoadProgress | undefined, reload = false): string {
	const remaining = progress?.remaining;
	const overdue = !!progress?.overdue;
	if (load.retry === 'withoutSpeculativeDecoding') {
		return remaining
			? localize('localModel.progress.retryingRemaining', "Retrying {0} without speculative decoding, about {1} remaining", name, remaining)
			: overdue
				? localize('localModel.progress.retryingAlmostDone', "Retrying {0} without speculative decoding, almost done\u2026", name)
				: localize('localModel.progress.retrying', "Retrying {0} without speculative decoding\u2026", name);
	}
	if (load.step === 'warmingUp') {
		return remaining
			? localize('localModel.progress.warmingUpRemaining', "Warming up {0}, about {1} remaining", name, remaining)
			: overdue
				? localize('localModel.progress.warmingUpAlmostDone', "Warming up {0}, almost done\u2026", name)
				: localize('localModel.progress.warmingUp', "Warming up {0}\u2026", name);
	}
	if (reload) {
		return remaining
			? localize('localModel.progress.reloadingRemaining', "Reloading {0}, about {1} remaining", name, remaining)
			: overdue
				? localize('localModel.progress.reloadingAlmostDone', "Reloading {0}, almost done\u2026", name)
				: localize('localModel.progress.reloading', "Reloading {0}\u2026", name);
	}
	return remaining
		? localize('localModel.progress.loadingRemaining', "Loading {0}, about {1} remaining", name, remaining)
		: overdue
			? localize('localModel.progress.loadingAlmostDone', "Loading {0}, almost done\u2026", name)
			: localize('localModel.progress.loadingStep', "Loading {0}\u2026", name);
}

/** What the notice says once Pause, Cancel or Stop Now was sent, until the operation's state changes. */
function getStoppingMessage(status: ILocalModelStatusV1, family: ILocalModelFamilyV1, operation: ILocalModelOperationV1, stopNow: boolean): string {
	if (stopNow) {
		return localize('localModel.progress.stoppingResponses', "Stopping the running responses\u2026");
	}
	if (operation.kind === 'swap') {
		return isLocalModelReload(status, family)
			? localize('localModel.progress.cancellingReload', "Cancelling reloading {0}\u2026", family.displayName)
			: localize('localModel.progress.cancellingLoad', "Cancelling loading {0}\u2026", family.displayName);
	}
	return localize('localModel.progress.pausing', "Pausing {0}\u2026", family.displayName);
}

/** What the notice says about a paused operation. A user pause shows only in a window that saw it run, so it doesn't reappear in every new window. */
function getPausedMessage(family: ILocalModelFamilyV1, operation: ILocalModelOperationV1, seenRunning: boolean): string | undefined {
	switch (operation.pausedReason) {
		case 'diskFull':
			return localize('localModel.paused.diskFull', "Paused: there isn't enough free disk space to continue downloading {0}.", family.displayName);
		case 'network':
			return localize('localModel.paused.network', "Paused: the download of {0} was interrupted.", family.displayName);
		case 'consentChanged':
			return localize('localModel.paused.consentChanged', "Paused: {0} changed since you agreed to set it up. Review the details to continue.", family.displayName);
		case 'user':
			if (!seenRunning) {
				return undefined;
			}
			switch (operation.kind) {
				case 'update': return localize('localModel.paused.userUpdate', "Updating {0} is paused.", family.displayName);
				default: return localize('localModel.paused.userSetup', "Setting up {0} is paused.", family.displayName);
			}
		default:
			return undefined;
	}
}

function getCompletedMessage(kind: LocalModelOperationKind, family: ILocalModelFamilyV1 | undefined, status: ILocalModelStatusV1, displayName: string): string | undefined {
	switch (kind) {
		case 'setup':
			return family?.install ? localize('localModel.completed.setup', "{0} is set up.", displayName) : undefined;
		case 'update':
			return family?.install ? localize('localModel.completed.update', "{0} is updated.", displayName) : undefined;
		case 'remove':
			return family?.install ? undefined : localize('localModel.completed.remove', "{0} was removed.", displayName);
		case 'swap': {
			if (status.active?.familyId === family?.familyId && status.active?.server === 'ready') {
				return localize('localModel.completed.swap', "{0} is loaded.", displayName);
			}
			// It ended without its model loaded: it was cancelled, while it waited (the active model stays) or loaded.
			const kept = status.active?.server === 'ready' ? status.families.find(candidate => candidate.familyId === status.active?.familyId)?.displayName : undefined;
			return kept
				? localize('localModel.cancelled.swapKept', "Loading {0} was cancelled. {1} stays loaded.", displayName, kept)
				: localize('localModel.cancelled.swap', "Loading {0} was cancelled.", displayName);
		}
		default:
			return undefined;
	}
}

/** A stop sent for a running operation and not yet in effect: its Cancel or Pause, or Stop Now of its drain. */
type PendingNoticeStop = 'operation' | 'stopNow';

/** An action of the notice: a closure run through the notice action command, or a command. */
type LocalModelNoticeAction = {
	/** Unique within the notice; reported to telemetry as `localModel.<id>`. */
	readonly id: string;
	readonly label: string;
	readonly primary?: boolean;
	/** Shows as a secondary button rather than a text action: how a running operation is stopped. */
	readonly secondaryButton?: boolean;
	/** Shows, but can't be chosen, e.g. once a stop was sent and until it takes effect. */
	readonly disabled?: boolean;
} & ({ readonly run: () => unknown; readonly commandId?: never } | { readonly run?: never; readonly commandId: string; readonly commandArgs: unknown[] });

/** One state the notice can report. */
interface ILocalModelNotice {
	/** Identifies the state; a dismissal lasts while a state with this key is reported. */
	readonly key: string;
	readonly priority: LocalModelNoticePriority;
	readonly severity: ChatInputNotificationSeverity;
	readonly message: string;
	/** What screen readers get instead of a message that changes every second, e.g. a load's countdown. */
	readonly ariaMessage?: string;
	readonly progress?: IChatInputNotificationProgress;
	/** Changes when screen readers should hear the notice again: a new phase, not new byte counts. */
	readonly announcementKey: string;
	readonly telemetryId: string;
	readonly actions: readonly LocalModelNoticeAction[];
	/** Runs when the user dismisses this state, besides keeping it hidden. */
	readonly onDismiss?: () => void;
	/** The load whose estimate it counts down: refreshed at each whole second of it while it shows. */
	readonly countdown?: ILocalModelLoadV1;
	/** An operation is running: the notice shows the in-progress indicator of an active session. */
	readonly busy?: boolean;
}

/** This window's view of one family's operation. */
interface IOperationTracking {
	readonly operationId: string;
	readonly familyId: string;
	displayName: string;
	kind: LocalModelOperationKind;
	lastState: LocalModelOperationState;
	lastPhase: LocalModelOperationPhase | undefined;
	/** It ran while this window watched. */
	seenRunning: boolean;
	/** The accessible text of the notice, which changes at most once per throttle interval within a phase, or when a load's estimate runs out. */
	message: string | undefined;
	messagePhase: string | undefined;
	messageOverdue: boolean;
	messageAt: number;
}

/**
 * Reports on-device model operations in one notice above Copilot Agent Host chat inputs: the most important of a
 * failure (with its fixes), a running operation (with progress and Pause, Cancel or Stop Now), a model load (with
 * progress estimated from the last comparable load), a pause, or an operation the Agent Host stopped. Other on-device
 * notices defer to it through {@link getLocalModelNoticeGroup}.
 *
 * Everything is rebuilt from status, so a window reload or an automatic resume shows the same notice. Completion is
 * driven by the operation disappearing or failing, never by byte counts. Only the local Agent Host publishes status,
 * so remote hosts show nothing.
 */
export class LocalModelSetupProgress extends Disposable {

	private readonly _operations = new Map<string, IOperationTracking>();
	/** Outcomes reported until the user dismisses them: the device couldn't run a model it was set up for. */
	private readonly _outcomeNotices = new Map<string, ILocalModelNotice>();
	/** Operations the Agent Host stopped while they ran; reported until it publishes status again. */
	private readonly _disconnectNotices = new Map<string, ILocalModelNotice>();
	/** What the notice can show, most important first. */
	private _notices: readonly ILocalModelNotice[] = [];
	/** Keys of states the user dismissed; forgotten once the state clears. */
	private readonly _dismissed = new Set<string>();
	/** What {@link LOCAL_MODEL_STATUS_NOTICE_ID} currently shows, to publish only changes. */
	private _publishedSignature: string | undefined;
	/** The state it shows; a new state is published as a new notice, the same one is updated in place. */
	private _publishedKey: string | undefined;
	private readonly _publishedActions = this._register(new MutableDisposable());
	/** Pending update per family, to announce only newly available updates. */
	private _knownUpdates: Map<string, string | undefined> | undefined;
	/** Status went away while enabled: the host stopped or restarts. */
	private _disconnected = false;
	private readonly _actionPrefix = generateUuid();
	private readonly _enabled: IObservable<boolean>;
	private readonly _status: IObservable<ILocalModelStatusV1 | undefined>;
	private readonly _pendingStops: IObservable<ReadonlySet<string>>;
	/** Refreshes a shown load whose progress is estimated at each whole second of its countdown. */
	private readonly _ticker = this._register(new MutableDisposable<LocalModelLoadTicker>());
	/** The load {@link _ticker} counts down. */
	private _countdown: ILocalModelLoadV1 | undefined;
	/** The accessible text of a load without an operation, which changes at most once per throttle interval within a step, or when its estimate runs out. */
	private _loadMessage: { readonly key: string; readonly message: string; readonly overdue: boolean; readonly at: number } | undefined;

	constructor(
		@IAgentHostService private readonly _connection: IAgentHostService,
		@ILocalModelService private readonly _localModelService: ILocalModelService,
		@IChatInputNotificationService private readonly _chatInputNotificationService: IChatInputNotificationService,
		@ICommandService private readonly _commandService: ICommandService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) {
		super();
		this._enabled = observeLocalModelUiEnabled(configurationService, contextKeyService);
		this._status = this._localModelService.getStatus(this._connection);
		this._pendingStops = this._localModelService.getPendingStops(this._connection);
		this._register(toDisposable(() => this._unpublish()));
		this._register(autorun(reader => {
			const enabled = this._enabled.read(reader);
			const status = this._status.read(reader);
			// A stop that was just sent shows at once.
			this._pendingStops.read(reader);
			this._sync(enabled, status);
		}));
	}

	private _sync(enabled: boolean, status: ILocalModelStatusV1 | undefined): void {
		if (!enabled) {
			this._operations.clear();
			this._outcomeNotices.clear();
			this._disconnectNotices.clear();
			this._knownUpdates = undefined;
			this._disconnected = false;
			this._setNotices([]);
			return;
		}
		if (!status) {
			this._handleDisconnect();
			this._setNotices([...this._disconnectNotices.values(), ...this._outcomeNotices.values()]);
			return;
		}
		this._disconnected = false;
		this._disconnectNotices.clear();

		const notices: ILocalModelNotice[] = [];
		const liveOperations = new Set<string>();
		for (const family of status.families) {
			const operation = family.operation;
			if (operation) {
				liveOperations.add(operation.id);
				this._syncOperation(status, family, operation, notices);
			}
		}
		const active = status.active;
		if (active?.server === 'error' && active.error) {
			const family = status.families.find(candidate => candidate.familyId === active.familyId);
			notices.push(this._errorNotice(`active:${active.familyId}:${active.error.code}:${active.error.message}`, family, active.error, undefined));
		}
		// A load the host started on its own, e.g. when a request needs the model; a swap's load is its operation's.
		const loadingFamily = active?.server === 'starting' && active.load ? status.families.find(candidate => candidate.familyId === active.familyId) : undefined;
		if (loadingFamily && !loadingFamily.operation && active?.load) {
			notices.push(this._loadNotice(loadingFamily, active.load));
		} else {
			this._loadMessage = undefined;
		}
		for (const [operationId, tracking] of [...this._operations]) {
			if (!liveOperations.has(operationId)) {
				this._operations.delete(operationId);
				this._operationEnded(status, tracking);
			}
		}
		this._announceUpdates(status);
		this._setNotices([...notices, ...this._outcomeNotices.values()]);
	}

	private _syncOperation(status: ILocalModelStatusV1, family: ILocalModelFamilyV1, operation: ILocalModelOperationV1, notices: ILocalModelNotice[]): void {
		let tracking = this._operations.get(operation.id);
		if (!tracking) {
			tracking = { operationId: operation.id, familyId: family.familyId, displayName: family.displayName, kind: operation.kind, lastState: operation.state, lastPhase: operation.phase, seenRunning: false, message: undefined, messagePhase: undefined, messageOverdue: false, messageAt: 0 };
			this._operations.set(operation.id, tracking);
		}
		tracking.displayName = family.displayName;
		tracking.kind = operation.kind;
		tracking.lastState = operation.state;
		tracking.lastPhase = operation.phase ?? tracking.lastPhase;

		switch (operation.state) {
			case 'running':
				tracking.seenRunning = true;
				notices.push(this._runningNotice(status, family, operation, tracking));
				break;
			case 'paused': {
				const message = getPausedMessage(family, operation, tracking.seenRunning);
				if (message) {
					notices.push(this._pausedNotice(family, operation, message));
				}
				break;
			}
			case 'error':
				if (operation.error) {
					notices.push(this._errorNotice(`operation:${operation.id}:${operation.error.code}:${operation.error.message}`, family, operation.error, operation.id));
				}
				break;
		}
	}

	private _runningNotice(status: ILocalModelStatusV1, family: ILocalModelFamilyV1, operation: ILocalModelOperationV1, tracking: IOperationTracking): ILocalModelNotice {
		const phase = operation.phase ?? '';
		// A stop that was sent shows at once, and the button that sent it reads as in progress.
		const pendingStops = this._pendingStops.get();
		const pending: PendingNoticeStop | undefined = pendingStops.has(getLocalModelStopNowId(operation.id)) ? 'stopNow' : pendingStops.has(operation.id) ? 'operation' : undefined;
		if (pending) {
			return {
				key: `running:${operation.id}`,
				priority: LocalModelNoticePriority.Running,
				severity: ChatInputNotificationSeverity.Info,
				message: getStoppingMessage(status, family, operation, pending === 'stopNow'),
				progress: { percent: getLocalModelProgressPercent(operation) },
				announcementKey: `running:${operation.id}:${phase}:stopping`,
				telemetryId: 'localModel.progress',
				actions: this._stopActions(status, family, operation, pending),
				busy: true,
			};
		}
		// A swap's loading phase shows its load, estimated from the last comparable one.
		const load = operation.phase === 'loading' && status.active?.familyId === family.familyId && status.active.server === 'starting' ? status.active.load : undefined;
		const loadProgress = load && getLocalModelLoadProgress(load, Date.now());
		const reload = isLocalModelReload(status, family);
		// Byte counts change several times a second, and an estimate's time remaining every second: keep the accessible text steady within a phase.
		const messagePhase = load ? `${phase}:${getLocalModelLoadStepKey(load)}` : phase;
		const throttleMs = operation.phase === 'downloading' || load?.expectedMs ? this._messageIntervalMs() : 0;
		const now = Date.now();
		const overdue = !!loadProgress?.overdue;
		if (tracking.message === undefined || tracking.messagePhase !== messagePhase || tracking.messageOverdue !== overdue || now - tracking.messageAt >= throttleMs) {
			tracking.message = load ? getLocalModelLoadMessage(family.displayName, load, loadProgress, reload) : getLocalModelProgressMessage(status, family, operation);
			tracking.messagePhase = messagePhase;
			tracking.messageOverdue = overdue;
			tracking.messageAt = now;
		}

		const actions = this._stopActions(status, family, operation, undefined);
		return {
			key: `running:${operation.id}`,
			priority: LocalModelNoticePriority.Running,
			severity: ChatInputNotificationSeverity.Info,
			// A load's countdown moves every second on screen; its accessible name keeps the steady text.
			message: load ? getLocalModelLoadMessage(family.displayName, load, loadProgress, reload) : tracking.message,
			ariaMessage: load ? tracking.message : undefined,
			progress: { percent: loadProgress ? loadProgress.percent : getLocalModelProgressPercent(operation) },
			// Screen readers hear a new phase or load step, not its progress.
			announcementKey: `running:${operation.id}:${messagePhase}`,
			telemetryId: 'localModel.progress',
			actions,
			countdown: loadProgress?.remaining ? load : undefined,
			busy: true,
		};
	}

	/**
	 * How the running `operation` is stopped, each a secondary button: Cancel takes back a model change or stops its load,
	 * Stop Now ends the responses a drain waits for, and Pause stops a setup or update so it can resume. Once one was
	 * sent, only it shows, in progress, until the operation's state changes.
	 */
	private _stopActions(status: ILocalModelStatusV1, family: ILocalModelFamilyV1, operation: ILocalModelOperationV1, pending: PendingNoticeStop | undefined): LocalModelNoticeAction[] {
		const button = { secondaryButton: true, disabled: pending !== undefined } as const;
		const draining = operation.phase === 'draining' && getLocalModelDrainingStreams(status, family) !== undefined;
		const stopNow: LocalModelNoticeAction = {
			...button,
			id: 'stopNow',
			label: pending === 'stopNow' ? localize('localModel.progress.stoppingAction', "Stopping\u2026") : localize('localModel.progress.stopNow', "Stop Now"),
			run: () => this._localModelService.stopNow(this._connection),
		};
		if (pending === 'stopNow') {
			return [stopNow];
		}
		if (operation.kind === 'swap') {
			const cancel: LocalModelNoticeAction = {
				...button,
				id: 'cancel',
				label: pending ? localize('localModel.progress.cancellingAction', "Cancelling\u2026") : localize('localModel.progress.cancel', "Cancel"),
				run: () => this._localModelService.cancel(this._connection, operation.id),
			};
			return draining && !pending ? [{ ...stopNow, secondaryButton: false }, cancel] : [cancel];
		}
		if (draining) {
			return [stopNow];
		}
		if (operation.kind !== 'remove') {
			return [{
				...button,
				id: 'pause',
				label: pending ? localize('localModel.progress.pausingAction', "Pausing\u2026") : localize('localModel.progress.pause', "Pause"),
				run: () => this._localModelService.pause(this._connection, operation.id),
			}];
		}
		return [];
	}

	/** A load the host started without an operation: its step and estimated progress (indeterminate for a first load), with Cancel, which leaves the model active but not loaded. */
	private _loadNotice(family: ILocalModelFamilyV1, load: ILocalModelLoadV1): ILocalModelNotice {
		const now = Date.now();
		const progress = getLocalModelLoadProgress(load, now);
		const key = `loading:${family.familyId}:${load.startedAt}`;
		const messageKey = `${key}:${getLocalModelLoadStepKey(load)}`;
		const cancelling = this._pendingStops.get().has(getLocalModelServerStopId(family.familyId));
		if (this._loadMessage?.key !== messageKey || this._loadMessage.overdue !== progress.overdue || now - this._loadMessage.at >= this._messageIntervalMs()) {
			this._loadMessage = { key: messageKey, message: getLocalModelLoadMessage(family.displayName, load, progress), overdue: progress.overdue, at: now };
		}
		const cancel: LocalModelNoticeAction = {
			id: 'cancelLoad',
			label: cancelling ? localize('localModel.progress.cancellingAction', "Cancelling\u2026") : localize('localModel.progress.cancel', "Cancel"),
			secondaryButton: true,
			disabled: cancelling,
			run: () => this._localModelService.stop(this._connection),
		};
		if (cancelling) {
			const message = localize('localModel.progress.cancellingLoad', "Cancelling loading {0}\u2026", family.displayName);
			return {
				key,
				priority: LocalModelNoticePriority.Running,
				severity: ChatInputNotificationSeverity.Info,
				message,
				progress: { percent: progress.percent },
				announcementKey: `${messageKey}:stopping`,
				telemetryId: 'localModel.loading',
				actions: [cancel],
				busy: true,
			};
		}
		return {
			key,
			priority: LocalModelNoticePriority.Running,
			severity: ChatInputNotificationSeverity.Info,
			// The countdown moves every second on screen; the accessible name keeps the steady text.
			message: getLocalModelLoadMessage(family.displayName, load, progress),
			ariaMessage: this._loadMessage.message,
			progress: { percent: progress.percent },
			announcementKey: messageKey,
			telemetryId: 'localModel.loading',
			actions: [cancel],
			countdown: progress.remaining ? load : undefined,
			busy: true,
		};
	}

	private _pausedNotice(family: ILocalModelFamilyV1, operation: ILocalModelOperationV1, message: string): ILocalModelNotice {
		const key = `paused:${operation.id}:${operation.pausedReason}`;
		return {
			key,
			priority: LocalModelNoticePriority.Paused,
			severity: ChatInputNotificationSeverity.Warning,
			message,
			announcementKey: key,
			telemetryId: 'localModel.paused',
			// A model that changed since consent is set up again from its details, which show the new consent.
			actions: operation.pausedReason === 'consentChanged'
				? [{ id: 'review', label: localize('localModel.paused.review', "Review\u2026"), primary: true, commandId: LOCAL_MODEL_SHOW_DETAILS_COMMAND_ID, commandArgs: [family.familyId] }]
				: [{ id: 'resume', label: localize('localModel.paused.resume', "Resume"), primary: true, run: () => this._localModelService.resume(this._connection, operation.id) }],
		};
	}

	private _operationEnded(status: ILocalModelStatusV1, tracking: IOperationTracking): void {
		if (tracking.lastState === 'error') {
			return;
		}
		const family = status.families.find(candidate => candidate.familyId === tracking.familyId);
		const deviceCheck = tracking.lastPhase === undefined || tracking.lastPhase === 'resolving' || tracking.lastPhase === 'checkingDevice';
		if (tracking.kind === 'setup' && deviceCheck && (!family || (!family.install && !family.offer))) {
			// The device check found the device can't run it.
			const key = `insufficient:${tracking.operationId}`;
			this._outcomeNotices.set(key, {
				key,
				priority: LocalModelNoticePriority.Paused,
				severity: ChatInputNotificationSeverity.Info,
				message: localize('localModel.progress.deviceInsufficient', "This device doesn't have enough GPU memory for {0}.", tracking.displayName),
				announcementKey: key,
				telemetryId: 'localModel.deviceInsufficient',
				actions: [],
				onDismiss: () => this._outcomeNotices.delete(key),
			});
			return;
		}
		const message = getCompletedMessage(tracking.kind, family, status, tracking.displayName);
		if (message) {
			ariaStatus(message);
		}
	}

	private _handleDisconnect(): void {
		if (this._disconnected) {
			return;
		}
		this._disconnected = true;
		const interrupted = [...this._operations.values()].filter(tracking => tracking.lastState === 'running');
		this._operations.clear();
		this._knownUpdates = undefined;
		if (this._lifecycleService.willShutdown) {
			return;
		}
		for (const tracking of interrupted) {
			const key = `disconnected:${tracking.operationId}`;
			this._disconnectNotices.set(key, {
				key,
				priority: LocalModelNoticePriority.Paused,
				severity: ChatInputNotificationSeverity.Warning,
				message: localize('localModel.progress.disconnected', "Setting up {0} was interrupted because the agent host stopped.", tracking.displayName),
				announcementKey: key,
				telemetryId: 'localModel.disconnected',
				actions: [],
			});
		}
	}

	/** `operationId` is the failed operation's, or `undefined` for the active server. */
	private _errorNotice(key: string, family: ILocalModelFamilyV1 | undefined, error: ILocalModelErrorV1, operationId: string | undefined): ILocalModelNotice {
		return {
			key,
			priority: LocalModelNoticePriority.Error,
			severity: error.code === 'insufficientMemory' ? ChatInputNotificationSeverity.Info : ChatInputNotificationSeverity.Error,
			message: error.message || localize('localModel.error.generic', "Setting up {0} failed.", family?.displayName ?? ''),
			announcementKey: key,
			telemetryId: 'localModel.error',
			actions: this._errorActions(error, operationId),
		};
	}

	/** The remedies an error offers, the first one primary and last; the detail page has the rest. */
	private _errorActions(error: ILocalModelErrorV1, operationId: string | undefined): LocalModelNoticeAction[] {
		const remedies = error.actions.map((action): LocalModelNoticeAction => ({
			id: action,
			label: getLocalModelErrorActionLabel(action),
			run: () => runLocalModelErrorAction(action, operationId, { connection: this._connection, localModelService: this._localModelService, commandService: this._commandService, openerService: this._openerService }),
		}));
		const [primary, ...others] = remedies;
		return [
			...others,
			...(primary ? [{ ...primary, primary: true }] : []),
		];
	}

	private _messageIntervalMs(): number {
		return this._accessibilityService.isScreenReaderOptimized() ? DOWNLOAD_MESSAGE_INTERVAL_SCREEN_READER_MS : DOWNLOAD_MESSAGE_INTERVAL_MS;
	}

	/** Orders the states by priority and shows the most important one the user hasn't dismissed. */
	private _setNotices(notices: readonly ILocalModelNotice[]): void {
		this._notices = notices.map((notice, index) => ({ notice, index }))
			.sort((a, b) => b.notice.priority - a.notice.priority || a.index - b.index)
			.map(entry => entry.notice);
		const live = new Set(this._notices.map(notice => notice.key));
		for (const key of [...this._dismissed]) {
			if (!live.has(key)) {
				this._dismissed.delete(key);
			}
		}
		this._publish();
	}

	private _publish(): void {
		const notice = this._notices.find(candidate => !this._dismissed.has(candidate.key));
		if (!notice) {
			this._unpublish();
			return;
		}
		// An estimated load counts down on its own while it shows; nothing ticks while it is hidden or dismissed, or once the estimate ran out.
		const countdown = notice.countdown;
		if (!countdown) {
			this._ticker.clear();
		} else if (!this._ticker.value || this._countdown?.startedAt !== countdown.startedAt || this._countdown.expectedMs !== countdown.expectedMs) {
			this._countdown = countdown;
			this._ticker.value = new LocalModelLoadTicker(() => this._countdown, () => this._sync(this._enabled.get(), this._status.get()));
		}
		this._countdown = countdown;
		const handlers = new Map<string, () => unknown>();
		const actions = notice.actions.map((action): IChatInputNotificationAction => {
			const common = {
				kind: ChatInputNotificationActionKind.Command,
				label: action.label,
				primary: action.primary === true,
				// A secondary button, like the buttons of a notification toast; other actions read as text.
				filled: action.secondaryButton === true,
				disabled: action.disabled === true,
				// The notice follows the state; an action changes the state rather than closing it.
				keepOpen: true,
				telemetryActionId: `localModel.${action.id}`,
			} as const;
			if (action.run) {
				const id = `${this._actionPrefix}/${action.id}`;
				handlers.set(id, action.run);
				return { ...common, commandId: LOCAL_MODEL_NOTICE_ACTION_COMMAND_ID, commandArgs: [id] };
			}
			return { ...common, commandId: action.commandId, commandArgs: action.commandArgs };
		});
		const notification: IChatInputNotification = {
			id: LOCAL_MODEL_STATUS_NOTICE_ID,
			telemetryId: notice.telemetryId,
			severity: notice.severity,
			message: notice.message,
			ariaMessage: notice.ariaMessage,
			description: undefined,
			actions,
			progress: notice.progress,
			busy: notice.busy,
			announcementKey: notice.announcementKey,
			group: getLocalModelNoticeGroup(notice.priority),
			dismissible: true,
			onDismiss: () => this._dismiss(notice),
			autoDismissOnMessage: false,
			sessionTypes: [SessionType.AgentHostCopilot],
		};
		const signature = JSON.stringify([notice.key, notice.severity, notice.message, notice.ariaMessage, notice.progress ? notice.progress.percent ?? 'indeterminate' : undefined, notice.busy, notice.announcementKey, actions.map(action => [action.label, action.primary, action.filled, action.disabled, action.kind === ChatInputNotificationActionKind.Command ? [action.commandId, action.commandArgs] : undefined])]);
		// Publishing again would undo a dismissal and reorder the notice among others.
		if (signature === this._publishedSignature) {
			return;
		}
		this._publishedSignature = signature;
		this._publishedActions.value = toDisposable(() => {
			for (const id of handlers.keys()) {
				noticeActions.delete(id);
			}
		});
		for (const [id, run] of handlers) {
			noticeActions.set(id, run);
		}
		// Progress of the same state replaces the content only, so it never moves in front of newer notices.
		const inPlace = notice.key === this._publishedKey;
		this._publishedKey = notice.key;
		this._chatInputNotificationService.setNotification(notification, { inPlace });
	}

	private _unpublish(): void {
		this._ticker.clear();
		if (this._publishedSignature === undefined) {
			return;
		}
		this._publishedSignature = undefined;
		this._publishedKey = undefined;
		this._publishedActions.clear();
		this._chatInputNotificationService.deleteNotification(LOCAL_MODEL_STATUS_NOTICE_ID);
	}

	/** The user dismissed the notice: hide that state while it lasts and show the next one, if any. */
	private _dismiss(notice: ILocalModelNotice): void {
		this._dismissed.add(notice.key);
		notice.onDismiss?.();
		// The service keeps a dismissed notice hidden until it is published again.
		this._unpublish();
		this._setNotices([...this._notices]);
	}

	private _announceUpdates(status: ILocalModelStatusV1): void {
		const previous = this._knownUpdates;
		const current = new Map<string, string | undefined>();
		for (const family of status.families) {
			const update = family.install?.update;
			current.set(family.familyId, update?.contentId);
			if (previous && update && previous.get(family.familyId) !== update.contentId) {
				ariaStatus(localize('localModel.updateAvailable', "An update for {0} is available ({1}).", family.displayName, formatLocalModelBytes(update.downloadBytes)));
			}
		}
		this._knownUpdates = current;
	}
}
