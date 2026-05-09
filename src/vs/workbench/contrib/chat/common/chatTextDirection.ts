/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { InternalEditorTextDirectionOptions } from '../../../../editor/common/core/textDirection.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

export function getChatTextDirection(configurationService: IConfigurationService): InternalEditorTextDirectionOptions {
	return EditorOptions.textDirection.validate(configurationService.getValue('editor.textDirection'));
}

export function affectsChatTextDirectionConfiguration(e: IConfigurationChangeEvent): boolean {
	return e.affectsConfiguration('editor.textDirection');
}
