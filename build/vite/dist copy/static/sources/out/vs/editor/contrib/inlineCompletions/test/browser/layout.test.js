/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Size2D } from '../../../../common/core/2d/size.js';
import { OffsetRange } from '../../../../common/core/ranges/offsetRange.js';
import { getMaxTowerHeightInAvailableArea } from '../../browser/view/inlineEdits/utils/towersLayout.js';
suite('Layout - getMaxTowerHeightInAvailableArea', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('tower fits within single available area', () => {
        const towerHorizontalRange = new OffsetRange(5, 15); // width of 10
        const availableTowerAreas = [new Size2D(50, 30)];
        // Should return the available height (30)
        assert.strictEqual(getMaxTowerHeightInAvailableArea(towerHorizontalRange, availableTowerAreas), 30);
    });
    test('max height available in area', () => {
        const towerHorizontalRange = new OffsetRange(5, 15); // width of 10
        const availableTowerAreas = [new Size2D(50, 30)];
        // Should return the available height (30), even if original tower was 40
        assert.strictEqual(getMaxTowerHeightInAvailableArea(towerHorizontalRange, availableTowerAreas), 30);
    });
    test('tower extends beyond available width', () => {
        const towerHorizontalRange = new OffsetRange(0, 60); // width of 60
        const availableTowerAreas = [new Size2D(50, 30)];
        // Should return 0 because tower extends beyond available areas
        assert.strictEqual(getMaxTowerHeightInAvailableArea(towerHorizontalRange, availableTowerAreas), 0);
    });
    test('tower fits across multiple available areas', () => {
        const towerHorizontalRange = new OffsetRange(10, 40); // width of 30
        const availableTowerAreas = [
            new Size2D(20, 30),
            new Size2D(20, 25),
            new Size2D(20, 30)
        ];
        // Should return the minimum height across overlapping areas (25)
        assert.strictEqual(getMaxTowerHeightInAvailableArea(towerHorizontalRange, availableTowerAreas), 25);
    });
    test('min height across overlapping areas', () => {
        const towerHorizontalRange = new OffsetRange(10, 40); // width of 30
        const availableTowerAreas = [
            new Size2D(20, 30),
            new Size2D(20, 15), // Shortest area
            new Size2D(20, 30)
        ];
        // Should return the minimum height (15)
        assert.strictEqual(getMaxTowerHeightInAvailableArea(towerHorizontalRange, availableTowerAreas), 15);
    });
    test('tower at left edge of available areas', () => {
        const towerHorizontalRange = new OffsetRange(0, 10); // width of 10
        const availableTowerAreas = [new Size2D(50, 30)];
        // Should return the available height (30)
        assert.strictEqual(getMaxTowerHeightInAvailableArea(towerHorizontalRange, availableTowerAreas), 30);
    });
    test('tower at right edge of available areas', () => {
        const towerHorizontalRange = new OffsetRange(40, 50); // width of 10
        const availableTowerAreas = [new Size2D(50, 30)];
        // Should return the available height (30)
        assert.strictEqual(getMaxTowerHeightInAvailableArea(towerHorizontalRange, availableTowerAreas), 30);
    });
    test('tower exactly matches available area', () => {
        const towerHorizontalRange = new OffsetRange(0, 50); // width of 50
        const availableTowerAreas = [new Size2D(50, 30)];
        // Should return the available height (30)
        assert.strictEqual(getMaxTowerHeightInAvailableArea(towerHorizontalRange, availableTowerAreas), 30);
    });
    test('empty available areas', () => {
        const towerHorizontalRange = new OffsetRange(0, 10); // width of 10
        const availableTowerAreas = [];
        // Should return 0 for empty areas
        assert.strictEqual(getMaxTowerHeightInAvailableArea(towerHorizontalRange, availableTowerAreas), 0);
    });
    test('tower spans exactly two available areas', () => {
        const towerHorizontalRange = new OffsetRange(10, 50); // width of 40
        const availableTowerAreas = [
            new Size2D(30, 25),
            new Size2D(30, 25)
        ];
        // Should return the minimum height across both areas (25)
        assert.strictEqual(getMaxTowerHeightInAvailableArea(towerHorizontalRange, availableTowerAreas), 25);
    });
    test('tower starts at boundary between two areas', () => {
        const towerHorizontalRange = new OffsetRange(30, 50); // width of 20
        const availableTowerAreas = [
            new Size2D(30, 25),
            new Size2D(30, 25)
        ];
        // Should return the height of the second area (25)
        assert.strictEqual(getMaxTowerHeightInAvailableArea(towerHorizontalRange, availableTowerAreas), 25);
    });
    test('tower with varying height available areas', () => {
        const towerHorizontalRange = new OffsetRange(0, 50); // width of 50
        const availableTowerAreas = [
            new Size2D(10, 30),
            new Size2D(10, 15), // Shortest area
            new Size2D(10, 25),
            new Size2D(10, 30),
            new Size2D(10, 40)
        ];
        // Should return the minimum height (15)
        assert.strictEqual(getMaxTowerHeightInAvailableArea(towerHorizontalRange, availableTowerAreas), 15);
    });
    test('tower beyond all available areas to the right', () => {
        const towerHorizontalRange = new OffsetRange(100, 110); // width of 10
        const availableTowerAreas = [new Size2D(50, 30)];
        // Should return 0 because tower is beyond available areas
        assert.strictEqual(getMaxTowerHeightInAvailableArea(towerHorizontalRange, availableTowerAreas), 0);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGF5b3V0LnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy90ZXN0L2Jyb3dzZXIvbGF5b3V0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDNUUsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFeEcsS0FBSyxDQUFDLDJDQUEyQyxFQUFFLEdBQUcsRUFBRTtJQUN2RCx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyx5Q0FBeUMsRUFBRSxHQUFHLEVBQUU7UUFDcEQsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLFdBQVcsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxjQUFjO1FBQ25FLE1BQU0sbUJBQW1CLEdBQUcsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVqRCwwQ0FBMEM7UUFDMUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxnQ0FBZ0MsQ0FBQyxvQkFBb0IsRUFBRSxtQkFBbUIsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ3JHLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDhCQUE4QixFQUFFLEdBQUcsRUFBRTtRQUN6QyxNQUFNLG9CQUFvQixHQUFHLElBQUksV0FBVyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLGNBQWM7UUFDbkUsTUFBTSxtQkFB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