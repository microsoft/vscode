/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ChatAgentLocation } from '../../common/chatAgents.js';
import { ChatEditingSessionChangeType, IChatEditingService, IChatEditingSession, WorkingSetEntryRemovalReason, WorkingSetEntryState } from '../../common/chatEditingService.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';

export class ChatRelatedFilesContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'chat.relatedFilesWorkingSet';

	private readonly chatEditingSessionDisposables = new Map<string, DisposableStore>();
	private _currentRelatedFilesRetrievalOperation: Promise<void> | undefined;

	constructor(
		@IChatEditingService private readonly chatEditingService: IChatEditingService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService
	) {
		super();

		this._register(
			this.chatWidgetService.onDidAddWidget(widget => {
				if (widget.location === ChatAgentLocation.EditingSession && widget.viewModel?.sessionId) {
					const editingSession = this.chatEditingService.getEditingSession(widget.viewModel.sessionId);
					if (editingSession) {
						this._handleNewEditingSession(editingSession, widget);
					}
				}
			}),
		);
	}

	private _updateRelatedFileSuggestions(currentEditingSession: IChatEditingSession, widget: IChatWidget) {
		if (this._currentRelatedFilesRetrievalOperation) {
			return;
		}

		const workingSetEntries = currentEditingSession.entries.get();
		if (workingSetEntries.length > 0) {
			// Do this only for the initial working set state
			return;
		}

		this._currentRelatedFilesRetrievalOperation = this.chatEditingService.getRelatedFiles(currentEditingSession.chatSessionId, widget.getInput(), CancellationToken.None)
			.then((files) => {
				if (!files?.length || !widget.viewModel?.sessionId) {
					return;
				}

				const currentEditingSession = this.chatEditingService.getEditingSession(widget.viewModel.sessionId);
				if (!currentEditingSession || currentEditingSession.entries.get().length) {
					return; // Might have disposed while we were calculating
				}

				// Pick up to 2 related files, or however many we can still fit in the working set
				const maximumRelatedFiles = Math.min(2, this.chatEditingService.editingSessionFileLimit - widget.input.chatEditWorkingSetFiles.length);
				const newSuggestions = new ResourceMap<{ description: string; group: string }>();
				for (const group of files) {
					for (const file of group.files) {
						if (newSuggestions.size >= maximumRelatedFiles) {
							break;
						}
						newSuggestions.set(file.uri, { group: group.group, description: file.description });
					}
				}

				// Remove the existing related file suggestions from the working set
				const existingSuggestedEntriesToRemove: URI[] = [];
				for (const entry of currentEditingSession.workingSet) {
					if (entry[1].state === WorkingSetEntryState.Suggested && !newSuggestions.has(entry[0])) {
						existingSuggestedEntriesToRemove.push(entry[0]);
					}
				}
				currentEditingSession?.remove(WorkingSetEntryRemovalReason.Programmatic, ...existingSuggestedEntriesToRemove);

				// Add the new related file suggestions to the working set
				for (const [uri, data] of newSuggestions) {
					currentEditingSession.addFileToWorkingSet(uri, localize('relatedFile', "{0} (Suggested)", data.description), WorkingSetEntryState.Suggested);
				}
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
		disposableStore.add(currentEditingSession.onDidChange((e) => {
			if (e === ChatEditingSessionChangeType.WorkingSet) {
				this._updateRelatedFileSuggestions(currentEditingSession, widget);
			}
		}));
		disposableStore.add(currentEditingSession.onDidDispose(() => {
			disposableStore.dispose();
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
