/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ILifecycleService = createDecorator<ILifecycleService>('lifecycleService');

/**
 * An event that is send out when the window is about to close. Clients have a chance to veto
 * the closing by either calling veto with a boolean "true" directly or with a promise that
 * resolves to a boolean. Returning a promise is useful in cases of long running operations
 * on shutdown.
 *
 * Note: It is absolutely important to avoid long running promises if possible. Please try hard
 * to return a boolean directly. Returning a promise has quite an impact on the shutdown sequence!
 */
export interface BeforeShutdownEvent {

	/**
	 * The reason why the application will be shutting down.
	 */
	readonly reason: ShutdownReason;

	/**
	 * Allows to veto the shutdown. The veto can be a long running operation but it
	 * will block the application from closing.
	 *
	 * @param id to identify the veto operation in case it takes very long or never
	 * completes.
	 */
	veto(value: boolean | Promise<boolean>, id: string): void;
}

export interface InternalBeforeShutdownEvent extends BeforeShutdownEvent {

	/**
	 * Allows to set a veto operation to run after all other
	 * vetos have been handled from the `BeforeShutdownEvent`
	 *
	 * This method is hidden from the API because it is intended
	 * to be only used once internally.
	 */
	finalVeto(vetoFn: () => boolean | Promise<boolean>, id: string): void;
}

/**
 * An event that signals an error happened during `onBeforeShutdown` veto handling.
 * In this case the shutdown operation will not proceed because this is an unexpected
 * condition that is treated like a veto.
 */
export interface BeforeShutdownErrorEvent {

	/**
	 * The reason why the application is shutting down.
	 */
	readonly reason: ShutdownReason;

	/**
	 * The error that happened during shutdown handling.
	 */
	readonly error: Error;
}

export enum WillShutdownJoinerOrder {

	/**
	 * Joiners to run before the `Last` joiners. This is the default order and best for
	 * most cases. You can be sure that services are still functional at this point.
	 */
	Default = 1,

	/**
	 * The joiners to run last. This should ONLY be used in rare cases when you have no
	 * dependencies to workbench services or state. The workbench may be in a state where
	 * resources can no longer be accessed or changed.
	 */
	Last
}

export interface IWillShutdownEventJoiner {
	readonly id: string;
	readonly label: string;
	readonly order?: WillShutdownJoinerOrder;
}

export interface IWillShutdownEventDefaultJoiner extends IWillShutdownEventJoiner {
	readonly order?: WillShutdownJoinerOrder.Default;
}

export interface IWillShutdownEventLastJoiner extends IWillShutdownEventJoiner {
	readonly order: WillShutdownJoinerOrder.Last;
}

/**
 * An event that is send out when the window closes. Clients have a chance to join the closing
 * by providing a promise from the join method. Returning a promise is useful in cases of long
 * running operations on shutdown.
 *
 * Note: It is absolutely important to avoid long running promises if possible. Please try hard
 * to return a boolean directly. Returning a promise has quite an impact on the shutdown sequence!
 */
export interface WillShutdownEvent {

	/**
	 * The reason why the application is shutting down.
	 */
	readonly reason: ShutdownReason;

	/**
	 * A token that will signal cancellation when the
	 * shutdown was forced by the user.
	 */
	readonly token: CancellationToken;

	/**
	 * Allows to join the shutdown. The promise can be a long running operation but it
	 * will block the application from closing.
	 *
	 * @param promise the promise to join the shutdown event.
	 * @param joiner to identify the join operation in case it takes very long or never
	 * completes.
	 */
	join(promise: Promise<void>, joiner: IWillShutdownEventDefaultJoiner): void;

	/**
	 * Allows to join the shutdown at the end. The promise can be a long running operation but it
	 * will block the application from closing.
	 *
	 * @param promiseFn the promise to join the shutdown event.
	 * @param joiner to identify the join operation in case it takes very long or never
	 * completes.
	 */
	join(promiseFn: (() => Promise<void>), joiner: IWillShutdownEventLastJoiner): void;

	/**
	 * Allows to access the joiners that have not finished joining this event.
	 */
	joiners(): IWillShutdownEventJoiner[];

	/**
	 * Allows to enforce the shutdown, even when there are
	 * pending `join` operations to complete.
	 */
	force(): void;
}

export const enum ShutdownReason {

	/**
	 * The window is closed.
	 */
	CLOSE = 1,

	/**
	 * The window closes because the application quits.
	 */
	QUIT,

	/**
	 * The window is reloaded.
	 */
	RELOAD,

	/**
	 * The window is loaded into a different workspace context.
	 */
	LOAD
}

export const enum StartupKind {
	NewWindow = 1,
	ReloadedWindow = 3,
	ReopenedWindow = 4
}

export function StartupKindToString(startupKind: StartupKind): string {
	switch (startupKind) {
		case StartupKind.NewWindow: return 'NewWindow';
		case StartupKind.ReloadedWindow: return 'ReloadedWindow';
		case StartupKind.ReopenedWindow: return 'ReopenedWindow';
	}
}

export const enum LifecyclePhase {

	/**
	 * The first phase signals that we are about to startup getting ready.
	 *
	 * Note: doing work in this phase blocks an editor from showing to
	 * the user, so please rather consider to use `Restored` phase.
	 */
	Starting = 1,

	/**
	 * Services are ready and the window is about to restore its UI state.
	 *
	 * Note: doing work in this phase blocks an editor from showing to
	 * the user, so please rather consider to use `Restored` phase.
	 */
	Ready = 2,

	/**
	 * Views, panels and editors have restored. Editors are given a bit of
	 * time to restore their contents.
	 */
	Restored = 3,

	/**
	 * The last phase after views, panels and editors have restored and
	 * some time has passed (2-5 seconds).
	 */
	Eventually = 4
}

export function LifecyclePhaseToString(phase: LifecyclePhase): string {
	switch (phase) {
		case LifecyclePhase.Starting: return 'Starting';
		case LifecyclePhase.Ready: return 'Ready';
		case LifecyclePhase.Restored: return 'Restored';
		case LifecyclePhase.Eventually: return 'Eventually';
	}
}

/**
 * A lifecycle service informs about lifecycle events of the
 * application, such as shutdown.
 */
export interface ILifecycleService {

	readonly _serviceBrand: undefined;

	/**
	 * Value indicates how this window got loaded.
	 */
	readonly startupKind: StartupKind;

	/**
	 * A flag indicating in what phase of the lifecycle we currently are.
	 */
	phase: LifecyclePhase;

	/**
	 * Fired before shutdown happens. Allows listeners to veto against the
	 * shutdown to prevent it from happening.
	 *
	 * The event carries a shutdown reason that indicates how the shutdown was triggered.
	 */
	readonly onBeforeShutdown: Event<BeforeShutdownEvent>;

	/**
	 * Fired when the shutdown was prevented by a component giving veto.
	 */
	readonly onShutdownVeto: Event<void>;

	/**
	 * Fired when an error happened during `onBeforeShutdown` veto handling.
	 * In this case the shutdown operation will not proceed because this is
	 * an unexpected condition that is treated like a veto.
	 *
	 * The event carries a shutdown reason that indicates how the shutdown was triggered.
	 */
	readonly onBeforeShutdownError: Event<BeforeShutdownErrorEvent>;

	/**
	 * Fired when no client is preventing the shutdown from happening (from `onBeforeShutdown`).
	 *
	 * This event can be joined with a long running operation via `WillShutdownEvent#join()` to
	 * handle long running shutdown operations.
	 *
	 * The event carries a shutdown reason that indicates how the shutdown was triggered.
	 */
	readonly onWillShutdown: Event<WillShutdownEvent>;

	/**
	 * Fired when the shutdown is about to happen after long running shutdown operations
	 * have finished (from `onWillShutdown`).
	 *
	 * This event should be used to dispose resources.
	 */
	readonly onDidShutdown: Event<void>;

	/**
	 * Returns a promise that resolves when a certain lifecycle phase
	 * has started.
	 */
	when(phase: LifecyclePhase): Promise<void>;

	/**
	 * Triggers a shutdown of the workbench. Depending on native or web, this can have
	 * different implementations and behaviour.
	 *
	 * **Note:** this should normally not be called. See related methods in `IHostService`
	 * and `INativeHostService` to close a window or quit the application.
	 */
	shutdown(): Promise<void>;
}
