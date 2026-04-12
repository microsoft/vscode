/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { viewFilterSubmenu } from '../../../../browser/parts/views/viewFilter.js';
import { parseTimeToken, stripTimestampTokens } from '../../common/chatDebugEvents.js';
import { CHAT_DEBUG_FILTER_ACTIVE, CHAT_DEBUG_KIND_TOOL_CALL, CHAT_DEBUG_KIND_MODEL_TURN, CHAT_DEBUG_KIND_PROMPT_DISCOVERY, CHAT_DEBUG_KIND_SUBAGENT, CHAT_DEBUG_CMD_TOGGLE_TOOL_CALL, CHAT_DEBUG_CMD_TOGGLE_MODEL_TURN, CHAT_DEBUG_CMD_TOGGLE_PROMPT_DISCOVERY, CHAT_DEBUG_CMD_TOGGLE_SUBAGENT, } from './chatDebugTypes.js';
/**
 * Shared filter state for the Agent Debug Logs.
 *
 * Both the Logs view and the Flow Chart view read from this single source of
 * truth. Toggle commands modify the state and fire `onDidChange` so every
 * consumer can re-render.
 */
export class ChatDebugFilterState extends Disposable {
    constructor() {
        super(...arguments);
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        // Kind visibility
        this.filterKindToolCall = true;
        this.filterKindModelTurn = true;
        this.filterKindPromptDiscovery = true;
        this.filterKindSubagent = true;
        // Text filter
        this.textFilter = '';
    }
    isKindVisible(kind, category) {
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
    isAllKindsVisible() {
        return this.filterKindToolCall && this.filterKindModelTurn &&
            this.filterKindPromptDiscovery && this.filterKindSubagent;
    }
    isAllFiltersDefault() {
        return this.isAllKindsVisible();
    }
    setTextFilter(text) {
        const normalized = text.toLowerCase();
        if (this.textFilter !== normalized) {
            this.textFilter = normalized;
            this.beforeTimestamp = parseTimeToken(normalized, 'before');
            this.afterTimestamp = parseTimeToken(normalized, 'after');
            this._onDidChange.fire();
        }
    }
    /** Returns the text filter with before:/after: tokens removed. */
    get textFilterWithoutTimestamps() {
        return stripTimestampTokens(this.textFilter);
    }
    isTimestampVisible(created) {
        const time = created.getTime();
        if (this.beforeTimestamp !== undefined && time > this.beforeTimestamp) {
            return false;
        }
        if (this.afterTimestamp !== undefined && time < this.afterTimestamp) {
            return false;
        }
        return true;
    }
    fire() {
        this._onDidChange.fire();
    }
}
/**
 * Registers the toggle-filter commands and menu items once, wired to a shared
 * {@link ChatDebugFilterState}. Returns a disposable that unregisters them.
 */
export function registerFilterMenuItems(state, scopedContextKeyService) {
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
    const registerToggle = (id, title, key, group, getter, setter, ctxKey) => {
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
export function bindFilterContextKeys(state, scopedContextKeyService) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnRmlsdGVycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RGVidWcvY2hhdERlYnVnRmlsdGVycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFFakQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxjQUFjLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RixPQUFPLEVBQ04sd0JBQXdCLEVBQ3hCLHlCQUF5QixFQUFFLDBCQUEwQixFQUFFLGdDQUFnQyxFQUFFLHdCQUF3QixFQUNqSCwrQkFBK0IsRUFBRSxnQ0FBZ0MsRUFBRSxzQ0FBc0MsRUFDekcsOEJBQThCLEdBQzlCLE1BQU0scUJBQXFCLENBQUM7QUFFN0I7Ozs7OztHQU1HO0FBQ0gsTUFBTSxPQUFPLG9CQUFxQixTQUFRLFVBQVU7SUFBcEQ7O1FBRWtCLGlCQUFZLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBUSxDQUFDLENBQUM7UUFDM0QsZ0JBQVcsR0FBZ0IsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUM7UUFFNUQsa0JBQWtCO1FBQ2xCLHVCQUFrQixHQUFZLElBQUksQ0FBQztRQUNuQyx3QkFB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