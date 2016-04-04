/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IWorkbenchContribution} from 'vs/workbench/common/contributions';
import {LocalFileChangeEvent, EventType as FileEventType, ITextFileService, AutoSaveMode} from 'vs/workbench/parts/files/common/files';
import {IFileService} from 'vs/platform/files/common/files';
import {OpenResourcesAction} from 'vs/workbench/parts/files/browser/fileActions';
import plat = require('vs/base/common/platform');
import {asFileEditorInput} from 'vs/workbench/common/editor';
import errors = require('vs/base/common/errors');
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import URI from 'vs/base/common/uri';
import {IWindowService} from 'vs/workbench/services/window/electron-browser/windowService';
import {EventType as WorkbenchEventType} from 'vs/workbench/common/events';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IResourceInput} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ILifecycleService} from 'vs/platform/lifecycle/common/lifecycle';

import {ipcRenderer as ipc} from 'electron';

export interface IPath {
	filePath: string;
	lineNumber?: number;
	columnNumber?: number;
}

export interface IOpenFileRequest {
	filesToOpen?: IPath[];
	filesToCreate?: IPath[];
	filesToDiff?: IPath[];
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
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IWindowService private windowService: IWindowService
	) {
		this.toUnbind = [];
		this.isDocumentedEdited = false;
		this.activeOutOfWorkspaceWatchers = Object.create(null);

		// Make sure to reset any previous state
		if (plat.platform === plat.Platform.Mac) {
			ipc.send('vscode:setDocumentEdited', this.windowService.getWindowId(), false); // handled from browser process
		}

		this.registerListeners();
	}

	private registerListeners(): void {

		// Local text file changes
		this.toUnbind.push(this.eventService.addListener(WorkbenchEventType.UNTITLED_FILE_DELETED, () => this.onUntitledDeletedEvent()));
		this.toUnbind.push(this.eventService.addListener(WorkbenchEventType.UNTITLED_FILE_DIRTY, () => this.onUntitledDirtyEvent()));
		this.toUnbind.push(this.eventService.addListener(FileEventType.FILE_DIRTY, (e: LocalFileChangeEvent) => this.onTextFileDirty(e)));
		this.toUnbind.push(this.eventService.addListener(FileEventType.FILE_SAVED, (e: LocalFileChangeEvent) => this.onTextFileSaved(e)));
		this.toUnbind.push(this.eventService.addListener(FileEventType.FILE_SAVE_ERROR, (e: LocalFileChangeEvent) => this.onTextFileSaveError(e)));
		this.toUnbind.push(this.eventService.addListener(FileEventType.FILE_REVERTED, (e: LocalFileChangeEvent) => this.onTextFileReverted(e)));

		// Support openFiles event for existing and new files
		ipc.on('vscode:openFiles', (event, request: IOpenFileRequest) => {
			let inputs: IResourceInput[] = [];
			let diffMode = (request.filesToDiff.length === 2);

			if (!diffMode && request.filesToOpen) {
				inputs.push(...this.toInputs(request.filesToOpen, false));
			}

			if (!diffMode && request.filesToCreate) {
				inputs.push(...this.toInputs(request.filesToCreate, true));
			}

			if (diffMode) {
				inputs.push(...this.toInputs(request.filesToDiff, false));
			}

			if (inputs.length) {
				let action = this.instantiationService.createInstance(OpenResourcesAction, inputs, diffMode);

				action.run().done(null, errors.onUnexpectedError);
				action.dispose();
			}
		});

		// Editor input changes
		this.toUnbind.push(this.eventService.addListener(WorkbenchEventType.EDITOR_INPUT_CHANGED, () => this.onEditorInputChanged()));

		// Lifecycle
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

	private onEditorInputChanged(): void {
		let visibleOutOfWorkspaceResources = this.editorService.getVisibleEditors().map((editor) => {
			return asFileEditorInput(editor.input, true);
		}).filter((input) => {
			return !!input && !this.contextService.isInsideWorkspace(input.getResource());
		}).map((input) => {
			return input.getResource().toString();
		});

		// Handle no longer visible out of workspace resources
		Object.keys(this.activeOutOfWorkspaceWatchers).forEach((watchedResource) => {
			if (visibleOutOfWorkspaceResources.indexOf(watchedResource) < 0) {
				this.fileService.unwatchFileChanges(watchedResource);
				delete this.activeOutOfWorkspaceWatchers[watchedResource];
			}
		});

		// Handle newly visible out of workspace resources
		visibleOutOfWorkspaceResources.forEach((resourceToWatch) => {
			if (!this.activeOutOfWorkspaceWatchers[resourceToWatch]) {
				this.fileService.watchFileChanges(URI.parse(resourceToWatch));
				this.activeOutOfWorkspaceWatchers[resourceToWatch] = true;
			}
		});
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
			let hasDirtyFiles = this.textFileService.isDirty();
			this.isDocumentedEdited = hasDirtyFiles;

			ipc.send('vscode:setDocumentEdited', this.windowService.getWindowId(), hasDirtyFiles); // handled from browser process
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