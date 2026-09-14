/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { buildSemanticDiffReport, formatSemanticDiffReport, ISemanticDiffAnalysis, ISemanticDiffReport, validateSemanticDiffReport } from '../../../../../../../platform/agentHost/common/semanticDiff.js';
import { createSemanticDiffExample } from '../../../../../../../platform/agentHost/test/common/semanticDiffFixtures.js';
import { getToolSpecificDataDescription } from '../../../../browser/accessibility/chatResponseAccessibleView.js';
import { ChatSemanticDiffResultSubPart, projectSemanticDiffGroups } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatSemanticDiffResultSubPart.js';
import { shouldRenderSemanticDiffResult } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolInvocationPart.js';
import { IChatSemanticDiffData, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';

suite('ChatSemanticDiffResultSubPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function reportFor(analysis: ISemanticDiffAnalysis): ISemanticDiffReport {
		const result = buildSemanticDiffReport({ schemaVersion: 1, analysis });
		assert.ok(result.ok, JSON.stringify(result));
		return result.report;
	}

	function render(report = createSemanticDiffExample(), owner: object = {}, toolCallId = 'classification'): ChatSemanticDiffResultSubPart {
		const data: IChatSemanticDiffData = { kind: 'semanticDiff', result: { ok: true, report } };
		const invocation = upcastPartial<IChatToolInvocationSerialized>({ kind: 'toolInvocationSerialized', toolCallId, isComplete: true, toolSpecificData: data });
		const part = store.add(new ChatSemanticDiffResultSubPart(invocation, data, owner, false));
		dom.append(document.body, part.domNode);
		store.add(toDisposable(() => part.domNode.remove()));
		return part;
	}

	function button(parent: HTMLElement, selector: string): HTMLElement {
		const element = parent.querySelector<HTMLElement>(selector);
		assert.ok(element, selector);
		return element;
	}

	function panel(control: HTMLElement): HTMLElement {
		const element = document.getElementById(control.getAttribute('aria-controls')!);
		assert.ok(element);
		return element;
	}

	function activate(parent: HTMLElement, selector: string): HTMLElement {
		const control = button(parent, selector);
		control.click();
		return panel(control);
	}

	teardown(() => {
		document.getSelection()?.removeAllRanges();
	});

	test('projects the exact example by intent, preserving order and per-group counts', () => {
		const report = createSemanticDiffExample();
		const projections = projectSemanticDiffGroups(report.analysis);
		assert.deepStrictEqual({
			groups: projections.map(({ group, files, hunks }) => ({
				title: group.title,
				files: files.map(file => file.file.path),
				hunks: hunks.length,
				additions: hunks.reduce((sum, hunk) => sum + hunk.additions, 0),
				deletions: hunks.reduce((sum, hunk) => sum + hunk.deletions, 0),
			})),
			uniqueFiles: report.summary.files,
		}, {
			groups: [
				{ title: 'Prevent negative billing totals', files: ['src/billing/calculateTotal.js', 'src/billing/discountEngine.js', 'src/billing/calculateTotal.test.js'], hunks: 4, additions: 12, deletions: 5 },
				{ title: 'Standardize the internal quantity field', files: ['src/billing/calculateTotal.js', 'src/billing/invoice.js'], hunks: 2, additions: 2, deletions: 2 },
				{ title: 'Upgrade lodash to 4.17.21', files: ['package.json', 'package-lock.json'], hunks: 2, additions: 3, deletions: 3 },
			],
			uniqueFiles: 6,
		});
	});

	test('starts collapsed and lazily renders file and hunk detail DOM', () => {
		const part = render();
		const initial = {
			cards: part.domNode.querySelectorAll('.semantic-diff-card').length,
			files: part.domNode.querySelectorAll('.semantic-diff-file').length,
			hunks: part.domNode.querySelectorAll('.semantic-diff-hunk').length,
		};
		const files = activate(part.domNode, '.semantic-diff-group-toggle');
		const billing = activate(files, '.semantic-diff-file-toggle');
		assert.deepStrictEqual({
			initial,
			files: files.querySelectorAll('.semantic-diff-file').length,
			hunks: billing.querySelectorAll('.semantic-diff-hunk').length,
			ranges: [...billing.querySelectorAll('.semantic-diff-ranges')].map(range => range.textContent),
			mixedLabels: [...billing.querySelectorAll('.semantic-diff-hunk')].map(hunk => [...hunk.querySelectorAll('.semantic-diff-type')].map(label => label.textContent)),
			nestedButtons: part.domNode.querySelectorAll('[role="button"] [role="button"], button button').length,
		}, {
			initial: { cards: 3, files: 0, hunks: 0 },
			files: 3,
			hunks: 2,
			ranges: ['Old: lines 1-5; New: lines 1-5', 'Old: lines 10-12; New: lines 10-13'],
			mixedLabels: [['Supporting'], ['Logic', 'Also supporting']],
			nestedButtons: 0,
		});
	});

	test('labels the old insertion anchor and new source range unambiguously', () => {
		const part = render();
		const files = activate(part.domNode, '.semantic-diff-group-toggle');
		const testsFile = files.querySelectorAll<HTMLElement>('.semantic-diff-file-toggle')[2];
		testsFile.click();
		assert.strictEqual(button(panel(testsFile), '.semantic-diff-ranges').textContent, 'Old: insertion after line 40; New: lines 41-45');
	});

	test('body expands only, explicit controls toggle, and independent cards retain state', () => {
		const part = render();
		const card = button(part.domNode, '.semantic-diff-card');
		const control = button(card, '.semantic-diff-group-toggle');
		card.click();
		card.click();
		const afterBodyClicks = control.getAttribute('aria-expanded');
		const filePanel = activate(card, '.semantic-diff-file-toggle');
		activate(filePanel, '.semantic-diff-rationale-toggle');
		control.click();
		const hidden = panel(control).hidden;
		control.click();
		const second = part.domNode.querySelectorAll<HTMLElement>('.semantic-diff-group-toggle')[1];
		second.click();
		assert.deepStrictEqual({
			afterBodyClicks,
			hidden,
			firstExpanded: control.getAttribute('aria-expanded'),
			fileExpanded: button(card, '.semantic-diff-file-toggle').getAttribute('aria-expanded'),
			rationaleExpanded: button(card, '.semantic-diff-rationale-toggle').getAttribute('aria-expanded'),
			secondExpanded: second.getAttribute('aria-expanded'),
		}, { afterBodyClicks: 'true', hidden: true, firstExpanded: 'true', fileExpanded: 'true', rationaleExpanded: 'true', secondExpanded: 'true' });
	});

	test('supports Enter and Space, reports height changes, and restores focus before hiding descendants', () => {
		const part = render();
		let heightChanges = 0;
		store.add(part.onDidChangeHeight(() => heightChanges++));
		const control = button(part.domNode, '.semantic-diff-group-toggle');
		control.focus();
		control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		const child = button(part.domNode, '.semantic-diff-file-toggle');
		child.focus();
		child.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
		control.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
		assert.deepStrictEqual({
			expanded: control.getAttribute('aria-expanded'),
			hidden: panel(control).hidden,
			focusRestored: document.activeElement === control,
			heightChanges,
		}, { expanded: 'false', hidden: true, focusRestored: true, heightChanges: 3 });
	});

	test('selecting and copying card text causes no disclosure action', () => {
		const part = render();
		const title = button(part.domNode, '.semantic-diff-title');
		const selection = document.getSelection()!;
		const range = document.createRange();
		range.selectNodeContents(title);
		selection.addRange(range);
		title.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		title.click();
		const selectedText = selection.toString();
		const control = button(part.domNode, '.semantic-diff-group-toggle');
		control.click();
		title.dispatchEvent(new Event('copy', { bubbles: true }));
		assert.deepStrictEqual({ selectedText, expanded: control.getAttribute('aria-expanded') }, { selectedText: 'Prevent negative billing totals', expanded: 'false' });
	});

	test('retains nested state in recreated instances but scopes it to result identity', () => {
		const owner = {};
		const first = render(createSemanticDiffExample(), owner);
		const files = activate(first.domNode, '.semantic-diff-group-toggle');
		const hunks = activate(files, '.semantic-diff-file-toggle');
		activate(hunks, '.semantic-diff-rationale-toggle');
		first.dispose();
		first.domNode.remove();
		const recreated = render(createSemanticDiffExample(), owner);
		const otherResult = render(createSemanticDiffExample(), owner, 'other-call');
		const otherResponse = render(createSemanticDiffExample(), {});
		assert.deepStrictEqual({
			recreated: [...recreated.domNode.querySelectorAll('.semantic-diff-group-toggle, .semantic-diff-file-toggle, .semantic-diff-rationale-toggle')].slice(0, 3).map(control => control.getAttribute('aria-expanded')),
			otherResult: button(otherResult.domNode, '.semantic-diff-group-toggle').getAttribute('aria-expanded'),
			otherResponse: button(otherResponse.domNode, '.semantic-diff-group-toggle').getAttribute('aria-expanded'),
			idsUnique: new Set([...document.querySelectorAll('.chat-semantic-diff [id]')].map(element => element.id)).size === document.querySelectorAll('.chat-semantic-diff [id]').length,
		}, { recreated: ['true', 'true', 'true'], otherResult: 'false', otherResponse: 'false', idsUnique: true });
	});

	test('renders HTML and command-looking text as inert selectable text', () => {
		const example = createSemanticDiffExample();
		const text = '<img src="https://invalid.example/image" onerror="alert(1)"> command:workbench.action.closeWindow $(check)';
		const analysis = {
			...example.analysis,
			groups: example.analysis.groups.map((group, index) => index ? group : { ...group, title: '<script>alert(1)</script>', description: text }),
			files: example.analysis.files.map((file, index) => index ? file : { ...file, path: '<img onerror=alert(1)>.js' }),
		};
		const part = render(reportFor(analysis));
		activate(part.domNode, '.semantic-diff-group-toggle');
		assert.deepStrictEqual({
			title: button(part.domNode, '.semantic-diff-title').textContent,
			description: button(part.domNode, '.semantic-diff-description').textContent,
			activeContent: part.domNode.querySelectorAll('img, script, a[href], iframe').length,
			pathIncluded: button(part.domNode, '.semantic-diff-file-toggle').textContent?.includes('<img onerror=alert(1)>.js'),
		}, { title: '<script>alert(1)</script>', description: text, activeContent: 0, pathIncluded: true });
	});

	test('discloses partial, stale, unknown axes, and unsupported file evidence without losing hunks', () => {
		const example = createSemanticDiffExample();
		const report = reportFor({
			...example.analysis,
			source: { ...example.analysis.source, inventoryComplete: false },
			files: [...example.analysis.files, { id: 'binary', path: 'image.png', oldPath: null, status: 'added', contentKind: 'binary' }],
			hunks: example.analysis.hunks.map((hunk, index) => index > 1 ? hunk : {
				...hunk,
				classification: {
					...hunk.classification,
					groupId: index === 0 ? null : hunk.classification.groupId,
					groupConfidence: index === 0 ? null : hunk.classification.groupConfidence,
					changeType: null,
					typeConfidence: null,
					secondaryChangeTypes: [],
					uncertainty: 'The input lacks surrounding context.',
				},
			}),
			limitations: [
				{ code: 'incompleteInventory', message: 'The submitted inventory is incomplete.', fileId: null, hunkId: null },
				{ code: 'truncatedDiff', message: 'The diff was truncated.', fileId: null, hunkId: null },
				{ code: 'staleSource', message: 'Source changed after capture.', fileId: null, hunkId: null },
				{ code: 'nonTextChange', message: 'Binary image has no text hunks.', fileId: 'binary', hunkId: null },
			],
		});
		const part = render(report);
		for (const group of part.domNode.querySelectorAll<HTMLElement>('.semantic-diff-group-toggle')) {
			group.click();
		}
		for (const file of part.domNode.querySelectorAll<HTMLElement>('.semantic-diff-file-toggle')) {
			file.click();
		}
		assert.deepStrictEqual({
			notice: button(part.domNode, '.semantic-diff-notice > p').textContent,
			stale: button(part.domNode, '.semantic-diff-stale').textContent,
			ungrouped: button(part.domNode, '.semantic-diff-ungrouped').querySelectorAll('.semantic-diff-hunk').length,
			hunks: part.domNode.querySelectorAll('.semantic-diff-hunk').length,
			binary: button(part.domNode, '.semantic-diff-nontext').textContent?.includes('Binary image has no text hunks.'),
			observed: button(part.domNode, '.semantic-diff-counts').textContent?.startsWith('Observed'),
		}, { notice: 'Hunks without a group: 1; hunks without a type: 2; uncertain hunks: 2. Axis counts may overlap.', stale: 'Stale analysis: Source changed after capture.', ungrouped: 1, hunks: 8, binary: true, observed: true });
	});

	test('distinguishes complete empty and partial empty reports', () => {
		const example = createSemanticDiffExample();
		const empty = { ...example.analysis, groups: [], files: [], hunks: [] };
		const complete = render(reportFor(empty));
		const partial = render(reportFor({
			...empty,
			source: { ...empty.source, inventoryComplete: false },
			limitations: [{ code: 'incompleteInventory', message: 'No inventory was captured.', fileId: null, hunkId: null }],
		}));
		assert.deepStrictEqual({
			complete: button(complete.domNode, '.semantic-diff-empty').textContent,
			partial: button(partial.domNode, '.semantic-diff-empty').textContent,
			partialNotice: partial.domNode.textContent?.includes('No inventory was captured.'),
		}, {
			complete: 'No changes reported for this comparison.',
			partial: 'No text changes are available in the submitted evidence. The comparison may contain changes that were not included.',
			partialNotice: true,
		});
	});

	test('rejects forged summaries at the rendering and accessible-view seams', () => {
		const example = createSemanticDiffExample();
		const forged = { ...example, summary: { ...example.summary, files: 100 } };
		const part = render(forged);
		assert.deepStrictEqual({
			cards: part.domNode.querySelectorAll('.semantic-diff-card').length,
			error: part.domNode.textContent?.startsWith('Cannot display this classification result:'),
			accessibleError: getToolSpecificDataDescription({ kind: 'semanticDiff', result: { ok: true, report: forged } }).startsWith('Cannot display this classification result:'),
			fallback: getToolSpecificDataDescription({ kind: 'semanticDiff', result: { ok: true, report: example } }),
		}, { cards: 0, error: true, accessibleError: true, fallback: formatSemanticDiffReport(example) });
	});

	test('renders completed tools without waiting for the whole response, never pending or cancelled tools', () => {
		const data: IChatSemanticDiffData = { kind: 'semanticDiff', result: { ok: true, report: createSemanticDiffExample() } };
		const states = [IChatToolInvocation.StateKind.Streaming, IChatToolInvocation.StateKind.Executing, IChatToolInvocation.StateKind.Completed, IChatToolInvocation.StateKind.Cancelled];
		assert.deepStrictEqual(states.map(type => shouldRenderSemanticDiffResult(upcastPartial<IChatToolInvocation>({
			kind: 'toolInvocation',
			toolSpecificData: data,
			state: constObservable(upcastPartial<IChatToolInvocation.State>({ type })),
		}))), [false, false, true, false]);
	});

	test('shows explicit validation errors but never treats failed tool output as a successful report', () => {
		const errorData: IChatSemanticDiffData = { kind: 'semanticDiff', result: validateSemanticDiffReport({ schemaVersion: 2 }) };
		const invocation = upcastPartial<IChatToolInvocationSerialized>({
			kind: 'toolInvocationSerialized', toolCallId: 'invalid', isComplete: true,
			toolSpecificData: errorData,
			resultDetails: { input: '', output: [], isError: true },
		});
		const part = store.add(new ChatSemanticDiffResultSubPart(invocation, errorData, {}, false));
		assert.deepStrictEqual({
			showError: shouldRenderSemanticDiffResult(invocation),
			showSuccess: shouldRenderSemanticDiffResult({ ...invocation, toolSpecificData: { kind: 'semanticDiff', result: { ok: true, report: createSemanticDiffExample() } } }),
			cards: part.domNode.querySelectorAll('.semantic-diff-card').length,
			message: part.domNode.textContent?.includes('not supported'),
		}, { showError: true, showSuccess: false, cards: 0, message: true });
	});
});
