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
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
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
		const warnings: string[] = [];
		instantiationService.stub(IDialogService, upcastPartial<IDialogService>({
			confirm: async options => {
				warnings.push(options.message);
				return { confirmed: false };
			},
		}));
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
		return { feature, service, telemetry, attached, pageCaptures, warnings };
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
				{ entryPoint: 'browserScreenshot', outcome: 'attached', mode: 'page', usedTool: false },
				{ entryPoint: 'browserAreaScreenshot', outcome: 'attached', mode: 'area', usedTool: false },
				{ entryPoint: 'browserFullPageScreenshot', outcome: 'attached', mode: 'fullPage', usedTool: false },
			],
		});
	});

	test('with the screenshot tool, each action attaches its capture right away, where it can be edited', async () => {
		const { feature, service, telemetry, attached, pageCaptures } = create(true);
		const page = { dataUrl: 'data:image/jpeg;base64,/9j/', width: 4, height: 2 };
		service.result = { kind: 'captured', mode: 'page', image: page, layerUrls: ['http://localhost:3000/'] };
		await feature.addScreenshotToChat();
		service.result = { kind: 'cancelled', mode: 'none' };
		await feature.addAreaScreenshotToChat();
		await feature.addFullPageScreenshotToChat();
		assert.deepStrictEqual({
			pageCaptures,
			attached: attached.map(entry => ({ name: entry.name, mimeType: entry.kind === 'image' ? entry.mimeType : undefined, editable: service.getEditableAttachment(entry)?.original.width })),
			tool: service.requests,
			triggers: telemetry.triggers,
			captures: telemetry.captures,
		}, {
			pageCaptures: [{ fullPage: true, format: 'png' }],
			attached: [{ name: 'Browser Screenshot', mimeType: 'image/jpeg', editable: 4 }, { name: 'Browser Full Page Screenshot', mimeType: 'image/png', editable: 4 }],
			tool: ['capture', 'capture'],
			triggers: ['config.workbench.screenshotTool.enabled'],
			captures: [
				{ entryPoint: 'browserScreenshot', outcome: 'attached', mode: 'page', usedTool: true },
				{ entryPoint: 'browserAreaScreenshot', outcome: 'cancelled', mode: 'none', usedTool: true },
				{ entryPoint: 'browserFullPageScreenshot', outcome: 'attached', mode: 'fullPage', usedTool: true },
			],
		});
	});

	test('with the screenshot tool, warns about every page that a capture shows, not only the page that started it', async () => {
		const { feature, service, attached, warnings } = create(true);
		const capture = async (layerUrls: (string | undefined)[]) => {
			service.result = { kind: 'captured', mode: 'area', image: { dataUrl: 'data:image/jpeg;base64,/9j/', width: 4, height: 2 }, layerUrls };
			await feature.addAreaScreenshotToChat();
			// The warning is cancelled, which attaches nothing.
			return { warnings: warnings.splice(0).length, attached: attached.splice(0).length };
		};
		assert.deepStrictEqual({
			localPages: await capture(['http://localhost:3000/', 'http://127.0.0.1:8080/']),
			anotherPage: await capture(['http://localhost:3000/', 'https://example.com/']),
			pageWithoutUrl: await capture([undefined]),
			noPage: await capture([]),
		}, {
			localPages: { warnings: 0, attached: 1 },
			anotherPage: { warnings: 1, attached: 0 },
			pageWithoutUrl: { warnings: 1, attached: 0 },
			noPage: { warnings: 0, attached: 1 },
		});
	});
});
