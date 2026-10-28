/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { observableSignal, type IObservable } from '../../../base/common/observable.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IAgentHostMacAccessibilityTrustService = createDecorator<IAgentHostMacAccessibilityTrustService>('agentHostMacAccessibilityTrustService');

/**
 * Relays that macOS changed which apps it trusts to control the computer through Accessibility. macOS announces it
 * with a system notification that only the local client process that owns this Agent Host can observe, so that
 * process reports each one. A report doesn't name the app, so consumers verify what they care about.
 *
 * Hosts without a reporter, such as remote hosts, never report a change.
 */
export interface IAgentHostMacAccessibilityTrustService {
	readonly _serviceBrand: undefined;
	/** Signals every reported change. */
	readonly changes: IObservable<void>;
	reportChange(): void;
}

export class AgentHostMacAccessibilityTrustService implements IAgentHostMacAccessibilityTrustService {
	declare readonly _serviceBrand: undefined;

	private readonly _changes = observableSignal(this);
	readonly changes: IObservable<void> = this._changes;

	reportChange(): void {
		this._changes.trigger(undefined);
	}
}
