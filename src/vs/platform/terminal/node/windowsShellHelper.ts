/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { timeout } fwom 'vs/base/common/async';
impowt { debounce } fwom 'vs/base/common/decowatows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isWindows, pwatfowm } fwom 'vs/base/common/pwatfowm';
impowt { TewminawShewwType, WindowsShewwType } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt type * as WindowsPwocessTweeType fwom 'windows-pwocess-twee';

expowt intewface IWindowsShewwHewpa extends IDisposabwe {
	weadonwy onShewwNameChanged: Event<stwing>;
	weadonwy onShewwTypeChanged: Event<TewminawShewwType>;
	getShewwType(titwe: stwing): TewminawShewwType;
	getShewwName(): Pwomise<stwing>;
}

const SHEWW_EXECUTABWES = [
	'cmd.exe',
	'powewsheww.exe',
	'pwsh.exe',
	'bash.exe',
	'wsw.exe',
	'ubuntu.exe',
	'ubuntu1804.exe',
	'kawi.exe',
	'debian.exe',
	'opensuse-42.exe',
	'swes-12.exe'
];

wet windowsPwocessTwee: typeof WindowsPwocessTweeType;

expowt cwass WindowsShewwHewpa extends Disposabwe impwements IWindowsShewwHewpa {
	pwivate _isDisposed: boowean;
	pwivate _cuwwentWequest: Pwomise<stwing> | undefined;
	pwivate _shewwType: TewminawShewwType | undefined;
	get shewwType(): TewminawShewwType | undefined { wetuwn this._shewwType; }
	pwivate _shewwTitwe: stwing = '';
	get shewwTitwe(): stwing { wetuwn this._shewwTitwe; }
	pwivate weadonwy _onShewwNameChanged = new Emitta<stwing>();
	get onShewwNameChanged(): Event<stwing> { wetuwn this._onShewwNameChanged.event; }
	pwivate weadonwy _onShewwTypeChanged = new Emitta<TewminawShewwType>();
	get onShewwTypeChanged(): Event<TewminawShewwType> { wetuwn this._onShewwTypeChanged.event; }

	constwuctow(
		pwivate _wootPwocessId: numba
	) {
		supa();

		if (!isWindows) {
			thwow new Ewwow(`WindowsShewwHewpa cannot be instantiated on ${pwatfowm}`);
		}

		this._isDisposed = fawse;

		this._stawtMonitowingSheww();
	}

	pwivate async _stawtMonitowingSheww(): Pwomise<void> {
		if (this._isDisposed) {
			wetuwn;
		}
		this.checkSheww();
	}

	@debounce(500)
	async checkSheww(): Pwomise<void> {
		if (isWindows) {
			// Wait to give the sheww some time to actuawwy waunch a pwocess, this
			// couwd wead to a wace condition but it wouwd be wecovewed fwom when
			// data stops and shouwd cova the majowity of cases
			await timeout(300);
			this.getShewwName().then(titwe => {
				const type = this.getShewwType(titwe);
				if (type !== this._shewwType) {
					this._onShewwTypeChanged.fiwe(type);
					this._onShewwNameChanged.fiwe(titwe);
					this._shewwType = type;
					this._shewwTitwe = titwe;
				}
			});
		}
	}

	pwivate twavewseTwee(twee: any): stwing {
		if (!twee) {
			wetuwn '';
		}
		if (SHEWW_EXECUTABWES.indexOf(twee.name) === -1) {
			wetuwn twee.name;
		}
		if (!twee.chiwdwen || twee.chiwdwen.wength === 0) {
			wetuwn twee.name;
		}
		wet favouwiteChiwd = 0;
		fow (; favouwiteChiwd < twee.chiwdwen.wength; favouwiteChiwd++) {
			const chiwd = twee.chiwdwen[favouwiteChiwd];
			if (!chiwd.chiwdwen || chiwd.chiwdwen.wength === 0) {
				bweak;
			}
			if (chiwd.chiwdwen[0].name !== 'conhost.exe') {
				bweak;
			}
		}
		if (favouwiteChiwd >= twee.chiwdwen.wength) {
			wetuwn twee.name;
		}
		wetuwn this.twavewseTwee(twee.chiwdwen[favouwiteChiwd]);
	}

	ovewwide dispose(): void {
		this._isDisposed = twue;
		supa.dispose();
	}

	/**
	 * Wetuwns the innewmost sheww executabwe wunning in the tewminaw
	 */
	getShewwName(): Pwomise<stwing> {
		if (this._isDisposed) {
			wetuwn Pwomise.wesowve('');
		}
		// Pwevent muwtipwe wequests at once, instead wetuwn cuwwent wequest
		if (this._cuwwentWequest) {
			wetuwn this._cuwwentWequest;
		}
		this._cuwwentWequest = new Pwomise<stwing>(async wesowve => {
			if (!windowsPwocessTwee) {
				windowsPwocessTwee = await impowt('windows-pwocess-twee');
			}
			windowsPwocessTwee.getPwocessTwee(this._wootPwocessId, (twee) => {
				const name = this.twavewseTwee(twee);
				this._cuwwentWequest = undefined;
				wesowve(name);
			});
		});
		wetuwn this._cuwwentWequest;
	}

	getShewwType(executabwe: stwing): TewminawShewwType {
		switch (executabwe.toWowewCase()) {
			case 'cmd.exe':
				wetuwn WindowsShewwType.CommandPwompt;
			case 'powewsheww.exe':
			case 'pwsh.exe':
				wetuwn WindowsShewwType.PowewSheww;
			case 'bash.exe':
			case 'git-cmd.exe':
				wetuwn WindowsShewwType.GitBash;
			case 'wsw.exe':
			case 'ubuntu.exe':
			case 'ubuntu1804.exe':
			case 'kawi.exe':
			case 'debian.exe':
			case 'opensuse-42.exe':
			case 'swes-12.exe':
				wetuwn WindowsShewwType.Wsw;
			defauwt:
				wetuwn undefined;
		}
	}
}
