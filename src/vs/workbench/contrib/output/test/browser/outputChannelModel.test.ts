/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { AbstractFileOutputChannelModel, parseLogEntryAt } from '../../common/outputChannelModel.js';
import { TextModel } from '../../../../../editor/common/model/textModel.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { LogLevel } from '../../../../../platform/log/common/log.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';

suite('Logs Parsing', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = disposables.add(workbenchInstantiationService({}, disposables));
	});

	test('should parse log entry with all components', () => {
		const text = '2023-10-15 14:30:45.123 [info] [Git] Initializing repository';
		const model = createModel(text);
		const entry = parseLogEntryAt(model, 1);

		assert.strictEqual(entry?.timestamp, new Date('2023-10-15 14:30:45.123').getTime());
		assert.strictEqual(entry?.logLevel, LogLevel.Info);
		assert.strictEqual(entry?.category, 'Git');
		assert.strictEqual(model.getValueInRange(entry?.range), text);
	});

	test('should parse multi-line log entry', () => {
		const text = [
			'2023-10-15 14:30:45.123 [error] [Extension] Failed with error:',
			'Error: Could not load extension',
			'    at Object.load (/path/to/file:10:5)'
		].join('\n');
		const model = createModel(text);
		const entry = parseLogEntryAt(model, 1);

		assert.strictEqual(entry?.timestamp, new Date('2023-10-15 14:30:45.123').getTime());
		assert.strictEqual(entry?.logLevel, LogLevel.Error);
		assert.strictEqual(entry?.category, 'Extension');
		assert.strictEqual(model.getValueInRange(entry?.range), text);
	});

	test('should parse log entry without category', () => {
		const text = '2023-10-15 14:30:45.123 [warning] System is running low on memory';
		const model = createModel(text);
		const entry = parseLogEntryAt(model, 1);

		assert.strictEqual(entry?.timestamp, new Date('2023-10-15 14:30:45.123').getTime());
		assert.strictEqual(entry?.logLevel, LogLevel.Warning);
		assert.strictEqual(entry?.category, undefined);
		assert.strictEqual(model.getValueInRange(entry?.range), text);
	});

	test('should return null for invalid log entry', () => {
		const model = createModel('Not a valid log entry');
		const entry = parseLogEntryAt(model, 1);

		assert.strictEqual(entry, null);
	});

	test('should parse all supported log levels', () => {
		const levels = {
			info: LogLevel.Info,
			trace: LogLevel.Trace,
			debug: LogLevel.Debug,
			warning: LogLevel.Warning,
			error: LogLevel.Error
		};

		for (const [levelText, expectedLevel] of Object.entries(levels)) {
			const model = createModel(`2023-10-15 14:30:45.123 [${levelText}] Test message`);
			const entry = parseLogEntryAt(model, 1);
			assert.strictEqual(entry?.logLevel, expectedLevel, `Failed for log level: ${levelText}`);
		}
	});

	test('should parse timestamp correctly', () => {
		const timestamps = [
			'2023-01-01 00:00:00.000',
			'2023-12-31 23:59:59.999',
			'2023-06-15 12:30:45.500'
		];

		for (const timestamp of timestamps) {
			const model = createModel(`${timestamp} [info] Test message`);
			const entry = parseLogEntryAt(model, 1);
			assert.strictEqual(entry?.timestamp, new Date(timestamp).getTime(), `Failed for timestamp: ${timestamp}`);
		}
	});

	test('should handle last line of file', () => {
		const model = createModel([
			'2023-10-15 14:30:45.123 [info] First message',
			'2023-10-15 14:30:45.124 [info] Last message',
			''
		].join('\n'));

		let actual = parseLogEntryAt(model, 1);
		assert.strictEqual(actual?.timestamp, new Date('2023-10-15 14:30:45.123').getTime());
		assert.strictEqual(actual?.logLevel, LogLevel.Info);
		assert.strictEqual(actual?.category, undefined);
		assert.strictEqual(model.getValueInRange(actual?.range), '2023-10-15 14:30:45.123 [info] First message');

		actual = parseLogEntryAt(model, 2);
		assert.strictEqual(actual?.timestamp, new Date('2023-10-15 14:30:45.124').getTime());
		assert.strictEqual(actual?.logLevel, LogLevel.Info);
		assert.strictEqual(actual?.category, undefined);
		assert.strictEqual(model.getValueInRange(actual?.range), '2023-10-15 14:30:45.124 [info] Last message');

		actual = parseLogEntryAt(model, 3);
		assert.strictEqual(actual, null);
	});

	test('should parse multi-line log entry with empty lines', () => {
		const text = [
			'2025-01-27 09:53:00.450 [info] Found with version <20.18.1>',
			'Now using node v20.18.1 (npm v10.8.2)',
			'',
			'> husky - npm run -s precommit',
			'> husky - node v20.18.1',
			'',
			'Reading git index versions...'
		].join('\n');
		const model = createModel(text);
		const entry = parseLogEntryAt(model, 1);

		assert.strictEqual(entry?.timestamp, new Date('2025-01-27 09:53:00.450').getTime());
		assert.strictEqual(entry?.logLevel, LogLevel.Info);
		assert.strictEqual(entry?.category, undefined);
		assert.strictEqual(model.getValueInRange(entry?.range), text);

	});

	function createModel(content: string): TextModel {
		return disposables.add(instantiationService.createInstance(TextModel, content, 'log', TextModel.DEFAULT_CREATION_OPTIONS, null));
	}
});

suite('AbstractFileOutputChannelModel', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let modelService: IModelService;

	setup(() => {
		instantiationService = disposables.add(workbenchInstantiationService({}, disposables));
		modelService = instantiationService.get(IModelService);
	});

	class TestContentProvider extends Disposable {
		private readonly _onDidAppend = this._register(new Emitter<void>());
		readonly onDidAppend = this._onDidAppend.event;
		private readonly _onDidReset = this._register(new Emitter<void>());
		readonly onDidReset = this._onDidReset.event;
		reset(): void { }
		watch(): void { }
		unwatch(): void { }
		async getContent(): Promise<{ readonly content: string; readonly consume: () => void }> {
			return { content: '', consume: () => { } };
		}
		getLogEntries() { return []; }
	}

	class TestOutputChannelModel extends AbstractFileOutputChannelModel {
		override readonly source = [];
		override clear(): void { }
		override update(): void { }
		override updateChannelSources(): void { }
	}

	function createOutputChannelModel(): TestOutputChannelModel {
		const modelUri = URI.parse('output:/test-channel');
		const language = instantiationService.get(ILanguageService).createById('log');
		const provider = disposables.add(new TestContentProvider());
		return disposables.add(new TestOutputChannelModel(modelUri, language, provider, modelService, instantiationService.get(IEditorWorkerService)));
	}

	test('loadModel is idempotent while the model is alive', async () => {
		const channelModel = createOutputChannelModel();

		const first = await channelModel.loadModel();
		const second = await channelModel.loadModel();

		// A second loadModel() before disposal must reuse the in-flight/resolved
		// model instead of issuing a duplicate createModel for the same URI.
		assert.strictEqual(first, second);
		assert.strictEqual(modelService.getModel(first.uri), first);

		// The model is owned by the model service and is not disposed by the
		// channel model, so dispose it here to avoid leaking it past the test.
		first.dispose();
	});

	test('loadModel creates a fresh model after the previous one is disposed', async () => {
		const channelModel = createOutputChannelModel();

		const first = await channelModel.loadModel();
		first.dispose();
		const second = await channelModel.loadModel();

		assert.notStrictEqual(first, second);
		assert.strictEqual(modelService.getModel(second.uri), second);

		second.dispose();
	});
});
