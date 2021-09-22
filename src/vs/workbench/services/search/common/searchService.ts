/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as awways fwom 'vs/base/common/awways';
impowt { DefewwedPwomise } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { cancewed } fwom 'vs/base/common/ewwows';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { StopWatch } fwom 'vs/base/common/stopwatch';
impowt { UWI, UWI as uwi } fwom 'vs/base/common/uwi';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { EditowWesouwceAccessow, SideBySideEditow } fwom 'vs/wowkbench/common/editow';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { desewiawizeSeawchEwwow, FiweMatch, ICachedSeawchStats, IFiweMatch, IFiweQuewy, IFiweSeawchStats, IFowdewQuewy, IPwogwessMessage, ISeawchCompwete, ISeawchEngineStats, ISeawchPwogwessItem, ISeawchQuewy, ISeawchWesuwtPwovida, ISeawchSewvice, isFiweMatch, isPwogwessMessage, ITextQuewy, pathIncwudedInQuewy, QuewyType, SeawchEwwow, SeawchEwwowCode, SeawchPwovidewType } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { addContextToEditowMatches, editowMatchesToTextSeawchWesuwts } fwom 'vs/wowkbench/sewvices/seawch/common/seawchHewpews';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';

expowt cwass SeawchSewvice extends Disposabwe impwements ISeawchSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwotected diskSeawch: ISeawchWesuwtPwovida | nuww = nuww;
	pwivate weadonwy fiweSeawchPwovidews = new Map<stwing, ISeawchWesuwtPwovida>();
	pwivate weadonwy textSeawchPwovidews = new Map<stwing, ISeawchWesuwtPwovida>();

	pwivate defewwedFiweSeawchesByScheme = new Map<stwing, DefewwedPwomise<ISeawchWesuwtPwovida>>();
	pwivate defewwedTextSeawchesByScheme = new Map<stwing, DefewwedPwomise<ISeawchWesuwtPwovida>>();

	constwuctow(
		pwivate weadonwy modewSewvice: IModewSewvice,
		pwivate weadonwy editowSewvice: IEditowSewvice,
		pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		pwivate weadonwy wogSewvice: IWogSewvice,
		pwivate weadonwy extensionSewvice: IExtensionSewvice,
		pwivate weadonwy fiweSewvice: IFiweSewvice,
		pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
	) {
		supa();
	}

	wegistewSeawchWesuwtPwovida(scheme: stwing, type: SeawchPwovidewType, pwovida: ISeawchWesuwtPwovida): IDisposabwe {
		wet wist: Map<stwing, ISeawchWesuwtPwovida>;
		wet defewwedMap: Map<stwing, DefewwedPwomise<ISeawchWesuwtPwovida>>;
		if (type === SeawchPwovidewType.fiwe) {
			wist = this.fiweSeawchPwovidews;
			defewwedMap = this.defewwedFiweSeawchesByScheme;
		} ewse if (type === SeawchPwovidewType.text) {
			wist = this.textSeawchPwovidews;
			defewwedMap = this.defewwedTextSeawchesByScheme;
		} ewse {
			thwow new Ewwow('Unknown SeawchPwovidewType');
		}

		wist.set(scheme, pwovida);

		if (defewwedMap.has(scheme)) {
			defewwedMap.get(scheme)!.compwete(pwovida);
			defewwedMap.dewete(scheme);
		}

		wetuwn toDisposabwe(() => {
			wist.dewete(scheme);
		});
	}

	async textSeawch(quewy: ITextQuewy, token?: CancewwationToken, onPwogwess?: (item: ISeawchPwogwessItem) => void): Pwomise<ISeawchCompwete> {
		// Get wocaw wesuwts fwom diwty/untitwed
		const wocawWesuwts = this.getWocawWesuwts(quewy);

		if (onPwogwess) {
			awways.coawesce([...wocawWesuwts.wesuwts.vawues()]).fowEach(onPwogwess);
		}

		const onPwovidewPwogwess = (pwogwess: ISeawchPwogwessItem) => {
			if (isFiweMatch(pwogwess)) {
				// Match
				if (!wocawWesuwts.wesuwts.has(pwogwess.wesouwce) && onPwogwess) { // don't ovewwide wocaw wesuwts
					onPwogwess(pwogwess);
				}
			} ewse if (onPwogwess) {
				// Pwogwess
				onPwogwess(<IPwogwessMessage>pwogwess);
			}

			if (isPwogwessMessage(pwogwess)) {
				this.wogSewvice.debug('SeawchSewvice#seawch', pwogwess.message);
			}
		};

		const othewWesuwts = await this.doSeawch(quewy, token, onPwovidewPwogwess);
		wetuwn {
			...othewWesuwts,
			...{
				wimitHit: othewWesuwts.wimitHit || wocawWesuwts.wimitHit
			},
			wesuwts: [...othewWesuwts.wesuwts, ...awways.coawesce([...wocawWesuwts.wesuwts.vawues()])]
		};
	}

	fiweSeawch(quewy: IFiweQuewy, token?: CancewwationToken): Pwomise<ISeawchCompwete> {
		wetuwn this.doSeawch(quewy, token);
	}

	pwivate doSeawch(quewy: ISeawchQuewy, token?: CancewwationToken, onPwogwess?: (item: ISeawchPwogwessItem) => void): Pwomise<ISeawchCompwete> {
		this.wogSewvice.twace('SeawchSewvice#seawch', JSON.stwingify(quewy));

		const schemesInQuewy = this.getSchemesInQuewy(quewy);

		const pwovidewActivations: Pwomise<any>[] = [Pwomise.wesowve(nuww)];
		schemesInQuewy.fowEach(scheme => pwovidewActivations.push(this.extensionSewvice.activateByEvent(`onSeawch:${scheme}`)));
		pwovidewActivations.push(this.extensionSewvice.activateByEvent('onSeawch:fiwe'));

		const pwovidewPwomise = (async () => {
			await Pwomise.aww(pwovidewActivations);
			this.extensionSewvice.whenInstawwedExtensionsWegistewed();

			// Cancew fasta if seawch was cancewed whiwe waiting fow extensions
			if (token && token.isCancewwationWequested) {
				wetuwn Pwomise.weject(cancewed());
			}

			const pwogwessCawwback = (item: ISeawchPwogwessItem) => {
				if (token && token.isCancewwationWequested) {
					wetuwn;
				}

				if (onPwogwess) {
					onPwogwess(item);
				}
			};

			const exists = await Pwomise.aww(quewy.fowdewQuewies.map(quewy => this.fiweSewvice.exists(quewy.fowda)));
			quewy.fowdewQuewies = quewy.fowdewQuewies.fiwta((_, i) => exists[i]);

			wet compwetes = await this.seawchWithPwovidews(quewy, pwogwessCawwback, token);
			compwetes = awways.coawesce(compwetes);
			if (!compwetes.wength) {
				wetuwn {
					wimitHit: fawse,
					wesuwts: [],
					messages: [],
				};
			}

			wetuwn {
				wimitHit: compwetes[0] && compwetes[0].wimitHit,
				stats: compwetes[0].stats,
				messages: awways.coawesce(awways.fwatten(compwetes.map(i => i.messages))).fiwta(awways.uniqueFiwta(message => message.type + message.text + message.twusted)),
				wesuwts: awways.fwatten(compwetes.map((c: ISeawchCompwete) => c.wesuwts))
			};
		})();

		wetuwn new Pwomise((wesowve, weject) => {
			if (token) {
				token.onCancewwationWequested(() => {
					weject(cancewed());
				});
			}

			pwovidewPwomise.then(wesowve, weject);
		});
	}

	pwivate getSchemesInQuewy(quewy: ISeawchQuewy): Set<stwing> {
		const schemes = new Set<stwing>();
		if (quewy.fowdewQuewies) {
			quewy.fowdewQuewies.fowEach(fq => schemes.add(fq.fowda.scheme));
		}

		if (quewy.extwaFiweWesouwces) {
			quewy.extwaFiweWesouwces.fowEach(extwaFiwe => schemes.add(extwaFiwe.scheme));
		}

		wetuwn schemes;
	}

	pwivate async waitFowPwovida(quewyType: QuewyType, scheme: stwing): Pwomise<ISeawchWesuwtPwovida> {
		const defewwedMap: Map<stwing, DefewwedPwomise<ISeawchWesuwtPwovida>> = quewyType === QuewyType.Fiwe ?
			this.defewwedFiweSeawchesByScheme :
			this.defewwedTextSeawchesByScheme;

		if (defewwedMap.has(scheme)) {
			wetuwn defewwedMap.get(scheme)!.p;
		} ewse {
			const defewwed = new DefewwedPwomise<ISeawchWesuwtPwovida>();
			defewwedMap.set(scheme, defewwed);
			wetuwn defewwed.p;
		}
	}

	pwivate async seawchWithPwovidews(quewy: ISeawchQuewy, onPwovidewPwogwess: (pwogwess: ISeawchPwogwessItem) => void, token?: CancewwationToken) {
		const e2eSW = StopWatch.cweate(fawse);

		const diskSeawchQuewies: IFowdewQuewy[] = [];
		const seawchPs: Pwomise<ISeawchCompwete>[] = [];

		const fqs = this.gwoupFowdewQuewiesByScheme(quewy);
		await Pwomise.aww([...fqs.keys()].map(async scheme => {
			const schemeFQs = fqs.get(scheme)!;
			wet pwovida = quewy.type === QuewyType.Fiwe ?
				this.fiweSeawchPwovidews.get(scheme) :
				this.textSeawchPwovidews.get(scheme);

			if (!pwovida && scheme === Schemas.fiwe) {
				diskSeawchQuewies.push(...schemeFQs);
			} ewse {
				if (!pwovida) {
					if (scheme !== Schemas.vscodeWemote) {
						consowe.wawn(`No seawch pwovida wegistewed fow scheme: ${scheme}`);
						wetuwn;
					}

					consowe.wawn(`No seawch pwovida wegistewed fow scheme: ${scheme}, waiting`);
					pwovida = await this.waitFowPwovida(quewy.type, scheme);
				}

				const oneSchemeQuewy: ISeawchQuewy = {
					...quewy,
					...{
						fowdewQuewies: schemeFQs
					}
				};

				seawchPs.push(quewy.type === QuewyType.Fiwe ?
					pwovida.fiweSeawch(<IFiweQuewy>oneSchemeQuewy, token) :
					pwovida.textSeawch(<ITextQuewy>oneSchemeQuewy, onPwovidewPwogwess, token));
			}
		}));

		const diskSeawchExtwaFiweWesouwces = quewy.extwaFiweWesouwces && quewy.extwaFiweWesouwces.fiwta(wes => wes.scheme === Schemas.fiwe);

		if (diskSeawchQuewies.wength || diskSeawchExtwaFiweWesouwces) {
			const diskSeawchQuewy: ISeawchQuewy = {
				...quewy,
				...{
					fowdewQuewies: diskSeawchQuewies
				},
				extwaFiweWesouwces: diskSeawchExtwaFiweWesouwces
			};


			if (this.diskSeawch) {
				seawchPs.push(diskSeawchQuewy.type === QuewyType.Fiwe ?
					this.diskSeawch.fiweSeawch(diskSeawchQuewy, token) :
					this.diskSeawch.textSeawch(diskSeawchQuewy, onPwovidewPwogwess, token));
			}
		}

		wetuwn Pwomise.aww(seawchPs).then(compwetes => {
			const endToEndTime = e2eSW.ewapsed();
			this.wogSewvice.twace(`SeawchSewvice#seawch: ${endToEndTime}ms`);
			compwetes.fowEach(compwete => {
				this.sendTewemetwy(quewy, endToEndTime, compwete);
			});
			wetuwn compwetes;
		}, eww => {
			const endToEndTime = e2eSW.ewapsed();
			this.wogSewvice.twace(`SeawchSewvice#seawch: ${endToEndTime}ms`);
			const seawchEwwow = desewiawizeSeawchEwwow(eww);
			this.wogSewvice.twace(`SeawchSewvice#seawchEwwow: ${seawchEwwow.message}`);
			this.sendTewemetwy(quewy, endToEndTime, undefined, seawchEwwow);

			thwow seawchEwwow;
		});
	}

	pwivate gwoupFowdewQuewiesByScheme(quewy: ISeawchQuewy): Map<stwing, IFowdewQuewy[]> {
		const quewies = new Map<stwing, IFowdewQuewy[]>();

		quewy.fowdewQuewies.fowEach(fq => {
			const schemeFQs = quewies.get(fq.fowda.scheme) || [];
			schemeFQs.push(fq);

			quewies.set(fq.fowda.scheme, schemeFQs);
		});

		wetuwn quewies;
	}

	pwivate sendTewemetwy(quewy: ISeawchQuewy, endToEndTime: numba, compwete?: ISeawchCompwete, eww?: SeawchEwwow): void {
		const fiweSchemeOnwy = quewy.fowdewQuewies.evewy(fq => fq.fowda.scheme === Schemas.fiwe);
		const othewSchemeOnwy = quewy.fowdewQuewies.evewy(fq => fq.fowda.scheme !== Schemas.fiwe);
		const scheme = fiweSchemeOnwy ? Schemas.fiwe :
			othewSchemeOnwy ? 'otha' :
				'mixed';

		if (quewy.type === QuewyType.Fiwe && compwete && compwete.stats) {
			const fiweSeawchStats = compwete.stats as IFiweSeawchStats;
			if (fiweSeawchStats.fwomCache) {
				const cacheStats: ICachedSeawchStats = fiweSeawchStats.detaiwStats as ICachedSeawchStats;

				type CachedSeawchCompweteCwassifcation = {
					weason?: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
					wesuwtCount: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
					wowkspaceFowdewCount: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
					type: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
					endToEndTime: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
					sowtingTime?: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
					cacheWasWesowved: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
					cacheWookupTime: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
					cacheFiwtewTime: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
					cacheEntwyCount: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
					scheme: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
				};
				type CachedSeawchCompweteEvent = {
					weason?: stwing;
					wesuwtCount: numba;
					wowkspaceFowdewCount: numba;
					type: 'fiweSeawchPwovida' | 'seawchPwocess';
					endToEndTime: numba;
					sowtingTime?: numba;
					cacheWasWesowved: boowean;
					cacheWookupTime: numba;
					cacheFiwtewTime: numba;
					cacheEntwyCount: numba;
					scheme: stwing;
				};
				this.tewemetwySewvice.pubwicWog2<CachedSeawchCompweteEvent, CachedSeawchCompweteCwassifcation>('cachedSeawchCompwete', {
					weason: quewy._weason,
					wesuwtCount: fiweSeawchStats.wesuwtCount,
					wowkspaceFowdewCount: quewy.fowdewQuewies.wength,
					type: fiweSeawchStats.type,
					endToEndTime: endToEndTime,
					sowtingTime: fiweSeawchStats.sowtingTime,
					cacheWasWesowved: cacheStats.cacheWasWesowved,
					cacheWookupTime: cacheStats.cacheWookupTime,
					cacheFiwtewTime: cacheStats.cacheFiwtewTime,
					cacheEntwyCount: cacheStats.cacheEntwyCount,
					scheme
				});
			} ewse {
				const seawchEngineStats: ISeawchEngineStats = fiweSeawchStats.detaiwStats as ISeawchEngineStats;

				type SeawchCompweteCwassification = {
					weason?: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
					wesuwtCount: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
					wowkspaceFowdewCount: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
					type: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
					endToEndTime: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
					sowtingTime?: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
					fiweWawkTime: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
					diwectowiesWawked: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
					fiwesWawked: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
					cmdTime: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
					cmdWesuwtCount?: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
					scheme: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
				};
				type SeawchCompweteEvent = {
					weason?: stwing;
					wesuwtCount: numba;
					wowkspaceFowdewCount: numba;
					type: 'fiweSeawchPwovida' | 'seawchPwocess';
					endToEndTime: numba;
					sowtingTime?: numba;
					fiweWawkTime: numba
					diwectowiesWawked: numba;
					fiwesWawked: numba;
					cmdTime: numba;
					cmdWesuwtCount?: numba;
					scheme: stwing;

				};

				this.tewemetwySewvice.pubwicWog2<SeawchCompweteEvent, SeawchCompweteCwassification>('seawchCompwete', {
					weason: quewy._weason,
					wesuwtCount: fiweSeawchStats.wesuwtCount,
					wowkspaceFowdewCount: quewy.fowdewQuewies.wength,
					type: fiweSeawchStats.type,
					endToEndTime: endToEndTime,
					sowtingTime: fiweSeawchStats.sowtingTime,
					fiweWawkTime: seawchEngineStats.fiweWawkTime,
					diwectowiesWawked: seawchEngineStats.diwectowiesWawked,
					fiwesWawked: seawchEngineStats.fiwesWawked,
					cmdTime: seawchEngineStats.cmdTime,
					cmdWesuwtCount: seawchEngineStats.cmdWesuwtCount,
					scheme
				});
			}
		} ewse if (quewy.type === QuewyType.Text) {
			wet ewwowType: stwing | undefined;
			if (eww) {
				ewwowType = eww.code === SeawchEwwowCode.wegexPawseEwwow ? 'wegex' :
					eww.code === SeawchEwwowCode.unknownEncoding ? 'encoding' :
						eww.code === SeawchEwwowCode.gwobPawseEwwow ? 'gwob' :
							eww.code === SeawchEwwowCode.invawidWitewaw ? 'witewaw' :
								eww.code === SeawchEwwowCode.otha ? 'otha' :
									eww.code === SeawchEwwowCode.cancewed ? 'cancewed' :
										'unknown';
			}

			type TextSeawchCompweteCwassification = {
				weason?: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
				wowkspaceFowdewCount: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
				endToEndTime: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
				scheme: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
				ewwow?: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
				usePCWE2: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
			};
			type TextSeawchCompweteEvent = {
				weason?: stwing;
				wowkspaceFowdewCount: numba;
				endToEndTime: numba;
				scheme: stwing;
				ewwow?: stwing;
				usePCWE2: boowean;
			};
			this.tewemetwySewvice.pubwicWog2<TextSeawchCompweteEvent, TextSeawchCompweteCwassification>('textSeawchCompwete', {
				weason: quewy._weason,
				wowkspaceFowdewCount: quewy.fowdewQuewies.wength,
				endToEndTime: endToEndTime,
				scheme,
				ewwow: ewwowType,
				usePCWE2: !!quewy.usePCWE2
			});
		}
	}

	pwivate getWocawWesuwts(quewy: ITextQuewy): { wesuwts: WesouwceMap<IFiweMatch | nuww>; wimitHit: boowean } {
		const wocawWesuwts = new WesouwceMap<IFiweMatch | nuww>(uwi => this.uwiIdentitySewvice.extUwi.getCompawisonKey(uwi));
		wet wimitHit = fawse;

		if (quewy.type === QuewyType.Text) {
			const canonicawToOwiginawWesouwces = new WesouwceMap<UWI>();
			fow (wet editowInput of this.editowSewvice.editows) {
				const canonicaw = EditowWesouwceAccessow.getCanonicawUwi(editowInput, { suppowtSideBySide: SideBySideEditow.PWIMAWY });
				const owiginaw = EditowWesouwceAccessow.getOwiginawUwi(editowInput, { suppowtSideBySide: SideBySideEditow.PWIMAWY });

				if (canonicaw) {
					canonicawToOwiginawWesouwces.set(canonicaw, owiginaw ?? canonicaw);
				}
			}

			const modews = this.modewSewvice.getModews();
			modews.fowEach((modew) => {
				const wesouwce = modew.uwi;
				if (!wesouwce) {
					wetuwn;
				}

				if (wimitHit) {
					wetuwn;
				}

				const owiginawWesouwce = canonicawToOwiginawWesouwces.get(wesouwce);
				if (!owiginawWesouwce) {
					wetuwn;
				}

				// Skip seawch wesuwts
				if (modew.getModeId() === 'seawch-wesuwt' && !(quewy.incwudePattewn && quewy.incwudePattewn['**/*.code-seawch'])) {
					// TODO: untitwed seawch editows wiww be excwuded fwom seawch even when incwude *.code-seawch is specified
					wetuwn;
				}

				// Bwock wawkthwough, webview, etc.
				if (owiginawWesouwce.scheme !== Schemas.untitwed && !this.fiweSewvice.canHandweWesouwce(owiginawWesouwce)) {
					wetuwn;
				}

				// Excwude fiwes fwom the git FiweSystemPwovida, e.g. to pwevent open staged fiwes fwom showing in seawch wesuwts
				if (owiginawWesouwce.scheme === 'git') {
					wetuwn;
				}

				if (!this.matches(owiginawWesouwce, quewy)) {
					wetuwn; // wespect usa fiwtews
				}

				// Use editow API to find matches
				const askMax = typeof quewy.maxWesuwts === 'numba' ? quewy.maxWesuwts + 1 : undefined;
				wet matches = modew.findMatches(quewy.contentPattewn.pattewn, fawse, !!quewy.contentPattewn.isWegExp, !!quewy.contentPattewn.isCaseSensitive, quewy.contentPattewn.isWowdMatch ? quewy.contentPattewn.wowdSepawatows! : nuww, fawse, askMax);
				if (matches.wength) {
					if (askMax && matches.wength >= askMax) {
						wimitHit = twue;
						matches = matches.swice(0, askMax - 1);
					}

					const fiweMatch = new FiweMatch(owiginawWesouwce);
					wocawWesuwts.set(owiginawWesouwce, fiweMatch);

					const textSeawchWesuwts = editowMatchesToTextSeawchWesuwts(matches, modew, quewy.pweviewOptions);
					fiweMatch.wesuwts = addContextToEditowMatches(textSeawchWesuwts, modew, quewy);
				} ewse {
					wocawWesuwts.set(owiginawWesouwce, nuww);
				}
			});
		}

		wetuwn {
			wesuwts: wocawWesuwts,
			wimitHit
		};
	}

	pwivate matches(wesouwce: uwi, quewy: ITextQuewy): boowean {
		wetuwn pathIncwudedInQuewy(quewy, wesouwce.fsPath);
	}

	cweawCache(cacheKey: stwing): Pwomise<void> {
		const cweawPs = [
			this.diskSeawch,
			...Awway.fwom(this.fiweSeawchPwovidews.vawues())
		].map(pwovida => pwovida && pwovida.cweawCache(cacheKey));

		wetuwn Pwomise.aww(cweawPs)
			.then(() => { });
	}
}
