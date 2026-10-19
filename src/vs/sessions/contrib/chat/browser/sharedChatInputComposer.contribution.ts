/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { CHAT_ATTACH_CONTEXT_ACTION_ID } from '../../../../workbench/contrib/chat/common/constants.js';
import { Menus } from '../../../browser/menus.js';
import { EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING, UNIFIED_WORKSPACE_PICKER_SETTING } from '../common/constants.js';
import { getLabeledPickerResponsiveItems } from './newChatComposerInput.js';
import { createNewSessionControlToolbar } from './newSessionConfigToolbars.js';
import { SharedChatInputComposerBusyContext } from './sharedChatInputComposer.js';

const COMPOSER_INITIALIZING_ACTION_ID = 'sessions.newChatComposer.initializing';
const COMPOSER_SENDING_ACTION_ID = 'sessions.newChatComposer.sending';
export const COMPOSER_SESSION_CONTROLS_ACTION_ID = 'sessions.newChatComposer.sessionControls';

/** The experimental composer layout moves the session controls into the input toolbar. */
const ExperimentalComposerLayout = ContextKeyExpr.and(
	ContextKeyExpr.has(`config.${UNIFIED_WORKSPACE_PICKER_SETTING}`),
	ContextKeyExpr.has(`config.${EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING}`),
);

MenuRegistry.appendMenuItem(Menus.NewSessionChatInputToolbar, {
	command: { id: CHAT_ATTACH_CONTEXT_ACTION_ID, title: localize('sessionsSharedChatInput.addContext', "Add Context..."), icon: Codicon.addCompact },
	group: 'navigation',
	order: -2,
});

for (const [id, title, busy] of [
	[COMPOSER_INITIALIZING_ACTION_ID, localize2('sessionsSharedChatInput.initializing', "Initializing..."), 'initializing'],
	[COMPOSER_SENDING_ACTION_ID, localize2('sessionsSharedChatInput.sending', "Loading..."), 'sending'],
] as const) {
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id,
				title,
				f1: false,
				menu: { id: Menus.NewSessionChatInputToolbar, group: 'navigation', order: 100, when: SharedChatInputComposerBusyContext.isEqualTo(busy) },
			});
		}
		override run(): void { /* progress only */ }
	});
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: COMPOSER_SESSION_CONTROLS_ACTION_ID,
			title: localize2('sessionsSharedChatInput.sessionControls', "Session Controls"),
			f1: false,
			menu: { id: Menus.NewSessionChatInputToolbar, group: 'navigation', order: 0, when: ExperimentalComposerLayout },
		});
	}
	override run(): void { /* rendered by the action view item */ }
});

/** Progress in the composer's input toolbar, labelled by its action. */
class ComposerBusyActionViewItem extends BaseActionViewItem {
	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('sessions-shared-chat-input-busy');
		container.setAttribute('role', 'status');
		const icon = dom.append(container, renderIcon(ThemeIcon.modify(Codicon.loadingCompact, 'spin')));
		icon.setAttribute('aria-hidden', 'true');
		this.updateTooltip();
	}

	protected override getTooltip(): string {
		return this.action.label;
	}
}

/** Hosts the session controls toolbar inside the input toolbar, for the experimental composer layout. */
class ComposerSessionControlsActionViewItem extends BaseActionViewItem {
	private _controls: HTMLElement | undefined;

	constructor(action: IAction, private readonly _instantiationService: IInstantiationService) {
		super(undefined, action);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('sessions-shared-chat-input-session-controls');
		const controls = this._controls = dom.append(container, dom.$('.sessions-chat-config-toolbar.new-chat-session-controls'));
		this._register(createNewSessionControlToolbar(controls, this._instantiationService, localize('sessionsSharedChatInput.sessionControlsAria', "Session controls")));
	}

	isCompact(): boolean {
		const items = this._controls ? getLabeledPickerResponsiveItems(this._controls) : [];
		return items.length > 0 && items.every(item => item.isCompact());
	}

	setCompact(compact: boolean): void {
		for (const item of this._controls ? getLabeledPickerResponsiveItems(this._controls) : []) {
			item.setCompact(compact);
		}
	}
}

/** Renders the composer's progress and session controls in its input toolbar. */
export class SharedChatInputComposerContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.contrib.sharedChatInputComposer';

	constructor(@IActionViewItemService actionViewItemService: IActionViewItemService) {
		super();
		for (const id of [COMPOSER_INITIALIZING_ACTION_ID, COMPOSER_SENDING_ACTION_ID]) {
			this._register(actionViewItemService.register(Menus.NewSessionChatInputToolbar, id, action => new ComposerBusyActionViewItem(undefined, action)));
		}
		this._register(actionViewItemService.register(Menus.NewSessionChatInputToolbar, COMPOSER_SESSION_CONTROLS_ACTION_ID, (action, _options, instantiationService) => new ComposerSessionControlsActionViewItem(action, instantiationService)));
	}
}

registerWorkbenchContribution2(SharedChatInputComposerContribution.ID, SharedChatInputComposerContribution, WorkbenchPhase.AfterRestored);
