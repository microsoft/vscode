/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { decodeBase64, VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IBrowserViewCaptureScreenshotOptions, IBrowserViewRect } from '../../../../../../platform/browserView/common/browserView.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IChatWidget, IChatWidgetService } from '../../../../chat/browser/chat.js';
import { IChatPetService } from '../../../../chat/browser/chatPetService.js';
import { IChatRequestVariableEntry } from '../../../../chat/common/attachments/chatVariableEntries.js';
import { IChatService } from '../../../../chat/common/chatService/chatService.js';
import { IScreenshotToolService } from '../../../../screenshotTool/browser/screenshotTool.js';
import { createTestScreenshotToolService } from '../../../../screenshotTool/test/browser/screenshotToolTestUtils.js';
import { IBrowserViewModel } from '../../../common/browserView.js';
import { BrowserEditor } from '../../../electron-browser/browserEditor.js';
import { BrowserEditorChatIntegration } from '../../../electron-browser/features/browserEditorChatFeatures.js';

suite('Browser screenshot actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const area: IBrowserViewRect = { x: 10, y: 20, width: 30, height: 40 };

	function createPng(width: number, height: number): VSBuffer {
		const canvas = $<HTMLCanvasElement>('canvas');
		canvas.width = width;
		canvas.height = height;
		return decodeBase64(canvas.toDataURL('image/png').split(',')[1]);
	}

	function create(enabled: boolean) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const { service, telemetry } = createTestScreenshotToolService(store, enabled);
		instantiationService.stub(IScreenshotToolService, service);
		const attached: IChatRequestVariableEntry[] = [];
		const widget = upcastPartial<IChatWidget>({ viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({}), attachmentModel: upcastPartial<IChatWidget['attachmentModel']>({ addContext: (...entries: IChatRequestVariableEntry[]) => { attached.push(...entries); } }) });
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({ revealWidget: async () => widget }));
		instantiationService.stub(IChatService, upcastPartial<IChatService>({ onDidSubmitRequest: Event.None }));
		instantiationService.stub(IChatPetService, upcastPartial<IChatPetService>({}));
		const pickedArea = store.add(new Emitter<IBrowserViewRect | undefined>());
		const pageCaptures: IBrowserViewCaptureScreenshotOptions[] = [];
		const model = upcastPartial<IBrowserViewModel>({
			url: 'http://localhost:3000/',
			isAreaSelectionActive: false,
			onDidPickArea: pickedArea.event,
			toggleAreaSelection: async enabled => {
				if (enabled) {
					pickedArea.fire(area);
				}
			},
			captureScreenshot: async options => {
				pageCaptures.push({ ...options });
				return createPng(4, 2);
			},
		});
		const editor = upcastPartial<BrowserEditor>({ onDidChangeModel: Event.None, model, window: mainWindow, ensureBrowserFocus: () => { } });
		const feature = store.add(instantiationService.createInstance(BrowserEditorChatIntegration, editor));
		return { feature, service, telemetry, attached, pageCaptures };
	}

	test('without the screenshot tool, each action captures the page as before', async () => {
		const { feature, service, telemetry, attached, pageCaptures } = create(false);
		await feature.addScreenshotToChat();
		await feature.addAreaScreenshotToChat();
		await feature.addFullPageScreenshotToChat();
		assert.deepStrictEqual({
			pageCaptures,
			attached: attached.map(entry => entry.name),
			tool: service.requests,
			triggers: telemetry.triggers,
			captures: telemetry.captures,
		}, {
			pageCaptures: [{ quality: 80 }, { quality: 80, pageRect: area, awaitNextPaint: true }, { fullPage: true, format: 'png' }],
			attached: ['Browser Screenshot', 'Browser Area Screenshot', 'Browser Full Page Screenshot'],
			tool: [],
			triggers: ['config.workbench.screenshotTool.enabled'],
			captures: [
				{ entryPoint: 'browserScreenshot', outcome: 'attached', mode: 'page', annotated: false, usedTool: false },
				{ entryPoint: 'browserAreaScreenshot', outcome: 'attached', mode: 'area', annotated: false, usedTool: false },
				{ entryPoint: 'browserFullPageScreenshot', outcome: 'attached', mode: 'fullPage', annotated: false, usedTool: false },
			],
		});
	});

	test('with the screenshot tool, each action opens the tool and attaches what the user keeps', async () => {
		const { feature, service, telemetry, attached, pageCaptures } = create(true);
		const page = { dataUrl: 'data:image/jpeg;base64,/9j/', width: 4, height: 2 };
		const annotated = { dataUrl: 'data:image/png;base64,iVBORw0K', width: 4, height: 2 };
		service.result = { kind: 'attach', mode: 'page', image: page, original: page, annotationState: undefined, annotated: false, includesLayerContent: true };
		await feature.addScreenshotToChat();
		service.result = { kind: 'attach', mode: 'area', image: annotated, original: page, annotationState: { actions: [], undoneActions: [], crop: null }, annotated: true, includesLayerContent: true };
		await feature.addAreaScreenshotToChat();
		service.result = { kind: 'cancelled', mode: 'fullPage' };
		await feature.addFullPageScreenshotToChat();
		assert.deepStrictEqual({
			pageCaptures,
			attached: attached.map(entry => ({ name: entry.name, mimeType: entry.kind === 'image' ? entry.mimeType : undefined })),
			tool: service.requests,
			triggers: telemetry.triggers,
			captures: telemetry.captures,
		}, {
			pageCaptures: [{ fullPage: true, format: 'png' }],
			attached: [{ name: 'Browser Screenshot', mimeType: 'image/jpeg' }, { name: 'Browser Area Screenshot', mimeType: 'image/png' }],
			tool: ['captureAndAnnotate', 'captureAndAnnotate', 'annotate fullPage 4x2'],
			triggers: ['config.workbench.screenshotTool.enabled'],
			captures: [
				{ entryPoint: 'browserScreenshot', outcome: 'attached', mode: 'page', annotated: false, usedTool: true },
				{ entryPoint: 'browserAreaScreenshot', outcome: 'attached', mode: 'area', annotated: true, usedTool: true },
				{ entryPoint: 'browserFullPageScreenshot', outcome: 'cancelled', mode: 'fullPage', annotated: false, usedTool: true },
			],
		});
	});
});
