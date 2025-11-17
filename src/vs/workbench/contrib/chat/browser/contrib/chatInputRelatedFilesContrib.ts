/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { autorun } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IChatEditingService, IChatEditingSession } from '../../common/chatEditingService.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';

export class ChatRelatedFilesContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'chat.relatedFilesWorkingSet';

	private readonly chatEditingSessionDisposables = new Map<string, DisposableStore>();
	private _currentRelatedFilesRetrievalOperation: Promise<void> | undefined;

	constructor(
		@IChatEditingService private readonly chatEditingService: IChatEditingService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super();

		this._register(autorun((reader) => {
			const sessions = this.chatEditingService.editingSessionsObs.read(reader);
			sessions.forEach(session => {
				const widget = this.chatWidgetService.getWidgetBySessionResource(session.chatSessionResource);
				if (widget && !this.chatEditingSessionDisposables.has(session.chatSessionId)) {
					this._handleNewEditingSession(session, widget);
				}
			});
		}));
	}

	private _updateRelatedFileSuggestions(currentEditingSession: IChatEditingSession, widget: IChatWidget) {
		if (this._currentRelatedFilesRetrievalOperation) {
			return;
		}

		const workingSetEntries = currentEditingSession.entries.get();
		if (workingSetEntries.length > 0 || widget.attachmentModel.fileAttachments.length === 0) {
			// Do this only for the initial working set state
			return;
		}

		this._currentRelatedFilesRetrievalOperation = this.chatEditingService.getRelatedFiles(currentEditingSession.chatSessionResource, widget.getInput(), widget.attachmentModel.fileAttachments, CancellationToken.None)
			.then((files) => {
				if (!files?.length || !widget.viewModel || !widget.input.relatedFiles) {
					return;
				}

				const currentEditingSession = this.chatEditingService.getEditingSession(widget.viewModel.sessionResource);
				if (!currentEditingSession || currentEditingSession.entries.get().length) {
					return; // Might have disposed while we were calculating
				}

				const existingFiles = new ResourceSet([...widget.attachmentModel.fileAttachments, ...widget.input.relatedFiles.removedFiles]);
				if (!existingFiles.size) {
					return;
				}

				// Pick up to 2 related files
				const newSuggestions = new ResourceMap<string>();
				for (const group of files) {
					for (const file of group.files) {
						if (newSuggestions.size >= 2) {
							break;
						}
						if (existingFiles.has(file.uri)) {
							continue;
						}
						newSuggestions.set(file.uri, localize('relatedFile', "{0} (Suggested)", file.description));
						existingFiles.add(file.uri);
					}
				}

				widget.input.relatedFiles.value = [...newSuggestions.entries()].map(([uri, description]) => ({ uri, description }));
			})
			.finally(() => {
				this._currentRelatedFilesRetrievalOperation = undefined;
			});

	}

	private _handleNewEditingSession(currentEditingSession: IChatEditingSession, widget: IChatWidget) {
		const disposableStore = new DisposableStore();
		disposableStore.add(currentEditingSession.onDidDispose(() => {
			disposableStore.clear();
		}));
		this._updateRelatedFileSuggestions(currentEditingSession, widget);
		const onDebouncedType = Event.debounce(widget.inputEditor.onDidChangeModelContent, () => null, 3000);
		disposableStore.add(onDebouncedType(() => {
			this._updateRelatedFileSuggestions(currentEditingSession, widget);
		}));
		disposableStore.add(widget.attachmentModel.onDidChange(() => {
			this._updateRelatedFileSuggestions(currentEditingSession, widget);
		}));
		disposableStore.add(currentEditingSession.onDidDispose(() => {
			disposableStore.dispose();
		}));
		disposableStore.add(widget.onDidAcceptInput(() => {
			widget.input.relatedFiles?.clear();
			this._updateRelatedFileSuggestions(currentEditingSession, widget);
		}));
		this.chatEditingSessionDisposables.set(currentEditingSession.chatSessionId, disposableStore);
	}

	override dispose() {
		for (const store of this.chatEditingSessionDisposables.values()) {
			store.dispose();
		}
		super.dispose();
	}
}

export interface IChatRelatedFile {
	uri: URI;
	description: string;
}
export class ChatRelatedFiles extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _removedFiles = new ResourceSet();
	get removedFiles() {
		return this._removedFiles;
	}

	private _value: IChatRelatedFile[] = [];
	get value() {
		return this._value;
	}

	set value(value: IChatRelatedFile[]) {
		this._value = value;
		this._onDidChange.fire();
	}

	remove(uri: URI) {
		this._value = this._value.filter(file => !isEqual(file.uri, uri));
		this._removedFiles.add(uri);
		this._onDidChange.fire();
	}

	clearRemovedFiles() {
		this._removedFiles.clear();
	}

	clear() {
		this._value = [];
		this._removedFiles.clear();
		this._onDidChange.fire();
	}
}
