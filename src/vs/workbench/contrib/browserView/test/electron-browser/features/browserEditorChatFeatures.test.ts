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

	function createPng(width: number, height: number): VSBuffer {
		const canvas = $<HTMLCanvasElement>('canvas');
		canvas.width = width;
		canvas.height = height;
		return decodeBase64(canvas.toDataURL('image/png').split(',')[1]);
	}

	function create(url = 'http://localhost:3000/') {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const { service, telemetry } = createTestScreenshotToolService(store);
		instantiationService.stub(IScreenshotToolService, service);
		const attached: IChatRequestVariableEntry[] = [];
		const widget = upcastPartial<IChatWidget>({ viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({}), attachmentModel: upcastPartial<IChatWidget['attachmentModel']>({ addContext: (...entries: IChatRequestVariableEntry[]) => { attached.push(...entries); } }) });
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({ revealWidget: async () => widget }));
		instantiationService.stub(IChatService, upcastPartial<IChatService>({ onDidSubmitRequest: Event.None }));
		instantiationService.stub(IChatPetService, upcastPartial<IChatPetService>({}));
		const warnings: string[] = [];
		instantiationService.stub(IDialogService, upcastPartial<IDialogService>({
			confirm: async options => {
				warnings.push(options.message);
				return { confirmed: false };
			},
		}));
		const pageCaptures: IBrowserViewCaptureScreenshotOptions[] = [];
		const areaSelections: (boolean | undefined)[] = [];
		const onDidPickArea = store.add(new Emitter<IBrowserViewRect | undefined>());
		const page = { pickedArea: undefined as IBrowserViewRect | undefined };
		const model = upcastPartial<IBrowserViewModel>({
			url,
			isAreaSelectionActive: false,
			onDidPickArea: onDidPickArea.event,
			// The page's own area picker reports the area that the user dragged, or nothing when cancelled.
			toggleAreaSelection: async enabled => {
				areaSelections.push(enabled);
				onDidPickArea.fire(page.pickedArea);
			},
			captureScreenshot: async options => {
				pageCaptures.push({ ...options });
				return createPng(4, 2);
			},
		});
		const editor = upcastPartial<BrowserEditor>({ onDidChangeModel: Event.None, model, window: mainWindow, ensureBrowserFocus: () => { } });
		const feature = store.add(instantiationService.createInstance(BrowserEditorChatIntegration, editor));
		return { feature, service, telemetry, attached, warnings, pageCaptures, areaSelections, page };
	}

	test('each action captures the page itself and attaches the capture right away, where it can be marked up', async () => {
		const { feature, service, telemetry, attached, pageCaptures, areaSelections, page } = create();
		await feature.addScreenshotToChat();
		page.pickedArea = { x: 10, y: 20, width: 30, height: 40 };
		await feature.addAreaScreenshotToChat();
		page.pickedArea = undefined;
		await feature.addAreaScreenshotToChat();
		await feature.addFullPageScreenshotToChat();
		assert.deepStrictEqual({
			pageCaptures,
			areaSelections,
			attached: attached.map(entry => ({ name: entry.name, mimeType: entry.kind === 'image' ? entry.mimeType : undefined, markUp: service.getEditableAttachment(entry)?.original.width })),
			tool: service.requests,
			captures: telemetry.captures,
		}, {
			pageCaptures: [
				{ quality: 80 },
				{ quality: 80, pageRect: { x: 10, y: 20, width: 30, height: 40 }, awaitNextPaint: true },
				{ fullPage: true, format: 'png' },
			],
			areaSelections: [true, true],
			attached: [
				{ name: 'Browser Screenshot', mimeType: 'image/jpeg', markUp: 4 },
				{ name: 'Browser Area Screenshot', mimeType: 'image/jpeg', markUp: 4 },
				{ name: 'Browser Full Page Screenshot', mimeType: 'image/png', markUp: 4 },
			],
			// The page's own capture and area picker are used rather than the screenshot tool's selection.
			tool: [],
			captures: [
				{ entryPoint: 'browserScreenshot', outcome: 'attached', mode: 'page' },
				{ entryPoint: 'browserAreaScreenshot', outcome: 'attached', mode: 'area' },
				{ entryPoint: 'browserAreaScreenshot', outcome: 'cancelled', mode: 'none' },
				{ entryPoint: 'browserFullPageScreenshot', outcome: 'attached', mode: 'fullPage' },
			],
		});
	});

	test('warns before attaching a capture of an untrusted page', async () => {
		const attach = async (url: string) => {
			const { feature, attached, warnings, telemetry } = create(url);
			await feature.addScreenshotToChat();
			// The warning is cancelled, which attaches nothing.
			return { warnings: warnings.length, attached: attached.length, outcome: telemetry.captures.map(capture => capture.outcome) };
		};
		assert.deepStrictEqual({
			localPage: await attach('http://localhost:3000/'),
			untrustedPage: await attach('https://example.com/'),
		}, {
			localPage: { warnings: 0, attached: 1, outcome: ['attached'] },
			untrustedPage: { warnings: 1, attached: 0, outcome: ['cancelled'] },
		});
	});
});
