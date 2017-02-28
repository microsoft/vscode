/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import paths = require('vs/base/common/paths');
import strings = require('vs/base/common/strings');
import { isWindows, isLinux } from 'vs/base/common/platform';
import URI from 'vs/base/common/uri';
import { ConfirmResult } from 'vs/workbench/common/editor';
import { TextFileService as AbstractTextFileService } from 'vs/workbench/services/textfile/common/textFileService';
import { IRawTextContent } from 'vs/workbench/services/textfile/common/textfiles';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IFileService, IResolveContentOptions } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IWindowIPCService } from 'vs/workbench/services/window/electron-browser/windowService';
import { ModelBuilder } from 'vs/editor/node/model/modelBuilder';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import product from 'vs/platform/node/product';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService } from 'vs/platform/message/common/message';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IWindowsService } from 'vs/platform/windows/common/windows';

export class TextFileService extends AbstractTextFileService {

	private static MAX_CONFIRM_FILES = 10;

	constructor(
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IFileService fileService: IFileService,
		@IUntitledEditorService untitledEditorService: IUntitledEditorService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService configurationService: IConfigurationService,
		@IModeService private modeService: IModeService,
		@IWindowIPCService private windowService: IWindowIPCService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IMessageService messageService: IMessageService,
		@IBackupFileService backupFileService: IBackupFileService,
		@IStorageService private storageService: IStorageService,
		@IWindowsService windowsService: IWindowsService,
		@IEditorGroupService editorGroupService: IEditorGroupService
	) {
		super(lifecycleService, contextService, configurationService, telemetryService, fileService, untitledEditorService, instantiationService, messageService, environmentService, backupFileService, editorGroupService, windowsService);
	}

	public resolveTextContent(resource: URI, options?: IResolveContentOptions): TPromise<IRawTextContent> {
		return this.fileService.resolveStreamContent(resource, options).then(streamContent => {
			return ModelBuilder.fromStringStream(streamContent.value).then(res => {
				const r: IRawTextContent = {
					resource: streamContent.resource,
					name: streamContent.name,
					mtime: streamContent.mtime,
					etag: streamContent.etag,
					encoding: streamContent.encoding,
					value: res.value,
					valueLogicalHash: res.hash
				};
				return r;
			});
		});
	}

	public confirmSave(resources?: URI[]): ConfirmResult {
		if (this.environmentService.isExtensionDevelopment) {
			return ConfirmResult.DONT_SAVE; // no veto when we are in extension dev mode because we cannot assum we run interactive (e.g. tests)
		}

		const resourcesToConfirm = this.getDirty(resources);
		if (resourcesToConfirm.length === 0) {
			return ConfirmResult.DONT_SAVE;
		}

		const message = [
			resourcesToConfirm.length === 1 ? nls.localize('saveChangesMessage', "Do you want to save the changes you made to {0}?", paths.basename(resourcesToConfirm[0].fsPath)) : nls.localize('saveChangesMessages', "Do you want to save the changes to the following {0} files?", resourcesToConfirm.length)
		];

		if (resourcesToConfirm.length > 1) {
			message.push('');
			message.push(...resourcesToConfirm.slice(0, TextFileService.MAX_CONFIRM_FILES).map(r => paths.basename(r.fsPath)));

			if (resourcesToConfirm.length > TextFileService.MAX_CONFIRM_FILES) {
				if (resourcesToConfirm.length - TextFileService.MAX_CONFIRM_FILES === 1) {
					message.push(nls.localize('moreFile', "...1 additional file not shown"));
				} else {
					message.push(nls.localize('moreFiles', "...{0} additional files not shown", resourcesToConfirm.length - TextFileService.MAX_CONFIRM_FILES));
				}
			}

			message.push('');
		}

		// Button order
		// Windows: Save | Don't Save | Cancel
		// Mac: Save | Cancel | Don't Save
		// Linux: Don't Save | Cancel | Save

		const save = { label: resourcesToConfirm.length > 1 ? this.mnemonicLabel(nls.localize({ key: 'saveAll', comment: ['&& denotes a mnemonic'] }, "&&Save All")) : this.mnemonicLabel(nls.localize({ key: 'save', comment: ['&& denotes a mnemonic'] }, "&&Save")), result: ConfirmResult.SAVE };
		const dontSave = { label: this.mnemonicLabel(nls.localize({ key: 'dontSave', comment: ['&& denotes a mnemonic'] }, "Do&&n't Save")), result: ConfirmResult.DONT_SAVE };
		const cancel = { label: nls.localize('cancel', "Cancel"), result: ConfirmResult.CANCEL };

		const buttons: { label: string; result: ConfirmResult; }[] = [];
		if (isWindows) {
			buttons.push(save, dontSave, cancel);
		} else if (isLinux) {
			buttons.push(dontSave, cancel, save);
		} else {
			buttons.push(save, cancel, dontSave);
		}

		const opts: Electron.ShowMessageBoxOptions = {
			title: product.nameLong,
			message: message.join('\n'),
			type: 'warning',
			detail: nls.localize('saveChangesDetail', "Your changes will be lost if you don't save them."),
			buttons: buttons.map(b => b.label),
			noLink: true,
			cancelId: buttons.indexOf(cancel)
		};

		if (isLinux) {
			opts.defaultId = 2;
		}

		const choice = this.windowService.getWindow().showMessageBox(opts);

		return buttons[choice].result;
	}

	public showHotExitMessage(): void {
		const key = 'hotExit/hasShownMessage';
		const hasShownMessage = !!this.storageService.get(key, StorageScope.GLOBAL);
		if (!hasShownMessage) {
			this.storageService.store(key, true, StorageScope.GLOBAL);
			const opts: Electron.ShowMessageBoxOptions = {
				title: product.nameLong,
				message: nls.localize('hotExitEducationalMessage', "Hot Exit is now enabled by default"),
				type: 'info',
				detail: nls.localize('hotExitEducationalDetail', "Hot Exit remembers any unsaved files between sessions, so you don't have to save your files before you exit. You can disable this feature with the 'files.hotExit' setting."),
				buttons: [nls.localize('ok', "OK")],
				noLink: true
			};
			this.windowService.getWindow().showMessageBox(opts);
		}
	}

	private mnemonicLabel(label: string): string {
		if (!isWindows) {
			return label.replace(/\(&&\w\)|&&/g, ''); // no mnemonic support on mac/linux
		}

		return label.replace(/&&/g, '&');
	}

	public promptForPath(defaultPath?: string): string {
		return this.windowService.getWindow().showSaveDialog(this.getSaveDialogOptions(defaultPath ? paths.normalize(defaultPath, true) : void 0));
	}

	private getSaveDialogOptions(defaultPath?: string): Electron.SaveDialogOptions {
		const options: Electron.SaveDialogOptions = {
			defaultPath: defaultPath
		};

		// Filters are only enabled on Windows where they work properly
		if (!isWindows) {
			return options;
		}

		interface IFilter { name: string; extensions: string[]; }

		// Build the file filter by using our known languages
		const ext: string = paths.extname(defaultPath);
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