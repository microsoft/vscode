/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { DidChangeProfilesEvent, IUserDataProfile, IUserDataProfilesService, UseDefaultProfileFlags, WorkspaceIdentifier } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { DidChangeUserDataProfileEvent, IUserDataProfileManagementService, IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

export class UserDataProfileManagementService extends Disposable implements IUserDataProfileManagementService {
	readonly _serviceBrand: undefined;

	constructor(
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IHostService private readonly hostService: IHostService,
		@IDialogService private readonly dialogService: IDialogService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		this._register(userDataProfilesService.onDidChangeProfiles(e => this.onDidChangeProfiles(e)));
		this._register(userDataProfilesService.onDidResetWorkspaces(() => this.onDidResetWorkspaces()));
		this._register(userDataProfileService.onDidChangeCurrentProfile(e => this.onDidChangeCurrentProfile(e)));
	}

	private onDidChangeProfiles(e: DidChangeProfilesEvent): void {
		if (e.removed.some(profile => profile.id === this.userDataProfileService.currentProfile.id)) {
			this.enterProfile(this.userDataProfilesService.defaultProfile, false, localize('reload message when removed', "The current settings profile has been removed. Please reload to switch back to default settings profile"));
			return;
		}
	}

	private onDidResetWorkspaces(): void {
		if (!this.userDataProfileService.currentProfile.isDefault) {
			this.enterProfile(this.userDataProfilesService.defaultProfile, false, localize('reload message when removed', "The current settings profile has been removed. Please reload to switch back to default settings profile"));
			return;
		}
	}

	private async onDidChangeCurrentProfile(e: DidChangeUserDataProfileEvent): Promise<void> {
		if (e.previous.isTransient) {
			await this.userDataProfilesService.cleanUpTransientProfiles();
		}
	}

	async createAndEnterProfile(name: string, useDefaultFlags?: UseDefaultProfileFlags, fromExisting?: boolean): Promise<IUserDataProfile> {
		const profile = await this.userDataProfilesService.createProfile(name, useDefaultFlags, this.getWorkspaceIdentifier());
		await this.enterProfile(profile, !!fromExisting);
		return profile;
	}

	async createAndEnterTransientProfile(): Promise<IUserDataProfile> {
		const profile = await this.userDataProfilesService.createTransientProfile(this.getWorkspaceIdentifier());
		await this.enterProfile(profile, false);
		return profile;
	}

	async renameProfile(profile: IUserDataProfile, name: string): Promise<void> {
		if (!this.userDataProfilesService.profiles.some(p => p.id === profile.id)) {
			throw new Error(`Settings profile ${profile.name} does not exist`);
		}
		if (profile.isDefault) {
			throw new Error(localize('cannotRenameDefaultProfile', "Cannot rename the default settings profile"));
		}
		await this.userDataProfilesService.updateProfile(profile, name);
	}

	async removeProfile(profile: IUserDataProfile): Promise<void> {
		if (!this.userDataProfilesService.profiles.some(p => p.id === profile.id)) {
			throw new Error(`Settings profile ${profile.name} does not exist`);
		}
		if (profile.isDefault) {
			throw new Error(localize('cannotDeleteDefaultProfile', "Cannot delete the default settings profile"));
		}
		await this.userDataProfilesService.removeProfile(profile);
	}

	async switchProfile(profile: IUserDataProfile): Promise<void> {
		const workspaceIdentifier = this.getWorkspaceIdentifier();
		if (!this.userDataProfilesService.profiles.some(p => p.id === profile.id)) {
			throw new Error(`Profile ${profile.name} does not exist`);
		}
		if (this.userDataProfileService.currentProfile.id === profile.id) {
			return;
		}
		await this.userDataProfilesService.setProfileForWorkspace(workspaceIdentifier, profile);
		await this.enterProfile(profile, false);
	}

	private getWorkspaceIdentifier(): WorkspaceIdentifier {
		const workspace = this.workspaceContextService.getWorkspace();
		switch (this.workspaceContextService.getWorkbenchState()) {
			case WorkbenchState.FOLDER:
				return { uri: workspace.folders[0].uri, id: workspace.id };
			case WorkbenchState.WORKSPACE:
				return { configPath: workspace.configuration!, id: workspace.id };
		}
		return 'empty-window';
	}

	private async enterProfile(profile: IUserDataProfile, preserveData: boolean, reloadMessage?: string): Promise<void> {
		const isRemoteWindow = !!this.environmentService.remoteAuthority;

		if (!isRemoteWindow) {
			this.extensionService.stopExtensionHosts();
		}

		// In a remote window update current profile before reloading so that data is preserved from current profile if asked to preserve
		await this.userDataProfileService.updateCurrentProfile(profile, preserveData);

		if (isRemoteWindow) {
			const result = await this.dialogService.confirm({
				type: 'info',
				message: reloadMessage ?? localize('reload message', "Switching a settings profile requires reloading VS Code."),
				primaryButton: localize('reload button', "&&Reload"),
			});
			if (result.confirmed) {
				await this.hostService.reload();
			}
		} else {
			await this.extensionService.startExtensionHosts();
		}
	}
}

registerSingleton(IUserDataProfileManagementService, UserDataProfileManagementService, false);
