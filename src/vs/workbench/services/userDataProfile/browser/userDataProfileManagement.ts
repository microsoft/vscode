/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ILocalExtension, Metadata } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IExtensionsProfileScannerService } from 'vs/platform/extensionManagement/common/extensionsProfileScannerService';
import { ExtensionType } from 'vs/platform/extensions/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { DidChangeProfilesEvent, EXTENSIONS_RESOURCE_NAME, IUserDataProfile, IUserDataProfilesService, UseDefaultProfileFlags, WorkspaceIdentifier } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IExtensionManagementServerService, IWorkbenchExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IUserDataProfileManagementService, IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

export class UserDataProfileManagementService extends Disposable implements IUserDataProfileManagementService {
	readonly _serviceBrand: undefined;

	constructor(
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IFileService private readonly fileService: IFileService,
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
		@IWorkbenchExtensionManagementService private readonly extensionManagementService: IWorkbenchExtensionManagementService,
		@IExtensionsProfileScannerService private readonly extensionsProfileScannerService: IExtensionsProfileScannerService,
		@IHostService private readonly hostService: IHostService,
		@IDialogService private readonly dialogService: IDialogService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		this._register(userDataProfilesService.onDidChangeProfiles(e => this.onDidChangeProfiles(e)));
	}

	private async checkAndCreateExtensionsProfileResource(): Promise<URI> {
		if (this.userDataProfileService.currentProfile.extensionsResource) {
			return this.userDataProfileService.currentProfile.extensionsResource;
		}
		if (!this.userDataProfilesService.defaultProfile.extensionsResource) {
			// Extensions profile is not yet created for default profile, create it now
			return this.createDefaultExtensionsProfile(joinPath(this.userDataProfilesService.defaultProfile.location, EXTENSIONS_RESOURCE_NAME));
		}
		throw new Error('Invalid Profile');
	}

	private onDidChangeProfiles(e: DidChangeProfilesEvent): void {
		if (e.removed.some(profile => profile.id === this.userDataProfileService.currentProfile.id)) {
			this.enterProfile(this.userDataProfilesService.defaultProfile, false, localize('reload message when removed', "The current profile has been removed. Please reload to switch back to default profile"));
		}
	}

	async createAndEnterProfile(name: string, useDefaultFlags?: UseDefaultProfileFlags, fromExisting?: boolean): Promise<IUserDataProfile> {
		const workspaceIdentifier = this.getWorkspaceIdentifier();
		const promises: Promise<any>[] = [];
		const newProfile = this.userDataProfilesService.newProfile(name, useDefaultFlags);
		await this.fileService.createFolder(newProfile.location);
		const extensionsProfileResourcePromise = this.checkAndCreateExtensionsProfileResource();
		promises.push(extensionsProfileResourcePromise);
		if (fromExisting) {
			// Storage copy is handled by storage service while entering profile
			promises.push(this.fileService.copy(this.userDataProfileService.currentProfile.settingsResource, newProfile.settingsResource));
			promises.push((async () => this.fileService.copy(await extensionsProfileResourcePromise, newProfile.extensionsResource))());
			promises.push(this.fileService.copy(this.userDataProfileService.currentProfile.keybindingsResource, newProfile.keybindingsResource));
			promises.push(this.fileService.copy(this.userDataProfileService.currentProfile.tasksResource, newProfile.tasksResource));
			promises.push(this.fileService.copy(this.userDataProfileService.currentProfile.snippetsHome, newProfile.snippetsHome));
		}
		await Promise.allSettled(promises);
		const createdProfile = await this.userDataProfilesService.createProfile(newProfile, workspaceIdentifier);
		await this.enterProfile(createdProfile, !!fromExisting);
		return createdProfile;
	}

	async removeProfile(profile: IUserDataProfile): Promise<void> {
		if (!this.userDataProfilesService.profiles.some(p => p.id === profile.id)) {
			throw new Error(`Profile ${profile.name} does not exist`);
		}
		if (profile.isDefault) {
			throw new Error(localize('cannotDeleteDefaultProfile', "Cannot delete the default profile"));
		}
		if (profile.id === this.userDataProfileService.currentProfile.id) {
			throw new Error(localize('cannotDeleteCurrentProfile', "Cannot delete the current profile"));
		}
		const defaultExtensionsResourceToDelete = this.userDataProfilesService.profiles.length === 2 ? this.userDataProfilesService.defaultProfile.extensionsResource : undefined;
		await this.userDataProfilesService.removeProfile(profile);
		if (defaultExtensionsResourceToDelete) {
			try { await this.fileService.del(defaultExtensionsResourceToDelete); } catch (error) { /* ignore */ }
		}
	}

	async switchProfile(profile: IUserDataProfile): Promise<void> {
		const workspaceIdentifier = this.getWorkspaceIdentifier();
		if (!this.userDataProfilesService.profiles.some(p => p.id === profile.id)) {
			throw new Error(`Profile ${profile.name} does not exist`);
		}
		if (this.userDataProfileService.currentProfile.id === profile.id) {
			return;
		}
		await this.userDataProfilesService.setProfileForWorkspace(profile, workspaceIdentifier);
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
		if (this.environmentService.remoteAuthority) {
			const result = await this.dialogService.confirm({
				type: 'info',
				message: reloadMessage ?? localize('reload message', "Switching a profile requires reloading VS Code."),
				primaryButton: localize('reload button', "&&Reload"),
			});
			if (result.confirmed) {
				await this.hostService.reload();
			}
			return;
		}

		this.extensionService.stopExtensionHosts();
		await this.userDataProfileService.updateCurrentProfile(profile, preserveData);
		await this.extensionService.startExtensionHosts();
	}

	private async createDefaultExtensionsProfile(extensionsProfileResource: URI): Promise<URI> {
		try { await this.fileService.del(extensionsProfileResource); } catch (error) { /* ignore */ }
		const extensionManagementService = this.extensionManagementServerService.localExtensionManagementServer?.extensionManagementService ?? this.extensionManagementService;
		const userExtensions = await extensionManagementService.getInstalled(ExtensionType.User);
		const extensions: [ILocalExtension, Metadata | undefined][] = await Promise.all(userExtensions.map(async e => ([e, await this.extensionManagementService.getMetadata(e)])));
		await this.extensionsProfileScannerService.addExtensionsToProfile(extensions, extensionsProfileResource);
		return extensionsProfileResource;
	}
}

registerSingleton(IUserDataProfileManagementService, UserDataProfileManagementService);
