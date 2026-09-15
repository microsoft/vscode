/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsRecentWorkspacesService } from '../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionChangesService } from '../../../changes/common/sessionChangesService.js';
import { ISessionComparisonService } from '../../common/comparison.js';
import { buildComparisonAccessibleContent } from '../../browser/comparisonAccessibility.js';
import { ComparisonView } from '../../browser/comparisonView.js';
import { createComparisonTestData } from './comparisonTestUtils.js';

suite('ComparisonView', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function setup(states?: SessionStatus[]) {
		const data = createComparisonTestData(states);
		const instantiation = workbenchInstantiationService({}, store);
		const opened: URI[] = [];
		const sideBySide: ISession[] = [];
		instantiation.stub(ISessionComparisonService, data.service);
		instantiation.stub(IChatService, data.chatService);
		instantiation.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override async openSession(resource: URI) { opened.push(resource); }
			override async openSessionToSide(session: ISession) { sideBySide.push(session); }
		});
		instantiation.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() { });
		instantiation.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() { });
		instantiation.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() { });
		instantiation.stub(ISessionsRecentWorkspacesService, new class extends mock<ISessionsRecentWorkspacesService>() { });
		instantiation.stub(IEditorService, new class extends mock<IEditorService>() { });
		const container = dom.append(document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const view = store.add(instantiation.createInstance(ComparisonView));
		view.render(container);
		view.layout(1200);
		await timeout(0);
		return { ...data, container, view, opened, sideBySide };
	}

	function button(container: HTMLElement, label: string): HTMLElement {
		const result = [...container.querySelectorAll<HTMLElement>('.monaco-button')].find(button => button.textContent === label);
		assert.ok(result, `Missing button: ${label}`);
		return result;
	}

	test('renders real responses and chooses a preferred implementation without opening or removing siblings', async () => {
		const { container, service, opened } = await setup();
		button(container, 'Prefer This Implementation').click();
		await timeout(0);
		assert.deepStrictEqual({
			cards: container.querySelectorAll('.comparison-candidate').length,
			preferred: service.runs.get()[0].preferredCandidateId,
			pressed: container.querySelector('.preferred .comparison-preference')?.getAttribute('aria-pressed'),
			response: container.textContent?.includes('single-pass parser'),
			opened,
		}, { cards: 2, preferred: 'attempt-0', pressed: 'true', response: true, opened: [] });
	});

	test('opens all candidate sessions through the existing side-by-side API', async () => {
		const { container, sideBySide, sessions } = await setup();
		button(container, 'Open Sessions Side by Side').click();
		await timeout(0);
		assert.deepStrictEqual(sideBySide, sessions);
	});

	test('continues only the preferred session', async () => {
		const { container, opened, sessions, service } = await setup();
		service.prefer('comparison-1', 'attempt-1');
		button(container, 'Continue with Preferred').click();
		await timeout(0);
		assert.deepStrictEqual(opened, [sessions[1].resource]);
	});

	test('does not present a waiting or failed agent as a selectable winner', async () => {
		const { container } = await setup([SessionStatus.NeedsInput, SessionStatus.Error]);
		assert.deepStrictEqual({
			states: [...container.querySelectorAll('.comparison-status')].map(element => element.textContent),
			enabledPreference: container.querySelectorAll('.comparison-preference:not(.disabled)').length,
			compareDisabled: button(container, 'Compare Code...').classList.contains('disabled'),
		}, { states: ['Needs your input', 'Session error'], enabledPreference: 0, compareDisabled: true });
	});

	test('preserves card identity and keyboard focus when preference changes', async () => {
		const { container, service } = await setup();
		const preference = button(container, 'Prefer This Implementation');
		preference.focus();
		service.prefer('comparison-1', 'attempt-1');
		assert.deepStrictEqual({
			connected: preference.isConnected,
			focused: document.activeElement === preference,
			cards: container.querySelectorAll('.comparison-candidate').length,
		}, { connected: true, focused: true, cards: 2 });
	});

	test('switches to a single-column layout based on available width', async () => {
		const { container, view } = await setup();
		view.layout(600);
		assert.strictEqual(container.querySelector('.session-comparison')?.classList.contains('narrow'), true);
	});

	test('releases transcript references when the comparison view closes', async () => {
		const { view, getDisposedReferences } = await setup();
		view.dispose();
		assert.strictEqual(getDisposedReferences(), 2);
	});

	test('accessible view includes the prompt, preference, response and file paths', async () => {
		const { service, chatService } = await setup();
		service.prefer('comparison-1', 'attempt-0');
		const content = buildComparisonAccessibleContent(service, chatService);
		assert.deepStrictEqual({
			prompt: content.includes('Implement a CSV parser'),
			preference: content.includes('Preferred implementation'),
			response: content.includes('single-pass parser'),
			file: content.includes('/worktrees/attempt-0/src/parser.ts'),
		}, { prompt: true, preference: true, response: true, file: true });
	});

	test('status updates do not recreate candidate controls', async () => {
		const { container, statuses } = await setup([SessionStatus.InProgress, SessionStatus.Completed]);
		const before = button(container, 'Open Session');
		statuses[0].set(SessionStatus.Completed, undefined);
		assert.deepStrictEqual({
			sameControl: button(container, 'Open Session') === before,
			status: container.querySelector('.comparison-status')?.textContent,
		}, { sameControl: true, status: 'Finished' });
	});
});
