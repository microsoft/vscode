/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BugIndicatingError } from './errors.js';
/*
 * This file contains helper classes to manage control flow.
*/
/**
 * Prevents code from being re-entrant.
*/
export class ReentrancyBarrier {
    constructor() {
        this._isOccupied = false;
    }
    /**
     * Calls `runner` if the barrier is not occupied.
     * During the call, the barrier becomes occupied.
     */
    runExclusivelyOrSkip(runner) {
        if (this._isOccupied) {
            return;
        }
        this._isOccupied = true;
        try {
            runner();
        }
        finally {
            this._isOccupied = false;
        }
    }
    /**
     * Calls `runner`. If the barrier is occupied, throws an error.
     * During the call, the barrier becomes active.
     */
    runExclusivelyOrThrow(runner) {
        if (this._isOccupied) {
            throw new BugIndicatingError(`ReentrancyBarrier: reentrant call detected!`);
        }
        this._isOccupied = true;
        try {
            runner();
        }
        finally {
            this._isOccupied = false;
        }
    }
    /**
     * Indicates if some runner occupies this barrier.
    */
    get isOccupied() {
        return this._isOccupied;
    }
    makeExclusiveOrSkip(fn) {
        return ((...args) => {
            if (this._isOccupied) {
                return;
            }
            this._isOccupied = true;
            try {
                return fn(...args);
            }
            finally {
                this._isOccupied = false;
            }
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udHJvbEZsb3cuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9jb250cm9sRmxvdy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFFakQ7O0VBRUU7QUFFRjs7RUFFRTtBQUNGLE1BQU0sT0FBTyxpQkFBaUI7SUFBOUI7UUFDUyxnQkFBVyxHQUFHLEtBQUssQ0FBQztJQXNEN0IsQ0FBQztJQXBEQTs7O09BR0c7SUFDSSxvQkFBb0IsQ0FBQyxNQUFrQjtRQUM3QyxJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUN0QixPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO1FBQ3hCLElBQUksQ0FBQztZQUNKLE1BQU0sRUFBRSxDQUFDO1FBQ1YsQ0FBQztnQkFBUyxDQUFDO1lBQ1YsSUFBSSxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUM7UUFDMUIsQ0FBQztJQUNGLENBQUM7SUFFRDs7O09BR0c7SUFDSSxxQkFBcUIsQ0FBQyxNQUFrQjtRQUM5QyxJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUN0QixNQUFNLElBQUksa0JBQWtCLENBQUMsNkNBQTZDLENBQUMsQ0FBQztRQUM3RSxDQUFDO1FBQ0QsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUM7UUFDeEIsSUFBSSxDQUFDO1lBQ0osTUFBTSxFQUFFLENBQUM7UUFDVixDQUFDO2dCQUFTLENBQUM7WUFDVixJQUFJLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztRQUMxQixDQUFDO0lBQ0YsQ0FBQztJQUVEOztNQUVFO0lBQ0YsSUFBVyxVQUFVO1FBQ3BCLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQztJQUN6QixDQUFDO0lBRU0sbUJBQW1CLENBQTBCLEVBQTRCO1FBQy9FLE9BQU8sQ0FBQyxDQUFDLEdBQUcsSUFBVyxFQUFFLEVBQUU7WUFDMUIsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ3RCLE9BQU87WUFDUixDQUFDO1lBQ0QsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUM7WUFDeEIsSUFBSSxDQUFDO2dCQUNKLE9BQU8sRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFDcEIsQ0FBQztvQkFBUyxDQUFDO2dCQUNWLElBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO1lBQzFCLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7Q0FDRCJ9