/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation';
import { Registry } from '../../../../platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from '../../../common/contributions';
import { CodeActionsExtensionPoint, codeActionsExtensionPointDescriptor } from '../common/codeActionsExtensionPoint';
import { DocumentationExtensionPoint, documentationExtensionPointDescriptor } from '../common/documentationExtensionPoint';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle';
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
