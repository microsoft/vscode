/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import EditorCommon = require('vs/editor/common/editorCommon');
import {EditableTextModel, IValidatedEditOperation} from 'vs/editor/common/model/editableTextModel';
import {TextModel} from 'vs/editor/common/model/textModel';
import {MirrorModel2} from 'vs/editor/common/model/mirrorModel2';
import {MirrorModel, IMirrorModelEvents} from 'vs/editor/common/model/mirrorModel';

export function testApplyEditsWithSyncedModels(original:string[], edits:EditorCommon.IIdentifiedSingleEditOperation[], expected:string[]): void {
	var originalStr = original.join('\n');
	var expectedStr = expected.join('\n');

	assertSyncedModels(originalStr, (model, assertMirrorModels) => {
		// Apply edits & collect inverse edits
		var inverseEdits = model.applyEdits(edits);

		// Assert edits produced expected result
		assert.deepEqual(model.getValue(EditorCommon.EndOfLinePreference.LF), expectedStr);

		assertMirrorModels();

		// Apply the inverse edits
		var inverseInverseEdits = model.applyEdits(inverseEdits);

		// Assert the inverse edits brought back model to original state
		assert.deepEqual(model.getValue(EditorCommon.EndOfLinePreference.LF), originalStr);

		// Assert the inverse of the inverse edits are the original edits
		assert.deepEqual(inverseInverseEdits, edits);

		assertMirrorModels();
	});
}

export  function assertSyncedModels(text:string, callback:(model:EditableTextModel, assertMirrorModels:()=>void)=>void, setup:(model:EditableTextModel)=>void = null): void {
	var model = new EditableTextModel([], TextModel.toRawText(text), null);
	model.setEOL(EditorCommon.EndOfLineSequence.LF);

	if (setup) {
		setup(model);
	}

	var mirrorModel1 = new MirrorModel(null, model.getVersionId(), model.toRawText(), null);
	var mirrorModel1PrevVersionId = model.getVersionId();

	var mirrorModel2 = new MirrorModel2(null, model.toRawText().lines, model.toRawText().EOL, model.getVersionId());
	var mirrorModel2PrevVersionId = model.getVersionId();

	model.addListener(EditorCommon.EventType.ModelContentChanged, (e:EditorCommon.IModelContentChangedEvent) => {
		let versionId = e.versionId;
		if (versionId < mirrorModel1PrevVersionId) {
			console.warn('Model version id did not advance between edits (1)');
		}
		mirrorModel1PrevVersionId = versionId;
		let mirrorModelEvents:IMirrorModelEvents = {
			propertiesChanged: null,
			contentChanged: [e]
		};
		mirrorModel1.onEvents(mirrorModelEvents);
	});

	model.addListener(EditorCommon.EventType.ModelContentChanged2, (e:EditorCommon.IModelContentChangedEvent2) => {
		let versionId = e.versionId;
		if (versionId < mirrorModel2PrevVersionId) {
			console.warn('Model version id did not advance between edits (2)');
		}
		mirrorModel2PrevVersionId = versionId;
		mirrorModel2.onEvents([e]);
	});

	var assertMirrorModels = () => {
		model._assertLineNumbersOK();
		assert.equal(mirrorModel2.getText(), model.getValue(), 'mirror model 2 text OK');
		assert.equal(mirrorModel2.version, model.getVersionId(), 'mirror model 2 version OK');
		assert.equal(mirrorModel1.getValue(), model.getValue(), 'mirror model 1 text OK');
		assert.equal(mirrorModel1.getVersionId(), model.getVersionId(), 'mirror model 1 version OK');
	};

	callback(model, assertMirrorModels);

	model.dispose();
	mirrorModel1.dispose();
	mirrorModel2.dispose();
}
