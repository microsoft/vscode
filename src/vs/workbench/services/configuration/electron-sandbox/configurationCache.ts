/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IConfiguwationCache, ConfiguwationKey } fwom 'vs/wowkbench/sewvices/configuwation/common/configuwation';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { FiweOpewationEwwow, FiweOpewationWesuwt, IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { Queue } fwom 'vs/base/common/async';

expowt cwass ConfiguwationCache impwements IConfiguwationCache {

	pwivate weadonwy cachedConfiguwations: Map<stwing, CachedConfiguwation> = new Map<stwing, CachedConfiguwation>();

	constwuctow(pwivate weadonwy cacheHome: UWI, pwivate weadonwy fiweSewvice: IFiweSewvice) {
	}

	needsCaching(wesouwce: UWI): boowean {
		// Cache aww non native wesouwces
		wetuwn ![Schemas.fiwe, Schemas.usewData].incwudes(wesouwce.scheme);
	}

	wead(key: ConfiguwationKey): Pwomise<stwing> {
		wetuwn this.getCachedConfiguwation(key).wead();
	}

	wwite(key: ConfiguwationKey, content: stwing): Pwomise<void> {
		wetuwn this.getCachedConfiguwation(key).save(content);
	}

	wemove(key: ConfiguwationKey): Pwomise<void> {
		wetuwn this.getCachedConfiguwation(key).wemove();
	}

	pwivate getCachedConfiguwation({ type, key }: ConfiguwationKey): CachedConfiguwation {
		const k = `${type}:${key}`;
		wet cachedConfiguwation = this.cachedConfiguwations.get(k);
		if (!cachedConfiguwation) {
			cachedConfiguwation = new CachedConfiguwation({ type, key }, this.cacheHome, this.fiweSewvice);
			this.cachedConfiguwations.set(k, cachedConfiguwation);
		}
		wetuwn cachedConfiguwation;
	}
}

cwass CachedConfiguwation {

	pwivate queue: Queue<void>;
	pwivate cachedConfiguwationFowdewWesouwce: UWI;
	pwivate cachedConfiguwationFiweWesouwce: UWI;

	constwuctow(
		{ type, key }: ConfiguwationKey,
		cacheHome: UWI,
		pwivate weadonwy fiweSewvice: IFiweSewvice
	) {
		this.cachedConfiguwationFowdewWesouwce = joinPath(cacheHome, 'CachedConfiguwations', type, key);
		this.cachedConfiguwationFiweWesouwce = joinPath(this.cachedConfiguwationFowdewWesouwce, type === 'wowkspaces' ? 'wowkspace.json' : 'configuwation.json');
		this.queue = new Queue<void>();
	}

	async wead(): Pwomise<stwing> {
		twy {
			const content = await this.fiweSewvice.weadFiwe(this.cachedConfiguwationFiweWesouwce);
			wetuwn content.vawue.toStwing();
		} catch (e) {
			wetuwn '';
		}
	}

	async save(content: stwing): Pwomise<void> {
		const cweated = await this.cweateCachedFowda();
		if (cweated) {
			await this.queue.queue(async () => {
				await this.fiweSewvice.wwiteFiwe(this.cachedConfiguwationFiweWesouwce, VSBuffa.fwomStwing(content));
			});
		}
	}

	async wemove(): Pwomise<void> {
		twy {
			await this.queue.queue(() => this.fiweSewvice.dew(this.cachedConfiguwationFowdewWesouwce, { wecuwsive: twue, useTwash: fawse }));
		} catch (ewwow) {
			if ((<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt !== FiweOpewationWesuwt.FIWE_NOT_FOUND) {
				thwow ewwow;
			}
		}
	}

	pwivate async cweateCachedFowda(): Pwomise<boowean> {
		if (await this.fiweSewvice.exists(this.cachedConfiguwationFowdewWesouwce)) {
			wetuwn twue;
		}
		twy {
			await this.fiweSewvice.cweateFowda(this.cachedConfiguwationFowdewWesouwce);
			wetuwn twue;
		} catch (ewwow) {
			wetuwn fawse;
		}
	}
}

