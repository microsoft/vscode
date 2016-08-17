/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Types from 'vs/base/common/types';
import { SystemVariables } from './systemVariables';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import URI from 'vs/base/common/uri';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export class ConfigVariables extends SystemVariables {
	constructor(
		private configurationService: IConfigurationService,
		editorService: IWorkbenchEditorService,
		contextService: IWorkspaceContextService,
		environmentService: IEnvironmentService,
		workspaceRoot: URI = null,
		envVariables: { [key: string]: string } = process.env
	) {
		super(editorService, contextService, environmentService, workspaceRoot, envVariables);
	}

	protected resolveString(value: string): string {
		value = super.resolveString(value);

		let regexp = /\$\{config\.(.*?)\}/g;
		return value.replace(regexp, (match: string, name: string) => {
			let config = this.configurationService.getConfiguration();
			let newValue = new Function('_', 'try {return _.' + name + ';} catch (ex) { return "";}')(config);
			if (Types.isString(newValue)) {
				return newValue;
			}
			else {
				return this.resolve(newValue) + '';
			}
		});
	}
}