/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../../nls.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { Codicon } from '../../../../../../../../base/common/codicons.js';
import { WithUriValue } from '../../../../../../../../base/common/types.js';
import { ThemeIcon } from '../../../../../../../../base/common/themables.js';
import { DOCUMENTATION_URL } from '../../../../../common/promptSyntax/constants.js';
import { isLinux, isWindows } from '../../../../../../../../base/common/platform.js';
import { IQuickInputButton, IQuickPickItem } from '../../../../../../../../platform/quickinput/common/quickInput.js';

/**
 * Name of the `"super"` key based on the current OS.
 */
export const SUPER_KEY_NAME = (isWindows || isLinux) ? 'Ctrl' : '⌘';

/**
 * Name of the `alt`/`options` key based on the current OS.
 */
export const ALT_KEY_NAME = (isWindows || isLinux) ? 'Alt' : '⌥';

/**
 * A special quick pick item that links to the documentation.
 */
export const DOCS_OPTION: WithUriValue<IQuickPickItem> = Object.freeze({
	type: 'item',
	label: localize(
		'commands.prompts.use.select-dialog.docs-label',
		'Learn how to create reusable prompts',
	),
	description: DOCUMENTATION_URL,
	tooltip: DOCUMENTATION_URL,
	value: URI.parse(DOCUMENTATION_URL),
});

/**
 * Button that opens a prompt file in the editor.
 */
export const EDIT_BUTTON: IQuickInputButton = Object.freeze({
	tooltip: localize(
		'commands.prompts.use.select-dialog.open-button.tooltip',
		"edit ({0}-key + enter)",
		SUPER_KEY_NAME,
	),
	iconClass: ThemeIcon.asClassName(Codicon.edit),
});

/**
 * Button that deletes a prompt file.
 */
export const DELETE_BUTTON: IQuickInputButton = Object.freeze({
	tooltip: localize('delete', "delete"),
	iconClass: ThemeIcon.asClassName(Codicon.trash),
});
