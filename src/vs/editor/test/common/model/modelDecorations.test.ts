/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {EditOperation} from 'vs/editor/common/core/editOperation';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import {EventType, IModelDeltaDecoration, IRange, TrackedRangeStickiness} from 'vs/editor/common/editorCommon';
import {Model} from 'vs/editor/common/model/model';

// --------- utils

function modelHasDecorations(model, decorations) {
	var modelDecorations = [];
	var actualDecorations = model.getAllDecorations();
	for (var i = 0, len = actualDecorations.length; i < len; i++) {
		modelDecorations.push({
			range: actualDecorations[i].range,
			className: actualDecorations[i].options.className
		});
	}
	assert.deepEqual(modelDecorations, decorations, 'Model decorations');
}

function modelHasDecoration(model, startLineNumber, startColumn, endLineNumber, endColumn, className) {
	modelHasDecorations(model, [{
		range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
		className: className
	}]);
}

function modelHasNoDecorations(model) {
	assert.equal(model.getAllDecorations().length, 0, 'Model has no decoration');
}

function addDecoration(model, startLineNumber, startColumn, endLineNumber, endColumn, className) {
	return model.changeDecorations((changeAccessor) => {
		return changeAccessor.addDecoration(new Range(startLineNumber, startColumn, endLineNumber, endColumn), {
			className: className
		});
	});
}

function lineHasDecorations(model, lineNumber, decorations) {
	var lineDecorations = [];
	var decs = model.getLineDecorations(lineNumber);
	for (var i = 0, len = decs.length; i < len; i++) {
		lineDecorations.push({
			start: decs[i].range.startColumn,
			end: decs[i].range.endColumn,
			className: decs[i].options.className
		});
	}
	assert.deepEqual(lineDecorations, decorations, 'Line decorations');
}

function lineHasNoDecorations(model, lineNumber) {
	lineHasDecorations(model, lineNumber, []);
}

function lineHasDecoration(model, lineNumber, start, end, className) {
	lineHasDecorations(model, lineNumber, [{
		start: start,
		end: end,
		className: className
	}]);
}

suite('Editor Model - Model Decorations', () => {
	var LINE1 = 'My First Line';
	var LINE2 = '\t\tMy Second Line';
	var LINE3 = '    Third Line';
	var LINE4 = '';
	var LINE5 = '1';

	// --------- Model Decorations

	var thisModel:Model;

	setup(() => {
		var text =
			LINE1 + '\r\n' +
			LINE2 + '\n' +
			LINE3 + '\n' +
			LINE4 + '\r\n' +
			LINE5;
		thisModel = new Model(text, Model.DEFAULT_CREATION_OPTIONS, null);
	});

	teardown(() => {
		thisModel.dispose();
		thisModel = null;
	});

	test('single character decoration', () => {
		addDecoration(thisModel, 1, 1, 1, 2, 'myType');
		lineHasDecoration(thisModel, 1, 1, 2, 'myType');
		lineHasNoDecorations(thisModel, 2);
		lineHasNoDecorations(thisModel, 3);
		lineHasNoDecorations(thisModel, 4);
		lineHasNoDecorations(thisModel, 5);
	});

	test('line decoration', () => {
		addDecoration(thisModel, 1, 1, 1, 14, 'myType');
		lineHasDecoration(thisModel, 1, 1, 14, 'myType');
		lineHasNoDecorations(thisModel, 2);
		lineHasNoDecorations(thisModel, 3);
		lineHasNoDecorations(thisModel, 4);
		lineHasNoDecorations(thisModel, 5);
	});

	test('full line decoration', () => {
		addDecoration(thisModel, 1, 1, 2, 1, 'myType');

		var line1Decorations = thisModel.getLineDecorations(1);
		assert.equal(line1Decorations.length, 1);
		assert.equal(line1Decorations[0].options.className, 'myType');

		var line2Decorations = thisModel.getLineDecorations(1);
		assert.equal(line2Decorations.length, 1);
		assert.equal(line2Decorations[0].options.className, 'myType');

		lineHasNoDecorations(thisModel, 3);
		lineHasNoDecorations(thisModel, 4);
		lineHasNoDecorations(thisModel, 5);
	});

	test('multiple line decoration', () => {
		addDecoration(thisModel, 1, 2, 3, 2, 'myType');

		var line1Decorations = thisModel.getLineDecorations(1);
		assert.equal(line1Decorations.length, 1);
		assert.equal(line1Decorations[0].options.className, 'myType');

		var line2Decorations = thisModel.getLineDecorations(1);
		assert.equal(line2Decorations.length, 1);
		assert.equal(line2Decorations[0].options.className, 'myType');

		var line3Decorations = thisModel.getLineDecorations(1);
		assert.equal(line3Decorations.length, 1);
		assert.equal(line3Decorations[0].options.className, 'myType');

		lineHasNoDecorations(thisModel, 4);
		lineHasNoDecorations(thisModel, 5);
	});

	// --------- removing, changing decorations

	test('decoration gets removed', () => {
		var decId = addDecoration(thisModel, 1, 2, 3, 2, 'myType');
		modelHasDecoration(thisModel, 1, 2, 3, 2, 'myType');
		thisModel.changeDecorations((changeAccessor) => {
			changeAccessor.removeDecoration(decId);
		});
		modelHasNoDecorations(thisModel);
	});

	test('decorations get removed', () => {
		var decId1 = addDecoration(thisModel, 1, 2, 3, 2, 'myType1');
		var decId2 = addDecoration(thisModel, 1, 2, 3, 1, 'myType2');
		modelHasDecorations(thisModel, [
			{
				range: new Range(1, 2, 3, 2),
				className: 'myType1'
			},
			{
				range: new Range(1, 2, 3, 1),
				className: 'myType2'
			}
		]);
		thisModel.changeDecorations((changeAccessor) => {
			changeAccessor.removeDecoration(decId1);
		});
		modelHasDecorations(thisModel, [
			{
				range: new Range(1, 2, 3, 1),
				className: 'myType2'
			}
		]);
		thisModel.changeDecorations((changeAccessor) => {
			changeAccessor.removeDecoration(decId2);
		});
		modelHasNoDecorations(thisModel);
	});

	test('decoration range can be changed', () => {
		var decId = addDecoration(thisModel, 1, 2, 3, 2, 'myType');
		modelHasDecoration(thisModel, 1, 2, 3, 2, 'myType');
		thisModel.changeDecorations((changeAccessor) => {
			changeAccessor.changeDecoration(decId, new Range(1, 1, 1, 2));
		});
		modelHasDecoration(thisModel, 1, 1, 1, 2, 'myType');
	});

	// --------- eventing

	test('decorations emit event on add', () => {
		var listenerCalled = 0;
		thisModel.addListener(EventType.ModelDecorationsChanged, (e) => {
			listenerCalled++;
			assert.equal(e.ids.length, 1);
			assert.equal(e.addedOrChangedDecorations.length, 1);
			assert.ok(Range.equalsRange(e.addedOrChangedDecorations[0].range, {
				startLineNumber: 1,
				startColumn: 2,
				endLineNumber: 3,
				endColumn: 2
			}));
			assert.equal(e.removedDecorations.length, 0);
		});
		addDecoration(thisModel, 1, 2, 3, 2, 'myType');
		assert.equal(listenerCalled, 1, 'listener called');
	});

	test('decorations emit event on change', () => {
		var listenerCalled = 0;
		var decId = addDecoration(thisModel, 1, 2, 3, 2, 'myType');
		thisModel.addListener(EventType.ModelDecorationsChanged, (e) => {
			listenerCalled++;
			assert.equal(e.ids.length, 1);
			assert.equal(e.addedOrChangedDecorations.length, 1);
			assert.ok(Range.equalsRange(e.addedOrChangedDecorations[0].range, {
				startLineNumber: 1,
				startColumn: 1,
				endLineNumber: 1,
				endColumn: 2
			}));
			assert.ok(Range.equalsRange(e.oldRanges[decId], {
				startLineNumber: 1,
				startColumn: 2,
				endLineNumber: 3,
				endColumn: 2
			}));
			assert.equal(e.removedDecorations.length, 0);
		});
		thisModel.changeDecorations((changeAccessor) => {
			changeAccessor.changeDecoration(decId, new Range(1, 1, 1, 2));
		});
		assert.equal(listenerCalled, 1, 'listener called');
	});

	test('decorations emit event on remove', () => {
		var listenerCalled = 0;
		var decId = addDecoration(thisModel, 1, 2, 3, 2, 'myType');
		thisModel.addListener(EventType.ModelDecorationsChanged, (e) => {
			listenerCalled++;
			assert.equal(e.ids.length, 1);
			assert.equal(e.addedOrChangedDecorations.length, 0);
			assert.ok(Range.equalsRange(e.oldRanges[decId], {
				startLineNumber: 1,
				startColumn: 2,
				endLineNumber: 3,
				endColumn: 2
			}));
			assert.equal(e.removedDecorations.length, 1);
			assert.equal(e.removedDecorations[0], decId);
		});
		thisModel.changeDecorations((changeAccessor) => {
			changeAccessor.removeDecoration(decId);
		});
		assert.equal(listenerCalled, 1, 'listener called');
	});

	test('decorations emit event when inserting one line text before it', () => {
		var listenerCalled = 0;
		var decId = addDecoration(thisModel, 1, 2, 3, 2, 'myType');

		thisModel.addListener(EventType.ModelDecorationsChanged, (e) => {
			listenerCalled++;
			assert.equal(e.ids.length, 1);
			assert.equal(e.addedOrChangedDecorations.length, 1);
			assert.ok(Range.equalsRange(e.addedOrChangedDecorations[0].range, {
				startLineNumber: 1,
				startColumn: 8,
				endLineNumber: 3,
				endColumn: 2
			}));
			assert.ok(Range.equalsRange(e.oldRanges[decId], {
				startLineNumber: 1,
				startColumn: 2,
				endLineNumber: 3,
				endColumn: 2
			}));
			assert.equal(e.removedDecorations.length, 0);
		});

		thisModel.applyEdits([EditOperation.insert(new Position(1, 1), 'Hallo ')]);
		assert.equal(listenerCalled, 1, 'listener called');
	});

	// --------- editing text & effects on decorations

	test('decorations are updated when inserting one line text before it', () => {
		addDecoration(thisModel, 1, 2, 3, 2, 'myType');
		modelHasDecoration(thisModel, 1, 2, 3, 2, 'myType');
		thisModel.applyEdits([EditOperation.insert(new Position(1, 1), 'Hallo ')]);
		modelHasDecoration(thisModel, 1, 8, 3, 2, 'myType');
	});

	test('decorations are updated when inserting one line text before it 2', () => {
		addDecoration(thisModel, 1, 1, 3, 2, 'myType');
		modelHasDecoration(thisModel, 1, 1, 3, 2, 'myType');
		thisModel.applyEdits([EditOperation.replace(new Range(1, 1, 1, 1), 'Hallo ')]);
		modelHasDecoration(thisModel, 1, 1, 3, 2, 'myType');
	});

	test('decorations are updated when inserting multiple lines text before it', () => {
		addDecoration(thisModel, 1, 2, 3, 2, 'myType');
		modelHasDecoration(thisModel, 1, 2, 3, 2, 'myType');
		thisModel.applyEdits([EditOperation.insert(new Position(1, 1), 'Hallo\nI\'m inserting multiple\nlines')]);
		modelHasDecoration(thisModel, 3, 7, 5, 2, 'myType');
	});

	test('decorations change when inserting text after them', () => {
		addDecoration(thisModel, 1, 2, 3, 2, 'myType');
		modelHasDecoration(thisModel, 1, 2, 3, 2, 'myType');
		thisModel.applyEdits([EditOperation.insert(new Position(3, 2), 'Hallo')]);
		modelHasDecoration(thisModel, 1, 2, 3, 7, 'myType');
	});

	test('decorations are updated when inserting text inside', () => {
		addDecoration(thisModel, 1, 2, 3, 2, 'myType');
		modelHasDecoration(thisModel, 1, 2, 3, 2, 'myType');
		thisModel.applyEdits([EditOperation.insert(new Position(1, 3), 'Hallo ')]);
		modelHasDecoration(thisModel, 1, 2, 3, 2, 'myType');
	});

	test('decorations are updated when inserting text inside 2', () => {
		addDecoration(thisModel, 1, 2, 3, 2, 'myType');
		modelHasDecoration(thisModel, 1, 2, 3, 2, 'myType');
		thisModel.applyEdits([EditOperation.insert(new Position(3, 1), 'Hallo ')]);
		modelHasDecoration(thisModel, 1, 2, 3, 8, 'myType');
	});

	test('decorations are updated when inserting text inside 3', () => {
		addDecoration(thisModel, 1, 1, 2, 16, 'myType');
		modelHasDecoration(thisModel, 1, 1, 2, 16, 'myType');
		thisModel.applyEdits([EditOperation.insert(new Position(2, 2), '\n')]);
		modelHasDecoration(thisModel, 1, 1, 3, 15, 'myType');
	});

	test('decorations are updated when inserting multiple lines text inside', () => {
		addDecoration(thisModel, 1, 2, 3, 2, 'myType');
		modelHasDecoration(thisModel, 1, 2, 3, 2, 'myType');
		thisModel.applyEdits([EditOperation.insert(new Position(1, 3), 'Hallo\nI\'m inserting multiple\nlines')]);
		modelHasDecoration(thisModel, 1, 2, 5, 2, 'myType');
	});

	test('decorations are updated when deleting one line text before it', () => {
		addDecoration(thisModel, 1, 2, 3, 2, 'myType');
		modelHasDecoration(thisModel, 1, 2, 3, 2, 'myType');
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 2))]);
		modelHasDecoration(thisModel, 1, 1, 3, 2, 'myType');
	});

	test('decorations are updated when deleting multiple lines text before it', () => {
		addDecoration(thisModel, 2, 2, 3, 2, 'myType');
		modelHasDecoration(thisModel, 2, 2, 3, 2, 'myType');
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 2, 1))]);
		modelHasDecoration(thisModel, 1, 2, 2, 2, 'myType');
	});

	test('decorations are updated when deleting multiple lines text before it 2', () => {
		addDecoration(thisModel, 2, 3, 3, 2, 'myType');
		modelHasDecoration(thisModel, 2, 3, 3, 2, 'myType');
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 2, 2))]);
		modelHasDecoration(thisModel, 1, 2, 2, 2, 'myType');
	});

	test('decorations are updated when deleting text inside', () => {
		addDecoration(thisModel, 1, 2, 4, 1, 'myType');
		modelHasDecoration(thisModel, 1, 2, 4, 1, 'myType');
		thisModel.applyEdits([EditOperation.delete(new Range(1, 3, 2, 1))]);
		modelHasDecoration(thisModel, 1, 2, 3, 1, 'myType');
	});

	test('decorations are updated when deleting text inside 2', () => {
		addDecoration(thisModel, 1, 2, 4, 1, 'myType');
		modelHasDecoration(thisModel, 1, 2, 4, 1, 'myType');
		thisModel.applyEdits([
			EditOperation.delete(new Range(1, 1, 1, 2)),
			EditOperation.delete(new Range(4, 1, 4, 1))
		]);
		modelHasDecoration(thisModel, 1, 1, 4, 1, 'myType');
	});

	test('decorations are updated when deleting multiple lines text', () => {
		addDecoration(thisModel, 1, 2, 4, 1, 'myType');
		modelHasDecoration(thisModel, 1, 2, 4, 1, 'myType');
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 3, 1))]);
		modelHasDecoration(thisModel, 1, 1, 2, 1, 'myType');
	});
});

export interface ILightWeightDecoration {
	id: string;
	range: IRange;
}

suite('deltaDecorations', () => {

	function decoration(id:string, startLineNumber:number, startColumn:number, endLineNumber:number, endColum:number): ILightWeightDecoration {
		return {
			id: id,
			range: {
				startLineNumber: startLineNumber,
				startColumn: startColumn,
				endLineNumber: endLineNumber,
				endColumn: endColum
			}
		};
	}

	function toModelDeltaDecoration(dec:ILightWeightDecoration): IModelDeltaDecoration {
		return {
			range: dec.range,
			options: {
				className: dec.id
			}
		};
	}

	function strcmp(a:string, b:string): number {
		if (a === b) {
			return 0;
		}
		if (a < b) {
			return -1;
		}
		return 1;
	}

	function readModelDecorations(model:Model, ids:string[]): ILightWeightDecoration[] {
		return ids.map((id) => {
			return {
				range: model.getDecorationRange(id),
				id: model.getDecorationOptions(id).className
			};
		});
	}

	function testDeltaDecorations(text:string[], decorations:ILightWeightDecoration[], newDecorations:ILightWeightDecoration[]): void {

		var model = new Model(text.join('\n'), Model.DEFAULT_CREATION_OPTIONS, null);

		// Add initial decorations & assert they are added
		var initialIds = model.deltaDecorations([], decorations.map(toModelDeltaDecoration));
		var actualDecorations = readModelDecorations(model, initialIds);

		assert.equal(initialIds.length, decorations.length, 'returns expected cnt of ids');
		assert.equal(initialIds.length, model.getAllDecorations().length, 'does not leak decorations');
		assert.equal(initialIds.length, model._getTrackedRangesCount(), 'does not leak tracked ranges');
		assert.equal(2 * initialIds.length, model._getMarkersCount(), 'does not leak markers');
		actualDecorations.sort((a, b) => strcmp(a.id, b.id));
		decorations.sort((a, b) => strcmp(a.id, b.id));
		assert.deepEqual(actualDecorations, decorations);

		var newIds = model.deltaDecorations(initialIds, newDecorations.map(toModelDeltaDecoration));
		var actualNewDecorations = readModelDecorations(model, newIds);

		assert.equal(newIds.length, newDecorations.length, 'returns expected cnt of ids');
		assert.equal(newIds.length, model.getAllDecorations().length, 'does not leak decorations');
		assert.equal(newIds.length, model._getTrackedRangesCount(), 'does not leak tracked ranges');
		assert.equal(2 * newIds.length, model._getMarkersCount(), 'does not leak markers');
		actualNewDecorations.sort((a, b) => strcmp(a.id, b.id));
		newDecorations.sort((a, b) => strcmp(a.id, b.id));
		assert.deepEqual(actualDecorations, decorations);

		model.dispose();
	}

	function range(startLineNumber:number, startColumn:number, endLineNumber:number, endColumn:number): Range {
		return new Range(startLineNumber, startColumn, endLineNumber, endColumn);
	}

	test('result respects input', () => {
		var model = new Model([
			'Hello world,',
			'How are you?'
		].join('\n'), Model.DEFAULT_CREATION_OPTIONS, null);

		var ids = model.deltaDecorations([], [
			toModelDeltaDecoration(decoration('a', 1, 1, 1, 12)),
			toModelDeltaDecoration(decoration('b', 2, 1, 2, 13))
		]);

		assert.deepEqual(model.getDecorationRange(ids[0]), range(1,1,1,12));
		assert.deepEqual(model.getDecorationRange(ids[1]), range(2,1,2,13));

		model.dispose();
	});

	test('deltaDecorations 1', () => {
		testDeltaDecorations(
			[
				'This is a text',
				'That has multiple lines',
				'And is very friendly',
				'Towards testing'
			],
			[
				decoration('a', 1, 1, 1, 2),
				decoration('b', 1, 1, 1, 15),
				decoration('c', 1, 1, 2, 1),
				decoration('d', 1, 1, 2, 24),
				decoration('e', 2, 1, 2, 24),
				decoration('f', 2, 1, 4, 16)
			],
			[
				decoration('x', 1, 1, 1, 2),
				decoration('b', 1, 1, 1, 15),
				decoration('c', 1, 1, 2, 1),
				decoration('d', 1, 1, 2, 24),
				decoration('e', 2, 1, 2, 21),
				decoration('f', 2, 17, 4, 16)
			]
		);
	});

	test('deltaDecorations 2', () => {
		testDeltaDecorations(
			[
				'This is a text',
				'That has multiple lines',
				'And is very friendly',
				'Towards testing'
			],
			[
				decoration('a', 1, 1, 1, 2),
				decoration('b', 1, 2, 1, 3),
				decoration('c', 1, 3, 1, 4),
				decoration('d', 1, 4, 1, 5),
				decoration('e', 1, 5, 1, 6)
			],
			[
				decoration('a', 1, 2, 1, 3),
				decoration('b', 1, 3, 1, 4),
				decoration('c', 1, 4, 1, 5),
				decoration('d', 1, 5, 1, 6)
			]
		);
	});

	test('deltaDecorations 3', () => {
		testDeltaDecorations(
			[
				'This is a text',
				'That has multiple lines',
				'And is very friendly',
				'Towards testing'
			],
			[
				decoration('a', 1, 1, 1, 2),
				decoration('b', 1, 2, 1, 3),
				decoration('c', 1, 3, 1, 4),
				decoration('d', 1, 4, 1, 5),
				decoration('e', 1, 5, 1, 6)
			],
			[]
		);
	});

	test('issue #4317: editor.setDecorations doesn\'t update the hover message', () => {

		let model = new Model('Hello world!', Model.DEFAULT_CREATION_OPTIONS, null);

		let ids = model.deltaDecorations([], [{
			range: {
				startLineNumber: 1,
				startColumn: 1,
				endLineNumber: 100,
				endColumn: 1
			},
			options: {
				htmlMessage: [{
					markdown: 'hello1'
				}]
			}
		}]);

		ids = model.deltaDecorations(ids, [{
			range: {
				startLineNumber: 1,
				startColumn: 1,
				endLineNumber: 100,
				endColumn: 1
			},
			options: {
				htmlMessage: [{
					markdown: 'hello2'
				}]
			}
		}]);

		let actualDecoration = model.getDecorationOptions(ids[0]);

		assert.equal(actualDecoration.htmlMessage[0].markdown, 'hello2');

		model.dispose();
	});

	test('model doesn\'t get confused with individual tracked ranges', () => {
		var model = new Model([
			'Hello world,',
			'How are you?'
		].join('\n'), Model.DEFAULT_CREATION_OPTIONS, null);

		var trackedRangeId = model.addTrackedRange({
			startLineNumber: 1,
			startColumn: 1,
			endLineNumber: 1,
			endColumn: 1
		}, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges);
		model.removeTrackedRange(trackedRangeId);

		var ids = model.deltaDecorations([], [
			toModelDeltaDecoration(decoration('a', 1, 1, 1, 12)),
			toModelDeltaDecoration(decoration('b', 2, 1, 2, 13))
		]);

		assert.deepEqual(model.getDecorationRange(ids[0]), range(1,1,1,12));
		assert.deepEqual(model.getDecorationRange(ids[1]), range(2,1,2,13));

		ids = model.deltaDecorations(ids, [
			toModelDeltaDecoration(decoration('a', 1, 1, 1, 12)),
			toModelDeltaDecoration(decoration('b', 2, 1, 2, 13))
		]);

		assert.deepEqual(model.getDecorationRange(ids[0]), range(1,1,1,12));
		assert.deepEqual(model.getDecorationRange(ids[1]), range(2,1,2,13));

		model.dispose();
	});
});
