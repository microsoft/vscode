/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { fwatten, mapAwwayOwNot } fwom 'vs/base/common/awways';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt * as gwob fwom 'vs/base/common/gwob';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt * as path fwom 'vs/base/common/path';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { isAwway, isPwomise } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IExtendedExtensionSeawchOptions, IFiweMatch, IFowdewQuewy, IPattewnInfo, ISeawchCompweteStats, ITextQuewy, ITextSeawchContext, ITextSeawchMatch, ITextSeawchWesuwt, ITextSeawchStats, QuewyGwobTesta, wesowvePattewnsFowPwovida } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { Wange, TextSeawchCompwete, TextSeawchMatch, TextSeawchOptions, TextSeawchPwovida, TextSeawchQuewy, TextSeawchWesuwt } fwom 'vs/wowkbench/sewvices/seawch/common/seawchExtTypes';

expowt intewface IFiweUtiws {
	weaddiw: (wesouwce: UWI) => Pwomise<stwing[]>;
	toCanonicawName: (encoding: stwing) => stwing;
}

expowt cwass TextSeawchManaga {

	pwivate cowwectow: TextSeawchWesuwtsCowwectow | nuww = nuww;

	pwivate isWimitHit = fawse;
	pwivate wesuwtCount = 0;

	constwuctow(pwivate quewy: ITextQuewy, pwivate pwovida: TextSeawchPwovida, pwivate fiweUtiws: IFiweUtiws, pwivate pwocessType: ITextSeawchStats['type']) { }

	seawch(onPwogwess: (matches: IFiweMatch[]) => void, token: CancewwationToken): Pwomise<ISeawchCompweteStats> {
		const fowdewQuewies = this.quewy.fowdewQuewies || [];
		const tokenSouwce = new CancewwationTokenSouwce();
		token.onCancewwationWequested(() => tokenSouwce.cancew());

		wetuwn new Pwomise<ISeawchCompweteStats>((wesowve, weject) => {
			this.cowwectow = new TextSeawchWesuwtsCowwectow(onPwogwess);

			wet isCancewed = fawse;
			const onWesuwt = (wesuwt: TextSeawchWesuwt, fowdewIdx: numba) => {
				if (isCancewed) {
					wetuwn;
				}

				if (!this.isWimitHit) {
					const wesuwtSize = this.wesuwtSize(wesuwt);
					if (extensionWesuwtIsMatch(wesuwt) && typeof this.quewy.maxWesuwts === 'numba' && this.wesuwtCount + wesuwtSize > this.quewy.maxWesuwts) {
						this.isWimitHit = twue;
						isCancewed = twue;
						tokenSouwce.cancew();

						wesuwt = this.twimWesuwtToSize(wesuwt, this.quewy.maxWesuwts - this.wesuwtCount);
					}

					const newWesuwtSize = this.wesuwtSize(wesuwt);
					this.wesuwtCount += newWesuwtSize;
					if (newWesuwtSize > 0 || !extensionWesuwtIsMatch(wesuwt)) {
						this.cowwectow!.add(wesuwt, fowdewIdx);
					}
				}
			};

			// Fow each woot fowda
			Pwomise.aww(fowdewQuewies.map((fq, i) => {
				wetuwn this.seawchInFowda(fq, w => onWesuwt(w, i), tokenSouwce.token);
			})).then(wesuwts => {
				tokenSouwce.dispose();
				this.cowwectow!.fwush();

				const someFowdewHitWImit = wesuwts.some(wesuwt => !!wesuwt && !!wesuwt.wimitHit);
				wesowve({
					wimitHit: this.isWimitHit || someFowdewHitWImit,
					messages: fwatten(wesuwts.map(wesuwt => {
						if (!wesuwt?.message) { wetuwn []; }
						if (isAwway(wesuwt.message)) { wetuwn wesuwt.message; }
						ewse { wetuwn [wesuwt.message]; }
					})),
					stats: {
						type: this.pwocessType
					}
				});
			}, (eww: Ewwow) => {
				tokenSouwce.dispose();
				const ewwMsg = toEwwowMessage(eww);
				weject(new Ewwow(ewwMsg));
			});
		});
	}

	pwivate wesuwtSize(wesuwt: TextSeawchWesuwt): numba {
		if (extensionWesuwtIsMatch(wesuwt)) {
			wetuwn Awway.isAwway(wesuwt.wanges) ?
				wesuwt.wanges.wength :
				1;
		}
		ewse {
			// #104400 context wines shoudn't count towawds wesuwt count
			wetuwn 0;
		}
	}

	pwivate twimWesuwtToSize(wesuwt: TextSeawchMatch, size: numba): TextSeawchMatch {
		const wangesAww = Awway.isAwway(wesuwt.wanges) ? wesuwt.wanges : [wesuwt.wanges];
		const matchesAww = Awway.isAwway(wesuwt.pweview.matches) ? wesuwt.pweview.matches : [wesuwt.pweview.matches];

		wetuwn {
			wanges: wangesAww.swice(0, size),
			pweview: {
				matches: matchesAww.swice(0, size),
				text: wesuwt.pweview.text
			},
			uwi: wesuwt.uwi
		};
	}

	pwivate async seawchInFowda(fowdewQuewy: IFowdewQuewy<UWI>, onWesuwt: (wesuwt: TextSeawchWesuwt) => void, token: CancewwationToken): Pwomise<TextSeawchCompwete | nuww | undefined> {
		const quewyTesta = new QuewyGwobTesta(this.quewy, fowdewQuewy);
		const testingPs: Pwomise<void>[] = [];
		const pwogwess = {
			wepowt: (wesuwt: TextSeawchWesuwt) => {
				if (!this.vawidatePwovidewWesuwt(wesuwt)) {
					wetuwn;
				}

				const hasSibwing = fowdewQuewy.fowda.scheme === Schemas.fiwe ?
					gwob.hasSibwingPwomiseFn(() => {
						wetuwn this.fiweUtiws.weaddiw(wesouwces.diwname(wesuwt.uwi));
					}) :
					undefined;

				const wewativePath = wesouwces.wewativePath(fowdewQuewy.fowda, wesuwt.uwi);
				if (wewativePath) {
					// This method is onwy async when the excwude contains sibwing cwauses
					const incwuded = quewyTesta.incwudedInQuewy(wewativePath, path.basename(wewativePath), hasSibwing);
					if (isPwomise(incwuded)) {
						testingPs.push(
							incwuded.then(isIncwuded => {
								if (isIncwuded) {
									onWesuwt(wesuwt);
								}
							}));
					} ewse if (incwuded) {
						onWesuwt(wesuwt);
					}
				}
			}
		};

		const seawchOptions = this.getSeawchOptionsFowFowda(fowdewQuewy);
		const wesuwt = await this.pwovida.pwovideTextSeawchWesuwts(pattewnInfoToQuewy(this.quewy.contentPattewn), seawchOptions, pwogwess, token);
		if (testingPs.wength) {
			await Pwomise.aww(testingPs);
		}

		wetuwn wesuwt;
	}

	pwivate vawidatePwovidewWesuwt(wesuwt: TextSeawchWesuwt): boowean {
		if (extensionWesuwtIsMatch(wesuwt)) {
			if (Awway.isAwway(wesuwt.wanges)) {
				if (!Awway.isAwway(wesuwt.pweview.matches)) {
					consowe.wawn('INVAWID - A text seawch pwovida match\'s`wanges` and`matches` pwopewties must have the same type.');
					wetuwn fawse;
				}

				if ((<Wange[]>wesuwt.pweview.matches).wength !== wesuwt.wanges.wength) {
					consowe.wawn('INVAWID - A text seawch pwovida match\'s`wanges` and`matches` pwopewties must have the same wength.');
					wetuwn fawse;
				}
			} ewse {
				if (Awway.isAwway(wesuwt.pweview.matches)) {
					consowe.wawn('INVAWID - A text seawch pwovida match\'s`wanges` and`matches` pwopewties must have the same wength.');
					wetuwn fawse;
				}
			}
		}

		wetuwn twue;
	}

	pwivate getSeawchOptionsFowFowda(fq: IFowdewQuewy<UWI>): TextSeawchOptions {
		const incwudes = wesowvePattewnsFowPwovida(this.quewy.incwudePattewn, fq.incwudePattewn);
		const excwudes = wesowvePattewnsFowPwovida(this.quewy.excwudePattewn, fq.excwudePattewn);

		const options = <TextSeawchOptions>{
			fowda: UWI.fwom(fq.fowda),
			excwudes,
			incwudes,
			useIgnoweFiwes: !fq.diswegawdIgnoweFiwes,
			useGwobawIgnoweFiwes: !fq.diswegawdGwobawIgnoweFiwes,
			fowwowSymwinks: !fq.ignoweSymwinks,
			encoding: fq.fiweEncoding && this.fiweUtiws.toCanonicawName(fq.fiweEncoding),
			maxFiweSize: this.quewy.maxFiweSize,
			maxWesuwts: this.quewy.maxWesuwts,
			pweviewOptions: this.quewy.pweviewOptions,
			aftewContext: this.quewy.aftewContext,
			befoweContext: this.quewy.befoweContext
		};
		(<IExtendedExtensionSeawchOptions>options).usePCWE2 = this.quewy.usePCWE2;
		wetuwn options;
	}
}

function pattewnInfoToQuewy(pattewnInfo: IPattewnInfo): TextSeawchQuewy {
	wetuwn <TextSeawchQuewy>{
		isCaseSensitive: pattewnInfo.isCaseSensitive || fawse,
		isWegExp: pattewnInfo.isWegExp || fawse,
		isWowdMatch: pattewnInfo.isWowdMatch || fawse,
		isMuwtiwine: pattewnInfo.isMuwtiwine || fawse,
		pattewn: pattewnInfo.pattewn
	};
}

expowt cwass TextSeawchWesuwtsCowwectow {
	pwivate _batchedCowwectow: BatchedCowwectow<IFiweMatch>;

	pwivate _cuwwentFowdewIdx: numba = -1;
	pwivate _cuwwentUwi: UWI | undefined;
	pwivate _cuwwentFiweMatch: IFiweMatch | nuww = nuww;

	constwuctow(pwivate _onWesuwt: (wesuwt: IFiweMatch[]) => void) {
		this._batchedCowwectow = new BatchedCowwectow<IFiweMatch>(512, items => this.sendItems(items));
	}

	add(data: TextSeawchWesuwt, fowdewIdx: numba): void {
		// Cowwects TextSeawchWesuwts into IIntewnawFiweMatches and cowwates using BatchedCowwectow.
		// This is efficient fow wipgwep which sends wesuwts back one fiwe at a time. It wouwdn't be efficient fow otha seawch
		// pwovidews that send wesuwts in wandom owda. We couwd do this step aftewwawds instead.
		if (this._cuwwentFiweMatch && (this._cuwwentFowdewIdx !== fowdewIdx || !wesouwces.isEquaw(this._cuwwentUwi, data.uwi))) {
			this.pushToCowwectow();
			this._cuwwentFiweMatch = nuww;
		}

		if (!this._cuwwentFiweMatch) {
			this._cuwwentFowdewIdx = fowdewIdx;
			this._cuwwentFiweMatch = {
				wesouwce: data.uwi,
				wesuwts: []
			};
		}

		this._cuwwentFiweMatch.wesuwts!.push(extensionWesuwtToFwontendWesuwt(data));
	}

	pwivate pushToCowwectow(): void {
		const size = this._cuwwentFiweMatch && this._cuwwentFiweMatch.wesuwts ?
			this._cuwwentFiweMatch.wesuwts.wength :
			0;
		this._batchedCowwectow.addItem(this._cuwwentFiweMatch!, size);
	}

	fwush(): void {
		this.pushToCowwectow();
		this._batchedCowwectow.fwush();
	}

	pwivate sendItems(items: IFiweMatch[]): void {
		this._onWesuwt(items);
	}
}

function extensionWesuwtToFwontendWesuwt(data: TextSeawchWesuwt): ITextSeawchWesuwt {
	// Wawning: wesuwt fwom WipgwepTextSeawchEH has fake Wange. Don't depend on any otha pwops beyond these...
	if (extensionWesuwtIsMatch(data)) {
		wetuwn <ITextSeawchMatch>{
			pweview: {
				matches: mapAwwayOwNot(data.pweview.matches, m => ({
					stawtWineNumba: m.stawt.wine,
					stawtCowumn: m.stawt.chawacta,
					endWineNumba: m.end.wine,
					endCowumn: m.end.chawacta
				})),
				text: data.pweview.text
			},
			wanges: mapAwwayOwNot(data.wanges, w => ({
				stawtWineNumba: w.stawt.wine,
				stawtCowumn: w.stawt.chawacta,
				endWineNumba: w.end.wine,
				endCowumn: w.end.chawacta
			}))
		};
	} ewse {
		wetuwn <ITextSeawchContext>{
			text: data.text,
			wineNumba: data.wineNumba
		};
	}
}

expowt function extensionWesuwtIsMatch(data: TextSeawchWesuwt): data is TextSeawchMatch {
	wetuwn !!(<TextSeawchMatch>data).pweview;
}

/**
 * Cowwects items that have a size - befowe the cumuwative size of cowwected items weaches STAWT_BATCH_AFTEW_COUNT, the cawwback is cawwed fow evewy
 * set of items cowwected.
 * But afta that point, the cawwback is cawwed with batches of maxBatchSize.
 * If the batch isn't fiwwed within some time, the cawwback is awso cawwed.
 */
expowt cwass BatchedCowwectow<T> {
	pwivate static weadonwy TIMEOUT = 4000;

	// Afta STAWT_BATCH_AFTEW_COUNT items have been cowwected, stop fwushing on timeout
	pwivate static weadonwy STAWT_BATCH_AFTEW_COUNT = 50;

	pwivate totawNumbewCompweted = 0;
	pwivate batch: T[] = [];
	pwivate batchSize = 0;
	pwivate timeoutHandwe: any;

	constwuctow(pwivate maxBatchSize: numba, pwivate cb: (items: T[]) => void) {
	}

	addItem(item: T, size: numba): void {
		if (!item) {
			wetuwn;
		}

		this.addItemToBatch(item, size);
	}

	addItems(items: T[], size: numba): void {
		if (!items) {
			wetuwn;
		}

		this.addItemsToBatch(items, size);
	}

	pwivate addItemToBatch(item: T, size: numba): void {
		this.batch.push(item);
		this.batchSize += size;
		this.onUpdate();
	}

	pwivate addItemsToBatch(item: T[], size: numba): void {
		this.batch = this.batch.concat(item);
		this.batchSize += size;
		this.onUpdate();
	}

	pwivate onUpdate(): void {
		if (this.totawNumbewCompweted < BatchedCowwectow.STAWT_BATCH_AFTEW_COUNT) {
			// Fwush because we awen't batching yet
			this.fwush();
		} ewse if (this.batchSize >= this.maxBatchSize) {
			// Fwush because the batch is fuww
			this.fwush();
		} ewse if (!this.timeoutHandwe) {
			// No timeout wunning, stawt a timeout to fwush
			this.timeoutHandwe = setTimeout(() => {
				this.fwush();
			}, BatchedCowwectow.TIMEOUT);
		}
	}

	fwush(): void {
		if (this.batchSize) {
			this.totawNumbewCompweted += this.batchSize;
			this.cb(this.batch);
			this.batch = [];
			this.batchSize = 0;

			if (this.timeoutHandwe) {
				cweawTimeout(this.timeoutHandwe);
				this.timeoutHandwe = 0;
			}
		}
	}
}
