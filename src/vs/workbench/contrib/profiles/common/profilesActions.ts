/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { joinPath } from 'vs/base/common/resources';
import { localize } from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IDialogService, IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IFileService } from 'vs/platform/files/common/files';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { asJson, asText, IRequestService } from 'vs/platform/request/common/request';
import { IProfile, isProfile, IWorkbenchProfileService, PROFILES_CATEGORY, PROFILE_EXTENSION, PROFILE_FILTER } from 'vs/workbench/services/profiles/common/profile';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

registerAction2(class ExportProfileAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.profiles.actions.exportProfile',
			title: {
				value: localize('export profile', "Export Settings as a Profile..."),
				original: 'Export Settings as a Profile...'
			},
			category: PROFILES_CATEGORY,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor) {
		const textFileService = accessor.get(ITextFileService);
		const fileDialogService = accessor.get(IFileDialogService);
		const profileService = accessor.get(IWorkbenchProfileService);
		const notificationService = accessor.get(INotificationService);

		const profileLocation = await fileDialogService.showSaveDialog({
			title: localize('export profile dialog', "Save Profile"),
			filters: PROFILE_FILTER,
			defaultUri: joinPath(await fileDialogService.defaultFilePath(), `profile.${PROFILE_EXTENSION}`),
		});

		if (!profileLocation) {
			return;
		}

		const profile = await profileService.createProfile({ skipComments: true });
		await textFileService.create([{ resource: profileLocation, value: JSON.stringify(profile), options: { overwrite: true } }]);

		notificationService.info(localize('export success', "{0}: Exported successfully.", PROFILES_CATEGORY));
	}
});

registerAction2(class ImportProfileAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.profiles.actions.importProfile',
			title: {
				value: localize('import profile', "Import Settings from a Profile..."),
				original: 'Import Settings from a Profile...'
			},
			category: PROFILES_CATEGORY,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor) {
		const fileDialogService = accessor.get(IFileDialogService);
		const quickInputService = accessor.get(IQuickInputService);
		const fileService = accessor.get(IFileService);
		const requestService = accessor.get(IRequestService);
		const profileService = accessor.get(IWorkbenchProfileService);
		const dialogService = accessor.get(IDialogService);

		if (!(await dialogService.confirm({
			title: localize('import profile title', "Import Settings from a Profile"),
			message: localize('confiirmation message', "This will replace your current settings. Are you sure you want to continue?"),
		})).confirmed) {
			return;
		}

		const disposables = new DisposableStore();
		const quickPick = disposables.add(quickInputService.createQuickPick());
		const updateQuickPickItems = (value?: string) => {
			const selectFromFileItem: IQuickPickItem = { label: localize('select from file', "Import from profile file") };
			quickPick.items = value ? [{ label: localize('select from url', "Import from URL"), description: quickPick.value }, selectFromFileItem] : [selectFromFileItem];
		};
		quickPick.title = localize('import profile quick pick title', "Import Settings from a Profile");
		quickPick.placeholder = localize('import profile placeholder', "Provide profile URL or select profile file to import");
		quickPick.ignoreFocusOut = true;
		disposables.add(quickPick.onDidChangeValue(updateQuickPickItems));
		updateQuickPickItems();
		quickPick.matchOnLabel = false;
		quickPick.matchOnDescription = false;
		disposables.add(quickPick.onDidAccept(async () => {
			quickPick.hide();
			const profile = quickPick.selectedItems[0].description ? await this.getProfileFromURL(quickPick.value, requestService) : await this.getProfileFromFileSystem(fileDialogService, fileService);
			if (profile) {
				await profileService.setProfile(profile);
			}
		}));
		disposables.add(quickPick.onDidHide(() => disposables.dispose()));
		quickPick.show();
	}

	private async getProfileFromFileSystem(fileDialogService: IFileDialogService, fileService: IFileService): Promise<IProfile | null> {
		const profileLocation = await fileDialogService.showOpenDialog({
			canSelectFolders: false,
			canSelectFiles: true,
			canSelectMany: false,
			filters: PROFILE_FILTER,
			title: localize('import profile dialog', "Import Profile"),
		});
		if (!profileLocation) {
			return null;
		}
		const content = (await fileService.readFile(profileLocation[0])).value.toString();
		const parsed = JSON.parse(content);
		return isProfile(parsed) ? parsed : null;
	}

	private async getProfileFromURL(url: string, requestService: IRequestService): Promise<IProfile | null> {
		const options = { type: 'GET', url };
		const context = await requestService.request(options, CancellationToken.None);
		if (context.res.statusCode === 200) {
			const result = await asJson(context);
			return isProfile(result) ? result : null;
		} else {
			const message = await asText(context);
			throw new Error(`Expected 200, got back ${context.res.statusCode} instead.\n\n${message}`);
		}
	}

});
