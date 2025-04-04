/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../../../nls.js';
import { DELETE_BUTTON, EDIT_BUTTON } from '../constants.js';
import { dirname } from '../../../../../../../../../base/common/resources.js';
import { WithUriValue } from '../../../../../../../../../base/common/types.js';
import { IPromptPath } from '../../../../../../common/promptSyntax/service/types.js';
import { ILabelService } from '../../../../../../../../../platform/label/common/label.js';
import { getCleanPromptName } from '../../../../../../../../../platform/prompts/common/constants.js';
import { IQuickPickItem } from '../../../../../../../../../platform/quickinput/common/quickInput.js';

/**
 * Creates a quick pick item for a prompt.
 */
export const createPromptPickItem = (
	promptFile: IPromptPath,
	labelService: ILabelService,
): WithUriValue<IQuickPickItem> => {
	const { uri, type } = promptFile;
	const fileWithoutExtension = getCleanPromptName(uri);

	// if a "user" prompt, don't show its filesystem path in
	// the user interface, but do that for all the "local" ones
	const description = (type === 'user')
		? localize(
			'user-prompt.capitalized',
			'User prompt',
		)
		: labelService.getUriLabel(dirname(uri), { relative: true });

	const tooltip = (type === 'user')
		? description
		: uri.fsPath;

	return {
		id: uri.toString(),
		type: 'item',
		label: fileWithoutExtension,
		description,
		tooltip,
		value: uri,
		buttons: [EDIT_BUTTON, DELETE_BUTTON],
	};
};
