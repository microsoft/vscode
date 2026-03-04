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
	CHAT_DEBUG_KIND_TOOL_CALL, CHAT_DEBUG_KIND_MODEL_TURN, CHAT_DEBUG_KIND_PROMPT_DISCOVERY, CHAT_DEBUG_KIND_SUBAGENT,
	CHAT_DEBUG_CMD_TOGGLE_TOOL_CALL, CHAT_DEBUG_CMD_TOGGLE_MODEL_TURN, CHAT_DEBUG_CMD_TOGGLE_PROMPT_DISCOVERY,
	CHAT_DEBUG_CMD_TOGGLE_SUBAGENT,
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
	filterKindPromptDiscovery: boolean = true;
	filterKindSubagent: boolean = true;

	// Text filter
	textFilter: string = '';

	// Parsed timestamp filters (epoch ms)
	beforeTimestamp: number | undefined;
	afterTimestamp: number | undefined;

	isKindVisible(kind: string, category?: string): boolean {
		switch (kind) {
			case 'toolCall': return this.filterKindToolCall;
			case 'modelTurn': return this.filterKindModelTurn;
			case 'generic':
				// The "Prompt Discovery" toggle only hides events produced by
				// the prompt discovery pipeline (category === 'discovery').
				// Other generic events (e.g. from external providers) are
				// always visible and are not affected by this toggle.
				if (category !== 'discovery') {
					return true;
				}
				return this.filterKindPromptDiscovery;
			case 'subagentInvocation': return this.filterKindSubagent;

			default: return true;
		}
	}

	isAllKindsVisible(): boolean {
		return this.filterKindToolCall && this.filterKindModelTurn &&
			this.filterKindPromptDiscovery && this.filterKindSubagent;
	}

	isAllFiltersDefault(): boolean {
		return this.isAllKindsVisible();
	}

	setTextFilter(text: string): void {
		const normalized = text.toLowerCase();
		if (this.textFilter !== normalized) {
			this.textFilter = normalized;
			this._parseTimestampFilters(normalized);
			this._onDidChange.fire();
		}
	}

	setBeforeTimestamp(timestamp: number | undefined): void {
		if (this.beforeTimestamp !== timestamp) {
			this.beforeTimestamp = timestamp;
			this._onDidChange.fire();
		}
	}

	/**
	 * Parse `before:YYYY[-MM[-DD[THH[:MM[:SS]]]]]` from the filter text.
	 * Each component after the year is optional.
	 */
	private _parseTimestampFilters(text: string): void {
		this.beforeTimestamp = ChatDebugFilterState.parseTimeToken(text, 'before');
		this.afterTimestamp = ChatDebugFilterState.parseTimeToken(text, 'after');
	}

	static parseTimeToken(text: string, prefix: string): number | undefined {
		const regex = new RegExp(`${prefix}:(\\d{4})(?:-(\\d{2})(?:-(\\d{2})(?:t(\\d{1,2})(?::(\\d{2})(?::(\\d{2}))?)?)?)?)?(?!\\w)`);
		const m = regex.exec(text);
		if (!m) {
			return undefined;
		}

		const year = parseInt(m[1], 10);
		const month = m[2] !== undefined ? parseInt(m[2], 10) - 1 : undefined;
		const day = m[3] !== undefined ? parseInt(m[3], 10) : undefined;
		const hour = m[4] !== undefined ? parseInt(m[4], 10) : undefined;
		const minute = m[5] !== undefined ? parseInt(m[5], 10) : undefined;
		const second = m[6] !== undefined ? parseInt(m[6], 10) : undefined;

		// For 'before:', round up to the end of the most specific unit given.
		// For 'after:', use the start of the most specific unit.
		if (prefix === 'before') {
			if (second !== undefined) {
				return new Date(year, month!, day!, hour!, minute!, second, 999).getTime();
			} else if (minute !== undefined) {
				return new Date(year, month!, day!, hour!, minute, 59, 999).getTime();
			} else if (hour !== undefined) {
				return new Date(year, month!, day!, hour, 59, 59, 999).getTime();
			} else if (day !== undefined) {
				return new Date(year, month!, day, 23, 59, 59, 999).getTime();
			} else if (month !== undefined) {
				// End of the given month
				return new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
			} else {
				// End of the given year
				return new Date(year, 11, 31, 23, 59, 59, 999).getTime();
			}
		} else {
			return new Date(
				year,
				month ?? 0,
				day ?? 1,
				hour ?? 0,
				minute ?? 0,
				second ?? 0,
				0,
			).getTime();
		}
	}

	/** Returns the text filter with before:/after: tokens removed. */
	get textFilterWithoutTimestamps(): string {
		return this.textFilter
			.replace(/\b(?:before|after):\d{4}(?:-\d{2}(?:-\d{2}(?:t\d{1,2}(?::\d{2}(?::\d{2})?)?)?)?)?\b/g, '')
			.trim();
	}

	isTimestampVisible(created: Date): boolean {
		const time = created.getTime();
		if (this.beforeTimestamp !== undefined && time > this.beforeTimestamp) {
			return false;
		}
		if (this.afterTimestamp !== undefined && time < this.afterTimestamp) {
			return false;
		}
		return true;
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
	const kindPromptDiscoveryKey = CHAT_DEBUG_KIND_PROMPT_DISCOVERY.bindTo(scopedContextKeyService);
	kindPromptDiscoveryKey.set(true);
	const kindSubagentKey = CHAT_DEBUG_KIND_SUBAGENT.bindTo(scopedContextKeyService);
	kindSubagentKey.set(true);
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
	registerToggle(CHAT_DEBUG_CMD_TOGGLE_PROMPT_DISCOVERY, localize('chatDebug.filter.promptDiscovery', "Chat Customization"), CHAT_DEBUG_KIND_PROMPT_DISCOVERY, '1_kind', () => state.filterKindPromptDiscovery, v => { state.filterKindPromptDiscovery = v; }, kindPromptDiscoveryKey);
	registerToggle(CHAT_DEBUG_CMD_TOGGLE_SUBAGENT, localize('chatDebug.filter.subagent', "Subagent Invocations"), CHAT_DEBUG_KIND_SUBAGENT, '1_kind', () => state.filterKindSubagent, v => { state.filterKindSubagent = v; }, kindSubagentKey);

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
	const kindPromptDiscoveryKey = CHAT_DEBUG_KIND_PROMPT_DISCOVERY.bindTo(scopedContextKeyService);
	const kindSubagentKey = CHAT_DEBUG_KIND_SUBAGENT.bindTo(scopedContextKeyService);
	return () => {
		kindToolCallKey.set(state.filterKindToolCall);
		kindModelTurnKey.set(state.filterKindModelTurn);
		kindPromptDiscoveryKey.set(state.filterKindPromptDiscovery);
		kindSubagentKey.set(state.filterKindSubagent);
	};
}
