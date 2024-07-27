/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { CodeActionsExtensionPoint, codeActionsExtensionPointDescriptor } from 'vs/workbench/contrib/codeActions/common/codeActionsExtensionPoint';
import { DocumentationExtensionPoint, documentationExtensionPointDescriptor } from 'vs/workbench/contrib/codeActions/common/documentationExtensionPoint';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { CodeActionsContribution, editorConfiguration, notebookEditorConfiguration } from './codeActionsContribution';
import { CodeActionDocumentationContribution } from './documentationContribution';

const codeActionsExtensionPoint = ExtensionsRegistry.registerExtensionPoint<CodeActionsExtensionPoint[]>(codeActionsExtensionPointDescriptor);
const documentationExtensionPoint = ExtensionsRegistry.registerExtensionPoint<DocumentationExtensionPoint>(documentationExtensionPointDescriptor);

Registry.as<IConfigurationRegistry>(Extensions.Configuration)
	.registerConfiguration(editorConfiguration);

Registry.as<IConfigurationRegistry>(Extensions.Configuration)
	.registerConfiguration(notebookEditorConfiguration);

class WorkbenchConfigurationContribution {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		instantiationService.createInstance(CodeActionsContribution, codeActionsExtensionPoint);
		instantiationService.createInstance(CodeActionDocumentationContribution, documentationExtensionPoint);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(WorkbenchConfigurationContribution, LifecyclePhase.Eventually);
