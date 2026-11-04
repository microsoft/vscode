/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { globMatchesResource } from '../../../../services/editor/common/editorResolverService.js';
import { ChatConfiguration } from '../../common/constants.js';

/**
 * Returns the editor configured for a resource opened from chat, if one matches.
 */
export function getEditorOverrideForChatResource(resource: URI, configurationService: IConfigurationService): string | undefined {
	const associations = configurationService.getValue<Record<string, string>>(ChatConfiguration.EditorAssociations) ?? {};
	const sortedPatterns = Object.keys(associations).sort((a, b) => b.length - a.length);
	for (const pattern of sortedPatterns) {
		if (globMatchesResource(pattern, resource)) {
			return associations[pattern];
		}
	}
	return undefined;
}
