/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isObject } from './types.js';
class Verifier {
    constructor(defaultValue) {
        this.defaultValue = defaultValue;
    }
    verify(value) {
        if (!this.isType(value)) {
            return this.defaultValue;
        }
        return value;
    }
}
export class BooleanVerifier extends Verifier {
    isType(value) {
        return typeof value === 'boolean';
    }
}
export class NumberVerifier extends Verifier {
    isType(value) {
        return typeof value === 'number';
    }
}
export class SetVerifier extends Verifier {
    isType(value) {
        return value instanceof Set;
    }
}
export class EnumVerifier extends Verifier {
    constructor(defaultValue, allowedValues) {
        super(defaultValue);
        this.allowedValues = allowedValues;
    }
    isType(value) {
        return this.allowedValues.includes(value);
    }
}
export class ObjectVerifier extends Verifier {
    constructor(defaultValue, verifier) {
        super(defaultValue);
        this.verifier = verifier;
    }
    verify(value) {
        if (!this.isType(value)) {
            return this.defaultValue;
        }
        return verifyObject(this.verifier, value);
    }
    isType(value) {
        return isObject(value);
    }
}
export function verifyObject(verifiers, value) {
    const result = Object.create(null);
    for (const key in verifiers) {
        if (Object.hasOwnProperty.call(verifiers, key)) {
            const verifier = verifiers[key];
            // eslint-disable-next-line local/code-no-any-casts
            result[key] = verifier.verify(value[key]);
        }
    }
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyaWZpZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi92ZXJpZmllci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBTXRDLE1BQWUsUUFBUTtJQUV0QixZQUErQixZQUFlO1FBQWYsaUJBQVksR0FBWixZQUFZLENBQUc7SUFBSSxDQUFDO0lBRW5ELE1BQU0sQ0FBQyxLQUFjO1FBQ3BCLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDekIsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDO1FBQzFCLENBQUM7UUFFRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7Q0FHRDtBQUVELE1BQU0sT0FBTyxlQUFnQixTQUFRLFFBQWlCO0lBQzNDLE1BQU0sQ0FBQyxLQUFjO1FBQzlCLE9BQU8sT0FBTyxLQUFLLEtBQUssU0FBUyxDQUFDO0lBQ25DLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxjQUFlLFNBQVEsUUFBZ0I7SUFDekMsTUFBTSxDQUFDLEtBQWM7UUFDOUIsT0FBTyxPQUFPLEtBQUssS0FBSyxRQUFRLENBQUM7SUFDbEMsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLFdBQWUsU0FBUSxRQUFnQjtJQUN6QyxNQUFNLENBQUMsS0FBYztRQUM5QixPQUFPLEtBQUssWUFBWSxHQUFHLENBQUM7SUFDN0IsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLFlBQWdCLFNBQVEsUUFBVztJQUcvQyxZQUFZLFlBQWUsRUFBRSxhQUErQjtRQUMzRCxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDcEIsSUFBSSxDQUFDLGFBQWEsR0FBRyxhQUFhLENBQUM7SUFDcEMsQ0FBQztJQUVTLE1BQU0sQ0FBQyxLQUFjO1FBQzlCLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsS0FBVSxDQUFDLENBQUM7SUFDaEQsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLGNBQWlDLFNBQVEsUUFBVztJQUVoRSxZQUFZLFlBQWUsRUFBbUIsUUFBNkM7UUFDMUYsS0FBSyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRHlCLGFBQVEsR0FBUixRQUFRLENBQXFDO0lBRTNGLENBQUM7SUFFUSxNQUFNLENBQUMsS0FBYztRQUM3QixJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3pCLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQztRQUMxQixDQUFDO1FBQ0QsT0FBTyxZQUFZLENBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRVMsTUFBTSxDQUFDLEtBQWM7UUFDOUIsT0FBTyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDeEIsQ0FBQztDQUNEO0FBRUQsTUFBTSxVQUFVLFlBQVksQ0FBbUIsU0FBOEMsRUFBRSxLQUFhO0lBQzNHLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFbkMsS0FBSyxNQUFNLEdBQUcsSUFBSSxTQUFTLEVBQUUsQ0FBQztRQUM3QixJQUFJLE1BQU0sQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ2hELE1BQU0sUUFBUSxHQUFHLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNoQyxtREFBbUQ7WUFDbkQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUUsS0FBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDcEQsQ0FBQztJQUNGLENBQUM7SUFFRCxPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUMifQ==