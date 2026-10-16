/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { Event as CommonEvent } from '../../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { constObservable } from '../../../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { buildSemanticDiffReport, formatSemanticDiffReport, ISemanticDiffAnalysis, ISemanticDiffReport } from '../../../../../../../platform/agentHost/common/semanticDiff.js';
import { createSemanticDiffExample } from '../../../../../../../platform/agentHost/test/common/semanticDiffFixtures.js';
import { IMenuService, MenuRegistry } from '../../../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../../../platform/actions/common/menuService.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { MockContextKeyService } from '../../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { getToolSpecificDataDescription } from '../../../../browser/accessibility/chatResponseAccessibleView.js';
import { ChatSemanticDiffResultSubPart, projectSemanticDiffGroups } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatSemanticDiffResultSubPart.js';
import { shouldRenderSemanticDiffResult } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolInvocationPart.js';
import { IChatSemanticDiffData, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { ISemanticDiffCardSource, OpenSemanticDiffGroupChangesCommandId, SemanticDiffCardMenu } from '../../../../common/semanticDiffCard.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';

suite('ChatSemanticDiffResultSubPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function reportFor(analysis: ISemanticDiffAnalysis): ISemanticDiffReport {
		const result = buildSemanticDiffReport({ schemaVersion: 1, analysis });
		assert.ok(result.ok, JSON.stringify(result));
		return result.report;
	}

	function render(report = createSemanticDiffExample()): ChatSemanticDiffResultSubPart {
		const data: IChatSemanticDiffData = { kind: 'semanticDiff', state: 'complete', result: { ok: true, report } };
		const invocation = upcastPartial<IChatToolInvocationSerialized>({ kind: 'toolInvocationSerialized', toolCallId: 'classification', isComplete: true, toolSpecificData: data });
		const part = store.add(workbenchInstantiationService(undefined, store).createInstance(ChatSemanticDiffResultSubPart, invocation, data, {}, false, undefined));
		dom.append(document.body, part.domNode);
		store.add(toDisposable(() => part.domNode.remove()));
		return part;
	}

	function button(parent: HTMLElement, selector: string): HTMLElement {
		const element = parent.querySelector<HTMLElement>(selector);
		assert.ok(element, selector);
		return element;
	}

	/** Reads a change summary as the changes pill presents it, e.g. `3 Files +12 -5`. */
	function summaryText(parent: HTMLElement): string {
		const summary = button(parent, '.semantic-diff-group-summary');
		return [...summary.querySelectorAll('.changes-stats-files, .changes-stats-added, .changes-stats-removed')].map(element => element.textContent).join(' ');
	}

	test('contributed card actions follow statistics and receive the owning group by mouse or keyboard', async () => {
		const commandId = 'semanticDiff.test.cardAction';
		const title = 'Test Card Action';
		store.add(MenuRegistry.appendMenuItem(SemanticDiffCardMenu, { command: { id: commandId, title, icon: Codicon.diffMultiple }, group: 'navigation' }));
		const instantiationService = workbenchInstantiationService({
			contextKeyService: () => store.add(new class extends MockContextKeyService {
				override contextMatchesRules() { return true; }
			}()),
		}, store);
		let called = new DeferredPromise<unknown>();
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override readonly onWillExecuteCommand = CommonEvent.None;
			override readonly onDidExecuteCommand = CommonEvent.None;
			override async executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
				assert.strictEqual(id, commandId);
				await called.complete(args[0]);
				return undefined as T;
			}
		}());
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		const report = createSemanticDiffExample();
		const data: IChatSemanticDiffData = { kind: 'semanticDiff', state: 'complete', result: { ok: true, report } };
		const invocation = upcastPartial<IChatToolInvocationSerialized>({ kind: 'toolInvocationSerialized', toolCallId: 'tool', isComplete: true, toolSpecificData: data });
		const source: ISemanticDiffCardSource = { sessionResource: URI.parse('agent-host-copilot:/owner'), responseId: 'response', toolCallId: 'tool' };
		const part = store.add(instantiationService.createInstance(ChatSemanticDiffResultSubPart, invocation, data, {}, false, source));
		dom.append(document.body, part.domNode);
		store.add(toDisposable(() => part.domNode.remove()));
		const card = part.domNode.querySelectorAll<HTMLElement>('.semantic-diff-card')[1];
		const action = [...card.querySelectorAll<HTMLElement>('.semantic-diff-card-actions .action-label')].find(element => element.getAttribute('aria-label') === title);
		assert.ok(action);
		action.click();
		assert.deepStrictEqual({
			request: await called.p,
			headerControls: [...card.querySelector('.semantic-diff-card-controls')!.children].map(element => element.className),
			iconOnly: action.classList.contains('codicon-diff-multiple') && action.textContent === '',
			heading: card.querySelector('h3')?.textContent,
			footerActions: card.querySelectorAll(':scope > .semantic-diff-card-actions').length,
		}, {
			request: { ...source, groupId: report.analysis.groups[1].id, report },
			headerControls: ['semantic-diff-group-summary', 'semantic-diff-card-actions'],
			iconOnly: true, heading: report.analysis.groups[1].title, footerActions: 0,
		});
		for (const keyCode of [13, 32]) {
			called = new DeferredPromise<unknown>();
			action.focus();
			action.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', code: 'Tab', keyCode: 9, bubbles: true }));
			const key = keyCode === 13 ? 'Enter' : ' ';
			const code = keyCode === 13 ? 'Enter' : 'Space';
			action.dispatchEvent(new KeyboardEvent('keydown', { key, code, keyCode, bubbles: true }));
			action.dispatchEvent(new KeyboardEvent('keyup', { key, code, keyCode, bubbles: true }));
			assert.deepStrictEqual(await called.p, { ...source, groupId: report.analysis.groups[1].id, report });
		}
	});

	test('the change summary opens the changes of its own group', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const executed: { id: string; context: unknown }[] = [];
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override readonly onWillExecuteCommand = CommonEvent.None;
			override readonly onDidExecuteCommand = CommonEvent.None;
			override async executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
				executed.push({ id, context: args[0] });
				return undefined as T;
			}
		}());
		const report = createSemanticDiffExample();
		const data: IChatSemanticDiffData = { kind: 'semanticDiff', state: 'complete', result: { ok: true, report } };
		const invocation = upcastPartial<IChatToolInvocationSerialized>({ kind: 'toolInvocationSerialized', toolCallId: 'tool', isComplete: true, toolSpecificData: data });
		const source: ISemanticDiffCardSource = { sessionResource: URI.parse('agent-host-copilot:/owner'), responseId: 'response', toolCallId: 'tool' };
		const part = store.add(instantiationService.createInstance(ChatSemanticDiffResultSubPart, invocation, data, {}, false, source));
		const card = part.domNode.querySelectorAll<HTMLElement>('.semantic-diff-card')[1];
		const summary = button(card, '.semantic-diff-group-summary');
		summary.click();
		assert.deepStrictEqual({
			tagName: summary.tagName,
			type: summary.getAttribute('type'),
			ariaLabel: summary.getAttribute('aria-label'),
			executed,
			withoutSource: render(report).domNode.querySelector('.semantic-diff-group-summary')?.tagName,
		}, {
			tagName: 'BUTTON',
			type: 'button',
			ariaLabel: `Open Changes for ${report.analysis.groups[1].title}: 2 files, 2 lines added, 2 lines removed`,
			executed: [{ id: OpenSemanticDiffGroupChangesCommandId, context: { ...source, groupId: report.analysis.groups[1].id, report } }],
			withoutSource: 'SPAN',
		});
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

	test('renders the submitted review sequence without sorting by title or change type', () => {
		const report = createSemanticDiffExample();
		report.analysis.groups = [report.analysis.groups[2], report.analysis.groups[0], report.analysis.groups[1]];
		const part = render(report);
		assert.deepStrictEqual(
			[...part.domNode.querySelectorAll('.semantic-diff-title')].map(title => title.textContent),
			['Upgrade lodash to 4.17.21', 'Prevent negative billing totals', 'Standardize the internal quantity field'],
		);
	});

	test('shows per-group file and line counts in the header without file lists or controls', () => {
		const part = render();
		const cards = [...part.domNode.querySelectorAll<HTMLElement>('.semantic-diff-card')];
		assert.deepStrictEqual(cards.map(card => {
			const summary = button(card, '.semantic-diff-card-heading .semantic-diff-group-summary');
			return {
				summary: summaryText(card),
				iconFirst: summary.firstElementChild?.classList.contains('codicon-diff-multiple') && summary.firstElementChild.getAttribute('aria-hidden') === 'true',
				fileLists: card.querySelectorAll('ul, li').length,
				controls: card.querySelectorAll('button, [role="button"], [tabindex], [aria-expanded]').length,
			};
		}), [
			{ summary: '3 Files +12 -5', iconFirst: true, fileLists: 0, controls: 0 },
			{ summary: '2 Files +2 -2', iconFirst: true, fileLists: 0, controls: 0 },
			{ summary: '2 Files +3 -3', iconFirst: true, fileLists: 0, controls: 0 },
		]);
	});

	test('uses singular file wording and counts a file only once across multiple hunks', () => {
		const { analysis } = createSemanticDiffExample();
		const group = analysis.groups[0];
		const file = analysis.files[0];
		const part = render(reportFor({
			...analysis,
			groups: [group],
			files: [file],
			hunks: analysis.hunks.filter(hunk => hunk.fileId === file.id && hunk.classification.groupId === group.id),
		}));
		assert.strictEqual(summaryText(part.domNode), '1 File +5 -4');
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
		assert.deepStrictEqual({
			title: button(part.domNode, '.semantic-diff-title').textContent,
			description: button(part.domNode, '.semantic-diff-description').textContent,
			activeContent: part.domNode.querySelectorAll('img, script, a[href], iframe').length,
		}, { title: '<script>alert(1)</script>', description: text, activeContent: 0 });
	});

	test('discloses partial, stale, uncertain, and unsupported file evidence', () => {
		const example = createSemanticDiffExample();
		const report = reportFor({
			...example.analysis,
			source: { ...example.analysis.source, inventoryComplete: false },
			files: [...example.analysis.files, { id: 'binary', path: 'image.png', oldPath: null, status: 'added', contentKind: 'binary' }],
			hunks: example.analysis.hunks.map((hunk, index) => index > 1 ? hunk : {
				...hunk,
				classification: {
					...hunk.classification,
					groupConfidence: index === 0 ? 'low' : hunk.classification.groupConfidence,
					typeConfidence: 'low',
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
		assert.deepStrictEqual({
			notice: button(part.domNode, '.semantic-diff-notice > p').textContent,
			stale: button(part.domNode, '.semantic-diff-stale').textContent,
			binary: button(part.domNode, '.semantic-diff-nontext').textContent?.includes('Binary image has no text hunks.'),
			changeSummary: summaryText(part.domNode),
		}, { notice: 'The submitted inventory is incomplete. Classified hunks: 8; uncertain hunks: 2.', stale: 'Stale analysis: Source changed after capture.', binary: true, changeSummary: '3 Files +12 -5' });
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

	test('renders a complete report as intent cards without report-level disclosures', () => {
		const part = render();
		assert.deepStrictEqual([...part.domNode.children].map(child => child.classList.contains('semantic-diff-card')), [true, true, true]);
	});

	test('accessible view describes valid results as plain text and invalid results as an error', () => {
		const example = createSemanticDiffExample();
		assert.deepStrictEqual({
			valid: getToolSpecificDataDescription({ kind: 'semanticDiff', state: 'complete', result: { ok: true, report: example } }),
			invalid: getToolSpecificDataDescription({ kind: 'semanticDiff', state: 'complete', result: buildSemanticDiffReport({ schemaVersion: 2 }) }).startsWith('Cannot display this classification result:'),
		}, { valid: formatSemanticDiffReport(example), invalid: true });
	});

	test('renders completed tools without waiting for the whole response, never pending or cancelled tools', () => {
		const data: IChatSemanticDiffData = { kind: 'semanticDiff', state: 'complete', result: { ok: true, report: createSemanticDiffExample() } };
		const states = [IChatToolInvocation.StateKind.Streaming, IChatToolInvocation.StateKind.Executing, IChatToolInvocation.StateKind.Completed, IChatToolInvocation.StateKind.Cancelled];
		assert.deepStrictEqual(states.map(type => shouldRenderSemanticDiffResult(upcastPartial<IChatToolInvocation>({
			kind: 'toolInvocation',
			toolSpecificData: data,
			state: constObservable(upcastPartial<IChatToolInvocation.State>({ type })),
		}))), [false, false, true, false]);
	});

	test('shows explicit validation errors but never treats failed tool output as a successful report', () => {
		const errorData: IChatSemanticDiffData = { kind: 'semanticDiff', state: 'complete', result: buildSemanticDiffReport({ schemaVersion: 2 }) };
		const invocation = upcastPartial<IChatToolInvocationSerialized>({
			kind: 'toolInvocationSerialized', toolCallId: 'invalid', isComplete: true,
			toolSpecificData: errorData,
			resultDetails: { input: '', output: [], isError: true },
		});
		const part = store.add(workbenchInstantiationService(undefined, store).createInstance(ChatSemanticDiffResultSubPart, invocation, errorData, {}, false, undefined));
		assert.deepStrictEqual({
			showError: shouldRenderSemanticDiffResult(invocation),
			showSuccess: shouldRenderSemanticDiffResult({ ...invocation, toolSpecificData: { kind: 'semanticDiff', state: 'complete', result: { ok: true, report: createSemanticDiffExample() } } }),
			cards: part.domNode.querySelectorAll('.semantic-diff-card').length,
			message: part.domNode.textContent?.includes('not supported'),
		}, { showError: true, showSuccess: false, cards: 0, message: true });
	});
});
