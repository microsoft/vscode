/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { createFileSystemProviderError, FileChangeType, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileChange, IFileSystemProviderWithFileReadWriteCapability, IStat } from '../../../../platform/files/common/files.js';

export const LAYOUT_SETTINGS_SCHEME = 'vscode-layout-settings';

const SETTINGS_FILE_SUFFIX = '/settings.json';

/**
 * Returns the settings file of the named layout with the given identifier.
 */
export function getLayoutSettingsResource(layoutId: string): URI {
	return URI.from({ scheme: LAYOUT_SETTINGS_SCHEME, path: `/${layoutId}${SETTINGS_FILE_SUFFIX}` });
}

function toLayoutId(resource: URI): string | undefined {
	const { path } = resource;
	return path.length > SETTINGS_FILE_SUFFIX.length + 1 && path.startsWith('/') && path.endsWith(SETTINGS_FILE_SUFFIX)
		? path.slice(1, -SETTINGS_FILE_SUFFIX.length)
		: undefined;
}

/**
 * Stores the settings of named layouts.
 */
export interface ILayoutSettingsStore {

	/**
	 * Returns the content of the settings of the given named layout, `undefined` if the layout does not exist.
	 */
	getSettings(layoutId: string): string | undefined;

	/**
	 * Changes the content of the settings of the given named layout. Throws a file system provider
	 * error if the layout does not exist or its settings cannot be changed.
	 */
	setSettings(layoutId: string, content: string): void;
}

interface ITrackedSettingsFile {
	readonly content: string | undefined;
	readonly ctime: number;
	readonly mtime: number;
}

/**
 * Shows the settings of named layouts, which are stored with the layouts, as files, so that the
 * configuration service and editors read and change them like other settings files. The
 * settings of a named layout are the file `/<layout id>/settings.json`, other paths are folders.
 */
export class LayoutSettingsFileSystemProvider extends Disposable implements IFileSystemProviderWithFileReadWriteCapability {

	readonly capabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive;
	readonly onDidChangeCapabilities = Event.None;

	private readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile = this._onDidChangeFile.event;

	/**
	 * The settings files that were read or watched, to notify about their changes.
	 */
	private readonly files = new Map<string, ITrackedSettingsFile>();

	constructor(private readonly store: ILayoutSettingsStore) {
		super();
	}

	/**
	 * Notifies about the changes of the settings files that were read or watched. Must be
	 * called whenever the settings of named layouts may have changed.
	 */
	refresh(): void {
		const changes: IFileChange[] = [];
		for (const [layoutId, file] of this.files) {
			const content = this.store.getSettings(layoutId);
			if (content !== file.content) {
				const type = file.content === undefined ? FileChangeType.ADDED : content === undefined ? FileChangeType.DELETED : FileChangeType.UPDATED;
				changes.push({ resource: getLayoutSettingsResource(layoutId), type });
				// Every change gets another modification time, so that editors detect conflicting changes
				this.files.set(layoutId, { content, ctime: file.ctime, mtime: Math.max(Date.now(), file.mtime + 1) });
			}
		}

		if (changes.length) {
			this._onDidChangeFile.fire(changes);
		}
	}

	watch(resource: URI): IDisposable {
		const layoutId = toLayoutId(resource);
		if (layoutId !== undefined) {
			this.track(layoutId);
		}
		return Disposable.None;
	}

	async stat(resource: URI): Promise<IStat> {
		const layoutId = toLayoutId(resource);
		if (layoutId === undefined) {
			return { type: FileType.Directory, ctime: 0, mtime: 0, size: 0 };
		}

		const { content, ctime, mtime } = this.getFile(layoutId);
		return { type: FileType.File, ctime, mtime, size: VSBuffer.fromString(content).byteLength };
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		const layoutId = toLayoutId(resource);
		if (layoutId === undefined) {
			throw createFileSystemProviderError(localize('layoutSettingsFolder', "The resource is a folder."), FileSystemProviderErrorCode.FileIsADirectory);
		}

		return VSBuffer.fromString(this.getFile(layoutId).content).buffer;
	}

	async writeFile(resource: URI, content: Uint8Array): Promise<void> {
		const layoutId = toLayoutId(resource);
		if (layoutId === undefined) {
			throw createFileSystemProviderError(localize('layoutSettingsFolder', "The resource is a folder."), FileSystemProviderErrorCode.FileIsADirectory);
		}

		this.track(layoutId);
		this.store.setSettings(layoutId, VSBuffer.wrap(content).toString());
	}

	async mkdir(): Promise<void> {
		// Folders exist implicitly
	}

	async readdir(): Promise<[string, FileType][]> {
		return [];
	}

	async delete(): Promise<void> {
		throw createFileSystemProviderError(localize('layoutSettingsDelete', "The settings of a layout are deleted with the layout."), FileSystemProviderErrorCode.NoPermissions);
	}

	async rename(): Promise<void> {
		throw createFileSystemProviderError(localize('layoutSettingsRename', "The settings of a layout cannot be moved."), FileSystemProviderErrorCode.NoPermissions);
	}

	private getFile(layoutId: string): ITrackedSettingsFile & { readonly content: string } {
		// Brings the file up to date if the settings changed without notification
		if (this.track(layoutId).content !== this.store.getSettings(layoutId)) {
			this.refresh();
		}

		const { content, ctime, mtime } = this.track(layoutId);
		if (content === undefined) {
			throw createFileSystemProviderError(localize('layoutSettingsNotFound', "The layout does not exist."), FileSystemProviderErrorCode.FileNotFound);
		}
		return { content, ctime, mtime };
	}

	private track(layoutId: string): ITrackedSettingsFile {
		let file = this.files.get(layoutId);
		if (!file) {
			const now = Date.now();
			file = { content: this.store.getSettings(layoutId), ctime: now, mtime: now };
			this.files.set(layoutId, file);
		}
		return file;
	}
}
