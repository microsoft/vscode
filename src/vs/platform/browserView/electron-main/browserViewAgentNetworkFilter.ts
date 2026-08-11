/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
