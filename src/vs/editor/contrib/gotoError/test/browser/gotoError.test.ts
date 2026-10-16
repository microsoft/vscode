/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { TestClipboardService } from '../../../../../platform/clipboard/test/common/testClipboardService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { MarkerService } from '../../../../../platform/markers/common/markerService.js';
import { IMarkerData, IMarkerService, MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { Position } from '../../../../common/core/position.js';
import { createTestCodeEditor, withAsyncTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { CopyFullErrorAction } from '../../browser/gotoError.js';

suite('Copy Full Error Message', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let markerService: MarkerService;
	let clipboardService: TestClipboardService;
	let services: ServiceCollection;

	setup(() => {
		markerService = store.add(new MarkerService());
		clipboardService = new TestClipboardService();
		services = new ServiceCollection(
			[IMarkerService, markerService],
			[IClipboardService, clipboardService]
		);
	});

	const diagnostic: IMarkerData = {
		severity: MarkerSeverity.Error,
		message: 'First line\n  Second line\n    at example (example.ts:1:3)',
		startLineNumber: 1,
		startColumn: 2,
		endLineNumber: 1,
		endColumn: 6
	};

	test('copies complete diagnostics from all owners at the cursor', async () => {
		await withAsyncTestCodeEditor('example text', { serviceCollection: services }, async editor => {
			const resource = editor.getModel()!.uri;
			markerService.changeOne('typescript', resource, [{
				...diagnostic,
				source: 'ts',
				code: { value: '1234', target: URI.parse('https://example.com/diagnostic/1234') },
				relatedInformation: [{
					resource: URI.parse('vscode-remote://ssh-remote+host/project/other.ts'),
					message: 'Related declaration\nAdditional context',
					startLineNumber: 12,
					startColumn: 4,
					endLineNumber: 12,
					endColumn: 9
				}]
			}, {
				...diagnostic, message: 'Outside cursor', startColumn: 8, endColumn: 12
			}]);
			markerService.changeOne('linter', resource, [{
				...diagnostic, severity: MarkerSeverity.Warning, message: 'Another diagnostic', source: 'lint', code: 'rule'
			}]);
			markerService.changeOne('typescript', URI.parse('file:///other.ts'), [diagnostic]);
			editor.setPosition(new Position(1, 3));

			await editor.getAction(CopyFullErrorAction.ID)!.run();

			assert.strictEqual(await clipboardService.readText(), [
				`${resource.toString(true)}(1, 2): ${diagnostic.message}`,
				'ts(1234)',
				'https://example.com/diagnostic/1234',
				'vscode-remote://ssh-remote+host/project/other.ts(12, 4): Related declaration\nAdditional context',
				'',
				`${resource.toString(true)}(1, 2): Another diagnostic`,
				'lint(rule)'
			].join('\n'));
		});
	});

	test('copies a multiline diagnostic without optional metadata', async () => {
		await withAsyncTestCodeEditor('first line\nsecond line\nthird line', { serviceCollection: services }, async editor => {
			const resource = editor.getModel()!.uri;
			markerService.changeOne('test', resource, [{
				...diagnostic, startColumn: 8, endLineNumber: 3, endColumn: 4
			}]);
			editor.setPosition(new Position(2, 2));

			await editor.getAction(CopyFullErrorAction.ID)!.run();

			assert.strictEqual(await clipboardService.readText(), `${resource.toString(true)}(1, 8): ${diagnostic.message}`);
		});
	});

	test('does not replace clipboard contents when no diagnostic contains the cursor', async () => {
		await withAsyncTestCodeEditor('example text', { serviceCollection: services }, async editor => {
			markerService.changeOne('test', editor.getModel()!.uri, [diagnostic]);
			await clipboardService.writeText('Keep clipboard');
			editor.setPosition(new Position(1, 9));

			await editor.getAction(CopyFullErrorAction.ID)!.run();

			assert.strictEqual(await clipboardService.readText(), 'Keep clipboard');
		});
	});

	test('does not replace clipboard contents when the editor has no model', async () => {
		const editor = store.add(createTestCodeEditor(undefined, { serviceCollection: services }));
		await clipboardService.writeText('Keep clipboard');

		await editor.runAction(new CopyFullErrorAction());

		assert.strictEqual(await clipboardService.readText(), 'Keep clipboard');
	});

	test('propagates clipboard failures', async () => {
		const error = new Error('Clipboard unavailable');
		class FailingClipboardService extends TestClipboardService {
			override async writeText(): Promise<void> {
				throw error;
			}
		}
		services.set(IClipboardService, new FailingClipboardService());
		await withAsyncTestCodeEditor('example text', { serviceCollection: services }, async editor => {
			markerService.changeOne('test', editor.getModel()!.uri, [diagnostic]);
			editor.setPosition(new Position(1, 3));

			await assert.rejects(editor.getAction(CopyFullErrorAction.ID)!.run(), error);
		});
	});
});
