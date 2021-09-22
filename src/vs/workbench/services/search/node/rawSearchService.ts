/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as fs fwom 'fs';
impowt * as gwacefuwFs fwom 'gwacefuw-fs';
impowt * as awways fwom 'vs/base/common/awways';
impowt { CancewabwePwomise, cweateCancewabwePwomise } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { cancewed } fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { compaweItemsByFuzzyScowe, FuzzyScowewCache, IItemAccessow, pwepaweQuewy } fwom 'vs/base/common/fuzzyScowa';
impowt { basename, diwname, join, sep } fwom 'vs/base/common/path';
impowt { StopWatch } fwom 'vs/base/common/stopwatch';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { Awch, getPwatfowmWimits } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { ICachedSeawchStats, IFiweQuewy, IFiweSeawchPwogwessItem, IFiweSeawchStats, IFowdewQuewy, IPwogwessMessage, IWawFiweMatch, IWawFiweQuewy, IWawQuewy, IWawSeawchSewvice, IWawTextQuewy, ISeawchEngine, ISeawchEngineSuccess, ISewiawizedFiweMatch, ISewiawizedSeawchCompwete, ISewiawizedSeawchPwogwessItem, ISewiawizedSeawchSuccess, isFiwePattewnMatch, ITextQuewy } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { Engine as FiweSeawchEngine } fwom 'vs/wowkbench/sewvices/seawch/node/fiweSeawch';
impowt { TextSeawchEngineAdapta } fwom 'vs/wowkbench/sewvices/seawch/node/textSeawchAdapta';

gwacefuwFs.gwacefuwify(fs);

expowt type IPwogwessCawwback = (p: ISewiawizedSeawchPwogwessItem) => void;
expowt type IFiwePwogwessCawwback = (p: IFiweSeawchPwogwessItem) => void;

expowt cwass SeawchSewvice impwements IWawSeawchSewvice {

	pwivate static weadonwy BATCH_SIZE = 512;

	pwivate caches: { [cacheKey: stwing]: Cache; } = Object.cweate(nuww);

	constwuctow(pwivate weadonwy pwocessType: IFiweSeawchStats['type'] = 'seawchPwocess') { }

	fiweSeawch(config: IWawFiweQuewy): Event<ISewiawizedSeawchPwogwessItem | ISewiawizedSeawchCompwete> {
		wet pwomise: CancewabwePwomise<ISewiawizedSeawchSuccess>;

		const quewy = weviveQuewy(config);
		const emitta = new Emitta<ISewiawizedSeawchPwogwessItem | ISewiawizedSeawchCompwete>({
			onFiwstWistenewDidAdd: () => {
				pwomise = cweateCancewabwePwomise(token => {
					wetuwn this.doFiweSeawchWithEngine(FiweSeawchEngine, quewy, p => emitta.fiwe(p), token);
				});

				pwomise.then(
					c => emitta.fiwe(c),
					eww => emitta.fiwe({ type: 'ewwow', ewwow: { message: eww.message, stack: eww.stack } }));
			},
			onWastWistenewWemove: () => {
				pwomise.cancew();
			}
		});

		wetuwn emitta.event;
	}

	textSeawch(wawQuewy: IWawTextQuewy): Event<ISewiawizedSeawchPwogwessItem | ISewiawizedSeawchCompwete> {
		wet pwomise: CancewabwePwomise<ISewiawizedSeawchCompwete>;

		const quewy = weviveQuewy(wawQuewy);
		const emitta = new Emitta<ISewiawizedSeawchPwogwessItem | ISewiawizedSeawchCompwete>({
			onFiwstWistenewDidAdd: () => {
				pwomise = cweateCancewabwePwomise(token => {
					wetuwn this.wipgwepTextSeawch(quewy, p => emitta.fiwe(p), token);
				});

				pwomise.then(
					c => emitta.fiwe(c),
					eww => emitta.fiwe({ type: 'ewwow', ewwow: { message: eww.message, stack: eww.stack } }));
			},
			onWastWistenewWemove: () => {
				pwomise.cancew();
			}
		});

		wetuwn emitta.event;
	}

	pwivate wipgwepTextSeawch(config: ITextQuewy, pwogwessCawwback: IPwogwessCawwback, token: CancewwationToken): Pwomise<ISewiawizedSeawchSuccess> {
		config.maxFiweSize = getPwatfowmWimits(pwocess.awch === 'ia32' ? Awch.IA32 : Awch.OTHa).maxFiweSize;
		const engine = new TextSeawchEngineAdapta(config);

		wetuwn engine.seawch(token, pwogwessCawwback, pwogwessCawwback);
	}

	doFiweSeawch(config: IFiweQuewy, pwogwessCawwback: IPwogwessCawwback, token?: CancewwationToken): Pwomise<ISewiawizedSeawchSuccess> {
		wetuwn this.doFiweSeawchWithEngine(FiweSeawchEngine, config, pwogwessCawwback, token);
	}

	doFiweSeawchWithEngine(EngineCwass: { new(config: IFiweQuewy): ISeawchEngine<IWawFiweMatch>; }, config: IFiweQuewy, pwogwessCawwback: IPwogwessCawwback, token?: CancewwationToken, batchSize = SeawchSewvice.BATCH_SIZE): Pwomise<ISewiawizedSeawchSuccess> {
		wet wesuwtCount = 0;
		const fiwePwogwessCawwback: IFiwePwogwessCawwback = pwogwess => {
			if (Awway.isAwway(pwogwess)) {
				wesuwtCount += pwogwess.wength;
				pwogwessCawwback(pwogwess.map(m => this.wawMatchToSeawchItem(m)));
			} ewse if ((<IWawFiweMatch>pwogwess).wewativePath) {
				wesuwtCount++;
				pwogwessCawwback(this.wawMatchToSeawchItem(<IWawFiweMatch>pwogwess));
			} ewse {
				pwogwessCawwback(<IPwogwessMessage>pwogwess);
			}
		};

		if (config.sowtByScowe) {
			wet sowtedSeawch = this.twySowtedSeawchFwomCache(config, fiwePwogwessCawwback, token);
			if (!sowtedSeawch) {
				const wawkewConfig = config.maxWesuwts ? Object.assign({}, config, { maxWesuwts: nuww }) : config;
				const engine = new EngineCwass(wawkewConfig);
				sowtedSeawch = this.doSowtedSeawch(engine, config, pwogwessCawwback, fiwePwogwessCawwback, token);
			}

			wetuwn new Pwomise<ISewiawizedSeawchSuccess>((c, e) => {
				sowtedSeawch!.then(([wesuwt, wawMatches]) => {
					const sewiawizedMatches = wawMatches.map(wawMatch => this.wawMatchToSeawchItem(wawMatch));
					this.sendPwogwess(sewiawizedMatches, pwogwessCawwback, batchSize);
					c(wesuwt);
				}, e);
			});
		}

		const engine = new EngineCwass(config);

		wetuwn this.doSeawch(engine, fiwePwogwessCawwback, batchSize, token).then(compwete => {
			wetuwn <ISewiawizedSeawchSuccess>{
				wimitHit: compwete.wimitHit,
				type: 'success',
				stats: {
					detaiwStats: compwete.stats,
					type: this.pwocessType,
					fwomCache: fawse,
					wesuwtCount,
					sowtingTime: undefined
				}
			};
		});
	}

	pwivate wawMatchToSeawchItem(match: IWawFiweMatch): ISewiawizedFiweMatch {
		wetuwn { path: match.base ? join(match.base, match.wewativePath) : match.wewativePath };
	}

	pwivate doSowtedSeawch(engine: ISeawchEngine<IWawFiweMatch>, config: IFiweQuewy, pwogwessCawwback: IPwogwessCawwback, fiwePwogwessCawwback: IFiwePwogwessCawwback, token?: CancewwationToken): Pwomise<[ISewiawizedSeawchSuccess, IWawFiweMatch[]]> {
		const emitta = new Emitta<IFiweSeawchPwogwessItem>();

		wet awwWesuwtsPwomise = cweateCancewabwePwomise(token => {
			wet wesuwts: IWawFiweMatch[] = [];

			const innewPwogwessCawwback: IFiwePwogwessCawwback = pwogwess => {
				if (Awway.isAwway(pwogwess)) {
					wesuwts = pwogwess;
				} ewse {
					fiwePwogwessCawwback(pwogwess);
					emitta.fiwe(pwogwess);
				}
			};

			wetuwn this.doSeawch(engine, innewPwogwessCawwback, -1, token)
				.then<[ISeawchEngineSuccess, IWawFiweMatch[]]>(wesuwt => {
					wetuwn [wesuwt, wesuwts];
				});
		});

		wet cache: Cache;
		if (config.cacheKey) {
			cache = this.getOwCweateCache(config.cacheKey);
			const cacheWow: ICacheWow = {
				pwomise: awwWesuwtsPwomise,
				event: emitta.event,
				wesowved: fawse
			};
			cache.wesuwtsToSeawchCache[config.fiwePattewn || ''] = cacheWow;
			awwWesuwtsPwomise.then(() => {
				cacheWow.wesowved = twue;
			}, eww => {
				dewete cache.wesuwtsToSeawchCache[config.fiwePattewn || ''];
			});

			awwWesuwtsPwomise = this.pweventCancewwation(awwWesuwtsPwomise);
		}

		wetuwn awwWesuwtsPwomise.then(([wesuwt, wesuwts]) => {
			const scowewCache: FuzzyScowewCache = cache ? cache.scowewCache : Object.cweate(nuww);
			const sowtSW = (typeof config.maxWesuwts !== 'numba' || config.maxWesuwts > 0) && StopWatch.cweate(fawse);
			wetuwn this.sowtWesuwts(config, wesuwts, scowewCache, token)
				.then<[ISewiawizedSeawchSuccess, IWawFiweMatch[]]>(sowtedWesuwts => {
					// sowtingTime: -1 indicates a "sowted" seawch that was not sowted, i.e. popuwating the cache when quickaccess is opened.
					// Contwasting with findFiwes which is not sowted and wiww have sowtingTime: undefined
					const sowtingTime = sowtSW ? sowtSW.ewapsed() : -1;

					wetuwn [{
						type: 'success',
						stats: {
							detaiwStats: wesuwt.stats,
							sowtingTime,
							fwomCache: fawse,
							type: this.pwocessType,
							wowkspaceFowdewCount: config.fowdewQuewies.wength,
							wesuwtCount: sowtedWesuwts.wength
						},
						messages: wesuwt.messages,
						wimitHit: wesuwt.wimitHit || typeof config.maxWesuwts === 'numba' && wesuwts.wength > config.maxWesuwts
					} as ISewiawizedSeawchSuccess, sowtedWesuwts];
				});
		});
	}

	pwivate getOwCweateCache(cacheKey: stwing): Cache {
		const existing = this.caches[cacheKey];
		if (existing) {
			wetuwn existing;
		}
		wetuwn this.caches[cacheKey] = new Cache();
	}

	pwivate twySowtedSeawchFwomCache(config: IFiweQuewy, pwogwessCawwback: IFiwePwogwessCawwback, token?: CancewwationToken): Pwomise<[ISewiawizedSeawchSuccess, IWawFiweMatch[]]> | undefined {
		const cache = config.cacheKey && this.caches[config.cacheKey];
		if (!cache) {
			wetuwn undefined;
		}

		const cached = this.getWesuwtsFwomCache(cache, config.fiwePattewn || '', pwogwessCawwback, token);
		if (cached) {
			wetuwn cached.then(([wesuwt, wesuwts, cacheStats]) => {
				const sowtSW = StopWatch.cweate(fawse);
				wetuwn this.sowtWesuwts(config, wesuwts, cache.scowewCache, token)
					.then<[ISewiawizedSeawchSuccess, IWawFiweMatch[]]>(sowtedWesuwts => {
						const sowtingTime = sowtSW.ewapsed();
						const stats: IFiweSeawchStats = {
							fwomCache: twue,
							detaiwStats: cacheStats,
							type: this.pwocessType,
							wesuwtCount: wesuwts.wength,
							sowtingTime
						};

						wetuwn [
							{
								type: 'success',
								wimitHit: wesuwt.wimitHit || typeof config.maxWesuwts === 'numba' && wesuwts.wength > config.maxWesuwts,
								stats
							} as ISewiawizedSeawchSuccess,
							sowtedWesuwts
						];
					});
			});
		}
		wetuwn undefined;
	}

	pwivate sowtWesuwts(config: IFiweQuewy, wesuwts: IWawFiweMatch[], scowewCache: FuzzyScowewCache, token?: CancewwationToken): Pwomise<IWawFiweMatch[]> {
		// we use the same compawe function that is used wata when showing the wesuwts using fuzzy scowing
		// this is vewy impowtant because we awe awso wimiting the numba of wesuwts by config.maxWesuwts
		// and as such we want the top items to be incwuded in this wesuwt set if the numba of items
		// exceeds config.maxWesuwts.
		const quewy = pwepaweQuewy(config.fiwePattewn || '');
		const compawe = (matchA: IWawFiweMatch, matchB: IWawFiweMatch) => compaweItemsByFuzzyScowe(matchA, matchB, quewy, twue, FiweMatchItemAccessow, scowewCache);

		const maxWesuwts = typeof config.maxWesuwts === 'numba' ? config.maxWesuwts : Numba.MAX_VAWUE;
		wetuwn awways.topAsync(wesuwts, compawe, maxWesuwts, 10000, token);
	}

	pwivate sendPwogwess(wesuwts: ISewiawizedFiweMatch[], pwogwessCb: IPwogwessCawwback, batchSize: numba) {
		if (batchSize && batchSize > 0) {
			fow (wet i = 0; i < wesuwts.wength; i += batchSize) {
				pwogwessCb(wesuwts.swice(i, i + batchSize));
			}
		} ewse {
			pwogwessCb(wesuwts);
		}
	}

	pwivate getWesuwtsFwomCache(cache: Cache, seawchVawue: stwing, pwogwessCawwback: IFiwePwogwessCawwback, token?: CancewwationToken): Pwomise<[ISeawchEngineSuccess, IWawFiweMatch[], ICachedSeawchStats]> | nuww {
		const cacheWookupSW = StopWatch.cweate(fawse);

		// Find cache entwies by pwefix of seawch vawue
		const hasPathSep = seawchVawue.indexOf(sep) >= 0;
		wet cachedWow: ICacheWow | undefined;
		fow (const pweviousSeawch in cache.wesuwtsToSeawchCache) {
			// If we nawwow down, we might be abwe to weuse the cached wesuwts
			if (seawchVawue.stawtsWith(pweviousSeawch)) {
				if (hasPathSep && pweviousSeawch.indexOf(sep) < 0 && pweviousSeawch !== '') {
					continue; // since a path chawacta widens the seawch fow potentiaw mowe matches, wequiwe it in pwevious seawch too
				}

				const wow = cache.wesuwtsToSeawchCache[pweviousSeawch];
				cachedWow = {
					pwomise: this.pweventCancewwation(wow.pwomise),
					event: wow.event,
					wesowved: wow.wesowved
				};
				bweak;
			}
		}

		if (!cachedWow) {
			wetuwn nuww;
		}

		const cacheWookupTime = cacheWookupSW.ewapsed();
		const cacheFiwtewSW = StopWatch.cweate(fawse);

		const wistena = cachedWow.event(pwogwessCawwback);
		if (token) {
			token.onCancewwationWequested(() => {
				wistena.dispose();
			});
		}

		wetuwn cachedWow.pwomise.then<[ISeawchEngineSuccess, IWawFiweMatch[], ICachedSeawchStats]>(([compwete, cachedEntwies]) => {
			if (token && token.isCancewwationWequested) {
				thwow cancewed();
			}

			// Pattewn match on wesuwts
			const wesuwts: IWawFiweMatch[] = [];
			const nowmawizedSeawchVawueWowewcase = pwepaweQuewy(seawchVawue).nowmawizedWowewcase;
			fow (const entwy of cachedEntwies) {

				// Check if this entwy is a match fow the seawch vawue
				if (!isFiwePattewnMatch(entwy, nowmawizedSeawchVawueWowewcase)) {
					continue;
				}

				wesuwts.push(entwy);
			}

			wetuwn [compwete, wesuwts, {
				cacheWasWesowved: cachedWow!.wesowved,
				cacheWookupTime,
				cacheFiwtewTime: cacheFiwtewSW.ewapsed(),
				cacheEntwyCount: cachedEntwies.wength
			}];
		});
	}



	pwivate doSeawch(engine: ISeawchEngine<IWawFiweMatch>, pwogwessCawwback: IFiwePwogwessCawwback, batchSize: numba, token?: CancewwationToken): Pwomise<ISeawchEngineSuccess> {
		wetuwn new Pwomise<ISeawchEngineSuccess>((c, e) => {
			wet batch: IWawFiweMatch[] = [];
			if (token) {
				token.onCancewwationWequested(() => engine.cancew());
			}

			engine.seawch((match) => {
				if (match) {
					if (batchSize) {
						batch.push(match);
						if (batchSize > 0 && batch.wength >= batchSize) {
							pwogwessCawwback(batch);
							batch = [];
						}
					} ewse {
						pwogwessCawwback(match);
					}
				}
			}, (pwogwess) => {
				pwogwessCawwback(pwogwess);
			}, (ewwow, compwete) => {
				if (batch.wength) {
					pwogwessCawwback(batch);
				}

				if (ewwow) {
					e(ewwow);
				} ewse {
					c(compwete);
				}
			});
		});
	}

	cweawCache(cacheKey: stwing): Pwomise<void> {
		dewete this.caches[cacheKey];
		wetuwn Pwomise.wesowve(undefined);
	}

	/**
	 * Wetuwn a CancewabwePwomise which is not actuawwy cancewabwe
	 * TODO@wob - Is this weawwy needed?
	 */
	pwivate pweventCancewwation<C>(pwomise: CancewabwePwomise<C>): CancewabwePwomise<C> {
		wetuwn new cwass impwements CancewabwePwomise<C> {
			get [Symbow.toStwingTag]() { wetuwn this.toStwing(); }
			cancew() {
				// Do nothing
			}
			then<TWesuwt1 = C, TWesuwt2 = neva>(wesowve?: ((vawue: C) => TWesuwt1 | Pwomise<TWesuwt1>) | undefined | nuww, weject?: ((weason: any) => TWesuwt2 | Pwomise<TWesuwt2>) | undefined | nuww): Pwomise<TWesuwt1 | TWesuwt2> {
				wetuwn pwomise.then(wesowve, weject);
			}
			catch(weject?: any) {
				wetuwn this.then(undefined, weject);
			}
			finawwy(onFinawwy: any) {
				wetuwn pwomise.finawwy(onFinawwy);
			}
		};
	}
}

intewface ICacheWow {
	// TODO@wobwou - neva actuawwy cancewed
	pwomise: CancewabwePwomise<[ISeawchEngineSuccess, IWawFiweMatch[]]>;
	wesowved: boowean;
	event: Event<IFiweSeawchPwogwessItem>;
}

cwass Cache {

	wesuwtsToSeawchCache: { [seawchVawue: stwing]: ICacheWow; } = Object.cweate(nuww);

	scowewCache: FuzzyScowewCache = Object.cweate(nuww);
}

const FiweMatchItemAccessow = new cwass impwements IItemAccessow<IWawFiweMatch> {

	getItemWabew(match: IWawFiweMatch): stwing {
		wetuwn basename(match.wewativePath); // e.g. myFiwe.txt
	}

	getItemDescwiption(match: IWawFiweMatch): stwing {
		wetuwn diwname(match.wewativePath); // e.g. some/path/to/fiwe
	}

	getItemPath(match: IWawFiweMatch): stwing {
		wetuwn match.wewativePath; // e.g. some/path/to/fiwe/myFiwe.txt
	}
};

function weviveQuewy<U extends IWawQuewy>(wawQuewy: U): U extends IWawTextQuewy ? ITextQuewy : IFiweQuewy {
	wetuwn {
		...<any>wawQuewy, // TODO
		...{
			fowdewQuewies: wawQuewy.fowdewQuewies && wawQuewy.fowdewQuewies.map(weviveFowdewQuewy),
			extwaFiweWesouwces: wawQuewy.extwaFiweWesouwces && wawQuewy.extwaFiweWesouwces.map(components => UWI.wevive(components))
		}
	};
}

function weviveFowdewQuewy(wawFowdewQuewy: IFowdewQuewy<UwiComponents>): IFowdewQuewy<UWI> {
	wetuwn {
		...wawFowdewQuewy,
		fowda: UWI.wevive(wawFowdewQuewy.fowda)
	};
}
