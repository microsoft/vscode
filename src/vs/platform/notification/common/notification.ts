/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

 BaseSeverity  'vs/base/common/severity';
 { createDecorator }  'vs/platform/instantiation/common/instantiation';
 { IAction }  'vs/base/common/actions';
 { Event }  'vs/base/common/event';
 { IDisposable }  'vs/base/common/lifecycle';

  Severity = BaseSeverity;

 const INotificationService = createDecorator<INotificationService>('notificationService');

 type NotificationMessage = string | Error;

 interface INotificationProperties {

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

  NeverShowAgainScope {

	/**
	 * Will never show this notification on the current workspace again.
	 */
	WORKSPACE,

	/**
	 * Will never show this notification on any workspace again.
	 */
	GLOBAL
}

  INeverShowAgainOptions {

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
	 * Whether to persist the choice in the current workspace or for all workspaces. By
	 * default it will be persisted for all workspaces (= `NeverShowAgainScope.GLOBAL`).
	 */
	 scope?: NeverShowAgainScope;
}

  INotification extends INotificationProperties {

	/**
	 * The id of the notification. If provided, will be used to compare
	 * notifications with others to decide whether a notification is
	 * duplicate or not.
	 */
	 id?: string;

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
	 source?: string | { label: string; id: string; };

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
        progress?: INotificationProgressProperties;
}

        INotificationActions {

	/**
	 * Primary actions show up as buttons as part of the message and will close
	 * the notification once clicked.
	 *
	 * Pass `ActionWithMenuAction` for an action that has additional menu actions.
	 */
         primary?: readonly IAction[];

	/**
	 * Secondary actions are meant to provide additional configuration or context
	 * for the notification and will show up less prominent. A notification does not
	 * close automatically when invoking a secondary action.
	 */
	 secondary?: readonly IAction[];
}

        INotificationProgressProperties {

	/**
	 * Causes the progress bar to spin infinitley.
	 */
        infinite?: boolean;

	/**
	 * Indicate the total amount of work.
	 */
        total?: number;

	/**
	 * Indicate that a specific chunk of work is done.
	 */
        worked?: number;
}

        INotificationProgress {

	/**
	 * Causes the progress bar to spin infinitley.
	 */
	infinite(): ;

	/**
	 * Indicate the total amount of work.
	 */
	total(value: number): ;

	/**
	 * Indicate that a specific chunk of work is done.
	 */
	worked(value: number): ;

	/**
	 * Indicate that the long running operation is done.
	 */
	done(): ;
}

  INotificationHandle {

	/**
	 * Will be fired once the notification is closed.
	 */
	 onDidClose: Event<void>;

	/**
	 * Will be fired whenever the visibility of the notification changes.
	 * A notification can either be visible as toast or inside the notification
	 * center if it is visible.
	 */
	 onDidChangeVisibility: Event<boolean>;

	/**
	 * Allows to indicate progress on the notification even after the
	 * notification is already visible.
	 */
	 progress: INotificationProgress;

	/**
	 * Allows to update the severity of the notification.
	 */
	updateSeverity(severity: Severity): ;

	/**
	 * Allows to update the message of the notification even after the
	 * notification is already visible.
	 */
	updateMessage(message: NotificationMessage): ;

	/**
	 * Allows to update the actions of the notification even after the
	 * notification is already visible.
	 */
	updateActions(actions?: INotificationActions): ;

	/**
	 * Hide the notification and remove it from the notification center.
	 */
	close(): ;
}

         IBasePromptChoice {

	/**
	 * Label to show for the choice to the user.
	 */
	 label: string;

	/**
	 * Whether to keep the notification open after the choice was selected
	 * by the user. By default, will close the notification upon click.
	 */
	 keepOpen?: boolean;

	/**
	 * Triggered when the user selects the choice.
	 */
	run: () => ;
}

        IPromptChoice extends IBasePromptChoice {

	/**
	 * Primary choices show up as buttons in the notification below the message.
	 * Secondary choices show up under the gear icon in the header of the notification.
	 */
        isSecondary?: boolean;
}

        IPromptChoiceWithMenu extends IPromptChoice {

	/**
	 * Additional choices those will be shown in the dropdown menu for this choice.
	 */
         menu: IBasePromptChoice[];

	/**
	 * Menu is not supported on secondary choices
	 */
         isSecondary: false | undefined;
}

         IPromptOptions extends INotificationProperties {

	/**
	 * Will be called if the user closed the notification without picking
	 * any of the provided choices.
	 */
	onCancel?: () => void;
}

        IStatusMessageOptions {

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

         NotificationsFilter {

	/**
	 * No filter is enabled.
	 */
	OFF,

	/**
	 * All notifications are configured as silent. See
	 * `INotificationProperties.silent` for more info.
	 */
	SILENT,

	/**
	 * All notifications are silent except error notifications.
	*/
	ERROR
}

/**
 * A service to bring up notifications and non-modal prompts.
 *
 * Note: use the `IDialogService` for a modal way to ask the user for input.
 */
export interface INotificationService {

         _serviceBrand: undefined;

	/**
	 * Emitted when a new notification is added.
	 */
	 onDidAddNotification: Event<INotification>;

	/**
	 * Emitted when a notification is removed.
	 */
	 onDidRemoveNotification: Event<INotification>;

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
	 * @param choices options to be choosen from.
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
	 * @returns a disposable to hide the status message
	 */
	status(message: NotificationMessage, options?: IStatusMessageOptions): IDisposable;

	/**
	 * Allows to configure a filter for notifications.
	 *
	 * @param filter the filter to use
	 */
	setFilter(filter: NotificationsFilter): void;
}

        NoOpNotification implements INotificationHandle {

        progress = new NoOpProgress();

        onDidClose = Event.None;
        onDidChangeVisibility = Event.None;

	updateSeverity(severity: Severity): void { }
	updateMessage(message: NotificationMessage): void { }
	updateActions(actions?: INotificationActions): void { }

	close(): void { }
}

        NoOpProgress implements INotificationProgress {
	infinite(): void { }
	done(): void { }
	total(value: number): void { }
	worked(value: number): void { }
}
