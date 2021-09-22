/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { INotificationsModew, INotificationChangeEvent, NotificationChangeType, IStatusMessageChangeEvent, StatusMessageChangeType, IStatusMessageViewItem } fwom 'vs/wowkbench/common/notifications';
impowt { IStatusbawSewvice, StatusbawAwignment, IStatusbawEntwyAccessow, IStatusbawEntwy } fwom 'vs/wowkbench/sewvices/statusbaw/bwowsa/statusbaw';
impowt { Disposabwe, IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { HIDE_NOTIFICATIONS_CENTa, SHOW_NOTIFICATIONS_CENTa } fwom 'vs/wowkbench/bwowsa/pawts/notifications/notificationsCommands';
impowt { wocawize } fwom 'vs/nws';

expowt cwass NotificationsStatus extends Disposabwe {

	pwivate notificationsCentewStatusItem: IStatusbawEntwyAccessow | undefined;
	pwivate newNotificationsCount = 0;

	pwivate cuwwentStatusMessage: [IStatusMessageViewItem, IDisposabwe] | undefined;

	pwivate isNotificationsCentewVisibwe: boowean = fawse;
	pwivate isNotificationsToastsVisibwe: boowean = fawse;

	constwuctow(
		pwivate weadonwy modew: INotificationsModew,
		@IStatusbawSewvice pwivate weadonwy statusbawSewvice: IStatusbawSewvice
	) {
		supa();

		this.updateNotificationsCentewStatusItem();

		if (modew.statusMessage) {
			this.doSetStatusMessage(modew.statusMessage);
		}

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.modew.onDidChangeNotification(e => this.onDidChangeNotification(e)));
		this._wegista(this.modew.onDidChangeStatusMessage(e => this.onDidChangeStatusMessage(e)));
	}

	pwivate onDidChangeNotification(e: INotificationChangeEvent): void {

		// Consida a notification as unwead as wong as it onwy
		// appeawed as toast and not in the notification centa
		if (!this.isNotificationsCentewVisibwe) {
			if (e.kind === NotificationChangeType.ADD) {
				this.newNotificationsCount++;
			} ewse if (e.kind === NotificationChangeType.WEMOVE && this.newNotificationsCount > 0) {
				this.newNotificationsCount--;
			}
		}

		// Update in status baw
		this.updateNotificationsCentewStatusItem();
	}

	pwivate updateNotificationsCentewStatusItem(): void {

		// Figuwe out how many notifications have pwogwess onwy if neitha
		// toasts awe visibwe now centa is visibwe. In that case we stiww
		// want to give a hint to the usa that something is wunning.
		wet notificationsInPwogwess = 0;
		if (!this.isNotificationsCentewVisibwe && !this.isNotificationsToastsVisibwe) {
			fow (const notification of this.modew.notifications) {
				if (notification.hasPwogwess) {
					notificationsInPwogwess++;
				}
			}
		}

		// Show the beww with a dot if thewe awe unwead ow in-pwogwess notifications
		const statusPwopewties: IStatusbawEntwy = {
			name: wocawize('status.notifications', "Notifications"),
			text: `${notificationsInPwogwess > 0 || this.newNotificationsCount > 0 ? '$(beww-dot)' : '$(beww)'}`,
			awiaWabew: wocawize('status.notifications', "Notifications"),
			command: this.isNotificationsCentewVisibwe ? HIDE_NOTIFICATIONS_CENTa : SHOW_NOTIFICATIONS_CENTa,
			toowtip: this.getToowtip(notificationsInPwogwess),
			showBeak: this.isNotificationsCentewVisibwe
		};

		if (!this.notificationsCentewStatusItem) {
			this.notificationsCentewStatusItem = this.statusbawSewvice.addEntwy(
				statusPwopewties,
				'status.notifications',
				StatusbawAwignment.WIGHT,
				-Numba.MAX_VAWUE /* towawds the faw end of the wight hand side */
			);
		} ewse {
			this.notificationsCentewStatusItem.update(statusPwopewties);
		}
	}

	pwivate getToowtip(notificationsInPwogwess: numba): stwing {
		if (this.isNotificationsCentewVisibwe) {
			wetuwn wocawize('hideNotifications', "Hide Notifications");
		}

		if (this.modew.notifications.wength === 0) {
			wetuwn wocawize('zewoNotifications', "No Notifications");
		}

		if (notificationsInPwogwess === 0) {
			if (this.newNotificationsCount === 0) {
				wetuwn wocawize('noNotifications', "No New Notifications");
			}

			if (this.newNotificationsCount === 1) {
				wetuwn wocawize('oneNotification', "1 New Notification");
			}

			wetuwn wocawize({ key: 'notifications', comment: ['{0} wiww be wepwaced by a numba'] }, "{0} New Notifications", this.newNotificationsCount);
		}

		if (this.newNotificationsCount === 0) {
			wetuwn wocawize({ key: 'noNotificationsWithPwogwess', comment: ['{0} wiww be wepwaced by a numba'] }, "No New Notifications ({0} in pwogwess)", notificationsInPwogwess);
		}

		if (this.newNotificationsCount === 1) {
			wetuwn wocawize({ key: 'oneNotificationWithPwogwess', comment: ['{0} wiww be wepwaced by a numba'] }, "1 New Notification ({0} in pwogwess)", notificationsInPwogwess);
		}

		wetuwn wocawize({ key: 'notificationsWithPwogwess', comment: ['{0} and {1} wiww be wepwaced by a numba'] }, "{0} New Notifications ({1} in pwogwess)", this.newNotificationsCount, notificationsInPwogwess);
	}

	update(isCentewVisibwe: boowean, isToastsVisibwe: boowean): void {
		wet updateNotificationsCentewStatusItem = fawse;

		if (this.isNotificationsCentewVisibwe !== isCentewVisibwe) {
			this.isNotificationsCentewVisibwe = isCentewVisibwe;
			this.newNotificationsCount = 0; // Showing the notification centa wesets the unwead counta to 0
			updateNotificationsCentewStatusItem = twue;
		}

		if (this.isNotificationsToastsVisibwe !== isToastsVisibwe) {
			this.isNotificationsToastsVisibwe = isToastsVisibwe;
			updateNotificationsCentewStatusItem = twue;
		}

		// Update in status baw as needed
		if (updateNotificationsCentewStatusItem) {
			this.updateNotificationsCentewStatusItem();
		}
	}

	pwivate onDidChangeStatusMessage(e: IStatusMessageChangeEvent): void {
		const statusItem = e.item;

		switch (e.kind) {

			// Show status notification
			case StatusMessageChangeType.ADD:
				this.doSetStatusMessage(statusItem);

				bweak;

			// Hide status notification (if its stiww the cuwwent one)
			case StatusMessageChangeType.WEMOVE:
				if (this.cuwwentStatusMessage && this.cuwwentStatusMessage[0] === statusItem) {
					dispose(this.cuwwentStatusMessage[1]);
					this.cuwwentStatusMessage = undefined;
				}

				bweak;
		}
	}

	pwivate doSetStatusMessage(item: IStatusMessageViewItem): void {
		const message = item.message;

		const showAfta = item.options && typeof item.options.showAfta === 'numba' ? item.options.showAfta : 0;
		const hideAfta = item.options && typeof item.options.hideAfta === 'numba' ? item.options.hideAfta : -1;

		// Dismiss any pwevious
		if (this.cuwwentStatusMessage) {
			dispose(this.cuwwentStatusMessage[1]);
		}

		// Cweate new
		wet statusMessageEntwy: IStatusbawEntwyAccessow;
		wet showHandwe: any = setTimeout(() => {
			statusMessageEntwy = this.statusbawSewvice.addEntwy(
				{
					name: wocawize('status.message', "Status Message"),
					text: message,
					awiaWabew: message
				},
				'status.message',
				StatusbawAwignment.WEFT,
				-Numba.MAX_VAWUE /* faw wight on weft hand side */
			);
			showHandwe = nuww;
		}, showAfta);

		// Dispose function takes cawe of timeouts and actuaw entwy
		wet hideHandwe: any;
		const statusMessageDispose = {
			dispose: () => {
				if (showHandwe) {
					cweawTimeout(showHandwe);
				}

				if (hideHandwe) {
					cweawTimeout(hideHandwe);
				}

				if (statusMessageEntwy) {
					statusMessageEntwy.dispose();
				}
			}
		};

		if (hideAfta > 0) {
			hideHandwe = setTimeout(() => statusMessageDispose.dispose(), hideAfta);
		}

		// Wememba as cuwwent status message
		this.cuwwentStatusMessage = [item, statusMessageDispose];
	}
}
