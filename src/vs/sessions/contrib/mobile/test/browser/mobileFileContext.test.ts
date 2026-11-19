/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import * as dom from '../../../../../base/browser/dom.js';
import { decodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Event as CommonEvent } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ByteSize } from '../../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../../../workbench/browser/labels.js';
import { IBrowserViewWorkbenchService } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import { ChatAttachmentModel } from '../../../../../workbench/contrib/chat/browser/attachments/chatAttachmentModel.js';
import { ChatAttachmentResolveService, IChatAttachmentResolveService } from '../../../../../workbench/contrib/chat/browser/attachments/chatAttachmentResolveService.js';
import { ImageAttachmentWidget, PasteAttachmentWidget } from '../../../../../workbench/contrib/chat/browser/attachments/chatAttachmentWidgets.js';
import { IChatWidget } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatImageCarouselService } from '../../../../../workbench/contrib/chat/browser/chatImageCarouselService.js';
import { ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { isExplicitFileOrImageVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { reviveChatDraft, serializeChatDraft } from '../../../../../workbench/contrib/chat/common/attachments/chatDraft.js';
import { ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { IChatResponseResourceFileSystemProvider } from '../../../../../workbench/contrib/chat/common/widget/chatResponseResourceFileSystemProvider.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { MobileFileContextValuePick } from '../../browser/mobileFileContext.js';

suite('MobileFileContext', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const png = decodeBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0u8AAAAASUVORK5CYII=').buffer;
	teardown(() => sinon.restore());

	function fileList(files: File[]): FileList {
		const transfer = new DataTransfer();
		for (const file of files) {
			transfer.items.add(file);
		}
		return transfer.files;
	}

	function createFixture(files: File[] = [], pickFiles?: typeof dom.triggerUpload, source: 'files' | 'photos' = 'files') {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IBrowserViewWorkbenchService, {});
		const resolver = instantiationService.createInstance(ChatAttachmentResolveService);
		instantiationService.stub(IChatAttachmentResolveService, resolver);
		const warnings: string[] = [];
		const errors: string[] = [];
		const notifications = upcastPartial<INotificationService>({
			warn: message => { warnings.push(String(message)); },
			error: message => { errors.push(String(message)); },
		});
		const filters: (string | undefined)[] = [];
		const state = { focused: 0 };
		const capabilities = { supportsFileAttachments: true, supportsImageAttachments: true };
		const widget = upcastPartial<IChatWidget>({
			attachmentCapabilities: capabilities,
			focusInput: () => { state.focused++; },
		});
		const picker = new MobileFileContextValuePick(source, pickFiles ?? (async accept => {
			filters.push(accept);
			return fileList(files);
		}), resolver, notifications);
		return { picker, widget, resolver, capabilities, filters, state, warnings, errors, instantiationService };
	}

	test('device text and photos remain self-contained through draft restore, preview, and removal', async () => {
		const fixture = createFixture([
			new File(['hello from the device'], 'notes.txt', { type: 'text/plain' }),
			new File([Uint8Array.from(png)], 'photo.png', { type: 'image/png' }),
		]);
		const { instantiationService } = fixture;
		const openEditor = sinon.stub(instantiationService.get(IEditorService), 'openEditor').resolves(undefined);
		const attachments = await fixture.picker.asAttachment(fixture.widget);
		assert.ok(attachments);
		const selectedWithoutOpeningEditor = openEditor.callCount === 0;
		const restored = reviveChatDraft(serializeChatDraft({ inputText: 'draft', attachments }));
		const model = store.add(instantiationService.createInstance(ChatAttachmentModel));
		model.addContext(...restored.attachments);
		const [text, image] = model.attachments;
		assert.ok(text.kind === 'paste' && image.kind === 'image');
		const previewText: string[] = [];
		const previewImages: Uint8Array[] = [];
		instantiationService.stub(IChatResponseResourceFileSystemProvider, upcastPartial<IChatResponseResourceFileSystemProvider>({
			associate: (data, options) => {
				assert.ok(data instanceof Uint8Array);
				previewText.push(VSBuffer.wrap(data).toString());
				return store.add({
					resource: URI.parse(`test-preview:/${options?.name}`),
					dispose: () => { },
				});
			},
		}));
		instantiationService.stub(IChatImageCarouselService, upcastPartial<IChatImageCarouselService>({
			openCarouselAtResource: async (_resource, data) => {
				assert.ok(data);
				previewImages.push(data);
			},
		}));
		instantiationService.stub(ILanguageModelsService, { onDidChangeLanguageModels: CommonEvent.None, getLanguageModelIds: () => [] });
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.ImageCarouselEnabled]: true }));
		const container = dom.append(document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const labels = store.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
		const options = { shouldFocusClearButton: false, supportsDeletion: true, isCurrentInput: true };
		const textWidget = store.add(instantiationService.createInstance(PasteAttachmentWidget, text, undefined, options, container, labels));
		const imageWidget = store.add(instantiationService.createInstance(ImageAttachmentWidget, undefined, image, undefined, options, container, labels));
		for (const [entry, attachmentWidget] of [[text, textWidget], [image, imageWidget]] as const) {
			store.add(attachmentWidget.onDidDelete(() => {
				model.delete(entry.id);
				attachmentWidget.dispose();
				attachmentWidget.element.remove();
			}));
		}
		textWidget.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		imageWidget.element.click();
		await timeout(0);
		textWidget.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', keyCode: 46, bubbles: true }));
		const removeImage = imageWidget.element.querySelector<HTMLElement>('.monaco-button');
		assert.ok(removeImage);
		removeImage.click();
		assert.deepStrictEqual({
			selectedWithoutOpeningEditor,
			captured: restored.attachments.map(entry => ({ name: entry.name, kind: entry.kind, explicit: isExplicitFileOrImageVariableEntry(entry) })),
			previewText,
			previewImages,
			remaining: model.attachments,
			focused: fixture.state.focused,
			errors: fixture.errors,
			warnings: fixture.warnings,
		}, {
			selectedWithoutOpeningEditor: true,
			captured: [{ name: 'notes.txt', kind: 'paste', explicit: true }, { name: 'photo.png', kind: 'image', explicit: true }],
			previewText: ['hello from the device'],
			previewImages: [png],
			remaining: [],
			focused: 1,
			errors: [],
			warnings: [],
		});
	});

	test('cancelling the actual device picker restores focus and removes the input', async () => {
		let input: HTMLInputElement | undefined;
		store.add(dom.addDisposableListener(document.body, 'click', event => {
			if (event.target instanceof HTMLInputElement && event.target.type === 'file') {
				event.preventDefault();
				input = event.target;
			}
		}, true));
		const fixture = createFixture([], dom.triggerUpload);
		const result = fixture.picker.asAttachment(fixture.widget);
		assert.ok(input);
		input.dispatchEvent(new Event('cancel'));
		assert.deepStrictEqual({
			attachments: await result,
			connected: input.isConnected,
			focused: fixture.state.focused,
			errors: fixture.errors,
		}, { attachments: undefined, connected: false, focused: 1, errors: [] });
	});

	for (const supportsFiles of [false, true]) {
		test(`Photos requests supported formats and rejects text, with file support ${supportsFiles}`, async () => {
			const text = new File(['do not read'], 'notes.txt');
			const readText = sinon.spy(text, 'arrayBuffer');
			const fixture = createFixture([text, new File([Uint8Array.from(png)], 'photo.png')], undefined, 'photos');
			fixture.capabilities.supportsFileAttachments = supportsFiles;
			const attachments = await fixture.picker.asAttachment(fixture.widget);
			assert.deepStrictEqual({
				filters: fixture.filters,
				kinds: attachments?.map(entry => entry.kind),
				textReads: readText.callCount,
				warnings: fixture.warnings.length,
			}, { filters: ['image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp'], kinds: ['image'], textReads: 0, warnings: 1 });
		});
	}

	test('capability changes while a file is being read prevent attachment', async () => {
		const read = new DeferredPromise<ArrayBuffer>();
		const text = new File(['content'], 'notes.txt');
		sinon.stub(text, 'arrayBuffer').returns(read.p);
		const fixture = createFixture([text]);
		const result = fixture.picker.asAttachment(fixture.widget);
		await timeout(0);
		fixture.capabilities.supportsFileAttachments = false;
		await read.complete(new TextEncoder().encode('content').buffer);
		assert.deepStrictEqual({ attachments: await result, warnings: fixture.warnings.length, focused: fixture.state.focused }, { attachments: [], warnings: 1, focused: 1 });
	});

	for (const capability of ['supportsFileAttachments', 'supportsImageAttachments'] as const) {
		test(`skips an earlier selection when ${capability} is disabled during the next read`, async () => {
			const text = new File(['content'], 'notes.txt');
			const photo = new File([Uint8Array.from(png)], 'photo.png');
			const [first, second] = capability === 'supportsFileAttachments' ? [text, photo] : [photo, text];
			const fixture = createFixture([first, second]);
			const contents = await second.arrayBuffer();
			sinon.stub(second, 'arrayBuffer').callsFake(async () => {
				fixture.capabilities[capability] = false;
				return contents;
			});

			const attachments = await fixture.picker.asAttachment(fixture.widget);
			assert.deepStrictEqual({
				attached: attachments?.map(entry => entry.name),
				warnings: fixture.warnings,
				errors: fixture.errors,
			}, {
				attached: [second.name],
				warnings: [`Could not attach ${first.name}. Choose a text file or a PNG, JPEG, GIF, or WebP image supported by this chat.`],
				errors: [],
			});
		});
	}

	test('unsupported, oversized, and unreadable files do not discard valid selections', async () => {
		const oversized = new File(['large'], 'large.txt');
		sinon.stub(oversized, 'size').get(() => 30 * ByteSize.MB + 1);
		const readOversized = sinon.spy(oversized, 'arrayBuffer');
		const unreadable = new File([], 'unreadable.txt');
		sinon.stub(unreadable, 'arrayBuffer').rejects(new Error('Read failed'));
		const fixture = createFixture([
			new File(['%PDF-1.7'], 'document.pdf', { type: 'application/pdf' }),
			new File([new Uint8Array([0, 0, 1, 0])], 'binary.bin'),
			oversized,
			unreadable,
			new File(['kept'], 'notes.txt'),
		]);
		const attachments = await fixture.picker.asAttachment(fixture.widget);
		assert.deepStrictEqual({
			names: attachments?.map(entry => entry.name),
			oversizedReads: readOversized.callCount,
			warnings: fixture.warnings.length,
			errors: fixture.errors,
			focused: fixture.state.focused,
		}, {
			names: ['notes.txt'],
			oversizedReads: 0,
			warnings: 3,
			errors: ['Could not attach unreadable.txt: Read failed'],
			focused: 1,
		});
	});

	test('the size boundary is inclusive and UTF-16 text retains its content', async () => {
		const file = new File([new Uint8Array([0xff, 0xfe, 0x68, 0, 0x69, 0])], 'notes.txt');
		sinon.stub(file, 'size').get(() => 30 * ByteSize.MB);
		const fixture = createFixture([file]);
		const attachments = await fixture.picker.asAttachment(fixture.widget);
		assert.deepStrictEqual({ values: attachments?.map(entry => entry.value), warnings: fixture.warnings, errors: fixture.errors }, { values: ['hi'], warnings: [], errors: [] });
	});

	test('picker failures are visible and restore input focus', async () => {
		const fixture = createFixture([], async () => { throw new Error('Picker unavailable'); });
		assert.deepStrictEqual({
			attachments: await fixture.picker.asAttachment(fixture.widget),
			errors: fixture.errors,
			focused: fixture.state.focused,
		}, { attachments: undefined, errors: ['Could not open the file picker: Picker unavailable'], focused: 1 });
	});
});
