/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import * as nls from '../../../../nls.js';

/**
 * Command that toggles the string concatenation on Enter feature.
 * Accessible via the Command Palette as "Toggle String Concatenation on Enter".
 */
export class ToggleStringConcatenationOnEnterAction extends Action2 {

	static readonly ID = 'editor.action.toggleStringConcatenationOnEnter';

	constructor() {
		super({
			id: ToggleStringConcatenationOnEnterAction.ID,
			title: nls.localize2(
				'toggleStringConcatenationOnEnter',
				'Toggle String Concatenation on Enter'
			),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);

		const currentValue = configurationService.getValue<boolean>(
			'editor.stringConcatenationOnEnter'
		);

		await configurationService.updateValue(
			'editor.stringConcatenationOnEnter',
			!currentValue
		);
	}

}

registerAction2(ToggleStringConcatenationOnEnterAction);


