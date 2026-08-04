/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBrowserViewOwner } from '../common/browserView.js';

export class BrowserViewAgentNetworkFilterSources {
	private readonly sources = new Set<string>();

	set(sourceId: string, enabled: boolean): boolean {
		if (enabled) {
			this.sources.add(sourceId);
		} else {
			this.sources.delete(sourceId);
		}
		return this.sources.size > 0;
	}

	clear(): void {
		this.sources.clear();
	}
}

export interface IAgentNetworkFilterableBrowserView {
	setAgentNetworkFiltering(sourceId: string, enabled: boolean): void;
}

export function setBrowserViewGroupAgentNetworkFiltering(view: IAgentNetworkFilterableBrowserView, owner: IBrowserViewOwner, enabled: boolean): void {
	if (owner.sessionId) {
		view.setAgentNetworkFiltering(owner.sessionId, enabled);
	}
}
