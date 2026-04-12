/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class RateLimiter {
    constructor(timesPerSecond = 5) {
        this.timesPerSecond = timesPerSecond;
        this._lastRun = 0;
        this._minimumTimeBetweenRuns = 1000 / timesPerSecond;
    }
    runIfNotLimited(callback) {
        const now = Date.now();
        if (now - this._lastRun >= this._minimumTimeBetweenRuns) {
            this._lastRun = now;
            callback();
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi90b2tlbnMvY29tbW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE1BQU0sT0FBTyxXQUFXO0lBSXZCLFlBQTRCLGlCQUF5QixDQUFDO1FBQTFCLG1CQUFjLEdBQWQsY0FBYyxDQUFZO1FBQ3JELElBQUksQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDO1FBQ2xCLElBQUksQ0FBQyx1QkFBdUIsR0FBRyxJQUFJLEdBQUcsY0FBYyxDQUFDO0lBQ3RELENBQUM7SUFFTSxlQUFlLENBQUMsUUFBb0I7UUFDMUMsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3ZCLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLHVCQUF1QixFQUFFLENBQUM7WUFDekQsSUFBSSxDQUFDLFFBQVEsR0FBRyxHQUFHLENBQUM7WUFDcEIsUUFBUSxFQUFFLENBQUM7UUFDWixDQUFDO0lBQ0YsQ0FBQztDQUNEIn0=