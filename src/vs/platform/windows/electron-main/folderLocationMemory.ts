/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { IStateService } from '../../state/node/state.js';
import { IWindowFolderLocation } from '../../window/common/window.js';

/**
 * Remembers the alternate location each primary folder was last at, so that a fresh
 * open of the folder starts at it again. Nothing remembered here is trusted: the
 * window validates it on startup.
 */
export class FolderLocationMemory {

	private static readonly storageKey = 'folderLocations';

	/** Bounds the state: folders that are never returned to their primary location age out. */
	private static readonly maxEntries = 100;

	constructor(private readonly stateService: Pick<IStateService, 'getItem' | 'setItem'>) { }

	get(primary: URI): IWindowFolderLocation | undefined {
		const candidate = this.read()[extUriBiasedIgnorePathCase.getComparisonKey(primary)];
		return isWindowFolderLocation(candidate) ? candidate : undefined;
	}

	set(primary: URI, location: IWindowFolderLocation | undefined): void {
		const entries = this.read();
		const key = extUriBiasedIgnorePathCase.getComparisonKey(primary);
		if (!location && entries[key] === undefined) {
			return;
		}

		// Re-inserted last, so that the oldest entries are the first to age out
		delete entries[key];
		if (location) {
			entries[key] = location;
		}

		const keys = Object.keys(entries);
		for (const oldest of keys.slice(0, Math.max(0, keys.length - FolderLocationMemory.maxEntries))) {
			delete entries[oldest];
		}

		this.stateService.setItem(FolderLocationMemory.storageKey, entries);
	}

	private read(): Record<string, IWindowFolderLocation | undefined> {
		const entries = this.stateService.getItem<Record<string, IWindowFolderLocation | undefined>>(FolderLocationMemory.storageKey);
		return entries && typeof entries === 'object' ? { ...entries } : {};
	}
}

function isWindowFolderLocation(candidate: Partial<IWindowFolderLocation> | undefined): candidate is IWindowFolderLocation {
	return !!candidate && typeof candidate.uri === 'string' && typeof candidate.label === 'string' && typeof candidate.providerId === 'string';
}
