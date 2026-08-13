/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IChatPetActivity, IChatPetService } from '../../../../contrib/chat/browser/chatPetService.js';
import { ChatPetWidget, IChatPetDesktopHost } from '../../../../contrib/chat/browser/widget/chatPetWidget.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

export default defineThemedFixtureGroup({ path: 'chat/pet/' }, {
	DesktopIdle: defineComponentFixture({ render: context => renderDesktopPet(context, { hasActiveRequest: false, needsInput: false, hasInput: false }) }),
	DesktopRendering: defineComponentFixture({ render: context => renderDesktopPet(context, { hasActiveRequest: true, needsInput: false, hasInput: false }) }),
	DesktopConfirmation: defineComponentFixture({ render: context => renderDesktopPet(context, { hasActiveRequest: true, needsInput: true, hasInput: false }) }),
});

function renderDesktopPet({ container, disposableStore, theme }: ComponentFixtureContext, initialActivity: IChatPetActivity): void {
	container.style.width = '240px';
	container.style.height = '240px';
	container.style.background = 'transparent';
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registration => {
			registerWorkbenchServices(registration);
			registration.defineInstance(IChatPetService, new class extends mock<IChatPetService>() {
				override readonly enabled = observableValue(this, true);
				override readonly variant = observableValue(this, 'stable' as const);
				override readonly onTheRun = observableValue(this, false);
				override readonly scale = observableValue(this, 1);
				override toggle(): boolean { return true; }
				override setVariant(): void { }
				override setOnTheRun(): void { }
				override setScale(scale: number): void { this.scale.set(scale, undefined); }
			}());
		},
	});

	const root = dom.append(container, dom.$('.chat-pet-desktop-host'));
	root.style.width = '192px';
	root.style.height = '192px';
	const platform = dom.append(root, dom.$('.chat-pet-desktop-platform'));
	platform.style.top = '120px';
	const activity = observableValue<IChatPetActivity | undefined>(root, initialActivity);
	const desktopHost: IChatPetDesktopHost = {
		canMove: () => true,
		moveBy: () => { },
		finishMove: () => { },
		showContextMenu: (_event, _actions, onHide) => onHide(),
		setInteractiveElements: () => { },
		getContextMenuActions: (_store: DisposableStore) => [],
	};
	disposableStore.add(instantiationService.createInstance(
		ChatPetWidget,
		root,
		platform,
		root,
		constObservable(undefined),
		constObservable(false),
		activity,
		desktopHost,
		constObservable(true),
		Event.None,
	));
}
