/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Typings for the https://wicg.github.io/file-system-access
 *
 * Use `supported(window)` to find out if the browser supports this kind of API.
 */
export namespace WebFileSystemAccess {

	export function supported(obj: typeof globalThis): boolean {
		if (typeof (obj as typeof globalThis & { showDirectoryPicker?: unknown })?.showDirectoryPicker === 'function') {
			return true;
		}

		return false;
	}

	export function isFileSystemHandle(handle: unknown): handle is FileSystemHandle {
		const candidate = handle as FileSystemHandle | undefined;
		if (!candidate) {
			return false;
		}

		return typeof candidate.kind === 'string' && typeof candidate.queryPermission === 'function' && typeof candidate.requestPermission === 'function';
	}

	export function isFileSystemFileHandle(handle: FileSystemHandle): handle is FileSystemFileHandle {
		return handle.kind === 'file';
	}

	export function isFileSystemDirectoryHandle(handle: FileSystemHandle): handle is FileSystemDirectoryHandle {
		return handle.kind === 'directory';
	}
}

export namespace WebFileSystemObserver {

	export function supported(obj: typeof globalThis): boolean {
		return typeof (obj as typeof globalThis & { FileSystemObserver?: unknown })?.FileSystemObserver === 'function';
	}
}

export interface FileSystemObserver {
	new(callback: (records: FileSystemObserverRecord[], observer: FileSystemObserver) => void): FileSystemObserver;

	observe(handle: FileSystemHandle): Promise<void>;
	observe(handle: FileSystemDirectoryHandle, options?: { recursive: boolean }): Promise<void>;

	unobserve(handle: FileSystemHandle): void;
	disconnect(): void;
}

export interface FileSystemObserverRecord {

	/**
	 * The handle passed to the `FileSystemObserver.observe()` function
	 */
	readonly root: FileSystemHandle;

	/**
	 * The handle affected by the file system change
	 */
	readonly changedHandle: FileSystemHandle;

	/**
	 * The path of the `changedHandle` relative to the `root`
	 */
	readonly relativePathComponents: string[];

	/**
	 * "appeared": The file or directory was created or got moved into the root.
	 * "disappeared": The file or directory was deleted or got moved out of the root.
	 * "modified": The file or directory was modified.
	 * "moved": The file or directory was moved within the root.
	 * "unknown": This indicates that zero or more events were missed. Developers should poll the watched directory in response to this.
	 * "errored": The observation is no longer valid. In this case, you may want to stop observing the file system.
	 */
	readonly type: 'appeared' | 'disappeared' | 'modified' | 'moved' | 'unknown' | 'errored';

	/**
	 * The former location of a moved handle. Available only when the type is "moved".
	 */
	readonly relativePathMovedFrom?: string[];
}

export declare class FileSystemObserver {

	constructor(callback: (records: FileSystemObserverRecord[], observer: FileSystemObserver) => void);

	observe(handle: FileSystemHandle, options?: { recursive: boolean }): Promise<void>;
}
