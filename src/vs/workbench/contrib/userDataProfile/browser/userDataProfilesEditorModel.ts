/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action, IAction, Separator } from 'vs/base/common/actions';
import { Emitter, Event } from 'vs/base/common/event';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { DidChangeProfilesEvent, isUserDataProfile, IUserDataProfile, IUserDataProfilesService, ProfileResourceType, ProfileResourceTypeFlags, toUserDataProfile, UseDefaultProfileFlags } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IProfileResourceChildTreeItem, IUserDataProfileImportExportService, IUserDataProfileManagementService, IUserDataProfileService, IUserDataProfileTemplate } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
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
import { RunOnceScheduler } from 'vs/base/common/async';

export type ChangeEvent = {
	readonly name?: boolean;
	readonly icon?: boolean;
	readonly flags?: boolean;
	readonly active?: boolean;
	readonly message?: boolean;
	readonly copyFrom?: boolean;
	readonly copyFlags?: boolean;
};

export interface IProfileElement {
	readonly onDidChange?: Event<ChangeEvent>;
	readonly name: string;
	readonly icon?: string;
	readonly flags?: UseDefaultProfileFlags;
	readonly active?: boolean;
	readonly message?: string;
}

export abstract class AbstractUserDataProfileElement extends Disposable {

	protected readonly _onDidChange = this._register(new Emitter<ChangeEvent>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		name: string,
		icon: string | undefined,
		flags: UseDefaultProfileFlags | undefined,
		isActive: boolean,
		@IUserDataProfilesService protected readonly userDataProfilesService: IUserDataProfilesService,
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
			if (this.primaryAction) {
				this.primaryAction.enabled = !this.message;
			}
		}));
	}

	private _name = '';
	get name(): string { return this._name; }
	set name(label: string) {
		if (this._name !== label) {
			this._name = label;
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
			this.message = localize('profileNameRequired', "Profile name is required.");
			return;
		}
		if (this.name !== this.getInitialName() && this.userDataProfilesService.profiles.some(p => p.name === this.name)) {
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

	async getChildren(resourceType: ProfileResourceType): Promise<IProfileResourceChildTreeItem[]> {
		return [];
	}

	protected async getChildrenFromProfile(profile: IUserDataProfile, resourceType: ProfileResourceType): Promise<IProfileResourceChildTreeItem[]> {
		profile = this.getFlag(resourceType) ? this.userDataProfilesService.defaultProfile : profile;
		switch (resourceType) {
			case ProfileResourceType.Settings:
				return this.instantiationService.createInstance(SettingsResourceTreeItem, profile).getChildren();
			case ProfileResourceType.Keybindings:
				return this.instantiationService.createInstance(KeybindingsResourceTreeItem, profile).getChildren();
			case ProfileResourceType.Snippets:
				return (await this.instantiationService.createInstance(SnippetsResourceTreeItem, profile).getChildren()) ?? [];
			case ProfileResourceType.Tasks:
				return this.instantiationService.createInstance(TasksResourceTreeItem, profile).getChildren();
			case ProfileResourceType.Extensions:
				return this.instantiationService.createInstance(ExtensionsResourceExportTreeItem, profile).getChildren();
		}
		return [];
	}

	protected getInitialName(): string {
		return '';
	}

	abstract readonly primaryAction?: Action;
	abstract readonly titleActions: [IAction[], IAction[]];
	abstract readonly contextMenuActions: IAction[];
}

export class UserDataProfileElement extends AbstractUserDataProfileElement implements IProfileElement {

	get profile(): IUserDataProfile { return this._profile; }

	readonly primaryAction = undefined;

	private readonly saveScheduler = this._register(new RunOnceScheduler(() => this.doSave(), 500));

	constructor(
		private _profile: IUserDataProfile,
		readonly titleActions: [IAction[], IAction[]],
		readonly contextMenuActions: IAction[],
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(
			_profile.name,
			_profile.icon,
			_profile.useDefaultFlags,
			userDataProfileService.currentProfile.id === _profile.id,
			userDataProfilesService,
			instantiationService,
		);
		this._register(this.userDataProfileService.onDidChangeCurrentProfile(() => this.active = this.userDataProfileService.currentProfile.id === this.profile.id));
		this._register(this.userDataProfilesService.onDidChangeProfiles(() => {
			const profile = this.userDataProfilesService.profiles.find(p => p.id === this.profile.id);
			if (profile) {
				this._profile = profile;
				this.name = profile.name;
				this.icon = profile.icon;
				this.flags = profile.useDefaultFlags;
			}
		}));
		this._register(this.onDidChange(e => {
			this.save();
		}));
	}

	private hasUnsavedChanges(): boolean {
		if (this.name !== this.profile.name) {
			return true;
		}
		if (this.icon !== this.profile.icon) {
			return true;
		}
		if (!equals(this.flags ?? {}, this.profile.useDefaultFlags ?? {})) {
			return true;
		}
		return false;
	}

	save(): void {
		this.saveScheduler.schedule();
	}

	private async doSave(): Promise<void> {
		if (!this.hasUnsavedChanges()) {
			return;
		}
		this.validate();
		if (this.message) {
			return;
		}
		const useDefaultFlags: UseDefaultProfileFlags | undefined = this.flags
			? this.flags.settings && this.flags.keybindings && this.flags.tasks && this.flags.globalState && this.flags.extensions ? undefined : this.flags
			: undefined;

		await this.userDataProfileManagementService.updateProfile(this.profile, {
			name: this.name,
			icon: this.icon,
			useDefaultFlags: this.profile.useDefaultFlags && !useDefaultFlags ? {} : useDefaultFlags
		});
	}

	override async getChildren(resourceType: ProfileResourceType): Promise<IProfileResourceChildTreeItem[]> {
		return this.getChildrenFromProfile(this.profile, resourceType);
	}

	protected override getInitialName(): string {
		return this.profile.name;
	}

}

const USER_DATA_PROFILE_TEMPLATE_PREVIEW_SCHEME = 'userdataprofiletemplatepreview';

export class NewProfileElement extends AbstractUserDataProfileElement implements IProfileElement {

	constructor(
		name: string,
		copyFrom: URI | IUserDataProfile | undefined,
		readonly primaryAction: Action,
		readonly titleActions: [IAction[], IAction[]],
		readonly contextMenuActions: Action[],
		@IFileService private readonly fileService: IFileService,
		@IUserDataProfileImportExportService private readonly userDataProfileImportExportService: IUserDataProfileImportExportService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(
			name,
			undefined,
			undefined,
			false,
			userDataProfilesService,
			instantiationService,
		);
		this._copyFrom = copyFrom;
		this._copyFlags = this.getCopyFlagsFrom(copyFrom);
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

	private getCopyFlagsFrom(copyFrom: URI | IUserDataProfile | undefined): ProfileResourceTypeFlags | undefined {
		return copyFrom ? {
			settings: true,
			keybindings: true,
			snippets: true,
			tasks: true,
			extensions: true
		} : undefined;
	}

	getCopyFlag(key: ProfileResourceType): boolean {
		return this.copyFlags?.[key] ?? false;
	}

	setCopyFlag(key: ProfileResourceType, value: boolean): void {
		const flags = this.copyFlags ? { ...this.copyFlags } : {};
		flags[key] = value;
		this.copyFlags = flags;
	}

	override async getChildren(resourceType: ProfileResourceType): Promise<IProfileResourceChildTreeItem[]> {
		if (!this.getCopyFlag(resourceType)) {
			return [];
		}
		if (this.copyFrom instanceof URI) {
			const template = await this.userDataProfileImportExportService.resolveProfileTemplate(this.copyFrom);
			if (!template) {
				return [];
			}
			return this.getChildrenFromProfileTemplate(template, resourceType);
		}
		if (this.copyFrom) {
			return this.getChildrenFromProfile(this.copyFrom, resourceType);
		}
		if (this.getFlag(resourceType)) {
			return this.getChildrenFromProfile(this.userDataProfilesService.defaultProfile, resourceType);
		}
		return [];
	}

	private async getChildrenFromProfileTemplate(profileTemplate: IUserDataProfileTemplate, resourceType: ProfileResourceType): Promise<IProfileResourceChildTreeItem[]> {
		const profile = toUserDataProfile(generateUuid(), this.name, URI.file('/root').with({ scheme: USER_DATA_PROFILE_TEMPLATE_PREVIEW_SCHEME }), URI.file('/cache').with({ scheme: USER_DATA_PROFILE_TEMPLATE_PREVIEW_SCHEME }));
		switch (resourceType) {
			case ProfileResourceType.Settings:
				if (profileTemplate.settings) {
					await this.instantiationService.createInstance(SettingsResource).apply(profileTemplate.settings, profile);
				}
				return this.getChildrenFromProfile(profile, resourceType);
			case ProfileResourceType.Keybindings:
				if (profileTemplate.keybindings) {
					await this.instantiationService.createInstance(KeybindingsResource).apply(profileTemplate.keybindings, profile);
				}
				return this.getChildrenFromProfile(profile, resourceType);
			case ProfileResourceType.Snippets:
				if (profileTemplate.snippets) {
					await this.instantiationService.createInstance(SnippetsResource).apply(profileTemplate.snippets, profile);
				}
				return this.getChildrenFromProfile(profile, resourceType);
			case ProfileResourceType.Tasks:
				if (profileTemplate.tasks) {
					await this.instantiationService.createInstance(TasksResource).apply(profileTemplate.tasks, profile);
				}
				return this.getChildrenFromProfile(profile, resourceType);
			case ProfileResourceType.Extensions:
				if (profileTemplate.extensions) {
					return this.instantiationService.createInstance(ExtensionsResourceImportTreeItem, profileTemplate.extensions).getChildren();
				}
		}
		return [];
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

	constructor(
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
		@IUserDataProfileImportExportService private readonly userDataProfileImportExportService: IUserDataProfileImportExportService,
		@IDialogService private readonly dialogService: IDialogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		for (const profile of userDataProfilesService.profiles) {
			this._profiles.push(this.createProfileElement(profile));
		}
		this._register(toDisposable(() => this._profiles.splice(0, this._profiles.length).map(([, disposables]) => disposables.dispose())));
		this._register(userDataProfilesService.onDidChangeProfiles(e => this.onDidChangeProfiles(e)));
	}

	private onDidChangeProfiles(e: DidChangeProfilesEvent): void {
		for (const profile of e.added) {
			if (profile.name !== this.newProfileElement?.name) {
				this._profiles.push(this.createProfileElement(profile));
			}
		}
		for (const profile of e.removed) {
			const index = this._profiles.findIndex(([p]) => p instanceof UserDataProfileElement && p.profile.id === profile.id);
			if (index !== -1) {
				this._profiles.splice(index, 1).map(([, disposables]) => disposables.dispose());
			}
		}
		this._onDidChange.fire(undefined);
	}

	private createProfileElement(profile: IUserDataProfile): [UserDataProfileElement, DisposableStore] {
		const disposables = new DisposableStore();

		const activateAction = disposables.add(new Action('userDataProfile.activate', localize('active', "Activate"), ThemeIcon.asClassName(Codicon.check), true, () => this.userDataProfileManagementService.switchProfile(profile)));
		activateAction.checked = this.userDataProfileService.currentProfile.id === profile.id;
		disposables.add(this.userDataProfileService.onDidChangeCurrentProfile(() => activateAction.checked = this.userDataProfileService.currentProfile.id === profile.id));
		const copyFromProfileAction = disposables.add(new Action('userDataProfile.copyFromProfile', localize('copyFromProfile', "Save As..."), ThemeIcon.asClassName(Codicon.copy), true, () => this.createNewProfile(profile)));
		const exportAction = disposables.add(new Action('userDataProfile.export', localize('export', "Export..."), ThemeIcon.asClassName(Codicon.export), true, () => this.exportProfile(profile)));
		const deleteAction = disposables.add(new Action('userDataProfile.delete', localize('delete', "Delete"), ThemeIcon.asClassName(Codicon.trash), true, () => this.removeProfile(profile)));

		const titlePrimaryActions: IAction[] = [];
		titlePrimaryActions.push(activateAction);
		titlePrimaryActions.push(exportAction);
		if (!profile.isDefault) {
			titlePrimaryActions.push(deleteAction);
		}

		const titleSecondaryActions: IAction[] = [];
		titleSecondaryActions.push(copyFromProfileAction);

		const secondaryActions: IAction[] = [];
		secondaryActions.push(activateAction);
		secondaryActions.push(new Separator());
		secondaryActions.push(copyFromProfileAction);
		secondaryActions.push(exportAction);
		if (!profile.isDefault) {
			secondaryActions.push(new Separator());
			secondaryActions.push(deleteAction);
		}
		const profileElement = disposables.add(this.instantiationService.createInstance(UserDataProfileElement,
			profile,
			[titlePrimaryActions, titleSecondaryActions],
			secondaryActions,
		));
		return [profileElement, disposables];
	}

	createNewProfile(copyFrom?: URI | IUserDataProfile): IProfileElement {
		if (!this.newProfileElement) {
			const disposables = new DisposableStore();
			const discardAction = disposables.add(new Action('userDataProfile.discard', localize('discard', "Discard"), ThemeIcon.asClassName(Codicon.close), true, () => {
				this.removeNewProfile();
				this._onDidChange.fire(undefined);
			}));
			this.newProfileElement = disposables.add(this.instantiationService.createInstance(NewProfileElement,
				localize('untitled', "Untitled"),
				copyFrom,
				disposables.add(new Action('userDataProfile.create', localize('create', "Create & Apply"), undefined, true, () => this.saveNewProfile())),
				[[discardAction], []],
				[discardAction],
			));
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

	async saveNewProfile(): Promise<void> {
		if (!this.newProfileElement) {
			return;
		}
		this.newProfileElement.validate();
		if (this.newProfileElement.message) {
			return;
		}
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
			this.telemetryService.publicLog2<CreateProfileInfoEvent, CreateProfileInfoClassification>('userDataProfile.createFromTemplate', createProfileTelemetryData);
			await this.userDataProfileImportExportService.importProfile(copyFrom, { mode: 'apply', name: name, useDefaultFlags, icon: icon ? icon : undefined, resourceTypeFlags: this.newProfileElement.copyFlags });
		} else if (isUserDataProfile(copyFrom)) {
			this.telemetryService.publicLog2<CreateProfileInfoEvent, CreateProfileInfoClassification>('userDataProfile.createFromProfile', createProfileTelemetryData);
			await this.userDataProfileImportExportService.createFromProfile(copyFrom, name, { useDefaultFlags, icon: icon ? icon : undefined, resourceTypeFlags: this.newProfileElement.copyFlags });
		} else {
			this.telemetryService.publicLog2<CreateProfileInfoEvent, CreateProfileInfoClassification>('userDataProfile.createEmptyProfile', createProfileTelemetryData);
			await this.userDataProfileManagementService.createAndEnterProfile(name, { useDefaultFlags, icon: icon ? icon : undefined });
		}

		this.removeNewProfile();
		const profile = this.userDataProfilesService.profiles.find(p => p.name === name);
		if (profile) {
			this.onDidChangeProfiles({ added: [profile], removed: [], updated: [], all: this.userDataProfilesService.profiles });
		}
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

	private async exportProfile(profile: IUserDataProfile): Promise<void> {
		return this.userDataProfileImportExportService.exportProfile2(profile);
	}
}
