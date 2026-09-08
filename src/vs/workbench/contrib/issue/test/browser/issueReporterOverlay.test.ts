/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy } from 'sinon';
import { IContextViewDelegate, IContextViewService, IOpenContextView } from '../../../../../platform/contextview/browser/contextView.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { extractIssueData } from '../../browser/issueFormService.js';
import { IssueReporterOverlay } from '../../browser/issueReporterOverlay.js';
import { ScreenshotAnnotationEditor } from '../../browser/screenshotAnnotation.js';
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
		}, false, container, new TestContextViewService()));
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
