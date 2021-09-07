/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStatusbarService, StatusbarAlignment as MainThreadStatusBarAlignment, IStatusbarEntryAccessor, IStatusbarEntry, StatusbarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';
import { MainThreadStatusBarShape, MainContext, IExtHostContext } from '../common/extHost.protocol';
import { ThemeColor } from 'vs/platform/theme/common/themeService';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { dispose } from 'vs/base/common/lifecycle';
import { Command } from 'vs/editor/common/modes';
import { IAccessibilityInformation } from 'vs/platform/accessibility/common/accessibility';
import { getCodiconAriaLabel } from 'vs/base/common/codicons';
import { IMarkdownString } from 'vs/base/common/htmlContent';

@extHostNamedCustomer(MainContext.MainThreadStatusBar)
export class MainThreadStatusBar implements MainThreadStatusBarShape {

	private readonly entries: Map<number, { accessor: IStatusbarEntryAccessor, alignment: MainThreadStatusBarAlignment, priority: number }> = new Map();

	constructor(
		_extHostContext: IExtHostContext,
		@IStatusbarService private readonly statusbarService: IStatusbarService
	) { }

	dispose(): void {
		this.entries.forEach(entry => entry.accessor.dispose());
		this.entries.clear();
	}

	$setEntry(entryId: number, id: string, name: string, text: string, tooltip: IMarkdownString | string | undefined, command: Command | undefined, color: string | ThemeColor | undefined, backgroundColor: string | ThemeColor | undefined, alignLeft: boolean, priority: number | undefined, accessibilityInformation: IAccessibilityInformation): void {
		// if there are icons in the text use the tooltip for the aria label
		let ariaLabel: string;
		let role: string | undefined = undefined;
		if (accessibilityInformation) {
			ariaLabel = accessibilityInformation.label;
			role = accessibilityInformation.role;
		} else {
			ariaLabel = getCodiconAriaLabel(text);
			if (tooltip) {
				const tooltipString = typeof tooltip === 'string' ? tooltip : tooltip.value;
				ariaLabel += `, ${tooltipString}`;
			}
		}
		const entry: IStatusbarEntry = { name, text, tooltip, command, color, backgroundColor, ariaLabel, role };

		if (typeof priority === 'undefined') {
			priority = 0;
		}

		const alignment = alignLeft ? StatusbarAlignment.LEFT : StatusbarAlignment.RIGHT;

		// Reset existing entry if alignment or priority changed
		let existingEntry = this.entries.get(entryId);
		if (existingEntry && (existingEntry.alignment !== alignment || existingEntry.priority !== priority)) {
			dispose(existingEntry.accessor);
			this.entries.delete(entryId);
			existingEntry = undefined;
		}

		// Create new entry if not existing
		if (!existingEntry) {
			this.entries.set(entryId, { accessor: this.statusbarService.addEntry(entry, id, alignment, priority), alignment, priority });
		}

		// Otherwise update
		else {
			existingEntry.accessor.update(entry);
		}
	}

	$dispose(id: number) {
		const entry = this.entries.get(id);
		if (entry) {
			dispose(entry.accessor);
			this.entries.delete(id);
		}
	}
}
