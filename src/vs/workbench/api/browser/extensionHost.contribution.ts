/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

// --- other interested parties
import { JSONValidationExtensionPoint } from 'vs/workbench/api/common/jsonValidationExtensionPoint';
import { ColorExtensionPoint } from 'vs/workbench/services/themes/common/colorExtensionPoint';
import { IconExtensionPoint } from 'vs/workbench/services/themes/common/iconExtensionPoint';
import { TokenClassificationExtensionPoints } from 'vs/workbench/services/themes/common/tokenClassificationExtensionPoint';
import { LanguageConfigurationFileHandler } from 'vs/workbench/contrib/codeEditor/browser/languageConfigurationExtensionPoint';
import { StatusBarItemsExtensionPoint } from 'vs/workbench/api/browser/statusBarExtensionPoint';

// --- mainThread participants
import './mainThreadLocalization';
import './mainThreadBulkEdits';
import './mainThreadChatProvider';
import './mainThreadChatSlashCommands';
import './mainThreadChatVariables';
import './mainThreadCodeInsets';
import './mainThreadCLICommands';
import './mainThreadClipboard';
import './mainThreadCommands';
import './mainThreadConfiguration';
import './mainThreadConsole';
import './mainThreadDebugService';
import './mainThreadDecorations';
import './mainThreadDiagnostics';
import './mainThreadDialogs';
import './mainThreadDocumentContentProviders';
import './mainThreadDocuments';
import './mainThreadDocumentsAndEditors';
import './mainThreadEditor';
import './mainThreadEditors';
import './mainThreadEditorTabs';
import './mainThreadErrors';
import './mainThreadExtensionService';
import './mainThreadFileSystem';
import './mainThreadFileSystemEventService';
import './mainThreadKeytar';
import './mainThreadLanguageFeatures';
import './mainThreadLanguages';
import './mainThreadLogService';
import './mainThreadMessageService';
import './mainThreadManagedSockets';
import './mainThreadOutputService';
import './mainThreadProgress';
import './mainThreadQuickDiff';
import './mainThreadQuickOpen';
import './mainThreadRemoteConnectionData';
import './mainThreadSaveParticipant';
import './mainThreadEditSessionIdentityParticipant';
import './mainThreadSCM';
import './mainThreadSearch';
import './mainThreadStatusBar';
import './mainThreadStorage';
import './mainThreadTelemetry';
import './mainThreadTerminalService';
import './mainThreadTheming';
import './mainThreadTreeViews';
import './mainThreadDownloadService';
import './mainThreadUrls';
import './mainThreadUriOpeners';
import './mainThreadWindow';
import './mainThreadWebviewManager';
import './mainThreadWorkspace';
import './mainThreadComments';
import './mainThreadNotebook';
import './mainThreadNotebookKernels';
import './mainThreadNotebookDocumentsAndEditors';
import './mainThreadNotebookRenderers';
import './mainThreadNotebookSaveParticipant';
import './mainThreadInteractive';
import './mainThreadInlineChat';
import './mainThreadChat';
import './mainThreadTask';
import './mainThreadLabelService';
import './mainThreadTunnelService';
import './mainThreadAuthentication';
import './mainThreadTimeline';
import './mainThreadTesting';
import './mainThreadSecretState';
import './mainThreadShare';
import './mainThreadProfilContentHandlers';
import './mainThreadAiRelatedInformation';
import './mainThreadAiEmbeddingVector';
import './mainThreadIssueReporter';

export class ExtensionPoints implements IWorkbenchContribution {

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		// Classes that handle extension points...
		this.instantiationService.createInstance(JSONValidationExtensionPoint);
		this.instantiationService.createInstance(ColorExtensionPoint);
		this.instantiationService.createInstance(IconExtensionPoint);
		this.instantiationService.createInstance(TokenClassificationExtensionPoints);
		this.instantiationService.createInstance(LanguageConfigurationFileHandler);
		this.instantiationService.createInstance(StatusBarItemsExtensionPoint);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ExtensionPoints, LifecyclePhase.Starting);
