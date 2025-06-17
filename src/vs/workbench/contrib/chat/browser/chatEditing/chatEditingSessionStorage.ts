/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { StringSHA1 } from '../../../../../base/common/hash.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { WorkingSetDisplayMetadata, ModifiedFileEntryState, ISnapshotEntry } from '../../common/chatEditingService.js';

const STORAGE_CONTENTS_FOLDER = 'contents';
const STORAGE_STATE_FILE = 'state.json';

export interface StoredSessionState {
	readonly initialFileContents: ResourceMap<string>;
	readonly pendingSnapshot?: IChatEditingSessionStop;
	readonly recentSnapshot: IChatEditingSessionStop;
	readonly linearHistoryIndex: number;
	readonly linearHistory: readonly IChatEditingSessionSnapshot[];
}

export class ChatEditingSessionStorage {
	constructor(
		private readonly chatSessionId: string,
		@IFileService private readonly _fileService: IFileService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@ILogService private readonly _logService: ILogService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) { }

	protected _getStorageLocation(): URI {
		const workspaceId = this._workspaceContextService.getWorkspace().id;
		return joinPath(this._environmentService.workspaceStorageHome, workspaceId, 'chatEditingSessions', this.chatSessionId);
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
		const deserializeSnapshotEntriesDTO = async (dtoEntries: ISnapshotEntryDTO[]): Promise<ResourceMap<ISnapshotEntry>> => {
			const entries = new ResourceMap<ISnapshotEntry>();
			for (const entryDTO of dtoEntries) {
				const entry = await deserializeSnapshotEntry(entryDTO);
				entries.set(entry.resource, entry);
			}
			return entries;
		};
		const deserializeChatEditingStopDTO = async (stopDTO: IChatEditingSessionStopDTO | IChatEditingSessionSnapshotDTO): Promise<IChatEditingSessionStop> => {
			const entries = await deserializeSnapshotEntriesDTO(stopDTO.entries);
			return { stopId: 'stopId' in stopDTO ? stopDTO.stopId : undefined, entries };
		};
		const normalizeSnapshotDtos = (snapshot: IChatEditingSessionSnapshotDTO | IChatEditingSessionSnapshotDTO2): IChatEditingSessionSnapshotDTO2 => {
			if ('stops' in snapshot) {
				return snapshot;
			}
			return { requestId: snapshot.requestId, stops: [{ stopId: undefined, entries: snapshot.entries }], postEdit: undefined };
		};
		const deserializeChatEditingSessionSnapshot = async (startIndex: number, snapshot: IChatEditingSessionSnapshotDTO2): Promise<IChatEditingSessionSnapshot> => {
			const stops = await Promise.all(snapshot.stops.map(deserializeChatEditingStopDTO));
			return { startIndex, requestId: snapshot.requestId, stops, postEdit: snapshot.postEdit && await deserializeSnapshotEntriesDTO(snapshot.postEdit) };
		};
		const deserializeSnapshotEntry = async (entry: ISnapshotEntryDTO) => {
			return {
				resource: URI.parse(entry.resource),
				languageId: entry.languageId,
				original: await getFileContent(entry.originalHash),
				current: await getFileContent(entry.currentHash),
				state: entry.state,
				snapshotUri: URI.parse(entry.snapshotUri),
				telemetryInfo: { requestId: entry.telemetryInfo.requestId, agentId: entry.telemetryInfo.agentId, command: entry.telemetryInfo.command, sessionId: this.chatSessionId, result: undefined }
			} satisfies ISnapshotEntry;
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

			let linearHistoryIndex = 0;
			const linearHistory = await Promise.all(data.linearHistory.map(snapshot => {
				const norm = normalizeSnapshotDtos(snapshot);
				const result = deserializeChatEditingSessionSnapshot(linearHistoryIndex, norm);
				linearHistoryIndex += norm.stops.length;
				return result;
			}));

			const initialFileContents = new ResourceMap<string>();
			for (const fileContentDTO of data.initialFileContents) {
				initialFileContents.set(URI.parse(fileContentDTO[0]), await getFileContent(fileContentDTO[1]));
			}
			const pendingSnapshot = data.pendingSnapshot ? await deserializeChatEditingStopDTO(data.pendingSnapshot) : undefined;
			const recentSnapshot = await deserializeChatEditingStopDTO(data.recentSnapshot);

			return {
				initialFileContents,
				pendingSnapshot,
				recentSnapshot,
				linearHistoryIndex: data.linearHistoryIndex,
				linearHistory
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

		const fileContents = new Map<string, string>();
		const addFileContent = (content: string): string => {
			const shaComputer = new StringSHA1();
			shaComputer.update(content);
			const sha = shaComputer.digest().substring(0, 7);
			fileContents.set(sha, content);
			return sha;
		};
		const serializeResourceMap = <T>(resourceMap: ResourceMap<T>, serialize: (value: T) => any): ResourceMapDTO<T> => {
			return Array.from(resourceMap.entries()).map(([resourceURI, value]) => [resourceURI.toString(), serialize(value)]);
		};
		const serializeChatEditingSessionStop = (stop: IChatEditingSessionStop): IChatEditingSessionStopDTO => {
			return {
				stopId: stop.stopId,
				entries: Array.from(stop.entries.values()).map(serializeSnapshotEntry)
			};
		};
		const serializeChatEditingSessionSnapshot = (snapshot: IChatEditingSessionSnapshot): IChatEditingSessionSnapshotDTO2 => {
			return {
				requestId: snapshot.requestId,
				stops: snapshot.stops.map(serializeChatEditingSessionStop),
				postEdit: snapshot.postEdit ? Array.from(snapshot.postEdit.values()).map(serializeSnapshotEntry) : undefined
			};
		};
		const serializeSnapshotEntry = (entry: ISnapshotEntry): ISnapshotEntryDTO => {
			return {
				resource: entry.resource.toString(),
				languageId: entry.languageId,
				originalHash: addFileContent(entry.original),
				currentHash: addFileContent(entry.current),
				state: entry.state,
				snapshotUri: entry.snapshotUri.toString(),
				telemetryInfo: { requestId: entry.telemetryInfo.requestId, agentId: entry.telemetryInfo.agentId, command: entry.telemetryInfo.command }
			};
		};

		try {
			const data: IChatEditingSessionDTO = {
				version: STORAGE_VERSION,
				sessionId: this.chatSessionId,
				linearHistory: state.linearHistory.map(serializeChatEditingSessionSnapshot),
				linearHistoryIndex: state.linearHistoryIndex,
				initialFileContents: serializeResourceMap(state.initialFileContents, value => addFileContent(value)),
				pendingSnapshot: state.pendingSnapshot ? serializeChatEditingSessionStop(state.pendingSnapshot) : undefined,
				recentSnapshot: serializeChatEditingSessionStop(state.recentSnapshot),
			};

			this._logService.debug(`chatEditingSession: Storing editing session at ${storageFolder.toString()}: ${fileContents.size} files`);

			for (const [hash, content] of fileContents) {
				if (!existingContents.has(hash)) {
					await this._fileService.writeFile(joinPath(contentsFolder, hash), VSBuffer.fromString(content));
				}
			}

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

	/** Stop that represents changes after the last undo stop, kept for diffing purposes. */
	readonly postEdit: ResourceMap<ISnapshotEntry> | undefined;
}

export interface IChatEditingSessionStop {
	/** Edit stop ID, first for a request is always undefined. */
	stopId: string | undefined;

	readonly entries: ResourceMap<ISnapshotEntry>;
}

interface IChatEditingSessionStopDTO {
	readonly stopId: string | undefined;
	readonly entries: ISnapshotEntryDTO[];
}


interface IChatEditingSessionSnapshotDTO {
	readonly requestId: string | undefined;
	readonly workingSet: ResourceMapDTO<WorkingSetDisplayMetadata>;
	readonly entries: ISnapshotEntryDTO[];
}

interface IChatEditingSessionSnapshotDTO2 {
	readonly requestId: string | undefined;
	readonly stops: IChatEditingSessionStopDTO[];
	readonly postEdit: ISnapshotEntryDTO[] | undefined;
}

interface ISnapshotEntryDTO {
	readonly resource: string;
	readonly languageId: string;
	readonly originalHash: string;
	readonly currentHash: string;
	readonly state: ModifiedFileEntryState;
	readonly snapshotUri: string;
	readonly telemetryInfo: IModifiedEntryTelemetryInfoDTO;
}

interface IModifiedEntryTelemetryInfoDTO {
	readonly requestId: string;
	readonly agentId?: string;
	readonly command?: string;
}

type ResourceMapDTO<T> = [string, T][];

const COMPATIBLE_STORAGE_VERSIONS = [1, 2];
const STORAGE_VERSION = 2;

/** Old history uses IChatEditingSessionSnapshotDTO, new history uses IChatEditingSessionSnapshotDTO. */
interface IChatEditingSessionDTO {
	readonly version: number;
	readonly sessionId: string;
	readonly recentSnapshot: (IChatEditingSessionStopDTO | IChatEditingSessionSnapshotDTO);
	readonly linearHistory: (IChatEditingSessionSnapshotDTO2 | IChatEditingSessionSnapshotDTO)[];
	readonly linearHistoryIndex: number;
	readonly pendingSnapshot: (IChatEditingSessionStopDTO | IChatEditingSessionSnapshotDTO) | undefined;
	readonly initialFileContents: ResourceMapDTO<string>;
}
