/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import type { Uri } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { VSBuffer } from '../../../util/vs/base/common/buffer';
import { URI } from '../../../util/vs/base/common/uri';
import { ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { IVSCodeExtensionContext } from '../../extContext/common/extensionContext';
import { IFileSystemService } from '../../filesystem/common/fileSystemService';
import { ILogService } from '../../log/common/logService';

export const IEditLogService = createServiceIdentifier<IEditLogService>('IEditLogService');
export interface IEditLogService {
	_serviceBrand: undefined;

	/**
	 * Logs a chat request made during an edit session.
	 * @param turnId - The unique identifier for the turn.
	 * @param prompt - The chat messages that were part of the request.
	 * @param response - The response generated for the chat request.
	 */
	logEditChatRequest(turnId: string, prompt: ReadonlyArray<Raw.ChatMessage>, response: string): void;

	/**
	 * Logs a speculation request made during an edit session.
	 * @param turnId - The unique identifier for the turn.
	 * @param uri - The URI of the file being edited.
	 * @param prompt - The prompt provided for the speculation request.
	 * @param originalContent - The original content of the file before the edit.
	 * @param editedContent - The content of the file after the edit.
	 */
	logSpeculationRequest(turnId: string, uri: Uri, prompt: string, originalContent: string, editedContent: string): void;

	/**
	 * Marks a turn as completed with the given outcome.
	 * @param turnId - The unique identifier for the turn.
	 * @param outcome - The outcome of the turn, either 'success' or 'error'.
	 * @returns A promise that resolves when the operation is complete.
	 */
	markCompleted(turnId: string, outcome: 'success' | 'error'): Promise<void>;

	/**
	 * Retrieves the edit log for a given turn.
	 * @param turnId - The unique identifier for the turn.
	 * @returns A promise that resolves to the edit log entries, or undefined if not found.
	 */
	getEditLog(turnId: string): Promise<{ prompt: string; response: string }[] | undefined>;
}

interface IEditLogEntry {
	prompt: ReadonlyArray<Raw.ChatMessage>;
	response: string;
	edits: {
		uri: string;
		prompt: string;
		originalContent: string;
		editedContent: string;
	}[];
}

export class EditLogService implements IEditLogService {
	declare readonly _serviceBrand: undefined;

	public readonly LOG_DIR = URI.joinPath(this._vscodeExtensionContext.globalStorageUri, 'editRecordings');

	private readonly _edits = new Map<string, IEditLogEntry>();

	constructor(
		@IVSCodeExtensionContext private readonly _vscodeExtensionContext: IVSCodeExtensionContext,
		@IFileSystemService private readonly _fileSystemService: IFileSystemService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) { }

	private _isEnabled() {
		return this._configurationService.getConfig(ConfigKey.Advanced.EditRecordingEnabled);
	}

	logEditChatRequest(turnId: string, prompt: ReadonlyArray<Raw.ChatMessage>, response: string): void {
		if (!this._isEnabled()) { return; }

		const entry: IEditLogEntry = this._edits.get(turnId) ?? { prompt, response, edits: [] };
		entry.prompt = prompt;
		entry.response = response;
		this._edits.set(turnId, entry);
	}

	logSpeculationRequest(turnId: string, uri: Uri, prompt: string, originalContent: string, editedContent: string): void {
		if (!this._isEnabled()) { return; }

		const entry: IEditLogEntry = this._edits.get(turnId) ?? { prompt: [], response: '', edits: [] };
		entry.edits.push({
			uri: uri.toString(),
			prompt,
			originalContent,
			editedContent,
		});
		this._edits.set(turnId, entry);
	}

	async getEditLog(turnId: string): Promise<{ prompt: string; response: string }[] | undefined> {
		if (!this._isEnabled()) { return; }
		try {
			const data = await this._fileSystemService.readFile(URI.joinPath(this.LOG_DIR, `${turnId}.json`));
			const log = JSON.parse(data.toString()) as IEditLogEntry;
			return log.edits.map((edit) => ({ prompt: edit.prompt, response: edit.editedContent }));
		} catch { }
	}

	async markCompleted(turnId: string, outcome: 'success' | 'error') {
		if (!this._isEnabled()) { return; }

		const edit = this._edits.get(turnId);
		if (!edit) {
			// No edit happened in this turn
			return;
		}
		if (edit.edits.length) {
			const path = URI.joinPath(this.LOG_DIR, `${turnId}.json`);
			this._logService.debug(`Edit recording: ${path.toString()}`);
			await this._fileSystemService.writeFile(path, VSBuffer.fromString(JSON.stringify(edit, undefined, 4)).buffer);
		}
		this._edits.delete(turnId);
	}
}
