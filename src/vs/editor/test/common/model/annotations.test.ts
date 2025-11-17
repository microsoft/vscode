/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AnnotatedString, AnnotationsUpdate, IAnnotatedString, IAnnotation } from '../../../common/model/tokens/annotations.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { StringEdit } from '../../../common/core/edits/stringEdit.js';

suite('Editor Model - Model', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('annotations test 1', () => {
		const annotatedString = new AnnotatedString<string>([
			{ range: new OffsetRange(0, 5), annotation: 'text1' },
			{ range: new OffsetRange(10, 15), annotation: 'text2' },
			{ range: new OffsetRange(20, 25), annotation: 'text3' }
		]);
		annotatedString.setAnnotations(new OffsetRange(0, 7), AnnotationsUpdate.create([{ range: new OffsetRange(0, 7), annotation: 'text4' }]));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			{ range: new OffsetRange(0, 7), annotation: 'text4' },
			{ range: new OffsetRange(10, 15), annotation: 'text2' },
			{ range: new OffsetRange(20, 25), annotation: 'text3' }
		]);
	});

	test('annotations test 2', () => {
		const annotatedString = new AnnotatedString<string>([
			{ range: new OffsetRange(0, 5), annotation: 'text1' },
			{ range: new OffsetRange(10, 15), annotation: 'text2' },
			{ range: new OffsetRange(20, 25), annotation: 'text3' }
		]);
		annotatedString.setAnnotations(new OffsetRange(0, 12), AnnotationsUpdate.create([{ range: new OffsetRange(0, 6), annotation: 'text4' }]));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			{ range: new OffsetRange(0, 6), annotation: 'text4' },
			{ range: new OffsetRange(20, 25), annotation: 'text3' }
		]);
	});

	test('annotations test 3', () => {
		const annotatedString = new AnnotatedString<string>([
			{ range: new OffsetRange(0, 5), annotation: 'text1' },
			{ range: new OffsetRange(10, 15), annotation: 'text2' },
			{ range: new OffsetRange(20, 25), annotation: 'text3' }
		]);
		assert.deepStrictEqual(annotatedString.getAnnotationsIntersecting(new OffsetRange(0, 12)), [
			{ range: new OffsetRange(0, 5), annotation: 'text1' },
			{ range: new OffsetRange(10, 15), annotation: 'text2' },
		]);
		assert.deepStrictEqual(annotatedString.getAnnotationsIntersecting(new OffsetRange(0, 22)), [
			{ range: new OffsetRange(0, 5), annotation: 'text1' },
			{ range: new OffsetRange(10, 15), annotation: 'text2' },
			{ range: new OffsetRange(20, 25), annotation: 'text3' }
		]);
	});

	test('annotations test 4', () => {
		const annotatedString = new AnnotatedString<string>([
			{ range: new OffsetRange(0, 5), annotation: 'text1' },
			{ range: new OffsetRange(10, 15), annotation: 'text2' },
			{ range: new OffsetRange(20, 25), annotation: 'text3' }
		]);
		annotatedString.applyEdit(StringEdit.replace(new OffsetRange(0, 3), ''));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			{ range: new OffsetRange(0, 3), annotation: 'text1' },
			{ range: new OffsetRange(7, 12), annotation: 'text2' },
			{ range: new OffsetRange(17, 22), annotation: 'text3' }
		]);
	});

	test('annotations test 5', () => {
		const annotatedString = new AnnotatedString<string>([
			{ range: new OffsetRange(0, 5), annotation: 'text1' },
			{ range: new OffsetRange(10, 15), annotation: 'text2' },
			{ range: new OffsetRange(20, 25), annotation: 'text3' }
		]);
		annotatedString.applyEdit(StringEdit.replace(new OffsetRange(0, 2), 'aaaaa'));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			{ range: new OffsetRange(0, 8), annotation: 'text1' },
			{ range: new OffsetRange(13, 18), annotation: 'text2' },
			{ range: new OffsetRange(23, 28), annotation: 'text3' }
		]);
		annotatedString.applyEdit(StringEdit.replace(new OffsetRange(10, 12), ''));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			{ range: new OffsetRange(0, 8), annotation: 'text1' },
			{ range: new OffsetRange(11, 17), annotation: 'text2' },
			{ range: new OffsetRange(22, 26), annotation: 'text3' }
		]);
	});

	test('annotations test 6', () => {
		const annotatedString = new AnnotatedString<string>([
			{ range: new OffsetRange(0, 5), annotation: 'text1' },
			{ range: new OffsetRange(10, 15), annotation: 'text2' },
			{ range: new OffsetRange(20, 25), annotation: 'text3' }
		]);
		annotatedString.applyEdit(StringEdit.replace(new OffsetRange(0, 17), ''));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			{ range: new OffsetRange(3, 8), annotation: 'text3' }
		]);
		annotatedString.applyEdit(StringEdit.replace(new OffsetRange(0, 6), 'aaaa'));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			{ range: new OffsetRange(0, 6), annotation: 'text3' }
		]);
	});

	test('annotations test 7', () => {

		const a: IAnnotatedString<string> = getRandomAnnotatedString(); // v0
		const b = a.clone(); // v0

		// refers to v0
		const updateAtv0: AnnotationsUpdate<string> = getRandomAnnotationsUpdate();
		b.setAnnotations(new OffsetRange(0, 10), updateAtv0); // applied to v0, still at v0

		const edit: StringEdit = getRandomEdit();
		a.applyEdit(edit); // now a is at v1
		b.applyEdit(edit);

		const updateAtv1 = updateAtv0.rebase(edit);
		a.setAnnotations(new OffsetRange(0, 10), updateAtv1);

		assert.deepStrictEqual(a.getAllAnnotations(), b.getAllAnnotations());
	});
});

function getRandomAnnotatedString(): IAnnotatedString<string> {
	const annotation = getAnnotation();
	return new AnnotatedString<string>([annotation]);
}

function getRandomAnnotationsUpdate(): AnnotationsUpdate<string> {
	const annotation = getAnnotation();
	return AnnotationsUpdate.create([annotation]);
}

function getRandomEdit(): StringEdit {
	return StringEdit.replace(new OffsetRange(0, 10), (Math.random() + 1).toString(36).substring(7));
}

function getAnnotation(): IAnnotation<string> {
	const range = new OffsetRange(0, 100);
	const annotation = (Math.random() + 1).toString(36).substring(30);
	const annotatedString: IAnnotation<string> = { range, annotation };
	return annotatedString;
}
