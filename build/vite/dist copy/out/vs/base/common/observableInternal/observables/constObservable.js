/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ConvenientObservable } from './baseObservable.js';
/**
 * Represents an efficient observable whose value never changes.
 */
export function constObservable(value) {
    return new ConstObservable(value);
}
class ConstObservable extends ConvenientObservable {
    constructor(value) {
        super();
        this.value = value;
    }
    get debugName() {
        return this.toString();
    }
    get() {
        return this.value;
    }
    addObserver(observer) {
        // NO OP
    }
    removeObserver(observer) {
        // NO OP
    }
    log() {
        return this;
    }
    toString() {
        return `Const: ${this.value}`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uc3RPYnNlcnZhYmxlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vb2JzZXJ2YWJsZUludGVybmFsL29ic2VydmFibGVzL2NvbnN0T2JzZXJ2YWJsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUUzRDs7R0FFRztBQUVILE1BQU0sVUFBVSxlQUFlLENBQUksS0FBUTtJQUMxQyxPQUFPLElBQUksZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ25DLENBQUM7QUFDRCxNQUFNLGVBQW1CLFNBQVEsb0JBQTZCO0lBQzdELFlBQTZCLEtBQVE7UUFDcEMsS0FBSyxFQUFFLENBQUM7UUFEb0IsVUFBSyxHQUFMLEtBQUssQ0FBRztJQUVyQyxDQUFDO0lBRUQsSUFBb0IsU0FBUztRQUM1QixPQUFPLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUN4QixDQUFDO0lBRU0sR0FBRztRQUNULE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQztJQUNuQixDQUFDO0lBQ00sV0FBVyxDQUFDLFFBQW1CO1FBQ3JDLFFBQVE7SUFDVCxDQUFDO0lBQ00sY0FBYyxDQUFDLFFBQW1CO1FBQ3hDLFFBQVE7SUFDVCxDQUFDO0lBRVEsR0FBRztRQUNYLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVRLFFBQVE7UUFDaEIsT0FBTyxVQUFVLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUMvQixDQUFDO0NBQ0QifQ==