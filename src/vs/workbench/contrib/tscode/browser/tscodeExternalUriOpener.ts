/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test-workbench_change - new file

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IOpenerService, IExternalOpener } from '../../../../platform/opener/common/opener.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

// Define BrowserViewUri since it's in electron-browser
const BrowserViewUri = {
	forId: (id: string) => URI.from({ scheme: 'vscode-browser', path: `/${id}` })
};

/**
 * TSCode opens all HTTP/HTTPS links in integrated browser by default
 */
class TSCodeExternalUriOpenerContribution extends Disposable implements IWorkbenchContribution, IExternalOpener {
	static readonly ID = 'workbench.contrib.tscodeExternalUriOpener';

	constructor(
		@IOpenerService openerService: IOpenerService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		// Register as external opener with higher priority than default
		this._register(openerService.registerExternalOpener(this));
	}

	async openExternal(href: string, ctx: { sourceUri: URI; preferredOpenerId?: string }, _token: CancellationToken): Promise<boolean> {
		// Don't intercept if user explicitly specified another opener
		if (ctx.preferredOpenerId && ctx.preferredOpenerId !== 'vscode.open') {
			return false;
		}

		// Check if user disabled this feature
		const enabled = this.configurationService.getValue<boolean>('tscode.useIntegratedBrowserByDefault');
		if (enabled === false) {
			return false;
		}

		// test-workbench_change start - Clean and validate URL
		let cleanHref = href.trim();

		// 1. Remove leading relative path prefixes (like "./" or ".\")
		while (cleanHref.startsWith('./') || cleanHref.startsWith('.\\')) {
			cleanHref = cleanHref.substring(2);
		}

		// 2. Remove trailing problematic characters (backslashes, extra slashes, dots, etc.)
		cleanHref = cleanHref.replace(/[\\\/\.]+$/, '');

		// 3. Check if empty or invalid
		if (!cleanHref || cleanHref.length === 0) {
			return false;
		}

		// 4. If URL doesn't contain protocol, try adding https://
		if (!cleanHref.includes('://')) {
			cleanHref = 'https://' + cleanHref;
		}

		// 5. Validate URL format
		try {
			const parsed = new URL(cleanHref);

			// Only handle HTTP and HTTPS links
			if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
				return false;
			}

			// Check if hostname is valid (not empty)
			if (!parsed.hostname || parsed.hostname.length === 0) {
				return false;
			}

			// Use normalized URL
			cleanHref = parsed.toString();
		} catch {
			// URL parsing failed, don't handle
			return false;
		}
		// test-workbench_change end

		// Open in integrated browser
		try {
			const browserUri = BrowserViewUri.forId(generateUuid());
			await this.editorService.openEditor({
				resource: browserUri,
				options: {
					pinned: true,
					viewState: { url: cleanHref } // test-workbench_change - Use cleaned URL
				}
			});
			return true;
		} catch (error) {
			// If integrated browser is not available (e.g., in Web version), return false to use default behavior
			console.warn('Failed to open in integrated browser:', error);
			return false;
		}
	}
}

registerWorkbenchContribution2(TSCodeExternalUriOpenerContribution.ID, TSCodeExternalUriOpenerContribution, WorkbenchPhase.BlockStartup);
