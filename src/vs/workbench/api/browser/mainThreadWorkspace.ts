/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { isCancellationError } from '../../../base/common/errors.js';
import { DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { isNative } from '../../../base/common/platform.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';
import { IFileService } from '../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../platform/label/common/label.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { AuthInfo, Credentials, IRequestService } from '../../../platform/request/common/request.js';
import { WorkspaceTrustRequestOptions, IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../platform/workspace/common/workspaceTrust.js';
import { IWorkspace, IWorkspaceContextService, WorkbenchState, isUntitledWorkspace, WorkspaceFolder } from '../../../platform/workspace/common/workspace.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { checkGlobFileExists } from '../../services/extensions/common/workspaceContains.js';
import { IFileQueryBuilderOptions, ITextQueryBuilderOptions, QueryBuilder } from '../../services/search/common/queryBuilder.js';
import { IEditorService, ISaveEditorsResult } from '../../services/editor/common/editorService.js';
import { IFileMatch, IPatternInfo, ISearchProgressItem, ISearchService } from '../../services/search/common/search.js';
import { IWorkspaceEditingService } from '../../services/workspaces/common/workspaceEditing.js';
import { ExtHostContext, ExtHostWorkspaceShape, ITextSearchComplete, IWorkspaceData, MainContext, MainThreadWorkspaceShape } from '../common/extHost.protocol.js';
import { IEditSessionIdentityService } from '../../../platform/workspace/common/editSessions.js';
import { EditorResourceAccessor, SaveReason, SideBySideEditor } from '../../common/editor.js';
import { coalesce } from '../../../base/common/arrays.js';
import { ICanonicalUriService } from '../../../platform/workspace/common/canonicalUri.js';
import { revive } from '../../../base/common/marshalling.js';
import { bufferToStream, readableToBuffer, VSBuffer } from '../../../base/common/buffer.js';
import { ITextFileService } from '../../services/textfile/common/textfiles.js';
import { consumeStream } from '../../../base/common/stream.js';

@extHostNamedCustomer(MainContext.MainThreadWorkspace)
export class MainThreadWorkspace implements MainThreadWorkspaceShape {

	private readonly _toDispose = new DisposableStore();
	private readonly _activeCancelTokens: { [id: number]: CancellationTokenSource } = Object.create(null);
	private readonly _proxy: ExtHostWorkspaceShape;
	private readonly _queryBuilder = this._instantiationService.createInstance(QueryBuilder);

	constructor(
		extHostContext: IExtHostContext,
		@ISearchService private readonly _searchService: ISearchService,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
		@IEditSessionIdentityService private readonly _editSessionIdentityService: IEditSessionIdentityService,
		@ICanonicalUriService private readonly _canonicalUriService: ICanonicalUriService,
		@IEditorService private readonly _editorService: IEditorService,
		@IWorkspaceEditingService private readonly _workspaceEditingService: IWorkspaceEditingService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IRequestService private readonly _requestService: IRequestService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILabelService private readonly _labelService: ILabelService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkspaceTrustRequestService private readonly _workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@ITextFileService private readonly _textFileService: ITextFileService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostWorkspace);
		const workspace = this._contextService.getWorkspace();
		// The workspace file is provided be a unknown file system provider. It might come
		// from the extension host. So initialize now knowing that `rootPath` is undefined.
		if (workspace.configuration && !isNative && !fileService.hasProvider(workspace.configuration)) {
			this._proxy.$initializeWorkspace(this.getWorkspaceData(workspace), this.isWorkspaceTrusted());
		} else {
			this._contextService.getCompleteWorkspace().then(workspace => this._proxy.$initializeWorkspace(this.getWorkspaceData(workspace), this.isWorkspaceTrusted()));
		}
		this._contextService.onDidChangeWorkspaceFolders(this._onDidChangeWorkspace, this, this._toDispose);
		this._contextService.onDidChangeWorkbenchState(this._onDidChangeWorkspace, this, this._toDispose);
		this._workspaceTrustManagementService.onDidChangeTrust(this._onDidGrantWorkspaceTrust, this, this._toDispose);
	}

	dispose(): void {
		this._toDispose.dispose();

		for (const requestId in this._activeCancelTokens) {
			const tokenSource = this._activeCancelTokens[requestId];
			tokenSource.cancel();
		}
	}

	// --- workspace ---

	$updateWorkspaceFolders(extensionName: string, index: number, deleteCount: number, foldersToAdd: { uri: UriComponents; name?: string }[]): Promise<void> {
		const workspaceFoldersToAdd = foldersToAdd.map(f => ({ uri: URI.revive(f.uri), name: f.name }));

		// Indicate in status message
		this._notificationService.status(this.getStatusMessage(extensionName, workspaceFoldersToAdd.length, deleteCount), { hideAfter: 10 * 1000 /* 10s */ });

		return this._workspaceEditingService.updateFolders(index, deleteCount, workspaceFoldersToAdd, true);
	}

	private getStatusMessage(extensionName: string, addCount: number, removeCount: number): string {
		let message: string;

		const wantsToAdd = addCount > 0;
		const wantsToDelete = removeCount > 0;

		// Add Folders
		if (wantsToAdd && !wantsToDelete) {
			if (addCount === 1) {
				message = localize('folderStatusMessageAddSingleFolder', "Extension '{0}' added 1 folder to the workspace", extensionName);
			} else {
				message = localize('folderStatusMessageAddMultipleFolders', "Extension '{0}' added {1} folders to the workspace", extensionName, addCount);
			}
		}

		// Delete Folders
		else if (wantsToDelete && !wantsToAdd) {
			if (removeCount === 1) {
				message = localize('folderStatusMessageRemoveSingleFolder', "Extension '{0}' removed 1 folder from the workspace", extensionName);
			} else {
				message = localize('folderStatusMessageRemoveMultipleFolders', "Extension '{0}' removed {1} folders from the workspace", extensionName, removeCount);
			}
		}

		// Change Folders
		else {
			message = localize('folderStatusChangeFolder', "Extension '{0}' changed folders of the workspace", extensionName);
		}

		return message;
	}

	private _onDidChangeWorkspace(): void {
		this._proxy.$acceptWorkspaceData(this.getWorkspaceData(this._contextService.getWorkspace()));
	}

	private getWorkspaceData(workspace: IWorkspace): IWorkspaceData | null {
		if (this._contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			return null;
		}
		return {
			configuration: workspace.configuration || undefined,
			isUntitled: workspace.configuration ? isUntitledWorkspace(workspace.configuration, this._environmentService) : false,
			folders: workspace.folders,
			id: workspace.id,
			name: this._labelService.getWorkspaceLabel(workspace),
			transient: workspace.transient
		};
	}

	// --- search ---

	$startFileSearch(_includeFolder: UriComponents | null, options: IFileQueryBuilderOptions<UriComponents>, token: CancellationToken): Promise<UriComponents[] | null> {
		const includeFolder = URI.revive(_includeFolder);
		const workspace = this._contextService.getWorkspace();

		const query = this._queryBuilder.file(
			includeFolder ? [includeFolder] : workspace.folders,
			revive(options)
		);

		return this._searchService.fileSearch(query, token).then(result => {
			return result.results.map(m => m.resource);
		}, err => {
			if (!isCancellationError(err)) {
				return Promise.reject(err);
			}
			return null;
		});
	}

	$startTextSearch(pattern: IPatternInfo, _folder: UriComponents | null, options: ITextQueryBuilderOptions<UriComponents>, requestId: number, token: CancellationToken): Promise<ITextSearchComplete | null> {
		const folder = URI.revive(_folder);
		const workspace = this._contextService.getWorkspace();
		const folders = folder ? [folder] : workspace.folders.map(folder => folder.uri);

		const query = this._queryBuilder.text(pattern, folders, revive(options));
		query._reason = 'startTextSearch';

		const onProgress = (p: ISearchProgressItem) => {
			if ((<IFileMatch>p).results) {
				this._proxy.$handleTextSearchResult(<IFileMatch>p, requestId);
			}
		};

		const search = this._searchService.textSearch(query, token, onProgress).then(
			result => {
				return { limitHit: result.limitHit };
			},
			err => {
				if (!isCancellationError(err)) {
					return Promise.reject(err);
				}

				return null;
			});

		return search;
	}

	$checkExists(folders: readonly UriComponents[], includes: string[], token: CancellationToken): Promise<boolean> {
		return this._instantiationService.invokeFunction((accessor) => checkGlobFileExists(accessor, folders, includes, token));
	}

	// --- save & edit resources ---

	async $save(uriComponents: UriComponents, options: { saveAs: boolean }): Promise<UriComponents | undefined> {
		const uri = URI.revive(uriComponents);

		const editors = [...this._editorService.findEditors(uri, { supportSideBySide: SideBySideEditor.PRIMARY })];
		const result = await this._editorService.save(editors, {
			reason: SaveReason.EXPLICIT,
			saveAs: options.saveAs,
			force: !options.saveAs
		});

		return this._saveResultToUris(result).at(0);
	}

	private _saveResultToUris(result: ISaveEditorsResult): URI[] {
		if (!result.success) {
			return [];
		}

		return coalesce(result.editors.map(editor => EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY })));
	}

	$saveAll(includeUntitled?: boolean): Promise<boolean> {
		return this._editorService.saveAll({ includeUntitled }).then(res => res.success);
	}

	$resolveProxy(url: string): Promise<string | undefined> {
		return this._requestService.resolveProxy(url);
	}

	$lookupAuthorization(authInfo: AuthInfo): Promise<Credentials | undefined> {
		return this._requestService.lookupAuthorization(authInfo);
	}

	$lookupKerberosAuthorization(url: string): Promise<string | undefined> {
		return this._requestService.lookupKerberosAuthorization(url);
	}

	$loadCertificates(): Promise<string[]> {
		return this._requestService.loadCertificates();
	}

	// --- trust ---

	$requestWorkspaceTrust(options?: WorkspaceTrustRequestOptions): Promise<boolean | undefined> {
		return this._workspaceTrustRequestService.requestWorkspaceTrust(options);
	}

	private isWorkspaceTrusted(): boolean {
		return this._workspaceTrustManagementService.isWorkspaceTrusted();
	}

	private _onDidGrantWorkspaceTrust(): void {
		this._proxy.$onDidGrantWorkspaceTrust();
	}

	// --- edit sessions ---
	private registeredEditSessionProviders = new Map<number, IDisposable>();

	$registerEditSessionIdentityProvider(handle: number, scheme: string) {
		const disposable = this._editSessionIdentityService.registerEditSessionIdentityProvider({
			scheme: scheme,
			getEditSessionIdentifier: async (workspaceFolder: WorkspaceFolder, token: CancellationToken) => {
				return this._proxy.$getEditSessionIdentifier(workspaceFolder.uri, token);
			},
			provideEditSessionIdentityMatch: async (workspaceFolder: WorkspaceFolder, identity1: string, identity2: string, token: CancellationToken) => {
				return this._proxy.$provideEditSessionIdentityMatch(workspaceFolder.uri, identity1, identity2, token);
			}
		});

		this.registeredEditSessionProviders.set(handle, disposable);
		this._toDispose.add(disposable);
	}

	$unregisterEditSessionIdentityProvider(handle: number) {
		const disposable = this.registeredEditSessionProviders.get(handle);
		disposable?.dispose();
		this.registeredEditSessionProviders.delete(handle);
	}

	// --- canonical uri identities ---
	private registeredCanonicalUriProviders = new Map<number, IDisposable>();

	$registerCanonicalUriProvider(handle: number, scheme: string) {
		const disposable = this._canonicalUriService.registerCanonicalUriProvider({
			scheme: scheme,
			provideCanonicalUri: async (uri: UriComponents, targetScheme: string, token: CancellationToken) => {
				const result = await this._proxy.$provideCanonicalUri(uri, targetScheme, token);
				if (result) {
					return URI.revive(result);
				}
				return result;
			}
		});

		this.registeredCanonicalUriProviders.set(handle, disposable);
		this._toDispose.add(disposable);
	}

	$unregisterCanonicalUriProvider(handle: number) {
		const disposable = this.registeredCanonicalUriProviders.get(handle);
		disposable?.dispose();
		this.registeredCanonicalUriProviders.delete(handle);
	}

	// --- encodings

	async $decode(content: VSBuffer, resource: UriComponents | undefined, options?: { encoding: string }): Promise<string> {
		const stream = await this._textFileService.getDecodedStream(URI.revive(resource) ?? undefined, bufferToStream(content), { acceptTextOnly: true, encoding: options?.encoding });
		return consumeStream(stream, chunks => chunks.join());
	}

	async $encode(content: string, resource: UriComponents | undefined, options?: { encoding: string }): Promise<VSBuffer> {
		const res = await this._textFileService.getEncodedReadable(URI.revive(resource) ?? undefined, content, { encoding: options?.encoding });
		return res instanceof VSBuffer ? res : readableToBuffer(res);
	}
}
