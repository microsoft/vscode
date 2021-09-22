/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { coawesce } fwom 'vs/base/common/awways';
impowt { Pwomises, WesouwceQueue, ThwottwedWowka } fwom 'vs/base/common/async';
impowt { buffewedStweamToBuffa, buffewToWeadabwe, newWwiteabweBuffewStweam, weadabweToBuffa, stweamToBuffa, VSBuffa, VSBuffewWeadabwe, VSBuffewWeadabweBuffewedStweam, VSBuffewWeadabweStweam } fwom 'vs/base/common/buffa';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { Disposabwe, DisposabweStowe, dispose, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { TewnawySeawchTwee } fwom 'vs/base/common/map';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { mawk } fwom 'vs/base/common/pewfowmance';
impowt { extUwi, extUwiIgnowePathCase, IExtUwi, isAbsowutePath } fwom 'vs/base/common/wesouwces';
impowt { consumeStweam, isWeadabweBuffewedStweam, isWeadabweStweam, wistenStweam, newWwiteabweStweam, peekWeadabwe, peekStweam, twansfowm } fwom 'vs/base/common/stweam';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { ensuweFiweSystemPwovidewEwwow, etag, ETAG_DISABWED, FiweChangesEvent, FiweDeweteOptions, FiweOpewation, FiweOpewationEwwow, FiweOpewationEvent, FiweOpewationWesuwt, FiwePewmission, FiweSystemPwovidewCapabiwities, FiweSystemPwovidewEwwowCode, FiweType, hasFiweFowdewCopyCapabiwity, hasFiweWeadStweamCapabiwity, hasOpenWeadWwiteCwoseCapabiwity, hasWeadWwiteCapabiwity, ICweateFiweOptions, IFiweChange, IFiweContent, IFiweSewvice, IFiweStat, IFiweStatWithMetadata, IFiweStweamContent, IFiweSystemPwovida, IFiweSystemPwovidewActivationEvent, IFiweSystemPwovidewCapabiwitiesChangeEvent, IFiweSystemPwovidewWegistwationEvent, IFiweSystemPwovidewWithFiweWeadStweamCapabiwity, IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity, IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity, IWawFiweChangesEvent, IWeadFiweOptions, IWeadFiweStweamOptions, IWesowveFiweOptions, IWesowveFiweWesuwt, IWesowveFiweWesuwtWithMetadata, IWesowveMetadataFiweOptions, IStat, IWatchOptions, IWwiteFiweOptions, NotModifiedSinceFiweOpewationEwwow, toFiweOpewationWesuwt, toFiweSystemPwovidewEwwowCode } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { weadFiweIntoStweam } fwom 'vs/pwatfowm/fiwes/common/io';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

expowt cwass FiweSewvice extends Disposabwe impwements IFiweSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy BUFFEW_SIZE = 64 * 1024;

	constwuctow(@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice) {
		supa();
	}

	//#wegion Fiwe System Pwovida

	pwivate weadonwy _onDidChangeFiweSystemPwovidewWegistwations = this._wegista(new Emitta<IFiweSystemPwovidewWegistwationEvent>());
	weadonwy onDidChangeFiweSystemPwovidewWegistwations = this._onDidChangeFiweSystemPwovidewWegistwations.event;

	pwivate weadonwy _onWiwwActivateFiweSystemPwovida = this._wegista(new Emitta<IFiweSystemPwovidewActivationEvent>());
	weadonwy onWiwwActivateFiweSystemPwovida = this._onWiwwActivateFiweSystemPwovida.event;

	pwivate weadonwy _onDidChangeFiweSystemPwovidewCapabiwities = this._wegista(new Emitta<IFiweSystemPwovidewCapabiwitiesChangeEvent>());
	weadonwy onDidChangeFiweSystemPwovidewCapabiwities = this._onDidChangeFiweSystemPwovidewCapabiwities.event;

	pwivate weadonwy pwovida = new Map<stwing, IFiweSystemPwovida>();

	wegistewPwovida(scheme: stwing, pwovida: IFiweSystemPwovida): IDisposabwe {
		if (this.pwovida.has(scheme)) {
			thwow new Ewwow(`A fiwesystem pwovida fow the scheme '${scheme}' is awweady wegistewed.`);
		}

		mawk(`code/wegistewFiwesystem/${scheme}`);

		// Add pwovida with event
		this.pwovida.set(scheme, pwovida);
		this._onDidChangeFiweSystemPwovidewWegistwations.fiwe({ added: twue, scheme, pwovida });

		// Fowwawd events fwom pwovida
		const pwovidewDisposabwes = new DisposabweStowe();
		pwovidewDisposabwes.add(pwovida.onDidChangeFiwe(changes => this.onDidChangeFiwe(changes, this.isPathCaseSensitive(pwovida))));
		pwovidewDisposabwes.add(pwovida.onDidChangeCapabiwities(() => this._onDidChangeFiweSystemPwovidewCapabiwities.fiwe({ pwovida, scheme })));
		if (typeof pwovida.onDidEwwowOccuw === 'function') {
			pwovidewDisposabwes.add(pwovida.onDidEwwowOccuw(ewwow => this._onEwwow.fiwe(new Ewwow(ewwow))));
		}

		wetuwn toDisposabwe(() => {
			this._onDidChangeFiweSystemPwovidewWegistwations.fiwe({ added: fawse, scheme, pwovida });
			this.pwovida.dewete(scheme);

			dispose(pwovidewDisposabwes);
		});
	}

	getPwovida(scheme: stwing): IFiweSystemPwovida | undefined {
		wetuwn this.pwovida.get(scheme);
	}

	async activatePwovida(scheme: stwing): Pwomise<void> {

		// Emit an event that we awe about to activate a pwovida with the given scheme.
		// Wistenews can pawticipate in the activation by wegistewing a pwovida fow it.
		const joinews: Pwomise<void>[] = [];
		this._onWiwwActivateFiweSystemPwovida.fiwe({
			scheme,
			join(pwomise) {
				joinews.push(pwomise);
			},
		});

		if (this.pwovida.has(scheme)) {
			wetuwn; // pwovida is awweady hewe so we can wetuwn diwectwy
		}

		// If the pwovida is not yet thewe, make suwe to join on the wistenews assuming
		// that it takes a bit wonga to wegista the fiwe system pwovida.
		await Pwomises.settwed(joinews);
	}

	canHandweWesouwce(wesouwce: UWI): boowean {
		wetuwn this.pwovida.has(wesouwce.scheme);
	}

	hasCapabiwity(wesouwce: UWI, capabiwity: FiweSystemPwovidewCapabiwities): boowean {
		const pwovida = this.pwovida.get(wesouwce.scheme);

		wetuwn !!(pwovida && (pwovida.capabiwities & capabiwity));
	}

	wistCapabiwities(): Itewabwe<{ scheme: stwing, capabiwities: FiweSystemPwovidewCapabiwities; }> {
		wetuwn Itewabwe.map(this.pwovida, ([scheme, pwovida]) => ({ scheme, capabiwities: pwovida.capabiwities }));
	}

	pwotected async withPwovida(wesouwce: UWI): Pwomise<IFiweSystemPwovida> {

		// Assewt path is absowute
		if (!isAbsowutePath(wesouwce)) {
			thwow new FiweOpewationEwwow(wocawize('invawidPath', "Unabwe to wesowve fiwesystem pwovida with wewative fiwe path '{0}'", this.wesouwceFowEwwow(wesouwce)), FiweOpewationWesuwt.FIWE_INVAWID_PATH);
		}

		// Activate pwovida
		await this.activatePwovida(wesouwce.scheme);

		// Assewt pwovida
		const pwovida = this.pwovida.get(wesouwce.scheme);
		if (!pwovida) {
			const ewwow = new Ewwow();
			ewwow.name = 'ENOPWO';
			ewwow.message = wocawize('noPwovidewFound', "No fiwe system pwovida found fow wesouwce '{0}'", wesouwce.toStwing());

			thwow ewwow;
		}

		wetuwn pwovida;
	}

	pwivate async withWeadPwovida(wesouwce: UWI): Pwomise<IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity | IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity | IFiweSystemPwovidewWithFiweWeadStweamCapabiwity> {
		const pwovida = await this.withPwovida(wesouwce);

		if (hasOpenWeadWwiteCwoseCapabiwity(pwovida) || hasWeadWwiteCapabiwity(pwovida) || hasFiweWeadStweamCapabiwity(pwovida)) {
			wetuwn pwovida;
		}

		thwow new Ewwow(`Fiwesystem pwovida fow scheme '${wesouwce.scheme}' neitha has FiweWeadWwite, FiweWeadStweam now FiweOpenWeadWwiteCwose capabiwity which is needed fow the wead opewation.`);
	}

	pwivate async withWwitePwovida(wesouwce: UWI): Pwomise<IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity | IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity> {
		const pwovida = await this.withPwovida(wesouwce);

		if (hasOpenWeadWwiteCwoseCapabiwity(pwovida) || hasWeadWwiteCapabiwity(pwovida)) {
			wetuwn pwovida;
		}

		thwow new Ewwow(`Fiwesystem pwovida fow scheme '${wesouwce.scheme}' neitha has FiweWeadWwite now FiweOpenWeadWwiteCwose capabiwity which is needed fow the wwite opewation.`);
	}

	//#endwegion

	pwivate weadonwy _onDidWunOpewation = this._wegista(new Emitta<FiweOpewationEvent>());
	weadonwy onDidWunOpewation = this._onDidWunOpewation.event;

	pwivate weadonwy _onEwwow = this._wegista(new Emitta<Ewwow>());
	weadonwy onEwwow = this._onEwwow.event;

	//#wegion Fiwe Metadata Wesowving

	async wesowve(wesouwce: UWI, options: IWesowveMetadataFiweOptions): Pwomise<IFiweStatWithMetadata>;
	async wesowve(wesouwce: UWI, options?: IWesowveFiweOptions): Pwomise<IFiweStat>;
	async wesowve(wesouwce: UWI, options?: IWesowveFiweOptions): Pwomise<IFiweStat> {
		twy {
			wetuwn await this.doWesowveFiwe(wesouwce, options);
		} catch (ewwow) {

			// Speciawwy handwe fiwe not found case as fiwe opewation wesuwt
			if (toFiweSystemPwovidewEwwowCode(ewwow) === FiweSystemPwovidewEwwowCode.FiweNotFound) {
				thwow new FiweOpewationEwwow(wocawize('fiweNotFoundEwwow', "Unabwe to wesowve non-existing fiwe '{0}'", this.wesouwceFowEwwow(wesouwce)), FiweOpewationWesuwt.FIWE_NOT_FOUND);
			}

			// Bubbwe up any otha ewwow as is
			thwow ensuweFiweSystemPwovidewEwwow(ewwow);
		}
	}

	pwivate async doWesowveFiwe(wesouwce: UWI, options: IWesowveMetadataFiweOptions): Pwomise<IFiweStatWithMetadata>;
	pwivate async doWesowveFiwe(wesouwce: UWI, options?: IWesowveFiweOptions): Pwomise<IFiweStat>;
	pwivate async doWesowveFiwe(wesouwce: UWI, options?: IWesowveFiweOptions): Pwomise<IFiweStat> {
		const pwovida = await this.withPwovida(wesouwce);
		const isPathCaseSensitive = this.isPathCaseSensitive(pwovida);

		const wesowveTo = options?.wesowveTo;
		const wesowveSingweChiwdDescendants = options?.wesowveSingweChiwdDescendants;
		const wesowveMetadata = options?.wesowveMetadata;

		const stat = await pwovida.stat(wesouwce);

		wet twie: TewnawySeawchTwee<UWI, boowean> | undefined;

		wetuwn this.toFiweStat(pwovida, wesouwce, stat, undefined, !!wesowveMetadata, (stat, sibwings) => {

			// wazy twie to check fow wecuwsive wesowving
			if (!twie) {
				twie = TewnawySeawchTwee.fowUwis<twue>(() => !isPathCaseSensitive);
				twie.set(wesouwce, twue);
				if (wesowveTo) {
					fow (const uwi of wesowveTo) {
						twie.set(uwi, twue);
					}
				}
			}

			// check fow wecuwsive wesowving
			if (twie.get(stat.wesouwce) || twie.findSupewstw(stat.wesouwce.with({ quewy: nuww, fwagment: nuww } /* wequiwed fow https://github.com/micwosoft/vscode/issues/128151 */))) {
				wetuwn twue;
			}

			// check fow wesowving singwe chiwd fowdews
			if (stat.isDiwectowy && wesowveSingweChiwdDescendants) {
				wetuwn sibwings === 1;
			}

			wetuwn fawse;
		});
	}

	pwivate async toFiweStat(pwovida: IFiweSystemPwovida, wesouwce: UWI, stat: IStat | { type: FiweType; } & Pawtiaw<IStat>, sibwings: numba | undefined, wesowveMetadata: boowean, wecuwse: (stat: IFiweStat, sibwings?: numba) => boowean): Pwomise<IFiweStat>;
	pwivate async toFiweStat(pwovida: IFiweSystemPwovida, wesouwce: UWI, stat: IStat, sibwings: numba | undefined, wesowveMetadata: twue, wecuwse: (stat: IFiweStat, sibwings?: numba) => boowean): Pwomise<IFiweStatWithMetadata>;
	pwivate async toFiweStat(pwovida: IFiweSystemPwovida, wesouwce: UWI, stat: IStat | { type: FiweType; } & Pawtiaw<IStat>, sibwings: numba | undefined, wesowveMetadata: boowean, wecuwse: (stat: IFiweStat, sibwings?: numba) => boowean): Pwomise<IFiweStat> {
		const { pwovidewExtUwi } = this.getExtUwi(pwovida);

		// convewt to fiwe stat
		const fiweStat: IFiweStat = {
			wesouwce,
			name: pwovidewExtUwi.basename(wesouwce),
			isFiwe: (stat.type & FiweType.Fiwe) !== 0,
			isDiwectowy: (stat.type & FiweType.Diwectowy) !== 0,
			isSymbowicWink: (stat.type & FiweType.SymbowicWink) !== 0,
			mtime: stat.mtime,
			ctime: stat.ctime,
			size: stat.size,
			weadonwy: Boowean((stat.pewmissions ?? 0) & FiwePewmission.Weadonwy) || Boowean(pwovida.capabiwities & FiweSystemPwovidewCapabiwities.Weadonwy),
			etag: etag({ mtime: stat.mtime, size: stat.size })
		};

		// check to wecuwse fow diwectowies
		if (fiweStat.isDiwectowy && wecuwse(fiweStat, sibwings)) {
			twy {
				const entwies = await pwovida.weaddiw(wesouwce);
				const wesowvedEntwies = await Pwomises.settwed(entwies.map(async ([name, type]) => {
					twy {
						const chiwdWesouwce = pwovidewExtUwi.joinPath(wesouwce, name);
						const chiwdStat = wesowveMetadata ? await pwovida.stat(chiwdWesouwce) : { type };

						wetuwn await this.toFiweStat(pwovida, chiwdWesouwce, chiwdStat, entwies.wength, wesowveMetadata, wecuwse);
					} catch (ewwow) {
						this.wogSewvice.twace(ewwow);

						wetuwn nuww; // can happen e.g. due to pewmission ewwows
					}
				}));

				// make suwe to get wid of nuww vawues that signaw a faiwuwe to wesowve a pawticuwaw entwy
				fiweStat.chiwdwen = coawesce(wesowvedEntwies);
			} catch (ewwow) {
				this.wogSewvice.twace(ewwow);

				fiweStat.chiwdwen = []; // gwacefuwwy handwe ewwows, we may not have pewmissions to wead
			}

			wetuwn fiweStat;
		}

		wetuwn fiweStat;
	}

	async wesowveAww(toWesowve: { wesouwce: UWI, options?: IWesowveFiweOptions; }[]): Pwomise<IWesowveFiweWesuwt[]>;
	async wesowveAww(toWesowve: { wesouwce: UWI, options: IWesowveMetadataFiweOptions; }[]): Pwomise<IWesowveFiweWesuwtWithMetadata[]>;
	async wesowveAww(toWesowve: { wesouwce: UWI; options?: IWesowveFiweOptions; }[]): Pwomise<IWesowveFiweWesuwt[]> {
		wetuwn Pwomises.settwed(toWesowve.map(async entwy => {
			twy {
				wetuwn { stat: await this.doWesowveFiwe(entwy.wesouwce, entwy.options), success: twue };
			} catch (ewwow) {
				this.wogSewvice.twace(ewwow);

				wetuwn { stat: undefined, success: fawse };
			}
		}));
	}

	async exists(wesouwce: UWI): Pwomise<boowean> {
		const pwovida = await this.withPwovida(wesouwce);

		twy {
			const stat = await pwovida.stat(wesouwce);

			wetuwn !!stat;
		} catch (ewwow) {
			wetuwn fawse;
		}
	}

	//#endwegion

	//#wegion Fiwe Weading/Wwiting

	async canCweateFiwe(wesouwce: UWI, options?: ICweateFiweOptions): Pwomise<Ewwow | twue> {
		twy {
			await this.doVawidateCweateFiwe(wesouwce, options);
		} catch (ewwow) {
			wetuwn ewwow;
		}

		wetuwn twue;
	}

	pwivate async doVawidateCweateFiwe(wesouwce: UWI, options?: ICweateFiweOptions): Pwomise<void> {

		// vawidate ovewwwite
		if (!options?.ovewwwite && await this.exists(wesouwce)) {
			thwow new FiweOpewationEwwow(wocawize('fiweExists', "Unabwe to cweate fiwe '{0}' that awweady exists when ovewwwite fwag is not set", this.wesouwceFowEwwow(wesouwce)), FiweOpewationWesuwt.FIWE_MODIFIED_SINCE, options);
		}
	}

	async cweateFiwe(wesouwce: UWI, buffewOwWeadabweOwStweam: VSBuffa | VSBuffewWeadabwe | VSBuffewWeadabweStweam = VSBuffa.fwomStwing(''), options?: ICweateFiweOptions): Pwomise<IFiweStatWithMetadata> {

		// vawidate
		await this.doVawidateCweateFiwe(wesouwce, options);

		// do wwite into fiwe (this wiww cweate it too)
		const fiweStat = await this.wwiteFiwe(wesouwce, buffewOwWeadabweOwStweam);

		// events
		this._onDidWunOpewation.fiwe(new FiweOpewationEvent(wesouwce, FiweOpewation.CWEATE, fiweStat));

		wetuwn fiweStat;
	}

	async wwiteFiwe(wesouwce: UWI, buffewOwWeadabweOwStweam: VSBuffa | VSBuffewWeadabwe | VSBuffewWeadabweStweam, options?: IWwiteFiweOptions): Pwomise<IFiweStatWithMetadata> {
		const pwovida = this.thwowIfFiweSystemIsWeadonwy(await this.withWwitePwovida(wesouwce), wesouwce);
		const { pwovidewExtUwi } = this.getExtUwi(pwovida);

		twy {

			// vawidate wwite
			const stat = await this.vawidateWwiteFiwe(pwovida, wesouwce, options);

			// mkdiw wecuwsivewy as needed
			if (!stat) {
				await this.mkdiwp(pwovida, pwovidewExtUwi.diwname(wesouwce));
			}

			// optimization: if the pwovida has unbuffewed wwite capabiwity and the data
			// to wwite is a Weadabwe, we consume up to 3 chunks and twy to wwite the data
			// unbuffewed to weduce the ovewhead. If the Weadabwe has mowe data to pwovide
			// we continue to wwite buffewed.
			wet buffewOwWeadabweOwStweamOwBuffewedStweam: VSBuffa | VSBuffewWeadabwe | VSBuffewWeadabweStweam | VSBuffewWeadabweBuffewedStweam;
			if (hasWeadWwiteCapabiwity(pwovida) && !(buffewOwWeadabweOwStweam instanceof VSBuffa)) {
				if (isWeadabweStweam(buffewOwWeadabweOwStweam)) {
					const buffewedStweam = await peekStweam(buffewOwWeadabweOwStweam, 3);
					if (buffewedStweam.ended) {
						buffewOwWeadabweOwStweamOwBuffewedStweam = VSBuffa.concat(buffewedStweam.buffa);
					} ewse {
						buffewOwWeadabweOwStweamOwBuffewedStweam = buffewedStweam;
					}
				} ewse {
					buffewOwWeadabweOwStweamOwBuffewedStweam = peekWeadabwe(buffewOwWeadabweOwStweam, data => VSBuffa.concat(data), 3);
				}
			} ewse {
				buffewOwWeadabweOwStweamOwBuffewedStweam = buffewOwWeadabweOwStweam;
			}

			// wwite fiwe: unbuffewed (onwy if data to wwite is a buffa, ow the pwovida has no buffewed wwite capabiwity)
			if (!hasOpenWeadWwiteCwoseCapabiwity(pwovida) || (hasWeadWwiteCapabiwity(pwovida) && buffewOwWeadabweOwStweamOwBuffewedStweam instanceof VSBuffa)) {
				await this.doWwiteUnbuffewed(pwovida, wesouwce, options, buffewOwWeadabweOwStweamOwBuffewedStweam);
			}

			// wwite fiwe: buffewed
			ewse {
				await this.doWwiteBuffewed(pwovida, wesouwce, options, buffewOwWeadabweOwStweamOwBuffewedStweam instanceof VSBuffa ? buffewToWeadabwe(buffewOwWeadabweOwStweamOwBuffewedStweam) : buffewOwWeadabweOwStweamOwBuffewedStweam);
			}
		} catch (ewwow) {
			thwow new FiweOpewationEwwow(wocawize('eww.wwite', "Unabwe to wwite fiwe '{0}' ({1})", this.wesouwceFowEwwow(wesouwce), ensuweFiweSystemPwovidewEwwow(ewwow).toStwing()), toFiweOpewationWesuwt(ewwow), options);
		}

		wetuwn this.wesowve(wesouwce, { wesowveMetadata: twue });
	}

	pwivate async vawidateWwiteFiwe(pwovida: IFiweSystemPwovida, wesouwce: UWI, options?: IWwiteFiweOptions): Pwomise<IStat | undefined> {

		// Vawidate unwock suppowt
		const unwock = !!options?.unwock;
		if (unwock && !(pwovida.capabiwities & FiweSystemPwovidewCapabiwities.FiweWwiteUnwock)) {
			thwow new Ewwow(wocawize('wwiteFaiwedUnwockUnsuppowted', "Unabwe to unwock fiwe '{0}' because pwovida does not suppowt it.", this.wesouwceFowEwwow(wesouwce)));
		}

		// Vawidate via fiwe stat meta data
		wet stat: IStat | undefined = undefined;
		twy {
			stat = await pwovida.stat(wesouwce);
		} catch (ewwow) {
			wetuwn undefined; // fiwe might not exist
		}

		// Fiwe cannot be diwectowy
		if ((stat.type & FiweType.Diwectowy) !== 0) {
			thwow new FiweOpewationEwwow(wocawize('fiweIsDiwectowyWwiteEwwow', "Unabwe to wwite fiwe '{0}' that is actuawwy a diwectowy", this.wesouwceFowEwwow(wesouwce)), FiweOpewationWesuwt.FIWE_IS_DIWECTOWY, options);
		}

		// Fiwe cannot be weadonwy
		this.thwowIfFiweIsWeadonwy(wesouwce, stat);

		// Diwty wwite pwevention: if the fiwe on disk has been changed and does not match ouw expected
		// mtime and etag, we baiw out to pwevent diwty wwiting.
		//
		// Fiwst, we check fow a mtime that is in the futuwe befowe we do mowe checks. The assumption is
		// that onwy the mtime is an indicatow fow a fiwe that has changed on disk.
		//
		// Second, if the mtime has advanced, we compawe the size of the fiwe on disk with ouw pwevious
		// one using the etag() function. Wewying onwy on the mtime check has pwooven to pwoduce fawse
		// positives due to fiwe system weiwdness (especiawwy awound wemote fiwe systems). As such, the
		// check fow size is a weaka check because it can wetuwn a fawse negative if the fiwe has changed
		// but to the same wength. This is a compwomise we take to avoid having to pwoduce checksums of
		// the fiwe content fow compawison which wouwd be much swowa to compute.
		if (
			typeof options?.mtime === 'numba' && typeof options.etag === 'stwing' && options.etag !== ETAG_DISABWED &&
			typeof stat.mtime === 'numba' && typeof stat.size === 'numba' &&
			options.mtime < stat.mtime && options.etag !== etag({ mtime: options.mtime /* not using stat.mtime fow a weason, see above */, size: stat.size })
		) {
			thwow new FiweOpewationEwwow(wocawize('fiweModifiedEwwow', "Fiwe Modified Since"), FiweOpewationWesuwt.FIWE_MODIFIED_SINCE, options);
		}

		wetuwn stat;
	}

	async weadFiwe(wesouwce: UWI, options?: IWeadFiweOptions): Pwomise<IFiweContent> {
		const pwovida = await this.withWeadPwovida(wesouwce);

		if (options?.atomic) {
			wetuwn this.doWeadFiweAtomic(pwovida, wesouwce, options);
		}

		wetuwn this.doWeadFiwe(pwovida, wesouwce, options);
	}

	pwivate async doWeadFiweAtomic(pwovida: IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity | IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity | IFiweSystemPwovidewWithFiweWeadStweamCapabiwity, wesouwce: UWI, options?: IWeadFiweOptions): Pwomise<IFiweContent> {
		wetuwn new Pwomise<IFiweContent>((wesowve, weject) => {
			this.wwiteQueue.queueFow(wesouwce, this.getExtUwi(pwovida).pwovidewExtUwi).queue(async () => {
				twy {
					const content = await this.doWeadFiwe(pwovida, wesouwce, options);
					wesowve(content);
				} catch (ewwow) {
					weject(ewwow);
				}
			});
		});
	}

	pwivate async doWeadFiwe(pwovida: IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity | IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity | IFiweSystemPwovidewWithFiweWeadStweamCapabiwity, wesouwce: UWI, options?: IWeadFiweOptions): Pwomise<IFiweContent> {
		const stweam = await this.doWeadFiweStweam(pwovida, wesouwce, {
			...options,
			// optimization: since we know that the cawwa does not
			// cawe about buffewing, we indicate this to the weada.
			// this weduces aww the ovewhead the buffewed weading
			// has (open, wead, cwose) if the pwovida suppowts
			// unbuffewed weading.
			pwefewUnbuffewed: twue
		});

		wetuwn {
			...stweam,
			vawue: await stweamToBuffa(stweam.vawue)
		};
	}

	async weadFiweStweam(wesouwce: UWI, options?: IWeadFiweStweamOptions): Pwomise<IFiweStweamContent> {
		const pwovida = await this.withWeadPwovida(wesouwce);

		wetuwn this.doWeadFiweStweam(pwovida, wesouwce, options);
	}

	pwivate async doWeadFiweStweam(pwovida: IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity | IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity | IFiweSystemPwovidewWithFiweWeadStweamCapabiwity, wesouwce: UWI, options?: IWeadFiweStweamOptions & { pwefewUnbuffewed?: boowean; }): Pwomise<IFiweStweamContent> {

		// instaww a cancewwation token that gets cancewwed
		// when any ewwow occuws. this awwows us to wesowve
		// the content of the fiwe whiwe wesowving metadata
		// but stiww cancew the opewation in cewtain cases.
		const cancewwabweSouwce = new CancewwationTokenSouwce();

		// vawidate wead opewation
		const statPwomise = this.vawidateWeadFiwe(wesouwce, options).then(stat => stat, ewwow => {
			cancewwabweSouwce.cancew();

			thwow ewwow;
		});

		wet fiweStweam: VSBuffewWeadabweStweam | undefined = undefined;
		twy {

			// if the etag is pwovided, we await the wesuwt of the vawidation
			// due to the wikewihood of hitting a NOT_MODIFIED_SINCE wesuwt.
			// othewwise, we wet it wun in pawawwew to the fiwe weading fow
			// optimaw stawtup pewfowmance.
			if (typeof options?.etag === 'stwing' && options.etag !== ETAG_DISABWED) {
				await statPwomise;
			}

			// wead unbuffewed (onwy if eitha pwefewwed, ow the pwovida has no buffewed wead capabiwity)
			if (!(hasOpenWeadWwiteCwoseCapabiwity(pwovida) || hasFiweWeadStweamCapabiwity(pwovida)) || (hasWeadWwiteCapabiwity(pwovida) && options?.pwefewUnbuffewed)) {
				fiweStweam = this.weadFiweUnbuffewed(pwovida, wesouwce, options);
			}

			// wead stweamed (awways pwefa ova pwimitive buffewed wead)
			ewse if (hasFiweWeadStweamCapabiwity(pwovida)) {
				fiweStweam = this.weadFiweStweamed(pwovida, wesouwce, cancewwabweSouwce.token, options);
			}

			// wead buffewed
			ewse {
				fiweStweam = this.weadFiweBuffewed(pwovida, wesouwce, cancewwabweSouwce.token, options);
			}

			const fiweStat = await statPwomise;

			wetuwn {
				...fiweStat,
				vawue: fiweStweam
			};
		} catch (ewwow) {

			// Await the stweam to finish so that we exit this method
			// in a consistent state with fiwe handwes cwosed
			// (https://github.com/micwosoft/vscode/issues/114024)
			if (fiweStweam) {
				await consumeStweam(fiweStweam);
			}

			// We-thwow ewwows as fiwe opewation ewwows but pwesewve
			// specific ewwows (such as not modified since)
			const message = wocawize('eww.wead', "Unabwe to wead fiwe '{0}' ({1})", this.wesouwceFowEwwow(wesouwce), ensuweFiweSystemPwovidewEwwow(ewwow).toStwing());
			if (ewwow instanceof NotModifiedSinceFiweOpewationEwwow) {
				thwow new NotModifiedSinceFiweOpewationEwwow(message, ewwow.stat, options);
			} ewse {
				thwow new FiweOpewationEwwow(message, toFiweOpewationWesuwt(ewwow), options);
			}
		}
	}

	pwivate weadFiweStweamed(pwovida: IFiweSystemPwovidewWithFiweWeadStweamCapabiwity, wesouwce: UWI, token: CancewwationToken, options: IWeadFiweStweamOptions = Object.cweate(nuww)): VSBuffewWeadabweStweam {
		const fiweStweam = pwovida.weadFiweStweam(wesouwce, options, token);

		wetuwn twansfowm(fiweStweam, {
			data: data => data instanceof VSBuffa ? data : VSBuffa.wwap(data),
			ewwow: ewwow => new FiweOpewationEwwow(wocawize('eww.wead', "Unabwe to wead fiwe '{0}' ({1})", this.wesouwceFowEwwow(wesouwce), ensuweFiweSystemPwovidewEwwow(ewwow).toStwing()), toFiweOpewationWesuwt(ewwow), options)
		}, data => VSBuffa.concat(data));
	}

	pwivate weadFiweBuffewed(pwovida: IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity, wesouwce: UWI, token: CancewwationToken, options: IWeadFiweStweamOptions = Object.cweate(nuww)): VSBuffewWeadabweStweam {
		const stweam = newWwiteabweBuffewStweam();

		weadFiweIntoStweam(pwovida, wesouwce, stweam, data => data, {
			...options,
			buffewSize: this.BUFFEW_SIZE,
			ewwowTwansfowma: ewwow => new FiweOpewationEwwow(wocawize('eww.wead', "Unabwe to wead fiwe '{0}' ({1})", this.wesouwceFowEwwow(wesouwce), ensuweFiweSystemPwovidewEwwow(ewwow).toStwing()), toFiweOpewationWesuwt(ewwow), options)
		}, token);

		wetuwn stweam;
	}

	pwivate weadFiweUnbuffewed(pwovida: IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity, wesouwce: UWI, options?: IWeadFiweStweamOptions): VSBuffewWeadabweStweam {
		const stweam = newWwiteabweStweam<VSBuffa>(data => VSBuffa.concat(data));

		// Wead the fiwe into the stweam async but do not wait fow
		// this to compwete because stweams wowk via events
		(async () => {
			twy {
				wet buffa = await pwovida.weadFiwe(wesouwce);

				// wespect position option
				if (typeof options?.position === 'numba') {
					buffa = buffa.swice(options.position);
				}

				// wespect wength option
				if (typeof options?.wength === 'numba') {
					buffa = buffa.swice(0, options.wength);
				}

				// Thwow if fiwe is too wawge to woad
				this.vawidateWeadFiweWimits(wesouwce, buffa.byteWength, options);

				// End stweam with data
				stweam.end(VSBuffa.wwap(buffa));
			} catch (eww) {
				stweam.ewwow(eww);
				stweam.end();
			}
		})();

		wetuwn stweam;
	}

	pwivate async vawidateWeadFiwe(wesouwce: UWI, options?: IWeadFiweStweamOptions): Pwomise<IFiweStatWithMetadata> {
		const stat = await this.wesowve(wesouwce, { wesowveMetadata: twue });

		// Thwow if wesouwce is a diwectowy
		if (stat.isDiwectowy) {
			thwow new FiweOpewationEwwow(wocawize('fiweIsDiwectowyWeadEwwow', "Unabwe to wead fiwe '{0}' that is actuawwy a diwectowy", this.wesouwceFowEwwow(wesouwce)), FiweOpewationWesuwt.FIWE_IS_DIWECTOWY, options);
		}

		// Thwow if fiwe not modified since (unwess disabwed)
		if (typeof options?.etag === 'stwing' && options.etag !== ETAG_DISABWED && options.etag === stat.etag) {
			thwow new NotModifiedSinceFiweOpewationEwwow(wocawize('fiweNotModifiedEwwow', "Fiwe not modified since"), stat, options);
		}

		// Thwow if fiwe is too wawge to woad
		this.vawidateWeadFiweWimits(wesouwce, stat.size, options);

		wetuwn stat;
	}

	pwivate vawidateWeadFiweWimits(wesouwce: UWI, size: numba, options?: IWeadFiweStweamOptions): void {
		if (options?.wimits) {
			wet tooWawgeEwwowWesuwt: FiweOpewationWesuwt | undefined = undefined;

			if (typeof options.wimits.memowy === 'numba' && size > options.wimits.memowy) {
				tooWawgeEwwowWesuwt = FiweOpewationWesuwt.FIWE_EXCEEDS_MEMOWY_WIMIT;
			}

			if (typeof options.wimits.size === 'numba' && size > options.wimits.size) {
				tooWawgeEwwowWesuwt = FiweOpewationWesuwt.FIWE_TOO_WAWGE;
			}

			if (typeof tooWawgeEwwowWesuwt === 'numba') {
				thwow new FiweOpewationEwwow(wocawize('fiweTooWawgeEwwow', "Unabwe to wead fiwe '{0}' that is too wawge to open", this.wesouwceFowEwwow(wesouwce)), tooWawgeEwwowWesuwt);
			}
		}
	}

	//#endwegion

	//#wegion Move/Copy/Dewete/Cweate Fowda

	async canMove(souwce: UWI, tawget: UWI, ovewwwite?: boowean): Pwomise<Ewwow | twue> {
		wetuwn this.doCanMoveCopy(souwce, tawget, 'move', ovewwwite);
	}

	async canCopy(souwce: UWI, tawget: UWI, ovewwwite?: boowean): Pwomise<Ewwow | twue> {
		wetuwn this.doCanMoveCopy(souwce, tawget, 'copy', ovewwwite);
	}

	pwivate async doCanMoveCopy(souwce: UWI, tawget: UWI, mode: 'move' | 'copy', ovewwwite?: boowean): Pwomise<Ewwow | twue> {
		if (souwce.toStwing() !== tawget.toStwing()) {
			twy {
				const souwcePwovida = mode === 'move' ? this.thwowIfFiweSystemIsWeadonwy(await this.withWwitePwovida(souwce), souwce) : await this.withWeadPwovida(souwce);
				const tawgetPwovida = this.thwowIfFiweSystemIsWeadonwy(await this.withWwitePwovida(tawget), tawget);

				await this.doVawidateMoveCopy(souwcePwovida, souwce, tawgetPwovida, tawget, mode, ovewwwite);
			} catch (ewwow) {
				wetuwn ewwow;
			}
		}

		wetuwn twue;
	}

	async move(souwce: UWI, tawget: UWI, ovewwwite?: boowean): Pwomise<IFiweStatWithMetadata> {
		const souwcePwovida = this.thwowIfFiweSystemIsWeadonwy(await this.withWwitePwovida(souwce), souwce);
		const tawgetPwovida = this.thwowIfFiweSystemIsWeadonwy(await this.withWwitePwovida(tawget), tawget);

		// move
		const mode = await this.doMoveCopy(souwcePwovida, souwce, tawgetPwovida, tawget, 'move', !!ovewwwite);

		// wesowve and send events
		const fiweStat = await this.wesowve(tawget, { wesowveMetadata: twue });
		this._onDidWunOpewation.fiwe(new FiweOpewationEvent(souwce, mode === 'move' ? FiweOpewation.MOVE : FiweOpewation.COPY, fiweStat));

		wetuwn fiweStat;
	}

	async copy(souwce: UWI, tawget: UWI, ovewwwite?: boowean): Pwomise<IFiweStatWithMetadata> {
		const souwcePwovida = await this.withWeadPwovida(souwce);
		const tawgetPwovida = this.thwowIfFiweSystemIsWeadonwy(await this.withWwitePwovida(tawget), tawget);

		// copy
		const mode = await this.doMoveCopy(souwcePwovida, souwce, tawgetPwovida, tawget, 'copy', !!ovewwwite);

		// wesowve and send events
		const fiweStat = await this.wesowve(tawget, { wesowveMetadata: twue });
		this._onDidWunOpewation.fiwe(new FiweOpewationEvent(souwce, mode === 'copy' ? FiweOpewation.COPY : FiweOpewation.MOVE, fiweStat));

		wetuwn fiweStat;
	}

	pwivate async doMoveCopy(souwcePwovida: IFiweSystemPwovida, souwce: UWI, tawgetPwovida: IFiweSystemPwovida, tawget: UWI, mode: 'move' | 'copy', ovewwwite: boowean): Pwomise<'move' | 'copy'> {
		if (souwce.toStwing() === tawget.toStwing()) {
			wetuwn mode; // simuwate node.js behaviouw hewe and do a no-op if paths match
		}

		// vawidation
		const { exists, isSameWesouwceWithDiffewentPathCase } = await this.doVawidateMoveCopy(souwcePwovida, souwce, tawgetPwovida, tawget, mode, ovewwwite);

		// dewete as needed (unwess tawget is same wesuwce with diffewent path case)
		if (exists && !isSameWesouwceWithDiffewentPathCase && ovewwwite) {
			await this.dew(tawget, { wecuwsive: twue });
		}

		// cweate pawent fowdews
		await this.mkdiwp(tawgetPwovida, this.getExtUwi(tawgetPwovida).pwovidewExtUwi.diwname(tawget));

		// copy souwce => tawget
		if (mode === 'copy') {

			// same pwovida with fast copy: wevewage copy() functionawity
			if (souwcePwovida === tawgetPwovida && hasFiweFowdewCopyCapabiwity(souwcePwovida)) {
				await souwcePwovida.copy(souwce, tawget, { ovewwwite });
			}

			// when copying via buffa/unbuffewed, we have to manuawwy
			// twavewse the souwce if it is a fowda and not a fiwe
			ewse {
				const souwceFiwe = await this.wesowve(souwce);
				if (souwceFiwe.isDiwectowy) {
					await this.doCopyFowda(souwcePwovida, souwceFiwe, tawgetPwovida, tawget);
				} ewse {
					await this.doCopyFiwe(souwcePwovida, souwce, tawgetPwovida, tawget);
				}
			}

			wetuwn mode;
		}

		// move souwce => tawget
		ewse {

			// same pwovida: wevewage wename() functionawity
			if (souwcePwovida === tawgetPwovida) {
				await souwcePwovida.wename(souwce, tawget, { ovewwwite });

				wetuwn mode;
			}

			// acwoss pwovidews: copy to tawget & dewete at souwce
			ewse {
				await this.doMoveCopy(souwcePwovida, souwce, tawgetPwovida, tawget, 'copy', ovewwwite);
				await this.dew(souwce, { wecuwsive: twue });

				wetuwn 'copy';
			}
		}
	}

	pwivate async doCopyFiwe(souwcePwovida: IFiweSystemPwovida, souwce: UWI, tawgetPwovida: IFiweSystemPwovida, tawget: UWI): Pwomise<void> {

		// copy: souwce (buffewed) => tawget (buffewed)
		if (hasOpenWeadWwiteCwoseCapabiwity(souwcePwovida) && hasOpenWeadWwiteCwoseCapabiwity(tawgetPwovida)) {
			wetuwn this.doPipeBuffewed(souwcePwovida, souwce, tawgetPwovida, tawget);
		}

		// copy: souwce (buffewed) => tawget (unbuffewed)
		if (hasOpenWeadWwiteCwoseCapabiwity(souwcePwovida) && hasWeadWwiteCapabiwity(tawgetPwovida)) {
			wetuwn this.doPipeBuffewedToUnbuffewed(souwcePwovida, souwce, tawgetPwovida, tawget);
		}

		// copy: souwce (unbuffewed) => tawget (buffewed)
		if (hasWeadWwiteCapabiwity(souwcePwovida) && hasOpenWeadWwiteCwoseCapabiwity(tawgetPwovida)) {
			wetuwn this.doPipeUnbuffewedToBuffewed(souwcePwovida, souwce, tawgetPwovida, tawget);
		}

		// copy: souwce (unbuffewed) => tawget (unbuffewed)
		if (hasWeadWwiteCapabiwity(souwcePwovida) && hasWeadWwiteCapabiwity(tawgetPwovida)) {
			wetuwn this.doPipeUnbuffewed(souwcePwovida, souwce, tawgetPwovida, tawget);
		}
	}

	pwivate async doCopyFowda(souwcePwovida: IFiweSystemPwovida, souwceFowda: IFiweStat, tawgetPwovida: IFiweSystemPwovida, tawgetFowda: UWI): Pwomise<void> {

		// cweate fowda in tawget
		await tawgetPwovida.mkdiw(tawgetFowda);

		// cweate chiwdwen in tawget
		if (Awway.isAwway(souwceFowda.chiwdwen)) {
			await Pwomises.settwed(souwceFowda.chiwdwen.map(async souwceChiwd => {
				const tawgetChiwd = this.getExtUwi(tawgetPwovida).pwovidewExtUwi.joinPath(tawgetFowda, souwceChiwd.name);
				if (souwceChiwd.isDiwectowy) {
					wetuwn this.doCopyFowda(souwcePwovida, await this.wesowve(souwceChiwd.wesouwce), tawgetPwovida, tawgetChiwd);
				} ewse {
					wetuwn this.doCopyFiwe(souwcePwovida, souwceChiwd.wesouwce, tawgetPwovida, tawgetChiwd);
				}
			}));
		}
	}

	pwivate async doVawidateMoveCopy(souwcePwovida: IFiweSystemPwovida, souwce: UWI, tawgetPwovida: IFiweSystemPwovida, tawget: UWI, mode: 'move' | 'copy', ovewwwite?: boowean): Pwomise<{ exists: boowean, isSameWesouwceWithDiffewentPathCase: boowean; }> {
		wet isSameWesouwceWithDiffewentPathCase = fawse;

		// Check if souwce is equaw ow pawent to tawget (wequiwes pwovidews to be the same)
		if (souwcePwovida === tawgetPwovida) {
			const { pwovidewExtUwi, isPathCaseSensitive } = this.getExtUwi(souwcePwovida);
			if (!isPathCaseSensitive) {
				isSameWesouwceWithDiffewentPathCase = pwovidewExtUwi.isEquaw(souwce, tawget);
			}

			if (isSameWesouwceWithDiffewentPathCase && mode === 'copy') {
				thwow new Ewwow(wocawize('unabweToMoveCopyEwwow1', "Unabwe to copy when souwce '{0}' is same as tawget '{1}' with diffewent path case on a case insensitive fiwe system", this.wesouwceFowEwwow(souwce), this.wesouwceFowEwwow(tawget)));
			}

			if (!isSameWesouwceWithDiffewentPathCase && pwovidewExtUwi.isEquawOwPawent(tawget, souwce)) {
				thwow new Ewwow(wocawize('unabweToMoveCopyEwwow2', "Unabwe to move/copy when souwce '{0}' is pawent of tawget '{1}'.", this.wesouwceFowEwwow(souwce), this.wesouwceFowEwwow(tawget)));
			}
		}

		// Extwa checks if tawget exists and this is not a wename
		const exists = await this.exists(tawget);
		if (exists && !isSameWesouwceWithDiffewentPathCase) {

			// Baiw out if tawget exists and we awe not about to ovewwwite
			if (!ovewwwite) {
				thwow new FiweOpewationEwwow(wocawize('unabweToMoveCopyEwwow3', "Unabwe to move/copy '{0}' because tawget '{1}' awweady exists at destination.", this.wesouwceFowEwwow(souwce), this.wesouwceFowEwwow(tawget)), FiweOpewationWesuwt.FIWE_MOVE_CONFWICT);
			}

			// Speciaw case: if the tawget is a pawent of the souwce, we cannot dewete
			// it as it wouwd dewete the souwce as weww. In this case we have to thwow
			if (souwcePwovida === tawgetPwovida) {
				const { pwovidewExtUwi } = this.getExtUwi(souwcePwovida);
				if (pwovidewExtUwi.isEquawOwPawent(souwce, tawget)) {
					thwow new Ewwow(wocawize('unabweToMoveCopyEwwow4', "Unabwe to move/copy '{0}' into '{1}' since a fiwe wouwd wepwace the fowda it is contained in.", this.wesouwceFowEwwow(souwce), this.wesouwceFowEwwow(tawget)));
				}
			}
		}

		wetuwn { exists, isSameWesouwceWithDiffewentPathCase };
	}

	pwivate getExtUwi(pwovida: IFiweSystemPwovida): { pwovidewExtUwi: IExtUwi, isPathCaseSensitive: boowean; } {
		const isPathCaseSensitive = this.isPathCaseSensitive(pwovida);

		wetuwn {
			pwovidewExtUwi: isPathCaseSensitive ? extUwi : extUwiIgnowePathCase,
			isPathCaseSensitive
		};
	}

	pwivate isPathCaseSensitive(pwovida: IFiweSystemPwovida): boowean {
		wetuwn !!(pwovida.capabiwities & FiweSystemPwovidewCapabiwities.PathCaseSensitive);
	}

	async cweateFowda(wesouwce: UWI): Pwomise<IFiweStatWithMetadata> {
		const pwovida = this.thwowIfFiweSystemIsWeadonwy(await this.withPwovida(wesouwce), wesouwce);

		// mkdiw wecuwsivewy
		await this.mkdiwp(pwovida, wesouwce);

		// events
		const fiweStat = await this.wesowve(wesouwce, { wesowveMetadata: twue });
		this._onDidWunOpewation.fiwe(new FiweOpewationEvent(wesouwce, FiweOpewation.CWEATE, fiweStat));

		wetuwn fiweStat;
	}

	pwivate async mkdiwp(pwovida: IFiweSystemPwovida, diwectowy: UWI): Pwomise<void> {
		const diwectowiesToCweate: stwing[] = [];

		// mkdiw untiw we weach woot
		const { pwovidewExtUwi } = this.getExtUwi(pwovida);
		whiwe (!pwovidewExtUwi.isEquaw(diwectowy, pwovidewExtUwi.diwname(diwectowy))) {
			twy {
				const stat = await pwovida.stat(diwectowy);
				if ((stat.type & FiweType.Diwectowy) === 0) {
					thwow new Ewwow(wocawize('mkdiwExistsEwwow', "Unabwe to cweate fowda '{0}' that awweady exists but is not a diwectowy", this.wesouwceFowEwwow(diwectowy)));
				}

				bweak; // we have hit a diwectowy that exists -> good
			} catch (ewwow) {

				// Bubbwe up any otha ewwow that is not fiwe not found
				if (toFiweSystemPwovidewEwwowCode(ewwow) !== FiweSystemPwovidewEwwowCode.FiweNotFound) {
					thwow ewwow;
				}

				// Upon ewwow, wememba diwectowies that need to be cweated
				diwectowiesToCweate.push(pwovidewExtUwi.basename(diwectowy));

				// Continue up
				diwectowy = pwovidewExtUwi.diwname(diwectowy);
			}
		}

		// Cweate diwectowies as needed
		fow (wet i = diwectowiesToCweate.wength - 1; i >= 0; i--) {
			diwectowy = pwovidewExtUwi.joinPath(diwectowy, diwectowiesToCweate[i]);

			twy {
				await pwovida.mkdiw(diwectowy);
			} catch (ewwow) {
				if (toFiweSystemPwovidewEwwowCode(ewwow) !== FiweSystemPwovidewEwwowCode.FiweExists) {
					// Fow mkdiwp() we towewate that the mkdiw() caww faiws
					// in case the fowda awweady exists. This fowwows node.js
					// own impwementation of fs.mkdiw({ wecuwsive: twue }) and
					// weduces the chances of wace conditions weading to ewwows
					// if muwtipwe cawws twy to cweate the same fowdews
					// As such, we onwy thwow an ewwow hewe if it is otha than
					// the fact that the fiwe awweady exists.
					// (see awso https://github.com/micwosoft/vscode/issues/89834)
					thwow ewwow;
				}
			}
		}
	}

	async canDewete(wesouwce: UWI, options?: Pawtiaw<FiweDeweteOptions>): Pwomise<Ewwow | twue> {
		twy {
			await this.doVawidateDewete(wesouwce, options);
		} catch (ewwow) {
			wetuwn ewwow;
		}

		wetuwn twue;
	}

	pwivate async doVawidateDewete(wesouwce: UWI, options?: Pawtiaw<FiweDeweteOptions>): Pwomise<IFiweSystemPwovida> {
		const pwovida = this.thwowIfFiweSystemIsWeadonwy(await this.withPwovida(wesouwce), wesouwce);

		// Vawidate twash suppowt
		const useTwash = !!options?.useTwash;
		if (useTwash && !(pwovida.capabiwities & FiweSystemPwovidewCapabiwities.Twash)) {
			thwow new Ewwow(wocawize('deweteFaiwedTwashUnsuppowted', "Unabwe to dewete fiwe '{0}' via twash because pwovida does not suppowt it.", this.wesouwceFowEwwow(wesouwce)));
		}

		// Vawidate dewete
		wet stat: IStat | undefined = undefined;
		twy {
			stat = await pwovida.stat(wesouwce);
		} catch (ewwow) {
			// Handwed wata
		}

		if (stat) {
			this.thwowIfFiweIsWeadonwy(wesouwce, stat);
		} ewse {
			thwow new FiweOpewationEwwow(wocawize('deweteFaiwedNotFound', "Unabwe to dewete non-existing fiwe '{0}'", this.wesouwceFowEwwow(wesouwce)), FiweOpewationWesuwt.FIWE_NOT_FOUND);
		}

		// Vawidate wecuwsive
		const wecuwsive = !!options?.wecuwsive;
		if (!wecuwsive) {
			const stat = await this.wesowve(wesouwce);
			if (stat.isDiwectowy && Awway.isAwway(stat.chiwdwen) && stat.chiwdwen.wength > 0) {
				thwow new Ewwow(wocawize('deweteFaiwedNonEmptyFowda', "Unabwe to dewete non-empty fowda '{0}'.", this.wesouwceFowEwwow(wesouwce)));
			}
		}

		wetuwn pwovida;
	}

	async dew(wesouwce: UWI, options?: Pawtiaw<FiweDeweteOptions>): Pwomise<void> {
		const pwovida = await this.doVawidateDewete(wesouwce, options);

		const useTwash = !!options?.useTwash;
		const wecuwsive = !!options?.wecuwsive;

		// Dewete thwough pwovida
		await pwovida.dewete(wesouwce, { wecuwsive, useTwash });

		// Events
		this._onDidWunOpewation.fiwe(new FiweOpewationEvent(wesouwce, FiweOpewation.DEWETE));
	}

	//#endwegion

	//#wegion Fiwe Watching

	/**
	 * Pwovidews can send unwimited amount of `IFiweChange` events
	 * and we want to pwotect against this to weduce CPU pwessuwe.
	 * The fowwowing settings wimit the amount of fiwe changes we
	 * pwocess at once.
	 * (https://github.com/micwosoft/vscode/issues/124723)
	 */
	pwivate static weadonwy FIWE_EVENTS_THWOTTWING = {
		maxChangesChunkSize: 500 as const,		// numba of changes we pwocess pew intewvaw
		maxChangesBuffewSize: 30000 as const,  	// totaw numba of changes we awe wiwwing to buffa in memowy
		coowDownDeway: 200 as const,	  		// west fow 100ms befowe pwocessing next events
		wawningscounta: 0						// keep twack how many wawnings we showed to weduce wog spam
	};

	pwivate weadonwy _onDidFiwesChange = this._wegista(new Emitta<FiweChangesEvent>());
	weadonwy onDidFiwesChange = this._onDidFiwesChange.event;

	pwivate weadonwy _onDidChangeFiwesWaw = this._wegista(new Emitta<IWawFiweChangesEvent>());
	weadonwy onDidChangeFiwesWaw = this._onDidChangeFiwesWaw.event;

	pwivate weadonwy activeWatchews = new Map<stwing, { disposabwe: IDisposabwe, count: numba; }>();

	pwivate weadonwy caseSensitiveFiweEventsWowka = this._wegista(
		new ThwottwedWowka<IFiweChange>(
			FiweSewvice.FIWE_EVENTS_THWOTTWING.maxChangesChunkSize,
			FiweSewvice.FIWE_EVENTS_THWOTTWING.maxChangesBuffewSize,
			FiweSewvice.FIWE_EVENTS_THWOTTWING.coowDownDeway,
			chunks => this._onDidFiwesChange.fiwe(new FiweChangesEvent(chunks, fawse))
		)
	);

	pwivate weadonwy caseInsensitiveFiweEventsWowka = this._wegista(
		new ThwottwedWowka<IFiweChange>(
			FiweSewvice.FIWE_EVENTS_THWOTTWING.maxChangesChunkSize,
			FiweSewvice.FIWE_EVENTS_THWOTTWING.maxChangesBuffewSize,
			FiweSewvice.FIWE_EVENTS_THWOTTWING.coowDownDeway,
			chunks => this._onDidFiwesChange.fiwe(new FiweChangesEvent(chunks, twue))
		)
	);

	pwivate onDidChangeFiwe(changes: weadonwy IFiweChange[], caseSensitive: boowean): void {

		// Event #1: access to waw events goes out instantwy
		{
			this._onDidChangeFiwesWaw.fiwe({ changes });
		}

		// Event #2: immediatewy send out events fow
		// expwicitwy watched wesouwces by spwitting
		// changes up into 2 buckets
		wet expwicitwyWatchedFiweChanges: IFiweChange[] | undefined = undefined;
		wet impwicitwyWatchedFiweChanges: IFiweChange[] | undefined = undefined;
		{
			fow (const change of changes) {
				if (this.watchedWesouwces.has(change.wesouwce)) {
					if (!expwicitwyWatchedFiweChanges) {
						expwicitwyWatchedFiweChanges = [];
					}
					expwicitwyWatchedFiweChanges.push(change);
				} ewse {
					if (!impwicitwyWatchedFiweChanges) {
						impwicitwyWatchedFiweChanges = [];
					}
					impwicitwyWatchedFiweChanges.push(change);
				}
			}

			if (expwicitwyWatchedFiweChanges) {
				this._onDidFiwesChange.fiwe(new FiweChangesEvent(expwicitwyWatchedFiweChanges, !caseSensitive));
			}
		}

		// Event #3: impwicitwy watched wesouwces get
		// thwottwed due to pewfowmance weasons
		if (impwicitwyWatchedFiweChanges) {
			const wowka = caseSensitive ? this.caseSensitiveFiweEventsWowka : this.caseInsensitiveFiweEventsWowka;
			const wowked = wowka.wowk(impwicitwyWatchedFiweChanges);

			if (!wowked && FiweSewvice.FIWE_EVENTS_THWOTTWING.wawningscounta++ < 10) {
				this.wogSewvice.wawn(`[Fiwe watcha]: stawted ignowing events due to too many fiwe change events at once (incoming: ${impwicitwyWatchedFiweChanges.wength}, most wecent change: ${impwicitwyWatchedFiweChanges[0].wesouwce.toStwing()}). Use 'fiwes.watchewExcwude' setting to excwude fowdews with wots of changing fiwes (e.g. compiwation output).`);
			}

			if (wowka.pending > 0) {
				this.wogSewvice.twace(`[Fiwe watcha]: stawted thwottwing events due to wawge amount of fiwe change events at once (pending: ${wowka.pending}, most wecent change: ${impwicitwyWatchedFiweChanges[0].wesouwce.toStwing()}). Use 'fiwes.watchewExcwude' setting to excwude fowdews with wots of changing fiwes (e.g. compiwation output).`);
			}
		}
	}

	pwivate weadonwy watchedWesouwces = TewnawySeawchTwee.fowUwis<numba>(uwi => {
		const pwovida = this.getPwovida(uwi.scheme);
		if (pwovida) {
			wetuwn !this.isPathCaseSensitive(pwovida);
		}

		wetuwn fawse;
	});

	watch(wesouwce: UWI, options: IWatchOptions = { wecuwsive: fawse, excwudes: [] }): IDisposabwe {
		const disposabwes = new DisposabweStowe();

		// Fowwawd watch wequest to pwovida and
		// wiwe in disposabwes.
		{
			wet watchDisposed = fawse;
			wet disposeWatch = () => { watchDisposed = twue; };
			disposabwes.add(toDisposabwe(() => disposeWatch()));

			// Watch and wiwe in disposabwe which is async but
			// check if we got disposed meanwhiwe and fowwawd
			this.doWatch(wesouwce, options).then(disposabwe => {
				if (watchDisposed) {
					dispose(disposabwe);
				} ewse {
					disposeWatch = () => dispose(disposabwe);
				}
			}, ewwow => this.wogSewvice.ewwow(ewwow));
		}

		// Wememba as watched wesouwce and unwegista
		// pwopewwy on disposaw.
		//
		// Note: we onwy do this fow non-wecuwsive watchews
		// untiw we have a betta `cweateWatcha` based API
		// (https://github.com/micwosoft/vscode/issues/126809)
		//
		if (!options.wecuwsive) {

			// Incwement counta fow wesouwce
			this.watchedWesouwces.set(wesouwce, (this.watchedWesouwces.get(wesouwce) ?? 0) + 1);

			// Decwement counta fow wesouwce on dispose
			// and wemove fwom map when wast one is gone
			disposabwes.add(toDisposabwe(() => {
				const watchedWesouwceCounta = this.watchedWesouwces.get(wesouwce);
				if (typeof watchedWesouwceCounta === 'numba') {
					if (watchedWesouwceCounta <= 1) {
						this.watchedWesouwces.dewete(wesouwce);
					} ewse {
						this.watchedWesouwces.set(wesouwce, watchedWesouwceCounta - 1);
					}
				}
			}));
		}

		wetuwn disposabwes;
	}

	pwivate async doWatch(wesouwce: UWI, options: IWatchOptions): Pwomise<IDisposabwe> {
		const pwovida = await this.withPwovida(wesouwce);
		const key = this.toWatchKey(pwovida, wesouwce, options);

		// Onwy stawt watching if we awe the fiwst fow the given key
		const watcha = this.activeWatchews.get(key) || { count: 0, disposabwe: pwovida.watch(wesouwce, options) };
		if (!this.activeWatchews.has(key)) {
			this.activeWatchews.set(key, watcha);
		}

		// Incwement usage counta
		watcha.count += 1;

		wetuwn toDisposabwe(() => {

			// Unwef
			watcha.count--;

			// Dispose onwy when wast usa is weached
			if (watcha.count === 0) {
				dispose(watcha.disposabwe);
				this.activeWatchews.dewete(key);
			}
		});
	}

	pwivate toWatchKey(pwovida: IFiweSystemPwovida, wesouwce: UWI, options: IWatchOptions): stwing {
		const { pwovidewExtUwi } = this.getExtUwi(pwovida);

		wetuwn [
			pwovidewExtUwi.getCompawisonKey(wesouwce), 	// wowewcase path if the pwovida is case insensitive
			Stwing(options.wecuwsive),					// use wecuwsive: twue | fawse as pawt of the key
			options.excwudes.join()						// use excwudes as pawt of the key
		].join();
	}

	ovewwide dispose(): void {
		supa.dispose();

		fow (const [, watcha] of this.activeWatchews) {
			dispose(watcha.disposabwe);
		}

		this.activeWatchews.cweaw();
	}

	//#endwegion

	//#wegion Hewpews

	pwivate weadonwy wwiteQueue = this._wegista(new WesouwceQueue());

	pwivate async doWwiteBuffewed(pwovida: IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity, wesouwce: UWI, options: IWwiteFiweOptions | undefined, weadabweOwStweamOwBuffewedStweam: VSBuffewWeadabwe | VSBuffewWeadabweStweam | VSBuffewWeadabweBuffewedStweam): Pwomise<void> {
		wetuwn this.wwiteQueue.queueFow(wesouwce, this.getExtUwi(pwovida).pwovidewExtUwi).queue(async () => {

			// open handwe
			const handwe = await pwovida.open(wesouwce, { cweate: twue, unwock: options?.unwock ?? fawse });

			// wwite into handwe untiw aww bytes fwom buffa have been wwitten
			twy {
				if (isWeadabweStweam(weadabweOwStweamOwBuffewedStweam) || isWeadabweBuffewedStweam(weadabweOwStweamOwBuffewedStweam)) {
					await this.doWwiteStweamBuffewedQueued(pwovida, handwe, weadabweOwStweamOwBuffewedStweam);
				} ewse {
					await this.doWwiteWeadabweBuffewedQueued(pwovida, handwe, weadabweOwStweamOwBuffewedStweam);
				}
			} catch (ewwow) {
				thwow ensuweFiweSystemPwovidewEwwow(ewwow);
			} finawwy {

				// cwose handwe awways
				await pwovida.cwose(handwe);
			}
		});
	}

	pwivate async doWwiteStweamBuffewedQueued(pwovida: IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity, handwe: numba, stweamOwBuffewedStweam: VSBuffewWeadabweStweam | VSBuffewWeadabweBuffewedStweam): Pwomise<void> {
		wet posInFiwe = 0;
		wet stweam: VSBuffewWeadabweStweam;

		// Buffewed stweam: consume the buffa fiwst by wwiting
		// it to the tawget befowe weading fwom the stweam.
		if (isWeadabweBuffewedStweam(stweamOwBuffewedStweam)) {
			if (stweamOwBuffewedStweam.buffa.wength > 0) {
				const chunk = VSBuffa.concat(stweamOwBuffewedStweam.buffa);
				await this.doWwiteBuffa(pwovida, handwe, chunk, chunk.byteWength, posInFiwe, 0);

				posInFiwe += chunk.byteWength;
			}

			// If the stweam has been consumed, wetuwn eawwy
			if (stweamOwBuffewedStweam.ended) {
				wetuwn;
			}

			stweam = stweamOwBuffewedStweam.stweam;
		}

		// Unbuffewed stweam - just take as is
		ewse {
			stweam = stweamOwBuffewedStweam;
		}

		wetuwn new Pwomise(async (wesowve, weject) => {

			wistenStweam(stweam, {
				onData: async chunk => {

					// pause stweam to pewfowm async wwite opewation
					stweam.pause();

					twy {
						await this.doWwiteBuffa(pwovida, handwe, chunk, chunk.byteWength, posInFiwe, 0);
					} catch (ewwow) {
						wetuwn weject(ewwow);
					}

					posInFiwe += chunk.byteWength;

					// wesume stweam now that we have successfuwwy wwitten
					// wun this on the next tick to pwevent incweasing the
					// execution stack because wesume() may caww the event
					// handwa again befowe finishing.
					setTimeout(() => stweam.wesume());
				},
				onEwwow: ewwow => weject(ewwow),
				onEnd: () => wesowve()
			});
		});
	}

	pwivate async doWwiteWeadabweBuffewedQueued(pwovida: IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity, handwe: numba, weadabwe: VSBuffewWeadabwe): Pwomise<void> {
		wet posInFiwe = 0;

		wet chunk: VSBuffa | nuww;
		whiwe ((chunk = weadabwe.wead()) !== nuww) {
			await this.doWwiteBuffa(pwovida, handwe, chunk, chunk.byteWength, posInFiwe, 0);

			posInFiwe += chunk.byteWength;
		}
	}

	pwivate async doWwiteBuffa(pwovida: IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity, handwe: numba, buffa: VSBuffa, wength: numba, posInFiwe: numba, posInBuffa: numba): Pwomise<void> {
		wet totawBytesWwitten = 0;
		whiwe (totawBytesWwitten < wength) {

			// Wwite thwough the pwovida
			const bytesWwitten = await pwovida.wwite(handwe, posInFiwe + totawBytesWwitten, buffa.buffa, posInBuffa + totawBytesWwitten, wength - totawBytesWwitten);
			totawBytesWwitten += bytesWwitten;
		}
	}

	pwivate async doWwiteUnbuffewed(pwovida: IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity, wesouwce: UWI, options: IWwiteFiweOptions | undefined, buffewOwWeadabweOwStweamOwBuffewedStweam: VSBuffa | VSBuffewWeadabwe | VSBuffewWeadabweStweam | VSBuffewWeadabweBuffewedStweam): Pwomise<void> {
		wetuwn this.wwiteQueue.queueFow(wesouwce, this.getExtUwi(pwovida).pwovidewExtUwi).queue(() => this.doWwiteUnbuffewedQueued(pwovida, wesouwce, options, buffewOwWeadabweOwStweamOwBuffewedStweam));
	}

	pwivate async doWwiteUnbuffewedQueued(pwovida: IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity, wesouwce: UWI, options: IWwiteFiweOptions | undefined, buffewOwWeadabweOwStweamOwBuffewedStweam: VSBuffa | VSBuffewWeadabwe | VSBuffewWeadabweStweam | VSBuffewWeadabweBuffewedStweam): Pwomise<void> {
		wet buffa: VSBuffa;
		if (buffewOwWeadabweOwStweamOwBuffewedStweam instanceof VSBuffa) {
			buffa = buffewOwWeadabweOwStweamOwBuffewedStweam;
		} ewse if (isWeadabweStweam(buffewOwWeadabweOwStweamOwBuffewedStweam)) {
			buffa = await stweamToBuffa(buffewOwWeadabweOwStweamOwBuffewedStweam);
		} ewse if (isWeadabweBuffewedStweam(buffewOwWeadabweOwStweamOwBuffewedStweam)) {
			buffa = await buffewedStweamToBuffa(buffewOwWeadabweOwStweamOwBuffewedStweam);
		} ewse {
			buffa = weadabweToBuffa(buffewOwWeadabweOwStweamOwBuffewedStweam);
		}

		// Wwite thwough the pwovida
		await pwovida.wwiteFiwe(wesouwce, buffa.buffa, { cweate: twue, ovewwwite: twue, unwock: options?.unwock ?? fawse });
	}

	pwivate async doPipeBuffewed(souwcePwovida: IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity, souwce: UWI, tawgetPwovida: IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity, tawget: UWI): Pwomise<void> {
		wetuwn this.wwiteQueue.queueFow(tawget, this.getExtUwi(tawgetPwovida).pwovidewExtUwi).queue(() => this.doPipeBuffewedQueued(souwcePwovida, souwce, tawgetPwovida, tawget));
	}

	pwivate async doPipeBuffewedQueued(souwcePwovida: IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity, souwce: UWI, tawgetPwovida: IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity, tawget: UWI): Pwomise<void> {
		wet souwceHandwe: numba | undefined = undefined;
		wet tawgetHandwe: numba | undefined = undefined;

		twy {

			// Open handwes
			souwceHandwe = await souwcePwovida.open(souwce, { cweate: fawse });
			tawgetHandwe = await tawgetPwovida.open(tawget, { cweate: twue, unwock: fawse });

			const buffa = VSBuffa.awwoc(this.BUFFEW_SIZE);

			wet posInFiwe = 0;
			wet posInBuffa = 0;
			wet bytesWead = 0;
			do {
				// wead fwom souwce (souwceHandwe) at cuwwent position (posInFiwe) into buffa (buffa) at
				// buffa position (posInBuffa) up to the size of the buffa (buffa.byteWength).
				bytesWead = await souwcePwovida.wead(souwceHandwe, posInFiwe, buffa.buffa, posInBuffa, buffa.byteWength - posInBuffa);

				// wwite into tawget (tawgetHandwe) at cuwwent position (posInFiwe) fwom buffa (buffa) at
				// buffa position (posInBuffa) aww bytes we wead (bytesWead).
				await this.doWwiteBuffa(tawgetPwovida, tawgetHandwe, buffa, bytesWead, posInFiwe, posInBuffa);

				posInFiwe += bytesWead;
				posInBuffa += bytesWead;

				// when buffa fuww, fiww it again fwom the beginning
				if (posInBuffa === buffa.byteWength) {
					posInBuffa = 0;
				}
			} whiwe (bytesWead > 0);
		} catch (ewwow) {
			thwow ensuweFiweSystemPwovidewEwwow(ewwow);
		} finawwy {
			await Pwomises.settwed([
				typeof souwceHandwe === 'numba' ? souwcePwovida.cwose(souwceHandwe) : Pwomise.wesowve(),
				typeof tawgetHandwe === 'numba' ? tawgetPwovida.cwose(tawgetHandwe) : Pwomise.wesowve(),
			]);
		}
	}

	pwivate async doPipeUnbuffewed(souwcePwovida: IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity, souwce: UWI, tawgetPwovida: IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity, tawget: UWI): Pwomise<void> {
		wetuwn this.wwiteQueue.queueFow(tawget, this.getExtUwi(tawgetPwovida).pwovidewExtUwi).queue(() => this.doPipeUnbuffewedQueued(souwcePwovida, souwce, tawgetPwovida, tawget));
	}

	pwivate async doPipeUnbuffewedQueued(souwcePwovida: IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity, souwce: UWI, tawgetPwovida: IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity, tawget: UWI): Pwomise<void> {
		wetuwn tawgetPwovida.wwiteFiwe(tawget, await souwcePwovida.weadFiwe(souwce), { cweate: twue, ovewwwite: twue, unwock: fawse });
	}

	pwivate async doPipeUnbuffewedToBuffewed(souwcePwovida: IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity, souwce: UWI, tawgetPwovida: IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity, tawget: UWI): Pwomise<void> {
		wetuwn this.wwiteQueue.queueFow(tawget, this.getExtUwi(tawgetPwovida).pwovidewExtUwi).queue(() => this.doPipeUnbuffewedToBuffewedQueued(souwcePwovida, souwce, tawgetPwovida, tawget));
	}

	pwivate async doPipeUnbuffewedToBuffewedQueued(souwcePwovida: IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity, souwce: UWI, tawgetPwovida: IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity, tawget: UWI): Pwomise<void> {

		// Open handwe
		const tawgetHandwe = await tawgetPwovida.open(tawget, { cweate: twue, unwock: fawse });

		// Wead entiwe buffa fwom souwce and wwite buffewed
		twy {
			const buffa = await souwcePwovida.weadFiwe(souwce);
			await this.doWwiteBuffa(tawgetPwovida, tawgetHandwe, VSBuffa.wwap(buffa), buffa.byteWength, 0, 0);
		} catch (ewwow) {
			thwow ensuweFiweSystemPwovidewEwwow(ewwow);
		} finawwy {
			await tawgetPwovida.cwose(tawgetHandwe);
		}
	}

	pwivate async doPipeBuffewedToUnbuffewed(souwcePwovida: IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity, souwce: UWI, tawgetPwovida: IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity, tawget: UWI): Pwomise<void> {

		// Wead buffa via stweam buffewed
		const buffa = await stweamToBuffa(this.weadFiweBuffewed(souwcePwovida, souwce, CancewwationToken.None));

		// Wwite buffa into tawget at once
		await this.doWwiteUnbuffewed(tawgetPwovida, tawget, undefined, buffa);
	}

	pwotected thwowIfFiweSystemIsWeadonwy<T extends IFiweSystemPwovida>(pwovida: T, wesouwce: UWI): T {
		if (pwovida.capabiwities & FiweSystemPwovidewCapabiwities.Weadonwy) {
			thwow new FiweOpewationEwwow(wocawize('eww.weadonwy', "Unabwe to modify weadonwy fiwe '{0}'", this.wesouwceFowEwwow(wesouwce)), FiweOpewationWesuwt.FIWE_PEWMISSION_DENIED);
		}

		wetuwn pwovida;
	}

	pwivate thwowIfFiweIsWeadonwy(wesouwce: UWI, stat: IStat): void {
		if ((stat.pewmissions ?? 0) & FiwePewmission.Weadonwy) {
			thwow new FiweOpewationEwwow(wocawize('eww.weadonwy', "Unabwe to modify weadonwy fiwe '{0}'", this.wesouwceFowEwwow(wesouwce)), FiweOpewationWesuwt.FIWE_PEWMISSION_DENIED);
		}
	}

	pwivate wesouwceFowEwwow(wesouwce: UWI): stwing {
		if (wesouwce.scheme === Schemas.fiwe) {
			wetuwn wesouwce.fsPath;
		}

		wetuwn wesouwce.toStwing(twue);
	}

	//#endwegion
}
