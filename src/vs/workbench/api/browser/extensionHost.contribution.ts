/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../common/contributions.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { buildFeatureDebugService, buildFeatureNotebooks, buildFeatureRemote, buildFeatureReview, buildFeatureTesting } from '../../../platform/product/common/buildFeatures.js';

// --- other interested parties
import { JSONValidationExtensionPoint } from '../common/jsonValidationExtensionPoint.js';
import { ColorExtensionPoint } from '../../services/themes/common/colorExtensionPoint.js';
import { IconExtensionPoint } from '../../services/themes/common/iconExtensionPoint.js';
import { TokenClassificationExtensionPoints } from '../../services/themes/common/tokenClassificationExtensionPoint.js';
import { LanguageConfigurationFileHandler } from '../../contrib/codeEditor/common/languageConfigurationExtensionPoint.js';
import { StatusBarItemsExtensionPoint } from './statusBarExtensionPoint.js';
import { CSSExtensionPoint } from '../../services/themes/browser/cssExtensionPoint.js';

// --- mainThread participants
import './mainThreadAgentEditorComments.js';
import './mainThreadLocalization.js';
import './mainThreadBulkEdits.js';
import './mainThreadLanguageModels.js';
import './mainThreadChatAgents2.js';
import './mainThreadChatArtifactIntegrations.js';
import './mainThreadChatCodeMapper.js';
import './mainThreadLanguageModelTools.js';
import './mainThreadEmbeddings.js';
import './mainThreadCodeInsets.js';
import './mainThreadCLICommands.js';
import './mainThreadClipboard.js';
import './mainThreadCommands.js';
import './mainThreadConfiguration.js';
import './mainThreadConsole.js';
if (buildFeatureDebugService) {
	await import('./mainThreadDebugService.js');
} else {
	// The extension host eagerly initializes its public Debug API in every
	// profile and expects this RPC channel even when the Debug service is off.
	await import('./mainThreadDebugServiceDisabled.js');
}
import './mainThreadDecorations.js';
import './mainThreadDiagnostics.js';
import './mainThreadDialogs.js';
import './mainThreadDocumentContentProviders.js';
import './mainThreadDocuments.js';
import './mainThreadDocumentsAndEditors.js';
import './mainThreadEditor.js';
import './mainThreadEditors.js';
import './mainThreadEditorTabs.js';
import './mainThreadErrors.js';
import './mainThreadExtensionService.js';
import './mainThreadFileSystem.js';
import './mainThreadFileSystemEventService.js';
import './mainThreadLanguageFeatures.js';
import './mainThreadLanguages.js';
import './mainThreadLogService.js';
import './mainThreadMessageService.js';
if (buildFeatureRemote) {
	await import('./mainThreadManagedSockets.js');
	await import('./mainThreadTunnelService.js');
	await import('./mainThreadRemoteConnectionData.js');
} else {
	// Extension hosts construct these public API proxies in every profile.
	// Register inert bridges when local-only builds omit remote services.
	await import('./mainThreadRemoteFeaturesDisabled.js');
}
import './mainThreadBrowserTunnelProxy.js';
import './mainThreadOutputService.js';
import './mainThreadProgress.js';
import './mainThreadQuickDiff.js';
import './mainThreadDocumentDiff.js';
import './mainThreadQuickOpen.js';
import './mainThreadSaveParticipant.js';
import './mainThreadSpeech.js';
import './mainThreadEditSessionIdentityParticipant.js';
import './mainThreadSCM.js';
import './mainThreadSearch.js';
import './mainThreadStatusBar.js';
import './mainThreadStorage.js';
import './mainThreadTelemetry.js';
import './mainThreadTerminalService.js';
import './mainThreadTerminalShellIntegration.js';
import './mainThreadTheming.js';
import './mainThreadTreeViews.js';
import './mainThreadDownloadService.js';
import './mainThreadUrls.js';
import './mainThreadUriOpeners.js';
import './mainThreadWindow.js';
import './mainThreadPower.js';
import './mainThreadGitHub.js';
import './mainThreadWebviewManager.js';
import './mainThreadWorkspace.js';
if (buildFeatureReview) {
	await import('./mainThreadComments.js');
} else {
	// ExtHostComments is part of the public extension API bootstrap in every
	// profile and eagerly requests this RPC proxy. Keep the channel registered
	// when review UI and its comment service are omitted from minimal builds.
	await import('./mainThreadCommentsDisabled.js');
}
if (buildFeatureNotebooks) {
	await import('./mainThreadNotebook.js');
	await import('./mainThreadNotebookKernels.js');
	await import('./mainThreadNotebookDocumentsAndEditors.js');
	await import('./mainThreadNotebookRenderers.js');
	await import('./mainThreadNotebookSaveParticipant.js');
	await import('./mainThreadInteractive.js');
} else {
	// Extension hosts eagerly initialize these public API proxies even when
	// notebook editors and execution are omitted from the workbench.
	await import('./mainThreadNotebooksDisabled.js');
}
import './mainThreadTask.js';
import './mainThreadLabelService.js';
import './mainThreadAuthentication.js';
import './mainThreadTimeline.js';
if (buildFeatureTesting) {
	await import('./mainThreadTesting.js');
} else {
	// The extension host initializes its Testing API proxy in every profile.
	await import('./mainThreadTestingDisabled.js');
}
import './mainThreadSecretState.js';
import './mainThreadShare.js';
import './mainThreadProfileContentHandlers.js';
import './mainThreadAiRelatedInformation.js';
import './mainThreadAiEmbeddingVector.js';
import './mainThreadAiSettingsSearch.js';
import './mainThreadMcp.js';
import './mainThreadChatContext.js';
import './mainThreadChatDebug.js';
import './mainThreadChatStatus.js';
import './mainThreadChatQuota.js';
import './mainThreadChatInputNotification.js';
import './mainThreadChatOutputRenderer.js';
import './mainThreadChatSessions.js';
import './mainThreadDataChannels.js';
import './mainThreadMeteredConnection.js';
import './mainThreadGitExtensionService.js';
import './mainThreadBrowsers.js';

export class ExtensionPoints implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.extensionPoints';

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
		this.instantiationService.createInstance(CSSExtensionPoint);
	}
}

registerWorkbenchContribution2(ExtensionPoints.ID, ExtensionPoints, WorkbenchPhase.BlockStartup);
