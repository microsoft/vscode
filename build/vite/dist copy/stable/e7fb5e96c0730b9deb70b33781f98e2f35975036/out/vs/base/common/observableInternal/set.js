/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { observableValueOpts } from './observables/observableValueOpts.js';
export class ObservableSet {
    constructor() {
        this._data = new Set();
        this._obs = observableValueOpts({ equalsFn: () => false }, this);
        this.observable = this._obs;
    }
    get size() {
        return this._data.size;
    }
    has(value) {
        return this._data.has(value);
    }
    add(value, tx) {
        const hadValue = this._data.has(value);
        if (!hadValue) {
            this._data.add(value);
            this._obs.set(this, tx);
        }
        return this;
    }
    delete(value, tx) {
        const result = this._data.delete(value);
        if (result) {
            this._obs.set(this, tx);
        }
        return result;
    }
    clear(tx) {
        if (this._data.size > 0) {
            this._data.clear();
            this._obs.set(this, tx);
        }
    }
    forEach(callbackfn, thisArg) {
        this._data.forEach((value, value2, _set) => {
            // eslint-disable-next-line local/code-no-any-casts
            callbackfn.call(thisArg, value, value2, this);
        });
    }
    *entries() {
        for (const value of this._data) {
            yield [value, value];
        }
    }
    *keys() {
        yield* this._data.keys();
    }
    *values() {
        yield* this._data.values();
    }
    [Symbol.iterator]() {
        return this.values();
    }
    get [Symbol.toStringTag]() {
        return 'ObservableSet';
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vb2JzZXJ2YWJsZUludGVybmFsL3NldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUUzRSxNQUFNLE9BQU8sYUFBYTtJQUExQjtRQUVrQixVQUFLLEdBQUcsSUFBSSxHQUFHLEVBQUssQ0FBQztRQUU5QixTQUFJLEdBQUcsbUJBQW1CLENBQUMsRUFBRSxRQUFRLEVBQUUsR0FBRyxFQUFFLENBQUMsS0FBSyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFM0QsZUFBVSxHQUF3QixJQUFJLENBQUMsSUFBSSxDQUFDO0lBOER0RCxDQUFDO0lBNURBLElBQUksSUFBSTtRQUNQLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUM7SUFDeEIsQ0FBQztJQUVELEdBQUcsQ0FBQyxLQUFRO1FBQ1gsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM5QixDQUFDO0lBRUQsR0FBRyxDQUFDLEtBQVEsRUFBRSxFQUFpQjtRQUM5QixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN2QyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDZixJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN0QixJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDekIsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVELE1BQU0sQ0FBQyxLQUFRLEVBQUUsRUFBaUI7UUFDakMsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDeEMsSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUNaLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN6QixDQUFDO1FBQ0QsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0lBRUQsS0FBSyxDQUFDLEVBQWlCO1FBQ3RCLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDekIsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNuQixJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDekIsQ0FBQztJQUNGLENBQUM7SUFFRCxPQUFPLENBQUMsVUFBc0QsRUFBRSxPQUFhO1FBQzVFLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsRUFBRTtZQUMxQyxtREFBbUQ7WUFDbkQsVUFBVSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxJQUFXLENBQUMsQ0FBQztRQUN0RCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxDQUFDLE9BQU87UUFDUCxLQUFLLE1BQU0sS0FBSyxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNoQyxNQUFNLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3RCLENBQUM7SUFDRixDQUFDO0lBRUQsQ0FBQyxJQUFJO1FBQ0osS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUMxQixDQUFDO0lBRUQsQ0FBQyxNQUFNO1FBQ04sS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUM1QixDQUFDO0lBRUQsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDO1FBQ2hCLE9BQU8sSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQ3RCLENBQUM7SUFFRCxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQztRQUN2QixPQUFPLGVBQWUsQ0FBQztJQUN4QixDQUFDO0NBQ0QifQ==