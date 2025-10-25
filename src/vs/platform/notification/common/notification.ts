/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { IAction } from '../../../base/common/actions.js';
import { Event } from '../../../base/common/event.js';
import BaseSeverity from '../../../base/common/severity.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export import Severity = BaseSeverity;

export const INotificationService = createDecorator<INotificationService>('notificationService');

export type NotificationMessage = string | Error;

export enum NotificationPriority {

	/**
	 * Default priority: notification will be visible unless do not disturb mode is enabled.
	 */
	DEFAULT,

	/**
	 * Optional priority: notification might only be visible from the notifications center.
	 */
	OPTIONAL,

	/**
	 * Silent priority: notification will only be visible from the notifications center.
	 */
	SILENT,

	/**
	 * Urgent priority: notification will be visible even when do not disturb mode is enabled.
	 */
	URGENT
}

export interface INotificationProperties {

	/**
	 * Sticky notifications are not automatically removed after a certain timeout.
	 *
	 * Currently, only 2 kinds of notifications are sticky:
	 * - Error notifications with primary actions
	 * - Notifications that show progress
	 */
	readonly sticky?: boolean;

	/**
	 * Allows to override the priority of the notification based on needs.
	 */
	readonly priority?: NotificationPriority;

	/**
	 * Adds an action to never show the notification again. The choice will be persisted
	 * such as future requests will not cause the notification to show again.
	 */
	readonly neverShowAgain?: INeverShowAgainOptions;
}

export enum NeverShowAgainScope {

	/**
	 * Will never show this notification on the current workspace again.
	 */
	WORKSPACE,

	/**
	 * Will never show this notification on any workspace of the same
	 * profile again.
	 */
	PROFILE,

	/**
	 * Will never show this notification on any workspace across all
	 * profiles again.
	 */
	APPLICATION
}

export interface INeverShowAgainOptions {

	/**
	 * The id is used to persist the selection of not showing the notification again.
	 */
	readonly id: string;

	/**
	 * By default the action will show up as primary action. Setting this to true will
	 * make it a secondary action instead.
	 */
	readonly isSecondary?: boolean;

	/**
	 * Whether to persist the choice in the current workspace or for all workspaces. By
	 * default it will be persisted for all workspaces across all profiles
	 * (= `NeverShowAgainScope.APPLICATION`).
	 */
	readonly scope?: NeverShowAgainScope;
}

export interface INotificationSource {

	/**
	 * The id of the source.
	 */
	readonly id: string;

	/**
	 * The label of the source.
	 */
	readonly label: string;
}

export function isNotificationSource(thing: unknown): thing is INotificationSource {
	if (thing) {
		const candidate = thing as INotificationSource;

		return typeof candidate.id === 'string' && typeof candidate.label === 'string';
	}

	return false;
}

export interface INotification extends INotificationProperties {

	/**
	 * The id of the notification. If provided, will be used to compare
	 * notifications with others to decide whether a notification is
	 * duplicate or not.
	 */
	readonly id?: string;

	/**
	 * The severity of the notification. Either `Info`, `Warning` or `Error`.
	 */
	readonly severity: Severity;

	/**
	 * The message of the notification. This can either be a `string` or `Error`. Messages
	 * can optionally include links in the format: `[text](link)`
	 */
	readonly message: NotificationMessage;

	/**
	 * The source of the notification appears as additional information.
	 */
	readonly source?: string | INotificationSource;

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

	/**
	 * The initial set of progress properties for the notification. To update progress
	 * later on, access the `INotificationHandle.progress` property.
	 */
	readonly progress?: INotificationProgressProperties;
}

export interface INotificationActions {

	/**
	 * Primary actions show up as buttons as part of the message and will close
	 * the notification once clicked.
	 *
	 * Pass `ActionWithMenuAction` for an action that has additional menu actions.
	 */
	readonly primary?: readonly IAction[];

	/**
	 * Secondary actions are meant to provide additional configuration or context
	 * for the notification and will show up less prominent. A notification does not
	 * close automatically when invoking a secondary action.
	 */
	readonly secondary?: readonly IAction[];
}

export interface INotificationProgressProperties {

	/**
	 * Causes the progress bar to spin infinitley.
	 */
	readonly infinite?: boolean;

	/**
	 * Indicate the total amount of work.
	 */
	readonly total?: number;

	/**
	 * Indicate that a specific chunk of work is done.
	 */
	readonly worked?: number;
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
	 * Will be fired whenever the visibility of the notification changes.
	 * A notification can either be visible as toast or inside the notification
	 * center if it is visible.
	 */
	readonly onDidChangeVisibility: Event<boolean>;

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

export interface IStatusHandle {

	/**
	 * Hide the status message.
	 */
	close(): void;
}

interface IBasePromptChoice {

	/**
	 * Label to show for the choice to the user.
	 */
	readonly label: string;

	/**
	 * Whether to keep the notification open after the choice was selected
	 * by the user. By default, will close the notification upon click.
	 */
	readonly keepOpen?: boolean;

	/**
	 * Triggered when the user selects the choice.
	 */
	run: () => void;
}

export interface IPromptChoice extends IBasePromptChoice {

	/**
	 * Primary choices show up as buttons in the notification below the message.
	 * Secondary choices show up under the gear icon in the header of the notification.
	 */
	readonly isSecondary?: boolean;
}

export interface IPromptChoiceWithMenu extends IPromptChoice {

	/**
	 * Additional choices those will be shown in the dropdown menu for this choice.
	 */
	readonly menu: IBasePromptChoice[];

	/**
	 * Menu is not supported on secondary choices
	 */
	readonly isSecondary: false | undefined;
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
	readonly showAfter?: number;

	/**
	 * An optional timeout after which the status message is to be hidden. By default
	 * the status message will not hide until another status message is displayed.
	 */
	readonly hideAfter?: number;
}

export enum NotificationsFilter {

	/**
	 * No filter is enabled.
	 */
	OFF,

	/**
	 * All notifications are silent except error notifications.
	*/
	ERROR
}

export interface INotificationSourceFilter extends INotificationSource {
	readonly filter: NotificationsFilter;
}

/**
 * A service to bring up notifications and non-modal prompts.
 *
 * Note: use the `IDialogService` for a modal way to ask the user for input.
 */
export interface INotificationService {

	readonly _serviceBrand: undefined;

	/**
	 * Emitted when the notifications filter changed.
	 */
	readonly onDidChangeFilter: Event<void>;

	/**
	 * Sets a notification filter either for all notifications
	 * or for a specific source.
	 */
	setFilter(filter: NotificationsFilter | INotificationSourceFilter): void;

	/**
	 * Gets the notification filter either for all notifications
	 * or for a specific source.
	 */
	getFilter(source?: INotificationSource): NotificationsFilter;

	/**
	 * Returns all filters with their sources.
	 */
	getFilters(): INotificationSourceFilter[];

	/**
	 * Removes a filter for a specific source.
	 */
	removeFilter(sourceId: string): void;

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
	 * @param severity the severity of the notification. Either `Info`, `Warning` or `Error`.
	 * @param message the message to show as status.
	 * @param choices options to be chosen from.
	 * @param options provides some optional configuration options.
	 *
	 * @returns a handle on the notification to e.g. hide it or update message, buttons, etc.
	 */
	prompt(severity: Severity, message: string, choices: (IPromptChoice | IPromptChoiceWithMenu)[], options?: IPromptOptions): INotificationHandle;

	/**
	 * Shows a status message in the status area with the provided text.
	 *
	 * @param message the message to show as status
	 * @param options provides some optional configuration options
	 *
	 * @returns a handle to hide the status message
	 */
	status(message: NotificationMessage, options?: IStatusMessageOptions): IStatusHandle;
}

export class NoOpNotification implements INotificationHandle {

	readonly progress = new NoOpProgress();

	readonly onDidClose = Event.None;
	readonly onDidChangeVisibility = Event.None;

	updateSeverity(severity: Severity): void { }
	updateMessage(message: NotificationMessage): void { }
	updateActions(actions?: INotificationActions): void { }

	close(): void { }
}

export class NoOpProgress implements INotificationProgress {
	infinite(): void { }
	done(): void { }
	total(value: number): void { }
	worked(value: number): void { }
}

export function withSeverityPrefix(label: string, severity: Severity): string {

	// Add severity prefix to match WCAG 4.1.3 Status
	// Messages requirements.

	if (severity === Severity.Error) {
		return localize('severityPrefix.error', "Error: {0}", label);
	}

	if (severity === Severity.Warning) {
		return localize('severityPrefix.warning', "Warning: {0}", label);
	}

	return localize('severityPrefix.info', "Info: {0}", label);
}
