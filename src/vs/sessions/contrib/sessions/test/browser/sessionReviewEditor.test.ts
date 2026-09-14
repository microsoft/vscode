/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Dimension } from '../../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { IChatViewFactory } from '../../../../services/chatView/browser/chatViewFactory.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionArtifact, SessionArtifactKind } from '../../../../services/sessions/common/session.js';
import { SessionReviewSection } from '../../../../services/sessions/common/sessionReview.js';
import { makeSession } from '../../../layout/test/browser/layoutControllerTestUtils.js';
import { SessionReviewEditor, SessionReviewEditorInput } from '../../browser/sessionReviewEditor.js';

suite('Session review artifact catalog', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function createCatalog(initialArtifacts: readonly ISessionArtifact[] = []) {
		const artifacts = observableValue('artifacts', initialArtifacts);
		const session = { ...makeSession(URI.parse('test:/session')), artifacts };
		const instantiation = workbenchInstantiationService(undefined, store);
		let conversationsOpened = 0;
		instantiation.stub(ISessionsService, {
			visibleSessions: observableValue('sessions', [session]),
			openSessionReview: async () => { conversationsOpened++; },
		});
		instantiation.stub(IChatViewFactory, { createChatView: () => { throw new Error('Artifact catalog must not acquire a conversation'); } });
		const editor = store.add(instantiation.createInstance(SessionReviewEditor, new TestEditorGroupView(1)));
		const container = document.createElement('div');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		editor.create(container);
		editor.layout(new Dimension(650, 420));
		const input = store.add(new SessionReviewEditorInput(session.resource, SessionReviewSection.Artifacts));
		await editor.setInput(input, {}, {}, CancellationToken.None);
		return { container, editor, artifacts, conversationsOpened: () => conversationsOpened };
	}

	test('an empty catalog explains what will appear and offers the conversation without loading it', async () => {
		const { container, editor, conversationsOpened } = await createCatalog();
		editor.focus();
		const button = container.querySelector<HTMLElement>('.session-review-catalog-empty .monaco-button');
		assert.deepStrictEqual({
			title: container.querySelector('h2')?.textContent,
			emptyTitle: container.querySelector('.session-review-catalog-empty strong')?.textContent,
			treeHidden: container.querySelector<HTMLElement>('.session-review-catalog-tree')?.hidden,
			focusOnAction: document.activeElement === button,
			conversationsOpened: conversationsOpened(),
		}, {
			title: 'Artifacts and references', emptyTitle: 'No artifacts recorded yet',
			treeHidden: true, focusOnAction: true, conversationsOpened: 0,
		});
	});

	test('empty-state navigation is explicit and uses the canonical session action', async () => {
		const { container, conversationsOpened } = await createCatalog();
		container.querySelector<HTMLElement>('.session-review-catalog-empty .monaco-button')?.click();
		assert.strictEqual(conversationsOpened(), 1);
	});

	test('recorded artifacts replace the empty state without adding empty groups', async () => {
		const { container, artifacts } = await createCatalog();
		artifacts.set([{ id: 'notes', kind: SessionArtifactKind.File, label: 'Review notes', isArtifact: true, uri: URI.file('/project/notes.md') }], undefined);
		assert.deepStrictEqual({
			emptyHidden: container.querySelector<HTMLElement>('.session-review-catalog-empty')?.hidden,
			treeHidden: container.querySelector<HTMLElement>('.session-review-catalog-tree')?.hidden,
			groups: [...container.querySelectorAll('.session-review-catalog-tree .monaco-icon-name-container')].map(element => element.textContent),
		}, {
			emptyHidden: true, treeHidden: false, groups: ['Artifacts (1)', 'Review notes'],
		});
	});

	test('removing all results returns to the informative empty state', async () => {
		const { container, artifacts } = await createCatalog([
			{ id: 'link', kind: SessionArtifactKind.Website, label: 'Documentation', isArtifact: false, link: URI.parse('https://example.com/docs') },
		]);
		artifacts.set([], undefined);
		assert.deepStrictEqual({
			emptyHidden: container.querySelector<HTMLElement>('.session-review-catalog-empty')?.hidden,
			treeHidden: container.querySelector<HTMLElement>('.session-review-catalog-tree')?.hidden,
		}, { emptyHidden: false, treeHidden: true });
	});
});
