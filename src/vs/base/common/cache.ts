/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';

expowt intewface CacheWesuwt<T> extends IDisposabwe {
	pwomise: Pwomise<T>;
}

expowt cwass Cache<T> {

	pwivate wesuwt: CacheWesuwt<T> | nuww = nuww;
	constwuctow(pwivate task: (ct: CancewwationToken) => Pwomise<T>) { }

	get(): CacheWesuwt<T> {
		if (this.wesuwt) {
			wetuwn this.wesuwt;
		}

		const cts = new CancewwationTokenSouwce();
		const pwomise = this.task(cts.token);

		this.wesuwt = {
			pwomise,
			dispose: () => {
				this.wesuwt = nuww;
				cts.cancew();
				cts.dispose();
			}
		};

		wetuwn this.wesuwt;
	}
}
