/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient } from '@github/copilot-sdk';
import { ILogService } from '../../../log/common/log.js';
import { raceTimeout } from '../../../../base/common/async.js';

type RuntimeSlashCommandCatalog = {
	readonly commands: readonly RuntimeSlashCommandInfo[];
	readonly byName: ReadonlyMap<string, RuntimeSlashCommandInfo>;
	readonly byAlias: ReadonlyMap<string, RuntimeSlashCommandInfo>;
};

type RuntimeSlashCommandCache = {
	value?: RuntimeSlashCommandCatalog;
	inFlight?: Promise<RuntimeSlashCommandCatalog>;
};

type RuntimeSlashCommandInfo = Awaited<ReturnType<CopilotClient['rpc']['commands']['list']>>['commands'][number];

export class CopilotSlashCommandProvider {
	private _runtimeSlashCommandCache: RuntimeSlashCommandCache | undefined;
	constructor(
		private readonly listCommands: () => Promise<RuntimeSlashCommandInfo[]>,
		@ILogService private readonly _logService: ILogService,
	) { }

	async getSlashCommands(options?: { readonly maxWaitMs?: number }): Promise<readonly RuntimeSlashCommandInfo[]> {
		try {
			const maxWaitMs = options?.maxWaitMs;
			const catalog = await this._getRuntimeSlashCommandCatalog(maxWaitMs === undefined ? undefined : Math.max(0, maxWaitMs));
			return catalog.commands;
		} catch (err) {
			this._logService.warn(`[Copilot] rpc.commands.list failed`, err);
			return [];
		}
	}

	public async resolveSlashCommand(command: string, maxWaitMs: number | undefined = undefined): Promise<RuntimeSlashCommandInfo | undefined> {
		const key = this._normalizeSlashCommandKey(command);
		if (!key) {
			return undefined;
		}
		const catalog = await this._getRuntimeSlashCommandCatalog(maxWaitMs);
		return catalog.byName.get(key) ?? catalog.byAlias.get(key);
	}

	public clearCache(): void {
		if (this._runtimeSlashCommandCache) {
			// Keep in-flight promises isolated from fresh lookups after invalidation.
			this._runtimeSlashCommandCache = undefined;
		}
	}

	private async _getRuntimeSlashCommandCatalog(maxWaitMs: number | undefined = undefined): Promise<RuntimeSlashCommandCatalog> {
		const cache = this._runtimeSlashCommandCache ??= {};
		if (cache.value) {
			return cache.value;
		}

		const inFlight = this._refreshRuntimeSlashCommandCatalog(cache);
		if (maxWaitMs === undefined) {
			return inFlight;
		}
		const settled = await raceTimeout(inFlight, maxWaitMs);
		if (settled) {
			return settled;
		}
		if (cache.value) {
			return cache.value;
		}
		return {
			commands: [],
			byName: new Map(),
			byAlias: new Map(),
		};
	}

	private async _refreshRuntimeSlashCommandCatalog(cache: RuntimeSlashCommandCache): Promise<RuntimeSlashCommandCatalog> {
		if (cache.inFlight) {
			return cache.inFlight;
		}
		const inFlight = this.listCommands()
			.then(result => this._toRuntimeSlashCommandCatalog(result));
		cache.inFlight = inFlight;
		inFlight.then(catalog => {
			if (this._runtimeSlashCommandCache === cache) {
				cache.value = catalog;
				cache.inFlight = undefined;
			}
		}, () => {
			if (this._runtimeSlashCommandCache === cache) {
				cache.inFlight = undefined;
				if (!cache.value) {
					this._runtimeSlashCommandCache = undefined;
				}
			}
		});
		return inFlight;
	}

	private _toRuntimeSlashCommandCatalog(commands: readonly RuntimeSlashCommandInfo[]): RuntimeSlashCommandCatalog {
		const byName = new Map<string, RuntimeSlashCommandInfo>();
		const byAlias = new Map<string, RuntimeSlashCommandInfo>();
		const deduped: RuntimeSlashCommandInfo[] = [];
		for (const command of commands) {
			const nameKey = this._normalizeSlashCommandKey(command.name);
			if (!nameKey) {
				continue;
			}
			let canonical = byName.get(nameKey);
			if (!canonical) {
				canonical = command;
				byName.set(nameKey, canonical);
				deduped.push(canonical);
			}
			for (const alias of command.aliases ?? []) {
				const aliasKey = this._normalizeSlashCommandKey(alias);
				if (!aliasKey || byAlias.has(aliasKey)) {
					continue;
				}
				byAlias.set(aliasKey, canonical);
			}
		}
		return { commands: deduped, byName, byAlias };
	}

	private _normalizeSlashCommandKey(command: string): string | undefined {
		const trimmed = command.trim();
		if (!trimmed) {
			return undefined;
		}
		const slashStripped = trimmed.charCodeAt(0) === 0x2f /* / */ ? trimmed.slice(1) : trimmed;
		return slashStripped.toLowerCase();
	}
}

