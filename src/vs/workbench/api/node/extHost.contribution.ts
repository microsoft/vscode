/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/platform';
import { IInstantiationService, IConstructorSignature0 } from 'vs/platform/instantiation/common/instantiation';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { MainContext, InstanceCollection } from './extHost.protocol';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';

// --- addressable
import { MainThreadCommands } from './mainThreadCommands';
import { MainThreadConfiguration } from './mainThreadConfiguration';
import { MainThreadDiagnostics } from './mainThreadDiagnostics';
import { MainThreadDocuments } from './mainThreadDocuments';
import { MainThreadEditors } from './mainThreadEditors';
import { MainThreadErrors } from './mainThreadErrors';
import { MainThreadTreeExplorers } from './mainThreadTreeExplorers';
import { MainThreadLanguageFeatures } from './mainThreadLanguageFeatures';
import { MainThreadLanguages } from './mainThreadLanguages';
import { MainThreadMessageService } from './mainThreadMessageService';
import { MainThreadOutputService } from './mainThreadOutputService';
import { MainThreadProgress } from './mainThreadProgress';
import { MainThreadQuickOpen } from './mainThreadQuickOpen';
import { MainThreadStatusBar } from './mainThreadStatusBar';
import { MainThreadStorage } from './mainThreadStorage';
import { MainThreadTelemetry } from './mainThreadTelemetry';
import { MainThreadTerminalService } from './mainThreadTerminalService';
import { MainThreadWorkspace } from './mainThreadWorkspace';
import { MainProcessExtensionService } from './mainThreadExtensionService';
import { MainThreadFileSystemEventService } from './mainThreadFileSystemEventService';
import { MainThreadTask } from './mainThreadTask';
import { MainThreadSCM } from './mainThreadSCM';

// --- other interested parties
import { MainThreadDocumentsAndEditors } from './mainThreadDocumentsAndEditors';
import { JSONValidationExtensionPoint } from 'vs/platform/jsonschemas/common/jsonValidationExtensionPoint';
import { LanguageConfigurationFileHandler } from 'vs/editor/node/languageConfigurationExtensionPoint';
import { SaveParticipant } from './mainThreadSaveParticipant';

// --- registers itself as service
import './mainThreadHeapService';

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

		const documentsAndEditors = this.instantiationService.createInstance(MainThreadDocumentsAndEditors);

		// Addressable instances
		const col = new InstanceCollection();
		col.define(MainContext.MainThreadCommands).set(create(MainThreadCommands));
		col.define(MainContext.MainThreadConfiguration).set(create(MainThreadConfiguration));
		col.define(MainContext.MainThreadDiagnostics).set(create(MainThreadDiagnostics));
		col.define(MainContext.MainThreadDocuments).set(this.instantiationService.createInstance(MainThreadDocuments, documentsAndEditors));
		col.define(MainContext.MainThreadEditors).set(this.instantiationService.createInstance(MainThreadEditors, documentsAndEditors));
		col.define(MainContext.MainThreadErrors).set(create(MainThreadErrors));
		col.define(MainContext.MainThreadExplorers).set(create(MainThreadTreeExplorers));
		col.define(MainContext.MainThreadLanguageFeatures).set(create(MainThreadLanguageFeatures));
		col.define(MainContext.MainThreadLanguages).set(create(MainThreadLanguages));
		col.define(MainContext.MainThreadMessageService).set(create(MainThreadMessageService));
		col.define(MainContext.MainThreadOutputService).set(create(MainThreadOutputService));
		col.define(MainContext.MainThreadProgress).set(create(MainThreadProgress));
		col.define(MainContext.MainThreadQuickOpen).set(create(MainThreadQuickOpen));
		col.define(MainContext.MainThreadStatusBar).set(create(MainThreadStatusBar));
		col.define(MainContext.MainThreadStorage).set(create(MainThreadStorage));
		col.define(MainContext.MainThreadTelemetry).set(create(MainThreadTelemetry));
		col.define(MainContext.MainThreadTerminalService).set(create(MainThreadTerminalService));
		col.define(MainContext.MainThreadWorkspace).set(create(MainThreadWorkspace));
		col.define(MainContext.MainThreadSCM).set(create(MainThreadSCM));
		col.define(MainContext.MainThreadTask).set(create(MainThreadTask));
		if (this.extensionService instanceof MainProcessExtensionService) {
			col.define(MainContext.MainProcessExtensionService).set(<MainProcessExtensionService>this.extensionService);
		}
		col.finish(true, this.threadService);

		// Other interested parties
		create(JSONValidationExtensionPoint);
		this.instantiationService.createInstance(LanguageConfigurationFileHandler);
		create(MainThreadFileSystemEventService);
		create(SaveParticipant);
	}
}

// Register File Tracker
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	ExtHostContribution
);
