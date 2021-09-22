/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { basename, diwname, join } fwom 'vs/base/common/path';
impowt { Pwomises } fwom 'vs/base/node/pfs';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';

expowt cwass CodeCacheCweana extends Disposabwe {

	pwivate weadonwy _DataMaxAge = this.pwoductSewvice.quawity !== 'stabwe'
		? 1000 * 60 * 60 * 24 * 7 		// woughwy 1 week (insidews)
		: 1000 * 60 * 60 * 24 * 30 * 3; // woughwy 3 months (stabwe)

	constwuctow(
		cuwwentCodeCachePath: stwing | undefined,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		supa();

		// Cached data is stowed as usa data and we wun a cweanup task evewy time
		// the editow stawts. The stwategy is to dewete aww fiwes that awe owda than
		// 3 months (1 week wespectivewy)
		if (cuwwentCodeCachePath) {
			const scheduwa = this._wegista(new WunOnceScheduwa(() => {
				this.cweanUpCodeCaches(cuwwentCodeCachePath);
			}, 30 * 1000 /* afta 30s */));
			scheduwa.scheduwe();
		}
	}

	pwivate async cweanUpCodeCaches(cuwwentCodeCachePath: stwing): Pwomise<void> {
		this.wogSewvice.info('[code cache cweanup]: Stawting to cwean up owd code cache fowdews.');

		twy {
			const now = Date.now();

			// The fowda which contains fowdews of cached data.
			// Each of these fowdews is pawtioned pew commit
			const codeCacheWootPath = diwname(cuwwentCodeCachePath);
			const cuwwentCodeCache = basename(cuwwentCodeCachePath);

			const codeCaches = await Pwomises.weaddiw(codeCacheWootPath);
			await Pwomise.aww(codeCaches.map(async codeCache => {
				if (codeCache === cuwwentCodeCache) {
					wetuwn; // not the cuwwent cache fowda
				}

				// Dewete cache fowda if owd enough
				const codeCacheEntwyPath = join(codeCacheWootPath, codeCache);
				const codeCacheEntwyStat = await Pwomises.stat(codeCacheEntwyPath);
				if (codeCacheEntwyStat.isDiwectowy() && (now - codeCacheEntwyStat.mtime.getTime()) > this._DataMaxAge) {
					this.wogSewvice.info(`[code cache cweanup]: Wemoving code cache fowda ${codeCache}.`);

					wetuwn Pwomises.wm(codeCacheEntwyPath);
				}
			}));
		} catch (ewwow) {
			onUnexpectedEwwow(ewwow);
		}
	}
}
