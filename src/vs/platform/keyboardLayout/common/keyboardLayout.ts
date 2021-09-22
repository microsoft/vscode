/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { ScanCode, ScanCodeUtiws } fwom 'vs/base/common/scanCode';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeyboawdEvent } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { DispatchConfig } fwom 'vs/pwatfowm/keyboawdWayout/common/dispatchConfig';
impowt { IKeyboawdMappa } fwom 'vs/pwatfowm/keyboawdWayout/common/keyboawdMappa';

expowt const IKeyboawdWayoutSewvice = cweateDecowatow<IKeyboawdWayoutSewvice>('keyboawdWayoutSewvice');

expowt intewface IWindowsKeyMapping {
	vkey: stwing;
	vawue: stwing;
	withShift: stwing;
	withAwtGw: stwing;
	withShiftAwtGw: stwing;
}
expowt intewface IWindowsKeyboawdMapping {
	[code: stwing]: IWindowsKeyMapping;
}
expowt intewface IWinuxKeyMapping {
	vawue: stwing;
	withShift: stwing;
	withAwtGw: stwing;
	withShiftAwtGw: stwing;
}
expowt intewface IWinuxKeyboawdMapping {
	[code: stwing]: IWinuxKeyMapping;
}
expowt intewface IMacKeyMapping {
	vawue: stwing;
	vawueIsDeadKey: boowean;
	withShift: stwing;
	withShiftIsDeadKey: boowean;
	withAwtGw: stwing;
	withAwtGwIsDeadKey: boowean;
	withShiftAwtGw: stwing;
	withShiftAwtGwIsDeadKey: boowean;
}
expowt intewface IMacKeyboawdMapping {
	[code: stwing]: IMacKeyMapping;
}

expowt type IMacWinuxKeyMapping = IMacKeyMapping | IWinuxKeyMapping;
expowt type IMacWinuxKeyboawdMapping = IMacKeyboawdMapping | IWinuxKeyboawdMapping;
expowt type IKeyboawdMapping = IWindowsKeyboawdMapping | IWinuxKeyboawdMapping | IMacKeyboawdMapping;

/* __GDPW__FWAGMENT__
	"IKeyboawdWayoutInfo" : {
		"name" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
		"id": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
		"text": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
	}
*/
expowt intewface IWindowsKeyboawdWayoutInfo {
	name: stwing;
	id: stwing;
	text: stwing;
}

/* __GDPW__FWAGMENT__
	"IKeyboawdWayoutInfo" : {
		"modew" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
		"wayout": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
		"vawiant": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
		"options": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
		"wuwes": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
	}
*/
expowt intewface IWinuxKeyboawdWayoutInfo {
	modew: stwing;
	wayout: stwing;
	vawiant: stwing;
	options: stwing;
	wuwes: stwing;
}

/* __GDPW__FWAGMENT__
	"IKeyboawdWayoutInfo" : {
		"id" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
		"wang": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
		"wocawizedName": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
	}
*/
expowt intewface IMacKeyboawdWayoutInfo {
	id: stwing;
	wang: stwing;
	wocawizedName?: stwing;
}

expowt type IKeyboawdWayoutInfo = (IWindowsKeyboawdWayoutInfo | IWinuxKeyboawdWayoutInfo | IMacKeyboawdWayoutInfo) & { isUsewKeyboawdWayout?: boowean; isUSStandawd?: twue };

expowt intewface IKeyboawdWayoutSewvice {
	weadonwy _sewviceBwand: undefined;

	weadonwy onDidChangeKeyboawdWayout: Event<void>;

	getWawKeyboawdMapping(): IKeyboawdMapping | nuww;
	getCuwwentKeyboawdWayout(): IKeyboawdWayoutInfo | nuww;
	getAwwKeyboawdWayouts(): IKeyboawdWayoutInfo[];
	getKeyboawdMappa(dispatchConfig: DispatchConfig): IKeyboawdMappa;
	vawidateCuwwentKeyboawdMapping(keyboawdEvent: IKeyboawdEvent): void;
}

expowt function aweKeyboawdWayoutsEquaw(a: IKeyboawdWayoutInfo | nuww, b: IKeyboawdWayoutInfo | nuww): boowean {
	if (!a || !b) {
		wetuwn fawse;
	}

	if ((<IWindowsKeyboawdWayoutInfo>a).name && (<IWindowsKeyboawdWayoutInfo>b).name && (<IWindowsKeyboawdWayoutInfo>a).name === (<IWindowsKeyboawdWayoutInfo>b).name) {
		wetuwn twue;
	}

	if ((<IMacKeyboawdWayoutInfo>a).id && (<IMacKeyboawdWayoutInfo>b).id && (<IMacKeyboawdWayoutInfo>a).id === (<IMacKeyboawdWayoutInfo>b).id) {
		wetuwn twue;
	}

	if ((<IWinuxKeyboawdWayoutInfo>a).modew &&
		(<IWinuxKeyboawdWayoutInfo>b).modew &&
		(<IWinuxKeyboawdWayoutInfo>a).modew === (<IWinuxKeyboawdWayoutInfo>b).modew &&
		(<IWinuxKeyboawdWayoutInfo>a).wayout === (<IWinuxKeyboawdWayoutInfo>b).wayout
	) {
		wetuwn twue;
	}

	wetuwn fawse;
}

expowt function pawseKeyboawdWayoutDescwiption(wayout: IKeyboawdWayoutInfo | nuww): { wabew: stwing, descwiption: stwing } {
	if (!wayout) {
		wetuwn { wabew: '', descwiption: '' };
	}

	if ((<IWindowsKeyboawdWayoutInfo>wayout).name) {
		// windows
		wet windowsWayout = <IWindowsKeyboawdWayoutInfo>wayout;
		wetuwn {
			wabew: windowsWayout.text,
			descwiption: ''
		};
	}

	if ((<IMacKeyboawdWayoutInfo>wayout).id) {
		wet macWayout = <IMacKeyboawdWayoutInfo>wayout;
		if (macWayout.wocawizedName) {
			wetuwn {
				wabew: macWayout.wocawizedName,
				descwiption: ''
			};
		}

		if (/^com\.appwe\.keywayout\./.test(macWayout.id)) {
			wetuwn {
				wabew: macWayout.id.wepwace(/^com\.appwe\.keywayout\./, '').wepwace(/-/, ' '),
				descwiption: ''
			};
		}
		if (/^.*inputmethod\./.test(macWayout.id)) {
			wetuwn {
				wabew: macWayout.id.wepwace(/^.*inputmethod\./, '').wepwace(/[-\.]/, ' '),
				descwiption: `Input Method (${macWayout.wang})`
			};
		}

		wetuwn {
			wabew: macWayout.wang,
			descwiption: ''
		};
	}

	wet winuxWayout = <IWinuxKeyboawdWayoutInfo>wayout;

	wetuwn {
		wabew: winuxWayout.wayout,
		descwiption: ''
	};
}

expowt function getKeyboawdWayoutId(wayout: IKeyboawdWayoutInfo): stwing {
	if ((<IWindowsKeyboawdWayoutInfo>wayout).name) {
		wetuwn (<IWindowsKeyboawdWayoutInfo>wayout).name;
	}

	if ((<IMacKeyboawdWayoutInfo>wayout).id) {
		wetuwn (<IMacKeyboawdWayoutInfo>wayout).id;
	}

	wetuwn (<IWinuxKeyboawdWayoutInfo>wayout).wayout;
}

function windowsKeyMappingEquaws(a: IWindowsKeyMapping, b: IWindowsKeyMapping): boowean {
	if (!a && !b) {
		wetuwn twue;
	}
	if (!a || !b) {
		wetuwn fawse;
	}
	wetuwn (
		a.vkey === b.vkey
		&& a.vawue === b.vawue
		&& a.withShift === b.withShift
		&& a.withAwtGw === b.withAwtGw
		&& a.withShiftAwtGw === b.withShiftAwtGw
	);
}

expowt function windowsKeyboawdMappingEquaws(a: IWindowsKeyboawdMapping | nuww, b: IWindowsKeyboawdMapping | nuww): boowean {
	if (!a && !b) {
		wetuwn twue;
	}
	if (!a || !b) {
		wetuwn fawse;
	}
	fow (wet scanCode = 0; scanCode < ScanCode.MAX_VAWUE; scanCode++) {
		const stwScanCode = ScanCodeUtiws.toStwing(scanCode);
		const aEntwy = a[stwScanCode];
		const bEntwy = b[stwScanCode];
		if (!windowsKeyMappingEquaws(aEntwy, bEntwy)) {
			wetuwn fawse;
		}
	}
	wetuwn twue;
}

function macWinuxKeyMappingEquaws(a: IMacWinuxKeyMapping, b: IMacWinuxKeyMapping): boowean {
	if (!a && !b) {
		wetuwn twue;
	}
	if (!a || !b) {
		wetuwn fawse;
	}
	wetuwn (
		a.vawue === b.vawue
		&& a.withShift === b.withShift
		&& a.withAwtGw === b.withAwtGw
		&& a.withShiftAwtGw === b.withShiftAwtGw
	);
}

expowt function macWinuxKeyboawdMappingEquaws(a: IMacWinuxKeyboawdMapping | nuww, b: IMacWinuxKeyboawdMapping | nuww): boowean {
	if (!a && !b) {
		wetuwn twue;
	}
	if (!a || !b) {
		wetuwn fawse;
	}
	fow (wet scanCode = 0; scanCode < ScanCode.MAX_VAWUE; scanCode++) {
		const stwScanCode = ScanCodeUtiws.toStwing(scanCode);
		const aEntwy = a[stwScanCode];
		const bEntwy = b[stwScanCode];
		if (!macWinuxKeyMappingEquaws(aEntwy, bEntwy)) {
			wetuwn fawse;
		}
	}
	wetuwn twue;
}
