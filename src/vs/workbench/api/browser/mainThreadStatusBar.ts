/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainThreadStatusBarShape, MainContext, ExtHostContext, StatusBarItemDto } from '../common/extHost.protocol';
import { ThemeColor } from 'vs/base/common/themables';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Command } from 'vs/editor/common/languages';
import { IAccessibilityInformation } from 'vs/platform/accessibility/common/accessibility';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IExtensionStatusBarItemService } from 'vs/workbench/api/browser/statusBarExtensionPoint';
import { IStatusbarEntry, StatusbarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';

@extHostNamedCustomer(MainContext.MainThreadStatusBar)
export class MainThreadStatusBar implements MainThreadStatusBarShape {

	private readonly _store = new DisposableStore();

	constructor(
		extHostContext: IExtHostContext,
		@IExtensionStatusBarItemService private readonly statusbarService: IExtensionStatusBarItemService
	) {
		const proxy = extHostContext.getProxy(ExtHostContext.ExtHostStatusBar);

		// once, at startup read existing items and send them over
		const entries: StatusBarItemDto[] = [];
		for (const [entryId, item] of statusbarService.getEntries()) {
			entries.push(asDto(entryId, item));
		}

		proxy.$acceptStaticEntries(entries);

		this._store.add(statusbarService.onDidChange(e => {
			if (e.added) {
				proxy.$acceptStaticEntries([asDto(e.added[0], e.added[1])]);
			}
		}));

		function asDto(entryId: string, item: { entry: IStatusbarEntry; alignment: StatusbarAlignment; priority: number }): StatusBarItemDto {
			return {
				entryId,
				name: item.entry.name,
				text: item.entry.text,
				tooltip: item.entry.tooltip as string | undefined,
				command: typeof item.entry.command === 'string' ? item.entry.command : typeof item.entry.command === 'object' ? item.entry.command.id : undefined,
				priority: item.priority,
				alignLeft: item.alignment === StatusbarAlignment.LEFT,
				accessibilityInformation: item.entry.ariaLabel ? { label: item.entry.ariaLabel, role: item.entry.role } : undefined
			};
		}
	}

	dispose(): void {
		this._store.dispose();
	}

	$setEntry(entryId: string, id: string, extensionId: string | undefined, name: string, text: string, tooltip: IMarkdownString | string | undefined, command: Command | undefined, color: string | ThemeColor | undefined, backgroundColor: string | ThemeColor | undefined, alignLeft: boolean, priority: number | undefined, accessibilityInformation: IAccessibilityInformation | undefined): void {
		this.statusbarService.setOrUpdateEntry(entryId, id, extensionId, name, text, tooltip, command, color, backgroundColor, alignLeft, priority, accessibilityInformation);
	}

	$disposeEntry(entryId: string) {
		this.statusbarService.unsetEntry(entryId);
	}
}
