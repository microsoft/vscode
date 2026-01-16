/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickWidget } from '../../../../../platform/quickinput/common/quickInput.js';
import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { AgentSessionsQuickPickWidget } from './agentSessionsQuickPickWidget.js';
import { registerAction2, Action2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { localize2 } from '../../../../../nls.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';

export const IAgentSessionsQuickPickService = createDecorator<IAgentSessionsQuickPickService>('agentSessionsQuickPickService');

export const AgentSessionsQuickPickContextKey = new RawContextKey<boolean>('agentSessionsQuickPickVisible', false);

export interface IAgentSessionsQuickPickService {
	readonly _serviceBrand: undefined;

	/**
	 * Whether the quick pick is currently visible
	 */
	readonly isVisible: boolean;

	/**
	 * Open the agent sessions quick pick
	 */
	open(): void;

	/**
	 * Close the agent sessions quick pick
	 */
	close(): void;

	/**
	 * Toggle the agent sessions quick pick
	 */
	toggle(): void;
}

export class AgentSessionsQuickPickService extends Disposable implements IAgentSessionsQuickPickService {
	readonly _serviceBrand: undefined;

	private _quickWidget: IQuickWidget | undefined;
	private _widget: AgentSessionsQuickPickWidget | undefined;
	private readonly _widgetDisposables = this._register(new DisposableStore());

	private _isVisible = false;
	get isVisible(): boolean {
		return this._isVisible;
	}

	constructor(
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();
	}

	open(): void {
		if (this._isVisible) {
			this._widget?.focus();
			return;
		}

		this._widgetDisposables.clear();

		// Create the quick widget
		this._quickWidget = this.quickInputService.createQuickWidget();
		this._widgetDisposables.add(this._quickWidget);

		// Create our custom widget content
		this._widget = this._widgetDisposables.add(
			this.instantiationService.createInstance(AgentSessionsQuickPickWidget)
		);

		// Set up the quick widget
		this._quickWidget.widget = this._widget.element;
		this._quickWidget.ignoreFocusOut = false;

		// Handle hide
		this._widgetDisposables.add(this._quickWidget.onDidHide(() => {
			this._isVisible = false;
			AgentSessionsQuickPickContextKey.bindTo(this.contextKeyService).set(false);
			this._widgetDisposables.clear();
			this._quickWidget = undefined;
			this._widget = undefined;
		}));

		// Handle close request from widget (e.g., after sending a message)
		this._widgetDisposables.add(this._widget.onDidRequestClose(() => {
			this.close();
		}));

		// Show the widget
		this._quickWidget.show();
		this._isVisible = true;
		AgentSessionsQuickPickContextKey.bindTo(this.contextKeyService).set(true);

		// Focus the input
		this._widget.focus();
	}

	close(): void {
		if (!this._isVisible) {
			return;
		}

		this._quickWidget?.hide();
	}

	toggle(): void {
		if (this._isVisible) {
			this.close();
		} else {
			this.open();
		}
	}
}

registerSingleton(IAgentSessionsQuickPickService, AgentSessionsQuickPickService, InstantiationType.Delayed);

// Register actions
registerAction2(class OpenAgentSessionsQuickPickAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.agentSessions.openQuickPick',
			title: localize2('agentSessions.openQuickPick', "Open Agent Sessions"),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyI,
				when: ChatContextKeys.enabled,
			},
			precondition: ChatContextKeys.enabled,
		});
	}

	run(accessor: ServicesAccessor): void {
		const service = accessor.get(IAgentSessionsQuickPickService);
		service.toggle();
	}
});

registerAction2(class CloseAgentSessionsQuickPickAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.agentSessions.closeQuickPick',
			title: localize2('agentSessions.closeQuickPick', "Close Agent Sessions"),
			f1: false,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 10,
				primary: KeyCode.Escape,
				when: AgentSessionsQuickPickContextKey,
			},
		});
	}

	run(accessor: ServicesAccessor): void {
		const service = accessor.get(IAgentSessionsQuickPickService);
		service.close();
	}
});
