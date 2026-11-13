/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { Schemas } from '../../../base/common/network.js';
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

/** The outcome of validating the alternate location a window is about to be opened at. */
export interface IValidatedFolderLocation {
	readonly folderLocation?: IWindowFolderLocation;
	readonly folderLocationMissing?: { readonly label: string };
}

/** Whether a folder location is known to exist, known to be gone, or could not be determined. */
export type FolderLocationExistence = 'exists' | 'missing' | 'unknown';

/**
 * Only a definite answer counts as missing (not found, or not a directory). Other failures
 * such as permission or I/O errors are transient or unrelated to the folder being gone.
 */
export async function statFolderLocation(path: string, onUnknown?: (error: unknown) => void): Promise<FolderLocationExistence> {
	try {
		return (await fs.promises.stat(path)).isDirectory() ? 'exists' : 'missing';
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === 'ENOENT' || code === 'ENOTDIR') {
			return 'missing';
		}
		onUnknown?.(error);
		return 'unknown';
	}
}

/**
 * Decides, before the window is loaded, whether it can start at an alternate location:
 * only a local directory that is not known to be gone qualifies. If it is gone, the window opens
 * at the primary location, the remembered location is forgotten and the window is told, so that
 * it can inform the user. If its existence cannot be determined, the window opens at the location
 * and keeps it remembered; the window then offers to return if no provider confirms it.
 */
export async function validateStartupFolderLocation(primary: URI, candidate: IWindowFolderLocation | undefined, memory: Pick<FolderLocationMemory, 'set'>, existence: (path: string) => Promise<FolderLocationExistence>): Promise<IValidatedFolderLocation> {
	if (!candidate) {
		return {};
	}

	const location = URI.parse(candidate.uri);
	if (location.scheme === Schemas.file) {
		const state = await existence(location.fsPath);
		if (state !== 'missing') {
			return { folderLocation: candidate };
		}
	}

	memory.set(primary, undefined);
	return { folderLocationMissing: { label: candidate.label } };
}

function isWindowFolderLocation(candidate: Partial<IWindowFolderLocation> | undefined): candidate is IWindowFolderLocation {
	return !!candidate && typeof candidate.uri === 'string' && typeof candidate.label === 'string' && typeof candidate.providerId === 'string';
}
