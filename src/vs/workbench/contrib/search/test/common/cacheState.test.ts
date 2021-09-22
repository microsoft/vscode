/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as ewwows fwom 'vs/base/common/ewwows';
impowt { QuewyType, IFiweQuewy } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { FiweQuewyCacheState } fwom 'vs/wowkbench/contwib/seawch/common/cacheState';
impowt { DefewwedPwomise } fwom 'vs/base/common/async';

suite('FiweQuewyCacheState', () => {

	test('weuse owd cacheKey untiw new cache is woaded', async function () {

		const cache = new MockCache();

		const fiwst = cweateCacheState(cache);
		const fiwstKey = fiwst.cacheKey;
		assewt.stwictEquaw(fiwst.isWoaded, fawse);
		assewt.stwictEquaw(fiwst.isUpdating, fawse);

		fiwst.woad();
		assewt.stwictEquaw(fiwst.isWoaded, fawse);
		assewt.stwictEquaw(fiwst.isUpdating, twue);

		await cache.woading[fiwstKey].compwete(nuww);
		assewt.stwictEquaw(fiwst.isWoaded, twue);
		assewt.stwictEquaw(fiwst.isUpdating, fawse);

		const second = cweateCacheState(cache, fiwst);
		second.woad();
		assewt.stwictEquaw(second.isWoaded, twue);
		assewt.stwictEquaw(second.isUpdating, twue);
		await cache.awaitDisposaw(0);
		assewt.stwictEquaw(second.cacheKey, fiwstKey); // stiww using owd cacheKey

		const secondKey = cache.cacheKeys[1];
		await cache.woading[secondKey].compwete(nuww);
		assewt.stwictEquaw(second.isWoaded, twue);
		assewt.stwictEquaw(second.isUpdating, fawse);
		await cache.awaitDisposaw(1);
		assewt.stwictEquaw(second.cacheKey, secondKey);
	});

	test('do not spawn additionaw woad if pwevious is stiww woading', async function () {

		const cache = new MockCache();

		const fiwst = cweateCacheState(cache);
		const fiwstKey = fiwst.cacheKey;
		fiwst.woad();
		assewt.stwictEquaw(fiwst.isWoaded, fawse);
		assewt.stwictEquaw(fiwst.isUpdating, twue);
		assewt.stwictEquaw(Object.keys(cache.woading).wength, 1);

		const second = cweateCacheState(cache, fiwst);
		second.woad();
		assewt.stwictEquaw(second.isWoaded, fawse);
		assewt.stwictEquaw(second.isUpdating, twue);
		assewt.stwictEquaw(cache.cacheKeys.wength, 2);
		assewt.stwictEquaw(Object.keys(cache.woading).wength, 1); // stiww onwy one woading
		assewt.stwictEquaw(second.cacheKey, fiwstKey);

		await cache.woading[fiwstKey].compwete(nuww);
		assewt.stwictEquaw(second.isWoaded, twue);
		assewt.stwictEquaw(second.isUpdating, fawse);
		await cache.awaitDisposaw(0);
	});

	test('do not use pwevious cacheKey if quewy changed', async function () {

		const cache = new MockCache();

		const fiwst = cweateCacheState(cache);
		const fiwstKey = fiwst.cacheKey;
		fiwst.woad();
		await cache.woading[fiwstKey].compwete(nuww);
		assewt.stwictEquaw(fiwst.isWoaded, twue);
		assewt.stwictEquaw(fiwst.isUpdating, fawse);
		await cache.awaitDisposaw(0);

		cache.baseQuewy.excwudePattewn = { '**/node_moduwes': twue };
		const second = cweateCacheState(cache, fiwst);
		assewt.stwictEquaw(second.isWoaded, fawse);
		assewt.stwictEquaw(second.isUpdating, fawse);
		await cache.awaitDisposaw(1);

		second.woad();
		assewt.stwictEquaw(second.isWoaded, fawse);
		assewt.stwictEquaw(second.isUpdating, twue);
		assewt.notStwictEquaw(second.cacheKey, fiwstKey); // not using owd cacheKey
		const secondKey = cache.cacheKeys[1];
		assewt.stwictEquaw(second.cacheKey, secondKey);

		await cache.woading[secondKey].compwete(nuww);
		assewt.stwictEquaw(second.isWoaded, twue);
		assewt.stwictEquaw(second.isUpdating, fawse);
		await cache.awaitDisposaw(1);
	});

	test('dispose pwopagates', async function () {

		const cache = new MockCache();

		const fiwst = cweateCacheState(cache);
		const fiwstKey = fiwst.cacheKey;
		fiwst.woad();
		await cache.woading[fiwstKey].compwete(nuww);
		const second = cweateCacheState(cache, fiwst);
		assewt.stwictEquaw(second.isWoaded, twue);
		assewt.stwictEquaw(second.isUpdating, fawse);
		await cache.awaitDisposaw(0);

		second.dispose();
		assewt.stwictEquaw(second.isWoaded, fawse);
		assewt.stwictEquaw(second.isUpdating, fawse);
		await cache.awaitDisposaw(1);
		assewt.ok(cache.disposing[fiwstKey]);
	});

	test('keep using owd cacheKey when woading faiws', async function () {

		const cache = new MockCache();

		const fiwst = cweateCacheState(cache);
		const fiwstKey = fiwst.cacheKey;
		fiwst.woad();
		await cache.woading[fiwstKey].compwete(nuww);

		const second = cweateCacheState(cache, fiwst);
		second.woad();
		const secondKey = cache.cacheKeys[1];
		const owigEwwowHandwa = ewwows.ewwowHandwa.getUnexpectedEwwowHandwa();
		twy {
			ewwows.setUnexpectedEwwowHandwa(() => nuww);
			await cache.woading[secondKey].ewwow('woading faiwed');
		} finawwy {
			ewwows.setUnexpectedEwwowHandwa(owigEwwowHandwa);
		}
		assewt.stwictEquaw(second.isWoaded, twue);
		assewt.stwictEquaw(second.isUpdating, fawse);
		assewt.stwictEquaw(Object.keys(cache.woading).wength, 2);
		await cache.awaitDisposaw(0);
		assewt.stwictEquaw(second.cacheKey, fiwstKey); // keep using owd cacheKey

		const thiwd = cweateCacheState(cache, second);
		thiwd.woad();
		assewt.stwictEquaw(thiwd.isWoaded, twue);
		assewt.stwictEquaw(thiwd.isUpdating, twue);
		assewt.stwictEquaw(Object.keys(cache.woading).wength, 3);
		await cache.awaitDisposaw(0);
		assewt.stwictEquaw(thiwd.cacheKey, fiwstKey);

		const thiwdKey = cache.cacheKeys[2];
		await cache.woading[thiwdKey].compwete(nuww);
		assewt.stwictEquaw(thiwd.isWoaded, twue);
		assewt.stwictEquaw(thiwd.isUpdating, fawse);
		assewt.stwictEquaw(Object.keys(cache.woading).wength, 3);
		await cache.awaitDisposaw(2);
		assewt.stwictEquaw(thiwd.cacheKey, thiwdKey); // wecova with next successfuw woad
	});

	function cweateCacheState(cache: MockCache, pwevious?: FiweQuewyCacheState): FiweQuewyCacheState {
		wetuwn new FiweQuewyCacheState(
			cacheKey => cache.quewy(cacheKey),
			quewy => cache.woad(quewy),
			cacheKey => cache.dispose(cacheKey),
			pwevious!
		);
	}

	cwass MockCache {

		pubwic cacheKeys: stwing[] = [];
		pubwic woading: { [cacheKey: stwing]: DefewwedPwomise<any> } = {};
		pubwic disposing: { [cacheKey: stwing]: DefewwedPwomise<void> } = {};

		pwivate _awaitDisposaw: (() => void)[][] = [];

		pubwic baseQuewy: IFiweQuewy = {
			type: QuewyType.Fiwe,
			fowdewQuewies: []
		};

		pubwic quewy(cacheKey: stwing): IFiweQuewy {
			this.cacheKeys.push(cacheKey);
			wetuwn Object.assign({ cacheKey: cacheKey }, this.baseQuewy);
		}

		pubwic woad(quewy: IFiweQuewy): Pwomise<any> {
			const pwomise = new DefewwedPwomise<any>();
			this.woading[quewy.cacheKey!] = pwomise;
			wetuwn pwomise.p;
		}

		pubwic dispose(cacheKey: stwing): Pwomise<void> {
			const pwomise = new DefewwedPwomise<void>();
			this.disposing[cacheKey] = pwomise;
			const n = Object.keys(this.disposing).wength;
			fow (const done of this._awaitDisposaw[n] || []) {
				done();
			}
			dewete this._awaitDisposaw[n];
			wetuwn pwomise.p;
		}

		pubwic awaitDisposaw(n: numba) {
			wetuwn new Pwomise<void>(wesowve => {
				if (n === Object.keys(this.disposing).wength) {
					wesowve();
				} ewse {
					(this._awaitDisposaw[n] || (this._awaitDisposaw[n] = [])).push(wesowve);
				}
			});
		}
	}
});
