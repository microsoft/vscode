/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, PreferredGroup, USE_MODAL_EDITOR_SETTING, UseModalEditorMode } from '../../../services/editor/common/editorService.js';

/**
 * Resolves the preferred group for opening an integrated browser editor.
 *
 * When the workbench forces editors into a modal part
 * (`workbench.editor.useModal: 'all'`, the default in the Agents window), the
 * integrated browser should still dock in the main editor area rather than open
 * as a modal overlay. This redirects browser opens that target the active group
 * to the main editor part, while leaving explicit placements (side group,
 * auxiliary window, a specific group) untouched. Users can still move the
 * browser into a modal explicitly afterwards.
 */
export function getBrowserPreferredGroup(editorGroupsService: IEditorGroupsService, configurationService: IConfigurationService, preferredGroup?: PreferredGroup): PreferredGroup | undefined {
	if ((preferredGroup === undefined || preferredGroup === ACTIVE_GROUP) && configurationService.getValue<UseModalEditorMode>(USE_MODAL_EDITOR_SETTING) === 'all') {
		return editorGroupsService.mainPart.activeGroup;
	}

	return preferredGroup;
}
