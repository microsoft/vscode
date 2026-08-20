/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { BrowserActionCategory } from '../browserEditor.js';
import { IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import type { BrowserCookieImportFamily, BrowserCookieImportResult, IBrowserCookieImportDetectedBrowser, IBrowserCookieImportProfile } from '../../../../../platform/browserView/common/browserCookieImport.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import type { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { joinPath } from '../../../../../base/common/resources.js';

/**
 * Cookie import feature — the command-palette + quick-pick UI that drives the
 * ORCA-equivalent cookie import pipeline in the main process.
 *
 * Three commands:
 *   - ImportCookiesFromBrowser  — pick a detected browser, then a profile, then import
 *   - ImportCookiesFromFile     — pick a JSON cookie export file, then import
 *   - ImportCookiesShowDetected — show which browsers/profiles were detected
 *
 * The heavy lifting (detection, decryption, planning, CDP write, staging) all
 * happens in the main process. These actions only marshal user intent across
 * the ProxyChannel boundary and surface the result.
 */

type BrowserQuickPickItem = IQuickPickItem & { family: BrowserCookieImportFamily; profile: IBrowserCookieImportProfile };

/**
 * Builds the quick-pick items for a detected browser. Each item combines the
 * browser family with a specific profile so the picker can carry both.
 */
function buildBrowserQuickPickItems(browser: IBrowserCookieImportDetectedBrowser): BrowserQuickPickItem[] {
	return browser.profiles.map(profile => ({
		label: `$(${Codicon.chrome.id}) ${browser.label}`,
		description: profile.directory === browser.selectedProfile
			? localize('browser.cookieImport.defaultProfile', "{0} (default)", profile.name)
			: profile.name,
		detail: profile.directory,
		family: browser.family,
		profile
	}));
}

/**
 * Formats the import result for display in a notification.
 */
function formatImportResult(result: BrowserCookieImportResult): { message: string; severity: Severity } {
	if (!result.ok) {
		return {
			message: localize('browser.cookieImport.failed', "Cookie import failed: {0}", result.reason),
			severity: Severity.Error
		};
	}

	const summary = result.summary;
	const base = localize(
		'browser.cookieImport.success',
		"Imported {0} cookies ({1} skipped) across {2} domains.",
		summary.importedCookies,
		summary.skippedCookies,
		summary.domains.length
	);

	if (summary.warning) {
		const warning = localize(
			'browser.cookieImport.warning',
			"{0} cookies could not be imported and will be applied after restart.",
			summary.warning.failedCookies
		);
		return { message: `${base} ${warning}`, severity: Severity.Warning };
	}

	return { message: base, severity: Severity.Info };
}

class ImportCookiesFromBrowserAction extends Action2 {
	static readonly ID = BrowserViewCommandId.ImportCookiesFromBrowser;

	constructor() {
		super({
			id: ImportCookiesFromBrowserAction.ID,
			title: localize2('browser.cookieImport.fromBrowserAction', 'Import Cookies From Browser...'),
			category: BrowserActionCategory,
			icon: Codicon.browser,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const browserViewWorkbenchService = accessor.get(IBrowserViewWorkbenchService);
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);

		// 1. Detect installed browsers.
		const detected = await browserViewWorkbenchService.detectBrowsersForImport();
		if (detected.length === 0) {
			notificationService.notify({
				severity: Severity.Info,
				message: localize('browser.cookieImport.noBrowsers', "No browsers with cookie databases were found on this machine.")
			});
			return;
		}

		// 2. Pick a browser + profile.
		const items: BrowserQuickPickItem[] = detected.flatMap(buildBrowserQuickPickItems);
		const picked = await quickInputService.pick(items, {
			placeHolder: localize('browser.cookieImport.pickBrowser', "Select a browser and profile to import cookies from"),
			matchOnDescription: true,
			matchOnDetail: true
		});
		if (!picked) {
			return; // user cancelled
		}

		// 3. Run the import in the main process.
		const result = await browserViewWorkbenchService.importCookiesFromBrowser({
			browserFamily: picked.family,
			browserProfile: picked.profile.directory
		});

		const { message, severity } = formatImportResult(result);
		notificationService.notify({ severity, message });
	}
}

class ImportCookiesFromFileAction extends Action2 {
	static readonly ID = BrowserViewCommandId.ImportCookiesFromFile;

	constructor() {
		super({
			id: ImportCookiesFromFileAction.ID,
			title: localize2('browser.cookieImport.fromFileAction', 'Import Cookies From File...'),
			category: BrowserActionCategory,
			icon: Codicon.fileCode,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const browserViewWorkbenchService = accessor.get(IBrowserViewWorkbenchService);
		const notificationService = accessor.get(INotificationService);
		const fileDialogService = accessor.get(IFileDialogService);

		// 1. Pick a JSON cookie export file.
		const defaultUri = await fileDialogService.defaultFilePath();
		const pickedFiles = await fileDialogService.showOpenDialog({
			defaultUri: joinPath(defaultUri, 'cookies.json'),
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			filters: [{ name: 'JSON', extensions: ['json'] }],
			title: localize('browser.cookieImport.pickFile', "Select a cookie export file (JSON)"),
			openLabel: localize('browser.cookieImport.importLabel', "Import")
		});
		if (!pickedFiles || pickedFiles.length === 0) {
			return; // user cancelled
		}

		// 2. Run the import.
		const result = await browserViewWorkbenchService.importCookiesFromFile({
			filePath: pickedFiles[0].fsPath
		});

		const { message, severity } = formatImportResult(result);
		notificationService.notify({ severity, message });
	}
}

class ImportCookiesShowDetectedAction extends Action2 {
	static readonly ID = BrowserViewCommandId.ImportCookiesShowDetected;

	constructor() {
		super({
			id: ImportCookiesShowDetectedAction.ID,
			title: localize2('browser.cookieImport.showDetectedAction', 'Show Detected Browsers'),
			category: BrowserActionCategory,
			icon: Codicon.info,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const browserViewWorkbenchService = accessor.get(IBrowserViewWorkbenchService);
		const notificationService = accessor.get(INotificationService);
		const quickInputService = accessor.get(IQuickInputService);

		const detected = await browserViewWorkbenchService.detectBrowsersForImport();
		if (detected.length === 0) {
			notificationService.notify({
				severity: Severity.Info,
				message: localize('browser.cookieImport.noBrowsers', "No browsers with cookie databases were found on this machine.")
			});
			return;
		}

		// Show a read-only picker describing what was detected.
		const items: IQuickPickItem[] = detected.map(browser => ({
			label: browser.label,
			description: localize('browser.cookieImport.profilesCount', "{0} profile(s)", browser.profiles.length),
			detail: browser.profiles.map(p => p.name).join(', ')
		}));

		await quickInputService.pick(items, {
			placeHolder: localize('browser.cookieImport.detectedPlaceholder', "Detected browsers with cookie databases"),
			matchOnDescription: true,
			canPickMany: false
		});
	}
}

registerAction2(ImportCookiesFromBrowserAction);
registerAction2(ImportCookiesFromFileAction);
registerAction2(ImportCookiesShowDetectedAction);
