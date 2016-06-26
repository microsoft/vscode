/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IWorkbenchContribution} from 'vs/workbench/common/contributions';
import {Registry} from 'vs/platform/platform';
import {IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions} from 'vs/workbench/common/contributions';
import {IInstantiationService, IConstructorSignature0} from 'vs/platform/instantiation/common/instantiation';
import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import {MainThreadDocuments} from 'vs/workbench/api/node/extHostDocuments';
import {MainProcessTextMateSyntax} from 'vs/editor/node/textMate/TMSyntax';
import {MainProcessTextMateSnippet} from 'vs/editor/node/textMate/TMSnippets';
import {JSONValidationExtensionPoint} from 'vs/platform/jsonschemas/common/jsonValidationExtensionPoint';
import {LanguageConfigurationFileHandler} from 'vs/editor/node/languageConfiguration';
import {MainThreadFileSystemEventService} from 'vs/workbench/api/node/extHostFileSystemEventService';
import {MainThreadQuickOpen} from 'vs/workbench/api/node/extHostQuickOpen';
import {MainThreadStatusBar} from 'vs/workbench/api/node/extHostStatusBar';
import {MainThreadCommands} from 'vs/workbench/api/node/extHostCommands';
import {MainThreadTelemetry} from 'vs/workbench/api/node/extHostTelemetry';
import {MainThreadDiagnostics} from 'vs/workbench/api/node/extHostDiagnostics';
import {MainThreadOutputService} from 'vs/workbench/api/node/extHostOutputService';
import {MainThreadMessageService} from 'vs/workbench/api/node/extHostMessageService';
import {MainThreadLanguages} from 'vs/workbench/api/node/extHostLanguages';
import {MainThreadEditors} from 'vs/workbench/api/node/extHostEditors';
import {MainThreadWorkspace} from 'vs/workbench/api/node/extHostWorkspace';
import {MainThreadConfiguration} from 'vs/workbench/api/node/extHostConfiguration';
import {MainThreadLanguageFeatures} from 'vs/workbench/api/node/extHostLanguageFeatures';
import {MainThreadStorage} from 'vs/workbench/api/node/extHostStorage';
import {MainProcessVSCodeAPIHelper} from 'vs/workbench/api/node/extHost.api.impl';
import {MainContext, InstanceCollection} from './extHostProtocol';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {MainProcessExtensionService} from './nativeExtensionService';

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

		// Addressable instances
		const col = new InstanceCollection();
		col.define(MainContext.MainProcessVSCodeAPIHelper).set(create(MainProcessVSCodeAPIHelper));
		col.define(MainContext.MainThreadCommands).set(create(MainThreadCommands));
		col.define(MainContext.MainThreadConfiguration).set(create(MainThreadConfiguration));
		col.define(MainContext.MainThreadDiagnostics).set(create(MainThreadDiagnostics));
		col.define(MainContext.MainThreadDocuments).set(create(MainThreadDocuments));
		col.define(MainContext.MainThreadEditors).set(create(MainThreadEditors));
		col.define(MainContext.MainThreadLanguageFeatures).set(create(MainThreadLanguageFeatures));
		col.define(MainContext.MainThreadLanguages).set(create(MainThreadLanguages));
		col.define(MainContext.MainThreadMessageService).set(create(MainThreadMessageService));
		col.define(MainContext.MainThreadOutputService).set(create(MainThreadOutputService));
		col.define(MainContext.MainThreadQuickOpen).set(create(MainThreadQuickOpen));
		col.define(MainContext.MainThreadStatusBar).set(create(MainThreadStatusBar));
		col.define(MainContext.MainThreadStorage).set(create(MainThreadStorage));
		col.define(MainContext.MainThreadTelemetry).set(create(MainThreadTelemetry));
		col.define(MainContext.MainThreadWorkspace).set(create(MainThreadWorkspace));
		if (this.extensionService instanceof MainProcessExtensionService) {
			col.define(MainContext.MainProcessExtensionService).set(<MainProcessExtensionService>this.extensionService);
		}
		col.finish(true, this.threadService);

		// Other interested parties
		create(MainProcessTextMateSyntax);
		create(MainProcessTextMateSnippet);
		create(JSONValidationExtensionPoint);
		create(LanguageConfigurationFileHandler);
		create(MainThreadFileSystemEventService);
	}
}

// Register File Tracker
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	ExtHostContribution
);