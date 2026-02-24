/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { viewFilterSubmenu } from '../../../../browser/parts/views/viewFilter.js';
import {
	CHAT_DEBUG_FILTER_ACTIVE,
	CHAT_DEBUG_KIND_TOOL_CALL, CHAT_DEBUG_KIND_MODEL_TURN, CHAT_DEBUG_KIND_GENERIC, CHAT_DEBUG_KIND_SUBAGENT,
	CHAT_DEBUG_KIND_USER_MESSAGE, CHAT_DEBUG_KIND_AGENT_RESPONSE,
	CHAT_DEBUG_LEVEL_TRACE, CHAT_DEBUG_LEVEL_INFO, CHAT_DEBUG_LEVEL_WARNING, CHAT_DEBUG_LEVEL_ERROR,
	CHAT_DEBUG_CMD_TOGGLE_TOOL_CALL, CHAT_DEBUG_CMD_TOGGLE_MODEL_TURN, CHAT_DEBUG_CMD_TOGGLE_GENERIC,
	CHAT_DEBUG_CMD_TOGGLE_SUBAGENT, CHAT_DEBUG_CMD_TOGGLE_USER_MESSAGE, CHAT_DEBUG_CMD_TOGGLE_AGENT_RESPONSE,
	CHAT_DEBUG_CMD_TOGGLE_TRACE, CHAT_DEBUG_CMD_TOGGLE_INFO, CHAT_DEBUG_CMD_TOGGLE_WARNING, CHAT_DEBUG_CMD_TOGGLE_ERROR,
} from './chatDebugTypes.js';

/**
 * Shared filter state for the Agent Debug Panel.
 *
 * Both the Logs view and the Flow Chart view read from this single source of
 * truth. Toggle commands modify the state and fire `onDidChange` so every
 * consumer can re-render.
 */
export class ChatDebugFilterState extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	// Kind visibility
	filterKindToolCall: boolean = true;
	filterKindModelTurn: boolean = true;
	filterKindGeneric: boolean = true;
	filterKindSubagent: boolean = true;
	filterKindUserMessage: boolean = true;
	filterKindAgentResponse: boolean = true;

	// Level visibility
	filterLevelTrace: boolean = true;
	filterLevelInfo: boolean = true;
	filterLevelWarning: boolean = true;
	filterLevelError: boolean = true;

	// Text filter
	textFilter: string = '';

	isKindVisible(kind: string): boolean {
		switch (kind) {
			case 'toolCall': return this.filterKindToolCall;
			case 'modelTurn': return this.filterKindModelTurn;
			case 'generic': return this.filterKindGeneric;
			case 'subagentInvocation': return this.filterKindSubagent;
			case 'userMessage': return this.filterKindUserMessage;
			case 'agentResponse': return this.filterKindAgentResponse;
			default: return true;
		}
	}

	isAllKindsVisible(): boolean {
		return this.filterKindToolCall && this.filterKindModelTurn &&
			this.filterKindGeneric && this.filterKindSubagent &&
			this.filterKindUserMessage && this.filterKindAgentResponse;
	}

	isAllLevelsVisible(): boolean {
		return this.filterLevelTrace && this.filterLevelInfo &&
			this.filterLevelWarning && this.filterLevelError;
	}

	isAllFiltersDefault(): boolean {
		return this.isAllKindsVisible() && this.isAllLevelsVisible();
	}

	setTextFilter(text: string): void {
		const normalized = text.toLowerCase();
		if (this.textFilter !== normalized) {
			this.textFilter = normalized;
			this._onDidChange.fire();
		}
	}

	fire(): void {
		this._onDidChange.fire();
	}
}

/**
 * Registers the toggle-filter commands and menu items once, wired to a shared
 * {@link ChatDebugFilterState}. Returns a disposable that unregisters them.
 */
export function registerFilterMenuItems(
	state: ChatDebugFilterState,
	scopedContextKeyService: IContextKeyService,
): DisposableStore {
	const store = new DisposableStore();

	// Bind context keys so the "More Filters" submenu shows toggle checkboxes
	CHAT_DEBUG_FILTER_ACTIVE.bindTo(scopedContextKeyService).set(true);

	const kindToolCallKey = CHAT_DEBUG_KIND_TOOL_CALL.bindTo(scopedContextKeyService);
	kindToolCallKey.set(true);
	const kindModelTurnKey = CHAT_DEBUG_KIND_MODEL_TURN.bindTo(scopedContextKeyService);
	kindModelTurnKey.set(true);
	const kindGenericKey = CHAT_DEBUG_KIND_GENERIC.bindTo(scopedContextKeyService);
	kindGenericKey.set(true);
	const kindSubagentKey = CHAT_DEBUG_KIND_SUBAGENT.bindTo(scopedContextKeyService);
	kindSubagentKey.set(true);
	const kindUserMessageKey = CHAT_DEBUG_KIND_USER_MESSAGE.bindTo(scopedContextKeyService);
	kindUserMessageKey.set(true);
	const kindAgentResponseKey = CHAT_DEBUG_KIND_AGENT_RESPONSE.bindTo(scopedContextKeyService);
	kindAgentResponseKey.set(true);
	const levelTraceKey = CHAT_DEBUG_LEVEL_TRACE.bindTo(scopedContextKeyService);
	levelTraceKey.set(true);
	const levelInfoKey = CHAT_DEBUG_LEVEL_INFO.bindTo(scopedContextKeyService);
	levelInfoKey.set(true);
	const levelWarningKey = CHAT_DEBUG_LEVEL_WARNING.bindTo(scopedContextKeyService);
	levelWarningKey.set(true);
	const levelErrorKey = CHAT_DEBUG_LEVEL_ERROR.bindTo(scopedContextKeyService);
	levelErrorKey.set(true);

	const registerToggle = (
		id: string, title: string, key: RawContextKey<boolean>, group: string,
		getter: () => boolean, setter: (v: boolean) => void, ctxKey: IContextKey<boolean>,
	) => {
		store.add(CommandsRegistry.registerCommand(id, () => {
			const newVal = !getter();
			setter(newVal);
			ctxKey.set(newVal);
			state.fire();
		}));
		store.add(MenuRegistry.appendMenuItem(viewFilterSubmenu, {
			command: { id, title, toggled: key },
			group,
			when: CHAT_DEBUG_FILTER_ACTIVE,
		}));
	};

	registerToggle(CHAT_DEBUG_CMD_TOGGLE_TOOL_CALL, localize('chatDebug.filter.toolCall', "Tool Calls"), CHAT_DEBUG_KIND_TOOL_CALL, '1_kind', () => state.filterKindToolCall, v => { state.filterKindToolCall = v; }, kindToolCallKey);
	registerToggle(CHAT_DEBUG_CMD_TOGGLE_MODEL_TURN, localize('chatDebug.filter.modelTurn', "Model Turns"), CHAT_DEBUG_KIND_MODEL_TURN, '1_kind', () => state.filterKindModelTurn, v => { state.filterKindModelTurn = v; }, kindModelTurnKey);
	registerToggle(CHAT_DEBUG_CMD_TOGGLE_GENERIC, localize('chatDebug.filter.generic', "Generic"), CHAT_DEBUG_KIND_GENERIC, '1_kind', () => state.filterKindGeneric, v => { state.filterKindGeneric = v; }, kindGenericKey);
	registerToggle(CHAT_DEBUG_CMD_TOGGLE_SUBAGENT, localize('chatDebug.filter.subagent', "Subagent Invocations"), CHAT_DEBUG_KIND_SUBAGENT, '1_kind', () => state.filterKindSubagent, v => { state.filterKindSubagent = v; }, kindSubagentKey);
	registerToggle(CHAT_DEBUG_CMD_TOGGLE_USER_MESSAGE, localize('chatDebug.filter.userMessage', "User Messages"), CHAT_DEBUG_KIND_USER_MESSAGE, '1_kind', () => state.filterKindUserMessage, v => { state.filterKindUserMessage = v; }, kindUserMessageKey);
	registerToggle(CHAT_DEBUG_CMD_TOGGLE_AGENT_RESPONSE, localize('chatDebug.filter.agentResponse', "Agent Responses"), CHAT_DEBUG_KIND_AGENT_RESPONSE, '1_kind', () => state.filterKindAgentResponse, v => { state.filterKindAgentResponse = v; }, kindAgentResponseKey);

	registerToggle(CHAT_DEBUG_CMD_TOGGLE_TRACE, localize('chatDebug.filter.trace', "Trace"), CHAT_DEBUG_LEVEL_TRACE, '2_level', () => state.filterLevelTrace, v => { state.filterLevelTrace = v; }, levelTraceKey);
	registerToggle(CHAT_DEBUG_CMD_TOGGLE_INFO, localize('chatDebug.filter.info', "Info"), CHAT_DEBUG_LEVEL_INFO, '2_level', () => state.filterLevelInfo, v => { state.filterLevelInfo = v; }, levelInfoKey);
	registerToggle(CHAT_DEBUG_CMD_TOGGLE_WARNING, localize('chatDebug.filter.warning', "Warning"), CHAT_DEBUG_LEVEL_WARNING, '2_level', () => state.filterLevelWarning, v => { state.filterLevelWarning = v; }, levelWarningKey);
	registerToggle(CHAT_DEBUG_CMD_TOGGLE_ERROR, localize('chatDebug.filter.error', "Error"), CHAT_DEBUG_LEVEL_ERROR, '2_level', () => state.filterLevelError, v => { state.filterLevelError = v; }, levelErrorKey);

	return store;
}

/**
 * Binds context keys for filter state into a scoped context key service.
 * Returns a function to sync all keys from the current state.
 */
export function bindFilterContextKeys(
	state: ChatDebugFilterState,
	scopedContextKeyService: IContextKeyService,
): () => void {
	CHAT_DEBUG_FILTER_ACTIVE.bindTo(scopedContextKeyService).set(true);
	const kindToolCallKey = CHAT_DEBUG_KIND_TOOL_CALL.bindTo(scopedContextKeyService);
	const kindModelTurnKey = CHAT_DEBUG_KIND_MODEL_TURN.bindTo(scopedContextKeyService);
	const kindGenericKey = CHAT_DEBUG_KIND_GENERIC.bindTo(scopedContextKeyService);
	const kindSubagentKey = CHAT_DEBUG_KIND_SUBAGENT.bindTo(scopedContextKeyService);
	const kindUserMessageKey = CHAT_DEBUG_KIND_USER_MESSAGE.bindTo(scopedContextKeyService);
	const kindAgentResponseKey = CHAT_DEBUG_KIND_AGENT_RESPONSE.bindTo(scopedContextKeyService);
	const levelTraceKey = CHAT_DEBUG_LEVEL_TRACE.bindTo(scopedContextKeyService);
	const levelInfoKey = CHAT_DEBUG_LEVEL_INFO.bindTo(scopedContextKeyService);
	const levelWarningKey = CHAT_DEBUG_LEVEL_WARNING.bindTo(scopedContextKeyService);
	const levelErrorKey = CHAT_DEBUG_LEVEL_ERROR.bindTo(scopedContextKeyService);

	return () => {
		kindToolCallKey.set(state.filterKindToolCall);
		kindModelTurnKey.set(state.filterKindModelTurn);
		kindGenericKey.set(state.filterKindGeneric);
		kindSubagentKey.set(state.filterKindSubagent);
		kindUserMessageKey.set(state.filterKindUserMessage);
		kindAgentResponseKey.set(state.filterKindAgentResponse);
		levelTraceKey.set(state.filterLevelTrace);
		levelInfoKey.set(state.filterLevelInfo);
		levelWarningKey.set(state.filterLevelWarning);
		levelErrorKey.set(state.filterLevelError);
	};
}
