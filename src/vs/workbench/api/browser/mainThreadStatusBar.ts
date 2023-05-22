/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainThreadStatusBarShape, MainContext } from '../common/extHost.protocol';
import { ThemeColor } from 'vs/base/common/themables';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { DisposableMap } from 'vs/base/common/lifecycle';
import { Command } from 'vs/editor/common/languages';
import { IAccessibilityInformation } from 'vs/platform/accessibility/common/accessibility';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IExtensionStatusBarItemService } from 'vs/workbench/api/browser/statusBarExtensionPoint';

@extHostNamedCustomer(MainContext.MainThreadStatusBar)
export class MainThreadStatusBar implements MainThreadStatusBarShape {

	private readonly entries = new DisposableMap<string>();

	constructor(
		_extHostContext: IExtHostContext,
		@IExtensionStatusBarItemService private readonly statusbarService: IExtensionStatusBarItemService
	) { }

	dispose(): void {
		this.entries.dispose();
	}

	$setEntry(entryId: string, id: string, extensionId: string | undefined, name: string, text: string, tooltip: IMarkdownString | string | undefined, command: Command | undefined, color: string | ThemeColor | undefined, backgroundColor: string | ThemeColor | undefined, alignLeft: boolean, priority: number | undefined, accessibilityInformation: IAccessibilityInformation | undefined): void {
		const dispo = this.statusbarService.setOrUpdateEntry(entryId, id, extensionId, name, text, tooltip, command, color, backgroundColor, alignLeft, priority, accessibilityInformation);
		if (!this.entries.has(entryId)) {
			this.entries.set(entryId, dispo);
		}
	}

	async $hasEntry(entryId: string): Promise<boolean> {
		return this.statusbarService.hasEntry(entryId);
	}

	$dispose(entryId: string) {
		this.entries.deleteAndDispose(entryId);
	}
}
