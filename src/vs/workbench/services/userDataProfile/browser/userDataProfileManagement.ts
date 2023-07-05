/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from 'vs/base/common/errors';
import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { DidChangeProfilesEvent, IUserDataProfile, IUserDataProfileOptions, IUserDataProfilesService, IUserDataProfileUpdateOptions } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IWorkspaceContextService, toWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { DidChangeUserDataProfileEvent, IUserDataProfileManagementService, IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

export type ProfileManagementActionExecutedClassification = {
	owner: 'sandy081';
	comment: 'Logged when profile management action is excuted';
	id: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the action that was run.' };
};

export type ProfileManagementActionExecutedEvent = {
	id: string;
};

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
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
		this._register(userDataProfilesService.onDidChangeProfiles(e => this.onDidChangeProfiles(e)));
		this._register(userDataProfilesService.onDidResetWorkspaces(() => this.onDidResetWorkspaces()));
		this._register(userDataProfileService.onDidChangeCurrentProfile(e => this.onDidChangeCurrentProfile(e)));
	}

	private onDidChangeProfiles(e: DidChangeProfilesEvent): void {
		if (e.removed.some(profile => profile.id === this.userDataProfileService.currentProfile.id)) {
			this.enterProfile(this.userDataProfilesService.defaultProfile, localize('reload message when removed', "The current profile has been removed. Please reload to switch back to default profile"));
			return;
		}
	}

	private onDidResetWorkspaces(): void {
		if (!this.userDataProfileService.currentProfile.isDefault) {
			this.enterProfile(this.userDataProfilesService.defaultProfile, localize('reload message when removed', "The current profile has been removed. Please reload to switch back to default profile"));
			return;
		}
	}

	private async onDidChangeCurrentProfile(e: DidChangeUserDataProfileEvent): Promise<void> {
		if (e.previous.isTransient) {
			await this.userDataProfilesService.cleanUpTransientProfiles();
		}
	}

	async createAndEnterProfile(name: string, options?: IUserDataProfileOptions): Promise<IUserDataProfile> {
		const profile = await this.userDataProfilesService.createNamedProfile(name, options, toWorkspaceIdentifier(this.workspaceContextService.getWorkspace()));
		await this.enterProfile(profile);
		this.telemetryService.publicLog2<ProfileManagementActionExecutedEvent, ProfileManagementActionExecutedClassification>('profileManagementActionExecuted', { id: 'createAndEnterProfile' });
		return profile;
	}

	async createAndEnterTransientProfile(): Promise<IUserDataProfile> {
		const profile = await this.userDataProfilesService.createTransientProfile(toWorkspaceIdentifier(this.workspaceContextService.getWorkspace()));
		await this.enterProfile(profile);
		this.telemetryService.publicLog2<ProfileManagementActionExecutedEvent, ProfileManagementActionExecutedClassification>('profileManagementActionExecuted', { id: 'createAndEnterTransientProfile' });
		return profile;
	}

	async updateProfile(profile: IUserDataProfile, updateOptions: IUserDataProfileUpdateOptions): Promise<void> {
		if (!this.userDataProfilesService.profiles.some(p => p.id === profile.id)) {
			throw new Error(`Profile ${profile.name} does not exist`);
		}
		if (profile.isDefault) {
			throw new Error(localize('cannotRenameDefaultProfile', "Cannot rename the default profile"));
		}
		await this.userDataProfilesService.updateProfile(profile, updateOptions);
		this.telemetryService.publicLog2<ProfileManagementActionExecutedEvent, ProfileManagementActionExecutedClassification>('profileManagementActionExecuted', { id: 'updateProfile' });
	}

	async removeProfile(profile: IUserDataProfile): Promise<void> {
		if (!this.userDataProfilesService.profiles.some(p => p.id === profile.id)) {
			throw new Error(`Profile ${profile.name} does not exist`);
		}
		if (profile.isDefault) {
			throw new Error(localize('cannotDeleteDefaultProfile', "Cannot delete the default profile"));
		}
		await this.userDataProfilesService.removeProfile(profile);
		this.telemetryService.publicLog2<ProfileManagementActionExecutedEvent, ProfileManagementActionExecutedClassification>('profileManagementActionExecuted', { id: 'removeProfile' });
	}

	async switchProfile(profile: IUserDataProfile): Promise<void> {
		const workspaceIdentifier = toWorkspaceIdentifier(this.workspaceContextService.getWorkspace());
		if (!this.userDataProfilesService.profiles.some(p => p.id === profile.id)) {
			throw new Error(`Profile ${profile.name} does not exist`);
		}
		if (this.userDataProfileService.currentProfile.id === profile.id) {
			return;
		}
		await this.userDataProfilesService.setProfileForWorkspace(workspaceIdentifier, profile);
		await this.enterProfile(profile);
		this.telemetryService.publicLog2<ProfileManagementActionExecutedEvent, ProfileManagementActionExecutedClassification>('profileManagementActionExecuted', { id: 'switchProfile' });
	}

	private async enterProfile(profile: IUserDataProfile, reloadMessage?: string): Promise<void> {
		const isRemoteWindow = !!this.environmentService.remoteAuthority;

		if (!isRemoteWindow) {
			if (!(await this.extensionService.stopExtensionHosts(localize('switch profile', "Switching to a profile.")))) {
				// If extension host did not stop, do not switch profile
				if (this.userDataProfilesService.profiles.some(p => p.id === this.userDataProfileService.currentProfile.id)) {
					await this.userDataProfilesService.setProfileForWorkspace(toWorkspaceIdentifier(this.workspaceContextService.getWorkspace()), this.userDataProfileService.currentProfile);
				}
				throw new CancellationError();
			}
		}

		// In a remote window update current profile before reloading so that data is preserved from current profile if asked to preserve
		await this.userDataProfileService.updateCurrentProfile(profile);

		if (isRemoteWindow) {
			const { confirmed } = await this.dialogService.confirm({
				message: reloadMessage ?? localize('reload message', "Switching a profile requires reloading VS Code."),
				primaryButton: localize('reload button', "&&Reload"),
			});
			if (confirmed) {
				await this.hostService.reload();
			}
		} else {
			await this.extensionService.startExtensionHosts();
		}
	}
}

registerSingleton(IUserDataProfileManagementService, UserDataProfileManagementService, InstantiationType.Eager /* Eager because it updates the current window profile by listening to profiles changes */);
