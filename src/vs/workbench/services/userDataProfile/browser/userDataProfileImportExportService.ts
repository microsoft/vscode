/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/userDataProfileView.css';
import { localize } from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Emitter } from '../../../../base/common/event.js';
import { IUserDataProfileImportExportService, PROFILE_FILTER, PROFILE_EXTENSION, IUserDataProfileContentHandler, IUserDataProfileService, IProfileResourceTreeItem, PROFILES_CATEGORY, IUserDataProfileManagementService, ISaveProfileResult, IProfileImportOptions, PROFILE_URL_AUTHORITY, toUserDataProfileUri, IUserDataProfileCreateOptions, isProfileURL, PROFILE_URL_AUTHORITY_PREFIX } from '../common/userDataProfile.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IDialogService, IFileDialogService, IPromptButton } from '../../../../platform/dialogs/common/dialogs.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { ITreeItem, ITreeViewDataProvider } from '../../../common/views.js';
import { IUserDataProfile, IUserDataProfileOptions, IUserDataProfilesService, ProfileResourceType, ProfileResourceTypeFlags } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { SettingsResource, SettingsResourceTreeItem } from './settingsResource.js';
import { KeybindingsResource, KeybindingsResourceTreeItem } from './keybindingsResource.js';
import { SnippetsResource, SnippetsResourceTreeItem } from './snippetsResource.js';
import { TasksResource, TasksResourceTreeItem } from './tasksResource.js';
import { ExtensionsResource, ExtensionsResourceExportTreeItem, ExtensionsResourceTreeItem } from './extensionsResource.js';
import { GlobalStateResource, GlobalStateResourceExportTreeItem, GlobalStateResourceTreeItem } from './globalStateResource.js';
import { InMemoryFileSystemProvider } from '../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { IQuickInputService, QuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { joinPath } from '../../../../base/common/resources.js';
import { escapeRegExpCharacters } from '../../../../base/common/strings.js';
import { Schemas } from '../../../../base/common/network.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import Severity from '../../../../base/common/severity.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { asText, IRequestService } from '../../../../platform/request/common/request.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Mutable, isUndefined } from '../../../../base/common/types.js';
import { CancelablePromise, createCancelablePromise } from '../../../../base/common/async.js';

interface IUserDataProfileTemplate {
	readonly name: string;
	readonly icon?: string;
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
		&& (isUndefined(candidate.icon) || typeof candidate.icon === 'string')
		&& (isUndefined(candidate.settings) || typeof candidate.settings === 'string')
		&& (isUndefined(candidate.globalState) || typeof candidate.globalState === 'string')
		&& (isUndefined(candidate.extensions) || typeof candidate.extensions === 'string'));
}

export class UserDataProfileImportExportService extends Disposable implements IUserDataProfileImportExportService {

	readonly _serviceBrand: undefined;

	private profileContentHandlers = new Map<string, IUserDataProfileContentHandler>();

	private readonly fileUserDataProfileContentHandler: FileUserDataProfileContentHandler;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IProgressService private readonly progressService: IProgressService,
		@IDialogService private readonly dialogService: IDialogService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IRequestService private readonly requestService: IRequestService,
		@IProductService private readonly productService: IProductService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
	) {
		super();
		this.registerProfileContentHandler(Schemas.file, this.fileUserDataProfileContentHandler = instantiationService.createInstance(FileUserDataProfileContentHandler));
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

	async createFromProfile(from: IUserDataProfile, options: IUserDataProfileCreateOptions, token: CancellationToken): Promise<IUserDataProfile | undefined> {
		const disposables = new DisposableStore();
		let creationPromise: CancelablePromise<void>;
		disposables.add(token.onCancellationRequested(() => creationPromise.cancel()));
		let profile: IUserDataProfile | undefined;
		return this.progressService.withProgress({
			location: ProgressLocation.Notification,
			delay: 500,
			sticky: true,
			cancellable: true,
		}, async progress => {
			const reportProgress = (message: string) => progress.report({ message: localize('create from profile', "Create Profile: {0}", message) });
			creationPromise = createCancelablePromise(async token => {
				const userDataProfilesExportState = disposables.add(this.instantiationService.createInstance(UserDataProfileExportState, from, { ...options?.resourceTypeFlags, extensions: false }));
				const profileTemplate = await userDataProfilesExportState.getProfileTemplate(options.name ?? from.name, options?.icon);
				profile = await this.getProfileToImport({ ...profileTemplate, name: options.name ?? profileTemplate.name }, !!options.transient, options);
				if (!profile) {
					return;
				}
				if (token.isCancellationRequested) {
					return;
				}
				await this.applyProfileTemplate(profileTemplate, profile, options, reportProgress, token);
			});
			try {
				await creationPromise;
				if (profile && (options?.resourceTypeFlags?.extensions ?? true)) {
					reportProgress(localize('installing extensions', "Installing Extensions..."));
					await this.instantiationService.createInstance(ExtensionsResource).copy(from, profile, false);
				}
			} catch (error) {
				if (profile) {
					await this.userDataProfilesService.removeProfile(profile);
					profile = undefined;
				}
			}
			return profile;

		}, () => creationPromise.cancel()).finally(() => disposables.dispose());
	}

	async createProfileFromTemplate(profileTemplate: IUserDataProfileTemplate, options: IUserDataProfileCreateOptions, token: CancellationToken): Promise<IUserDataProfile | undefined> {
		const disposables = new DisposableStore();
		let creationPromise: CancelablePromise<void>;
		disposables.add(token.onCancellationRequested(() => creationPromise.cancel()));
		let profile: IUserDataProfile | undefined;
		return this.progressService.withProgress({
			location: ProgressLocation.Notification,
			delay: 500,
			sticky: true,
			cancellable: true,
		}, async progress => {
			const reportProgress = (message: string) => progress.report({ message: localize('create from profile', "Create Profile: {0}", message) });
			creationPromise = createCancelablePromise(async token => {
				profile = await this.getProfileToImport({ ...profileTemplate, name: options.name ?? profileTemplate.name }, !!options.transient, options);
				if (!profile) {
					return;
				}
				if (token.isCancellationRequested) {
					return;
				}
				await this.applyProfileTemplate(profileTemplate, profile, options, reportProgress, token);
			});
			try {
				await creationPromise;
			} catch (error) {
				if (profile) {
					await this.userDataProfilesService.removeProfile(profile);
					profile = undefined;
				}
			}
			return profile;
		}, () => creationPromise.cancel()).finally(() => disposables.dispose());
	}

	private async applyProfileTemplate(profileTemplate: IUserDataProfileTemplate, profile: IUserDataProfile, options: IUserDataProfileCreateOptions, reportProgress: (message: string) => void, token: CancellationToken): Promise<void> {
		if (profileTemplate.settings && (options.resourceTypeFlags?.settings ?? true) && !profile.useDefaultFlags?.settings) {
			reportProgress(localize('creating settings', "Creating Settings..."));
			await this.instantiationService.createInstance(SettingsResource).apply(profileTemplate.settings, profile);
		}
		if (token.isCancellationRequested) {
			return;
		}
		if (profileTemplate.keybindings && (options.resourceTypeFlags?.keybindings ?? true) && !profile.useDefaultFlags?.keybindings) {
			reportProgress(localize('create keybindings', "Creating Keyboard Shortcuts..."));
			await this.instantiationService.createInstance(KeybindingsResource).apply(profileTemplate.keybindings, profile);
		}
		if (token.isCancellationRequested) {
			return;
		}
		if (profileTemplate.tasks && (options.resourceTypeFlags?.tasks ?? true) && !profile.useDefaultFlags?.tasks) {
			reportProgress(localize('create tasks', "Creating Tasks..."));
			await this.instantiationService.createInstance(TasksResource).apply(profileTemplate.tasks, profile);
		}
		if (token.isCancellationRequested) {
			return;
		}
		if (profileTemplate.snippets && (options.resourceTypeFlags?.snippets ?? true) && !profile.useDefaultFlags?.snippets) {
			reportProgress(localize('create snippets', "Creating Snippets..."));
			await this.instantiationService.createInstance(SnippetsResource).apply(profileTemplate.snippets, profile);
		}
		if (token.isCancellationRequested) {
			return;
		}
		if (profileTemplate.globalState && !profile.useDefaultFlags?.globalState) {
			reportProgress(localize('applying global state', "Applying UI State..."));
			await this.instantiationService.createInstance(GlobalStateResource).apply(profileTemplate.globalState, profile);
		}
		if (token.isCancellationRequested) {
			return;
		}
		if (profileTemplate.extensions && (options.resourceTypeFlags?.extensions ?? true) && !profile.useDefaultFlags?.extensions) {
			reportProgress(localize('installing extensions', "Installing Extensions..."));
			await this.instantiationService.createInstance(ExtensionsResource).apply(profileTemplate.extensions, profile, reportProgress, token);
		}
	}

	async exportProfile(profile: IUserDataProfile, exportFlags?: ProfileResourceTypeFlags): Promise<void> {
		const disposables = new DisposableStore();
		try {
			const userDataProfilesExportState = disposables.add(this.instantiationService.createInstance(UserDataProfileExportState, profile, exportFlags));
			await this.doExportProfile(userDataProfilesExportState, ProgressLocation.Notification);
		} finally {
			disposables.dispose();
		}
	}

	async createTroubleshootProfile(): Promise<void> {
		const userDataProfilesExportState = this.instantiationService.createInstance(UserDataProfileExportState, this.userDataProfileService.currentProfile, undefined);
		try {
			const profileTemplate = await userDataProfilesExportState.getProfileTemplate(localize('troubleshoot issue', "Troubleshoot Issue"), undefined);
			await this.progressService.withProgress({
				location: ProgressLocation.Notification,
				delay: 1000,
				sticky: true,
			}, async progress => {
				const reportProgress = (message: string) => progress.report({ message: localize('troubleshoot profile progress', "Setting up Troubleshoot Profile: {0}", message) });
				const profile = await this.doCreateProfile(profileTemplate, true, false, { useDefaultFlags: this.userDataProfileService.currentProfile.useDefaultFlags }, reportProgress);
				if (profile) {
					reportProgress(localize('progress extensions', "Applying Extensions..."));
					await this.instantiationService.createInstance(ExtensionsResource).copy(this.userDataProfileService.currentProfile, profile, true);

					reportProgress(localize('switching profile', "Switching Profile..."));
					await this.userDataProfileManagementService.switchProfile(profile);
				}
			});
		} finally {
			userDataProfilesExportState.dispose();
		}
	}

	private async doExportProfile(userDataProfilesExportState: UserDataProfileExportState, location: ProgressLocation | string): Promise<void> {
		const profile = await userDataProfilesExportState.getProfileToExport();
		if (!profile) {
			return;
		}

		const disposables = new DisposableStore();

		try {
			await this.progressService.withProgress({
				location,
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

	async resolveProfileTemplate(uri: URI, options?: IProfileImportOptions): Promise<IUserDataProfileTemplate | null> {
		const profileContent = await this.resolveProfileContent(uri);
		if (profileContent === null) {
			return null;
		}

		let profileTemplate: Mutable<IUserDataProfileTemplate>;

		try {
			profileTemplate = JSON.parse(profileContent);
		} catch (error) {
			throw new Error(localize('invalid profile content', "This profile is not valid."));
		}

		if (!isUserDataProfileTemplate(profileTemplate)) {
			throw new Error(localize('invalid profile content', "This profile is not valid."));
		}

		if (options?.name) {
			profileTemplate.name = options.name;
		}

		if (options?.icon) {
			profileTemplate.icon = options.icon;
		}

		if (options?.resourceTypeFlags?.settings === false) {
			profileTemplate.settings = undefined;
		}

		if (options?.resourceTypeFlags?.keybindings === false) {
			profileTemplate.keybindings = undefined;
		}

		if (options?.resourceTypeFlags?.snippets === false) {
			profileTemplate.snippets = undefined;
		}

		if (options?.resourceTypeFlags?.tasks === false) {
			profileTemplate.tasks = undefined;
		}

		if (options?.resourceTypeFlags?.globalState === false) {
			profileTemplate.globalState = undefined;
		}

		if (options?.resourceTypeFlags?.extensions === false) {
			profileTemplate.extensions = undefined;
		}

		return profileTemplate;
	}

	private async doCreateProfile(profileTemplate: IUserDataProfileTemplate, temporaryProfile: boolean, extensions: boolean, options: IUserDataProfileOptions | undefined, progress: (message: string) => void): Promise<IUserDataProfile | undefined> {
		const profile = await this.getProfileToImport(profileTemplate, temporaryProfile, options);
		if (!profile) {
			return undefined;
		}

		if (profileTemplate.settings && !profile.useDefaultFlags?.settings) {
			progress(localize('progress settings', "Applying Settings..."));
			await this.instantiationService.createInstance(SettingsResource).apply(profileTemplate.settings, profile);
		}
		if (profileTemplate.keybindings && !profile.useDefaultFlags?.keybindings) {
			progress(localize('progress keybindings', "Applying Keyboard Shortcuts..."));
			await this.instantiationService.createInstance(KeybindingsResource).apply(profileTemplate.keybindings, profile);
		}
		if (profileTemplate.tasks && !profile.useDefaultFlags?.tasks) {
			progress(localize('progress tasks', "Applying Tasks..."));
			await this.instantiationService.createInstance(TasksResource).apply(profileTemplate.tasks, profile);
		}
		if (profileTemplate.snippets && !profile.useDefaultFlags?.snippets) {
			progress(localize('progress snippets', "Applying Snippets..."));
			await this.instantiationService.createInstance(SnippetsResource).apply(profileTemplate.snippets, profile);
		}
		if (profileTemplate.globalState && !profile.useDefaultFlags?.globalState) {
			progress(localize('progress global state', "Applying State..."));
			await this.instantiationService.createInstance(GlobalStateResource).apply(profileTemplate.globalState, profile);
		}
		if (profileTemplate.extensions && extensions && !profile.useDefaultFlags?.extensions) {
			progress(localize('progress extensions', "Applying Extensions..."));
			await this.instantiationService.createInstance(ExtensionsResource).apply(profileTemplate.extensions, profile);
		}

		return profile;
	}

	private async resolveProfileContent(resource: URI): Promise<string | null> {
		if (await this.fileUserDataProfileContentHandler.canHandle(resource)) {
			return this.fileUserDataProfileContentHandler.readProfile(resource, CancellationToken.None);
		}

		if (isProfileURL(resource)) {
			let handlerId: string, idOrUri: string | URI;
			if (resource.authority === PROFILE_URL_AUTHORITY) {
				idOrUri = this.uriIdentityService.extUri.basename(resource);
				handlerId = this.uriIdentityService.extUri.basename(this.uriIdentityService.extUri.dirname(resource));
			} else {
				handlerId = resource.authority.substring(PROFILE_URL_AUTHORITY_PREFIX.length);
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

	private async getProfileToImport(profileTemplate: IUserDataProfileTemplate, temp: boolean, options: IUserDataProfileOptions | undefined): Promise<IUserDataProfile | undefined> {
		const profileName = profileTemplate.name;
		const profile = this.userDataProfilesService.profiles.find(p => p.name === profileName);
		if (profile) {
			if (temp) {
				return this.userDataProfilesService.createNamedProfile(`${profileName} ${this.getProfileNameIndex(profileName)}`, { ...options, transient: temp });
			}
			const { confirmed } = await this.dialogService.confirm({
				type: Severity.Info,
				message: localize('profile already exists', "Profile with name '{0}' already exists. Do you want to replace its contents?", profileName),
				primaryButton: localize({ key: 'overwrite', comment: ['&& denotes a mnemonic'] }, "&&Replace")
			});
			if (!confirmed) {
				return undefined;
			}
			return profile.isDefault ? profile : this.userDataProfilesService.updateProfile(profile, options);
		} else {
			return this.userDataProfilesService.createNamedProfile(profileName, { ...options, transient: temp });
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

}

class FileUserDataProfileContentHandler implements IUserDataProfileContentHandler {

	readonly name = localize('local', "Local");
	readonly description = localize('file', "file");

	constructor(
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IFileService private readonly fileService: IFileService,
		@IProductService private readonly productService: IProductService,
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
		return uri.scheme !== Schemas.http && uri.scheme !== Schemas.https && uri.scheme !== this.productService.urlProtocol && await this.fileService.canHandleResource(uri);
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

const USER_DATA_PROFILE_EXPORT_SCHEME = 'userdataprofileexport';
const USER_DATA_PROFILE_EXPORT_PREVIEW_SCHEME = 'userdataprofileexportpreview';

abstract class UserDataProfileImportExportState extends Disposable implements ITreeViewDataProvider {

	private readonly _onDidChangeRoots = this._register(new Emitter<void>());
	readonly onDidChangeRoots = this._onDidChangeRoots.event;

	constructor(
		@IQuickInputService protected readonly quickInputService: IQuickInputService,
	) {
		super();
	}

	async getChildren(element?: ITreeItem): Promise<ITreeItem[] | undefined> {
		if (element) {
			const children = await (<IProfileResourceTreeItem>element).getChildren();
			if (children) {
				for (const child of children) {
					if (child.parent.checkbox && child.checkbox) {
						child.checkbox.isChecked = child.parent.checkbox.isChecked && child.checkbox.isChecked;
					}
				}
			}
			return children;
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
					root.checkbox = {
						isChecked: !root.isFromDefaultProfile(),
						tooltip: localize('select', "Select {0}", root.label.label),
						accessibilityInformation: {
							label: localize('select', "Select {0}", root.label.label),
						}
					};
					if (root.isFromDefaultProfile()) {
						root.description = localize('from default', "From Default Profile");
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

	async getProfileTemplate(name: string, icon: string | undefined): Promise<IUserDataProfileTemplate> {
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
			icon,
			settings,
			keybindings,
			tasks,
			snippets,
			extensions,
			globalState
		};
	}

	private isSelected(treeItem: IProfileResourceTreeItem): boolean {
		if (treeItem.checkbox) {
			return treeItem.checkbox.isChecked || !!treeItem.children?.some(child => child.checkbox?.isChecked);
		}
		return true;
	}

	protected abstract fetchRoots(): Promise<IProfileResourceTreeItem[]>;
}

class UserDataProfileExportState extends UserDataProfileImportExportState {

	private readonly disposables = this._register(new DisposableStore());

	constructor(
		readonly profile: IUserDataProfile,
		private readonly exportFlags: ProfileResourceTypeFlags | undefined,
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

		if (this.exportFlags?.settings ?? true) {
			const settingsResource = this.instantiationService.createInstance(SettingsResource);
			const settingsContent = await settingsResource.getContent(this.profile);
			await settingsResource.apply(settingsContent, exportPreviewProfle);
			const settingsResourceTreeItem = this.instantiationService.createInstance(SettingsResourceTreeItem, exportPreviewProfle);
			if (await settingsResourceTreeItem.hasContent()) {
				roots.push(settingsResourceTreeItem);
			}
		}

		if (this.exportFlags?.keybindings ?? true) {
			const keybindingsResource = this.instantiationService.createInstance(KeybindingsResource);
			const keybindingsContent = await keybindingsResource.getContent(this.profile);
			await keybindingsResource.apply(keybindingsContent, exportPreviewProfle);
			const keybindingsResourceTreeItem = this.instantiationService.createInstance(KeybindingsResourceTreeItem, exportPreviewProfle);
			if (await keybindingsResourceTreeItem.hasContent()) {
				roots.push(keybindingsResourceTreeItem);
			}
		}

		if (this.exportFlags?.snippets ?? true) {
			const snippetsResource = this.instantiationService.createInstance(SnippetsResource);
			const snippetsContent = await snippetsResource.getContent(this.profile);
			await snippetsResource.apply(snippetsContent, exportPreviewProfle);
			const snippetsResourceTreeItem = this.instantiationService.createInstance(SnippetsResourceTreeItem, exportPreviewProfle);
			if (await snippetsResourceTreeItem.hasContent()) {
				roots.push(snippetsResourceTreeItem);
			}
		}

		if (this.exportFlags?.tasks ?? true) {
			const tasksResource = this.instantiationService.createInstance(TasksResource);
			const tasksContent = await tasksResource.getContent(this.profile);
			await tasksResource.apply(tasksContent, exportPreviewProfle);
			const tasksResourceTreeItem = this.instantiationService.createInstance(TasksResourceTreeItem, exportPreviewProfle);
			if (await tasksResourceTreeItem.hasContent()) {
				roots.push(tasksResourceTreeItem);
			}
		}

		if (this.exportFlags?.globalState ?? true) {
			const globalStateResource = joinPath(exportPreviewProfle.globalStorageHome, 'globalState.json').with({ scheme: USER_DATA_PROFILE_EXPORT_PREVIEW_SCHEME });
			const globalStateResourceTreeItem = this.instantiationService.createInstance(GlobalStateResourceExportTreeItem, exportPreviewProfle, globalStateResource);
			const content = await globalStateResourceTreeItem.getContent();
			if (content) {
				await this.fileService.writeFile(globalStateResource, VSBuffer.fromString(JSON.stringify(JSON.parse(content), null, '\t')));
				roots.push(globalStateResourceTreeItem);
			}
		}

		if (this.exportFlags?.extensions ?? true) {
			const extensionsResourceTreeItem = this.instantiationService.createInstance(ExtensionsResourceExportTreeItem, exportPreviewProfle);
			if (await extensionsResourceTreeItem.hasContent()) {
				roots.push(extensionsResourceTreeItem);
			}
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
			icon: profile.icon,
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

		return super.getProfileTemplate(name, this.profile.icon);
	}

}

registerSingleton(IUserDataProfileImportExportService, UserDataProfileImportExportService, InstantiationType.Delayed);
