/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IndexedDB } from '../../../../../base/browser/indexedDB.js';
import { generateUuid } from '../../../../../base/common/uuid.js';

export interface IMyRequest {
	readonly text: string;
	readonly link: string;
}

interface IHistory {
	readonly recording?: string;
	readonly requests: readonly IMyRequest[];
}

export const maxRecordedRequests = 200;
const storeName = 'requests';

/** Each mutation reads and writes in one local transaction, including mutations from different windows. */
export class MyRequestsStore {
	constructor(readonly profileId: string, private readonly databaseName = 'vscode-my-requests') { }

	private async access(update?: (history: IHistory) => IHistory): Promise<IHistory> {
		const db = await IndexedDB.create(this.databaseName, 1, [storeName]);
		try {
			const result: IHistory | undefined = await db.runInTransaction(storeName, update ? 'readwrite' : 'readonly', store => {
				const request: IDBRequest<IHistory | undefined> = store.get(this.profileId);
				if (update) {
					request.onsuccess = () => {
						const current = request.result ?? { requests: [] };
						const next = update(current);
						if (next !== current) {
							if (!next.recording && !next.requests.length) {
								store.delete(this.profileId);
							} else {
								store.put(next, this.profileId);
							}
						}
					};
				}
				return request;
			});
			return result ?? { requests: [] };
		} finally {
			db.close();
		}
	}

	async recording(): Promise<string | undefined> {
		return (await this.access()).recording;
	}

	async setRecording(enabled: boolean): Promise<void> {
		await this.access(current => ({ ...current, recording: enabled ? generateUuid() : undefined }));
	}

	async record(epoch: string, text: string, link: string): Promise<void> {
		await this.access(current => {
			if (current.recording !== epoch || !text.trim() || current.requests.some(request => request.link === link)) {
				return current;
			}
			return { ...current, requests: [{ text, link }, ...current.requests.slice(0, maxRecordedRequests - 1)] };
		});
	}

	async search(query = ''): Promise<readonly IMyRequest[]> {
		const terms = query.toLowerCase().trim().split(/\s+/);
		return (await this.access()).requests.filter(request => {
			const text = request.text.toLowerCase();
			return terms.every(term => text.includes(term));
		});
	}

	async replaceLink(previous: string, link: string): Promise<void> {
		await this.access(current => current.requests.some(request => request.link === previous)
			? { ...current, requests: current.requests.map(request => request.link === previous ? { ...request, link } : request) }
			: current);
	}

	async forget(entry: IMyRequest): Promise<void> {
		await this.access(current => {
			const index = current.requests.findIndex(request => request.link === entry.link && request.text === entry.text);
			return index < 0 ? current : { ...current, requests: current.requests.filter((_, i) => i !== index) };
		});
	}

	async clear(): Promise<void> {
		// Invalidate submissions still resolving their links when the user cleared the index.
		await this.access(current => ({ recording: current.recording && generateUuid(), requests: [] }));
	}
}
