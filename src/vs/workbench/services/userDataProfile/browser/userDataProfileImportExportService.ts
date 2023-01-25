/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/userDataProfileView';
import { localize } from 'vs/nls';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import * as DOM from 'vs/base/browser/dom';
import { IUserDataProfileImportExportService, PROFILE_FILTER, PROFILE_EXTENSION, IUserDataProfileContentHandler, IS_PROFILE_IMPORT_IN_PROGRESS_CONTEXT, PROFILES_TTILE, defaultUserDataProfileIcon, IUserDataProfileService, IProfileResourceTreeItem, IProfileResourceChildTreeItem, PROFILES_CATEGORY, IUserDataProfileManagementService, ProfileResourceType, IS_PROFILE_EXPORT_IN_PROGRESS_CONTEXT, ISaveProfileResult, IProfileImportOptions, PROFILE_URL_AUTHORITY, toUserDataProfileUri } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IDialogService, IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IFileService } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { Extensions, ITreeItem, ITreeViewDataProvider, ITreeViewDescriptor, IViewContainersRegistry, IViewDescriptorService, IViewsRegistry, IViewsService, TreeItemCollapsibleState, ViewContainer, ViewContainerLocation } from 'vs/workbench/common/views';
import { IUserDataProfile, IUserDataProfilesService, toUserDataProfile } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Registry } from 'vs/platform/registry/common/platform';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { ILogService } from 'vs/platform/log/common/log';
import { TreeView, TreeViewPane } from 'vs/workbench/browser/parts/views/treeView';
import { SettingsResource, SettingsResourceTreeItem } from 'vs/workbench/services/userDataProfile/browser/settingsResource';
import { KeybindingsResource, KeybindingsResourceTreeItem } from 'vs/workbench/services/userDataProfile/browser/keybindingsResource';
import { SnippetsResource, SnippetsResourceTreeItem } from 'vs/workbench/services/userDataProfile/browser/snippetsResource';
import { TasksResource, TasksResourceTreeItem } from 'vs/workbench/services/userDataProfile/browser/tasksResource';
import { ExtensionsResource, ExtensionsResourceExportTreeItem, ExtensionsResourceImportTreeItem, ExtensionsResourceTreeItem } from 'vs/workbench/services/userDataProfile/browser/extensionsResource';
import { GlobalStateResource, GlobalStateResourceExportTreeItem, GlobalStateResourceImportTreeItem, GlobalStateResourceTreeItem } from 'vs/workbench/services/userDataProfile/browser/globalStateResource';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { Button, ButtonWithDropdown } from 'vs/base/browser/ui/button/button';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';
import { generateUuid } from 'vs/base/common/uuid';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorsOrder } from 'vs/workbench/common/editor';
import { getErrorMessage, onUnexpectedError } from 'vs/base/common/errors';
import { IProgress, IProgressService, IProgressStep, ProgressLocation } from 'vs/platform/progress/common/progress';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IQuickInputService, QuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { VSBuffer } from 'vs/base/common/buffer';
import { joinPath } from 'vs/base/common/resources';
import { escapeRegExpCharacters } from 'vs/base/common/strings';
import { Schemas } from 'vs/base/common/network';
import { CancellationToken } from 'vs/base/common/cancellation';
import Severity from 'vs/base/common/severity';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IURLHandler, IURLService } from 'vs/platform/url/common/url';
import { asText, IRequestService } from 'vs/platform/request/common/request';
import { IProductService } from 'vs/platform/product/common/productService';
import { isUndefined } from 'vs/base/common/types';
import { Action, ActionRunner, IAction, IActionRunner } from 'vs/base/common/actions';
import { Emitter } from 'vs/base/common/event';
import { showWindowLogActionId } from 'vs/workbench/common/logConstants';
import { isWeb } from 'vs/base/common/platform';

interface IUserDataProfileTemplate {
	readonly name: string;
	readonly shortName?: string;
	readonly settings?: string;
	readonly keybindings?: string;
	readonly tasks?: string;
	readonly snippets?: string;
	readonly globalState?: string;
	readonly extensions?: string;
}

function isUserDataProfileTemplate(thing: unknown): thing is IUserDataProfileTemplate {
	const candidate = thing as IUserDataProfileTemplate | undefined;

	return !!(candidate && typeof candidate === 'object'
		&& (candidate.name && typeof candidate.name === 'string')
		&& (isUndefined(candidate.shortName) || typeof candidate.shortName === 'string')
		&& (isUndefined(candidate.settings) || typeof candidate.settings === 'string')
		&& (isUndefined(candidate.globalState) || typeof candidate.globalState === 'string')
		&& (isUndefined(candidate.extensions) || typeof candidate.extensions === 'string'));
}

const TEMP_PROFILE_NAME_SEPARATOR = '-';
const EXPORT_PROFILE_PREVIEW_VIEW = 'workbench.views.profiles.export.preview';

export class UserDataProfileImportExportService extends Disposable implements IUserDataProfileImportExportService, IURLHandler {

	private static readonly PROFILE_URL_AUTHORITY_PREFIX = 'profile-';

	readonly _serviceBrand: undefined;

	private profileContentHandlers = new Map<string, IUserDataProfileContentHandler>();
	private readonly isProfileExportInProgressContextKey: IContextKey<boolean>;
	private readonly isProfileImportInProgressContextKey: IContextKey<boolean>;

	private readonly viewContainer: ViewContainer;
	private readonly fileUserDataProfileContentHandler: IUserDataProfileContentHandler;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IViewsService private readonly viewsService: IViewsService,
		@IEditorService private readonly editorService: IEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IFileService private readonly fileService: IFileService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@INotificationService private readonly notificationService: INotificationService,
		@IProgressService private readonly progressService: IProgressService,
		@IDialogService private readonly dialogService: IDialogService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IRequestService private readonly requestService: IRequestService,
		@IURLService urlService: IURLService,
		@IProductService private readonly productService: IProductService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.registerProfileContentHandler(Schemas.file, this.fileUserDataProfileContentHandler = instantiationService.createInstance(FileUserDataProfileContentHandler));
		this.isProfileExportInProgressContextKey = IS_PROFILE_EXPORT_IN_PROGRESS_CONTEXT.bindTo(contextKeyService);
		this.isProfileImportInProgressContextKey = IS_PROFILE_IMPORT_IN_PROGRESS_CONTEXT.bindTo(contextKeyService);

		this.viewContainer = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).registerViewContainer(
			{
				id: 'userDataProfiles',
				title: PROFILES_TTILE,
				ctorDescriptor: new SyncDescriptor(
					ViewPaneContainer,
					['userDataProfiles', { mergeViewWithContainerWhenSingleView: true }]
				),
				icon: defaultUserDataProfileIcon,
				hideIfEmpty: true,
			}, ViewContainerLocation.Sidebar);

		urlService.registerHandler(this);
	}

	private isProfileURL(uri: URI): boolean {
		return uri.authority === PROFILE_URL_AUTHORITY || new RegExp(`^${UserDataProfileImportExportService.PROFILE_URL_AUTHORITY_PREFIX}`).test(uri.authority);
	}

	async handleURL(uri: URI): Promise<boolean> {
		if (this.isProfileURL(uri)) {
			try {
				await this.importProfile(uri);
			} catch (error) {
				this.notificationService.error(localize('profile import error', "Error while importing profile: {0}", getErrorMessage(error)));
			}
			return true;
		}
		return false;
	}

	registerProfileContentHandler(id: string, profileContentHandler: IUserDataProfileContentHandler): IDisposable {
		if (this.profileContentHandlers.has(id)) {
			throw new Error(`Profile content handler with id '${id}' already registered.`);
		}
		this.profileContentHandlers.set(id, profileContentHandler);
		return toDisposable(() => this.unregisterProfileContentHandler(id));
	}

	unregisterProfileContentHandler(id: string): void {
		this.profileContentHandlers.delete(id);
	}

	async exportProfile(): Promise<void> {
		const view = this.viewsService.getViewWithId(EXPORT_PROFILE_PREVIEW_VIEW);
		if (view) {
			this.viewsService.openView(view.id, true);
			return;
		}

		if (this.isProfileExportInProgressContextKey.get()) {
			this.logService.warn('Profile export already in progress.');
			return;
		}

		const disposables = new DisposableStore();
		try {
			const userDataProfilesExportState = disposables.add(this.instantiationService.createInstance(UserDataProfileExportState, this.userDataProfileService.currentProfile));
			let cancel = false;
			const cancelAction = new Action('cancel', localize('cancel', "Cancel"), undefined, undefined, () => cancel = true);
			await this.showProfilePreviewView(EXPORT_PROFILE_PREVIEW_VIEW, userDataProfilesExportState.profile.name, [new Action('export', localize('export', "Export"))], cancelAction, userDataProfilesExportState);
			if (cancel) {
				return;
			}
			await this.doExportProfile(userDataProfilesExportState);
		} finally {
			disposables.dispose();
		}
	}

	async importProfile(uri: URI, options?: IProfileImportOptions): Promise<void> {
		if (this.isProfileImportInProgressContextKey.get()) {
			this.notificationService.warn('Profile import already in progress.');
			return;
		}

		this.isProfileImportInProgressContextKey.set(true);
		const disposables = new DisposableStore();
		disposables.add(toDisposable(() => this.isProfileImportInProgressContextKey.set(false)));

		try {

			let userDataProfileImportState: UserDataProfileImportState | undefined;
			let importedProfile: IUserDataProfile | undefined;

			await this.progressService.withProgress({
				location: ProgressLocation.Window,
				command: showWindowLogActionId,
			}, async progress => {
				progress.report({ message: localize('importing profile', "Importing Profile...") });
				const profileContent = await this.resolveProfileContent(uri);
				if (profileContent === null) {
					return;
				}

				const profileTemplate: IUserDataProfileTemplate = JSON.parse(profileContent);
				if (!isUserDataProfileTemplate(profileTemplate)) {
					throw new Error('Invalid profile content.');
				}

				userDataProfileImportState = disposables.add(this.instantiationService.createInstance(UserDataProfileImportState, profileTemplate));

				if (!userDataProfileImportState.isEmpty() && !options?.donotPrompt) {
					const title = localize('import profile preview', "Import");
					let cancel = false;
					const cancelAction = new Action('cancel', localize('cancel', "Cancel"), undefined, undefined, () => cancel = true);
					await this.showProfilePreviewView(`workbench.views.profiles.import.preview`, title, [new Action('import', title)], cancelAction, userDataProfileImportState);
					if (cancel) {
						return;
					}
				}

				importedProfile = await this.importAndSwitch(userDataProfileImportState, options, progress);

				if (!importedProfile) {
					return;
				}
			});

			if (!importedProfile || !userDataProfileImportState) {
				return;
			}

			if (options?.previewAsTempProfile) {
				const actions: IAction[] = [];
				if (isWeb) {
					actions.push(new Action('openInDesktop', localize('open in desktop', "Open in {0}", this.productService.nameLong), undefined, true, async () => this.openerService.open(uri, { openExternal: true })));
				}
				actions.push(new Action('saveProfile', localize('save profile', "Save Profile"), undefined, true, async () => this.saveTemporaryProfile(importedProfile!)));
				userDataProfileImportState.canSelect = false;
				await this.showProfilePreviewView(EXPORT_PROFILE_PREVIEW_VIEW, importedProfile.name, actions, new Action('close', localize('close', "Close")), userDataProfileImportState);
			} else {
				this.notificationService.notify({
					severity: Severity.Info,
					message: localize('imported profile', "Profile '{0}' is imported successfully.", importedProfile.name),
					actions: {
						primary: [new Action('profiles.showProfileContents', localize('show profile contents', "Show Profile Contents"), undefined, true, () => this.showProfileContents())]
					}
				});
			}
		} finally {
			disposables.dispose();
		}
	}

	async showProfileContents(): Promise<void> {
		const view = this.viewsService.getViewWithId(EXPORT_PROFILE_PREVIEW_VIEW);
		if (view) {
			this.viewsService.openView(view.id, true);
			return;
		}
		const disposables = new DisposableStore();
		try {
			const userDataProfilesExportState = disposables.add(this.instantiationService.createInstance(UserDataProfileExportState, this.userDataProfileService.currentProfile));
			const exportAction = new Action('export', localize('export', "Export"), undefined, true, () => this.doExportProfile(userDataProfilesExportState));
			const closeAction = new Action('close', localize('close', "Close"));
			await this.showProfilePreviewView(EXPORT_PROFILE_PREVIEW_VIEW, userDataProfilesExportState.profile.name, [exportAction], closeAction, userDataProfilesExportState);
		} finally {
			disposables.dispose();
		}
	}

	private async doExportProfile(userDataProfilesExportState: UserDataProfileExportState): Promise<void> {
		const profile = await userDataProfilesExportState.getProfileToExport();
		if (!profile) {
			return;
		}

		this.isProfileExportInProgressContextKey.set(true);
		const disposables = new DisposableStore();
		disposables.add(toDisposable(() => this.isProfileExportInProgressContextKey.set(false)));

		try {
			await this.progressService.withProgress({
				location: ProgressLocation.Window,
				title: localize('profiles.exporting', "{0}: Exporting...", PROFILES_CATEGORY.value),
			}, async progress => {
				const id = await this.pickProfileContentHandler(profile.name);
				if (!id) {
					return;
				}
				const profileContentHandler = this.profileContentHandlers.get(id);
				if (!profileContentHandler) {
					return;
				}
				const saveResult = await profileContentHandler.saveProfile(profile.name, JSON.stringify(profile), CancellationToken.None);
				if (!saveResult) {
					return;
				}
				const message = localize('export success', "Profile '{0}' is exported successfully.", profile.name);
				if (profileContentHandler.extensionId) {
					const actions: string[] = [];
					const link = this.productService.webUrl ? `${this.productService.webUrl}${PROFILE_URL_AUTHORITY}/${id}/${saveResult.id}` : toUserDataProfileUri(`/${id}/${saveResult.id}`, this.productService).toString();
					actions.push(localize('copy', "Copy Link"));
					if (this.productService.webUrl) {
						actions.push(localize('open', "Open Link"));
					} else {
						actions.push(localize('open in', "Open in {0}", profileContentHandler.name));
					}
					actions.push(localize('close', "Close"));
					const result = await this.dialogService.show(
						Severity.Info,
						message,
						actions,
						{ cancelId: 2 }
					);
					switch (result.choice) {
						case 0:
							await this.clipboardService.writeText(link);
							break;
						case 1:
							if (this.productService.webUrl) {
								await this.openerService.open(link);
							} else {
								await this.openerService.open(saveResult.link.toString());
							}
							break;

					}
				} else {
					await this.dialogService.show(Severity.Info, message);
				}
			});
		} finally {
			disposables.dispose();
		}
	}

	private async importAndSwitch(userDataProfileImportState: UserDataProfileImportState, options: IProfileImportOptions | undefined, progress: IProgress<IProgressStep>): Promise<IUserDataProfile | undefined> {
		const profileTemplate = await userDataProfileImportState.getProfileTemplateToImport();
		progress.report({ message: localize('Importing profile', "Importing Profile ({0})...", profileTemplate.name) });
		const profile = await this.getProfileToImport(profileTemplate, options?.previewAsTempProfile);
		if (!profile) {
			return undefined;
		}

		if (profileTemplate.settings) {
			progress.report({ message: localize('Importing settings', "Importing Profile ({0}): Settings...", profileTemplate.name) });
			await this.instantiationService.createInstance(SettingsResource).apply(profileTemplate.settings, profile);
		}
		if (profileTemplate.keybindings) {
			progress.report({ message: localize('importing keybindings', "Importing Profile ({0}): Keyboard Shortcuts...", profileTemplate.name) });
			await this.instantiationService.createInstance(KeybindingsResource).apply(profileTemplate.keybindings, profile);
		}
		if (profileTemplate.tasks) {
			progress.report({ message: localize('importing tasks', "Importing Profile ({0}): Tasks...", profileTemplate.name) });
			await this.instantiationService.createInstance(TasksResource).apply(profileTemplate.tasks, profile);
		}
		if (profileTemplate.snippets) {
			progress.report({ message: localize('importing snippets', "Importing Profile ({0}): Snippets...", profileTemplate.name) });
			await this.instantiationService.createInstance(SnippetsResource).apply(profileTemplate.snippets, profile);
		}
		if (profileTemplate.globalState) {
			progress.report({ message: localize('importing global state', "Importing Profile ({0}): State...", profileTemplate.name) });
			await this.instantiationService.createInstance(GlobalStateResource).apply(profileTemplate.globalState, profile);
		}
		if (profileTemplate.extensions) {
			progress.report({ message: localize('importing extensions', "Importing Profile ({0}): Extensions...", profileTemplate.name) });
			await this.instantiationService.createInstance(ExtensionsResource).apply(profileTemplate.extensions, profile);
		}

		await this.userDataProfileManagementService.switchProfile(profile);
		return profile;
	}

	private async resolveProfileContent(resource: URI): Promise<string | null> {
		if (await this.fileService.canHandleResource(resource)) {
			return this.fileUserDataProfileContentHandler.readProfile(resource, CancellationToken.None);
		}

		if (this.isProfileURL(resource)) {
			let handlerId: string, idOrUri: string | URI;
			if (resource.authority === PROFILE_URL_AUTHORITY) {
				idOrUri = this.uriIdentityService.extUri.basename(resource);
				handlerId = this.uriIdentityService.extUri.basename(this.uriIdentityService.extUri.dirname(resource));
			} else {
				handlerId = resource.authority.substring(UserDataProfileImportExportService.PROFILE_URL_AUTHORITY_PREFIX.length);
				idOrUri = URI.parse(resource.path.substring(1));
			}
			await this.extensionService.activateByEvent(`onProfile:${handlerId}`);
			const profileContentHandler = this.profileContentHandlers.get(handlerId);
			if (profileContentHandler) {
				return profileContentHandler.readProfile(idOrUri, CancellationToken.None);
			}
		}

		await this.extensionService.activateByEvent('onProfile');
		for (const profileContentHandler of this.profileContentHandlers.values()) {
			const content = await profileContentHandler.readProfile(resource, CancellationToken.None);
			if (content !== null) {
				return content;
			}
		}

		const context = await this.requestService.request({ type: 'GET', url: resource.toString(true) }, CancellationToken.None);
		if (context.res.statusCode === 200) {
			return await asText(context);
		} else {
			const message = await asText(context);
			throw new Error(`Failed to get profile from URL: ${resource.toString()}. Status code: ${context.res.statusCode}. Message: ${message}`);
		}
	}

	private async pickProfileContentHandler(name: string): Promise<string | undefined> {
		await this.extensionService.activateByEvent('onProfile');
		if (this.profileContentHandlers.size === 1) {
			return this.profileContentHandlers.values().next().value;
		}
		const options: QuickPickItem[] = [];
		for (const [id, profileContentHandler] of this.profileContentHandlers) {
			options.push({ id, label: profileContentHandler.name, description: profileContentHandler.description });
		}
		const result = await this.quickInputService.pick(options.reverse(),
			{
				title: localize('select profile content handler', "Export '{0}' profile as...", name),
				hideInput: true
			});
		return result?.id;
	}

	private async getProfileToImport(profileTemplate: IUserDataProfileTemplate, temp?: boolean): Promise<IUserDataProfile | undefined> {
		let name: string | undefined = temp ? localize('temporary', "{0} {1} Temporary", profileTemplate.name, TEMP_PROFILE_NAME_SEPARATOR) : profileTemplate.name;
		const profile = this.userDataProfilesService.profiles.find(p => p.name === name);
		if (profile) {
			if (temp) {
				return this.userDataProfilesService.createNamedProfile(`${name} ${this.getProfileNameIndex(name)}`, { shortName: profileTemplate.shortName, transient: temp });
			}

			const result = await this.dialogService.show(
				Severity.Info,
				localize('profile already exists', "Profile with name '{0}' already exists. Do you want to overwrite it?", name),
				[localize('overwrite', "Overwrite"), localize('create new', "Create New Profile"), localize('cancel', "Cancel")],
				{ cancelId: 2 }
			);
			switch (result.choice) {
				case 0: return profile;
				case 2: return undefined;
			}

			// Create new profile
			name = await this.quickInputService.input({
				placeHolder: localize('name', "Profile name"),
				title: localize('create new', "Create New Profile"),
				value: `${name} ${this.getProfileNameIndex(name)}`,
				validateInput: async (value: string) => {
					if (this.userDataProfilesService.profiles.some(p => p.name === value)) {
						return localize('profileExists', "Profile with name {0} already exists.", value);
					}
					return undefined;
				}
			});
			if (!name) {
				return undefined;
			}
			return this.userDataProfilesService.createNamedProfile(name);
		} else {
			return this.userDataProfilesService.createNamedProfile(name, { shortName: profileTemplate.shortName, transient: temp });
		}
	}

	private getProfileNameIndex(name: string): number {
		const nameRegEx = new RegExp(`${escapeRegExpCharacters(name)}\\s(\\d+)`);
		let nameIndex = 0;
		for (const profile of this.userDataProfilesService.profiles) {
			const matches = nameRegEx.exec(profile.name);
			const index = matches ? parseInt(matches[1]) : 0;
			nameIndex = index > nameIndex ? index : nameIndex;
		}
		return nameIndex + 1;
	}

	private async saveTemporaryProfile(profile: IUserDataProfile): Promise<void> {
		let name: string | undefined = profile.name.substring(0, profile.name.lastIndexOf(TEMP_PROFILE_NAME_SEPARATOR) - 1);
		if (this.userDataProfilesService.profiles.some(p => p.name === name)) {
			name = await this.quickInputService.input({
				placeHolder: localize('name', "Profile name"),
				title: localize('save profile', "Save Profile"),
				value: `${name} ${this.getProfileNameIndex(name)}`,
				validateInput: async (value: string) => {
					if (this.userDataProfilesService.profiles.some(p => p.name === value)) {
						return localize('profileExists', "Profile with name {0} already exists.", value);
					}
					return undefined;
				}
			});
		}
		if (name) {
			await this.userDataProfilesService.updateProfile(profile, { name, transient: false });
		}
	}

	private async showProfilePreviewView(id: string, name: string, confirmActions: IAction[], cancelAction: IAction, userDataProfilesData: UserDataProfileImportExportState): Promise<void> {
		const disposables = new DisposableStore();
		const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
		const treeView = disposables.add(this.instantiationService.createInstance(TreeView, id, name));
		treeView.showRefreshAction = true;
		const actionRunner = new ActionRunner();
		const exportPreviewConfirmPomise = new Promise<void>((c, e) => {
			disposables.add(actionRunner.onDidRun(e => c()));
			disposables.add(this.userDataProfileService.onDidChangeCurrentProfile(() => e()));
		});
		const descriptor: ITreeViewDescriptor = {
			id,
			name,
			ctorDescriptor: new SyncDescriptor(UserDataProfilePreviewViewPane, [userDataProfilesData, confirmActions, cancelAction, actionRunner]),
			canToggleVisibility: false,
			canMoveView: false,
			treeView,
			collapsed: false,
		};

		try {
			viewsRegistry.registerViews([descriptor], this.viewContainer);
			await this.viewsService.openView(id, true);
			await exportPreviewConfirmPomise;
		} finally {
			viewsRegistry.deregisterViews([descriptor], this.viewContainer);
			disposables.dispose();
			this.closeAllImportExportPreviewEditors().then(null, onUnexpectedError);
		}
	}

	private async closeAllImportExportPreviewEditors(): Promise<void> {
		const editorsToColse = this.editorService.getEditors(EditorsOrder.SEQUENTIAL).filter(({ editor }) => editor.resource?.scheme === USER_DATA_PROFILE_EXPORT_SCHEME || editor.resource?.scheme === USER_DATA_PROFILE_EXPORT_PREVIEW_SCHEME || editor.resource?.scheme === USER_DATA_PROFILE_IMPORT_PREVIEW_SCHEME);
		if (editorsToColse.length) {
			await this.editorService.closeEditors(editorsToColse);
		}
	}

	async setProfile(profile: IUserDataProfileTemplate): Promise<void> {
		await this.progressService.withProgress({
			location: ProgressLocation.Notification,
			title: localize('profiles.applying', "{0}: Applying...", PROFILES_CATEGORY.value),
		}, async progress => {
			if (profile.settings) {
				await this.instantiationService.createInstance(SettingsResource).apply(profile.settings, this.userDataProfileService.currentProfile);
			}
			if (profile.globalState) {
				await this.instantiationService.createInstance(GlobalStateResource).apply(profile.globalState, this.userDataProfileService.currentProfile);
			}
			if (profile.extensions) {
				await this.instantiationService.createInstance(ExtensionsResource).apply(profile.extensions, this.userDataProfileService.currentProfile);
			}
		});
		this.notificationService.info(localize('applied profile', "{0}: Applied successfully.", PROFILES_CATEGORY.value));
	}

}

class FileUserDataProfileContentHandler implements IUserDataProfileContentHandler {

	readonly name = localize('local', "Local");
	readonly description = localize('file', "file");

	constructor(
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IFileService private readonly fileService: IFileService,
		@ITextFileService private readonly textFileService: ITextFileService,
	) { }

	async saveProfile(name: string, content: string, token: CancellationToken): Promise<ISaveProfileResult | null> {
		const link = await this.fileDialogService.showSaveDialog({
			title: localize('export profile dialog', "Save Profile"),
			filters: PROFILE_FILTER,
			defaultUri: this.uriIdentityService.extUri.joinPath(await this.fileDialogService.defaultFilePath(), `${name}.${PROFILE_EXTENSION}`),
		});
		if (!link) {
			return null;
		}
		await this.textFileService.create([{ resource: link, value: content, options: { overwrite: true } }]);
		return { link, id: link.toString() };
	}

	async readProfile(uri: URI, token: CancellationToken): Promise<string | null> {
		if (await this.fileService.canHandleResource(uri)) {
			return (await this.fileService.readFile(uri, undefined, token)).value.toString();
		}
		return null;
	}

	async selectProfile(): Promise<URI | null> {
		const profileLocation = await this.fileDialogService.showOpenDialog({
			canSelectFolders: false,
			canSelectFiles: true,
			canSelectMany: false,
			filters: PROFILE_FILTER,
			title: localize('select profile', "Select Profile"),
		});
		return profileLocation ? profileLocation[0] : null;
	}

}

class UserDataProfilePreviewViewPane extends TreeViewPane {

	private buttonsContainer!: HTMLElement;
	private confirmButton!: Button | ButtonWithDropdown;
	private cancelButton!: Button;
	private dimension: DOM.Dimension | undefined;
	private totalTreeItemsCount: number = 0;

	constructor(
		private readonly userDataProfileData: UserDataProfileImportExportState,
		private readonly confirmActions: IAction[],
		private readonly cancelAction: IAction,
		private readonly actionRunner: IActionRunner,
		options: IViewletViewOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@INotificationService notificationService: INotificationService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, notificationService);
	}


	protected override renderTreeView(container: HTMLElement): void {
		this.treeView.dataProvider = this.userDataProfileData;
		super.renderTreeView(DOM.append(container, DOM.$('')));
		this.createButtons(container);
		this._register(this.treeView.onDidChangeCheckboxState(items => {
			this.treeView.refresh(this.userDataProfileData.onDidChangeCheckboxState(items));
			this.updateConfirmButtonEnablement();
		}));
		this.computeAndLayout();
		this._register(this.userDataProfileData.onDidChangeRoots(() => this.computeAndLayout()));
	}

	private async computeAndLayout() {
		const roots = await this.userDataProfileData.getRoots();
		const children = await Promise.all(roots.map(async (root) => {
			if (root.collapsibleState === TreeItemCollapsibleState.Expanded) {
				const children = await root.getChildren();
				return children ?? [];
			}
			return [];
		}));
		this.totalTreeItemsCount = roots.length + children.flat().length;
		this.updateConfirmButtonEnablement();
		if (this.dimension) {
			this.layoutTreeView(this.dimension.height, this.dimension.width);
		}
	}

	private createButtons(container: HTMLElement): void {
		this.buttonsContainer = DOM.append(container, DOM.$('.profile-view-buttons-container'));

		this.confirmButton = this._register(this.confirmActions.length > 1
			? new ButtonWithDropdown(this.buttonsContainer, { ...defaultButtonStyles, actions: this.confirmActions.slice(1), contextMenuProvider: this.contextMenuService, actionRunner: this.actionRunner, addPrimaryActionToDropdown: false })
			: new Button(this.buttonsContainer, { ...defaultButtonStyles }));
		this.confirmButton.element.classList.add('profile-view-button');
		this.confirmButton.label = this.confirmActions[0].label;
		this.confirmButton.enabled = false;
		this._register(this.confirmButton.onDidClick(() => this.actionRunner.run(this.confirmActions[0])));

		this.cancelButton = this._register(new Button(this.buttonsContainer, { secondary: true, ...defaultButtonStyles }));
		this.cancelButton.label = this.cancelAction.label;
		this.cancelButton.element.classList.add('profile-view-button');
		this._register(this.cancelButton.onDidClick(() => this.actionRunner.run(this.cancelAction)));
	}


	protected override layoutTreeView(height: number, width: number): void {
		this.dimension = new DOM.Dimension(width, height);
		const buttonContainerHeight = 108;
		this.buttonsContainer.style.height = `${buttonContainerHeight}px`;
		this.buttonsContainer.style.width = `${width}px`;

		super.layoutTreeView(Math.min(height - buttonContainerHeight, 22 * (Math.max(this.totalTreeItemsCount, 6) || 12)), width);
	}

	private updateConfirmButtonEnablement(): void {
		this.confirmButton.enabled = this.userDataProfileData.isEnabled();
	}

}

const USER_DATA_PROFILE_EXPORT_SCHEME = 'userdataprofileexport';
const USER_DATA_PROFILE_EXPORT_PREVIEW_SCHEME = 'userdataprofileexportpreview';
const USER_DATA_PROFILE_IMPORT_PREVIEW_SCHEME = 'userdataprofileimportpreview';

abstract class UserDataProfileImportExportState extends Disposable implements ITreeViewDataProvider {

	private readonly _onDidChangeRoots = this._register(new Emitter<void>());
	readonly onDidChangeRoots = this._onDidChangeRoots.event;

	constructor(
		@IQuickInputService protected readonly quickInputService: IQuickInputService,
	) {
		super();
	}

	private _canSelect = true;
	get canSelect(): boolean {
		return this._canSelect;
	}
	set canSelect(canSelect: boolean) {
		this._canSelect = canSelect;
		this.rootsPromise = undefined;
	}

	onDidChangeCheckboxState(items: ITreeItem[]): ITreeItem[] {
		const toRefresh: ITreeItem[] = [];
		for (const item of items) {
			if (item.children) {
				for (const child of item.children) {
					if (child.checkbox) {
						child.checkbox.isChecked = !!item.checkbox?.isChecked;
					}
				}
				toRefresh.push(item);
			} else {
				const parent = (<IProfileResourceChildTreeItem>item).parent;
				if (item.checkbox?.isChecked && parent?.checkbox) {
					parent.checkbox.isChecked = true;
					toRefresh.push(parent);
				}
			}
		}
		return items;
	}

	async getChildren(element?: ITreeItem): Promise<ITreeItem[] | undefined> {
		if (element) {
			return (<IProfileResourceTreeItem>element).getChildren();
		} else {
			this.rootsPromise = undefined;
			this._onDidChangeRoots.fire();
			return this.getRoots();
		}
	}

	private roots: IProfileResourceTreeItem[] = [];
	private rootsPromise: Promise<IProfileResourceTreeItem[]> | undefined;
	getRoots(): Promise<IProfileResourceTreeItem[]> {
		if (!this.rootsPromise) {
			this.rootsPromise = (async () => {
				this.roots = await this.fetchRoots();
				for (const root of this.roots) {
					if (this.canSelect) {
						root.checkbox = { isChecked: true };
					} else {
						root.checkbox = undefined;
					}
				}
				return this.roots;
			})();
		}
		return this.rootsPromise;
	}

	isEnabled(resourceType?: ProfileResourceType): boolean {
		if (resourceType !== undefined) {
			return this.roots.some(root => root.type === resourceType && this.isSelected(root));
		}
		return this.roots.some(root => this.isSelected(root));
	}

	protected async getProfileTemplate(name: string, shortName: string | undefined): Promise<IUserDataProfileTemplate> {
		const roots = await this.getRoots();
		let settings: string | undefined;
		let keybindings: string | undefined;
		let tasks: string | undefined;
		let snippets: string | undefined;
		let extensions: string | undefined;
		let globalState: string | undefined;
		for (const root of roots) {
			if (!this.isSelected(root)) {
				continue;
			}
			if (root instanceof SettingsResourceTreeItem) {
				settings = await root.getContent();
			} else if (root instanceof KeybindingsResourceTreeItem) {
				keybindings = await root.getContent();
			} else if (root instanceof TasksResourceTreeItem) {
				tasks = await root.getContent();
			} else if (root instanceof SnippetsResourceTreeItem) {
				snippets = await root.getContent();
			} else if (root instanceof ExtensionsResourceTreeItem) {
				extensions = await root.getContent();
			} else if (root instanceof GlobalStateResourceTreeItem) {
				globalState = await root.getContent();
			}
		}

		return {
			name,
			shortName,
			settings,
			keybindings,
			tasks,
			snippets,
			extensions,
			globalState
		};
	}

	private isSelected(treeItem: IProfileResourceTreeItem): boolean {
		return treeItem.checkbox?.isChecked ?? true;
	}

	protected abstract fetchRoots(): Promise<IProfileResourceTreeItem[]>;
}

class UserDataProfileExportState extends UserDataProfileImportExportState {

	private readonly disposables = this._register(new DisposableStore());

	constructor(
		readonly profile: IUserDataProfile,
		@IQuickInputService quickInputService: IQuickInputService,
		@IFileService private readonly fileService: IFileService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(quickInputService);
	}

	protected async fetchRoots(): Promise<IProfileResourceTreeItem[]> {
		this.disposables.clear();
		this.disposables.add(this.fileService.registerProvider(USER_DATA_PROFILE_EXPORT_SCHEME, this._register(new InMemoryFileSystemProvider())));
		const previewFileSystemProvider = this._register(new InMemoryFileSystemProvider());
		this.disposables.add(this.fileService.registerProvider(USER_DATA_PROFILE_EXPORT_PREVIEW_SCHEME, previewFileSystemProvider));
		const roots: IProfileResourceTreeItem[] = [];
		const exportPreviewProfle = this.createExportPreviewProfile(this.profile);

		const settingsResource = this.instantiationService.createInstance(SettingsResource);
		const settingsContent = await settingsResource.getContent(this.profile);
		await settingsResource.apply(settingsContent, exportPreviewProfle);
		const settingsResourceTreeItem = this.instantiationService.createInstance(SettingsResourceTreeItem, exportPreviewProfle);
		if (await settingsResourceTreeItem.hasContent()) {
			roots.push(settingsResourceTreeItem);
		}

		const keybindingsResource = this.instantiationService.createInstance(KeybindingsResource);
		const keybindingsContent = await keybindingsResource.getContent(this.profile);
		await keybindingsResource.apply(keybindingsContent, exportPreviewProfle);
		const keybindingsResourceTreeItem = this.instantiationService.createInstance(KeybindingsResourceTreeItem, exportPreviewProfle);
		if (await keybindingsResourceTreeItem.hasContent()) {
			roots.push(keybindingsResourceTreeItem);
		}

		const snippetsResource = this.instantiationService.createInstance(SnippetsResource);
		const snippetsContent = await snippetsResource.getContent(this.profile);
		await snippetsResource.apply(snippetsContent, exportPreviewProfle);
		const snippetsResourceTreeItem = this.instantiationService.createInstance(SnippetsResourceTreeItem, exportPreviewProfle);
		if (await snippetsResourceTreeItem.hasContent()) {
			roots.push(snippetsResourceTreeItem);
		}

		const tasksResource = this.instantiationService.createInstance(TasksResource);
		const tasksContent = await tasksResource.getContent(this.profile);
		await tasksResource.apply(tasksContent, exportPreviewProfle);
		const tasksResourceTreeItem = this.instantiationService.createInstance(TasksResourceTreeItem, exportPreviewProfle);
		if (await tasksResourceTreeItem.hasContent()) {
			roots.push(tasksResourceTreeItem);
		}

		const globalStateResource = joinPath(exportPreviewProfle.globalStorageHome, 'globalState.json').with({ scheme: USER_DATA_PROFILE_EXPORT_PREVIEW_SCHEME });
		const globalStateResourceTreeItem = this.instantiationService.createInstance(GlobalStateResourceExportTreeItem, exportPreviewProfle, globalStateResource);
		const content = await globalStateResourceTreeItem.getContent();
		if (content) {
			await this.fileService.writeFile(globalStateResource, VSBuffer.fromString(JSON.stringify(JSON.parse(content), null, '\t')));
			roots.push(globalStateResourceTreeItem);
		}

		const extensionsResourceTreeItem = this.instantiationService.createInstance(ExtensionsResourceExportTreeItem, exportPreviewProfle);
		if (await extensionsResourceTreeItem.hasContent()) {
			roots.push(extensionsResourceTreeItem);
		}

		previewFileSystemProvider.setReadOnly(true);

		return roots;
	}

	private createExportPreviewProfile(profile: IUserDataProfile): IUserDataProfile {
		return {
			id: profile.id,
			name: profile.name,
			location: profile.location,
			isDefault: profile.isDefault,
			shortName: profile.shortName,
			globalStorageHome: profile.globalStorageHome,
			settingsResource: profile.settingsResource.with({ scheme: USER_DATA_PROFILE_EXPORT_SCHEME }),
			keybindingsResource: profile.keybindingsResource.with({ scheme: USER_DATA_PROFILE_EXPORT_SCHEME }),
			tasksResource: profile.tasksResource.with({ scheme: USER_DATA_PROFILE_EXPORT_SCHEME }),
			snippetsHome: profile.snippetsHome.with({ scheme: USER_DATA_PROFILE_EXPORT_SCHEME }),
			extensionsResource: profile.extensionsResource,
			useDefaultFlags: profile.useDefaultFlags,
			isTransient: profile.isTransient
		};
	}

	async getProfileToExport(): Promise<IUserDataProfileTemplate | null> {
		let name: string | undefined = this.profile.name;
		if (this.profile.isDefault) {
			name = await this.quickInputService.input({
				placeHolder: localize('export profile name', "Name the profile"),
				title: localize('export profile title', "Export Profile"),
				async validateInput(input) {
					if (!input.trim()) {
						return localize('profile name required', "Profile name must be provided.");
					}
					return undefined;
				},
			});
			if (!name) {
				return null;
			}
		}

		return super.getProfileTemplate(name, this.profile.shortName);
	}

}

class UserDataProfileImportState extends UserDataProfileImportExportState {

	private readonly disposables = this._register(new DisposableStore());

	constructor(
		private readonly profile: IUserDataProfileTemplate,
		@IFileService private readonly fileService: IFileService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(quickInputService);
	}

	protected async fetchRoots(): Promise<IProfileResourceTreeItem[]> {
		this.disposables.clear();

		const inMemoryProvider = this._register(new InMemoryFileSystemProvider());
		this.disposables.add(this.fileService.registerProvider(USER_DATA_PROFILE_IMPORT_PREVIEW_SCHEME, inMemoryProvider));
		const roots: IProfileResourceTreeItem[] = [];
		const importPreviewProfle = toUserDataProfile(generateUuid(), this.profile.name, URI.file('/root').with({ scheme: USER_DATA_PROFILE_IMPORT_PREVIEW_SCHEME }));

		if (this.profile.settings) {
			const settingsResource = this.instantiationService.createInstance(SettingsResource);
			await settingsResource.apply(this.profile.settings, importPreviewProfle);
			const settingsResourceTreeItem = this.instantiationService.createInstance(SettingsResourceTreeItem, importPreviewProfle);
			if (await settingsResourceTreeItem.hasContent()) {
				roots.push(settingsResourceTreeItem);
			}
		}

		if (this.profile.keybindings) {
			const keybindingsResource = this.instantiationService.createInstance(KeybindingsResource);
			await keybindingsResource.apply(this.profile.keybindings, importPreviewProfle);
			const keybindingsResourceTreeItem = this.instantiationService.createInstance(KeybindingsResourceTreeItem, importPreviewProfle);
			if (await keybindingsResourceTreeItem.hasContent()) {
				roots.push(keybindingsResourceTreeItem);
			}
		}

		if (this.profile.snippets) {
			const snippetsResource = this.instantiationService.createInstance(SnippetsResource);
			await snippetsResource.apply(this.profile.snippets, importPreviewProfle);
			const snippetsResourceTreeItem = this.instantiationService.createInstance(SnippetsResourceTreeItem, importPreviewProfle);
			if (await snippetsResourceTreeItem.hasContent()) {
				roots.push(snippetsResourceTreeItem);
			}
		}

		if (this.profile.tasks) {
			const tasksResource = this.instantiationService.createInstance(TasksResource);
			await tasksResource.apply(this.profile.tasks, importPreviewProfle);
			const tasksResourceTreeItem = this.instantiationService.createInstance(TasksResourceTreeItem, importPreviewProfle);
			if (await tasksResourceTreeItem.hasContent()) {
				roots.push(tasksResourceTreeItem);
			}
		}

		if (this.profile.globalState) {
			const globalStateResource = joinPath(importPreviewProfle.globalStorageHome, 'globalState.json');
			const content = VSBuffer.fromString(JSON.stringify(JSON.parse(this.profile.globalState), null, '\t'));
			if (content) {
				await this.fileService.writeFile(globalStateResource, content);
				roots.push(this.instantiationService.createInstance(GlobalStateResourceImportTreeItem, this.profile.globalState, globalStateResource));
			}
		}

		if (this.profile.extensions) {
			const extensionsResourceTreeItem = this.instantiationService.createInstance(ExtensionsResourceImportTreeItem, this.profile.extensions);
			if (await extensionsResourceTreeItem.hasContent()) {
				roots.push(extensionsResourceTreeItem);
			}
		}

		inMemoryProvider.setReadOnly(true);

		return roots;
	}

	isEmpty(): boolean {
		return !(this.profile.settings || this.profile.keybindings || this.profile.tasks || this.profile.snippets || this.profile.globalState || this.profile.extensions);
	}

	async getProfileTemplateToImport(): Promise<IUserDataProfileTemplate> {
		return this.getProfileTemplate(this.profile.name, this.profile.shortName);
	}

}

registerSingleton(IUserDataProfileImportExportService, UserDataProfileImportExportService, InstantiationType.Delayed);
