/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import * as paths from 'vs/base/common/paths';
import * as resources from 'vs/base/common/resources';
import { ResourceMap } from 'vs/base/common/map';
import { isLinux } from 'vs/base/common/platform';
import { IFileStat } from 'vs/platform/files/common/files';
import { IEditorInput } from 'vs/platform/editor/common/editor';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IEditorGroup, toResource, IEditorIdentifier } from 'vs/workbench/common/editor';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { getPathLabel } from 'vs/base/common/labels';
import { Schemas } from 'vs/base/common/network';
import { compareIgnoreCase, compare, startsWith } from 'vs/base/common/strings';
import { binarySearch } from 'vs/base/common/arrays';

export class Model {

	private _roots: FileStat[];
	private _listener: IDisposable;

	constructor(@IWorkspaceContextService private contextService: IWorkspaceContextService) {
		const setRoots = () => this._roots = this.contextService.getWorkspace().folders.map(folder => {
			const root = new FileStat(folder.uri, undefined);
			root.name = folder.name;

			return root;
		});
		this._listener = this.contextService.onDidChangeWorkspaceFolders(() => setRoots());
		setRoots();
	}

	public get roots(): FileStat[] {
		return this._roots;
	}

	/**
	 * Returns an array of child stat from this stat that matches with the provided path.
	 * Starts matching from the first root.
	 * Will return empty array in case the FileStat does not exist.
	 */
	public findAll(resource: URI): FileStat[] {
		return this.roots.map(root => root.find(resource)).filter(stat => !!stat);
	}

	/**
	 * Returns a FileStat that matches the passed resource.
	 * In case multiple FileStat are matching the resource (same folder opened multiple times) returns the FileStat that has the closest root.
	 * Will return null in case the FileStat does not exist.
	 */
	public findClosest(resource: URI): FileStat {
		const folder = this.contextService.getWorkspaceFolder(resource);
		if (folder) {
			const root = this.roots.filter(r => r.resource.toString() === folder.uri.toString()).pop();
			if (root) {
				return root.find(resource);
			}
		}

		return null;
	}

	public dispose(): void {
		this._listener = dispose(this._listener);
	}
}

export class FileStat implements IFileStat {
	public resource: URI;
	public name: string;
	public mtime: number;
	public etag: string;
	private _isDirectory: boolean;
	private _isSymbolicLink: boolean;
	public children: FileStat[];
	public parent: FileStat;

	public isDirectoryResolved: boolean;

	constructor(resource: URI, public root: FileStat, isSymbolicLink?: boolean, isDirectory?: boolean, name: string = getPathLabel(resource), mtime?: number, etag?: string) {
		this.resource = resource;
		this.name = name;
		this.isDirectory = !!isDirectory;
		this._isSymbolicLink = !!isSymbolicLink;
		this.etag = etag;
		this.mtime = mtime;

		if (!this.root) {
			this.root = this;
		}

		this.isDirectoryResolved = false;
	}

	public get isSymbolicLink(): boolean {
		return this._isSymbolicLink;
	}

	public get isDirectory(): boolean {
		return this._isDirectory;
	}

	public set isDirectory(value: boolean) {
		if (value !== this._isDirectory) {
			this._isDirectory = value;
			if (this._isDirectory) {
				this.children = [];
			} else {
				this.children = undefined;
			}
		}

	}

	public get nonexistentRoot(): boolean {
		return this.isRoot && !this.isDirectoryResolved && this.isDirectory;
	}

	public getId(): string {
		return this.resource.toString();
	}

	public get isRoot(): boolean {
		return this.resource.toString() === this.root.resource.toString();
	}

	public static create(raw: IFileStat, root: FileStat, resolveTo?: URI[]): FileStat {
		const stat = new FileStat(raw.resource, root, raw.isSymbolicLink, raw.isDirectory, raw.name, raw.mtime, raw.etag);

		// Recursively add children if present
		if (stat.isDirectory) {

			// isDirectoryResolved is a very important indicator in the stat model that tells if the folder was fully resolved
			// the folder is fully resolved if either it has a list of children or the client requested this by using the resolveTo
			// array of resource path to resolve.
			stat.isDirectoryResolved = !!raw.children || (!!resolveTo && resolveTo.some((r) => {
				return resources.isEqualOrParent(r, stat.resource, !isLinux /* ignorecase */);
			}));

			// Recurse into children
			if (raw.children) {
				for (let i = 0, len = raw.children.length; i < len; i++) {
					const child = FileStat.create(raw.children[i], root, resolveTo);
					child.parent = stat;
					stat.children.push(child);
				}
			}
		}

		return stat;
	}

	/**
	 * Merges the stat which was resolved from the disk with the local stat by copying over properties
	 * and children. The merge will only consider resolved stat elements to avoid overwriting data which
	 * exists locally.
	 */
	public static mergeLocalWithDisk(disk: FileStat, local: FileStat): void {
		if (disk.resource.toString() !== local.resource.toString()) {
			return; // Merging only supported for stats with the same resource
		}

		// Stop merging when a folder is not resolved to avoid loosing local data
		const mergingDirectories = disk.isDirectory || local.isDirectory;
		if (mergingDirectories && local.isDirectoryResolved && !disk.isDirectoryResolved) {
			return;
		}

		// Properties
		local.resource = disk.resource;
		local.name = disk.name;
		local.isDirectory = disk.isDirectory;
		local.mtime = disk.mtime;
		local.isDirectoryResolved = disk.isDirectoryResolved;

		// Merge Children if resolved
		if (mergingDirectories && disk.isDirectoryResolved) {

			// Map resource => stat
			const oldLocalChildren = new ResourceMap<FileStat>();
			if (local.children) {
				local.children.forEach((localChild: FileStat) => {
					oldLocalChildren.set(localChild.resource, localChild);
				});
			}

			// Clear current children
			local.children = [];

			// Merge received children
			disk.children.forEach((diskChild: FileStat) => {
				const formerLocalChild = oldLocalChildren.get(diskChild.resource);

				// Existing child: merge
				if (formerLocalChild) {
					FileStat.mergeLocalWithDisk(diskChild, formerLocalChild);
					formerLocalChild.parent = local;
					local.children.push(formerLocalChild);
				}

				// New child: add
				else {
					diskChild.parent = local;
					local.children.push(diskChild);
				}
			});
		}
	}

	/**
	 * Adds a child element to this folder.
	 */
	public addChild(child: FileStat): void {

		// Inherit some parent properties to child
		child.parent = this;
		child.updateResource(false);

		this.children.push(child);
	}

	/**
	 * Removes a child element from this folder.
	 */
	public removeChild(child: FileStat): void {
		for (let i = 0; i < this.children.length; i++) {
			if (this.children[i].resource.toString() === child.resource.toString()) {
				this.children.splice(i, 1);
				break;
			}
		}
	}

	/**
	 * Moves this element under a new parent element.
	 */
	public move(newParent: FileStat, fnBetweenStates?: (callback: () => void) => void, fnDone?: () => void): void {
		if (!fnBetweenStates) {
			fnBetweenStates = (cb: () => void) => { cb(); };
		}

		this.parent.removeChild(this);

		fnBetweenStates(() => {
			newParent.removeChild(this); // make sure to remove any previous version of the file if any
			newParent.addChild(this);
			this.updateResource(true);
			if (fnDone) {
				fnDone();
			}
		});
	}

	private updateResource(recursive: boolean): void {
		this.resource = this.parent.resource.with({ path: paths.join(this.parent.resource.path, this.name) });

		if (recursive) {
			if (this.isDirectory && this.children) {
				this.children.forEach((child: FileStat) => {
					child.updateResource(true);
				});
			}
		}
	}

	/**
	 * Tells this stat that it was renamed. This requires changes to all children of this stat (if any)
	 * so that the path property can be updated properly.
	 */
	public rename(renamedStat: IFileStat): void {

		// Merge a subset of Properties that can change on rename
		this.name = renamedStat.name;
		this.mtime = renamedStat.mtime;

		// Update Paths including children
		this.updateResource(true);
	}

	/**
	 * Returns a child stat from this stat that matches with the provided path.
	 * Will return "null" in case the child does not exist.
	 */
	public find(resource: URI): FileStat {
		// Return if path found
		if (resource && this.resource.scheme === resource.scheme && this.resource.authority === resource.authority &&
			startsWith(resource.path, this.resource.path)
		) {
			return this.findByPath(resource.path, this.resource.path.length);
		}

		return null; //Unable to find
	}

	public findByPath(path: string, index: number): FileStat {
		if (paths.isEqual(this.resource.path, path, !isLinux)) {
			return this;
		}

		if (this.children) {
			while (index < path.length && path[index] === paths.sep) {
				index++;
			}

			let indexOfNextSep = path.indexOf(paths.sep, index);
			if (indexOfNextSep === -1) {
				indexOfNextSep = path.length - 1;
			}

			const name = path.substring(index, indexOfNextSep);
			const found = binarySearch(this.children.map(c => c.name), name, (first, second) => isLinux ? compare(first, second) : compareIgnoreCase(first, second));

			if (found >= 0 && found < this.children.length) {
				return this.children[found].findByPath(path, indexOfNextSep);
			}
		}

		return null;
	}
}

/* A helper that can be used to show a placeholder when creating a new stat */
export class NewStatPlaceholder extends FileStat {

	private static ID = 0;

	private id: number;
	private directoryPlaceholder: boolean;

	constructor(isDirectory: boolean, root: FileStat) {
		super(URI.file(''), root, false, false, '');

		this.id = NewStatPlaceholder.ID++;
		this.isDirectoryResolved = isDirectory;
		this.directoryPlaceholder = isDirectory;
	}

	public destroy(): void {
		this.parent.removeChild(this);

		this.isDirectoryResolved = void 0;
		this.name = void 0;
		this.isDirectory = void 0;
		this.mtime = void 0;
	}

	public getId(): string {
		return `new-stat-placeholder:${this.id}:${this.parent.resource.toString()}`;
	}

	public isDirectoryPlaceholder(): boolean {
		return this.directoryPlaceholder;
	}

	public addChild(child: NewStatPlaceholder): void {
		throw new Error('Can\'t perform operations in NewStatPlaceholder.');
	}

	public removeChild(child: NewStatPlaceholder): void {
		throw new Error('Can\'t perform operations in NewStatPlaceholder.');
	}

	public move(newParent: NewStatPlaceholder): void {
		throw new Error('Can\'t perform operations in NewStatPlaceholder.');
	}

	public rename(renamedStat: NewStatPlaceholder): void {
		throw new Error('Can\'t perform operations in NewStatPlaceholder.');
	}

	public find(resource: URI): NewStatPlaceholder {
		return null;
	}

	public static addNewStatPlaceholder(parent: FileStat, isDirectory: boolean): NewStatPlaceholder {
		const child = new NewStatPlaceholder(isDirectory, parent.root);

		// Inherit some parent properties to child
		child.parent = parent;
		parent.children.push(child);

		return child;
	}
}

export class OpenEditor implements IEditorIdentifier {

	constructor(private _editor: IEditorInput, private _group: IEditorGroup) {
		// noop
	}

	public get editor() {
		return this._editor;
	}

	public get editorIndex() {
		return this._group.indexOf(this.editor);
	}

	public get group() {
		return this._group;
	}

	public getId(): string {
		return `openeditor:${this.group.id}:${this.group.indexOf(this.editor)}:${this.editor.getName()}:${this.editor.getDescription()}`;
	}

	public isPreview(): boolean {
		return this.group.isPreview(this.editor);
	}

	public isUntitled(): boolean {
		return !!toResource(this.editor, { supportSideBySide: true, filter: Schemas.untitled });
	}

	public isDirty(): boolean {
		return this.editor.isDirty();
	}

	public getResource(): URI {
		return toResource(this.editor, { supportSideBySide: true });
	}
}
