/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
export const staticObservableValue = (value) => ({
    onDidChange: Event.None,
    value,
});
export class MutableObservableValue extends Disposable {
    get value() {
        return this._value;
    }
    set value(v) {
        if (v !== this._value) {
            this._value = v;
            this.changeEmitter.fire(v);
        }
    }
    static stored(stored, defaultValue) {
        const o = new MutableObservableValue(stored.get(defaultValue));
        o._register(stored);
        o._register(o.onDidChange(value => stored.store(value)));
        return o;
    }
    constructor(_value) {
        super();
        this._value = _value;
        this.changeEmitter = this._register(new Emitter());
        this.onDidChange = this.changeEmitter.event;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib2JzZXJ2YWJsZVZhbHVlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVzdGluZy9jb21tb24vb2JzZXJ2YWJsZVZhbHVlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBUWxFLE1BQU0sQ0FBQyxNQUFNLHFCQUFxQixHQUFHLENBQUksS0FBUSxFQUF1QixFQUFFLENBQUMsQ0FBQztJQUMzRSxXQUFXLEVBQUUsS0FBSyxDQUFDLElBQUk7SUFDdkIsS0FBSztDQUNMLENBQUMsQ0FBQztBQUVILE1BQU0sT0FBTyxzQkFBMEIsU0FBUSxVQUFVO0lBS3hELElBQVcsS0FBSztRQUNmLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQztJQUNwQixDQUFDO0lBRUQsSUFBVyxLQUFLLENBQUMsQ0FBSTtRQUNwQixJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDdkIsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7WUFDaEIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDNUIsQ0FBQztJQUNGLENBQUM7SUFFTSxNQUFNLENBQUMsTUFBTSxDQUFJLE1BQXNCLEVBQUUsWUFBZTtRQUM5RCxNQUFNLENBQUMsR0FBRyxJQUFJLHNCQUFzQixDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztRQUMvRCxDQUFDLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3BCLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pELE9BQU8sQ0FBQyxDQUFDO0lBQ1YsQ0FBQztJQUVELFlBQW9CLE1BQVM7UUFDNUIsS0FBSyxFQUFFLENBQUM7UUFEVyxXQUFNLEdBQU4sTUFBTSxDQUFHO1FBdEJaLGtCQUFhLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBSyxDQUFDLENBQUM7UUFFbEQsZ0JBQVcsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQztJQXNCdkQsQ0FBQztDQUNEIn0=