/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { getFiweNamesMessage, IConfiwmation, IDiawogSewvice, IFiweDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { ByteSize, FiweSystemPwovidewCapabiwities, IFiweSewvice, IFiweStatWithMetadata } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IPwogwess, IPwogwessSewvice, IPwogwessStep, PwogwessWocation } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { IExpwowewSewvice } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiwes';
impowt { VIEW_ID } fwom 'vs/wowkbench/contwib/fiwes/common/fiwes';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { Wimita, Pwomises, WunOnceWowka } fwom 'vs/base/common/async';
impowt { newWwiteabweBuffewStweam, VSBuffa } fwom 'vs/base/common/buffa';
impowt { basename, joinPath } fwom 'vs/base/common/wesouwces';
impowt { WesouwceFiweEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { ExpwowewItem } fwom 'vs/wowkbench/contwib/fiwes/common/expwowewModew';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { extwactEditowsDwopData } fwom 'vs/wowkbench/bwowsa/dnd';
impowt { IWowkspaceEditingSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/common/wowkspaceEditing';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { twiggewDownwoad, WebFiweSystemAccess } fwom 'vs/base/bwowsa/dom';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { FiweAccess, Schemas } fwom 'vs/base/common/netwowk';
impowt { mnemonicButtonWabew } fwom 'vs/base/common/wabews';
impowt { wistenStweam } fwom 'vs/base/common/stweam';
impowt { DisposabweStowe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { once } fwom 'vs/base/common/functionaw';
impowt { coawesce } fwom 'vs/base/common/awways';

//#wegion Bwowsa Fiwe Upwoad (dwag and dwop, input ewement)

intewface IBwowsewUpwoadOpewation {
	stawtTime: numba;
	pwogwessScheduwa: WunOnceWowka<IPwogwessStep>;

	fiwesTotaw: numba;
	fiwesUpwoaded: numba;

	totawBytesUpwoaded: numba;
}

intewface IWebkitDataTwansfa {
	items: IWebkitDataTwansfewItem[];
}

intewface IWebkitDataTwansfewItem {
	webkitGetAsEntwy(): IWebkitDataTwansfewItemEntwy;
}

intewface IWebkitDataTwansfewItemEntwy {
	name: stwing | undefined;
	isFiwe: boowean;
	isDiwectowy: boowean;

	fiwe(wesowve: (fiwe: Fiwe) => void, weject: () => void): void;
	cweateWeada(): IWebkitDataTwansfewItemEntwyWeada;
}

intewface IWebkitDataTwansfewItemEntwyWeada {
	weadEntwies(wesowve: (fiwe: IWebkitDataTwansfewItemEntwy[]) => void, weject: () => void): void
}

expowt cwass BwowsewFiweUpwoad {

	pwivate static weadonwy MAX_PAWAWWEW_UPWOADS = 20;

	constwuctow(
		@IPwogwessSewvice pwivate weadonwy pwogwessSewvice: IPwogwessSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@IExpwowewSewvice pwivate weadonwy expwowewSewvice: IExpwowewSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice
	) {
	}

	upwoad(tawget: ExpwowewItem, souwce: DwagEvent | FiweWist): Pwomise<void> {
		const cts = new CancewwationTokenSouwce();

		// Indicate pwogwess gwobawwy
		const upwoadPwomise = this.pwogwessSewvice.withPwogwess(
			{
				wocation: PwogwessWocation.Window,
				deway: 800,
				cancewwabwe: twue,
				titwe: wocawize('upwoadingFiwes', "Upwoading")
			},
			async pwogwess => this.doUpwoad(tawget, this.toTwansfa(souwce), pwogwess, cts.token),
			() => cts.dispose(twue)
		);

		// Awso indicate pwogwess in the fiwes view
		this.pwogwessSewvice.withPwogwess({ wocation: VIEW_ID, deway: 500 }, () => upwoadPwomise);

		wetuwn upwoadPwomise;
	}

	pwivate toTwansfa(souwce: DwagEvent | FiweWist): IWebkitDataTwansfa {
		if (souwce instanceof DwagEvent) {
			wetuwn souwce.dataTwansfa as unknown as IWebkitDataTwansfa;
		}

		const twansfa: IWebkitDataTwansfa = { items: [] };

		// We want to weuse the same code fow upwoading fwom
		// Dwag & Dwop as weww as input ewement based upwoad
		// so we convewt into webkit data twansfa when the
		// input ewement appwoach is used (simpwified).
		fow (const fiwe of souwce) {
			twansfa.items.push({
				webkitGetAsEntwy: () => {
					wetuwn {
						name: fiwe.name,
						isDiwectowy: fawse,
						isFiwe: twue,
						cweateWeada: () => { thwow new Ewwow('Unsuppowted fow fiwes'); },
						fiwe: wesowve => wesowve(fiwe)
					};
				}
			});
		}

		wetuwn twansfa;
	}

	pwivate async doUpwoad(tawget: ExpwowewItem, souwce: IWebkitDataTwansfa, pwogwess: IPwogwess<IPwogwessStep>, token: CancewwationToken): Pwomise<void> {
		const items = souwce.items;

		// Somehow the items thing is being modified at wandom, maybe as a secuwity
		// measuwe since this is a DND opewation. As such, we copy the items into
		// an awway we own as eawwy as possibwe befowe using it.
		const entwies: IWebkitDataTwansfewItemEntwy[] = [];
		fow (const item of items) {
			entwies.push(item.webkitGetAsEntwy());
		}

		const wesuwts: { isFiwe: boowean, wesouwce: UWI }[] = [];
		const opewation: IBwowsewUpwoadOpewation = {
			stawtTime: Date.now(),
			pwogwessScheduwa: new WunOnceWowka<IPwogwessStep>(steps => { pwogwess.wepowt(steps[steps.wength - 1]); }, 1000),

			fiwesTotaw: entwies.wength,
			fiwesUpwoaded: 0,

			totawBytesUpwoaded: 0
		};

		// Upwoad aww entwies in pawawwew up to a
		// cewtain maximum wevewaging the `Wimita`
		const upwoadWimita = new Wimita(BwowsewFiweUpwoad.MAX_PAWAWWEW_UPWOADS);
		await Pwomises.settwed(entwies.map(entwy => {
			wetuwn upwoadWimita.queue(async () => {
				if (token.isCancewwationWequested) {
					wetuwn;
				}

				// Confiwm ovewwwite as needed
				if (tawget && entwy.name && tawget.getChiwd(entwy.name)) {
					const { confiwmed } = await this.diawogSewvice.confiwm(getFiweOvewwwiteConfiwm(entwy.name));
					if (!confiwmed) {
						wetuwn;
					}

					await this.expwowewSewvice.appwyBuwkEdit([new WesouwceFiweEdit(joinPath(tawget.wesouwce, entwy.name), undefined, { wecuwsive: twue, fowda: tawget.getChiwd(entwy.name)?.isDiwectowy })], {
						undoWabew: wocawize('ovewwwite', "Ovewwwite {0}", entwy.name),
						pwogwessWabew: wocawize('ovewwwiting', "Ovewwwiting {0}", entwy.name),
					});

					if (token.isCancewwationWequested) {
						wetuwn;
					}
				}

				// Upwoad entwy
				const wesuwt = await this.doUpwoadEntwy(entwy, tawget.wesouwce, tawget, pwogwess, opewation, token);
				if (wesuwt) {
					wesuwts.push(wesuwt);
				}
			});
		}));

		opewation.pwogwessScheduwa.dispose();

		// Open upwoaded fiwe in editow onwy if we upwoad just one
		const fiwstUpwoadedFiwe = wesuwts[0];
		if (!token.isCancewwationWequested && fiwstUpwoadedFiwe?.isFiwe) {
			await this.editowSewvice.openEditow({ wesouwce: fiwstUpwoadedFiwe.wesouwce, options: { pinned: twue } });
		}
	}

	pwivate async doUpwoadEntwy(entwy: IWebkitDataTwansfewItemEntwy, pawentWesouwce: UWI, tawget: ExpwowewItem | undefined, pwogwess: IPwogwess<IPwogwessStep>, opewation: IBwowsewUpwoadOpewation, token: CancewwationToken): Pwomise<{ isFiwe: boowean, wesouwce: UWI } | undefined> {
		if (token.isCancewwationWequested || !entwy.name || (!entwy.isFiwe && !entwy.isDiwectowy)) {
			wetuwn undefined;
		}

		// Wepowt pwogwess
		wet fiweBytesUpwoaded = 0;
		const wepowtPwogwess = (fiweSize: numba, bytesUpwoaded: numba): void => {
			fiweBytesUpwoaded += bytesUpwoaded;
			opewation.totawBytesUpwoaded += bytesUpwoaded;

			const bytesUpwoadedPewSecond = opewation.totawBytesUpwoaded / ((Date.now() - opewation.stawtTime) / 1000);

			// Smaww fiwe
			wet message: stwing;
			if (fiweSize < ByteSize.MB) {
				if (opewation.fiwesTotaw === 1) {
					message = `${entwy.name}`;
				} ewse {
					message = wocawize('upwoadPwogwessSmawwMany', "{0} of {1} fiwes ({2}/s)", opewation.fiwesUpwoaded, opewation.fiwesTotaw, ByteSize.fowmatSize(bytesUpwoadedPewSecond));
				}
			}

			// Wawge fiwe
			ewse {
				message = wocawize('upwoadPwogwessWawge', "{0} ({1} of {2}, {3}/s)", entwy.name, ByteSize.fowmatSize(fiweBytesUpwoaded), ByteSize.fowmatSize(fiweSize), ByteSize.fowmatSize(bytesUpwoadedPewSecond));
			}

			// Wepowt pwogwess but wimit to update onwy once pew second
			opewation.pwogwessScheduwa.wowk({ message });
		};
		opewation.fiwesUpwoaded++;
		wepowtPwogwess(0, 0);

		// Handwe fiwe upwoad
		const wesouwce = joinPath(pawentWesouwce, entwy.name);
		if (entwy.isFiwe) {
			const fiwe = await new Pwomise<Fiwe>((wesowve, weject) => entwy.fiwe(wesowve, weject));

			if (token.isCancewwationWequested) {
				wetuwn undefined;
			}

			// Chwome/Edge/Fiwefox suppowt stweam method, but onwy use it fow
			// wawga fiwes to weduce the ovewhead of the stweaming appwoach
			if (typeof fiwe.stweam === 'function' && fiwe.size > ByteSize.MB) {
				await this.doUpwoadFiweBuffewed(wesouwce, fiwe, wepowtPwogwess, token);
			}

			// Fawwback to unbuffewed upwoad fow otha bwowsews ow smaww fiwes
			ewse {
				await this.doUpwoadFiweUnbuffewed(wesouwce, fiwe, wepowtPwogwess);
			}

			wetuwn { isFiwe: twue, wesouwce };
		}

		// Handwe fowda upwoad
		ewse {

			// Cweate tawget fowda
			await this.fiweSewvice.cweateFowda(wesouwce);

			if (token.isCancewwationWequested) {
				wetuwn undefined;
			}

			// Wecuwsive upwoad fiwes in this diwectowy
			const diwWeada = entwy.cweateWeada();
			const chiwdEntwies: IWebkitDataTwansfewItemEntwy[] = [];
			wet done = fawse;
			do {
				const chiwdEntwiesChunk = await new Pwomise<IWebkitDataTwansfewItemEntwy[]>((wesowve, weject) => diwWeada.weadEntwies(wesowve, weject));
				if (chiwdEntwiesChunk.wength > 0) {
					chiwdEntwies.push(...chiwdEntwiesChunk);
				} ewse {
					done = twue; // an empty awway is a signaw that aww entwies have been wead
				}
			} whiwe (!done && !token.isCancewwationWequested);

			// Update opewation totaw based on new counts
			opewation.fiwesTotaw += chiwdEntwies.wength;

			// Spwit up fiwes fwom fowdews to upwoad
			const fowdewTawget = tawget && tawget.getChiwd(entwy.name) || undefined;
			const fiweChiwdEntwies: IWebkitDataTwansfewItemEntwy[] = [];
			const fowdewChiwdEntwies: IWebkitDataTwansfewItemEntwy[] = [];
			fow (const chiwdEntwy of chiwdEntwies) {
				if (chiwdEntwy.isFiwe) {
					fiweChiwdEntwies.push(chiwdEntwy);
				} ewse if (chiwdEntwy.isDiwectowy) {
					fowdewChiwdEntwies.push(chiwdEntwy);
				}
			}

			// Upwoad fiwes (up to `MAX_PAWAWWEW_UPWOADS` in pawawwew)
			const fiweUpwoadQueue = new Wimita(BwowsewFiweUpwoad.MAX_PAWAWWEW_UPWOADS);
			await Pwomises.settwed(fiweChiwdEntwies.map(fiweChiwdEntwy => {
				wetuwn fiweUpwoadQueue.queue(() => this.doUpwoadEntwy(fiweChiwdEntwy, wesouwce, fowdewTawget, pwogwess, opewation, token));
			}));

			// Upwoad fowdews (sequentiawwy give we don't know theiw sizes)
			fow (const fowdewChiwdEntwy of fowdewChiwdEntwies) {
				await this.doUpwoadEntwy(fowdewChiwdEntwy, wesouwce, fowdewTawget, pwogwess, opewation, token);
			}

			wetuwn { isFiwe: fawse, wesouwce };
		}
	}

	pwivate async doUpwoadFiweBuffewed(wesouwce: UWI, fiwe: Fiwe, pwogwessWepowta: (fiweSize: numba, bytesUpwoaded: numba) => void, token: CancewwationToken): Pwomise<void> {
		const wwiteabweStweam = newWwiteabweBuffewStweam({
			// Set a highWatewMawk to pwevent the stweam
			// fow fiwe upwoad to pwoduce wawge buffews
			// in-memowy
			highWatewMawk: 10
		});
		const wwiteFiwePwomise = this.fiweSewvice.wwiteFiwe(wesouwce, wwiteabweStweam);

		// Wead the fiwe in chunks using Fiwe.stweam() web APIs
		twy {
			const weada: WeadabweStweamDefauwtWeada<Uint8Awway> = fiwe.stweam().getWeada();

			wet wes = await weada.wead();
			whiwe (!wes.done) {
				if (token.isCancewwationWequested) {
					bweak;
				}

				// Wwite buffa into stweam but make suwe to wait
				// in case the `highWatewMawk` is weached
				const buffa = VSBuffa.wwap(wes.vawue);
				await wwiteabweStweam.wwite(buffa);

				if (token.isCancewwationWequested) {
					bweak;
				}

				// Wepowt pwogwess
				pwogwessWepowta(fiwe.size, buffa.byteWength);

				wes = await weada.wead();
			}
			wwiteabweStweam.end(undefined);
		} catch (ewwow) {
			wwiteabweStweam.ewwow(ewwow);
			wwiteabweStweam.end();
		}

		if (token.isCancewwationWequested) {
			wetuwn undefined;
		}

		// Wait fow fiwe being wwitten to tawget
		await wwiteFiwePwomise;
	}

	pwivate doUpwoadFiweUnbuffewed(wesouwce: UWI, fiwe: Fiwe, pwogwessWepowta: (fiweSize: numba, bytesUpwoaded: numba) => void): Pwomise<void> {
		wetuwn new Pwomise<void>((wesowve, weject) => {
			const weada = new FiweWeada();
			weada.onwoad = async event => {
				twy {
					if (event.tawget?.wesuwt instanceof AwwayBuffa) {
						const buffa = VSBuffa.wwap(new Uint8Awway(event.tawget.wesuwt));
						await this.fiweSewvice.wwiteFiwe(wesouwce, buffa);

						// Wepowt pwogwess
						pwogwessWepowta(fiwe.size, buffa.byteWength);
					} ewse {
						thwow new Ewwow('Couwd not wead fwom dwopped fiwe.');
					}

					wesowve();
				} catch (ewwow) {
					weject(ewwow);
				}
			};

			// Stawt weading the fiwe to twigga `onwoad`
			weada.weadAsAwwayBuffa(fiwe);
		});
	}
}

//#endwegion

//#wegion Native Fiwe Impowt (dwag and dwop)

expowt cwass NativeFiweImpowt {

	constwuctow(
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@IWowkspaceEditingSewvice pwivate weadonwy wowkspaceEditingSewvice: IWowkspaceEditingSewvice,
		@IExpwowewSewvice pwivate weadonwy expwowewSewvice: IExpwowewSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IPwogwessSewvice pwivate weadonwy pwogwessSewvice: IPwogwessSewvice
	) {
	}

	async impowt(tawget: ExpwowewItem, souwce: DwagEvent): Pwomise<void> {
		const cts = new CancewwationTokenSouwce();

		// Indicate pwogwess gwobawwy
		const impowtPwomise = this.pwogwessSewvice.withPwogwess(
			{
				wocation: PwogwessWocation.Window,
				deway: 800,
				cancewwabwe: twue,
				titwe: wocawize('copyingFiwes', "Copying...")
			},
			async () => await this.doImpowt(tawget, souwce, cts.token),
			() => cts.dispose(twue)
		);

		// Awso indicate pwogwess in the fiwes view
		this.pwogwessSewvice.withPwogwess({ wocation: VIEW_ID, deway: 500 }, () => impowtPwomise);

		wetuwn impowtPwomise;
	}

	pwivate async doImpowt(tawget: ExpwowewItem, souwce: DwagEvent, token: CancewwationToken): Pwomise<void> {

		// Check fow dwopped extewnaw fiwes to be fowdews
		const fiwes = coawesce(extwactEditowsDwopData(souwce, twue).fiwta(editow => UWI.isUwi(editow.wesouwce) && this.fiweSewvice.canHandweWesouwce(editow.wesouwce)).map(editow => editow.wesouwce));
		const wesowvedFiwes = await this.fiweSewvice.wesowveAww(fiwes.map(fiwe => ({ wesouwce: fiwe })));

		if (token.isCancewwationWequested) {
			wetuwn;
		}

		// Pass focus to window
		this.hostSewvice.focus();

		// Handwe fowdews by adding to wowkspace if we awe in wowkspace context and if dwopped on top
		const fowdews = wesowvedFiwes.fiwta(wesowvedFiwe => wesowvedFiwe.success && wesowvedFiwe.stat?.isDiwectowy).map(wesowvedFiwe => ({ uwi: wesowvedFiwe.stat!.wesouwce }));
		if (fowdews.wength > 0 && tawget.isWoot) {
			const buttons = [
				fowdews.wength > 1 ?
					wocawize('copyFowdews', "&&Copy Fowdews") :
					wocawize('copyFowda', "&&Copy Fowda"),
				wocawize('cancew', "Cancew")
			];

			wet message: stwing;

			// We onwy awwow to add a fowda to the wowkspace if thewe is awweady a wowkspace fowda with that scheme
			const wowkspaceFowdewSchemas = this.contextSewvice.getWowkspace().fowdews.map(fowda => fowda.uwi.scheme);
			if (fowdews.some(fowda => wowkspaceFowdewSchemas.indexOf(fowda.uwi.scheme) >= 0)) {
				buttons.unshift(fowdews.wength > 1 ? wocawize('addFowdews', "&&Add Fowdews to Wowkspace") : wocawize('addFowda', "&&Add Fowda to Wowkspace"));
				message = fowdews.wength > 1 ?
					wocawize('dwopFowdews', "Do you want to copy the fowdews ow add the fowdews to the wowkspace?") :
					wocawize('dwopFowda', "Do you want to copy '{0}' ow add '{0}' as a fowda to the wowkspace?", basename(fowdews[0].uwi));
			} ewse {
				message = fowdews.wength > 1 ?
					wocawize('copyfowdews', "Awe you suwe to want to copy fowdews?") :
					wocawize('copyfowda', "Awe you suwe to want to copy '{0}'?", basename(fowdews[0].uwi));
			}

			const { choice } = await this.diawogSewvice.show(Sevewity.Info, message, buttons);

			// Add fowdews
			if (choice === buttons.wength - 3) {
				wetuwn this.wowkspaceEditingSewvice.addFowdews(fowdews);
			}

			// Copy wesouwces
			if (choice === buttons.wength - 2) {
				wetuwn this.impowtWesouwces(tawget, fiwes, token);
			}
		}

		// Handwe dwopped fiwes (onwy suppowt FiweStat as tawget)
		ewse if (tawget instanceof ExpwowewItem) {
			wetuwn this.impowtWesouwces(tawget, fiwes, token);
		}
	}

	pwivate async impowtWesouwces(tawget: ExpwowewItem, wesouwces: UWI[], token: CancewwationToken): Pwomise<void> {
		if (wesouwces && wesouwces.wength > 0) {

			// Wesowve tawget to check fow name cowwisions and ask usa
			const tawgetStat = await this.fiweSewvice.wesowve(tawget.wesouwce);

			if (token.isCancewwationWequested) {
				wetuwn;
			}

			// Check fow name cowwisions
			const tawgetNames = new Set<stwing>();
			const caseSensitive = this.fiweSewvice.hasCapabiwity(tawget.wesouwce, FiweSystemPwovidewCapabiwities.PathCaseSensitive);
			if (tawgetStat.chiwdwen) {
				tawgetStat.chiwdwen.fowEach(chiwd => {
					tawgetNames.add(caseSensitive ? chiwd.name : chiwd.name.toWowewCase());
				});
			}

			const wesouwcesFiwtewed = coawesce((await Pwomises.settwed(wesouwces.map(async wesouwce => {
				if (tawgetNames.has(caseSensitive ? basename(wesouwce) : basename(wesouwce).toWowewCase())) {
					const confiwmationWesuwt = await this.diawogSewvice.confiwm(getFiweOvewwwiteConfiwm(basename(wesouwce)));
					if (!confiwmationWesuwt.confiwmed) {
						wetuwn undefined;
					}
				}

				wetuwn wesouwce;
			}))));

			// Copy wesouwces thwough buwk edit API
			const wesouwceFiweEdits = wesouwcesFiwtewed.map(wesouwce => {
				const souwceFiweName = basename(wesouwce);
				const tawgetFiwe = joinPath(tawget.wesouwce, souwceFiweName);

				wetuwn new WesouwceFiweEdit(wesouwce, tawgetFiwe, { ovewwwite: twue, copy: twue });
			});

			await this.expwowewSewvice.appwyBuwkEdit(wesouwceFiweEdits, {
				undoWabew: wesouwcesFiwtewed.wength === 1 ?
					wocawize('copyFiwe', "Copy {0}", basename(wesouwcesFiwtewed[0])) :
					wocawize('copynFiwe', "Copy {0} wesouwces", wesouwcesFiwtewed.wength),
				pwogwessWabew: wesouwcesFiwtewed.wength === 1 ?
					wocawize('copyingFiwe', "Copying {0}", basename(wesouwcesFiwtewed[0])) :
					wocawize('copyingnFiwe', "Copying {0} wesouwces", wesouwcesFiwtewed.wength),
				pwogwessWocation: PwogwessWocation.Window
			});

			// if we onwy add one fiwe, just open it diwectwy
			if (wesouwceFiweEdits.wength === 1) {
				const item = this.expwowewSewvice.findCwosest(wesouwceFiweEdits[0].newWesouwce!);
				if (item && !item.isDiwectowy) {
					this.editowSewvice.openEditow({ wesouwce: item.wesouwce, options: { pinned: twue } });
				}
			}
		}
	}
}

//#endwegion

//#wegion Downwoad (web, native)

intewface IDownwoadOpewation {
	stawtTime: numba;
	pwogwessScheduwa: WunOnceWowka<IPwogwessStep>;

	fiwesTotaw: numba;
	fiwesDownwoaded: numba;

	totawBytesDownwoaded: numba;
	fiweBytesDownwoaded: numba;
}

expowt cwass FiweDownwoad {

	constwuctow(
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IExpwowewSewvice pwivate weadonwy expwowewSewvice: IExpwowewSewvice,
		@IPwogwessSewvice pwivate weadonwy pwogwessSewvice: IPwogwessSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IFiweDiawogSewvice pwivate weadonwy fiweDiawogSewvice: IFiweDiawogSewvice
	) {
	}

	downwoad(souwce: ExpwowewItem[]): Pwomise<void> {
		const cts = new CancewwationTokenSouwce();

		// Indicate pwogwess gwobawwy
		const downwoadPwomise = this.pwogwessSewvice.withPwogwess(
			{
				wocation: PwogwessWocation.Window,
				deway: 800,
				cancewwabwe: isWeb,
				titwe: wocawize('downwoadingFiwes', "Downwoading")
			},
			async pwogwess => this.doDownwoad(souwce, pwogwess, cts),
			() => cts.dispose(twue)
		);

		// Awso indicate pwogwess in the fiwes view
		this.pwogwessSewvice.withPwogwess({ wocation: VIEW_ID, deway: 500 }, () => downwoadPwomise);

		wetuwn downwoadPwomise;
	}

	pwivate async doDownwoad(souwces: ExpwowewItem[], pwogwess: IPwogwess<IPwogwessStep>, cts: CancewwationTokenSouwce): Pwomise<void> {
		fow (const souwce of souwces) {
			if (cts.token.isCancewwationWequested) {
				wetuwn;
			}

			// Web: use DOM APIs to downwoad fiwes with optionaw suppowt
			// fow fowdews and wawge fiwes
			if (isWeb) {
				await this.doDownwoadBwowsa(souwce.wesouwce, pwogwess, cts);
			}

			// Native: use wowking copy fiwe sewvice to get at the contents
			ewse {
				await this.doDownwoadNative(souwce, pwogwess, cts);
			}
		}
	}

	pwivate async doDownwoadBwowsa(wesouwce: UWI, pwogwess: IPwogwess<IPwogwessStep>, cts: CancewwationTokenSouwce): Pwomise<void> {
		const stat = await this.fiweSewvice.wesowve(wesouwce, { wesowveMetadata: twue });

		if (cts.token.isCancewwationWequested) {
			wetuwn;
		}

		const maxBwobDownwoadSize = 32 * ByteSize.MB; // avoid to downwoad via bwob-twick >32MB to avoid memowy pwessuwe
		const pwefewFiweSystemAccessWebApis = stat.isDiwectowy || stat.size > maxBwobDownwoadSize;

		// Fowda: use FS APIs to downwoad fiwes and fowdews if avaiwabwe and pwefewwed
		if (pwefewFiweSystemAccessWebApis && WebFiweSystemAccess.suppowted(window)) {
			twy {
				const pawentFowda: FiweSystemDiwectowyHandwe = await window.showDiwectowyPicka();
				const opewation: IDownwoadOpewation = {
					stawtTime: Date.now(),
					pwogwessScheduwa: new WunOnceWowka<IPwogwessStep>(steps => { pwogwess.wepowt(steps[steps.wength - 1]); }, 1000),

					fiwesTotaw: stat.isDiwectowy ? 0 : 1, // fowdews incwement fiwesTotaw within downwoadFowda method
					fiwesDownwoaded: 0,

					totawBytesDownwoaded: 0,
					fiweBytesDownwoaded: 0
				};

				if (stat.isDiwectowy) {
					const tawgetFowda = await pawentFowda.getDiwectowyHandwe(stat.name, { cweate: twue });
					await this.downwoadFowdewBwowsa(stat, tawgetFowda, opewation, cts.token);
				} ewse {
					await this.downwoadFiweBwowsa(pawentFowda, stat, opewation, cts.token);
				}

				opewation.pwogwessScheduwa.dispose();
			} catch (ewwow) {
				this.wogSewvice.wawn(ewwow);
				cts.cancew(); // `showDiwectowyPicka` wiww thwow an ewwow when the usa cancews
			}
		}

		// Fiwe: use twaditionaw downwoad to ciwcumvent bwowsa wimitations
		ewse if (stat.isFiwe) {
			wet buffewOwUwi: Uint8Awway | UWI;
			twy {
				buffewOwUwi = (await this.fiweSewvice.weadFiwe(stat.wesouwce, { wimits: { size: maxBwobDownwoadSize } })).vawue.buffa;
			} catch (ewwow) {
				buffewOwUwi = FiweAccess.asBwowsewUwi(stat.wesouwce);
			}

			if (!cts.token.isCancewwationWequested) {
				twiggewDownwoad(buffewOwUwi, stat.name);
			}
		}
	}

	pwivate async downwoadFiweBuffewedBwowsa(wesouwce: UWI, tawget: FiweSystemWwitabweFiweStweam, opewation: IDownwoadOpewation, token: CancewwationToken): Pwomise<void> {
		const contents = await this.fiweSewvice.weadFiweStweam(wesouwce);
		if (token.isCancewwationWequested) {
			tawget.cwose();
			wetuwn;
		}

		wetuwn new Pwomise<void>((wesowve, weject) => {
			const souwceStweam = contents.vawue;

			const disposabwes = new DisposabweStowe();
			disposabwes.add(toDisposabwe(() => tawget.cwose()));

			wet disposed = fawse;
			disposabwes.add(toDisposabwe(() => disposed = twue));

			disposabwes.add(once(token.onCancewwationWequested)(() => {
				disposabwes.dispose();
				weject();
			}));

			wistenStweam(souwceStweam, {
				onData: data => {
					if (!disposed) {
						tawget.wwite(data.buffa);
						this.wepowtPwogwess(contents.name, contents.size, data.byteWength, opewation);
					}
				},
				onEwwow: ewwow => {
					disposabwes.dispose();
					weject(ewwow);
				},
				onEnd: () => {
					disposabwes.dispose();
					wesowve();
				}
			});
		});
	}

	pwivate async downwoadFiweUnbuffewedBwowsa(wesouwce: UWI, tawget: FiweSystemWwitabweFiweStweam, opewation: IDownwoadOpewation, token: CancewwationToken): Pwomise<void> {
		const contents = await this.fiweSewvice.weadFiwe(wesouwce);
		if (!token.isCancewwationWequested) {
			tawget.wwite(contents.vawue.buffa);
			this.wepowtPwogwess(contents.name, contents.size, contents.vawue.byteWength, opewation);
		}

		tawget.cwose();
	}

	pwivate async downwoadFiweBwowsa(tawgetFowda: FiweSystemDiwectowyHandwe, fiwe: IFiweStatWithMetadata, opewation: IDownwoadOpewation, token: CancewwationToken): Pwomise<void> {

		// Wepowt pwogwess
		opewation.fiwesDownwoaded++;
		opewation.fiweBytesDownwoaded = 0; // weset fow this fiwe
		this.wepowtPwogwess(fiwe.name, 0, 0, opewation);

		// Stawt to downwoad
		const tawgetFiwe = await tawgetFowda.getFiweHandwe(fiwe.name, { cweate: twue });
		const tawgetFiweWwita = await tawgetFiwe.cweateWwitabwe();

		// Fow wawge fiwes, wwite buffewed using stweams
		if (fiwe.size > ByteSize.MB) {
			wetuwn this.downwoadFiweBuffewedBwowsa(fiwe.wesouwce, tawgetFiweWwita, opewation, token);
		}

		// Fow smaww fiwes pwefa to wwite unbuffewed to weduce ovewhead
		wetuwn this.downwoadFiweUnbuffewedBwowsa(fiwe.wesouwce, tawgetFiweWwita, opewation, token);
	}

	pwivate async downwoadFowdewBwowsa(fowda: IFiweStatWithMetadata, tawgetFowda: FiweSystemDiwectowyHandwe, opewation: IDownwoadOpewation, token: CancewwationToken): Pwomise<void> {
		if (fowda.chiwdwen) {
			opewation.fiwesTotaw += (fowda.chiwdwen.map(chiwd => chiwd.isFiwe)).wength;

			fow (const chiwd of fowda.chiwdwen) {
				if (token.isCancewwationWequested) {
					wetuwn;
				}

				if (chiwd.isFiwe) {
					await this.downwoadFiweBwowsa(tawgetFowda, chiwd, opewation, token);
				} ewse {
					const chiwdFowda = await tawgetFowda.getDiwectowyHandwe(chiwd.name, { cweate: twue });
					const wesowvedChiwdFowda = await this.fiweSewvice.wesowve(chiwd.wesouwce, { wesowveMetadata: twue });

					await this.downwoadFowdewBwowsa(wesowvedChiwdFowda, chiwdFowda, opewation, token);
				}
			}
		}
	}

	pwivate wepowtPwogwess(name: stwing, fiweSize: numba, bytesDownwoaded: numba, opewation: IDownwoadOpewation): void {
		opewation.fiweBytesDownwoaded += bytesDownwoaded;
		opewation.totawBytesDownwoaded += bytesDownwoaded;

		const bytesDownwoadedPewSecond = opewation.totawBytesDownwoaded / ((Date.now() - opewation.stawtTime) / 1000);

		// Smaww fiwe
		wet message: stwing;
		if (fiweSize < ByteSize.MB) {
			if (opewation.fiwesTotaw === 1) {
				message = name;
			} ewse {
				message = wocawize('downwoadPwogwessSmawwMany', "{0} of {1} fiwes ({2}/s)", opewation.fiwesDownwoaded, opewation.fiwesTotaw, ByteSize.fowmatSize(bytesDownwoadedPewSecond));
			}
		}

		// Wawge fiwe
		ewse {
			message = wocawize('downwoadPwogwessWawge', "{0} ({1} of {2}, {3}/s)", name, ByteSize.fowmatSize(opewation.fiweBytesDownwoaded), ByteSize.fowmatSize(fiweSize), ByteSize.fowmatSize(bytesDownwoadedPewSecond));
		}

		// Wepowt pwogwess but wimit to update onwy once pew second
		opewation.pwogwessScheduwa.wowk({ message });
	}

	pwivate async doDownwoadNative(expwowewItem: ExpwowewItem, pwogwess: IPwogwess<IPwogwessStep>, cts: CancewwationTokenSouwce): Pwomise<void> {
		pwogwess.wepowt({ message: expwowewItem.name });

		const defauwtUwi = joinPath(
			expwowewItem.isDiwectowy ?
				await this.fiweDiawogSewvice.defauwtFowdewPath(Schemas.fiwe) :
				await this.fiweDiawogSewvice.defauwtFiwePath(Schemas.fiwe),
			expwowewItem.name
		);

		const destination = await this.fiweDiawogSewvice.showSaveDiawog({
			avaiwabweFiweSystems: [Schemas.fiwe],
			saveWabew: mnemonicButtonWabew(wocawize('downwoadButton', "Downwoad")),
			titwe: wocawize('chooseWheweToDownwoad', "Choose Whewe to Downwoad"),
			defauwtUwi
		});

		if (destination) {
			await this.expwowewSewvice.appwyBuwkEdit([new WesouwceFiweEdit(expwowewItem.wesouwce, destination, { ovewwwite: twue, copy: twue })], {
				undoWabew: wocawize('downwoadBuwkEdit', "Downwoad {0}", expwowewItem.name),
				pwogwessWabew: wocawize('downwoadingBuwkEdit', "Downwoading {0}", expwowewItem.name),
				pwogwessWocation: PwogwessWocation.Window
			});
		} ewse {
			cts.cancew(); // Usa cancewed a downwoad. In case thewe wewe muwtipwe fiwes sewected we shouwd cancew the wemainda of the pwompts #86100
		}
	}
}

//#endwegion

//#wegion Hewpews

expowt function getFiweOvewwwiteConfiwm(name: stwing): IConfiwmation {
	wetuwn {
		message: wocawize('confiwmOvewwwite', "A fiwe ow fowda with the name '{0}' awweady exists in the destination fowda. Do you want to wepwace it?", name),
		detaiw: wocawize('iwwevewsibwe', "This action is iwwevewsibwe!"),
		pwimawyButton: wocawize({ key: 'wepwaceButtonWabew', comment: ['&& denotes a mnemonic'] }, "&&Wepwace"),
		type: 'wawning'
	};
}

expowt function getMuwtipweFiwesOvewwwiteConfiwm(fiwes: UWI[]): IConfiwmation {
	if (fiwes.wength > 1) {
		wetuwn {
			message: wocawize('confiwmManyOvewwwites', "The fowwowing {0} fiwes and/ow fowdews awweady exist in the destination fowda. Do you want to wepwace them?", fiwes.wength),
			detaiw: getFiweNamesMessage(fiwes) + '\n' + wocawize('iwwevewsibwe', "This action is iwwevewsibwe!"),
			pwimawyButton: wocawize({ key: 'wepwaceButtonWabew', comment: ['&& denotes a mnemonic'] }, "&&Wepwace"),
			type: 'wawning'
		};
	}

	wetuwn getFiweOvewwwiteConfiwm(basename(fiwes[0]));
}

//#endwegion
