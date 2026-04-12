/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BugIndicatingError } from '../../../base/common/errors.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
export const quadVertices = new Float32Array([
    1, 0,
    1, 1,
    0, 1,
    0, 0,
    0, 1,
    1, 0,
]);
export function ensureNonNullable(value) {
    if (!value) {
        throw new Error(`Value "${value}" cannot be null`);
    }
    return value;
}
// TODO: Move capabilities into ElementSizeObserver?
export function observeDevicePixelDimensions(element, parentWindow, callback) {
    // Observe any resizes to the element and extract the actual pixel size of the element if the
    // devicePixelContentBoxSize API is supported. This allows correcting rounding errors when
    // converting between CSS pixels and device pixels which causes blurry rendering when device
    // pixel ratio is not a round number.
    let observer = new parentWindow.ResizeObserver((entries) => {
        const entry = entries.find((entry) => entry.target === element);
        if (!entry) {
            return;
        }
        // Disconnect if devicePixelContentBoxSize isn't supported by the browser
        if (!('devicePixelContentBoxSize' in entry)) {
            observer?.disconnect();
            observer = undefined;
            return;
        }
        // Fire the callback, ignore events where the dimensions are 0x0 as the canvas is likely hidden
        const width = entry.devicePixelContentBoxSize[0].inlineSize;
        const height = entry.devicePixelContentBoxSize[0].blockSize;
        if (width > 0 && height > 0) {
            callback(width, height);
        }
    });
    try {
        // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
        observer.observe(element, { box: ['device-pixel-content-box'] });
    }
    catch {
        observer.disconnect();
        observer = undefined;
        throw new BugIndicatingError('Could not observe device pixel dimensions');
    }
    return toDisposable(() => observer?.disconnect());
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3B1VXRpbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci9ncHUvZ3B1VXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFlBQVksRUFBb0IsTUFBTSxtQ0FBbUMsQ0FBQztBQUVuRixNQUFNLENBQUMsTUFBTSxZQUFZLEdBQUcsSUFBSSxZQUFZLENBQUM7SUFDNUMsQ0FBQyxFQUFFLENBQUM7SUFDSixDQUFDLEVBQUUsQ0FBQztJQUNKLENBQUMsRUFBRSxDQUFDO0lBQ0osQ0FBQyxFQUFFLENBQUM7SUFDSixDQUFDLEVBQUUsQ0FBQztJQUNKLENBQUMsRUFBRSxDQUFDO0NBQ0osQ0FBQyxDQUFDO0FBRUgsTUFBTSxVQUFVLGlCQUFpQixDQUFJLEtBQWU7SUFDbkQsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ1osTUFBTSxJQUFJLEtBQUssQ0FBQyxVQUFVLEtBQUssa0JBQWtCLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBQ0QsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBRUQsb0RBQW9EO0FBQ3BELE1BQU0sVUFBVSw0QkFBNEIsQ0FBQyxPQUFvQixFQUFFLFlBQXdDLEVBQUUsUUFBNkQ7SUFDekssNkZBQTZGO0lBQzdGLDBGQUEwRjtJQUMxRiw0RkFBNEY7SUFDNUYscUNBQXFDO0lBQ3JDLElBQUksUUFBUSxHQUErQixJQUFJLFlBQVksQ0FBQyxjQUFjLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtRQUN0RixNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsTUFBTSxLQUFLLE9BQU8sQ0FBQyxDQUFDO1FBQ2hFLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNaLE9BQU87UUFDUixDQUFDO1FBRUQseUVBQXlFO1FBQ3pFLElBQUksQ0FBQyxDQUFDLDJCQUEyQixJQUFJLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDN0MsUUFBUSxFQUFFLFVBQVUsRUFBRSxDQUFDO1lBQ3ZCLFFBQVEsR0FBRyxTQUFTLENBQUM7WUFDckIsT0FBTztRQUNSLENBQUM7UUFFRCwrRkFBK0Y7UUFDL0YsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQztRQUM1RCxNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBQzVELElBQUksS0FBSyxHQUFHLENBQUMsSUFBSSxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDN0IsUUFBUSxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztRQUN6QixDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUM7SUFDSCxJQUFJLENBQUM7UUFDSix1RkFBdUY7UUFDdkYsUUFBUSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRSxHQUFHLEVBQUUsQ0FBQywwQkFBMEIsQ0FBQyxFQUFTLENBQUMsQ0FBQztJQUN6RSxDQUFDO0lBQUMsTUFBTSxDQUFDO1FBQ1IsUUFBUSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ3RCLFFBQVEsR0FBRyxTQUFTLENBQUM7UUFDckIsTUFBTSxJQUFJLGtCQUFrQixDQUFDLDJDQUEyQyxDQUFDLENBQUM7SUFDM0UsQ0FBQztJQUNELE9BQU8sWUFBWSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBQ25ELENBQUMifQ==