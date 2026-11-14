/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IExtensionsViewPaneContainer, VIEWLET_ID } from '../common/extensions.js';

/** Focus the existing Extensions search input without clearing its query. */
export async function focusExtensionsSearchInput(viewsService: IViewsService): Promise<void> {
	// Unlike IExtensionsWorkbenchService.openSearch(''), opening the container
	// does not replace the current search text.
	await viewsService.openViewContainer(VIEWLET_ID, true);
}

/** Focus an available results list without editing or submitting the current query. */
export async function focusExtensionsResults(viewsService: IViewsService): Promise<void> {
	const opened = await viewsService.openViewContainer(VIEWLET_ID, false);
	if (!opened) {
		return;
	}

	const container = viewsService.getActiveViewPaneContainerWithId(VIEWLET_ID) as IExtensionsViewPaneContainer | null;
	container?.focusResults();
}

/**
 * The first expanded Extensions pane is not necessarily the first pane with
 * results. Skip empty and collapsed lists so focus reaches actionable content.
 */
export function focusFirstPopulatedExtensionsList(panes: readonly {
	isExpanded(): boolean;
	count(): number;
	focus(): void;
}[]): boolean {
	for (const pane of panes) {
		if (pane.isExpanded() && pane.count() > 0) {
			pane.focus();
			return true;
		}
	}
	return false;
}
