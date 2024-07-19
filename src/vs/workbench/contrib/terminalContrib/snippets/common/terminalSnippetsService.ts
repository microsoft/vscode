/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import type { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import type { ITerminalSnippet, ITerminalSnippetsService } from 'vs/workbench/contrib/terminalContrib/snippets/common/terminal.snippets';
import { TerminalSnippetSettingId, type ITerminalSnippetConfiguration } from 'vs/workbench/contrib/terminalContrib/snippets/common/terminalSnippetsConfiguration';

export class TerminalSnippetsService extends Disposable implements ITerminalSnippetsService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
	}

	getSnippets(workspaceFolder: IWorkspaceFolder): Map<string, ITerminalSnippet> {
		// TODO: Merge user, workspace, folder snippets
		const config = this._configurationService.getValue<ITerminalSnippetConfiguration['snippets']>(TerminalSnippetSettingId.Snippets);
		if (!config) {
			return new Map();
		}
		const result: Map<string, ITerminalSnippet> = new Map();
		for (const [key, entry] of Object.entries(config)) {
			if (entry && isSnippet(entry)) {
				result.set(key, entry);
			}
		}
		return result;
	}
}

function isSnippet(value: ITerminalSnippet): value is ITerminalSnippet {
	return (
		'prefix' in value && (typeof value.prefix === 'string' || Array.isArray(value.prefix)) &&
		'body' in value && (typeof value.body === 'string' || Array.isArray(value.body)) &&
		(!('description' in value) || typeof value.description === 'string')
	);
}
