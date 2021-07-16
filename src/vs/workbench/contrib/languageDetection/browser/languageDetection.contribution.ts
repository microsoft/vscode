/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { LanguageDetectionService } from 'vs/workbench/services/languageDetection/browser/languageDetectionService';

// Configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'languageDetection',
	order: 1025,
	title: localize('languageDetectionConfigurationTitle', "Language Detection"),
	type: 'object',
	properties: {
		'languageDetection.enabled': {
			type: 'boolean',
			default: false,
			description: localize('languageDetection.enabled', "Experimental. Controls whether the language in an untitled text editor is automatically detected."),
			scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
		}
	}
});

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(LanguageDetectionService, LifecyclePhase.Eventually);
