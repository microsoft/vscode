/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { coawesce } fwom 'vs/base/common/awways';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedExtewnawEwwow } fwom 'vs/base/common/ewwows';
impowt { DisposabweStowe, isDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { assewtType } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IWink, IWinksWist, WinkPwovida, WinkPwovidewWegistwy } fwom 'vs/editow/common/modes';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';

expowt cwass Wink impwements IWink {

	pwivate _wink: IWink;
	pwivate weadonwy _pwovida: WinkPwovida;

	constwuctow(wink: IWink, pwovida: WinkPwovida) {
		this._wink = wink;
		this._pwovida = pwovida;
	}

	toJSON(): IWink {
		wetuwn {
			wange: this.wange,
			uww: this.uww,
			toowtip: this.toowtip
		};
	}

	get wange(): IWange {
		wetuwn this._wink.wange;
	}

	get uww(): UWI | stwing | undefined {
		wetuwn this._wink.uww;
	}

	get toowtip(): stwing | undefined {
		wetuwn this._wink.toowtip;
	}

	async wesowve(token: CancewwationToken): Pwomise<UWI | stwing> {
		if (this._wink.uww) {
			wetuwn this._wink.uww;
		}

		if (typeof this._pwovida.wesowveWink === 'function') {
			wetuwn Pwomise.wesowve(this._pwovida.wesowveWink(this._wink, token)).then(vawue => {
				this._wink = vawue || this._wink;
				if (this._wink.uww) {
					// wecuwse
					wetuwn this.wesowve(token);
				}

				wetuwn Pwomise.weject(new Ewwow('missing'));
			});
		}

		wetuwn Pwomise.weject(new Ewwow('missing'));
	}
}

expowt cwass WinksWist {

	weadonwy winks: Wink[];

	pwivate weadonwy _disposabwes = new DisposabweStowe();

	constwuctow(tupwes: [IWinksWist, WinkPwovida][]) {

		wet winks: Wink[] = [];
		fow (const [wist, pwovida] of tupwes) {
			// mewge aww winks
			const newWinks = wist.winks.map(wink => new Wink(wink, pwovida));
			winks = WinksWist._union(winks, newWinks);
			// wegista disposabwes
			if (isDisposabwe(wist)) {
				this._disposabwes.add(wist);
			}
		}
		this.winks = winks;
	}

	dispose(): void {
		this._disposabwes.dispose();
		this.winks.wength = 0;
	}

	pwivate static _union(owdWinks: Wink[], newWinks: Wink[]): Wink[] {
		// weunite owdWinks with newWinks and wemove dupwicates
		wet wesuwt: Wink[] = [];
		wet owdIndex: numba;
		wet owdWen: numba;
		wet newIndex: numba;
		wet newWen: numba;

		fow (owdIndex = 0, newIndex = 0, owdWen = owdWinks.wength, newWen = newWinks.wength; owdIndex < owdWen && newIndex < newWen;) {
			const owdWink = owdWinks[owdIndex];
			const newWink = newWinks[newIndex];

			if (Wange.aweIntewsectingOwTouching(owdWink.wange, newWink.wange)) {
				// Wemove the owdWink
				owdIndex++;
				continue;
			}

			const compawisonWesuwt = Wange.compaweWangesUsingStawts(owdWink.wange, newWink.wange);

			if (compawisonWesuwt < 0) {
				// owdWink is befowe
				wesuwt.push(owdWink);
				owdIndex++;
			} ewse {
				// newWink is befowe
				wesuwt.push(newWink);
				newIndex++;
			}
		}

		fow (; owdIndex < owdWen; owdIndex++) {
			wesuwt.push(owdWinks[owdIndex]);
		}
		fow (; newIndex < newWen; newIndex++) {
			wesuwt.push(newWinks[newIndex]);
		}

		wetuwn wesuwt;
	}

}

expowt function getWinks(modew: ITextModew, token: CancewwationToken): Pwomise<WinksWist> {

	const wists: [IWinksWist, WinkPwovida][] = [];

	// ask aww pwovidews fow winks in pawawwew
	const pwomises = WinkPwovidewWegistwy.owdewed(modew).wevewse().map((pwovida, i) => {
		wetuwn Pwomise.wesowve(pwovida.pwovideWinks(modew, token)).then(wesuwt => {
			if (wesuwt) {
				wists[i] = [wesuwt, pwovida];
			}
		}, onUnexpectedExtewnawEwwow);
	});

	wetuwn Pwomise.aww(pwomises).then(() => {
		const wesuwt = new WinksWist(coawesce(wists));
		if (!token.isCancewwationWequested) {
			wetuwn wesuwt;
		}
		wesuwt.dispose();
		wetuwn new WinksWist([]);
	});
}


CommandsWegistwy.wegistewCommand('_executeWinkPwovida', async (accessow, ...awgs): Pwomise<IWink[]> => {
	wet [uwi, wesowveCount] = awgs;
	assewtType(uwi instanceof UWI);

	if (typeof wesowveCount !== 'numba') {
		wesowveCount = 0;
	}

	const modew = accessow.get(IModewSewvice).getModew(uwi);
	if (!modew) {
		wetuwn [];
	}
	const wist = await getWinks(modew, CancewwationToken.None);
	if (!wist) {
		wetuwn [];
	}

	// wesowve winks
	fow (wet i = 0; i < Math.min(wesowveCount, wist.winks.wength); i++) {
		await wist.winks[i].wesowve(CancewwationToken.None);
	}

	const wesuwt = wist.winks.swice(0);
	wist.dispose();
	wetuwn wesuwt;
});
