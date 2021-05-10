/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IResourceEditorInput } from 'vs/platform/editor/common/editor';
import { Schemas } from 'vs/base/common/network';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IUntitledTextResourceEditorInput, IEditorInput, IEditorInputWithOptions } from 'vs/workbench/common/editor';
import { toLocalResource, isEqual } from 'vs/base/common/resources';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { ILogService } from 'vs/platform/log/common/log';
import { Promises } from 'vs/base/common/async';
import { IWorkingCopyIdentifier } from 'vs/workbench/services/workingCopy/common/workingCopy';

/**
 * @deprecated TODO@bpasero remove me once all backups are handled properly
 */
export class LegacyWorkingCopyBackupRestorer implements IWorkbenchContribution {

	private static readonly UNTITLED_REGEX = /Untitled-\d+/;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IWorkingCopyBackupService private readonly workingCopyBackupService: IWorkingCopyBackupService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IPathService private readonly pathService: IPathService,
		@ILogService private readonly logService: ILogService
	) {
		this.restoreLegacyBackups();
	}

	private restoreLegacyBackups(): void {
		this.lifecycleService.when(LifecyclePhase.Restored).then(() => this.doRestoreLegacyBackups());
	}

	protected async doRestoreLegacyBackups(): Promise<void> {

		// Resolve all backup resources that exist for this window
		// that have not yet adopted the working copy editor handler
		// - any working copy without `typeId`
		// - not `search-edior:/` (supports migration to typeId)
		const backups = (await this.workingCopyBackupService.getBackups())
			.filter(backup => backup.typeId.length === 0) 		// any working copy with `typeId` is adopted
			.filter(backup =>
				backup.resource.scheme !== 'search-editor' && 			// search editor has adopted
				backup.resource.scheme !== Schemas.vscodeNotebook &&	// notebooks (complex) has adopted
				backup.resource.scheme !== Schemas.vscodeCustomEditor	// custom editors (complex) has adopted
			);

		// Trigger `resolve` in each opened editor that can be found
		// for the given resource and keep track of backups that are
		// not opened.
		const unresolvedBackups = await this.resolveOpenedBackupEditors(backups);

		// For remaining unresolved backups, explicitly open an editor
		if (unresolvedBackups.length > 0) {
			try {
				await this.openEditors(unresolvedBackups);
			} catch (error) {
				this.logService.error(error);
			}

			// Finally trigger `resolve` in the newly opened editors
			await this.resolveOpenedBackupEditors(unresolvedBackups);
		}
	}

	private async resolveOpenedBackupEditors(backups: readonly IWorkingCopyIdentifier[]): Promise<IWorkingCopyIdentifier[]> {
		const unresolvedBackups: IWorkingCopyIdentifier[] = [];

		await Promises.settled(backups.map(async backup => {
			const openedEditor = this.findOpenedEditor(backup);
			if (openedEditor) {
				try {
					await openedEditor.resolve();
				} catch (error) {
					unresolvedBackups.push(backup); // ignore error and remember as unresolved
				}
			} else {
				unresolvedBackups.push(backup);
			}
		}));

		return unresolvedBackups;
	}

	private findOpenedEditor(backup: IWorkingCopyIdentifier): IEditorInput | undefined {
		for (const editor of this.editorService.editors) {
			if (isEqual(editor.resource, backup.resource)) {
				return editor;
			}
		}

		return undefined;
	}

	private async openEditors(backups: IWorkingCopyIdentifier[]): Promise<void> {
		const hasOpenedEditors = this.editorService.visibleEditors.length > 0;
		const editors = await Promises.settled(backups.map((backup, index) => this.resolveEditor(backup, index, hasOpenedEditors)));

		await this.editorService.openEditors(editors);
	}

	private async resolveEditor(backup: IWorkingCopyIdentifier, index: number, hasOpenedEditors: boolean): Promise<IResourceEditorInput | IUntitledTextResourceEditorInput | IEditorInputWithOptions> {

		// Set editor as `inactive` if we have other editors
		const options = { pinned: true, preserveFocus: true, inactive: index > 0 || hasOpenedEditors };

		// This is a (weak) strategy to find out if the untitled input had
		// an associated file path or not by just looking at the path. and
		// if so, we must ensure to restore the local resource it had.
		if (backup.resource.scheme === Schemas.untitled && !LegacyWorkingCopyBackupRestorer.UNTITLED_REGEX.test(backup.resource.path)) {
			return { resource: toLocalResource(backup.resource, this.environmentService.remoteAuthority, this.pathService.defaultUriScheme), options, forceUntitled: true };
		}

		// Finally return with a simple resource based input
		return { resource: backup.resource, options };
	}
}
