/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { safeInnerHtml } from 'vs/base/browser/dom';
import { DisposableStore } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import 'vs/css!./media/newIssueReporter';
import { localize } from 'vs/nls';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { ExtensionIdentifier, ExtensionIdentifierSet } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { INativeHostService } from 'vs/platform/native/common/native';
import product from 'vs/platform/product/common/product';
import { BrowserWindow } from 'vs/workbench/browser/window';
import BaseHtml from 'vs/workbench/contrib/issue/browser/issueReporterPage';
import { IIssueFormService, IssueReporterData, IssueReporterWindowConfiguration } from 'vs/workbench/contrib/issue/common/issue';
import { IssueReporter2 } from 'vs/workbench/contrib/issue/electron-sandbox/issueReporterService2';
import { AuxiliaryWindowMode, IAuxiliaryWindowService } from 'vs/workbench/services/auxiliaryWindow/browser/auxiliaryWindowService';

export class IssueFormService2 implements IIssueFormService {

	private configuration: IssueReporterWindowConfiguration | undefined;

	private extensionIdentifierSet: ExtensionIdentifierSet = new ExtensionIdentifierSet();

	declare readonly _serviceBrand: undefined;

	private currentData: IssueReporterData | undefined;

	private issueReporterWindow: Window | null = null;
	private issueReporterParentWindow: BrowserWindow | null = null;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@ILogService private readonly logService: ILogService,
		@IDialogService private readonly dialogService: IDialogService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IAuxiliaryWindowService private readonly auxiliaryWindowService: IAuxiliaryWindowService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) { }

	//#region Used by renderer
	async openReporter(data: IssueReporterData): Promise<void> {
		if (data.extensionId && this.extensionIdentifierSet.has(data.extensionId)) {
			this.currentData = data;
			this.issueReporterWindow?.focus();
			return;
		}

		if (this.issueReporterWindow) {
			this.issueReporterWindow.focus();
			return;
		}
		this.openAuxIssueReporter(data);
	}

	async openAuxIssueReporter(data: IssueReporterData): Promise<void> {
		const disposables = new DisposableStore();

		// Auxiliary Window
		const auxiliaryWindow = disposables.add(await this.auxiliaryWindowService.open({ mode: AuxiliaryWindowMode.Custom, bounds: { width: 700, height: 800 } }));
		this.issueReporterWindow = auxiliaryWindow.window;

		if (auxiliaryWindow) {
			await auxiliaryWindow.whenStylesHaveLoaded;
			auxiliaryWindow.window.document.title = 'Issue Reporter';
			auxiliaryWindow.window.document.body.classList.add('issue-reporter-body');

			// custom issue reporter wrapper
			const div = document.createElement('div');
			div.classList.add('monaco-workbench');

			// removes preset monaco-workbench
			auxiliaryWindow.container.remove();
			auxiliaryWindow.window.document.body.appendChild(div);
			safeInnerHtml(div, BaseHtml());

			let type = '';
			let arch = '';
			let release = '';

			// Get platform information
			await this.nativeHostService.getOSProperties().then(os => {
				arch = os.arch;
				release = os.release;
				type = os.type;
			});

			// Store into config object URL
			this.configuration = {
				zoomLevel: data.zoomLevel,
				appRoot: this.environmentService.appRoot,
				windowId: 0,
				userEnv: {},
				data,
				disableExtensions: !!this.environmentService.disableExtensions,
				os: {
					type,
					arch,
					release,
				},
				product,
				nls: {
					// VSCODE_GLOBALS: NLS
					messages: globalThis._VSCODE_NLS_MESSAGES,
					language: globalThis._VSCODE_NLS_LANGUAGE
				}
			};

			// create issue reporter and instantiate
			const issueReporter = this.instantiationService.createInstance(IssueReporter2, this.configuration, this.issueReporterWindow);
			issueReporter.render();
		} else {
			console.error('Failed to open auxiliary window');
		}

		// handle closing issue reporter
		this.issueReporterWindow?.addEventListener('beforeunload', () => {
			auxiliaryWindow.window.close();
			this.issueReporterWindow = null;
		});
	}

	//#endregion

	//#region used by issue reporter window
	async reloadWithExtensionsDisabled(): Promise<void> {
		if (this.issueReporterParentWindow) {
			try {
				await this.nativeHostService.reload({ disableExtensions: true });
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

	async sendReporterMenu(extensionId: string, extensionName: string): Promise<IssueReporterData | undefined> {
		const menu = this.menuService.createMenu(MenuId.IssueReporter, this.contextKeyService);

		// render menu and dispose
		const actions = menu.getActions({ renderShortTitle: true }).flatMap(entry => entry[1]);
		for (const action of actions) {
			try {
				if (action.item && 'source' in action.item && action.item.source?.id === extensionId) {
					this.extensionIdentifierSet.add(extensionId);
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

	async closeReporter(): Promise<void> {
		this.issueReporterWindow?.close();
	}

	//#endregion
}
