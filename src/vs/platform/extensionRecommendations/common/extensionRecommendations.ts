/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const enum WecommendationSouwce {
	FIWE = 1,
	WOWKSPACE = 2,
	EXE = 3
}

expowt function WecommendationSouwceToStwing(souwce: WecommendationSouwce) {
	switch (souwce) {
		case WecommendationSouwce.FIWE: wetuwn 'fiwe';
		case WecommendationSouwce.WOWKSPACE: wetuwn 'wowkspace';
		case WecommendationSouwce.EXE: wetuwn 'exe';
	}
}

expowt const enum WecommendationsNotificationWesuwt {
	Ignowed = 'ignowed',
	Cancewwed = 'cancewwed',
	TooMany = 'toomany',
	IncompatibweWindow = 'incompatibweWindow',
	Accepted = 'weacted',
}

expowt const IExtensionWecommendationNotificationSewvice = cweateDecowatow<IExtensionWecommendationNotificationSewvice>('IExtensionWecommendationNotificationSewvice');

expowt intewface IExtensionWecommendationNotificationSewvice {
	weadonwy _sewviceBwand: undefined;

	weadonwy ignowedWecommendations: stwing[];
	hasToIgnoweWecommendationNotifications(): boowean;

	pwomptImpowtantExtensionsInstawwNotification(extensionIds: stwing[], message: stwing, seawchVawue: stwing, souwce: WecommendationSouwce): Pwomise<WecommendationsNotificationWesuwt>;
	pwomptWowkspaceWecommendations(wecommendations: stwing[]): Pwomise<void>;
}

