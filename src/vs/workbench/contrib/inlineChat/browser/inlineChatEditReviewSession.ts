/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IObservable, IReader, ITransaction, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { IChatExternalEdit } from '../../chat/common/chatService/chatService.js';
import { ChatEditKind, IChatEditReviewSession, IModifiedEntryTelemetryInfo, IModifiedFileEntry } from '../../chat/common/editing/chatEditingService.js';
import { IChatResponseModel } from '../../chat/common/model/chatModel.js';
import { ChatEditingModifiedDocumentEntry } from '../../chat/browser/chatEditing/chatEditingModifiedDocumentEntry.js';

/**
 * Provides inline-chat review UI for changes an agent host writes directly to disk.
 */
export class InlineChatEditReviewSession extends Disposable implements IChatEditReviewSession {

	readonly isGlobalEditingSession = false;

	private readonly _entriesObs = observableValue<readonly IModifiedFileEntry[]>(this, []);
	readonly entries: IObservable<readonly IModifiedFileEntry[]> = this._entriesObs;

	private readonly _entries = new ResourceMap<ChatEditingModifiedDocumentEntry>();
	private readonly _initialContents = new ResourceMap<string>();
	private readonly _readonlyLocks = new ResourceMap<true>();
	private readonly _externalEditListener = this._register(new MutableDisposable<IDisposable>());
	private readonly _externalEditEntriesInFlight = new ResourceMap<Promise<void>>();
	private readonly _onDidDispose = this._register(new Emitter<void>());
	readonly onDidDispose = this._onDidDispose.event;

	private _requestId: string | undefined;

	constructor(
		readonly chatSessionResource: URI,
		private readonly _targetUri: URI,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IFilesConfigurationService private readonly _filesConfigurationService: IFilesConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();
	}

	/**
	 * Saves the target document, creates its review entry, and locks it read-only for the turn.
	 */
	async beginTurn(response: IChatResponseModel): Promise<void> {
		this._requestId = response.requestId;
		this._externalEditListener.clear();

		try {
			if (this._textFileService.isDirty(this._targetUri)) {
				// A cancelled save leaves the buffer dirty. Proceeding would let the agent
				// write to disk and `endTurn`'s revert would then discard the user's unsaved
				// changes, so treat it as a cancelled turn instead.
				const saved = await this._textFileService.save(this._targetUri);
				if (this._store.isDisposed) {
					return;
				}
				if (!saved) {
					throw new CancellationError();
				}
			}

			this._readonlyLocks.set(this._targetUri, true);
			await this._filesConfigurationService.updateReadonly(this._targetUri, this._getReadonlyMessage());
			if (this._store.isDisposed) {
				return;
			}

			let initialContent: string;
			if (!this._entries.has(this._targetUri)) {
				initialContent = await this._readCurrentContent(this._targetUri);
				if (this._store.isDisposed) {
					return;
				}
				this._initialContents.set(this._targetUri, initialContent);
			} else {
				initialContent = this._initialContents.get(this._targetUri) ?? '';
			}

			const entry = await this._getOrCreateEntry(this._targetUri, this._getTelemetryInfo(response), initialContent);
			if (this._store.isDisposed || !entry) {
				return;
			}
			// Keep carried-over entries in external-edit mode before agent disk writes arrive.
			for (const tracked of this._entries.values()) {
				tracked.startExternalEdit();
			}
			this._externalEditListener.value = response.onDidChange(() => {
				void this._processExternalEdits(response);
			});
			void this._processExternalEdits(response);
		} catch (error) {
			this._logService.error(`Failed to prepare inline chat review for ${this._targetUri}`, error);
			await this._resetReadonlyLocks();
			throw error;
		}
	}

	/**
	 * Reverts models from disk, finalizes external edits, and unlocks the target.
	 */
	async endTurn(response: IChatResponseModel): Promise<void> {
		this._externalEditListener.clear();
		try {
			await this._processExternalEdits(response);
			if (this._store.isDisposed) {
				return;
			}
		} finally {
			if (!this._store.isDisposed) {
				for (const entry of this._entries.values()) {
					try {
						await entry.revertToDisk();
					} catch (error) {
						this._logService.error(`Failed to reload inline chat review entry from disk for ${entry.modifiedURI}`, error);
					}
				}

				for (const entry of this._entries.values()) {
					entry.stopExternalEdit();
				}
			}
			await this._resetReadonlyLocks();
		}
	}

	getEntry(uri: URI): IModifiedFileEntry | undefined {
		return this._entries.get(uri);
	}

	readEntry(uri: URI, reader: IReader): IModifiedFileEntry | undefined {
		this._entriesObs.read(reader);
		return this._entries.get(uri);
	}

	async accept(...uris: URI[]): Promise<void> {
		await Promise.all(this._getEntries(uris).map(entry => entry.accept()));
	}

	async reject(...uris: URI[]): Promise<void> {
		await Promise.all(this._getEntries(uris).map(entry => entry.reject()));
	}

	override dispose(): void {
		this._externalEditListener.clear();
		this._onDidDispose.fire();
		for (const entry of this._entries.values()) {
			entry.stopExternalEdit();
		}
		void this._resetReadonlyLocks();
		super.dispose();
	}

	private _getEntries(uris: readonly URI[]): readonly ChatEditingModifiedDocumentEntry[] {
		const entries = [...this._entries.values()];
		return uris.length === 0 ? entries : entries.filter(entry => uris.some(uri => isEqual(entry.modifiedURI, uri)));
	}

	private async _processExternalEdits(response: IChatResponseModel): Promise<void> {
		for (const part of response.response.value) {
			if (part.kind !== 'externalEdit') {
				continue;
			}

			try {
				await this._getOrCreateExternalEditEntry(part, this._getTelemetryInfo(response));
				if (this._store.isDisposed) {
					return;
				}
			} catch (error) {
				this._logService.error(`Failed to create inline chat review entry for ${part.uri}`, error);
			}
		}
	}

	private async _getOrCreateExternalEditEntry(edit: IChatExternalEdit, telemetryInfo: IModifiedEntryTelemetryInfo): Promise<void> {
		if (edit.editKind === 'delete' || edit.editKind === 'rename' || isEqual(edit.uri, this._targetUri)) {
			return;
		}

		if (this._entries.has(edit.uri)) {
			const entry = await this._getOrCreateEntry(edit.uri, telemetryInfo, this._initialContents.get(edit.uri) ?? '');
			if (this._store.isDisposed || !entry) {
				return;
			}
			entry.startExternalEdit();
			return;
		}

		const inFlight = this._externalEditEntriesInFlight.get(edit.uri);
		if (inFlight) {
			await inFlight;
			if (this._store.isDisposed) {
				return;
			}
			return;
		}

		const createEntry = this._createExternalEditEntry(edit, telemetryInfo);
		this._externalEditEntriesInFlight.set(edit.uri, createEntry);
		try {
			await createEntry;
			if (this._store.isDisposed) {
				return;
			}
		} finally {
			if (this._externalEditEntriesInFlight.get(edit.uri) === createEntry) {
				this._externalEditEntriesInFlight.delete(edit.uri);
			}
		}
	}

	private async _createExternalEditEntry(edit: IChatExternalEdit, telemetryInfo: IModifiedEntryTelemetryInfo): Promise<void> {
		let initialContent = this._initialContents.get(edit.uri);
		if (initialContent === undefined) {
			initialContent = await this._readBeforeContent(edit);
			if (this._store.isDisposed) {
				return;
			}
			this._initialContents.set(edit.uri, initialContent);
		}

		// A created file must be tracked as such: rejecting it deletes the file, whereas a
		// `Modified` entry would only restore empty content and leave the file behind.
		const editKind = edit.editKind === 'create' ? ChatEditKind.Created : ChatEditKind.Modified;
		await this._getOrCreateEntry(edit.uri, telemetryInfo, initialContent, true, editKind);
		if (this._store.isDisposed) {
			return;
		}
	}

	private async _readCurrentContent(resource: URI): Promise<string> {
		try {
			const ref = await this._textModelService.createModelReference(resource);
			try {
				return ref.object.textEditorModel.getValue();
			} finally {
				ref.dispose();
			}
		} catch (error) {
			this._logService.warn(`Failed to read model content for ${resource}; reading from disk instead.`, error);
			return (await this._fileService.readFile(resource)).value.toString();
		}
	}

	private async _readBeforeContent(edit: IChatExternalEdit): Promise<string> {
		if (!edit.beforeContentUri) {
			return '';
		}

		try {
			return (await this._fileService.readFile(edit.beforeContentUri)).value.toString();
		} catch (error) {
			this._logService.warn(`Failed to read pre-edit content for ${edit.uri}.`, error);
			return '';
		}
	}

	private async _getOrCreateEntry(resource: URI, telemetryInfo: IModifiedEntryTelemetryInfo, initialContent: string, startExternalEdit = false, editKind = ChatEditKind.Modified): Promise<ChatEditingModifiedDocumentEntry | undefined> {
		const existingEntry = this._entries.get(resource);
		if (existingEntry) {
			if (telemetryInfo.requestId !== existingEntry.telemetryInfo.requestId) {
				existingEntry.updateTelemetryInfo(telemetryInfo);
			}
			if (startExternalEdit) {
				existingEntry.startExternalEdit();
			}
			return existingEntry;
		}

		const ref = await this._textModelService.createModelReference(resource);
		if (this._store.isDisposed) {
			ref.dispose();
			return undefined;
		}

		const entry = this._register(this._instantiationService.createInstance(
			ChatEditingModifiedDocumentEntry,
			ref,
			{ collapse: (_tx: ITransaction | undefined) => { } },
			telemetryInfo,
			editKind,
			initialContent,
		));
		if (startExternalEdit) {
			entry.startExternalEdit();
		}
		this._entries.set(resource, entry);
		this._entriesObs.set([...this._entries.values()], undefined);
		return entry;
	}

	private _getTelemetryInfo(response: IChatResponseModel): IModifiedEntryTelemetryInfo {
		const requestId = this._requestId ?? response.requestId;
		return new class implements IModifiedEntryTelemetryInfo {
			get agentId() { return response.agent?.id; }
			get modelId() { return response.request?.modelId; }
			get modeId() { return response.request?.modeInfo?.telemetryModeId; }
			get command() { return response.slashCommand?.name; }
			get sessionResource() { return response.session.sessionResource; }
			get requestId() { return requestId; }
			get result() { return response.result; }
			get applyCodeBlockSuggestionId() { return response.request?.modeInfo?.applyCodeBlockSuggestionId; }
			get feature(): 'inlineChat' { return 'inlineChat'; }
		};
	}

	private _getReadonlyMessage(): IMarkdownString {
		return { value: localize('inlineChatReadonly', "Editor is read-only while Copilot is editing this file.") };
	}

	private async _resetReadonlyLocks(): Promise<void> {
		const resources = [...this._readonlyLocks.keys()];
		this._readonlyLocks.clear();

		for (const resource of resources) {
			try {
				await this._filesConfigurationService.updateReadonly(resource, 'reset');
			} catch (error) {
				this._logService.error(`Failed to release inline chat read-only lock for ${resource}`, error);
			}
		}
	}
}
