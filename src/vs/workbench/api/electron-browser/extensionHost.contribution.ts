/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThreadService, ProxyIdentifier } from 'vs/workbench/services/thread/common/threadService';
import { MainContext, IExtHostContext } from '../node/extHost.protocol';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { ExtHostCustomersRegistry } from "vs/workbench/api/electron-browser/extHostCustomers";

// --- other interested parties
import { JSONValidationExtensionPoint } from 'vs/platform/jsonschemas/common/jsonValidationExtensionPoint';
import { ColorExtensionPoint } from 'vs/platform/theme/common/colorExtensionPoint';
import { LanguageConfigurationFileHandler } from 'vs/workbench/parts/codeEditor/electron-browser/languageConfiguration/languageConfigurationExtensionPoint';

// --- mainThread participants
import './mainThreadCommands';
import './mainThreadConfiguration';
import './mainThreadCredentials';
import './mainThreadDebugService';
import './mainThreadDiagnostics';
import './mainThreadDocumentContentProviders';
import './mainThreadDocuments';
import './mainThreadDocumentsAndEditors';
import './mainThreadEditor';
import './mainThreadEditors';
import './mainThreadErrors';
import './mainThreadExtensionService';
import './mainThreadFileSystemEventService';
import './mainThreadHeapService';
import './mainThreadLanguageFeatures';
import './mainThreadLanguages';
import './mainThreadMessageService';
import './mainThreadOutputService';
import './mainThreadProgress';
import './mainThreadQuickOpen';
import './mainThreadSCM';
import './mainThreadSaveParticipant';
import './mainThreadStatusBar';
import './mainThreadStorage';
import './mainThreadTask';
import './mainThreadTelemetry';
import './mainThreadTerminalService';
import './mainThreadTreeViews';
import './mainThreadWorkspace';

export class ExtHostContribution implements IWorkbenchContribution {

	constructor(
		@IThreadService threadService: IThreadService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IExtensionService extensionService: IExtensionService
	) {

		const extHostContext: IExtHostContext = threadService;

		// Named customers
		const namedCustomers = ExtHostCustomersRegistry.getNamedCustomers();
		for (let i = 0, len = namedCustomers.length; i < len; i++) {
			const [id, ctor] = namedCustomers[i];
			threadService.set(id, instantiationService.createInstance(ctor, extHostContext));
		}

		// Customers
		const customers = ExtHostCustomersRegistry.getCustomers();
		for (let i = 0, len = customers.length; i < len; i++) {
			const ctor = customers[i];
			instantiationService.createInstance(ctor, extHostContext);
		}

		// Check that no named customers are missing
		const expected: ProxyIdentifier<any>[] = Object.keys(MainContext).map((key) => MainContext[key]);
		threadService.assertRegistered(expected);
	}

	public getId(): string {
		return 'vs.api.extHost';
	}
}


export class ExtensionPoints implements IWorkbenchContribution {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		// Classes that handle extension points...
		this.instantiationService.createInstance(JSONValidationExtensionPoint);
		this.instantiationService.createInstance(ColorExtensionPoint);
		this.instantiationService.createInstance(LanguageConfigurationFileHandler);
	}

	public getId(): string {
		return 'vs.api.extensionPoints';
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	ExtHostContribution
);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	ExtensionPoints
);