/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { activate } from '..';
import { RendererApi } from 'vscode-notebook-renderer';
import { IDisposable, IRichRenderContext, OutputWithAppend, RenderOptions } from '../rendererTypes';
import { JSDOM } from "jsdom";
import { LinkDetector } from '../linkify';

const dom = new JSDOM();
global.document = dom.window.document;

suite('Notebook builtin output renderer', () => {

	const error = {
		name: "TypeError",
		message: "Expected type `str`, but received type `<class \'int\'>`",
		stack: "\u001b[1;31m---------------------------------------------------------------------------\u001b[0m" +
			"\u001b[1;31mTypeError\u001b[0m                                 Traceback (most recent call last)" +
			"\u001b[1;32mc:\\src\\test\\ws1\\testing.py\u001b[0m in \u001b[0;36mline 2\n\u001b[0;32m      <a href='file:///c%3A/src/test/ws1/testing.py?line=34'>35</a>\u001b[0m \u001b[39m# %%\u001b[39;00m\n\u001b[1;32m----> <a href='file:///c%3A/src/test/ws1/testing.py?line=35'>36</a>\u001b[0m \u001b[39mraise\u001b[39;00m \u001b[39mTypeError\u001b[39;00m(\u001b[39m'\u001b[39m\u001b[39merror = f\u001b[39m\u001b[39m\"\u001b[39m\u001b[39mExpected type `str`, but received type `\u001b[39m\u001b[39m{\u001b[39m\u001b[39mtype(name)}`\u001b[39m\u001b[39m\"\u001b[39m\u001b[39m'\u001b[39m)\n" +
			"\u001b[1;31mTypeError\u001b[0m: Expected type `str`, but received type `<class \'int\'>`\""
	};

	const errorMimeType = 'application/vnd.code.notebook.error';

	const stdoutMimeType = 'application/vnd.code.notebook.stdout';
	const stderrMimeType = 'application/vnd.code.notebook.stderr';

	const textLikeMimeTypes = [
		stdoutMimeType,
		stderrMimeType,
		'text/plain'
	];

	type optionalRenderOptions = { [k in keyof RenderOptions]?: RenderOptions[k] };

	type handler = (e: RenderOptions) => any;

	const settingsChangedHandlers: handler[] = [];
	function fireSettingsChange(options: optionalRenderOptions) {
		settingsChangedHandlers.forEach((handler) => handler(options as RenderOptions));
	}

	function createContext(settings?: optionalRenderOptions): IRichRenderContext {
		settingsChangedHandlers.length = 0;
		return {
			setState(_value: void) { },
			getState() { return undefined; },
			async getRenderer(_id): Promise<RendererApi | undefined> { return undefined; },
			settings: {
				outputWordWrap: true,
				outputScrolling: true,
				lineLimit: 30,
				...settings
			} as RenderOptions,
			onDidChangeSettings(listener: handler, _thisArgs?: any, disposables?: IDisposable[]) {
				settingsChangedHandlers.push(listener);

				const dispose = () => {
					settingsChangedHandlers.splice(settingsChangedHandlers.indexOf(listener), 1);
				};

				disposables?.push({ dispose });
				return {
					dispose
				};
			},
			workspace: {
				isTrusted: true
			}
		};
	}

	function createElement(elementType: 'div' | 'span', classes: string[]) {
		const el = global.document.createElement(elementType);
		classes.forEach((c) => el.classList.add(c));
		return el;
	}

	// Helper to generate HTML similar to what is passed to the renderer
	// <div class="cell_container" >
	//   <div class="output_container" >
	//     <div class="output" >
	class OutputHtml {
		private readonly cell = createElement('div', ['cell_container']);
		private readonly firstOutput: HTMLElement;

		constructor() {
			const outputContainer = createElement('div', ['output_container']);
			const outputElement = createElement('div', ['output']);

			this.cell.appendChild(outputContainer);
			outputContainer.appendChild(outputElement);

			this.firstOutput = outputElement;
		}

		public get cellElement() {
			return this.cell;
		}

		public getFirstOuputElement() {
			return this.firstOutput;
		}

		public appendOutputElement() {
			const outputElement = createElement('div', ['output']);
			const outputContainer = createElement('div', ['output_container']);
			this.cell.appendChild(outputContainer);
			outputContainer.appendChild(outputElement);

			return outputElement;
		}
	}

	function createOutputItem(text: string, mime: string, id: string = '123', appendedText?: string): OutputWithAppend {
		return {
			id: id,
			mime: mime,
			appendedText() {
				return appendedText;
			},
			text() {
				return text;
			},
			blob() {
				return [] as any;
			},
			json() {
				return '{ }';
			},
			data() {
				return [] as any;
			},
			metadata: {}
		};
	}

	textLikeMimeTypes.forEach((mimeType) => {
		test(`Render with wordwrap and scrolling for mimetype ${mimeType}`, async () => {
			const context = createContext({ outputWordWrap: true, outputScrolling: true });
			const renderer = await activate(context);
			assert.ok(renderer, 'Renderer not created');

			const outputElement = new OutputHtml().getFirstOuputElement();
			const outputItem = createOutputItem('content', mimeType);
			await renderer!.renderOutputItem(outputItem, outputElement);

			const inserted = outputElement.firstChild as HTMLElement;
			assert.ok(inserted, `nothing appended to output element: ${outputElement.innerHTML}`);
			assert.ok(outputElement.classList.contains('remove-padding'), `Padding should be removed for scrollable outputs ${outputElement.classList}`);
			if (mimeType === 'text/plain') {
				assert.ok(inserted.classList.contains('word-wrap'), `Word wrap should be enabled for text/plain ${outputElement.classList}`);
			} else {
				assert.ok(outputElement.classList.contains('word-wrap') && inserted.classList.contains('scrollable'),
					`output content classList should contain word-wrap and scrollable ${inserted.classList}`);
			}
			assert.ok(inserted.innerHTML.indexOf('>content</') > -1, `Content was not added to output element: ${outputElement.innerHTML}`);
		});

		test(`Render without wordwrap or scrolling for mimetype ${mimeType}`, async () => {
			const context = createContext({ outputWordWrap: false, outputScrolling: false });
			const renderer = await activate(context);
			assert.ok(renderer, 'Renderer not created');

			const outputElement = new OutputHtml().getFirstOuputElement();
			const outputItem = createOutputItem('content', mimeType);
			await renderer!.renderOutputItem(outputItem, outputElement);

			const inserted = outputElement.firstChild as HTMLElement;
			assert.ok(inserted, `nothing appended to output element: ${outputElement.innerHTML}`);
			assert.ok(outputElement.classList.contains('remove-padding'), `Padding should be removed for non-scrollable outputs: ${outputElement.classList}`);
			assert.ok(!outputElement.classList.contains('word-wrap') && !inserted.classList.contains('scrollable'),
				`output content classList should not contain word-wrap and scrollable ${inserted.classList}`);
			assert.ok(inserted.innerHTML.indexOf('>content</') > -1, `Content was not added to output element: ${outputElement.innerHTML}`);
		});

		test(`Replace content in element for mimetype ${mimeType}`, async () => {
			const context = createContext();
			const renderer = await activate(context);
			assert.ok(renderer, 'Renderer not created');

			const outputElement = new OutputHtml().getFirstOuputElement();
			const outputItem = createOutputItem('content', mimeType);
			await renderer!.renderOutputItem(outputItem, outputElement);
			const outputItem2 = createOutputItem('replaced content', mimeType);
			await renderer!.renderOutputItem(outputItem2, outputElement);

			const inserted = outputElement.firstChild as HTMLElement;
			assert.ok(inserted.innerHTML.indexOf('>content</') === -1, `Old content was not removed to output element: ${outputElement.innerHTML}`);
			assert.ok(inserted.innerHTML.indexOf('>replaced content</') !== -1, `Content was not added to output element: ${outputElement.innerHTML}`);
		});

	});

	test('Append streaming output', async () => {
		const context = createContext({ outputWordWrap: false, outputScrolling: true });
		const renderer = await activate(context);
		assert.ok(renderer, 'Renderer not created');

		const outputElement = new OutputHtml().getFirstOuputElement();
		const outputItem = createOutputItem('content', stdoutMimeType, '123', 'ignoredAppend');
		await renderer!.renderOutputItem(outputItem, outputElement);
		const outputItem2 = createOutputItem('content\nappended', stdoutMimeType, '123', '\nappended');
		await renderer!.renderOutputItem(outputItem2, outputElement);

		const inserted = outputElement.firstChild as HTMLElement;
		assert.ok(inserted.innerHTML.indexOf('>content</') !== -1, `Previous content should still exist: ${outputElement.innerHTML}`);
		assert.ok(inserted.innerHTML.indexOf('ignoredAppend') === -1, `Append value should not be used on first render: ${outputElement.innerHTML}`);
		assert.ok(inserted.innerHTML.indexOf('>appended</') !== -1, `Content was not appended to output element: ${outputElement.innerHTML}`);
		assert.ok(inserted.innerHTML.indexOf('>content</') === inserted.innerHTML.lastIndexOf('>content</'), `Original content should not be duplicated: ${outputElement.innerHTML}`);
	});

	test(`Appending multiple streaming outputs`, async () => {
		const context = createContext({ outputScrolling: true });
		const renderer = await activate(context);
		assert.ok(renderer, 'Renderer not created');

		const outputHtml = new OutputHtml();
		const firstOutputElement = outputHtml.getFirstOuputElement();
		const outputItem1 = createOutputItem('first stream content', stdoutMimeType, '1');
		const outputItem2 = createOutputItem(JSON.stringify(error), errorMimeType, '2');
		const outputItem3 = createOutputItem('second stream content', stdoutMimeType, '3');
		await renderer!.renderOutputItem(outputItem1, firstOutputElement);
		const secondOutputElement = outputHtml.appendOutputElement();
		await renderer!.renderOutputItem(outputItem2, secondOutputElement);
		const thirdOutputElement = outputHtml.appendOutputElement();
		await renderer!.renderOutputItem(outputItem3, thirdOutputElement);

		const appendedItem1 = createOutputItem('', stdoutMimeType, '1', ' appended1');
		await renderer!.renderOutputItem(appendedItem1, firstOutputElement);
		const appendedItem3 = createOutputItem('', stdoutMimeType, '3', ' appended3');
		await renderer!.renderOutputItem(appendedItem3, thirdOutputElement);

		assert.ok(firstOutputElement.innerHTML.indexOf('>first stream content') > -1, `Content was not added to output element: ${outputHtml.cellElement.innerHTML}`);
		assert.ok(firstOutputElement.innerHTML.indexOf('appended1') > -1, `Content was not appended to output element: ${outputHtml.cellElement.innerHTML}`);
		assert.ok(secondOutputElement.innerHTML.indexOf('>TypeError</') > -1, `Content was not added to output element: ${outputHtml.cellElement.innerHTML}`);
		assert.ok(thirdOutputElement.innerHTML.indexOf('>second stream content') > -1, `Content was not added to output element: ${outputHtml.cellElement.innerHTML}`);
		assert.ok(thirdOutputElement.innerHTML.indexOf('appended3') > -1, `Content was not appended to output element: ${outputHtml.cellElement.innerHTML}`);
	});

	test('Append large streaming outputs', async () => {
		const context = createContext({ outputWordWrap: false, outputScrolling: true });
		const renderer = await activate(context);
		assert.ok(renderer, 'Renderer not created');

		const outputElement = new OutputHtml().getFirstOuputElement();
		const lotsOfLines = new Array(4998).fill('line').join('\n');
		const firstOuput = lotsOfLines + 'expected1';
		const outputItem = createOutputItem(firstOuput, stdoutMimeType, '123');
		await renderer!.renderOutputItem(outputItem, outputElement);
		const appended = '\n' + lotsOfLines + 'expectedAppend';
		const outputItem2 = createOutputItem(firstOuput + appended, stdoutMimeType, '123', appended);
		await renderer!.renderOutputItem(outputItem2, outputElement);

		const inserted = outputElement.firstChild as HTMLElement;
		assert.ok(inserted.innerHTML.indexOf('expected1') !== -1, `Last bit of previous content should still exist`);
		assert.ok(inserted.innerHTML.indexOf('expectedAppend') !== -1, `Content was not appended to output element`);
	});

	test('Streaming outputs larger than the line limit are truncated', async () => {
		const context = createContext({ outputWordWrap: false, outputScrolling: true });
		const renderer = await activate(context);
		assert.ok(renderer, 'Renderer not created');

		const outputElement = new OutputHtml().getFirstOuputElement();
		const lotsOfLines = new Array(11000).fill('line').join('\n');
		const firstOuput = 'shouldBeTruncated' + lotsOfLines + 'expected1';
		const outputItem = createOutputItem(firstOuput, stdoutMimeType, '123');
		await renderer!.renderOutputItem(outputItem, outputElement);

		const inserted = outputElement.firstChild as HTMLElement;
		assert.ok(inserted.innerHTML.indexOf('expected1') !== -1, `Last bit of content should exist`);
		assert.ok(inserted.innerHTML.indexOf('shouldBeTruncated') === -1, `Beginning content should be truncated`);
	});

	test(`Render filepath links in text output when enabled`, async () => {
		LinkDetector.injectedHtmlCreator = (value: string) => value;
		const context = createContext({ outputWordWrap: true, outputScrolling: true, linkifyFilePaths: true });
		const renderer = await activate(context);
		assert.ok(renderer, 'Renderer not created');

		const outputElement = new OutputHtml().getFirstOuputElement();
		const outputItem = createOutputItem('./dir/file.txt', stdoutMimeType);
		await renderer!.renderOutputItem(outputItem, outputElement);

		const inserted = outputElement.firstChild as HTMLElement;
		assert.ok(inserted, `nothing appended to output element: ${outputElement.innerHTML}`);
		assert.ok(outputElement.innerHTML.indexOf('<a href="./dir/file.txt">') !== -1, `inner HTML:\n ${outputElement.innerHTML}`);
	});

	test(`No filepath links in text output when disabled`, async () => {
		LinkDetector.injectedHtmlCreator = (value: string) => value;
		const context = createContext({ outputWordWrap: true, outputScrolling: true, linkifyFilePaths: false });
		const renderer = await activate(context);
		assert.ok(renderer, 'Renderer not created');

		const outputElement = new OutputHtml().getFirstOuputElement();
		const outputItem = createOutputItem('./dir/file.txt', stdoutMimeType);
		await renderer!.renderOutputItem(outputItem, outputElement);

		const inserted = outputElement.firstChild as HTMLElement;
		assert.ok(inserted, `nothing appended to output element: ${outputElement.innerHTML}`);
		assert.ok(outputElement.innerHTML.indexOf('<a href="./dir/file.txt">') === -1, `inner HTML:\n ${outputElement.innerHTML}`);
	});

	test(`Render with wordwrap and scrolling for error output`, async () => {
		LinkDetector.injectedHtmlCreator = (value: string) => value;
		const context = createContext({ outputWordWrap: true, outputScrolling: true });
		const renderer = await activate(context);
		assert.ok(renderer, 'Renderer not created');

		const outputElement = new OutputHtml().getFirstOuputElement();
		const outputItem = createOutputItem(JSON.stringify(error), errorMimeType);
		await renderer!.renderOutputItem(outputItem, outputElement);

		const inserted = outputElement.firstChild as HTMLElement;
		assert.ok(inserted, `nothing appended to output element: ${outputElement.innerHTML}`);
		assert.ok(outputElement.classList.contains('remove-padding'), 'Padding should be removed for scrollable outputs');
		assert.ok(outputElement.classList.contains('word-wrap') && inserted.classList.contains('scrollable'),
			`output content classList should contain word-wrap and scrollable ${inserted.classList}`);
		assert.ok(inserted.innerHTML.indexOf('>Expected type `str`, but received type') > -1, `Content was not added to output element:\n ${outputElement.innerHTML}`);
		assert.ok(inserted.textContent!.indexOf('Expected type `str`, but received type `<class \'int\'>`') > -1, `Content was not added to output element:\n ${outputElement.textContent}`);
		assert.ok(inserted.textContent!.indexOf('<a href') === -1, 'HTML links should be rendered');
	});

	test(`Replace content in element for error output`, async () => {
		const context = createContext();
		const renderer = await activate(context);
		assert.ok(renderer, 'Renderer not created');

		const outputElement = new OutputHtml().getFirstOuputElement();
		const outputItem = createOutputItem(JSON.stringify(error), errorMimeType);
		await renderer!.renderOutputItem(outputItem, outputElement);
		const error2: typeof error = { ...error, message: 'new message', stack: 'replaced content' };
		const outputItem2 = createOutputItem(JSON.stringify(error2), errorMimeType);
		await renderer!.renderOutputItem(outputItem2, outputElement);

		const inserted = outputElement.firstChild as HTMLElement;
		assert.ok(inserted.innerHTML.indexOf('Expected type `str`, but received type') === -1, `Content was not removed from output element:\n ${outputElement.innerHTML}`);
		assert.ok(inserted.innerHTML.indexOf('>replaced content</') !== -1, `Content was not added to output element:\n ${outputElement.innerHTML}`);
	});

	test(`Multiple adjacent streaming outputs should be consolidated one element`, async () => {
		const context = createContext();
		const renderer = await activate(context);
		assert.ok(renderer, 'Renderer not created');

		const outputHtml = new OutputHtml();
		const outputElement = outputHtml.getFirstOuputElement();
		const outputItem1 = createOutputItem('first stream content', stdoutMimeType, '1');
		const outputItem2 = createOutputItem('second stream content', stdoutMimeType, '2');
		const outputItem3 = createOutputItem('third stream content', stderrMimeType, '3');
		await renderer!.renderOutputItem(outputItem1, outputElement);
		await renderer!.renderOutputItem(outputItem2, outputHtml.appendOutputElement());
		await renderer!.renderOutputItem(outputItem3, outputHtml.appendOutputElement());


		const inserted = outputElement.firstChild as HTMLElement;
		assert.ok(inserted, `nothing appended to output element: ${outputElement.innerHTML}`);
		assert.ok(inserted.innerHTML.indexOf('>first stream content</') > -1, `Content was not added to output element: ${outputElement.innerHTML}`);
		assert.ok(inserted.innerHTML.indexOf('>second stream content</') > -1, `Content was not added to output element: ${outputElement.innerHTML}`);
		assert.ok(inserted.innerHTML.indexOf('>third stream content</') > -1, `Content was not added to output element: ${outputElement.innerHTML}`);
	});

	test(`Consolidated streaming outputs should replace matching outputs correctly`, async () => {
		const context = createContext({ outputScrolling: false });
		const renderer = await activate(context);
		assert.ok(renderer, 'Renderer not created');

		const outputHtml = new OutputHtml();
		const outputElement = outputHtml.getFirstOuputElement();
		const outputItem1 = createOutputItem('first stream content', stdoutMimeType, '1');
		const outputItem2 = createOutputItem('second stream content', stdoutMimeType, '2');
		await renderer!.renderOutputItem(outputItem1, outputElement);
		const secondOutput = outputHtml.appendOutputElement();
		await renderer!.renderOutputItem(outputItem2, secondOutput);
		const newOutputItem1 = createOutputItem('replaced content', stdoutMimeType, '2');
		await renderer!.renderOutputItem(newOutputItem1, secondOutput);


		const inserted = outputElement.firstChild as HTMLElement;
		assert.ok(inserted, `nothing appended to output element: ${outputElement.innerHTML}`);
		assert.ok(inserted.innerHTML.indexOf('>first stream content</') > -1, `Content was not added to output element: ${outputHtml.cellElement.innerHTML}`);
		assert.ok(inserted.innerHTML.indexOf('>replaced content</') > -1, `Content was not added to output element: ${outputHtml.cellElement.innerHTML}`);
		assert.ok(inserted.innerHTML.indexOf('>second stream content</') === -1, `Content was not replaced in output element: ${outputHtml.cellElement.innerHTML}`);
	});

	test(`Consolidated streaming outputs should append matching outputs correctly`, async () => {
		const context = createContext({ outputScrolling: true });
		const renderer = await activate(context);
		assert.ok(renderer, 'Renderer not created');

		const outputHtml = new OutputHtml();
		const outputElement = outputHtml.getFirstOuputElement();
		const outputItem1 = createOutputItem('first stream content', stdoutMimeType, '1');
		const outputItem2 = createOutputItem('second stream content', stdoutMimeType, '2');
		await renderer!.renderOutputItem(outputItem1, outputElement);
		const secondOutput = outputHtml.appendOutputElement();
		await renderer!.renderOutputItem(outputItem2, secondOutput);
		const appendingOutput = createOutputItem('', stdoutMimeType, '2', ' appended');
		await renderer!.renderOutputItem(appendingOutput, secondOutput);


		const inserted = outputElement.firstChild as HTMLElement;
		assert.ok(inserted, `nothing appended to output element: ${outputElement.innerHTML}`);
		assert.ok(inserted.innerHTML.indexOf('>first stream content</') > -1, `Content was not added to output element: ${outputHtml.cellElement.innerHTML}`);
		assert.ok(inserted.innerHTML.indexOf('>second stream content') > -1, `Second content was not added to ouptut element: ${outputHtml.cellElement.innerHTML}`);
		assert.ok(inserted.innerHTML.indexOf('appended') > -1, `Content was not appended to ouptut element: ${outputHtml.cellElement.innerHTML}`);
	});

	test(`Streaming outputs interleaved with other mime types will produce separate outputs`, async () => {
		const context = createContext({ outputScrolling: false });
		const renderer = await activate(context);
		assert.ok(renderer, 'Renderer not created');

		const outputHtml = new OutputHtml();
		const firstOutputElement = outputHtml.getFirstOuputElement();
		const outputItem1 = createOutputItem('first stream content', stdoutMimeType, '1');
		const outputItem2 = createOutputItem(JSON.stringify(error), errorMimeType, '2');
		const outputItem3 = createOutputItem('second stream content', stdoutMimeType, '3');
		await renderer!.renderOutputItem(outputItem1, firstOutputElement);
		const secondOutputElement = outputHtml.appendOutputElement();
		await renderer!.renderOutputItem(outputItem2, secondOutputElement);
		const thirdOutputElement = outputHtml.appendOutputElement();
		await renderer!.renderOutputItem(outputItem3, thirdOutputElement);

		assert.ok(firstOutputElement.innerHTML.indexOf('>first stream content</') > -1, `Content was not added to output element: ${outputHtml.cellElement.innerHTML}`);
		assert.ok(secondOutputElement.innerHTML.indexOf('>TypeError</') > -1, `Content was not added to output element: ${outputHtml.cellElement.innerHTML}`);
		assert.ok(thirdOutputElement.innerHTML.indexOf('>second stream content</') > -1, `Content was not added to output element: ${outputHtml.cellElement.innerHTML}`);
	});

	test(`Multiple adjacent streaming outputs, rerendering the first should erase the rest`, async () => {
		const context = createContext();
		const renderer = await activate(context);
		assert.ok(renderer, 'Renderer not created');

		const outputHtml = new OutputHtml();
		const outputElement = outputHtml.getFirstOuputElement();
		const outputItem1 = createOutputItem('first stream content', stdoutMimeType, '1');
		const outputItem2 = createOutputItem('second stream content', stdoutMimeType, '2');
		const outputItem3 = createOutputItem('third stream content', stderrMimeType, '3');
		await renderer!.renderOutputItem(outputItem1, outputElement);
		await renderer!.renderOutputItem(outputItem2, outputHtml.appendOutputElement());
		await renderer!.renderOutputItem(outputItem3, outputHtml.appendOutputElement());
		const newOutputItem1 = createOutputItem('replaced content', stderrMimeType, '1');
		await renderer!.renderOutputItem(newOutputItem1, outputElement);


		const inserted = outputElement.firstChild as HTMLElement;
		assert.ok(inserted, `nothing appended to output element: ${outputElement.innerHTML}`);
		assert.ok(inserted.innerHTML.indexOf('>replaced content</') > -1, `Content was not added to output element: ${outputElement.innerHTML}`);
		assert.ok(inserted.innerHTML.indexOf('>first stream content</') === -1, `Content was not cleared: ${outputElement.innerHTML}`);
		assert.ok(inserted.innerHTML.indexOf('>second stream content</') === -1, `Content was not cleared: ${outputElement.innerHTML}`);
		assert.ok(inserted.innerHTML.indexOf('>third stream content</') === -1, `Content was not cleared: ${outputElement.innerHTML}`);
	});

	test(`Rendered output will wrap on settings change event`, async () => {
		const context = createContext({ outputWordWrap: false, outputScrolling: true });
		const renderer = await activate(context);
		assert.ok(renderer, 'Renderer not created');

		const outputElement = new OutputHtml().getFirstOuputElement();
		const outputItem = createOutputItem('content', stdoutMimeType);
		await renderer!.renderOutputItem(outputItem, outputElement);
		fireSettingsChange({ outputWordWrap: true, outputScrolling: true });

		const inserted = outputElement.firstChild as HTMLElement;
		assert.ok(outputElement.classList.contains('word-wrap') && inserted.classList.contains('scrollable'),
			`output content classList should contain word-wrap and scrollable ${inserted.classList}`);
	});

	test(`Settings event change listeners should not grow if output is re-rendered`, async () => {
		const context = createContext({ outputWordWrap: false });
		const renderer = await activate(context);
		assert.ok(renderer, 'Renderer not created');

		const outputElement = new OutputHtml().getFirstOuputElement();
		await renderer!.renderOutputItem(createOutputItem('content', stdoutMimeType), outputElement);
		const handlerCount = settingsChangedHandlers.length;
		await renderer!.renderOutputItem(createOutputItem('content', stdoutMimeType), outputElement);

		assert.equal(settingsChangedHandlers.length, handlerCount);
	});

	const rawIPythonError = {
		name: "NameError",
		message: "name 'x' is not defined",
		stack: "\u001b[1;31m---------------------------------------------------------------------------\u001b[0m" +
			"\u001b[1;31mNameError\u001b[0m                                 Traceback (most recent call last)" +
			"Cell \u001b[1;32mIn[2], line 1\u001b[0m\n\u001b[1;32m----> 1\u001b[0m \u001b[43mmyfunc\u001b[49m\u001b[43m(\u001b[49m\u001b[43m)\u001b[49m\n" +
			"Cell \u001b[1;32mIn[1], line 2\u001b[0m, in \u001b[0;36mmyfunc\u001b[1;34m()\u001b[0m\n\u001b[0;32m      1\u001b[0m \u001b[38;5;28;01mdef\u001b[39;00m \u001b[38;5;21mmyfunc\u001b[39m():\n\u001b[1;32m----> 2\u001b[0m     \u001b[38;5;28mprint\u001b[39m(\u001b[43mx\u001b[49m)\n" +
			"\u001b[1;31mNameError\u001b[0m: name 'x' is not defined"
	};

	test(`Should clean up raw IPython error stack traces`, async () => {
		LinkDetector.injectedHtmlCreator = (value: string) => value;
		const context = createContext({ outputWordWrap: true, outputScrolling: true });
		const renderer = await activate(context);
		assert.ok(renderer, 'Renderer not created');

		const outputElement = new OutputHtml().getFirstOuputElement();
		const outputItem = createOutputItem(JSON.stringify(rawIPythonError), errorMimeType);
		await renderer!.renderOutputItem(outputItem, outputElement);

		const inserted = outputElement.firstChild as HTMLElement;
		assert.ok(inserted, `nothing appended to output element: ${outputElement.innerHTML}`);
		assert.ok(outputElement.innerHTML.indexOf('class="code-background-colored"') === -1, `inner HTML:\n ${outputElement.innerHTML}`);
	});

});

