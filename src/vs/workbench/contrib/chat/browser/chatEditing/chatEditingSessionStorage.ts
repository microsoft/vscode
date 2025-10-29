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
import { EditSuggestionId } from '../../../../../editor/common/textModelEditSource.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { Dto } from '../../../../services/extensions/common/proxyIdentifier.js';
import { ISnapshotEntry, ModifiedFileEntryState, WorkingSetDisplayMetadata } from '../../common/chatEditingService.js';
import { IChatEditingTimelineState } from './chatEditingOperations.js';

const STORAGE_CONTENTS_FOLDER = 'contents';
const STORAGE_STATE_FILE = 'state.json';

export interface StoredSessionState {
	readonly initialFileContents: ResourceMap<string>;
	readonly recentSnapshot: IChatEditingSessionStop;
	readonly timeline: IChatEditingTimelineState | undefined;
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
		const deserializeSnapshotEntry = async (entry: ISnapshotEntryDTO) => {
			return {
				resource: URI.parse(entry.resource),
				languageId: entry.languageId,
				original: await getFileContent(entry.originalHash),
				current: await getFileContent(entry.currentHash),
				state: entry.state,
				snapshotUri: URI.parse(entry.snapshotUri),
				telemetryInfo: {
					requestId: entry.telemetryInfo.requestId,
					agentId: entry.telemetryInfo.agentId,
					command: entry.telemetryInfo.command,
					sessionId: this.chatSessionId,
					result: undefined,
					modelId: entry.telemetryInfo.modelId,
					modeId: entry.telemetryInfo.modeId,
					applyCodeBlockSuggestionId: entry.telemetryInfo.applyCodeBlockSuggestionId,
					feature: entry.telemetryInfo.feature,
				}
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

			const initialFileContents = new ResourceMap<string>();
			for (const fileContentDTO of data.initialFileContents) {
				initialFileContents.set(URI.parse(fileContentDTO[0]), await getFileContent(fileContentDTO[1]));
			}
			const recentSnapshot = await deserializeChatEditingStopDTO(data.recentSnapshot);

			return {
				initialFileContents,
				recentSnapshot,
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
		const serializeChatEditingSessionStop = async (stop: IChatEditingSessionStop): Promise<IChatEditingSessionStopDTO> => {
			return {
				stopId: stop.stopId,
				entries: await Promise.all(Array.from(stop.entries.values()).map(serializeSnapshotEntry))
			};
		};
		const serializeSnapshotEntry = async (entry: ISnapshotEntry): Promise<ISnapshotEntryDTO> => {
			return {
				resource: entry.resource.toString(),
				languageId: entry.languageId,
				originalHash: await addFileContent(entry.original),
				currentHash: await addFileContent(entry.current),
				state: entry.state,
				snapshotUri: entry.snapshotUri.toString(),
				telemetryInfo: { requestId: entry.telemetryInfo.requestId, agentId: entry.telemetryInfo.agentId, command: entry.telemetryInfo.command, modelId: entry.telemetryInfo.modelId, modeId: entry.telemetryInfo.modeId }
			};
		};

		try {
			const data: IChatEditingSessionDTO = {
				version: STORAGE_VERSION,
				sessionId: this.chatSessionId,
				initialFileContents: await serializeResourceMap(state.initialFileContents, value => addFileContent(value)),
				timeline: state.timeline,
				recentSnapshot: await serializeChatEditingSessionStop(state.recentSnapshot),
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

interface IChatEditingSessionStopDTO {
	readonly stopId: string | undefined;
	readonly entries: ISnapshotEntryDTO[];
}


interface IChatEditingSessionSnapshotDTO {
	readonly requestId: string | undefined;
	readonly workingSet: ResourceMapDTO<WorkingSetDisplayMetadata>;
	readonly entries: ISnapshotEntryDTO[];
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

	readonly modelId?: string;
	readonly modeId?: 'ask' | 'edit' | 'agent' | 'custom' | 'applyCodeBlock' | undefined;
	readonly applyCodeBlockSuggestionId?: EditSuggestionId | undefined;
	readonly feature?: 'sideBarChat' | 'inlineChat' | undefined;
}

type ResourceMapDTO<T> = [string, T][];

const COMPATIBLE_STORAGE_VERSIONS = [1, 2];
const STORAGE_VERSION = 2;

/** Old history uses IChatEditingSessionSnapshotDTO, new history uses IChatEditingSessionSnapshotDTO. */
interface IChatEditingSessionDTO {
	readonly version: number;
	readonly sessionId: string;
	readonly recentSnapshot: (IChatEditingSessionStopDTO | IChatEditingSessionSnapshotDTO);
	readonly timeline: Dto<IChatEditingTimelineState> | undefined;
	readonly initialFileContents: ResourceMapDTO<string>;
}
