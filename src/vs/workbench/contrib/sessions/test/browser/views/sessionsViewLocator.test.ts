/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FocusedViewContext } from '../../../../../common/contextkeys.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { getSessionsViewResolver, InSessionsViewContext, openSessionsView, SessionsView, SessionsViewFocusedContext, SessionsViewId, SessionsViewLocator } from '../../../browser/views/sessionsView.js';

suite('SessionsViewLocator', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function resolve(viewOfId: SessionsView | undefined, sut: SessionsViewLocator): SessionsView | undefined {
		const accessor = {
			get: (id: unknown) => id === IViewsService ? { getViewWithId: (viewId: string) => viewId === SessionsViewId ? viewOfId : undefined } : sut,
		} as unknown as ServicesAccessor;
		return getSessionsViewResolver(accessor)();
	}

	test('the view of the Sessions view id wins over an embedded view', () => {
		const byId = {} as SessionsView;
		const sut = new SessionsViewLocator();
		store.add(sut.register({} as SessionsView));
		assert.strictEqual(resolve(byId, sut), byId);
	});

	test('the latest embedded view is the active one until it is disposed', () => {
		const first = {} as SessionsView;
		const second = {} as SessionsView;
		const sut = new SessionsViewLocator();
		store.add(sut.register(first));
		const registration = sut.register(second);
		assert.strictEqual(resolve(undefined, sut), second);
		registration.dispose();
		assert.strictEqual(resolve(undefined, sut), first);
	});

	test('focus in an embedded Sessions view matches without the view id', () => {
		const contextKeyService = store.add(new ContextKeyService(new TestConfigurationService()));
		const scoped = store.add(contextKeyService.createScoped(document.createElement('div')));
		assert.strictEqual(scoped.contextMatchesRules(SessionsViewFocusedContext), false);
		FocusedViewContext.bindTo(scoped).set(SessionsViewId);
		assert.strictEqual(scoped.contextMatchesRules(SessionsViewFocusedContext), true);
		FocusedViewContext.bindTo(scoped).reset();
		InSessionsViewContext.bindTo(scoped).set(true);
		assert.strictEqual(scoped.contextMatchesRules(SessionsViewFocusedContext), true);
	});

	suite('openSessionsView', () => {

		function viewsService(opened: SessionsView | null | undefined): IViewsService {
			return { openView: async (viewId: string) => viewId === SessionsViewId ? opened : undefined } as unknown as IViewsService;
		}

		test('the registered view, opened as it is not instantiated yet, wins over an embedded view', async () => {
			const registered = {} as SessionsView;
			const sut = new SessionsViewLocator();
			store.add(sut.register({} as SessionsView));
			assert.strictEqual(await openSessionsView(viewsService(registered), sut), registered);
		});

		test('the embedded view is used where no view is registered with the id', async () => {
			const embedded = {} as SessionsView;
			const sut = new SessionsViewLocator();
			store.add(sut.register(embedded));
			assert.strictEqual(await openSessionsView(viewsService(null), sut), embedded);
		});

		test('there is no view where none is registered or embedded', async () => {
			assert.strictEqual(await openSessionsView(viewsService(null), new SessionsViewLocator()), undefined);
		});
	});
});
