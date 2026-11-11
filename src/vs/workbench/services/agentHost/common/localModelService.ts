/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDisposable } from '../../../../base/common/lifecycle.js';
import type { IObservable } from '../../../../base/common/observable.js';
import type { URI } from '../../../../base/common/uri.js';
import type { ILocalModelConsent, ILocalModelFamilyV1, ILocalModelStatusV1 } from '../../../../platform/agentHost/common/localModel.js';
import type { IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const ILocalModelService = createDecorator<ILocalModelService>('localModelService');

/** The {@link ILocalModelService.getPendingStops} key of a Stop sent for the server of the active model `familyId`, until its state changes. */
export function getLocalModelServerStopId(familyId: string): string {
	return `server:${familyId}`;
}

/** The {@link ILocalModelService.getPendingStops} key of a Stop Now sent for operation `operationId`'s drain; a Cancel or Pause is pending as the operation's own id. */
export function getLocalModelStopNowId(operationId: string): string {
	return `stopNow:${operationId}`;
}

/** Outcome of the pre-send guard; `block` keeps the draft when the chat is bound to an installed on-device model that isn't active. */
export type LocalModelSendCheck =
	| { readonly kind: 'allow' }
	| { readonly kind: 'block'; readonly reason: 'modelNotActive'; readonly familyId: string; readonly activeFamilyId: string | undefined };

/**
 * User-facing confirmations the service needs before sending some requests; each resolves `false` when the user
 * cancels. Without a registered handler, actions that need one are not sent. Setup and loading another model need
 * none: consent is given on the detail page, and a load can be cancelled from the notice above the chat input.
 */
export interface ILocalModelInteractionHandler {
	/** "Stop {n} running responses?" */
	confirmStopNow(connection: IAgentConnection, status: ILocalModelStatusV1): Promise<boolean>;
	/** Removal confirmation, showing usage counts. */
	confirmRemove(connection: IAgentConnection, status: ILocalModelStatusV1, family: ILocalModelFamilyV1): Promise<boolean>;
}

/**
 * The workbench side of on-device models. Status is held per Agent Host connection, so a host that doesn't publish it
 * reads as `undefined` and the local host's state never bleeds into another target; actions go to the connection the
 * status came from. Boolean results are `true` when the request was sent.
 */
export interface ILocalModelService {
	readonly _serviceBrand: undefined;

	/** The status published by `connection`'s host, validated. */
	getStatus(connection: IAgentConnection): IObservable<ILocalModelStatusV1 | undefined>;

	/** Registers the confirmation UI. Only one handler is active; the last registration wins. */
	registerInteractionHandler(handler: ILocalModelInteractionHandler): IDisposable;

	/** Sends `setUp` with the consent the user gave on the family's detail page, computed from the status that page showed. */
	setUp(connection: IAgentConnection, familyId: string, consent: ILocalModelConsent): boolean;
	/** Sends `makeActive` without asking: the host unloads the active model after its running responses finish, then loads this one. */
	makeActive(connection: IAgentConnection, familyId: string): boolean;
	cancel(connection: IAgentConnection, operationId: string): boolean;
	pause(connection: IAgentConnection, operationId: string): boolean;
	resume(connection: IAgentConnection, operationId: string): boolean;
	retry(connection: IAgentConnection, operationId: string): boolean;
	start(connection: IAgentConnection): boolean;
	/** Stops the active model's server; pending, as {@link getLocalModelServerStopId}, until its state changes. */
	stop(connection: IAgentConnection): boolean;
	/** Asks first, then cancels the running responses of a drain. */
	stopNow(connection: IAgentConnection): Promise<boolean>;
	/**
	 * Stops sent but not yet reflected in `connection`'s status, so every surface can acknowledge the click at once:
	 * operation ids, {@link getLocalModelStopNowId} and {@link getLocalModelServerStopId} keys. Each stops being pending
	 * once the state it should change changes, or after a few seconds.
	 */
	getPendingStops(connection: IAgentConnection): IObservable<ReadonlySet<string>>;
	update(connection: IAgentConnection, familyId: string): boolean;
	/** Asks first (with usage counts), then `remove`. */
	remove(connection: IAgentConnection, familyId: string): Promise<boolean>;
	stopPrevious(connection: IAgentConnection): boolean;
	refreshCatalog(connection: IAgentConnection): boolean;
	/** Sends `setContextSize` with one of the installed family's context options; the host reloads a loaded model once its running responses finish. */
	setContextSize(connection: IAgentConnection, familyId: string, tokens: number): boolean;

	/** Writes `chat.copilot.localModel.useInAuto` (the picker's inline toggle). */
	setUseInAuto(value: boolean): Promise<void>;

	/** Pre-send guard for a chat on `connection` whose selected model is `selectedModelId` (the agent-host row id, not a vendor-qualified id). */
	checkBeforeSend(connection: IAgentConnection, sessionResource: URI, selectedModelId: string | undefined): Promise<LocalModelSendCheck>;
}
