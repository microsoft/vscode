/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';

export function registerQuickOpenConfiguration(): void {
	const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	configurationRegistry.registerConfiguration({
		id: 'quickOpen',
		order: 100,
		title: nls.localize('TaskQuickOpenHistory', "Quick Open"),
		type: 'number',
		properties: {
			'quickOpen.history': {
				type: 'number',
				default: 30, minimum: 0, maximum: 30,
				description: nls.localize('quickOpen.history', "Controls the number of recent items tracked in task quick open dialog.")
			},
		}
	});
}
