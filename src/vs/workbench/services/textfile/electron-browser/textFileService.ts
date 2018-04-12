/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import * as paths from 'vs/base/common/paths';
import * as strings from 'vs/base/common/strings';
import { isWindows } from 'vs/base/common/platform';
import URI from 'vs/base/common/uri';
import { ConfirmResult } from 'vs/workbench/common/editor';
import { TextFileService as AbstractTextFileService } from 'vs/workbench/services/textfile/common/textFileService';
import { IRawTextContent } from 'vs/workbench/services/textfile/common/textfiles';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IFileService, IResolveContentOptions } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IModeService } from 'vs/editor/common/services/modeService';
import { createTextBufferFactoryFromStream } from 'vs/editor/common/model/textModel';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IModelService } from 'vs/editor/common/services/modelService';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { getConfirmMessage, IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { Severity } from 'vs/editor/common/standalone/standaloneBase';

export class TextFileService extends AbstractTextFileService {

	constructor(
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IFileService fileService: IFileService,
		@IUntitledEditorService untitledEditorService: IUntitledEditorService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IModeService private modeService: IModeService,
		@IModelService modelService: IModelService,
		@IWindowService private windowService: IWindowService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@INotificationService notificationService: INotificationService,
		@IBackupFileService backupFileService: IBackupFileService,
		@IWindowsService windowsService: IWindowsService,
		@IHistoryService historyService: IHistoryService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IDialogService private dialogService: IDialogService
	) {
		super(lifecycleService, contextService, configurationService, fileService, untitledEditorService, instantiationService, notificationService, environmentService, backupFileService, windowsService, historyService, contextKeyService, modelService);
	}

	public resolveTextContent(resource: URI, options?: IResolveContentOptions): TPromise<IRawTextContent> {
		return this.fileService.resolveStreamContent(resource, options).then(streamContent => {
			return createTextBufferFactoryFromStream(streamContent.value).then(res => {
				const r: IRawTextContent = {
					resource: streamContent.resource,
					name: streamContent.name,
					mtime: streamContent.mtime,
					etag: streamContent.etag,
					encoding: streamContent.encoding,
					value: res
				};
				return r;
			});
		});
	}

	public confirmSave(resources?: URI[]): TPromise<ConfirmResult> {
		if (this.environmentService.isExtensionDevelopment) {
			return TPromise.wrap(ConfirmResult.DONT_SAVE); // no veto when we are in extension dev mode because we cannot assum we run interactive (e.g. tests)
		}

		const resourcesToConfirm = this.getDirty(resources);
		if (resourcesToConfirm.length === 0) {
			return TPromise.wrap(ConfirmResult.DONT_SAVE);
		}

		const message = resourcesToConfirm.length === 1 ? nls.localize('saveChangesMessage', "Do you want to save the changes you made to {0}?", paths.basename(resourcesToConfirm[0].fsPath))
			: getConfirmMessage(nls.localize('saveChangesMessages', "Do you want to save the changes to the following {0} files?", resourcesToConfirm.length), resourcesToConfirm);

		const buttons: string[] = [
			resourcesToConfirm.length > 1 ? nls.localize({ key: 'saveAll', comment: ['&& denotes a mnemonic'] }, "&&Save All") : nls.localize({ key: 'save', comment: ['&& denotes a mnemonic'] }, "&&Save"),
			nls.localize({ key: 'dontSave', comment: ['&& denotes a mnemonic'] }, "Do&&n't Save"),
			nls.localize('cancel', "Cancel")
		];

		return this.dialogService.show(Severity.Warning, message, buttons, {
			cancelId: 2,
			detail: nls.localize('saveChangesDetail', "Your changes will be lost if you don't save them.")
		}).then(index => {
			switch (index) {
				case 0: return ConfirmResult.SAVE;
				case 1: return ConfirmResult.DONT_SAVE;
				default: return ConfirmResult.CANCEL;
			}
		});
	}

	public promptForPath(defaultPath: string): TPromise<string> {
		return this.windowService.showSaveDialog(this.getSaveDialogOptions(defaultPath));
	}

	private getSaveDialogOptions(defaultPath: string): Electron.SaveDialogOptions {
		const options: Electron.SaveDialogOptions = { defaultPath };

		// Filters are only enabled on Windows where they work properly
		if (!isWindows) {
			return options;
		}

		interface IFilter { name: string; extensions: string[]; }

		// Build the file filter by using our known languages
		const ext: string = defaultPath ? paths.extname(defaultPath) : void 0;
		let matchingFilter: IFilter;
		const filters: IFilter[] = this.modeService.getRegisteredLanguageNames().map(languageName => {
			const extensions = this.modeService.getExtensions(languageName);
			if (!extensions || !extensions.length) {
				return null;
			}

			const filter: IFilter = { name: languageName, extensions: extensions.slice(0, 10).map(e => strings.trim(e, '.')) };

			if (ext && extensions.indexOf(ext) >= 0) {
				matchingFilter = filter;

				return null; // matching filter will be added last to the top
			}

			return filter;
		}).filter(f => !!f);

		// Filters are a bit weird on Windows, based on having a match or not:
		// Match: we put the matching filter first so that it shows up selected and the all files last
		// No match: we put the all files filter first
		const allFilesFilter = { name: nls.localize('allFiles', "All Files"), extensions: ['*'] };
		if (matchingFilter) {
			filters.unshift(matchingFilter);
			filters.unshift(allFilesFilter);
		} else {
			filters.unshift(allFilesFilter);
		}

		// Allow to save file without extension
		filters.push({ name: nls.localize('noExt', "No Extension"), extensions: [''] });

		options.filters = filters;

		return options;
	}
}
