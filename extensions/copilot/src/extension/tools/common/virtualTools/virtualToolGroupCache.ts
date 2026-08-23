/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { encodeBase64, VSBuffer } from '../../../../util/vs/base/common/buffer';
import { LRUCache } from '../../../../util/vs/base/common/map';
import { LanguageModelToolInformation } from '../../../../vscodeTypes';
import { ISummarizedToolCategory, ISummarizedToolCategoryUpdatable, IToolGroupingCache } from './virtualToolTypes';

const GROUP_CACHE_SIZE = 128;
const GROUP_CACHE_NAME = 'virtToolGroupCache';

interface CachedValue {
	summary: string;
	name: string;
}

interface StoredValue {
	version: 2;
	lru: [string, CachedValue][];
}

export class ToolGroupingCache implements IToolGroupingCache {
	declare readonly _serviceBrand: undefined;

	private readonly _value = new LRUCache<string, CachedValue>(GROUP_CACHE_SIZE);
	private _changed = false;

	constructor(
		@IVSCodeExtensionContext private readonly _extContext: IVSCodeExtensionContext,
	) {
		const cached = _extContext.globalState.get<StoredValue>(GROUP_CACHE_NAME);
		if (cached?.version === 2) {
			try {
				cached.lru.forEach(([k, v]) => this._value.set(k, v));
			} catch (e) {
				// ignored
			}
		}
	}

	public async clear() {
		this._changed = false;
		this._value.clear();
		await this._extContext.globalState.update(GROUP_CACHE_NAME, undefined);
	}

	public async flush() {
		if (!this._changed) {
			return Promise.resolve();
		}

		this._changed = false;
		const value: StoredValue = {
			version: 2,
			lru: this._value.toJSON(),
		};

		await this._extContext.globalState.update(GROUP_CACHE_NAME, value);
	}

	public async getDescription(tools: LanguageModelToolInformation[]): Promise<ISummarizedToolCategoryUpdatable> {
		const key = await this.getKey(tools);
		const existing = this._value.get(key);
		return {
			category: existing ? this.hydrate(tools, existing) : undefined,
			tools,
			update: (r) => {
				this._changed = true;
				this._value.set(key, {
					summary: r.summary,
					name: r.name,
				});
			}
		};
	}


	private hydrate(tools: LanguageModelToolInformation[], g: CachedValue): ISummarizedToolCategory {
		return {
			summary: g.summary,
			name: g.name,
			tools,
		};
	}

	private async getKey(tools: LanguageModelToolInformation[]): Promise<string> {
		const str = tools.map(t => t.name + '\0' + t.description).sort().join(',');
		const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
		return encodeBase64(VSBuffer.wrap(new Uint8Array(hashBuf)));
	}
}
