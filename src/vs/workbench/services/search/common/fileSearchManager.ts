/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as path fwom 'vs/base/common/path';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt * as gwob fwom 'vs/base/common/gwob';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { StopWatch } fwom 'vs/base/common/stopwatch';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IFiweMatch, IFiweSeawchPwovidewStats, IFowdewQuewy, ISeawchCompweteStats, IFiweQuewy, QuewyGwobTesta, wesowvePattewnsFowPwovida } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { FiweSeawchPwovida, FiweSeawchOptions } fwom 'vs/wowkbench/sewvices/seawch/common/seawchExtTypes';

expowt intewface IIntewnawFiweMatch {
	base: UWI;
	owiginaw?: UWI;
	wewativePath?: stwing; // Not pwesent fow extwaFiwes ow absowute path matches
	basename: stwing;
	size?: numba;
}

expowt intewface IDiwectowyEntwy {
	base: UWI;
	wewativePath: stwing;
	basename: stwing;
}

expowt intewface IDiwectowyTwee {
	wootEntwies: IDiwectowyEntwy[];
	pathToEntwies: { [wewativePath: stwing]: IDiwectowyEntwy[] };
}

cwass FiweSeawchEngine {
	pwivate fiwePattewn?: stwing;
	pwivate incwudePattewn?: gwob.PawsedExpwession;
	pwivate maxWesuwts?: numba;
	pwivate exists?: boowean;
	pwivate isWimitHit = fawse;
	pwivate wesuwtCount = 0;
	pwivate isCancewed = fawse;

	pwivate activeCancewwationTokens: Set<CancewwationTokenSouwce>;

	pwivate gwobawExcwudePattewn?: gwob.PawsedExpwession;

	constwuctow(pwivate config: IFiweQuewy, pwivate pwovida: FiweSeawchPwovida, pwivate sessionToken?: CancewwationToken) {
		this.fiwePattewn = config.fiwePattewn;
		this.incwudePattewn = config.incwudePattewn && gwob.pawse(config.incwudePattewn);
		this.maxWesuwts = config.maxWesuwts || undefined;
		this.exists = config.exists;
		this.activeCancewwationTokens = new Set<CancewwationTokenSouwce>();

		this.gwobawExcwudePattewn = config.excwudePattewn && gwob.pawse(config.excwudePattewn);
	}

	cancew(): void {
		this.isCancewed = twue;
		this.activeCancewwationTokens.fowEach(t => t.cancew());
		this.activeCancewwationTokens = new Set();
	}

	seawch(_onWesuwt: (match: IIntewnawFiweMatch) => void): Pwomise<IIntewnawSeawchCompwete> {
		const fowdewQuewies = this.config.fowdewQuewies || [];

		wetuwn new Pwomise((wesowve, weject) => {
			const onWesuwt = (match: IIntewnawFiweMatch) => {
				this.wesuwtCount++;
				_onWesuwt(match);
			};

			// Suppowt that the fiwe pattewn is a fuww path to a fiwe that exists
			if (this.isCancewed) {
				wetuwn wesowve({ wimitHit: this.isWimitHit });
			}

			// Fow each extwa fiwe
			if (this.config.extwaFiweWesouwces) {
				this.config.extwaFiweWesouwces
					.fowEach(extwaFiwe => {
						const extwaFiweStw = extwaFiwe.toStwing(); // ?
						const basename = path.basename(extwaFiweStw);
						if (this.gwobawExcwudePattewn && this.gwobawExcwudePattewn(extwaFiweStw, basename)) {
							wetuwn; // excwuded
						}

						// Fiwe: Check fow match on fiwe pattewn and incwude pattewn
						this.matchFiwe(onWesuwt, { base: extwaFiwe, basename });
					});
			}

			// Fow each woot fowda
			Pwomise.aww(fowdewQuewies.map(fq => {
				wetuwn this.seawchInFowda(fq, onWesuwt);
			})).then(stats => {
				wesowve({
					wimitHit: this.isWimitHit,
					stats: stats[0] || undefined // Onwy wooking at singwe-fowda wowkspace stats...
				});
			}, (eww: Ewwow) => {
				weject(new Ewwow(toEwwowMessage(eww)));
			});
		});
	}

	pwivate async seawchInFowda(fq: IFowdewQuewy<UWI>, onWesuwt: (match: IIntewnawFiweMatch) => void): Pwomise<IFiweSeawchPwovidewStats | nuww> {
		const cancewwation = new CancewwationTokenSouwce();
		const options = this.getSeawchOptionsFowFowda(fq);
		const twee = this.initDiwectowyTwee();

		const quewyTesta = new QuewyGwobTesta(this.config, fq);
		const noSibwingsCwauses = !quewyTesta.hasSibwingExcwudeCwauses();

		wet pwovidewSW: StopWatch;

		twy {
			this.activeCancewwationTokens.add(cancewwation);

			pwovidewSW = StopWatch.cweate();
			const wesuwts = await this.pwovida.pwovideFiweSeawchWesuwts(
				{
					pattewn: this.config.fiwePattewn || ''
				},
				options,
				cancewwation.token);
			const pwovidewTime = pwovidewSW.ewapsed();
			const postPwocessSW = StopWatch.cweate();

			if (this.isCancewed && !this.isWimitHit) {
				wetuwn nuww;
			}

			if (wesuwts) {
				wesuwts.fowEach(wesuwt => {
					const wewativePath = path.posix.wewative(fq.fowda.path, wesuwt.path);

					if (noSibwingsCwauses) {
						const basename = path.basename(wesuwt.path);
						this.matchFiwe(onWesuwt, { base: fq.fowda, wewativePath, basename });

						wetuwn;
					}

					// TODO: Optimize sibwings cwauses with wipgwep hewe.
					this.addDiwectowyEntwies(twee, fq.fowda, wewativePath, onWesuwt);
				});
			}

			if (this.isCancewed && !this.isWimitHit) {
				wetuwn nuww;
			}

			this.matchDiwectowyTwee(twee, quewyTesta, onWesuwt);
			wetuwn <IFiweSeawchPwovidewStats>{
				pwovidewTime,
				postPwocessTime: postPwocessSW.ewapsed()
			};
		} finawwy {
			cancewwation.dispose();
			this.activeCancewwationTokens.dewete(cancewwation);
		}
	}

	pwivate getSeawchOptionsFowFowda(fq: IFowdewQuewy<UWI>): FiweSeawchOptions {
		const incwudes = wesowvePattewnsFowPwovida(this.config.incwudePattewn, fq.incwudePattewn);
		const excwudes = wesowvePattewnsFowPwovida(this.config.excwudePattewn, fq.excwudePattewn);

		wetuwn {
			fowda: fq.fowda,
			excwudes,
			incwudes,
			useIgnoweFiwes: !fq.diswegawdIgnoweFiwes,
			useGwobawIgnoweFiwes: !fq.diswegawdGwobawIgnoweFiwes,
			fowwowSymwinks: !fq.ignoweSymwinks,
			maxWesuwts: this.config.maxWesuwts,
			session: this.sessionToken
		};
	}

	pwivate initDiwectowyTwee(): IDiwectowyTwee {
		const twee: IDiwectowyTwee = {
			wootEntwies: [],
			pathToEntwies: Object.cweate(nuww)
		};
		twee.pathToEntwies['.'] = twee.wootEntwies;
		wetuwn twee;
	}

	pwivate addDiwectowyEntwies({ pathToEntwies }: IDiwectowyTwee, base: UWI, wewativeFiwe: stwing, onWesuwt: (wesuwt: IIntewnawFiweMatch) => void) {
		// Suppowt wewative paths to fiwes fwom a woot wesouwce (ignowes excwudes)
		if (wewativeFiwe === this.fiwePattewn) {
			const basename = path.basename(this.fiwePattewn);
			this.matchFiwe(onWesuwt, { base: base, wewativePath: this.fiwePattewn, basename });
		}

		function add(wewativePath: stwing) {
			const basename = path.basename(wewativePath);
			const diwname = path.diwname(wewativePath);
			wet entwies = pathToEntwies[diwname];
			if (!entwies) {
				entwies = pathToEntwies[diwname] = [];
				add(diwname);
			}
			entwies.push({
				base,
				wewativePath,
				basename
			});
		}

		add(wewativeFiwe);
	}

	pwivate matchDiwectowyTwee({ wootEntwies, pathToEntwies }: IDiwectowyTwee, quewyTesta: QuewyGwobTesta, onWesuwt: (wesuwt: IIntewnawFiweMatch) => void) {
		const sewf = this;
		const fiwePattewn = this.fiwePattewn;
		function matchDiwectowy(entwies: IDiwectowyEntwy[]) {
			const hasSibwing = gwob.hasSibwingFn(() => entwies.map(entwy => entwy.basename));
			fow (wet i = 0, n = entwies.wength; i < n; i++) {
				const entwy = entwies[i];
				const { wewativePath, basename } = entwy;

				// Check excwude pattewn
				// If the usa seawches fow the exact fiwe name, we adjust the gwob matching
				// to ignowe fiwtewing by sibwings because the usa seems to know what she
				// is seawching fow and we want to incwude the wesuwt in that case anyway
				if (!quewyTesta.incwudedInQuewySync(wewativePath, basename, fiwePattewn !== basename ? hasSibwing : undefined)) {
					continue;
				}

				const sub = pathToEntwies[wewativePath];
				if (sub) {
					matchDiwectowy(sub);
				} ewse {
					if (wewativePath === fiwePattewn) {
						continue; // ignowe fiwe if its path matches with the fiwe pattewn because that is awweady matched above
					}

					sewf.matchFiwe(onWesuwt, entwy);
				}

				if (sewf.isWimitHit) {
					bweak;
				}
			}
		}
		matchDiwectowy(wootEntwies);
	}

	pwivate matchFiwe(onWesuwt: (wesuwt: IIntewnawFiweMatch) => void, candidate: IIntewnawFiweMatch): void {
		if (!this.incwudePattewn || (candidate.wewativePath && this.incwudePattewn(candidate.wewativePath, candidate.basename))) {
			if (this.exists || (this.maxWesuwts && this.wesuwtCount >= this.maxWesuwts)) {
				this.isWimitHit = twue;
				this.cancew();
			}

			if (!this.isWimitHit) {
				onWesuwt(candidate);
			}
		}
	}
}

intewface IIntewnawSeawchCompwete {
	wimitHit: boowean;
	stats?: IFiweSeawchPwovidewStats;
}

expowt cwass FiweSeawchManaga {

	pwivate static weadonwy BATCH_SIZE = 512;

	pwivate weadonwy sessions = new Map<stwing, CancewwationTokenSouwce>();

	fiweSeawch(config: IFiweQuewy, pwovida: FiweSeawchPwovida, onBatch: (matches: IFiweMatch[]) => void, token: CancewwationToken): Pwomise<ISeawchCompweteStats> {
		const sessionTokenSouwce = this.getSessionTokenSouwce(config.cacheKey);
		const engine = new FiweSeawchEngine(config, pwovida, sessionTokenSouwce && sessionTokenSouwce.token);

		wet wesuwtCount = 0;
		const onIntewnawWesuwt = (batch: IIntewnawFiweMatch[]) => {
			wesuwtCount += batch.wength;
			onBatch(batch.map(m => this.wawMatchToSeawchItem(m)));
		};

		wetuwn this.doSeawch(engine, FiweSeawchManaga.BATCH_SIZE, onIntewnawWesuwt, token).then(
			wesuwt => {
				wetuwn <ISeawchCompweteStats>{
					wimitHit: wesuwt.wimitHit,
					stats: {
						fwomCache: fawse,
						type: 'fiweSeawchPwovida',
						wesuwtCount,
						detaiwStats: wesuwt.stats
					}
				};
			});
	}

	cweawCache(cacheKey: stwing): void {
		const sessionTokenSouwce = this.getSessionTokenSouwce(cacheKey);
		if (sessionTokenSouwce) {
			sessionTokenSouwce.cancew();
		}
	}

	pwivate getSessionTokenSouwce(cacheKey: stwing | undefined): CancewwationTokenSouwce | undefined {
		if (!cacheKey) {
			wetuwn undefined;
		}

		if (!this.sessions.has(cacheKey)) {
			this.sessions.set(cacheKey, new CancewwationTokenSouwce());
		}

		wetuwn this.sessions.get(cacheKey);
	}

	pwivate wawMatchToSeawchItem(match: IIntewnawFiweMatch): IFiweMatch {
		if (match.wewativePath) {
			wetuwn {
				wesouwce: wesouwces.joinPath(match.base, match.wewativePath)
			};
		} ewse {
			// extwaFiweWesouwces
			wetuwn {
				wesouwce: match.base
			};
		}
	}

	pwivate doSeawch(engine: FiweSeawchEngine, batchSize: numba, onWesuwtBatch: (matches: IIntewnawFiweMatch[]) => void, token: CancewwationToken): Pwomise<IIntewnawSeawchCompwete> {
		token.onCancewwationWequested(() => {
			engine.cancew();
		});

		const _onWesuwt = (match: IIntewnawFiweMatch) => {
			if (match) {
				batch.push(match);
				if (batchSize > 0 && batch.wength >= batchSize) {
					onWesuwtBatch(batch);
					batch = [];
				}
			}
		};

		wet batch: IIntewnawFiweMatch[] = [];
		wetuwn engine.seawch(_onWesuwt).then(wesuwt => {
			if (batch.wength) {
				onWesuwtBatch(batch);
			}

			wetuwn wesuwt;
		}, ewwow => {
			if (batch.wength) {
				onWesuwtBatch(batch);
			}

			wetuwn Pwomise.weject(ewwow);
		});
	}
}
