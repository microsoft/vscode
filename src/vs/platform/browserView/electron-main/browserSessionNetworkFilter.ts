/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CallbackResponse, OnBeforeRequestListenerDetails } from 'electron';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IAgentNetworkFilterService } from '../../networkFilter/common/networkFilterService.js';

export class BrowserSessionNetworkFilter {
	private readonly filteredWebContents = new Set<number>();
	private readonly policyErrors = new Map<number, string>();

	constructor(private readonly agentNetworkFilterService: IAgentNetworkFilterService) { }

	setFiltering(webContentsId: number, enabled: boolean): void {
		if (enabled) {
			this.filteredWebContents.add(webContentsId);
		} else {
			this.filteredWebContents.delete(webContentsId);
			this.policyErrors.delete(webContentsId);
		}
	}

	getPolicyError(webContentsId: number): string | undefined {
		return this.policyErrors.get(webContentsId);
	}

	onBeforeRequest(details: OnBeforeRequestListenerDetails, callback: (response: CallbackResponse) => void): void {
		const webContentsId = details.webContentsId ?? details.webContents?.id;
		if (details.resourceType === 'mainFrame') {
			if (webContentsId !== undefined) {
				this.policyErrors.delete(webContentsId);
			}
			callback({ cancel: false });
			return;
		}

		if (webContentsId === undefined || !this.filteredWebContents.has(webContentsId)) {
			callback({ cancel: false });
			return;
		}

		let uri: URI;
		try {
			uri = URI.parse(details.url, true);
		} catch {
			this.policyErrors.set(webContentsId, localize('browserSession.invalidNetworkRequest', 'A browser request was blocked by network domain policy.'));
			callback({ cancel: true });
			return;
		}

		const allowed = this.agentNetworkFilterService.isUriAllowed(uri);
		if (!allowed) {
			this.policyErrors.set(webContentsId, this.agentNetworkFilterService.formatError(uri));
		}
		callback({ cancel: !allowed });
	}
}
