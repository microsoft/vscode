/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { truncateOutputKeepingTail } from './runInTerminalHelpers.js';
const MAX_OUTPUT_LENGTH = 16000;
export function getOutput(instance, startMarker) {
    if (!instance.xterm || !instance.xterm.raw) {
        return '';
    }
    const buffer = instance.xterm.raw.buffer.active;
    let startLine = Math.max(startMarker?.line ?? 0, 0);
    while (startLine > 0 && buffer.getLine(startLine)?.isWrapped) {
        startLine--;
    }
    const endLine = buffer.length;
    const lines = [];
    let currentLine = '';
    for (let y = startLine; y < endLine; y++) {
        const line = buffer.getLine(y);
        if (!line) {
            continue;
        }
        // NOTE: xterm stores wrapping state on the *next* line, not the current one.
        const isWrapped = !!buffer.getLine(y + 1)?.isWrapped;
        currentLine += line.translateToString(!isWrapped);
        if (!isWrapped) {
            lines.push(currentLine);
            currentLine = '';
        }
    }
    if (currentLine) {
        lines.push(currentLine);
    }
    let output = lines.join('\n');
    if (output.length > MAX_OUTPUT_LENGTH) {
        output = truncateOutputKeepingTail(output, MAX_OUTPUT_LENGTH);
    }
    return output;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3V0cHV0SGVscGVycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL291dHB1dEhlbHBlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFFdEUsTUFBTSxpQkFBaUIsR0FBRyxLQUFLLENBQUM7QUFFaEMsTUFBTSxVQUFVLFNBQVMsQ0FBQyxRQUEyQixFQUFFLFdBQTBCO0lBQ2hGLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUM1QyxPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFDRCxNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDO0lBQ2hELElBQUksU0FBUyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDcEQsT0FBTyxTQUFTLEdBQUcsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUM7UUFDOUQsU0FBUyxFQUFFLENBQUM7SUFDYixDQUFDO0lBQ0QsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQztJQUM5QixNQUFNLEtBQUssR0FBYSxFQUFFLENBQUM7SUFDM0IsSUFBSSxXQUFXLEdBQUcsRUFBRSxDQUFDO0lBRXJCLEtBQUssSUFBSSxDQUFDLEdBQUcsU0FBUyxFQUFFLENBQUMsR0FBRyxPQUFPLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUMxQyxNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQy9CLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNYLFNBQVM7UUFDVixDQUFDO1FBQ0QsNkVBQTZFO1FBQzdFLE1BQU0sU0FBUyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUM7UUFDckQsV0FBVyxJQUFJLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2xELElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNoQixLQUFLLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQ3hCLFdBQVcsR0FBRyxFQUFFLENBQUM7UUFDbEIsQ0FBQztJQUNGLENBQUM7SUFDRCxJQUFJLFdBQVcsRUFBRSxDQUFDO1FBQ2pCLEtBQUssQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDekIsQ0FBQztJQUVELElBQUksTUFBTSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDOUIsSUFBSSxNQUFNLENBQUMsTUFBTSxHQUFHLGlCQUFpQixFQUFFLENBQUM7UUFDdkMsTUFBTSxHQUFHLHlCQUF5QixDQUFDLE1BQU0sRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO0lBQy9ELENBQUM7SUFDRCxPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUMifQ==