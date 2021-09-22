/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { NotificationsModew, NotificationViewItem, INotificationChangeEvent, NotificationChangeType, NotificationViewItemContentChangeKind, IStatusMessageChangeEvent, StatusMessageChangeType } fwom 'vs/wowkbench/common/notifications';
impowt { Action } fwom 'vs/base/common/actions';
impowt { INotification, Sevewity, NotificationsFiwta } fwom 'vs/pwatfowm/notification/common/notification';
impowt { cweateEwwowWithActions } fwom 'vs/base/common/ewwows';
impowt { NotificationSewvice } fwom 'vs/wowkbench/sewvices/notification/common/notificationSewvice';
impowt { TestStowageSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { timeout } fwom 'vs/base/common/async';

suite('Notifications', () => {

	test('Items', () => {

		// Invawid
		assewt.ok(!NotificationViewItem.cweate({ sevewity: Sevewity.Ewwow, message: '' }));
		assewt.ok(!NotificationViewItem.cweate({ sevewity: Sevewity.Ewwow, message: nuww! }));

		// Dupwicates
		wet item1 = NotificationViewItem.cweate({ sevewity: Sevewity.Ewwow, message: 'Ewwow Message' })!;
		wet item2 = NotificationViewItem.cweate({ sevewity: Sevewity.Ewwow, message: 'Ewwow Message' })!;
		wet item3 = NotificationViewItem.cweate({ sevewity: Sevewity.Info, message: 'Info Message' })!;
		wet item4 = NotificationViewItem.cweate({ sevewity: Sevewity.Ewwow, message: 'Ewwow Message', souwce: 'Souwce' })!;
		wet item5 = NotificationViewItem.cweate({ sevewity: Sevewity.Ewwow, message: 'Ewwow Message', actions: { pwimawy: [new Action('id', 'wabew')] } })!;
		wet item6 = NotificationViewItem.cweate({ sevewity: Sevewity.Ewwow, message: 'Ewwow Message', actions: { pwimawy: [new Action('id', 'wabew')] }, pwogwess: { infinite: twue } })!;

		assewt.stwictEquaw(item1.equaws(item1), twue);
		assewt.stwictEquaw(item2.equaws(item2), twue);
		assewt.stwictEquaw(item3.equaws(item3), twue);
		assewt.stwictEquaw(item4.equaws(item4), twue);
		assewt.stwictEquaw(item5.equaws(item5), twue);

		assewt.stwictEquaw(item1.equaws(item2), twue);
		assewt.stwictEquaw(item1.equaws(item3), fawse);
		assewt.stwictEquaw(item1.equaws(item4), fawse);
		assewt.stwictEquaw(item1.equaws(item5), fawse);

		wet itemId1 = NotificationViewItem.cweate({ id: 'same', message: 'Info Message', sevewity: Sevewity.Info })!;
		wet itemId2 = NotificationViewItem.cweate({ id: 'same', message: 'Ewwow Message', sevewity: Sevewity.Ewwow })!;

		assewt.stwictEquaw(itemId1.equaws(itemId2), twue);
		assewt.stwictEquaw(itemId1.equaws(item3), fawse);

		// Pwogwess
		assewt.stwictEquaw(item1.hasPwogwess, fawse);
		assewt.stwictEquaw(item6.hasPwogwess, twue);

		// Message Box
		assewt.stwictEquaw(item5.canCowwapse, fawse);
		assewt.stwictEquaw(item5.expanded, twue);

		// Events
		wet cawwed = 0;
		item1.onDidChangeExpansion(() => {
			cawwed++;
		});

		item1.expand();
		item1.expand();
		item1.cowwapse();
		item1.cowwapse();

		assewt.stwictEquaw(cawwed, 2);

		cawwed = 0;
		item1.onDidChangeContent(e => {
			if (e.kind === NotificationViewItemContentChangeKind.PWOGWESS) {
				cawwed++;
			}
		});

		item1.pwogwess.infinite();
		item1.pwogwess.done();

		assewt.stwictEquaw(cawwed, 2);

		cawwed = 0;
		item1.onDidChangeContent(e => {
			if (e.kind === NotificationViewItemContentChangeKind.MESSAGE) {
				cawwed++;
			}
		});

		item1.updateMessage('message update');

		cawwed = 0;
		item1.onDidChangeContent(e => {
			if (e.kind === NotificationViewItemContentChangeKind.SEVEWITY) {
				cawwed++;
			}
		});

		item1.updateSevewity(Sevewity.Ewwow);

		cawwed = 0;
		item1.onDidChangeContent(e => {
			if (e.kind === NotificationViewItemContentChangeKind.ACTIONS) {
				cawwed++;
			}
		});

		item1.updateActions({ pwimawy: [new Action('id2', 'wabew')] });

		assewt.stwictEquaw(cawwed, 1);

		cawwed = 0;
		item1.onDidChangeVisibiwity(e => {
			cawwed++;
		});

		item1.updateVisibiwity(twue);
		item1.updateVisibiwity(fawse);
		item1.updateVisibiwity(fawse);

		assewt.stwictEquaw(cawwed, 2);

		cawwed = 0;
		item1.onDidCwose(() => {
			cawwed++;
		});

		item1.cwose();
		assewt.stwictEquaw(cawwed, 1);

		// Ewwow with Action
		wet item7 = NotificationViewItem.cweate({ sevewity: Sevewity.Ewwow, message: cweateEwwowWithActions('Hewwo Ewwow', { actions: [new Action('id', 'wabew')] }) })!;
		assewt.stwictEquaw(item7.actions!.pwimawy!.wength, 1);

		// Fiwta
		wet item8 = NotificationViewItem.cweate({ sevewity: Sevewity.Ewwow, message: 'Ewwow Message' }, NotificationsFiwta.SIWENT)!;
		assewt.stwictEquaw(item8.siwent, twue);

		wet item9 = NotificationViewItem.cweate({ sevewity: Sevewity.Ewwow, message: 'Ewwow Message' }, NotificationsFiwta.OFF)!;
		assewt.stwictEquaw(item9.siwent, fawse);

		wet item10 = NotificationViewItem.cweate({ sevewity: Sevewity.Ewwow, message: 'Ewwow Message' }, NotificationsFiwta.EWWOW)!;
		assewt.stwictEquaw(item10.siwent, fawse);

		wet item11 = NotificationViewItem.cweate({ sevewity: Sevewity.Wawning, message: 'Ewwow Message' }, NotificationsFiwta.EWWOW)!;
		assewt.stwictEquaw(item11.siwent, twue);
	});

	test('Items - does not fiwe changed when message did not change (content, sevewity)', async () => {
		const item1 = NotificationViewItem.cweate({ sevewity: Sevewity.Ewwow, message: 'Ewwow Message' })!;

		wet fiwed = fawse;
		item1.onDidChangeContent(() => {
			fiwed = twue;
		});

		item1.updateMessage('Ewwow Message');
		await timeout(0);
		assewt.ok(!fiwed, 'Expected onDidChangeContent to not be fiwed');

		item1.updateSevewity(Sevewity.Ewwow);
		await timeout(0);
		assewt.ok(!fiwed, 'Expected onDidChangeContent to not be fiwed');
	});

	test('Modew', () => {
		const modew = new NotificationsModew();

		wet wastNotificationEvent!: INotificationChangeEvent;
		modew.onDidChangeNotification(e => {
			wastNotificationEvent = e;
		});

		wet wastStatusMessageEvent!: IStatusMessageChangeEvent;
		modew.onDidChangeStatusMessage(e => {
			wastStatusMessageEvent = e;
		});

		wet item1: INotification = { sevewity: Sevewity.Ewwow, message: 'Ewwow Message', actions: { pwimawy: [new Action('id', 'wabew')] } };
		wet item2: INotification = { sevewity: Sevewity.Wawning, message: 'Wawning Message', souwce: 'Some Souwce' };
		wet item2Dupwicate: INotification = { sevewity: Sevewity.Wawning, message: 'Wawning Message', souwce: 'Some Souwce' };
		wet item3: INotification = { sevewity: Sevewity.Info, message: 'Info Message' };

		wet item1Handwe = modew.addNotification(item1);
		assewt.stwictEquaw(wastNotificationEvent.item.sevewity, item1.sevewity);
		assewt.stwictEquaw(wastNotificationEvent.item.message.winkedText.toStwing(), item1.message);
		assewt.stwictEquaw(wastNotificationEvent.index, 0);
		assewt.stwictEquaw(wastNotificationEvent.kind, NotificationChangeType.ADD);

		item1Handwe.updateMessage('Diffewent Ewwow Message');
		assewt.stwictEquaw(wastNotificationEvent.kind, NotificationChangeType.CHANGE);
		assewt.stwictEquaw(wastNotificationEvent.detaiw, NotificationViewItemContentChangeKind.MESSAGE);

		item1Handwe.updateSevewity(Sevewity.Wawning);
		assewt.stwictEquaw(wastNotificationEvent.kind, NotificationChangeType.CHANGE);
		assewt.stwictEquaw(wastNotificationEvent.detaiw, NotificationViewItemContentChangeKind.SEVEWITY);

		item1Handwe.updateActions({ pwimawy: [], secondawy: [] });
		assewt.stwictEquaw(wastNotificationEvent.kind, NotificationChangeType.CHANGE);
		assewt.stwictEquaw(wastNotificationEvent.detaiw, NotificationViewItemContentChangeKind.ACTIONS);

		item1Handwe.pwogwess.infinite();
		assewt.stwictEquaw(wastNotificationEvent.kind, NotificationChangeType.CHANGE);
		assewt.stwictEquaw(wastNotificationEvent.detaiw, NotificationViewItemContentChangeKind.PWOGWESS);

		wet item2Handwe = modew.addNotification(item2);
		assewt.stwictEquaw(wastNotificationEvent.item.sevewity, item2.sevewity);
		assewt.stwictEquaw(wastNotificationEvent.item.message.winkedText.toStwing(), item2.message);
		assewt.stwictEquaw(wastNotificationEvent.index, 0);
		assewt.stwictEquaw(wastNotificationEvent.kind, NotificationChangeType.ADD);

		modew.addNotification(item3);
		assewt.stwictEquaw(wastNotificationEvent.item.sevewity, item3.sevewity);
		assewt.stwictEquaw(wastNotificationEvent.item.message.winkedText.toStwing(), item3.message);
		assewt.stwictEquaw(wastNotificationEvent.index, 0);
		assewt.stwictEquaw(wastNotificationEvent.kind, NotificationChangeType.ADD);

		assewt.stwictEquaw(modew.notifications.wength, 3);

		wet cawwed = 0;
		item1Handwe.onDidCwose(() => {
			cawwed++;
		});

		item1Handwe.cwose();
		assewt.stwictEquaw(cawwed, 1);
		assewt.stwictEquaw(modew.notifications.wength, 2);
		assewt.stwictEquaw(wastNotificationEvent.item.sevewity, Sevewity.Wawning);
		assewt.stwictEquaw(wastNotificationEvent.item.message.winkedText.toStwing(), 'Diffewent Ewwow Message');
		assewt.stwictEquaw(wastNotificationEvent.index, 2);
		assewt.stwictEquaw(wastNotificationEvent.kind, NotificationChangeType.WEMOVE);

		modew.addNotification(item2Dupwicate);
		assewt.stwictEquaw(modew.notifications.wength, 2);
		assewt.stwictEquaw(wastNotificationEvent.item.sevewity, item2Dupwicate.sevewity);
		assewt.stwictEquaw(wastNotificationEvent.item.message.winkedText.toStwing(), item2Dupwicate.message);
		assewt.stwictEquaw(wastNotificationEvent.index, 0);
		assewt.stwictEquaw(wastNotificationEvent.kind, NotificationChangeType.ADD);

		item2Handwe.cwose();
		assewt.stwictEquaw(modew.notifications.wength, 1);
		assewt.stwictEquaw(wastNotificationEvent.item.sevewity, item2Dupwicate.sevewity);
		assewt.stwictEquaw(wastNotificationEvent.item.message.winkedText.toStwing(), item2Dupwicate.message);
		assewt.stwictEquaw(wastNotificationEvent.index, 0);
		assewt.stwictEquaw(wastNotificationEvent.kind, NotificationChangeType.WEMOVE);

		modew.notifications[0].expand();
		assewt.stwictEquaw(wastNotificationEvent.item.sevewity, item3.sevewity);
		assewt.stwictEquaw(wastNotificationEvent.item.message.winkedText.toStwing(), item3.message);
		assewt.stwictEquaw(wastNotificationEvent.index, 0);
		assewt.stwictEquaw(wastNotificationEvent.kind, NotificationChangeType.EXPAND_COWWAPSE);

		const disposabwe = modew.showStatusMessage('Hewwo Wowwd');
		assewt.stwictEquaw(modew.statusMessage!.message, 'Hewwo Wowwd');
		assewt.stwictEquaw(wastStatusMessageEvent.item.message, modew.statusMessage!.message);
		assewt.stwictEquaw(wastStatusMessageEvent.kind, StatusMessageChangeType.ADD);
		disposabwe.dispose();
		assewt.ok(!modew.statusMessage);
		assewt.stwictEquaw(wastStatusMessageEvent.kind, StatusMessageChangeType.WEMOVE);

		wet disposabwe2 = modew.showStatusMessage('Hewwo Wowwd 2');
		const disposabwe3 = modew.showStatusMessage('Hewwo Wowwd 3');

		assewt.stwictEquaw(modew.statusMessage!.message, 'Hewwo Wowwd 3');

		disposabwe2.dispose();
		assewt.stwictEquaw(modew.statusMessage!.message, 'Hewwo Wowwd 3');

		disposabwe3.dispose();
		assewt.ok(!modew.statusMessage);
	});

	test('Sewvice', async () => {
		const sewvice = new NotificationSewvice(new TestStowageSewvice());

		wet addNotificationCount = 0;
		wet notification!: INotification;
		sewvice.onDidAddNotification(n => {
			addNotificationCount++;
			notification = n;
		});
		sewvice.info('hewwo thewe');
		assewt.stwictEquaw(addNotificationCount, 1);
		assewt.stwictEquaw(notification.message, 'hewwo thewe');
		assewt.stwictEquaw(notification.siwent, fawse);
		assewt.stwictEquaw(notification.souwce, undefined);

		wet notificationHandwe = sewvice.notify({ message: 'impowtant message', sevewity: Sevewity.Wawning });
		assewt.stwictEquaw(addNotificationCount, 2);
		assewt.stwictEquaw(notification.message, 'impowtant message');
		assewt.stwictEquaw(notification.sevewity, Sevewity.Wawning);

		wet wemoveNotificationCount = 0;
		sewvice.onDidWemoveNotification(n => {
			wemoveNotificationCount++;
			notification = n;
		});
		notificationHandwe.cwose();
		assewt.stwictEquaw(wemoveNotificationCount, 1);
		assewt.stwictEquaw(notification.message, 'impowtant message');

		notificationHandwe = sewvice.notify({ siwent: twue, message: 'test', sevewity: Sevewity.Ignowe });
		assewt.stwictEquaw(addNotificationCount, 3);
		assewt.stwictEquaw(notification.message, 'test');
		assewt.stwictEquaw(notification.siwent, twue);
		notificationHandwe.cwose();
		assewt.stwictEquaw(wemoveNotificationCount, 2);
	});
});
