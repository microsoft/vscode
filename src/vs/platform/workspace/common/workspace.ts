/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import paths = require('vs/base/common/paths');
import { isEqualOrParent } from 'vs/platform/files/common/files';
import { isLinux } from 'vs/base/common/platform';
import Event from 'vs/base/common/event';

export const IWorkspaceContextService = createDecorator<IWorkspaceContextService>('contextService');

export interface IWorkspaceContextService {
	_serviceBrand: any;

	/**
	 * Returns iff the application was opened with a workspace or not.
	 */
	hasWorkspace(): boolean;

	/**
	 * Provides access to the workspace object the platform is running with. This may be null if the workbench was opened
	 * without workspace (empty);
	 */
	getWorkspace(): IWorkspace;

	/**
	 * Provides access to the workspace object the platform is running with. This may be null if the workbench was opened
	 * without workspace (empty);
	 */
	getWorkspace2(): IWorkspace2;

	/**
	 * An event which fires on workspace roots change.
	 */
	onDidChangeWorkspaceRoots: Event<URI[]>;

	/**
	 * Returns the root for the given resource from the workspace.
	 * Can be null if there is no workspace or the resource is not inside the workspace.
	 */
	getRoot(resource: URI): URI;

	/**
	 * Returns iff the provided resource is inside the workspace or not.
	 */
	isInsideWorkspace(resource: URI): boolean;

	/**
	 * Given a resource inside the workspace, returns its relative path from the workspace root
	 * without leading or trailing slashes. Returns null if the file is not inside an opened
	 * workspace.
	 */
	toWorkspaceRelativePath: (resource: URI, toOSPath?: boolean) => string;

	/**
	 * Given a workspace relative path, returns the resource with the absolute path.
	 */
	toResource: (workspaceRelativePath: string) => URI;
}

export interface IWorkspace {

	/**
	 * the full uri of the workspace. this is a file:// URL to the location
	 * of the workspace on disk.
	 */
	resource: URI;

	/**
	 * the creation date of the workspace if known.
	 */
	ctime: number;

	/**
	 * the name of the workspace
	 */
	name?: string;
}

export interface IWorkspace2 {

	/**
	 * the unique identifier of the workspace.
	 */
	readonly id: string;

	/**
	 * the name of the workspace.
	 */
	readonly name: string;

	/**
	 * Mutliple roots in this workspace. First entry is master and never changes.
	 */
	readonly roots: URI[];
}

export class Workspace implements IWorkspace {
	private _name: string;

	constructor(private _resource: URI, private _ctime?: number) {
		this._name = paths.basename(this._resource.fsPath) || this._resource.fsPath;
	}

	public get resource(): URI {
		return this._resource;
	}

	public get name(): string {
		return this._name;
	}

	public get ctime(): number {
		return this._ctime;
	}

	public toWorkspaceRelativePath(resource: URI, toOSPath?: boolean): string {
		if (this.contains(resource)) {
			return paths.normalize(paths.relative(this._resource.fsPath, resource.fsPath), toOSPath);
		}

		return null;
	}

	private contains(resource: URI): boolean {
		if (resource) {
			return isEqualOrParent(resource.fsPath, this._resource.fsPath, !isLinux /* ignorecase */);
		}

		return false;
	}

	public toResource(workspaceRelativePath: string, root?: URI): URI {
		if (typeof workspaceRelativePath === 'string') {
			return URI.file(paths.join(root ? root.fsPath : this._resource.fsPath, workspaceRelativePath));
		}

		return null;
	}
}