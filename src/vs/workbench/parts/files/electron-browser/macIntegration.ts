/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IWorkbenchContribution} from 'vs/workbench/common/contributions';
import {TextFileChangeEvent, EventType as FileEventType, ITextFileService, AutoSaveMode} from 'vs/workbench/parts/files/common/files';
import {platform, Platform} from 'vs/base/common/platform';
import {IWindowService} from 'vs/workbench/services/window/electron-browser/windowService';
import {EventType as WorkbenchEventType} from 'vs/workbench/common/events';
import {IEventService} from 'vs/platform/event/common/event';
import {ILifecycleService} from 'vs/platform/lifecycle/common/lifecycle';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {ipcRenderer as ipc} from 'electron';

export class MacIntegration implements IWorkbenchContribution {
	private isDocumentedEdited: boolean;
	private toUnbind: IDisposable[];;

	constructor(
		@IEventService private eventService: IEventService,
		@ITextFileService private textFileService: ITextFileService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IWindowService private windowService: IWindowService
	) {
		this.toUnbind = [];
		this.isDocumentedEdited = false;

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

		// Lifecycle
		this.lifecycleService.onShutdown(this.dispose, this);
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
			const hasDirtyFiles = this.textFileService.isDirty();
			this.isDocumentedEdited = hasDirtyFiles;

			ipc.send('vscode:setDocumentEdited', this.windowService.getWindowId(), hasDirtyFiles); // handled from browser process
		}
	}

	public getId(): string {
		return 'vs.files.macIntegration';
	}

	public dispose(): void {
		this.toUnbind = dispose(this.toUnbind);
	}
}