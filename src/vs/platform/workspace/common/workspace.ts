/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TrieMap } from 'vs/base/common/map';
import Event from 'vs/base/common/event';
import { isLinux } from 'vs/base/common/platform';
import { distinct } from 'vs/base/common/arrays';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';

export const IWorkspaceContextService = createDecorator<IWorkspaceContextService>('contextService');

export interface IWorkspaceContextService {
	_serviceBrand: any;

	/**
	 * Returns if the application was opened with a workspace or not.
	 */
	hasWorkspace(): boolean;

	/**
	 * Returns if the application was opened with a folder.
	 */
	hasFolderWorkspace(): boolean;

	/**
	 * Returns if the application was opened with a workspace that can have one or more folders.
	 */
	hasMultiFolderWorkspace(): boolean;

	/**
	 * Provides access to the workspace object the platform is running with. This may be null if the workbench was opened
	 * without workspace (empty);
	 */
	getWorkspace(): IWorkspace;

	/**
	 * An event which fires on workspace name changes.
	 */
	onDidChangeWorkspaceName: Event<void>;

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
	 * Return `true` if the current workspace has the given identifier otherwise `false`.
	 */
	isCurrentWorkspace(workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): boolean;

	/**
	 * Returns if the provided resource is inside the workspace or not.
	 */
	isInsideWorkspace(resource: URI): boolean;

	/**
	 * Given a workspace relative path, returns the resource with the absolute path.
	 */
	toResource: (workspaceRelativePath: string) => URI;
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
	 * Roots in the workspace.
	 */
	readonly roots: URI[];

	/**
	 * the location of the workspace configuration
	 */
	readonly configuration?: URI;
}

export class Workspace implements IWorkspace {

	private _rootsMap: TrieMap<URI> = new TrieMap<URI>();
	private _roots: URI[];

	constructor(
		public readonly id: string,
		private _name: string,
		roots: URI[],
		private _configuration: URI = null,
		public readonly ctime?: number
	) {
		this.roots = roots;
	}

	private ensureUnique(roots: URI[]): URI[] {
		return distinct(roots, root => isLinux ? root.fsPath : root.fsPath.toLowerCase());
	}

	public get roots(): URI[] {
		return this._roots;
	}

	public set roots(roots: URI[]) {
		this._roots = this.ensureUnique(roots);
		this.updateRootsMap();
	}

	public get name(): string {
		return this._name;
	}

	public set name(name: string) {
		this._name = name;
	}

	public get configuration(): URI {
		return this._configuration;
	}

	public set configuration(configuration: URI) {
		this._configuration = configuration;
	}

	public getRoot(resource: URI): URI {
		if (!resource) {
			return null;
		}

		return this._rootsMap.findSubstr(resource.fsPath);
	}

	private updateRootsMap(): void {
		this._rootsMap = new TrieMap<URI>();
		for (const root of this.roots) {
			this._rootsMap.insert(root.fsPath, root);
		}
	}

	public toJSON(): IWorkspace {
		return { id: this.id, roots: this.roots, name: this.name };
	}
}
