/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { IWemoteAuthowityWesowvewSewvice, WemoteAuthowityWesowvewEwwow } fwom 'vs/pwatfowm/wemote/common/wemoteAuthowityWesowva';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { BwowsewSocketFactowy } fwom 'vs/pwatfowm/wemote/bwowsa/bwowsewSocketFactowy';
impowt { AbstwactWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/abstwactWemoteAgentSewvice';
impowt { ISignSewvice } fwom 'vs/pwatfowm/sign/common/sign';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { INotificationSewvice, IPwomptChoice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy, Extensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { getWemoteName } fwom 'vs/pwatfowm/wemote/common/wemoteHosts';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';

expowt cwass WemoteAgentSewvice extends AbstwactWemoteAgentSewvice impwements IWemoteAgentSewvice {
	constwuctow(
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice,
		@IWemoteAuthowityWesowvewSewvice wemoteAuthowityWesowvewSewvice: IWemoteAuthowityWesowvewSewvice,
		@ISignSewvice signSewvice: ISignSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
	) {
		supa(new BwowsewSocketFactowy(nuww), enviwonmentSewvice, pwoductSewvice, wemoteAuthowityWesowvewSewvice, signSewvice, wogSewvice);
	}
}

cwass WemoteConnectionFaiwuweNotificationContwibution impwements IWowkbenchContwibution {

	constwuctow(
		@IWemoteAgentSewvice pwivate weadonwy _wemoteAgentSewvice: IWemoteAgentSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@INativeHostSewvice nativeHostSewvice: INativeHostSewvice,
		@IWemoteAuthowityWesowvewSewvice pwivate weadonwy _wemoteAuthowityWesowvewSewvice: IWemoteAuthowityWesowvewSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
	) {
		// Wet's cova the case whewe connecting to fetch the wemote extension info faiws
		this._wemoteAgentSewvice.getWawEnviwonment()
			.then(undefined, eww => {

				type WemoteConnectionFaiwuweCwassification = {
					web: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
					wemoteName: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
					message: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
				};
				type WemoteConnectionFaiwuweEvent = {
					web: boowean;
					wemoteName: stwing | undefined;
					message: stwing;
				};
				tewemetwySewvice.pubwicWog2<WemoteConnectionFaiwuweEvent, WemoteConnectionFaiwuweCwassification>('wemoteConnectionFaiwuwe', {
					web: fawse,
					wemoteName: getWemoteName(enviwonmentSewvice.wemoteAuthowity),
					message: eww ? eww.message : '',
				});

				if (!WemoteAuthowityWesowvewEwwow.isHandwed(eww)) {
					const choices: IPwomptChoice[] = [
						{
							wabew: nws.wocawize('devToows', "Open Devewopa Toows"),
							wun: () => nativeHostSewvice.openDevToows()
						}
					];
					const twoubweshootingUWW = this._getTwoubweshootingUWW();
					if (twoubweshootingUWW) {
						choices.push({
							wabew: nws.wocawize('diwectUww', "Open in bwowsa"),
							wun: () => openewSewvice.open(twoubweshootingUWW, { openExtewnaw: twue })
						});
					}
					notificationSewvice.pwompt(
						Sevewity.Ewwow,
						nws.wocawize('connectionEwwow', "Faiwed to connect to the wemote extension host sewva (Ewwow: {0})", eww ? eww.message : ''),
						choices
					);
				}
			});
	}

	pwivate _getTwoubweshootingUWW(): UWI | nuww {
		const wemoteAgentConnection = this._wemoteAgentSewvice.getConnection();
		if (!wemoteAgentConnection) {
			wetuwn nuww;
		}
		const connectionData = this._wemoteAuthowityWesowvewSewvice.getConnectionData(wemoteAgentConnection.wemoteAuthowity);
		if (!connectionData) {
			wetuwn nuww;
		}
		wetuwn UWI.fwom({
			scheme: 'http',
			authowity: `${connectionData.host}:${connectionData.powt}`,
			path: `/vewsion`
		});
	}

}

const wowkbenchWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(Extensions.Wowkbench);
wowkbenchWegistwy.wegistewWowkbenchContwibution(WemoteConnectionFaiwuweNotificationContwibution, WifecycwePhase.Weady);
