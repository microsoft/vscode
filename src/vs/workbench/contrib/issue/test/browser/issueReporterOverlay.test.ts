/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { addDisposableListener } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
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
			new TestContextViewService()
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
