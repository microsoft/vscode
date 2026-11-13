/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../files/common/files.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IStateService } from '../../state/node/state.js';
import { IWindowFolderLocation } from '../../window/common/window.js';

export const IFolderLocationsMainService = createDecorator<IFolderLocationsMainService>('folderLocationsMainService');

/** The outcome of validating the alternate location a window is about to be opened at. */
export interface IValidatedFolderLocation {
	readonly folderLocation?: IWindowFolderLocation;
	readonly folderLocationMissing?: { readonly label: string };
}

/**
 * Remembers the alternate location each workspace folder was last at, so that a fresh open
 * of the folder starts at it again, and validates a location before a window starts at it.
 * Every `workspace` parameter is the workspace's own location (`IWorkspace.uri`).
 */
export interface IFolderLocationsMainService {

	readonly _serviceBrand: undefined;

	/**
	 * The alternate location the workspace was last at. Nothing remembered is trusted:
	 * it is validated before a window starts at it.
	 */
	getFolderLocation(workspace: URI): IWindowFolderLocation | undefined;

	/** Remembers the alternate location of the workspace, or forgets it when `undefined`. */
	updateFolderLocation(workspace: URI, location: IWindowFolderLocation | undefined): void;

	/**
	 * Decides whether a window can start at the candidate location of the workspace: only a local
	 * directory that is not known to be gone qualifies. If it is gone, the window opens at the
	 * workspace's own location, the remembered location is forgotten and the result tells the
	 * window, so that it can inform the user. If its existence cannot be determined (for example
	 * because of a permission or I/O error), the location is kept and remembered; the window then
	 * offers to return if no provider confirms it.
	 */
	validateFolderLocation(workspace: URI, candidate: IWindowFolderLocation | undefined): Promise<IValidatedFolderLocation>;
}

export class FolderLocationsMainService implements IFolderLocationsMainService {

	declare readonly _serviceBrand: undefined;

	private static readonly storageKey = 'folderLocations';

	/** Bounds the state: folders that are never returned to their own location age out. */
	private static readonly maxEntries = 100;

	constructor(
		@IStateService private readonly stateService: IStateService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService
	) { }

	getFolderLocation(workspace: URI): IWindowFolderLocation | undefined {
		const candidate = this.read()[extUriBiasedIgnorePathCase.getComparisonKey(workspace)];
		return isWindowFolderLocation(candidate) ? candidate : undefined;
	}

	updateFolderLocation(workspace: URI, location: IWindowFolderLocation | undefined): void {
		const entries = this.read();
		const key = extUriBiasedIgnorePathCase.getComparisonKey(workspace);
		if (!location && entries[key] === undefined) {
			return;
		}

		// Re-inserted last, so that the oldest entries are the first to age out
		delete entries[key];
		if (location) {
			entries[key] = location;
		}

		const keys = Object.keys(entries);
		for (const oldest of keys.slice(0, Math.max(0, keys.length - FolderLocationsMainService.maxEntries))) {
			delete entries[oldest];
		}

		this.stateService.setItem(FolderLocationsMainService.storageKey, entries);
	}

	async validateFolderLocation(workspace: URI, candidate: IWindowFolderLocation | undefined): Promise<IValidatedFolderLocation> {
		if (!candidate) {
			return {};
		}

		const location = parseUri(candidate.uri);
		if (location?.scheme === Schemas.file && await this.exists(location) !== 'missing') {
			return { folderLocation: candidate };
		}

		this.updateFolderLocation(workspace, undefined);
		return { folderLocationMissing: { label: candidate.label } };
	}

	/**
	 * Only a definite answer counts as missing (not found, or not a directory). Other failures
	 * such as permission or I/O errors are transient or unrelated to the folder being gone.
	 */
	private async exists(location: URI): Promise<'exists' | 'missing' | 'unknown'> {
		try {
			return (await this.fileService.stat(location)).isDirectory ? 'exists' : 'missing';
		} catch (error) {
			const result = toFileOperationResult(error);
			if (result === FileOperationResult.FILE_NOT_FOUND || result === FileOperationResult.FILE_NOT_DIRECTORY) {
				return 'missing';
			}

			this.logService.warn(`Could not determine whether the folder location ${location.fsPath} exists`, error);
			return 'unknown';
		}
	}

	private read(): Record<string, IWindowFolderLocation | undefined> {
		const entries = this.stateService.getItem<Record<string, IWindowFolderLocation | undefined>>(FolderLocationsMainService.storageKey);
		return entries && typeof entries === 'object' ? { ...entries } : {};
	}
}

function isWindowFolderLocation(candidate: Partial<IWindowFolderLocation> | undefined): candidate is IWindowFolderLocation {
	return !!candidate && typeof candidate.uri === 'string' && !!parseUri(candidate.uri) && typeof candidate.label === 'string' && typeof candidate.providerId === 'string';
}

function parseUri(value: string): URI | undefined {
	try {
		return URI.parse(value);
	} catch {
		return undefined; // malformed remembered state is ignored
	}
}
