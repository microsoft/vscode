/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import URI from 'vs/base/common/uri';
import * as platform from 'vs/base/common/platform';
import { DefaultEndOfLine } from 'vs/editor/common/editorCommon';
import { Model } from 'vs/editor/common/model/model';
import { TextSource } from 'vs/editor/common/model/textSource';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Range } from 'vs/editor/common/core/range';
import { CharCode } from 'vs/base/common/charCode';
import { createStringBuilder } from 'vs/editor/common/core/stringBuilder';

const GENERATE_TESTS = false;

suite('ModelService', () => {
	let modelService: ModelServiceImpl;

	setup(() => {
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('files', { 'eol': '\n' });
		configService.setUserConfiguration('files', { 'eol': '\r\n' }, URI.file(platform.isWindows ? 'c:\\myroot' : '/myroot'));

		modelService = new ModelServiceImpl(null, configService);
	});

	teardown(() => {
		modelService.dispose();
	});

	test('EOL setting respected depending on root', () => {
		const model1 = modelService.createModel('farboo', null, null);
		const model2 = modelService.createModel('farboo', null, URI.file(platform.isWindows ? 'c:\\myroot\\myfile.txt' : '/myroot/myfile.txt'));
		const model3 = modelService.createModel('farboo', null, URI.file(platform.isWindows ? 'c:\\other\\myfile.txt' : '/other/myfile.txt'));

		assert.equal(model1.getOptions().defaultEOL, DefaultEndOfLine.LF);
		assert.equal(model2.getOptions().defaultEOL, DefaultEndOfLine.CRLF);
		assert.equal(model3.getOptions().defaultEOL, DefaultEndOfLine.LF);
	});

	test('_computeEdits first line changed', function () {

		const model = Model.createFromString(
			[
				'This is line one', //16
				'and this is line number two', //27
				'it is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\n')
		);

		const textSource = TextSource.fromString(
			[
				'This is line One', //16
				'and this is line number two', //27
				'it is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\n'),
			DefaultEndOfLine.LF
		);

		const actual = ModelServiceImpl._computeEdits(model, textSource);

		assert.deepEqual(actual, [
			EditOperation.replace(new Range(1, 1, 1, 17), 'This is line One')
		]);
	});

	test('_computeEdits EOL changed', function () {

		const model = Model.createFromString(
			[
				'This is line one', //16
				'and this is line number two', //27
				'it is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\n')
		);

		const textSource = TextSource.fromString(
			[
				'This is line one', //16
				'and this is line number two', //27
				'it is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\r\n'),
			DefaultEndOfLine.LF
		);

		const actual = ModelServiceImpl._computeEdits(model, textSource);

		assert.deepEqual(actual, []);
	});

	test('_computeEdits EOL and other change 1', function () {

		const model = Model.createFromString(
			[
				'This is line one', //16
				'and this is line number two', //27
				'it is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\n')
		);

		const textSource = TextSource.fromString(
			[
				'This is line One', //16
				'and this is line number two', //27
				'It is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\r\n'),
			DefaultEndOfLine.LF
		);

		const actual = ModelServiceImpl._computeEdits(model, textSource);

		assert.deepEqual(actual, [
			EditOperation.replace(new Range(1, 1, 1, 17), 'This is line One'),
			EditOperation.replace(new Range(3, 1, 3, 21), 'It is followed by #3')
		]);
	});

	test('_computeEdits EOL and other change 2', function () {

		const model = Model.createFromString(
			[
				'package main',	// 1
				'func foo() {',	// 2
				'}'				// 3
			].join('\n')
		);

		const textSource = TextSource.fromString(
			[
				'package main',	// 1
				'func foo() {',	// 2
				'}',			// 3
				''
			].join('\r\n'),
			DefaultEndOfLine.LF
		);

		const actual = ModelServiceImpl._computeEdits(model, textSource);

		assert.deepEqual(actual, [
			EditOperation.replace(new Range(3, 2, 3, 2), '\n')
		]);
	});

	test('generated1', () => {
		const file1 = ['pram', 'okctibad', 'pjuwtemued', 'knnnm', 'u', ''];
		const file2 = ['tcnr', 'rxwlicro', 'vnzy', '', '', 'pjzcogzur', 'ptmxyp', 'dfyshia', 'pee', 'ygg'];
		assertComputeEdits(file1, file2);
	});

	test('generated2', () => {
		const file1 = ['', 'itls', 'hrilyhesv', ''];
		const file2 = ['vdl', '', 'tchgz', 'bhx', 'nyl'];
		assertComputeEdits(file1, file2);
	});

	test('generated3', () => {
		const file1 = ['ubrbrcv', 'wv', 'xodspybszt', 's', 'wednjxm', 'fklajt', 'fyfc', 'lvejgge', 'rtpjlodmmk', 'arivtgmjdm'];
		const file2 = ['s', 'qj', 'tu', 'ur', 'qerhjjhyvx', 't'];
		assertComputeEdits(file1, file2);
	});

	test('generated4', () => {
		const file1 = ['ig', 'kh', 'hxegci', 'smvker', 'pkdmjjdqnv', 'vgkkqqx', '', 'jrzeb'];
		const file2 = ['yk', ''];
		assertComputeEdits(file1, file2);
	});

	test('does insertions in the middle of the document', () => {
		const file1 = [
			'line 1',
			'line 2',
			'line 3'
		];
		const file2 = [
			'line 1',
			'line 2',
			'line 5',
			'line 3'
		];
		assertComputeEdits(file1, file2);
	});

	test('does insertions at the end of the document', () => {
		const file1 = [
			'line 1',
			'line 2',
			'line 3'
		];
		const file2 = [
			'line 1',
			'line 2',
			'line 3',
			'line 4'
		];
		assertComputeEdits(file1, file2);
	});

	test('does insertions at the beginning of the document', () => {
		const file1 = [
			'line 1',
			'line 2',
			'line 3'
		];
		const file2 = [
			'line 0',
			'line 1',
			'line 2',
			'line 3'
		];
		assertComputeEdits(file1, file2);
	});

	test('does replacements', () => {
		const file1 = [
			'line 1',
			'line 2',
			'line 3'
		];
		const file2 = [
			'line 1',
			'line 7',
			'line 3'
		];
		assertComputeEdits(file1, file2);
	});

	test('does deletions', () => {
		const file1 = [
			'line 1',
			'line 2',
			'line 3'
		];
		const file2 = [
			'line 1',
			'line 3'
		];
		assertComputeEdits(file1, file2);
	});

	test('does insert, replace, and delete', () => {
		const file1 = [
			'line 1',
			'line 2',
			'line 3',
			'line 4',
			'line 5',
		];
		const file2 = [
			'line 0', // insert line 0
			'line 1',
			'replace line 2', // replace line 2
			'line 3',
			// delete line 4
			'line 5',
		];
		assertComputeEdits(file1, file2);
	});
});

function assertComputeEdits(lines1: string[], lines2: string[]): void {
	const model = Model.createFromString(lines1.join('\n'));
	const textSource = TextSource.fromString(lines2.join('\n'), DefaultEndOfLine.LF);

	// compute required edits
	// let start = Date.now();
	const edits = ModelServiceImpl._computeEdits(model, textSource);
	// console.log(`took ${Date.now() - start} ms.`);

	// apply edits
	model.pushEditOperations(null, edits, null);

	assert.equal(model.getValue(), lines2.join('\n'));
}

function getRandomInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomString(minLength: number, maxLength: number): string {
	let length = getRandomInt(minLength, maxLength);
	let t = createStringBuilder(length);
	for (let i = 0; i < length; i++) {
		t.appendASCII(getRandomInt(CharCode.a, CharCode.z));
	}
	return t.build();
}

function generateFile(small: boolean): string[] {
	let lineCount = getRandomInt(1, small ? 3 : 10000);
	let lines: string[] = [];
	for (let i = 0; i < lineCount; i++) {
		lines.push(getRandomString(0, small ? 3 : 10000));
	}
	return lines;
}

if (GENERATE_TESTS) {
	let number = 1;
	while (true) {

		console.log('------TEST: ' + number++);

		const file1 = generateFile(true);
		const file2 = generateFile(true);

		console.log('------TEST GENERATED');

		try {
			assertComputeEdits(file1, file2);
		} catch (err) {
			console.log(err);
			console.log(`
const file1 = ${JSON.stringify(file1).replace(/"/g, '\'')};
const file2 = ${JSON.stringify(file2).replace(/"/g, '\'')};
assertComputeEdits(file1, file2);
`);
			break;
		}
	}
}