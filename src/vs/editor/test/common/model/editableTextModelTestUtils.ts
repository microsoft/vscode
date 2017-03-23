/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { EditableTextModel } from 'vs/editor/common/model/editableTextModel';
import { MirrorModel2 } from 'vs/editor/common/model/mirrorModel2';
import { TextModel } from 'vs/editor/common/model/textModel';
import { Position } from 'vs/editor/common/core/position';
import { RawTextSource } from 'vs/editor/common/model/textSource';

export function testApplyEditsWithSyncedModels(original: string[], edits: editorCommon.IIdentifiedSingleEditOperation[], expected: string[], inputEditsAreInvalid: boolean = false): void {
	var originalStr = original.join('\n');
	var expectedStr = expected.join('\n');

	assertSyncedModels(originalStr, (model, assertMirrorModels) => {
		// Apply edits & collect inverse edits
		var inverseEdits = model.applyEdits(edits);

		// Assert edits produced expected result
		assert.deepEqual(model.getValue(editorCommon.EndOfLinePreference.LF), expectedStr);

		assertMirrorModels();

		// Apply the inverse edits
		var inverseInverseEdits = model.applyEdits(inverseEdits);

		// Assert the inverse edits brought back model to original state
		assert.deepEqual(model.getValue(editorCommon.EndOfLinePreference.LF), originalStr);

		if (!inputEditsAreInvalid) {
			// Assert the inverse of the inverse edits are the original edits
			assert.deepEqual(inverseInverseEdits, edits);
		}

		assertMirrorModels();
	});
}

const enum AssertDocumentLineMappingDirection {
	OffsetToPosition,
	PositionToOffset
}

function assertOneDirectionLineMapping(model: TextModel, direction: AssertDocumentLineMappingDirection, msg: string): void {
	let allText = model.getValue();

	let line = 1, column = 1, previousIsCarriageReturn = false;
	for (let offset = 0; offset <= allText.length; offset++) {
		// The position coordinate system cannot express the position between \r and \n
		let position = new Position(line, column + (previousIsCarriageReturn ? -1 : 0));

		if (direction === AssertDocumentLineMappingDirection.OffsetToPosition) {
			let actualPosition = model.getPositionAt(offset);
			assert.equal(actualPosition.toString(), position.toString(), msg + ' - getPositionAt mismatch for offset ' + offset);
		} else {
			// The position coordinate system cannot express the position between \r and \n
			let expectedOffset = offset + (previousIsCarriageReturn ? -1 : 0);
			let actualOffset = model.getOffsetAt(position);
			assert.equal(actualOffset, expectedOffset, msg + ' - getOffsetAt mismatch for position ' + position.toString());
		}

		if (allText.charAt(offset) === '\n') {
			line++;
			column = 1;
		} else {
			column++;
		}

		previousIsCarriageReturn = (allText.charAt(offset) === '\r');
	}
}

function assertLineMapping(model: TextModel, msg: string): void {
	assertOneDirectionLineMapping(model, AssertDocumentLineMappingDirection.PositionToOffset, msg);
	assertOneDirectionLineMapping(model, AssertDocumentLineMappingDirection.OffsetToPosition, msg);
}


export function assertSyncedModels(text: string, callback: (model: EditableTextModel, assertMirrorModels: () => void) => void, setup: (model: EditableTextModel) => void = null): void {
	var model = new EditableTextModel([], RawTextSource.fromString(text), TextModel.DEFAULT_CREATION_OPTIONS, null);
	model.setEOL(editorCommon.EndOfLineSequence.LF);
	assertLineMapping(model, 'model');

	if (setup) {
		setup(model);
		assertLineMapping(model, 'model');
	}

	var mirrorModel2 = new MirrorModel2(null, model.getLinesContent(), model.getEOL(), model.getVersionId());
	var mirrorModel2PrevVersionId = model.getVersionId();

	model.onDidChangeContent((e: editorCommon.IModelContentChangedEvent2) => {
		let versionId = e.versionId;
		if (versionId < mirrorModel2PrevVersionId) {
			console.warn('Model version id did not advance between edits (2)');
		}
		mirrorModel2PrevVersionId = versionId;
		mirrorModel2.onEvents([e]);
	});

	var assertMirrorModels = () => {
		assertLineMapping(model, 'model');
		model._assertLineNumbersOK();
		assert.equal(mirrorModel2.getText(), model.getValue(), 'mirror model 2 text OK');
		assert.equal(mirrorModel2.version, model.getVersionId(), 'mirror model 2 version OK');
	};

	callback(model, assertMirrorModels);

	model.dispose();
	mirrorModel2.dispose();
}
