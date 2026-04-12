/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { getExtensionForMimeType, normalizeMimeType } from '../../common/mime.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
suite('Mime', () => {
    test('normalize', () => {
        assert.strictEqual(normalizeMimeType('invalid'), 'invalid');
        assert.strictEqual(normalizeMimeType('invalid', true), undefined);
        assert.strictEqual(normalizeMimeType('Text/plain'), 'text/plain');
        assert.strictEqual(normalizeMimeType('Text/pläin'), 'text/pläin');
        assert.strictEqual(normalizeMimeType('Text/plain;UPPER'), 'text/plain;UPPER');
        assert.strictEqual(normalizeMimeType('Text/plain;lower'), 'text/plain;lower');
    });
    test('getExtensionForMimeType', () => {
        // Note: for MIME types with multiple extensions (e.g., image/jpg -> .jpe, .jpeg, .jpg),
        // the function returns the first matching extension in iteration order
        assert.ok(['.jpe', '.jpeg', '.jpg'].includes(getExtensionForMimeType('image/jpg')));
        // image/jpeg is an alias for image/jpg and should also return a valid extension
        assert.ok(['.jpe', '.jpeg', '.jpg'].includes(getExtensionForMimeType('image/jpeg')));
        assert.strictEqual(getExtensionForMimeType('image/png'), '.png');
        assert.strictEqual(getExtensionForMimeType('image/gif'), '.gif');
        assert.strictEqual(getExtensionForMimeType('image/webp'), '.webp');
        assert.ok(['.mp2', '.mp2a', '.mp3', '.mpga', '.m2a', '.m3a'].includes(getExtensionForMimeType('audio/mpeg')));
        assert.ok(['.mp4', '.mp4v', '.mpg4'].includes(getExtensionForMimeType('video/mp4')));
        assert.strictEqual(getExtensionForMimeType('unknown/type'), undefined);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWltZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L2NvbW1vbi9taW1lLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ2xGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUVyRSxLQUFLLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRTtJQUVsQixJQUFJLENBQUMsV0FBVyxFQUFFLEdBQUcsRUFBRTtRQUN0QixNQUFNLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzVELE1BQU0sQ0FBQyxXQUFXLENBQUMsaUJBQWlCLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ2xFLE1BQU0sQ0FBQyxXQUFXLENBQUMsaUJBQWlCLENBQUMsWUFBWSxDQUFDLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDbEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUNsRSxNQUFNLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLGtCQUFrQixDQUFDLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUM5RSxNQUFNLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLGtCQUFrQixDQUFDLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztJQUMvRSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLEVBQUU7UUFDcEMsd0ZBQXdGO1FBQ3hGLHVFQUF1RTtRQUN2RSxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxFQUFFLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsdUJBQXVCLENBQUMsV0FBVyxDQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3JGLGdGQUFnRjtRQUNoRixNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxFQUFFLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsdUJBQXVCLENBQUMsWUFBWSxDQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3RGLE1BQU0sQ0FBQyxXQUFXLENBQUMsdUJBQXVCLENBQUMsV0FBVyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyx1QkFBdUIsQ0FBQyxXQUFXLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ25FLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsQ0FBQyxZQUFZLENBQUUsQ0FBQyxDQUFDLENBQUM7UUFDL0csTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLHVCQUF1QixDQUFDLFdBQVcsQ0FBRSxDQUFDLENBQUMsQ0FBQztRQUN0RixNQUFNLENBQUMsV0FBVyxDQUFDLHVCQUF1QixDQUFDLGNBQWMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ3hFLENBQUMsQ0FBQyxDQUFDO0lBRUgsdUNBQXVDLEVBQUUsQ0FBQztBQUMzQyxDQUFDLENBQUMsQ0FBQyJ9