/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Position } from '../../../../common/core/position.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
export function deserializePipePositions(text) {
    let resultText = '';
    let lineNumber = 1;
    let charIndex = 0;
    const positions = [];
    for (let i = 0, len = text.length; i < len; i++) {
        const chr = text.charAt(i);
        if (chr === '\n') {
            resultText += chr;
            lineNumber++;
            charIndex = 0;
            continue;
        }
        if (chr === '|') {
            positions.push(new Position(lineNumber, charIndex + 1));
        }
        else {
            resultText += chr;
            charIndex++;
        }
    }
    return [resultText, positions];
}
export function serializePipePositions(text, positions) {
    positions.sort(Position.compare);
    let resultText = '';
    let lineNumber = 1;
    let charIndex = 0;
    for (let i = 0, len = text.length; i < len; i++) {
        const chr = text.charAt(i);
        if (positions.length > 0 && positions[0].lineNumber === lineNumber && positions[0].column === charIndex + 1) {
            resultText += '|';
            positions.shift();
        }
        resultText += chr;
        if (chr === '\n') {
            lineNumber++;
            charIndex = 0;
        }
        else {
            charIndex++;
        }
    }
    if (positions.length > 0 && positions[0].lineNumber === lineNumber && positions[0].column === charIndex + 1) {
        resultText += '|';
        positions.shift();
    }
    if (positions.length > 0) {
        throw new Error(`Unexpected left over positions!!!`);
    }
    return resultText;
}
export function testRepeatedActionAndExtractPositions(text, initialPosition, action, record, stopCondition, options = {}) {
    const actualStops = [];
    withTestCodeEditor(text, options, (editor) => {
        editor.setPosition(initialPosition);
        while (true) {
            action(editor);
            actualStops.push(record(editor));
            if (stopCondition(editor)) {
                break;
            }
            if (actualStops.length > 1000) {
                throw new Error(`Endless loop detected involving position ${editor.getPosition()}!`);
            }
        }
    });
    return actualStops;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29yZFRlc3RVdGlscy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL3dvcmRPcGVyYXRpb25zL3Rlc3QvYnJvd3Nlci93b3JkVGVzdFV0aWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMvRCxPQUFPLEVBQXVELGtCQUFrQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFckksTUFBTSxVQUFVLHdCQUF3QixDQUFDLElBQVk7SUFDcEQsSUFBSSxVQUFVLEdBQUcsRUFBRSxDQUFDO0lBQ3BCLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztJQUNuQixJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7SUFDbEIsTUFBTSxTQUFTLEdBQWUsRUFBRSxDQUFDO0lBQ2pDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUNqRCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzNCLElBQUksR0FBRyxLQUFLLElBQUksRUFBRSxDQUFDO1lBQ2xCLFVBQVUsSUFBSSxHQUFHLENBQUM7WUFDbEIsVUFBVSxFQUFFLENBQUM7WUFDYixTQUFTLEdBQUcsQ0FBQyxDQUFDO1lBQ2QsU0FBUztRQUNWLENBQUM7UUFDRCxJQUFJLEdBQUcsS0FBSyxHQUFHLEVBQUUsQ0FBQztZQUNqQixTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksUUFBUSxDQUFDLFVBQVUsRUFBRSxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN6RCxDQUFDO2FBQU0sQ0FBQztZQUNQLFVBQVUsSUFBSSxHQUFH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