/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import BaseSeverity from 'vs/base/common/severity';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { IAction } from 'vs/base/common/actions';
import { Event, Emitter } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';

export import Severity = BaseSeverity;

export const INotificationService = createDecorator<INotificationService>('notificationService');

export type NotificationMessage = string | Error;

export interface INotificationProperties {

	/**
	 * Sticky notifications are not automatically removed after a certain timeout. By
	 * default, notifications with primary actions and severity error are always sticky.
	 */
	sticky?: boolean;

	/**
	 * Silent notifications are not shown to the user unless the notification center
	 * is opened. The status bar will still indicate all number of notifications to
	 * catch some attention.
	 */
	silent?: boolean;

	/**
	 * Adds an action to never show the notification again. The choice will be persisted
	 * such as future requests will not cause the notification to show again.
	 */
	neverShowAgain?: INeverShowAgainOptions;
}

export enum NeverShowAgainScope {

	/**
	 * Will never show this notification on the current workspace again.
	 */
	WORKSPACE,

	/**
	 * Will never show this notification on any workspace again.
	 */
	GLOBAL
}

export interface INeverShowAgainOptions {

	/**
	 * The id is used to persist the selection of not showing the notification again.
	 */
	id: string;

	/**
	 * By default the action will show up as primary action. Setting this to true will
	 * make it a secondary action instead.
	 */
	isSecondary?: boolean;

	/**
	 * Wether to persist the choice in the current workspace or for all workspaces. By
	 * default it will be persisted for all workspaces.
	 */
	scope?: NeverShowAgainScope;
}

export interface INotification extends INotificationProperties {

	/**
	 * The severity of the notification. Either `Info`, `Warning` or `Error`.
	 */
	severity: Severity;

	/**
	 * The message of the notification. This can either be a `string` or `Error`. Messages
	 * can optionally include links in the format: `[text](link)`
	 */
	message: NotificationMessage;

	/**
	 * The source of the notification appears as additional information.
	 */
	source?: string;

	/**
	 * Actions to show as part of the notification. Primary actions show up as
	 * buttons as part of the message and will close the notification once clicked.
	 *
	 * Secondary actions are meant to provide additional configuration or context
	 * for the notification and will show up less prominent. A notification does not
	 * close automatically when invoking a secondary action.
	 *
	 * **Note:** If your intent is to show a message with actions to the user, consider
	 * the `INotificationService.prompt()` method instead which are optimized for
	 * this usecase and much easier to use!
	 */
	actions?: INotificationActions;
}

export interface INotificationActions {

	/**
	 * Primary actions show up as buttons as part of the message and will close
	 * the notification once clicked.
	 */
	primary?: ReadonlyArray<IAction>;

	/**
	 * Secondary actions are meant to provide additional configuration or context
	 * for the notification and will show up less prominent. A notification does not
	 * close automatically when invoking a secondary action.
	 */
	secondary?: ReadonlyArray<IAction>;
}

export interface INotificationProgress {

	/**
	 * Causes the progress bar to spin infinitley.
	 */
	infinite(): void;

	/**
	 * Indicate the total amount of work.
	 */
	total(value: number): void;

	/**
	 * Indicate that a specific chunk of work is done.
	 */
	worked(value: number): void;

	/**
	 * Indicate that the long running operation is done.
	 */
	done(): void;
}

export interface INotificationHandle {

	/**
	 * Will be fired once the notification is closed.
	 */
	readonly onDidClose: Event<void>;

	/**
	 * Allows to indicate progress on the notification even after the
	 * notification is already visible.
	 */
	readonly progress: INotificationProgress;

	/**
	 * Allows to update the severity of the notification.
	 */
	updateSeverity(severity: Severity): void;

	/**
	 * Allows to update the message of the notification even after the
	 * notification is already visible.
	 */
	updateMessage(message: NotificationMessage): void;

	/**
	 * Allows to update the actions of the notification even after the
	 * notification is already visible.
	 */
	updateActions(actions?: INotificationActions): void;

	/**
	 * Hide the notification and remove it from the notification center.
	 */
	close(): void;
}

export interface IPromptChoice {

	/**
	 * Label to show for the choice to the user.
	 */
	label: string;

	/**
	 * Primary choices show up as buttons in the notification below the message.
	 * Secondary choices show up under the gear icon in the header of the notification.
	 */
	isSecondary?: boolean;

	/**
	 * Wether to keep the notification open after the choice was selected
	 * by the user. By default, will close the notification upon click.
	 */
	keepOpen?: boolean;

	/**
	 * Triggered when the user selects the choice.
	 */
	run: () => void;
}

export interface IPromptOptions extends INotificationProperties {

	/**
	 * Will be called if the user closed the notification without picking
	 * any of the provided choices.
	 */
	onCancel?: () => void;
}

export interface IStatusMessageOptions {

	/**
	 * An optional timeout after which the status message should show. By default
	 * the status message will show immediately.
	 */
	showAfter?: number;

	/**
	 * An optional timeout after which the status message is to be hidden. By default
	 * the status message will not hide until another status message is displayed.
	 */
	hideAfter?: number;
}

/**
 * A service to bring up notifications and non-modal prompts.
 *
 * Note: use the `IDialogService` for a modal way to ask the user for input.
 */
export interface INotificationService {

	_serviceBrand: ServiceIdentifier<INotificationService>;

	/**
	 * Show the provided notification to the user. The returned `INotificationHandle`
	 * can be used to control the notification afterwards.
	 *
	 * **Note:** If your intent is to show a message with actions to the user, consider
	 * the `INotificationService.prompt()` method instead which are optimized for
	 * this usecase and much easier to use!
	 *
	 * @returns a handle on the notification to e.g. hide it or update message, buttons, etc.
	 */
	notify(notification: INotification): INotificationHandle;

	/**
	 * A convenient way of reporting infos. Use the `INotificationService.notify`
	 * method if you need more control over the notification.
	 */
	info(message: NotificationMessage | NotificationMessage[]): void;

	/**
	 * A convenient way of reporting warnings. Use the `INotificationService.notify`
	 * method if you need more control over the notification.
	 */
	warn(message: NotificationMessage | NotificationMessage[]): void;

	/**
	 * A convenient way of reporting errors. Use the `INotificationService.notify`
	 * method if you need more control over the notification.
	 */
	error(message: NotificationMessage | NotificationMessage[]): void;

	/**
	 * Shows a prompt in the notification area with the provided choices. The prompt
	 * is non-modal. If you want to show a modal dialog instead, use `IDialogService`.
	 *
	 * @param onCancel will be called if the user closed the notification without picking
	 * any of the provided choices.
	 *
	 * @returns a handle on the notification to e.g. hide it or update message, buttons, etc.
	 */
	prompt(severity: Severity, message: string, choices: IPromptChoice[], options?: IPromptOptions): INotificationHandle;

	/**
	 * Shows a status message in the status area with the provided text.
	 *
	 * @param message the message to show as status
	 * @param options provides some optional configuration options
	 *
	 * @returns a disposable to hide the status message
	 */
	status(message: NotificationMessage, options?: IStatusMessageOptions): IDisposable;
}

export class NoOpNotification implements INotificationHandle {

	readonly progress = new NoOpProgress();

	private readonly _onDidClose: Emitter<void> = new Emitter();
	readonly onDidClose: Event<void> = this._onDidClose.event;

	updateSeverity(severity: Severity): void { }
	updateMessage(message: NotificationMessage): void { }
	updateActions(actions?: INotificationActions): void { }

	close(): void {
		this._onDidClose.dispose();
	}
}

export class NoOpProgress implements INotificationProgress {
	infinite(): void { }
	done(): void { }
	total(value: number): void { }
	worked(value: number): void { }
}
