/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import * as paths from 'vs/base/common/paths';
import { TrieMap } from 'vs/base/common/map';
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
	getWorkspace(): ILegacyWorkspace;

	/**
	 * Provides access to the workspace object the platform is running with. This may be null if the workbench was opened
	 * without workspace (empty);
	 */
	getWorkspace2(): IWorkspace;

	/**
	 * An event which fires on workspace roots change.
	 */
	onDidChangeWorkspaceRoots: Event<void>;

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

export interface ILegacyWorkspace {

	/**
	 * the full uri of the workspace. this is a file:// URL to the location
	 * of the workspace on disk.
	 */
	resource: URI;
}

export interface IWorkspace {

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

export class LegacyWorkspace implements ILegacyWorkspace {
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
			return paths.isEqualOrParent(resource.fsPath, this._resource.fsPath, !isLinux /* ignorecase */);
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

export class Workspace implements IWorkspace {

	private _rootsMap: TrieMap<URI> = new TrieMap<URI>(TrieMap.PathSplitter);

	constructor(
		public readonly id: string,
		private _name: string,
		private _roots: URI[]
	) {
		this.updateRootsMap();
	}

	public get roots(): URI[] {
		return this._roots;
	}

	public set roots(roots: URI[]) {
		this._roots = roots;
		this.updateRootsMap();
	}

	public get name(): string {
		return this._name;
	}

	public set name(name: string) {
		this._name = name;
	}

	public getRoot(resource: URI): URI {
		if (!resource) {
			return null;
		}

		return this._rootsMap.findSubstr(resource.fsPath);
	}

	private updateRootsMap(): void {
		this._rootsMap = new TrieMap<URI>(TrieMap.PathSplitter);
		for (const root of this.roots) {
			this._rootsMap.insert(root.fsPath, root);
		}
	}

	public toJSON(): IWorkspace {
		return { id: this.id, roots: this.roots, name: this.name };
	}
}