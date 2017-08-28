/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

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
import './mainThreadDialogs';
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
import './mainThreadWindow';
import './mainThreadWorkspace';

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
	ExtensionPoints
);
