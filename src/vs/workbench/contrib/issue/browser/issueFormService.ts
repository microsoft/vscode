/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { safeSetInnerHtml } from '../../../../base/browser/domSanitize.js';
import { createStyleSheet } from '../../../../base/browser/domStylesheets.js';
import { getMenuWidgetCSS, Menu, unthemedMenuStyles } from '../../../../base/browser/ui/menu/menu.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { isLinux, isWindows } from '../../../../base/common/platform.js';
import Severity from '../../../../base/common/severity.js';
import { localize } from '../../../../nls.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService, IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ExtensionIdentifier, ExtensionIdentifierSet } from '../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import product from '../../../../platform/product/common/product.js';
import { IRectangle } from '../../../../platform/window/common/window.js';
import { AuxiliaryWindowMode, IAuxiliaryWindowService } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IIssueFormService, IssueReporterData } from '../common/issue.js';
import { IssueReporterOverlay } from './issueReporterOverlay.js';
import BaseHtml from './issueReporterPage.js';
import { IssueWebReporter } from './issueReporterService.js';
import { IRecordingService, RecordingState } from './recordingService.js';
import { IScreenshotService } from './screenshotService.js';
import { IGitHubUploadService } from './githubUploadService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import './media/issueReporter.css';

export interface IssuePassData {
	issueTitle: string;
	issueBody: string;
}

export class IssueFormService implements IIssueFormService {

	readonly _serviceBrand: undefined;

	protected currentData: IssueReporterData | undefined;

	protected issueReporterWindow: Window | null = null;
	protected extensionIdentifierSet: ExtensionIdentifierSet = new ExtensionIdentifierSet();

	protected arch: string = '';
	protected release: string = '';
	protected type: string = '';

	private overlayDisposables: DisposableStore | undefined;
	private overlay: IssueReporterOverlay | undefined;

	constructor(
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IAuxiliaryWindowService protected readonly auxiliaryWindowService: IAuxiliaryWindowService,
		@IMenuService protected readonly menuService: IMenuService,
		@IContextKeyService protected readonly contextKeyService: IContextKeyService,
		@ILogService protected readonly logService: ILogService,
		@IDialogService protected readonly dialogService: IDialogService,
		@IHostService protected readonly hostService: IHostService,
		@ILayoutService protected readonly layoutService: ILayoutService,
		@IScreenshotService protected readonly screenshotService: IScreenshotService,
		@IOpenerService protected readonly openerService: IOpenerService,
		@IRecordingService protected readonly recordingService: IRecordingService,
		@IFileDialogService protected readonly fileDialogService: IFileDialogService,
		@IFileService protected readonly fileService: IFileService,
		@IEnvironmentService protected readonly environmentService: IEnvironmentService,
		@IGitHubUploadService protected readonly githubUploadService: IGitHubUploadService,
	) { }

	async openReporter(data: IssueReporterData): Promise<void> {
		if (this.hasToReload(data)) {
			return;
		}

		this.openOverlayReporter(data);
	}

	protected openOverlayReporter(data: IssueReporterData): void {
		// If already open, close first
		this.closeOverlay();

		this.overlayDisposables = new DisposableStore();

		this.overlay = new IssueReporterOverlay(
			data,
			this.layoutService as import('../../../services/layout/browser/layoutService.js').IWorkbenchLayoutService,
			this.recordingService.isSupported,
		);
		this.overlayDisposables.add(this.overlay);

		// Handle close
		this.overlayDisposables.add(this.overlay.onDidClose(() => {
			this.closeOverlay();
		}));

		// Handle screenshot request — capture only the workbench area, not the wizard
		this.overlayDisposables.add(this.overlay.onDidRequestScreenshot(async () => {
			this.overlay?.hideForCapture();
			try {
				// Small delay to let the UI hide before capture
				await new Promise(r => setTimeout(r, 100));
				// Capture only the workbench container region, excluding the wizard panel
				const container = this.layoutService.mainContainer;
				const bounds = container.getBoundingClientRect();
				const dpr = container.ownerDocument.defaultView?.devicePixelRatio ?? 1;
				const rect = {
					x: Math.round(bounds.x * dpr),
					y: Math.round(bounds.y * dpr),
					width: Math.round(bounds.width * dpr),
					height: Math.round(bounds.height * dpr),
				};
				const dataUrl = await this.screenshotService.captureScreenshot(rect);
				if (dataUrl && this.overlay) {
					const img = new Image();
					img.onload = () => {
						this.overlay?.addScreenshot({
							dataUrl,
							width: img.naturalWidth,
							height: img.naturalHeight,
						});
					};
					img.src = dataUrl;
				}
			} finally {
				this.overlay?.showAfterCapture();
			}
		}));

		// Handle recording start
		this.overlayDisposables.add(this.overlay.onDidRequestStartRecording(async () => {
			try {
				await this.recordingService.startRecording('video/mp4');
				this.overlay?.setRecordingState(RecordingState.Recording);
			} catch (err) {
				this.logService.error('[IssueFormService] Failed to start recording:', err);
				this.overlay?.setRecordingState(RecordingState.Idle);
			}
		}));

		// Handle recording stop
		this.overlayDisposables.add(this.overlay.onDidRequestStopRecording(async () => {
			const recordingData = await this.recordingService.stopRecording();
			if (recordingData) {
				await this.saveRecordingToUserData(recordingData);
			}
			this.overlay?.setRecordingState(RecordingState.Idle);
		}));

		// Handle external recording stop (max duration / OS stop sharing)
		this.overlayDisposables.add(this.recordingService.onDidChangeState(state => {
			if (state === RecordingState.Stopped) {
				this.recordingService.stopRecording().then(d => {
					if (d) {
						this.saveRecordingToUserData(d);
					}
					this.overlay?.setRecordingState(RecordingState.Idle);
				});
			}
		}));

		// Handle open recording — use openerService to open with OS default player
		this.overlayDisposables.add(this.overlay.onDidRequestOpenRecording(filePath => {
			this.openerService.open(URI.file(filePath));
		}));

		// Handle submit
		this.overlayDisposables.add(this.overlay.onDidSubmit(async ({ title, body, shouldCreate, isPrivate }) => {
			const screenshots = this.overlay?.getScreenshots() ?? [];
			const recordings = this.overlay?.getRecordings() ?? [];

			// Determine the issue URL
			let issueUrl = isPrivate && data.privateUri
				? URI.revive(data.privateUri).toString()
				: product.reportIssueUrl ?? '';

			const selectedExtension = data.extensionId
				? data.enabledExtensions.find(ext => ext.id.toLocaleLowerCase() === data.extensionId?.toLocaleLowerCase())
				: undefined;

			if (selectedExtension?.uri) {
				issueUrl = URI.revive(selectedExtension.uri).toString();
			}

			// Try uploading media to GitHub assets
			// TODO: try with microsoft/vscode instead of octocat/Hello-World
			// NOTE: microsoft/vscode may require SSO authorization for the microsoft org
			// or additional permissions — test extensively before switching.
			const owner = 'octocat';
			const repo = 'Hello-World';
			let mediaMarkdown = '';

			if (screenshots.length > 0 || recordings.length > 0) {
				this.logService.info(`[IssueFormService] Submit: ${screenshots.length} screenshots, ${recordings.length} recordings`);
				try {
					// Open integrated browser and prepare for upload
					await this.githubUploadService.login();

					this.logService.info('[IssueFormService] Resolving repository ID...');
					const repoId = await this.githubUploadService.resolveRepositoryId(owner, repo);
					this.logService.info(`[IssueFormService] repoId=${repoId}`);
					const uploadResults: { name: string; url: string; isVideo: boolean }[] = [];

					for (let i = 0; i < screenshots.length; i++) {
						this.logService.info(`[IssueFormService] Uploading screenshot ${i + 1}...`);
						const screenshot = screenshots[i];
						const imageData = screenshot.annotatedDataUrl ?? screenshot.dataUrl;
						const bytes = this.dataUrlToBytes(imageData);
						if (bytes) {
							const result = await this.githubUploadService.uploadAsset(
								owner, repo, repoId,
								`screenshot-${i + 1}.png`, bytes, 'image/png'
							);
							uploadResults.push({ name: result.fileName, url: result.assetUrl, isVideo: false });
							this.logService.info(`[IssueFormService] Screenshot uploaded: ${result.assetUrl}`);
						}
					}

					for (const rec of recordings) {
						this.logService.info(`[IssueFormService] Uploading recording ${rec.filePath}...`);
						const fileContent = await this.fileService.readFile(URI.file(rec.filePath));
						const extension = rec.filePath.endsWith('.mp4') ? 'mp4' : 'webm';
						const contentType = extension === 'mp4' ? 'video/mp4' : 'video/webm';
						const result = await this.githubUploadService.uploadAsset(
							owner, repo, repoId,
							`recording.${extension}`, fileContent.value.buffer, contentType
						);
						uploadResults.push({ name: result.fileName, url: result.assetUrl, isVideo: true });
						this.logService.info(`[IssueFormService] Recording uploaded: ${result.assetUrl}`);
					}

					if (uploadResults.length > 0) {
						mediaMarkdown = '\n\n### Attachments\n\n';
						for (const r of uploadResults) {
							if (r.isVideo) {
								mediaMarkdown += `${r.url}\n\n`;
							} else {
								mediaMarkdown += `![${r.name}](${r.url})\n\n`;
							}
						}
					}
				} catch (err) {
					this.logService.error('[IssueFormService] GitHub upload failed:', err);
				}
			}

			const issueBody = body + mediaMarkdown;
			const gitHubDetails = this.parseGitHubUrl(issueUrl);
			this.logService.info(`[IssueFormService] Opening issue preview: issueUrl=${issueUrl}, bodyLen=${issueBody.length}`);

			if (data.githubAccessToken && gitHubDetails && shouldCreate) {
				await this.submitToGitHub(title, issueBody, gitHubDetails, data.githubAccessToken);
			} else {
				let url = `${issueUrl}${issueUrl.indexOf('?') === -1 ? '?' : '&'}title=${encodeURIComponent(title)}&body=${encodeURIComponent(issueBody)}`;

				if (url.length > 7500) {
					const shouldWrite = await this.showClipboardDialog();
					if (!shouldWrite) {
						return;
					}
					url = `${issueUrl}${issueUrl.indexOf('?') === -1 ? '?' : '&'}title=${encodeURIComponent(title)}&body=${encodeURIComponent(localize('pasteData', "We have written the needed data into your clipboard because it was too large to send. Please paste."))}`;
				}

				// Open issue preview in external browser where SSO/auth works
				// (the integrated browser gets blocked by Microsoft Entra compliance)
				await this.openerService.open(URI.parse(url));
			}

			this.closeOverlay();
		}));

		this.overlay.show();
	}

	private parseGitHubUrl(url: string): undefined | { repositoryName: string; owner: string } {
		const match = /^https?:\/\/github\.com\/([^\/]*)\/([^\/]*).*/.exec(url);
		if (match && match.length) {
			return {
				owner: match[1],
				repositoryName: match[2]
			};
		}
		return undefined;
	}

	private dataUrlToBytes(dataUrl: string): Uint8Array | undefined {
		const commaIndex = dataUrl.indexOf(',');
		if (commaIndex === -1) {
			return undefined;
		}
		const base64 = dataUrl.substring(commaIndex + 1);
		const binaryString = atob(base64);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		return bytes;
	}

	private async submitToGitHub(issueTitle: string, issueBody: string, gitHubDetails: { owner: string; repositoryName: string }, token: string): Promise<boolean> {
		const url = `https://api.github.com/repos/${gitHubDetails.owner}/${gitHubDetails.repositoryName}/issues`;
		const init = {
			method: 'POST',
			body: JSON.stringify({
				title: issueTitle,
				body: issueBody
			}),
			headers: new Headers({
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${token}`,
				'User-Agent': 'request'
			})
		};

		const response = await fetch(url, init);
		if (!response.ok) {
			this.logService.error('Failed to create GitHub issue:', response.statusText);
			return false;
		}
		const result = await response.json();
		await this.openerService.open(URI.parse(result.html_url));
		return true;
	}

	private closeOverlay(): void {
		if (this.recordingService.state === RecordingState.Recording) {
			this.recordingService.discardRecording();
		}
		this.overlayDisposables?.dispose();
		this.overlayDisposables = undefined;
		this.overlay = undefined;
	}

	private async saveRecordingToUserData(data: import('./recordingService.js').IRecordingData): Promise<void> {
		try {
			const extension = data.mimeType.includes('mp4') ? 'mp4' : 'webm';
			const fileName = `vscode-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
			const target = URI.joinPath(this.environmentService.userRoamingDataHome, 'issue-recordings', fileName);

			const arrayBuffer = await data.blob.arrayBuffer();
			await this.fileService.writeFile(target, VSBuffer.wrap(new Uint8Array(arrayBuffer)));
			this.logService.info(`[IssueFormService] Recording saved to ${target.toString()}`);

			const thumbnailDataUrl = await this.generateVideoThumbnail(data.blob, data.mimeType);
			this.overlay?.addRecording(target.fsPath, data.durationMs, thumbnailDataUrl);
		} catch (err) {
			this.logService.error('[IssueFormService] Failed to save recording:', err);
		}
	}

	private generateVideoThumbnail(blob: Blob, _mimeType: string): Promise<string | undefined> {
		return new Promise(resolve => {
			const timeout = setTimeout(() => {
				cleanup();
				resolve(undefined);
			}, 5000);

			let cleaned = false;
			const cleanup = () => {
				if (cleaned) {
					return;
				}
				cleaned = true;
				clearTimeout(timeout);
				URL.revokeObjectURL(url);
				video.remove();
			};

			const url = URL.createObjectURL(blob);
			const video = document.createElement('video');
			video.muted = true;
			video.preload = 'auto';
			video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;';
			document.body.appendChild(video);
			video.src = url;

			video.addEventListener('loadeddata', () => {
				video.currentTime = Math.min(0.5, video.duration / 2);
			}, { once: true });

			video.addEventListener('seeked', () => {
				try {
					const canvas = document.createElement('canvas');
					canvas.width = video.videoWidth;
					canvas.height = video.videoHeight;
					const ctx = canvas.getContext('2d');
					if (ctx) {
						ctx.drawImage(video, 0, 0);
						const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
						cleanup();
						resolve(dataUrl);
					} else {
						cleanup();
						resolve(undefined);
					}
				} catch {
					cleanup();
					resolve(undefined);
				}
			}, { once: true });

			video.addEventListener('error', () => {
				cleanup();
				resolve(undefined);
			}, { once: true });
		});
	}

	/** @deprecated Use openOverlayReporter instead. Kept for web fallback. */
	async openAuxIssueReporterLegacy(data: IssueReporterData): Promise<void> {
		await this.openAuxIssueReporter(data);

		if (this.issueReporterWindow) {
			const issueReporter = this.instantiationService.createInstance(IssueWebReporter, false, data, { type: this.type, arch: this.arch, release: this.release }, product, this.issueReporterWindow);
			issueReporter.render();
		}
	}

	async openAuxIssueReporter(data: IssueReporterData, bounds?: IRectangle): Promise<void> {

		let issueReporterBounds: Partial<IRectangle> = { width: 700, height: 800 };

		// Center Issue Reporter Window based on bounds from native host service
		if (bounds && bounds.x && bounds.y) {
			const centerX = bounds.x + bounds.width / 2;
			const centerY = bounds.y + bounds.height / 2;
			issueReporterBounds = { ...issueReporterBounds, x: centerX - 350, y: centerY - 400 };
		}

		const disposables = new DisposableStore();

		// Auxiliary Window
		const auxiliaryWindow = disposables.add(await this.auxiliaryWindowService.open({ mode: AuxiliaryWindowMode.Normal, bounds: issueReporterBounds, nativeTitlebar: true, disableFullscreen: true }));

		const platformClass = isWindows ? 'windows' : isLinux ? 'linux' : 'mac';

		if (auxiliaryWindow) {
			await auxiliaryWindow.whenStylesHaveLoaded;
			auxiliaryWindow.window.document.title = 'Issue Reporter';
			auxiliaryWindow.window.document.body.classList.add('issue-reporter-body', 'monaco-workbench', platformClass);

			// removes preset monaco-workbench container
			auxiliaryWindow.container.remove();

			// The Menu class uses a static globalStyleSheet that's created lazily on first menu creation.
			// Since auxiliary windows clone stylesheets from main window, but Menu.globalStyleSheet
			// may not exist yet in main window, we need to ensure menu styles are available here.
			if (!Menu.globalStyleSheet) {
				const menuStyleSheet = createStyleSheet(auxiliaryWindow.window.document.head);
				menuStyleSheet.textContent = getMenuWidgetCSS(unthemedMenuStyles, false);
			}

			// custom issue reporter wrapper that preserves critical auxiliary window container styles
			const div = document.createElement('div');
			div.classList.add('monaco-workbench');
			auxiliaryWindow.window.document.body.appendChild(div);
			safeSetInnerHtml(div, BaseHtml(), {
				// Also allow input elements
				allowedTags: {
					augment: [
						'input',
						'select',
						'checkbox',
						'textarea',
					]
				},
				allowedAttributes: {
					augment: [
						'id',
						'class',
						'style',
						'textarea',
					]
				}
			});

			this.issueReporterWindow = auxiliaryWindow.window;
		} else {
			console.error('Failed to open auxiliary window');
			disposables.dispose();
		}

		// handle closing issue reporter
		this.issueReporterWindow?.addEventListener('beforeunload', () => {
			auxiliaryWindow.window.close();
			disposables.dispose();
			this.issueReporterWindow = null;
		});
	}

	async sendReporterMenu(extensionId: string): Promise<IssueReporterData | undefined> {
		const menu = this.menuService.createMenu(MenuId.IssueReporter, this.contextKeyService);

		// render menu and dispose
		const actions = menu.getActions({ renderShortTitle: true }).flatMap(entry => entry[1]);
		for (const action of actions) {
			try {
				if (action.item && 'source' in action.item && action.item.source?.id.toLowerCase() === extensionId.toLowerCase()) {
					this.extensionIdentifierSet.add(extensionId.toLowerCase());
					await action.run();
				}
			} catch (error) {
				console.error(error);
			}
		}

		if (!this.extensionIdentifierSet.has(extensionId)) {
			// send undefined to indicate no action was taken
			return undefined;
		}

		// we found the extension, now we clean up the menu and remove it from the set. This is to ensure that we do duplicate extension identifiers
		this.extensionIdentifierSet.delete(new ExtensionIdentifier(extensionId));
		menu.dispose();

		const result = this.currentData;

		// reset current data.
		this.currentData = undefined;

		return result ?? undefined;
	}

	//#region used by issue reporter

	async closeReporter(): Promise<void> {
		this.closeOverlay();
		this.issueReporterWindow?.close();
	}

	async reloadWithExtensionsDisabled(): Promise<void> {
		if (this.issueReporterWindow) {
			try {
				await this.hostService.reload({ disableExtensions: true });
			} catch (error) {
				this.logService.error(error);
			}
		}
	}

	async showConfirmCloseDialog(): Promise<void> {
		await this.dialogService.prompt({
			type: Severity.Warning,
			message: localize('confirmCloseIssueReporter', "Your input will not be saved. Are you sure you want to close this window?"),
			buttons: [
				{
					label: localize({ key: 'yes', comment: ['&& denotes a mnemonic'] }, "&&Yes"),
					run: () => {
						this.closeReporter();
						this.issueReporterWindow = null;
					}
				},
				{
					label: localize('cancel', "Cancel"),
					run: () => { }
				}
			]
		});
	}

	async showClipboardDialog(): Promise<boolean> {
		let result = false;

		await this.dialogService.prompt({
			type: Severity.Warning,
			message: localize('issueReporterWriteToClipboard', "There is too much data to send to GitHub directly. The data will be copied to the clipboard, please paste it into the GitHub issue page that is opened."),
			buttons: [
				{
					label: localize({ key: 'ok', comment: ['&& denotes a mnemonic'] }, "&&OK"),
					run: () => { result = true; }
				},
				{
					label: localize('cancel', "Cancel"),
					run: () => { result = false; }
				}
			]
		});

		return result;
	}

	hasToReload(data: IssueReporterData): boolean {
		if (data.extensionId && this.extensionIdentifierSet.has(data.extensionId)) {
			this.currentData = data;
			this.issueReporterWindow?.focus();
			return true;
		}

		if (this.overlay?.isVisible()) {
			return true;
		}

		if (this.issueReporterWindow) {
			this.issueReporterWindow.focus();
			return true;
		}

		return false;
	}
}
