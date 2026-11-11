/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ViewPane } from '../../../../browser/parts/views/viewPane.js';

/**
 * Shows in place of the Sessions view of an editor window, as a progress bar, while the state it shares with the Agents
 * window loads: its view container is then not empty as the window restores it.
 */
export class AgentsViewLoadingPane extends ViewPane {

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.setAttribute('aria-label', localize('agentsView.loading', "Loading sessions"));
		const progress = this.getProgressIndicator().show(true);
		this._register(toDisposable(() => progress.done()));
	}
}
