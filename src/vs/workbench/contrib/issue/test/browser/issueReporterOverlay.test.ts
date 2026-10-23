/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy } from 'sinon';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';
import { addDisposableListener } from '../../../../../base/browser/dom.js';
import { setARIAContainer } from '../../../../../base/browser/ui/aria/aria.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ITreeViewsDnDService } from '../../../../../editor/common/services/treeViewsDndService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextViewDelegate, IContextViewService, IOpenContextView } from '../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { DEFAULT_EDITOR_PART_OPTIONS, IEditorGroupsView, IEditorGroupView } from '../../../../browser/parts/editor/editor.js';
import { EditorDropTarget } from '../../../../browser/parts/editor/editorDropTarget.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { extractIssueData } from '../../browser/issueFormService.js';
import { IssueReporterOverlay } from '../../browser/issueReporterOverlay.js';
import { RecordingState } from '../../browser/recordingService.js';
import { ScreenshotAnnotationEditor } from '../../browser/screenshotAnnotation.js';
import { ISimilarIssue, IssueReporterData, IssueSource, IssueType } from '../../common/issue.js';
import { internalIssueReporterUrl, resolveIssueReporterTarget } from '../../common/issueReporterTarget.js';
import product from '../../../../../platform/product/common/product.js';

const nesContext = `# Inline Edits Debug Info

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

class TestContextViewService implements IContextViewService {
	declare readonly _serviceBrand: undefined;

	private readonly element = document.createElement('div');

	showContextView(delegate: IContextViewDelegate): IOpenContextView {
		const disposable = delegate.render(this.element);
		return {
			close: () => {
				disposable.dispose();
				delegate.onHide?.();
			}
		};
	}

	hideContextView(): void { }

	getContextViewElement(): HTMLElement {
		return this.element;
	}

	layout(): void { }
}

suite('IssueReporterOverlay', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createRepositoryReporter(overrides: Partial<IssueReporterData> = {}, resolveExtensionIssueData?: (extensionId: string) => Promise<IssueReporterData | undefined>, fetcher?: typeof fetch) {
		const container = document.createElement('div');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const data: IssueReporterData = {
			styles: {}, zoomLevel: 0, enabledExtensions: [], restrictedMode: false,
			isInstallationPure: true, isSessionsWindow: false, githubAccessToken: '',
			issueSource: IssueSource.VSCode, issueType: IssueType.Bug,
			issueTitle: 'Repository selection', issueBody: 'Issue description',
			...overrides,
		};
		const searches: string[] = [];
		let menu: IContextMenuDelegate | undefined;
		const overlay = store.add(new IssueReporterOverlay(
			data, false, container, new TestContextViewService(),
			async repo => { searches.push(repo); return []; },
			{ showContextMenu: delegate => { menu = delegate; } }, undefined, true, resolveExtensionIssueData, undefined, false, undefined, undefined,
			fetcher ?? (async () => { searches.push('public duplicate service'); return new Response('{"candidates":[]}'); }),
		));
		overlay.show();
		const next = container.querySelector<HTMLElement>('.wizard-next')!;
		const back = container.querySelector<HTMLElement>('.wizard-back')!;
		next.click();
		const selectRepository = async (repository: string) => {
			container.querySelector<HTMLElement>('.issue-reporter-repository-picker')!.click();
			const action = menu?.getActions().find(action => action.label === repository);
			assert.ok(action);
			menu?.onHide?.(false);
			await action.run();
		};
		return { overlay, container, data, searches, next, back, selectRepository, getMenu: () => menu };
	}

	function getSelectedRepository(data: IssueReporterData): string {
		const repository = resolveIssueReporterTarget(data, product)!.repository!;
		return `${repository.owner}/${repository.repositoryName}`;
	}

	suite('Media imports', () => {
		const importedImage = { kind: 'image' as const, image: { dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=', width: 1, height: 1 } };

		function paste(target: HTMLElement, files: readonly File[], text?: string): ClipboardEvent {
			const transfer = new DataTransfer();
			for (const file of files) {
				transfer.items.add(file);
			}
			if (text) {
				transfer.setData('text/plain', text);
			}
			const event = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true });
			target.dispatchEvent(event);
			return event;
		}

		function images(count: number): File[] {
			return Array.from({ length: count }, (_, index) => new File(['image'], `image-${index}.png`, { type: 'image/png' }));
		}

		function installEditorDropTarget(container: HTMLElement): void {
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
		}

		test('MR-1 claims file drag-enter before the workbench editor drop overlay takes the target', () => {
			const { overlay, container, back } = createRepositoryReporter();
			back.click();
			installEditorDropTarget(container);
			const transfer = new DataTransfer();
			transfer.items.add(images(1)[0]);
			const area = container.querySelector<HTMLElement>('.wizard-screenshots')!;
			const requested: number[] = [];
			store.add(overlay.onDidRequestAddAttachments(files => requested.push(files.length)));
			const enter = new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true, cancelable: true });
			area.dispatchEvent(enter);
			assert.deepStrictEqual({
				editorOverlay: !!container.querySelector('#monaco-workbench-editor-drop-overlay'),
				claimed: enter.defaultPrevented,
			}, { editorOverlay: false, claimed: true });
			area.dispatchEvent(new DragEvent('dragover', { dataTransfer: transfer, bubbles: true, cancelable: true }));
			const drop = new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true });
			area.dispatchEvent(drop);
			assert.deepStrictEqual({ requested, prevented: drop.defaultPrevented }, { requested: [1], prevented: true });
			area.dispatchEvent(new DragEvent('dragleave', { dataTransfer: transfer, bubbles: true }));
			assert.strictEqual(area.classList.contains('drag-over'), false);

			const outside = container.appendChild(document.createElement('div'));
			outside.dispatchEvent(new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true, cancelable: true }));
			assert.ok(container.querySelector('#monaco-workbench-editor-drop-overlay'), 'Ordinary editor file drops outside the reporter must remain available');
			outside.dispatchEvent(new DragEvent('dragend', { dataTransfer: transfer, bubbles: true }));
		});

		test('MR-1 rejects file drops elsewhere in the reporter without intercepting text editing', () => {
			const { container, overlay } = createRepositoryReporter();
			installEditorDropTarget(container);
			const description = container.querySelector('textarea')!;
			const transfer = new class extends DataTransfer {
				protectedMode = false;
				override getData(format: string): string {
					return this.protectedMode ? '' : super.getData(format);
				}
			}();
			transfer.items.add(images(1)[0]);
			let requests = 0;
			store.add(overlay.onDidRequestAddAttachments(() => requests++));
			const enter = new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true, cancelable: true });
			description.dispatchEvent(enter);
			const drop = new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true });
			description.dispatchEvent(drop);
			assert.deepStrictEqual({
				claimedEnter: enter.defaultPrevented, claimedDrop: drop.defaultPrevented, requests,
				editorOverlay: !!container.querySelector('#monaco-workbench-editor-drop-overlay'),
			}, { claimedEnter: true, claimedDrop: true, requests: 0, editorOverlay: false });
			transfer.setData('text/plain', 'Text to insert');
			transfer.protectedMode = true;
			const mixedEnter = new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true, cancelable: true });
			const mixedOver = new DragEvent('dragover', { dataTransfer: transfer, bubbles: true, cancelable: true });
			const mixedDrop = new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true });
			description.dispatchEvent(mixedEnter);
			description.dispatchEvent(mixedOver);
			transfer.protectedMode = false;
			description.dispatchEvent(mixedDrop);
			assert.deepStrictEqual({
				textEnterPrevented: mixedEnter.defaultPrevented, textOverPrevented: mixedOver.defaultPrevented, textDropPrevented: mixedDrop.defaultPrevented,
				editorOverlay: !!container.querySelector('#monaco-workbench-editor-drop-overlay'), requests,
			}, { textEnterPrevented: false, textOverPrevented: false, textDropPrevented: false, editorOverlay: false, requests: 0 });
		});

		for (const outcome of ['success', 'failure', 'cancellation'] as const) {
			test(`MR-2 restores Describe navigation after Back while an import ends with ${outcome}`, () => {
				const { overlay, container, next, back } = createRepositoryReporter();
				paste(container.querySelector('textarea')!, images(1));
				next.click();
				assert.strictEqual(next.getAttribute('aria-disabled'), 'true');
				back.click();
				overlay.completeAttachmentImport(outcome === 'success' ? importedImage : undefined, outcome === 'failure' ? 'Import failed' : undefined);
				next.click();
				assert.deepStrictEqual({
					nextDisabled: next.getAttribute('aria-disabled'),
					step: container.querySelector('.wizard-step-indicator')?.textContent,
				}, { nextDisabled: 'false', step: 'Step 3 of 3' });
			});
		}

		test('MR-2 restores Attachments navigation without bypassing diagnostics or upload gates', () => {
			const { overlay, container, next, back } = createRepositoryReporter({ issueType: IssueType.PerformanceIssue });
			paste(container.querySelector('textarea')!, images(1));
			next.click();
			back.click();
			back.click();
			overlay.completeAttachmentImport(importedImage);
			assert.strictEqual(next.getAttribute('aria-disabled'), 'false');
			next.click();
			next.click();
			assert.deepStrictEqual({
				step: container.querySelector('.wizard-step-indicator')?.textContent,
				disabled: next.getAttribute('aria-disabled'),
				reason: next.title,
			}, { step: 'Step 3 of 3', disabled: 'true', reason: 'Waiting for performance diagnostics to finish loading' });
			overlay.markPerformanceInfoLoaded();
			overlay.setUploading(true);
			assert.strictEqual(next.getAttribute('aria-disabled'), 'true');
			overlay.setUploading(false);
			assert.strictEqual(next.getAttribute('aria-disabled'), 'false');
		});

		test('makes attachment paste and drop discoverable and keyboard accessible', () => {
			const { container, back } = createRepositoryReporter();
			back.click();
			const attachments = container.querySelector<HTMLElement>('.wizard-screenshots')!;
			assert.deepStrictEqual({
				focusable: attachments.tabIndex,
				role: attachments.getAttribute('role'),
				hint: container.querySelector('.wizard-attachment-hint')?.textContent?.includes('paste'),
			}, { focusable: 0, role: 'group', hint: true });
		});

		test('prevents unsupported file drops from navigating away', () => {
			const { container, back } = createRepositoryReporter();
			back.click();
			const transfer = new DataTransfer();
			transfer.items.add(new File(['not media'], 'notes.txt', { type: 'text/plain' }));
			const event = new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true });
			container.querySelector('.wizard-screenshots')!.dispatchEvent(event);
			assert.strictEqual(event.defaultPrevented, true);
		});

		test('claims image-only description paste but leaves ordinary text paste alone', () => {
			const { container } = createRepositoryReporter();
			const description = container.querySelector('textarea')!;
			const imageTransfer = new DataTransfer();
			imageTransfer.items.add(new File(['image'], 'paste.png', { type: 'image/png' }));
			const image = new ClipboardEvent('paste', { clipboardData: imageTransfer, bubbles: true, cancelable: true });
			const textTransfer = new DataTransfer();
			textTransfer.setData('text/plain', 'Keep this text');
			const text = new ClipboardEvent('paste', { clipboardData: textTransfer, bubbles: true, cancelable: true });
			description.dispatchEvent(image);
			description.dispatchEvent(text);
			assert.deepStrictEqual({ image: image.defaultPrevented, text: text.defaultPrevented }, { image: true, text: false });
		});

		test('processes a bubbling description paste once and preserves the native text insertion', () => {
			const { overlay, container } = createRepositoryReporter();
			const description = container.querySelector('textarea')!;
			description.value = 'before selected after';
			description.setSelectionRange(7, 15);
			const received: File[][] = [];
			store.add(overlay.onDidRequestAddAttachments(files => received.push([...files])));
			const event = paste(description, images(1), 'pasted text');
			const selection = [description.selectionStart, description.selectionEnd];
			if (!event.defaultPrevented) {
				description.setRangeText(event.clipboardData!.getData('text/plain'), description.selectionStart, description.selectionEnd, 'end');
			}
			overlay.completeAttachmentImport(importedImage);
			assert.deepStrictEqual({
				requests: received.map(files => files.length),
				claimedText: event.defaultPrevented,
				selection,
				text: description.value,
				images: overlay.getScreenshots().length,
				status: container.querySelector('.wizard-attachment-status')?.textContent,
				statusHidden: container.querySelector<HTMLElement>('.wizard-attachment-status')?.hidden,
				step: container.querySelector('.wizard-step-indicator')?.textContent,
				annotationOpen: !!container.querySelector('.issue-reporter-annotation-overlay'),
			}, { requests: [1], claimedText: false, selection: [7, 15], text: 'before pasted text after', images: 1, status: '', statusHidden: true, step: 'Step 2 of 3', annotationOpen: false });
		});

		for (const input of ['paste', 'drop'] as const) {
			test(`preserves mixed text and attachments from ${input} without persistent success messages`, () => {
				const { overlay, container, back, next } = createRepositoryReporter();
				back.click();
				const ariaHost = container.appendChild(document.createElement('div'));
				setARIAContainer(ariaHost);
				const announcement = () => [...ariaHost.querySelectorAll('.monaco-status[aria-live="polite"]')].map(element => element.textContent).filter(Boolean);
				const attachments = container.querySelector<HTMLElement>('.wizard-screenshots')!;
				const attachmentStatus = container.querySelector<HTMLElement>('.wizard-attachment-status')!;
				const readStatus = () => ({
					text: attachmentStatus.textContent,
					hidden: attachmentStatus.hidden,
					inLayout: attachmentStatus.getClientRects().length > 0,
					busy: attachments.getAttribute('aria-busy'),
				});
				const requests: number[] = [];
				store.add(overlay.onDidRequestAddAttachments(files => requests.push(files.length)));
				const transfer = new DataTransfer();
				for (const file of images(2)) {
					transfer.items.add(file);
				}
				transfer.setData('text/plain', 'Useful context');
				const event = input === 'paste'
					? new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true })
					: new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true });
				attachments.dispatchEvent(event);
				const pending = readStatus();
				const textAnnouncement = announcement();
				overlay.completeAttachmentImport(importedImage);
				const partial = readStatus();
				overlay.completeAttachmentImport(importedImage);
				const completed = [readStatus()];
				const observer = new MutationObserver(() => { });
				store.add(toDisposable(() => observer.disconnect()));
				observer.observe(ariaHost, { childList: true, subtree: true });
				for (const button of [next, next, back, back, next, next]) {
					button.click();
					completed.push(readStatus());
				}
				assert.deepStrictEqual({
					requests, prevented: event.defaultPrevented, pending, partial, completed,
					text: container.querySelector('textarea')!.value,
					reviewText: container.querySelector('.review-description')?.textContent,
					images: overlay.getScreenshots().length,
					cards: attachments.querySelectorAll('.wizard-screenshot-card:not(.wizard-screenshot-add)').length,
					reviewCards: container.querySelectorAll('.review-attachment-card').length,
					step: container.querySelector('.wizard-step-indicator')?.textContent,
					textAnnouncement, attachmentAnnouncement: announcement(),
					navigationAnnouncements: observer.takeRecords().length,
				}, {
					requests: [2], prevented: true,
					pending: { text: 'Importing 2 file(s)...', hidden: false, inLayout: true, busy: 'true' },
					partial: { text: 'Importing 1 file(s)...', hidden: false, inLayout: true, busy: 'true' },
					completed: Array(7).fill({ text: '', hidden: true, inLayout: false, busy: 'false' }),
					text: 'Issue description\nUseful context', reviewText: 'Issue description\nUseful context',
					images: 2, cards: 2, reviewCards: 2, step: 'Step 3 of 3',
					textAnnouncement: ['Text added to the description.'], attachmentAnnouncement: ['Attachment added.'],
					navigationAnnouncements: 0,
				});
			});
		}

		test('does not intercept pastes or text-editing drops in other inputs', () => {
			const { overlay, container, back } = createRepositoryReporter();
			back.click();
			let requests = 0;
			store.add(overlay.onDidRequestAddAttachments(() => requests++));
			const title = container.querySelector<HTMLInputElement>('.wizard-title-field input')!;
			const pasted = paste(title, images(1), 'Title text');
			const transfer = new DataTransfer();
			transfer.setData('text/plain', 'Dropped text');
			transfer.items.add(images(1)[0]);
			const dropped = new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true });
			container.querySelector('textarea')!.dispatchEvent(dropped);
			assert.deepStrictEqual({ requests, pastePrevented: pasted.defaultPrevented, dropPrevented: dropped.defaultPrevented }, { requests: 0, pastePrevented: false, dropPrevented: false });
		});

		test('prevents file navigation outside the attachment step without importing the drop', () => {
			const { overlay, container } = createRepositoryReporter();
			let requests = 0;
			store.add(overlay.onDidRequestAddAttachments(() => requests++));
			const transfer = new DataTransfer();
			transfer.items.add(images(1)[0]);
			const event = new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true });
			container.querySelector('textarea')!.dispatchEvent(event);
			assert.deepStrictEqual({
				requests, prevented: event.defaultPrevented,
				status: container.querySelector('.wizard-attachment-status')?.textContent,
			}, { requests: 0, prevented: true, status: 'Drop files in the Attachments step, or paste them into the description.' });
		});

		test('reserves exactly five slots across concurrent multi-file requests and blocks preview while pending', () => {
			const { overlay, container, next } = createRepositoryReporter();
			const requested: number[] = [];
			store.add(overlay.onDidRequestAddAttachments(files => requested.push(files.length)));
			const description = container.querySelector('textarea')!;
			paste(description, images(4));
			paste(description, images(3));
			next.click();
			let submitted = false;
			store.add(overlay.onDidSubmit(() => submitted = true));
			next.click();
			assert.deepStrictEqual({
				requested, submitted, pending: container.querySelector('.wizard-screenshots')?.getAttribute('aria-busy'),
				previewDisabled: next.getAttribute('aria-disabled'),
				limit: container.querySelector('.wizard-attachment-status')?.textContent?.includes('up to 5'),
			}, { requested: [4, 1], submitted: false, pending: 'true', previewDisabled: 'true', limit: true });
			for (let index = 0; index < 5; index++) {
				overlay.completeAttachmentImport(importedImage);
			}
			assert.deepStrictEqual({
				images: overlay.getScreenshots().length,
				reviewCards: container.querySelectorAll('.review-thumbnails .review-attachment-card').length,
				pending: container.querySelector('.wizard-screenshots')?.getAttribute('aria-busy'),
				previewDisabled: next.getAttribute('aria-disabled'),
				limitStillVisible: container.querySelector('.wizard-attachment-status')?.textContent?.includes('up to 5'),
			}, { images: 5, reviewCards: 5, pending: 'false', previewDisabled: 'false', limitStillVisible: true });
		});

		test('includes a pending capture and active recording in the five-slot budget', () => {
			const { overlay, container } = createRepositoryReporter();
			overlay.restoreAttachments([importedImage.image, importedImage.image], []);
			overlay.setRecordingState(RecordingState.Recording);
			overlay.triggerCaptureScreenshot();
			const requested: number[] = [];
			store.add(overlay.onDidRequestAddAttachments(files => requested.push(files.length)));
			paste(container.querySelector('textarea')!, images(2));
			overlay.completeAttachmentImport(importedImage);
			overlay.addScreenshot(importedImage.image);
			overlay.completeScreenshotCapture();
			overlay.addRecording('/recording.mp4', 500);
			overlay.setRecordingState(RecordingState.Idle);
			assert.deepStrictEqual({ requested, screenshots: overlay.getScreenshots().length, recordings: overlay.getRecordings().length }, { requested: [1], screenshots: 4, recordings: 1 });
		});

		test('rejects unsupported and empty media explicitly while accepting the valid file', () => {
			const { overlay, container } = createRepositoryReporter();
			const requested: string[] = [];
			store.add(overlay.onDidRequestAddAttachments(files => requested.push(...files.map(file => file.name))));
			paste(container.querySelector('textarea')!, [
				new File(['text'], 'notes.txt', { type: 'text/plain' }),
				new File([], 'empty.png', { type: 'image/png' }),
				...images(1),
			]);
			overlay.completeAttachmentImport(importedImage);
			const status = container.querySelector<HTMLElement>('.wizard-attachment-status')!;
			assert.deepStrictEqual({
				requested,
				unsupported: status.textContent?.includes('Cannot attach notes.txt.'),
				empty: status.textContent?.includes('file is empty'),
				images: overlay.getScreenshots().length,
				successMessage: status.textContent?.includes('Attached 1'),
				hidden: status.hidden,
				live: status.getAttribute('role'),
			}, { requested: ['image-0.png'], unsupported: true, empty: true, images: 1, successMessage: false, hidden: false, live: 'status' });
		});

		test('reports a failed decode without adding a blank card and releases the reservation', () => {
			const { overlay, container } = createRepositoryReporter();
			paste(container.querySelector('textarea')!, images(1));
			const accepted = overlay.completeAttachmentImport(undefined, 'The image could not be decoded.');
			assert.deepStrictEqual({
				accepted, screenshots: overlay.getScreenshots(), recordings: overlay.getRecordings(),
				pending: container.querySelector('.wizard-screenshots')?.getAttribute('aria-busy'),
				status: container.querySelector('.wizard-attachment-status')?.textContent,
			}, { accepted: false, screenshots: [], recordings: [], pending: 'false', status: 'The image could not be decoded.' });
		});

		test('opens and removes imported videos using the keyboard', () => {
			const { overlay, container, back } = createRepositoryReporter();
			back.click();
			paste(container.querySelector<HTMLElement>('.wizard-screenshots')!, [new File(['video'], 'clip.mp4', { type: 'video/mp4' })]);
			overlay.completeAttachmentImport({ kind: 'video', video: { filePath: '/owned/clip.mp4', durationMs: 1234, width: 48, height: 32, thumbnailDataUrl: importedImage.image.dataUrl } });
			const opened: string[] = [];
			store.add(overlay.onDidRequestOpenRecording(path => opened.push(path)));
			const card = container.querySelector<HTMLElement>('.wizard-recording-card')!;
			card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
			const remove = card.querySelector<HTMLElement>('.wizard-screenshot-delete')!;
			remove.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
			assert.deepStrictEqual({ opened, recordings: overlay.getRecordings(), focusRestored: document.activeElement === container.querySelector('.wizard-screenshots') }, { opened: ['/owned/clip.mp4'], recordings: [], focusRestored: true });
		});

		test('labels an unavailable video duration rather than showing a fabricated zero', () => {
			const { overlay, container, back } = createRepositoryReporter();
			back.click();
			paste(container.querySelector<HTMLElement>('.wizard-screenshots')!, [new File(['video'], 'clip.webm', { type: 'video/webm' })]);
			overlay.completeAttachmentImport({ kind: 'video', video: { filePath: '/owned/clip.webm', width: 48, height: 32, thumbnailDataUrl: importedImage.image.dataUrl } });
			assert.strictEqual(container.querySelector('.wizard-recording-duration')?.textContent, 'Unknown duration');
		});

		test('ignores late completions and detaches event listeners after disposal', () => {
			const { overlay, container } = createRepositoryReporter();
			const description = container.querySelector('textarea')!;
			let requests = 0;
			store.add(overlay.onDidRequestAddAttachments(() => requests++));
			paste(description, images(1));
			overlay.dispose();
			const attached = overlay.completeAttachmentImport(importedImage);
			const late = paste(description, images(1));
			assert.deepStrictEqual({ requests, attached, screenshots: overlay.getScreenshots(), claimedLatePaste: late.defaultPrevented }, { requests: 1, attached: false, screenshots: [], claimedLatePaste: false });
		});

		test('rejects imports during upload and keeps a pending import dirty after preview', () => {
			const { overlay, container } = createRepositoryReporter();
			overlay.markPreviewOpened();
			paste(container.querySelector('textarea')!, images(1));
			const dirty = overlay.hasUnsavedChanges();
			overlay.completeAttachmentImport(importedImage);
			overlay.setUploading(true);
			let requests = 0;
			store.add(overlay.onDidRequestAddAttachments(() => requests++));
			paste(container.querySelector('textarea')!, images(1));
			assert.deepStrictEqual({
				dirty, requests, screenshots: overlay.getScreenshots().length,
				status: container.querySelector('.wizard-attachment-status')?.textContent,
			}, { dirty: true, requests: 0, screenshots: 1, status: 'Wait for the current upload to finish before adding attachments.' });
		});
	});

	for (const additionalRepositories of [undefined, [], ['microsoft/vscode', 'MICROSOFT/VSCODE']]) {
		test(`does not reveal a useless repository menu for ${JSON.stringify(additionalRepositories)}`, () => {
			const { container, data } = createRepositoryReporter({ additionalRepositories });
			assert.deepStrictEqual({
				menu: !!container.querySelector('.issue-reporter-repository-picker'),
				section: !!container.querySelector('.wizard-repository-field'),
				target: container.querySelector('.wizard-target-status')?.textContent,
			}, { menu: false, section: false, target: `Issue will be opened in ${getSelectedRepository(data)}` });
		});
	}

	test('Agents Window is an issue source, not an implicit private repository selection', () => {
		const { container, data } = createRepositoryReporter({
			isSessionsWindow: true, issueSource: undefined, additionalRepositories: ['owner/second'],
		});
		assert.deepStrictEqual({
			source: data.issueSource,
			destination: data.issueRepository,
			menu: !!container.querySelector('.issue-reporter-repository-picker'),
			target: container.querySelector('.wizard-target-status')?.textContent,
		}, { source: IssueSource.AgentsWindow, destination: undefined, menu: true, target: `Issue will be opened in ${getSelectedRepository(data)}` });
	});

	test('late extension reporter overrides do not replace the selected product destination', async () => {
		const pending = new DeferredPromise<IssueReporterData | undefined>();
		const extension = {
			id: 'publisher.extension', name: 'extension', displayName: 'Extension', publisher: 'publisher',
			version: '1', isTheme: false, isBuiltin: false,
			bugsUrl: 'https://github.com/publisher/extension/issues', repositoryUrl: undefined,
		};
		const { container, data, selectRepository } = createRepositoryReporter({
			uri: URI.parse('https://github.com/microsoft/vscode'),
			privateUri: URI.parse(internalIssueReporterUrl),
			enabledExtensions: [extension],
		}, () => pending.p);
		await selectRepository('microsoft/vscode-internalbacklog');
		container.querySelector<HTMLElement>('[data-source="extension"]')!.click();
		const select = container.querySelector<HTMLSelectElement>('.wizard-extension-field select')!;
		select.selectedIndex = 1;
		select.dispatchEvent(new Event('change'));
		container.querySelector<HTMLElement>('[data-source="vscode"]')!.click();
		const extensionUrl = 'https://github.com/publisher/custom/issues/new?labels=bug';
		await pending.complete({ ...data, uri: URI.parse(extensionUrl), privateUri: undefined });
		const productTarget = resolveIssueReporterTarget(data, product)?.url;
		container.querySelector<HTMLElement>('[data-source="extension"]')!.click();
		await Promise.resolve();
		assert.deepStrictEqual({
			productTarget,
			extensionTarget: resolveIssueReporterTarget(data, product)?.url,
			hidden: !container.querySelector('.issue-reporter-repository-picker'),
			productUri: URI.revive(data.uri)?.toString(),
			productPrivateUri: URI.revive(data.privateUri)?.toString(),
			destination: data.issueRepository,
		}, {
			productTarget: internalIssueReporterUrl,
			extensionTarget: extensionUrl,
			hidden: true,
			productUri: 'https://github.com/microsoft/vscode',
			productPrivateUri: internalIssueReporterUrl,
			destination: 'microsoft/vscode-internalbacklog',
		});
	});

	test('offers ordered inline alternatives and preserves the third repository through navigation and model updates', () => runWithFakedTimers({}, async () => {
		const { overlay, container, data, searches, next, back, getMenu, selectRepository } = createRepositoryReporter({
			additionalRepositories: ['MICROSOFT/VSCODE', 'owner/second', 'team/third', 'TEAM/THIRD'],
		});
		const productRepository = getSelectedRepository(data);
		const trigger = container.querySelector<HTMLElement>('.issue-reporter-repository-picker')!;
		trigger.focus();
		trigger.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
		const initial = {
			actions: getMenu()?.getActions().map(action => ({ label: action.label, checked: action.checked })),
			expanded: trigger.getAttribute('aria-expanded'),
			role: trigger.getAttribute('role'),
			popup: trigger.getAttribute('aria-haspopup'),
			label: trigger.getAttribute('aria-label'),
			section: !!container.querySelector('.wizard-repository-field'),
		};
		getMenu()?.onHide?.(true);
		await selectRepository('team/third');
		const focusRestored = document.activeElement === container.querySelector('.issue-reporter-repository-picker');
		back.click();
		next.click();
		next.click();
		overlay.updateModel({ versionInfo: { vscodeVersion: 'test', os: 'test' } });
		await timeout(301);
		let submission: { title: string; body: string } | undefined;
		store.add(overlay.onDidSubmit(event => submission = event));
		next.click();
		assert.deepStrictEqual({
			initial, focusRestored,
			destination: data.issueRepository,
			url: resolveIssueReporterTarget(data, product)?.url,
			status: container.querySelector('.wizard-target-status')?.textContent,
			review: container.querySelector('.wizard-review-repository .review-value')?.textContent,
			bodyHasRepository: submission?.body.includes('team/third'),
			searches,
			searchStatus: container.querySelector('.wizard-similar-status')?.textContent,
		}, {
			initial: {
				actions: [
					{ label: productRepository, checked: true }, { label: 'owner/second', checked: false }, { label: 'team/third', checked: false },
				],
				expanded: 'true', role: 'button', popup: 'menu', label: `Choose Issue Repository: ${productRepository}`, section: false,
			},
			focusRestored: true,
			destination: 'team/third',
			url: 'https://github.com/team/third/issues/new',
			status: 'Issue will be opened in team/third',
			review: 'team/third',
			bodyHasRepository: true,
			searches: [],
			searchStatus: 'Similar issues were not searched because this repository may be private.',
		});
	}));

	test('preserves the product repository choice when switching sources and invalidates old previews', async () => {
		const { overlay, container, data, next, back, selectRepository } = createRepositoryReporter({ additionalRepositories: ['owner/second', 'team/third'] });
		await selectRepository('owner/second');
		container.querySelector<HTMLElement>('[data-source="marketplace"]')!.click();
		const marketplace = {
			hidden: !container.querySelector('.issue-reporter-repository-picker'),
			url: resolveIssueReporterTarget(data, product)?.url,
		};
		container.querySelector<HTMLElement>('[data-source="vscode"]')!.click();
		const restored = data.issueRepository;
		next.click();
		overlay.markPreviewOpened();
		const previouslyPreviewed = overlay.hasUnsavedChanges();
		back.click();
		await selectRepository('team/third');
		assert.deepStrictEqual({
			marketplace, restored, previouslyPreviewed,
			destination: data.issueRepository,
			changed: overlay.hasUnsavedChanges(),
		}, {
			marketplace: { hidden: true, url: product.reportMarketplaceIssueUrl ?? product.reportIssueUrl },
			restored: 'owner/second', previouslyPreviewed: false,
			destination: 'team/third', changed: true,
		});
	});

	test('explicitly private diagnostics cannot silently become public or run public searches', () => runWithFakedTimers({}, async () => {
		const { container, data, searches, next } = createRepositoryReporter({
			uri: URI.parse(internalIssueReporterUrl), privateUri: URI.parse(internalIssueReporterUrl), additionalRepositories: ['owner/second'],
		});
		next.click();
		await timeout(301);
		assert.deepStrictEqual({
			hidden: !container.querySelector('.issue-reporter-repository-picker'),
			target: resolveIssueReporterTarget(data, product)?.url,
			review: container.querySelector('.wizard-review-repository .review-value')?.textContent,
			searches,
		}, {
			hidden: true, target: internalIssueReporterUrl,
			review: 'microsoft/vscode-internalbacklog',
			searches: [],
		});
	}));

	test('an explicit unrelated override is displayed without sending its title to anonymous search', () => runWithFakedTimers({}, async () => {
		const { container, searches, next } = createRepositoryReporter({
			uri: URI.parse('https://github.com/owner/custom'), privateUri: URI.parse(internalIssueReporterUrl),
		});
		next.click();
		await timeout(301);
		assert.deepStrictEqual({
			hidden: !container.querySelector('.issue-reporter-repository-picker'),
			review: container.querySelector('.wizard-review-repository .review-value')?.textContent,
			searches,
		}, { hidden: true, review: 'owner/custom', searches: [] });
	}));

	test('switching to an unknown repository aborts public duplicate search without a late anonymous fallback', () => runWithFakedTimers({}, async () => {
		const pending = new DeferredPromise<Response>();
		let signal: AbortSignal | null | undefined;
		const { container, searches, next, back, selectRepository } = createRepositoryReporter({ additionalRepositories: ['owner/private'] }, undefined, async (_url, init) => {
			signal = init?.signal;
			return pending.p;
		});
		next.click();
		await timeout(301);
		back.click();
		await selectRepository('owner/private');
		next.click();
		await pending.complete(new Response('{"candidates":[]}'));
		await timeout(301);
		assert.deepStrictEqual({
			aborted: signal?.aborted, searches,
			status: container.querySelector('.wizard-similar-status')?.textContent,
		}, { aborted: true, searches: [], status: 'Similar issues were not searched because this repository may be private.' });
	}));

	for (const action of ['back', 'dispose'] as const) {
		test(`stops a public issue search on ${action} and ignores its late result`, () => runWithFakedTimers({}, async () => {
			const pending = new DeferredPromise<readonly ISimilarIssue[]>();
			const calls: { repo: string; title: string; signal: AbortSignal }[] = [];
			const container = document.createElement('div');
			const overlay = store.add(new IssueReporterOverlay({
				styles: {}, zoomLevel: 0, enabledExtensions: [], restrictedMode: false,
				isInstallationPure: true, isSessionsWindow: false, githubAccessToken: '',
				issueType: IssueType.Bug, issueSource: IssueSource.Marketplace,
				issueTitle: 'Public search', issueBody: 'Issue description',
			}, false, container, new TestContextViewService(), (repo, title, signal) => {
				calls.push({ repo, title, signal });
				return pending.p;
			}));
			overlay.show();
			const next = container.querySelector<HTMLElement>('.wizard-next');
			assert.ok(next);
			next.click();
			next.click();
			await timeout(300);
			if (action === 'dispose') {
				overlay.dispose();
			} else {
				const back = container.querySelector<HTMLElement>('.wizard-back');
				assert.ok(back);
				back.click();
			}
			await pending.complete([{ html_url: 'https://github.com/owner/repo/issues/1', title: 'Late search result' }]);
			await timeout(0);
			assert.deepStrictEqual({
				calls: calls.map(call => ({ title: call.title, aborted: call.signal.aborted })),
				lateResultVisible: container.textContent?.includes('Late search result'),
			}, { calls: [{ title: 'Public search', aborted: true }], lateResultVisible: false });
		}));
	}

	test('leaving review cancels a search still waiting for its debounce', () => runWithFakedTimers({}, async () => {
		let calls = 0;
		const container = document.createElement('div');
		const overlay = store.add(new IssueReporterOverlay({
			styles: {}, zoomLevel: 0, enabledExtensions: [], restrictedMode: false,
			isInstallationPure: true, isSessionsWindow: false, githubAccessToken: '',
			issueType: IssueType.Bug, issueSource: IssueSource.Marketplace,
			issueTitle: 'Public search', issueBody: 'Issue description',
		}, false, container, new TestContextViewService(), async () => { calls++; return []; }));
		overlay.show();
		const next = container.querySelector<HTMLElement>('.wizard-next');
		const back = container.querySelector<HTMLElement>('.wizard-back');
		assert.ok(next && back);
		next.click();
		next.click();
		back.click();
		await timeout(301);
		assert.strictEqual(calls, 0);
	}));

	const createScreenshotReporter = () => {
		const container = document.createElement('div');
		const overlay = store.add(new IssueReporterOverlay({
			styles: {},
			zoomLevel: 0,
			enabledExtensions: [],
			restrictedMode: false,
			isInstallationPure: true,
			isSessionsWindow: false,
			githubAccessToken: '',
		}, false, container, new TestContextViewService(), async () => []));
		overlay.show();
		const canvas = document.createElement('canvas');
		const screenshot = { dataUrl: canvas.toDataURL(), width: canvas.width, height: canvas.height };
		return { overlay, container, screenshot };
	};

	const closeAnnotation = (container: HTMLElement, action: 'Save' | 'Discard') => {
		const editor = Array.from(container.querySelectorAll('.issue-reporter-annotation-overlay')).at(-1)!;
		const button = Array.from(editor.querySelectorAll<HTMLElement>('.monaco-button')).find(button => button.textContent === action)!;
		button.click();
	};

	for (const action of ['Save', 'Discard'] as const) {
		test(`releases closed annotation editors after ${action}`, () => {
			const { overlay, container, screenshot } = createScreenshotReporter();
			const disposeSpy = spy(ScreenshotAnnotationEditor.prototype, 'dispose');
			try {
				overlay.addScreenshot(screenshot);
				closeAnnotation(container, action);
				disposeSpy.resetHistory();
				overlay.dispose();
				assert.strictEqual(disposeSpy.callCount, 0, 'The reporter must no longer own a closed annotation editor');
			} finally {
				disposeSpy.restore();
			}
		});
	}

	test('keeps lower annotation editors open until the reporter closes', () => {
		const { overlay, container, screenshot } = createScreenshotReporter();
		const disposeSpy = spy(ScreenshotAnnotationEditor.prototype, 'dispose');
		try {
			overlay.addScreenshot(screenshot);
			overlay.addScreenshot({ ...screenshot });
			closeAnnotation(container, 'Discard');
			const remainingEditors = container.querySelectorAll('.issue-reporter-annotation-overlay').length;
			disposeSpy.resetHistory();
			overlay.dispose();
			assert.deepStrictEqual({ remainingEditors, disposedEditors: disposeSpy.callCount }, { remainingEditors: 1, disposedEditors: 1 });
		} finally {
			disposeSpy.restore();
		}
	});

	test('removes listeners from replaced screenshot thumbnails', () => {
		const { overlay, container, screenshot } = createScreenshotReporter();
		overlay.restoreAttachments([screenshot], []);
		const oldCard = container.querySelector<HTMLElement>('.wizard-screenshot-card')!;
		overlay.restoreAttachments([screenshot], []);
		oldCard.click();
		const afterOldCard = container.querySelectorAll('.issue-reporter-annotation-overlay').length;
		container.querySelector<HTMLElement>('.wizard-screenshot-card')!.click();
		const afterCurrentCard = container.querySelectorAll('.issue-reporter-annotation-overlay').length;
		assert.deepStrictEqual({ afterOldCard, afterCurrentCard }, { afterOldCard: 0, afterCurrentCard: 1 });
	});

	test('stops responding to issue data requests after disposal', async () => {
		const overlay = store.add(new IssueReporterOverlay(
			{
				styles: {},
				zoomLevel: 0,
				enabledExtensions: [],
				restrictedMode: false,
				isInstallationPure: true,
				isSessionsWindow: false,
				githubAccessToken: '',
				issueTitle: 'Screenshot annotation',
			},
			false,
			document.createElement('div'),
			new TestContextViewService(),
			async () => []
		));
		overlay.updateModel({ issueDescription: 'An annotated screenshot report' });

		const requestIssueData = (): Promise<{ issueTitle: string; issueBody: string }[]> => new Promise(resolve => {
			const responses: { issueTitle: string; issueBody: string }[] = [];
			const listener = store.add(addDisposableListener(mainWindow, 'message', event => {
				if (event.data?.replyChannel === 'vscode:triggerIssueDataResponse') {
					responses.push(event.data.data);
				} else if (event.data === 'issue-reporter-test-barrier') {
					listener.dispose();
					resolve(responses);
				}
			}));
			mainWindow.dispatchEvent(new MessageEvent('message', { data: { sendChannel: 'vscode:triggerIssueData' } }));
			// Drain replies queued by the synchronous request before checking their count.
			mainWindow.postMessage('issue-reporter-test-barrier', '*');
		});

		const before = await requestIssueData();
		overlay.dispose();
		const after = await requestIssueData();
		assert.deepStrictEqual({ before, after }, {
			before: [{ issueTitle: 'Screenshot annotation', issueBody: 'An annotated screenshot report' }],
			after: [],
		});
	});

	test('includes standalone extension data in a VS Code issue', () => {
		const container = document.createElement('div');
		const overlay = store.add(new IssueReporterOverlay(
			{
				styles: {},
				zoomLevel: 0,
				enabledExtensions: [],
				restrictedMode: false,
				isInstallationPure: true,
				isSessionsWindow: false,
				githubAccessToken: '',
				issueType: IssueType.Bug,
				issueSource: IssueSource.VSCode,
				issueTitle: 'NES feedback',
				issueBody: 'Please describe the expected outcome.',
				data: nesContext,
			},
			false,
			container,
			new TestContextViewService(),
			async () => []
		));
		overlay.show();

		const nextButton = container.querySelector<HTMLElement>('.wizard-next');
		if (!nextButton) {
			throw new Error('Next button not found');
		}

		nextButton.click();
		nextButton.click();

		let submission: { title: string; body: string } | undefined;
		store.add(overlay.onDidSubmit(event => submission = event));
		nextButton.click();

		assert.deepStrictEqual(submission && {
			title: submission.title,
			hasExtensionDataSection: submission.body.includes(`<details>
<summary>Extension Data</summary>

${nesContext}

</details>`),
		}, {
			title: 'NES feedback',
			hasExtensionDataSection: true,
		});
	});

	test('extracts nested NES details as one issue data attachment', () => {
		const extensionDataSection = `<details>
<summary>Extension Data</summary>

${nesContext}

</details>`;
		const systemInfoSection = `<details>
<summary>System Info</summary>

|Item|Value|
|---|---|
|OS|Test OS|
</details>`;

		assert.deepStrictEqual(extractIssueData(`### Description

NES feedback

${extensionDataSection}

${systemInfoSection}

<!-- generated by issue reporter -->`), {
			body: `### Description

NES feedback

<!-- generated by issue reporter -->`,
			fileContent: `# Issue Data

${extensionDataSection}

${systemInfoSection}
`,
		});
	});
});
