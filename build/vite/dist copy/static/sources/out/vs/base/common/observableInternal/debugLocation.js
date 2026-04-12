/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var DebugLocation;
(function (DebugLocation) {
    let enabled = false;
    function enable() {
        enabled = true;
    }
    DebugLocation.enable = enable;
    function ofCaller() {
        if (!enabled) {
            return undefined;
        }
        const Err = Error;
        const l = Err.stackTraceLimit;
        Err.stackTraceLimit = 3;
        const stack = new Error().stack;
        Err.stackTraceLimit = l;
        return DebugLocationImpl.fromStack(stack, 2);
    }
    DebugLocation.ofCaller = ofCaller;
})(DebugLocation || (DebugLocation = {}));
class DebugLocationImpl {
    static fromStack(stack, parentIdx) {
        const lines = stack.split('\n');
        const location = parseLine(lines[parentIdx + 1]);
        if (location) {
            return new DebugLocationImpl(location.fileName, location.line, location.column, location.id);
        }
        else {
            return undefined;
        }
    }
    constructor(fileName, line, column, id) {
        this.fileName = fileName;
        this.line = line;
        this.column = column;
        this.id = id;
    }
}
function parseLine(stackLine) {
    const match = stackLine.match(/\((.*):(\d+):(\d+)\)/);
    if (match) {
        return {
            fileName: match[1],
            line: parseInt(match[2]),
            column: parseInt(match[3]),
            id: stackLine,
        };
    }
    const match2 = stackLine.match(/at ([^\(\)]*):(\d+):(\d+)/);
    if (match2) {
        return {
            fileName: match2[1],
            line: parseInt(match2[2]),
            column: parseInt(match2[3]),
            id: stackLine,
        };
    }
    return undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdMb2NhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL29ic2VydmFibGVJbnRlcm5hbC9kZWJ1Z0xvY2F0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE1BQU0sS0FBVyxhQUFhLENBb0I3QjtBQXBCRCxXQUFpQixhQUFhO0lBQzdCLElBQUksT0FBTyxHQUFHLEtBQUssQ0FBQztJQUVwQixTQUFnQixNQUFNO1FBQ3JCLE9BQU8sR0FBRyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQUZlLG9CQUFNLFNBRXJCLENBQUE7SUFFRCxTQUFnQixRQUFRO1FBQ3ZCLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNkLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxNQUFNLEdBQUcsR0FBRyxLQUF1RCxDQUFDO1FBRXBFLE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxlQUFlLENBQUM7UUFDOUIsR0FBRyxDQUFDLGVBQWUsR0FBRyxDQUFDLENBQUM7UUFDeEIsTUFBTSxLQUFLLEdBQUcsSUFBSSxLQUFLLEVBQUUsQ0FBQyxLQUFNLENBQUM7UUFDakMsR0FBRyxDQUFDLGVBQWUsR0FBRyxDQUFDLENBQUM7UUFFeEIsT0FBTyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzlDLENBQUM7SUFaZSxzQkFBUSxXQVl2QixDQUFBO0FBQ0YsQ0FBQyxFQXBCZ0IsYUFBYSxLQUFiLGFBQWEsUUFvQjdCO0FBRUQsTUFBTSxpQkFBaUI7SUFDZixNQUFNLENBQUMsU0FBUyxDQUFDLEtBQWEsRUFBRSxTQUFpQjtRQUN2RCxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2hDLE1BQU0sUUFBUSxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDakQsSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNkLE9BQU8sSUFBSSxpQkFBaUIsQ0FDM0IsUUFBUSxDQUFDLFFBQVEsRUFDakIsUUFBUSxDQUFDLElBQUksRUFDYixRQUFRLENBQUMsTUFBTSxFQUNmLFFBQVEsQ0FBQyxFQUFFLENBQ1gsQ0FBQztRQUNILENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztJQUNGLENBQUM7SUFFRCxZQUNpQixRQUFnQixFQUNoQixJQUFZLEVBQ1osTUFBYyxFQUNkLEVBQVU7UUFIVixhQUFRLEdBQVIsUUFBUSxDQUFRO1FBQ2hCLFNBQUksR0FBSixJQUFJLENBQVE7UUFDWixXQUFNLEdBQU4sTUFBTSxDQUFRO1FBQ2QsT0FBRSxHQUFGLEVBQUUsQ0FBUTtJQUUzQixDQUFDO0NBQ0Q7QUFVRCxTQUFTLFNBQVMsQ0FBQyxTQUFpQjtJQUNuQyxNQUFNLEtBQUssR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLHNCQUFzQixDQUFDLENBQUM7SUFDdEQsSUFBSSxLQUFLLEVBQUUsQ0FBQztRQUNYLE9BQU87WUFDTixRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUNsQixJQUFJLEVBQUUsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN4QixNQUFNLEVBQUUsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMxQixFQUFFLEVBQUUsU0FBUztTQUNiLENBQUM7SUFDSCxDQUFDO0lBRUQsTUFBTSxNQUFNLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO0lBRTVELElBQUksTUFBTSxFQUFFLENBQUM7UUFDWixPQUFPO1lBQ04sUUFBUSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDbkIsSUFBSSxFQUFFLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDekIsTUFBTSxFQUFFLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDM0IsRUFBRSxFQUFFLFNBQVM7U0FDYixDQUFDO0lBQ0gsQ0FBQztJQUVELE9BQU8sU0FBUyxDQUFDO0FBQ2xCLENBQUMifQ==