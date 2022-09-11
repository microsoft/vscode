/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { editorConfigurationBaseNode } from 'vs/editor/common/config/editorConfigurationSchema';
import { CopyPasteController } from 'vs/editor/contrib/copyPaste/browser/copyPasteController';
import * as nls from 'vs/nls';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';

registerEditorContribution(CopyPasteController.ID, CopyPasteController);

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	...editorConfigurationBaseNode,
	properties: {
		'editor.experimental.pasteActions.enabled': {
			type: 'boolean',
			scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
			description: nls.localize('pasteActions', "Enable/disable running edits from extensions on paste."),
			default: false,
		},
	}
});
