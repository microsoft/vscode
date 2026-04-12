/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isThenable, Promises } from '../../../base/common/async.js';
// Shared veto handling across main and renderer
export function handleVetos(vetos, onError) {
    if (vetos.length === 0) {
        return Promise.resolve(false);
    }
    const promises = [];
    let lazyValue = false;
    for (const valueOrPromise of vetos) {
        // veto, done
        if (valueOrPromise === true) {
            return Promise.resolve(true);
        }
        if (isThenable(valueOrPromise)) {
            promises.push(valueOrPromise.then(value => {
                if (value) {
                    lazyValue = true; // veto, done
                }
            }, err => {
                onError(err); // error, treated like a veto, done
                lazyValue = true;
            }));
        }
    }
    return Promises.settled(promises).then(() => lazyValue);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlmZWN5Y2xlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUVyRSxnREFBZ0Q7QUFDaEQsTUFBTSxVQUFVLFdBQVcsQ0FBQyxLQUFxQyxFQUFFLE9BQStCO0lBQ2pHLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUN4QixPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDL0IsQ0FBQztJQUVELE1BQU0sUUFBUSxHQUFvQixFQUFFLENBQUM7SUFDckMsSUFBSSxTQUFTLEdBQUcsS0FBSyxDQUFDO0lBRXRCLEtBQUssTUFBTSxjQUFjLElBQUksS0FBSyxFQUFFLENBQUM7UUFFcEMsYUFBYTtRQUNiLElBQUksY0FBYyxLQUFLLElBQUksRUFBRSxDQUFDO1lBQzdCLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM5QixDQUFDO1FBRUQsSUFBSSxVQUFVLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQztZQUNoQyxRQUFRLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUU7Z0JBQ3pDLElBQUksS0FBSyxFQUFFLENBQUM7b0JBQ1gsU0FBUyxHQUFHLElBQUksQ0FBQyxDQUFDLGFBQWE7Z0JBQ2hDLENBQUM7WUFDRixDQUFDLEVBQUUsR0FBRyxDQUFDLEVBQUU7Z0JBQ1IsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsbUNBQW1DO2dCQUNqRCxTQUFTLEdBQUcsSUFBSSxDQUFDO1lBQ2xCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDO0lBQ0YsQ0FBQztJQUVELE9BQU8sUUFBUSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDekQsQ0FBQyJ9