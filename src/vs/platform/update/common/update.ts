/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { localize } from '../../../nls.js';
import { upcast } from '../../../base/common/types.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export interface IUpdate {
	// Windows and Linux: 9a19815253d91900be5ec1016e0ecc7cc9a6950 (Commit Hash). Mac: 1.54.0 (Product Version)
	version: string;
	productVersion?: string;
	timestamp?: number;
	url?: string;
	sha256hash?: string;
}

/**
 * Updates are run as a state machine:
 *
 *      Uninitialized
 *           ↓
 *          Idle
 *          ↓  ↑
 *   Checking for Updates  →  Available for Download
 *         ↓
 *     Downloading  →   Ready
 *         ↓               ↑
 *     Downloaded   →  Updating
 *
 * Available: There is an update available for download (linux).
 * Ready: Code will be updated as soon as it restarts (win32, darwin).
 * Downloaded: There is an update ready to be installed in the background (win32).
 */

export const enum StateType {
	Uninitialized = 'uninitialized',
	Idle = 'idle',
	Disabled = 'disabled',
	CheckingForUpdates = 'checking for updates',
	AvailableForDownload = 'available for download',
	Downloading = 'downloading',
	Downloaded = 'downloaded',
	Updating = 'updating',
	Ready = 'ready',
}

export const enum UpdateType {
	Setup,
	Archive,
	Snap
}

export const enum DisablementReason {
	NotBuilt,
	DisabledByEnvironment,
	ManuallyDisabled,
	MissingConfiguration,
	InvalidConfiguration,
	RunningAsAdmin,
}

export type Uninitialized = { type: StateType.Uninitialized };
export type Disabled = { type: StateType.Disabled; reason: DisablementReason };
export type Idle = { type: StateType.Idle; updateType: UpdateType; error?: string };
export type CheckingForUpdates = { type: StateType.CheckingForUpdates; explicit: boolean };
export type AvailableForDownload = { type: StateType.AvailableForDownload; update: IUpdate };
export type Downloading = { type: StateType.Downloading; downloadedBytes?: number; totalBytes?: number; startTime?: number };
export type Downloaded = { type: StateType.Downloaded; update: IUpdate };
export type Updating = { type: StateType.Updating; update: IUpdate };
export type Ready = { type: StateType.Ready; update: IUpdate };

export type State = Uninitialized | Disabled | Idle | CheckingForUpdates | AvailableForDownload | Downloading | Downloaded | Updating | Ready;

export const State = {
	Uninitialized: upcast<Uninitialized>({ type: StateType.Uninitialized }),
	Disabled: (reason: DisablementReason): Disabled => ({ type: StateType.Disabled, reason }),
	Idle: (updateType: UpdateType, error?: string): Idle => ({ type: StateType.Idle, updateType, error }),
	CheckingForUpdates: (explicit: boolean): CheckingForUpdates => ({ type: StateType.CheckingForUpdates, explicit }),
	AvailableForDownload: (update: IUpdate): AvailableForDownload => ({ type: StateType.AvailableForDownload, update }),
	Downloading: (downloadedBytes?: number, totalBytes?: number, startTime?: number): Downloading => ({ type: StateType.Downloading, downloadedBytes, totalBytes, startTime }),
	Downloaded: (update: IUpdate): Downloaded => ({ type: StateType.Downloaded, update }),
	Updating: (update: IUpdate): Updating => ({ type: StateType.Updating, update }),
	Ready: (update: IUpdate): Ready => ({ type: StateType.Ready, update }),
};

export interface IAutoUpdater extends Event.NodeEventEmitter {
	setFeedURL(url: string): void;
	checkForUpdates(): void;
	applyUpdate?(): Promise<void>;
	quitAndInstall(): void;
}

export const IUpdateService = createDecorator<IUpdateService>('updateService');

export interface IUpdateService {
	readonly _serviceBrand: undefined;

	readonly onStateChange: Event<State>;
	readonly state: State;

	checkForUpdates(explicit: boolean): Promise<void>;
	downloadUpdate(): Promise<void>;
	applyUpdate(): Promise<void>;
	quitAndInstall(): Promise<void>;

	isLatestVersion(): Promise<boolean | undefined>;
	_applySpecificUpdate(packagePath: string): Promise<void>;
}

/**
 * Computes an estimate of remaining download time in seconds.
 * Returns undefined if not enough data is available.
 *
 * @param state The download state containing progress information.
 */
export function computeDownloadTimeRemaining(state: Downloading): number | undefined {
	const { downloadedBytes, totalBytes, startTime } = state;
	if (downloadedBytes === undefined || totalBytes === undefined || startTime === undefined) {
		return undefined;
	}

	const elapsedMs = Date.now() - startTime;
	if (downloadedBytes <= 0 || totalBytes <= 0 || elapsedMs <= 0) {
		return undefined;
	}

	const remainingBytes = totalBytes - downloadedBytes;
	if (remainingBytes <= 0) {
		return 0;
	}

	const bytesPerMs = downloadedBytes / elapsedMs;
	if (bytesPerMs <= 0) {
		return undefined;
	}

	const remainingMs = remainingBytes / bytesPerMs;
	return Math.ceil(remainingMs / 1000);
}

/**
 * Formats the download progress label with time remaining if available.
 *
 * @param state The download state containing progress information.
 * @returns A localized string like "Downloading Update (10s remaining)..." or "Downloading Update..."
 */
export function formatDownloadingUpdateLabel(state: Downloading): string {
	const timeRemaining = computeDownloadTimeRemaining(state);
	return timeRemaining !== undefined && timeRemaining > 0
		? localize('downloadingUpdateWithProgress', "Downloading Update ({0}s remaining)...", timeRemaining)
		: localize('downloadingUpdate', "Downloading Update...");
}
