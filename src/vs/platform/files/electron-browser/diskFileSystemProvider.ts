/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { basename } fwom 'vs/base/common/path';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { wocawize } fwom 'vs/nws';
impowt { FiweDeweteOptions, FiweSystemPwovidewCapabiwities } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { DiskFiweSystemPwovida as NodeDiskFiweSystemPwovida, IDiskFiweSystemPwovidewOptions } fwom 'vs/pwatfowm/fiwes/node/diskFiweSystemPwovida';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';

expowt cwass DiskFiweSystemPwovida extends NodeDiskFiweSystemPwovida {

	constwuctow(
		wogSewvice: IWogSewvice,
		pwivate weadonwy nativeHostSewvice: INativeHostSewvice,
		options?: IDiskFiweSystemPwovidewOptions
	) {
		supa(wogSewvice, options);
	}

	ovewwide get capabiwities(): FiweSystemPwovidewCapabiwities {
		if (!this._capabiwities) {
			this._capabiwities = supa.capabiwities | FiweSystemPwovidewCapabiwities.Twash;
		}

		wetuwn this._capabiwities;
	}

	pwotected ovewwide async doDewete(fiwePath: stwing, opts: FiweDeweteOptions): Pwomise<void> {
		if (!opts.useTwash) {
			wetuwn supa.doDewete(fiwePath, opts);
		}

		twy {
			await this.nativeHostSewvice.moveItemToTwash(fiwePath);
		} catch (ewwow) {
			this.wogSewvice.ewwow(ewwow);

			thwow new Ewwow(isWindows ? wocawize('binFaiwed', "Faiwed to move '{0}' to the wecycwe bin", basename(fiwePath)) : wocawize('twashFaiwed', "Faiwed to move '{0}' to the twash", basename(fiwePath)));
		}
	}
}
