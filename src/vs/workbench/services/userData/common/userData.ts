/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { TernarySearchTree } from 'vs/base/common/map';
import { Registry } from 'vs/platform/registry/common/platform';
import { FileChangeType } from 'vs/platform/files/common/files';

/**
 * The event user data providers must use to signal a file change.
 */
export interface FileChangeEvent {

	/**
	 * The type of change.
	 */
	readonly type: FileChangeType;

	/**
	 * The path of the file that has changed.
	 */
	readonly path: string;
}

/**
 * The userDataProvider is used to handle user specific application
 * state like settings, keybindings, UI state (e.g. opened editors) and snippets.
 *
 * The API reflects a simple file system provider that comes with the notion of paths
 * (UNIX slash separated) as well as files. Folders are not a top level concept (e.g. we
 * do not require to create or delete them), however, files can be grouped beneath one path
 * and also listed from that path.
 *
 * Example:
 * ```ts
 * await writeFile('snippets/global/markdown.json', <some data>);
 * await writeFile('snippets/global/html.json', <some data>);
 * await writeFile('snippets/global/javascript.json', <some data>);
 *
 * const files = await listFiles('snippets/global');
 * console.log(files); // -> ['snippets/global/markdown.json', 'snippets/global/html.json', 'snippets/global/javascript.json']
 * ```
 */
export interface IUserDataProvider {

	/**
	 * An event to signal that a file has been created, changed, or deleted.
	 */
	readonly onDidChangeFile: Event<FileChangeEvent[]>;

	/**
	 * Read the file contents of the given path.
	 *
	 * Throw an error if the path does not exist.
	 */
	readFile(path: string): Promise<Uint8Array>;

	/**
	 * Writes the provided content to the file path overwriting any existing content on that path.
	 *
	 * If the path does not exist, it will be created.
	 *
	 * Throw an error if the path is a parent to existing files.
	 */
	writeFile(path: string, content: Uint8Array): Promise<void>;

	/**
	 * Delete the file at the given path.
	 *
	 * Does NOT throw an error when the path does not exist.
	 */
	deleteFile(path: string): Promise<void>;

	/**
	 * Returns an array of files at the given path.
	 *
	 * Throw an error if the path does not exist or points to a file.
	 */
	listFiles(path: string): Promise<string[]>;
}

export interface IUserDataContainerRegistry {

	/**
	 * An event to signal that a container has been registered.
	 */
	readonly onDidRegisterContainer: Event<string>;

	/**
	 * Registered containers
	 */
	readonly containers: string[];

	/**
	 * Register the given path as an user data container if user data files are stored under this path.
	 *
	 * It is required to register the container to access the user data files under the container.
	 */
	registerContainer(path: string): void;

	/**
	 *	Returns true if the given path is an user data container or sub container of user data container
	 */
	isContainer(path: string): boolean;
}

class UserDataContainerRegistry implements IUserDataContainerRegistry {

	private _containers: TernarySearchTree<string> = TernarySearchTree.forStrings();

	private _onDidRegisterContainer: Emitter<string> = new Emitter<string>();
	readonly onDidRegisterContainer: Event<string> = this._onDidRegisterContainer.event;

	get containers(): string[] {
		const containers: string[] = [];
		this._containers.forEach(c => containers.push(c));
		return containers;
	}

	public registerContainer(path: string): void {
		if (!this._containers.get(path)) {
			this._containers.set(path, path);
			this._onDidRegisterContainer.fire(path);
		}
	}

	isContainer(path: string): boolean {
		return !!this._containers.get(path) || !!this._containers.findSuperstr(path);
	}
}

export const Extensions = {
	UserDataContainers: 'workbench.contributions.userDataContainers'
};

Registry.add(Extensions.UserDataContainers, new UserDataContainerRegistry());