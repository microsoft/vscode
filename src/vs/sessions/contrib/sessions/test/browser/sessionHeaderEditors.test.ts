/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextViewDelegate, IContextViewService, IOpenContextView } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { ISessionCollection, ISessionCollectionsService } from '../../../../services/sessions/browser/sessionCollectionsService.js';
import { ISessionGroup, ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { SessionPaletteColor } from '../../../../services/sessions/common/sessionColors.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { renderSessionCollectionEditor, SessionHeaderEditors } from '../../browser/views/sessionHeaderEditors.js';

suite('SessionHeaderEditors', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('closes on a click outside the popover, but not on the click that opened it', async () => {
		let delegate: IContextViewDelegate | undefined;
		let closeCount = 0;
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IContextViewService, new class extends mock<IContextViewService>() {
			override showContextView(contextViewDelegate: IContextViewDelegate): IOpenContextView {
				delegate = contextViewDelegate;
				return {
					close: () => {
						closeCount++;
						contextViewDelegate.onHide?.();
					}
				};
			}
		});
		instantiationService.stub(ISessionCollectionsService, new class extends mock<ISessionCollectionsService>() { });
		const editors = store.add(instantiationService.createInstance(SessionHeaderEditors));
		const anchor = mainWindow.document.createElement('div');

		editors.showHeaderEditor({ anchor, target: { sectionId: 'pinned', kind: 'section', label: 'Pinned' } });
		delegate?.onDOMEvent?.(new MouseEvent('click'), anchor);
		const afterOpeningClick = editors.isOpen;
		await timeout(0);
		delegate?.onDOMEvent?.(new KeyboardEvent('keydown'), anchor);
		const afterKeydown = editors.isOpen;
		delegate?.onDOMEvent?.(new MouseEvent('click'), anchor);

		assert.deepStrictEqual({ afterOpeningClick, afterKeydown, afterOutsideClick: editors.isOpen, closeCount }, {
			afterOpeningClick: true,
			afterKeydown: true,
			afterOutsideClick: false,
			closeCount: 1,
		});
	});

	test('a new collection popover stays at the anchor that was detached by creating the collection', () => {
		let delegate: IContextViewDelegate | undefined;
		const anchor = mainWindow.document.createElement('button');
		anchor.style.cssText = 'position: fixed; left: 120px; top: 40px; width: 20px; height: 20px;';
		mainWindow.document.body.appendChild(anchor);
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IContextViewService, new class extends mock<IContextViewService>() {
			override showContextView(contextViewDelegate: IContextViewDelegate): IOpenContextView {
				delegate = contextViewDelegate;
				return { close: () => contextViewDelegate.onHide?.() };
			}
		});
		instantiationService.stub(ISessionCollectionsService, new class extends mock<ISessionCollectionsService>() {
			override createCollection(): ISessionCollection {
				// The switcher re-renders when a collection is added.
				anchor.remove();
				return { id: 'new', name: 'Collection 2', icon: 'graph', color: SessionPaletteColor.Red };
			}
		});
		const editors = store.add(instantiationService.createInstance(SessionHeaderEditors));

		editors.showCollectionEditor({ anchor });
		const resolved = delegate?.getAnchor();
		editors.close();

		assert.deepStrictEqual(resolved, { x: 120, y: 40, width: 20, height: 20 });
	});

	suite('Delete Collection', () => {

		function setup(contents: { readonly groups: number; readonly sessions: number }, collectionId = 'work') {
			const collections: ISessionCollection[] = [
				{ id: 'default', name: 'General', icon: 'layers', color: SessionPaletteColor.Blue },
				{ id: 'work', name: 'Work', icon: 'briefcase', color: SessionPaletteColor.Orange },
			];
			const deleted: [string, string][] = [];
			let closed = 0;
			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(IThemeService, new TestThemeService());
			instantiationService.stub(IHoverService, NullHoverService);
			instantiationService.stub(ISessionCollectionsService, new class extends mock<ISessionCollectionsService>() {
				override readonly collections = constObservable(collections);
				override readonly defaultCollectionId = constObservable('default');
				override getCollection(id: string) { return collections.find(collection => collection.id === id); }
				override getGroupCollection() { return collectionId; }
				override getSessionCollection() { return collectionId; }
				override deleteCollection(id: string, moveToId: string): boolean { deleted.push([id, moveToId]); return true; }
			});
			instantiationService.stub(ISessionGroupsService, new class extends mock<ISessionGroupsService>() {
				override getGroups(): ISessionGroup[] { return Array.from({ length: contents.groups }, (_, index) => ({ id: `g${index}`, name: `Group ${index}`, createdAt: index })); }
			});
			instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override getSessions() { return Array.from({ length: contents.sessions }, () => upcastPartial<ISession>({})); }
			});
			const container = mainWindow.document.createElement('div');
			store.add(renderSessionCollectionEditor(container, { collectionId, close: () => closed++ }, instantiationService));
			const deleteButton = [...container.querySelectorAll<HTMLButtonElement>('.session-header-editor-action')].find(button => button.textContent === 'Delete Collection');
			deleteButton?.click();
			const prompt = container.querySelector('.session-collection-editor-delete-targets');
			return { deleted, closed: () => closed, promptShown: !!prompt?.classList.contains('visible') };
		}

		test('deletes an empty collection without asking where to move its contents', () => {
			const empty = setup({ groups: 0, sessions: 0 });
			const emptyDefault = setup({ groups: 0, sessions: 0 }, 'default');
			const withSessions = setup({ groups: 0, sessions: 2 });
			const withGroups = setup({ groups: 1, sessions: 0 });

			assert.deepStrictEqual([empty, emptyDefault, withSessions, withGroups].map(result => ({ prompt: result.promptShown, deleted: result.deleted, closed: result.closed() })), [
				{ prompt: false, deleted: [['work', 'default']], closed: 1 },
				{ prompt: false, deleted: [['default', 'work']], closed: 1 },
				{ prompt: true, deleted: [], closed: 0 },
				{ prompt: true, deleted: [], closed: 0 },
			]);
		});
	});
});
