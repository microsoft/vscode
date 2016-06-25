/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IWorkbenchContribution} from 'vs/workbench/common/contributions';
import {Registry} from 'vs/platform/platform';
import {IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions} from 'vs/workbench/common/contributions';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {MainThreadDocuments} from 'vs/workbench/api/node/extHostDocuments';
import {MainProcessTextMateSyntax} from 'vs/editor/node/textMate/TMSyntax';
import {MainProcessTextMateSnippet} from 'vs/editor/node/textMate/TMSnippets';
import {JSONValidationExtensionPoint} from 'vs/platform/jsonschemas/common/jsonValidationExtensionPoint';
import {LanguageConfigurationFileHandler} from 'vs/editor/node/languageConfiguration';
import {MainThreadFileSystemEventService} from 'vs/workbench/api/node/extHostFileSystemEventService';
import {MainThreadQuickOpen} from 'vs/workbench/api/node/extHostQuickOpen';
import {MainThreadStatusBar} from 'vs/workbench/api/node/extHostStatusBar';
import {MainThreadCommands} from 'vs/workbench/api/node/extHostCommands';
import {RemoteTelemetryServiceHelper} from 'vs/workbench/api/node/extHostTelemetry';
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

export class ExtHostContribution implements IWorkbenchContribution {

	constructor(
		@IThreadService private threadService: IThreadService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this.initExtensionSystem();
	}

	public getId(): string {
		return 'vs.api.extHost';
	}

	private initExtensionSystem(): void {
		this.threadService.getRemotable(MainProcessVSCodeAPIHelper);
		this.threadService.getRemotable(MainThreadDocuments);
		this.threadService.getRemotable(RemoteTelemetryServiceHelper);
		this.instantiationService.createInstance(MainProcessTextMateSyntax);
		this.instantiationService.createInstance(MainProcessTextMateSnippet);
		this.instantiationService.createInstance(JSONValidationExtensionPoint);
		this.instantiationService.createInstance(LanguageConfigurationFileHandler);
		this.threadService.getRemotable(MainThreadConfiguration);
		this.threadService.getRemotable(MainThreadQuickOpen);
		this.threadService.getRemotable(MainThreadStatusBar);
		this.instantiationService.createInstance(MainThreadFileSystemEventService);
		this.threadService.getRemotable(MainThreadCommands);
		this.threadService.getRemotable(MainThreadOutputService);
		this.threadService.getRemotable(MainThreadDiagnostics);
		this.threadService.getRemotable(MainThreadMessageService);
		this.threadService.getRemotable(MainThreadLanguages);
		this.threadService.getRemotable(MainThreadWorkspace);
		this.threadService.getRemotable(MainThreadEditors);
		this.threadService.getRemotable(MainThreadStorage);
		this.threadService.getRemotable(MainThreadLanguageFeatures);
	}
}

// Register File Tracker
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	ExtHostContribution
);