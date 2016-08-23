/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IOptions} from 'vs/workbench/common/options';
import {IWorkspace, WorkspaceContextService} from 'vs/platform/workspace/common/workspace';

export class LegacyWorkspaceContextService extends WorkspaceContextService {

	constructor(
		workspace: IWorkspace,
		private options: IOptions
	) {
		super(workspace);
	}

	public getOptions(): IOptions {
		return this.options;
	}
}