/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../nls.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { WithUriValue } from '../../../../../../../base/common/types.js';
import { DOCUMENTATION_URL } from '../../../../common/promptSyntax/constants.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../../../platform/quickinput/common/quickInput.js';

/**
 * Shows the dialogs with a link to docs.
 */

export const showHowToCreateLink = async (
	openerService: IOpenerService,
	quickInputService: IQuickInputService
): Promise<void> => {
	const docsQuickPick: WithUriValue<IQuickPickItem> = {
		type: 'item',
		label: localize(
			'commands.prompts.use.select-dialog.empty.docs-label',
			'Learn how to create reusable prompts'
		),
		description: DOCUMENTATION_URL,
		tooltip: DOCUMENTATION_URL,
		value: URI.parse(DOCUMENTATION_URL),
	};

	const result = await quickInputService.pick(
		[docsQuickPick],
		{
			placeHolder: localize(
				'commands.prompts.use.select-dialog.empty.placeholder',
				'No prompts found.'
			),
			canPickMany: false,
		});

	if (!result) {
		return;
	}

	await openerService.open(result.value);
};
