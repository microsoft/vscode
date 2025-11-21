/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AnnotatedString, AnnotationsUpdate, IAnnotatedString, IAnnotation } from '../../../common/model/tokens/annotations.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { StringEdit } from '../../../common/core/edits/stringEdit.js';

/**
TODO: Find visual way to represent these tests
TODO: Find way to unify the other method from which applyEdit was inspired from
TODO: Polish the code
TODO: Do thorough testing
 */

function createAnnotation(startOffset: number, endOffset: number): IAnnotation<string> {
	return { range: new OffsetRange(startOffset, endOffset), annotation: '' };
}

suite('Editor Model - Model', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('setAnnotations 1', () => {
		const annotatedString = new AnnotatedString<string>([
			createAnnotation(0, 5),
			createAnnotation(10, 15),
			createAnnotation(20, 25)
		]);
		annotatedString.setAnnotations(new OffsetRange(0, 7), AnnotationsUpdate.create([createAnnotation(0, 7)]));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(0, 7),
			createAnnotation(10, 15),
			createAnnotation(20, 25)
		]);
		annotatedString.setAnnotations(new OffsetRange(8, 9), AnnotationsUpdate.create([createAnnotation(8, 9)]));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(0, 7),
			createAnnotation(8, 9),
			createAnnotation(10, 15),
			createAnnotation(20, 25)
		]);
	});

	test('setAnnotations 2', () => {
		const annotatedString = new AnnotatedString<string>([
			createAnnotation(0, 5),
			createAnnotation(10, 15),
			createAnnotation(20, 25)
		]);
		annotatedString.setAnnotations(new OffsetRange(1, 12), AnnotationsUpdate.create([createAnnotation(0, 6)]));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(0, 6),
			createAnnotation(20, 25)
		]);
		annotatedString.setAnnotations(new OffsetRange(3, 22), AnnotationsUpdate.create([createAnnotation(0, 3)]));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(0, 3)
		]);
		annotatedString.setAnnotations(new OffsetRange(3, 10), AnnotationsUpdate.create([createAnnotation(1, 4)]));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(1, 4)
		]);
	});

	test('getAnnotationsIntersecting 1', () => {
		const annotatedString = new AnnotatedString<string>([
			createAnnotation(0, 5),
			createAnnotation(10, 15),
			createAnnotation(20, 25)
		]);
		assert.deepStrictEqual(annotatedString.getAnnotationsIntersecting(new OffsetRange(0, 12)), [
			createAnnotation(0, 5),
			createAnnotation(10, 15),
		]);
		assert.deepStrictEqual(annotatedString.getAnnotationsIntersecting(new OffsetRange(0, 22)), [
			createAnnotation(0, 5),
			createAnnotation(10, 15),
			createAnnotation(20, 25)
		]);
	});

	test('getAnnotationsIntersecting 2', () => {
		const annotatedString = new AnnotatedString<string>([
			createAnnotation(0, 5),
			createAnnotation(6, 7),
			createAnnotation(8, 9)
		]);
		assert.deepStrictEqual(annotatedString.getAnnotationsIntersecting(new OffsetRange(5, 6)), [
			createAnnotation(0, 5),
			createAnnotation(6, 7),
		]);
		assert.deepStrictEqual(annotatedString.getAnnotationsIntersecting(new OffsetRange(5, 8)), [
			createAnnotation(0, 5),
			createAnnotation(6, 7),
			createAnnotation(8, 9)
		]);
	});

	test('applyEdit 1 - deletion within annotation', () => {
		const annotatedString = new AnnotatedString<string>([
			createAnnotation(0, 5),
			createAnnotation(10, 15),
			createAnnotation(20, 25)
		]);
		annotatedString.applyEdit(StringEdit.replace(new OffsetRange(0, 3), ''));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(0, 2),
			createAnnotation(7, 12),
			createAnnotation(17, 22)
		]);
	});

	test('applyEdit 2 - deletion and insertion within annotation', () => {
		const annotatedString = new AnnotatedString<string>([
			createAnnotation(0, 5),
			createAnnotation(10, 15),
			createAnnotation(20, 25)
		]);
		annotatedString.applyEdit(StringEdit.replace(new OffsetRange(1, 3), 'aaaaa'));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(0, 8),
			createAnnotation(13, 18),
			createAnnotation(23, 28)
		]);
	});

	test('applyEdit 3 - deletion across several annotations', () => {
		const annotatedString = new AnnotatedString<string>([
			createAnnotation(0, 5),
			createAnnotation(10, 15),
			createAnnotation(20, 25)
		]);
		annotatedString.applyEdit(StringEdit.replace(new OffsetRange(4, 22), 'aaaaa'));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(0, 9),
			createAnnotation(9, 12),
		]);
	});

	test('applyEdit 4 - deletion between annotations', () => {
		const annotatedString = new AnnotatedString<string>([
			createAnnotation(0, 8),
			createAnnotation(13, 18),
			createAnnotation(23, 28)
		]);
		annotatedString.applyEdit(StringEdit.replace(new OffsetRange(10, 12), ''));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(0, 8),
			createAnnotation(11, 16),
			createAnnotation(21, 26)
		]);
	});

	test('applyEdit 5 - deletion that covers annotation', () => {
		const annotatedString = new AnnotatedString<string>([
			createAnnotation(0, 5),
			createAnnotation(10, 15),
			createAnnotation(20, 25)
		]);
		annotatedString.applyEdit(StringEdit.replace(new OffsetRange(0, 5), ''));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(5, 10),
			createAnnotation(15, 20)
		]);
	});

	test('applyEdit 6 - several edits', () => {
		const annotatedString = new AnnotatedString<string>([
			createAnnotation(0, 5),
			createAnnotation(10, 15),
			createAnnotation(20, 25)
		]);
		const edit1 = StringEdit.replace(new OffsetRange(0, 5), '');
		const edit2 = StringEdit.replace(new OffsetRange(5, 10), '');
		const edit3 = StringEdit.replace(new OffsetRange(10, 15), '');
		annotatedString.applyEdit(edit1.compose(edit2).compose(edit3));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), []);
	});

	test('applyEdit 7 - several edits', () => {
		const annotatedString = new AnnotatedString<string>([
			createAnnotation(0, 5),
			createAnnotation(10, 15),
			createAnnotation(20, 25)
		]);
		const edit1 = StringEdit.replace(new OffsetRange(0, 3), 'aaaa');
		const edit2 = StringEdit.replace(new OffsetRange(0, 2), '');
		annotatedString.applyEdit(edit1.compose(edit2));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(0, 4),
			createAnnotation(9, 14),
			createAnnotation(19, 24)
		]);
	});

	test('annotations test 7', () => {
		const a: IAnnotatedString<string> = getRandomAnnotatedString();
		const b = a.clone();
		const update: AnnotationsUpdate<string> = getRandomAnnotationsUpdate();

		b.setAnnotations(new OffsetRange(0, 100), update);
		const edit: StringEdit = getRandomEdit();

		a.applyEdit(edit);
		b.applyEdit(edit);

		update.rebase(edit);

		a.setAnnotations(new OffsetRange(0, 100), update);
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
	const start = Math.floor(Math.random() * 100);
	const delta = Math.floor(Math.random() * (100 - start));
	return StringEdit.replace(new OffsetRange(start, start + delta), (Math.random() + 1).toString(36).substring(7));
}

function getAnnotation(): IAnnotation<string> {
	const start = Math.floor(Math.random() * 100);
	const delta = Math.floor(Math.random() * (100 - start));
	return { range: new OffsetRange(start, start + delta), annotation: '' };
}
