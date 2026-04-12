/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { assert } from '../../../../../../../base/common/assert.js';
import { isOneOf } from '../../../../../../../base/common/types.js';
/**
 * Mocks an `TObject` with the provided `overrides`.
 *
 * If you need to mock an `Service`, please use {@link mockService}
 * instead which provides better type safety guarantees for the case.
 *
 * @throws Reading non-overridden property or function on `TObject` throws an error.
 */
export function mockObject(overrides) {
    // ensure that the overrides object cannot be modified afterward
    overrides = Object.freeze(overrides);
    const keys = [];
    for (const key in overrides) {
        if (Object.hasOwn(overrides, key)) {
            keys.push(key);
        }
    }
    const mocked = new Proxy({}, {
        get: (_target, key) => {
            assert(isOneOf(key, keys), `The '${key}' is not mocked.`);
            // note! it's ok to type assert here, because of the explicit runtime
            //       assertion  above
            return overrides[key];
        },
    });
    // note! it's ok to type assert here, because of the runtime checks in
    //       the `Proxy` getter
    return mocked;
}
/**
 * Mocks provided service with the provided `overrides`.
 * Same as more generic {@link mockObject} utility, but with
 * the service constraint on the `TService` type.
 *
 * @throws Reading non-overridden property or function
 * 		   on `TService` throws an error.
 */
export function mockService(overrides) {
    return mockObject(overrides);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9jay5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcHJvbXB0U3ludGF4L3V0aWxzL21vY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUlwRTs7Ozs7OztHQU9HO0FBQ0gsTUFBTSxVQUFVLFVBQVUsQ0FDekIsU0FBMkI7SUFFM0IsZ0VBQWdFO0lBQ2hFLFNBQVMsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBRXJDLE1BQU0sSUFBSSxHQUErQixFQUFFLENBQUM7SUFDNUMsS0FBSyxNQUFNLEdBQUcsSUFBSSxTQUFTLEVBQUUsQ0FBQztRQUM3QixJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDbkMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNoQixDQUFDO0lBQ0YsQ0FBQztJQUVELE1BQU0sTUFBTSxHQUFXLElBQUksS0FBSyxDQUMvQixFQUFFLEVBQ0Y7UUFDQyxHQUFHLEVBQUUsQ0FDSixPQUFnQixFQUNoQixHQUE2QixFQUNoQixFQUFFO1lBQ2YsTUFBTSxDQUNMLE9BQU8sQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLEVBQ2xCLFFBQVEsR0FBRyxrQkFBa0IsQ0FDN0IsQ0FBQztZQUVGLHFFQUFxRTtZQUNyRSx5QkFBeUI7WUFDekIsT0FBTyxTQUFTLENBQUMsR0FBUSxDQUFlLENBQUM7UUFDMUMsQ0FBQztLQUNELENBQUMsQ0FBQztJQUVKLHNFQUFzRTtJQUN0RSwyQkFBMkI7SUFDM0IsT0FBTyxNQUFpQixDQUFDO0FBQzFCLENBQUM7QUFTRDs7Ozs7OztHQU9HO0FBQ0gsTUFBTSxVQUFVLFdBQVcsQ0FDMUIsU0FBNEI7SUFFNUIsT0FBTyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDOUIsQ0FBQyJ9