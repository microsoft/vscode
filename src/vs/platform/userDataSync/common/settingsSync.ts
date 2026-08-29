/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from '../../../base/common/arrays.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../configuration/common/configuration.js';
import { ConfigurationModelParser } from '../../configuration/common/configurationModels.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IExtensionManagementService } from '../../extensionManagement/common/extensionManagement.js';
import { ExtensionType } from '../../extensions/common/extensions.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../files/common/files.js';
import { IStorageService } from '../../storage/common/storage.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IUserDataProfile, IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
import { AbstractInitializer, AbstractJsonFileSynchroniser, IAcceptResult, IFileResourcePreview, IMergeResult } from './abstractSynchronizer.js';
import { getIgnoredSettings, isEmpty, merge, updateIgnoredSettings } from './settingsMerge.js';
import { Change, IRemoteUserData, IUserDataSyncLocalStoreService, IUserDataSyncConfiguration, IUserDataSynchroniser, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, IUserDataSyncUtilService, SyncResource, UserDataSyncError, UserDataSyncErrorCode, USER_DATA_SYNC_CONFIGURATION_SCOPE, USER_DATA_SYNC_SCHEME, getIgnoredSettingsForExtension, IUserData } from './userDataSync.js';

interface ISettingsResourcePreview extends IFileResourcePreview {
	previewResult: IMergeResult;
}

export interface ISettingsSyncContent {
	settings: string;
}

function isSettingsSyncContent(thing: any): thing is ISettingsSyncContent {
	return thing
		&& (thing.settings && typeof thing.settings === 'string')
		&& Object.keys(thing).length === 1;
}

export function parseSettingsSyncContent(syncContent: string): ISettingsSyncContent {
	const parsed = <ISettingsSyncContent>JSON.parse(syncContent);
	return isSettingsSyncContent(parsed) ? parsed : /* migrate */ { settings: syncContent };
}

export class SettingsSynchroniser extends AbstractJsonFileSynchroniser implements IUserDataSynchroniser {

	/* Version 2: Change settings from `sync.${setting}` to `settingsSync.{setting}` */
	protected readonly version: number = 2;
	readonly previewResource: URI = this.extUri.joinPath(this.syncPreviewFolder, 'settings.json');
	readonly baseResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'base' });
	readonly localResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'local' });
	readonly remoteResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'remote' });
	readonly acceptedResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'accepted' });

	constructor(
		private readonly profile: IUserDataProfile,
		collection: string | undefined,
		@IFileService fileService: IFileService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IStorageService storageService: IStorageService,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncLocalStoreService userDataSyncLocalStoreService: IUserDataSyncLocalStoreService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IUserDataSyncUtilService userDataSyncUtilService: IUserDataSyncUtilService,
		@IConfigurationService configurationService: IConfigurationService,
		@IUserDataSyncEnablementService userDataSyncEnablementService: IUserDataSyncEnablementService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
	) {
		super(profile.settingsResource, { syncResource: SyncResource.Settings, profile }, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, userDataSyncUtilService, configurationService, uriIdentityService);
	}

	async getRemoteUserDataSyncConfiguration(refOrLatestData: string | IUserData | null): Promise<IUserDataSyncConfiguration> {
		const lastSyncUserData = await this.getLastSyncUserData();
		const remoteUserData = await this.getLatestRemoteUserData(refOrLatestData, lastSyncUserData);
		const remoteSettingsSyncContent = this.getSettingsSyncContent(remoteUserData);
		const parser = new ConfigurationModelParser(USER_DATA_SYNC_CONFIGURATION_SCOPE, this.logService);
		if (remoteSettingsSyncContent?.settings) {
			parser.parse(remoteSettingsSyncContent.settings);
		}
		return parser.configurationModel.getValue(USER_DATA_SYNC_CONFIGURATION_SCOPE) || {};
	}

	protected async generateSyncPreview(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, isRemoteDataFromCurrentMachine: boolean): Promise<ISettingsResourcePreview[]> {
		const fileContent = await this.getLocalFileContent();
		const formattingOptions = await this.getFormattingOptions();
		const remoteSettingsSyncContent = this.getSettingsSyncContent(remoteUserData);

		// Use remote data as last sync data if last sync data does not exist and remote data is from same machine
		lastSyncUserData = lastSyncUserData === null && isRemoteDataFromCurrentMachine ? remoteUserData : lastSyncUserData;
		const lastSettingsSyncContent: ISettingsSyncContent | null = lastSyncUserData ? this.getSettingsSyncContent(lastSyncUserData) : null;
		const ignoredSettings = await this.getIgnoredSettings();

		let mergedContent: string | null = null;
		let hasLocalChanged: boolean = false;
		let hasRemoteChanged: boolean = false;
		let hasConflicts: boolean = false;

		if (remoteSettingsSyncContent) {
			let localContent: string = fileContent ? fileContent.value.toString().trim() : '{}';
			localContent = localContent || '{}';
			this.validateContent(localContent);
			this.logService.trace(`${this.syncResourceLogLabel}: Merging remote settings with local settings...`);
			const result = merge(localContent, remoteSettingsSyncContent.settings, lastSettingsSyncContent ? lastSettingsSyncContent.settings : null, ignoredSettings, [], formattingOptions);
			mergedContent = result.localContent || result.remoteContent;
			hasLocalChanged = result.localContent !== null;
			hasRemoteChanged = result.remoteContent !== null;
			hasConflicts = result.hasConflicts;
		}

		// First time syncing to remote
		else if (fileContent) {
			this.logService.trace(`${this.syncResourceLogLabel}: Remote settings does not exist. Synchronizing settings for the first time.`);
			mergedContent = fileContent.value.toString().trim() || '{}';
			this.validateContent(mergedContent);
			hasRemoteChanged = true;
		}

		const localContent = fileContent ? fileContent.value.toString() : null;
		const baseContent = lastSettingsSyncContent?.settings ?? null;

		const previewResult = {
			content: hasConflicts ? baseContent : mergedContent,
			localChange: hasLocalChanged ? Change.Modified : Change.None,
			remoteChange: hasRemoteChanged ? Change.Modified : Change.None,
			hasConflicts
		};

		return [{
			fileContent,

			baseResource: this.baseResource,
			baseContent,

			localResource: this.localResource,
			localContent,
			localChange: previewResult.localChange,

			remoteResource: this.remoteResource,
			remoteContent: remoteSettingsSyncContent ? remoteSettingsSyncContent.settings : null,
			remoteChange: previewResult.remoteChange,

			previewResource: this.previewResource,
			previewResult,
			acceptedResource: this.acceptedResource,
		}];
	}

	protected async hasRemoteChanged(lastSyncUserData: IRemoteUserData): Promise<boolean> {
		const lastSettingsSyncContent: ISettingsSyncContent | null = this.getSettingsSyncContent(lastSyncUserData);
		if (lastSettingsSyncContent === null) {
			return true;
		}

		const fileContent = await this.getLocalFileContent();
		const localContent: string = fileContent ? fileContent.value.toString().trim() : '';
		const ignoredSettings = await this.getIgnoredSettings();
		const formattingOptions = await this.getFormattingOptions();
		const result = merge(localContent || '{}', lastSettingsSyncContent.settings, lastSettingsSyncContent.settings, ignoredSettings, [], formattingOptions);
		return result.remoteContent !== null;
	}

	protected async getMergeResult(resourcePreview: ISettingsResourcePreview, token: CancellationToken): Promise<IMergeResult> {
		const formatUtils = await this.getFormattingOptions();
		const ignoredSettings = await this.getIgnoredSettings();
		return {
			...resourcePreview.previewResult,

			// remove ignored settings from the preview content
			content: resourcePreview.previewResult.content ? updateIgnoredSettings(resourcePreview.previewResult.content, '{}', ignoredSettings, formatUtils) : null
		};
	}

	protected async getAcceptResult(resourcePreview: ISettingsResourcePreview, resource: URI, content: string | null | undefined, token: CancellationToken): Promise<IAcceptResult> {

		const formattingOptions = await this.getFormattingOptions();
		const ignoredSettings = await this.getIgnoredSettings();

		/* Accept local resource */
		if (this.extUri.isEqual(resource, this.localResource)) {
			return {
				/* Remove ignored settings */
				content: resourcePreview.fileContent ? updateIgnoredSettings(resourcePreview.fileContent.value.toString(), '{}', ignoredSettings, formattingOptions) : null,
				localChange: Change.None,
				remoteChange: Change.Modified,
			};
		}

		/* Accept remote resource */
		if (this.extUri.isEqual(resource, this.remoteResource)) {
			return {
				/* Update ignored settings from local file content */
				content: resourcePreview.remoteContent !== null ? updateIgnoredSettings(resourcePreview.remoteContent, resourcePreview.fileContent ? resourcePreview.fileContent.value.toString() : '{}', ignoredSettings, formattingOptions) : null,
				localChange: Change.Modified,
				remoteChange: Change.None,
			};
		}

		/* Accept preview resource */
		if (this.extUri.isEqual(resource, this.previewResource)) {
			if (content === undefined) {
				return {
					content: resourcePreview.previewResult.content,
					localChange: resourcePreview.previewResult.localChange,
					remoteChange: resourcePreview.previewResult.remoteChange,
				};
			} else {
				return {
					/* Add ignored settings from local file content */
					content: content !== null ? updateIgnoredSettings(content, resourcePreview.fileContent ? resourcePreview.fileContent.value.toString() : '{}', ignoredSettings, formattingOptions) : null,
					localChange: Change.Modified,
					remoteChange: Change.Modified,
				};
			}
		}

		throw new Error(`Invalid Resource: ${resource.toString()}`);
	}

	protected async applyResult(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, resourcePreviews: [ISettingsResourcePreview, IAcceptResult][], force: boolean): Promise<void> {
		const { fileContent } = resourcePreviews[0][0];
		let { content, localChange, remoteChange } = resourcePreviews[0][1];

		if (localChange === Change.None && remoteChange === Change.None) {
			this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing settings.`);
		}

		content = content ? content.trim() : '{}';
		content = content || '{}';
		this.validateContent(content);

		if (localChange !== Change.None) {
			this.logService.trace(`${this.syncResourceLogLabel}: Updating local settings...`);
			if (fileContent) {
				await this.backupLocal(JSON.stringify(this.toSettingsSyncContent(fileContent.value.toString())));
			}
			await this.updateLocalFileContent(content, fileContent, force);
			await this.configurationService.reloadConfiguration(ConfigurationTarget.USER_LOCAL);
			this.logService.info(`${this.syncResourceLogLabel}: Updated local settings`);
		}

		if (remoteChange !== Change.None) {
			const formatUtils = await this.getFormattingOptions();
			// Update ignored settings from remote
			const remoteSettingsSyncContent = this.getSettingsSyncContent(remoteUserData);
			const ignoredSettings = await this.getIgnoredSettings(content);
			content = updateIgnoredSettings(content, remoteSettingsSyncContent ? remoteSettingsSyncContent.settings : '{}', ignoredSettings, formatUtils);
			this.logService.trace(`${this.syncResourceLogLabel}: Updating remote settings...`);
			remoteUserData = await this.updateRemoteUserData(JSON.stringify(this.toSettingsSyncContent(content)), force ? null : remoteUserData.ref);
			this.logService.info(`${this.syncResourceLogLabel}: Updated remote settings`);
		}

		// Delete the preview
		try {
			await this.fileService.del(this.previewResource);
		} catch (e) { /* ignore */ }

		if (lastSyncUserData?.ref !== remoteUserData.ref) {
			this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized settings...`);
			await this.updateLastSyncUserData(remoteUserData);
			this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized settings`);
		}

	}

	async hasLocalData(): Promise<boolean> {
		try {
			const localFileContent = await this.getLocalFileContent();
			if (localFileContent) {
				return !isEmpty(localFileContent.value.toString());
			}
		} catch (error) {
			if ((<FileOperationError>error).fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
				return true;
			}
		}
		return false;
	}

	async resolveContent(uri: URI): Promise<string | null> {
		if (this.extUri.isEqual(this.remoteResource, uri)
			|| this.extUri.isEqual(this.localResource, uri)
			|| this.extUri.isEqual(this.acceptedResource, uri)
			|| this.extUri.isEqual(this.baseResource, uri)
		) {
			return this.resolvePreviewContent(uri);
		}
		return null;
	}

	protected override async resolvePreviewContent(resource: URI): Promise<string | null> {
		let content = await super.resolvePreviewContent(resource);
		if (content) {
			const formatUtils = await this.getFormattingOptions();
			// remove ignored settings from the preview content
			const ignoredSettings = await this.getIgnoredSettings();
			content = updateIgnoredSettings(content, '{}', ignoredSettings, formatUtils);
		}
		return content;
	}

	private getSettingsSyncContent(remoteUserData: IRemoteUserData): ISettingsSyncContent | null {
		return remoteUserData.syncData ? this.parseSettingsSyncContent(remoteUserData.syncData.content) : null;
	}

	private parseSettingsSyncContent(syncContent: string): ISettingsSyncContent | null {
		try {
			return parseSettingsSyncContent(syncContent);
		} catch (e) {
			this.logService.error(e);
		}
		return null;
	}

	private toSettingsSyncContent(settings: string): ISettingsSyncContent {
		return { settings };
	}

	private coreIgnoredSettings: Promise<string[]> | undefined = undefined;
	private systemExtensionsIgnoredSettings: Promise<string[]> | undefined = undefined;
	private userExtensionsIgnoredSettings: Promise<string[]> | undefined = undefined;
	private async getIgnoredSettings(content?: string): Promise<string[]> {
		if (!this.coreIgnoredSettings) {
			this.coreIgnoredSettings = this.userDataSyncUtilService.resolveDefaultCoreIgnoredSettings();
		}
		if (!this.systemExtensionsIgnoredSettings) {
			this.systemExtensionsIgnoredSettings = this.getIgnoredSettingForSystemExtensions();
		}
		if (!this.userExtensionsIgnoredSettings) {
			this.userExtensionsIgnoredSettings = this.getIgnoredSettingForUserExtensions();
			const disposable = this._register(Event.any<any>(
				Event.filter(this.extensionManagementService.onDidInstallExtensions, (e => e.some(({ local }) => !!local))),
				Event.filter(this.extensionManagementService.onDidUninstallExtension, (e => !e.error)))(() => {
					disposable.dispose();
					this.userExtensionsIgnoredSettings = undefined;
				}));
		}
		const defaultIgnoredSettings = (await Promise.all([this.coreIgnoredSettings, this.systemExtensionsIgnoredSettings, this.userExtensionsIgnoredSettings])).flat();
		return getIgnoredSettings(defaultIgnoredSettings, this.configurationService, content);
	}

	private async getIgnoredSettingForSystemExtensions(): Promise<string[]> {
		const systemExtensions = await this.extensionManagementService.getInstalled(ExtensionType.System);
		return distinct(systemExtensions.map(e => getIgnoredSettingsForExtension(e.manifest)).flat());
	}

	private async getIgnoredSettingForUserExtensions(): Promise<string[]> {
		const userExtensions = await this.extensionManagementService.getInstalled(ExtensionType.User, this.profile.extensionsResource);
		return distinct(userExtensions.map(e => getIgnoredSettingsForExtension(e.manifest)).flat());
	}

	private validateContent(content: string): void {
		if (this.hasErrors(content, false)) {
			throw new UserDataSyncError(localize('errorInvalidSettings', "Unable to sync settings as there are errors/warning in settings file."), UserDataSyncErrorCode.LocalInvalidContent, this.resource);
		}
	}

}

export class SettingsInitializer extends AbstractInitializer {

	constructor(
		@IFileService fileService: IFileService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IStorageService storageService: IStorageService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
	) {
		super(SyncResource.Settings, userDataProfilesService, environmentService, logService, fileService, storageService, uriIdentityService);
	}

	protected async doInitialize(remoteUserData: IRemoteUserData): Promise<void> {
		const settingsSyncContent = remoteUserData.syncData ? this.parseSettingsSyncContent(remoteUserData.syncData.content) : null;
		if (!settingsSyncContent) {
			this.logService.info('Skipping initializing settings because remote settings does not exist.');
			return;
		}

		const isEmpty = await this.isEmpty();
		if (!isEmpty) {
			this.logService.info('Skipping initializing settings because local settings exist.');
			return;
		}

		await this.fileService.writeFile(this.userDataProfilesService.defaultProfile.settingsResource, VSBuffer.fromString(settingsSyncContent.settings));

		await this.updateLastSyncUserData(remoteUserData);
	}

	private async isEmpty(): Promise<boolean> {
		try {
			const fileContent = await this.fileService.readFile(this.userDataProfilesService.defaultProfile.settingsResource);
			return isEmpty(fileContent.value.toString().trim());
		} catch (error) {
			return (<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_NOT_FOUND;
		}
	}

	private parseSettingsSyncContent(syncContent: string): ISettingsSyncContent | null {
		try {
			return parseSettingsSyncContent(syncContent);
		} catch (e) {
			this.logService.error(e);
		}
		return null;
	}

}
