/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextFileModelChangeEvent, ITextFileService, AutoSaveMode } from 'vs/workbench/services/textfile/common/textfiles';
import { platform, Platform } from 'vs/base/common/platform';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IActivityService } from 'vs/workbench/services/activity/common/activity';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { DirtyFilesTracker } from 'vs/workbench/contrib/files/common/dirtyFilesTracker';
import { IElectronService } from 'vs/platform/electron/node/electron';

export class NativeDirtyFilesTracker extends DirtyFilesTracker {
	private isDocumentedEdited: boolean;

	constructor(
		@ITextFileService protected readonly textFileService: ITextFileService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IEditorService editorService: IEditorService,
		@IActivityService activityService: IActivityService,
		@IUntitledEditorService protected readonly untitledEditorService: IUntitledEditorService,
		@IElectronService private readonly electronService: IElectronService
	) {
		super(textFileService, lifecycleService, editorService, activityService, untitledEditorService);

		this.isDocumentedEdited = false;
	}

	protected onUntitledDidChangeDirty(resource: URI): void {
		const gotDirty = this.untitledEditorService.isDirty(resource);
		if ((!this.isDocumentedEdited && gotDirty) || (this.isDocumentedEdited && !gotDirty)) {
			this.updateDocumentEdited();
		}

		super.onUntitledDidChangeDirty(resource);
	}

	protected onTextFilesDirty(e: readonly TextFileModelChangeEvent[]): void {
		if ((this.textFileService.getAutoSaveMode() !== AutoSaveMode.AFTER_SHORT_DELAY) && !this.isDocumentedEdited) {
			this.updateDocumentEdited(); // no indication needed when auto save is enabled for short delay
		}

		super.onTextFilesDirty(e);
	}

	protected onTextFilesSaved(e: readonly TextFileModelChangeEvent[]): void {
		if (this.isDocumentedEdited) {
			this.updateDocumentEdited();
		}

		super.onTextFilesSaved(e);
	}

	protected onTextFilesSaveError(e: readonly TextFileModelChangeEvent[]): void {
		if (!this.isDocumentedEdited) {
			this.updateDocumentEdited();
		}

		super.onTextFilesSaveError(e);
	}

	protected onTextFilesReverted(e: readonly TextFileModelChangeEvent[]): void {
		if (this.isDocumentedEdited) {
			this.updateDocumentEdited();
		}

		super.onTextFilesReverted(e);
	}

	private updateDocumentEdited(): void {
		if (platform === Platform.Mac) {
			const hasDirtyFiles = this.textFileService.isDirty();
			this.isDocumentedEdited = hasDirtyFiles;

			this.electronService.setDocumentEdited(hasDirtyFiles);
		}
	}
}
