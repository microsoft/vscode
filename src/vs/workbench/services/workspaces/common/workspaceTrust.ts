/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { LinkedList } from 'vs/base/common/linkedList';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IPath } from 'vs/platform/window/common/window';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IRemoteAuthorityResolverService, ResolverResult } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { getRemoteAuthority } from 'vs/platform/remote/common/remoteHosts';
import { isVirtualResource } from 'vs/platform/workspace/common/virtualWorkspace';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ISingleFolderWorkspaceIdentifier, isSavedWorkspace, isSingleFolderWorkspaceIdentifier, isTemporaryWorkspace, IWorkspace, IWorkspaceContextService, IWorkspaceFolder, toWorkspaceIdentifier, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { WorkspaceTrustRequestOptions, IWorkspaceTrustManagementService, IWorkspaceTrustInfo, IWorkspaceTrustUriInfo, IWorkspaceTrustRequestService, IWorkspaceTrustTransitionParticipant, WorkspaceTrustUriResponse, IWorkspaceTrustEnablementService } from 'vs/platform/workspace/common/workspaceTrust';
import { Memento, MementoObject } from 'vs/workbench/common/memento';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { isEqualAuthority } from 'vs/base/common/resources';
import { isWeb } from 'vs/base/common/platform';
import { IFileService } from 'vs/platform/files/common/files';
import { promiseWithResolvers } from 'vs/base/common/async';

export const WORKSPACE_TRUST_ENABLED = 'security.workspace.trust.enabled';
export const WORKSPACE_TRUST_STARTUP_PROMPT = 'security.workspace.trust.startupPrompt';
export const WORKSPACE_TRUST_BANNER = 'security.workspace.trust.banner';
export const WORKSPACE_TRUST_UNTRUSTED_FILES = 'security.workspace.trust.untrustedFiles';
export const WORKSPACE_TRUST_EMPTY_WINDOW = 'security.workspace.trust.emptyWindow';
export const WORKSPACE_TRUST_EXTENSION_SUPPORT = 'extensions.supportUntrustedWorkspaces';
export const WORKSPACE_TRUST_STORAGE_KEY = 'content.trust.model.key';

export class CanonicalWorkspace implements IWorkspace {
	constructor(
		private readonly originalWorkspace: IWorkspace,
		private readonly canonicalFolderUris: URI[],
		private readonly canonicalConfiguration: URI | null | undefined
	) { }


	get folders(): IWorkspaceFolder[] {
		return this.originalWorkspace.folders.map((folder, index) => {
			return {
				index: folder.index,
				name: folder.name,
				toResource: folder.toResource,
				uri: this.canonicalFolderUris[index]
			};
		});
	}

	get transient(): boolean | undefined {
		return this.originalWorkspace.transient;
	}

	get configuration(): URI | null | undefined {
		return this.canonicalConfiguration ?? this.originalWorkspace.configuration;
	}

	get id(): string {
		return this.originalWorkspace.id;
	}
}

export class WorkspaceTrustEnablementService extends Disposable implements IWorkspaceTrustEnablementService {

	_serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService
	) {
		super();
	}

	isWorkspaceTrustEnabled(): boolean {
		if (this.environmentService.disableWorkspaceTrust) {
			return false;
		}

		return !!this.configurationService.getValue(WORKSPACE_TRUST_ENABLED);
	}
}

export class WorkspaceTrustManagementService extends Disposable implements IWorkspaceTrustManagementService {

	_serviceBrand: undefined;

	private readonly storageKey = WORKSPACE_TRUST_STORAGE_KEY;

	private readonly _workspaceResolvedPromise: Promise<void>;
	private readonly _workspaceResolvedPromiseResolve: () => void;
	private readonly _workspaceTrustInitializedPromise: Promise<void>;
	private readonly _workspaceTrustInitializedPromiseResolve: () => void;

	private readonly _onDidChangeTrust = this._register(new Emitter<boolean>());
	readonly onDidChangeTrust = this._onDidChangeTrust.event;

	private readonly _onDidChangeTrustedFolders = this._register(new Emitter<void>());
	readonly onDidChangeTrustedFolders = this._onDidChangeTrustedFolders.event;

	private _canonicalStartupFiles: URI[] = [];
	private _canonicalWorkspace: IWorkspace;
	private _canonicalUrisResolved: boolean;

	private _isTrusted: boolean;
	private _trustStateInfo: IWorkspaceTrustInfo;
	private _remoteAuthority: ResolverResult | undefined;

	private readonly _storedTrustState: WorkspaceTrustMemento;
	private readonly _trustTransitionManager: WorkspaceTrustTransitionManager;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IRemoteAuthorityResolverService private readonly remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IStorageService private readonly storageService: IStorageService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IWorkspaceTrustEnablementService private readonly workspaceTrustEnablementService: IWorkspaceTrustEnablementService,
		@IFileService private readonly fileService: IFileService
	) {
		super();

		this._canonicalUrisResolved = false;
		this._canonicalWorkspace = this.workspaceService.getWorkspace();

		({ promise: this._workspaceResolvedPromise, resolve: this._workspaceResolvedPromiseResolve } = promiseWithResolvers());
		({ promise: this._workspaceTrustInitializedPromise, resolve: this._workspaceTrustInitializedPromiseResolve } = promiseWithResolvers());

		this._storedTrustState = new WorkspaceTrustMemento(isWeb && this.isEmptyWorkspace() ? undefined : this.storageService);
		this._trustTransitionManager = this._register(new WorkspaceTrustTransitionManager());

		this._trustStateInfo = this.loadTrustInfo();
		this._isTrusted = this.calculateWorkspaceTrust();

		this.initializeWorkspaceTrust();
		this.registerListeners();
	}

	//#region initialize

	private initializeWorkspaceTrust(): void {
		// Resolve canonical Uris
		this.resolveCanonicalUris()
			.then(async () => {
				this._canonicalUrisResolved = true;
				await this.updateWorkspaceTrust();
			})
			.finally(() => {
				this._workspaceResolvedPromiseResolve();

				if (!this.environmentService.remoteAuthority) {
					this._workspaceTrustInitializedPromiseResolve();
				}
			});

		// Remote - resolve remote authority
		if (this.environmentService.remoteAuthority) {
			this.remoteAuthorityResolverService.resolveAuthority(this.environmentService.remoteAuthority)
				.then(async result => {
					this._remoteAuthority = result;
					await this.fileService.activateProvider(Schemas.vscodeRemote);
					await this.updateWorkspaceTrust();
				})
				.finally(() => {
					this._workspaceTrustInitializedPromiseResolve();
				});
		}

		// Empty workspace - save initial state to memento
		if (this.isEmptyWorkspace()) {
			this._workspaceTrustInitializedPromise.then(() => {
				if (this._storedTrustState.isEmptyWorkspaceTrusted === undefined) {
					this._storedTrustState.isEmptyWorkspaceTrusted = this.isWorkspaceTrusted();
				}
			});
		}
	}

	//#endregion

	//#region private interface

	private registerListeners(): void {
		this._register(this.workspaceService.onDidChangeWorkspaceFolders(async () => await this.updateWorkspaceTrust()));
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, this.storageKey, this._register(new DisposableStore()))(async () => {
			/* This will only execute if storage was changed by a user action in a separate window */
			if (JSON.stringify(this._trustStateInfo) !== JSON.stringify(this.loadTrustInfo())) {
				this._trustStateInfo = this.loadTrustInfo();
				this._onDidChangeTrustedFolders.fire();

				await this.updateWorkspaceTrust();
			}
		}));
	}

	private async getCanonicalUri(uri: URI): Promise<URI> {
		let canonicalUri = uri;
		if (this.environmentService.remoteAuthority && uri.scheme === Schemas.vscodeRemote) {
			canonicalUri = await this.remoteAuthorityResolverService.getCanonicalURI(uri);
		} else if (uri.scheme === 'vscode-vfs') {
			const index = uri.authority.indexOf('+');
			if (index !== -1) {
				canonicalUri = uri.with({ authority: uri.authority.substr(0, index) });
			}
		}

		// ignore query and fragent section of uris always
		return canonicalUri.with({ query: null, fragment: null });
	}

	private async resolveCanonicalUris(): Promise<void> {
		// Open editors
		const filesToOpen: IPath[] = [];
		if (this.environmentService.filesToOpenOrCreate) {
			filesToOpen.push(...this.environmentService.filesToOpenOrCreate);
		}

		if (this.environmentService.filesToDiff) {
			filesToOpen.push(...this.environmentService.filesToDiff);
		}

		if (this.environmentService.filesToMerge) {
			filesToOpen.push(...this.environmentService.filesToMerge);
		}

		if (filesToOpen.length) {
			const filesToOpenOrCreateUris = filesToOpen.filter(f => !!f.fileUri).map(f => f.fileUri!);
			const canonicalFilesToOpen = await Promise.all(filesToOpenOrCreateUris.map(uri => this.getCanonicalUri(uri)));

			this._canonicalStartupFiles.push(...canonicalFilesToOpen.filter(uri => this._canonicalStartupFiles.every(u => !this.uriIdentityService.extUri.isEqual(uri, u))));
		}

		// Workspace
		const workspaceUris = this.workspaceService.getWorkspace().folders.map(f => f.uri);
		const canonicalWorkspaceFolders = await Promise.all(workspaceUris.map(uri => this.getCanonicalUri(uri)));

		let canonicalWorkspaceConfiguration = this.workspaceService.getWorkspace().configuration;
		if (canonicalWorkspaceConfiguration && isSavedWorkspace(canonicalWorkspaceConfiguration, this.environmentService)) {
			canonicalWorkspaceConfiguration = await this.getCanonicalUri(canonicalWorkspaceConfiguration);
		}

		this._canonicalWorkspace = new CanonicalWorkspace(this.workspaceService.getWorkspace(), canonicalWorkspaceFolders, canonicalWorkspaceConfiguration);
	}

	private loadTrustInfo(): IWorkspaceTrustInfo {
		const infoAsString = this.storageService.get(this.storageKey, StorageScope.APPLICATION);

		let result: IWorkspaceTrustInfo | undefined;
		try {
			if (infoAsString) {
				result = JSON.parse(infoAsString);
			}
		} catch { }

		if (!result) {
			result = {
				uriTrustInfo: []
			};
		}

		if (!result.uriTrustInfo) {
			result.uriTrustInfo = [];
		}

		result.uriTrustInfo = result.uriTrustInfo.map(info => { return { uri: URI.revive(info.uri), trusted: info.trusted }; });
		result.uriTrustInfo = result.uriTrustInfo.filter(info => info.trusted);

		return result;
	}

	private async saveTrustInfo(): Promise<void> {
		this.storageService.store(this.storageKey, JSON.stringify(this._trustStateInfo), StorageScope.APPLICATION, StorageTarget.MACHINE);
		this._onDidChangeTrustedFolders.fire();

		await this.updateWorkspaceTrust();
	}

	private getWorkspaceUris(): URI[] {
		const workspaceUris = this._canonicalWorkspace.folders.map(f => f.uri);
		const workspaceConfiguration = this._canonicalWorkspace.configuration;
		if (workspaceConfiguration && isSavedWorkspace(workspaceConfiguration, this.environmentService)) {
			workspaceUris.push(workspaceConfiguration);
		}

		return workspaceUris;
	}

	private calculateWorkspaceTrust(): boolean {
		// Feature is disabled
		if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
			return true;
		}

		// Canonical Uris not yet resolved
		if (!this._canonicalUrisResolved) {
			return false;
		}

		// Remote - resolver explicitly sets workspace trust to TRUE
		if (this.environmentService.remoteAuthority && this._remoteAuthority?.options?.isTrusted) {
			return this._remoteAuthority.options.isTrusted;
		}

		// Empty workspace - use memento, open ediors, or user setting
		if (this.isEmptyWorkspace()) {
			// Use memento if present
			if (this._storedTrustState.isEmptyWorkspaceTrusted !== undefined) {
				return this._storedTrustState.isEmptyWorkspaceTrusted;
			}

			// Startup files
			if (this._canonicalStartupFiles.length) {
				return this.getUrisTrust(this._canonicalStartupFiles);
			}

			// User setting
			return !!this.configurationService.getValue(WORKSPACE_TRUST_EMPTY_WINDOW);
		}

		return this.getUrisTrust(this.getWorkspaceUris());
	}

	private async updateWorkspaceTrust(trusted?: boolean): Promise<void> {
		if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
			return;
		}

		if (trusted === undefined) {
			await this.resolveCanonicalUris();
			trusted = this.calculateWorkspaceTrust();
		}

		if (this.isWorkspaceTrusted() === trusted) { return; }

		// Update workspace trust
		this.isTrusted = trusted;

		// Run workspace trust transition participants
		await this._trustTransitionManager.participate(trusted);

		// Fire workspace trust change event
		this._onDidChangeTrust.fire(trusted);
	}

	private getUrisTrust(uris: URI[]): boolean {
		let state = true;
		for (const uri of uris) {
			const { trusted } = this.doGetUriTrustInfo(uri);

			if (!trusted) {
				state = trusted;
				return state;
			}
		}

		return state;
	}

	private doGetUriTrustInfo(uri: URI): IWorkspaceTrustUriInfo {
		// Return trusted when workspace trust is disabled
		if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
			return { trusted: true, uri };
		}

		if (this.isTrustedVirtualResource(uri)) {
			return { trusted: true, uri };
		}

		if (this.isTrustedByRemote(uri)) {
			return { trusted: true, uri };
		}

		let resultState = false;
		let maxLength = -1;

		let resultUri = uri;

		for (const trustInfo of this._trustStateInfo.uriTrustInfo) {
			if (this.uriIdentityService.extUri.isEqualOrParent(uri, trustInfo.uri)) {
				const fsPath = trustInfo.uri.fsPath;
				if (fsPath.length > maxLength) {
					maxLength = fsPath.length;
					resultState = trustInfo.trusted;
					resultUri = trustInfo.uri;
				}
			}
		}

		return { trusted: resultState, uri: resultUri };
	}

	private async doSetUrisTrust(uris: URI[], trusted: boolean): Promise<void> {
		let changed = false;

		for (const uri of uris) {
			if (trusted) {
				if (this.isTrustedVirtualResource(uri)) {
					continue;
				}

				if (this.isTrustedByRemote(uri)) {
					continue;
				}

				const foundItem = this._trustStateInfo.uriTrustInfo.find(trustInfo => this.uriIdentityService.extUri.isEqual(trustInfo.uri, uri));
				if (!foundItem) {
					this._trustStateInfo.uriTrustInfo.push({ uri, trusted: true });
					changed = true;
				}
			} else {
				const previousLength = this._trustStateInfo.uriTrustInfo.length;
				this._trustStateInfo.uriTrustInfo = this._trustStateInfo.uriTrustInfo.filter(trustInfo => !this.uriIdentityService.extUri.isEqual(trustInfo.uri, uri));
				if (previousLength !== this._trustStateInfo.uriTrustInfo.length) {
					changed = true;
				}
			}
		}

		if (changed) {
			await this.saveTrustInfo();
		}
	}

	private isEmptyWorkspace(): boolean {
		if (this.workspaceService.getWorkbenchState() === WorkbenchState.EMPTY) {
			return true;
		}

		const workspace = this.workspaceService.getWorkspace();
		if (workspace) {
			return isTemporaryWorkspace(this.workspaceService.getWorkspace()) && workspace.folders.length === 0;
		}

		return false;
	}

	private isTrustedVirtualResource(uri: URI): boolean {
		return isVirtualResource(uri) && uri.scheme !== 'vscode-vfs';
	}

	private isTrustedByRemote(uri: URI): boolean {
		if (!this.environmentService.remoteAuthority) {
			return false;
		}

		if (!this._remoteAuthority) {
			return false;
		}

		return (isEqualAuthority(getRemoteAuthority(uri), this._remoteAuthority.authority.authority)) && !!this._remoteAuthority.options?.isTrusted;
	}

	private set isTrusted(value: boolean) {
		this._isTrusted = value;

		// Reset acceptsOutOfWorkspaceFiles
		if (!value) {
			this._storedTrustState.acceptsOutOfWorkspaceFiles = false;
		}

		// Empty workspace - save memento
		if (this.isEmptyWorkspace()) {
			this._storedTrustState.isEmptyWorkspaceTrusted = value;
		}
	}

	//#endregion

	//#region public interface

	get workspaceResolved(): Promise<void> {
		return this._workspaceResolvedPromise;
	}

	get workspaceTrustInitialized(): Promise<void> {
		return this._workspaceTrustInitializedPromise;
	}

	get acceptsOutOfWorkspaceFiles(): boolean {
		return this._storedTrustState.acceptsOutOfWorkspaceFiles;
	}

	set acceptsOutOfWorkspaceFiles(value: boolean) {
		this._storedTrustState.acceptsOutOfWorkspaceFiles = value;
	}

	isWorkspaceTrusted(): boolean {
		return this._isTrusted;
	}

	isWorkspaceTrustForced(): boolean {
		// Remote - remote authority explicitly sets workspace trust
		if (this.environmentService.remoteAuthority && this._remoteAuthority && this._remoteAuthority.options?.isTrusted !== undefined) {
			return true;
		}

		// All workspace uris are trusted automatically
		const workspaceUris = this.getWorkspaceUris().filter(uri => !this.isTrustedVirtualResource(uri));
		if (workspaceUris.length === 0) {
			return true;
		}

		return false;
	}

	canSetParentFolderTrust(): boolean {
		const workspaceIdentifier = toWorkspaceIdentifier(this._canonicalWorkspace);

		if (!isSingleFolderWorkspaceIdentifier(workspaceIdentifier)) {
			return false;
		}

		if (workspaceIdentifier.uri.scheme !== Schemas.file && workspaceIdentifier.uri.scheme !== Schemas.vscodeRemote) {
			return false;
		}

		const parentFolder = this.uriIdentityService.extUri.dirname(workspaceIdentifier.uri);
		if (this.uriIdentityService.extUri.isEqual(workspaceIdentifier.uri, parentFolder)) {
			return false;
		}

		return true;
	}

	async setParentFolderTrust(trusted: boolean): Promise<void> {
		if (this.canSetParentFolderTrust()) {
			const workspaceUri = (toWorkspaceIdentifier(this._canonicalWorkspace) as ISingleFolderWorkspaceIdentifier).uri;
			const parentFolder = this.uriIdentityService.extUri.dirname(workspaceUri);

			await this.setUrisTrust([parentFolder], trusted);
		}
	}

	canSetWorkspaceTrust(): boolean {
		// Remote - remote authority not yet resolved, or remote authority explicitly sets workspace trust
		if (this.environmentService.remoteAuthority && (!this._remoteAuthority || this._remoteAuthority.options?.isTrusted !== undefined)) {
			return false;
		}

		// Empty workspace
		if (this.isEmptyWorkspace()) {
			return true;
		}

		// All workspace uris are trusted automatically
		const workspaceUris = this.getWorkspaceUris().filter(uri => !this.isTrustedVirtualResource(uri));
		if (workspaceUris.length === 0) {
			return false;
		}

		// Untrusted workspace
		if (!this.isWorkspaceTrusted()) {
			return true;
		}

		// Trusted workspaces
		// Can only untrusted in the single folder scenario
		const workspaceIdentifier = toWorkspaceIdentifier(this._canonicalWorkspace);
		if (!isSingleFolderWorkspaceIdentifier(workspaceIdentifier)) {
			return false;
		}

		// Can only be untrusted in certain schemes
		if (workspaceIdentifier.uri.scheme !== Schemas.file && workspaceIdentifier.uri.scheme !== 'vscode-vfs') {
			return false;
		}

		// If the current folder isn't trusted directly, return false
		const trustInfo = this.doGetUriTrustInfo(workspaceIdentifier.uri);
		if (!trustInfo.trusted || !this.uriIdentityService.extUri.isEqual(workspaceIdentifier.uri, trustInfo.uri)) {
			return false;
		}

		// Check if the parent is also trusted
		if (this.canSetParentFolderTrust()) {
			const parentFolder = this.uriIdentityService.extUri.dirname(workspaceIdentifier.uri);
			const parentPathTrustInfo = this.doGetUriTrustInfo(parentFolder);
			if (parentPathTrustInfo.trusted) {
				return false;
			}
		}

		return true;
	}

	async setWorkspaceTrust(trusted: boolean): Promise<void> {
		// Empty workspace
		if (this.isEmptyWorkspace()) {
			await this.updateWorkspaceTrust(trusted);
			return;
		}

		const workspaceFolders = this.getWorkspaceUris();
		await this.setUrisTrust(workspaceFolders, trusted);
	}

	async getUriTrustInfo(uri: URI): Promise<IWorkspaceTrustUriInfo> {
		// Return trusted when workspace trust is disabled
		if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
			return { trusted: true, uri };
		}

		// Uri is trusted automatically by the remote
		if (this.isTrustedByRemote(uri)) {
			return { trusted: true, uri };
		}

		return this.doGetUriTrustInfo(await this.getCanonicalUri(uri));
	}

	async setUrisTrust(uris: URI[], trusted: boolean): Promise<void> {
		this.doSetUrisTrust(await Promise.all(uris.map(uri => this.getCanonicalUri(uri))), trusted);
	}

	getTrustedUris(): URI[] {
		return this._trustStateInfo.uriTrustInfo.map(info => info.uri);
	}

	async setTrustedUris(uris: URI[]): Promise<void> {
		this._trustStateInfo.uriTrustInfo = [];
		for (const uri of uris) {
			const canonicalUri = await this.getCanonicalUri(uri);
			const cleanUri = this.uriIdentityService.extUri.removeTrailingPathSeparator(canonicalUri);
			let added = false;
			for (const addedUri of this._trustStateInfo.uriTrustInfo) {
				if (this.uriIdentityService.extUri.isEqual(addedUri.uri, cleanUri)) {
					added = true;
					break;
				}
			}

			if (added) {
				continue;
			}

			this._trustStateInfo.uriTrustInfo.push({
				trusted: true,
				uri: cleanUri
			});
		}

		await this.saveTrustInfo();
	}

	addWorkspaceTrustTransitionParticipant(participant: IWorkspaceTrustTransitionParticipant): IDisposable {
		return this._trustTransitionManager.addWorkspaceTrustTransitionParticipant(participant);
	}

	//#endregion
}

export class WorkspaceTrustRequestService extends Disposable implements IWorkspaceTrustRequestService {
	_serviceBrand: undefined;

	private _openFilesTrustRequestPromise?: Promise<WorkspaceTrustUriResponse>;
	private _openFilesTrustRequestResolver?: (response: WorkspaceTrustUriResponse) => void;

	private _workspaceTrustRequestPromise?: Promise<boolean | undefined>;
	private _workspaceTrustRequestResolver?: (trusted: boolean | undefined) => void;

	private readonly _onDidInitiateOpenFilesTrustRequest = this._register(new Emitter<void>());
	readonly onDidInitiateOpenFilesTrustRequest = this._onDidInitiateOpenFilesTrustRequest.event;

	private readonly _onDidInitiateWorkspaceTrustRequest = this._register(new Emitter<WorkspaceTrustRequestOptions | undefined>());
	readonly onDidInitiateWorkspaceTrustRequest = this._onDidInitiateWorkspaceTrustRequest.event;

	private readonly _onDidInitiateWorkspaceTrustRequestOnStartup = this._register(new Emitter<void>());
	readonly onDidInitiateWorkspaceTrustRequestOnStartup = this._onDidInitiateWorkspaceTrustRequestOnStartup.event;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService
	) {
		super();
	}

	//#region Open file(s) trust request

	private get untrustedFilesSetting(): 'prompt' | 'open' | 'newWindow' {
		return this.configurationService.getValue(WORKSPACE_TRUST_UNTRUSTED_FILES);
	}

	private set untrustedFilesSetting(value: 'prompt' | 'open' | 'newWindow') {
		this.configurationService.updateValue(WORKSPACE_TRUST_UNTRUSTED_FILES, value);
	}

	async completeOpenFilesTrustRequest(result: WorkspaceTrustUriResponse, saveResponse?: boolean): Promise<void> {
		if (!this._openFilesTrustRequestResolver) {
			return;
		}

		// Set acceptsOutOfWorkspaceFiles
		if (result === WorkspaceTrustUriResponse.Open) {
			this.workspaceTrustManagementService.acceptsOutOfWorkspaceFiles = true;
		}

		// Save response
		if (saveResponse) {
			if (result === WorkspaceTrustUriResponse.Open) {
				this.untrustedFilesSetting = 'open';
			}

			if (result === WorkspaceTrustUriResponse.OpenInNewWindow) {
				this.untrustedFilesSetting = 'newWindow';
			}
		}

		// Resolve promise
		this._openFilesTrustRequestResolver(result);

		this._openFilesTrustRequestResolver = undefined;
		this._openFilesTrustRequestPromise = undefined;
	}

	async requestOpenFilesTrust(uris: URI[]): Promise<WorkspaceTrustUriResponse> {
		// If workspace is untrusted, there is no conflict
		if (!this.workspaceTrustManagementService.isWorkspaceTrusted()) {
			return WorkspaceTrustUriResponse.Open;
		}

		const openFilesTrustInfo = await Promise.all(uris.map(uri => this.workspaceTrustManagementService.getUriTrustInfo(uri)));

		// If all uris are trusted, there is no conflict
		if (openFilesTrustInfo.map(info => info.trusted).every(trusted => trusted)) {
			return WorkspaceTrustUriResponse.Open;
		}

		// If user has setting, don't need to ask
		if (this.untrustedFilesSetting !== 'prompt') {
			if (this.untrustedFilesSetting === 'newWindow') {
				return WorkspaceTrustUriResponse.OpenInNewWindow;
			}

			if (this.untrustedFilesSetting === 'open') {
				return WorkspaceTrustUriResponse.Open;
			}
		}

		// If we already asked the user, don't need to ask again
		if (this.workspaceTrustManagementService.acceptsOutOfWorkspaceFiles) {
			return WorkspaceTrustUriResponse.Open;
		}

		// Create/return a promise
		if (!this._openFilesTrustRequestPromise) {
			this._openFilesTrustRequestPromise = new Promise<WorkspaceTrustUriResponse>(resolve => {
				this._openFilesTrustRequestResolver = resolve;
			});
		} else {
			return this._openFilesTrustRequestPromise;
		}

		this._onDidInitiateOpenFilesTrustRequest.fire();
		return this._openFilesTrustRequestPromise;
	}

	//#endregion

	//#region Workspace trust request

	private resolveWorkspaceTrustRequest(trusted?: boolean): void {
		if (this._workspaceTrustRequestResolver) {
			this._workspaceTrustRequestResolver(trusted ?? this.workspaceTrustManagementService.isWorkspaceTrusted());

			this._workspaceTrustRequestResolver = undefined;
			this._workspaceTrustRequestPromise = undefined;
		}
	}

	cancelWorkspaceTrustRequest(): void {
		if (this._workspaceTrustRequestResolver) {
			this._workspaceTrustRequestResolver(undefined);

			this._workspaceTrustRequestResolver = undefined;
			this._workspaceTrustRequestPromise = undefined;
		}
	}

	async completeWorkspaceTrustRequest(trusted?: boolean): Promise<void> {
		if (trusted === undefined || trusted === this.workspaceTrustManagementService.isWorkspaceTrusted()) {
			this.resolveWorkspaceTrustRequest(trusted);
			return;
		}

		// Register one-time event handler to resolve the promise when workspace trust changed
		Event.once(this.workspaceTrustManagementService.onDidChangeTrust)(trusted => this.resolveWorkspaceTrustRequest(trusted));

		// Update storage, transition workspace state
		await this.workspaceTrustManagementService.setWorkspaceTrust(trusted);
	}

	async requestWorkspaceTrust(options?: WorkspaceTrustRequestOptions): Promise<boolean | undefined> {
		// Trusted workspace
		if (this.workspaceTrustManagementService.isWorkspaceTrusted()) {
			return this.workspaceTrustManagementService.isWorkspaceTrusted();
		}

		// Modal request
		if (!this._workspaceTrustRequestPromise) {
			// Create promise
			this._workspaceTrustRequestPromise = new Promise(resolve => {
				this._workspaceTrustRequestResolver = resolve;
			});
		} else {
			// Return existing promise
			return this._workspaceTrustRequestPromise;
		}

		this._onDidInitiateWorkspaceTrustRequest.fire(options);
		return this._workspaceTrustRequestPromise;
	}

	requestWorkspaceTrustOnStartup(): void {
		if (!this._workspaceTrustRequestPromise) {
			// Create promise
			this._workspaceTrustRequestPromise = new Promise(resolve => {
				this._workspaceTrustRequestResolver = resolve;
			});
		}

		this._onDidInitiateWorkspaceTrustRequestOnStartup.fire();
	}

	//#endregion
}

class WorkspaceTrustTransitionManager extends Disposable {

	private readonly participants = new LinkedList<IWorkspaceTrustTransitionParticipant>();

	addWorkspaceTrustTransitionParticipant(participant: IWorkspaceTrustTransitionParticipant): IDisposable {
		const remove = this.participants.push(participant);
		return toDisposable(() => remove());
	}

	async participate(trusted: boolean): Promise<void> {
		for (const participant of this.participants) {
			await participant.participate(trusted);
		}
	}

	override dispose(): void {
		this.participants.clear();
		super.dispose();
	}
}

class WorkspaceTrustMemento {

	private readonly _memento?: Memento;
	private readonly _mementoObject: MementoObject;

	private readonly _acceptsOutOfWorkspaceFilesKey = 'acceptsOutOfWorkspaceFiles';
	private readonly _isEmptyWorkspaceTrustedKey = 'isEmptyWorkspaceTrusted';

	constructor(storageService?: IStorageService) {
		if (storageService) {
			this._memento = new Memento('workspaceTrust', storageService);
			this._mementoObject = this._memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this._mementoObject = {};
		}
	}

	get acceptsOutOfWorkspaceFiles(): boolean {
		return this._mementoObject[this._acceptsOutOfWorkspaceFilesKey] ?? false;
	}

	set acceptsOutOfWorkspaceFiles(value: boolean) {
		this._mementoObject[this._acceptsOutOfWorkspaceFilesKey] = value;

		this._memento?.saveMemento();
	}

	get isEmptyWorkspaceTrusted(): boolean | undefined {
		return this._mementoObject[this._isEmptyWorkspaceTrustedKey];
	}

	set isEmptyWorkspaceTrusted(value: boolean | undefined) {
		this._mementoObject[this._isEmptyWorkspaceTrustedKey] = value;

		this._memento?.saveMemento();
	}
}

registerSingleton(IWorkspaceTrustRequestService, WorkspaceTrustRequestService, InstantiationType.Delayed);
