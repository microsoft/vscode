/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy } from 'sinon';
import { addDisposableListener } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { IContextViewDelegate, IContextViewService, IOpenContextView } from '../../../../../platform/contextview/browser/contextView.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { extractIssueData } from '../../browser/issueFormService.js';
import { IssueReporterOverlay } from '../../browser/issueReporterOverlay.js';
import { ScreenshotAnnotationEditor } from '../../browser/screenshotAnnotation.js';
import { ISimilarIssue, IssueSource, IssueType } from '../../common/issue.js';

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
