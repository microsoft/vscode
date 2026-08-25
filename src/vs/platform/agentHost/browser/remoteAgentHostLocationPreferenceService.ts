/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';
import { IRemoteAgentHostLocationPreferenceService, isRemoteAgentHostLocationPreference, RemoteAgentHostLocationPreference } from '../common/remoteAgentHostLocationPreference.js';

/** Storage key for the JSON map of per-host remote agent run location preferences. */
export const REMOTE_AGENT_HOST_LOCATION_PREFERENCE_STORAGE_KEY = 'remoteAgentHost.locationPreferences';

/**
 * Parse the persisted preference map. Any entry with a non-string key or an
 * unrecognized preference value is dropped rather than discarding the whole
 * map, so one bad entry never destroys the rest of the user's preferences.
 */
export function parseRemoteAgentHostLocationPreferences(raw: string | undefined): Map<string, RemoteAgentHostLocationPreference> {
	const preferences = new Map<string, RemoteAgentHostLocationPreference>();
	if (!raw) {
		return preferences;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return preferences;
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		return preferences;
	}

	for (const [hostKey, value] of Object.entries(parsed as Record<string, unknown>)) {
		if (hostKey && isRemoteAgentHostLocationPreference(value)) {
			preferences.set(hostKey, value);
		}
	}
	return preferences;
}

export class RemoteAgentHostLocationPreferenceService extends Disposable implements IRemoteAgentHostLocationPreferenceService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangePreference = this._register(new Emitter<string>());
	readonly onDidChangePreference: Event<string> = this._onDidChangePreference.event;

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
	}

	getPreference(hostKey: string): RemoteAgentHostLocationPreference | undefined {
		return this._readPreferences().get(hostKey);
	}

	setPreference(hostKey: string, preference: RemoteAgentHostLocationPreference): void {
		const preferences = this._readPreferences();
		preferences.set(hostKey, preference);
		this._writePreferences(preferences);
		this._onDidChangePreference.fire(hostKey);
	}

	private _readPreferences(): Map<string, RemoteAgentHostLocationPreference> {
		return parseRemoteAgentHostLocationPreferences(this._storageService.get(REMOTE_AGENT_HOST_LOCATION_PREFERENCE_STORAGE_KEY, StorageScope.APPLICATION));
	}

	private _writePreferences(preferences: Map<string, RemoteAgentHostLocationPreference>): void {
		if (preferences.size === 0) {
			this._storageService.remove(REMOTE_AGENT_HOST_LOCATION_PREFERENCE_STORAGE_KEY, StorageScope.APPLICATION);
			return;
		}
		this._storageService.store(
			REMOTE_AGENT_HOST_LOCATION_PREFERENCE_STORAGE_KEY,
			JSON.stringify(Object.fromEntries(preferences)),
			StorageScope.APPLICATION,
			StorageTarget.USER,
		);
	}
}
