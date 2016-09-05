/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IWorkbenchContribution} from 'vs/workbench/common/contributions';
import {TextFileChangeEvent, EventType as FileEventType, ITextFileService, AutoSaveMode} from 'vs/workbench/parts/files/common/files';
import {IFileService} from 'vs/platform/files/common/files';
import {platform, Platform} from 'vs/base/common/platform';
import {asFileEditorInput} from 'vs/workbench/common/editor';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import URI from 'vs/base/common/uri';
import {IWindowService} from 'vs/workbench/services/window/electron-browser/windowService';
import {EventType as WorkbenchEventType} from 'vs/workbench/common/events';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IEventService} from 'vs/platform/event/common/event';
import {ILifecycleService} from 'vs/platform/lifecycle/common/lifecycle';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {ipcRenderer as ipc} from 'electron';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';

// This extension decorates the window as dirty when auto save is disabled and a file is dirty (mac only) and handles opening of files in the instance.
export class FileTracker implements IWorkbenchContribution {
	private activeOutOfWorkspaceWatchers: { [resource: string]: boolean; };
	private isDocumentedEdited: boolean;
	private toUnbind: IDisposable[];;

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEventService private eventService: IEventService,
		@IFileService private fileService: IFileService,
		@ITextFileService private textFileService: ITextFileService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
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

		// Editor input changes
		this.toUnbind.push(this.editorGroupService.onEditorsChanged(() => this.onEditorsChanged()));

		// Lifecycle
		this.lifecycleService.onShutdown(this.dispose, this);
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