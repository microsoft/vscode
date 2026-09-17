/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ByteSize } from '../../../../../platform/files/common/files.js';
import { IProgressStep } from '../../../../../platform/progress/common/progress.js';
import { ITransferProgressMessages, TransferProgressReporter } from '../../browser/fileImportExport.js';

suite('Files - TransferProgressReporter', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const messages: ITransferProgressMessages = {
		manySmallFiles: (filesTransferred, filesTotal, rate) => `${filesTransferred} of ${filesTotal} files (${rate}/s)`,
		largeFile: (name, bytesTransferred, size, rate) => `${name} (${bytesTransferred} of ${size}, ${rate}/s)`
	};

	function createReporter(filesTotal: number, totalBytes?: number) {
		const steps: IProgressStep[] = [];
		let time = 0;

		const reporter = store.add(new TransferProgressReporter(filesTotal, totalBytes, messages, { report: step => steps.push(step) }, () => time));

		return { reporter, steps, setTime: (t: number) => time = t };
	}

	test('single small file reports the file name', () => {
		const { reporter, steps } = createReporter(1);

		reporter.startFile();
		reporter.report('file.txt', 100, 0, 0);
		reporter.flush();

		assert.deepStrictEqual(steps, [{ message: 'file.txt' }]);
	});

	test('many small files report file counts and rate', () => {
		const { reporter, steps, setTime } = createReporter(3);

		reporter.startFile();
		setTime(1000);
		reporter.report('a.txt', 100, 100, 100);
		reporter.flush();

		reporter.startFile();
		setTime(2000);
		reporter.report('b.txt', 100, 100, 100);
		reporter.flush();

		assert.deepStrictEqual(steps, [
			{ message: '1 of 3 files (100B/s)' },
			{ message: '2 of 3 files (100B/s)' }
		]);
	});

	test('large file reports byte progress and rate', () => {
		const { reporter, steps, setTime } = createReporter(1);

		reporter.startFile();
		setTime(1000);
		reporter.report('big.bin', 2 * ByteSize.MB, ByteSize.MB, ByteSize.MB);
		reporter.flush();

		assert.deepStrictEqual(steps, [{ message: 'big.bin (1.00MB of 2.00MB, 1.00MB/s)' }]);
	});

	test('reports are throttled to the most recent one', () => {
		const { reporter, steps, setTime } = createReporter(1);

		reporter.startFile();
		setTime(1000);
		reporter.report('big.bin', 2 * ByteSize.MB, ByteSize.MB, ByteSize.MB);
		setTime(2000);
		reporter.report('big.bin', 2 * ByteSize.MB, 2 * ByteSize.MB, ByteSize.MB);
		reporter.flush();

		assert.deepStrictEqual(steps, [{ message: 'big.bin (2.00MB of 2.00MB, 1.00MB/s)' }]);
	});

	test('files added during the transfer are reflected in the counts', () => {
		const { reporter, steps, setTime } = createReporter(1);

		reporter.addFiles(2);

		reporter.startFile();
		setTime(1000);
		reporter.report('a.txt', 100, 100, 100);
		reporter.flush();

		assert.deepStrictEqual(steps, [{ message: '1 of 3 files (100B/s)' }]);
	});

	test('reports percentage increments when the total number of bytes is known', () => {
		const { reporter, steps, setTime } = createReporter(2, 1000);

		reporter.startFile();
		setTime(1000);
		reporter.report('a.txt', 500, 500, 500);
		reporter.flush();

		reporter.startFile();
		setTime(2000);
		reporter.report('b.txt', 500, 250, 250);
		reporter.flush();

		reporter.report('b.txt', 500, 500, 250);
		reporter.flush();

		assert.deepStrictEqual(steps, [
			{ message: '1 of 2 files (500B/s)', increment: 50, total: 100 },
			{ message: '2 of 2 files (375B/s)', increment: 25, total: 100 },
			{ message: '2 of 2 files (500B/s)', increment: 25, total: 100 }
		]);
	});

	test('reports no increments when the total number of bytes is unknown', () => {
		const { reporter, steps, setTime } = createReporter(1);

		reporter.startFile();
		setTime(1000);
		reporter.report('a.txt', 100, 100, 100);
		reporter.flush();

		assert.deepStrictEqual(steps, [{ message: 'a.txt' }]);
	});
});
