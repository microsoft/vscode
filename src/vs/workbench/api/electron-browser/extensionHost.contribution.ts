/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IInstantiationService, IConstructorSignature0 } from 'vs/platform/instantiation/common/instantiation';
import { IThreadService, ProxyIdentifier } from 'vs/workbench/services/thread/common/threadService';
import { MainContext, InstanceCollection, IExtHostContext } from '../node/extHost.protocol';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { ExtHostCustomersRegistry } from "vs/workbench/api/electron-browser/extHostCustomers";

// --- addressable
import { MainThreadDiagnostics } from './mainThreadDiagnostics';
import { MainThreadDocumentContentProviders } from './mainThreadDocumentContentProviders';
import { MainThreadErrors } from './mainThreadErrors';
import { MainThreadTreeViews } from './mainThreadTreeViews';
import { MainThreadLanguages } from './mainThreadLanguages';
import { MainThreadMessageService } from './mainThreadMessageService';
import { MainThreadOutputService } from './mainThreadOutputService';
import { MainThreadProgress } from './mainThreadProgress';
import { MainThreadStatusBar } from './mainThreadStatusBar';
import { MainThreadStorage } from './mainThreadStorage';
import { MainThreadTelemetry } from './mainThreadTelemetry';
import { MainThreadTerminalService } from './mainThreadTerminalService';
import { MainThreadWorkspace } from './mainThreadWorkspace';
import { MainProcessExtensionServiceAPI } from './mainThreadExtensionService';
import { MainThreadTask } from './mainThreadTask';
import { MainThreadSCM } from './mainThreadSCM';

// --- other interested parties
import { JSONValidationExtensionPoint } from 'vs/platform/jsonschemas/common/jsonValidationExtensionPoint';
import { ColorExtensionPoint } from 'vs/platform/theme/common/colorExtensionPoint';
import { LanguageConfigurationFileHandler } from 'vs/workbench/parts/codeEditor/electron-browser/languageConfiguration/languageConfigurationExtensionPoint';
import { SaveParticipant } from './mainThreadSaveParticipant';

// --- registers itself as service
import './mainThreadHeapService';

// --- mainThread participants
import './mainThreadCommands';
import './mainThreadConfiguration';
import './mainThreadCredentials';
import './mainThreadDebugService';
// import './mainThreadDiagnostics';
import './mainThreadDocuments';
import './mainThreadDocumentsAndEditors';
import './mainThreadEditor';
import './mainThreadEditors';
// import './mainThreadErrors';
// import './mainThreadExtensionService';
import './mainThreadFileSystemEventService';
// import './mainThreadHeapService';
import './mainThreadLanguageFeatures';
// import './mainThreadLanguages';
// import './mainThreadMessageService';
// import './mainThreadOutputService';
// import './mainThreadProgress';
import './mainThreadQuickOpen';
// import './mainThreadSCM';
// import './mainThreadSaveParticipant';
// import './mainThreadStatusBar';
// import './mainThreadStorage';
// import './mainThreadTask';
// import './mainThreadTelemetry';
// import './mainThreadTerminalService';
// import './mainThreadTreeViews';
// import './mainThreadWorkspace';

export class ExtHostContribution implements IWorkbenchContribution {

	constructor(
		@IThreadService private threadService: IThreadService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IExtensionService private extensionService: IExtensionService
	) {
		this.initExtensionSystem();
	}

	public getId(): string {
		return 'vs.api.extHost';
	}

	private initExtensionSystem(): void {
		const create = <T>(ctor: IConstructorSignature0<T>): T => {
			return this.instantiationService.createInstance(ctor);
		};

		let col = new InstanceCollection();

		const extHostContext = new class implements IExtHostContext {

			constructor(private readonly _threadService: IThreadService) {
			}

			get<T>(identifier: ProxyIdentifier<T>): T {
				return this._threadService.get<T>(identifier);
			}

			set<T>(identifier: ProxyIdentifier<T>, instance: T): void {
				col.define(identifier).set(instance);
			}
		}(this.threadService);

		// Addressable instances
		col.define(MainContext.MainThreadDiagnostics).set(create(MainThreadDiagnostics));
		col.define(MainContext.MainThreadDocumentContentProviders).set(create(MainThreadDocumentContentProviders));
		col.define(MainContext.MainThreadErrors).set(create(MainThreadErrors));
		col.define(MainContext.MainThreadTreeViews).set(create(MainThreadTreeViews));
		col.define(MainContext.MainThreadLanguages).set(create(MainThreadLanguages));
		col.define(MainContext.MainThreadMessageService).set(create(MainThreadMessageService));
		col.define(MainContext.MainThreadOutputService).set(create(MainThreadOutputService));
		col.define(MainContext.MainThreadProgress).set(create(MainThreadProgress));
		col.define(MainContext.MainThreadStatusBar).set(create(MainThreadStatusBar));
		col.define(MainContext.MainThreadStorage).set(create(MainThreadStorage));
		col.define(MainContext.MainThreadTelemetry).set(create(MainThreadTelemetry));
		col.define(MainContext.MainThreadTerminalService).set(create(MainThreadTerminalService));
		col.define(MainContext.MainThreadWorkspace).set(create(MainThreadWorkspace));
		col.define(MainContext.MainThreadSCM).set(create(MainThreadSCM));
		col.define(MainContext.MainThreadTask).set(create(MainThreadTask));
		col.define(MainContext.MainProcessExtensionService).set(create(MainProcessExtensionServiceAPI));

		// Registered named customers
		const namedCustomers = ExtHostCustomersRegistry.getNamedCustomers();
		for (let i = 0, len = namedCustomers.length; i < len; i++) {
			const [id, ctor] = namedCustomers[i];
			const obj = this.instantiationService.createInstance(ctor, extHostContext);
			col.define(id).set(obj);
		}

		// Registered customers
		const customers = ExtHostCustomersRegistry.getCustomers();
		for (let i = 0, len = customers.length; i < len; i++) {
			const ctor = customers[i];
			this.instantiationService.createInstance(ctor, extHostContext);
		}

		col.finish(true, this.threadService);

		col = null;

		// Other interested parties
		create(JSONValidationExtensionPoint); // TODO@rehost: can survive an ext host restart
		create(ColorExtensionPoint); // TODO@rehost: can survive an ext host restart
		this.instantiationService.createInstance(LanguageConfigurationFileHandler); // TODO@rehost: can survive an ext host restart
		create(SaveParticipant);
	}
}

// Register File Tracker
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	ExtHostContribution
);
