/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('vs/base/common/assert');
import types = require('vs/base/common/types');
import URI from 'vs/base/common/uri';
import {isLinux} from 'vs/base/common/platform';
import paths = require('vs/base/common/paths');
import {guessMimeTypes} from 'vs/base/common/mime';
import {IFileStat} from 'vs/platform/files/common/files';

'use strict';

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
	public mime: string;
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
		this.mime = !isDirectory ? guessMimeTypes(this.resource.fsPath).join(', ') : void (0);
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
		let stat = new FileStat(raw.resource, raw.isDirectory, raw.hasChildren, raw.name, raw.mtime, raw.etag);

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
					let child = FileStat.create(raw.children[i], resolveTo);
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
		let mergingDirectories = disk.isDirectory || local.isDirectory;
		if (mergingDirectories && local.isDirectoryResolved && !disk.isDirectoryResolved) {
			return;
		}

		// Properties
		local.resource = disk.resource;
		local.name = disk.name;
		local.isDirectory = disk.isDirectory;
		local.hasChildren = disk.isDirectory && disk.hasChildren;
		local.mtime = disk.mtime;
		local.mime = disk.mime;
		local.isDirectoryResolved = disk.isDirectoryResolved;

		// Merge Children if resolved
		if (mergingDirectories && disk.isDirectoryResolved) {

			// Map resource => stat
			let oldLocalChildren: { [resource: string]: FileStat; } = Object.create(null);
			local.children.forEach((localChild: FileStat) => {
				oldLocalChildren[localChild.resource.toString()] = localChild;
			});

			// Clear current children
			local.children = [];

			// Merge received children
			disk.children.forEach((diskChild: FileStat) => {
				let formerLocalChild = oldLocalChildren[diskChild.resource.toString()];

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
	 * Returns a deep copy of this model object.
	 */
	public clone(): FileStat {
		let stat = new FileStat(URI.parse(this.resource.toString()), this.isDirectory, this.hasChildren, this.name, this.mtime, this.etag);
		stat.isDirectoryResolved = this.isDirectoryResolved;

		if (this.parent) {
			stat.parent = this.parent;
		}

		if (this.isDirectory) {
			this.children.forEach((child: FileStat) => {
				stat.addChild(child.clone());
			});
		}

		return stat;
	}

	/**
	 * Adds a child element to this folder.
	 */
	public addChild(child: FileStat): void {
		assert.ok(this.isDirectory, 'Can only add a child to a folder');

		// Overwrite a previous child with the same name
		this.removeChild(child);

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
		assert.ok(this.isDirectory, 'Can only call hasChild on a directory');
		assert.ok(types.isString(name), 'Expected parameter of type String');

		for (let i = 0; i < this.children.length; i++) {
			let child = this.children[i];
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
		assert.ok(this.isDirectory, 'Can only remove a child from a directory');
		assert.ok(!!this.children, 'Expected children for directory but found none: ' + this.resource.fsPath);

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
		assert.ok(newParent.isDirectory, 'Can only move an element into a directory');

		if (!fnBetweenStates) {
			fnBetweenStates = (cb: () => void) => { cb(); };
		}

		this.parent.removeChild(this);

		fnBetweenStates(() => {
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
		this.mime = renamedStat.mime;
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
		if (this.fileResourceEquals(resource, this.resource)) {
			return this;
		}

		// Return if not having any children
		if (!this.hasChildren) {
			return null;
		}

		for (let i = 0; i < this.children.length; i++) {
			let child = this.children[i];

			if (this.fileResourceEquals(resource, child.resource)) {
				return child;
			}

			if (child.isDirectory && paths.isEqualOrParent(resource.fsPath, child.resource.fsPath)) {
				return child.find(resource);
			}
		}

		return null; //Unable to find
	}

	private fileResourceEquals(r1: URI, r2: URI) {
		const identityEquals = (r1.toString() === r2.toString());
		if (isLinux || identityEquals) {
			return identityEquals;
		}

		return r1.toString().toLowerCase() === r2.toString().toLowerCase();
	}
}

/* A helper that can be used to show a placeholder when creating a new stat */
export class NewStatPlaceholder extends FileStat {

	private static ID = 0;

	private id: number;

	constructor(isDirectory: boolean) {
		super(URI.file(''));

		this.id = NewStatPlaceholder.ID++;
		this.isDirectoryResolved = isDirectory;
	}

	public destroy(): void {
		this.parent.removeChild(this);

		this.isDirectoryResolved = void 0;
		this.name = void 0;
		this.isDirectory = void 0;
		this.hasChildren = void 0;
		this.mtime = void 0;
		this.mime = void 0;
	}

	public getId(): string {
		return 'new-stat-placeholder:' + this.id + ':' + this.parent.resource.toString();
	}

	/**
	 * Returns a deep copy of this model object.
	 */
	public clone(): NewStatPlaceholder {
		let stat = new NewStatPlaceholder(this.isDirectory);
		stat.parent = this.parent;

		return stat;
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
		assert.ok(parent.isDirectory, 'Can only add a child to a folder');

		let child = new NewStatPlaceholder(isDirectory);

		// Inherit some parent properties to child
		child.parent = parent;
		parent.children.push(child);

		parent.hasChildren = parent.children.length > 0;

		return child;
	}
}