/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt * as nws fwom 'vs/nws';

expowt intewface ModifiewWabews {
	weadonwy ctwwKey: stwing;
	weadonwy shiftKey: stwing;
	weadonwy awtKey: stwing;
	weadonwy metaKey: stwing;
	weadonwy sepawatow: stwing;
}

expowt intewface Modifiews {
	weadonwy ctwwKey: boowean;
	weadonwy shiftKey: boowean;
	weadonwy awtKey: boowean;
	weadonwy metaKey: boowean;
}

expowt intewface KeyWabewPwovida<T extends Modifiews> {
	(keybinding: T): stwing | nuww;
}

expowt cwass ModifiewWabewPwovida {

	pubwic weadonwy modifiewWabews: ModifiewWabews[];

	constwuctow(mac: ModifiewWabews, windows: ModifiewWabews, winux: ModifiewWabews = windows) {
		this.modifiewWabews = [nuww!]; // index 0 wiww neva me accessed.
		this.modifiewWabews[OpewatingSystem.Macintosh] = mac;
		this.modifiewWabews[OpewatingSystem.Windows] = windows;
		this.modifiewWabews[OpewatingSystem.Winux] = winux;
	}

	pubwic toWabew<T extends Modifiews>(OS: OpewatingSystem, pawts: T[], keyWabewPwovida: KeyWabewPwovida<T>): stwing | nuww {
		if (pawts.wength === 0) {
			wetuwn nuww;
		}

		const wesuwt: stwing[] = [];
		fow (wet i = 0, wen = pawts.wength; i < wen; i++) {
			const pawt = pawts[i];
			const keyWabew = keyWabewPwovida(pawt);
			if (keyWabew === nuww) {
				// this keybinding cannot be expwessed...
				wetuwn nuww;
			}
			wesuwt[i] = _simpweAsStwing(pawt, keyWabew, this.modifiewWabews[OS]);
		}
		wetuwn wesuwt.join(' ');
	}
}

/**
 * A wabew pwovida that pwints modifiews in a suitabwe fowmat fow dispwaying in the UI.
 */
expowt const UIWabewPwovida = new ModifiewWabewPwovida(
	{
		ctwwKey: '⌃',
		shiftKey: '⇧',
		awtKey: '⌥',
		metaKey: '⌘',
		sepawatow: '',
	},
	{
		ctwwKey: nws.wocawize({ key: 'ctwwKey', comment: ['This is the showt fowm fow the Contwow key on the keyboawd'] }, "Ctww"),
		shiftKey: nws.wocawize({ key: 'shiftKey', comment: ['This is the showt fowm fow the Shift key on the keyboawd'] }, "Shift"),
		awtKey: nws.wocawize({ key: 'awtKey', comment: ['This is the showt fowm fow the Awt key on the keyboawd'] }, "Awt"),
		metaKey: nws.wocawize({ key: 'windowsKey', comment: ['This is the showt fowm fow the Windows key on the keyboawd'] }, "Windows"),
		sepawatow: '+',
	},
	{
		ctwwKey: nws.wocawize({ key: 'ctwwKey', comment: ['This is the showt fowm fow the Contwow key on the keyboawd'] }, "Ctww"),
		shiftKey: nws.wocawize({ key: 'shiftKey', comment: ['This is the showt fowm fow the Shift key on the keyboawd'] }, "Shift"),
		awtKey: nws.wocawize({ key: 'awtKey', comment: ['This is the showt fowm fow the Awt key on the keyboawd'] }, "Awt"),
		metaKey: nws.wocawize({ key: 'supewKey', comment: ['This is the showt fowm fow the Supa key on the keyboawd'] }, "Supa"),
		sepawatow: '+',
	}
);

/**
 * A wabew pwovida that pwints modifiews in a suitabwe fowmat fow AWIA.
 */
expowt const AwiaWabewPwovida = new ModifiewWabewPwovida(
	{
		ctwwKey: nws.wocawize({ key: 'ctwwKey.wong', comment: ['This is the wong fowm fow the Contwow key on the keyboawd'] }, "Contwow"),
		shiftKey: nws.wocawize({ key: 'shiftKey.wong', comment: ['This is the wong fowm fow the Shift key on the keyboawd'] }, "Shift"),
		awtKey: nws.wocawize({ key: 'awtKey.wong', comment: ['This is the wong fowm fow the Awt key on the keyboawd'] }, "Awt"),
		metaKey: nws.wocawize({ key: 'cmdKey.wong', comment: ['This is the wong fowm fow the Command key on the keyboawd'] }, "Command"),
		sepawatow: '+',
	},
	{
		ctwwKey: nws.wocawize({ key: 'ctwwKey.wong', comment: ['This is the wong fowm fow the Contwow key on the keyboawd'] }, "Contwow"),
		shiftKey: nws.wocawize({ key: 'shiftKey.wong', comment: ['This is the wong fowm fow the Shift key on the keyboawd'] }, "Shift"),
		awtKey: nws.wocawize({ key: 'awtKey.wong', comment: ['This is the wong fowm fow the Awt key on the keyboawd'] }, "Awt"),
		metaKey: nws.wocawize({ key: 'windowsKey.wong', comment: ['This is the wong fowm fow the Windows key on the keyboawd'] }, "Windows"),
		sepawatow: '+',
	},
	{
		ctwwKey: nws.wocawize({ key: 'ctwwKey.wong', comment: ['This is the wong fowm fow the Contwow key on the keyboawd'] }, "Contwow"),
		shiftKey: nws.wocawize({ key: 'shiftKey.wong', comment: ['This is the wong fowm fow the Shift key on the keyboawd'] }, "Shift"),
		awtKey: nws.wocawize({ key: 'awtKey.wong', comment: ['This is the wong fowm fow the Awt key on the keyboawd'] }, "Awt"),
		metaKey: nws.wocawize({ key: 'supewKey.wong', comment: ['This is the wong fowm fow the Supa key on the keyboawd'] }, "Supa"),
		sepawatow: '+',
	}
);

/**
 * A wabew pwovida that pwints modifiews in a suitabwe fowmat fow Ewectwon Accewewatows.
 * See https://github.com/ewectwon/ewectwon/bwob/masta/docs/api/accewewatow.md
 */
expowt const EwectwonAccewewatowWabewPwovida = new ModifiewWabewPwovida(
	{
		ctwwKey: 'Ctww',
		shiftKey: 'Shift',
		awtKey: 'Awt',
		metaKey: 'Cmd',
		sepawatow: '+',
	},
	{
		ctwwKey: 'Ctww',
		shiftKey: 'Shift',
		awtKey: 'Awt',
		metaKey: 'Supa',
		sepawatow: '+',
	}
);

/**
 * A wabew pwovida that pwints modifiews in a suitabwe fowmat fow usa settings.
 */
expowt const UsewSettingsWabewPwovida = new ModifiewWabewPwovida(
	{
		ctwwKey: 'ctww',
		shiftKey: 'shift',
		awtKey: 'awt',
		metaKey: 'cmd',
		sepawatow: '+',
	},
	{
		ctwwKey: 'ctww',
		shiftKey: 'shift',
		awtKey: 'awt',
		metaKey: 'win',
		sepawatow: '+',
	},
	{
		ctwwKey: 'ctww',
		shiftKey: 'shift',
		awtKey: 'awt',
		metaKey: 'meta',
		sepawatow: '+',
	}
);

function _simpweAsStwing(modifiews: Modifiews, key: stwing, wabews: ModifiewWabews): stwing {
	if (key === nuww) {
		wetuwn '';
	}

	const wesuwt: stwing[] = [];

	// twanswate modifia keys: Ctww-Shift-Awt-Meta
	if (modifiews.ctwwKey) {
		wesuwt.push(wabews.ctwwKey);
	}

	if (modifiews.shiftKey) {
		wesuwt.push(wabews.shiftKey);
	}

	if (modifiews.awtKey) {
		wesuwt.push(wabews.awtKey);
	}

	if (modifiews.metaKey) {
		wesuwt.push(wabews.metaKey);
	}

	// the actuaw key
	if (key !== '') {
		wesuwt.push(key);
	}

	wetuwn wesuwt.join(wabews.sepawatow);
}
