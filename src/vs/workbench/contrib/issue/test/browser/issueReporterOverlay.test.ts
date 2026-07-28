/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextViewDelegate, IContextViewService, IOpenContextView } from '../../../../../platform/contextview/browser/contextView.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { extractIssueData } from '../../browser/issueFormService.js';
import { IssueReporterOverlay } from '../../browser/issueReporterOverlay.js';
import { IssueSource, IssueType } from '../../common/issue.js';

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

	function createOverlay(container: HTMLElement): IssueReporterOverlay {
		return store.add(new IssueReporterOverlay(
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
			},
			false,
			container,
			new TestContextViewService()
		));
	}

	function dispatchPaste(target: HTMLElement, files: readonly File[]): Event {
		const event = new Event('paste', { bubbles: true, cancelable: true });
		Object.defineProperty(event, 'clipboardData', { value: { files } });
		target.dispatchEvent(event);
		return event;
	}

	test('shows the full issue form on one page', () => {
		const container = document.createElement('div');
		const overlay = createOverlay(container);
		overlay.show();

		assert.deepStrictEqual({
			sectionCount: container.querySelectorAll('.issue-reporter-section').length,
			hasComposeSection: Boolean(container.querySelector('.issue-reporter-compose-section')),
			hasAttachmentsSection: Boolean(container.querySelector('.wizard-attachments-step')),
			hasSupportingInformationSection: Boolean(container.querySelector('.wizard-step-review')),
			hasProgressIndicator: Boolean(container.querySelector('.wizard-progress-area')),
			hasBackButton: Boolean(container.querySelector('.wizard-back')),
			submitLabel: container.querySelector<HTMLElement>('.wizard-next')?.textContent,
		}, {
			sectionCount: 3,
			hasComposeSection: true,
			hasAttachmentsSection: true,
			hasSupportingInformationSection: true,
			hasProgressIndicator: false,
			hasBackButton: false,
			submitLabel: 'Preview on GitHub',
		});
	});

	test('switches the description between write and preview modes', () => {
		const container = document.createElement('div');
		const overlay = createOverlay(container);
		overlay.show();

		const textarea = container.querySelector<HTMLTextAreaElement>('.wizard-textarea');
		const preview = container.querySelector<HTMLElement>('.issue-reporter-markdown-preview');
		const modeButtons = container.querySelectorAll<HTMLButtonElement>('.issue-reporter-markdown-mode');
		assert.ok(textarea);
		assert.ok(preview);

		textarea.value = '**Rendered issue details**';
		modeButtons[1].click();
		const previewState = {
			modeButtonCount: modeButtons.length,
			textareaHidden: textarea.classList.contains('hidden'),
			previewHidden: preview.classList.contains('hidden'),
			previewText: preview.textContent,
		};

		modeButtons[0].click();
		assert.deepStrictEqual({
			previewState,
			writeState: {
				textareaHidden: textarea.classList.contains('hidden'),
				previewHidden: preview.classList.contains('hidden'),
			},
		}, {
			previewState: {
				modeButtonCount: 2,
				textareaHidden: true,
				previewHidden: false,
				previewText: '**Rendered issue details**',
			},
			writeState: {
				textareaHidden: false,
				previewHidden: true,
			},
		});
	});

	test('reviews issue quality and applies a localized suggestion', () => {
		const container = document.createElement('div');
		const overlay = createOverlay(container);
		overlay.show();

		const textarea = container.querySelector<HTMLTextAreaElement>('.wizard-textarea');
		const reviewButton = container.querySelector<HTMLElement>('.issue-reporter-quality-review-button');
		assert.ok(textarea);
		assert.ok(reviewButton);
		textarea.value = 'It does a bad thing.';
		textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));

		let request: { title: string; description: string } | undefined;
		store.add(overlay.onDidRequestIssueQualityReview(event => request = event));
		reviewButton.click();
		overlay.setIssueQualityReview({
			summary: 'The report needs one clearer phrase.',
			diagnostics: [{
				target: 'description',
				severity: 'warning',
				message: 'Describe the observable behavior instead of calling it bad.',
				start: 10,
				end: 13,
				replacement: 'unexpected',
			}],
		});

		const applyButton = Array.from(container.querySelectorAll<HTMLElement>('.issue-reporter-quality-actions .monaco-button'))
			.find(button => button.textContent?.includes('Apply suggestion'));
		assert.ok(applyButton);
		applyButton.click();

		assert.deepStrictEqual({
			request,
			description: textarea.value,
			status: container.querySelector('.issue-reporter-quality-status')?.textContent,
			diagnosticCount: container.querySelectorAll('.issue-reporter-quality-diagnostic').length,
		}, {
			request: {
				title: '',
				description: 'It does a bad thing.',
			},
			description: 'It does a unexpected thing.',
			status: 'Suggestion applied. Review the issue again to refresh diagnostics.',
			diagnosticCount: 0,
		});
	});

	test('accepts pasted image and video attachments on the attachments step', () => {
		const container = document.createElement('div');
		const overlay = createOverlay(container);
		overlay.show();

		const requests: { files: readonly File[]; source: string }[] = [];
		store.add(overlay.onDidRequestAddAttachments(event => requests.push(event)));
		const target = container.querySelector<HTMLElement>('.wizard-attachments-step');
		assert.ok(target);

		const image = new File(['image'], 'screenshot.png', { type: 'image/png' });
		const video = new File(['video'], 'recording.mp4', { type: 'video/mp4' });
		const text = new File(['text'], 'notes.txt', { type: 'text/plain' });
		const pasteEvent = dispatchPaste(target, [image, video, text]);

		assert.strictEqual(pasteEvent.defaultPrevented, true);
		assert.deepStrictEqual(requests[0] && {
			source: requests[0].source,
			files: requests[0].files.map(file => file.name),
		}, {
			source: 'attachments',
			files: ['screenshot.png', 'recording.mp4'],
		});
	});

	test('accepts dragged image attachments and shows drop feedback', () => {
		const container = document.createElement('div');
		const overlay = createOverlay(container);
		overlay.show();

		const requests: { files: readonly File[]; source: string }[] = [];
		store.add(overlay.onDidRequestAddAttachments(event => requests.push(event)));
		const target = container.querySelector<HTMLElement>('.wizard-attachments-step');
		assert.ok(target);

		const dataTransfer = new DataTransfer();
		dataTransfer.items.add(new File(['image'], 'dragged.png', { type: 'image/png' }));
		const dragOverEvent = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer });
		target.dispatchEvent(dragOverEvent);
		assert.strictEqual(dragOverEvent.defaultPrevented, true);
		assert.strictEqual(target.classList.contains('drag-over'), true);

		const dropEvent = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer });
		target.dispatchEvent(dropEvent);
		assert.strictEqual(dropEvent.defaultPrevented, true);
		assert.strictEqual(target.classList.contains('drag-over'), false);
		assert.deepStrictEqual(requests[0] && {
			source: requests[0].source,
			files: requests[0].files.map(file => file.name),
		}, {
			source: 'attachments',
			files: ['dragged.png'],
		});
	});

	test('accepts pasted images from the description without swallowing text-only paste', () => {
		const container = document.createElement('div');
		const overlay = createOverlay(container);
		overlay.show();

		const requests: { files: readonly File[]; source: string }[] = [];
		store.add(overlay.onDidRequestAddAttachments(event => requests.push(event)));
		const description = container.querySelector<HTMLElement>('.wizard-textarea');
		assert.ok(description);

		const textPasteEvent = dispatchPaste(description, []);
		assert.strictEqual(textPasteEvent.defaultPrevented, false);
		assert.strictEqual(requests.length, 0);

		const imagePasteEvent = dispatchPaste(description, [new File(['image'], 'clipboard.png', { type: 'image/png' })]);
		assert.strictEqual(imagePasteEvent.defaultPrevented, true);
		assert.deepStrictEqual(requests[0] && {
			source: requests[0].source,
			files: requests[0].files.map(file => file.name),
		}, {
			source: 'description',
			files: ['clipboard.png'],
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
			new TestContextViewService()
		));
		overlay.show();

		const nextButton = container.querySelector<HTMLElement>('.wizard-next');
		if (!nextButton) {
			throw new Error('Next button not found');
		}

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
