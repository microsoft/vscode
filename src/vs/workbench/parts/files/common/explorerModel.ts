/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import * as paths from 'vs/base/common/paths';
import * as resources from 'vs/base/common/resources';
import { ResourceMap } from 'vs/base/common/map';
import { isLinux } from 'vs/base/common/platform';
import { IFileStat } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { toResource, IEditorIdentifier, IEditorInput } from 'vs/workbench/common/editor';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { rtrim, startsWithIgnoreCase, startsWith, equalsIgnoreCase } from 'vs/base/common/strings';
import { IEditorGroup } from 'vs/workbench/services/group/common/editorGroupsService';
import { coalesce } from 'vs/base/common/arrays';

export class Model {

	private _roots: ExplorerItem[];
	private _listener: IDisposable;

	constructor(@IWorkspaceContextService private readonly contextService: IWorkspaceContextService) {
		const setRoots = () => this._roots = this.contextService.getWorkspace().folders
			.map(folder => new ExplorerItem(folder.uri, undefined, false, false, true, folder.name));
		this._listener = this.contextService.onDidChangeWorkspaceFolders(() => setRoots());
		setRoots();
	}

	public get roots(): ExplorerItem[] {
		return this._roots;
	}

	/**
	 * Returns an array of child stat from this stat that matches with the provided path.
	 * Starts matching from the first root.
	 * Will return empty array in case the FileStat does not exist.
	 */
	public findAll(resource: URI): ExplorerItem[] {
		return coalesce(this.roots.map(root => root.find(resource)));
	}

	/**
	 * Returns a FileStat that matches the passed resource.
	 * In case multiple FileStat are matching the resource (same folder opened multiple times) returns the FileStat that has the closest root.
	 * Will return null in case the FileStat does not exist.
	 */
	public findClosest(resource: URI): ExplorerItem | null {
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

export class ExplorerItem {
	public resource: URI;
	private _name: string;
	public mtime?: number;
	public etag?: string;
	private _isDirectory: boolean;
	private _isSymbolicLink: boolean;
	private _isReadonly: boolean;
	private children?: Map<string, ExplorerItem>;
	private _isError: boolean;
	public parent: ExplorerItem;

	public isDirectoryResolved: boolean;

	constructor(resource: URI, public root: ExplorerItem | undefined, isSymbolicLink?: boolean, isReadonly?: boolean, isDirectory?: boolean, name: string = resources.basenameOrAuthority(resource), mtime?: number, etag?: string, isError?: boolean) {
		this.resource = resource;
		this._name = name;
		this.isDirectory = !!isDirectory;
		this._isSymbolicLink = !!isSymbolicLink;
		this._isReadonly = !!isReadonly;
		this.etag = etag;
		this.mtime = mtime;
		this._isError = !!isError;

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

	public get isReadonly(): boolean {
		return this._isReadonly;
	}

	public get isError(): boolean {
		return this._isError;
	}

	public set isDirectory(value: boolean) {
		if (value !== this._isDirectory) {
			this._isDirectory = value;
			if (this._isDirectory) {
				this.children = new Map<string, ExplorerItem>();
			} else {
				this.children = undefined;
			}
		}

	}

	public get name(): string {
		return this._name;
	}

	private updateName(value: string): void {
		// Re-add to parent since the parent has a name map to children and the name might have changed
		if (this.parent) {
			this.parent.removeChild(this);
		}
		this._name = value;
		if (this.parent) {
			this.parent.addChild(this);
		}
	}

	public getId(): string {
		return this.resource.toString();
	}

	public get isRoot(): boolean {
		return this === this.root;
	}

	public static create(raw: IFileStat, root: ExplorerItem, resolveTo?: URI[], isError = false): ExplorerItem {
		const stat = new ExplorerItem(raw.resource, root, raw.isSymbolicLink, raw.isReadonly, raw.isDirectory, raw.name, raw.mtime, raw.etag, isError);

		// Recursively add children if present
		if (stat.isDirectory) {

			// isDirectoryResolved is a very important indicator in the stat model that tells if the folder was fully resolved
			// the folder is fully resolved if either it has a list of children or the client requested this by using the resolveTo
			// array of resource path to resolve.
			stat.isDirectoryResolved = !!raw.children || (!!resolveTo && resolveTo.some((r) => {
				return resources.isEqualOrParent(r, stat.resource);
			}));

			// Recurse into children
			if (raw.children) {
				for (let i = 0, len = raw.children.length; i < len; i++) {
					const child = ExplorerItem.create(raw.children[i], root, resolveTo);
					child.parent = stat;
					stat.addChild(child);
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
	public static mergeLocalWithDisk(disk: ExplorerItem, local: ExplorerItem): void {
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
		local.updateName(disk.name);
		local.isDirectory = disk.isDirectory;
		local.mtime = disk.mtime;
		local.isDirectoryResolved = disk.isDirectoryResolved;
		local._isSymbolicLink = disk.isSymbolicLink;
		local._isReadonly = disk.isReadonly;
		local._isError = disk.isError;

		// Merge Children if resolved
		if (mergingDirectories && disk.isDirectoryResolved) {

			// Map resource => stat
			const oldLocalChildren = new ResourceMap<ExplorerItem>();
			if (local.children) {
				local.children.forEach(child => {
					oldLocalChildren.set(child.resource, child);
				});
			}

			// Clear current children
			local.children = new Map<string, ExplorerItem>();

			// Merge received children
			if (disk.children) {
				disk.children.forEach(diskChild => {
					const formerLocalChild = oldLocalChildren.get(diskChild.resource);
					// Existing child: merge
					if (formerLocalChild) {
						ExplorerItem.mergeLocalWithDisk(diskChild, formerLocalChild);
						formerLocalChild.parent = local;
						local.addChild(formerLocalChild);
					}

					// New child: add
					else {
						diskChild.parent = local;
						local.addChild(diskChild);
					}
				});
			}
		}
	}

	/**
	 * Adds a child element to this folder.
	 */
	public addChild(child: ExplorerItem): void {
		if (!this.children) {
			this.isDirectory = true;
		}

		// Inherit some parent properties to child
		child.parent = this;
		child.updateResource(false);

		if (this.children) {
			this.children.set(this.getPlatformAwareName(child.name), child);
		}
	}

	public getChild(name: string): ExplorerItem | undefined {
		if (!this.children) {
			return undefined;
		}

		return this.children.get(this.getPlatformAwareName(name));
	}

	/**
	 * Only use this method if you need all the children since it converts a map to an array
	 */
	public getChildrenArray(): ExplorerItem[] | undefined {
		if (!this.children) {
			return undefined;
		}

		const items: ExplorerItem[] = [];
		this.children.forEach(child => {
			items.push(child);
		});

		return items;
	}

	public getChildrenCount(): number {
		if (!this.children) {
			return 0;
		}

		return this.children.size;
	}

	/**
	 * Removes a child element from this folder.
	 */
	public removeChild(child: ExplorerItem): void {
		if (this.children) {
			this.children.delete(this.getPlatformAwareName(child.name));
		}
	}

	private getPlatformAwareName(name: string): string {
		return (isLinux || !name) ? name : name.toLowerCase();
	}

	/**
	 * Moves this element under a new parent element.
	 */
	public move(newParent: ExplorerItem, fnBetweenStates?: (callback: () => void) => void, fnDone?: () => void): void {
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
		this.resource = resources.joinPath(this.parent.resource, this.name);

		if (recursive) {
			if (this.isDirectory && this.children) {
				this.children.forEach(child => {
					child.updateResource(true);
				});
			}
		}
	}

	/**
	 * Tells this stat that it was renamed. This requires changes to all children of this stat (if any)
	 * so that the path property can be updated properly.
	 */
	public rename(renamedStat: { name: string, mtime?: number }): void {

		// Merge a subset of Properties that can change on rename
		this.updateName(renamedStat.name);
		this.mtime = renamedStat.mtime;

		// Update Paths including children
		this.updateResource(true);
	}

	/**
	 * Returns a child stat from this stat that matches with the provided path.
	 * Will return "null" in case the child does not exist.
	 */
	public find(resource: URI): ExplorerItem | null {
		// Return if path found
		// For performance reasons try to do the comparison as fast as possible
		if (resource && this.resource.scheme === resource.scheme && equalsIgnoreCase(this.resource.authority, resource.authority) &&
			(resources.hasToIgnoreCase(resource) ? startsWithIgnoreCase(resource.path, this.resource.path) : startsWith(resource.path, this.resource.path))) {
			return this.findByPath(rtrim(resource.path, paths.sep), this.resource.path.length);
		}

		return null; //Unable to find
	}

	private findByPath(path: string, index: number): ExplorerItem | null {
		if (paths.isEqual(rtrim(this.resource.path, paths.sep), path, !isLinux)) {
			return this;
		}

		if (this.children) {
			// Ignore separtor to more easily deduct the next name to search
			while (index < path.length && path[index] === paths.sep) {
				index++;
			}

			let indexOfNextSep = path.indexOf(paths.sep, index);
			if (indexOfNextSep === -1) {
				// If there is no separator take the remainder of the path
				indexOfNextSep = path.length;
			}
			// The name to search is between two separators
			const name = path.substring(index, indexOfNextSep);

			const child = this.children.get(this.getPlatformAwareName(name));

			if (child) {
				// We found a child with the given name, search inside it
				return child.findByPath(path, indexOfNextSep);
			}
		}

		return null;
	}
}

/* A helper that can be used to show a placeholder when creating a new stat */
export class NewStatPlaceholder extends ExplorerItem {

	public static NAME = '';
	private static ID = 0;

	private id: number;
	private directoryPlaceholder: boolean;

	constructor(isDirectory: boolean, root: ExplorerItem | undefined) {
		super(URI.file(''), root, false, false, false, NewStatPlaceholder.NAME);

		this.id = NewStatPlaceholder.ID++;
		this.isDirectoryResolved = isDirectory;
		this.directoryPlaceholder = isDirectory;
	}

	public destroy(): void {
		this.parent.removeChild(this);

		this.isDirectoryResolved = false;
		this.isDirectory = false;
		this.mtime = undefined;
	}

	public getId(): string {
		return `new-stat-placeholder:${this.id}:${this.parent.resource.toString()}`;
	}

	public isDirectoryPlaceholder(): boolean {
		return this.directoryPlaceholder;
	}

	public addChild() {
		throw new Error('Can\'t perform operations in NewStatPlaceholder.');
	}

	public removeChild() {
		throw new Error('Can\'t perform operations in NewStatPlaceholder.');
	}

	public move() {
		throw new Error('Can\'t perform operations in NewStatPlaceholder.');
	}

	public rename() {
		throw new Error('Can\'t perform operations in NewStatPlaceholder.');
	}

	public find(resource: URI): ExplorerItem | null {
		return null;
	}

	public static addNewStatPlaceholder(parent: ExplorerItem, isDirectory: boolean): NewStatPlaceholder {
		const child = new NewStatPlaceholder(isDirectory, parent.root);

		// Inherit some parent properties to child
		child.parent = parent;
		parent.addChild(child);

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
		return this._group.getIndexOfEditor(this.editor);
	}

	public get group() {
		return this._group;
	}

	public get groupId() {
		return this._group.id;
	}

	public getId(): string {
		return `openeditor:${this.groupId}:${this.editorIndex}:${this.editor.getName()}:${this.editor.getDescription()}`;
	}

	public isPreview(): boolean {
		return this._group.previewEditor === this.editor;
	}

	public isUntitled(): boolean {
		return !!toResource(this.editor, { supportSideBySide: true, filter: Schemas.untitled });
	}

	public isDirty(): boolean {
		return this.editor.isDirty();
	}

	public getResource(): URI | null {
		return toResource(this.editor, { supportSideBySide: true });
	}
}
