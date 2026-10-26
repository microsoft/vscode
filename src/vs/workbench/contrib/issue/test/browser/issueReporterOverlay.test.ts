/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy, stub } from 'sinon';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';
import { addDisposableListener } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITreeViewsDnDService } from '../../../../../editor/common/services/treeViewsDndService.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextViewDelegate, IContextViewService, IOpenContextView } from '../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { IUserInteractionService } from '../../../../../platform/userInteraction/browser/userInteractionService.js';
import { UserInteractionService } from '../../../../../platform/userInteraction/browser/userInteractionServiceImpl.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import product from '../../../../../platform/product/common/product.js';
import { DEFAULT_EDITOR_PART_OPTIONS, IEditorGroupsView, IEditorGroupView } from '../../../../browser/parts/editor/editor.js';
import { EditorDropTarget } from '../../../../browser/parts/editor/editorDropTarget.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { extractIssueData } from '../../browser/issueFormService.js';
import { IssueReporterEditorInput } from '../../browser/issueReporterEditorInput.js';
import { IIssueReporterAttachmentImport, IIssueReporterDiagnosticsState, IScreenshot, IssueReporterOverlay } from '../../browser/issueReporterOverlay.js';
import { RecordingState } from '../../browser/recordingService.js';
import { ScreenshotAnnotationEditor } from '../../browser/screenshotAnnotation.js';
import { IIssueReporterFileAttachment, IssueReporterAttachment, IssueReporterData, IssueSource, IssueType } from '../../common/issue.js';
import { internalIssueReporterUrl, resolveIssueReporterTarget } from '../../common/issueReporterTarget.js';
import { issueReporterGifFixture, issueReporterImageFixture } from '../common/issueReporterMediaFixtures.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

class TestContextViewService implements IContextViewService {
	declare readonly _serviceBrand: undefined;
	private readonly element = document.createElement('div');

	showContextView(delegate: IContextViewDelegate): IOpenContextView {
		const disposable = delegate.render(this.element);
		return { close: () => { disposable.dispose(); delegate.onHide?.(); } };
	}
	hideContextView(): void { }
	getContextViewElement(): HTMLElement { return this.element; }
	layout(): void { }
}

suite('IssueReporterOverlay', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const screenshot = { dataUrl: issueReporterImageFixture, width: 48, height: 32 };
	const attachment: IIssueReporterFileAttachment = { filePath: '/owned/bundle.zip', name: 'bundle.zip', mimeType: 'application/zip' };

	function capturedScreenshot(id: string, image: IScreenshot = screenshot): IssueReporterAttachment<IScreenshot> {
		return { id, kind: 'screenshot', screenshot: image };
	}

	function attachedFile(id: string, file = attachment): IssueReporterAttachment<IScreenshot> {
		return { id, kind: 'file', file };
	}

	function createReporter(overrides: Partial<IssueReporterData> = {}, options: {
		resolveExtensionIssueData?: (extensionId: string) => Promise<IssueReporterData | undefined>;
		captureContainer?: HTMLElement;
	} = {}) {
		const instantiation = workbenchInstantiationService(undefined, store);
		instantiation.stub(IConfigurationService, new TestConfigurationService({ 'editor.fontFamily': 'monospace', 'editor.fontSize': 28 }));
		instantiation.stub(IClipboardService, { writeText: async () => { } });
		instantiation.stub(IUserInteractionService, new UserInteractionService());
		const hovers = new Map<HTMLElement, string>();
		instantiation.stub(IHoverService, {
			...NullHoverService,
			setupDelayedHover: (target, options) => {
				const { content } = typeof options === 'function' ? options() : options;
				if (typeof content === 'string') {
					hovers.set(target, content);
				}
				return toDisposable(() => hovers.delete(target));
			},
		});
		const opened: string[] = [];
		instantiation.stub(IOpenerService, { open: async resource => { opened.push(resource.toString()); return true; } });
		const markdownRenderer = instantiation.createInstance(MarkdownRendererService);
		markdownRenderer.setDefaultCodeBlockRenderer({
			renderCodeBlock: async (_language, value) => {
				const pre = document.createElement('pre');
				const code = document.createElement('code');
				code.textContent = value;
				pre.appendChild(code);
				return pre;
			},
		});
		instantiation.stub(IMarkdownRendererService, markdownRenderer);
		const data: IssueReporterData = {
			styles: {}, zoomLevel: 0, enabledExtensions: [], restrictedMode: false,
			isInstallationPure: true, isSessionsWindow: false, githubAccessToken: '',
			issueSource: IssueSource.VSCode, issueType: IssueType.Bug,
			issueTitle: 'Repository selection', issueBody: 'Issue description',
			...overrides,
		};
		const input = store.add(instantiation.createInstance(IssueReporterEditorInput, data));
		const editor = input.descriptionInput;
		const container = document.createElement('div');
		container.style.width = '800px';
		container.style.height = '900px';
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		let menu: IContextMenuDelegate | undefined;
		const overlay = store.add(instantiation.createInstance(IssueReporterOverlay,
			data, input, false, container, new TestContextViewService(),
			{ showContextMenu: delegate => { menu = delegate; } }, true, options.resolveExtensionIssueData, undefined, false, undefined, undefined,
			undefined,
			options.captureContainer,
		));
		const imports: IIssueReporterAttachmentImport[] = [];
		store.add(overlay.onDidRequestAddAttachments(requests => imports.push(...requests)));
		const completeImport = (attachment?: IIssueReporterFileAttachment, error?: string) => {
			const request = imports.shift();
			assert.ok(request);
			return overlay.completeAttachmentImport(request.id, attachment, error);
		};
		overlay.show();
		const preview = container.querySelector<HTMLElement>('.wizard-preview')!;
		const description = container.querySelector<HTMLElement>('.wizard-description-editor')!;
		const setSelection = (anchor: number, active: number) => editor.setSelectionRange(anchor, active);
		const setText = (text: string) => {
			editor.value = text;
			editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
		};
		const writeTab = container.querySelector<HTMLElement>('.wizard-description-tabs [role=tab]')!;
		const previewTab = container.querySelectorAll<HTMLElement>('.wizard-description-tabs [role=tab]')[1];
		const descriptionPreview = container.querySelector<HTMLElement>('.wizard-description-preview')!;
		const files = container.querySelector<HTMLElement>('.wizard-screenshots')!;
		const feedback = container.querySelector<HTMLElement>('.wizard-attachment-status')!;
		const selectRepository = async (repository: string) => {
			container.querySelector<HTMLElement>('.issue-reporter-repository-picker')!.click();
			const action = menu?.getActions().find(action => action.label === repository);
			assert.ok(action);
			menu?.onHide?.(false);
			await action.run();
		};
		return { overlay, editor, container, data, preview, writeTab, previewTab, descriptionPreview, description, files, feedback, opened, instantiation, hovers, imports, completeImport, setSelection, setText, selectRepository, getMenu: () => menu };
	}

	function insertNativeText(editor: HTMLTextAreaElement, text: string): void {
		editor.focus();
		assert.strictEqual(editor.ownerDocument.execCommand('insertText', false, text), true);
	}

	function undoNativeText(editor: HTMLTextAreaElement): void {
		editor.focus();
		assert.strictEqual(editor.ownerDocument.execCommand('undo'), true);
	}

	function paste(target: HTMLElement, files: readonly File[], text?: string): ClipboardEvent {
		const transfer = new DataTransfer();
		files.forEach(file => transfer.items.add(file));
		if (text) {
			transfer.setData('text/plain', text);
		}
		const event = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true });
		target.dispatchEvent(event);
		// Synthetic clipboard events do not perform the browser's default insertion.
		if (!event.defaultPrevented && text && target instanceof HTMLTextAreaElement) {
			insertNativeText(target, text);
		}
		return event;
	}

	function drop(target: HTMLElement, files: readonly File[], text?: string): DragEvent {
		const transfer = new DataTransfer();
		files.forEach(file => transfer.items.add(file));
		if (text) {
			transfer.setData('text/plain', text);
		}
		const event = new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true });
		target.dispatchEvent(event);
		if (!event.defaultPrevented && text && target instanceof HTMLTextAreaElement) {
			insertNativeText(target, text);
		}
		return event;
	}

	function images(count: number): File[] {
		return Array.from({ length: count }, (_, index) => new File(['image'], `image-${index}.png`, { type: 'image/png' }));
	}

	function getRepository(data: IssueReporterData): string {
		const repository = resolveIssueReporterTarget(data, product)!.repository!;
		return `${repository.owner}/${repository.repositoryName}`;
	}

	function attachmentNames(files: HTMLElement): string[] {
		return [...files.querySelectorAll('.wizard-screenshot-card:not(.wizard-screenshot-add)')].map(card => card.querySelector('.wizard-file-name')?.textContent ?? card.querySelector('img')!.alt);
	}

	function diagnosticControls(container: HTMLElement, option: keyof IIssueReporterDiagnosticsState['included']) {
		const group = container.querySelector<HTMLElement>(`[data-diagnostic-option="${option}"]`)!;
		return {
			group,
			checkbox: group.querySelector<HTMLElement>('.review-diag-checkbox')!,
			toggle: group.querySelector<HTMLElement>('.review-diag-toggle-area')!,
			content: group.querySelector<HTMLElement>('.review-diag-content')!,
		};
	}

	test('shows one form with Write and Preview tabs and no wizard navigation', () => {
		const { container, editor, files, preview } = createReporter();
		assert.deepStrictEqual({
			editor: { tag: editor.tagName, label: editor.getAttribute('aria-label') },
			tabs: [...container.querySelectorAll('[role=tab]')].map(tab => ({ label: tab.textContent, selected: tab.getAttribute('aria-selected') })),
			forms: container.querySelectorAll('.issue-reporter-form').length,
			descriptions: container.querySelectorAll('.wizard-description-editor').length,
			oldSteps: container.querySelectorAll('.wizard-step, .wizard-next, .wizard-back, .review-description, .review-thumbnails, .wizard-similar-issues').length,
			disclosures: [...container.querySelectorAll<HTMLDetailsElement>('details:not([hidden])')].map(details => details.open),
			attachments: { role: files.getAttribute('role'), tabIndex: files.tabIndex },
			action: preview.textContent,
			titleLabel: container.querySelector('.wizard-title-field input')?.getAttribute('aria-label'),
			duplicateHint: container.textContent?.includes('Markdown is supported. You can also paste or drop files here'),
			githubAcceptanceHint: container.textContent?.includes('GitHub decides which files it accepts.'),
		}, { editor: { tag: 'TEXTAREA', label: 'Description, Markdown. Paste or drop files to attach them.' }, tabs: [{ label: 'Write', selected: 'true' }, { label: 'Preview', selected: 'false' }], forms: 1, descriptions: 1, oldSteps: 0, disclosures: [], attachments: { role: 'group', tabIndex: 0 }, action: 'Preview on GitHub', titleLabel: 'Title', duplicateHint: false, githubAcceptanceHint: false });
	});

	test('keeps the capture bar in the source document when the report view moves', () => {
		const { overlay, container } = createReporter({}, { captureContainer: document.body });
		const bar = document.querySelector('.issue-reporter-floating-bar')!;
		const frame = document.createElement('iframe');
		document.body.appendChild(frame);
		store.add(toDisposable(() => frame.remove()));
		frame.contentDocument!.body.appendChild(container);
		overlay.reparentFloatingBar();
		const stayedWithSource = bar.ownerDocument === document && document.body.contains(bar);
		document.body.appendChild(container);
		assert.strictEqual(stayedWithSource, true);
	});

	test('validates title and description before emitting a submission', () => {
		const { overlay, container, setText, editor, preview } = createReporter({ issueTitle: '', issueBody: '' });
		const submitted: string[] = [];
		store.add(overlay.onDidSubmit(event => submitted.push(event.title)));
		preview.click();
		const initialErrors = container.querySelectorAll('.wizard-field-error:not(.hidden)').length;
		overlay.setGeneratedTitle('A title');
		preview.click();
		const focusedDescription = document.activeElement === editor;
		setText('A description');
		preview.click();
		assert.deepStrictEqual({ initialErrors, focusedDescription, submitted }, { initialErrors: 2, focusedDescription: true, submitted: ['A title'] });
	});

	test('keeps the selected report dirty if it changes while its preview is opening', () => {
		const { overlay, preview, setText } = createReporter();
		preview.click();
		setText('Edited while uploading');
		overlay.markPreviewOpened();
		overlay.showCloseButton();
		assert.deepStrictEqual({ dirty: overlay.hasUnsavedChanges(), closeVisible: overlay.getPanel().querySelector<HTMLElement>('.wizard-close-btn')?.style.display }, { dirty: true, closeVisible: 'none' });
	});

	for (const prefilled of [false, true]) {
		test(`protects only edited text or attachments in a ${prefilled ? 'prefilled' : 'blank'} report`, () => {
			const title = prefilled ? 'Initial title' : '';
			const description = prefilled ? 'Initial description' : '';
			const { overlay, container, setText, files, completeImport } = createReporter({ issueTitle: title, issueBody: description });
			const dirty = [overlay.hasUnsavedChanges()];
			overlay.updateModel({ versionInfo: { vscodeVersion: 'Loaded version', os: 'Loaded OS' } });
			diagnosticControls(container, 'includeSystemInfo').checkbox.click();
			dirty.push(overlay.hasUnsavedChanges());
			overlay.setGeneratedTitle(`${title} edited`);
			dirty.push(overlay.hasUnsavedChanges());
			overlay.setGeneratedTitle(title);
			dirty.push(overlay.hasUnsavedChanges());
			setText(`${description} edited`);
			dirty.push(overlay.hasUnsavedChanges());
			setText(description);
			dirty.push(overlay.hasUnsavedChanges());
			paste(files, [new File(['file'], 'bundle.zip', { type: 'application/zip' })]);
			dirty.push(overlay.hasUnsavedChanges());
			completeImport(attachment);
			dirty.push(overlay.hasUnsavedChanges());
			files.querySelector<HTMLElement>('.wizard-screenshot-delete')!.click();
			dirty.push(overlay.hasUnsavedChanges());
			assert.deepStrictEqual(dirty, [false, false, true, false, true, false, true, true, false]);
		});
	}

	test('does not mark an untouched prefill dirty solely because preview is preparing', () => {
		const { overlay } = createReporter();
		overlay.setUploading(true);
		assert.deepStrictEqual({ pending: overlay.hasPendingOperations(), dirty: overlay.hasUnsavedChanges() }, { pending: true, dirty: false });
	});

	test('preserves native selection, ordinary paste and undo', () => {
		const { editor, setSelection } = createReporter({ issueBody: 'before selected after' });
		setSelection(7, 15);
		paste(editor, [], '**replacement**');
		const pasted = editor.value;
		undoNativeText(editor);
		assert.deepStrictEqual({ pasted, undone: editor.value }, { pasted: 'before **replacement** after', undone: 'before selected after' });
	});

	test('uses a native text box without allocating a code editor or model', () => {
		const { editor, container, instantiation } = createReporter({ issueBody: '' });
		insertNativeText(editor, '- b');
		assert.deepStrictEqual({
			text: editor.value,
			codeEditors: instantiation.get(ICodeEditorService).listCodeEditors().length,
			models: instantiation.get(IModelService).getModels().length,
			monaco: container.querySelectorAll('.monaco-editor, .suggest-widget').length,
		}, {
			text: '- b', codeEditors: 0, models: 0, monaco: 0,
		});
	});

	test('matches Preview typography with comfortable native text insets', () => {
		const { editor, container, previewTab, descriptionPreview } = createReporter();
		container.style.setProperty('--vscode-fontSize-body1', '13px');
		container.style.setProperty('--vscode-spacing-size160', '16px');
		const inputStyle = mainWindow.getComputedStyle(editor);
		const write = { family: inputStyle.fontFamily, size: inputStyle.fontSize, lineHeight: inputStyle.lineHeight, padding: inputStyle.padding };
		previewTab.click();
		const previewStyle = mainWindow.getComputedStyle(descriptionPreview.querySelector('p')!);
		const preview = { family: previewStyle.fontFamily, size: previewStyle.fontSize, lineHeight: previewStyle.lineHeight };
		assert.deepStrictEqual({
			write: { family: write.family, size: write.size, lineHeight: write.lineHeight },
			padding: write.padding,
			previewPadding: mainWindow.getComputedStyle(descriptionPreview).padding,
			proportional: !write.family.includes('monospace'),
		}, { write: preview, padding: '16px', previewPadding: '16px', proportional: true });
	});

	for (const [theme, markerColor] of [
		['dark', 'rgb(231, 231, 231)'],
		['light', 'rgb(51, 51, 51)'],
		['hc-dark', 'rgb(111, 195, 223)'],
		['hc-light', 'rgb(181, 32, 13)'],
	]) {
		test(`keeps the selected description mode visible without focus (${theme})`, () => {
			const { container, editor, writeTab, previewTab, descriptionPreview } = createReporter();
			container.style.setProperty('--vscode-panelTitle-activeBorder', markerColor);
			container.style.setProperty('--vscode-fontWeight-semiBold', '600');
			container.style.setProperty('--vscode-strokeThickness', '1px');
			const selection = () => [writeTab, previewTab].map(tab => {
				const marker = mainWindow.getComputedStyle(tab, '::after');
				return {
					selected: tab.getAttribute('aria-selected'),
					emphasized: mainWindow.getComputedStyle(tab).fontWeight === '600',
					marked: marker.content === '""' && marker.backgroundColor === markerColor && marker.height === '1px',
					focused: mainWindow.document.activeElement === tab,
				};
			});
			editor.focus();
			const write = selection();
			writeTab.focus();
			writeTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true, cancelable: true }));
			descriptionPreview.focus();
			const preview = selection();
			writeTab.click();
			editor.focus();
			assert.deepStrictEqual({
				buttonInlineStyles: [writeTab, previewTab].every(tab => !!tab.style.color && !!tab.style.border),
				write, preview, restored: selection(),
			}, {
				buttonInlineStyles: true,
				write: [
					{ selected: 'true', emphasized: true, marked: true, focused: false },
					{ selected: 'false', emphasized: false, marked: false, focused: false },
				],
				preview: [
					{ selected: 'false', emphasized: false, marked: false, focused: false },
					{ selected: 'true', emphasized: true, marked: true, focused: false },
				],
				restored: [
					{ selected: 'true', emphasized: true, marked: true, focused: false },
					{ selected: 'false', emphasized: false, marked: false, focused: false },
				],
			});
		});
	}

	test('previews rendered Markdown without submitting and preserves edits and undo across toggles', async () => {
		const markdown = '# Heading\n\nA **bold** description with [a link](https://example.com).\n\n- first\n- second\n\n```ts\nconst answer = 42;\n```';
		const { overlay, editor, setSelection, preview, previewTab, writeTab, description, descriptionPreview, data } = createReporter({ issueBody: markdown });
		const submissions: string[] = [];
		store.add(overlay.onDidSubmit(event => submissions.push(event.body)));
		previewTab.click();
		await timeout(0);
		const rendered = {
			heading: descriptionPreview.querySelector('h1')?.textContent,
			bold: descriptionPreview.querySelector('strong')?.textContent,
			list: descriptionPreview.querySelectorAll('li').length,
			code: descriptionPreview.querySelector('pre code')?.textContent,
			writeHidden: description.hidden,
			previewHidden: descriptionPreview.hidden,
			submissions: submissions.length,
		};
		writeTab.click();
		const start = markdown.indexOf('bold');
		setSelection(start, start + 4);
		paste(editor, [], 'edited');
		const selection = [editor.selectionStart, editor.selectionEnd];
		previewTab.click();
		const updated = descriptionPreview.querySelector('strong')?.textContent;
		writeTab.click();
		const restoredSelection = [editor.selectionStart, editor.selectionEnd];
		preview.click();
		const edited = markdown.replace('**bold**', '**edited**');
		undoNativeText(editor);
		assert.deepStrictEqual({
			rendered, updated, selection, restoredSelection,
			undone: editor.value, draft: data.issueBody, submitted: submissions.length === 1 && submissions[0].includes(edited),
		}, {
			rendered: { heading: 'Heading', bold: 'bold', list: 2, code: 'const answer = 42;', writeHidden: true, previewHidden: false, submissions: 0 },
			updated: 'edited', selection: [start + 6, start + 6], restoredSelection: [start + 6, start + 6],
			undone: markdown, draft: markdown,
			submitted: true,
		});
	});

	test('keeps pasted HTML inert when rendering the preview', async () => {
		const { editor, setSelection, previewTab, descriptionPreview } = createReporter({ issueBody: '' });
		setSelection(0, 0);
		const transfer = new DataTransfer();
		transfer.setData('text/html', '<strong>Formatted</strong><img src=x onerror=alert(1)><script>alert(1)</script>');
		const source = '**Formatted** &amp; safe\n\n<iframe src="https://example.com"></iframe>\n<script>alert(1)</script>';
		transfer.setData('text/plain', source);
		editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
		insertNativeText(editor, source);
		previewTab.click();
		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
		assert.deepStrictEqual({ value: editor.value, activeContent: descriptionPreview.querySelector('script, iframe, [onerror], [onclick]') }, { value: source, activeContent: null });
	});

	test('does not activate command or data links from untrusted Markdown', async () => {
		const { previewTab, descriptionPreview, opened } = createReporter({ issueBody: '[command](command:workbench.action.files.openFolder)\n\n[data](data:text/html,test)\n\n[web](https://example.com)' });
		previewTab.click();
		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
		descriptionPreview.querySelectorAll('a').forEach(link => link.click());
		assert.deepStrictEqual(opened, ['https://example.com']);
	});

	test('leaves Tab and Shift+Tab to form navigation', () => {
		const { editor } = createReporter();
		editor.focus();
		const prevented = [false, true].map(shiftKey => {
			const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
			editor.dispatchEvent(event);
			return event.defaultPrevented;
		});
		assert.deepStrictEqual(prevented, [false, false]);
	});

	test('supports keyboard tabs and returns to Write when an empty preview is submitted', () => {
		const { writeTab, previewTab, descriptionPreview, description, preview, editor } = createReporter({ issueBody: '' });
		writeTab.focus();
		writeTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true, cancelable: true }));
		const selectedPreview = { selected: previewTab.getAttribute('aria-selected'), focused: document.activeElement === previewTab, empty: descriptionPreview.textContent };
		preview.click();
		assert.deepStrictEqual({ selectedPreview, writeSelected: writeTab.getAttribute('aria-selected'), writeVisible: !description.hidden, focused: document.activeElement === editor }, {
			selectedPreview: { selected: 'true', focused: true, empty: 'Nothing to preview.' }, writeSelected: 'true', writeVisible: true, focused: true,
		});
	});

	suite('File imports', () => {
		test('claims drag-enter before the workbench editor overlay takes the target', () => {
			const { container, files } = createReporter();
			const instantiation = store.add(new TestInstantiationService());
			const groupsView = new class extends mock<IEditorGroupsView>() {
				override readonly partOptions = { ...DEFAULT_EDITOR_PART_OPTIONS, allowDropIntoGroup: true };
			}();
			const groupView = new class extends mock<IEditorGroupView>() {
				override readonly element = container;
				override readonly isEmpty = true;
				override readonly groupsView = groupsView;
			}();
			instantiation.stub(IThemeService, new TestThemeService());
			instantiation.stub(IConfigurationService, new TestConfigurationService({ 'editor.dropIntoEditor.enabled': false }));
			instantiation.stub(IEditorGroupsService, { groups: [groupView] });
			instantiation.stub(IEditorService, {});
			instantiation.stub(ITreeViewsDnDService, {});
			instantiation.stub(IWorkspaceContextService, {});
			store.add(instantiation.createInstance(EditorDropTarget, groupsView, container, { supportsSplitting: false }));
			const transfer = new DataTransfer();
			transfer.items.add(images(1)[0]);
			const event = new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true, cancelable: true });
			files.dispatchEvent(event);
			assert.deepStrictEqual({ claimed: event.defaultPrevented, workbenchOverlay: !!container.querySelector('#monaco-workbench-editor-drop-overlay') }, { claimed: true, workbenchOverlay: false });
			files.dispatchEvent(new DragEvent('dragend', { dataTransfer: transfer, bubbles: true }));
		});

		for (const target of ['description', 'attachments', 'form'] as const) {
			test(`accepts ZIP drops in the ${target} without browser navigation`, () => {
				const { overlay, description, files, completeImport } = createReporter();
				const requests: string[] = [];
				store.add(overlay.onDidRequestAddAttachments(files => requests.push(...files.map(request => request.file.name))));
				const event = drop(target === 'description' ? description : target === 'attachments' ? files : overlay.getPanel(), [new File(['zip'], 'report.zip', { type: 'application/zip' })]);
				completeImport(attachment);
				assert.deepStrictEqual({ prevented: event.defaultPrevented, requests, accepted: overlay.getFileAttachments() }, { prevented: true, requests: ['report.zip'], accepted: [attachment] });
			});
		}

		test('claims file-only paste and leaves plain text for the editor', () => {
			const { editor, overlay, setSelection } = createReporter({ issueBody: '' });
			const requests: number[] = [];
			store.add(overlay.onDidRequestAddAttachments(files => requests.push(files.length)));
			setSelection(0, 0);
			const file = paste(editor, images(1));
			const text = paste(editor, [], 'Plain text');
			assert.deepStrictEqual({ file: file.defaultPrevented, text: text.defaultPrevented, requests, value: editor.value }, { file: true, text: false, requests: [1], value: 'Plain text' });
		});

		test('processes mixed description paste once without preventing editor text insertion', () => {
			const { overlay, editor, setSelection } = createReporter({ issueBody: 'before selected after' });
			const requests: number[] = [];
			store.add(overlay.onDidRequestAddAttachments(files => requests.push(files.length)));
			setSelection(7, 15);
			const event = paste(editor, images(1), 'replacement');
			assert.deepStrictEqual({ requests, text: editor.value, claimedByEditor: event.defaultPrevented }, { requests: [1], text: 'before replacement after', claimedByEditor: false });
		});

		test('leaves mixed description drop text and undo to the native control', () => {
			const { overlay, editor, setSelection } = createReporter({ issueBody: 'before selected after' });
			const requests: number[] = [];
			store.add(overlay.onDidRequestAddAttachments(files => requests.push(files.length)));
			setSelection(7, 15);
			const event = drop(editor, images(1), 'replacement');
			const dropped = editor.value;
			undoNativeText(editor);
			assert.deepStrictEqual({ requests, dropped, prevented: event.defaultPrevented, undone: editor.value }, {
				requests: [1], dropped: 'before replacement after', prevented: false, undone: 'before selected after',
			});
		});

		for (const action of ['paste', 'drop'] as const) {
			test(`inserts mixed ${action} text at the selection with undo and quiet completion`, async () => {
				const { files, editor, setSelection, feedback, completeImport } = createReporter({ issueBody: 'before selected after' });
				setSelection(7, 15);
				const event = action === 'paste' ? paste(files, images(2), 'replacement') : drop(files, images(2), 'replacement');
				const pending = feedback.textContent;
				completeImport(attachment);
				completeImport({ ...attachment, filePath: '/owned/second.zip' });
				const pasted = editor.value;
				undoNativeText(editor);
				assert.deepStrictEqual({
					prevented: event.defaultPrevented, pending, pasted, undone: editor.value,
					feedback: feedback.textContent, hidden: feedback.hidden, cards: files.querySelectorAll('.wizard-file-card').length,
				}, { prevented: true, pending: 'Importing 2 file(s)...', pasted: 'before replacement after', undone: 'before selected after', feedback: '', hidden: true, cards: 2 });
			});
		}

		test('leaves mixed paste and text drop in the title alone', () => {
			const { container, overlay } = createReporter();
			const title = container.querySelector<HTMLInputElement>('.wizard-title-field input')!;
			let requests = 0;
			store.add(overlay.onDidRequestAddAttachments(() => requests++));
			const pasted = paste(title, images(1), 'Title text');
			const dropped = drop(title, images(1), 'Dropped title');
			assert.deepStrictEqual({ requests, paste: pasted.defaultPrevented, drop: dropped.defaultPrevented }, { requests: 0, paste: false, drop: false });
		});

		test('reserves five slots and clears capacity feedback immediately after removal', () => {
			const { overlay, files, preview, feedback, completeImport } = createReporter();
			const requested: number[] = [];
			store.add(overlay.onDidRequestAddAttachments(files => requested.push(files.length)));
			paste(files, images(4));
			paste(files, images(3));
			const pendingDisabled = preview.getAttribute('aria-disabled');
			for (let index = 0; index < 5; index++) {
				completeImport({ ...attachment, filePath: `/owned/${index}.zip` });
			}
			for (let index = 0; index < 3; index++) {
				paste(files, images(1));
			}
			const fullMessages = feedback.textContent?.match(/Attachment limit reached/g)?.length;
			files.querySelector<HTMLElement>('.wizard-screenshot-delete')!.click();
			assert.deepStrictEqual({
				requested, pendingDisabled, fullMessages, count: overlay.getFileAttachments().length,
				feedback: feedback.textContent, hidden: feedback.hidden, previewDisabled: preview.getAttribute('aria-disabled'),
			}, { requested: [4, 1], pendingDisabled: 'true', fullMessages: 1, count: 4, feedback: '', hidden: true, previewDisabled: 'false' });
		});

		for (const outcome of ['success', 'failure', 'cancellation'] as const) {
			test(`recovers the preview action after import ${outcome}`, () => {
				const { files, preview, feedback, completeImport } = createReporter();
				paste(files, images(1));
				const pending = preview.getAttribute('aria-disabled');
				completeImport(outcome === 'success' ? attachment : undefined, outcome === 'failure' ? 'File could not be read' : undefined);
				assert.deepStrictEqual({ pending, ready: preview.getAttribute('aria-disabled'), feedback: feedback.textContent }, { pending: 'true', ready: 'false', feedback: outcome === 'failure' ? 'File could not be read' : '' });
			});
		}

		test('keeps performance and upload gates after imports complete', () => {
			const { overlay, files, preview, completeImport } = createReporter({ issueType: IssueType.PerformanceIssue });
			const states: (string | null)[] = [];
			paste(files, images(1));
			completeImport(attachment);
			states.push(preview.getAttribute('aria-disabled'));
			overlay.markPerformanceInfoLoaded();
			states.push(preview.getAttribute('aria-disabled'));
			overlay.setUploading(true);
			states.push(preview.getAttribute('aria-disabled'));
			overlay.setUploading(false);
			states.push(preview.getAttribute('aria-disabled'));
			assert.deepStrictEqual(states, ['true', 'false', 'true', 'false']);
		});

		test('counts pending screenshots and recording reservations without exceeding five files', () => {
			const { overlay, files, completeImport } = createReporter();
			overlay.restoreAttachments([capturedScreenshot('first'), capturedScreenshot('second')]);
			overlay.setRecordingState(RecordingState.Recording);
			overlay.triggerCaptureScreenshot();
			const requested: number[] = [];
			store.add(overlay.onDidRequestAddAttachments(files => requested.push(files.length)));
			paste(files, images(2));
			completeImport(attachment);
			overlay.addScreenshot(screenshot);
			overlay.completeScreenshotCapture();
			overlay.addRecording({ filePath: '/owned/recording.mp4', name: 'recording.mp4', mimeType: 'video/mp4', durationMs: 500 });
			overlay.setRecordingState(RecordingState.Idle);
			assert.deepStrictEqual({ requested, screenshots: overlay.getScreenshots().length, files: overlay.getFileAttachments().length }, { requested: [1], screenshots: 3, files: 2 });
		});

		test('accepts unknown and empty files without an acceptance allowlist', () => {
			const { overlay, files } = createReporter();
			const requested: string[] = [];
			store.add(overlay.onDidRequestAddAttachments(files => requested.push(...files.map(request => request.file.name))));
			paste(files, [new File(['text'], 'notes.custom'), new File([], 'empty.png', { type: 'image/png' })]);
			assert.deepStrictEqual(requested, ['notes.custom', 'empty.png']);
		});

		test('opens and removes file cards with the keyboard and restores focus', () => {
			const { overlay, files } = createReporter();
			const opened: string[] = [];
			store.add(overlay.onDidRequestOpenFile(path => opened.push(path)));
			overlay.restoreAttachments([attachedFile('file')]);
			files.querySelector<HTMLElement>('.wizard-file-card')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
			files.querySelector<HTMLElement>('.wizard-screenshot-delete')!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
			assert.deepStrictEqual({ opened, attachments: overlay.getFileAttachments(), focus: document.activeElement === files }, { opened: ['/owned/bundle.zip'], attachments: [], focus: true });
		});

		test('shows a filename and fallback for video without inventing a duration', () => {
			const { overlay, files } = createReporter();
			overlay.restoreAttachments([attachedFile('file', { filePath: '/owned/clip.mov', name: 'Original clip.mov', mimeType: 'video/quicktime' })]);
			assert.deepStrictEqual({
				name: files.querySelector('.wizard-file-name')?.textContent,
				fallback: files.querySelector('.wizard-file-fallback')?.textContent,
				duration: files.querySelector('.wizard-recording-duration'),
			}, { name: 'Original clip.mov', fallback: '', duration: null });
		});

		test('keeps an attachment when its optional image preview fails', () => {
			const { overlay, files } = createReporter();
			const image = { ...attachment, name: 'broken.png', mimeType: 'image/png', thumbnailDataUrl: 'data:image/png;base64,AA==' };
			overlay.restoreAttachments([attachedFile('file', image)]);
			files.querySelector('img')!.dispatchEvent(new Event('error'));
			assert.deepStrictEqual({ files: overlay.getFileAttachments(), fallback: files.querySelector<HTMLElement>('.wizard-file-fallback')?.hidden, message: files.querySelector('.wizard-file-fallback')?.textContent, image: files.querySelector('img') }, { files: [image], fallback: false, message: 'Preview unavailable', image: null });
		});

		test('matches upload progress identities across screenshots and files and blocks removal', () => {
			const { overlay, files, data } = createReporter();
			overlay.restoreAttachments([capturedScreenshot('capture'), attachedFile('file')]);
			const destination = resolveIssueReporterTarget(data, product)!.url;
			overlay.setUploading(true);
			overlay.setAttachmentUploadState(overlay.getAttachments()[0], { destination, state: 'done' });
			overlay.setAttachmentUploadState(overlay.getAttachments()[1], { destination, state: 'uploading' });
			files.querySelector<HTMLElement>('.wizard-file-card .wizard-screenshot-delete')!.click();
			assert.deepStrictEqual({
				states: [...files.querySelectorAll('.wizard-screenshot-card:not(.wizard-screenshot-add)')].map(card => [...card.classList].find(name => name.startsWith('upload-'))),
				remaining: overlay.getFileAttachments().length,
			}, { states: ['upload-done', 'upload-uploading'], remaining: 1 });
		});

		test('keeps pasted A and B before screenshot C captured from the bar', () => {
			const { overlay, files, completeImport } = createReporter();
			paste(files, ['A.png', 'B.png'].map(name => new File(['image'], name, { type: 'image/png' })));
			for (const name of ['A.png', 'B.png']) {
				completeImport({ filePath: `/owned/${name}`, name, mimeType: 'image/png' });
			}
			store.add(overlay.onDidRequestScreenshot(id => {
				overlay.addScreenshot(screenshot, id);
				overlay.completeScreenshotCapture(id);
			}));
			overlay.triggerCaptureScreenshot();
			assert.deepStrictEqual({
				cards: attachmentNames(files),
				submission: overlay.getAttachments().map(item => item.kind === 'file' ? item.file.name : 'C'),
			}, { cards: ['A.png', 'B.png', 'screenshot-1.png'], submission: ['A.png', 'B.png', 'C'] });
		});

		test('keeps request order through mixed pending work, cancellation, removal and restoration', () => {
			const { overlay, files, imports } = createReporter();
			let captureId = '';
			store.add(overlay.onDidRequestScreenshot(id => { captureId = id; }));
			paste(files, [new File(['a'], 'A.png', { type: 'image/png' })]);
			overlay.triggerCaptureScreenshot();
			paste(files, [new File(['b'], 'B.zip')]);
			overlay.reserveRecordingSlot();
			paste(files, [new File(['cancel'], 'cancel.txt'), new File(['overflow'], 'overflow.txt')]);
			const reservedImports = imports.map(request => request.file.name);
			overlay.completeAttachmentImport(imports[2].id);
			overlay.completeAttachmentImport(imports[1].id, { ...attachment, name: 'B.zip' });
			overlay.addRecording({ filePath: '/owned/recording.mp4', name: 'recording.mp4', mimeType: 'video/mp4' });
			overlay.addScreenshot(screenshot, captureId);
			overlay.completeScreenshotCapture(captureId);
			overlay.completeAttachmentImport(imports[0].id, { filePath: '/owned/A.png', name: 'A.png', mimeType: 'image/png' });
			const completed = attachmentNames(files);
			files.querySelectorAll<HTMLElement>('.wizard-screenshot-delete')[2].click();
			const saved = overlay.getAttachments();
			const restored = createReporter();
			restored.overlay.restoreAttachments(saved);
			assert.deepStrictEqual({
				reservedImports, completed, remaining: attachmentNames(files), restored: attachmentNames(restored.files),
				identities: restored.overlay.getAttachments().map(item => item.id),
				lateCompletion: overlay.completeAttachmentImport(imports[2].id, attachment),
			}, {
				reservedImports: ['A.png', 'B.zip', 'cancel.txt'], completed: ['A.png', 'screenshot-1.png', 'B.zip', 'recording.mp4'],
				remaining: ['A.png', 'screenshot-1.png', 'recording.mp4'], restored: ['A.png', 'screenshot-1.png', 'recording.mp4'],
				identities: saved.map(item => item.id), lateCompletion: false,
			});
		});

		test('reserves a delayed screenshot before files added during its countdown', () => runWithFakedTimers({}, async () => {
			const { overlay, files, completeImport, getMenu } = createReporter();
			mainWindow.document.querySelector<HTMLElement>('.wizard-segmented-dropdown')!.click();
			await getMenu()!.getActions().find(action => action.id === 'delay-3')!.run();
			getMenu()!.onHide?.(false);
			store.add(overlay.onDidRequestScreenshot(id => {
				overlay.addScreenshot(screenshot, id);
				overlay.completeScreenshotCapture(id);
			}));
			overlay.triggerCaptureScreenshot();
			paste(files, images(1));
			completeImport(attachment);
			await timeout(3100);
			assert.deepStrictEqual(attachmentNames(files), ['screenshot-1.png', 'bundle.zip']);
		}));

		test('retains visible uploaded badges after completion, rerender, removal and restore', () => {
			const { overlay, files, data } = createReporter();
			const ready = [attachedFile('A', { ...attachment, name: 'A.zip' }), attachedFile('B', { ...attachment, name: 'B.zip' }), capturedScreenshot('C')];
			overlay.restoreAttachments(ready);
			const destination = resolveIssueReporterTarget(data, product)!.url;
			overlay.setUploading(true);
			overlay.setAttachmentUploadState(ready[0], { destination, state: 'done' });
			overlay.setAttachmentUploadState(ready[1], { destination, state: 'pending' });
			overlay.setAttachmentUploadState(ready[2], { destination, state: 'done' });
			overlay.setUploading(false);
			const visibleChecks = (parent: HTMLElement) => [...parent.querySelectorAll<HTMLElement>('.upload-done .review-progress-overlay')].filter(element => mainWindow.getComputedStyle(element).display === 'flex').length;
			const completed = visibleChecks(files);
			overlay.setRecordingState(RecordingState.Idle);
			const rerendered = visibleChecks(files);
			files.querySelector<HTMLElement>('.wizard-screenshot-delete')!.click();
			const saved = overlay.getAttachments();
			const restored = createReporter();
			restored.overlay.restoreAttachments(saved);
			assert.deepStrictEqual({
				completed, rerendered, afterRemoval: visibleChecks(files), restored: visibleChecks(restored.files),
				cards: attachmentNames(restored.files),
				badges: [...restored.files.querySelectorAll('.wizard-screenshot-card:not(.wizard-screenshot-add)')].map(card => card.classList.contains('upload-done')),
				label: restored.files.querySelector('.upload-done .review-progress-overlay')?.getAttribute('aria-label'),
			}, { completed: 2, rerendered: 2, afterRemoval: 1, restored: 1, cards: ['B.zip', 'screenshot-1.png'], badges: [false, true], label: 'Uploaded' });
		});

		test('clears uploaded badges on destination changes and ignores late upload feedback', async () => {
			const { overlay, files, data, selectRepository } = createReporter({ additionalRepositories: ['owner/other'] });
			const ready = attachedFile('file');
			overlay.restoreAttachments([ready]);
			const destination = resolveIssueReporterTarget(data, product)!.url;
			const repository = getRepository(data);
			overlay.setAttachmentUploadState(ready, { destination, state: 'done' });
			const before = files.querySelectorAll('.upload-done').length;
			await selectRepository('owner/other');
			overlay.setAttachmentUploadState(ready, { destination, state: 'done' });
			const other = files.querySelectorAll('.upload-done').length;
			await selectRepository(repository);
			assert.deepStrictEqual({ before, other, returned: files.querySelectorAll('.upload-done').length, upload: ready.upload }, { before: 1, other: 0, returned: 0, upload: undefined });
		});

		test('keeps imported image previews above their filenames and within the attachment row', async () => {
			const { overlay, files } = createReporter();
			overlay.restoreAttachments([attachedFile('image', {
				...attachment,
				name: 'image.png',
				mimeType: 'image/png',
				thumbnailDataUrl: issueReporterImageFixture,
			})]);
			const image = files.querySelector('img')!;
			await image.decode();
			const card = files.querySelector<HTMLElement>('.wizard-file-card')!;
			const name = card.querySelector<HTMLElement>('.wizard-file-name')!;
			assert.deepStrictEqual({
				imageHeight: mainWindow.getComputedStyle(image).height,
				filenameBelowImage: name.getBoundingClientRect().top >= image.getBoundingClientRect().bottom,
				filenameWithinCard: name.getBoundingClientRect().bottom <= card.getBoundingClientRect().bottom,
				cardWithinRow: card.getBoundingClientRect().bottom <= files.getBoundingClientRect().bottom,
			}, { imageHeight: '75px', filenameBelowImage: true, filenameWithinCard: true, cardWithinRow: true });
		});

		test('uses equal preview and single-line filename areas for mixed attachments including annotations', async () => {
			const { overlay, files } = createReporter();
			for (const [token, value] of [
				['--vscode-strokeThickness', '1px'],
				['--vscode-spacing-size20', '2px'],
				['--vscode-spacing-size40', '4px'],
				['--vscode-spacing-size80', '8px'],
				['--vscode-fontSize-body2', '11px'],
				['--vscode-fontSize-label3', '10px'],
			]) {
				files.style.setProperty(token, value);
			}
			const longName = 'A very long original attachment filename that must not grow the card';
			overlay.restoreAttachments([
				capturedScreenshot('capture'),
				attachedFile('image', { ...attachment, name: `${longName}.png`, mimeType: 'image/png', thumbnailDataUrl: issueReporterImageFixture }),
				attachedFile('file', { ...attachment, name: `${longName}.zip` }),
				attachedFile('video', { ...attachment, name: 'recording.mp4', mimeType: 'video/mp4', durationMs: 65000 }),
				capturedScreenshot('annotated', { ...screenshot, dataUrl: issueReporterGifFixture, annotatedDataUrl: issueReporterImageFixture }),
			]);
			await Promise.all([...files.querySelectorAll('img')].map(image => image.decode()));
			const cards = [...files.querySelectorAll<HTMLElement>('.wizard-screenshot-card:not(.wizard-screenshot-add)')];
			assert.deepStrictEqual(cards.map(card => {
				const preview = card.querySelector<HTMLElement>('.wizard-attachment-preview')!;
				const name = card.querySelector<HTMLElement>('.wizard-file-name')!;
				assert.ok(preview && name, 'Every attachment needs a preview area and filename caption');
				const duration = card.querySelector<HTMLElement>('.wizard-recording-duration');
				const style = mainWindow.getComputedStyle(name);
				return {
					name: name.textContent,
					cardHeight: card.getBoundingClientRect().height,
					previewHeight: preview.getBoundingClientRect().height,
					captionHeight: name.getBoundingClientRect().height,
					filenameBelowPreview: name.getBoundingClientRect().top >= preview.getBoundingClientRect().bottom,
					filenameWithinCard: name.getBoundingClientRect().bottom <= card.getBoundingClientRect().bottom,
					overflow: [style.overflow, style.whiteSpace, style.textOverflow],
					truncated: name.scrollWidth > name.clientWidth,
					duration: duration?.textContent ?? '',
					durationInPreview: !duration || preview.contains(duration) && duration.getBoundingClientRect().bottom <= preview.getBoundingClientRect().bottom,
				};
			}), [
				['screenshot-1.png', false, ''],
				[`${longName}.png`, true, ''],
				[`${longName}.zip`, true, ''],
				['recording.mp4', false, '1:05'],
				['screenshot-2.png', false, ''],
			].map(([name, truncated, duration]) => ({
				name, cardHeight: 102, previewHeight: 75, captionHeight: 25,
				filenameBelowPreview: true, filenameWithinCard: true,
				overflow: ['hidden', 'nowrap', 'ellipsis'], truncated, duration, durationInPreview: true,
			})));
		});

		test('retains full filenames in accessible actions and disposes hovers when cards are replaced', () => {
			const { overlay, files, hovers } = createReporter();
			const name = 'A long attachment filename kept in full for hover and accessibility.zip';
			overlay.restoreAttachments([capturedScreenshot('capture'), attachedFile('file', { ...attachment, name })]);
			const names = [files.querySelector<HTMLElement>('.wizard-file-name')!, files.querySelectorAll<HTMLElement>('.wizard-file-name')[1]];
			const labels = [...files.querySelectorAll('.wizard-screenshot-card:not(.wizard-screenshot-add)')].map(card => ({
				action: card.getAttribute('aria-label'),
				remove: card.querySelector('.wizard-screenshot-delete')?.getAttribute('aria-label'),
			}));
			const firstHovers = names.map(element => hovers.get(element));
			overlay.setRecordingState(RecordingState.Idle);
			const replacement = { oldHovers: names.filter(element => hovers.has(element)).length, currentHovers: hovers.size };
			overlay.dispose();
			assert.deepStrictEqual({ firstHovers, labels, replacement, afterDispose: hovers.size }, {
				firstHovers: ['screenshot-1.png', name],
				labels: [
					{ action: 'Edit screenshot-1.png', remove: 'Remove screenshot-1.png' },
					{ action: `Open ${name}`, remove: `Remove ${name}` },
				],
				replacement: { oldHovers: 0, currentHovers: 2 }, afterDispose: 0,
			});
		});

		test('uses the success theme color on the actual uploaded check glyph', () => {
			const { overlay, files, data } = createReporter();
			const ready = attachedFile('file');
			overlay.restoreAttachments([ready]);
			overlay.setAttachmentUploadState(ready, { destination: resolveIssueReporterTarget(data, product)!.url, state: 'done' });
			const icon = files.querySelector<HTMLElement>('.review-progress-check .codicon')!;
			const colors = ['rgb(115, 201, 145)', 'rgb(20, 130, 70)'];
			assert.deepStrictEqual(colors.map(color => {
				files.style.setProperty('--vscode-testing-iconPassed', color);
				return mainWindow.getComputedStyle(icon).color;
			}), colors);
		});

		test('invalidates only the edited screenshot upload and ignores its old completion', () => {
			const { overlay, files, container, data } = createReporter();
			const ready = [capturedScreenshot('capture'), attachedFile('file')];
			overlay.restoreAttachments(ready);
			const destination = resolveIssueReporterTarget(data, product)!.url;
			for (const attachment of ready) {
				overlay.setAttachmentUploadState(attachment, { destination, state: 'done' });
			}
			files.querySelector<HTMLElement>('.wizard-screenshot-card')!.click();
			closeAnnotation(container, 'Save');
			overlay.setAttachmentUploadState(ready[0], { destination, state: 'done' });
			assert.deepStrictEqual({
				identities: overlay.getAttachments().map(item => item.id),
				badges: [...files.querySelectorAll('.wizard-screenshot-card:not(.wizard-screenshot-add)')].map(card => card.classList.contains('upload-done')),
				screenshotReplaced: overlay.getAttachments()[0] !== ready[0],
			}, { identities: ['capture', 'file'], badges: [false, true], screenshotReplaced: true });
		});

		test('keeps raw upload errors in collapsed details outside the primary status', () => {
			const { overlay, container, feedback } = createReporter();
			const raw = 'Policy request failed 422:\n{"message":"Invalid content type","status":"422"}';
			const message = 'Could not upload test.zip. Try again, or remove this file and attach it on GitHub.';
			overlay.setAttachmentUploadError(message, raw);
			const details = container.querySelector<HTMLDetailsElement>('.wizard-attachment-error-details')!;
			const detailsStyle = mainWindow.getComputedStyle(details.querySelector('pre')!);
			assert.deepStrictEqual({
				primary: feedback.textContent, rawInStatus: feedback.textContent?.includes('422'), collapsed: !details.open, hidden: details.hidden,
				label: details.querySelector('summary')?.textContent, details: details.querySelector('pre')?.textContent,
				selectable: detailsStyle.getPropertyValue('user-select') || detailsStyle.getPropertyValue('-webkit-user-select'),
			}, { primary: message, rawInStatus: false, collapsed: true, hidden: false, label: 'Technical details', details: raw, selectable: 'text' });
			overlay.setAttachmentUploadError(undefined);
			assert.deepStrictEqual({ hidden: details.hidden, details: details.querySelector('pre')?.textContent, primary: feedback.textContent }, { hidden: true, details: '', primary: '' });
		});

		test('copies the current technical details with keyboard activation without changing the draft', async () => {
			const { overlay, container, instantiation } = createReporter();
			const copied = new DeferredPromise<string>();
			const write = stub(instantiation.get(IClipboardService), 'writeText').callsFake(text => copied.complete(text));
			store.add(toDisposable(() => write.restore()));
			overlay.setAttachmentUploadError('Upload rejected.', 'Previous error');
			const raw = 'Policy request failed 422:\n{"message":"Invalid content type"}';
			overlay.setAttachmentUploadError('Upload rejected.', raw);
			const details = container.querySelector<HTMLDetailsElement>('.wizard-attachment-error-details')!;
			details.open = true;
			const button = details.querySelector<HTMLElement>('.monaco-button');
			assert.ok(button);
			button.focus();
			button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
			assert.deepStrictEqual({
				copied: await copied.p,
				details: details.querySelector('pre')?.textContent,
				label: button.textContent,
				role: button.getAttribute('role'),
				dirty: overlay.hasUnsavedChanges(),
			}, { copied: raw, details: raw, label: 'Copy', role: 'button', dirty: false });
		});

		test('reports a technical-details copy failure without replacing the upload error', async () => {
			const { overlay, container, instantiation, feedback } = createReporter();
			const failed = new DeferredPromise<string>();
			const error = new Error('Clipboard unavailable');
			const write = stub(instantiation.get(IClipboardService), 'writeText').rejects(error);
			store.add(toDisposable(() => write.restore()));
			const notify = stub(instantiation.get(INotificationService), 'error').callsFake(message => { void failed.complete(String(message)); });
			store.add(toDisposable(() => notify.restore()));
			const log = spy(instantiation.get(ILogService), 'error');
			store.add(toDisposable(() => log.restore()));
			const raw = 'Policy request failed 422';
			overlay.setAttachmentUploadError('Upload rejected.', raw);
			const details = container.querySelector<HTMLDetailsElement>('.wizard-attachment-error-details')!;
			details.open = true;
			const button = details.querySelector<HTMLElement>('.monaco-button');
			assert.ok(button);
			button.click();
			assert.deepStrictEqual({
				notification: await failed.p,
				loggedError: log.lastCall.args.at(-1),
				primary: feedback.textContent,
				details: details.querySelector('pre')?.textContent,
			}, { notification: 'Could not copy technical details: Clipboard unavailable', loggedError: error, primary: 'Upload rejected.', details: raw });
		});

		test('keeps failed uploads visible beside attachments and preserves the draft', () => {
			const { overlay, files, feedback, preview } = createReporter();
			overlay.restoreAttachments([attachedFile('file')]);
			overlay.setUploading(true);
			overlay.setAttachmentUploadError('Upload rejected. Try again.');
			overlay.setUploading(false);
			assert.deepStrictEqual({
				message: feedback.textContent, inline: feedback.parentElement?.contains(files), dirty: overlay.hasUnsavedChanges(),
				files: overlay.getFileAttachments().length, ready: preview.getAttribute('aria-disabled'),
			}, { message: 'Upload rejected. Try again.', inline: true, dirty: true, files: 1, ready: 'false' });
		});

		test('ignores late completions and detaches listeners on disposal', () => {
			const { overlay, files, completeImport } = createReporter();
			let requests = 0;
			store.add(overlay.onDidRequestAddAttachments(() => requests++));
			paste(files, images(1));
			overlay.dispose();
			const added = completeImport(attachment);
			paste(files, images(1));
			assert.deepStrictEqual({ added, requests }, { added: false, requests: 1 });
		});
	});

	for (const additionalRepositories of [undefined, [], ['microsoft/vscode']]) {
		test(`does not reveal a useless repository menu for ${JSON.stringify(additionalRepositories)}`, () => {
			const { container, data } = createReporter({ additionalRepositories });
			assert.deepStrictEqual({ menu: !!container.querySelector('.issue-reporter-repository-picker'), target: container.querySelector('.wizard-target-status')?.textContent }, { menu: false, target: `Issue will be opened in ${getRepository(data)}` });
		});
	}

	test('Agents Window is an issue source, not an implicit private destination', () => {
		const { container, data } = createReporter({ isSessionsWindow: true, issueSource: undefined, additionalRepositories: ['owner/second'] });
		assert.deepStrictEqual({ source: data.issueSource, destination: data.issueRepository, menu: !!container.querySelector('.issue-reporter-repository-picker') }, { source: IssueSource.AgentsWindow, destination: undefined, menu: true });
	});

	test('retains ordered repository choices and submitted destination through model updates', async () => {
		const { overlay, container, data, preview, selectRepository, getMenu } = createReporter({ additionalRepositories: ['MICROSOFT/VSCODE', 'owner/second', 'team/third', 'TEAM/THIRD'] });
		const repository = getRepository(data);
		container.querySelector<HTMLElement>('.issue-reporter-repository-picker')!.click();
		const choices = getMenu()?.getActions().map(action => action.label);
		getMenu()?.onHide?.(true);
		await selectRepository('team/third');
		overlay.updateModel({ versionInfo: { vscodeVersion: 'test', os: 'test' } });
		let body: string | undefined;
		store.add(overlay.onDidSubmit(event => body = event.body));
		preview.click();
		assert.deepStrictEqual({ choices, destination: data.issueRepository, body: body?.includes('team/third') }, { choices: [repository, 'owner/second', 'team/third'], destination: 'team/third', body: true });
	});

	test('source changes retain the product destination and repository changes invalidate previews', async () => {
		const { overlay, container, data, preview, selectRepository, setText } = createReporter({ additionalRepositories: ['owner/second', 'team/third'] });
		setText('User-edited report');
		await selectRepository('owner/second');
		container.querySelector<HTMLElement>('[data-source="marketplace"]')!.click();
		const marketplace = resolveIssueReporterTarget(data, product)?.url;
		container.querySelector<HTMLElement>('[data-source="vscode"]')!.click();
		const restored = data.issueRepository;
		preview.click();
		overlay.markPreviewOpened();
		const previewed = overlay.hasUnsavedChanges();
		await selectRepository('team/third');
		assert.deepStrictEqual({ marketplace, restored, previewed, dirty: overlay.hasUnsavedChanges() }, { marketplace: product.reportMarketplaceIssueUrl ?? product.reportIssueUrl, restored: 'owner/second', previewed: false, dirty: true });
	});

	test('late extension overrides do not replace the selected product destination', async () => {
		const pending = new DeferredPromise<IssueReporterData | undefined>();
		const extension = { id: 'publisher.extension', name: 'extension', displayName: 'Extension', publisher: 'publisher', version: '1', isTheme: false, isBuiltin: false, bugsUrl: 'https://github.com/publisher/extension/issues', repositoryUrl: undefined };
		const { container, data, selectRepository } = createReporter({ uri: URI.parse('https://github.com/microsoft/vscode'), privateUri: URI.parse(internalIssueReporterUrl), enabledExtensions: [extension] }, { resolveExtensionIssueData: () => pending.p });
		await selectRepository('microsoft/vscode-internalbacklog');
		container.querySelector<HTMLElement>('[data-source="extension"]')!.click();
		const select = container.querySelector<HTMLSelectElement>('.wizard-extension-field select')!;
		select.selectedIndex = 1;
		select.dispatchEvent(new Event('change'));
		container.querySelector<HTMLElement>('[data-source="vscode"]')!.click();
		await pending.complete({ ...data, uri: URI.parse('https://github.com/publisher/custom/issues/new'), privateUri: undefined });
		assert.deepStrictEqual({ target: resolveIssueReporterTarget(data, product)?.url, choice: data.issueRepository }, { target: internalIssueReporterUrl, choice: 'microsoft/vscode-internalbacklog' });
	});

	test('appends an asynchronous extension template without replacing native draft text or selection', async () => {
		const pending = new DeferredPromise<IssueReporterData | undefined>();
		const extension = { id: 'publisher.extension', name: 'extension', displayName: 'Extension', publisher: 'publisher', version: '1', isTheme: false, isBuiltin: false, bugsUrl: 'https://github.com/publisher/extension/issues', repositoryUrl: undefined };
		const { container, data, editor, setText, setSelection, previewTab, descriptionPreview, writeTab } = createReporter({ enabledExtensions: [extension] }, { resolveExtensionIssueData: () => pending.p });
		container.querySelector<HTMLElement>('[data-source="extension"]')!.click();
		const select = container.querySelector<HTMLSelectElement>('.wizard-extension-field select')!;
		select.selectedIndex = 1;
		select.dispatchEvent(new Event('change', { bubbles: true }));
		setText('User draft');
		setSelection(2, 6);
		previewTab.click();
		await pending.complete({ ...data, issueTitle: 'Extension title', issueBody: '### Extension template' });
		await timeout(0);
		const rendered = descriptionPreview.querySelector('h3')?.textContent;
		writeTab.click();
		assert.deepStrictEqual({ text: editor.value, draft: data.issueBody, title: data.issueTitle, selection: [editor.selectionStart, editor.selectionEnd], rendered }, {
			text: 'User draft\n### Extension template', draft: 'User draft\n### Extension template', title: 'Repository selection', selection: [2, 6], rendered: 'Extension template',
		});
	});

	test('does not treat an automatically supplied extension template as a user edit', async () => {
		const pending = new DeferredPromise<IssueReporterData | undefined>();
		const extension = { id: 'publisher.extension', name: 'extension', displayName: 'Extension', publisher: 'publisher', version: '1', isTheme: false, isBuiltin: false, bugsUrl: 'https://github.com/publisher/extension/issues', repositoryUrl: undefined };
		const { overlay, container, data, editor, setText } = createReporter({ issueTitle: '', issueBody: '', enabledExtensions: [extension] }, { resolveExtensionIssueData: () => pending.p });
		container.querySelector<HTMLElement>('[data-source="extension"]')!.click();
		const select = container.querySelector<HTMLSelectElement>('.wizard-extension-field select')!;
		select.selectedIndex = 1;
		select.dispatchEvent(new Event('change', { bubbles: true }));
		await pending.complete({ ...data, issueTitle: 'Extension title', issueBody: 'Extension template' });
		await timeout(0);
		const automatic = { title: data.issueTitle, description: editor.value, dirty: overlay.hasUnsavedChanges() };
		setText('User explanation');
		const edited = overlay.hasUnsavedChanges();
		setText('Extension template');
		assert.deepStrictEqual({ automatic, edited, restored: overlay.hasUnsavedChanges() }, {
			automatic: { title: 'Extension title', description: 'Extension template', dirty: false }, edited: true, restored: false,
		});
	});

	function closeAnnotation(container: HTMLElement, action: 'Save' | 'Discard'): void {
		const editor = [...container.querySelectorAll('.issue-reporter-annotation-overlay')].at(-1)!;
		[...editor.querySelectorAll<HTMLElement>('.monaco-button')].find(button => button.textContent === action)!.click();
	}

	for (const action of ['Save', 'Discard'] as const) {
		test(`releases closed annotation editors after ${action}`, () => {
			const { overlay, container } = createReporter();
			const disposed = spy(ScreenshotAnnotationEditor.prototype, 'dispose');
			try {
				overlay.addScreenshot({ ...screenshot });
				closeAnnotation(container, action);
				disposed.resetHistory();
				overlay.dispose();
				assert.strictEqual(disposed.callCount, 0);
			} finally {
				disposed.restore();
			}
		});
	}

	test('keeps lower annotation editors open until the reporter closes', () => {
		const { overlay, container } = createReporter();
		overlay.addScreenshot({ ...screenshot });
		overlay.addScreenshot({ ...screenshot });
		closeAnnotation(container, 'Discard');
		const remaining = container.querySelectorAll('.issue-reporter-annotation-overlay').length;
		overlay.dispose();
		assert.deepStrictEqual({ remaining, afterClose: container.querySelectorAll('.issue-reporter-annotation-overlay').length }, { remaining: 1, afterClose: 0 });
	});

	test('removes handlers from replaced screenshot cards', () => {
		const { overlay, files, container } = createReporter();
		overlay.restoreAttachments([capturedScreenshot('capture')]);
		const oldCard = files.querySelector<HTMLElement>('.wizard-screenshot-card')!;
		overlay.restoreAttachments([capturedScreenshot('capture')]);
		oldCard.click();
		const old = container.querySelectorAll('.issue-reporter-annotation-overlay').length;
		files.querySelector<HTMLElement>('.wizard-screenshot-card')!.click();
		assert.deepStrictEqual({ old, current: container.querySelectorAll('.issue-reporter-annotation-overlay').length }, { old: 0, current: 1 });
	});

	test('stops answering issue-data requests after disposal', async () => {
		const { overlay } = createReporter({ issueTitle: 'Screenshot annotation' });
		overlay.updateModel({ issueDescription: 'An annotated screenshot report' });
		const request = (): Promise<string[]> => new Promise(resolve => {
			const responses: string[] = [];
			const listener = store.add(addDisposableListener(mainWindow, 'message', event => {
				if (event.data?.replyChannel === 'vscode:triggerIssueDataResponse') {
					responses.push(event.data.data.issueBody);
				} else if (event.data === 'issue-reporter-test-barrier') {
					listener.dispose();
					resolve(responses);
				}
			}));
			mainWindow.dispatchEvent(new MessageEvent('message', { data: { sendChannel: 'vscode:triggerIssueData' } }));
			mainWindow.postMessage('issue-reporter-test-barrier', '*');
		});
		const before = await request();
		overlay.dispose();
		assert.deepStrictEqual({ before, after: await request() }, { before: ['An annotated screenshot report'], after: [] });
	});

	test('includes standalone diagnostics until explicitly excluded', () => {
		const { overlay, container, preview } = createReporter({ data: 'Private diagnostic context' });
		const bodies: string[] = [];
		store.add(overlay.onDidSubmit(event => bodies.push(event.body)));
		preview.click();
		const checkbox = diagnosticControls(container, 'includeExtensionData').checkbox;
		checkbox.click();
		preview.click();
		assert.deepStrictEqual(bodies.map(body => body.includes('Private diagnostic context')), [true, false]);
	});

	test('preserves backslashes and pipes in rendered diagnostic table cells', () => {
		const { overlay, preview, instantiation } = createReporter();
		const version = String.raw`1\|2\\|3`;
		overlay.updateModel({ versionInfo: { vscodeVersion: version, os: 'First|line\r\nSecond\\line' } });
		let body = '';
		store.add(overlay.onDidSubmit(event => { body = event.body; }));
		preview.click();
		const rendered = store.add(instantiation.get(IMarkdownRendererService).render(new MarkdownString(body, { supportHtml: true })));
		const rows = [...rendered.element.querySelector('table')!.querySelectorAll('tbody tr')]
			.map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent))
			.filter(([label]) => label === 'VS Code Version' || label === 'OS Version');
		assert.deepStrictEqual(rows, [['VS Code Version', version], ['OS Version', 'First|lineSecond\\line']]);
	});

	test('keeps optional diagnostic inclusion controls visible while each detail section is collapsed', () => {
		const { container } = createReporter();
		const groups = [...container.querySelectorAll<HTMLElement>('.review-diag-group')];
		assert.deepStrictEqual({
			heading: container.querySelector('.wizard-diagnostics h2')?.textContent,
			masterControls: container.querySelectorAll('.review-diag-master-checkbox, .review-diag-heading').length,
			rows: groups.map(group => ({
				label: group.querySelector('.review-diag-title')?.textContent,
				checked: group.querySelector('.review-diag-checkbox')?.getAttribute('aria-checked'),
				hiddenByDisclosure: !!group.closest('details'),
				collapsed: group.querySelector('.review-diag-toggle-area')?.getAttribute('aria-expanded'),
				contentHidden: group.querySelector<HTMLElement>('.review-diag-content')?.hidden,
			})),
		}, {
			heading: 'Diagnostics (optional)', masterControls: 0,
			rows: [
				{ label: 'System Information', checked: 'true', hiddenByDisclosure: false, collapsed: 'false', contentHidden: true },
				{ label: 'Extensions (0)', checked: 'true', hiddenByDisclosure: false, collapsed: 'false', contentHidden: true },
				{ label: 'A/B Experiments', checked: 'true', hiddenByDisclosure: false, collapsed: 'false', contentHidden: true },
			],
		});
	});

	test('retains diagnostic deselection and checkbox focus when background data arrives', () => {
		const { overlay, container, preview } = createReporter();
		const initial = diagnosticControls(container, 'includeSystemInfo');
		initial.checkbox.focus();
		initial.checkbox.click();
		overlay.updateModel({ versionInfo: { vscodeVersion: 'Test version', os: 'Test OS' } });
		const updated = diagnosticControls(container, 'includeSystemInfo');
		let body = '';
		store.add(overlay.onDidSubmit(submission => { body = submission.body; }));
		preview.click();
		assert.deepStrictEqual({
			checked: updated.checkbox.getAttribute('aria-checked'),
			focused: document.activeElement === updated.checkbox,
			visible: !updated.group.hidden && !updated.group.closest('details'),
			included: body.includes('<summary>System Info</summary>'),
			otherChoices: [...container.querySelectorAll('.review-diag-checkbox')].map(checkbox => checkbox.getAttribute('aria-checked')),
		}, { checked: 'false', focused: true, visible: true, included: false, otherChoices: ['false', 'true', 'true'] });
	});

	for (const [key, keyCode] of [['Enter', 13], [' ', 32]] as const) {
		test(`expands diagnostic details with ${keyCode === 13 ? 'Enter' : 'Space'} independently of inclusion`, () => {
			const { overlay, container } = createReporter({ data: 'Private diagnostic details' });
			const initial = diagnosticControls(container, 'includeExtensionData');
			initial.checkbox.click();
			initial.toggle.focus();
			initial.toggle.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true }));
			overlay.updateModel({ experimentInfo: 'New background data' });
			const updated = diagnosticControls(container, 'includeExtensionData');
			assert.deepStrictEqual({
				checked: updated.checkbox.getAttribute('aria-checked'),
				expanded: updated.toggle.getAttribute('aria-expanded'),
				contentHidden: updated.content.hidden,
				focused: document.activeElement === updated.toggle,
				controlsContent: updated.toggle.getAttribute('aria-controls') === updated.content.id,
				checkboxLabel: updated.checkbox.getAttribute('aria-label'),
			}, { checked: 'false', expanded: 'true', contentHidden: false, focused: true, controlsContent: true, checkboxLabel: 'Include Extension Data' });
		});
	}

	test('does not reselect extension diagnostics when an awaited extension reply arrives', async () => {
		const pending = new DeferredPromise<IssueReporterData | undefined>();
		const extension = { id: 'publisher.extension', name: 'extension', displayName: 'Extension', publisher: 'publisher', version: '1', isTheme: false, isBuiltin: false, bugsUrl: 'https://github.com/publisher/extension/issues', repositoryUrl: undefined };
		const { overlay, container, data, preview } = createReporter({ enabledExtensions: [extension] }, { resolveExtensionIssueData: () => pending.p });
		container.querySelector<HTMLElement>('[data-source="extension"]')!.click();
		const select = container.querySelector<HTMLSelectElement>('.wizard-extension-field select')!;
		select.selectedIndex = 1;
		select.dispatchEvent(new Event('change'));
		diagnosticControls(container, 'includeExtensionData').checkbox.click();
		await pending.complete({ ...data, data: 'Late private extension diagnostics' });
		const updated = diagnosticControls(container, 'includeExtensionData');
		let body = '';
		store.add(overlay.onDidSubmit(submission => { body = submission.body; }));
		preview.click();
		assert.deepStrictEqual({
			checked: updated.checkbox.getAttribute('aria-checked'),
			availableForReview: updated.content.textContent,
			included: body.includes('Late private extension diagnostics'),
			submitted: body.includes('### Description'),
		}, { checked: 'false', availableForReview: 'Late private extension diagnostics', included: false, submitted: true });
	});

	test('exposes performance inclusion choices before data arrives and preserves their defaults and exclusions', () => {
		const { overlay, container, preview } = createReporter({ issueType: IssueType.PerformanceIssue });
		const process = diagnosticControls(container, 'includeProcessInfo');
		const workspace = diagnosticControls(container, 'includeWorkspaceInfo');
		const defaults = [process.checkbox, workspace.checkbox].map(checkbox => checkbox.getAttribute('aria-checked'));
		workspace.checkbox.click();
		const waiting = preview.getAttribute('aria-disabled');
		overlay.updateModel({ processInfo: 'Background process details', workspaceInfo: 'Private workspace details' });
		overlay.markPerformanceInfoLoaded();
		let body = '';
		store.add(overlay.onDidSubmit(submission => { body = submission.body; }));
		preview.click();
		assert.deepStrictEqual({
			defaults, waiting, ready: preview.getAttribute('aria-disabled'),
			processes: body.includes('Background process details'), workspace: body.includes('Private workspace details'),
			workspaceChoice: diagnosticControls(container, 'includeWorkspaceInfo').checkbox.getAttribute('aria-checked'),
		}, { defaults: ['true', 'true'], waiting: 'true', ready: 'false', processes: true, workspace: false, workspaceChoice: 'false' });
	});

	test('preserves standalone NES diagnostics and extracts their nested details intact', () => {
		const context = `# Inline Edits Debug Info

## Result:
\`\`\` patch
-const greeting = 'hello';
+const greeting = 'hello world';
\`\`\`

<details><summary>STest</summary>

\`\`\`typescript
stest({ description: 'NES feedback' });
\`\`\`
</details>

<details><summary>Recording</summary>

\`\`\`json
{ "kind": "changed" }
\`\`\`
</details>`;
		const { overlay, preview } = createReporter({ issueTitle: 'NES feedback', data: context });
		let body: string | undefined;
		store.add(overlay.onDidSubmit(event => body = event.body));
		preview.click();
		const extensionData = `<details>\n<summary>Extension Data</summary>\n\n${context}\n\n</details>`;
		const systemInfo = '<details>\n<summary>System Info</summary>\n\n|Item|Value|\n|---|---|\n|OS|Test OS|\n</details>';
		assert.deepStrictEqual({
			included: body?.includes(extensionData),
			extracted: extractIssueData(`### Description\n\nNES feedback\n\n${extensionData}\n\n${systemInfo}\n\n<!-- generated by issue reporter -->`),
		}, {
			included: true,
			extracted: {
				body: '### Description\n\nNES feedback\n\n<!-- generated by issue reporter -->',
				fileContent: `# Issue Data\n\n${extensionData}\n\n${systemInfo}\n`,
			},
		});
	});
});
