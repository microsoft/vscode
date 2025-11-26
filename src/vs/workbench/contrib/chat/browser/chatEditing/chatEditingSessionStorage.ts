/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { hashAsync } from '../../../../../base/common/hash.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { revive } from '../../../../../base/common/marshalling.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { Dto } from '../../../../services/extensions/common/proxyIdentifier.js';
import { IAttributedRangeDTO, IHunkTelemetryInfoDTO, IModifiedEntryTelemetryInfo, INotebookStructureAttributionDTO, ISnapshotEntry, ModifiedFileEntryState } from '../../common/chatEditingService.js';
import { getKeyForChatSessionResource, IChatEditingTimelineState } from './chatEditingOperations.js';

const STORAGE_CONTENTS_FOLDER = 'contents';
const STORAGE_STATE_FILE = 'state.json';
const GLOBAL_ENTRIES_STORAGE_FOLDER = 'globalEntries';
const GLOBAL_ENTRIES_STATE_FILE = 'entries.json';

/**
 * State for storing global modified file entries at the workspace level.
 */
export interface StoredGlobalEntriesState {
	readonly initialFileContents: ResourceMap<string>;
	readonly entries: ResourceMap<ISnapshotEntry>;
}

export interface StoredSessionState {
	readonly initialFileContents: ResourceMap<string>;
	readonly timeline: IChatEditingTimelineState | undefined;
}

export class ChatEditingSessionStorage {
	private readonly storageKey: string;
	constructor(
		_chatSessionResource: URI,
		@IFileService private readonly _fileService: IFileService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@ILogService private readonly _logService: ILogService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		this.storageKey = getKeyForChatSessionResource(_chatSessionResource);
	}

	protected _getStorageLocation(): URI {
		const workspaceId = this._workspaceContextService.getWorkspace().id;
		return joinPath(this._environmentService.workspaceStorageHome, workspaceId, 'chatEditingSessions', this.storageKey);
	}

	public async restoreState(): Promise<StoredSessionState | undefined> {
		const storageLocation = this._getStorageLocation();
		const fileContents = new Map<string, Promise<string>>();
		const getFileContent = (hash: string) => {
			let readPromise = fileContents.get(hash);
			if (!readPromise) {
				readPromise = this._fileService.readFile(joinPath(storageLocation, STORAGE_CONTENTS_FOLDER, hash)).then(content => content.value.toString());
				fileContents.set(hash, readPromise);
			}
			return readPromise;
		};
		try {
			const stateFilePath = joinPath(storageLocation, STORAGE_STATE_FILE);
			if (! await this._fileService.exists(stateFilePath)) {
				this._logService.debug(`chatEditingSession: No editing session state found at ${stateFilePath.toString()}`);
				return undefined;
			}
			this._logService.debug(`chatEditingSession: Restoring editing session at ${stateFilePath.toString()}`);
			const stateFileContent = await this._fileService.readFile(stateFilePath);
			const data = JSON.parse(stateFileContent.value.toString()) as IChatEditingSessionDTO;
			if (!COMPATIBLE_STORAGE_VERSIONS.includes(data.version)) {
				return undefined;
			}

			const initialFileContents = new ResourceMap<string>();
			for (const fileContentDTO of data.initialFileContents) {
				initialFileContents.set(URI.parse(fileContentDTO[0]), await getFileContent(fileContentDTO[1]));
			}

			return {
				initialFileContents,
				timeline: revive(data.timeline),
			};
		} catch (e) {
			this._logService.error(`Error restoring chat editing session from ${storageLocation.toString()}`, e);
		}
		return undefined;
	}

	public async storeState(state: StoredSessionState): Promise<void> {
		const storageFolder = this._getStorageLocation();
		const contentsFolder = URI.joinPath(storageFolder, STORAGE_CONTENTS_FOLDER);

		// prepare the content folder
		const existingContents = new Set<string>();
		try {
			const stat = await this._fileService.resolve(contentsFolder);
			stat.children?.forEach(child => {
				if (child.isFile) {
					existingContents.add(child.name);
				}
			});
		} catch (e) {
			try {
				// does not exist, create
				await this._fileService.createFolder(contentsFolder);
			} catch (e) {
				this._logService.error(`Error creating chat editing session content folder ${contentsFolder.toString()}`, e);
				return;
			}
		}

		const contentWritePromises = new Map<string, Promise<string>>();

		// saves a file content under a path containing a hash of the content.
		// Returns the hash to represent the content.
		const writeContent = async (content: string): Promise<string> => {
			const buffer = VSBuffer.fromString(content);
			const hash = (await hashAsync(buffer)).substring(0, 7);
			if (!existingContents.has(hash)) {
				await this._fileService.writeFile(joinPath(contentsFolder, hash), buffer);
			}
			return hash;
		};
		const addFileContent = async (content: string): Promise<string> => {
			let storedContentHash = contentWritePromises.get(content);
			if (!storedContentHash) {
				storedContentHash = writeContent(content);
				contentWritePromises.set(content, storedContentHash);
			}
			return storedContentHash;
		};
		const serializeResourceMap = async <T, U>(resourceMap: ResourceMap<T>, serialize: (value: T) => Promise<U>): Promise<ResourceMapDTO<U>> => {
			return await Promise.all(Array.from(resourceMap.entries()).map(async ([resourceURI, value]) => [resourceURI.toString(), await serialize(value)]));
		};

		try {
			const data: IChatEditingSessionDTO = {
				version: STORAGE_VERSION,
				initialFileContents: await serializeResourceMap(state.initialFileContents, value => addFileContent(value)),
				timeline: state.timeline,
			};

			this._logService.debug(`chatEditingSession: Storing editing session at ${storageFolder.toString()}: ${contentWritePromises.size} files`);

			await this._fileService.writeFile(joinPath(storageFolder, STORAGE_STATE_FILE), VSBuffer.fromString(JSON.stringify(data)));
		} catch (e) {
			this._logService.debug(`Error storing chat editing session to ${storageFolder.toString()}`, e);
		}
	}

	public async clearState(): Promise<void> {
		const storageFolder = this._getStorageLocation();
		if (await this._fileService.exists(storageFolder)) {
			this._logService.debug(`chatEditingSession: Clearing editing session at ${storageFolder.toString()}`);
			try {
				await this._fileService.del(storageFolder, { recursive: true });
			} catch (e) {
				this._logService.debug(`Error clearing chat editing session from ${storageFolder.toString()}`, e);
			}
		}
	}
}

/**
 * Storage for global modified file entries at the workspace level.
 * This stores entries that have pending changes (Modified state) across all sessions.
 */
export class ChatEditingEntriesStorage {
	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@ILogService private readonly _logService: ILogService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) { }

	private _getStorageLocation(): URI {
		const workspaceId = this._workspaceContextService.getWorkspace().id;
		return joinPath(this._environmentService.workspaceStorageHome, workspaceId, GLOBAL_ENTRIES_STORAGE_FOLDER);
	}

	public async restoreState(): Promise<StoredGlobalEntriesState | undefined> {
		const storageLocation = this._getStorageLocation();
		const fileContents = new Map<string, Promise<string>>();
		const getFileContent = (hash: string) => {
			let readPromise = fileContents.get(hash);
			if (!readPromise) {
				readPromise = this._fileService.readFile(joinPath(storageLocation, STORAGE_CONTENTS_FOLDER, hash)).then(content => content.value.toString());
				fileContents.set(hash, readPromise);
			}
			return readPromise;
		};
		const reviveAttributedRange = (dto: IAttributedRangeDTOSerialized): IAttributedRangeDTO => ({
			...dto,
			telemetryInfo: {
				...dto.telemetryInfo,
				sessionResource: URI.revive(dto.telemetryInfo.sessionResource),
			},
		});
		const reviveNotebookStructureAttribution = (dto: INotebookStructureAttributionDTOSerialized): INotebookStructureAttributionDTO => ({
			...dto,
			telemetryInfo: {
				...dto.telemetryInfo,
				sessionResource: URI.revive(dto.telemetryInfo.sessionResource),
			},
		});
		const deserializeSnapshotEntry = async (entry: ISnapshotEntryDTO): Promise<ISnapshotEntry> => ({
			resource: URI.parse(entry.resource),
			languageId: entry.languageId,
			original: await getFileContent(entry.originalHash),
			current: await getFileContent(entry.currentHash),
			state: entry.state,
			snapshotUri: URI.parse(entry.snapshotUri),
			attributedRanges: entry.attributedRanges?.map(reviveAttributedRange),
			notebookCellAttributions: entry.notebookCellAttributions
				? Object.fromEntries(
					Object.entries(entry.notebookCellAttributions).map(
						([cellId, ranges]) => [cellId, ranges.map(reviveAttributedRange)]
					)
				)
				: undefined,
			notebookStructureAttributions: entry.notebookStructureAttributions?.map(reviveNotebookStructureAttribution),
		});

		try {
			const stateFilePath = joinPath(storageLocation, GLOBAL_ENTRIES_STATE_FILE);
			if (!await this._fileService.exists(stateFilePath)) {
				this._logService.debug(`chatEditingService: No global entries state found at ${stateFilePath.toString()}`);
				return undefined;
			}
			this._logService.debug(`chatEditingService: Restoring global entries at ${stateFilePath.toString()}`);
			const stateFileContent = await this._fileService.readFile(stateFilePath);
			const data = JSON.parse(stateFileContent.value.toString()) as IGlobalEntriesDTO;
			if (!COMPATIBLE_GLOBAL_ENTRIES_VERSIONS.includes(data.version)) {
				return undefined;
			}

			const initialFileContents = new ResourceMap<string>();
			for (const fileContentDTO of data.initialFileContents) {
				initialFileContents.set(URI.parse(fileContentDTO[0]), await getFileContent(fileContentDTO[1]));
			}

			const entries = new ResourceMap<ISnapshotEntry>();
			for (const entryDTO of data.entries) {
				const entry = await deserializeSnapshotEntry(entryDTO);
				entries.set(entry.resource, entry);
			}

			return { initialFileContents, entries };
		} catch (e) {
			this._logService.error(`Error restoring global entries from ${storageLocation.toString()}`, e);
		}
		return undefined;
	}

	public async storeState(state: StoredGlobalEntriesState): Promise<void> {
		const storageFolder = this._getStorageLocation();
		const contentsFolder = URI.joinPath(storageFolder, STORAGE_CONTENTS_FOLDER);

		// Prepare the content folder
		const existingContents = new Set<string>();
		try {
			const stat = await this._fileService.resolve(contentsFolder);
			stat.children?.forEach(child => {
				if (child.isFile) {
					existingContents.add(child.name);
				}
			});
		} catch (e) {
			try {
				await this._fileService.createFolder(contentsFolder);
			} catch (e) {
				this._logService.error(`Error creating global entries content folder ${contentsFolder.toString()}`, e);
				return;
			}
		}

		const contentWritePromises = new Map<string, Promise<string>>();
		const writeContent = async (content: string): Promise<string> => {
			const buffer = VSBuffer.fromString(content);
			const hash = (await hashAsync(buffer)).substring(0, 7);
			if (!existingContents.has(hash)) {
				await this._fileService.writeFile(joinPath(contentsFolder, hash), buffer);
			}
			return hash;
		};
		const addFileContent = async (content: string): Promise<string> => {
			let storedContentHash = contentWritePromises.get(content);
			if (!storedContentHash) {
				storedContentHash = writeContent(content);
				contentWritePromises.set(content, storedContentHash);
			}
			return storedContentHash;
		};
		const serializeAttributedRange = (range: IAttributedRangeDTO): IAttributedRangeDTOSerialized => ({
			start: range.start,
			end: range.end,
			telemetryInfo: {
				agentId: range.telemetryInfo.agentId,
				command: range.telemetryInfo.command,
				requestId: range.telemetryInfo.requestId,
				result: range.telemetryInfo.result,
				sessionResource: range.telemetryInfo.sessionResource,
				modelId: range.telemetryInfo.modelId,
				modeId: range.telemetryInfo.modeId,
				applyCodeBlockSuggestionId: range.telemetryInfo.applyCodeBlockSuggestionId,
				feature: range.telemetryInfo.feature,
			},
			requestId: range.requestId,
			undoStopId: range.undoStopId,
			isUserEdit: range.isUserEdit,
		});
		const serializeNotebookStructureAttribution = (attr: INotebookStructureAttributionDTO): INotebookStructureAttributionDTOSerialized => ({
			editType: attr.editType,
			cellInternalId: attr.cellInternalId,
			telemetryInfo: {
				agentId: attr.telemetryInfo.agentId,
				command: attr.telemetryInfo.command,
				requestId: attr.telemetryInfo.requestId,
				result: attr.telemetryInfo.result,
				sessionResource: attr.telemetryInfo.sessionResource,
				modelId: attr.telemetryInfo.modelId,
				modeId: attr.telemetryInfo.modeId,
				applyCodeBlockSuggestionId: attr.telemetryInfo.applyCodeBlockSuggestionId,
				feature: attr.telemetryInfo.feature,
			},
			requestId: attr.requestId,
			undoStopId: attr.undoStopId,
		});
		const serializeSnapshotEntry = async (entry: ISnapshotEntry): Promise<ISnapshotEntryDTO> => ({
			resource: entry.resource.toString(),
			languageId: entry.languageId,
			originalHash: await addFileContent(entry.original),
			currentHash: await addFileContent(entry.current),
			state: entry.state,
			snapshotUri: entry.snapshotUri.toString(),
			hunkTelemetry: entry.hunkTelemetry,
			attributedRanges: entry.attributedRanges?.map(serializeAttributedRange),
			notebookCellAttributions: entry.notebookCellAttributions
				? Object.fromEntries(
					Object.entries(entry.notebookCellAttributions).map(
						([cellId, ranges]) => [cellId, ranges.map(serializeAttributedRange)]
					)
				)
				: undefined,
			notebookStructureAttributions: entry.notebookStructureAttributions?.map(serializeNotebookStructureAttribution),
		});

		try {
			const data: IGlobalEntriesDTO = {
				version: GLOBAL_ENTRIES_STORAGE_VERSION,
				initialFileContents: await Promise.all(
					Array.from(state.initialFileContents.entries()).map(
						async ([uri, content]) => [uri.toString(), await addFileContent(content)] as [string, string]
					)
				),
				entries: await Promise.all(Array.from(state.entries.values()).map(serializeSnapshotEntry)),
			};

			this._logService.debug(`chatEditingService: Storing global entries at ${storageFolder.toString()}: ${state.entries.size} entries`);

			await this._fileService.writeFile(joinPath(storageFolder, GLOBAL_ENTRIES_STATE_FILE), VSBuffer.fromString(JSON.stringify(data)));
		} catch (e) {
			this._logService.debug(`Error storing global entries to ${storageFolder.toString()}`, e);
		}
	}

	public async clearState(): Promise<void> {
		const storageFolder = this._getStorageLocation();
		if (await this._fileService.exists(storageFolder)) {
			this._logService.debug(`chatEditingService: Clearing global entries at ${storageFolder.toString()}`);
			try {
				await this._fileService.del(storageFolder, { recursive: true });
			} catch (e) {
				this._logService.debug(`Error clearing global entries from ${storageFolder.toString()}`, e);
			}
		}
	}
}

interface IGlobalEntriesDTO {
	readonly version: number;
	readonly initialFileContents: ResourceMapDTO<string>;
	readonly entries: ISnapshotEntryDTO[];
}

const COMPATIBLE_GLOBAL_ENTRIES_VERSIONS = [1];
const GLOBAL_ENTRIES_STORAGE_VERSION = 1;

export interface IChatEditingSessionSnapshot {
	/**
	 * Index of this session in the linear history. It's the sum of the lengths
	 * of all {@link stops} prior this one.
	 */
	readonly startIndex: number;

	readonly requestId: string | undefined;
	/**
	 * Edit stops in the request. Always initially populatd with stopId: undefind
	 * for th request's initial state.
	 *
	 * Invariant: never empty.
	 */
	readonly stops: IChatEditingSessionStop[];
}

export interface IChatEditingSessionStop {
	/** Edit stop ID, first for a request is always undefined. */
	stopId: string | undefined;

	readonly entries: ResourceMap<ISnapshotEntry>;
}

/**
 * Serialized version of IModifiedEntryTelemetryInfo where sessionResource is a UriComponents.
 * We use Dto<> which converts URI to UriComponents during JSON serialization.
 */
type IModifiedEntryTelemetryInfoSerialized = Dto<IModifiedEntryTelemetryInfo>;

/**
 * Serialized version of IAttributedRangeDTO for storage.
 */
type IAttributedRangeDTOSerialized = Omit<IAttributedRangeDTO, 'telemetryInfo'> & {
	readonly telemetryInfo: IModifiedEntryTelemetryInfoSerialized;
};

/**
 * Serialized version of INotebookStructureAttributionDTO for storage.
 */
type INotebookStructureAttributionDTOSerialized = Omit<INotebookStructureAttributionDTO, 'telemetryInfo'> & {
	readonly telemetryInfo: IModifiedEntryTelemetryInfoSerialized;
};

interface ISnapshotEntryDTO {
	readonly resource: string;
	readonly languageId: string;
	readonly originalHash: string;
	readonly currentHash: string;
	readonly state: ModifiedFileEntryState;
	readonly snapshotUri: string;
	readonly hunkTelemetry?: readonly IHunkTelemetryInfoDTO[];
	/** Fine-grained attribution for all edit regions */
	readonly attributedRanges?: readonly IAttributedRangeDTOSerialized[];
	/** For notebooks: attributions for cell content edits, keyed by cell internalId */
	readonly notebookCellAttributions?: { readonly [cellInternalId: string]: readonly IAttributedRangeDTOSerialized[] };
	/** For notebooks: attributions for structure edits (insert/delete/move cells) */
	readonly notebookStructureAttributions?: readonly INotebookStructureAttributionDTOSerialized[];
}

type ResourceMapDTO<T> = [string, T][];

const COMPATIBLE_STORAGE_VERSIONS = [1, 2, 3, 4];
const STORAGE_VERSION = 5;

/** Session storage for timeline and initial file contents. Entry snapshots are stored globally. */
interface IChatEditingSessionDTO {
	readonly version: number;
	readonly timeline: Dto<IChatEditingTimelineState> | undefined;
	readonly initialFileContents: ResourceMapDTO<string>;
}
