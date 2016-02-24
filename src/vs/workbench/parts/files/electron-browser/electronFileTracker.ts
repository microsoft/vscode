/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IWorkbenchContribution} from 'vs/workbench/common/contributions';
import {LocalFileChangeEvent, IWorkingFileModelChangeEvent, EventType as FileEventType, ITextFileService, AutoSaveMode} from 'vs/workbench/parts/files/common/files';
import {IFileService} from 'vs/platform/files/common/files';
import {OpenResourcesAction} from 'vs/workbench/parts/files/browser/fileActions';
import plat = require('vs/base/common/platform');
import errors = require('vs/base/common/errors');
import URI from 'vs/base/common/uri';
import {EventType as WorkbenchEventType} from 'vs/workbench/common/events';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IResourceInput} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ILifecycleService} from 'vs/platform/lifecycle/common/lifecycle';

import {ipcRenderer as ipc, remote} from 'electron';

export interface IPath {
	filePath: string;
	lineNumber?: number;
	columnNumber?: number;
}

export interface IOpenFileRequest {
	filesToOpen: IPath[];
	filesToCreate: IPath[];
}

// This extension decorates the window as dirty when auto save is disabled and a file is dirty (mac only) and handles opening of files in the instance.
export class FileTracker implements IWorkbenchContribution {
	private activeOutOfWorkspaceWatchers: { [resource: string]: boolean; };
	private isDocumentedEdited: boolean;
	private toUnbind: { (): void; }[];

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEventService private eventService: IEventService,
		@IPartService private partService: IPartService,
		@IFileService private fileService: IFileService,
		@ITextFileService private textFileService: ITextFileService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@ILifecycleService private lifecycleService: ILifecycleService
	) {
		this.toUnbind = [];
		this.isDocumentedEdited = false;
		this.activeOutOfWorkspaceWatchers = Object.create(null);

		// Make sure to reset any previous state
		if (plat.platform === plat.Platform.Mac) {
			let win = remote.getCurrentWindow();
			win.setDocumentEdited(false);
		}

		this.registerListeners();

		// Listen to out of workspace file changes
		this.updateOutOfWorkspaceFileListeners({ added: this.textFileService.getWorkingFilesModel().getEntries() });
	}

	private registerListeners(): void {

		// Local text file changes
		this.toUnbind.push(this.eventService.addListener(WorkbenchEventType.UNTITLED_FILE_DELETED, () => this.onUntitledDeletedEvent()));
		this.toUnbind.push(this.eventService.addListener(WorkbenchEventType.UNTITLED_FILE_DIRTY, () => this.onUntitledDirtyEvent()));
		this.toUnbind.push(this.eventService.addListener(FileEventType.FILE_DIRTY, (e: LocalFileChangeEvent) => this.onTextFileDirty(e)));
		this.toUnbind.push(this.eventService.addListener(FileEventType.FILE_SAVED, (e: LocalFileChangeEvent) => this.onTextFileSaved(e)));
		this.toUnbind.push(this.eventService.addListener(FileEventType.FILE_SAVE_ERROR, (e: LocalFileChangeEvent) => this.onTextFileSaveError(e)));
		this.toUnbind.push(this.eventService.addListener(FileEventType.FILE_REVERTED, (e: LocalFileChangeEvent) => this.onTextFileReverted(e)));

		// Working Files Model Change
		const disposable = this.textFileService.getWorkingFilesModel().onModelChange(this.onWorkingFilesModelChange, this);
		this.toUnbind.push(() => disposable.dispose());

		// Support openFiles event for existing and new files
		ipc.on('vscode:openFiles', (event, request: IOpenFileRequest) => {
			let inputs: IResourceInput[] = [];
			if (request.filesToOpen) {
				inputs.push(...this.toInputs(request.filesToOpen, false));
			}

			if (request.filesToCreate) {
				inputs.push(...this.toInputs(request.filesToCreate, true));
			}

			if (inputs.length) {
				let action = this.instantiationService.createInstance(OpenResourcesAction, inputs);

				action.run().done(null, errors.onUnexpectedError);
				action.dispose();
			}
		});

		this.lifecycleService.onShutdown(this.dispose, this);
	}

	private toInputs(paths: IPath[], isNew: boolean): IResourceInput[] {
		return paths.map(p => {
			let input = <IResourceInput>{
				resource: isNew ? this.untitledEditorService.createOrGet(URI.file(p.filePath)).getResource() : URI.file(p.filePath)
			};

			if (!isNew && p.lineNumber) {
				input.options = {
					selection: {
						startLineNumber: p.lineNumber,
						startColumn: p.columnNumber
					}
				};
			}

			return input;
		});
	}

	private updateOutOfWorkspaceFileListeners(event: IWorkingFileModelChangeEvent): void {
		let added = event.added ? event.added.map((e) => e.resource).filter((r) => r.scheme === 'file' && !this.contextService.isInsideWorkspace(r)) : [];
		let removed = event.removed ? event.removed.map((e) => e.resource).filter((r) => r.scheme === 'file' && !this.contextService.isInsideWorkspace(r)) : [];

		// Handle added
		added.forEach((resource) => {
			if (!this.activeOutOfWorkspaceWatchers[resource.toString()]) {
				this.fileService.watchFileChanges(resource);
				this.activeOutOfWorkspaceWatchers[resource.toString()] = true;
			}
		});

		// Handle removed
		removed.forEach((resource) => {
			if (this.activeOutOfWorkspaceWatchers[resource.toString()]) {
				this.fileService.unwatchFileChanges(resource);
				delete this.activeOutOfWorkspaceWatchers[resource.toString()];
			}
		});
	}

	private onWorkingFilesModelChange(event: IWorkingFileModelChangeEvent): void {
		this.updateOutOfWorkspaceFileListeners(event);
	}

	private onUntitledDirtyEvent(): void {
		if (!this.isDocumentedEdited) {
			this.updateDocumentEdited();
		}
	}

	private onUntitledDeletedEvent(): void {
		if (this.isDocumentedEdited) {
			this.updateDocumentEdited();
		}
	}

	private onTextFileDirty(e: LocalFileChangeEvent): void {
		if ((this.textFileService.getAutoSaveMode() !== AutoSaveMode.AFTER_SHORT_DELAY) && !this.isDocumentedEdited) {
			this.updateDocumentEdited(); // no indication needed when auto save is enabled for short delay
		}
	}

	private onTextFileSaved(e: LocalFileChangeEvent): void {
		if (this.isDocumentedEdited) {
			this.updateDocumentEdited();
		}
	}

	private onTextFileSaveError(e: LocalFileChangeEvent): void {
		if (!this.isDocumentedEdited) {
			this.updateDocumentEdited();
		}
	}

	private onTextFileReverted(e: LocalFileChangeEvent): void {
		if (this.isDocumentedEdited) {
			this.updateDocumentEdited();
		}
	}

	private updateDocumentEdited(): void {
		if (plat.platform === plat.Platform.Mac) {
			process.nextTick(() => {
				let win = remote.getCurrentWindow();
				let isDirtyIndicated = win.isDocumentEdited();
				let hasDirtyFiles = this.textFileService.isDirty();
				this.isDocumentedEdited = hasDirtyFiles;

				if (hasDirtyFiles !== isDirtyIndicated) {
					win.setDocumentEdited(hasDirtyFiles);
				}
			});
		}
	}

	public getId(): string {
		return 'vs.files.electronFileTracker';
	}

	public dispose(): void {
		while (this.toUnbind.length) {
			this.toUnbind.pop()();
		}

		// Dispose watchers if any
		for (let key in this.activeOutOfWorkspaceWatchers) {
			this.fileService.unwatchFileChanges(key);
		}
		this.activeOutOfWorkspaceWatchers = Object.create(null);
	}
}