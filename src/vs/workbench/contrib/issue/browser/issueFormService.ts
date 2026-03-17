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
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
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
import { IScreenshotService } from './screenshotService.js';
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

		// Handle submit
		this.overlayDisposables.add(this.overlay.onDidSubmit(async ({ title, body, shouldCreate, isPrivate }) => {
			const screenshots = this.overlay?.getScreenshots() ?? [];

			// Build the final issue body with screenshot image uploads
			let issueBody = body;
			if (screenshots.length > 0) {
				issueBody += '\n\n### Screenshots\n\n';
				for (let i = 0; i < screenshots.length; i++) {
					const screenshot = screenshots[i];
					const imageData = screenshot.annotatedDataUrl ?? screenshot.dataUrl;
					issueBody += `![Screenshot ${i + 1}](${imageData})\n\n`;
				}
			}

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

			const gitHubDetails = this.parseGitHubUrl(issueUrl);

			if (data.githubAccessToken && gitHubDetails && shouldCreate) {
				await this.submitToGitHub(title, issueBody, gitHubDetails, data.githubAccessToken);
			} else {
				// Preview on GitHub via URL
				let url = `${issueUrl}${issueUrl.indexOf('?') === -1 ? '?' : '&'}title=${encodeURIComponent(title)}&body=${encodeURIComponent(issueBody)}`;

				if (url.length > 7500) {
					const shouldWrite = await this.showClipboardDialog();
					if (!shouldWrite) {
						return;
					}
					url = `${issueUrl}${issueUrl.indexOf('?') === -1 ? '?' : '&'}title=${encodeURIComponent(title)}&body=${encodeURIComponent(localize('pasteData', "We have written the needed data into your clipboard because it was too large to send. Please paste."))}`;
				}

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
		this.overlayDisposables?.dispose();
		this.overlayDisposables = undefined;
		this.overlay = undefined;
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
