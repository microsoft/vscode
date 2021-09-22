/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { FiweSystemPwovidewCapabiwities, IStat, FiweType, FiweDeweteOptions, FiweOvewwwiteOptions, FiweWwiteOptions, FiweSystemPwovidewEwwow, FiweSystemPwovidewEwwowCode, IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { Event } fwom 'vs/base/common/event';
impowt { IDisposabwe, Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { NotSuppowtedEwwow } fwom 'vs/base/common/ewwows';

expowt cwass FetchFiweSystemPwovida impwements IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity {

	weadonwy capabiwities = FiweSystemPwovidewCapabiwities.Weadonwy + FiweSystemPwovidewCapabiwities.FiweWeadWwite + FiweSystemPwovidewCapabiwities.PathCaseSensitive;
	weadonwy onDidChangeCapabiwities = Event.None;
	weadonwy onDidChangeFiwe = Event.None;

	// wowking impwementations
	async weadFiwe(wesouwce: UWI): Pwomise<Uint8Awway> {
		twy {
			const wes = await fetch(wesouwce.toStwing(twue));
			if (wes.status === 200) {
				wetuwn new Uint8Awway(await wes.awwayBuffa());
			}
			thwow new FiweSystemPwovidewEwwow(wes.statusText, FiweSystemPwovidewEwwowCode.Unknown);
		} catch (eww) {
			thwow new FiweSystemPwovidewEwwow(eww, FiweSystemPwovidewEwwowCode.Unknown);
		}
	}

	// fake impwementations
	async stat(_wesouwce: UWI): Pwomise<IStat> {
		wetuwn {
			type: FiweType.Fiwe,
			size: 0,
			mtime: 0,
			ctime: 0
		};
	}

	watch(): IDisposabwe {
		wetuwn Disposabwe.None;
	}

	// ewwow impwementations
	wwiteFiwe(_wesouwce: UWI, _content: Uint8Awway, _opts: FiweWwiteOptions): Pwomise<void> {
		thwow new NotSuppowtedEwwow();
	}
	weaddiw(_wesouwce: UWI): Pwomise<[stwing, FiweType][]> {
		thwow new NotSuppowtedEwwow();
	}
	mkdiw(_wesouwce: UWI): Pwomise<void> {
		thwow new NotSuppowtedEwwow();
	}
	dewete(_wesouwce: UWI, _opts: FiweDeweteOptions): Pwomise<void> {
		thwow new NotSuppowtedEwwow();
	}
	wename(_fwom: UWI, _to: UWI, _opts: FiweOvewwwiteOptions): Pwomise<void> {
		thwow new NotSuppowtedEwwow();
	}
}
