/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { VIEWLET_ID } from 'vs/workbench/contrib/files/common/files';
import { TextFileModelChangeEvent, ITextFileService, AutoSaveMode, ModelState } from 'vs/workbench/services/textfile/common/textfiles';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import * as arrays from 'vs/base/common/arrays';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export class DirtyFilesTracker extends Disposable implements IWorkbenchContribution {
	private lastKnownDirtyCount: number | undefined;
	private readonly badgeHandle = this._register(new MutableDisposable());

	constructor(
		@ITextFileService protected readonly textFileService: ITextFileService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IEditorService private readonly editorService: IEditorService,
		@IActivityService private readonly activityService: IActivityService,
		@IUntitledEditorService protected readonly untitledEditorService: IUntitledEditorService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Local text file changes
		this._register(this.untitledEditorService.onDidChangeDirty(e => this.onUntitledDidChangeDirty(e)));
		this._register(this.textFileService.models.onModelsDirty(e => this.onTextFilesDirty(e)));
		this._register(this.textFileService.models.onModelsSaved(e => this.onTextFilesSaved(e)));
		this._register(this.textFileService.models.onModelsSaveError(e => this.onTextFilesSaveError(e)));
		this._register(this.textFileService.models.onModelsReverted(e => this.onTextFilesReverted(e)));

		// Lifecycle
		this.lifecycleService.onShutdown(this.dispose, this);
	}

	private get hasDirtyCount(): boolean {
		return typeof this.lastKnownDirtyCount === 'number' && this.lastKnownDirtyCount > 0;
	}

	protected onUntitledDidChangeDirty(resource: URI): void {
		const gotDirty = this.untitledEditorService.isDirty(resource);

		if (gotDirty || this.hasDirtyCount) {
			this.updateActivityBadge();
		}
	}

	protected onTextFilesDirty(e: readonly TextFileModelChangeEvent[]): void {
		if (this.textFileService.getAutoSaveMode() !== AutoSaveMode.AFTER_SHORT_DELAY) {
			this.updateActivityBadge(); // no indication needed when auto save is enabled for short delay
		}

		// If files become dirty but are not opened, we open it in the background unless there are pending to be saved
		this.doOpenDirtyResources(arrays.distinct(e.filter(e => {

			// Only dirty models that are not PENDING_SAVE
			const model = this.textFileService.models.get(e.resource);
			const shouldOpen = model && model.isDirty() && !model.hasState(ModelState.PENDING_SAVE);

			// Only if not open already
			return shouldOpen && !this.editorService.isOpen({ resource: e.resource });
		}).map(e => e.resource), r => r.toString()));
	}

	private doOpenDirtyResources(resources: URI[]): void {

		// Open
		this.editorService.openEditors(resources.map(resource => {
			return {
				resource,
				options: { inactive: true, pinned: true, preserveFocus: true }
			};
		}));
	}

	protected onTextFilesSaved(e: readonly TextFileModelChangeEvent[]): void {
		if (this.hasDirtyCount) {
			this.updateActivityBadge();
		}
	}

	protected onTextFilesSaveError(e: readonly TextFileModelChangeEvent[]): void {
		this.updateActivityBadge();
	}

	protected onTextFilesReverted(e: readonly TextFileModelChangeEvent[]): void {
		if (this.hasDirtyCount) {
			this.updateActivityBadge();
		}
	}

	private updateActivityBadge(): void {
		const dirtyCount = this.textFileService.getDirty().length;
		this.lastKnownDirtyCount = dirtyCount;

		this.badgeHandle.clear();

		if (dirtyCount > 0) {
			this.badgeHandle.value = this.activityService.showActivity(VIEWLET_ID, new NumberBadge(dirtyCount, num => num === 1 ? nls.localize('dirtyFile', "1 unsaved file") : nls.localize('dirtyFiles', "{0} unsaved files", dirtyCount)), 'explorer-viewlet-label');
		}
	}
}
