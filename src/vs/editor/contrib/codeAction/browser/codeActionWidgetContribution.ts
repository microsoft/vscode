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
		'editor.experimental.useCustomCodeActionMenu': {
			type: 'boolean',
			tags: ['experimental'],
			scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
			description: nls.localize('codeActionWidget', "Enabling this adjusts how the code action menu is rendered."),
			default: true,
		},
	}
});
