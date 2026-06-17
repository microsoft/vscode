/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IObservable, IReader, observableFromEvent } from '../../../../../base/common/observable.js';
import { isObject } from '../../../../../base/common/types.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ILanguageModelChatMetadata } from '../languageModels.js';
import { ILanguageModelToolsService, IToolAndToolSetEnablementMap, IToolData, IToolSet, isToolSet } from './languageModelToolsService.js';

// todo@connor4312/bhavyaus: make tools key off displayName so model-specific tool
// enablement can stick between models with different underlying tool definitions
export type ToolEnablementStates = {
	readonly toolSets: ReadonlyMap<string, boolean>;
	readonly tools: ReadonlyMap<string, boolean>;
};

type StoredDataV2 = {
	readonly version: 2;
	readonly toolSetEntries: [string, boolean][];
	readonly toolEntries: [string, boolean][];
};

type StoredDataV1 = {
	readonly version: undefined;
	readonly disabledToolSets?: string[];
	readonly disabledTools?: string[];
};

export namespace ToolEnablementStates {
	export function fromMap(map: IToolAndToolSetEnablementMap): ToolEnablementStates {
		const toolSets: Map<string, boolean> = new Map(), tools: Map<string, boolean> = new Map();
		for (const [entry, enabled] of map.entries()) {
			if (isToolSet(entry)) {
				toolSets.set(entry.id, enabled);
			} else {
				tools.set(entry.id, enabled);
			}
		}
		return { toolSets, tools };
	}

	function isStoredDataV1(data: StoredDataV1 | StoredDataV2 | undefined): data is StoredDataV1 {
		return isObject(data) && data.version === undefined
			&& (data.disabledTools === undefined || Array.isArray(data.disabledTools))
			&& (data.disabledToolSets === undefined || Array.isArray(data.disabledToolSets));
	}

	function isStoredDataV2(data: StoredDataV1 | StoredDataV2 | undefined): data is StoredDataV2 {
		return isObject(data) && data.version === 2 && Array.isArray(data.toolSetEntries) && Array.isArray(data.toolEntries);
	}

	export function fromStorage(storage: string): ToolEnablementStates {
		try {
			const parsed = JSON.parse(storage);
			if (isStoredDataV2(parsed)) {
				return { toolSets: new Map(parsed.toolSetEntries), tools: new Map(parsed.toolEntries) };
			} else if (isStoredDataV1(parsed)) {
				const toolSetEntries = parsed.disabledToolSets?.map(id => [id, false] as [string, boolean]);
				const toolEntries = parsed.disabledTools?.map(id => [id, false] as [string, boolean]);
				return { toolSets: new Map(toolSetEntries), tools: new Map(toolEntries) };
			}
		} catch {
			// ignore
		}
		// invalid data
		return { toolSets: new Map(), tools: new Map() };
	}

	export function toStorage(state: ToolEnablementStates): string {
		const storageData: StoredDataV2 = {
			version: 2,
			toolSetEntries: Array.from(state.toolSets.entries()),
			toolEntries: Array.from(state.tools.entries())
		};
		return JSON.stringify(storageData);
	}
}

export const agentHostSelectedToolsStorageKey = 'chat/agentHost/selectedTools';

/**
 * Read-only observable over the agent-host tool selection that reacts to *all* storage writes (local and external).
 *
 * An observable memento only refreshes from storage on external changes, so two memento instances in the same window do
 * not see each other's writes. Long-lived consumers that must reflect the picker's edits live (e.g. the agent-host
 * active client service) should use this instead.
 */
export function observableAgentHostToolsState(storageService: IStorageService, store: DisposableStore): IObservable<ToolEnablementStates> {
	const read = (): ToolEnablementStates => {
		const raw = storageService.get(agentHostSelectedToolsStorageKey, StorageScope.PROFILE);
		return raw !== undefined ? ToolEnablementStates.fromStorage(raw) : { toolSets: new Map(), tools: new Map() };
	};
	return observableFromEvent(
		storageService.onDidChangeValue(StorageScope.PROFILE, agentHostSelectedToolsStorageKey, store),
		() => read()
	);
}

/**
 * Tool reference names whose capability an agent-host backend (Copilot SDK / Claude / Codex) already provides natively
 * (file read/edit, literal file/text search, shell execution, web fetch, sub-agent orchestration). These are hidden
 * from the agent-host tool picker and never sent to the backend, so the model isn't offered the same capability twice.
 */
const agentHostBackendToolReferenceNames: ReadonlySet<string> = new Set([
	// File read / navigation
	'readFile', 'listDirectory',
	// File edit / create
	'applyPatch', 'insertEdit', 'replaceString', 'multiReplaceString', 'createFile', 'createDirectory', 'editFiles',
	// Literal file / text search
	'fileSearch', 'textSearch',
	// Terminal / shell execution
	'runInTerminal', 'getTerminalOutput', 'sendToTerminal', 'killTerminal',
	// Web fetch
	'fetch',
	// Sub-agent orchestration
	'runSubagent',
]);

export function isAgentHostBackendProvidedTool(tool: IToolData): boolean {
	return tool.toolReferenceName !== undefined && agentHostBackendToolReferenceNames.has(tool.toolReferenceName);
}

/**
 * Computes tool/tool-set enablement for an agent-host session. Tools whose capability the backend already provides
 * ({@link agentHostBackendToolReferenceNames}) are omitted entirely — they are neither shown in the picker nor sent to
 * the backend, even if a stored selection or an enabled tool set would otherwise include them. Remaining tools default
 * on. The result is kept consistent with the chat tool picker's `setChecked || perToolTrue` rendering: a tool-set's
 * value is the AND of its visible members, and a tool set with no visible members is omitted as well.
 */
export function computeAgentHostToolEnablement(toolsService: ILanguageModelToolsService, state: ToolEnablementStates, tools: readonly IToolData[], model: ILanguageModelChatMetadata | undefined, reader: IReader | undefined): IToolAndToolSetEnablementMap {
	const map = new Map<IToolData | IToolSet, boolean>();
	const isEnabled = (tool: IToolData, toolSetId: string | undefined): boolean => {
		if (toolSetId !== undefined) {
			const toolSetState = state.toolSets.get(toolSetId);
			if (toolSetState === true) {
				return true; // an explicitly enabled tool set turns on all of its members
			}
			if (toolSetState === false) {
				return state.tools.get(tool.id) === true; // an explicitly disabled tool set hides all members unless opted in
			}
		}
		const stored = state.tools.get(tool.id);
		if (stored !== undefined) {
			return stored;
		}
		return true; // tools that reach here have no backend equivalent, so they are on by default
	};
	for (const tool of tools) {
		if (tool.canBeReferencedInPrompt && !isAgentHostBackendProvidedTool(tool)) {
			map.set(tool, isEnabled(tool, undefined));
		}
	}
	for (const toolSet of toolsService.getToolSetsForModel(model, reader)) {
		let allEnabled = true;
		let hasVisibleMember = false;
		for (const member of toolSet.getTools(reader)) {
			if (isAgentHostBackendProvidedTool(member)) {
				continue; // backend-provided members are hidden and never sent, regardless of the tool set's state
			}
			hasVisibleMember = true;
			const enabled = isEnabled(member, toolSet.id);
			map.set(member, enabled);
			allEnabled &&= enabled;
		}
		if (hasVisibleMember) {
			map.set(toolSet, allEnabled);
		}
	}
	return map;
}
