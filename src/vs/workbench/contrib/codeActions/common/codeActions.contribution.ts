/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { CodeActionWorkbenchContribution, editorConfiguration } from 'vs/workbench/contrib/codeActions/common/configuration';
import { CodeActionsExtensionPoint, codeActionsExtensionPointDescriptor } from 'vs/workbench/contrib/codeActions/common/extensionPoint';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';

const codeActionsExtensionPoint = ExtensionsRegistry.registerExtensionPoint<CodeActionsExtensionPoint[]>(codeActionsExtensionPointDescriptor);

Registry.as<IConfigurationRegistry>(Extensions.Configuration)
	.registerConfiguration(editorConfiguration);

class WorkbenchContribution {
	constructor(
		@IKeybindingService keybindingsService: IKeybindingService,
	) {
		// tslint:disable-next-line: no-unused-expression
		new CodeActionWorkbenchContribution(codeActionsExtensionPoint, keybindingsService);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(WorkbenchContribution, LifecyclePhase.Eventually);
