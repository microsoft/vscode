/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { stub } from 'sinon';
export function mock() {
    // eslint-disable-next-line local/code-no-any-casts
    return function () { };
}
// Creates an object object that returns sinon mocks for every property. Optionally
// takes base properties.
export const mockObject = () => (properties) => {
    // eslint-disable-next-line local/code-no-any-casts
    return new Proxy({ ...properties }, {
        get(target, key) {
            if (!target.hasOwnProperty(key)) {
                target[key] = stub();
            }
            return target[key];
        },
        set(target, key, value) {
            target[key] = value;
            return true;
        },
    });
};
/**
 * Shortcut for type-safe partials in mocks. A shortcut for `obj as Partial<T> as T`.
 */
export function upcastPartial(partial) {
    return partial;
}
export function upcastDeepPartial(partial) {
    return partial;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9jay5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvdGVzdC9jb21tb24vbW9jay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQWEsSUFBSSxFQUFFLE1BQU0sT0FBTyxDQUFDO0FBT3hDLE1BQU0sVUFBVSxJQUFJO0lBQ25CLG1EQUFtRDtJQUNuRCxPQUFPLGNBQWMsQ0FBUSxDQUFDO0FBQy9CLENBQUM7QUFJRCxtRkFBbUY7QUFDbkYseUJBQXlCO0FBQ3pCLE1BQU0sQ0FBQyxNQUFNLFVBQVUsR0FBRyxHQUFxQixFQUFFLENBQUMsQ0FBNkIsVUFBZSxFQUEyQixFQUFFO0lBQzFILG1EQUFtRDtJQUNuRCxPQUFPLElBQUksS0FBSyxDQUFDLEVBQUUsR0FBRyxVQUFVLEVBQVMsRUFBRTtRQUMxQyxHQUFHLENBQUMsTUFBTSxFQUFFLEdBQUc7WUFDZCxJQUFJLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNqQyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsSUFBSSxFQUFFLENBQUM7WUFDdEIsQ0FBQztZQUVELE9BQU8sTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3BCLENBQUM7UUFDRCxHQUFHLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxLQUFLO1lBQ3JCLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUM7WUFDcEIsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO0tBQ0QsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDO0FBRUY7O0dBRUc7QUFDSCxNQUFNLFVBQVUsYUFBYSxDQUFJLE9BQW1CO0lBQ25ELE9BQU8sT0FBWSxDQUFDO0FBQ3JCLENBQUM7QUFDRCxNQUFNLFVBQVUsaUJBQWlCLENBQUksT0FBdUI7SUFDM0QsT0FBTyxPQUFZLENBQUM7QUFDckIsQ0FBQyJ9