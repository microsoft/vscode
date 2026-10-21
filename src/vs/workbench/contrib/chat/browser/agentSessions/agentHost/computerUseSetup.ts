/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { structuralEquals } from '../../../../../../base/common/equals.js';
import { Event, Relay } from '../../../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, observableFromEventOpts } from '../../../../../../base/common/observable.js';
import { isMacintosh, isNative } from '../../../../../../base/common/platform.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { COMPUTER_USE_REQUEST_KEY, type IComputerUseRequest, type IComputerUseSetupActionV1, type IComputerUseStatusV1 } from '../../../../../../platform/agentHost/common/computerUse.js';
import { readComputerUseStatusFromRootState } from '../../../../../../platform/agentHost/common/meta/computerUse.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { ROOT_STATE_URI, type RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { createDecorator, IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ComputerUseSetupDialog, type IComputerUseHelperAppSupport, type IComputerUseSetupModel } from './computerUseSetupDialog.js';

export const IComputerUseSetupService = createDecorator<IComputerUseSetupService>('computerUseSetupService');

/**
 * The client side of the local macOS Agent Host's Computer Use permission setup: its published status, the user's
 * actions, and the one setup modal. Remote and non-macOS hosts publish no status, so nothing is offered for them.
 */
export interface IComputerUseSetupService extends IComputerUseSetupModel {
	readonly _serviceBrand: undefined;

	/** Opens the setup modal for setup `setupId`, or for the latest setup that waits; an open modal switches to it instead. */
	open(setupId?: string): void;

	/** Lets the setup modal hand Copilot Computer Use to System Settings by hand; desktop clients register it. */
	registerHelperAppSupport(support: IComputerUseHelperAppSupport): IDisposable;
}

/** Whether this client can show the macOS permission setup: only native macOS windows, whose local Agent Host shares their machine. */
export function isComputerUseSetupPlatform(): boolean {
	return isMacintosh && isNative;
}

/** The text of the chat card that stands for a setup, live or restored. */
export function getComputerUseSetupCardText(): { readonly title: string; readonly message: string } {
	return {
		title: localize('computerUseSetup.card.title', "Computer Use needs permission to control apps and capture their windows."),
		message: localize('computerUseSetup.card.message', "Copilot continues your task once macOS confirms both permissions."),
	};
}

export class ComputerUseSetupService extends Disposable implements IComputerUseSetupService {
	declare readonly _serviceBrand: undefined;

	readonly status: IObservable<IComputerUseStatusV1 | undefined>;

	private _helperApp: IComputerUseHelperAppSupport | undefined;
	get helperApp(): IComputerUseHelperAppSupport | undefined {
		return this._helperApp;
	}

	private readonly _dialog = this._register(new MutableDisposable<ComputerUseSetupDialog>());

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		// The local host swaps its protocol client on every restart.
		const relay = this._register(new Relay<RootState>());
		const bind = () => { relay.input = this._agentHostService.rootState.onDidChange; };
		bind();
		this._register(this._agentHostService.onAgentHostStart(bind));
		this.status = observableFromEventOpts<IComputerUseStatusV1 | undefined, unknown>(
			{ owner: this, debugName: 'computerUseSetupStatus', equalsFn: structuralEquals },
			Event.any<unknown>(relay.event, this._agentHostService.onAgentHostStart),
			() => isComputerUseSetupPlatform() ? readComputerUseStatusFromRootState(this._agentHostService.rootState.value) : undefined,
		);
	}

	request(setupId: string, { action, permission }: IComputerUseSetupActionV1): boolean {
		const setup = this.status.get()?.setups.find(candidate => candidate.id === setupId);
		const offered = setup?.state === 'needsPermissions' && setup.actions.some(candidate => candidate.action === action && candidate.permission === permission);
		if (!setup || !offered) {
			this._logService.trace(`[ComputerUse] Not sending '${action}': setup ${setupId} doesn't offer it now`);
			return false;
		}
		// A fresh nonce every time, so a repeated gesture is a new request; the host clears the key as it claims it.
		const request: IComputerUseRequest = { nonce: generateUuid(), setupId, round: setup.round, action, ...(permission ? { permission } : {}) };
		this._agentHostService.dispatch(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [COMPUTER_USE_REQUEST_KEY]: request },
		});
		return true;
	}

	registerHelperAppSupport(support: IComputerUseHelperAppSupport): IDisposable {
		this._helperApp = support;
		return toDisposable(() => {
			if (this._helperApp === support) {
				this._helperApp = undefined;
			}
		});
	}

	open(setupId?: string): void {
		if (!isComputerUseSetupPlatform()) {
			return;
		}
		const open = this._dialog.value;
		if (open) {
			open.reveal(setupId);
			return;
		}
		const dialog = this._instantiationService.createInstance(ComputerUseSetupDialog, this, setupId);
		this._dialog.value = dialog;
		void dialog.show().finally(() => {
			if (this._dialog.value === dialog) {
				this._dialog.clear();
			}
		});
	}
}
