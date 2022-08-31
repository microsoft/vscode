/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { editorConfigurationBaseNode } from 'vs/editor/common/config/editorConfigurationSchema';
import * as nls from 'vs/nls';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	...editorConfigurationBaseNode,
	properties: {
		'editor.codeActionWidget.showHeaders': {
			type: 'boolean',
			scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
			description: nls.localize('showCodeActionHeaders', "Enable/disable showing group headers in the code action menu."),
			default: true,
		},
	}
});
