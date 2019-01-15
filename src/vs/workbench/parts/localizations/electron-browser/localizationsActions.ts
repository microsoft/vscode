/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { IFileService } from 'vs/platform/files/common/files';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IEditor } from 'vs/workbench/common/editor';
import { join } from 'vs/base/common/paths';
import { URI } from 'vs/base/common/uri';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { language } from 'vs/base/common/platform';
import { ILabelService } from 'vs/platform/label/common/label';

export class ConfigureLocaleAction extends Action {
	public static readonly ID = 'workbench.action.configureLocale';
	public static readonly LABEL = localize('configureLocale', "Configure Display Language");

	private static DEFAULT_CONTENT: string = [
		'{',
		`\t// ${localize('displayLanguage', 'Defines VS Code\'s display language.')}`,
		`\t// ${localize('doc', 'See {0} for a list of supported languages.', 'https://go.microsoft.com/fwlink/?LinkId=761051')}`,
		`\t`,
		`\t"locale":"${language}" // ${localize('restart', 'Changes will not take effect until VS Code has been restarted.')}`,
		'}'
	].join('\n');

	constructor(id: string, label: string,
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IEditorService private readonly editorService: IEditorService,
		@ILabelService private readonly labelService: ILabelService
	) {
		super(id, label);
	}

	public run(event?: any): Promise<IEditor | undefined> {
		const file = URI.file(join(this.environmentService.appSettingsHome, 'locale.json'));
		return this.fileService.resolveFile(file).then(undefined, (error) => {
			return this.fileService.createFile(file, ConfigureLocaleAction.DEFAULT_CONTENT);
		}).then((stat): Promise<IEditor | undefined> | undefined => {
			if (!stat) {
				return undefined;
			}
			return this.editorService.openEditor({
				resource: stat.resource
			});
		}, (error) => {
			throw new Error(localize('fail.createSettings', "Unable to create '{0}' ({1}).", this.labelService.getUriLabel(file, { relative: true }), error));
		});
	}
}
