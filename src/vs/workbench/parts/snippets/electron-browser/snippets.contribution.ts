/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import winjs = require('vs/base/common/winjs.base');
import paths = require('vs/base/common/paths');
import actions = require('vs/base/common/actions');
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import platform = require('vs/platform/platform');
import workbenchActionRegistry = require('vs/workbench/common/actionRegistry');
import workbenchContributions = require('vs/workbench/common/contributions');
import snippetsTracker = require('./snippetsTracker');
import errors = require('vs/base/common/errors');
import {IQuickOpenService, IPickOpenEntry} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import * as JSONContributionRegistry from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import {IJSONSchema} from 'vs/base/common/jsonSchema';
import {IModeService} from 'vs/editor/common/services/modeService';

import {ipcRenderer as ipc} from 'electron';
import fs = require('fs');

class OpenSnippetsAction extends actions.Action {

	public static ID = 'workbench.action.openSnippets';
	public static LABEL = nls.localize('openSnippet.label', 'Snippets');

	constructor(
		id: string,
		label:string,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IQuickOpenService private quickOpenService:IQuickOpenService,
		@IModeService private modeService:IModeService
	) {
		super(id, label);
	}

	private openFile(filePath: string): void {
		ipc.send('vscode:windowOpen', [filePath]); // handled from browser process
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
				var snippetPath = paths.join(this.contextService.getConfiguration().env.appSettingsHome, 'snippets', language.id + '.json');
				return fileExists(snippetPath).then((success) => {
					if (success) {
						this.openFile(snippetPath);
						return winjs.TPromise.as(null);
					}
					var defaultContent = [
						'{',
						'/*',
						'\t // Place your snippets for ' + language.label + ' here. Each snippet is defined under a snippet name and has a prefix, body and ',
						'\t // description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted. Possible variables are:',
						'\t // $1, $2 for tab stops, ${id} and ${id:label} and ${1:label} for variables. Variables with the same id are connected.',
						'\t // Example:',
						'\t "Print to console": {',
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
					return createFile(snippetPath, defaultContent).then(() => {
						this.openFile(snippetPath);
					}, (err) => {
						errors.onUnexpectedError(nls.localize('openSnippet.errorOnCreate', 'Unable to create {0}', snippetPath));
					});
				});
			}
			return winjs.TPromise.as(null);
		});
	}
}

function fileExists(path: string): winjs.TPromise<boolean> {
	return new winjs.TPromise<boolean>((c, e, p) => {
		fs.stat(path,(err, stats) => {
			if (err) {
				return c(false);
			}

			if (stats.isFile()) {
				return c(true);
			}

			c(false);
		});
	});
}

function createFile(path: string, content: string): winjs.Promise {
	return new winjs.Promise((c, e, p) => {
		fs.writeFile(path, content, function(err) {
			if(err) {
				e(err);
			}
			c(true);
		});
	});
}

var preferencesCategory = nls.localize('preferences', "Preferences");
var workbenchActionsRegistry = <workbenchActionRegistry.IWorkbenchActionRegistry> platform.Registry.as(workbenchActionRegistry.Extensions.WorkbenchActions);

workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenSnippetsAction, OpenSnippetsAction.ID, OpenSnippetsAction.LABEL), preferencesCategory);

(<workbenchContributions.IWorkbenchContributionsRegistry>platform.Registry.as(workbenchContributions.Extensions.Workbench)).registerWorkbenchContribution(
	snippetsTracker.SnippetsTracker
);

let schemaId = 'vscode://schemas/snippets';
let schema : IJSONSchema = {
	'id': schemaId,
	'defaultSnippets': [{
		'label': nls.localize('snippetSchema.json.default', "Empty snippet"),
		'body': { '{{snippetName}}': { 'prefix': '{{prefix}}', 'body': '{{snippet}}', 'description': '{{description}}' } }
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
				'description': nls.localize('snippetSchema.json.body', 'The snippet content. Use \'${id}\', \'${id:label}\', \'${1:label}\' for variables and \'$0\', \'$1\' for the cursor positions'),
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
schemaRegistry.addSchemaFileAssociation('%APP_SETTINGS_HOME%/snippets/*.json', schemaId);