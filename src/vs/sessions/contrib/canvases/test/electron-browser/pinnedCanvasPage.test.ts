/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { AgentsWindowMenus } from '../../../../browser/agentsWindowMenus.js';
import { ICustomViewDescriptor, ICustomViewService } from '../../../../../workbench/contrib/sessions/browser/customView.js';
import { IPinnedCanvas, IPinnedCanvasService, PINNED_CANVAS_PAGE_ID, PinnedCanvasSessionCanToggleListingContext, PinnedCanvasSessionInSessionsListContext } from '../../../../../workbench/contrib/sessions/browser/pinnedCanvases.js';
import { ISessionsListModelService } from '../../../../../workbench/contrib/sessions/browser/sessionsListModelService.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISession } from '../../../../../workbench/services/sessions/common/session.js';
import { PinnedCanvasPageContribution } from '../../electron-browser/pinnedCanvasPage.js';

suite('PinnedCanvasPageContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function stubSessions(instantiationService: TestInstantiationService, session: ISession | undefined, listed: IObservable<boolean>): void {
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			onDidChangeSessions: Event.None,
			getSession: resource => session?.resource.toString() === resource.toString() ? session : undefined,
		}));
		instantiationService.stub(ISessionsListModelService, upcastPartial<ISessionsListModelService>({
			isSessionListed: (_session, reader) => listed.read(reader),
		}));
	}

	test('registers the canvas page with icon-only header actions, without restoring it, accepting only existing pins', () => {
		const registrations: { readonly descriptor: ICustomViewDescriptor; readonly restore: boolean | undefined }[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ICustomViewService, upcastPartial<ICustomViewService>({
			registerCustomView: (descriptor, options) => {
				registrations.push({ descriptor, restore: options?.restore });
				return Disposable.None;
			},
		}));
		stubSessions(instantiationService, undefined, constObservable(true));
		instantiationService.stub(IPinnedCanvasService, upcastPartial<IPinnedCanvasService>({
			entries: constObservable([upcastPartial<IPinnedCanvas>({ id: 'plan' })]),
			selected: constObservable(undefined),
		}));
		instantiationService.stub(IContextKeyService, store.add(new MockContextKeyService()));

		store.add(instantiationService.createInstance(PinnedCanvasPageContribution));

		assert.deepStrictEqual(registrations.map(({ descriptor, restore }) => ({
			id: descriptor.id,
			actions: descriptor.actions,
			restore,
			acceptsState: ['plan', 'removed'].map(pinId => descriptor.acceptsState?.(pinId)),
		})), [{
			id: PINNED_CANVAS_PAGE_ID,
			actions: { style: 'toolbar', menuId: AgentsWindowMenus.CustomViewCanvas },
			restore: false,
			acceptsState: [true, false],
		}]);
	});

	test('tells the page whether the session of the shown pin can be shown in or hidden from the Sessions list, and whether it is listed', () => {
		const isArchived = observableValue('isArchived', false);
		const session = upcastPartial<ISession>({ resource: URI.parse('session:/a'), isArchived, isAutomation: constObservable(false) });
		const listed = observableValue('listed', true);
		const pin = upcastPartial<IPinnedCanvas>({ id: 'plan', identity: { providerId: 'local-agent-host', session: session.resource, chat: URI.parse('chat:/a'), extensionId: 'user:canvases', canvasId: 'plan', instanceId: 'plan' }, canvas: constObservable(undefined) });
		const selected = observableValue<IPinnedCanvas | undefined>('selected', undefined);
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ICustomViewService, upcastPartial<ICustomViewService>({ registerCustomView: () => Disposable.None }));
		stubSessions(instantiationService, session, listed);
		instantiationService.stub(IPinnedCanvasService, upcastPartial<IPinnedCanvasService>({ entries: constObservable([pin]), selected }));
		const contextKeyService = store.add(new MockContextKeyService());
		instantiationService.stub(IContextKeyService, contextKeyService);
		store.add(instantiationService.createInstance(PinnedCanvasPageContribution));
		const keys = () => ({
			canToggle: contextKeyService.getContextKeyValue(PinnedCanvasSessionCanToggleListingContext.key),
			listed: contextKeyService.getContextKeyValue(PinnedCanvasSessionInSessionsListContext.key),
		});

		const none = keys();
		selected.set(pin, undefined);
		const shown = keys();
		listed.set(false, undefined);
		const hidden = keys();
		isArchived.set(true, undefined);

		assert.deepStrictEqual({ none, shown, hidden, archived: keys() }, {
			none: { canToggle: false, listed: false },
			shown: { canToggle: true, listed: true },
			hidden: { canToggle: true, listed: false },
			archived: { canToggle: false, listed: false },
		});
	});
});
