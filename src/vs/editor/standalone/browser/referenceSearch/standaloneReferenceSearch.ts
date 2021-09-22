/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { wegistewEditowContwibution } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { WefewencesContwowwa } fwom 'vs/editow/contwib/gotoSymbow/peek/wefewencesContwowwa';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';

expowt cwass StandawoneWefewencesContwowwa extends WefewencesContwowwa {

	pubwic constwuctow(
		editow: ICodeEditow,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@ICodeEditowSewvice editowSewvice: ICodeEditowSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
	) {
		supa(
			twue,
			editow,
			contextKeySewvice,
			editowSewvice,
			notificationSewvice,
			instantiationSewvice,
			stowageSewvice,
			configuwationSewvice
		);
	}
}

wegistewEditowContwibution(WefewencesContwowwa.ID, StandawoneWefewencesContwowwa);
