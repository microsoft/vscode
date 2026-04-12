/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from '../../../../base/common/event.js';
import { KeyCodeChord } from '../../../../base/common/keybindings.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { OS } from '../../../../base/common/platform.js';
import { NoMatchingKb } from '../../common/keybindingResolver.js';
import { USLayoutResolvedKeybinding } from '../../common/usLayoutResolvedKeybinding.js';
class MockKeybindingContextKey {
    constructor(defaultValue) {
        this._defaultValue = defaultValue;
        this._value = this._defaultValue;
    }
    set(value) {
        this._value = value;
    }
    reset() {
        this._value = this._defaultValue;
    }
    get() {
        return this._value;
    }
}
export class MockContextKeyService {
    constructor() {
        this._keys = new Map();
    }
    dispose() {
        //
    }
    createKey(key, defaultValue) {
        const ret = new MockKeybindingContextKey(defaultValue);
        this._keys.set(key, ret);
        return ret;
    }
    contextMatchesRules(rules) {
        return false;
    }
    get onDidChangeContext() {
        return Event.None;
    }
    bufferChangeEvents(callback) { callback(); }
    getContextKeyValue(key) {
        const value = this._keys.get(key);
        if (value) {
            return value.get();
        }
    }
    getContext(domNode) {
        return null;
    }
    createScoped(domNode) {
        return this;
    }
    createOverlay() {
        return this;
    }
    updateParent(_parentContextKeyService) {
        // no-op
    }
}
export class MockScopableContextKeyService extends MockContextKeyService {
    /**
     * Don't implement this for all tests since we rarely depend on this behavior and it isn't implemented fully
     */
    createScoped(domNote) {
        return new MockScopableContextKeyService();
    }
}
export class MockKeybindingService {
    constructor() {
        this.inChordMode = false;
    }
    get onDidUpdateKeybindings() {
        return Event.None;
    }
    getDefaultKeybindingsContent() {
        return '';
    }
    getDefaultKeybindings() {
        return [];
    }
    getKeybindings() {
        return [];
    }
    resolveKeybinding(keybinding) {
        return USLayoutResolvedKeybinding.resolveKeybinding(keybinding, OS);
    }
    resolveKeyboardEvent(keyboardEvent) {
        const chord = new KeyCodeChord(keyboardEvent.ctrlKey, keyboardEvent.shiftKey, keyboardEvent.altKey, keyboardEvent.metaKey, keyboardEvent.keyCode);
        return this.resolveKeybinding(chord.toKeybinding())[0];
    }
    resolveUserBinding(userBinding) {
        return [];
    }
    lookupKeybindings(commandId) {
        return [];
    }
    lookupKeybinding(commandId) {
        return undefined;
    }
    customKeybindingsCount() {
        return 0;
    }
    softDispatch(keybinding, target) {
        return NoMatchingKb;
    }
    dispatchByUserSettingsLabel(userSettingsLabel, target) {
    }
    dispatchEvent(e, target) {
        return false;
    }
    enableKeybindingHoldMode(commandId) {
        return undefined;
    }
    mightProducePrintableCharacter(e) {
        return false;
    }
    toggleLogging() {
        return false;
    }
    _dumpDebugInfo() {
        return '';
    }
    _dumpDebugInfoJSON() {
        return '';
    }
    registerSchemaContribution() {
        return Disposable.None;
    }
    appendKeybinding(label, _commandId, _context, _enforceContextCheck) {
        return label;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0va2V5YmluZGluZy90ZXN0L2NvbW1vbi9tb2NrS2V5YmluZGluZ1NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxZQUFZLEVBQWtDLE1BQU0sd0NBQXdDLENBQUM7QUFDdEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxFQUFFLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUd6RCxPQUFPLEVBQUUsWUFBWSxFQUFvQixNQUFNLG9DQUFvQyxDQUFDO0FBRXBGLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRXhGLE1BQU0sd0JBQXdCO0lBSTdCLFlBQVksWUFBMkI7UUFDdEMsSUFBSSxDQUFDLGFBQWEsR0FBRyxZQUFZLENBQUM7UUFDbEMsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDO0lBQ2xDLENBQUM7SUFFTSxHQUFHLENBQUMsS0FBb0I7UUFDOUIsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7SUFDckIsQ0FBQztJQUVNLEtBQUs7UUFDWCxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUM7SUFDbEMsQ0FBQztJQUVNLEdBQUc7UUFDVCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUM7SUFDcEIsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLHFCQUFxQjtJQUFsQztRQUdTLFVBQUssR0FBRyxJQUFJLEdBQUcsRUFBNEIsQ0FBQztJQW1DckQsQ0FBQztJQWpDTyxPQUFPO1FBQ2IsRUFBRTtJQUNILENBQUM7SUFDTSxTQUFTLENBQThDLEdBQVcsRUFBRSxZQUEyQjtRQUNyRyxNQUFNLEdBQUcsR0FBRyxJQUFJLHdCQUF3QixDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ3ZELElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN6QixPQUFPLEdBQUcsQ0FBQztJQUNaLENBQUM7SUFDTSxtQkFBbUIsQ0FBQyxLQUEyQjtRQUNyRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFDRCxJQUFXLGtCQUFrQjtRQUM1QixPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUM7SUFDbkIsQ0FBQztJQUNNLGtCQUFrQixDQUFDLFFBQW9CLElBQUksUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3hELGtCQUFrQixDQUFDLEdBQVc7UUFDcEMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbEMsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUNYLE9BQU8sS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3BCLENBQUM7SUFDRixDQUFDO0lBQ00sVUFBVSxDQUFDLE9BQW9CO1FBQ3JDLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUNNLFlBQVksQ0FBQyxPQUFvQjtRQUN2QyxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFDTSxhQUFhO1FBQ25CLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUNELFlBQVksQ0FBQyx3QkFBNEM7UUFDeEQsUUFBUTtJQUNULENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyw2QkFBOEIsU0FBUSxxQkFBcUI7SUFDdkU7O09BRUc7SUFDYSxZQUFZLENBQUMsT0FBb0I7UUFDaEQsT0FBTyxJQUFJLDZCQUE2QixFQUFFLENBQUM7SUFDNUMsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLHFCQUFxQjtJQUFsQztRQUdpQixnQkFBVyxHQUFZLEtBQUssQ0FBQztJQXdGOUMsQ0FBQztJQXRGQSxJQUFXLHNCQUFzQjtRQUNoQyxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUM7SUFDbkIsQ0FBQztJQUVNLDRCQUE0QjtRQUNsQyxPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFFTSxxQkFBcUI7UUFDM0IsT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDO0lBRU0sY0FBYztRQUNwQixPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFFTSxpQkFBaUIsQ0FBQyxVQUFzQjtRQUM5QyxPQUFPLDBCQUEwQixDQUFDLGlCQUFpQixDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNyRSxDQUFDO0lBRU0sb0JBQW9CLENBQUMsYUFBNkI7UUFDeEQsTUFBTSxLQUFLLEdBQUcsSUFBSSxZQUFZLENBQzdCLGFBQWEsQ0FBQyxPQUFPLEVBQ3JCLGFBQWEsQ0FBQyxRQUFRLEVBQ3RCLGFBQWEsQ0FBQyxNQUFNLEVBQ3BCLGFBQWEsQ0FBQyxPQUFPLEVBQ3JCLGFBQWEsQ0FBQyxPQUFPLENBQ3JCLENBQUM7UUFDRixPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN4RCxDQUFDO0lBRU0sa0JBQWtCLENBQUMsV0FBbUI7UUFDNUMsT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDO0lBRU0saUJBQWlCLENBQUMsU0FBaUI7UUFDekMsT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDO0lBRU0sZ0JBQWdCLENBQUMsU0FBaUI7UUFDeEMsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVNLHNCQUFzQjtRQUM1QixPQUFPLENBQUMsQ0FBQztJQUNWLENBQUM7SUFFTSxZQUFZLENBQUMsVUFBMEIsRUFBRSxNQUFnQztRQUMvRSxPQUFPLFlBQVksQ0FBQztJQUNyQixDQUFDO0lBRU0sMkJBQTJCLENBQUMsaUJBQXlCLEVBQUUsTUFBZ0M7SUFFOUYsQ0FBQztJQUVNLGFBQWEsQ0FBQyxDQUFpQixFQUFFLE1BQWdDO1FBQ3ZFLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVNLHdCQUF3QixDQUFDLFNBQWlCO1FBQ2hELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFTSw4QkFBOEIsQ0FBQyxDQUFpQjtRQUN0RCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFTSxhQUFhO1FBQ25CLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVNLGNBQWM7UUFDcEIsT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDO0lBRU0sa0JBQWtCO1FBQ3hCLE9BQU8sRUFBRSxDQUFDO0lBQ1gsQ0FBQztJQUVNLDBCQUEwQjtRQUNoQyxPQUFPLFVBQVUsQ0FBQyxJQUFJLENBQUM7SUFDeEIsQ0FBQztJQUVNLGdCQUFnQixDQUFDLEtBQWEsRUFBRSxVQUFrQixFQUFFLFFBQTZCLEVBQUUsb0JBQThCO1FBQ3ZILE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztDQUNEIn0=