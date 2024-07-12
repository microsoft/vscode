/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DataTransfers } from 'vs/base/browser/dnd';
import { mainWindow } from 'vs/base/browser/window';
import { DragMouseEvent } from 'vs/base/browser/mouseEvent';
import { coalesce } from 'vs/base/common/arrays';
import { DeferredPromise } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { ResourceMap } from 'vs/base/common/map';
import { parse } from 'vs/base/common/marshalling';
import { Schemas } from 'vs/base/common/network';
import { isWeb } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IBaseTextResourceEditorInput } from 'vs/platform/editor/common/editor';
import { HTMLFileSystemProvider } from 'vs/platform/files/browser/htmlFileSystemProvider';
import { WebFileSystemAccess } from 'vs/platform/files/browser/webFileSystemAccess';
import { ByteSize, IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { extractSelection } from 'vs/platform/opener/common/opener';
import { Registry } from 'vs/platform/registry/common/platform';

export interface FileAdditionalNativeProperties {
	/**
	 * The real path to the file on the users filesystem. Only available on electron.
	 */
	readonly path?: string;
}


//#region Editor / Resources DND

export const CodeDataTransfers = {
	EDITORS: 'CodeEditors',
	FILES: 'CodeFiles'
};

export interface IDraggedResourceEditorInput extends IBaseTextResourceEditorInput {
	resource: URI | undefined;

	/**
	 * A hint that the source of the dragged editor input
	 * might not be the application but some external tool.
	 */
	isExternal?: boolean;

	/**
	 * Whether we probe for the dropped editor to be a workspace
	 * (i.e. code-workspace file or even a folder), allowing to
	 * open it as workspace instead of opening as editor.
	 */
	allowWorkspaceOpen?: boolean;
}

export function extractEditorsDropData(e: DragEvent): Array<IDraggedResourceEditorInput> {
	const editors: IDraggedResourceEditorInput[] = [];
	if (e.dataTransfer && e.dataTransfer.types.length > 0) {

		// Data Transfer: Code Editors
		const rawEditorsData = e.dataTransfer.getData(CodeDataTransfers.EDITORS);
		if (rawEditorsData) {
			try {
				editors.push(...parse(rawEditorsData));
			} catch (error) {
				// Invalid transfer
			}
		}

		// Data Transfer: Resources
		else {
			try {
				const rawResourcesData = e.dataTransfer.getData(DataTransfers.RESOURCES);
				editors.push(...createDraggedEditorInputFromRawResourcesData(rawResourcesData));
			} catch (error) {
				// Invalid transfer
			}
		}

		// Check for native file transfer
		if (e.dataTransfer?.files) {
			for (let i = 0; i < e.dataTransfer.files.length; i++) {
				const file = e.dataTransfer.files[i];
				if (file && (file as FileAdditionalNativeProperties).path /* Electron only */) {
					try {
						editors.push({ resource: URI.file((file as FileAdditionalNativeProperties).path!), isExternal: true, allowWorkspaceOpen: true });
					} catch (error) {
						// Invalid URI
					}
				}
			}
		}

		// Check for CodeFiles transfer
		const rawCodeFiles = e.dataTransfer.getData(CodeDataTransfers.FILES);
		if (rawCodeFiles) {
			try {
				const codeFiles: string[] = JSON.parse(rawCodeFiles);
				for (const codeFile of codeFiles) {
					editors.push({ resource: URI.file(codeFile), isExternal: true, allowWorkspaceOpen: true });
				}
			} catch (error) {
				// Invalid transfer
			}
		}

		// Workbench contributions
		const contributions = Registry.as<IDragAndDropContributionRegistry>(Extensions.DragAndDropContribution).getAll();
		for (const contribution of contributions) {
			const data = e.dataTransfer.getData(contribution.dataFormatKey);
			if (data) {
				try {
					editors.push(...contribution.getEditorInputs(data));
				} catch (error) {
					// Invalid transfer
				}
			}
		}
	}

	// Prevent duplicates: it is possible that we end up with the same
	// dragged editor multiple times because multiple data transfers
	// are being used (https://github.com/microsoft/vscode/issues/128925)

	const coalescedEditors: IDraggedResourceEditorInput[] = [];
	const seen = new ResourceMap<boolean>();
	for (const editor of editors) {
		if (!editor.resource) {
			coalescedEditors.push(editor);
		} else if (!seen.has(editor.resource)) {
			coalescedEditors.push(editor);
			seen.set(editor.resource, true);
		}
	}

	return coalescedEditors;
}

export async function extractEditorsAndFilesDropData(accessor: ServicesAccessor, e: DragEvent): Promise<Array<IDraggedResourceEditorInput>> {
	const editors = extractEditorsDropData(e);

	// Web: Check for file transfer
	if (e.dataTransfer && isWeb && containsDragType(e, DataTransfers.FILES)) {
		const files = e.dataTransfer.items;
		if (files) {
			const instantiationService = accessor.get(IInstantiationService);
			const filesData = await instantiationService.invokeFunction(accessor => extractFilesDropData(accessor, e));
			for (const fileData of filesData) {
				editors.push({ resource: fileData.resource, contents: fileData.contents?.toString(), isExternal: true, allowWorkspaceOpen: fileData.isDirectory });
			}
		}
	}

	return editors;
}

export function createDraggedEditorInputFromRawResourcesData(rawResourcesData: string | undefined): IDraggedResourceEditorInput[] {
	const editors: IDraggedResourceEditorInput[] = [];

	if (rawResourcesData) {
		const resourcesRaw: string[] = JSON.parse(rawResourcesData);
		for (const resourceRaw of resourcesRaw) {
			if (resourceRaw.indexOf(':') > 0) { // mitigate https://github.com/microsoft/vscode/issues/124946
				const { selection, uri } = extractSelection(URI.parse(resourceRaw));
				editors.push({ resource: uri, options: { selection } });
			}
		}
	}

	return editors;
}


interface IFileTransferData {
	resource: URI;
	isDirectory?: boolean;
	contents?: VSBuffer;
}

async function extractFilesDropData(accessor: ServicesAccessor, event: DragEvent): Promise<IFileTransferData[]> {

	// Try to extract via `FileSystemHandle`
	if (WebFileSystemAccess.supported(mainWindow)) {
		const items = event.dataTransfer?.items;
		if (items) {
			return extractFileTransferData(accessor, items);
		}
	}

	// Try to extract via `FileList`
	const files = event.dataTransfer?.files;
	if (!files) {
		return [];
	}

	return extractFileListData(accessor, files);
}

async function extractFileTransferData(accessor: ServicesAccessor, items: DataTransferItemList): Promise<IFileTransferData[]> {
	const fileSystemProvider = accessor.get(IFileService).getProvider(Schemas.file);
	// eslint-disable-next-line no-restricted-syntax
	if (!(fileSystemProvider instanceof HTMLFileSystemProvider)) {
		return []; // only supported when running in web
	}

	const results: DeferredPromise<IFileTransferData | undefined>[] = [];

	for (let i = 0; i < items.length; i++) {
		const file = items[i];
		if (file) {
			const result = new DeferredPromise<IFileTransferData | undefined>();
			results.push(result);

			(async () => {
				try {
					const handle = await file.getAsFileSystemHandle();
					if (!handle) {
						result.complete(undefined);
						return;
					}

					if (WebFileSystemAccess.isFileSystemFileHandle(handle)) {
						result.complete({
							resource: await fileSystemProvider.registerFileHandle(handle),
							isDirectory: false
						});
					} else if (WebFileSystemAccess.isFileSystemDirectoryHandle(handle)) {
						result.complete({
							resource: await fileSystemProvider.registerDirectoryHandle(handle),
							isDirectory: true
						});
					} else {
						result.complete(undefined);
					}
				} catch (error) {
					result.complete(undefined);
				}
			})();
		}
	}

	return coalesce(await Promise.all(results.map(result => result.p)));
}

export async function extractFileListData(accessor: ServicesAccessor, files: FileList): Promise<IFileTransferData[]> {
	const dialogService = accessor.get(IDialogService);

	const results: DeferredPromise<IFileTransferData | undefined>[] = [];

	for (let i = 0; i < files.length; i++) {
		const file = files.item(i);
		if (file) {

			// Skip for very large files because this operation is unbuffered
			if (file.size > 100 * ByteSize.MB) {
				dialogService.warn(localize('fileTooLarge', "File is too large to open as untitled editor. Please upload it first into the file explorer and then try again."));
				continue;
			}

			const result = new DeferredPromise<IFileTransferData | undefined>();
			results.push(result);

			const reader = new FileReader();

			reader.onerror = () => result.complete(undefined);
			reader.onabort = () => result.complete(undefined);

			reader.onload = async event => {
				const name = file.name;
				const loadResult = event.target?.result ?? undefined;
				if (typeof name !== 'string' || typeof loadResult === 'undefined') {
					result.complete(undefined);
					return;
				}

				result.complete({
					resource: URI.from({ scheme: Schemas.untitled, path: name }),
					contents: typeof loadResult === 'string' ? VSBuffer.fromString(loadResult) : VSBuffer.wrap(new Uint8Array(loadResult))
				});
			};

			// Start reading
			reader.readAsArrayBuffer(file);
		}
	}

	return coalesce(await Promise.all(results.map(result => result.p)));
}

//#endregion

export function containsDragType(event: DragEvent, ...dragTypesToFind: string[]): boolean {
	if (!event.dataTransfer) {
		return false;
	}

	const dragTypes = event.dataTransfer.types;
	const lowercaseDragTypes: string[] = [];
	for (let i = 0; i < dragTypes.length; i++) {
		lowercaseDragTypes.push(dragTypes[i].toLowerCase()); // somehow the types are lowercase
	}

	for (const dragType of dragTypesToFind) {
		if (lowercaseDragTypes.indexOf(dragType.toLowerCase()) >= 0) {
			return true;
		}
	}

	return false;
}

//#region DND contributions

export interface IResourceStat {
	resource: URI;
	isDirectory?: boolean;
}

export interface IDragAndDropContributionRegistry {
	/**
	 * Registers a drag and drop contribution.
	 */
	register(contribution: IDragAndDropContribution): void;

	/**
	 * Returns all registered drag and drop contributions.
	 */
	getAll(): IterableIterator<IDragAndDropContribution>;
}

interface IDragAndDropContribution {
	readonly dataFormatKey: string;
	getEditorInputs(data: string): IDraggedResourceEditorInput[];
	setData(resources: IResourceStat[], event: DragMouseEvent | DragEvent): void;
}

class DragAndDropContributionRegistry implements IDragAndDropContributionRegistry {
	private readonly _contributions = new Map<string, IDragAndDropContribution>();

	register(contribution: IDragAndDropContribution): void {
		if (this._contributions.has(contribution.dataFormatKey)) {
			throw new Error(`A drag and drop contributiont with key '${contribution.dataFormatKey}' was already registered.`);
		}
		this._contributions.set(contribution.dataFormatKey, contribution);
	}

	getAll(): IterableIterator<IDragAndDropContribution> {
		return this._contributions.values();
	}
}

export const Extensions = {
	DragAndDropContribution: 'workbench.contributions.dragAndDrop'
};

Registry.add(Extensions.DragAndDropContribution, new DragAndDropContributionRegistry());

//#endregion

//#region DND Utilities

/**
 * A singleton to store transfer data during drag & drop operations that are only valid within the application.
 */
export class LocalSelectionTransfer<T> {

	private static readonly INSTANCE = new LocalSelectionTransfer();

	private data?: T[];
	private proto?: T;

	private constructor() {
		// protect against external instantiation
	}

	static getInstance<T>(): LocalSelectionTransfer<T> {
		return LocalSelectionTransfer.INSTANCE as LocalSelectionTransfer<T>;
	}

	hasData(proto: T): boolean {
		return proto && proto === this.proto;
	}

	clearData(proto: T): void {
		if (this.hasData(proto)) {
			this.proto = undefined;
			this.data = undefined;
		}
	}

	getData(proto: T): T[] | undefined {
		if (this.hasData(proto)) {
			return this.data;
		}

		return undefined;
	}

	setData(data: T[], proto: T): void {
		if (proto) {
			this.data = data;
			this.proto = proto;
		}
	}
}

//#endregion
