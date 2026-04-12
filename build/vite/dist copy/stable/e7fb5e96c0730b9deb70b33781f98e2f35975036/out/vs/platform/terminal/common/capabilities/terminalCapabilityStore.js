/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { memoize } from '../../../../base/common/decorators.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
export class TerminalCapabilityStore extends Disposable {
    constructor() {
        super(...arguments);
        this._map = new Map();
        this._onDidAddCapability = this._register(new Emitter());
        this._onDidRemoveCapability = this._register(new Emitter());
    }
    get onDidAddCapability() { return this._onDidAddCapability.event; }
    get onDidRemoveCapability() { return this._onDidRemoveCapability.event; }
    get onDidChangeCapabilities() {
        return Event.map(Event.any(this._onDidAddCapability.event, this._onDidRemoveCapability.event), () => void 0, this._store);
    }
    get onDidAddCommandDetectionCapability() {
        return Event.map(Event.filter(this.onDidAddCapability, e => e.id === 2 /* TerminalCapability.CommandDetection */, this._store), e => e.capability, this._store);
    }
    get onDidRemoveCommandDetectionCapability() {
        return Event.map(Event.filter(this.onDidRemoveCapability, e => e.id === 2 /* TerminalCapability.CommandDetection */, this._store), () => void 0, this._store);
    }
    get onDidAddCwdDetectionCapability() {
        return Event.map(Event.filter(this.onDidAddCapability, e => e.id === 0 /* TerminalCapability.CwdDetection */, this._store), e => e.capability, this._store);
    }
    get onDidRemoveCwdDetectionCapability() {
        return Event.map(Event.filter(this.onDidRemoveCapability, e => e.id === 0 /* TerminalCapability.CwdDetection */, this._store), () => void 0, this._store);
    }
    get items() {
        return this._map.keys();
    }
    createOnDidRemoveCapabilityOfTypeEvent(type) {
        return Event.map(Event.filter(this.onDidRemoveCapability, e => e.id === type), e => e.capability);
    }
    createOnDidAddCapabilityOfTypeEvent(type) {
        return Event.map(Event.filter(this.onDidAddCapability, e => e.id === type), e => e.capability);
    }
    add(capability, impl) {
        this._map.set(capability, impl);
        this._onDidAddCapability.fire(createCapabilityEvent(capability, impl));
    }
    get(capability) {
        // HACK: This isn't totally safe since the Map key and value are not connected
        return this._map.get(capability);
    }
    remove(capability) {
        const impl = this._map.get(capability);
        if (!impl) {
            return;
        }
        this._map.delete(capability);
        this._onDidRemoveCapability.fire(createCapabilityEvent(capability, impl));
    }
    has(capability) {
        return this._map.has(capability);
    }
}
__decorate([
    memoize
], TerminalCapabilityStore.prototype, "onDidChangeCapabilities", null);
__decorate([
    memoize
], TerminalCapabilityStore.prototype, "onDidAddCommandDetectionCapability", null);
__decorate([
    memoize
], TerminalCapabilityStore.prototype, "onDidRemoveCommandDetectionCapability", null);
__decorate([
    memoize
], TerminalCapabilityStore.prototype, "onDidAddCwdDetectionCapability", null);
__decorate([
    memoize
], TerminalCapabilityStore.prototype, "onDidRemoveCwdDetectionCapability", null);
export class TerminalCapabilityStoreMultiplexer extends Disposable {
    constructor() {
        super(...arguments);
        this._stores = [];
        this._onDidAddCapability = this._register(new Emitter());
        this._onDidRemoveCapability = this._register(new Emitter());
    }
    get onDidAddCapability() { return this._onDidAddCapability.event; }
    get onDidRemoveCapability() { return this._onDidRemoveCapability.event; }
    get onDidChangeCapabilities() {
        return Event.map(Event.any(this._onDidAddCapability.event, this._onDidRemoveCapability.event), () => void 0, this._store);
    }
    get onDidAddCommandDetectionCapability() {
        return Event.map(Event.filter(this.onDidAddCapability, e => e.id === 2 /* TerminalCapability.CommandDetection */, this._store), e => e.capability, this._store);
    }
    get onDidRemoveCommandDetectionCapability() {
        return Event.map(Event.filter(this.onDidRemoveCapability, e => e.id === 2 /* TerminalCapability.CommandDetection */, this._store), () => void 0, this._store);
    }
    get onDidAddCwdDetectionCapability() {
        return Event.map(Event.filter(this.onDidAddCapability, e => e.id === 0 /* TerminalCapability.CwdDetection */, this._store), e => e.capability, this._store);
    }
    get onDidRemoveCwdDetectionCapability() {
        return Event.map(Event.filter(this.onDidRemoveCapability, e => e.id === 0 /* TerminalCapability.CwdDetection */, this._store), () => void 0, this._store);
    }
    get items() {
        return this._items();
    }
    createOnDidRemoveCapabilityOfTypeEvent(type) {
        return Event.map(Event.filter(this.onDidRemoveCapability, e => e.id === type), e => e.capability);
    }
    createOnDidAddCapabilityOfTypeEvent(type) {
        return Event.map(Event.filter(this.onDidAddCapability, e => e.id === type), e => e.capability);
    }
    *_items() {
        for (const store of this._stores) {
            for (const c of store.items) {
                yield c;
            }
        }
    }
    has(capability) {
        for (const store of this._stores) {
            for (const c of store.items) {
                if (c === capability) {
                    return true;
                }
            }
        }
        return false;
    }
    get(capability) {
        for (const store of this._stores) {
            const c = store.get(capability);
            if (c) {
                return c;
            }
        }
        return undefined;
    }
    add(store) {
        this._stores.push(store);
        for (const capability of store.items) {
            this._onDidAddCapability.fire(createCapabilityEvent(capability, store.get(capability)));
        }
        this._register(store.onDidAddCapability(e => this._onDidAddCapability.fire(e)));
        this._register(store.onDidRemoveCapability(e => this._onDidRemoveCapability.fire(e)));
    }
}
__decorate([
    memoize
], TerminalCapabilityStoreMultiplexer.prototype, "onDidChangeCapabilities", null);
__decorate([
    memoize
], TerminalCapabilityStoreMultiplexer.prototype, "onDidAddCommandDetectionCapability", null);
__decorate([
    memoize
], TerminalCapabilityStoreMultiplexer.prototype, "onDidRemoveCommandDetectionCapability", null);
__decorate([
    memoize
], TerminalCapabilityStoreMultiplexer.prototype, "onDidAddCwdDetectionCapability", null);
__decorate([
    memoize
], TerminalCapabilityStoreMultiplexer.prototype, "onDidRemoveCwdDetectionCapability", null);
function createCapabilityEvent(capability, impl) {
    // HACK: This cast is required to convert a generic type to a discriminated union, this is
    // necessary in order to enable type narrowing on the event consumer side.
    // eslint-disable-next-line local/code-no-dangerous-type-assertions
    return { id: capability, capability: impl };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxDYXBhYmlsaXR5U3RvcmUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL3Rlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUdsRSxNQUFNLE9BQU8sdUJBQXdCLFNBQVEsVUFBVTtJQUF2RDs7UUFDUyxTQUFJLEdBQTRFLElBQUksR0FBRyxFQUFFLENBQUM7UUFFakYsd0JBQW1CLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBb0MsQ0FBQyxDQUFDO1FBRXRGLDJCQUFzQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQW9DLENBQUMsQ0FBQztJQTREM0csQ0FBQztJQTdEQSxJQUFJLGtCQUFrQixLQUFLLE9BQU8sSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFFbkUsSUFBSSxxQkFBcUIsS0FBSyxPQUFPLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBR3pFLElBQUksdUJBQXVCO1FBQzFCLE9BQU8sS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUN6QixJQUFJLENBQUMsbUJBQW1CLENBQUMsS0FBSyxFQUM5QixJQUFJLENBQUMsc0JBQXNCLENBQUMsS0FBSyxDQUNqQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUMvQixDQUFDO0lBRUQsSUFBSSxrQ0FBa0M7UUFDckMsT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsZ0RBQXdDLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFVBQXlDLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3hMLENBQUM7SUFFRCxJQUFJLHFDQUFxQztRQUN4QyxPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxnREFBd0MsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3ZKLENBQUM7SUFFRCxJQUFJLDhCQUE4QjtRQUNqQyxPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSw0Q0FBb0MsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBcUMsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDaEwsQ0FBQztJQUVELElBQUksaUNBQWlDO1FBQ3BDLE9BQU8sS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLDRDQUFvQyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDbkosQ0FBQztJQUVELElBQUksS0FBSztRQUNSLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUN6QixDQUFDO0lBRUQsc0NBQXNDLENBQStCLElBQU87UUFDM0UsT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxVQUEyQyxDQUFDLENBQUM7SUFDcEksQ0FBQztJQUNELG1DQUFtQyxDQUErQixJQUFPO1FBQ3hFLE9BQU8sS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBMkMsQ0FBQyxDQUFDO0lBQ2pJLENBQUM7SUFFRCxHQUFHLENBQStCLFVBQWEsRUFBRSxJQUFtQztRQUNuRixJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDaEMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUN4RSxDQUFDO0lBRUQsR0FBRyxDQUErQixVQUFhO1FBQzlDLDhFQUE4RTtRQUM5RSxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBOEMsQ0FBQztJQUMvRSxDQUFDO0lBRUQsTUFBTSxDQUFDLFVBQThCO1FBQ3BDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNYLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDN0IsSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUMzRSxDQUFDO0lBRUQsR0FBRyxDQUFDLFVBQThCO1FBQ2pDLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDbEMsQ0FBQztDQUNEO0FBeERBO0lBREMsT0FBTztzRUFNUDtBQUVEO0lBREMsT0FBTztpRkFHUDtBQUVEO0lBREMsT0FBTztvRkFHUDtBQUVEO0lBREMsT0FBTzs2RUFHUDtBQUVEO0lBREMsT0FBTztnRkFHUDtBQXFDRixNQUFNLE9BQU8sa0NBQW1DLFNBQVEsVUFBVTtJQUFsRTs7UUFDVSxZQUFPLEdBQStCLEVBQUUsQ0FBQztRQUVqQyx3QkFBbUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFvQyxDQUFDLENBQUM7UUFFdEYsMkJBQXNCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBb0MsQ0FBQyxDQUFDO0lBMkUzRyxDQUFDO0lBNUVBLElBQUksa0JBQWtCLEtBQUssT0FBTyxJQUFJLENBQUMsbUJBQW1CLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUVuRSxJQUFJLHFCQUFxQixLQUFLLE9BQU8sSUFBSSxDQUFDLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFHekUsSUFBSSx1QkFBdUI7UUFDMUIsT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQ3pCLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLEVBQzlCLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxLQUFLLENBQ2pDLEVBQUUsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQy9CLENBQUM7SUFFRCxJQUFJLGtDQUFrQztRQUNyQyxPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxnREFBd0MsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBeUMsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDeEwsQ0FBQztJQUVELElBQUkscUNBQXFDO1FBQ3hDLE9BQU8sS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLGdEQUF3QyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDdkosQ0FBQztJQUVELElBQUksOEJBQThCO1FBQ2pDLE9BQU8sS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLDRDQUFvQyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxVQUFxQyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUNoTCxDQUFDO0lBRUQsSUFBSSxpQ0FBaUM7UUFDcEMsT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsNENBQW9DLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUNuSixDQUFDO0lBRUQsSUFBSSxLQUFLO1FBQ1IsT0FBTyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDdEIsQ0FBQztJQUVELHNDQUFzQyxDQUErQixJQUFPO1FBQzNFLE9BQU8sS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBMkMsQ0FBQyxDQUFDO0lBQ3BJLENBQUM7SUFDRCxtQ0FBbUMsQ0FBK0IsSUFBTztRQUN4RSxPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFVBQTJDLENBQUMsQ0FBQztJQUNqSSxDQUFDO0lBRU8sQ0FBQyxNQUFNO1FBQ2QsS0FBSyxNQUFNLEtBQUssSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDbEMsS0FBSyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQzdCLE1BQU0sQ0FBQyxDQUFDO1lBQ1QsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRUQsR0FBRyxDQUFDLFVBQThCO1FBQ2pDLEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2xDLEtBQUssTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUM3QixJQUFJLENBQUMsS0FBSyxVQUFVLEVBQUUsQ0FBQztvQkFDdEIsT0FBTyxJQUFJLENBQUM7Z0JBQ2IsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRUQsR0FBRyxDQUErQixVQUFhO1FBQzlDLEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2xDLE1BQU0sQ0FBQyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDaEMsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDUCxPQUFPLENBQUMsQ0FBQztZQUNWLENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVELEdBQUcsQ0FBQyxLQUErQjtRQUNsQyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN6QixLQUFLLE1BQU0sVUFBVSxJQUFJLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUN0QyxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBRSxDQUFDLENBQUMsQ0FBQztRQUMxRixDQUFDO1FBQ0QsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoRixJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3ZGLENBQUM7Q0FDRDtBQXZFQTtJQURDLE9BQU87aUZBTVA7QUFFRDtJQURDLE9BQU87NEZBR1A7QUFFRDtJQURDLE9BQU87K0ZBR1A7QUFFRDtJQURDLE9BQU87d0ZBR1A7QUFFRDtJQURDLE9BQU87MkZBR1A7QUFvREYsU0FBUyxxQkFBcUIsQ0FBK0IsVUFBYSxFQUFFLElBQW1DO0lBQzlHLDBGQUEwRjtJQUMxRiwwRUFBMEU7SUFDMUUsbUVBQW1FO0lBQ25FLE9BQU8sRUFBRSxFQUFFLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQXNDLENBQUM7QUFDakYsQ0FBQyJ9