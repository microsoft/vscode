/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { windowOpenNoOpener } from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { IOpenerService, matchesScheme } from 'vs/platform/opener/common/opener';
import { BrowserLifecycleService } from 'vs/workbench/services/lifecycle/browser/lifecycleService';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';

export class BrowserWindow extends Disposable {

	constructor(
		@IOpenerService private readonly openerService: IOpenerService,
		@ILifecycleService private readonly lifecycleService: BrowserLifecycleService
	) {
		super();

		this.create();
	}

	private create(): void {

		// Handle open calls
		this.setupOpenHandlers();
	}

	private setupOpenHandlers(): void {

		// Block window.open() calls
		window.open = function (): Window | null {
			throw new Error('Prevented call to window.open(). Use IOpenerService instead!');
		};

		// We need to ignore the `beforeunload` event while
		// we handle external links to open specifically for
		// the case of application protocols that e.g. invoke
		// vscode itself. We do not want to open these links
		// in a new window because that would leave a blank
		// window to the user, but using `window.location.href`
		// will trigger the `beforeunload`.
		this.openerService.setExternalOpener({
			openExternal: async (href: string) => {
				if (matchesScheme(href, Schemas.http) || matchesScheme(href, Schemas.https)) {
					windowOpenNoOpener(href);
				} else {
					this.lifecycleService.withExpectedUnload(() => window.location.href = href);
				}

				return true;
			}
		});
	}
}
