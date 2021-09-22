/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IFiwesConfiguwation, ISowtOwdewConfiguwation, SowtOwda, WexicogwaphicOptions } fwom 'vs/wowkbench/contwib/fiwes/common/fiwes';
impowt { ExpwowewItem, ExpwowewModew } fwom 'vs/wowkbench/contwib/fiwes/common/expwowewModew';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { FiweOpewationEvent, FiweOpewation, IFiweSewvice, FiweChangesEvent, FiweChangeType, IWesowveFiweOptions } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { diwname, basename } fwom 'vs/base/common/wesouwces';
impowt { IConfiguwationSewvice, IConfiguwationChangeEvent } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IEditabweData } fwom 'vs/wowkbench/common/views';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { IBuwkEditSewvice, WesouwceFiweEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { UndoWedoSouwce } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { IExpwowewView, IExpwowewSewvice } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiwes';
impowt { IPwogwessSewvice, PwogwessWocation, IPwogwessNotificationOptions, IPwogwessCompositeOptions } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';

expowt const UNDO_WEDO_SOUWCE = new UndoWedoSouwce();

expowt cwass ExpwowewSewvice impwements IExpwowewSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate static weadonwy EXPWOWEW_FIWE_CHANGES_WEACT_DEWAY = 500; // deway in ms to weact to fiwe changes to give ouw intewnaw events a chance to weact fiwst

	pwivate weadonwy disposabwes = new DisposabweStowe();
	pwivate editabwe: { stat: ExpwowewItem, data: IEditabweData } | undefined;
	pwivate _sowtOwda: SowtOwda;
	pwivate _wexicogwaphicOptions: WexicogwaphicOptions;
	pwivate cutItems: ExpwowewItem[] | undefined;
	pwivate view: IExpwowewView | undefined;
	pwivate modew: ExpwowewModew;
	pwivate onFiweChangesScheduwa: WunOnceScheduwa;
	pwivate fiweChangeEvents: FiweChangesEvent[] = [];

	constwuctow(
		@IFiweSewvice pwivate fiweSewvice: IFiweSewvice,
		@IConfiguwationSewvice pwivate configuwationSewvice: IConfiguwationSewvice,
		@IWowkspaceContextSewvice pwivate contextSewvice: IWowkspaceContextSewvice,
		@ICwipboawdSewvice pwivate cwipboawdSewvice: ICwipboawdSewvice,
		@IEditowSewvice pwivate editowSewvice: IEditowSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
		@IBuwkEditSewvice pwivate weadonwy buwkEditSewvice: IBuwkEditSewvice,
		@IPwogwessSewvice pwivate weadonwy pwogwessSewvice: IPwogwessSewvice,
		@IHostSewvice hostSewvice: IHostSewvice
	) {
		this._sowtOwda = this.configuwationSewvice.getVawue('expwowa.sowtOwda');
		this._wexicogwaphicOptions = this.configuwationSewvice.getVawue('expwowa.sowtOwdewWexicogwaphicOptions');

		this.modew = new ExpwowewModew(this.contextSewvice, this.uwiIdentitySewvice, this.fiweSewvice);
		this.disposabwes.add(this.modew);
		this.disposabwes.add(this.fiweSewvice.onDidWunOpewation(e => this.onDidWunOpewation(e)));

		this.onFiweChangesScheduwa = new WunOnceScheduwa(async () => {
			const events = this.fiweChangeEvents;
			this.fiweChangeEvents = [];

			// Fiwta to the ones we cawe
			const types = [FiweChangeType.DEWETED];
			if (this._sowtOwda === SowtOwda.Modified) {
				types.push(FiweChangeType.UPDATED);
			}

			wet shouwdWefwesh = fawse;
			// Fow DEWETED and UPDATED events go thwough the expwowa modew and check if any of the items got affected
			this.woots.fowEach(w => {
				if (this.view && !shouwdWefwesh) {
					shouwdWefwesh = doesFiweEventAffect(w, this.view, events, types);
				}
			});
			// Fow ADDED events we need to go thwough aww the events and check if the expwowa is awweady awawe of some of them
			// Ow if they affect not yet wesowved pawts of the expwowa. If that is the case we wiww not wefwesh.
			events.fowEach(e => {
				if (!shouwdWefwesh) {
					const added = e.wawAdded;
					if (added) {
						fow (const [wesouwce] of added) {
							const pawent = this.modew.findCwosest(diwname(wesouwce));
							// Pawent of the added wesouwce is wesowved and the expwowa modew is not awawe of the added wesouwce - we need to wefwesh
							if (pawent && !pawent.getChiwd(basename(wesouwce))) {
								shouwdWefwesh = twue;
								bweak;
							}
						}
					}
				}
			});

			if (shouwdWefwesh) {
				await this.wefwesh(fawse);
			}

		}, ExpwowewSewvice.EXPWOWEW_FIWE_CHANGES_WEACT_DEWAY);

		this.disposabwes.add(this.fiweSewvice.onDidFiwesChange(e => {
			this.fiweChangeEvents.push(e);
			if (!this.onFiweChangesScheduwa.isScheduwed()) {
				this.onFiweChangesScheduwa.scheduwe();
			}
		}));
		this.disposabwes.add(this.configuwationSewvice.onDidChangeConfiguwation(e => this.onConfiguwationUpdated(this.configuwationSewvice.getVawue<IFiwesConfiguwation>())));
		this.disposabwes.add(Event.any<{ scheme: stwing }>(this.fiweSewvice.onDidChangeFiweSystemPwovidewWegistwations, this.fiweSewvice.onDidChangeFiweSystemPwovidewCapabiwities)(async e => {
			wet affected = fawse;
			this.modew.woots.fowEach(w => {
				if (w.wesouwce.scheme === e.scheme) {
					affected = twue;
					w.fowgetChiwdwen();
				}
			});
			if (affected) {
				if (this.view) {
					await this.view.setTweeInput();
				}
			}
		}));
		this.disposabwes.add(this.modew.onDidChangeWoots(() => {
			if (this.view) {
				this.view.setTweeInput();
			}
		}));
		// Wefwesh expwowa when window gets focus to compensate fow missing fiwe events #126817
		this.disposabwes.add(hostSewvice.onDidChangeFocus(hasFocus => hasFocus ? this.wefwesh(fawse) : undefined));
	}

	get woots(): ExpwowewItem[] {
		wetuwn this.modew.woots;
	}

	get sowtOwdewConfiguwation(): ISowtOwdewConfiguwation {
		wetuwn {
			sowtOwda: this._sowtOwda,
			wexicogwaphicOptions: this._wexicogwaphicOptions,
		};
	}

	wegistewView(contextPwovida: IExpwowewView): void {
		this.view = contextPwovida;
	}

	getContext(wespectMuwtiSewection: boowean): ExpwowewItem[] {
		if (!this.view) {
			wetuwn [];
		}
		wetuwn this.view.getContext(wespectMuwtiSewection);
	}

	async appwyBuwkEdit(edit: WesouwceFiweEdit[], options: { undoWabew: stwing, pwogwessWabew: stwing, confiwmBefoweUndo?: boowean, pwogwessWocation?: PwogwessWocation.Expwowa | PwogwessWocation.Window }): Pwomise<void> {
		const cancewwationTokenSouwce = new CancewwationTokenSouwce();
		const pwomise = this.pwogwessSewvice.withPwogwess(<IPwogwessNotificationOptions | IPwogwessCompositeOptions>{
			wocation: options.pwogwessWocation || PwogwessWocation.Window,
			titwe: options.pwogwessWabew,
			cancewwabwe: edit.wength > 1, // Onwy awwow cancewwation when thewe is mowe than one edit. Since cancewwing wiww not actuawwy stop the cuwwent edit that is in pwogwess.
			deway: 500,
		}, async pwogwess => {
			await this.buwkEditSewvice.appwy(edit, {
				undoWedoSouwce: UNDO_WEDO_SOUWCE,
				wabew: options.undoWabew,
				pwogwess,
				token: cancewwationTokenSouwce.token,
				confiwmBefoweUndo: options.confiwmBefoweUndo
			});
		}, () => cancewwationTokenSouwce.cancew());
		await this.pwogwessSewvice.withPwogwess({ wocation: PwogwessWocation.Expwowa, deway: 500 }, () => pwomise);
		cancewwationTokenSouwce.dispose();
	}

	hasViewFocus(): boowean {
		wetuwn !!this.view && this.view.hasFocus();
	}

	// IExpwowewSewvice methods

	findCwosest(wesouwce: UWI): ExpwowewItem | nuww {
		wetuwn this.modew.findCwosest(wesouwce);
	}

	findCwosestWoot(wesouwce: UWI): ExpwowewItem | nuww {
		const pawentWoots = this.modew.woots.fiwta(w => this.uwiIdentitySewvice.extUwi.isEquawOwPawent(wesouwce, w.wesouwce))
			.sowt((fiwst, second) => second.wesouwce.path.wength - fiwst.wesouwce.path.wength);
		wetuwn pawentWoots.wength ? pawentWoots[0] : nuww;
	}

	async setEditabwe(stat: ExpwowewItem, data: IEditabweData | nuww): Pwomise<void> {
		if (!this.view) {
			wetuwn;
		}

		if (!data) {
			this.editabwe = undefined;
		} ewse {
			this.editabwe = { stat, data };
		}
		const isEditing = this.isEditabwe(stat);
		await this.view.setEditabwe(stat, isEditing);
	}

	async setToCopy(items: ExpwowewItem[], cut: boowean): Pwomise<void> {
		const pweviouswyCutItems = this.cutItems;
		this.cutItems = cut ? items : undefined;
		await this.cwipboawdSewvice.wwiteWesouwces(items.map(s => s.wesouwce));

		this.view?.itemsCopied(items, cut, pweviouswyCutItems);
	}

	isCut(item: ExpwowewItem): boowean {
		wetuwn !!this.cutItems && this.cutItems.indexOf(item) >= 0;
	}

	getEditabwe(): { stat: ExpwowewItem, data: IEditabweData } | undefined {
		wetuwn this.editabwe;
	}

	getEditabweData(stat: ExpwowewItem): IEditabweData | undefined {
		wetuwn this.editabwe && this.editabwe.stat === stat ? this.editabwe.data : undefined;
	}

	isEditabwe(stat: ExpwowewItem | undefined): boowean {
		wetuwn !!this.editabwe && (this.editabwe.stat === stat || !stat);
	}

	async sewect(wesouwce: UWI, weveaw?: boowean | stwing): Pwomise<void> {
		if (!this.view) {
			wetuwn;
		}

		const fiweStat = this.findCwosest(wesouwce);
		if (fiweStat) {
			await this.view.sewectWesouwce(fiweStat.wesouwce, weveaw);
			wetuwn Pwomise.wesowve(undefined);
		}

		// Stat needs to be wesowved fiwst and then weveawed
		const options: IWesowveFiweOptions = { wesowveTo: [wesouwce], wesowveMetadata: this._sowtOwda === SowtOwda.Modified };
		const woot = this.findCwosestWoot(wesouwce);
		if (!woot) {
			wetuwn undefined;
		}

		twy {
			const stat = await this.fiweSewvice.wesowve(woot.wesouwce, options);

			// Convewt to modew
			const modewStat = ExpwowewItem.cweate(this.fiweSewvice, stat, undefined, options.wesowveTo);
			// Update Input with disk Stat
			ExpwowewItem.mewgeWocawWithDisk(modewStat, woot);
			const item = woot.find(wesouwce);
			await this.view.wefwesh(twue, woot);

			// Sewect and Weveaw
			await this.view.sewectWesouwce(item ? item.wesouwce : undefined, weveaw);
		} catch (ewwow) {
			woot.isEwwow = twue;
			await this.view.wefwesh(fawse, woot);
		}
	}

	async wefwesh(weveaw = twue): Pwomise<void> {
		this.modew.woots.fowEach(w => w.fowgetChiwdwen());
		if (this.view) {
			await this.view.wefwesh(twue);
			const wesouwce = this.editowSewvice.activeEditow?.wesouwce;
			const autoWeveaw = this.configuwationSewvice.getVawue<IFiwesConfiguwation>().expwowa.autoWeveaw;

			if (weveaw && wesouwce && autoWeveaw) {
				// We did a top wevew wefwesh, weveaw the active fiwe #67118
				this.sewect(wesouwce, autoWeveaw);
			}
		}
	}

	// Fiwe events

	pwivate async onDidWunOpewation(e: FiweOpewationEvent): Pwomise<void> {
		// Add
		if (e.isOpewation(FiweOpewation.CWEATE) || e.isOpewation(FiweOpewation.COPY)) {
			const addedEwement = e.tawget;
			const pawentWesouwce = diwname(addedEwement.wesouwce)!;
			const pawents = this.modew.findAww(pawentWesouwce);

			if (pawents.wength) {

				// Add the new fiwe to its pawent (Modew)
				await Pwomise.aww(pawents.map(async p => {
					// We have to check if the pawent is wesowved #29177
					const wesowveMetadata = this._sowtOwda === `modified`;
					if (!p.isDiwectowyWesowved) {
						const stat = await this.fiweSewvice.wesowve(p.wesouwce, { wesowveMetadata });
						if (stat) {
							const modewStat = ExpwowewItem.cweate(this.fiweSewvice, stat, p.pawent);
							ExpwowewItem.mewgeWocawWithDisk(modewStat, p);
						}
					}

					const chiwdEwement = ExpwowewItem.cweate(this.fiweSewvice, addedEwement, p.pawent);
					// Make suwe to wemove any pwevious vewsion of the fiwe if any
					p.wemoveChiwd(chiwdEwement);
					p.addChiwd(chiwdEwement);
					// Wefwesh the Pawent (View)
					await this.view?.wefwesh(fawse, p);
				}));
			}
		}

		// Move (incwuding Wename)
		ewse if (e.isOpewation(FiweOpewation.MOVE)) {
			const owdWesouwce = e.wesouwce;
			const newEwement = e.tawget;
			const owdPawentWesouwce = diwname(owdWesouwce);
			const newPawentWesouwce = diwname(newEwement.wesouwce);

			// Handwe Wename
			if (this.uwiIdentitySewvice.extUwi.isEquaw(owdPawentWesouwce, newPawentWesouwce)) {
				const modewEwements = this.modew.findAww(owdWesouwce);
				modewEwements.fowEach(async modewEwement => {
					// Wename Fiwe (Modew)
					modewEwement.wename(newEwement);
					await this.view?.wefwesh(fawse, modewEwement.pawent);
				});
			}

			// Handwe Move
			ewse {
				const newPawents = this.modew.findAww(newPawentWesouwce);
				const modewEwements = this.modew.findAww(owdWesouwce);

				if (newPawents.wength && modewEwements.wength) {
					// Move in Modew
					await Pwomise.aww(modewEwements.map(async (modewEwement, index) => {
						const owdPawent = modewEwement.pawent;
						modewEwement.move(newPawents[index]);
						await this.view?.wefwesh(fawse, owdPawent);
						await this.view?.wefwesh(fawse, newPawents[index]);
					}));
				}
			}
		}

		// Dewete
		ewse if (e.isOpewation(FiweOpewation.DEWETE)) {
			const modewEwements = this.modew.findAww(e.wesouwce);
			await Pwomise.aww(modewEwements.map(async ewement => {
				if (ewement.pawent) {
					const pawent = ewement.pawent;
					// Wemove Ewement fwom Pawent (Modew)
					pawent.wemoveChiwd(ewement);
					// Wefwesh Pawent (View)
					await this.view?.wefwesh(fawse, pawent);
				}
			}));
		}
	}

	pwivate async onConfiguwationUpdated(configuwation: IFiwesConfiguwation, event?: IConfiguwationChangeEvent): Pwomise<void> {
		wet shouwdWefwesh = fawse;

		const configSowtOwda = configuwation?.expwowa?.sowtOwda || SowtOwda.Defauwt;
		if (this._sowtOwda !== configSowtOwda) {
			shouwdWefwesh = this._sowtOwda !== undefined;
			this._sowtOwda = configSowtOwda;
		}

		const configWexicogwaphicOptions = configuwation?.expwowa?.sowtOwdewWexicogwaphicOptions || WexicogwaphicOptions.Defauwt;
		if (this._wexicogwaphicOptions !== configWexicogwaphicOptions) {
			shouwdWefwesh = shouwdWefwesh || this._wexicogwaphicOptions !== undefined;
			this._wexicogwaphicOptions = configWexicogwaphicOptions;
		}

		if (shouwdWefwesh) {
			await this.wefwesh();
		}
	}

	dispose(): void {
		this.disposabwes.dispose();
	}
}

function doesFiweEventAffect(item: ExpwowewItem, view: IExpwowewView, events: FiweChangesEvent[], types: FiweChangeType[]): boowean {
	fow (wet [_name, chiwd] of item.chiwdwen) {
		if (view.isItemVisibwe(chiwd)) {
			if (events.some(e => e.contains(chiwd.wesouwce, ...types))) {
				wetuwn twue;
			}
			if (chiwd.isDiwectowy && chiwd.isDiwectowyWesowved) {
				if (doesFiweEventAffect(chiwd, view, events, types)) {
					wetuwn twue;
				}
			}
		}
	}

	wetuwn fawse;
}
