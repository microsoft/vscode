/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { VIEWLET_ID } from 'vs/workbench/parts/files/common/files';
import { TextFileModelChangeEvent, ITextFileService, AutoSaveMode } from 'vs/workbench/services/textfile/common/textfiles';
import { platform, Platform } from 'vs/base/common/platform';
import { IWindowService } from 'vs/workbench/services/window/electron-browser/windowService';
import { Position } from 'vs/platform/editor/common/editor';
import { IEditorStacksModel } from 'vs/workbench/common/editor';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activityService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import arrays = require('vs/base/common/arrays');

import { ipcRenderer as ipc } from 'electron';

export class DirtyFilesTracker implements IWorkbenchContribution {
	private isDocumentedEdited: boolean;
	private toUnbind: IDisposable[];

	private lastDirtyCount: number;
	private pendingDirtyResources: URI[];
	private pendingDirtyHandle: number;

	private stacks: IEditorStacksModel;

	constructor(
		@ITextFileService private textFileService: ITextFileService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IActivityService private activityService: IActivityService,
		@IWindowService private windowService: IWindowService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService
	) {
		this.toUnbind = [];
		this.isDocumentedEdited = false;
		this.pendingDirtyResources = [];
		this.stacks = editorGroupService.getStacksModel();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Local text file changes
		this.toUnbind.push(this.untitledEditorService.onDidChangeDirty(e => this.onUntitledDidChangeDirty(e)));
		this.toUnbind.push(this.textFileService.models.onModelDirty(e => this.onTextFileDirty(e)));
		this.toUnbind.push(this.textFileService.models.onModelSaved(e => this.onTextFileSaved(e)));
		this.toUnbind.push(this.textFileService.models.onModelSaveError(e => this.onTextFileSaveError(e)));
		this.toUnbind.push(this.textFileService.models.onModelReverted(e => this.onTextFileReverted(e)));

		// Lifecycle
		this.lifecycleService.onShutdown(this.dispose, this);
	}

	private onUntitledDidChangeDirty(resource: URI): void {
		const gotDirty = this.untitledEditorService.isDirty(resource);

		if ((!this.isDocumentedEdited && gotDirty) || (this.isDocumentedEdited && !gotDirty)) {
			this.updateDocumentEdited();
		}

		if (gotDirty || this.lastDirtyCount > 0) {
			this.updateActivityBadge();
		}
	}

	private onTextFileDirty(e: TextFileModelChangeEvent): void {
		if ((this.textFileService.getAutoSaveMode() !== AutoSaveMode.AFTER_SHORT_DELAY) && !this.isDocumentedEdited) {
			this.updateDocumentEdited(); // no indication needed when auto save is enabled for short delay
		}

		if (this.textFileService.getAutoSaveMode() !== AutoSaveMode.AFTER_SHORT_DELAY) {
			this.updateActivityBadge(); // no indication needed when auto save is enabled for short delay
		}

		// If a file becomes dirty but is not opened, we open it in the background
		// Since it might be the intent of whoever created the model to show it shortly
		// after, we delay this a little bit and check again if the editor has not been
		// opened meanwhile
		this.pendingDirtyResources.push(e.resource);
		if (!this.pendingDirtyHandle) {
			this.pendingDirtyHandle = setTimeout(() => this.doOpenDirtyResources(), 250);
		}
	}

	private doOpenDirtyResources(): void {
		const dirtyNotOpenedResources = arrays.distinct(this.pendingDirtyResources.filter(r => !this.stacks.isOpen(r) && this.textFileService.isDirty(r)), r => r.toString());

		// Reset
		this.pendingDirtyHandle = void 0;
		this.pendingDirtyResources = [];

		const activeEditor = this.editorService.getActiveEditor();
		const activePosition = activeEditor ? activeEditor.position : Position.ONE;

		// Open
		this.editorService.openEditors(dirtyNotOpenedResources.map(resource => {
			return {
				input: {
					resource,
					options: { inactive: true, pinned: true, preserveFocus: true }
				},
				position: activePosition
			};
		})).done(null, errors.onUnexpectedError);
	}

	private onTextFileSaved(e: TextFileModelChangeEvent): void {
		if (this.isDocumentedEdited) {
			this.updateDocumentEdited();
		}

		if (this.lastDirtyCount > 0) {
			this.updateActivityBadge();
		}
	}

	private onTextFileSaveError(e: TextFileModelChangeEvent): void {
		if (!this.isDocumentedEdited) {
			this.updateDocumentEdited();
		}

		this.updateActivityBadge();
	}

	private onTextFileReverted(e: TextFileModelChangeEvent): void {
		if (this.isDocumentedEdited) {
			this.updateDocumentEdited();
		}

		if (this.lastDirtyCount > 0) {
			this.updateActivityBadge();
		}
	}

	private updateActivityBadge(): void {
		const dirtyCount = this.textFileService.getDirty().length;
		this.lastDirtyCount = dirtyCount;
		if (dirtyCount > 0) {
			this.activityService.showActivity(VIEWLET_ID, new NumberBadge(dirtyCount, num => nls.localize('dirtyFiles', "{0} unsaved files", dirtyCount)), 'explorer-viewlet-label');
		} else {
			this.activityService.clearActivity(VIEWLET_ID);
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
		return 'vs.files.dirtyFilesTracker';
	}

	public dispose(): void {
		this.toUnbind = dispose(this.toUnbind);
	}
}