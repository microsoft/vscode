/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class ModelAliasRegistry {
	private readonly _aliasToModelId = new Map<string, string>();
	private readonly _modelIdToAliases = new Map<string, string[]>();
	private static readonly _instance = new ModelAliasRegistry();

	private constructor() { }

	private static _updateAliasesForModelId(modelId: string): void {
		const aliases: string[] = [];
		for (const [alias, mappedModelId] of this._instance._aliasToModelId.entries()) {
			if (mappedModelId === modelId) {
				aliases.push(alias);
			}
		}

		if (aliases.length > 0) {
			this._instance._modelIdToAliases.set(modelId, aliases);
		} else {
			this._instance._modelIdToAliases.delete(modelId);
		}
	}

	static registerAlias(alias: string, modelId: string): void {
		this._instance._aliasToModelId.set(alias, modelId);
		this._updateAliasesForModelId(modelId);
	}

	static deregisterAlias(alias: string): void {
		const modelId = this._instance._aliasToModelId.get(alias);
		this._instance._aliasToModelId.delete(alias);
		if (modelId) {
			this._updateAliasesForModelId(modelId);
		}
	}

	static resolveAlias(alias: string): string {
		return this._instance._aliasToModelId.get(alias) ?? alias;
	}

	static getAliases(modelId: string): string[] {
		return this._instance._modelIdToAliases.get(modelId) ?? [];
	}
}

ModelAliasRegistry.registerAlias('copilot-fast', 'gpt-4o-mini');