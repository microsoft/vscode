/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AnnotatedString, AnnotationsUpdate, IAnnotatedString, IAnnotation, IAnnotationUpdate } from '../../../common/model/tokens/annotations.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { StringEdit } from '../../../common/core/edits/stringEdit.js';

function createAnnotation(startOffset: number, endOffset: number): IAnnotation<string> {
	return { range: new OffsetRange(startOffset, endOffset), annotation: '' };
}

function createUpdateAnnotation(startOffset: number, endOffset: number, toDelete: boolean = false): IAnnotationUpdate<string> {
	return { range: new OffsetRange(startOffset, endOffset), annotation: toDelete ? undefined : '' };
}

suite('Editor Model - Model', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('setAnnotations 1', () => {
		const annotatedString = new AnnotatedString<string>([
			createAnnotation(0, 5),
			createAnnotation(10, 15),
			createAnnotation(20, 25)
		]);
		annotatedString.setAnnotations(AnnotationsUpdate.create([createUpdateAnnotation(0, 7)]));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(0, 7),
			createAnnotation(10, 15),
			createAnnotation(20, 25)
		]);
		annotatedString.setAnnotations(AnnotationsUpdate.create([createUpdateAnnotation(8, 9)]));
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
		annotatedString.setAnnotations(AnnotationsUpdate.create([createUpdateAnnotation(1, 12, true), createUpdateAnnotation(0, 6)]));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(0, 6),
			createAnnotation(20, 25)
		]);
		annotatedString.setAnnotations(AnnotationsUpdate.create([createUpdateAnnotation(5, 27, true), createUpdateAnnotation(0, 3)]));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(0, 3)
		]);
		annotatedString.setAnnotations(AnnotationsUpdate.create([createUpdateAnnotation(1, 4)]));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(1, 4)
		]);
	});

	test('setAnnotations 3', () => {
		const annotatedString = new AnnotatedString<string>([
			createAnnotation(0, 5),
			createAnnotation(10, 15),
			createAnnotation(20, 25)
		]);
		annotatedString.setAnnotations(AnnotationsUpdate.create([createUpdateAnnotation(4, 20)]));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(4, 20)
		]);
		annotatedString.setAnnotations(AnnotationsUpdate.create([createUpdateAnnotation(22, 23)]));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(4, 20),
			createAnnotation(22, 23)
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

	test('getAnnotationsIntersecting 3', () => {
		const annotatedString = new AnnotatedString<string>([
			createAnnotation(0, 5),
			createAnnotation(10, 15)
		]);
		assert.deepStrictEqual(annotatedString.getAnnotationsIntersecting(new OffsetRange(5, 10)), [
			createAnnotation(0, 5),
			createAnnotation(10, 15)
		]);
		annotatedString.setAnnotations(AnnotationsUpdate.create([createUpdateAnnotation(0, 4), createUpdateAnnotation(5, 9)]));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(0, 4),
			createAnnotation(5, 9),
			createAnnotation(10, 15)
		]);
		assert.deepStrictEqual(annotatedString.getAnnotationsIntersecting(new OffsetRange(7, 10)), [
			createAnnotation(5, 9),
			createAnnotation(10, 15)
		]);
	});

	test('getAnnotationsIntersecting 4', () => {
		const annotatedString = new AnnotatedString<string>([
			createAnnotation(0, 10)
		]);
		annotatedString.setAnnotations(AnnotationsUpdate.create([createUpdateAnnotation(12, 15)]));
		assert.deepStrictEqual(annotatedString.getAnnotationsIntersecting(new OffsetRange(2, 8)), [
			createAnnotation(0, 10)
		]);
	});

	// FIX and this will fix the rendering in the editor
	test('getAnnotationsIntersecting 5', () => {
		const annotatedString = new AnnotatedString<string>([
			createAnnotation(0, 9),
			createAnnotation(10, 13),
			createAnnotation(14, 16),
		]);
		assert.deepStrictEqual(annotatedString.getAnnotationsIntersecting(new OffsetRange(1, 16)), [
			createAnnotation(0, 9),
			createAnnotation(10, 13),
			createAnnotation(14, 16),
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

	test('applyEdit 9 - insertion at end of annotation', () => {
		const annotatedString = new AnnotatedString<string>([
			createAnnotation(0, 5),
			createAnnotation(10, 15),
			createAnnotation(20, 25)
		]);
		annotatedString.applyEdit(StringEdit.insert(15, 'abc'));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(0, 5),
			createAnnotation(10, 15),
			createAnnotation(23, 28)
		]);
	});

	test('applyEdit 10 - insertion in middle of annotation', () => {
		const annotatedString = new AnnotatedString<string>([
			createAnnotation(0, 5),
			createAnnotation(10, 15),
			createAnnotation(20, 25)
		]);
		annotatedString.applyEdit(StringEdit.insert(12, 'abc'));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(0, 5),
			createAnnotation(10, 18),
			createAnnotation(23, 28)
		]);
	});

	test('applyEdit 11 - replacement consuming annotation', () => {
		const annotatedString = new AnnotatedString<string>([
			createAnnotation(0, 1),
			createAnnotation(2, 5),
			createAnnotation(6, 7)
		]);
		annotatedString.applyEdit(StringEdit.replace(new OffsetRange(1, 6), 'a'));
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(0, 1),
			createAnnotation(2, 3)
		]);
	});

	test('applyEdit 12 - multiple disjoint edits', () => {
		const annotatedString = new AnnotatedString<string>([
			createAnnotation(0, 5),
			createAnnotation(10, 15),
			createAnnotation(20, 25),
			createAnnotation(30, 35)
		]);
		const edit = StringEdit.compose([
			StringEdit.insert(0, 'a'),
			StringEdit.delete(new OffsetRange(11, 12)),
			StringEdit.replace(new OffsetRange(21, 22), 'bb'),
			StringEdit.replace(new OffsetRange(30, 35), 'c')
		]);
		annotatedString.applyEdit(edit);
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(1, 6),
			createAnnotation(11, 15),
			createAnnotation(20, 26),
			createAnnotation(30, 32)
		]);
	});

	test('applyEdit 13 - edit on the left border', () => {
		const annotatedString = new AnnotatedString<string>([
			createAnnotation(15, 16)
		]);
		const edit = StringEdit.compose([
			StringEdit.replace(new OffsetRange(15, 15), 'a')
		]);
		annotatedString.applyEdit(edit);
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(16, 17)
		]);
	});

	test('applyEdit 14 - edit on the right border', () => {
		const annotatedString = new AnnotatedString<string>([
			createAnnotation(15, 16)
		]);
		const edit = StringEdit.compose([
			StringEdit.replace(new OffsetRange(16, 16), 'a')
		]);
		annotatedString.applyEdit(edit);
		assert.deepStrictEqual(annotatedString.getAllAnnotations(), [
			createAnnotation(15, 16)
		]);
	});

	test('rebase', () => {
		const a: IAnnotatedString<string> = getRandomAnnotatedString();
		const b = a.clone();
		const update: AnnotationsUpdate<string> = getRandomAnnotationsUpdate();

		b.setAnnotations(update);
		const edit: StringEdit = getRandomEdit();

		a.applyEdit(edit);
		b.applyEdit(edit);

		update.rebase(edit);

		a.setAnnotations(update);
		assert.deepStrictEqual(a.getAllAnnotations(), b.getAllAnnotations());
	});
});

function getRandomAnnotatedString(): IAnnotatedString<string> {
	return new AnnotatedString<string>([getAnnotation()]);
}

function getRandomAnnotationsUpdate(): AnnotationsUpdate<string> {
	return AnnotationsUpdate.create([getAnnotationUpdate()]);
}

function getRandomEdit(): StringEdit {
	const start = Math.floor(Math.random() * 100);
	const delta = Math.floor(Math.random() * (100 - start));
	return StringEdit.replace(new OffsetRange(start, start + delta), (Math.random() + 1).toString(36).substring(7));
}

function getAnnotationUpdate(): IAnnotationUpdate<string> {
	return getAnnotation();
}

function getAnnotation(): IAnnotation<string> {
	const start = Math.floor(Math.random() * 100);
	const delta = Math.floor(Math.random() * (100 - start));
	return { range: new OffsetRange(start, start + delta), annotation: '' };
}
