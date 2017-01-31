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
import { Position } from 'vs/platform/editor/common/editor';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IEditorStacksModel } from 'vs/workbench/common/editor';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IActivityBarService, NumberBadge } from 'vs/workbench/services/activity/common/activityBarService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import arrays = require('vs/base/common/arrays');

export class DirtyFilesTracker implements IWorkbenchContribution {
	private isDocumentedEdited: boolean;
	private toUnbind: IDisposable[];
	private lastDirtyCount: number;
	private stacks: IEditorStacksModel;
	private badgeHandle: IDisposable;

	constructor(
		@ITextFileService private textFileService: ITextFileService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IActivityBarService private activityBarService: IActivityBarService,
		@IWindowService private windowService: IWindowService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService
	) {
		this.toUnbind = [];
		this.isDocumentedEdited = false;
		this.stacks = editorGroupService.getStacksModel();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Local text file changes
		this.toUnbind.push(this.untitledEditorService.onDidChangeDirty(e => this.onUntitledDidChangeDirty(e)));
		this.toUnbind.push(this.textFileService.models.onModelsDirty(e => this.onTextFilesDirty(e)));
		this.toUnbind.push(this.textFileService.models.onModelsSaved(e => this.onTextFilesSaved(e)));
		this.toUnbind.push(this.textFileService.models.onModelsSaveError(e => this.onTextFilesSaveError(e)));
		this.toUnbind.push(this.textFileService.models.onModelsReverted(e => this.onTextFilesReverted(e)));

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

	private onTextFilesDirty(e: TextFileModelChangeEvent[]): void {
		if ((this.textFileService.getAutoSaveMode() !== AutoSaveMode.AFTER_SHORT_DELAY) && !this.isDocumentedEdited) {
			this.updateDocumentEdited(); // no indication needed when auto save is enabled for short delay
		}

		if (this.textFileService.getAutoSaveMode() !== AutoSaveMode.AFTER_SHORT_DELAY) {
			this.updateActivityBadge(); // no indication needed when auto save is enabled for short delay
		}

		// If files become dirty but are not opened, we open it in the background
		this.doOpenDirtyResources(e.map(e => e.resource));
	}

	private doOpenDirtyResources(resources: URI[]): void {
		const dirtyNotOpenedResources = arrays.distinct(resources.filter(r => !this.stacks.isOpen(r) && this.textFileService.isDirty(r)), r => r.toString());

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

	private onTextFilesSaved(e: TextFileModelChangeEvent[]): void {
		if (this.isDocumentedEdited) {
			this.updateDocumentEdited();
		}

		if (this.lastDirtyCount > 0) {
			this.updateActivityBadge();
		}
	}

	private onTextFilesSaveError(e: TextFileModelChangeEvent[]): void {
		if (!this.isDocumentedEdited) {
			this.updateDocumentEdited();
		}

		this.updateActivityBadge();
	}

	private onTextFilesReverted(e: TextFileModelChangeEvent[]): void {
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
		dispose(this.badgeHandle);
		if (dirtyCount > 0) {
			this.badgeHandle = this.activityBarService.showActivity(VIEWLET_ID, new NumberBadge(dirtyCount, num => nls.localize('dirtyFiles', "{0} unsaved files", dirtyCount)), 'explorer-viewlet-label');
		}
	}

	private updateDocumentEdited(): void {
		if (platform === Platform.Mac) {
			const hasDirtyFiles = this.textFileService.isDirty();
			this.isDocumentedEdited = hasDirtyFiles;

			this.windowService.setDocumentEdited(hasDirtyFiles);
		}
	}

	public getId(): string {
		return 'vs.files.dirtyFilesTracker';
	}

	public dispose(): void {
		this.toUnbind = dispose(this.toUnbind);
	}
}
