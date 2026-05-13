/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, languages, window } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IEnvService } from '../../../platform/env/common/envService';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { InlineEditRequestLogContext } from '../../../platform/inlineEdits/common/inlineEditLogContext';
import { ObservableGit } from '../../../platform/inlineEdits/common/observableGit';
import { NesHistoryContextProvider } from '../../../platform/inlineEdits/common/workspaceEditTracker/nesHistoryContextProvider';
import { ILogService } from '../../../platform/log/common/logService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { isNotebookCell } from '../../../util/common/notebooks';
import { Disposable, IDisposable } from '../../../util/vs/base/common/lifecycle';
import { autorun, derived, derivedDisposable, observableFromEvent } from '../../../util/vs/base/common/observable';
import { join } from '../../../util/vs/base/common/path';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IExtensionContribution } from '../../common/contributions';
import { unificationStateObservable } from '../../completions/vscode-node/completionsUnificationContribution';
import { TelemetrySender } from '../node/nextEditProviderTelemetry';
import { ExpectedEditCaptureController } from './components/expectedEditCaptureController';
import { InlineEditDebugComponent, reportFeedbackCommandId } from './components/inlineEditDebugComponent';
import { LogContextRecorder } from './components/logContextRecorder';
import { DiagnosticsNextEditProvider } from './features/diagnosticsInlineEditProvider';
import { InlineCompletionProviderImpl } from './inlineCompletionProvider';
import { InlineEditModel } from './inlineEditModel';
import { InlineEditLogger } from './parts/inlineEditLogger';
import { VSCodeWorkspace } from './parts/vscodeWorkspace';
import { makeSettable } from './utils/observablesUtils';

const useEnhancedNotebookNESContextKey = 'github.copilot.chat.enableEnhancedNotebookNES';

export class InlineEditProviderFeatureContribution extends Disposable implements IExtensionContribution {

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IExperimentationService _experimentationService: IExperimentationService,
	) {
		super();

		const logger = this._logService.createSubLogger(['NES', 'Feature']);

		const inlineEditProviderFeature = this._instantiationService.createInstance(InlineEditProviderFeature);
		this._register(inlineEditProviderFeature.registerProvider());
		this._register(inlineEditProviderFeature.setContext());

		logger.trace('Return: void');
	}
}

export class InlineEditProviderFeature {

	private readonly _inlineEditsProviderId = makeSettable(this._configurationService.getExperimentBasedConfigObservable(ConfigKey.TeamInternal.InlineEditsProviderId, this._expService));

	private readonly _hideInternalInterface = this._configurationService.getConfigObservable(ConfigKey.TeamInternal.InlineEditsHideInternalInterface);
	private readonly _enableDiagnosticsProvider = this._configurationService.getExperimentBasedConfigObservable(ConfigKey.InlineEditsEnableDiagnosticsProvider, this._expService);
	private readonly _yieldToCopilot = this._configurationService.getExperimentBasedConfigObservable(ConfigKey.TeamInternal.InlineEditsYieldToCopilot, this._expService);
	private readonly _excludedProviders = this._configurationService.getExperimentBasedConfigObservable(ConfigKey.TeamInternal.InlineEditsExcludedProviders, this._expService).map(v => v ? v.split(',').map(v => v.trim()).filter(v => v !== '') : []);
	private readonly _copilotToken = observableFromEvent(this, this._authenticationService.onDidAuthenticationChange, () => this._authenticationService.copilotToken);

	public readonly inlineEditsEnabled = derived(this, (reader) => {
		const copilotToken = this._copilotToken.read(reader);
		if (copilotToken === undefined) {
			return false;
		}
		if (copilotToken.isCompletionsQuotaExceeded) {
			return false;
		}
		return true;
	});

	private readonly _internalActionsEnabled = derived(this, (reader) => {
		return !!this._copilotToken.read(reader)?.isInternal && !this._hideInternalInterface.read(reader);
	});

	public readonly isInlineEditsLogFileEnabledObservable = this._configurationService.getConfigObservable(ConfigKey.TeamInternal.InlineEditsLogContextRecorderEnabled);

	private readonly _workspace = derivedDisposable(this, _reader => {
		return this._instantiationService.createInstance(VSCodeWorkspace);
	});

	constructor(
		@IVSCodeExtensionContext private readonly _vscodeExtensionContext: IVSCodeExtensionContext,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IExperimentationService private readonly _expService: IExperimentationService,
		@IEnvService private readonly _envService: IEnvService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
	}

	public setContext(): IDisposable {
		// TODO: this should be reactive to config changes
		const enableEnhancedNotebookNES = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.UseAlternativeNESNotebookFormat, this._expService) || this._configurationService.getExperimentBasedConfig(ConfigKey.UseAlternativeNESNotebookFormat, this._expService);
		commands.executeCommand('setContext', useEnhancedNotebookNESContextKey, enableEnhancedNotebookNES);

		// Set context key for inline edits enabled state (used for keybindings)
		return autorun((reader) => {
			const enabled = this.inlineEditsEnabled.read(reader);
			void commands.executeCommand('setContext', 'github.copilot.inlineEditsEnabled', enabled);
		});
	}

	public registerProvider(): IDisposable {
		const unificationState = unificationStateObservable(this);

		return autorun(reader => {
			if (!this.inlineEditsEnabled.read(reader)) { return; }

			const logger = reader.store.add(this._instantiationService.createInstance(InlineEditLogger));

			const statelessProviderId = this._inlineEditsProviderId.read(reader);

			const workspace = this._workspace.read(reader);
			const git = reader.store.add(this._instantiationService.createInstance(ObservableGit));
			const historyContextProvider = new NesHistoryContextProvider(workspace, git);

			let diagnosticsProvider: DiagnosticsNextEditProvider | undefined = undefined;
			if (this._enableDiagnosticsProvider.read(reader)) {
				diagnosticsProvider = reader.store.add(this._instantiationService.createInstance(DiagnosticsNextEditProvider, workspace, git));
			}

			const model = reader.store.add(this._instantiationService.createInstance(InlineEditModel, statelessProviderId, workspace, historyContextProvider, diagnosticsProvider));

			const recordingDirPath = join(this._vscodeExtensionContext.globalStorageUri.fsPath, 'logContextRecordings');

			const isInlineEditLogFileEnabled = this.isInlineEditsLogFileEnabledObservable.read(reader);

			let logContextRecorder: LogContextRecorder | undefined;
			if (isInlineEditLogFileEnabled) {
				logContextRecorder = reader.store.add(this._instantiationService.createInstance(LogContextRecorder, recordingDirPath, logger));
			} else {
				void LogContextRecorder.cleanupOldRecordings(recordingDirPath);
			}

			const inlineEditDebugComponent = reader.store.add(new InlineEditDebugComponent(this._internalActionsEnabled, this.inlineEditsEnabled, model.debugRecorder, this._inlineEditsProviderId));

			const telemetrySender = reader.store.add(this._instantiationService.createInstance(TelemetrySender, workspace));

			// Create the expected edit capture controller
			const expectedEditCaptureController = reader.store.add(this._instantiationService.createInstance(
				ExpectedEditCaptureController,
				model.debugRecorder
			));

			const provider = this._instantiationService.createInstance(InlineCompletionProviderImpl, model, logger, logContextRecorder, inlineEditDebugComponent, telemetrySender, expectedEditCaptureController);

			const unificationStateValue = unificationState.read(reader);
			let excludes = this._excludedProviders.read(reader);
			if (unificationStateValue?.modelUnification) {
				excludes = excludes.slice(0);
				if (!excludes.includes('completions')) {
					excludes.push('completions');
				}
				if (!excludes.includes('github.copilot')) {
					excludes.push('github.copilot');
				}
			}

			reader.store.add(languages.registerInlineCompletionItemProvider('*', provider, {
				displayName: provider.displayName,
				yieldTo: this._yieldToCopilot.read(reader) ? ['github.copilot'] : undefined,
				debounceDelayMs: 0, // set 0 debounce to ensure consistent delays/timings
				groupId: 'nes',
				excludes,
			}));

			reader.store.add(commands.registerCommand(learnMoreCommandId, () => {
				this._envService.openExternal(URI.parse(learnMoreLink));
			}));

			reader.store.add(commands.registerCommand(clearCacheCommandId, () => {
				model.nextEditProvider.clearCache();
			}));

			reader.store.add(commands.registerCommand(reportNotebookNESIssueCommandId, () => {
				const activeNotebook = window.activeNotebookEditor;
				const document = window.activeTextEditor?.document;
				if (!activeNotebook || !document || !isNotebookCell(document.uri)) {
					return;
				}
				const doc = model.workspace.getDocumentByTextDocument(document);
				const selection = activeNotebook.selection;
				if (!selection || !doc) {
					return;
				}

				const logContext = new InlineEditRequestLogContext(doc.id.uri, document.version, undefined);
				logContext.recordingBookmark = model.debugRecorder.createBookmark();
				void commands.executeCommand(reportFeedbackCommandId, { logContext });
			}));

			// Register expected edit capture commands
			reader.store.add(commands.registerCommand(captureExpectedStartCommandId, () => {
				void expectedEditCaptureController.startCapture('manual');
			}));

			reader.store.add(commands.registerCommand(captureExpectedConfirmCommandId, () => {
				void expectedEditCaptureController.confirmCapture();
			}));

			reader.store.add(commands.registerCommand(captureExpectedAbortCommandId, () => {
				void expectedEditCaptureController.abortCapture();
			}));

			reader.store.add(commands.registerCommand(captureExpectedSubmitCommandId, () => {
				void expectedEditCaptureController.submitCaptures();
			}));
		});
	}
}

export const learnMoreCommandId = 'github.copilot.debug.inlineEdit.learnMore';

export const learnMoreLink = 'https://aka.ms/vscode-nes';

export const clearCacheCommandId = 'github.copilot.debug.inlineEdit.clearCache';
export const reportNotebookNESIssueCommandId = 'github.copilot.debug.inlineEdit.reportNotebookNESIssue';
export const captureExpectedStartCommandId = 'github.copilot.nes.captureExpected.start';
export const captureExpectedConfirmCommandId = 'github.copilot.nes.captureExpected.confirm';
export const captureExpectedAbortCommandId = 'github.copilot.nes.captureExpected.abort';
export const captureExpectedSubmitCommandId = 'github.copilot.nes.captureExpected.submit';
