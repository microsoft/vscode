/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/workbench/parts/snippets/electron-browser/snippetsService';
import 'vs/workbench/parts/snippets/electron-browser/insertSnippet';
import 'vs/workbench/parts/snippets/electron-browser/tabCompletion';

import { fileExists, writeFile } from 'vs/base/node/pfs';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IQuickOpenService, IPickOpenEntry } from 'vs/platform/quickOpen/common/quickOpen';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { join } from 'path';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import * as actions from 'vs/base/common/actions';
import * as errors from 'vs/base/common/errors';
import * as JSONContributionRegistry from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import * as nls from 'vs/nls';
import * as platform from 'vs/platform/registry/common/platform';
import * as snippetsTracker from './snippetsTracker';
import * as tmSnippets from './TMSnippets';
import * as winjs from 'vs/base/common/winjs.base';
import * as workbenchActionRegistry from 'vs/workbench/common/actionRegistry';
import * as workbenchContributions from 'vs/workbench/common/contributions';

class OpenSnippetsAction extends actions.Action {

	public static ID = 'workbench.action.openSnippets';
	public static LABEL = nls.localize('openSnippet.label', "Open User Snippets");

	constructor(
		id: string,
		label: string,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IModeService private modeService: IModeService,
		@IWindowsService private windowsService: IWindowsService
	) {
		super(id, label);
	}

	private openFile(filePath: string): winjs.TPromise<void> {
		return this.windowsService.openWindow([filePath], { forceReuseWindow: true });
	}

	public run(): winjs.Promise {
		var modeIds = this.modeService.getRegisteredModes();
		var picks: IPickOpenEntry[] = [];
		modeIds.forEach((modeId) => {
			var name = this.modeService.getLanguageName(modeId);
			if (name) {
				picks.push({ label: name, id: modeId });
			}
		});
		picks = picks.sort((e1, e2) =>
			e1.label.localeCompare(e2.label)
		);

		return this.quickOpenService.pick(picks, { placeHolder: nls.localize('openSnippet.pickLanguage', "Select Language for Snippet") }).then((language) => {
			if (language) {
				var snippetPath = join(this.environmentService.appSettingsHome, 'snippets', language.id + '.json');
				return fileExists(snippetPath).then((success) => {
					if (success) {
						return this.openFile(snippetPath);
					}
					var defaultContent = [
						'{',
						'/*',
						'\t// Place your snippets for ' + language.label + ' here. Each snippet is defined under a snippet name and has a prefix, body and ',
						'\t// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted. Possible variables are:',
						'\t// $1, $2 for tab stops, $0 for the final cursor position, and ${1:label}, ${2:another} for placeholders. Placeholders with the ',
						'\t// same ids are connected.',
						'\t// Example:',
						'\t"Print to console": {',
						'\t\t"prefix": "log",',
						'\t\t"body": [',
						'\t\t\t"console.log(\'$1\');",',
						'\t\t\t"$2"',
						'\t\t],',
						'\t\t"description": "Log output to console"',
						'\t}',
						'*/',
						'}'
					].join('\n');
					return writeFile(snippetPath, defaultContent).then(() => {
						return this.openFile(snippetPath);
					}, (err) => {
						errors.onUnexpectedError(nls.localize('openSnippet.errorOnCreate', 'Unable to create {0}', snippetPath));
					});
				});
			}
			return winjs.TPromise.as(null);
		});
	}
}

var preferencesCategory = nls.localize('preferences', "Preferences");
var workbenchActionsRegistry = <workbenchActionRegistry.IWorkbenchActionRegistry>platform.Registry.as(workbenchActionRegistry.Extensions.WorkbenchActions);

workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenSnippetsAction, OpenSnippetsAction.ID, OpenSnippetsAction.LABEL), 'Preferences: Open User Snippets', preferencesCategory);

(<workbenchContributions.IWorkbenchContributionsRegistry>platform.Registry.as(workbenchContributions.Extensions.Workbench)).registerWorkbenchContribution(
	snippetsTracker.SnippetsTracker
);
(<workbenchContributions.IWorkbenchContributionsRegistry>platform.Registry.as(workbenchContributions.Extensions.Workbench)).registerWorkbenchContribution(
	tmSnippets.MainProcessTextMateSnippet
);

let schemaId = 'vscode://schemas/snippets';
let schema: IJSONSchema = {
	'id': schemaId,
	'defaultSnippets': [{
		'label': nls.localize('snippetSchema.json.default', "Empty snippet"),
		'body': { '${1:snippetName}': { 'prefix': '${2:prefix}', 'body': '${3:snippet}', 'description': '${4:description}' } }
	}],
	'type': 'object',
	'description': nls.localize('snippetSchema.json', 'User snippet configuration'),
	'additionalProperties': {
		'type': 'object',
		'required': ['prefix', 'body'],
		'properties': {
			'prefix': {
				'description': nls.localize('snippetSchema.json.prefix', 'The prefix to used when selecting the snippet in intellisense'),
				'type': 'string'
			},
			'body': {
				'description': nls.localize('snippetSchema.json.body', 'The snippet content. Use \'$1\', \'${1:defaultText}\' to define cursor positions, use \'$0\' for the final cursor position. Insert variable values with \'${varName}\' and \'${varName:defaultText}\', e.g \'This is file: $TM_FILENAME\'.'),
				'type': ['string', 'array'],
				'items': {
					'type': 'string'
				}
			},
			'description': {
				'description': nls.localize('snippetSchema.json.description', 'The snippet description.'),
				'type': 'string'
			}
		},
		'additionalProperties': false
	}
};

let schemaRegistry = <JSONContributionRegistry.IJSONContributionRegistry>platform.Registry.as(JSONContributionRegistry.Extensions.JSONContribution);
schemaRegistry.registerSchema(schemaId, schema);
