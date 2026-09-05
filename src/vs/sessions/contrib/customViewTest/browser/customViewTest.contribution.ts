/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/customViewTest.css';
import { $ } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { constObservable, IObservable } from '../../../../base/common/observable.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IsDevelopmentContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Menus } from '../../../browser/menus.js';
import { AbstractCustomView } from '../../../services/customView/browser/customView.js';
import { ICustomViewService } from '../../../services/customView/browser/customViewService.js';

const TEST_CUSTOM_VIEW_ID = 'sessions.customView.test';

/** Placeholder content used to exercise the custom view grid until real views exist. */
class TestCustomView extends AbstractCustomView {

	private static readonly ITEM_COUNT = 40;

	readonly title: IObservable<string> = constObservable(localize('testCustomView.title', "Test Custom View"));
	override readonly description: IObservable<string | undefined> = constObservable(
		localize('testCustomView.description', "A placeholder view used to verify the custom view grid layout, header and scrolling."));

	render(container: HTMLElement): void {
		for (let i = 0; i < TestCustomView.ITEM_COUNT; i++) {
			container.appendChild($('.custom-view-test-item', undefined, localize('testCustomView.item', "Item {0}", i + 1)));
		}
	}

	layout(_width: number, _height: number): void { }
}

class TestCustomViewContribution extends Disposable {

	static readonly ID = 'sessions.contrib.customViewTest';

	constructor(
		@ICustomViewService customViewService: ICustomViewService,
	) {
		super();

		this._register(customViewService.registerCustomView({
			id: TEST_CUSTOM_VIEW_ID,
			ctor: new SyncDescriptor(TestCustomView),
			actions: { style: 'toolbar', menuId: Menus.CustomViewTest },
		}));
	}
}

registerWorkbenchContribution2(TestCustomViewContribution.ID, TestCustomViewContribution, WorkbenchPhase.BlockRestore);

class ShowTestCustomViewAction extends Action2 {

	constructor() {
		super({
			id: 'sessions.customView.showTestView',
			title: localize2('showTestCustomView', "Show Test Custom View"),
			category: Categories.Developer,
			f1: true,
			precondition: IsDevelopmentContext,
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(ICustomViewService).showCustomView(TEST_CUSTOM_VIEW_ID);
	}
}

class HideTestCustomViewAction extends Action2 {

	constructor() {
		super({
			id: 'sessions.customView.hideTestView',
			title: localize2('hideTestCustomView', "Hide Test Custom View"),
			category: Categories.Developer,
			f1: true,
			precondition: IsDevelopmentContext,
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(ICustomViewService).hideCustomView();
	}
}

/** Sample header action so the custom view header toolbar has something to render. */
class TestCustomViewPingAction extends Action2 {

	constructor() {
		super({
			id: 'sessions.customView.testView.ping',
			title: localize2('testCustomViewPing', "Ping Test Custom View"),
			icon: Codicon.debugAlt,
			menu: [{ id: Menus.CustomViewTest, group: 'navigation', order: 1 }],
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(INotificationService).info(localize('testCustomViewPinged', "Test custom view action ran."));
	}
}

registerAction2(ShowTestCustomViewAction);
registerAction2(HideTestCustomViewAction);
registerAction2(TestCustomViewPingAction);
