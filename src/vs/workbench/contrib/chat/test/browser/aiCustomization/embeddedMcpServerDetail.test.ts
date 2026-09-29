/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../../base/browser/dom.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Event } from '../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CodeEditorWidget } from '../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IFileContent, IFileService } from '../../../../../../platform/files/common/files.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IMcpWorkbenchService, McpServerInstallState } from '../../../../mcp/common/mcpTypes.js';
import { EmbeddedMcpServerDetail, IMcpServerDetailInput } from '../../../browser/aiCustomization/embeddedMcpServerDetail.js';
import { createVSCodeHarnessDescriptor, ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';

suite('EmbeddedMcpServerDetail', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const uri = URI.file('/home/test/.copilot/mcp-config.json');
	const definition = '{ "command": "memory-server", "args": [] }';
	const content = `{\n\t"mcpServers": {\n\t\t"local-memory": ${definition},\n\t\t"other": { "command": "other-server" }\n\t}\n}`;

	function createDetail() {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const reads: { uri: URI; result: DeferredPromise<IFileContent> }[] = [];
		let model: ITextModel | null = null;
		instantiationService.stub(IFileService, {
			readFile: resource => {
				const result = new DeferredPromise<IFileContent>();
				reads.push({ uri: resource, result });
				return result.p;
			},
		});
		instantiationService.stub(IMcpWorkbenchService, { onChange: Event.None });
		instantiationService.stub(ICustomizationHarnessService, {
			activeSessionResource: constObservable(URI.parse('copilot:/session')),
			availableHarnesses: constObservable([createVSCodeHarnessDescriptor()]),
			getActiveDescriptor: () => createVSCodeHarnessDescriptor(),
		});
		instantiationService.stubInstance(CodeEditorWidget, {
			setModel: value => {
				assert.ok(value === null || (value && hasKey(value, { getValue: true })));
				model = value;
			},
			updateOptions: () => { },
			dispose: () => { },
		});
		const detail = store.add(instantiationService.createInstance(EmbeddedMcpServerDetail, $('div'), {
			openMigrationPage: () => { },
		}));
		const input: IMcpServerDetailInput = {
			id: 'memory', name: 'local-memory', label: 'Local Memory',
			installState: McpServerInstallState.Installed,
			source: { uri },
		};
		const snapshot = () => ({
			definition: model?.getValue(),
			emptyMessage: detail.element.querySelector<HTMLElement>('.mcp-detail-definition-empty')!.textContent,
			editorVisible: detail.element.querySelector<HTMLElement>('.mcp-detail-definition-editor')!.style.display !== 'none',
		});
		const complete = (index: number, text = content) => reads[index].result.complete(new class extends mock<IFileContent>() {
			override readonly value = VSBuffer.fromString(text);
		}());
		return { detail, input, reads, snapshot, complete };
	}

	test('loads only the selected definition after migration metadata changes during the read', async () => {
		const { detail, input, reads, snapshot, complete } = createDetail();
		detail.setInput(input);
		detail.setMigratable(false);
		await complete(0);

		assert.deepStrictEqual({
			...snapshot(),
			source: reads[0].uri,
			label: detail.element.querySelector('.editor-item-path')!.textContent,
		}, {
			definition,
			emptyMessage: 'No definition is available for this MCP server.',
			editorVisible: true,
			source: uri,
			label: 'mcp-config.json',
		});
	});

	test('shows read failures after migration metadata changes', async () => {
		const { detail, input, reads, snapshot } = createDetail();
		detail.setInput(input);
		detail.setMigratable(false);
		await reads[0].result.error(new Error('File unavailable'));

		assert.deepStrictEqual(snapshot(), {
			definition: undefined,
			emptyMessage: 'The MCP server definition could not be loaded.',
			editorVisible: false,
		});
	});

	test('prefers an explicit source range to the server name lookup', async () => {
		const { detail, input, snapshot, complete } = createDetail();
		detail.setInput({ ...input, source: { uri, range: new Range(4, 12, 4, 41) } });
		await complete(0);

		assert.strictEqual(snapshot().definition, '{ "command": "other-server" }');
	});

	test('shows the source document when no server entry can be located', async () => {
		const { detail, input, snapshot, complete } = createDetail();
		detail.setInput({ ...input, name: 'missing' });
		await complete(0);

		assert.strictEqual(snapshot().definition, content);
	});

	for (const fail of [false, true]) {
		test(`ignores stale read ${fail ? 'failures' : 'results'} after selecting another server`, async () => {
			const { detail, input, reads, snapshot, complete } = createDetail();
			detail.setInput(input);
			detail.setInput({ ...input, id: 'other', name: 'other' });
			await complete(1);
			const current = snapshot();
			if (fail) {
				await reads[0].result.error(new Error('Old read failed'));
			} else {
				await complete(0);
			}

			assert.deepStrictEqual({ definition: current.definition, afterOldRead: snapshot() }, {
				definition: '{ "command": "other-server" }',
				afterOldRead: current,
			});
		});
	}

	test('ignores pending reads after clearing the input', async () => {
		const { detail, input, snapshot, complete } = createDetail();
		detail.setInput(input);
		detail.clearInput();
		await complete(0);

		assert.deepStrictEqual(snapshot(), {
			definition: undefined,
			emptyMessage: 'No definition is available for this MCP server.',
			editorVisible: false,
		});
	});
});
