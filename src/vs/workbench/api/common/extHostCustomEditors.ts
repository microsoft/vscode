/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { isCancellationError, onUnexpectedError } from '../../../base/common/errors.js';
import { hash } from '../../../base/common/hash.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { IRange } from '../../../editor/common/core/range.js';
import { ISelection } from '../../../editor/common/core/selection.js';
import { Schemas } from '../../../base/common/network.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { ExtHostDocuments } from './extHostDocuments.js';
import { IExtensionStoragePaths } from './extHostStoragePaths.js';
import * as typeConverters from './extHostTypeConverters.js';
import { ExtHostWebviews, shouldSerializeBuffersForPostMessage, toExtensionData } from './extHostWebview.js';
import { ExtHostWebviewPanels } from './extHostWebviewPanels.js';
import { EditorGroupColumn } from '../../services/editor/common/editorGroupColumn.js';
import type * as vscode from 'vscode';
import { Cache } from './cache.js';
import * as extHostProtocol from './extHost.protocol.js';
import * as extHostTypes from './extHostTypes.js';
import { checkProposedApiEnabled, isProposedApiEnabled } from '../../services/extensions/common/extensions.js';

interface CustomTextEditorNavigationEntry {
	readonly viewType: string;
	readonly disposables: DisposableStore;
	readonly states: Map<number, unknown>;
	readonly pendingStates: Set<number>;
	controller?: vscode.CustomTextEditorNavigation;
}


class CustomDocumentStoreEntry {

	private _backupCounter = 1;

	constructor(
		public readonly document: vscode.CustomDocument,
		private readonly _storagePath: URI | undefined,
	) { }

	private readonly _edits = new Cache<vscode.CustomDocumentEditEvent>('custom documents');

	private _backup?: vscode.CustomDocumentBackup;

	addEdit(item: vscode.CustomDocumentEditEvent): number {
		return this._edits.add([item]);
	}

	async undo(editId: number, isDirty: boolean): Promise<void> {
		await this.getEdit(editId).undo();
		if (!isDirty) {
			this.disposeBackup();
		}
	}

	async redo(editId: number, isDirty: boolean): Promise<void> {
		await this.getEdit(editId).redo();
		if (!isDirty) {
			this.disposeBackup();
		}
	}

	disposeEdits(editIds: number[]): void {
		for (const id of editIds) {
			this._edits.delete(id);
		}
	}

	getNewBackupUri(): URI {
		if (!this._storagePath) {
			throw new Error('Backup requires a valid storage path');
		}
		const fileName = hashPath(this.document.uri) + (this._backupCounter++);
		return joinPath(this._storagePath, fileName);
	}

	updateBackup(backup: vscode.CustomDocumentBackup): void {
		this._backup?.delete();
		this._backup = backup;
	}

	disposeBackup(): void {
		this._backup?.delete();
		this._backup = undefined;
	}

	private getEdit(editId: number): vscode.CustomDocumentEditEvent {
		const edit = this._edits.get(editId, 0);
		if (!edit) {
			throw new Error('No edit found');
		}
		return edit;
	}
}

class CustomDocumentStore {
	private readonly _documents = new Map<string, CustomDocumentStoreEntry>();

	public get(viewType: string, resource: vscode.Uri): CustomDocumentStoreEntry | undefined {
		return this._documents.get(this.key(viewType, resource));
	}

	public add(viewType: string, document: vscode.CustomDocument, storagePath: URI | undefined): CustomDocumentStoreEntry {
		const key = this.key(viewType, document.uri);
		if (this._documents.has(key)) {
			throw new Error(`Document already exists for viewType:${viewType} resource:${document.uri}`);
		}
		const entry = new CustomDocumentStoreEntry(document, storagePath);
		this._documents.set(key, entry);
		return entry;
	}

	public delete(viewType: string, resource: vscode.Uri) {
		// Use the resource parameter directly instead of document.uri, because the document's
		// URI may have changed (e.g., after SaveAs from untitled to a file path).
		const key = this.key(viewType, resource);
		this._documents.delete(key);
	}

	private key(viewType: string, resource: vscode.Uri): string {
		return `${viewType}@@@${resource}`;
	}
}

const enum CustomEditorType {
	Text,
	Custom
}

type ProviderEntry = {
	readonly extension: IExtensionDescription;
	readonly type: CustomEditorType.Text;
	readonly provider: vscode.CustomTextEditorProvider;
} | {
	readonly extension: IExtensionDescription;
	readonly type: CustomEditorType.Custom;
	readonly provider: vscode.CustomReadonlyEditorProvider;
};

class EditorProviderStore {
	private readonly _providers = new Map<string, ProviderEntry>();

	public addTextProvider(viewType: string, extension: IExtensionDescription, provider: vscode.CustomTextEditorProvider): vscode.Disposable {
		return this.add(viewType, { type: CustomEditorType.Text, extension, provider });
	}

	public addCustomProvider(viewType: string, extension: IExtensionDescription, provider: vscode.CustomReadonlyEditorProvider): vscode.Disposable {
		return this.add(viewType, { type: CustomEditorType.Custom, extension, provider });
	}

	public get(viewType: string): ProviderEntry | undefined {
		return this._providers.get(viewType);
	}

	private add(viewType: string, entry: ProviderEntry): vscode.Disposable {
		if (this._providers.has(viewType)) {
			throw new Error(`Provider for viewType:${viewType} already registered`);
		}
		this._providers.set(viewType, entry);
		return new extHostTypes.Disposable(() => this._providers.delete(viewType));
	}
}

export class ExtHostCustomEditors implements extHostProtocol.ExtHostCustomEditorsShape {

	private readonly _proxy: extHostProtocol.MainThreadCustomEditorsShape;

	private readonly _editorProviders = new EditorProviderStore();

	private readonly _documents = new CustomDocumentStore();
	private readonly _navigation = new Map<extHostProtocol.WebviewHandle, CustomTextEditorNavigationEntry>();

	constructor(
		mainContext: extHostProtocol.IMainContext,
		private readonly _extHostDocuments: ExtHostDocuments,
		private readonly _extensionStoragePaths: IExtensionStoragePaths | undefined,
		private readonly _extHostWebview: ExtHostWebviews,
		private readonly _extHostWebviewPanels: ExtHostWebviewPanels,
	) {
		this._proxy = mainContext.getProxy(extHostProtocol.MainContext.MainThreadCustomEditors);
	}

	public registerCustomEditorProvider(
		extension: IExtensionDescription,
		viewType: string,
		provider: vscode.CustomReadonlyEditorProvider | vscode.CustomTextEditorProvider,
		options: { webviewOptions?: vscode.WebviewPanelOptions; supportsMultipleEditorsPerDocument?: boolean },
	): vscode.Disposable {
		if (isCustomTextEditorProvider(provider) && provider.resolveCustomTextEditorNavigation) {
			checkProposedApiEnabled(extension, 'customTextEditorNavigation');
		}
		const disposables = new DisposableStore();
		if (isCustomTextEditorProvider(provider)) {
			disposables.add(this._editorProviders.addTextProvider(viewType, extension, provider));
			this._proxy.$registerTextEditorProvider(toExtensionData(extension), viewType, options.webviewOptions || {}, {
				supportsMove: !!provider.moveCustomTextEditor,
				supportsNavigation: !!provider.resolveCustomTextEditorNavigation,
				supportsInlineDiff: isProposedApiEnabled(extension, 'customEditorDiffs') && isCustomTextEditorProviderWithInlineDiffCapability(provider),
				supportsSideBySideDiff: isProposedApiEnabled(extension, 'customEditorDiffs') && isCustomTextEditorProviderWithSideBySideDiffCapability(provider),
			}, shouldSerializeBuffersForPostMessage(extension));
		} else {
			disposables.add(this._editorProviders.addCustomProvider(viewType, extension, provider));
			const supportsCustomEditorDiffs = isProposedApiEnabled(extension, 'customEditorDiffs');

			if (isCustomEditorProviderWithEditingCapability(provider)) {
				disposables.add(provider.onDidChangeCustomDocument(e => {
					const entry = this.getCustomDocumentEntry(viewType, e.document.uri);
					if (isEditEvent(e)) {
						const editId = entry.addEdit(e);
						this._proxy.$onDidEdit(e.document.uri, viewType, editId, e.label);
					} else {
						this._proxy.$onContentChange(e.document.uri, viewType);
					}
				}));
			}

			this._proxy.$registerCustomEditorProvider(toExtensionData(extension), viewType, options.webviewOptions || {}, {
				supportsInlineDiff: supportsCustomEditorDiffs && isCustomEditorProviderWithInlineDiffCapability(provider),
				supportsSideBySideDiff: supportsCustomEditorDiffs && isCustomEditorProviderWithSideBySideDiffCapability(provider),
			}, !!options.supportsMultipleEditorsPerDocument, shouldSerializeBuffersForPostMessage(extension));
		}

		disposables.add(toDisposable(() => {
			for (const [handle, entry] of this._navigation) {
				if (entry.viewType === viewType) {
					this.$disposeCustomTextEditorNavigation(handle);
				}
			}
		}));

		return extHostTypes.Disposable.from(
			disposables,
			new extHostTypes.Disposable(() => {
				this._proxy.$unregisterEditorProvider(viewType);
			}));
	}

	async $createCustomDocument(resource: UriComponents, viewType: string, backupId: string | undefined, untitledDocumentData: VSBuffer | undefined, cancellation: CancellationToken) {
		const entry = this._editorProviders.get(viewType);
		if (!entry) {
			throw new Error(`No provider found for '${viewType}'`);
		}

		if (entry.type !== CustomEditorType.Custom) {
			throw new Error(`Invalid provide type for '${viewType}'`);
		}

		const revivedResource = URI.revive(resource);
		const document = await entry.provider.openCustomDocument(revivedResource, { backupId, untitledDocumentData: untitledDocumentData?.buffer }, cancellation);

		let storageRoot: URI | undefined;
		if (isCustomEditorProviderWithEditingCapability(entry.provider) && this._extensionStoragePaths) {
			storageRoot = this._extensionStoragePaths.workspaceValue(entry.extension) ?? this._extensionStoragePaths.globalValue(entry.extension);
		}
		this._documents.add(viewType, document, storageRoot);

		return { editable: isCustomEditorProviderWithEditingCapability(entry.provider) };
	}

	async $disposeCustomDocument(resource: UriComponents, viewType: string): Promise<void> {
		// Unregistering a provider disposes its models, so the provider may already be gone.
		const revivedResource = URI.revive(resource);
		const { document } = this.getCustomDocumentEntry(viewType, revivedResource);
		// Pass the resource we used to look up the document, not document.uri,
		// because the document's URI may have changed (e.g., after SaveAs).
		this._documents.delete(viewType, revivedResource);
		document.dispose();
	}

	async $resolveCustomEditor(
		resource: UriComponents,
		handle: extHostProtocol.WebviewHandle,
		viewType: string,
		initData: {
			title: string;
			contentOptions: extHostProtocol.IWebviewContentOptions;
			options: extHostProtocol.IWebviewPanelOptions;
			active: boolean;
		},
		position: EditorGroupColumn,
		cancellation: CancellationToken,
	): Promise<void> {
		const entry = this._editorProviders.get(viewType);
		if (!entry) {
			throw new Error(`No provider found for '${viewType}'`);
		}

		const viewColumn = typeConverters.ViewColumn.to(position);

		const webview = this._extHostWebview.createNewWebview(handle, initData.contentOptions, entry.extension);
		// The main thread starts the custom editor's webview with empty content
		// options. Ensure `localResourceRoots` defaults to the workspace folders
		// and the providing extension's install directory, as documented on
		// `WebviewOptions.localResourceRoots`.
		this._extHostWebview.ensureDefaultContentOptions(handle, initData.contentOptions, entry.extension);
		const panel = this._extHostWebviewPanels.createNewWebviewPanel(handle, viewType, initData.title, viewColumn, initData.options, webview, initData.active);

		const revivedResource = URI.revive(resource);

		switch (entry.type) {
			case CustomEditorType.Custom: {
				const { document } = this.getCustomDocumentEntry(viewType, revivedResource);
				return entry.provider.resolveCustomEditor(document, panel, cancellation);
			}
			case CustomEditorType.Text: {
				const document = this._extHostDocuments.getDocument(revivedResource);
				return entry.provider.resolveCustomTextEditor(document, panel, cancellation);
			}
			default: {
				throw new Error('Unknown webview provider type');
			}
		}
	}

	async $resolveCustomTextEditorNavigation(handle: extHostProtocol.WebviewHandle, viewType: string, resource: UriComponents, token: CancellationToken): Promise<{ selection: ISelection | undefined } | undefined> {
		const provider = this._editorProviders.get(viewType);
		const panel = this._extHostWebviewPanels.getWebviewPanel(handle);
		if (provider?.type !== CustomEditorType.Text || !provider.provider.resolveCustomTextEditorNavigation || !panel || token.isCancellationRequested) {
			return undefined;
		}
		checkProposedApiEnabled(provider.extension, 'customTextEditorNavigation');
		this.$disposeCustomTextEditorNavigation(handle);
		const entry: CustomTextEditorNavigationEntry = { viewType, disposables: new DisposableStore(), states: new Map(), pendingStates: new Set() };
		this._navigation.set(handle, entry);
		const cancellation = new CancellationTokenSource(token);
		entry.disposables.add(toDisposable(() => cancellation.dispose(true)));
		entry.disposables.add(panel.onDidDispose(() => this.$disposeCustomTextEditorNavigation(handle)));
		try {
			const controller = await provider.provider.resolveCustomTextEditorNavigation(this._extHostDocuments.getDocument(URI.revive(resource)), panel, cancellation.token);
			if (cancellation.token.isCancellationRequested || this._navigation.get(handle) !== entry) {
				controller.dispose();
				this.$disposeCustomTextEditorNavigation(handle);
				return undefined;
			}
			entry.controller = controller;
			entry.disposables.add(controller);
			entry.disposables.add(controller.onDidChangeSelection(selection => {
				this._proxy.$onDidChangeCustomTextEditorSelection(handle, selection && typeConverters.Selection.from(selection));
			}));
			return { selection: controller.selection && typeConverters.Selection.from(controller.selection) };
		} catch (error) {
			this.$disposeCustomTextEditorNavigation(handle);
			if (!isCancellationError(error)) {
				onUnexpectedError(error);
			}
			return undefined;
		}
	}

	$disposeCustomTextEditorNavigation(handle: extHostProtocol.WebviewHandle): void {
		const entry = this._navigation.get(handle);
		if (entry) {
			this._navigation.delete(handle);
			entry.states.clear();
			entry.pendingStates.clear();
			entry.disposables.dispose();
		}
	}

	async $revealCustomTextEditorRange(handle: extHostProtocol.WebviewHandle, range: IRange, selection: ISelection | undefined, preserveFocus: boolean, token: CancellationToken): Promise<void> {
		const controller = this._navigation.get(handle)?.controller;
		if (controller && !token.isCancellationRequested) {
			await controller.revealRange(typeConverters.Range.to(range), { selection: selection && typeConverters.Selection.to(selection), preserveFocus }, token);
		}
	}

	async $captureCustomTextEditorViewState(handle: extHostProtocol.WebviewHandle, stateId: number): Promise<void> {
		const entry = this._navigation.get(handle);
		if (entry?.controller) {
			entry.pendingStates.add(stateId);
			try {
				const state = await entry.controller.captureViewState();
				if (this._navigation.get(handle) === entry && entry.pendingStates.delete(stateId)) {
					entry.states.set(stateId, state);
				}
			} finally {
				entry.pendingStates.delete(stateId);
			}
		}
	}

	async $restoreCustomTextEditorViewState(handle: extHostProtocol.WebviewHandle, stateId: number, token: CancellationToken): Promise<void> {
		const entry = this._navigation.get(handle);
		if (entry?.controller && entry.states.has(stateId)) {
			const state = entry.states.get(stateId);
			entry.states.delete(stateId);
			if (!token.isCancellationRequested) {
				await entry.controller.restoreViewState(state, token);
			}
		}
	}

	$releaseCustomTextEditorViewState(handle: extHostProtocol.WebviewHandle, stateId: number): void {
		const entry = this._navigation.get(handle);
		entry?.states.delete(stateId);
		entry?.pendingStates.delete(stateId);
	}

	async $resolveCustomEditorInlineDiff(
		originalResource: UriComponents,
		modifiedResource: UriComponents,
		handle: extHostProtocol.WebviewHandle,
		viewType: string,
		initData: extHostProtocol.CustomEditorDiffInitData,
		position: EditorGroupColumn,
		cancellation: CancellationToken,
	): Promise<void> {
		const { entry, panel } = this.createCustomEditorDiffPanel(handle, viewType, initData, position);
		const revivedOriginalResource = URI.revive(originalResource);
		const revivedModifiedResource = URI.revive(modifiedResource);

		if (entry.type === CustomEditorType.Text) {
			if (!isCustomTextEditorProviderWithInlineDiffCapability(entry.provider)) {
				throw new Error(`Provider for '${viewType}' does not support inline custom text editor diffs`);
			}

			const originalDocument = this._extHostDocuments.getDocument(revivedOriginalResource);
			const modifiedDocument = this._extHostDocuments.getDocument(revivedModifiedResource);
			return entry.provider.resolveCustomTextEditorInlineDiff({ original: originalDocument, modified: modifiedDocument }, panel, cancellation);
		}

		if (!isCustomEditorProviderWithInlineDiffCapability(entry.provider)) {
			throw new Error(`Provider for '${viewType}' does not support inline custom editor diffs`);
		}

		const { document: originalDocument } = this.getCustomDocumentEntry(viewType, revivedOriginalResource);
		const { document: modifiedDocument } = this.getCustomDocumentEntry(viewType, revivedModifiedResource);
		return entry.provider.resolveCustomEditorInlineDiff({ original: originalDocument, modified: modifiedDocument }, panel, cancellation);
	}

	async $resolveCustomEditorSideBySideDiff(
		originalResource: UriComponents,
		modifiedResource: UriComponents,
		webviewHandles: extHostProtocol.CustomEditorSideBySideDiffWebviewHandles,
		viewType: string,
		initData: extHostProtocol.CustomEditorSideBySideDiffInitData,
		position: EditorGroupColumn,
		cancellation: CancellationToken,
	): Promise<void> {
		const { entry, panel: originalPanel } = this.createCustomEditorDiffPanel(webviewHandles.original, viewType, initData.original, position);
		const { panel: modifiedPanel } = this.createCustomEditorDiffPanel(webviewHandles.modified, viewType, initData.modified, position);
		const revivedOriginalResource = URI.revive(originalResource);
		const revivedModifiedResource = URI.revive(modifiedResource);

		if (entry.type === CustomEditorType.Text) {
			if (!isCustomTextEditorProviderWithSideBySideDiffCapability(entry.provider)) {
				throw new Error(`Provider for '${viewType}' does not support side by side custom text editor diffs`);
			}

			const originalDocument = this._extHostDocuments.getDocument(revivedOriginalResource);
			const modifiedDocument = this._extHostDocuments.getDocument(revivedModifiedResource);
			return entry.provider.resolveCustomTextEditorSideBySideDiff({ original: originalDocument, modified: modifiedDocument }, { original: originalPanel, modified: modifiedPanel }, cancellation);
		}

		if (!isCustomEditorProviderWithSideBySideDiffCapability(entry.provider)) {
			throw new Error(`Provider for '${viewType}' does not support side by side custom editor diffs`);
		}

		const { document: originalDocument } = this.getCustomDocumentEntry(viewType, revivedOriginalResource);
		const { document: modifiedDocument } = this.getCustomDocumentEntry(viewType, revivedModifiedResource);
		return entry.provider.resolveCustomEditorSideBySideDiff({ original: originalDocument, modified: modifiedDocument }, { original: originalPanel, modified: modifiedPanel }, cancellation);
	}

	private createCustomEditorDiffPanel(
		handle: extHostProtocol.WebviewHandle,
		viewType: string,
		initData: extHostProtocol.CustomEditorDiffInitData,
		position: EditorGroupColumn,
	): { entry: ProviderEntry; panel: vscode.WebviewPanel } {
		const entry = this._editorProviders.get(viewType);
		if (!entry) {
			throw new Error(`No provider found for '${viewType}'`);
		}

		const viewColumn = typeConverters.ViewColumn.to(position);
		const webview = this._extHostWebview.createNewWebview(handle, initData.contentOptions, entry.extension);
		this._extHostWebview.ensureDefaultContentOptions(handle, initData.contentOptions, entry.extension);
		const panel = this._extHostWebviewPanels.createNewWebviewPanel(handle, viewType, initData.title, viewColumn, initData.options, webview, initData.active);
		return { entry, panel };
	}

	$disposeEdits(resourceComponents: UriComponents, viewType: string, editIds: number[]): void {
		const document = this.getCustomDocumentEntry(viewType, resourceComponents);
		document.disposeEdits(editIds);
	}

	async $onMoveCustomEditor(handle: string, newResourceComponents: UriComponents, viewType: string): Promise<void> {
		const entry = this._editorProviders.get(viewType);
		if (!entry) {
			throw new Error(`No provider found for '${viewType}'`);
		}

		if (!(entry.provider as vscode.CustomTextEditorProvider).moveCustomTextEditor) {
			throw new Error(`Provider does not implement move '${viewType}'`);
		}

		const webview = this._extHostWebviewPanels.getWebviewPanel(handle);
		if (!webview) {
			throw new Error(`No webview found`);
		}

		const resource = URI.revive(newResourceComponents);
		const document = this._extHostDocuments.getDocument(resource);
		await (entry.provider as vscode.CustomTextEditorProvider).moveCustomTextEditor!(document, webview, CancellationToken.None);
	}

	async $undo(resourceComponents: UriComponents, viewType: string, editId: number, isDirty: boolean): Promise<void> {
		const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
		return entry.undo(editId, isDirty);
	}

	async $redo(resourceComponents: UriComponents, viewType: string, editId: number, isDirty: boolean): Promise<void> {
		const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
		return entry.redo(editId, isDirty);
	}

	async $revert(resourceComponents: UriComponents, viewType: string, cancellation: CancellationToken): Promise<void> {
		const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
		const provider = this.getCustomEditorProvider(viewType);
		await provider.revertCustomDocument(entry.document, cancellation);
		entry.disposeBackup();
	}

	async $onSave(resourceComponents: UriComponents, viewType: string, cancellation: CancellationToken): Promise<void> {
		const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
		const provider = this.getCustomEditorProvider(viewType);
		await provider.saveCustomDocument(entry.document, cancellation);
		entry.disposeBackup();
	}

	async $onSaveAs(resourceComponents: UriComponents, viewType: string, targetResource: UriComponents, cancellation: CancellationToken): Promise<void> {
		const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
		const provider = this.getCustomEditorProvider(viewType);
		return provider.saveCustomDocumentAs(entry.document, URI.revive(targetResource), cancellation);
	}

	async $backup(resourceComponents: UriComponents, viewType: string, cancellation: CancellationToken): Promise<string> {
		const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
		const provider = this.getCustomEditorProvider(viewType);

		const backup = await provider.backupCustomDocument(entry.document, {
			destination: entry.getNewBackupUri(),
		}, cancellation);
		entry.updateBackup(backup);
		return backup.id;
	}

	private getCustomDocumentEntry(viewType: string, resource: UriComponents): CustomDocumentStoreEntry {
		const entry = this._documents.get(viewType, URI.revive(resource));
		if (!entry) {
			throw new Error('No custom document found');
		}
		return entry;
	}

	private getCustomEditorProvider(viewType: string): vscode.CustomEditorProvider {
		const entry = this._editorProviders.get(viewType);
		const provider = entry?.provider;
		if (!provider || !isCustomEditorProviderWithEditingCapability(provider)) {
			throw new Error('Custom document is not editable');
		}
		return provider;
	}
}

function isCustomEditorProviderWithEditingCapability(provider: vscode.CustomTextEditorProvider | vscode.CustomEditorProvider | vscode.CustomReadonlyEditorProvider): provider is vscode.CustomEditorProvider {
	return !!(provider as vscode.CustomEditorProvider).onDidChangeCustomDocument;
}

function isCustomTextEditorProvider(provider: vscode.CustomReadonlyEditorProvider<vscode.CustomDocument> | vscode.CustomTextEditorProvider): provider is vscode.CustomTextEditorProvider {
	return typeof (provider as vscode.CustomTextEditorProvider).resolveCustomTextEditor === 'function';
}

function isCustomTextEditorProviderWithInlineDiffCapability(provider: vscode.CustomTextEditorProvider): provider is vscode.CustomTextEditorProvider & Required<Pick<vscode.CustomTextEditorProvider, 'resolveCustomTextEditorInlineDiff'>> {
	return typeof provider.resolveCustomTextEditorInlineDiff === 'function';
}

function isCustomTextEditorProviderWithSideBySideDiffCapability(provider: vscode.CustomTextEditorProvider): provider is vscode.CustomTextEditorProvider & Required<Pick<vscode.CustomTextEditorProvider, 'resolveCustomTextEditorSideBySideDiff'>> {
	return typeof provider.resolveCustomTextEditorSideBySideDiff === 'function';
}

function isCustomEditorProviderWithInlineDiffCapability(provider: vscode.CustomReadonlyEditorProvider): provider is vscode.CustomReadonlyEditorProvider & Required<Pick<vscode.CustomReadonlyEditorProvider, 'resolveCustomEditorInlineDiff'>> {
	return typeof provider.resolveCustomEditorInlineDiff === 'function';
}

function isCustomEditorProviderWithSideBySideDiffCapability(provider: vscode.CustomReadonlyEditorProvider): provider is vscode.CustomReadonlyEditorProvider & Required<Pick<vscode.CustomReadonlyEditorProvider, 'resolveCustomEditorSideBySideDiff'>> {
	return typeof provider.resolveCustomEditorSideBySideDiff === 'function';
}

function isEditEvent(e: vscode.CustomDocumentContentChangeEvent | vscode.CustomDocumentEditEvent): e is vscode.CustomDocumentEditEvent {
	return typeof (e as vscode.CustomDocumentEditEvent).undo === 'function'
		&& typeof (e as vscode.CustomDocumentEditEvent).redo === 'function';
}

function hashPath(resource: URI): string {
	const str = resource.scheme === Schemas.file || resource.scheme === Schemas.untitled ? resource.fsPath : resource.toString();
	return hash(str) + '';
}
