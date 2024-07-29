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
import { IProcessMainService } from 'vs/platform/issue/common/issue';
import { ILogService } from 'vs/platform/log/common/log';
import { INativeHostService } from 'vs/platform/native/common/native';
import product from 'vs/platform/product/common/product';
import { BrowserWindow } from 'vs/workbench/browser/window';
import { IssueFormService } from 'vs/workbench/contrib/issue/browser/issueFormService';
import BaseHtml from 'vs/workbench/contrib/issue/browser/issueReporterPage';
import { IIssueFormService, IssueReporterData, IssueReporterWindowConfiguration } from 'vs/workbench/contrib/issue/common/issue';
import { IssueReporter2 } from 'vs/workbench/contrib/issue/electron-sandbox/issueReporterService2';
import { AuxiliaryWindowMode, IAuxiliaryWindowService } from 'vs/workbench/services/auxiliaryWindow/browser/auxiliaryWindowService';
import { IHostService } from 'vs/workbench/services/host/browser/host';

export class NativeIssueFormService extends IssueFormService implements IIssueFormService {
	private issueReporterParentWindow: BrowserWindow | null = null;
	private configuration: IssueReporterWindowConfiguration | undefined;

	constructor(
		@IInstantiationService protected override readonly instantiationService: IInstantiationService,
		@IAuxiliaryWindowService protected override readonly auxiliaryWindowService: IAuxiliaryWindowService,
		@INativeEnvironmentService protected readonly environmentService: INativeEnvironmentService,
		@ILogService protected override readonly logService: ILogService,
		@IDialogService protected override readonly dialogService: IDialogService,
		@IMenuService protected override readonly menuService: IMenuService,
		@IContextKeyService protected override readonly contextKeyService: IContextKeyService,
		@IHostService protected override readonly hostService: IHostService,
		@INativeHostService private readonly nativeHostService: INativeHostService) {
		super(instantiationService, auxiliaryWindowService, menuService, contextKeyService, logService, dialogService, hostService);
	}

	//#region Used by renderer
	override async openReporter(data: IssueReporterData): Promise<void> {
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
		if (this.issueReporterWindow) {
			const issueReporter = this.instantiationService.createInstance(IssueReporter2, this.configuration, this.issueReporterWindow);
			issueReporter.render();
		}
	}

	override async openAuxIssueReporter(data: IssueReporterData): Promise<void> {
		await this.nativeHostService.getOSProperties().then(os => {
			this.arch = os.arch;
			this.release = os.release;
			this.type = os.type;
		});
		super.openAuxIssueReporter(data);
	}

	//#endregion

	//#region used by issue reporter window
	override async reloadWithExtensionsDisabled(): Promise<void> {
		if (this.issueReporterParentWindow) {
			try {
				await this.nativeHostService.reload({ disableExtensions: true });
			} catch (error) {
				this.logService.error(error);
			}
		}
	}

	override async showConfirmCloseDialog(): Promise<void> {
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

	override async showClipboardDialog(): Promise<boolean> {
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
}
