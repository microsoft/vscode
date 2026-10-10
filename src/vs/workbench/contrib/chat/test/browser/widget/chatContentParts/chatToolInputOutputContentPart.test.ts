/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { DeferredPromise, retry } from '../../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { Event } from '../../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { TestFileService } from '../../../../../../test/common/workbenchTestServices.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IChatToolInvocationSerialized, ToolConfirmKind } from '../../../../common/chatService/chatService.js';
import { IToolResultInputOutputDetails, ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';
import { CodeBlockPart } from '../../../../browser/widget/chatContentParts/codeBlockPart.js';
import { ChatCollapsibleContentPart } from '../../../../browser/widget/chatContentParts/chatCollapsibleContentPart.js';
import { IDisposableReference } from '../../../../browser/widget/chatContentParts/chatCollections.js';
import { DiffEditorPool, EditorPool } from '../../../../browser/widget/chatContentParts/chatContentCodePools.js';
import { IChatContentPartRenderContext, InlineTextModelCollection } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { ChatCollapsibleInputOutputContentPart } from '../../../../browser/widget/chatContentParts/chatToolInputOutputContentPart.js';
import { ChatToolOutputContentSubPart } from '../../../../browser/widget/chatContentParts/chatToolOutputContentSubPart.js';
import { ChatInputOutputMarkdownProgressPart } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatInputOutputMarkdownProgressPart.js';
import { IChatResponseViewModel } from '../../../../common/model/chatViewModel.js';

suite('ChatCollapsibleInputOutputContentPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function renderImageDetails(output: IToolResultInputOutputDetails['output'], durationMs?: number, fileService?: IFileService, logService?: ILogService) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		if (fileService) {
			instantiationService.stub(IFileService, fileService);
		}
		if (logService) {
			instantiationService.stub(ILogService, logService);
		}
		const context: IChatContentPartRenderContext = {
			element: new class extends mock<IChatResponseViewModel>() {
				override readonly id = 'response';
				override readonly sessionResource = URI.parse('chat-session://test/session');
			}(),
			elementIndex: 0,
			container: mainWindow.document.createElement('div'),
			content: [],
			contentIndex: 0,
			codeBlockStartIndex: 0,
			treeStartIndex: 0,
			inlineTextModels: new class extends mock<InlineTextModelCollection>() { }(),
			editorPool: new class extends mock<EditorPool>() {
				override get(): IDisposableReference<CodeBlockPart> {
					return {
						object: new class extends mock<CodeBlockPart>() {
							override readonly element = mainWindow.document.createElement('div');
							override get uri() { return URI.parse('test://codeblock'); }
							override render(): void { }
							override layout(): void { }
						}(),
						isStale: () => false,
						dispose: () => { },
					};
				}
			}(),
			diffEditorPool: new class extends mock<DiffEditorPool>() { }(),
			currentWidth: observableValue('testWidth', 500),
			onDidChangeVisibility: Event.None,
		};
		const invocation: IChatToolInvocationSerialized = {
			kind: 'toolInvocationSerialized', toolId: 'image_generation', toolCallId: 'image-call',
			invocationMessage: 'Generating image', pastTenseMessage: 'Generated image', originMessage: undefined,
			presentation: undefined, source: ToolDataSource.Internal, isComplete: true, isConfirmed: true,
			toolSpecificData: { kind: 'generatedImage', durationMs },
		};
		return store.add(instantiationService.createInstance(ChatInputOutputMarkdownProgressPart, invocation, context, 0,
			'Generated image', undefined, '{"prompt":"Draw a tree"}', undefined, output, false));
	}

	function metadata(part: ChatInputOutputMarkdownProgressPart) {
		return [...part.domNode.querySelectorAll('.chat-tool-output-metadata-field')].map(field => ({
			label: field.querySelector('dt')?.textContent,
			value: field.querySelector('dd')?.textContent,
			accessibleValue: field.querySelector('dd')?.getAttribute('aria-label'),
		}));
	}

	test('expanded generated-image details show duration, image bytes, and unreported tokens', () => {
		const part = renderImageDetails([
			{ type: 'embed', value: 'AQI=', mimeType: 'image/png' },
			{ type: 'embed', value: 'AQID', mimeType: 'image/jpeg' },
			{ type: 'embed', value: 'Image generated successfully.', isText: true, mimeType: 'text/plain' },
		], 43_500);
		const collapsed = metadata(part);
		part.domNode.querySelector<HTMLElement>('.chat-confirmation-widget-title')!.click();
		assert.deepStrictEqual({ collapsed, expanded: metadata(part) }, {
			collapsed: [],
			expanded: [
				{ label: 'Duration', value: '43.5s', accessibleValue: null },
				{ label: 'Image size', value: '5B', accessibleValue: null },
				{ label: 'Tokens', value: '-', accessibleValue: 'Not reported' },
			],
		});
	});

	for (const width of [600, 180]) {
		test(`left-aligns generated-image metadata within each row (${width}px)`, async () => {
			const host = mainWindow.document.createElement('div');
			host.classList.add('monaco-reduce-motion');
			host.style.width = `${width}px`;
			host.style.fontSize = '13px';
			mainWindow.document.body.appendChild(host);
			store.add(toDisposable(() => host.remove()));
			const part = renderImageDetails([{ type: 'embed', value: 'AQID', mimeType: 'image/png' }], 43_500);
			host.appendChild(part.domNode);
			part.domNode.querySelector<HTMLElement>('.chat-confirmation-widget-title')!.click();
			const footer = part.domNode.querySelector<HTMLElement>('.chat-tool-output-metadata')!;
			await retry(async () => {
				assert.strictEqual(mainWindow.getComputedStyle(footer).display, 'flex');
			}, 10, 100);
			const bounds = footer.getBoundingClientRect();
			const rows = new Map<number, DOMRect[]>();
			for (const field of footer.children) {
				const fieldBounds = field.getBoundingClientRect();
				const top = Math.round(fieldBounds.top);
				const row = rows.get(top) ?? [];
				row.push(fieldBounds);
				rows.set(top, row);
			}
			assert.deepStrictEqual({
				visible: bounds.width > 0 && bounds.height > 0,
				leftAligned: [...rows.values()].every(row => Math.abs(Math.min(...row.map(field => field.left)) - bounds.left) < 1),
				contained: [...rows.values()].flat().every(field => field.left >= bounds.left && field.right <= bounds.right),
				wrapped: rows.size > 1,
			}, {
				visible: true,
				leftAligned: true,
				contained: true,
				wrapped: width === 180,
			});
		});
	}

	test('referenced image bytes are measured on expansion and metadata stays safe after disposal', async () => {
		const content = new DeferredPromise<VSBuffer>();
		let reads = 0;
		const fileService = store.add(new class extends TestFileService {
			override async readFile(resource: URI) {
				reads++;
				return { ...await super.readFile(resource), value: await content.p };
			}
		}());
		const part = renderImageDetails([{ type: 'ref', uri: URI.file('/generated.png'), mimeType: 'image/png' }], undefined, fileService);
		const collapsedReads = reads;
		part.domNode.querySelector<HTMLElement>('.chat-confirmation-widget-title')!.click();
		const waiting = metadata(part);
		await content.complete(VSBuffer.alloc(2048));
		await content.p;
		for (let i = 0; i < 10; i++) {
			await Promise.resolve();
		}
		const expanded = metadata(part);
		part.dispose();
		assert.deepStrictEqual({ collapsedReads, waiting, expanded, disposed: metadata(part) }, {
			collapsedReads: 0,
			waiting: [
				{ label: 'Duration', value: '-', accessibleValue: 'Not reported' },
				{ label: 'Image size', value: '-', accessibleValue: 'Not reported' },
				{ label: 'Tokens', value: '-', accessibleValue: 'Not reported' },
			],
			expanded: [
				{ label: 'Duration', value: '-', accessibleValue: 'Not reported' },
				{ label: 'Image size', value: '2.00KB', accessibleValue: null },
				{ label: 'Tokens', value: '-', accessibleValue: 'Not reported' },
			],
			disposed: [],
		});
	});

	test('late referenced image metadata does not update a disposed dropdown', async () => {
		const content = new DeferredPromise<VSBuffer>();
		const fileService = store.add(new class extends TestFileService {
			override async readFile(resource: URI) {
				return { ...await super.readFile(resource), value: await content.p };
			}
		}());
		const part = renderImageDetails([{ type: 'ref', uri: URI.file('/generated.png'), mimeType: 'image/png' }], 0, fileService);
		part.domNode.querySelector<HTMLElement>('.chat-confirmation-widget-title')!.click();
		const size = part.domNode.querySelectorAll('dd')[1];
		part.dispose();
		await content.complete(VSBuffer.alloc(2048));
		for (let i = 0; i < 10; i++) {
			await Promise.resolve();
		}
		assert.deepStrictEqual({ metadata: metadata(part), oldSize: size.textContent }, { metadata: [], oldSize: '-' });
	});

	test('image size failures are visible and logged instead of showing zero bytes', async () => {
		const warnings: string[] = [];
		const logService = new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}();
		const fileService = store.add(new class extends TestFileService {
			override async readFile(): Promise<never> { throw new Error('Image unavailable'); }
		}());
		const part = renderImageDetails([{ type: 'ref', uri: URI.file('/missing.png'), mimeType: 'image/png' }], undefined, fileService, logService);
		part.domNode.querySelector<HTMLElement>('.chat-confirmation-widget-title')!.click();
		for (let i = 0; i < 10; i++) {
			await Promise.resolve();
		}
		assert.deepStrictEqual({
			size: metadata(part).find(field => field.label === 'Image size'),
			warnings,
		}, {
			size: { label: 'Image size', value: 'Unavailable', accessibleValue: null },
			warnings: ['[ChatInputOutputMarkdownProgressPart] Could not read generated image size'],
		});
	});

	test('animates disclosure state and keeps collapsed content inert', () => {
		const editorElement = mainWindow.document.createElement('div');
		const codeBlockPart = Object.create(CodeBlockPart.prototype) as CodeBlockPart;
		Object.defineProperties(codeBlockPart, {
			element: { value: editorElement },
			render: { value: () => { } },
			layout: { value: () => { } },
		});
		const editorReference: IDisposableReference<CodeBlockPart> = {
			object: codeBlockPart,
			isStale: () => false,
			dispose: () => { },
		};
		const editorPool = Object.create(EditorPool.prototype) as EditorPool;
		Object.defineProperty(editorPool, 'get', { value: () => editorReference });
		const element = Object.create(null) as IChatResponseViewModel;
		Object.assign(element, {
			id: 'response',
			sessionResource: URI.parse('chat-session://test/session'),
		});
		const context: IChatContentPartRenderContext = {
			element,
			elementIndex: 0,
			container: mainWindow.document.createElement('div'),
			content: [],
			contentIndex: 0,
			inlineTextModels: Object.create(InlineTextModelCollection.prototype) as InlineTextModelCollection,
			editorPool,
			codeBlockStartIndex: 0,
			treeStartIndex: 0,
			diffEditorPool: Object.create(DiffEditorPool.prototype) as DiffEditorPool,
			currentWidth: observableValue('testWidth', 500),
			onDidChangeVisibility: Event.None,
		};
		const instantiationService = workbenchInstantiationService(undefined, store);
		const part = store.add(instantiationService.createInstance(
			ChatCollapsibleInputOutputContentPart,
			'Read Terminal',
			undefined,
			undefined,
			context,
			{
				kind: 'code',
				data: '{"shellId":"test"}',
				languageId: 'json',
				options: {},
				codeBlockIndex: 0,
				ownerMarkdownPartId: 'test',
			},
			undefined,
			false,
			false,
			false,
			undefined,
		));

		const button = part.domNode.querySelector<HTMLElement>('.chat-confirmation-widget-title');
		const widget = part.domNode.querySelector('.chat-confirmation-widget');
		const animationContent = part.domNode.querySelector<HTMLElement>('.chat-confirmation-widget-message-animation-inner');
		const chevron = part.domNode.querySelector('.chat-collapsible-hover-chevron');
		assert.ok(button);
		assert.ok(widget);
		assert.ok(animationContent);
		assert.ok(chevron);
		const expandedDuringToggle: Array<string | null> = [];
		part.domNode.addEventListener(ChatCollapsibleContentPart.userToggleEvent, () => expandedDuringToggle.push(button.ariaExpanded));

		const initiallyInert = animationContent.inert;
		button.click();
		const expandedState = {
			ariaExpanded: button.ariaExpanded,
			chevronExpanded: chevron.classList.contains('expanded'),
			inert: animationContent.inert,
			hasMessage: !!animationContent.querySelector('.chat-confirmation-widget-message'),
		};
		button.click();

		assert.deepStrictEqual({
			initiallyInert,
			titleIsFirst: widget.firstElementChild === button,
			expandedState,
			collapsedInert: animationContent.inert,
			expandedDuringToggle,
		}, {
			initiallyInert: true,
			titleIsFirst: true,
			expandedState: {
				ariaExpanded: 'true',
				chevronExpanded: true,
				inert: false,
				hasMessage: true,
			},
			collapsedInert: true,
			expandedDuringToggle: ['false', 'true'],
		});
	});

	test('renders titled outputs separately', () => {
		const renderedTexts: string[] = [];
		const editorPool = Object.create(EditorPool.prototype) as EditorPool;
		Object.defineProperty(editorPool, 'get', {
			value: () => {
				const codeBlockPart = Object.create(CodeBlockPart.prototype) as CodeBlockPart;
				Object.defineProperties(codeBlockPart, {
					element: { value: mainWindow.document.createElement('div') },
					render: { value: (data: { text: string }) => renderedTexts.push(data.text) },
					uri: { value: URI.parse('test://codeblock') },
				});
				return {
					object: codeBlockPart,
					isStale: () => false,
					dispose: () => { },
				} satisfies IDisposableReference<CodeBlockPart>;
			}
		});
		const element = Object.assign(Object.create(null), {
			id: 'response',
			sessionResource: URI.parse('chat-session://test/session'),
		}) as IChatResponseViewModel;
		const context: IChatContentPartRenderContext = {
			element,
			elementIndex: 0,
			container: mainWindow.document.createElement('div'),
			content: [],
			contentIndex: 0,
			inlineTextModels: Object.create(InlineTextModelCollection.prototype) as InlineTextModelCollection,
			editorPool,
			codeBlockStartIndex: 0,
			treeStartIndex: 0,
			diffEditorPool: Object.create(DiffEditorPool.prototype) as DiffEditorPool,
			currentWidth: observableValue('testWidth', 500),
			onDidChangeVisibility: Event.None,
		};
		const instantiationService = workbenchInstantiationService(undefined, store);
		const part = store.add(instantiationService.createInstance(
			ChatToolOutputContentSubPart,
			context,
			[
				{
					kind: 'code',
					title: 'https://example.com/first',
					data: 'First result',
					languageId: 'plaintext',
					options: {},
					codeBlockIndex: 0,
					ownerMarkdownPartId: 'test',
				},
				{
					kind: 'code',
					title: 'https://example.com/second',
					data: 'Second result',
					languageId: 'plaintext',
					options: {},
					codeBlockIndex: 1,
					ownerMarkdownPartId: 'test',
				},
			],
		));

		assert.deepStrictEqual({
			titles: [...part.domNode.querySelectorAll('.chat-confirmation-widget-title')].map(element => element.textContent),
			renderedTexts,
		}, {
			titles: ['https://example.com/first', 'https://example.com/second'],
			renderedTexts: ['First result', 'Second result'],
		});
	});

	for (const toolId of ['image_gen.imagegen', 'image_generation', 'copilot_viewImage']) {
		test(`collapsed resources are hidden only for image generation (${toolId})`, () => {
			const instantiationService = workbenchInstantiationService(undefined, store);
			const context: IChatContentPartRenderContext = {
				element: new class extends mock<IChatResponseViewModel>() {
					override readonly id = 'response';
					override readonly sessionResource = URI.parse('chat-session://test/session');
				}(),
				elementIndex: 0,
				container: mainWindow.document.createElement('div'),
				content: [],
				contentIndex: 0,
				codeBlockStartIndex: 0,
				treeStartIndex: 0,
				inlineTextModels: new class extends mock<InlineTextModelCollection>() { }(),
				editorPool: new class extends mock<EditorPool>() { }(),
				diffEditorPool: new class extends mock<DiffEditorPool>() { }(),
				currentWidth: observableValue('testWidth', 500),
				onDidChangeVisibility: Event.None,
			};
			const toolInvocation: IChatToolInvocationSerialized = {
				kind: 'toolInvocationSerialized',
				toolCallId: 'image-call',
				toolId,
				invocationMessage: 'Image tool',
				originMessage: undefined,
				pastTenseMessage: 'Image tool completed',
				isComplete: true,
				isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
				presentation: undefined,
				source: ToolDataSource.Internal,
			};
			const part = store.add(instantiationService.createInstance(
				ChatInputOutputMarkdownProgressPart,
				toolInvocation,
				context,
				0,
				'Image tool completed',
				undefined,
				'{}',
				undefined,
				[{ type: 'embed', value: 'aW1hZ2U=', mimeType: 'image/png' }],
				false,
			));

			assert.deepStrictEqual({
				collapsed: part.domNode.querySelector('.chat-confirmation-widget-title')?.getAttribute('aria-expanded'),
				previewCount: part.domNode.querySelectorAll('.chat-collapsible-top-level-resource-group').length,
			}, { collapsed: 'false', previewCount: toolId === 'copilot_viewImage' ? 1 : 0 });
		});
	}

	test('uses output MIME types and defaults to plaintext', () => {
		const renderedCodeBlocks: { text: string; languageId: string }[] = [];
		const editorPool = Object.create(EditorPool.prototype) as EditorPool;
		Object.defineProperty(editorPool, 'get', {
			value: () => {
				const codeBlockPart = Object.create(CodeBlockPart.prototype) as CodeBlockPart;
				Object.defineProperties(codeBlockPart, {
					element: { value: mainWindow.document.createElement('div') },
					render: { value: (data: { text: string; languageId: string }) => renderedCodeBlocks.push({ text: data.text, languageId: data.languageId }) },
					layout: { value: () => { } },
					uri: { value: URI.parse('test://codeblock') },
				});
				return {
					object: codeBlockPart,
					isStale: () => false,
					dispose: () => { },
				} satisfies IDisposableReference<CodeBlockPart>;
			}
		});
		const element = Object.assign(Object.create(null), {
			id: 'response',
			sessionResource: URI.parse('chat-session://test/session'),
		}) as IChatResponseViewModel;
		const context: IChatContentPartRenderContext = {
			element,
			elementIndex: 0,
			container: mainWindow.document.createElement('div'),
			content: [],
			contentIndex: 0,
			inlineTextModels: Object.create(InlineTextModelCollection.prototype) as InlineTextModelCollection,
			editorPool,
			codeBlockStartIndex: 0,
			treeStartIndex: 0,
			diffEditorPool: Object.create(DiffEditorPool.prototype) as DiffEditorPool,
			currentWidth: observableValue('testWidth', 500),
			onDidChangeVisibility: Event.None,
		};
		const toolInvocation: IChatToolInvocationSerialized = {
			kind: 'toolInvocationSerialized',
			toolCallId: 'tool-call-id',
			toolId: 'test-tool',
			invocationMessage: 'Running tool',
			originMessage: undefined,
			pastTenseMessage: 'Ran tool',
			isComplete: true,
			isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
			presentation: undefined,
			source: ToolDataSource.Internal,
		};
		const instantiationService = workbenchInstantiationService(undefined, store);
		const part = store.add(instantiationService.createInstance(
			ChatInputOutputMarkdownProgressPart,
			toolInvocation,
			context,
			0,
			'Ran tool',
			undefined,
			'{"query":"test"}',
			undefined,
			[
				{ type: 'embed', value: '# Heading', isText: true, mimeType: ' Text/Markdown ; charset=utf-8' },
				{ type: 'embed', value: '{"declared":true}', isText: true, mimeType: 'text/plain' },
				{ type: 'embed', value: 'invalid JSON', isText: true, mimeType: 'application/problem+json' },
				{ type: 'embed', value: '{"detected":true}', isText: true },
				{ type: 'embed', value: '[1, 2, 3]', isText: true },
				{ type: 'embed', value: 'ordinary output', isText: true },
				{ type: 'embed', value: '1', isText: true },
			],
			false,
		));

		part.domNode.querySelector<HTMLElement>('.chat-confirmation-widget-title')?.click();

		assert.deepStrictEqual(renderedCodeBlocks, [
			{ text: '{"query":"test"}', languageId: 'json' },
			{ text: '# Heading', languageId: 'markdown' },
			{ text: '{"declared":true}', languageId: 'plaintext' },
			{ text: 'invalid JSON', languageId: 'json' },
			{ text: '{"detected":true}\n[1, 2, 3]\nordinary output\n1', languageId: 'plaintext' },
		]);
	});
});
