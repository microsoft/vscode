/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import assert = require('vs/base/common/assert');
import URI from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import { IFileStat, isEqual, isParent } from 'vs/platform/files/common/files';
import { UntitledEditorInput } from 'vs/workbench/common/editor/untitledEditorInput';
import { IEditorInput } from 'vs/platform/editor/common/editor';
import { IEditorGroup, toResource } from 'vs/workbench/common/editor';

export enum StatType {
	FILE,
	FOLDER,
	ANY
}

export class FileStat implements IFileStat {
	public resource: URI;
	public name: string;
	public mtime: number;
	public etag: string;
	public isDirectory: boolean;
	public hasChildren: boolean;
	public children: FileStat[];
	public parent: FileStat;

	public isDirectoryResolved: boolean;

	constructor(resource: URI, isDirectory?: boolean, hasChildren?: boolean, name: string = paths.basename(resource.fsPath), mtime?: number, etag?: string) {
		this.resource = resource;
		this.name = name;
		this.isDirectory = !!isDirectory;
		this.hasChildren = isDirectory && hasChildren;
		this.etag = etag;
		this.mtime = mtime;

		// Prepare child stat array
		if (this.isDirectory) {
			this.children = [];
		}

		this.isDirectoryResolved = false;
	}

	public getId(): string {
		return this.resource.toString();
	}

	public static create(raw: IFileStat, resolveTo?: URI[]): FileStat {
		const stat = new FileStat(raw.resource, raw.isDirectory, raw.hasChildren, raw.name, raw.mtime, raw.etag);

		// Recursively add children if present
		if (stat.isDirectory) {

			// isDirectoryResolved is a very important indicator in the stat model that tells if the folder was fully resolved
			// the folder is fully resolved if either it has a list of children or the client requested this by using the resolveTo
			// array of resource path to resolve.
			stat.isDirectoryResolved = !!raw.children || (!!resolveTo && resolveTo.some((r) => {
				return paths.isEqualOrParent(r.fsPath, stat.resource.fsPath);
			}));

			// Recurse into children
			if (raw.children) {
				for (let i = 0, len = raw.children.length; i < len; i++) {
					const child = FileStat.create(raw.children[i], resolveTo);
					child.parent = stat;
					stat.children.push(child);
					stat.hasChildren = stat.children.length > 0;
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
		assert.ok(disk.resource.toString() === local.resource.toString(), 'Merging only supported for stats with the same resource');

		// Stop merging when a folder is not resolved to avoid loosing local data
		const mergingDirectories = disk.isDirectory || local.isDirectory;
		if (mergingDirectories && local.isDirectoryResolved && !disk.isDirectoryResolved) {
			return;
		}

		// Properties
		local.resource = disk.resource;
		local.name = disk.name;
		local.isDirectory = disk.isDirectory;
		local.hasChildren = disk.isDirectory && disk.hasChildren;
		local.mtime = disk.mtime;
		local.isDirectoryResolved = disk.isDirectoryResolved;

		// Merge Children if resolved
		if (mergingDirectories && disk.isDirectoryResolved) {

			// Map resource => stat
			const oldLocalChildren: { [resource: string]: FileStat; } = Object.create(null);
			local.children.forEach((localChild: FileStat) => {
				oldLocalChildren[localChild.resource.toString()] = localChild;
			});

			// Clear current children
			local.children = [];

			// Merge received children
			disk.children.forEach((diskChild: FileStat) => {
				const formerLocalChild = oldLocalChildren[diskChild.resource.toString()];

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
		this.hasChildren = this.children.length > 0;
	}

	/**
	 * Returns true if this stat is a directory that contains a child with the given name.
	 *
	 * @param ignoreCase if true, will check for the name ignoring case.
	 * @param type the type of stat to check for.
	 */
	public hasChild(name: string, ignoreCase?: boolean, type: StatType = StatType.ANY): boolean {
		for (let i = 0; i < this.children.length; i++) {
			const child = this.children[i];
			if ((type === StatType.FILE && child.isDirectory) || (type === StatType.FOLDER && !child.isDirectory)) {
				continue;
			}

			// Check for Identity
			if (child.name === name) {
				return true;
			}

			// Also consider comparing without case
			if (ignoreCase && child.name.toLowerCase() === name.toLowerCase()) {
				return true;
			}
		}

		return false;
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

		this.hasChildren = this.children.length > 0;
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
		this.resource = URI.file(paths.join(this.parent.resource.fsPath, this.name));

		if (recursive) {
			if (this.isDirectory && this.hasChildren && this.children) {
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
		if (isEqual(resource.toString(), this.resource.toString())) {
			return this;
		}

		// Return if not having any children
		if (!this.hasChildren) {
			return null;
		}

		for (let i = 0; i < this.children.length; i++) {
			const child = this.children[i];

			if (isEqual(resource.toString(), child.resource.toString())) {
				return child;
			}

			if (child.isDirectory && isParent(resource.fsPath, child.resource.fsPath)) {
				return child.find(resource);
			}
		}

		return null; //Unable to find
	}
}

/* A helper that can be used to show a placeholder when creating a new stat */
export class NewStatPlaceholder extends FileStat {

	private static ID = 0;

	private id: number;
	private directoryPlaceholder: boolean;

	constructor(isDirectory: boolean) {
		super(URI.file(''));

		this.id = NewStatPlaceholder.ID++;
		this.isDirectoryResolved = isDirectory;
		this.directoryPlaceholder = isDirectory;
	}

	public destroy(): void {
		this.parent.removeChild(this);

		this.isDirectoryResolved = void 0;
		this.name = void 0;
		this.isDirectory = void 0;
		this.hasChildren = void 0;
		this.mtime = void 0;
	}

	public getId(): string {
		return 'new-stat-placeholder:' + this.id + ':' + this.parent.resource.toString();
	}

	public isDirectoryPlaceholder(): boolean {
		return this.directoryPlaceholder;
	}

	public addChild(child: NewStatPlaceholder): void {
		throw new Error('Can\'t perform operations in NewStatPlaceholder.');
	}

	public hasChild(name: string, ignoreCase?: boolean): boolean {
		return false;
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
		const child = new NewStatPlaceholder(isDirectory);

		// Inherit some parent properties to child
		child.parent = parent;
		parent.children.push(child);

		parent.hasChildren = parent.children.length > 0;

		return child;
	}
}

export class OpenEditor {

	constructor(private editor: IEditorInput, private group: IEditorGroup) {
		// noop
	}

	public get editorInput() {
		return this.editor;
	}

	public get editorGroup() {
		return this.group;
	}

	public getId(): string {
		return `openeditor:${this.group.id}:${this.group.indexOf(this.editor)}:${this.editor.getName()}:${this.editor.getDescription()}`;
	}

	public isPreview(): boolean {
		return this.group.isPreview(this.editor);
	}

	public isUntitled(): boolean {
		return this.editor instanceof UntitledEditorInput;
	}

	public isDirty(): boolean {
		return this.editor.isDirty();
	}

	public getResource(): URI {
		return toResource(this.editor, { supportSideBySide: true, filter: ['file', 'untitled'] });
	}
}