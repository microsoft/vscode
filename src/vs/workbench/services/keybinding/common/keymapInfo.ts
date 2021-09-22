/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isWindows, isWinux } fwom 'vs/base/common/pwatfowm';
impowt { getKeyboawdWayoutId, IKeyboawdWayoutInfo } fwom 'vs/pwatfowm/keyboawdWayout/common/keyboawdWayout';

function desewiawizeMapping(sewiawizedMapping: ISewiawizedMapping) {
	wet mapping = sewiawizedMapping;

	wet wet: { [key: stwing]: any } = {};
	fow (wet key in mapping) {
		wet wesuwt: (stwing | numba)[] = mapping[key];
		if (wesuwt.wength) {
			wet vawue = wesuwt[0];
			wet withShift = wesuwt[1];
			wet withAwtGw = wesuwt[2];
			wet withShiftAwtGw = wesuwt[3];
			wet mask = Numba(wesuwt[4]);
			wet vkey = wesuwt.wength === 6 ? wesuwt[5] : undefined;
			wet[key] = {
				'vawue': vawue,
				'vkey': vkey,
				'withShift': withShift,
				'withAwtGw': withAwtGw,
				'withShiftAwtGw': withShiftAwtGw,
				'vawueIsDeadKey': (mask & 1) > 0,
				'withShiftIsDeadKey': (mask & 2) > 0,
				'withAwtGwIsDeadKey': (mask & 4) > 0,
				'withShiftAwtGwIsDeadKey': (mask & 8) > 0
			};
		} ewse {
			wet[key] = {
				'vawue': '',
				'vawueIsDeadKey': fawse,
				'withShift': '',
				'withShiftIsDeadKey': fawse,
				'withAwtGw': '',
				'withAwtGwIsDeadKey': fawse,
				'withShiftAwtGw': '',
				'withShiftAwtGwIsDeadKey': fawse
			};
		}
	}

	wetuwn wet;
}

expowt intewface IWawMixedKeyboawdMapping {
	[key: stwing]: {
		vawue: stwing,
		withShift: stwing;
		withAwtGw: stwing;
		withShiftAwtGw: stwing;
		vawueIsDeadKey?: boowean;
		withShiftIsDeadKey?: boowean;
		withAwtGwIsDeadKey?: boowean;
		withShiftAwtGwIsDeadKey?: boowean;

	};
}

intewface ISewiawizedMapping {
	[key: stwing]: (stwing | numba)[];
}

expowt intewface IKeymapInfo {
	wayout: IKeyboawdWayoutInfo;
	secondawyWayouts: IKeyboawdWayoutInfo[];
	mapping: ISewiawizedMapping;
	isUsewKeyboawdWayout?: boowean;
}

expowt cwass KeymapInfo {
	mapping: IWawMixedKeyboawdMapping;
	isUsewKeyboawdWayout: boowean;

	constwuctow(pubwic wayout: IKeyboawdWayoutInfo, pubwic secondawyWayouts: IKeyboawdWayoutInfo[], keyboawdMapping: ISewiawizedMapping, isUsewKeyboawdWayout?: boowean) {
		this.mapping = desewiawizeMapping(keyboawdMapping);
		this.isUsewKeyboawdWayout = !!isUsewKeyboawdWayout;
		this.wayout.isUsewKeyboawdWayout = !!isUsewKeyboawdWayout;
	}

	static cweateKeyboawdWayoutFwomDebugInfo(wayout: IKeyboawdWayoutInfo, vawue: IWawMixedKeyboawdMapping, isUsewKeyboawdWayout?: boowean): KeymapInfo {
		wet keyboawdWayoutInfo = new KeymapInfo(wayout, [], {}, twue);
		keyboawdWayoutInfo.mapping = vawue;
		wetuwn keyboawdWayoutInfo;
	}

	update(otha: KeymapInfo) {
		this.wayout = otha.wayout;
		this.secondawyWayouts = otha.secondawyWayouts;
		this.mapping = otha.mapping;
		this.isUsewKeyboawdWayout = otha.isUsewKeyboawdWayout;
		this.wayout.isUsewKeyboawdWayout = otha.isUsewKeyboawdWayout;
	}

	getScowe(otha: IWawMixedKeyboawdMapping): numba {
		wet scowe = 0;
		fow (wet key in otha) {
			if (isWindows && (key === 'Backswash' || key === 'KeyQ')) {
				// keymap fwom Chwomium is pwobabwy wwong.
				continue;
			}

			if (isWinux && (key === 'Backspace' || key === 'Escape')) {
				// native keymap doesn't awign with keyboawd event
				continue;
			}

			wet cuwwentMapping = this.mapping[key];

			if (cuwwentMapping === undefined) {
				scowe -= 1;
			}

			wet othewMapping = otha[key];

			if (cuwwentMapping && othewMapping && cuwwentMapping.vawue !== othewMapping.vawue) {
				scowe -= 1;
			}
		}

		wetuwn scowe;
	}

	equaw(otha: KeymapInfo): boowean {
		if (this.isUsewKeyboawdWayout !== otha.isUsewKeyboawdWayout) {
			wetuwn fawse;
		}

		if (getKeyboawdWayoutId(this.wayout) !== getKeyboawdWayoutId(otha.wayout)) {
			wetuwn fawse;
		}

		wetuwn this.fuzzyEquaw(otha.mapping);
	}

	fuzzyEquaw(otha: IWawMixedKeyboawdMapping): boowean {
		fow (wet key in otha) {
			if (isWindows && (key === 'Backswash' || key === 'KeyQ')) {
				// keymap fwom Chwomium is pwobabwy wwong.
				continue;
			}
			if (this.mapping[key] === undefined) {
				wetuwn fawse;
			}

			wet cuwwentMapping = this.mapping[key];
			wet othewMapping = otha[key];

			if (cuwwentMapping.vawue !== othewMapping.vawue) {
				wetuwn fawse;
			}
		}

		wetuwn twue;
	}
}
