/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action, IAction, Separator } from 'vs/base/common/actions';
import { Emitter } from 'vs/base/common/event';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { DidChangeProfilesEvent, isUserDataProfile, IUserDataProfile, IUserDataProfilesService, ProfileResourceType, ProfileResourceTypeFlags, toUserDataProfile, UseDefaultProfileFlags } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IProfileResourceChildTreeItem, IProfileTemplateInfo, isProfileURL, IUserDataProfileImportExportService, IUserDataProfileManagementService, IUserDataProfileService, IUserDataProfileTemplate } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { equals } from 'vs/base/common/objects';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';
import { ExtensionsResourceExportTreeItem, ExtensionsResourceImportTreeItem } from 'vs/workbench/services/userDataProfile/browser/extensionsResource';
import { SettingsResource, SettingsResourceTreeItem } from 'vs/workbench/services/userDataProfile/browser/settingsResource';
import { KeybindingsResource, KeybindingsResourceTreeItem } from 'vs/workbench/services/userDataProfile/browser/keybindingsResource';
import { TasksResource, TasksResourceTreeItem } from 'vs/workbench/services/userDataProfile/browser/tasksResource';
import { SnippetsResource, SnippetsResourceTreeItem } from 'vs/workbench/services/userDataProfile/browser/snippetsResource';
import { Codicon } from 'vs/base/common/codicons';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { IFileService } from 'vs/platform/files/common/files';
import { generateUuid } from 'vs/base/common/uuid';
import { CancelablePromise, createCancelablePromise, RunOnceScheduler } from 'vs/base/common/async';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { ITreeItemCheckboxState } from 'vs/workbench/common/views';
import { API_OPEN_EDITOR_COMMAND_ID } from 'vs/workbench/browser/parts/editor/editorCommands';
import { SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CONFIG_NEW_WINDOW_PROFILE } from 'vs/workbench/common/configuration';
import { ResourceMap } from 'vs/base/common/map';
import { getErrorMessage } from 'vs/base/common/errors';
import { isWeb } from 'vs/base/common/platform';
import { IProductService } from 'vs/platform/product/common/productService';
import { IOpenerService } from 'vs/platform/opener/common/opener';

export type ChangeEvent = {
	readonly name?: boolean;
	readonly icon?: boolean;
	readonly flags?: boolean;
	readonly active?: boolean;
	readonly message?: boolean;
	readonly copyFrom?: boolean;
	readonly copyFromInfo?: boolean;
	readonly copyFlags?: boolean;
	readonly preview?: boolean;
	readonly profile?: boolean;
	readonly disabled?: boolean;
	readonly newWindowProfile?: boolean;
};

export interface IProfileChildElement {
	readonly handle: string;
	readonly action?: IAction;
	readonly checkbox?: ITreeItemCheckboxState;
}

export interface IProfileResourceTypeElement extends IProfileChildElement {
	readonly resourceType: ProfileResourceType;
}

export interface IProfileResourceTypeChildElement extends IProfileChildElement {
	readonly label: string;
	readonly resource?: URI;
	readonly icon?: ThemeIcon;
}

export function isProfileResourceTypeElement(element: IProfileChildElement): element is IProfileResourceTypeElement {
	return (element as IProfileResourceTypeElement).resourceType !== undefined;
}

export function isProfileResourceChildElement(element: IProfileChildElement): element is IProfileResourceTypeChildElement {
	return (element as IProfileResourceTypeChildElement).label !== undefined;
}

export abstract class AbstractUserDataProfileElement extends Disposable {

	protected readonly _onDidChange = this._register(new Emitter<ChangeEvent>());
	readonly onDidChange = this._onDidChange.event;

	private readonly saveScheduler = this._register(new RunOnceScheduler(() => this.doSave(), 500));

	constructor(
		name: string,
		icon: string | undefined,
		flags: UseDefaultProfileFlags | undefined,
		isActive: boolean,
		@IUserDataProfileManagementService protected readonly userDataProfileManagementService: IUserDataProfileManagementService,
		@IUserDataProfilesService protected readonly userDataProfilesService: IUserDataProfilesService,
		@ICommandService protected readonly commandService: ICommandService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
	) {
		super();
		this._name = name;
		this._icon = icon;
		this._flags = flags;
		this._active = isActive;
		this._register(this.onDidChange(e => {
			if (!e.message) {
				this.validate();
			}
			this.save();
		}));
	}

	private _name = '';
	get name(): string { return this._name; }
	set name(name: string) {
		name = name.trim();
		if (this._name !== name) {
			this._name = name;
			this._onDidChange.fire({ name: true });
		}
	}

	private _icon: string | undefined;
	get icon(): string | undefined { return this._icon; }
	set icon(icon: string | undefined) {
		if (this._icon !== icon) {
			this._icon = icon;
			this._onDidChange.fire({ icon: true });
		}
	}

	private _flags: UseDefaultProfileFlags | undefined;
	get flags(): UseDefaultProfileFlags | undefined { return this._flags; }
	set flags(flags: UseDefaultProfileFlags | undefined) {
		if (!equals(this._flags, flags)) {
			this._flags = flags;
			this._onDidChange.fire({ flags: true });
		}
	}

	private _active: boolean = false;
	get active(): boolean { return this._active; }
	set active(active: boolean) {
		if (this._active !== active) {
			this._active = active;
			this._onDidChange.fire({ active: true });
		}
	}

	private _message: string | undefined;
	get message(): string | undefined { return this._message; }
	set message(message: string | undefined) {
		if (this._message !== message) {
			this._message = message;
			this._onDidChange.fire({ message: true });
		}
	}

	private _disabled: boolean = false;
	get disabled(): boolean { return this._disabled; }
	set disabled(saving: boolean) {
		if (this._disabled !== saving) {
			this._disabled = saving;
			this._onDidChange.fire({ disabled: true });
		}
	}

	getFlag(key: ProfileResourceType): boolean {
		return this.flags?.[key] ?? false;
	}

	setFlag(key: ProfileResourceType, value: boolean): void {
		const flags = this.flags ? { ...this.flags } : {};
		if (value) {
			flags[key] = true;
		} else {
			delete flags[key];
		}
		this.flags = flags;
	}

	validate(): void {
		if (!this.name) {
			this.message = localize('name required', "Profile name is required and must be a non-empty value.");
			return;
		}
		if (this.shouldValidateName() && this.name !== this.getInitialName() && this.userDataProfilesService.profiles.some(p => p.name === this.name)) {
			this.message = localize('profileExists', "Profile with name {0} already exists.", this.name);
			return;
		}
		if (
			this.flags && this.flags.settings && this.flags.keybindings && this.flags.tasks && this.flags.snippets && this.flags.extensions
		) {
			this.message = localize('invalid configurations', "The profile should contain at least one configuration.");
			return;
		}
		this.message = undefined;
	}

	async getChildren(resourceType?: ProfileResourceType): Promise<IProfileChildElement[]> {
		if (resourceType === undefined) {
			const resourceTypes = [
				ProfileResourceType.Settings,
				ProfileResourceType.Keybindings,
				ProfileResourceType.Tasks,
				ProfileResourceType.Snippets,
				ProfileResourceType.Extensions
			];
			return Promise.all(resourceTypes.map<Promise<IProfileResourceTypeElement>>(async r => {
				const children = (r === ProfileResourceType.Settings
					|| r === ProfileResourceType.Keybindings
					|| r === ProfileResourceType.Tasks) ? await this.getChildrenForResourceType(r) : [];
				return {
					handle: r,
					checkbox: undefined,
					resourceType: r,
					action: children.length
						? new Action('_open',
							localize('open', "Open to the Side"),
							ThemeIcon.asClassName(Codicon.goToFile),
							true,
							() => children[0]?.action?.run())
						: undefined
				};
			}));
		}
		return this.getChildrenForResourceType(resourceType);
	}

	protected async getChildrenForResourceType(resourceType: ProfileResourceType): Promise<IProfileChildElement[]> {
		return [];
	}

	protected async getChildrenFromProfile(profile: IUserDataProfile, resourceType: ProfileResourceType): Promise<IProfileResourceTypeChildElement[]> {
		profile = this.getFlag(resourceType) ? this.userDataProfilesService.defaultProfile : profile;
		let children: IProfileResourceChildTreeItem[] = [];
		switch (resourceType) {
			case ProfileResourceType.Settings:
				children = await this.instantiationService.createInstance(SettingsResourceTreeItem, profile).getChildren();
				break;
			case ProfileResourceType.Keybindings:
				children = await this.instantiationService.createInstance(KeybindingsResourceTreeItem, profile).getChildren();
				break;
			case ProfileResourceType.Snippets:
				children = (await this.instantiationService.createInstance(SnippetsResourceTreeItem, profile).getChildren()) ?? [];
				break;
			case ProfileResourceType.Tasks:
				children = await this.instantiationService.createInstance(TasksResourceTreeItem, profile).getChildren();
				break;
			case ProfileResourceType.Extensions:
				children = await this.instantiationService.createInstance(ExtensionsResourceExportTreeItem, profile).getChildren();
				break;
		}
		return children.map<IProfileResourceTypeChildElement>(child => this.toUserDataProfileResourceChildElement(child));
	}

	protected toUserDataProfileResourceChildElement(child: IProfileResourceChildTreeItem): IProfileResourceTypeChildElement {
		return {
			handle: child.handle,
			checkbox: child.checkbox,
			label: child.label?.label ?? '',
			resource: URI.revive(child.resourceUri),
			icon: child.themeIcon,
			action: new Action('_openChild', localize('open', "Open to the Side"), ThemeIcon.asClassName(Codicon.goToFile), true, async () => {
				if (child.parent.type === ProfileResourceType.Extensions) {
					await this.commandService.executeCommand('extension.open', child.handle, undefined, true, undefined, true);
				} else if (child.resourceUri) {
					await this.commandService.executeCommand(API_OPEN_EDITOR_COMMAND_ID, child.resourceUri, [SIDE_GROUP], undefined);
				}
			})
		};

	}

	getInitialName(): string {
		return '';
	}

	shouldValidateName(): boolean {
		return true;
	}

	save(): void {
		this.saveScheduler.schedule();
	}

	private hasUnsavedChanges(profile: IUserDataProfile): boolean {
		if (this.name !== profile.name) {
			return true;
		}
		if (this.icon !== profile.icon) {
			return true;
		}
		if (!equals(this.flags ?? {}, profile.useDefaultFlags ?? {})) {
			return true;
		}
		return false;
	}

	protected async saveProfile(profile: IUserDataProfile): Promise<IUserDataProfile | undefined> {
		if (!this.hasUnsavedChanges(profile)) {
			return;
		}
		this.validate();
		if (this.message) {
			return;
		}
		const useDefaultFlags: UseDefaultProfileFlags | undefined = this.flags
			? this.flags.settings && this.flags.keybindings && this.flags.tasks && this.flags.globalState && this.flags.extensions ? undefined : this.flags
			: undefined;

		return await this.userDataProfileManagementService.updateProfile(profile, {
			name: this.name,
			icon: this.icon,
			useDefaultFlags: profile.useDefaultFlags && !useDefaultFlags ? {} : useDefaultFlags
		});
	}

	abstract readonly titleButtons: [Action[], Action[]];
	abstract readonly actions: [IAction[], IAction[]];

	protected abstract doSave(): Promise<void>;
}

export class UserDataProfileElement extends AbstractUserDataProfileElement {

	get profile(): IUserDataProfile { return this._profile; }

	constructor(
		private _profile: IUserDataProfile,
		readonly titleButtons: [Action[], Action[]],
		readonly actions: [IAction[], IAction[]],
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUserDataProfileManagementService userDataProfileManagementService: IUserDataProfileManagementService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@ICommandService commandService: ICommandService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(
			_profile.name,
			_profile.icon,
			_profile.useDefaultFlags,
			userDataProfileService.currentProfile.id === _profile.id,
			userDataProfileManagementService,
			userDataProfilesService,
			commandService,
			instantiationService,
		);
		this._isNewWindowProfile = this.configurationService.getValue(CONFIG_NEW_WINDOW_PROFILE) === this.profile.name;
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CONFIG_NEW_WINDOW_PROFILE)) {
				this.isNewWindowProfile = this.configurationService.getValue(CONFIG_NEW_WINDOW_PROFILE) === this.profile.name;
			}
		}
		));
		this._register(this.userDataProfileService.onDidChangeCurrentProfile(() => this.active = this.userDataProfileService.currentProfile.id === this.profile.id));
		this._register(this.userDataProfilesService.onDidChangeProfiles(({ updated }) => {
			const profile = updated.find(p => p.id === this.profile.id);
			if (profile) {
				this._profile = profile;
				this.reset();
				this._onDidChange.fire({ profile: true });
			}
		}));
	}

	reset(): void {
		this.name = this._profile.name;
		this.icon = this._profile.icon;
		this.flags = this._profile.useDefaultFlags;
	}

	public async toggleNewWindowProfile(): Promise<void> {
		if (this._isNewWindowProfile) {
			await this.configurationService.updateValue(CONFIG_NEW_WINDOW_PROFILE, null);
		} else {
			await this.configurationService.updateValue(CONFIG_NEW_WINDOW_PROFILE, this.profile.name);
		}
	}

	private _isNewWindowProfile: boolean = false;
	get isNewWindowProfile(): boolean { return this._isNewWindowProfile; }
	set isNewWindowProfile(isNewWindowProfile: boolean) {
		if (this._isNewWindowProfile !== isNewWindowProfile) {
			this._isNewWindowProfile = isNewWindowProfile;
			this._onDidChange.fire({ newWindowProfile: true });
		}
	}

	public async toggleCurrentWindowProfile(): Promise<void> {
		if (this.userDataProfileService.currentProfile.id === this.profile.id) {
			await this.userDataProfileManagementService.switchProfile(this.userDataProfilesService.defaultProfile);
		} else {
			await this.userDataProfileManagementService.switchProfile(this.profile);
		}
	}

	protected override async doSave(): Promise<void> {
		await this.saveProfile(this.profile);
	}

	protected override async getChildrenForResourceType(resourceType: ProfileResourceType): Promise<IProfileChildElement[]> {
		return this.getChildrenFromProfile(this.profile, resourceType);
	}

	override getInitialName(): string {
		return this.profile.name;
	}

}

const USER_DATA_PROFILE_TEMPLATE_PREVIEW_SCHEME = 'userdataprofiletemplatepreview';

export class NewProfileElement extends AbstractUserDataProfileElement {

	private _copyFromTemplates = new ResourceMap<string>();
	get copyFromTemplates(): ResourceMap<string> { return this._copyFromTemplates; }

	private templatePromise: CancelablePromise<void> | undefined;
	private template: IUserDataProfileTemplate | null = null;

	private defaultName: string;
	private defaultIcon: string | undefined;

	constructor(
		name: string,
		copyFrom: URI | IUserDataProfile | undefined,
		readonly titleButtons: [Action[], Action[]],
		readonly actions: [IAction[], IAction[]],
		@IFileService private readonly fileService: IFileService,
		@IUserDataProfileImportExportService private readonly userDataProfileImportExportService: IUserDataProfileImportExportService,
		@IUserDataProfileManagementService userDataProfileManagementService: IUserDataProfileManagementService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@ICommandService commandService: ICommandService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(
			name,
			undefined,
			undefined,
			false,
			userDataProfileManagementService,
			userDataProfilesService,
			commandService,
			instantiationService,
		);
		this.defaultName = name;
		this._copyFrom = copyFrom;
		this._copyFlags = this.getCopyFlagsFrom(copyFrom);
		this.initialize();
		this._register(this.fileService.registerProvider(USER_DATA_PROFILE_TEMPLATE_PREVIEW_SCHEME, this._register(new InMemoryFileSystemProvider())));
	}

	private _copyFrom: IUserDataProfile | URI | undefined;
	get copyFrom(): IUserDataProfile | URI | undefined { return this._copyFrom; }
	set copyFrom(copyFrom: IUserDataProfile | URI | undefined) {
		if (this._copyFrom !== copyFrom) {
			this._copyFrom = copyFrom;
			this._onDidChange.fire({ copyFrom: true });
			this.flags = undefined;
			this.copyFlags = this.getCopyFlagsFrom(copyFrom);
			if (copyFrom instanceof URI) {
				this.templatePromise?.cancel();
				this.templatePromise = undefined;
			}
			this.initialize();
		}
	}

	private _copyFlags: ProfileResourceTypeFlags | undefined;
	get copyFlags(): ProfileResourceTypeFlags | undefined { return this._copyFlags; }
	set copyFlags(flags: ProfileResourceTypeFlags | undefined) {
		if (!equals(this._copyFlags, flags)) {
			this._copyFlags = flags;
			this._onDidChange.fire({ copyFlags: true });
		}
	}

	private _previewProfile: IUserDataProfile | undefined;
	get previewProfile(): IUserDataProfile | undefined { return this._previewProfile; }
	set previewProfile(profile: IUserDataProfile | undefined) {
		if (this._previewProfile !== profile) {
			this._previewProfile = profile;
			this._onDidChange.fire({ preview: true });
		}
	}

	private getCopyFlagsFrom(copyFrom: URI | IUserDataProfile | undefined): ProfileResourceTypeFlags | undefined {
		return copyFrom ? {
			settings: true,
			keybindings: true,
			snippets: true,
			tasks: true,
			extensions: true
		} : undefined;
	}

	private async initialize(): Promise<void> {
		this.disabled = true;
		try {
			if (this.copyFrom instanceof URI) {
				await this.resolveTemplate(this.copyFrom);
				if (this.template) {
					this.copyFromTemplates.set(this.copyFrom, this.template.name);
					if (this.defaultName === this.name) {
						this.name = this.defaultName = this.template.name ?? '';
					}
					if (this.defaultIcon === this.icon) {
						this.icon = this.defaultIcon = this.template.icon;
					}
					this.setCopyFlag(ProfileResourceType.Settings, !!this.template.settings);
					this.setCopyFlag(ProfileResourceType.Keybindings, !!this.template.keybindings);
					this.setCopyFlag(ProfileResourceType.Tasks, !!this.template.tasks);
					this.setCopyFlag(ProfileResourceType.Snippets, !!this.template.snippets);
					this.setCopyFlag(ProfileResourceType.Extensions, !!this.template.extensions);
					this._onDidChange.fire({ copyFromInfo: true });
				}
				return;
			}

			if (isUserDataProfile(this.copyFrom)) {
				if (this.defaultName === this.name) {
					this.name = this.defaultName = localize('copy from', "{0} (Copy)", this.copyFrom.name);
				}
				if (this.defaultIcon === this.icon) {
					this.icon = this.defaultIcon = this.copyFrom.icon;
				}
				this.setCopyFlag(ProfileResourceType.Settings, true);
				this.setCopyFlag(ProfileResourceType.Keybindings, true);
				this.setCopyFlag(ProfileResourceType.Tasks, true);
				this.setCopyFlag(ProfileResourceType.Snippets, true);
				this.setCopyFlag(ProfileResourceType.Extensions, true);
				this._onDidChange.fire({ copyFromInfo: true });
				return;
			}

			if (this.defaultName === this.name) {
				this.name = this.defaultName = localize('untitled', "Untitled");
			}
			if (this.defaultIcon === this.icon) {
				this.icon = this.defaultIcon = undefined;
			}
			this.setCopyFlag(ProfileResourceType.Settings, false);
			this.setCopyFlag(ProfileResourceType.Keybindings, false);
			this.setCopyFlag(ProfileResourceType.Tasks, false);
			this.setCopyFlag(ProfileResourceType.Snippets, false);
			this.setCopyFlag(ProfileResourceType.Extensions, false);
			this._onDidChange.fire({ copyFromInfo: true });
		} finally {
			this.disabled = false;
		}
	}

	async resolveTemplate(uri: URI): Promise<IUserDataProfileTemplate | null> {
		if (!this.templatePromise) {
			this.templatePromise = createCancelablePromise(async token => {
				const template = await this.userDataProfileImportExportService.resolveProfileTemplate(uri);
				if (!token.isCancellationRequested) {
					this.template = template;
				}
			});
		}
		await this.templatePromise;
		return this.template;
	}

	hasResource(resourceType: ProfileResourceType): boolean {
		if (this.template) {
			switch (resourceType) {
				case ProfileResourceType.Settings:
					return !!this.template.settings;
				case ProfileResourceType.Keybindings:
					return !!this.template.keybindings;
				case ProfileResourceType.Snippets:
					return !!this.template.snippets;
				case ProfileResourceType.Tasks:
					return !!this.template.tasks;
				case ProfileResourceType.Extensions:
					return !!this.template.extensions;
			}
		}
		return true;
	}

	getCopyFlag(key: ProfileResourceType): boolean {
		return this.copyFlags?.[key] ?? false;
	}

	setCopyFlag(key: ProfileResourceType, value: boolean): void {
		const flags = this.copyFlags ? { ...this.copyFlags } : {};
		flags[key] = value;
		this.copyFlags = flags;
	}

	getCopyFromName(): string | undefined {
		if (isUserDataProfile(this.copyFrom)) {
			return this.copyFrom.name;
		}
		if (this.copyFrom instanceof URI) {
			return this.copyFromTemplates.get(this.copyFrom);
		}
		return undefined;
	}

	protected override async getChildrenForResourceType(resourceType: ProfileResourceType): Promise<IProfileChildElement[]> {
		if (this.getFlag(resourceType)) {
			return this.getChildrenFromProfile(this.userDataProfilesService.defaultProfile, resourceType);
		}
		if (!this.getCopyFlag(resourceType)) {
			return [];
		}
		if (this.copyFrom instanceof URI) {
			await this.resolveTemplate(this.copyFrom);
			if (!this.template) {
				return [];
			}
			return this.getChildrenFromProfileTemplate(this.template, resourceType);
		}
		if (this.copyFrom) {
			return this.getChildrenFromProfile(this.copyFrom, resourceType);
		}
		return [];
	}

	private async getChildrenFromProfileTemplate(profileTemplate: IUserDataProfileTemplate, resourceType: ProfileResourceType): Promise<IProfileResourceTypeChildElement[]> {
		const profile = toUserDataProfile(generateUuid(), this.name, URI.file('/root').with({ scheme: USER_DATA_PROFILE_TEMPLATE_PREVIEW_SCHEME }), URI.file('/cache').with({ scheme: USER_DATA_PROFILE_TEMPLATE_PREVIEW_SCHEME }));
		switch (resourceType) {
			case ProfileResourceType.Settings:
				if (profileTemplate.settings) {
					await this.instantiationService.createInstance(SettingsResource).apply(profileTemplate.settings, profile);
					return this.getChildrenFromProfile(profile, resourceType);
				}
				return [];
			case ProfileResourceType.Keybindings:
				if (profileTemplate.keybindings) {
					await this.instantiationService.createInstance(KeybindingsResource).apply(profileTemplate.keybindings, profile);
					return this.getChildrenFromProfile(profile, resourceType);
				}
				return [];
			case ProfileResourceType.Snippets:
				if (profileTemplate.snippets) {
					await this.instantiationService.createInstance(SnippetsResource).apply(profileTemplate.snippets, profile);
					return this.getChildrenFromProfile(profile, resourceType);
				}
				return [];
			case ProfileResourceType.Tasks:
				if (profileTemplate.tasks) {
					await this.instantiationService.createInstance(TasksResource).apply(profileTemplate.tasks, profile);
					return this.getChildrenFromProfile(profile, resourceType);
				}
				return [];
			case ProfileResourceType.Extensions:
				if (profileTemplate.extensions) {
					const children = await this.instantiationService.createInstance(ExtensionsResourceImportTreeItem, profileTemplate.extensions).getChildren();
					return children.map(child => this.toUserDataProfileResourceChildElement(child));
				}
				return [];
		}
		return [];
	}

	override shouldValidateName(): boolean {
		return !this.copyFrom;
	}

	override getInitialName(): string {
		return this.previewProfile?.name ?? '';
	}

	protected override async doSave(): Promise<void> {
		if (this.previewProfile) {
			const profile = await this.saveProfile(this.previewProfile);
			if (profile) {
				this.previewProfile = profile;
			}
		}
	}
}

export class UserDataProfilesEditorModel extends EditorModel {

	private static INSTANCE: UserDataProfilesEditorModel | undefined;
	static getInstance(instantiationService: IInstantiationService): UserDataProfilesEditorModel {
		if (!UserDataProfilesEditorModel.INSTANCE) {
			UserDataProfilesEditorModel.INSTANCE = instantiationService.createInstance(UserDataProfilesEditorModel);
		}
		return UserDataProfilesEditorModel.INSTANCE;
	}

	private _profiles: [AbstractUserDataProfileElement, DisposableStore][] = [];
	get profiles(): AbstractUserDataProfileElement[] {
		return this._profiles
			.map(([profile]) => profile)
			.sort((a, b) => {
				if (a instanceof NewProfileElement) {
					return 1;
				}
				if (b instanceof NewProfileElement) {
					return -1;
				}
				if (a instanceof UserDataProfileElement && a.profile.isDefault) {
					return -1;
				}
				if (b instanceof UserDataProfileElement && b.profile.isDefault) {
					return 1;
				}
				return a.name.localeCompare(b.name);
			});
	}

	private newProfileElement: NewProfileElement | undefined;

	private _onDidChange = this._register(new Emitter<AbstractUserDataProfileElement | undefined>());
	readonly onDidChange = this._onDidChange.event;

	private _templates: IProfileTemplateInfo[] | undefined;
	get templates(): readonly IProfileTemplateInfo[] { return this._templates ?? []; }

	constructor(
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
		@IUserDataProfileImportExportService private readonly userDataProfileImportExportService: IUserDataProfileImportExportService,
		@IDialogService private readonly dialogService: IDialogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IHostService private readonly hostService: IHostService,
		@IProductService private readonly productService: IProductService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		for (const profile of userDataProfilesService.profiles) {
			if (!profile.isTransient) {
				this._profiles.push(this.createProfileElement(profile));
			}
		}
		this._register(toDisposable(() => this._profiles.splice(0, this._profiles.length).map(([, disposables]) => disposables.dispose())));
		this._register(userDataProfilesService.onDidChangeProfiles(e => this.onDidChangeProfiles(e)));
	}

	private onDidChangeProfiles(e: DidChangeProfilesEvent): void {
		let changed = false;
		for (const profile of e.added) {
			if (!profile.isTransient && profile.name !== this.newProfileElement?.name) {
				changed = true;
				this._profiles.push(this.createProfileElement(profile));
			}
		}
		for (const profile of e.removed) {
			if (profile.id === this.newProfileElement?.previewProfile?.id) {
				this.newProfileElement.previewProfile = undefined;
			}
			const index = this._profiles.findIndex(([p]) => p instanceof UserDataProfileElement && p.profile.id === profile.id);
			if (index !== -1) {
				changed = true;
				this._profiles.splice(index, 1).map(([, disposables]) => disposables.dispose());
			}
		}
		if (changed) {
			this._onDidChange.fire(undefined);
		}
	}

	override async resolve(): Promise<void> {
		await super.resolve();
		this._templates = await this.userDataProfileManagementService.getBuiltinProfileTemplates();
	}

	private createProfileElement(profile: IUserDataProfile): [UserDataProfileElement, DisposableStore] {
		const disposables = new DisposableStore();

		const activateAction = disposables.add(new Action(
			'userDataProfile.activate',
			localize('active', "Use for Current Window"),
			ThemeIcon.asClassName(Codicon.check),
			true,
			() => this.userDataProfileManagementService.switchProfile(profileElement.profile)
		));

		const copyFromProfileAction = disposables.add(new Action(
			'userDataProfile.copyFromProfile',
			localize('copyFromProfile', "Duplicate..."),
			ThemeIcon.asClassName(Codicon.copy),
			true, () => this.createNewProfile(profileElement.profile)
		));

		const exportAction = disposables.add(new Action(
			'userDataProfile.export',
			localize('export', "Export..."),
			ThemeIcon.asClassName(Codicon.export),
			true,
			() => this.userDataProfileImportExportService.exportProfile(profile)
		));

		const deleteAction = disposables.add(new Action(
			'userDataProfile.delete',
			localize('delete', "Delete"),
			ThemeIcon.asClassName(Codicon.trash),
			true,
			() => this.removeProfile(profileElement.profile)
		));

		const newWindowAction = disposables.add(new Action(
			'userDataProfile.newWindow',
			localize('open new window', "Open New Window with this Profile"),
			ThemeIcon.asClassName(Codicon.emptyWindow),
			true,
			() => this.openWindow(profileElement.profile)
		));

		const useAsNewWindowProfileAction = disposables.add(new Action(
			'userDataProfile.useAsNewWindowProfile',
			localize('use as new window', "Use for New Windows"),
			undefined,
			true,
			() => profileElement.toggleNewWindowProfile()
		));

		const primaryActions: IAction[] = [];
		primaryActions.push(newWindowAction);
		if (!profile.isDefault) {
			primaryActions.push(deleteAction);
		}
		const secondaryActions: IAction[] = [];
		secondaryActions.push(activateAction);
		secondaryActions.push(useAsNewWindowProfileAction);
		secondaryActions.push(new Separator());
		secondaryActions.push(copyFromProfileAction);
		secondaryActions.push(exportAction);

		const profileElement = disposables.add(this.instantiationService.createInstance(UserDataProfileElement,
			profile,
			[[], []],
			[primaryActions, secondaryActions]
		));

		activateAction.checked = this.userDataProfileService.currentProfile.id === profileElement.profile.id;
		disposables.add(this.userDataProfileService.onDidChangeCurrentProfile(() =>
			activateAction.checked = this.userDataProfileService.currentProfile.id === profileElement.profile.id));

		useAsNewWindowProfileAction.checked = profileElement.isNewWindowProfile;
		disposables.add(profileElement.onDidChange(e => {
			if (e.newWindowProfile) {
				useAsNewWindowProfileAction.checked = profileElement.isNewWindowProfile;
			}
		}));

		return [profileElement, disposables];
	}

	async createNewProfile(copyFrom?: URI | IUserDataProfile): Promise<AbstractUserDataProfileElement | undefined> {
		if (this.newProfileElement) {
			const result = await this.dialogService.confirm({
				type: 'info',
				message: localize('new profile exists', "A new profile is already being created. Do you want to discard it and create a new one?"),
				primaryButton: localize('discard', "Discard & Create"),
				cancelButton: localize('cancel', "Cancel")
			});
			if (!result.confirmed) {
				return;
			}
			this.revert();
		}

		if (copyFrom instanceof URI) {
			try {
				await this.userDataProfileImportExportService.resolveProfileTemplate(copyFrom);
			} catch (error) {
				this.dialogService.error(getErrorMessage(error));
				return;
			}
		}

		if (!this.newProfileElement) {
			const disposables = new DisposableStore();
			const cancellationTokenSource = new CancellationTokenSource();
			disposables.add(toDisposable(() => cancellationTokenSource.dispose(true)));
			const primaryActions: Action[] = [];
			const secondaryActions: Action[] = [];
			const createAction = disposables.add(new Action(
				'userDataProfile.create',
				localize('create', "Create"),
				undefined,
				true,
				() => this.saveNewProfile(false, cancellationTokenSource.token)
			));
			primaryActions.push(createAction);
			if (isWeb && copyFrom instanceof URI && isProfileURL(copyFrom)) {
				primaryActions.push(new Action(
					'userDataProfile.createInDesktop',
					localize('import in desktop', "Create in {0}", this.productService.nameLong),
					undefined,
					true,
					() => this.openerService.open(copyFrom, { openExternal: true })
				));
			}
			const cancelAction = disposables.add(new Action(
				'userDataProfile.cancel',
				localize('cancel', "Cancel"),
				ThemeIcon.asClassName(Codicon.trash),
				true,
				() => this.discardNewProfile()
			));
			secondaryActions.push(cancelAction);
			const previewProfileAction = disposables.add(new Action(
				'userDataProfile.preview',
				localize('preview', "Preview"),
				ThemeIcon.asClassName(Codicon.openPreview),
				true,
				() => this.previewNewProfile(cancellationTokenSource.token)
			));
			if (!isWeb) {
				secondaryActions.push(previewProfileAction);
			}
			const exportAction = disposables.add(new Action(
				'userDataProfile.export',
				localize('export', "Export..."),
				ThemeIcon.asClassName(Codicon.export),
				isUserDataProfile(copyFrom),
				() => this.exportNewProfile(cancellationTokenSource.token)
			));
			this.newProfileElement = disposables.add(this.instantiationService.createInstance(NewProfileElement,
				copyFrom ? '' : localize('untitled', "Untitled"),
				copyFrom,
				[primaryActions, secondaryActions],
				[[cancelAction], [exportAction]],
			));
			const updateCreateActionLabel = () => {
				if (createAction.enabled) {
					if (this.newProfileElement?.copyFrom && this.userDataProfilesService.profiles.some(p => p.name === this.newProfileElement?.name)) {
						createAction.label = localize('replace', "Replace");
					} else {
						createAction.label = localize('create', "Create");
					}
				}
			};
			updateCreateActionLabel();
			disposables.add(this.newProfileElement.onDidChange(e => {
				if (e.preview) {
					previewProfileAction.checked = !!this.newProfileElement?.previewProfile;
				}
				if (e.disabled || e.message) {
					previewProfileAction.enabled = createAction.enabled = !this.newProfileElement?.disabled && !this.newProfileElement?.message;
				}
				if (e.name || e.copyFrom) {
					updateCreateActionLabel();
					exportAction.enabled = isUserDataProfile(this.newProfileElement?.copyFrom);
				}
			}));
			disposables.add(this.userDataProfilesService.onDidChangeProfiles((e) => {
				updateCreateActionLabel();
				this.newProfileElement?.validate();
			}));
			this._profiles.push([this.newProfileElement, disposables]);
			this._onDidChange.fire(this.newProfileElement);
		}
		return this.newProfileElement;
	}

	revert(): void {
		this.removeNewProfile();
		this._onDidChange.fire(undefined);
	}

	private removeNewProfile(): void {
		if (this.newProfileElement) {
			const index = this._profiles.findIndex(([p]) => p === this.newProfileElement);
			if (index !== -1) {
				this._profiles.splice(index, 1).map(([, disposables]) => disposables.dispose());
			}
			this.newProfileElement = undefined;
		}
	}

	private async previewNewProfile(token: CancellationToken): Promise<void> {
		if (!this.newProfileElement) {
			return;
		}
		if (this.newProfileElement.previewProfile) {
			return;
		}
		const profile = await this.saveNewProfile(true, token);
		if (profile) {
			this.newProfileElement.previewProfile = profile;
			await this.openWindow(profile);
		}
	}

	private async exportNewProfile(token: CancellationToken): Promise<void> {
		if (!this.newProfileElement) {
			return;
		}
		if (!isUserDataProfile(this.newProfileElement.copyFrom)) {
			return;
		}
		const profile = toUserDataProfile(
			generateUuid(),
			this.newProfileElement.name,
			this.newProfileElement.copyFrom.location,
			this.newProfileElement.copyFrom.cacheHome,
			{
				icon: this.newProfileElement.icon,
				useDefaultFlags: this.newProfileElement.flags,
			},
			this.userDataProfilesService.defaultProfile
		);
		await this.userDataProfileImportExportService.exportProfile(profile, this.newProfileElement.copyFlags);
	}

	async saveNewProfile(transient?: boolean, token?: CancellationToken): Promise<IUserDataProfile | undefined> {
		if (!this.newProfileElement) {
			return undefined;
		}

		this.newProfileElement.validate();
		if (this.newProfileElement.message) {
			return undefined;
		}

		this.newProfileElement.disabled = true;
		let profile: IUserDataProfile | undefined;

		try {
			if (this.newProfileElement.previewProfile) {
				if (!transient) {
					profile = await this.userDataProfileManagementService.updateProfile(this.newProfileElement.previewProfile, { transient: false });
				}
			}
			else {
				const { flags, icon, name, copyFrom } = this.newProfileElement;
				const useDefaultFlags: UseDefaultProfileFlags | undefined = flags
					? flags.settings && flags.keybindings && flags.tasks && flags.globalState && flags.extensions ? undefined : flags
					: undefined;

				type CreateProfileInfoClassification = {
					owner: 'sandy081';
					comment: 'Report when profile is about to be created';
					source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Type of profile source' };
				};
				type CreateProfileInfoEvent = {
					source: string | undefined;
				};
				const createProfileTelemetryData: CreateProfileInfoEvent = { source: copyFrom instanceof URI ? 'template' : isUserDataProfile(copyFrom) ? 'profile' : copyFrom ? 'external' : undefined };

				if (copyFrom instanceof URI) {
					const template = await this.newProfileElement.resolveTemplate(copyFrom);
					if (template) {
						this.telemetryService.publicLog2<CreateProfileInfoEvent, CreateProfileInfoClassification>('userDataProfile.createFromTemplate', createProfileTelemetryData);
						profile = await this.userDataProfileImportExportService.createProfileFromTemplate(
							template,
							{
								name,
								useDefaultFlags,
								icon,
								resourceTypeFlags: this.newProfileElement.copyFlags,
								transient
							},
							token ?? CancellationToken.None
						);
					}
				} else if (isUserDataProfile(copyFrom)) {
					this.telemetryService.publicLog2<CreateProfileInfoEvent, CreateProfileInfoClassification>('userDataProfile.createFromProfile', createProfileTelemetryData);
					profile = await this.userDataProfileImportExportService.createFromProfile(
						copyFrom,
						{
							name,
							useDefaultFlags,
							icon: icon,
							resourceTypeFlags: this.newProfileElement.copyFlags,
							transient
						},
						token ?? CancellationToken.None
					);
				} else {
					this.telemetryService.publicLog2<CreateProfileInfoEvent, CreateProfileInfoClassification>('userDataProfile.createEmptyProfile', createProfileTelemetryData);
					profile = await this.userDataProfileManagementService.createProfile(name, { useDefaultFlags, icon, transient });
				}
			}
		} finally {
			if (this.newProfileElement) {
				this.newProfileElement.disabled = false;
			}
		}

		if (token?.isCancellationRequested) {
			if (profile) {
				try {
					await this.userDataProfileManagementService.removeProfile(profile);
				} catch (error) {
					// ignore
				}
			}
			return;
		}

		if (profile && !profile.isTransient && this.newProfileElement) {
			this.removeNewProfile();
			const existing = this._profiles.find(([p]) => p.name === profile.name);
			if (existing) {
				this._onDidChange.fire(existing[0]);
			} else {
				this.onDidChangeProfiles({ added: [profile], removed: [], updated: [], all: this.userDataProfilesService.profiles });
			}
		}

		return profile;
	}

	private async discardNewProfile(): Promise<void> {
		if (!this.newProfileElement) {
			return;
		}
		if (this.newProfileElement.previewProfile) {
			await this.userDataProfileManagementService.removeProfile(this.newProfileElement.previewProfile);
		}
		this.removeNewProfile();
		this._onDidChange.fire(undefined);
	}

	private async removeProfile(profile: IUserDataProfile): Promise<void> {
		const result = await this.dialogService.confirm({
			type: 'info',
			message: localize('deleteProfile', "Are you sure you want to delete the profile '{0}'?", profile.name),
			primaryButton: localize('delete', "Delete"),
			cancelButton: localize('cancel', "Cancel")
		});
		if (result.confirmed) {
			await this.userDataProfileManagementService.removeProfile(profile);
		}
	}

	private async openWindow(profile: IUserDataProfile): Promise<void> {
		await this.hostService.openWindow({ forceProfile: profile.name });
	}
}
