/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { InvalidTestItemError } from '../../contrib/testing/common/testItemCollection.js';
const eventPrivateApis = new WeakMap();
export const createPrivateApiFor = (impl, controllerId) => {
    const api = { controllerId };
    eventPrivateApis.set(impl, api);
    return api;
};
/**
 * Gets the private API for a test item implementation. This implementation
 * is a managed object, but we keep a weakmap to avoid exposing any of the
 * internals to extensions.
 */
export const getPrivateApiFor = (impl) => {
    const api = eventPrivateApis.get(impl);
    if (!api) {
        throw new InvalidTestItemError(impl?.id || '<unknown>');
    }
    return api;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFRlc3RpbmdQcml2YXRlQXBpLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdFRlc3RpbmdQcml2YXRlQXBpLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBd0Isb0JBQW9CLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQVNoSCxNQUFNLGdCQUFnQixHQUFHLElBQUksT0FBTyxFQUF3QyxDQUFDO0FBRTdFLE1BQU0sQ0FBQyxNQUFNLG1CQUFtQixHQUFHLENBQUMsSUFBcUIsRUFBRSxZQUFvQixFQUFFLEVBQUU7SUFDbEYsTUFBTSxHQUFHLEdBQXdCLEVBQUUsWUFBWSxFQUFFLENBQUM7SUFDbEQsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztJQUNoQyxPQUFPLEdBQUcsQ0FBQztBQUNaLENBQUMsQ0FBQztBQUVGOzs7O0dBSUc7QUFDSCxNQUFNLENBQUMsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLElBQXFCLEVBQUUsRUFBRTtJQUN6RCxNQUFNLEdBQUcsR0FBRyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDdkMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ1YsTUFBTSxJQUFJLG9CQUFvQixDQUFDLElBQUksRUFBRSxFQUFFLElBQUksV0FBVyxDQUFDLENBQUM7SUFDekQsQ0FBQztJQUVELE9BQU8sR0FBRyxDQUFDO0FBQ1osQ0FBQyxDQUFDIn0=