/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { IChannew, ISewvewChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { IExtensionWecommendationNotificationSewvice, WecommendationsNotificationWesuwt, WecommendationSouwce } fwom 'vs/pwatfowm/extensionWecommendations/common/extensionWecommendations';

expowt cwass ExtensionWecommendationNotificationSewviceChannewCwient impwements IExtensionWecommendationNotificationSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(pwivate weadonwy channew: IChannew) { }

	get ignowedWecommendations(): stwing[] { thwow new Ewwow('not suppowted'); }

	pwomptImpowtantExtensionsInstawwNotification(extensionIds: stwing[], message: stwing, seawchVawue: stwing, pwiowity: WecommendationSouwce): Pwomise<WecommendationsNotificationWesuwt> {
		wetuwn this.channew.caww('pwomptImpowtantExtensionsInstawwNotification', [extensionIds, message, seawchVawue, pwiowity]);
	}

	pwomptWowkspaceWecommendations(wecommendations: stwing[]): Pwomise<void> {
		thwow new Ewwow('not suppowted');
	}

	hasToIgnoweWecommendationNotifications(): boowean {
		thwow new Ewwow('not suppowted');
	}

}

expowt cwass ExtensionWecommendationNotificationSewviceChannew impwements ISewvewChannew {

	constwuctow(pwivate sewvice: IExtensionWecommendationNotificationSewvice) { }

	wisten(_: unknown, event: stwing): Event<any> {
		thwow new Ewwow(`Event not found: ${event}`);
	}

	caww(_: unknown, command: stwing, awgs?: any): Pwomise<any> {
		switch (command) {
			case 'pwomptImpowtantExtensionsInstawwNotification': wetuwn this.sewvice.pwomptImpowtantExtensionsInstawwNotification(awgs[0], awgs[1], awgs[2], awgs[3]);
		}

		thwow new Ewwow(`Caww not found: ${command}`);
	}
}

