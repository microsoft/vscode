/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { WebFontService } from 'vs/workbench/contrib/webFont/browser/webFontService';
import { IWebFontService } from 'vs/workbench/contrib/webFont/common/webFontService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

registerSingleton(IWebFontService, WebFontService);

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WebFontService, LifecyclePhase.Starting);

configurationRegistry.registerConfiguration({
	'id': 'webFont',
	'order': 20,
	'title': nls.localize('wenFontConfigurationTitle', "Web Font"),
	'type': 'object',
	'properties': {
		'editor.webFont.fontFaceList': {
			'type': 'array',
			'description': nls.localize('webFontTest', "Font information that will be inserted in the CSS's font-face grammar."),
			'default': [],
			'items': {
				'type': 'object',
				properties: {
					'ascent-override': {
						'type': 'string'
					},
					'descent-override': {
						'type': 'string'
					},
					'font-display': {
						'type': 'string'
					},
					'font-family': {
						'type': 'string'
					},
					'font-stretch': {
						'type': 'string'
					},
					'font-style': {
						'type': 'string'
					},
					'font-weight': {
						'type': 'string'
					},
					'font-variant': {
						'type': 'string'
					},
					'font-feature-settings': {
						'type': 'string'
					},
					'font-variation-settings': {
						'type': 'string'
					},
					'line-gap-override': {
						'type': 'string'
					},
					'size-adjust': {
						'type': 'string'
					},
					'src': {
						'type': 'string'
					},
					'unicode-range': {
						'type': 'string'
					}
				}

			}
		}
	}
});
