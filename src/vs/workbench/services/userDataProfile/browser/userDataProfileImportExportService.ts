/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import * as DOM from 'vs/base/browser/dom';
import { IUserDataProfileImportExportService, PROFILE_FILTER, PROFILE_EXTENSION, IUserDataProfileContentHandler, IS_PROFILE_IMPORT_EXPORT_IN_PROGRESS_CONTEXT, PROFILES_TTILE, defaultUserDataProfileIcon, IUserDataProfileService, IProfileResourceTreeItem, IProfileResourceChildTreeItem, PROFILES_CATEGORY, isUserDataProfileTemplate, IUserDataProfileManagementService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
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
import { ExtensionsResource, ExtensionsResourceExportTreeItem, ExtensionsResourceImportTreeItem } from 'vs/workbench/services/userDataProfile/browser/extensionsResource';
import { GlobalStateResource, GlobalStateResourceExportTreeItem, GlobalStateResourceImportTreeItem } from 'vs/workbench/services/userDataProfile/browser/globalStateResource';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { Button } from 'vs/base/browser/ui/button/button';
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
import { onUnexpectedError } from 'vs/base/common/errors';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { VSBuffer } from 'vs/base/common/buffer';
import { joinPath } from 'vs/base/common/resources';
import { escapeRegExpCharacters } from 'vs/base/common/strings';

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

export class UserDataProfileImportExportService extends Disposable implements IUserDataProfileImportExportService {

	readonly _serviceBrand: undefined;

	private profileContentHandlers = new Map<string, IUserDataProfileContentHandler>();
	private readonly isProfileImportExportInProgressContextKey: IContextKey<boolean>;

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
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.registerProfileContentHandler(this.fileUserDataProfileContentHandler = instantiationService.createInstance(FileUserDataProfileContentHandler));
		this.isProfileImportExportInProgressContextKey = IS_PROFILE_IMPORT_EXPORT_IN_PROGRESS_CONTEXT.bindTo(contextKeyService);

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
	}

	registerProfileContentHandler(profileContentHandler: IUserDataProfileContentHandler): void {
		if (this.profileContentHandlers.has(profileContentHandler.id)) {
			throw new Error(`Profile content handler with id '${profileContentHandler.id}' already registered.`);
		}
		this.profileContentHandlers.set(profileContentHandler.id, profileContentHandler);
	}

	async exportProfile(): Promise<void> {
		if (this.isProfileImportExportInProgressContextKey.get()) {
			this.logService.warn('Profile import/export already in progress.');
			return;
		}

		this.isProfileImportExportInProgressContextKey.set(true);
		const disposables = new DisposableStore();

		try {
			disposables.add(toDisposable(() => this.isProfileImportExportInProgressContextKey.set(false)));
			const userDataProfilesData = disposables.add(this.instantiationService.createInstance(UserDataProfileExportData, this.userDataProfileService.currentProfile));
			const exportProfile = await this.showProfilePreviewView(`workbench.views.profiles.export.preview`, localize('export profile preview', "Export"), userDataProfilesData);
			if (exportProfile) {
				const profile = await userDataProfilesData.getProfileToExport();
				if (!profile) {
					return;
				}
				const resource = await this.saveProfileContent(profile.name, JSON.stringify(profile));
				if (resource) {
					this.notificationService.info(localize('export success', "{0}: Exported successfully.", PROFILES_CATEGORY.value));
				}
			}
		} finally {
			disposables.dispose();
		}
	}

	async importProfile(uri: URI): Promise<void> {
		if (this.isProfileImportExportInProgressContextKey.get()) {
			this.logService.warn('Profile import/export already in progress.');
			return;
		}

		this.isProfileImportExportInProgressContextKey.set(true);
		const disposables = new DisposableStore();
		disposables.add(toDisposable(() => this.isProfileImportExportInProgressContextKey.set(false)));

		try {
			const profileContent = await this.resolveProfileContent(uri);
			if (profileContent === null) {
				return;
			}
			const profileTemplate: IUserDataProfileTemplate = JSON.parse(profileContent);
			if (!isUserDataProfileTemplate(profileTemplate)) {
				this.notificationService.error('Invalid profile content.');
				return;
			}
			const userDataProfilesData = disposables.add(this.instantiationService.createInstance(UserDataProfileImportData, profileTemplate));
			const importProfile = await this.showProfilePreviewView(`workbench.views.profiles.import.preview`, localize('import profile preview', "Import"), userDataProfilesData);
			if (!importProfile) {
				return;
			}
			const profile = await this.getProfileToImport(profileTemplate);
			if (!profile) {
				return;
			}
			await this.progressService.withProgress({
				location: ProgressLocation.Notification,
				title: localize('profiles.importing', "{0}: Importing...", PROFILES_CATEGORY.value),
			}, async progress => {
				if (profileTemplate.settings) {
					await this.instantiationService.createInstance(SettingsResource).apply(profileTemplate.settings, profile);
				}
				if (profileTemplate.keybindings) {
					await this.instantiationService.createInstance(KeybindingsResource).apply(profileTemplate.keybindings, profile);
				}
				if (profileTemplate.tasks) {
					await this.instantiationService.createInstance(TasksResource).apply(profileTemplate.tasks, profile);
				}
				if (profileTemplate.snippets) {
					await this.instantiationService.createInstance(SnippetsResource).apply(profileTemplate.snippets, profile);
				}
				if (profileTemplate.globalState) {
					await this.instantiationService.createInstance(GlobalStateResource).apply(profileTemplate.globalState, profile);
				}
				if (profileTemplate.extensions) {
					await this.instantiationService.createInstance(ExtensionsResource).apply(profileTemplate.extensions, profile);
				}
				await this.userDataProfileManagementService.switchProfile(profile);
			});

			this.notificationService.info(localize('imported profile', "{0}: Imported successfully.", PROFILES_CATEGORY.value));
		} finally {
			disposables.dispose();
		}
	}

	private async saveProfileContent(name: string, content: string): Promise<URI | null> {
		const profileContentHandler = await this.pickProfileContentHandler();
		if (!profileContentHandler) {
			return null;
		}
		const resource = await profileContentHandler.saveProfile(name, content);
		return resource;
	}

	private async resolveProfileContent(resource: URI): Promise<string | null> {
		if (await this.fileService.canHandleResource(resource)) {
			return this.fileUserDataProfileContentHandler.readProfile(resource);
		}
		await this.extensionService.activateByEvent(`onProfile:import:${resource.authority}`);
		const profileContentHandler = this.profileContentHandlers.get(resource.authority);
		return profileContentHandler?.readProfile(resource) ?? null;
	}

	private async pickProfileContentHandler(): Promise<IUserDataProfileContentHandler | undefined> {
		if (this.profileContentHandlers.size === 1) {
			return this.profileContentHandlers.values().next().value;
		}
		await this.extensionService.activateByEvent('onProfile:export');
		return undefined;
	}

	private async getProfileToImport(profileTemplate: IUserDataProfileTemplate): Promise<IUserDataProfile | undefined> {
		const profile = this.userDataProfilesService.profiles.find(p => p.name === profileTemplate.name);
		if (profile) {
			const confirmation = await this.dialogService.confirm({
				type: 'info',
				message: localize('profile already exists', "Profile with name '{0}' already exists. Do you want to overwrite it?", profileTemplate.name),
				primaryButton: localize('overwrite', "Overwrite"),
				secondaryButton: localize('create new', "Create New Profile"),
			});
			if (confirmation.confirmed) {
				return profile;
			}
			const nameRegEx = new RegExp(`${escapeRegExpCharacters(profileTemplate.name)}\\s(\\d+)`);
			let nameIndex = 0;
			for (const profile of this.userDataProfilesService.profiles) {
				const matches = nameRegEx.exec(profile.name);
				const index = matches ? parseInt(matches[1]) : 0;
				nameIndex = index > nameIndex ? index : nameIndex;
			}
			const name = await this.quickInputService.input({
				placeHolder: localize('name', "Profile name"),
				title: localize('create new', "Create New Profile"),
				value: `${profileTemplate.name} ${nameIndex + 1}`,
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
			return this.userDataProfilesService.createNamedProfile(profileTemplate.name, { shortName: profileTemplate.shortName });
		}
	}

	private async showProfilePreviewView(id: string, name: string, userDataProfilesData: UserDataProfileTreeViewData): Promise<boolean> {
		const disposables = new DisposableStore();
		const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
		const treeView = disposables.add(this.instantiationService.createInstance(TreeView, id, name));
		treeView.showRefreshAction = true;
		let onConfirm: (() => void) | undefined, onCancel: (() => void) | undefined;
		const exportPreviewConfirmPomise = new Promise<void>((c, e) => { onConfirm = c; onCancel = e; });
		const descriptor: ITreeViewDescriptor = {
			id,
			name,
			ctorDescriptor: new SyncDescriptor(UserDataProfileExportViewPane, [userDataProfilesData, name, onConfirm, onCancel]),
			canToggleVisibility: false,
			canMoveView: false,
			treeView,
			collapsed: false,
		};

		try {
			viewsRegistry.registerViews([descriptor], this.viewContainer);
			await this.viewsService.openView(id, true);
			await exportPreviewConfirmPomise;
			return true;
		} catch {
			return false;
		} finally {
			viewsRegistry.deregisterViews([descriptor], this.viewContainer);
			disposables.dispose();
			this.closeAllImportExportPreviewEditors().then(null, onUnexpectedError);
		}
	}

	private async closeAllImportExportPreviewEditors(): Promise<void> {
		const editorsToColse = this.editorService.getEditors(EditorsOrder.SEQUENTIAL).filter(({ editor }) => editor.resource?.scheme === USER_DATA_PROFILE_IMPORT_EXPORT_SCHEME || editor.resource?.scheme === USER_DATA_PROFILE_IMPORT_EXPORT_PREVIEW_SCHEME);
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

	readonly id = 'file';
	readonly name = localize('file', "File");

	constructor(
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IFileService private readonly fileService: IFileService,
		@ITextFileService private readonly textFileService: ITextFileService,
	) { }

	async saveProfile(name: string, content: string): Promise<URI | null> {
		const profileLocation = await this.fileDialogService.showSaveDialog({
			title: localize('export profile dialog', "Save Profile"),
			filters: PROFILE_FILTER,
			defaultUri: this.uriIdentityService.extUri.joinPath(await this.fileDialogService.defaultFilePath(), `${name}.${PROFILE_EXTENSION}`),
		});
		if (!profileLocation) {
			return null;
		}
		await this.textFileService.create([{ resource: profileLocation, value: content, options: { overwrite: true } }]);
		return profileLocation;
	}

	async readProfile(uri: URI): Promise<string> {
		return (await this.fileService.readFile(uri)).value.toString();
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

class UserDataProfileExportViewPane extends TreeViewPane {

	private buttonsContainer!: HTMLElement;
	private confirmButton!: Button;
	private cancelButton!: Button;
	private dimension: DOM.Dimension | undefined;
	private totalTreeItemsCount: number = 0;

	constructor(
		private readonly userDataProfileData: UserDataProfileTreeViewData,
		private readonly confirmLabel: string,
		private readonly onConfirm: () => void,
		private readonly onCancel: () => void,
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
		this.userDataProfileData.getRoots().then(async roots => {
			const children = await Promise.all(roots.map(async root => {
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
		});
	}

	private createButtons(container: HTMLElement): void {
		this.buttonsContainer = DOM.append(container, DOM.$('.manual-sync-buttons-container'));

		this.confirmButton = this._register(new Button(this.buttonsContainer, { ...defaultButtonStyles }));
		this.confirmButton.label = this.confirmLabel;
		this.confirmButton.enabled = false;
		this._register(this.confirmButton.onDidClick(() => this.onConfirm()));

		this.cancelButton = this._register(new Button(this.buttonsContainer, { secondary: true, ...defaultButtonStyles }));
		this.cancelButton.label = localize('cancel', "Cancel");
		this._register(this.cancelButton.onDidClick(() => this.onCancel()));
	}


	protected override layoutTreeView(height: number, width: number): void {
		this.dimension = new DOM.Dimension(width, height);
		const buttonContainerHeight = 78;
		this.buttonsContainer.style.height = `${buttonContainerHeight}px`;
		this.buttonsContainer.style.width = `${width}px`;

		super.layoutTreeView(Math.min(height - buttonContainerHeight, 22 * (Math.max(this.totalTreeItemsCount, 6) || 12)), width);
	}

	private updateConfirmButtonEnablement(): void {
		this.confirmButton.enabled = this.userDataProfileData.isEnabled();
	}

}

const USER_DATA_PROFILE_IMPORT_EXPORT_SCHEME = 'userdataprofileimportexport';
const USER_DATA_PROFILE_IMPORT_EXPORT_PREVIEW_SCHEME = 'userdataprofileimportexportpreview';

abstract class UserDataProfileTreeViewData extends Disposable implements ITreeViewDataProvider {

	async getChildren(element?: ITreeItem): Promise<ITreeItem[] | undefined> {
		if (element) {
			return (<IProfileResourceTreeItem>element).getChildren();
		} else {
			this.rootsPromise = undefined;
			return this.getRoots();
		}
	}

	private roots: IProfileResourceTreeItem[] = [];
	private rootsPromise: Promise<IProfileResourceTreeItem[]> | undefined;
	getRoots(): Promise<IProfileResourceTreeItem[]> {
		if (!this.rootsPromise) {
			this.rootsPromise = this.fetchRoots().then(roots => this.roots = roots);
		}
		return this.rootsPromise;
	}

	isEnabled(): boolean {
		return this.roots.some(root => root.checkbox?.isChecked ?? true);
	}

	abstract onDidChangeCheckboxState(items: ITreeItem[]): ITreeItem[];
	protected abstract fetchRoots(): Promise<IProfileResourceTreeItem[]>;
}

class UserDataProfileExportData extends UserDataProfileTreeViewData implements ITreeViewDataProvider {

	private readonly disposables = this._register(new DisposableStore());

	constructor(
		private readonly profile: IUserDataProfile,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IFileService private readonly fileService: IFileService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
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

	protected async fetchRoots(): Promise<IProfileResourceTreeItem[]> {
		this.disposables.clear();
		this.disposables.add(this.fileService.registerProvider(USER_DATA_PROFILE_IMPORT_EXPORT_SCHEME, this._register(new InMemoryFileSystemProvider())));
		const previewFileSystemProvider = this._register(new InMemoryFileSystemProvider());
		this.disposables.add(this.fileService.registerProvider(USER_DATA_PROFILE_IMPORT_EXPORT_PREVIEW_SCHEME, previewFileSystemProvider));
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

		const tasksResource = this.instantiationService.createInstance(TasksResource);
		const tasksContent = await tasksResource.getContent(this.profile);
		await tasksResource.apply(tasksContent, exportPreviewProfle);
		const tasksResourceTreeItem = this.instantiationService.createInstance(TasksResourceTreeItem, exportPreviewProfle);
		if (await tasksResourceTreeItem.hasContent()) {
			roots.push(tasksResourceTreeItem);
		}

		const snippetsResource = this.instantiationService.createInstance(SnippetsResource);
		const snippetsContent = await snippetsResource.getContent(this.profile);
		await snippetsResource.apply(snippetsContent, exportPreviewProfle);
		const snippetsResourceTreeItem = this.instantiationService.createInstance(SnippetsResourceTreeItem, exportPreviewProfle);
		if (await snippetsResourceTreeItem.hasContent()) {
			roots.push(snippetsResourceTreeItem);
		}

		const globalStateResource = joinPath(exportPreviewProfle.globalStorageHome, 'globalState.json').with({ scheme: USER_DATA_PROFILE_IMPORT_EXPORT_PREVIEW_SCHEME });
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
			settingsResource: profile.settingsResource.with({ scheme: USER_DATA_PROFILE_IMPORT_EXPORT_SCHEME }),
			keybindingsResource: profile.keybindingsResource.with({ scheme: USER_DATA_PROFILE_IMPORT_EXPORT_SCHEME }),
			tasksResource: profile.tasksResource.with({ scheme: USER_DATA_PROFILE_IMPORT_EXPORT_SCHEME }),
			snippetsHome: profile.snippetsHome.with({ scheme: USER_DATA_PROFILE_IMPORT_EXPORT_SCHEME }),
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
			});
			if (!name) {
				return null;
			}
		}

		const roots = await this.getRoots();
		let settings: string | undefined;
		let keybindings: string | undefined;
		let tasks: string | undefined;
		let snippets: string | undefined;
		let extensions: string | undefined;
		let globalState: string | undefined;
		for (const root of roots) {
			if (!root.checkbox?.isChecked) {
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
			} else if (root instanceof ExtensionsResourceExportTreeItem) {
				extensions = await root.getContent();
			} else if (root instanceof GlobalStateResourceExportTreeItem) {
				globalState = await root.getContent();
			}
		}

		return {
			name,
			shortName: this.profile.shortName,
			settings,
			keybindings,
			tasks,
			snippets,
			extensions,
			globalState
		};
	}

}

class UserDataProfileImportData extends UserDataProfileTreeViewData implements ITreeViewDataProvider {

	private readonly disposables = this._register(new DisposableStore());

	constructor(
		private readonly profile: IUserDataProfileTemplate,
		@IFileService private readonly fileService: IFileService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	onDidChangeCheckboxState(items: ITreeItem[]): ITreeItem[] {
		return items;
	}

	protected async fetchRoots(): Promise<IProfileResourceTreeItem[]> {
		this.disposables.clear();

		const inMemoryProvider = this._register(new InMemoryFileSystemProvider());
		this.disposables.add(this.fileService.registerProvider(USER_DATA_PROFILE_IMPORT_EXPORT_PREVIEW_SCHEME, inMemoryProvider));
		const roots: IProfileResourceTreeItem[] = [];
		const importPreviewProfle = toUserDataProfile(generateUuid(), this.profile.name, URI.file('/root').with({ scheme: USER_DATA_PROFILE_IMPORT_EXPORT_PREVIEW_SCHEME }));

		if (this.profile.settings) {
			const settingsResource = this.instantiationService.createInstance(SettingsResource);
			await settingsResource.apply(this.profile.settings, importPreviewProfle);
			const settingsResourceTreeItem = this.instantiationService.createInstance(SettingsResourceTreeItem, importPreviewProfle);
			settingsResourceTreeItem.checkbox = undefined;
			if (await settingsResourceTreeItem.hasContent()) {
				roots.push(settingsResourceTreeItem);
			}
		}

		if (this.profile.keybindings) {
			const keybindingsResource = this.instantiationService.createInstance(KeybindingsResource);
			await keybindingsResource.apply(this.profile.keybindings, importPreviewProfle);
			const keybindingsResourceTreeItem = this.instantiationService.createInstance(KeybindingsResourceTreeItem, importPreviewProfle);
			keybindingsResourceTreeItem.checkbox = undefined;
			if (await keybindingsResourceTreeItem.hasContent()) {
				roots.push(keybindingsResourceTreeItem);
			}
		}

		if (this.profile.tasks) {
			const tasksResource = this.instantiationService.createInstance(TasksResource);
			await tasksResource.apply(this.profile.tasks, importPreviewProfle);
			const tasksResourceTreeItem = this.instantiationService.createInstance(TasksResourceTreeItem, importPreviewProfle);
			tasksResourceTreeItem.checkbox = undefined;
			if (await tasksResourceTreeItem.hasContent()) {
				roots.push(tasksResourceTreeItem);
			}
		}

		if (this.profile.snippets) {
			const snippetsResource = this.instantiationService.createInstance(SnippetsResource);
			await snippetsResource.apply(this.profile.snippets, importPreviewProfle);
			const snippetsResourceTreeItem = this.instantiationService.createInstance(SnippetsResourceTreeItem, importPreviewProfle);
			snippetsResourceTreeItem.checkbox = undefined;
			if (await snippetsResourceTreeItem.hasContent()) {
				roots.push(snippetsResourceTreeItem);
			}
		}

		if (this.profile.globalState) {
			const globalStateResource = joinPath(importPreviewProfle.globalStorageHome, 'globalState.json');
			const content = VSBuffer.fromString(JSON.stringify(JSON.parse(this.profile.globalState), null, '\t'));
			if (content) {
				await this.fileService.writeFile(globalStateResource, content);
				roots.push(this.instantiationService.createInstance(GlobalStateResourceImportTreeItem, globalStateResource));
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

}

registerSingleton(IUserDataProfileImportExportService, UserDataProfileImportExportService, InstantiationType.Delayed);
