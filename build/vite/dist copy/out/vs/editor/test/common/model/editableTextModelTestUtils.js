/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Position } from '../../../common/core/position.js';
import { MirrorTextModel } from '../../../common/model/mirrorTextModel.js';
import { createTextModel } from '../testTextModel.js';
export function testApplyEditsWithSyncedModels(original, edits, expected, inputEditsAreInvalid = false) {
    const originalStr = original.join('\n');
    const expectedStr = expected.join('\n');
    assertSyncedModels(originalStr, (model, assertMirrorModels) => {
        // Apply edits & collect inverse edits
        const inverseEdits = model.applyEdits(edits, true);
        // Assert edits produced expected result
        assert.deepStrictEqual(model.getValue(1 /* EndOfLinePreference.LF */), expectedStr);
        assertMirrorModels();
        // Apply the inverse edits
        const inverseInverseEdits = model.applyEdits(inverseEdits, true);
        // Assert the inverse edits brought back model to original state
        assert.deepStrictEqual(model.getValue(1 /* EndOfLinePreference.LF */), originalStr);
        if (!inputEditsAreInvalid) {
            const simplifyEdit = (edit) => {
                return {
                    range: edit.range,
                    text: edit.text,
                    forceMoveMarkers: edit.forceMoveMarkers || false
                };
            };
            // Assert the inverse of the inverse edits are the original edits
            assert.deepStrictEqual(inverseInverseEdits.map(simplifyEdit), edits.map(simplifyEdit));
        }
        assertMirrorModels();
    });
}
var AssertDocumentLineMappingDirection;
(function (AssertDocumentLineMappingDirection) {
    AssertDocumentLineMappingDirection[AssertDocumentLineMappingDirection["OffsetToPosition"] = 0] = "OffsetToPosition";
    AssertDocumentLineMappingDirection[AssertDocumentLineMappingDirection["PositionToOffset"] = 1] = "PositionToOffset";
})(AssertDocumentLineMappingDirection || (AssertDocumentLineMappingDirection = {}));
function assertOneDirectionLineMapping(model, direction, msg) {
    const allText = model.getValue();
    let line = 1, column = 1, previousIsCarriageReturn = false;
    for (let offset = 0; offset <= allText.length; offset++) {
        // The position coordinate system cannot express the position between \r and \n
        const position = new Position(line, column + (previousIsCarriageReturn ? -1 : 0));
        if (direction === 0 /* AssertDocumentLineMappingDirection.OffsetToPosition */) {
            const actualPosition = model.getPositionAt(offset);
            assert.strictEqual(actualPosition.toString(), position.toString(), msg + ' - getPositionAt mismatch for offset ' + offset);
        }
        else {
            // The position coordinate system cannot express the position between \r and \n
            const expectedOffset = offset + (previousIsCarriageReturn ? -1 : 0);
            const actualOffset = model.getOffsetAt(position);
            assert.strictEqual(actualOffset, expectedOffset, msg + ' - getOffsetAt mismatch for position ' + position.toString());
        }
        if (allText.charAt(offset) === '\n') {
            line++;
            column = 1;
        }
        else {
            column++;
        }
        previousIsCarriageReturn = (allText.charAt(offset) === '\r');
    }
}
function assertLineMapping(model, msg) {
    assertOneDirectionLineMapping(model, 1 /* AssertDocumentLineMappingDirection.PositionToOffset */, msg);
    assertOneDirectionLineMapping(model, 0 /* AssertDocumentLineMappingDirection.OffsetToPosition */, msg);
}
export function assertSyncedModels(text, callback, setup = null) {
    const model = createTextModel(text);
    model.setEOL(0 /* EndOfLineSequence.LF */);
    assertLineMapping(model, 'model');
    if (setup) {
        setup(model);
        assertLineMapping(model, 'model');
    }
    const mirrorModel2 = new MirrorTextModel(null, model.getLinesContent(), model.getEOL(), model.getVersionId());
    let mirrorModel2PrevVersionId = model.getVersionId();
    const disposable = model.onDidChangeContent((e) => {
        const versionId = e.versionId;
        if (versionId < mirrorModel2PrevVersionId) {
            console.warn('Model version id did not advance between edits (2)');
        }
        mirrorModel2PrevVersionId = versionId;
        mirrorModel2.onEvents(e);
    });
    const assertMirrorModels = () => {
        assertLineMapping(model, 'model');
        assert.strictEqual(mirrorModel2.getText(), model.getValue(), 'mirror model 2 text OK');
        assert.strictEqual(mirrorModel2.version, model.getVersionId(), 'mirror model 2 version OK');
    };
    callback(model, assertMirrorModels);
    disposable.dispose();
    model.dispose();
    mirrorModel2.dispose();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdGFibGVUZXh0TW9kZWxUZXN0VXRpbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvdGVzdC9jb21tb24vbW9kZWwvZWRpdGFibGVUZXh0TW9kZWxUZXN0VXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBRTVCLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUU1RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFHM0UsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRXRELE1BQU0sVUFBVSw4QkFBOEIsQ0FBQyxRQUFrQixFQUFFLEtBQTZCLEVBQUUsUUFBa0IsRUFBRSx1QkFBZ0MsS0FBSztJQUMxSixNQUFNLFdBQVcsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3hDLE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFeEMsa0JBQWtCLENBQUMsV0FBVyxFQUFFLENBQUMsS0FBSyxFQUFFLGtCQUFrQixFQUFFLEVBQUU7UUFDN0Qsc0NBQXNDO1FBQ3RDLE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRW5ELHdDQUF3QztRQUN4QyxNQUFNLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxRQUFRLGdDQUF3QixFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBRTVFLGtCQUFrQixFQUFFLENBQUM7UUFFckIsMEJBQTBCO1FBQzFCLE1BQU0sbUJBQW1CLEdBQUcsS0FBSyxDQUFDLFVBQVUsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFakUsZ0VBQWdFO1FB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