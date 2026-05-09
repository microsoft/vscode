/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { EditorTextDirectionPreset, InternalEditorTextDirectionOptions } from '../../../../editor/common/core/textDirection.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration } from './constants.js';

export type ChatTextDirectionPreset = EditorTextDirectionPreset | 'inherit';

const validChatTextDirectionPresets = new Set<ChatTextDirectionPreset>(['inherit', 'contextual', 'auto', 'auto-follow', 'default', 'ltr', 'rtl']);

export function getChatTextDirection(configurationService: IConfigurationService): InternalEditorTextDirectionOptions {
	const chatTextDirection = configurationService.getValue<string | undefined>(ChatConfiguration.TextDirection);
	const configuredValue = chatTextDirection === undefined || chatTextDirection === 'inherit'
		? configurationService.getValue('editor.textDirection')
		: chatTextDirection;

	return EditorOptions.textDirection.validate(configuredValue);
}

export function isChatTextDirectionPreset(value: unknown): value is ChatTextDirectionPreset {
	return typeof value === 'string' && validChatTextDirectionPresets.has(value as ChatTextDirectionPreset);
}

export function affectsChatTextDirectionConfiguration(e: IConfigurationChangeEvent): boolean {
	return e.affectsConfiguration(ChatConfiguration.TextDirection) || e.affectsConfiguration('editor.textDirection');
}
