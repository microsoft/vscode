/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IWorkbenchContribution} from 'vs/workbench/common/contributions';
import {TextFileChangeEvent, EventType as FileEventType, ITextFileService, AutoSaveMode, VIEWLET_ID} from 'vs/workbench/parts/files/common/files';
import {IFileService} from 'vs/platform/files/common/files';
import {platform, Platform} from 'vs/base/common/platform';
import {DiffEditorInput, toDiffLabel} from 'vs/workbench/common/editor/diffEditorInput';
import {asFileEditorInput, EditorInput} from 'vs/workbench/common/editor';
import errors = require('vs/base/common/errors');
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import URI from 'vs/base/common/uri';
import {Position} from 'vs/platform/editor/common/editor';
import {IWindowService} from 'vs/workbench/services/window/electron-browser/windowService';
import {EventType as WorkbenchEventType} from 'vs/workbench/common/events';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IResourceInput} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ILifecycleService} from 'vs/platform/lifecycle/common/lifecycle';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {ipcRenderer as ipc} from 'electron';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';

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
	private toUnbind: IDisposable[];;

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEventService private eventService: IEventService,
		@IPartService private partService: IPartService,
		@IFileService private fileService: IFileService,
		@ITextFileService private textFileService: ITextFileService,
		@IViewletService private viewletService: IViewletService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IWindowService private windowService: IWindowService
	) {
		this.toUnbind = [];
		this.isDocumentedEdited = false;
		this.activeOutOfWorkspaceWatchers = Object.create(null);

		// Make sure to reset any previous state
		if (platform === Platform.Mac) {
			ipc.send('vscode:setDocumentEdited', this.windowService.getWindowId(), false); // handled from browser process
		}

		this.registerListeners();
	}

	private registerListeners(): void {

		// Local text file changes
		this.toUnbind.push(this.eventService.addListener2(WorkbenchEventType.UNTITLED_FILE_SAVED, () => this.onUntitledSavedEvent()));
		this.toUnbind.push(this.eventService.addListener2(WorkbenchEventType.UNTITLED_FILE_DIRTY, () => this.onUntitledDirtyEvent()));
		this.toUnbind.push(this.eventService.addListener2(FileEventType.FILE_DIRTY, (e: TextFileChangeEvent) => this.onTextFileDirty(e)));
		this.toUnbind.push(this.eventService.addListener2(FileEventType.FILE_SAVED, (e: TextFileChangeEvent) => this.onTextFileSaved(e)));
		this.toUnbind.push(this.eventService.addListener2(FileEventType.FILE_SAVE_ERROR, (e: TextFileChangeEvent) => this.onTextFileSaveError(e)));
		this.toUnbind.push(this.eventService.addListener2(FileEventType.FILE_REVERTED, (e: TextFileChangeEvent) => this.onTextFileReverted(e)));

		// Support openFiles event for existing and new files
		ipc.on('vscode:openFiles', (event, request: IOpenFileRequest) => this.onOpenFiles(request));

		// Editor input changes
		this.toUnbind.push(this.editorGroupService.onEditorsChanged(() => this.onEditorsChanged()));

		// Lifecycle
		this.lifecycleService.onShutdown(this.dispose, this);
	}

	private onOpenFiles(request: IOpenFileRequest): void {
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
			this.openResources(inputs, diffMode).done(null, errors.onUnexpectedError);
		}
	}

	private openResources(resources: IResourceInput[], diffMode: boolean): TPromise<any> {
		return this.partService.joinCreation().then(() => {
			let viewletPromise = TPromise.as(null);
			if (!this.partService.isSideBarHidden()) {
				viewletPromise = this.viewletService.openViewlet(VIEWLET_ID, false);
			}

			return viewletPromise.then(() => {

				// In diffMode we open 2 resources as diff
				if (diffMode) {
					return TPromise.join(resources.map(f => this.editorService.createInput(f))).then((inputs: EditorInput[]) => {
						return this.editorService.openEditor(new DiffEditorInput(toDiffLabel(resources[0].resource, resources[1].resource, this.contextService), null, inputs[0], inputs[1]));
					});
				}

				// For one file, just put it into the current active editor
				if (resources.length === 1) {
					return this.editorService.openEditor(resources[0]);
				}

				// Otherwise open all
				const activeEditor = this.editorService.getActiveEditor();
				return this.editorService.openEditors(resources.map((r, index) => {
					return {
						input: r,
						position: activeEditor ? activeEditor.position : Position.LEFT
					};
				}));
			});
		});
	}

	private toInputs(paths: IPath[], isNew: boolean): IResourceInput[] {
		return paths.map(p => {
			let input = <IResourceInput>{
				resource: isNew ? this.untitledEditorService.createOrGet(URI.file(p.filePath)).getResource() : URI.file(p.filePath),
				options: {
					pinned: true
				}
			};

			if (!isNew && p.lineNumber) {
				input.options.selection = {
					startLineNumber: p.lineNumber,
					startColumn: p.columnNumber
				};
			}

			return input;
		});
	}

	private onEditorsChanged(): void {
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

	private onUntitledSavedEvent(): void {
		if (this.isDocumentedEdited) {
			this.updateDocumentEdited();
		}
	}

	private onTextFileDirty(e: TextFileChangeEvent): void {
		if ((this.textFileService.getAutoSaveMode() !== AutoSaveMode.AFTER_SHORT_DELAY) && !this.isDocumentedEdited) {
			this.updateDocumentEdited(); // no indication needed when auto save is enabled for short delay
		}
	}

	private onTextFileSaved(e: TextFileChangeEvent): void {
		if (this.isDocumentedEdited) {
			this.updateDocumentEdited();
		}
	}

	private onTextFileSaveError(e: TextFileChangeEvent): void {
		if (!this.isDocumentedEdited) {
			this.updateDocumentEdited();
		}
	}

	private onTextFileReverted(e: TextFileChangeEvent): void {
		if (this.isDocumentedEdited) {
			this.updateDocumentEdited();
		}
	}

	private updateDocumentEdited(): void {
		if (platform === Platform.Mac) {
			let hasDirtyFiles = this.textFileService.isDirty();
			this.isDocumentedEdited = hasDirtyFiles;

			ipc.send('vscode:setDocumentEdited', this.windowService.getWindowId(), hasDirtyFiles); // handled from browser process
		}
	}

	public getId(): string {
		return 'vs.files.electronFileTracker';
	}

	public dispose(): void {
		this.toUnbind = dispose(this.toUnbind);

		// Dispose watchers if any
		for (let key in this.activeOutOfWorkspaceWatchers) {
			this.fileService.unwatchFileChanges(key);
		}
		this.activeOutOfWorkspaceWatchers = Object.create(null);
	}
}