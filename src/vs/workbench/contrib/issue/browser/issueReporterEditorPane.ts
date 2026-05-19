/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/issueReporterOverlay.css';
import { $, append, clearNode, Dimension } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { EditorActivation, IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { FileAccess } from '../../../../base/common/network.js';
import { IssueReporterEditorInput } from './issueReporterEditorInput.js';
import { IssueReporterOverlay } from './issueReporterOverlay.js';
import { IRecordingService, IRecordingData, RecordingState } from './recordingService.js';
import { IScreenshotService } from './screenshotService.js';
import { IIssueFormService } from '../common/issue.js';
import { IssueFormService } from './issueFormService.js';
import { IProcessService } from '../../../../platform/process/common/process.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import product from '../../../../platform/product/common/product.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { ChatMessageRole, ILanguageModelsService, getTextResponseFromStream } from '../../chat/common/languageModels.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IUpdateService, StateType } from '../../../../platform/update/common/update.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { isMacintosh } from '../../../../base/common/platform.js';

/** Context key that's `true` whenever any IssueReporter editor is open in any group, even when not focused. */
export const IssueReporterOpenContext = new RawContextKey<boolean>('issueReporterOpen', false);

/**
 * Editor pane that hosts the issue reporter wizard inside an editor tab.
 */
export class IssueReporterEditorPane extends EditorPane {

	static readonly ID = 'workbench.editor.issueReporter';

	/**
	 * Live registry of all currently-instantiated IssueReporter panes (one per
	 * editor group). Commands like the screenshot keybinding need to reach the
	 * wizard even when its tab is not the active editor in its group, and
	 * {@link IEditorService.visibleEditorPanes} only exposes the active pane
	 * per group. We track them ourselves.
	 */
	private static readonly liveInstances = new Set<IssueReporterEditorPane>();
	static getAnyLiveInstance(): IssueReporterEditorPane | undefined {
		// Prefer one whose wizard exists (i.e. has been set up). Iteration order
		// is insertion order, which gives a reasonable default if multiple are
		// open (rare).
		for (const inst of IssueReporterEditorPane.liveInstances) {
			if (inst.wizard) {
				return inst;
			}
		}
		return undefined;
	}

	private container: HTMLElement | undefined;
	private wizard: IssueReporterOverlay | undefined;
	/**
	 * Our own reference to the wizard's editor input that survives the framework
	 * calling clearInput() when the user switches away from our tab. Without
	 * this, revealAndActivate() can't reopen the wizard because this.input is
	 * already undefined by the time the screenshot capture completes.
	 */
	private wizardInput: IssueReporterEditorInput | undefined;
	private readonly inputDisposables = this._register(new DisposableStore());

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IRecordingService private readonly recordingService: IRecordingService,
		@IScreenshotService private readonly screenshotService: IScreenshotService,
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IEditorService private readonly editorService: IEditorService,
		@IIssueFormService private readonly issueFormService: IIssueFormService,
		@IProcessService private readonly processService: IProcessService,
		@IWorkbenchAssignmentService private readonly experimentService: IWorkbenchAssignmentService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@INotificationService private readonly notificationService: INotificationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IUpdateService private readonly updateService: IUpdateService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
	) {
		super(IssueReporterEditorPane.ID, group, telemetryService, themeService, storageService);
		IssueReporterEditorPane.liveInstances.add(this);
		this._register({ dispose: () => IssueReporterEditorPane.liveInstances.delete(this) });
	}

	getWizard(): IssueReporterOverlay | undefined {
		return this.wizard;
	}

	/**
	 * Bring this pane's tab to the front of its editor group and make that
	 * group the active one. Awaits the open so callers can sequence subsequent
	 * actions reliably.
	 *
	 * Why this needs both `activateGroup` and `openEditor`:
	 *  - `group.openEditor(input)` activates the editor *within* its group, but
	 *    the active *group* may still be a different one (e.g. user clicked
	 *    into a different editor group, or the OS screenshot tool stole focus
	 *    and Electron restored it elsewhere).
	 *  - `editorGroupsService.activateGroup(group)` makes the wizard's group
	 *    the active one so the activated editor actually receives keyboard
	 *    focus and the user sees it.
	 */
	async revealAndActivate(): Promise<void> {
		const input = this.wizardInput;
		if (!input) {
			return;
		}
		// Activate the wizard's group first so the editor service knows where
		// to bring focus, then open the editor through the *service* (not the
		// group). The service has the full machinery for cross-group activation;
		// calling group.openEditor() alone may leave focus on a different group
		// even after the wizard's tab becomes active in its own group.
		this.editorGroupsService.activateGroup(this.group);
		await this.editorService.openEditor(input, { activation: EditorActivation.ACTIVATE }, this.group);
	}

	protected override createEditor(parent: HTMLElement): void {
		this.container = append(parent, $('div.issue-reporter-editor-tab'));
		this.container.style.height = '100%';
		this.container.style.overflow = 'auto';
	}

	private shouldShowUpdateBanner(): boolean {
		return this.updateService.state.type === StateType.AvailableForDownload
			|| this.updateService.state.type === StateType.Ready
			|| this.updateService.state.type === StateType.Downloaded;
	}

	override async setInput(
		input: IssueReporterEditorInput,
		options: IEditorOptions | undefined,
		context: IEditorOpenContext,
		token: CancellationToken,
	): Promise<void> {
		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested || !this.container) {
			return;
		}

		// Hold our own reference to the input so revealAndActivate() can still
		// reach it after the framework calls clearInput() when the user switches
		// to another tab. The framework's this.input is undefined in that state.
		this.wizardInput = input;

		// If the wizard is already built and its DOM is still attached, re-parent floating bar if needed
		if (this.wizard && this.container.contains(this.wizard.getPanel())) {
			this.wizard.reparentFloatingBar();
			this.wizard.showFloatingBar();
			this.wizard.setUpdateAvailable(this.shouldShowUpdateBanner());
			return;
		}

		this.inputDisposables.clear();
		clearNode(this.container);

		const data = input.data;
		if (!data) {
			const msg = append(this.container, $('p'));
			msg.textContent = localize('noData', "No issue reporter data available.");
			return;
		}

		// Create the wizard — renders inside this container
		this.wizard = new IssueReporterOverlay(
			data,
			this.recordingService.isSupported,
			this.container,
			this.contextViewService,
			this.contextMenuService,
			this.markdownRendererService,
			true,
			extensionId => this.issueFormService.sendReporterMenu(extensionId),
			async url => { await this.openerService.open(URI.parse(url), { openExternal: true }); },
			this.shouldShowUpdateBanner(),
			() => this.refreshPerformanceInfo(),
			commandId => this.keybindingService.lookupKeybinding(commandId),
		);
		this.inputDisposables.add(this.wizard);
		this.inputDisposables.add(this.updateService.onStateChange(() => this.wizard?.setUpdateAvailable(this.shouldShowUpdateBanner())));

		// Let the input check wizard state for close confirmation
		input.hasUserInputFn = () => this.wizard?.hasUnsavedChanges() ?? false;

		// Close the editor tab when the user discards
		this.inputDisposables.add(this.wizard.onDidClose(() => {
			// Reset so close handler doesn't prompt again
			input.hasUserInputFn = undefined;
			this.group.closeEditor(this.input!);
		}));

		// Clean up wizard when the input is disposed (tab actually closed)
		this.inputDisposables.add(input.onWillDispose(() => {
			this.destroyWizard();
		}));

		this.wizard.show();

		// Populate system info in background (non-blocking)
		this.populateSystemInfo();

		// Wire screenshot capture
		this.inputDisposables.add(this.wizard.onDidRequestScreenshot(async () => {
			try {
				// Conditionally hide the floating bar based on user setting
				const shouldHide = this.wizard?.shouldHideToolbarForCapture ?? true;
				if (shouldHide) {
					this.wizard?.hideFloatingBar();

					// Small delay to let the bar disappear before capture
					await new Promise(r => setTimeout(r, 100));
				}

				const dataUrl = await this.screenshotService.captureScreenshot();

				// Show bar again after capture
				if (shouldHide) {
					setTimeout(() => this.wizard?.showFloatingBar(), 1000);
				}

				if (!dataUrl || !this.wizard) {
					return;
				}

				const img = await new Promise<HTMLImageElement>((resolve, reject) => {
					const image = mainWindow.document.createElement('img');
					image.onload = () => resolve(image);
					image.onerror = reject;
					image.src = dataUrl;
				});

				this.wizard.addScreenshot({ dataUrl, width: img.naturalWidth, height: img.naturalHeight });

				// Bring the issue reporter editor back into focus after the capture —
				// the user may have switched to a different editor (or even a
				// different group) to set up the shot. revealAndActivate() activates
				// the editor in its own group regardless of where focus currently is.
				await this.revealAndActivate();
			} catch (err) {
				setTimeout(() => this.wizard?.showFloatingBar(), 1000);
				this.logService.error('[IssueReporterEditorPane] Screenshot failed:', err);
			}
		}));

		// Wire recording start
		this.inputDisposables.add(this.wizard.onDidRequestStartRecording(async () => {
			// Check screen-recording permission first (macOS-only concern; other
			// platforms always report 'granted'). If denied or not-determined-
			// and-already-prompted, surface the grant-permission notification
			// without attempting getDisplayMedia (which would just fail again).
			const permissionState = await this.nativeHostService.getMediaAccessStatus('screen');
			if (permissionState === 'denied' || permissionState === 'restricted') {
				this.showScreenRecordingPermissionNotification();
				this.wizard?.setRecordingState(RecordingState.Idle);
				return;
			}
			try {
				await this.recordingService.startRecording('video/mp4');
				this.wizard?.setRecordingState(RecordingState.Recording);
			} catch (err) {
				this.logService.error('[IssueReporterEditorPane] Recording failed:', err);
				this.wizard?.setRecordingState(RecordingState.Idle);
				// Re-check permission state in case the OS prompt was just
				// dismissed/denied during this getDisplayMedia call.
				const postState = await this.nativeHostService.getMediaAccessStatus('screen');
				if (postState === 'denied' || postState === 'restricted' || postState === 'not-determined') {
					this.showScreenRecordingPermissionNotification();
				}
			}
		}));

		// Wire recording stop (user-initiated)
		this.inputDisposables.add(this.wizard.onDidRequestStopRecording(async () => {
			try {
				const recordingData = await this.recordingService.stopRecording();
				if (recordingData) {
					await this.saveRecordingAndAdd(recordingData);
				}
				this.wizard?.setRecordingState(RecordingState.Idle);
			} catch (err) {
				this.logService.error('[IssueReporterEditorPane] Stop recording failed:', err);
				this.wizard?.setRecordingState(RecordingState.Idle);
			}
		}));

		// Handle auto-stop triggered by the recording service (e.g. size limit reached)
		this.inputDisposables.add(this.recordingService.onDidChangeState(async (state) => {
			// Only handle auto-stop: if the service stopped on its own while the wizard
			// still thinks we're recording (user didn't press Stop manually)
			if (state === RecordingState.Stopped && this.wizard?.recordingState === RecordingState.Recording) {
				try {
					const recordingData = await this.recordingService.stopRecording();
					if (recordingData) {
						await this.saveRecordingAndAdd(recordingData);
						if (recordingData.stoppedBySize) {
							this.notificationService.notify({
								severity: Severity.Warning,
								message: localize('recordingTooLarge', "Recording stopped automatically: the 100 MB upload limit was reached."),
							});
						}
					}
				} catch (err) {
					this.logService.error('[IssueReporterEditorPane] Auto-stop recording failed:', err);
				}
				this.wizard?.setRecordingState(RecordingState.Idle);
			}
		}));

		// Wire open screenshot — save to temp file and open in editor
		this.inputDisposables.add(this.wizard.onDidRequestOpenScreenshot(async (screenshot) => {
			try {
				const dataUrl = screenshot.annotatedDataUrl ?? screenshot.dataUrl;
				const commaIndex = dataUrl.indexOf(',');
				if (commaIndex === -1) {
					return;
				}
				const base64 = dataUrl.substring(commaIndex + 1);
				const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
				const fileName = `screenshot-${Date.now()}.jpg`;
				const target = URI.joinPath(this.environmentService.userRoamingDataHome, 'issue-recordings', fileName);
				await this.fileService.writeFile(target, VSBuffer.wrap(bytes));
				await this.editorService.openEditor({ resource: target });
			} catch (err) {
				this.logService.error('[IssueReporterEditorPane] Open screenshot failed:', err);
			}
		}));

		// Wire open recording — open file in editor
		this.inputDisposables.add(this.wizard.onDidRequestOpenRecording(async (filePath) => {
			try {
				await this.editorService.openEditor({ resource: URI.file(filePath) });
			} catch (err) {
				this.logService.error('[IssueReporterEditorPane] Open recording failed:', err);
			}
		}));

		// Wire submit — delegate to form service for upload + open URL
		this.inputDisposables.add(this.wizard.onDidSubmit(async ({ title, body }) => {
			if (!this.wizard) {
				return;
			}
			const opened = await (this.issueFormService as IssueFormService).submitIssue(this.wizard, data, title, body);
			if (opened) {
				// User opened the link — keep the wizard editable, but offer an explicit close action.
				this.wizard.markPreviewOpened();
				this.wizard.showCloseButton();
			}
		}));

		// Wire AI title generation
		this.inputDisposables.add(this.wizard.onDidRequestGenerateTitle(async (description) => {
			try {
				const modelIds = await this.languageModelsService.selectLanguageModels({ vendor: 'copilot', id: 'copilot-fast' });
				if (modelIds.length === 0) {
					this.logService.warn('[IssueReporterEditorPane] No language models available for title generation');
					this.wizard?.resetGenerateButton();
					return;
				}
				const modelId = modelIds[0];
				const response = await this.languageModelsService.sendChatRequest(
					modelId,
					undefined,
					[{
						role: ChatMessageRole.User,
						content: [{
							type: 'text',
							value: `Generate a concise issue title (max 10 words, no quotes, no prefix like "Bug:" or "Feature:") for this bug report description:\n\n${description}`,
						}],
					}],
					{},
					CancellationToken.None,
				);
				const title = (await getTextResponseFromStream(response)).trim().replace(/^["']|["']$/g, '');
				if (title && this.wizard) {
					this.wizard.setGeneratedTitle(title);
				} else {
					this.wizard?.resetGenerateButton();
				}
			} catch (err) {
				this.logService.error('[IssueReporterEditorPane] Title generation failed:', err);
				this.wizard?.resetGenerateButton();
			}
		}));
	}

	private async fetchPerformanceInfo(options?: { skipCache?: boolean; unbounded?: boolean }): Promise<void> {
		if (!this.wizard) {
			return;
		}
		try {
			const performanceInfo = await this.processService.getPerformanceInfo(options);
			this.wizard.updateModel({
				processInfo: performanceInfo.processInfo,
				workspaceInfo: performanceInfo.workspaceInfo,
			});
		} catch (err) {
			this.logService.error('[IssueReporterEditorPane] Failed to fetch performance info:', err);
		} finally {
			this.wizard?.markPerformanceInfoLoaded();
		}
	}

	private async refreshPerformanceInfo(): Promise<void> {
		// User-initiated refresh: bypass the workspace-stats cache and walk the
		// full filesystem (no cap) so the reported file counts and file-type
		// breakdown reflect the actual workspace.
		await this.fetchPerformanceInfo({ skipCache: true, unbounded: true });
	}

	private async populateSystemInfo(): Promise<void> {
		if (!this.wizard) {
			return;
		}

		const input = this.input as IssueReporterEditorInput | undefined;
		const data = input?.data;

		try {
			// Version info
			const vscodeVersion = `${product.nameShort} ${!!product.darwinUniversalAssetId ? `${product.version} (Universal)` : product.version} (${product.commit || 'Commit unknown'}, ${product.date || 'Date unknown'})`;
			const systemInfo = await this.processService.getSystemInfo();
			this.wizard.updateModel({
				versionInfo: { vscodeVersion, os: systemInfo.os },
				systemInfo,
				systemInfoWeb: navigator.userAgent,
			});

			await this.fetchPerformanceInfo();
		} catch (err) {
			this.logService.error('[IssueReporterEditorPane] Failed to collect system info:', err);
			this.wizard?.markPerformanceInfoLoaded();
		}

		// Experiments (independent from system info)
		try {
			const experiments = await this.experimentService.getCurrentExperiments();
			this.wizard?.updateModel({ experimentInfo: experiments?.join('\n') ?? localize('noExperiments', "No current experiments.") });
		} catch {
			// Ignore
		}		// Extensions — data may have been populated by the issue service's async background task.
		// Give it a moment to finish, then sync.
		await new Promise(r => setTimeout(r, 500));
		if (data && data.enabledExtensions.length > 0) {
			const nonTheme = data.enabledExtensions.filter(e => !e.isTheme && !e.isBuiltin);
			const themeCount = data.enabledExtensions.filter(e => e.isTheme).length;
			this.wizard?.updateModel({
				allExtensions: data.enabledExtensions,
				enabledNonThemeExtesions: nonTheme,
				numberOfThemeExtesions: themeCount,
			});
		}

		// User settings
		try {
			const settingsUri = this.userDataProfileService.currentProfile.settingsResource;
			const settingsContent = await this.fileService.readFile(settingsUri);
			this.wizard?.setSettingsContent(settingsContent.value.toString());
		} catch {
			// Ignore — no settings file
		}
	}

	private destroyWizard(): void {
		// Stop any active recording to avoid memory leaks
		if (this.recordingService.state === RecordingState.Recording) {
			this.recordingService.discardRecording();
		}
		this.inputDisposables.clear();
		this.wizard = undefined;
		this.wizardInput = undefined;
		if (this.container) {
			clearNode(this.container);
		}
	}

	/**
	 * Surface a notification telling the user how to grant Screen Recording
	 * permission. On macOS, includes a one-click action that deep-links to the
	 * Privacy & Security pane in System Settings. On other platforms, surfaces
	 * a generic explanation (the OS-level permission flow there typically
	 * doesn't require a manual settings trip).
	 */
	private showScreenRecordingPermissionNotification(): void {
		if (isMacintosh) {
			this.notificationService.prompt(
				Severity.Warning,
				localize('screenRecordingPermissionDenied', "{0} needs Screen Recording permission to record videos. Grant access in System Settings, then click Record again.", product.nameShort),
				[
					{
						label: localize('openSystemSettings', "Open System Settings"),
						run: () => {
							// Deep link to the Screen Recording pane in macOS Privacy & Security
							void this.nativeHostService.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
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

	override focus(): void {
		super.focus();
		this.wizard?.focus();
	}

	private async saveRecordingAndAdd(data: IRecordingData): Promise<void> {
		try {
			const extension = data.mimeType.includes('mp4') ? 'mp4' : 'webm';
			const fileName = `vscode-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
			const target = URI.joinPath(this.environmentService.userRoamingDataHome, 'issue-recordings', fileName);

			const arrayBuffer = await data.blob.arrayBuffer();
			await this.fileService.writeFile(target, VSBuffer.wrap(new Uint8Array(arrayBuffer)));
			this.logService.info(`[IssueReporterEditorPane] Recording saved to ${target.toString()}`);

			// Generate thumbnail from the saved file — blob URLs are blocked by
			// Electron's CSP for media elements, so we use the saved file via
			// the vscode-file:// protocol which the renderer can load.
			const thumbnailDataUrl = await this.generateVideoThumbnail(target);
			this.wizard?.addRecording(target.fsPath, data.durationMs, thumbnailDataUrl);
		} catch (err) {
			this.logService.error('[IssueReporterEditorPane] Failed to save recording:', err);
		}
	}

	private generateVideoThumbnail(fileUri: URI): Promise<string | undefined> {
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

	override layout(dimension: Dimension): void {
		if (this.container) {
			this.container.style.width = `${dimension.width}px`;
			this.container.style.height = `${dimension.height}px`;
		}
	}
}
