/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { timeout } from '../../../../../../../base/common/async.js';
import * as dom from '../../../../../../../base/browser/dom.js';
import { isManagedHoverTooltipHTMLElement } from '../../../../../../../base/browser/ui/hover/hover.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../../base/test/common/timeTravelScheduler.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { HoverService } from '../../../../../../../platform/hover/browser/hoverService.js';
import { ILayoutService } from '../../../../../../../platform/layout/browser/layoutService.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { IHoverService, WorkbenchHoverDelegate } from '../../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../../platform/hover/test/browser/nullHoverService.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';
import { TestFileService, workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../../../../browser/labels.js';
import { DefaultChatAttachmentWidget, ImageAttachmentWidget } from '../../../../browser/attachments/chatAttachmentWidgets.js';
import { getGitHubIssueOrPullRequestAttachments } from '../../../../browser/widget/input/editor/chatPasteProviders.js';
import { GitHubResourceDetailsResolver, LazyGitHubResourceState } from '../../../../../github/browser/githubResourceDetails.js';
import { IGitHubIssueHoverModel } from '../../../../../github/browser/githubResourceHover.js';
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
		for (const delay of [500, 700]) {
			test(`pointer previews use the configured ${delay}ms delay and replace the previous reference`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
				const fixture = dom.append(document.body, dom.$('div'));
				disposables.add(toDisposable(() => fixture.remove()));
				instantiationService.stub(IConfigurationService, new TestConfigurationService({ 'workbench.hover.delay': delay }));
				instantiationService.stub(ILayoutService, {
					activeContainer: fixture,
					mainContainer: fixture,
					getContainer: () => fixture,
					onDidLayoutContainer: Event.None,
				});
				const hoverService = disposables.add(instantiationService.createInstance(HoverService));
				disposables.add(toDisposable(() => hoverService.hideHover(true)));
				instantiationService.stub(IHoverService, hoverService);
				// Fake time starts inside the delegate's instant-hover grace period.
				await timeout(1000);
				const hoverDelegate = disposables.add(instantiationService.createInstance(WorkbenchHoverDelegate, 'element', { instantHover: true }, {}));
				const previews = [dom.$('div', undefined, 'First reference'), dom.$('div', undefined, 'Second reference')];
				const createHover = sinon.stub(GitHubResourceDetailsResolver.prototype, 'createHover').callsFake((_identity, options) => ({
					hover: { content: () => dom.$('div', undefined, 'Keyboard details') },
					pillHover: { element: () => previews[options.target.number - 1], contentOwnsPadding: true },
					prefetch: () => { },
				}));
				const labels = disposables.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
				const widgets = [1, 2].map(number => disposables.add(instantiationService.createInstance(DefaultChatAttachmentWidget,
					undefined, undefined, getGitHubIssueOrPullRequestAttachments(`https://github.com/microsoft/vscode/issues/${number}`)[0], undefined, undefined,
					{ shouldFocusClearButton: false, supportsDeletion: true, hoverDelegate }, dom.append(fixture, dom.$('.chat-inline-attachment')), labels)));
				widgets[0].element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
				await timeout(delay - 1);
				const beforeDeadline = previews[0].isConnected;
				const resolvedBeforeDeadline = createHover.callCount;
				await timeout(1);
				const firstShown = previews[0].isConnected;
				const contentOwnsPadding = !!previews[0].closest('.managed-hover-content-owns-padding');
				widgets[0].element.dispatchEvent(new MouseEvent('mouseleave'));
				widgets[1].element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
				await timeout(0);
				const secondShownForPointer = previews[1].isConnected;
				widgets[1].element.dispatchEvent(new MouseEvent('mouseleave'));
				const focusedElement = dom.getActiveElement();
				widgets[0].previewHover?.show(false);
				await timeout(0);
				const keyboardShown = previews[0].isConnected;
				const keyboardPreservedFocus = dom.getActiveElement() === focusedElement;
				widgets[1].element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
				await timeout(0);
				assert.deepStrictEqual({
					beforeDeadline,
					resolvedBeforeDeadline,
					firstShown,
					contentOwnsPadding,
					secondShownForPointer,
					keyboardShown,
					keyboardPreservedFocus,
					firstDismissed: !previews[0].isConnected,
					secondShown: previews[1].isConnected,
				}, { beforeDeadline: false, resolvedBeforeDeadline: 0, firstShown: true, contentOwnsPadding: true, secondShownForPointer: true, keyboardShown: true, keyboardPreservedFocus: true, firstDismissed: true, secondShown: true });
			}));
		}

		test('keeps the shared resolver cache across attachment widget recreation', async () => {
			const resolver = disposables.add(instantiationService.createInstance(GitHubResourceDetailsResolver));
			const state = observableValue<LazyGitHubResourceState<IGitHubIssueHoverModel>>(resolver, { status: 'idle' });
			const issue: IGitHubIssueHoverModel = {
				title: 'Cached issue',
				body: 'Real details',
				state: 'open',
				author: { login: 'octocat' },
				createdAt: '2026-11-03T00:00:00Z',
			};
			sinon.stub(resolver, 'getIssueState').returns(state);
			sinon.stub(resolver, 'isFresh').callsFake(() => state.get().status === 'resolved');
			const resolve = sinon.stub(resolver, 'resolveIssue').callsFake(async () => {
				state.set({ status: 'resolved', value: issue }, undefined);
				return issue;
			});
			const labels = disposables.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
			const attachment = getGitHubIssueOrPullRequestAttachments('https://github.com/microsoft/vscode/issues/123')[0];
			const createWidget = () => disposables.add(instantiationService.createInstance(DefaultChatAttachmentWidget,
				undefined, undefined, attachment, undefined, undefined,
				{ shouldFocusClearButton: false, supportsDeletion: true, gitHubResourceDetailsResolver: resolver }, dom.$('.chat-inline-attachment'), labels));
			const first = createWidget();
			const loading = first.getPreviewHoverContent();
			const firstFallback = loading?.textContent;
			await timeout(0);
			first.dispose();
			const second = createWidget();
			const cached = second.getPreviewHoverContent();
			let pointerContent: Promise<HTMLElement> | undefined;
			instantiationService.stub(IHoverService, {
				...NullHoverService,
				setupManagedHover: (delegate, target, content) => {
					const resolved = typeof content === 'function' ? content() : content;
					assert.ok(isManagedHoverTooltipHTMLElement(resolved));
					pointerContent = Promise.resolve(resolved.element(CancellationToken.None));
					return NullHoverService.setupManagedHover(delegate, target, content);
				},
			});
			const pointerWidget = createWidget();
			const pointer = await pointerContent;
			assert.deepStrictEqual({
				firstFallback,
				resolvedTitle: cached?.querySelector('.sessions-issue-hover-title')?.textContent?.replace(/\s+/g, ' ').trim(),
				requests: resolve.callCount,
				independentViews: pointer !== cached,
				pointerTitle: pointer?.querySelector('.sessions-issue-hover-title')?.textContent?.replace(/\s+/g, ' ').trim(),
			}, { firstFallback: 'Issue #123', resolvedTitle: 'Cached issue #123', requests: 1, independentViews: true, pointerTitle: 'Cached issue #123' });
			pointerWidget.dispose();
		});

		for (const [path, kind] of [['issues', 'issue'], ['pull', 'pullRequest']] as const) {
			test(`provides the lazy ${kind} preview only to inline attachments`, async () => {
				const preview = dom.$('div', undefined, 'Preview title and status');
				const render = sinon.spy(() => preview);
				const createHover = sinon.stub(GitHubResourceDetailsResolver.prototype, 'createHover').returns({
					hover: { content: render },
					pillHover: { element: render },
					prefetch: () => assert.fail('Attachments must not prefetch details'),
				});
				let pointerRegistrations = 0;
				instantiationService.stub(IHoverService, {
					...NullHoverService,
					setupManagedHover: (delegate, target, content) => {
						pointerRegistrations++;
						return NullHoverService.setupManagedHover(delegate, target, content);
					},
				});
				const labels = disposables.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
				const attachment = getGitHubIssueOrPullRequestAttachments(`https://github.com/microsoft/vscode/${path}/123`)[0];
				const copied: string[] = [];
				const opened: { resource: string; options: Parameters<IOpenerService['open']>[1] }[] = [];
				instantiationService.stub(IClipboardService, upcastPartial<IClipboardService>({ writeText: async text => { copied.push(text); } }));
				instantiationService.stub(IOpenerService, upcastPartial<IOpenerService>({
					open: async (resource, options) => {
						opened.push({ resource: resource.toString(), options });
						return true;
					},
				}));
				const widget = disposables.add(instantiationService.createInstance(DefaultChatAttachmentWidget,
					undefined, undefined, attachment, undefined, undefined,
					{ shouldFocusClearButton: false, supportsDeletion: true }, dom.$('.chat-inline-attachment'), labels));
				assert.deepStrictEqual({
					createdAtRest: createHover.callCount,
					renderedAtRest: render.callCount,
					label: widget.label.element.textContent?.trim(),
					pointerRegistrations,
				}, {
					createdAtRest: 0,
					renderedAtRest: 0,
					label: 'microsoft/vscode#123',
					pointerRegistrations: 1,
				});
				const keyboardContent = widget.getPreviewHoverContent();
				assert.deepStrictEqual({
					kind: createHover.firstCall.args[1].kind,
					target: createHover.firstCall.args[1].target,
					keyboardContent,
					supportsPreview: widget.supportsPreview,
				}, {
					kind,
					target: { owner: 'microsoft', repo: 'vscode', number: 123 },
					keyboardContent: preview,
					supportsPreview: true,
				});
				createHover.lastCall.args[1].onDidClickBaseBranch('main');
				createHover.lastCall.args[1].onDidClickHeadBranch('feature/preview');
				createHover.lastCall.args[1].onDidClickReference();
				assert.deepStrictEqual({ copied, opened }, {
					copied: ['main', 'feature/preview'],
					opened: [{ resource: `https://github.com/microsoft/vscode/${path}/123`, options: { openExternal: true } }],
				});
				opened.length = 0;
				widget.element.click();
				await timeout(0);
				assert.deepStrictEqual(opened.map(item => item.resource), [`https://github.com/microsoft/vscode/${path}/123`]);
				widget.dispose();
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

		for (const id of [
			'ordinary',
			'github-context:https://github.com/microsoft/vscode/pull/0',
			'github-context:https://github.com/microsoft/vscode/pull/not-a-number',
			'github-context:https://github.com/microsoft/vscode/discussions/123',
			'github-context:https://example.com/microsoft/vscode/pull/123',
			'github-context:https://example.com/artifact/123',
		]) {
			test(`does not preview an unsupported reference: ${id}`, () => {
				const createHover = sinon.stub(GitHubResourceDetailsResolver.prototype, 'createHover');
				const labels = disposables.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
				const widget = disposables.add(instantiationService.createInstance(DefaultChatAttachmentWidget,
					undefined, undefined, { kind: 'generic', id, name: 'Reference', value: id }, undefined, undefined,
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
			const freshContent = dom.$('div', undefined, 'New account details');
			const hide = sinon.spy();
			instantiationService.stub(IHoverService, {
				...NullHoverService,
				setupManagedHover: (delegate, target, content) => ({ ...NullHoverService.setupManagedHover(delegate, target, content), hide }),
			});
			const createHover = sinon.stub(GitHubResourceDetailsResolver.prototype, 'createHover');
			createHover.onFirstCall().returns({ hover: { content: () => oldContent }, pillHover: { element: () => oldContent }, prefetch: () => { } });
			createHover.onSecondCall().returns({ hover: { content: () => freshContent }, pillHover: { element: () => freshContent }, prefetch: () => { } });
			const labels = disposables.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
			const widget = disposables.add(instantiationService.createInstance(DefaultChatAttachmentWidget,
				undefined, undefined, getGitHubIssueOrPullRequestAttachments('https://github.com/microsoft/vscode/pull/123')[0], undefined, undefined,
				{ shouldFocusClearButton: false, supportsDeletion: true }, dom.$('.chat-inline-attachment'), labels));
			widget.getPreviewHoverContent();
			let invalidated = 0;
			disposables.add(widget.onDidChangePreview(() => {
				invalidated++;
			}));
			changed.fire();
			assert.deepStrictEqual({
				freshContent: widget.getPreviewHoverContent() === freshContent,
				invalidated,
				hidden: hide.calledOnce,
			}, { freshContent: true, invalidated: 1, hidden: true });
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

	function captureImageHovers(): HTMLElement[] {
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
		return imageHoverContents;
	}

	test('should keep the image preview in thumbnail hovers by default', () => {
		const imageHoverContents = captureImageHovers();

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

		test('should warn about Copilot Fusion image support without marking images omitted', () => {
			setModels([{ identifier: 'copilot/auto', id: 'copilot/auto', vendor: 'copilot', vision: false }]);
			const image = createImageEntry('image.png', new Uint8Array([1, 2, 3]));
			const imageHoverContents = captureImageHovers();

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
				hoverText: imageHoverContents.map(content => content.textContent),
			}, {
				omittedState: undefined,
				ariaLabel: 'Attached image, image.png. Image support depends on the model selected by Copilot Fusion.',
				isWarning: false,
				isAutoWarning: true,
				hasWarningIcon: false,
				hoverText: [`${instantiationService.get(ILabelService).getUriLabel(URI.file('/test/image.png'))}Image support depends on the model selected by Copilot Fusion.`],
			});
		});

		test('should show the Copilot Fusion warning instead of a stale omission when editing', () => {
			const fusionModel = {
				identifier: 'agent-host-copilotcli/auto',
				metadata: {
					extension: new ExtensionIdentifier('test.extension'),
					id: 'auto',
					vendor: 'agent-host-copilotcli',
					name: 'Copilot Fusion',
					version: '1',
					family: 'auto',
					maxInputTokens: 1000,
					maxOutputTokens: 1000,
					isDefaultForLocation: {},
					capabilities: { vision: false },
					autoModelFusion: true,
				}
			} satisfies { identifier: string; metadata: ILanguageModelChatMetadata };
			setModels([{ identifier: fusionModel.identifier, id: fusionModel.metadata.id, vendor: fusionModel.metadata.vendor, vision: false }]);
			const image = createImageEntry('image.png', new Uint8Array([1, 2, 3]));
			image.omittedState = OmittedState.Full;
			const imageHoverContents = captureImageHovers();
			const contextResourceLabels = disposables.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
			const widget = disposables.add(instantiationService.createInstance(
				ImageAttachmentWidget,
				undefined,
				image,
				fusionModel,
				{ shouldFocusClearButton: false, supportsDeletion: true, isCurrentInput: true },
				dom.$('div'),
				contextResourceLabels
			));

			assert.deepStrictEqual({
				ariaLabel: widget.element.ariaLabel,
				isWarning: widget.element.classList.contains('warning'),
				isAutoWarning: widget.element.classList.contains('auto-image-warning'),
				hasWarningIcon: !!widget.element.querySelector('.codicon-warning-compact'),
				hoverText: imageHoverContents.map(content => content.textContent),
			}, {
				ariaLabel: 'Attached image, image.png. Image support depends on the model selected by Copilot Fusion. (Delete)',
				isWarning: false,
				isAutoWarning: true,
				hasWarningIcon: false,
				hoverText: [`${instantiationService.get(ILabelService).getUriLabel(URI.file('/test/image.png'))}Image support depends on the model selected by Copilot Fusion.`],
			});
		});

		test('should mark up an image of the input right away, also from its Mark Up button, and say so', () => {
			const imageHoverContents = captureImageHovers();
			const contextResourceLabels = disposables.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
			let markUps = 0;
			const widget = disposables.add(instantiationService.createInstance(
				ImageAttachmentWidget,
				undefined,
				{ kind: 'image', id: 'screenshot', name: 'Screenshot', value: new Uint8Array([0x89, 0x50, 0x4E, 0x47]), mimeType: 'image/png' },
				undefined,
				{ shouldFocusClearButton: false, supportsDeletion: true, isCurrentInput: true, markUp: async () => { markUps++; } },
				dom.$('div'),
				contextResourceLabels
			));
			widget.element.click();
			widget.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
			const markUpButton = widget.element.querySelector<HTMLElement>('.chat-attached-context-mark-up-button');
			markUpButton?.click();
			// A double click on the button does not also open the pill.
			markUpButton?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));

			assert.deepStrictEqual({
				markUps,
				ariaLabel: widget.element.ariaLabel,
				hoverText: imageHoverContents.map(content => content.textContent),
				markUpButton: { icon: markUpButton?.classList.contains('codicon-edit-compact'), tabIndex: markUpButton?.tabIndex },
			}, {
				markUps: 3,
				ariaLabel: 'Attached image, Screenshot. Press Enter to mark it up. (Delete)',
				hoverText: ['Click to mark up this image.'],
				markUpButton: { icon: true, tabIndex: -1 },
			});
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
