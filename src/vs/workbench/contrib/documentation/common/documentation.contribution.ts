/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { DocumentationContribution } from 'vs/workbench/contrib/documentation/common/documentationContribution';
import { DocumentationExtensionPoint, documentationExtensionPointDescriptor } from 'vs/workbench/contrib/documentation/common/documentationExtensionPoint';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';

const documentationExtensionPoint = ExtensionsRegistry.registerExtensionPoint<DocumentationExtensionPoint>(documentationExtensionPointDescriptor);

class WorkbenchConfigurationContribution {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		instantiationService.createInstance(DocumentationContribution, documentationExtensionPoint);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(WorkbenchConfigurationContribution, LifecyclePhase.Eventually);
