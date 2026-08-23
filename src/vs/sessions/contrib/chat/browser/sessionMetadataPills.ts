/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../base/browser/dom.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { Event } from '../../../../base/common/event.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { IMenuService, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ChatPillActionViewItem, IChatPill } from '../../../../workbench/browser/chatPills.js';
import { Menus } from '../../../browser/menus.js';
import { ISessionContext, SessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { setSessionContextKeys } from '../../../services/sessions/common/sessionContextKeys.js';
import { ISessionChangesStatsCache } from '../../../services/sessions/common/sessionChangesStatsCache.js';

/** Adapts the session metadata menu to observable chat-pill descriptors. */
export class SessionMetadataPills extends Disposable {

	readonly pills: IObservable<readonly IChatPill[]>;

	private readonly _scopedInstantiationService: IInstantiationService;

	constructor(
		container: HTMLElement,
		session: IObservable<IActiveSession | undefined>,
		@IActionViewItemService private readonly _actionViewItemService: IActionViewItemService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMenuService menuService: IMenuService,
		@ISessionChangesStatsCache changesStatsCache: ISessionChangesStatsCache,
	) {
		super();

		const scopedContextKeyService = this._register(contextKeyService.createScoped(container));
		this._scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, scopedContextKeyService],
			[ISessionContext, new SessionContext(session)],
		)));

		this._register(autorun(reader => {
			setSessionContextKeys(session.read(reader), scopedContextKeyService, reader, changesStatsCache);
		}));

		const menu = this._register(menuService.createMenu(Menus.SessionHeaderMeta, scopedContextKeyService, { emitEventsForSubmenuChanges: true }));
		const menuSignal = observableSignalFromEvent(this, Event.any(
			menu.onDidChange,
			Event.filter(this._actionViewItemService.onDidChange, menuId => menuId === Menus.SessionHeaderMeta),
		));
		this.pills = derived(this, reader => {
			menuSignal.read(reader);
			return menu.getActions({ shouldForwardArgs: true }).flatMap(([group, actions]) => {
				if (group !== 'navigation') {
					return [];
				}
				return actions.map(action => ({
					action,
					createActionViewItem: (options: IActionViewItemOptions) => {
						const provider = this._actionViewItemService.lookUp(
							Menus.SessionHeaderMeta,
							action instanceof SubmenuItemAction ? action.item.submenu.id : action.id,
						);
						return provider?.(action, options, this._scopedInstantiationService, getWindow(container).vscodeWindowId)
							?? this._scopedInstantiationService.createInstance(ChatPillActionViewItem, undefined, action, options);
					},
				} satisfies IChatPill));
			});
		});
	}
}
