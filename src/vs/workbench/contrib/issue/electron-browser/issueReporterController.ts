/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../browser/media/issueReporterOverlay.css';
import { $, append, clearNode, Dimension } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { disposableTimeout, timeout } from '../../../../base/common/async.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { FileAccess, Schemas } from '../../../../base/common/network.js';
import { IssueReporterEditorInput } from '../browser/issueReporterEditorInput.js';
import { IIssueReporterAttachmentImport, IssueReporterOverlay } from '../browser/issueReporterOverlay.js';
import { getIssueReporterMediaFormat, readIssueReporterImage, readIssueReporterMediaFile } from '../browser/issueReporterMedia.js';
import { IRecordingService, IRecordingData, RecordingState, ScreenCapturePermissionStatus, shouldShowScreenCapturePermissionSettings } from '../browser/recordingService.js';
import { IScreenshotService } from '../browser/screenshotService.js';
import { IIssueFormService } from '../common/issue.js';
import { IProcessService } from '../../../../platform/process/common/process.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import product from '../../../../platform/product/common/product.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { ChatMessageRole, ILanguageModelsService } from '../../chat/common/languageModels.js';
import { IChatUtilityModelService } from '../../chat/common/chatUtilityModelService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IUpdateService, StateType } from '../../../../platform/update/common/update.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';

/** True while a report is open, including a dedicated window or an inactive editor tab. */
export const IssueReporterOpenContext = new RawContextKey<boolean>('issueReporterOpen', false);

export interface IIssueReporterHost {
	reveal(): Promise<void>;
	close(): void;
	getPreviewGroup?(): IEditorGroup;
}

export class IssueReporterController extends Disposable {
	private static readonly liveInstances = new Set<IssueReporterController>();
	private static readonly _onDidChangeInstances = new Emitter<void>();
	static readonly onDidChangeInstances = this._onDidChangeInstances.event;

	static getAnyLiveInstance(): IssueReporterController | undefined {
		for (const inst of IssueReporterController.liveInstances) {
			if (inst.wizard && inst.wizardInput && inst.wizard.getPanel().contains(inst.wizardInput.descriptionInput)) {
				return inst;
			}
		}
		return undefined;
	}

	private wizard: IssueReporterOverlay | undefined;
	private wizardInput: IssueReporterEditorInput | undefined;
	private readonly inputDisposables = this._register(new DisposableStore());
	private readonly inputStateCallbacks = this._register(new MutableDisposable());
	private hasRequestedScreenCapturePermission = false;
	private pendingRecordingStart: Promise<void> | undefined;
	private pendingRecordingStop: Promise<void> | undefined;
	private recordingGeneration = 0;
	private recordingOwner: IssueReporterOverlay | undefined;

	constructor(
		private readonly container: HTMLElement,
		private readonly host: IIssueReporterHost,
		@IRecordingService private readonly recordingService: IRecordingService,
		@IScreenshotService private readonly screenshotService: IScreenshotService,
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IEditorService private readonly editorService: IEditorService,
		@IIssueFormService private readonly issueFormService: IIssueFormService,
		@IProcessService private readonly processService: IProcessService,
		@IWorkbenchAssignmentService private readonly experimentService: IWorkbenchAssignmentService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IChatUtilityModelService private readonly chatUtilityModelService: IChatUtilityModelService,
		@INotificationService private readonly notificationService: INotificationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IUpdateService private readonly updateService: IUpdateService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) {
		super();
		IssueReporterController.liveInstances.add(this);
		this._register(toDisposable(() => {
			IssueReporterController.liveInstances.delete(this);
			IssueReporterController._onDidChangeInstances.fire();
		}));
	}

	getWizard(): IssueReporterOverlay | undefined {
		return this.wizard;
	}

	getInput(): IssueReporterEditorInput | undefined {
		return this.wizardInput;
	}

	async revealAndActivate(): Promise<void> {
		if (this.wizardInput) {
			await this.host.reveal();
		}
	}

	private shouldShowUpdateBanner(): boolean {
		return this.updateService.state.type === StateType.AvailableForDownload
			|| this.updateService.state.type === StateType.Ready
			|| this.updateService.state.type === StateType.Downloaded;
	}

	setInput(input: IssueReporterEditorInput): void {
		if (input.isDisposed() || this._store.isDisposed) {
			return;
		}

		for (const controller of IssueReporterController.liveInstances) {
			if (controller !== this && controller.wizardInput === input) {
				controller.destroyWizard();
			}
		}

		// If the wizard is already built and its DOM is still attached, re-parent floating bar if needed
		if (this.wizard && this.wizardInput === input && this.container.contains(this.wizard.getPanel())) {
			this.bindInputCallbacks(input, this.wizard);
			this.wizard.restoreDescriptionInput();
			this.wizard.reparentFloatingBar();
			this.wizard.showFloatingBar();
			this.wizard.setUpdateAvailable(this.shouldShowUpdateBanner());
			// Restore attachments captured before the editor was moved back into
			// this pane from a modal editor part. The input is the source of truth;
			// the existing onDidChangeAttachments subscription keeps it in sync.
			this.restoreAttachmentsFromInput(input);
			return;
		}

		this.destroyWizard();
		this.wizardInput = input;

		const data = input.data;
		if (!data) {
			const msg = append(this.container, $('p'));
			msg.textContent = localize('noData', "No issue reporter data available.");
			return;
		}

		// Create the wizard — renders inside this container
		this.wizard = this.instantiationService.createInstance(IssueReporterOverlay,
			data,
			input,
			this.recordingService.isSupported,
			this.container,
			this.contextViewService,
			this.contextMenuService,
			true,
			extensionId => this.issueFormService.sendReporterMenu(extensionId),
			async url => { await this.openerService.open(URI.parse(url), { openExternal: true }); },
			this.shouldShowUpdateBanner(),
			() => this.refreshPerformanceInfo(),
			commandId => this.keybindingService.lookupKeybinding(commandId),
			input.diagnosticsState,
			this.layoutService.getContainer(mainWindow),
		);
		this.inputDisposables.add(this.wizard);
		const wizard = this.wizard;
		const mediaCancellation = new CancellationTokenSource();
		this.inputDisposables.add(toDisposable(() => mediaCancellation.dispose(true)));
		this.inputDisposables.add(wizard.onDidRequestAddAttachments(files => {
			void this.importAttachments(files, wizard, input, mediaCancellation.token);
		}));
		this.inputDisposables.add(this.updateService.onStateChange(() => this.wizard?.setUpdateAvailable(this.shouldShowUpdateBanner())));

		this.bindInputCallbacks(input, wizard);

		this.inputDisposables.add(this.wizard.onDidClose(() => {
			this.host.close();
		}));

		this.inputDisposables.add(input.onWillDispose(() => {
			this.destroyWizard();
		}));

		this.wizard.show();
		IssueReporterController._onDidChangeInstances.fire();

		// Restore attachments mirrored onto the input before a move, and keep the
		// input in sync as attachments change so they survive the wizard being
		// rebuilt when the editor moves between the main editor area and a modal
		// editor part in the Agents Window.
		this.restoreAttachmentsFromInput(input);
		this.inputDisposables.add(wizard.onDidChangeAttachments(() => {
			input.savedAttachments = wizard.getAttachments();
		}));

		// Populate system info in background (non-blocking)
		void this.populateSystemInfo();

		// Wire screenshot capture
		this.inputDisposables.add(wizard.onDidRequestScreenshot(async id => {
			const isCurrent = () => this.wizard === wizard && !mediaCancellation.token.isCancellationRequested;
			try {
				// Conditionally hide the floating bar based on user setting
				const shouldHide = wizard.shouldHideToolbarForCapture;
				if (shouldHide) {
					wizard.hideFloatingBar();

					// Small delay to let the bar disappear before capture
					await timeout(100, mediaCancellation.token);
				}

				const dataUrl = await this.screenshotService.captureScreenshot();

				// Show bar again after capture
				if (shouldHide && isCurrent()) {
					disposableTimeout(() => wizard.showFloatingBar(), 1000, this.inputDisposables);
				}

				if (!dataUrl || !isCurrent()) {
					return;
				}

				const dimensions = await this.readAttachmentImage(dataUrl, mediaCancellation.token);
				if (!isCurrent()) {
					return;
				}
				wizard.addScreenshot({ dataUrl, ...dimensions }, id);

				// Bring the wizard back into focus after the capture in case
				// the user switched editors/groups while setting up the shot.
				await this.revealAndActivate();
			} catch (err) {
				if (isCurrent()) {
					disposableTimeout(() => wizard.showFloatingBar(), 1000, this.inputDisposables);
					this.logService.error('[IssueReporterEditorPane] Screenshot failed:', err);
				}
			} finally {
				wizard.completeScreenshotCapture(id);
			}
		}));

		// Wire recording start
		this.inputDisposables.add(this.wizard.onDidRequestStartRecording(() => this.startRecording()));

		// Wire recording stop (user-initiated)
		this.inputDisposables.add(this.wizard.onDidRequestStopRecording(() => this.stopRecording()));

		// Handle auto-stop triggered by the recording service (e.g. size limit reached)
		this.inputDisposables.add(this.recordingService.onDidChangeState(state => {
			// Only handle auto-stop: if the service stopped on its own while the wizard
			// still thinks we're recording (user didn't press Stop manually)
			if (state === RecordingState.Stopped && this.wizard?.recordingState === RecordingState.Recording) {
				void this.stopRecording();
			}
		}));
		this.inputDisposables.add(this.recordingService.onDidFailRecording(error => {
			if (this.wizard && this.recordingOwner === this.wizard) {
				this.recordingOwner = undefined;
				this.wizard.setRecordingState(RecordingState.Idle);
				this.showRecordingError(error);
			}
		}));

		this.inputDisposables.add(this.wizard.onDidRequestOpenFile(async (filePath) => {
			try {
				const resource = URI.file(filePath);
				await this.filesConfigurationService.updateReadonly(resource, new MarkdownString(localize('attachmentReadonly', "Issue reporter attachments are read-only. Edit the original file and attach it again.")));
				const isQuickTime = getIssueReporterMediaFormat(filePath)?.mimeType === 'video/quicktime';
				await this.editorService.openEditor({ resource, ...(isQuickTime ? { options: { override: 'vscode.videoPreview' } } : {}) }, this.host.getPreviewGroup?.());
			} catch (err) {
				this.logService.error('[IssueReporterEditorPane] Open attachment failed:', err);
				this.notificationService.error(localize('attachmentPreviewFailed', "Could not open the attachment: {0}", toErrorMessage(err)));
			}
		}));

		// Wire submit — delegate to form service for upload + open URL
		this.inputDisposables.add(wizard.onDidSubmit(async ({ title, body }) => {
			if (this.wizard !== wizard) {
				return;
			}
			try {
				const opened = await this.issueFormService.submitIssue(wizard, data, title, body, input.submissionSignal);
				if (opened && this.wizard === wizard) {
					// User opened the link — keep the wizard editable, but offer an explicit close action.
					wizard.markPreviewOpened();
					wizard.showCloseButton();
				}
			} catch (error) {
				if (!isCancellationError(error)) {
					this.logService.error('[IssueReporterEditorPane] Submit failed:', error);
				}
			}
		}));

		// Wire AI title generation
		this.inputDisposables.add(this.wizard.onDidRequestGenerateTitle(async (description) => {
			const isCurrent = () => this.wizard === wizard && !mediaCancellation.token.isCancellationRequested;
			try {
				// Wait for installed extensions to be registered so the Copilot Chat
				// extension has had a chance to contribute its `copilot` language
				// model vendor before we try to resolve a model. (Other call sites
				// like the chat thinking title generator are reached after Copilot
				// has already activated; we're the only place that can be invoked
				// before it has.)
				await this.extensionService.whenInstalledExtensionsRegistered();
				if (!isCurrent()) {
					return;
				}

				// `copilot-utility-small` matches what other utility callers in the
				// workbench use (chat thinking summaries, tool-risk assessment,
				// chat-edit explanations). The earlier `copilot-fast` id never
				// existed and was the root cause of the empty-result regression.
				const modelIds = await this.languageModelsService.selectLanguageModels({ vendor: 'copilot', id: 'copilot-utility-small' });
				if (!isCurrent()) {
					return;
				}
				if (modelIds.length === 0) {
					this.logService.warn('[IssueReporterEditorPane] No language models available for title generation');
					wizard.resetGenerateButton();
					return;
				}
				const modelId = modelIds[0];
				const response = await this.chatUtilityModelService.sendRequest({
					purpose: 'issueTitle',
					model: modelId,
					messages: [{
						role: ChatMessageRole.User,
						content: [{
							type: 'text',
							value: `Generate a concise issue title (max 10 words, no quotes, no prefix like "Bug:" or "Feature:") for this bug report description:\n\n${description}`,
						}],
					}],
				}, mediaCancellation.token);
				if (!isCurrent()) {
					return;
				}
				const title = (response ?? '').trim().replace(/^["']|["']$/g, '');
				if (title) {
					wizard.setGeneratedTitle(title);
				} else {
					wizard.resetGenerateButton();
				}
			} catch (err) {
				if (isCurrent() && !isCancellationError(err)) {
					this.logService.error('[IssueReporterEditorPane] Title generation failed:', err);
					wizard.resetGenerateButton();
				}
			}
		}));
	}

	protected readAttachmentImage(dataUrl: string, token: CancellationToken): Promise<{ width: number; height: number }> {
		return readIssueReporterImage(dataUrl, token);
	}

	/** Use the default-profile file root already trusted by the native resource protocol. */
	private get mediaStorageHome(): URI {
		return this.userDataProfilesService.defaultProfile.globalStorageHome.with({ scheme: Schemas.file });
	}

	protected async importAttachments(files: readonly IIssueReporterAttachmentImport[], wizard: IssueReporterOverlay, input: IssueReporterEditorInput, token: CancellationToken): Promise<void> {
		const isCurrent = () => this.wizard === wizard && this.wizardInput === input && !input.isDisposed() && !token.isCancellationRequested;
		for (const { id, file } of files) {
			let target: URI | undefined;
			try {
				if (!isCurrent()) {
					throw new CancellationError();
				}
				const { format, bytes } = await readIssueReporterMediaFile(file, token);
				if (!isCurrent()) {
					throw new CancellationError();
				}
				const folder = URI.joinPath(this.mediaStorageHome, 'issue-attachments');
				await this.fileService.createFolder(folder);
				if (!isCurrent()) {
					throw new CancellationError();
				}
				target = URI.joinPath(folder, `import-${generateUuid()}.${format.extension}`);
				await this.fileService.writeFile(target, bytes);
				if (!isCurrent()) {
					throw new CancellationError();
				}
				const added = wizard.completeAttachmentImport(id, {
					filePath: target.fsPath,
					name: file.name || `attachment.${format.extension}`,
					mimeType: format.mimeType,
					thumbnailDataUrl: format.kind === 'image' ? `data:${format.mimeType};base64,${encodeBase64(bytes)}` : undefined,
				});
				if (added && target) {
					const ownedFile = target;
					input.registerImportedFile(ownedFile.fsPath, importedFileCleanup(ownedFile, this.fileService, this.filesConfigurationService, this.logService));
					target = undefined;
				}
			} catch (error) {
				wizard.completeAttachmentImport(id, undefined, isCurrent() && !isCancellationError(error)
					? localize('attachmentImportFailed', "Could not attach {0}: {1}", file.name || localize('unnamedAttachment', "Clipboard attachment"), toErrorMessage(error))
					: undefined);
			} finally {
				if (target) {
					await deleteImportedFile(target, this.fileService, this.logService);
				}
			}
		}
	}

	private async fetchPerformanceInfo(options?: { skipCache?: boolean; unbounded?: boolean }): Promise<void> {
		const wizard = this.wizard;
		if (!wizard) {
			return;
		}
		try {
			const performanceInfo = await this.processService.getPerformanceInfo(options);
			if (this.wizard !== wizard) {
				return;
			}
			wizard.updateModel({
				processInfo: performanceInfo.processInfo,
				workspaceInfo: performanceInfo.workspaceInfo,
			});
		} catch (err) {
			if (this.wizard === wizard) {
				this.logService.error('[IssueReporterEditorPane] Failed to fetch performance info:', err);
			}
		} finally {
			if (this.wizard === wizard) {
				wizard.markPerformanceInfoLoaded();
			}
		}
	}

	private async refreshPerformanceInfo(): Promise<void> {
		// User-initiated refresh: bypass the workspace-stats cache and walk the
		// full filesystem (no cap) so the reported file counts and file-type
		// breakdown reflect the actual workspace.
		await this.fetchPerformanceInfo({ skipCache: true, unbounded: true });
	}

	private async populateSystemInfo(): Promise<void> {
		const wizard = this.wizard;
		if (!wizard) {
			return;
		}

		const input = this.wizardInput;
		const data = input?.data;

		try {
			// Version info
			const vscodeVersion = `${product.nameShort} ${!!product.darwinUniversalAssetId ? `${product.version} (Universal)` : product.version} (${product.commit || 'Commit unknown'}, ${product.date || 'Date unknown'})`;
			const systemInfo = await this.processService.getSystemInfo();
			if (this.wizard !== wizard) {
				return;
			}
			wizard.updateModel({
				versionInfo: { vscodeVersion, os: systemInfo.os },
				systemInfo,
				systemInfoWeb: navigator.userAgent,
			});

			// Honour `issueReporter.wizard.fullWorkspaceScan` only on the automatic
			// (initial) collection. The user-initiated refresh below is always
			// unbounded — the user has explicitly asked for fresh data and the
			// button shows a spinner while it runs.
			const fullScan = this.configurationService.getValue<boolean>('issueReporter.wizard.fullWorkspaceScan') !== false;
			await this.fetchPerformanceInfo({ unbounded: fullScan });
		} catch (err) {
			if (this.wizard === wizard) {
				this.logService.error('[IssueReporterEditorPane] Failed to collect system info:', err);
				wizard.markPerformanceInfoLoaded();
			}
		}
		if (this.wizard !== wizard) {
			return;
		}

		// Experiments (independent from system info)
		try {
			const experiments = await this.experimentService.getCurrentExperiments();
			if (this.wizard !== wizard) {
				return;
			}
			wizard.updateModel({ experimentInfo: experiments?.join('\n') ?? localize('noExperiments', "No current experiments.") });
		} catch {
			// Ignore
		}

		// Wait for the issue service to finish enumerating installed extensions
		// (it kicks off enumeration in parallel with this pane opening).
		await data?.whenExtensionsLoaded;
		if (this.wizard !== wizard) {
			return;
		}
		if (data && data.enabledExtensions.length > 0) {
			const nonTheme = data.enabledExtensions.filter(e => !e.isTheme && !e.isBuiltin);
			const themeCount = data.enabledExtensions.filter(e => e.isTheme).length;
			wizard.updateModel({
				allExtensions: data.enabledExtensions,
				enabledNonThemeExtesions: nonTheme,
				numberOfThemeExtesions: themeCount,
			});
		}

		// Wait for the full async population (token, integrity check, experiments)
		// to finish so we can forward late-arriving values into the wizard model.
		// Note: githubAccessToken doesn't need forwarding — it's read from the
		// shared data object at submit time, not from the overlay's internal model.
		await data?.whenDataComplete;
		if (data && this.wizard === wizard) {
			wizard.updateModel({
				isInstallationPure: data.isInstallationPure,
			});
		}
	}

	private bindInputCallbacks(input: IssueReporterEditorInput, wizard: IssueReporterOverlay): void {
		const hasUserInput = () => wizard.hasUnsavedChanges();
		const hasPendingOperations = () => wizard.hasPendingOperations();
		this.inputStateCallbacks.value = toDisposable(() => {
			if (input.hasUserInputFn === hasUserInput) {
				input.hasUserInputFn = undefined;
			}
			if (input.hasPendingOperationsFn === hasPendingOperations) {
				input.hasPendingOperationsFn = undefined;
			}
		});
		input.hasUserInputFn = hasUserInput;
		input.hasPendingOperationsFn = hasPendingOperations;
	}

	private restoreAttachmentsFromInput(input: IssueReporterEditorInput): void {
		if (!this.wizard) {
			return;
		}
		if (input.savedAttachments !== undefined) {
			this.wizard.restoreAttachments(input.savedAttachments);
		}
	}

	private destroyWizard(): void {
		this.recordingGeneration++;
		this.pendingRecordingStart = undefined;
		this.pendingRecordingStop = undefined;
		if (this.wizard && this.recordingOwner === this.wizard) {
			this.recordingService.discardRecording();
		}
		this.recordingOwner = undefined;
		this.inputStateCallbacks.clear();
		this.inputDisposables.clear();
		this.wizard = undefined;
		this.wizardInput = undefined;
		clearNode(this.container);
		IssueReporterController._onDidChangeInstances.fire();
	}

	private startRecording(): Promise<void> {
		if (this.pendingRecordingStart) {
			return this.pendingRecordingStart;
		}
		if (!this.wizard || this._store.isDisposed || this.pendingRecordingStop || this.recordingOwner === this.wizard) {
			return Promise.resolve();
		}
		if (!this.wizard.reserveRecordingSlot()) {
			return Promise.resolve();
		}
		const promise = this.doStartRecording(this.wizard, ++this.recordingGeneration);
		this.pendingRecordingStart = promise;
		const clear = () => {
			if (this.pendingRecordingStart === promise) {
				this.pendingRecordingStart = undefined;
			}
		};
		void promise.then(clear, clear);
		return promise;
	}

	private async doStartRecording(wizard: IssueReporterOverlay, generation: number): Promise<void> {
		const isCurrent = () => this.wizard === wizard && this.recordingGeneration === generation;
		const previouslyRequested = this.hasRequestedScreenCapturePermission;
		let requestedPermission = false;
		let attemptedRecording = false;
		try {
			let status = await this.recordingService.getScreenCapturePermissionStatus();
			if (!isCurrent()) {
				return;
			}
			if (status !== 'granted') {
				if (status !== 'restricted') {
					this.hasRequestedScreenCapturePermission = true;
					requestedPermission = true;
					const granted = await this.recordingService.requestScreenCapturePermission();
					if (!isCurrent()) {
						return;
					}
					status = granted ? 'granted' : await this.recordingService.getScreenCapturePermissionStatus();
				}
				if (!isCurrent()) {
					return;
				}
				if (status !== 'granted') {
					if (shouldShowScreenCapturePermissionSettings(status, previouslyRequested)) {
						this.showScreenRecordingPermissionNotification(status);
					}
					wizard.setRecordingState(RecordingState.Idle);
					return;
				}
			}

			attemptedRecording = true;
			this.recordingOwner = wizard;
			await this.recordingService.startRecording('video/mp4');
			if (!isCurrent()) {
				return;
			}
			wizard.setRecordingState(this.recordingService.state);
			if (this.recordingService.state === RecordingState.Stopped) {
				await this.stopRecording();
			}
		} catch (error) {
			if (!isCurrent()) {
				return;
			}
			this.recordingOwner = undefined;
			wizard.setRecordingState(RecordingState.Idle);
			if (isCancellationError(error)) {
				return;
			}
			this.logService.error('[IssueReporterEditorPane] Recording failed:', error);
			let status: ScreenCapturePermissionStatus | undefined;
			try {
				status = await this.recordingService.getScreenCapturePermissionStatus();
			} catch (statusError) {
				this.logService.error('[IssueReporterEditorPane] Permission status failed:', statusError);
			}
			if (!isCurrent()) {
				return;
			}
			if (status && status !== 'granted') {
				if (!requestedPermission || attemptedRecording || shouldShowScreenCapturePermissionSettings(status, previouslyRequested)) {
					this.showScreenRecordingPermissionNotification(status);
				}
			} else {
				this.showRecordingError(error);
			}
		}
	}

	private stopRecording(): Promise<void> {
		if (this.pendingRecordingStop) {
			return this.pendingRecordingStop;
		}
		const wizard = this.wizard;
		if (!wizard) {
			return Promise.resolve();
		}
		this.recordingGeneration++;
		if (this.recordingOwner !== wizard) {
			wizard.setRecordingState(RecordingState.Idle);
			return Promise.resolve();
		}
		const promise = this.doStopRecording(wizard);
		this.pendingRecordingStop = promise;
		const clear = () => {
			if (this.pendingRecordingStop === promise) {
				this.pendingRecordingStop = undefined;
			}
		};
		void promise.then(clear, clear);
		return promise;
	}

	private async doStopRecording(wizard: IssueReporterOverlay): Promise<void> {
		try {
			const recordingData = await this.recordingService.stopRecording();
			if (this.wizard !== wizard) {
				return;
			}
			if (recordingData) {
				await this.saveRecordingAndAdd(recordingData, wizard);
				if (this.wizard === wizard && recordingData.stoppedBySize) {
					this.notificationService.warn(localize('recordingTooLarge', "Recording stopped automatically: the 100 MB upload limit was reached."));
				}
			}
		} catch (error) {
			this.logService.error('[IssueReporterEditorPane] Stop recording failed:', error);
			if (this.wizard === wizard) {
				this.showRecordingError(error);
			}
		} finally {
			if (this.wizard === wizard) {
				this.recordingOwner = undefined;
				wizard.setRecordingState(RecordingState.Idle);
			}
		}
	}

	private showRecordingError(error: unknown): void {
		this.notificationService.error(isMacintosh
			? localize('screenRecordingFailedMac', "Screen recording failed: {0} If you recently changed Screen Recording permission, quit and reopen {1}. If recording still fails, remove {1} from the Screen Recording list in System Settings, reopen it, and grant access again.", toErrorMessage(error), product.nameShort)
			: localize('screenRecordingFailed', "Screen recording failed: {0} Try recording again.", toErrorMessage(error)));
	}

	/**
	 * Surface a notification telling the user how to grant Screen Recording
	 * permission. On macOS, includes a deep-link to System Settings.
	 */
	private showScreenRecordingPermissionNotification(status: ScreenCapturePermissionStatus): void {
		if (isMacintosh) {
			this.notificationService.prompt(
				Severity.Warning,
				status === 'restricted'
					? localize('screenRecordingPermissionRestricted', "Screen recording is restricted by macOS. Check Screen Recording permissions in System Settings or contact your administrator.")
					: localize('screenRecordingPermissionDenied', "{0} needs Screen Recording permission to record videos. Grant access in System Settings and restart {0} if requested. If {0} is missing after you removed it from the list, quit and reopen {0}, then click Record again.", product.nameShort),
				[
					{
						label: localize('openSystemSettings', "Open System Settings"),
						run: async () => {
							try {
								await this.recordingService.openScreenCapturePermissionSettings();
							} catch (error) {
								this.notificationService.error(localize('screenRecordingSettingsFailed', "Unable to open Screen Recording settings: {0}", toErrorMessage(error)));
							}
						},
					},
				],
			);
		} else {
			this.notificationService.warn(
				localize('screenRecordingPermissionDeniedGeneric', "Screen recording permission was denied. Allow {0} to record the screen and try again.", product.nameShort)
			);
		}
	}

	focus(): void {
		this.wizard?.focus();
	}

	override dispose(): void {
		this.destroyWizard();
		super.dispose();
	}

	private async saveRecordingAndAdd(data: IRecordingData, wizard: IssueReporterOverlay): Promise<void> {
		const input = this.wizardInput;
		if (!input || this.wizard !== wizard) {
			return;
		}
		let target: URI | undefined;
		try {
			const extension = data.mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
			const fileName = `vscode-recording-${new Date().toISOString().replace(/[:.]/g, '-')}-${generateUuid()}.${extension}`;
			const folder = URI.joinPath(this.mediaStorageHome, 'issue-recordings');
			const arrayBuffer = await data.blob.arrayBuffer();
			await this.fileService.createFolder(folder);
			if (this.wizard !== wizard) {
				return;
			}
			target = URI.joinPath(folder, fileName);
			await this.fileService.writeFile(target, VSBuffer.wrap(new Uint8Array(arrayBuffer)));
			if (this.wizard !== wizard) {
				return;
			}
			this.logService.info(`[IssueReporterEditorPane] Recording saved to ${target.toString()}`);

			// Generate thumbnail from the saved file — blob URLs are blocked by
			// Electron's CSP for media elements, so we use the saved file via
			// the vscode-file:// protocol which the renderer can load.
			const thumbnailDataUrl = await this.generateVideoThumbnail(target);
			if (this.wizard === wizard) {
				if (wizard.addRecording({ filePath: target.fsPath, name: fileName, mimeType: data.mimeType, durationMs: data.durationMs, thumbnailDataUrl })) {
					const ownedFile = target;
					input.registerImportedFile(ownedFile.fsPath, importedFileCleanup(ownedFile, this.fileService, this.filesConfigurationService, this.logService));
					target = undefined;
				} else {
					this.notificationService.warn(localize('recordingAttachmentRejected', "The recording could not be attached because the attachment limit was reached. Remove an attachment and record again."));
				}
			}
		} catch (err) {
			this.logService.error('[IssueReporterEditorPane] Failed to save recording:', err);
			if (this.wizard === wizard) {
				this.showRecordingError(err);
			}
		} finally {
			if (target) {
				await deleteImportedFile(target, this.fileService, this.logService);
			}
		}
	}

	protected generateVideoThumbnail(fileUri: URI): Promise<string | undefined> {
		// The fileUri may use the vscode-userdata: scheme. Convert to a real
		// file:// URI via fsPath, then to vscode-file://vscode-app/ so the
		// renderer's CSP allows loading it as a media source.
		const browserUri = FileAccess.uriToBrowserUri(URI.file(fileUri.fsPath));

		return new Promise(resolve => {
			const video = mainWindow.document.createElement('video');
			const timeout = setTimeout(() => finish(undefined), 5000);
			let resolved = false;
			const finish = (result: string | undefined) => {
				if (resolved) { return; }
				resolved = true;
				clearTimeout(timeout);
				video.pause();
				video.removeAttribute('src');
				video.load();
				video.remove();
				resolve(result);
			};
			const captureFrame = () => {
				try {
					if (!video.videoWidth || !video.videoHeight) {
						finish(undefined);
						return;
					}
					const canvas = mainWindow.document.createElement('canvas');
					canvas.width = video.videoWidth;
					canvas.height = video.videoHeight;
					const ctx = canvas.getContext('2d');
					if (!ctx) {
						finish(undefined);
						return;
					}
					ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
					finish(canvas.toDataURL('image/jpeg', 0.7));
				} catch {
					finish(undefined);
				}
			};

			video.muted = true;
			video.playsInline = true;
			video.preload = 'auto';
			video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:320px;height:240px;opacity:0;pointer-events:none;';
			mainWindow.document.body.appendChild(video);
			video.src = browserUri.toString(true);

			video.addEventListener('loadeddata', () => {
				video.pause();
				const duration = Number.isFinite(video.duration) ? video.duration : 0;
				if (duration > 0.5) {
					video.addEventListener('seeked', () => captureFrame(), { once: true });
					try {
						video.currentTime = Math.min(0.5, duration / 2);
					} catch {
						captureFrame();
					}
					return;
				}
				captureFrame();
			}, { once: true });
			video.addEventListener('error', () => finish(undefined), { once: true });
			video.load();
		});
	}

	layout(dimension: Dimension): void {
		this.container.style.width = `${dimension.width}px`;
		this.container.style.height = `${dimension.height}px`;
	}
}

function importedFileCleanup(file: URI, fileService: IFileService, filesConfigurationService: IFilesConfigurationService, logService: ILogService): IDisposable {
	return toDisposable(() => {
		void filesConfigurationService.updateReadonly(file, 'reset').catch(error => logService.warn('[IssueReporterEditorPane] Failed to release attachment read-only state:', error));
		void deleteImportedFile(file, fileService, logService);
	});
}

async function deleteImportedFile(file: URI, fileService: IFileService, logService: ILogService): Promise<void> {
	try {
		await fileService.del(file);
	} catch (error) {
		if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
			logService.warn('[IssueReporterEditorPane] Failed to delete imported attachment:', error);
		}
	}
}
