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

/**
 * The key, among {@link ILocalModelService.getPendingStops}, of a Stop sent
 * for the server of `familyId`, the active model, until its state changes.
 */
export function getLocalModelServerStopId(familyId: string): string {
	return `server:${familyId}`;
}

/**
 * The key, among {@link ILocalModelService.getPendingStops}, of a Stop Now
 * sent for the drain of operation `operationId`, until its state or phase
 * changes. A Cancel or Pause of the operation is pending as its own id.
 */
export function getLocalModelStopNowId(operationId: string): string {
	return `stopNow:${operationId}`;
}

/**
 * Outcome of the pre-send guard. `block` keeps the draft: the chat is
 * bound to an installed on-device model that is not the active one.
 */
export type LocalModelSendCheck =
	| { readonly kind: 'allow' }
	| { readonly kind: 'block'; readonly reason: 'modelNotActive'; readonly familyId: string; readonly activeFamilyId: string | undefined };

/**
 * User-facing confirmations the service needs before it may send a request.
 * Registered by the setup-flow contribution (dialogs). Each
 * method resolves `false` when the user cancels. Without a registered
 * handler, actions that need a confirmation are not sent.
 *
 * Setup and runtime approval need no confirmation here: their consent is
 * given on the model's detail page in the model picker, which sends it with
 * the request. Neither does loading another model: it starts at once, and the
 * notice above the chat input shows it waiting for running responses, then
 * loading, with Cancel.
 */
export interface ILocalModelInteractionHandler {
	/** "Stop {n} running responses?" */
	confirmStopNow(connection: IAgentConnection, status: ILocalModelStatusV1): Promise<boolean>;
	/** Removal confirmation, showing usage counts. */
	confirmRemove(connection: IAgentConnection, status: ILocalModelStatusV1, family: ILocalModelFamilyV1): Promise<boolean>;
}

/**
 * The workbench side of on-device models.
 *
 * Status is held **per Agent Host connection**: a host that does not publish
 * `vscode.localModel.status` (remote hosts, other implementations) reads as
 * `undefined`, so the local host's state never bleeds into another target.
 * Every action is addressed to the connection the status came from and is sent
 * only while that connection publishes status. Actions that return a boolean
 * resolve `true` when the request was sent.
 */
export interface ILocalModelService {
	readonly _serviceBrand: undefined;

	/** The status published by `connection`'s host, validated. */
	getStatus(connection: IAgentConnection): IObservable<ILocalModelStatusV1 | undefined>;

	/** Registers the confirmation UI. Only one handler is active; the last registration wins. */
	registerInteractionHandler(handler: ILocalModelInteractionHandler): IDisposable;

	/**
	 * Sends `setUp` with the consent the user gave on the family's detail page,
	 * computed from the status that page showed.
	 */
	setUp(connection: IAgentConnection, familyId: string, consent: ILocalModelConsent): boolean;
	/**
	 * Sends `makeActive`, without asking: the host unloads the active model
	 * once its running responses finish, then loads this one. Cancelling it
	 * while it waits keeps the active model loaded.
	 */
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
	 * Stops whose request was sent and doesn't show in `connection`'s status
	 * yet, so every surface can acknowledge the click at once: operations, by
	 * id, whose Cancel or Pause was sent, those whose drain Stop Now ended
	 * ({@link getLocalModelStopNowId}), and the active model's server once
	 * Stop was sent ({@link getLocalModelServerStopId}). A stop stops being
	 * pending once the state or phase it should change changes, or after a
	 * few seconds without a change.
	 */
	getPendingStops(connection: IAgentConnection): IObservable<ReadonlySet<string>>;
	update(connection: IAgentConnection, familyId: string): boolean;
	/** Asks first (with usage counts), then `remove`. */
	remove(connection: IAgentConnection, familyId: string): Promise<boolean>;
	stopPrevious(connection: IAgentConnection): boolean;
	/** Sends `approveRuntime` with the approval given on a model's detail page. */
	approveRuntime(connection: IAgentConnection, consent: ILocalModelConsent): boolean;
	refreshCatalog(connection: IAgentConnection): boolean;
	/**
	 * Sends `setContextSize`: `tokens`, one of the installed family's context
	 * options, for its next load. The host reloads a loaded model right away,
	 * once its running responses finish.
	 */
	setContextSize(connection: IAgentConnection, familyId: string, tokens: number): boolean;

	/** Writes `chat.copilot.localModel.useInAuto` (the picker's inline toggle). */
	setUseInAuto(value: boolean): Promise<void>;

	/**
	 * Pre-send guard for a chat on `connection` whose selected model id is
	 * `selectedModelId` (the agent-host model row id, not a vendor-qualified id).
	 */
	checkBeforeSend(connection: IAgentConnection, sessionResource: URI, selectedModelId: string | undefined): Promise<LocalModelSendCheck>;
}
