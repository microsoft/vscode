/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/userDataProfileView';
import { localize } from 'vs/nls';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { Emitter, Event } from 'vs/base/common/event';
import * as DOM from 'vs/base/browser/dom';
import { IUserDataProfileImportExportService, PROFILE_FILTER, PROFILE_EXTENSION, IUserDataProfileContentHandler, IS_PROFILE_IMPORT_IN_PROGRESS_CONTEXT, PROFILES_TITLE, defaultUserDataProfileIcon, IUserDataProfileService, IProfileResourceTreeItem, PROFILES_CATEGORY, IUserDataProfileManagementService, ProfileResourceType, IS_PROFILE_EXPORT_IN_PROGRESS_CONTEXT, ISaveProfileResult, IProfileImportOptions, PROFILE_URL_AUTHORITY, toUserDataProfileUri } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IDialogService, IFileDialogService, IPromptButton } from 'vs/platform/dialogs/common/dialogs';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IFileService } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { Extensions, ITreeItem, ITreeViewDataProvider, ITreeViewDescriptor, IViewContainersRegistry, IViewDescriptorService, IViewsRegistry, IViewsService, TreeItemCollapsibleState, ViewContainer, ViewContainerLocation } from 'vs/workbench/common/views';
import { IUserDataProfile, IUserDataProfilesService, toUserDataProfile } from 'vs/platform/userDataProfile/common/userDataProfile';
import { ContextKeyExpr, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
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
import { getErrorMessage, onUnexpectedError } from 'vs/base/common/errors';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
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
import { isWeb } from 'vs/base/common/platform';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { Barrier } from 'vs/base/common/async';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionType } from 'vs/platform/extensions/common/extensions';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { renderMarkdown } from 'vs/base/browser/markdownRenderer';
import { showWindowLogActionId } from 'vs/workbench/services/log/common/logConstants';

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

const EXPORT_PROFILE_PREVIEW_VIEW = 'workbench.views.profiles.export.preview';
const IMPORT_PROFILE_PREVIEW_VIEW = 'workbench.views.profiles.import.preview';

export class UserDataProfileImportExportService extends Disposable implements IUserDataProfileImportExportService, IURLHandler {

	private static readonly PROFILE_URL_AUTHORITY_PREFIX = 'profile-';

	readonly _serviceBrand: undefined;

	private profileContentHandlers = new Map<string, IUserDataProfileContentHandler>();
	private readonly isProfileExportInProgressContextKey: IContextKey<boolean>;
	private readonly isProfileImportInProgressContextKey: IContextKey<boolean>;

	private readonly viewContainer: ViewContainer;
	private readonly fileUserDataProfileContentHandler: FileUserDataProfileContentHandler;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IViewsService private readonly viewsService: IViewsService,
		@IEditorService private readonly editorService: IEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
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
				title: PROFILES_TITLE,
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
		if (this.isProfileExportInProgressContextKey.get()) {
			this.logService.warn('Profile export already in progress.');
			return;
		}

		return this.showProfileContents();
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
			const profileTemplate = await this.progressService.withProgress({
				location: ProgressLocation.Window,
				command: showWindowLogActionId,
				title: localize('resolving uri', "{0}: Resolving profile content...", options?.preview ? localize('preview profile', "Preview Profile") : localize('import profile', "Create Profile")),
			}, () => this.resolveProfileTemplate(uri));
			if (!profileTemplate) {
				return;
			}
			if (options?.preview) {
				await this.previewProfile(uri, profileTemplate);
			} else {
				await this.doImportProfile(profileTemplate);
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
			const userDataProfilesExportState = disposables.add(this.instantiationService.createInstance(UserDataProfileExportState, this.userDataProfileService.currentProfile, false));
			const barrier = new Barrier();
			const exportAction = new BarrierAction(barrier, new Action('export', localize('export', "Export"), undefined, true, async () => {
				exportAction.enabled = false;
				try {
					await this.doExportProfile(userDataProfilesExportState);
				} catch (error) {
					this.notificationService.error(error);
					throw error;
				}
			}), this.notificationService);
			const closeAction = new BarrierAction(barrier, new Action('close', localize('close', "Close")), this.notificationService);
			await this.showProfilePreviewView(EXPORT_PROFILE_PREVIEW_VIEW, userDataProfilesExportState.profile.name, exportAction, closeAction, true, userDataProfilesExportState);
			disposables.add(this.userDataProfileService.onDidChangeCurrentProfile(e => barrier.open()));
			await barrier.wait();
			await this.hideProfilePreviewView(EXPORT_PROFILE_PREVIEW_VIEW);
		} finally {
			disposables.dispose();
		}
	}

	async createFromCurrentProfile(name: string): Promise<void> {
		const userDataProfilesExportState = this.instantiationService.createInstance(UserDataProfileExportState, this.userDataProfileService.currentProfile, false);
		try {
			const profileTemplate = await userDataProfilesExportState.getProfileTemplate(name, undefined);
			await this.doImportProfile(profileTemplate);
		} finally {
			userDataProfilesExportState.dispose();
		}
	}

	async createTroubleshootProfile(): Promise<void> {
		const userDataProfilesExportState = this.instantiationService.createInstance(UserDataProfileExportState, this.userDataProfileService.currentProfile, true);
		try {
			const profileTemplate = await userDataProfilesExportState.getProfileTemplate(localize('troubleshoot issue', "Troubleshoot Issue"), undefined);
			await this.progressService.withProgress({
				location: ProgressLocation.Notification,
				delay: 1000,
				sticky: true,
			}, progress =>
				this.importAndSwitchWithProgress(profileTemplate, true, true, true, message => progress.report({ message: localize('troubleshoot profile progress', "Setting up Troubleshoot Profile: {0}", message) })));
		} finally {
			userDataProfilesExportState.dispose();
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
				location: EXPORT_PROFILE_PREVIEW_VIEW,
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
				const saveResult = await profileContentHandler.saveProfile(profile.name.replace('/', '-'), JSON.stringify(profile), CancellationToken.None);
				if (!saveResult) {
					return;
				}
				const message = localize('export success', "Profile '{0}' was exported successfully.", profile.name);
				if (profileContentHandler.extensionId) {
					const buttons: IPromptButton<void>[] = [];
					const link = this.productService.webUrl ? `${this.productService.webUrl}/${PROFILE_URL_AUTHORITY}/${id}/${saveResult.id}` : toUserDataProfileUri(`/${id}/${saveResult.id}`, this.productService).toString();
					buttons.push({
						label: localize({ key: 'copy', comment: ['&& denotes a mnemonic'] }, "&&Copy Link"),
						run: () => this.clipboardService.writeText(link)
					});
					if (this.productService.webUrl) {
						buttons.push({
							label: localize({ key: 'open', comment: ['&& denotes a mnemonic'] }, "&&Open Link"),
							run: async () => {
								await this.openerService.open(link);
							}
						});
					} else {
						buttons.push({
							label: localize({ key: 'open in', comment: ['&& denotes a mnemonic'] }, "&&Open in {0}", profileContentHandler.name),
							run: async () => {
								await this.openerService.open(saveResult.link.toString());
							}
						});
					}
					await this.dialogService.prompt({
						type: Severity.Info,
						message,
						buttons,
						cancelButton: localize('close', "Close")
					});
				} else {
					await this.dialogService.info(message);
				}
			});
		} finally {
			disposables.dispose();
		}
	}

	private async resolveProfileTemplate(uri: URI): Promise<IUserDataProfileTemplate | null> {
		const profileContent = await this.resolveProfileContent(uri);
		if (profileContent === null) {
			return null;
		}

		const profileTemplate: IUserDataProfileTemplate = JSON.parse(profileContent);
		if (!isUserDataProfileTemplate(profileTemplate)) {
			throw new Error('Invalid profile content.');
		}

		return profileTemplate;
	}

	private async previewProfile(uri: URI, profileTemplate: IUserDataProfileTemplate): Promise<void> {
		const disposables = new DisposableStore();

		try {
			const userDataProfileImportState = disposables.add(this.instantiationService.createInstance(UserDataProfileImportState, profileTemplate));
			profileTemplate = await userDataProfileImportState.getProfileTemplateToImport();

			const importedProfile = await this.importAndSwitch(profileTemplate, true, false, false, localize('preview profile', "Preview Profile"));

			if (!importedProfile) {
				return;
			}

			const barrier = new Barrier();
			const importAction = this.getImportAction(barrier, userDataProfileImportState);
			const primaryAction = isWeb
				? new Action('importInDesktop', localize('import in desktop', "Create Profile in {0}", this.productService.nameLong), undefined, true, async () => this.openerService.open(uri, { openExternal: true }))
				: importAction;
			const secondaryAction = isWeb
				? importAction
				: new BarrierAction(barrier, new Action('close', localize('close', "Close")), this.notificationService);

			const view = await this.showProfilePreviewView(IMPORT_PROFILE_PREVIEW_VIEW, importedProfile.name, primaryAction, secondaryAction, false, userDataProfileImportState);
			const message = new MarkdownString();
			message.appendMarkdown(localize('preview profile message', "By default, extensions aren't installed when previewing a profile on the web. You can still install them manually before importing the profile. "));
			message.appendMarkdown(`[${localize('learn more', "Learn more")}](https://aka.ms/vscode-extension-marketplace#_can-i-trust-extensions-from-the-marketplace).`);
			view.setMessage(message);

			const that = this;
			const disposable = disposables.add(registerAction2(class extends Action2 {
				constructor() {
					super({
						id: 'previewProfile.installExtensions',
						title: localize('install extensions title', "Install Extensions"),
						icon: Codicon.cloudDownload,
						menu: {
							id: MenuId.ViewItemContext,
							group: 'inline',
							when: ContextKeyExpr.and(ContextKeyExpr.equals('view', IMPORT_PROFILE_PREVIEW_VIEW), ContextKeyExpr.equals('viewItem', ProfileResourceType.Extensions)),
						}
					});
				}
				override async run(): Promise<void> {
					return that.progressService.withProgress({
						location: IMPORT_PROFILE_PREVIEW_VIEW,
					}, async progress => {
						disposable.dispose();
						view.setMessage(undefined);
						const profileTemplate = await userDataProfileImportState.getProfileTemplateToImport();
						if (profileTemplate.extensions) {
							await that.instantiationService.createInstance(ExtensionsResource, false).apply(profileTemplate.extensions, importedProfile);
						}
					});
				}
			}));
			disposables.add(Event.debounce(this.extensionManagementService.onDidInstallExtensions, () => undefined, 100)(async () => {
				const profileTemplate = await userDataProfileImportState.getProfileTemplateToImport();
				if (profileTemplate.extensions) {
					const profileExtensions = await that.instantiationService.createInstance(ExtensionsResource, false).getProfileExtensions(profileTemplate.extensions!);
					const installed = await this.extensionManagementService.getInstalled(ExtensionType.User);
					if (profileExtensions.every(e => installed.some(i => areSameExtensions(e.identifier, i.identifier)))) {
						disposable.dispose();
					}
				}
			}));

			await barrier.wait();
			await this.hideProfilePreviewView(IMPORT_PROFILE_PREVIEW_VIEW);
		} finally {
			disposables.dispose();
		}
	}

	private async doImportProfile(profileTemplate: IUserDataProfileTemplate): Promise<void> {
		const disposables = new DisposableStore();
		try {
			const userDataProfileImportState = disposables.add(this.instantiationService.createInstance(UserDataProfileImportState, profileTemplate));
			const barrier = new Barrier();
			const importAction = this.getImportAction(barrier, userDataProfileImportState);
			if (userDataProfileImportState.isEmpty()) {
				await importAction.run();
			} else {
				await this.showProfilePreviewView(IMPORT_PROFILE_PREVIEW_VIEW, profileTemplate.name, importAction, new BarrierAction(barrier, new Action('cancel', localize('cancel', "Cancel")), this.notificationService), false, userDataProfileImportState);
			}
			await barrier.wait();
			await this.hideProfilePreviewView(IMPORT_PROFILE_PREVIEW_VIEW);
		} finally {
			disposables.dispose();
		}
	}

	private getImportAction(barrier: Barrier, userDataProfileImportState: UserDataProfileImportState): IAction {
		const title = localize('import', "Create Profile", userDataProfileImportState.profile.name);
		const importAction = new BarrierAction(barrier, new Action('import', title, undefined, true, () => {
			const importProfileFn = async () => {
				importAction.enabled = false;
				const profileTemplate = await userDataProfileImportState.getProfileTemplateToImport();
				const importedProfile = await this.importAndSwitch(profileTemplate, false, true, false, title);
				if (!importedProfile) {
					return;
				}
			};
			if (userDataProfileImportState.isEmpty()) {
				return importProfileFn();
			} else {
				return this.progressService.withProgress({
					location: IMPORT_PROFILE_PREVIEW_VIEW,
				}, () => importProfileFn());
			}
		}), this.notificationService);
		return importAction;
	}

	private async importAndSwitch(profileTemplate: IUserDataProfileTemplate, temporaryProfile: boolean, extensions: boolean, extensionsDisabled: boolean, title: string): Promise<IUserDataProfile | undefined> {
		return this.progressService.withProgress({
			location: ProgressLocation.Window,
			command: showWindowLogActionId,
		}, async (progress) => {
			progress.report({ message: localize('Importing profile', "{0} ({1})...", title, profileTemplate.name) });
			return this.importAndSwitchWithProgress(profileTemplate, temporaryProfile, extensions, extensionsDisabled, message => progress.report({ message: `${title} (${profileTemplate.name}): ${message}` }));
		});
	}

	private async importAndSwitchWithProgress(profileTemplate: IUserDataProfileTemplate, temporaryProfile: boolean, extensions: boolean, extensionsDisabled: boolean, progress: (message: string) => void): Promise<IUserDataProfile | undefined> {
		const profile = await this.getProfileToImport(profileTemplate, temporaryProfile);
		if (!profile) {
			return undefined;
		}

		if (profileTemplate.settings) {
			progress(localize('progress settings', "Applying Settings..."));
			await this.instantiationService.createInstance(SettingsResource).apply(profileTemplate.settings, profile);
		}
		if (profileTemplate.keybindings) {
			progress(localize('progress keybindings', "{0}ying Keyboard Shortcuts..."));
			await this.instantiationService.createInstance(KeybindingsResource).apply(profileTemplate.keybindings, profile);
		}
		if (profileTemplate.tasks) {
			progress(localize('progress tasks', "Applying Tasks..."));
			await this.instantiationService.createInstance(TasksResource).apply(profileTemplate.tasks, profile);
		}
		if (profileTemplate.snippets) {
			progress(localize('progress snippets', "Applying Snippets..."));
			await this.instantiationService.createInstance(SnippetsResource).apply(profileTemplate.snippets, profile);
		}
		if (profileTemplate.globalState) {
			progress(localize('progress global state', "Applying State..."));
			await this.instantiationService.createInstance(GlobalStateResource).apply(profileTemplate.globalState, profile);
		}
		if (profileTemplate.extensions && extensions) {
			progress(localize('progress extensions', "Applying Extensions..."));
			await this.instantiationService.createInstance(ExtensionsResource, extensionsDisabled).apply(profileTemplate.extensions, profile);
		}

		progress(localize('switching profile', " Applying..."));
		await this.userDataProfileManagementService.switchProfile(profile);
		return profile;
	}

	private async resolveProfileContent(resource: URI): Promise<string | null> {
		if (await this.fileUserDataProfileContentHandler.canHandle(resource)) {
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
			return this.profileContentHandlers.keys().next().value;
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

	private async getProfileToImport(profileTemplate: IUserDataProfileTemplate, temp: boolean): Promise<IUserDataProfile | undefined> {
		const profileName = profileTemplate.name;
		const profile = this.userDataProfilesService.profiles.find(p => p.name === profileName);
		if (profile) {
			if (temp) {
				return this.userDataProfilesService.createNamedProfile(`${profileName} ${this.getProfileNameIndex(profileName)}`, { shortName: profileTemplate.shortName, transient: temp });
			}

			enum ImportProfileChoice {
				Overwrite = 0,
				CreateNew = 1,
				Cancel = 2
			}
			const { result } = await this.dialogService.prompt<ImportProfileChoice>({
				type: Severity.Info,
				message: localize('profile already exists', "Profile with name '{0}' already exists. Do you want to overwrite it?", profileName),
				buttons: [
					{
						label: localize({ key: 'overwrite', comment: ['&& denotes a mnemonic'] }, "&&Overwrite"),
						run: () => ImportProfileChoice.Overwrite
					},
					{
						label: localize({ key: 'create new', comment: ['&& denotes a mnemonic'] }, "&&Create New Profile"),
						run: () => ImportProfileChoice.CreateNew
					},
				],
				cancelButton: {
					run: () => ImportProfileChoice.Cancel
				}
			});

			if (result === ImportProfileChoice.Overwrite) {
				return profile;
			}

			if (result === ImportProfileChoice.Cancel) {
				return undefined;
			}

			// Create new profile
			const name = await this.quickInputService.input({
				placeHolder: localize('name', "Profile name"),
				title: localize('create new title', "Create New Profile"),
				value: `${profileName} ${this.getProfileNameIndex(profileName)}`,
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
			return this.userDataProfilesService.createNamedProfile(profileName, { shortName: profileTemplate.shortName, transient: temp });
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

	private async showProfilePreviewView(id: string, name: string, primary: IAction, secondary: IAction, refreshAction: boolean, userDataProfilesData: UserDataProfileImportExportState): Promise<UserDataProfilePreviewViewPane> {
		const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
		const treeView = this.instantiationService.createInstance(TreeView, id, name);
		if (refreshAction) {
			treeView.showRefreshAction = true;
		}
		const actionRunner = new ActionRunner();
		const descriptor: ITreeViewDescriptor = {
			id,
			name,
			ctorDescriptor: new SyncDescriptor(UserDataProfilePreviewViewPane, [userDataProfilesData, primary, secondary, actionRunner]),
			canToggleVisibility: false,
			canMoveView: false,
			treeView,
			collapsed: false,
		};

		viewsRegistry.registerViews([descriptor], this.viewContainer);
		return (await this.viewsService.openView<UserDataProfilePreviewViewPane>(id, true))!;
	}

	private async hideProfilePreviewView(id: string): Promise<void> {
		const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
		const viewDescriptor = viewsRegistry.getView(id);
		if (viewDescriptor) {
			(viewDescriptor as ITreeViewDescriptor).treeView.dispose();
			viewsRegistry.deregisterViews([viewDescriptor], this.viewContainer);
		}
		await this.closeAllImportExportPreviewEditors();
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
				await this.instantiationService.createInstance(ExtensionsResource, false).apply(profile.extensions, this.userDataProfileService.currentProfile);
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

	async canHandle(uri: URI): Promise<boolean> {
		return uri.scheme !== Schemas.http && uri.scheme !== Schemas.https && await this.fileService.canHandleResource(uri);
	}

	async readProfile(uri: URI, token: CancellationToken): Promise<string | null> {
		if (await this.canHandle(uri)) {
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
	private primaryButton!: Button;
	private secondaryButton!: Button;
	private messageContainer!: HTMLElement;
	private dimension: DOM.Dimension | undefined;
	private totalTreeItemsCount: number = 0;

	constructor(
		private readonly userDataProfileData: UserDataProfileImportExportState,
		private readonly primaryAction: Action,
		private readonly secondaryAction: Action,
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
		super.renderTreeView(DOM.append(container, DOM.$('.profile-view-tree-container')));
		this.messageContainer = DOM.append(container, DOM.$('.profile-view-message-container.hide'));
		this.createButtons(container);
		this._register(this.treeView.onDidChangeCheckboxState(() => this.updateConfirmButtonEnablement()));
		this.computeAndLayout();
		this._register(Event.any(this.userDataProfileData.onDidChangeRoots, this.treeView.onDidCollapseItem, this.treeView.onDidExpandItem)(() => this.computeAndLayout()));
	}

	private async computeAndLayout() {
		const roots = await this.userDataProfileData.getRoots();
		const children = await Promise.all(roots.map(async (root) => {
			let expanded = root.collapsibleState === TreeItemCollapsibleState.Expanded;
			try {
				expanded = !this.treeView.isCollapsed(root);
			} catch (error) { /* Ignore because element might not be added yet */ }
			if (expanded) {
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

		this.primaryButton = this._register(new Button(this.buttonsContainer, { ...defaultButtonStyles }));
		this.primaryButton.element.classList.add('profile-view-button');
		this.primaryButton.label = this.primaryAction.label;
		this.primaryButton.enabled = this.primaryAction.enabled;
		this._register(this.primaryButton.onDidClick(() => this.actionRunner.run(this.primaryAction)));
		this._register(this.primaryAction.onDidChange(e => {
			if (e.enabled !== undefined) {
				this.primaryButton.enabled = e.enabled;
			}
		}));

		this.secondaryButton = this._register(new Button(this.buttonsContainer, { secondary: true, ...defaultButtonStyles }));
		this.secondaryButton.label = this.secondaryAction.label;
		this.secondaryButton.element.classList.add('profile-view-button');
		this.secondaryButton.enabled = this.secondaryAction.enabled;
		this._register(this.secondaryButton.onDidClick(() => this.actionRunner.run(this.secondaryAction)));
		this._register(this.secondaryAction.onDidChange(e => {
			if (e.enabled !== undefined) {
				this.secondaryButton.enabled = e.enabled;
			}
		}));
	}

	protected override layoutTreeView(height: number, width: number): void {
		this.dimension = new DOM.Dimension(width, height);

		let messageContainerHeight = 0;
		if (!this.messageContainer.classList.contains('hide')) {
			messageContainerHeight = DOM.getClientArea(this.messageContainer).height;
		}

		const buttonContainerHeight = 108;
		this.buttonsContainer.style.height = `${buttonContainerHeight}px`;
		this.buttonsContainer.style.width = `${width}px`;

		super.layoutTreeView(Math.min(height - buttonContainerHeight - messageContainerHeight, 22 * this.totalTreeItemsCount), width);
	}

	private updateConfirmButtonEnablement(): void {
		this.primaryButton.enabled = this.primaryAction.enabled && this.userDataProfileData.isEnabled();
	}

	private readonly renderDisposables = this._register(new DisposableStore());
	setMessage(message: MarkdownString | undefined): void {
		this.messageContainer.classList.toggle('hide', !message);
		DOM.clearNode(this.messageContainer);
		if (message) {
			this.renderDisposables.clear();
			const rendered = this.renderDisposables.add(renderMarkdown(message, {
				actionHandler: {
					callback: (content) => {
						this.openerService.open(content, { allowCommands: true }).catch(onUnexpectedError);
					},
					disposables: this.renderDisposables
				}
			}));
			DOM.append(this.messageContainer, rendered.element);
		}
	}

	refresh(): Promise<void> {
		return this.treeView.refresh();
	}
}

const USER_DATA_PROFILE_EXPORT_SCHEME = 'userdataprofileexport';
const USER_DATA_PROFILE_EXPORT_PREVIEW_SCHEME = 'userdataprofileexportpreview';
const USER_DATA_PROFILE_IMPORT_PREVIEW_SCHEME = 'userdataprofileimportpreview';

abstract class UserDataProfileImportExportState extends Disposable implements ITreeViewDataProvider {

	private readonly _onDidChangeRoots = this._register(new Emitter<void>());
	readonly onDidChangeRoots = this._onDidChangeRoots.event;

	private readonly descriptions = new Map<ProfileResourceType, string>();

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

	setDescription(type: ProfileResourceType, description: string | undefined): void {
		if (description) {
			this.descriptions.set(type, description);
		} else {
			this.descriptions.delete(type);
		}
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
						root.checkbox = { isChecked: true, tooltip: localize('select', "Select {0}", root.label.label) };
					} else {
						root.checkbox = undefined;
					}
					root.description = this.descriptions.get(root.type);
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

	async getProfileTemplate(name: string, shortName: string | undefined): Promise<IUserDataProfileTemplate> {
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
		private readonly disableExtensions: boolean,
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

		const extensionsResourceTreeItem = this.instantiationService.createInstance(ExtensionsResourceExportTreeItem, exportPreviewProfle, this.disableExtensions);
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
			cacheHome: profile.cacheHome,
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
		readonly profile: IUserDataProfileTemplate,
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
		const importPreviewProfle = toUserDataProfile(generateUuid(), this.profile.name, URI.file('/root').with({ scheme: USER_DATA_PROFILE_IMPORT_PREVIEW_SCHEME }), URI.file('/cache').with({ scheme: USER_DATA_PROFILE_IMPORT_PREVIEW_SCHEME }));

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

class BarrierAction extends Action {
	constructor(barrier: Barrier, action: Action,
		notificationService: INotificationService) {
		super(action.id, action.label, action.class, action.enabled, async () => {
			try {
				await action.run();
			} catch (error) {
				notificationService.error(error);
				throw error;
			}
			barrier.open();
		});
	}
}

registerSingleton(IUserDataProfileImportExportService, UserDataProfileImportExportService, InstantiationType.Delayed);
