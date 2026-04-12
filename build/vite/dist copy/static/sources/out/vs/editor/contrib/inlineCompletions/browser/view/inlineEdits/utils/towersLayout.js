/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * The tower areas are arranged from left to right, touch and are aligned at the bottom.
 * How high can a tower be placed at the requested horizontal range, so that its size fits into the union of the stacked availableTowerAreas?
 */
export function getMaxTowerHeightInAvailableArea(towerHorizontalRange, availableTowerAreas) {
    const towerLeftOffset = towerHorizontalRange.start;
    const towerRightOffset = towerHorizontalRange.endExclusive;
    let minHeight = Number.MAX_VALUE;
    // Calculate the accumulated width to find which tower areas the requested tower overlaps
    let currentLeftOffset = 0;
    for (const availableArea of availableTowerAreas) {
        const currentRightOffset = currentLeftOffset + availableArea.width;
        // Check if the requested tower overlaps with this available area
        const overlapLeft = Math.max(towerLeftOffset, currentLeftOffset);
        const overlapRight = Math.min(towerRightOffset, currentRightOffset);
        if (overlapLeft < overlapRight) {
            // There is an overlap - track the minimum height
            minHeight = Math.min(minHeight, availableArea.height);
        }
        currentLeftOffset = currentRightOffset;
    }
    if (towerRightOffset > currentLeftOffset) {
        return 0;
    }
    // If no overlap was found, return 0
    return minHeight === Number.MAX_VALUE ? 0 : minHeight;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG93ZXJzTGF5b3V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci92aWV3L2lubGluZUVkaXRzL3V0aWxzL3Rvd2Vyc0xheW91dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUtoRzs7O0dBR0c7QUFDSCxNQUFNLFVBQVUsZ0NBQWdDLENBQUMsb0JBQWlDLEVBQUUsbUJBQTZCO0lBQ2hILE1BQU0sZUFBZSxHQUFHLG9CQUFvQixDQUFDLEtBQUssQ0FBQztJQUNuRCxNQUFNLGdCQUFnQixHQUFHLG9CQUFvQixDQUFDLFlBQVksQ0FBQztJQUUzRCxJQUFJLFNBQVMsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDO0lBRWpDLHlGQUF5RjtJQUN6RixJQUFJLGlCQUFpQixHQUFHLENBQUMsQ0FBQztJQUMxQixLQUFLLE1BQU0sYUFBYSxJQUFJLG1CQUFtQixFQUFFLENBQUM7UUFDakQsTUFBTSxrQkFBa0IsR0FBRyxpQkFBaUIsR0FBRyxhQUFhLENBQUMsS0FBSyxDQUFDO1FBRW5FLGlFQUFpRTtRQUNqRSxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLGVBQWUsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUVwRSxJQUFJLFdBQVcsR0FBRyxZQUFZLEVBQUUsQ0FBQztZQUNoQyxpREFBaUQ7WUFDakQsU0FBUyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN2RCxDQUFDO1FBRUQsaUJBQWlCLEdBQUcsa0JBQWtCLENBQUM7SUFDeEMsQ0FBQztJQUVELElBQUksZ0JBQWdCLEdBQUcsaUJBQWlCLEVBQUUsQ0FBQztRQUMxQyxPQUFPLENBQUMsQ0FBQztJQUNWLENBQUM7SUFFRCxvQ0FBb0M7SUFDcEMsT0FBTyxTQUFTLEtBQUssTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7QUFDdkQsQ0FBQyJ9