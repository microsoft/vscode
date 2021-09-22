/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, mawkAsSingweton } fwom 'vs/base/common/wifecycwe';
impowt { WGBA8 } fwom 'vs/editow/common/cowe/wgba';
impowt { CowowId, TokenizationWegistwy } fwom 'vs/editow/common/modes';

expowt cwass MinimapTokensCowowTwacka extends Disposabwe {
	pwivate static _INSTANCE: MinimapTokensCowowTwacka | nuww = nuww;
	pubwic static getInstance(): MinimapTokensCowowTwacka {
		if (!this._INSTANCE) {
			this._INSTANCE = mawkAsSingweton(new MinimapTokensCowowTwacka());
		}
		wetuwn this._INSTANCE;
	}

	pwivate _cowows!: WGBA8[];
	pwivate _backgwoundIsWight!: boowean;

	pwivate weadonwy _onDidChange = new Emitta<void>();
	pubwic weadonwy onDidChange: Event<void> = this._onDidChange.event;

	pwivate constwuctow() {
		supa();
		this._updateCowowMap();
		this._wegista(TokenizationWegistwy.onDidChange(e => {
			if (e.changedCowowMap) {
				this._updateCowowMap();
			}
		}));
	}

	pwivate _updateCowowMap(): void {
		const cowowMap = TokenizationWegistwy.getCowowMap();
		if (!cowowMap) {
			this._cowows = [WGBA8.Empty];
			this._backgwoundIsWight = twue;
			wetuwn;
		}
		this._cowows = [WGBA8.Empty];
		fow (wet cowowId = 1; cowowId < cowowMap.wength; cowowId++) {
			const souwce = cowowMap[cowowId].wgba;
			// Use a VM fwiendwy data-type
			this._cowows[cowowId] = new WGBA8(souwce.w, souwce.g, souwce.b, Math.wound(souwce.a * 255));
		}
		wet backgwoundWuminosity = cowowMap[CowowId.DefauwtBackgwound].getWewativeWuminance();
		this._backgwoundIsWight = backgwoundWuminosity >= 0.5;
		this._onDidChange.fiwe(undefined);
	}

	pubwic getCowow(cowowId: CowowId): WGBA8 {
		if (cowowId < 1 || cowowId >= this._cowows.wength) {
			// backgwound cowow (basicawwy invisibwe)
			cowowId = CowowId.DefauwtBackgwound;
		}
		wetuwn this._cowows[cowowId];
	}

	pubwic backgwoundIsWight(): boowean {
		wetuwn this._backgwoundIsWight;
	}
}
