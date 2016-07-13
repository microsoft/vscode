/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import {IWorkspaceContextService, IWorkspace, IConfiguration} from './workspace';

/**
 * Simple IWorkspaceContextService implementation to allow sharing of this service implementation
 * between different layers of the platform.
 */
export class BaseWorkspaceContextService implements IWorkspaceContextService {
	public _serviceBrand: any;
	protected options: any;

	private workspace: IWorkspace;
	private configuration: IConfiguration;

	constructor(workspace: IWorkspace, configuration?: IConfiguration, options: any = {}) {
		this.workspace = workspace;
		this.configuration = configuration;
		this.options = options;
	}

	public getWorkspace(): IWorkspace {
		return this.workspace;
	}

	public getConfiguration(): IConfiguration {
		return this.configuration;
	}

	public getOptions(): any {
		return this.options;
	}

	public isInsideWorkspace(resource: URI): boolean {
		if (resource && this.workspace) {
			return paths.isEqualOrParent(resource.fsPath, this.workspace.resource.fsPath);
		}

		return false;
	}

	public toWorkspaceRelativePath(resource: URI): string {
		if (this.isInsideWorkspace(resource)) {
			return paths.normalize(paths.relative(this.workspace.resource.fsPath, resource.fsPath));
		}

		return null;
	}

	public toResource(workspaceRelativePath: string): URI {
		if (typeof workspaceRelativePath === 'string' && this.workspace) {
			return URI.file(paths.join(this.workspace.resource.fsPath, workspaceRelativePath));
		}

		return null;
	}
}