/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var Constants;
(function (Constants) {
    Constants[Constants["MaxRecorderDataSize"] = 10485760] = "MaxRecorderDataSize"; // 10MB
})(Constants || (Constants = {}));
export class TerminalRecorder {
    constructor(cols, rows) {
        this._totalDataLength = 0;
        this._entries = [{ cols, rows, data: [] }];
    }
    handleResize(cols, rows) {
        if (this._entries.length > 0) {
            const lastEntry = this._entries[this._entries.length - 1];
            if (lastEntry.data.length === 0) {
                // last entry is just a resize, so just remove it
                this._entries.pop();
            }
        }
        if (this._entries.length > 0) {
            const lastEntry = this._entries[this._entries.length - 1];
            if (lastEntry.cols === cols && lastEntry.rows === rows) {
                // nothing changed
                return;
            }
            if (lastEntry.cols === 0 && lastEntry.rows === 0) {
                // we finally received a good size!
                lastEntry.cols = cols;
                lastEntry.rows = rows;
                return;
            }
        }
        this._entries.push({ cols, rows, data: [] });
    }
    handleData(data) {
        const lastEntry = this._entries[this._entries.length - 1];
        lastEntry.data.push(data);
        this._totalDataLength += data.length;
        while (this._totalDataLength > 10485760 /* Constants.MaxRecorderDataSize */) {
            const firstEntry = this._entries[0];
            const remainingToDelete = this._totalDataLength - 10485760 /* Constants.MaxRecorderDataSize */;
            if (remainingToDelete >= firstEntry.data[0].length) {
                // the first data piece must be deleted
                this._totalDataLength -= firstEntry.data[0].length;
                firstEntry.data.shift();
                if (firstEntry.data.length === 0) {
                    // the first entry must be deleted
                    this._entries.shift();
                }
            }
            else {
                // the first data piece must be partially deleted
                firstEntry.data[0] = firstEntry.data[0].substr(remainingToDelete);
                this._totalDataLength -= remainingToDelete;
            }
        }
    }
    generateReplayEventSync() {
        // normalize entries to one element per data array
        this._entries.forEach((entry) => {
            if (entry.data.length > 0) {
                entry.data = [entry.data.join('')];
            }
        });
        return {
            events: this._entries.map(entry => ({ cols: entry.cols, rows: entry.rows, data: entry.data[0] ?? '' })),
            // No command restoration is needed when relaunching terminals
            commands: {
                isWindowsPty: false,
                hasRichCommandDetection: false,
                commands: [],
                promptInputModel: undefined,
            }
        };
    }
    async generateReplayEvent() {
        return this.generateReplayEventSync();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxSZWNvcmRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbFJlY29yZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBS2hHLElBQVcsU0FFVjtBQUZELFdBQVcsU0FBUztJQUNuQiw4RUFBc0MsQ0FBQSxDQUFDLE9BQU87QUFDL0MsQ0FBQyxFQUZVLFNBQVMsS0FBVCxTQUFTLFFBRW5CO0FBWUQsTUFBTSxPQUFPLGdCQUFnQjtJQUs1QixZQUFZLElBQVksRUFBRSxJQUFZO1FBRjlCLHFCQUFnQixHQUFXLENBQUMsQ0FBQztRQUdwQyxJQUFJLENBQUMsUUFBUSxHQUFHLENBQUMsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFFRCxZQUFZLENBQUMsSUFBWSxFQUFFLElBQVk7UUFDdEMsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUM5QixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQzFELElBQUksU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ2pDLGlEQUFpRDtnQkFDakQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNyQixDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDOUIsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFD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