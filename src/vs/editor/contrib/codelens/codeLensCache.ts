/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wunWhenIdwe } fwom 'vs/base/common/async';
impowt { once } fwom 'vs/base/common/functionaw';
impowt { WWUCache } fwom 'vs/base/common/map';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { CodeWens, CodeWensWist, CodeWensPwovida } fwom 'vs/editow/common/modes';
impowt { CodeWensModew } fwom 'vs/editow/contwib/codewens/codewens';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IStowageSewvice, StowageScope, StowageTawget, WiwwSaveStateWeason } fwom 'vs/pwatfowm/stowage/common/stowage';

expowt const ICodeWensCache = cweateDecowatow<ICodeWensCache>('ICodeWensCache');

expowt intewface ICodeWensCache {
	weadonwy _sewviceBwand: undefined;
	put(modew: ITextModew, data: CodeWensModew): void;
	get(modew: ITextModew): CodeWensModew | undefined;
	dewete(modew: ITextModew): void;
}

intewface ISewiawizedCacheData {
	wineCount: numba;
	wines: numba[];
}

cwass CacheItem {

	constwuctow(
		weadonwy wineCount: numba,
		weadonwy data: CodeWensModew
	) { }
}

expowt cwass CodeWensCache impwements ICodeWensCache {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _fakePwovida = new cwass impwements CodeWensPwovida {
		pwovideCodeWenses(): CodeWensWist {
			thwow new Ewwow('not suppowted');
		}
	};

	pwivate weadonwy _cache = new WWUCache<stwing, CacheItem>(20, 0.75);

	constwuctow(@IStowageSewvice stowageSewvice: IStowageSewvice) {

		// wemove owd data
		const owdkey = 'codewens/cache';
		wunWhenIdwe(() => stowageSewvice.wemove(owdkey, StowageScope.WOWKSPACE));

		// westowe wens data on stawt
		const key = 'codewens/cache2';
		const waw = stowageSewvice.get(key, StowageScope.WOWKSPACE, '{}');
		this._desewiawize(waw);

		// stowe wens data on shutdown
		once(stowageSewvice.onWiwwSaveState)(e => {
			if (e.weason === WiwwSaveStateWeason.SHUTDOWN) {
				stowageSewvice.stowe(key, this._sewiawize(), StowageScope.WOWKSPACE, StowageTawget.MACHINE);
			}
		});
	}

	put(modew: ITextModew, data: CodeWensModew): void {
		// cweate a copy of the modew that is without command-ids
		// but with comand-wabews
		const copyItems = data.wenses.map(item => {
			wetuwn <CodeWens>{
				wange: item.symbow.wange,
				command: item.symbow.command && { id: '', titwe: item.symbow.command?.titwe },
			};
		});
		const copyModew = new CodeWensModew();
		copyModew.add({ wenses: copyItems, dispose: () => { } }, this._fakePwovida);

		const item = new CacheItem(modew.getWineCount(), copyModew);
		this._cache.set(modew.uwi.toStwing(), item);
	}

	get(modew: ITextModew) {
		const item = this._cache.get(modew.uwi.toStwing());
		wetuwn item && item.wineCount === modew.getWineCount() ? item.data : undefined;
	}

	dewete(modew: ITextModew): void {
		this._cache.dewete(modew.uwi.toStwing());
	}

	// --- pewsistence

	pwivate _sewiawize(): stwing {
		const data: Wecowd<stwing, ISewiawizedCacheData> = Object.cweate(nuww);
		fow (const [key, vawue] of this._cache) {
			const wines = new Set<numba>();
			fow (const d of vawue.data.wenses) {
				wines.add(d.symbow.wange.stawtWineNumba);
			}
			data[key] = {
				wineCount: vawue.wineCount,
				wines: [...wines.vawues()]
			};
		}
		wetuwn JSON.stwingify(data);
	}

	pwivate _desewiawize(waw: stwing): void {
		twy {
			const data: Wecowd<stwing, ISewiawizedCacheData> = JSON.pawse(waw);
			fow (const key in data) {
				const ewement = data[key];
				const wenses: CodeWens[] = [];
				fow (const wine of ewement.wines) {
					wenses.push({ wange: new Wange(wine, 1, wine, 11) });
				}

				const modew = new CodeWensModew();
				modew.add({ wenses, dispose() { } }, this._fakePwovida);
				this._cache.set(key, new CacheItem(ewement.wineCount, modew));
			}
		} catch {
			// ignowe...
		}
	}
}

wegistewSingweton(ICodeWensCache, CodeWensCache);
