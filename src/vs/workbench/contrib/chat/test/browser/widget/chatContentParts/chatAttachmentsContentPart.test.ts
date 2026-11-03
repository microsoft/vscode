/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import * as dom from '../../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestFileService, workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../../../../browser/labels.js';
import { DefaultChatAttachmentWidget, getEffectiveImageOmittedState, ImageAttachmentWidget } from '../../../../browser/attachments/chatAttachmentWidgets.js';
import { getGitHubIssueOrPullRequestAttachments } from '../../../../browser/widget/input/editor/chatPasteProviders.js';
import { GitHubResourceDetailsResolver } from '../../../../../github/browser/githubResourceDetails.js';
import { IWorkbenchGitHubService } from '../../../../../../services/github/common/githubService.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { IClipboardService } from '../../../../../../../platform/clipboard/common/clipboardService.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { ChatAttachmentsContentPart } from '../../../../browser/widget/chatContentParts/chatAttachmentsContentPart.js';
import { AgentHostCompletionReferenceKind, IChatRequestVariableEntry, OmittedState, toAgentHostCompletionVariableEntry } from '../../../../common/attachments/chatVariableEntries.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../../common/languageModels.js';

suite('ChatAttachmentsContentPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let disposables: DisposableStore;
	let instantiationService: ReturnType<typeof workbenchInstantiationService>;

	setup(() => {
		disposables = store.add(new DisposableStore());
		instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IWorkbenchGitHubService, upcastPartial<IWorkbenchGitHubService>({ onDidChangeDefaultClient: Event.None }));
	});

	teardown(() => {
		sinon.restore();
		disposables.dispose();
	});

	suite('GitHub attachment previews', () => {
		for (const [path, kind] of [['issues', 'issue'], ['pull', 'pullRequest']] as const) {
			test(`provides the lazy ${kind} preview only to inline attachments`, () => {
				instantiationService.stub(IWorkbenchGitHubService, upcastPartial<IWorkbenchGitHubService>({
					onDidChangeDefaultClient: Event.None,
				}));
				const preview = dom.$('div', undefined, 'Preview title and status');
				const render = sinon.spy(() => preview);
				const createHover = sinon.stub(GitHubResourceDetailsResolver.prototype, 'createHover').returns({
					hover: { content: render },
					pillHover: { element: render },
					prefetch: () => assert.fail('Attachments must not prefetch details'),
				});
				instantiationService.stub(IHoverService, {
					...NullHoverService,
					setupDelayedHover: () => assert.fail('Inline references must not register a pointer preview'),
				});
				const labels = disposables.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
				const attachment = getGitHubIssueOrPullRequestAttachments(`https://github.com/microsoft/vscode/${path}/123`)[0];
				const widget = disposables.add(instantiationService.createInstance(DefaultChatAttachmentWidget,
					undefined, undefined, attachment, undefined, undefined,
					{ shouldFocusClearButton: false, supportsDeletion: true }, dom.$('.chat-inline-attachment'), labels));
				assert.deepStrictEqual({
					createdAtRest: createHover.callCount,
					renderedAtRest: render.callCount,
					label: widget.label.element.textContent?.trim(),
				}, {
					createdAtRest: 0,
					renderedAtRest: 0,
					label: 'microsoft/vscode#123',
				});
				const keyboardContent = widget.getPreviewHoverContent();
				assert.deepStrictEqual({
					kind: createHover.firstCall.args[1].kind,
					target: createHover.firstCall.args[1].target,
					keyboardContent: keyboardContent?.element,
					supportsPreview: widget.supportsPreview,
				}, {
					kind,
					target: { owner: 'microsoft', repo: 'vscode', number: 123 },
					keyboardContent: preview,
					supportsPreview: true,
				});
				widget.dispose();
				const copied: string[] = [];
				const opened: { resource: string; options: Parameters<IOpenerService['open']>[1] }[] = [];
				instantiationService.stub(IClipboardService, upcastPartial<IClipboardService>({ writeText: async text => { copied.push(text); } }));
				instantiationService.stub(IOpenerService, upcastPartial<IOpenerService>({
					open: async (resource, options) => {
						opened.push({ resource: resource.toString(), options });
						return true;
					},
				}));
				const copyWidget = disposables.add(instantiationService.createInstance(DefaultChatAttachmentWidget,
					undefined, undefined, attachment, undefined, undefined,
					{ shouldFocusClearButton: false, supportsDeletion: true }, dom.$('.chat-inline-attachment'), labels));
				copyWidget.getPreviewHoverContent();
				createHover.lastCall.args[1].onDidClickBaseBranch('main');
				createHover.lastCall.args[1].onDidClickHeadBranch('feature/preview');
				createHover.lastCall.args[1].onDidClickReference();
				assert.deepStrictEqual({ copied, opened }, {
					copied: ['main', 'feature/preview'],
					opened: [{ resource: `https://github.com/microsoft/vscode/${path}/123`, options: { openExternal: true } }],
				});
				copyWidget.dispose();
			});

			test(`preserves the ordinary non-inline ${kind} attachment tooltip`, () => {
				const createHover = sinon.stub(GitHubResourceDetailsResolver.prototype, 'createHover');
				let tooltipRegistrations = 0;
				instantiationService.stub(IHoverService, {
					...NullHoverService,
					setupDelayedHover: () => {
						tooltipRegistrations++;
						return toDisposable(() => { });
					},
				});
				const labels = disposables.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
				const attachment = getGitHubIssueOrPullRequestAttachments(`https://github.com/microsoft/vscode/${path}/123`)[0];
				assert.ok(attachment.kind === 'generic');
				const widget = disposables.add(instantiationService.createInstance(DefaultChatAttachmentWidget,
					undefined, undefined, { ...attachment, tooltip: new MarkdownString('Existing reference tooltip') }, undefined, undefined,
					{ shouldFocusClearButton: false, supportsDeletion: true }, dom.$('div'), labels));
				assert.deepStrictEqual({
					supportsPreview: widget.supportsPreview,
					preview: widget.getPreviewHoverContent(),
					enrichmentCalls: createHover.callCount,
					tooltipRegistrations,
				}, { supportsPreview: false, preview: undefined, enrichmentCalls: 0, tooltipRegistrations: 1 });
			});
		}

		for (const resource of [
			'https://github.com/microsoft/vscode/pull/not-a-number',
			'https://github.com/microsoft/vscode/discussions/123',
			'https://example.com/microsoft/vscode/pull/123',
			'https://example.com/artifact/123',
		]) {
			test(`does not preview an unsupported reference: ${resource}`, () => {
				const createHover = sinon.stub(GitHubResourceDetailsResolver.prototype, 'createHover');
				const labels = disposables.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
				const widget = disposables.add(instantiationService.createInstance(DefaultChatAttachmentWidget,
					undefined, undefined, { kind: 'generic', id: `github-context:${resource}`, name: 'Reference', value: resource }, undefined, undefined,
					{ shouldFocusClearButton: false, supportsDeletion: true }, dom.$('.chat-inline-attachment'), labels));
				assert.deepStrictEqual({
					supportsPreview: widget.supportsPreview,
					preview: widget.getPreviewHoverContent(),
					popup: widget.element.getAttribute('aria-haspopup'),
					requested: createHover.callCount,
				}, { supportsPreview: false, preview: undefined, popup: null, requested: 0 });
			});
		}

		test('invalidates old-account content and reacquires the preview on reopening', () => {
			const changed = disposables.add(new Emitter<void>());
			instantiationService.stub(IWorkbenchGitHubService, upcastPartial<IWorkbenchGitHubService>({ onDidChangeDefaultClient: changed.event }));
			const oldContent = dom.$('div');
			const oldLink = dom.append(oldContent, dom.$('a', { href: 'https://github.com/microsoft/private' }, 'Private old-account details'));
			const freshContent = dom.$('div', undefined, 'New account details');
			const createHover = sinon.stub(GitHubResourceDetailsResolver.prototype, 'createHover');
			createHover.onFirstCall().returns({ hover: { content: () => oldContent }, pillHover: { element: () => oldContent }, prefetch: () => { } });
			createHover.onSecondCall().returns({ hover: { content: () => freshContent }, pillHover: { element: () => freshContent }, prefetch: () => { } });
			const labels = disposables.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
			const widget = disposables.add(instantiationService.createInstance(DefaultChatAttachmentWidget,
				undefined, undefined, getGitHubIssueOrPullRequestAttachments('https://github.com/microsoft/vscode/pull/123')[0], undefined, undefined,
				{ shouldFocusClearButton: false, supportsDeletion: true }, dom.$('.chat-inline-attachment'), labels));
			widget.getPreviewHoverContent();
			let invalidated = 0;
			dom.getActiveDocument().body.appendChild(oldContent);
			disposables.add(toDisposable(() => oldContent.remove()));
			oldLink.focus();
			let focusedWhenInvalidated = false;
			disposables.add(widget.onDidChangePreview(() => {
				focusedWhenInvalidated = dom.getActiveElement() === oldLink;
				invalidated++;
			}));
			changed.fire();
			assert.deepStrictEqual({
				oldDetailsRemoved: !oldContent.textContent?.includes('Private'),
				freshContent: widget.getPreviewHoverContent()?.element === freshContent,
				invalidated,
				focusedWhenInvalidated,
			}, { oldDetailsRemoved: true, freshContent: true, invalidated: 1, focusedWhenInvalidated: true });
		});

		test('leaves unrelated and unsupported generic attachments unchanged', () => {
			const createHover = sinon.spy(GitHubResourceDetailsResolver.prototype, 'createHover');
			const labels = disposables.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
			const ids = ['ordinary', 'github-context:https://example.com/microsoft/vscode/issues/123', 'github-context:https://github.com/microsoft/vscode/pull/0'];
			const contents = ids.map(id => {
				const widget = disposables.add(instantiationService.createInstance(DefaultChatAttachmentWidget,
					undefined, undefined, { kind: 'generic', id, name: 'Context', value: 'value' }, undefined, undefined,
					{ shouldFocusClearButton: false, supportsDeletion: true }, dom.$('div'), labels));
				return widget.getPreviewHoverContent();
			});
			assert.deepStrictEqual({ contents, requests: createHover.callCount }, { contents: [undefined, undefined, undefined], requests: 0 });
		});
	});

	function createFileEntry(name: string, uri?: URI): IChatRequestVariableEntry {
		const fileUri = uri ?? URI.file(`/test/${name}`);
		return {
			kind: 'file',
			id: `file-${name}`,
			name,
			fullName: fileUri.path,
			value: fileUri
		};
	}

	function createImageEntry(name: string, buffer: Uint8Array, mimeType: string = 'image/png'): IChatRequestVariableEntry {
		return {
			kind: 'image',
			id: `image-${name}`,
			name,
			value: buffer,
			mimeType,
			isURL: false,
			references: [{ kind: 'reference', reference: URI.file(`/test/${name}`) }]
		};
	}

	function setModels(models: ReadonlyArray<{ identifier: string; id: string; vendor: string; vision: boolean }>): void {
		instantiationService.stub(ILanguageModelsService, {
			getLanguageModelIds: () => models.map(model => model.identifier),
			lookupLanguageModel: identifier => {
				const model = models.find(model => model.identifier === identifier);
				return model ? {
					extension: new ExtensionIdentifier('test.extension'),
					id: model.id,
					vendor: model.vendor,
					name: model.id,
					version: '1',
					family: model.id,
					maxInputTokens: 1000,
					maxOutputTokens: 1000,
					isDefaultForLocation: {},
					capabilities: { vision: model.vision },
				} satisfies ILanguageModelChatMetadata : undefined;
			},
		} as ILanguageModelsService);
	}

	test('should keep the image preview in thumbnail hovers by default', () => {
		const imageHoverContents: HTMLElement[] = [];
		instantiationService.stub(IHoverService, {
			...NullHoverService,
			setupDelayedHover: (target, hoverOptions) => {
				const options = typeof hoverOptions === 'function' ? hoverOptions() : hoverOptions;
				if (target.classList.contains('image-attachment') && dom.isHTMLElement(options.content)) {
					imageHoverContents.push(options.content);
				}
				return Disposable.None;
			},
		});

		disposables.add(instantiationService.createInstance(
			ChatAttachmentsContentPart,
			{ variables: [createImageEntry('image.png', new Uint8Array([0x89, 0x50, 0x4E, 0x47]))], sessionResource: undefined }
		));

		assert.deepStrictEqual({
			imageHovers: imageHoverContents.length,
			imageHoverPreviews: imageHoverContents.reduce((count, content) => count + content.querySelectorAll('.chat-attached-context-image').length, 0),
		}, {
			imageHovers: 1,
			imageHoverPreviews: 1,
		});
	});

	suite('updateVariables', () => {
		test('should update variables and re-render', () => {
			const initialVariables: IChatRequestVariableEntry[] = [
				createFileEntry('file1.ts'),
				createFileEntry('file2.ts')
			];

			const part = store.add(instantiationService.createInstance(
				ChatAttachmentsContentPart,
				{ variables: initialVariables, sessionResource: undefined }
			));

			mainWindow.document.body.appendChild(part.domNode!);
			disposables.add(toDisposable(() => part.domNode?.remove()));

			// Initial state should have 2 attachments
			const initialAttachments = part.domNode!.querySelectorAll('.chat-attached-context-attachment');
			assert.strictEqual(initialAttachments.length, 2, 'Should have 2 initial attachments');

			// Update with new variables
			const newVariables: IChatRequestVariableEntry[] = [
				createFileEntry('file1.ts'),
				createFileEntry('file2.ts'),
				createFileEntry('file3.ts')
			];

			part.updateVariables(newVariables);

			// Should now have 3 attachments
			const updatedAttachments = part.domNode!.querySelectorAll('.chat-attached-context-attachment');
			assert.strictEqual(updatedAttachments.length, 3, 'Should have 3 attachments after update');
		});

		test('should handle updating from file to image', () => {
			const initialVariables: IChatRequestVariableEntry[] = [
				createFileEntry('image.png')
			];

			const part = store.add(instantiationService.createInstance(
				ChatAttachmentsContentPart,
				{ variables: initialVariables, sessionResource: undefined }
			));

			mainWindow.document.body.appendChild(part.domNode!);
			disposables.add(toDisposable(() => part.domNode?.remove()));

			// Initial state should have 1 file attachment
			assert.strictEqual(part.domNode!.querySelectorAll('.chat-attached-context-attachment').length, 1);

			// Update with image entry (simulating lazy load completion)
			const imageBuffer = new Uint8Array([0x89, 0x50, 0x4E, 0x47]); // PNG header
			const newVariables: IChatRequestVariableEntry[] = [
				createImageEntry('image.png', imageBuffer)
			];

			part.updateVariables(newVariables);

			// Should still have 1 attachment (now as image)
			const updatedAttachments = part.domNode!.querySelectorAll('.chat-attached-context-attachment');
			assert.strictEqual(updatedAttachments.length, 1, 'Should have 1 attachment after update');
			assert.ok(updatedAttachments[0].classList.contains('image-attachment'), 'Image attachment should have styling class');
		});

		test('should preserve contextMenuHandler after update', () => {
			const initialVariables: IChatRequestVariableEntry[] = [
				createFileEntry('file1.ts')
			];

			const part = store.add(instantiationService.createInstance(
				ChatAttachmentsContentPart,
				{ variables: initialVariables, sessionResource: undefined }
			));

			const handler = () => { /* handler logic */ };
			part.contextMenuHandler = handler;

			mainWindow.document.body.appendChild(part.domNode!);
			disposables.add(toDisposable(() => part.domNode?.remove()));

			// Update with new variables
			const newVariables: IChatRequestVariableEntry[] = [
				createFileEntry('file1.ts'),
				createFileEntry('file2.ts')
			];

			part.updateVariables(newVariables);

			// The handler property should be preserved (updateVariables doesn't clear it)
			assert.strictEqual(part.contextMenuHandler, handler, 'contextMenuHandler should be preserved after update');
		});

		test('should handle empty variables array', () => {
			const initialVariables: IChatRequestVariableEntry[] = [
				createFileEntry('file1.ts')
			];

			const part = store.add(instantiationService.createInstance(
				ChatAttachmentsContentPart,
				{ variables: initialVariables, sessionResource: undefined }
			));

			mainWindow.document.body.appendChild(part.domNode!);
			disposables.add(toDisposable(() => part.domNode?.remove()));

			assert.strictEqual(part.domNode!.querySelectorAll('.chat-attached-context-attachment').length, 1);

			// Update with empty array
			part.updateVariables([]);

			// Should have no attachments
			const updatedAttachments = part.domNode!.querySelectorAll('.chat-attached-context-attachment');
			assert.strictEqual(updatedAttachments.length, 0, 'Should have 0 attachments after clearing');
		});

		test('should handle updating same variables (no-op)', () => {
			const variables: IChatRequestVariableEntry[] = [
				createFileEntry('file1.ts'),
				createFileEntry('file2.ts')
			];

			const part = store.add(instantiationService.createInstance(
				ChatAttachmentsContentPart,
				{ variables, sessionResource: undefined }
			));

			mainWindow.document.body.appendChild(part.domNode!);
			disposables.add(toDisposable(() => part.domNode?.remove()));

			// Update with same variables (different array, same content)
			part.updateVariables([...variables]);

			// Should re-render (we don't optimize for same content)
			const updatedAttachments = part.domNode!.querySelectorAll('.chat-attached-context-attachment');
			assert.strictEqual(updatedAttachments.length, 2, 'Should still have 2 attachments');
		});
	});

	suite('basic rendering', () => {
		test('should render file attachments', () => {
			const variables: IChatRequestVariableEntry[] = [
				createFileEntry('file1.ts'),
				createFileEntry('file2.ts')
			];

			const part = store.add(instantiationService.createInstance(
				ChatAttachmentsContentPart,
				{ variables, sessionResource: undefined }
			));

			mainWindow.document.body.appendChild(part.domNode!);
			disposables.add(toDisposable(() => part.domNode?.remove()));

			const attachments = part.domNode!.querySelectorAll('.chat-attached-context-attachment');
			assert.strictEqual(attachments.length, 2, 'Should render 2 file attachments');
		});

		test('should not render agent host completion references as attachments', () => {
			const variables: IChatRequestVariableEntry[] = [
				createFileEntry('file1.ts'),
				toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Command, '/rename', 'rename', undefined),
				toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Skill, '/agent-host-docs', 'file:///skills/agent-host-docs/SKILL.md', undefined),
			];

			const part = store.add(instantiationService.createInstance(
				ChatAttachmentsContentPart,
				{ variables, sessionResource: undefined }
			));

			mainWindow.document.body.appendChild(part.domNode!);
			disposables.add(toDisposable(() => part.domNode?.remove()));

			const attachments = part.domNode!.querySelectorAll('.chat-attached-context-attachment');
			assert.strictEqual(attachments.length, 1, 'Should only render the file attachment');
		});

		test('should not count agent host completion references in show more label', () => {
			const variables: IChatRequestVariableEntry[] = [
				createFileEntry('file1.ts'),
				toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Command, '/rename', 'rename', undefined),
				toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Skill, '/agent-host-docs', 'file:///skills/agent-host-docs/SKILL.md', undefined),
				createFileEntry('file2.ts'),
			];

			const part = store.add(instantiationService.createInstance(
				ChatAttachmentsContentPart,
				{ variables, sessionResource: undefined, limit: 1 }
			));

			mainWindow.document.body.appendChild(part.domNode!);
			disposables.add(toDisposable(() => part.domNode?.remove()));

			const showMoreLabel = part.domNode!.querySelector('.chat-attachments-show-more-button .chat-attached-context-custom-text')?.textContent;
			assert.strictEqual(showMoreLabel, '1 more');
		});

		test('should have chat-attached-context class on domNode', () => {
			const variables: IChatRequestVariableEntry[] = [createFileEntry('file.ts')];

			const part = store.add(instantiationService.createInstance(
				ChatAttachmentsContentPart,
				{ variables, sessionResource: undefined }
			));

			assert.ok(part.domNode!.classList.contains('chat-attached-context'), 'Should have chat-attached-context class');
		});

		test('should mark images omitted when the routed model does not support vision', () => {
			setModels([
				{ identifier: 'copilot/auto', id: 'auto', vendor: 'copilot', vision: false },
				{ identifier: 'other/test-non-vision', id: 'test-non-vision', vendor: 'other', vision: true },
				{ identifier: 'copilot/test-non-vision', id: 'test-non-vision', vendor: 'copilot', vision: false },
			]);
			const image = createImageEntry('image.png', new Uint8Array([1, 2, 3]));

			const part = store.add(instantiationService.createInstance(
				ChatAttachmentsContentPart,
				{ variables: [image], sessionResource: undefined, modelId: 'copilot/auto', resolvedModelId: 'test-non-vision' }
			));

			const attachment = part.domNode!.querySelector<HTMLElement>('.image-attachment');
			assert.deepStrictEqual({
				omittedState: image.omittedState,
				ariaLabel: attachment?.ariaLabel,
				isWarning: attachment?.classList.contains('warning'),
			}, {
				omittedState: undefined,
				ariaLabel: 'Image not sent because test-non-vision does not support images: image.png',
				isWarning: true,
			});
		});

		test('should not mark images omitted for Auto before routing', () => {
			setModels([{ identifier: 'copilot/auto', id: 'copilot/auto', vendor: 'copilot', vision: false }]);
			const image = createImageEntry('image.png', new Uint8Array([1, 2, 3]));

			const part = store.add(instantiationService.createInstance(
				ChatAttachmentsContentPart,
				{ variables: [image], sessionResource: undefined, modelId: 'copilot/auto' }
			));

			const attachment = part.domNode!.querySelector<HTMLElement>('.image-attachment');
			assert.deepStrictEqual({
				omittedState: image.omittedState,
				ariaLabel: attachment?.ariaLabel,
				isWarning: attachment?.classList.contains('warning'),
				isAutoWarning: attachment?.classList.contains('auto-image-warning'),
				hasWarningIcon: !!attachment?.querySelector('.codicon-warning'),
			}, {
				omittedState: undefined,
				ariaLabel: 'Attached image, image.png. Image support depends on the model selected by Auto.',
				isWarning: false,
				isAutoWarning: true,
				hasWarningIcon: false,
			});
		});

		test('should ignore a stale omitted state when editing with Auto', () => {
			const autoModel = {
				identifier: 'copilot/auto',
				metadata: {
					extension: new ExtensionIdentifier('test.extension'),
					id: 'copilot/auto',
					vendor: 'copilot',
					name: 'Auto',
					version: '1',
					family: 'auto',
					maxInputTokens: 1000,
					maxOutputTokens: 1000,
					isDefaultForLocation: {},
				}
			} satisfies { identifier: string; metadata: ILanguageModelChatMetadata };

			assert.strictEqual(getEffectiveImageOmittedState(OmittedState.Full, autoModel, true), OmittedState.NotOmitted);
		});

		suite('hydrated image attachments', () => {
			async function renderImageAndCollectReads(image: IChatRequestVariableEntry): Promise<string[]> {
				const fileService = instantiationService.get(IFileService) as TestFileService;
				const part = store.add(instantiationService.createInstance(
					ChatAttachmentsContentPart,
					{ variables: [image], sessionResource: undefined }
				));

				mainWindow.document.body.appendChild(part.domNode!);
				disposables.add(toDisposable(() => part.domNode?.remove()));

				// Let the widget's lazy byte load (a microtask) settle before inspecting reads.
				await new Promise<void>(resolve => setTimeout(resolve, 0));

				return fileService.readOperations.map(read => read.resource.toString());
			}

			test('should load bytes from the resource for a hydrated (uri-only) image', async () => {
				const resource = URI.file('/test/pasted-image.png');
				const reads = await renderImageAndCollectReads({
					kind: 'image',
					id: 'hydrated-image',
					name: 'pasted-image.png',
					value: resource,
					mimeType: 'image/png',
					isURL: true,
					references: [{ kind: 'reference', reference: resource }]
				});

				assert.deepStrictEqual(reads, [resource.toString()]);
			});

			test('should not read the resource for an image with inline bytes', async () => {
				const resource = URI.file('/test/inline-image.png');
				const reads = await renderImageAndCollectReads({
					kind: 'image',
					id: 'inline-image',
					name: 'inline-image.png',
					value: new Uint8Array([0x89, 0x50, 0x4E, 0x47]),
					mimeType: 'image/png',
					isURL: false,
					references: [{ kind: 'reference', reference: resource }]
				});

				assert.deepStrictEqual(reads, []);
			});

			test('should keep delete hint after loading hydrated image bytes', async () => {
				const resource = URI.file('/test/pasted-image.png');
				const container = mainWindow.document.createElement('div');
				mainWindow.document.body.appendChild(container);
				disposables.add(toDisposable(() => container.remove()));
				const contextResourceLabels = disposables.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
				const widget = disposables.add(instantiationService.createInstance(
					ImageAttachmentWidget,
					resource,
					{
						kind: 'image',
						id: 'hydrated-image-with-delete',
						name: 'pasted-image.png',
						value: resource,
						mimeType: 'image/png',
						isURL: true,
						references: [{ kind: 'reference', reference: resource }]
					},
					undefined,
					{ shouldFocusClearButton: false, supportsDeletion: true },
					container,
					contextResourceLabels
				));

				await new Promise<void>(resolve => setTimeout(resolve, 0));

				assert.deepStrictEqual({
					ariaLabel: widget.element.ariaLabel,
					clearButtonClass: widget.element.querySelector('.monaco-button')?.className,
				}, {
					ariaLabel: 'Attached image, pasted-image.png (Delete)',
					clearButtonClass: 'monaco-button codicon codicon-close-compact',
				});
			});
		});
	});
});
