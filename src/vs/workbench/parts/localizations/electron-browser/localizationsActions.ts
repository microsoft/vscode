/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { TPromise } from 'vs/base/common/winjs.base';
import { IEditor } from 'vs/platform/editor/common/editor';
import { join } from 'vs/base/common/paths';
import URI from 'vs/base/common/uri';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { getPathLabel } from 'vs/base/common/labels';
import { language } from 'vs/base/common/platform';

export class ConfigureLocaleAction extends Action {
	public static readonly ID = 'workbench.action.configureLocale';
	public static readonly LABEL = localize('configureLocale', "Configure Language");

	private static DEFAULT_CONTENT: string = [
		'{',
		`\t// ${localize('displayLanguage', 'Defines VSCode\'s display language.')}`,
		`\t// ${localize('doc', 'See {0} for a list of supported languages.', 'https://go.microsoft.com/fwlink/?LinkId=761051')}`,
		`\t// ${localize('restart', 'Changing the value requires restarting VSCode.')}`,
		`\t"locale":"${language}"`,
		'}'
	].join('\n');

	constructor(id: string, label: string,
		@IFileService private fileService: IFileService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<IEditor> {
		const file = URI.file(join(this.environmentService.appSettingsHome, 'locale.json'));
		return this.fileService.resolveFile(file).then(null, (error) => {
			return this.fileService.createFile(file, ConfigureLocaleAction.DEFAULT_CONTENT);
		}).then((stat) => {
			if (!stat) {
				return undefined;
			}
			return this.editorService.openEditor({
				resource: stat.resource,
				options: {
					forceOpen: true
				}
			});
		}, (error) => {
			throw new Error(localize('fail.createSettings', "Unable to create '{0}' ({1}).", getPathLabel(file, this.contextService), error));
		});
	}
}