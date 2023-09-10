/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel } from 'vs/editor/common/model';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IThemeService } from 'vs/platform/theme/common/themeService';

export const SEMANTIC_HIGHLIGHTING_SETTING_ID = 'editor.semanticHighlighting';

export interface IEditorSemanticHighlightingOptions {
	enabled: true | false | 'configuredByTheme';
}

export function isSemanticColoringEnabled(model: ITextModel, themeService: IThemeService, configurationService: IConfigurationService): boolean {
	const setting = configurationService.getValue<IEditorSemanticHighlightingOptions>(SEMANTIC_HIGHLIGHTING_SETTING_ID, { overrideIdentifier: model.getLanguageId(), resource: model.uri })?.enabled;
	if (typeof setting === 'boolean') {
		return setting;
	}
	return themeService.getColorTheme().semanticHighlighting;
}
