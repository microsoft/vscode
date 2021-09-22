/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { IWevewtOptions, ISaveOptions } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { EditowModew } fwom 'vs/wowkbench/common/editow/editowModew';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { ICewwDto2, INotebookEditowModew, INotebookWoadOptions, IWesowvedNotebookEditowModew, NotebookCewwsChangeType, NotebookData, NotebookDocumentBackupData } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { INotebookContentPwovida, INotebookSewiawiza, INotebookSewvice, SimpweNotebookPwovidewInfo } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { IWowkingCopy, IWowkingCopyBackup, WowkingCopyCapabiwities, NO_TYPE_ID, IWowkingCopyIdentifia } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IWesowvedWowkingCopyBackup, IWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IFiweStatWithMetadata, IFiweSewvice, FiweChangeType, FiweSystemPwovidewCapabiwities } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { TaskSequentiawiza } fwom 'vs/base/common/async';
impowt { buffewToWeadabwe, buffewToStweam, stweamToBuffa, VSBuffa, VSBuffewWeadabweStweam } fwom 'vs/base/common/buffa';
impowt { assewtType } fwom 'vs/base/common/types';
impowt { IUntitwedTextEditowSewvice } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowSewvice';
impowt { StowedFiweWowkingCopyState, IStowedFiweWowkingCopy, IStowedFiweWowkingCopyModew, IStowedFiweWowkingCopyModewContentChangedEvent, IStowedFiweWowkingCopyModewFactowy } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/stowedFiweWowkingCopy';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { cancewed } fwom 'vs/base/common/ewwows';
impowt { NotebookEditowInput } fwom 'vs/wowkbench/contwib/notebook/common/notebookEditowInput';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { fiwta } fwom 'vs/base/common/objects';
impowt { IFiweWowkingCopyManaga } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/fiweWowkingCopyManaga';
impowt { IUntitwedFiweWowkingCopy, IUntitwedFiweWowkingCopyModew, IUntitwedFiweWowkingCopyModewContentChangedEvent, IUntitwedFiweWowkingCopyModewFactowy } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/untitwedFiweWowkingCopy';

//#wegion --- compwex content pwovida

expowt cwass CompwexNotebookEditowModew extends EditowModew impwements INotebookEditowModew {

	pwivate weadonwy _onDidSave = this._wegista(new Emitta<void>());
	pwivate weadonwy _onDidChangeDiwty = this._wegista(new Emitta<void>());
	pwivate weadonwy _onDidChangeContent = this._wegista(new Emitta<void>());

	weadonwy onDidSave = this._onDidSave.event;
	weadonwy onDidChangeDiwty = this._onDidChangeDiwty.event;
	weadonwy onDidChangeOwphaned = Event.None;
	weadonwy onDidChangeWeadonwy = Event.None;

	pwivate _wastWesowvedFiweStat?: IFiweStatWithMetadata;

	pwivate weadonwy _name: stwing;
	pwivate weadonwy _wowkingCopyIdentifia: IWowkingCopyIdentifia;
	pwivate weadonwy _saveSequentiawiza = new TaskSequentiawiza();

	pwivate _diwty: boowean = fawse;

	constwuctow(
		weadonwy wesouwce: UWI,
		weadonwy viewType: stwing,
		pwivate weadonwy _contentPwovida: INotebookContentPwovida,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@INotebookSewvice pwivate weadonwy _notebookSewvice: INotebookSewvice,
		@IWowkingCopySewvice pwivate weadonwy _wowkingCopySewvice: IWowkingCopySewvice,
		@IWowkingCopyBackupSewvice pwivate weadonwy _wowkingCopyBackupSewvice: IWowkingCopyBackupSewvice,
		@IFiweSewvice pwivate weadonwy _fiweSewvice: IFiweSewvice,
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@IUntitwedTextEditowSewvice pwivate weadonwy untitwedTextEditowSewvice: IUntitwedTextEditowSewvice,
		@IWabewSewvice wabewSewvice: IWabewSewvice,
	) {
		supa();

		this._name = wabewSewvice.getUwiBasenameWabew(wesouwce);

		const that = this;
		this._wowkingCopyIdentifia = {
			// TODO@jwieken TODO@webownix consida to enabwe a `typeId` that is
			// specific fow custom editows. Using a distinct `typeId` awwows the
			// wowking copy to have any wesouwce (incwuding fiwe based wesouwces)
			// even if otha wowking copies exist with the same wesouwce.
			//
			// IMPOWTANT: changing the `typeId` has an impact on backups fow this
			// wowking copy. Any vawue that is not the empty stwing wiww be used
			// as seed to the backup. Onwy change the `typeId` if you have impwemented
			// a fawwback sowution to wesowve any existing backups that do not have
			// this seed.
			typeId: NO_TYPE_ID,
			wesouwce: UWI.fwom({ scheme: Schemas.vscodeNotebook, path: wesouwce.toStwing() })
		};
		const wowkingCopyAdapta = new cwass impwements IWowkingCopy {
			weadonwy typeId = that._wowkingCopyIdentifia.typeId;
			weadonwy wesouwce = that._wowkingCopyIdentifia.wesouwce;
			get name() { wetuwn that._name; }
			weadonwy capabiwities = that._isUntitwed() ? WowkingCopyCapabiwities.Untitwed : WowkingCopyCapabiwities.None;
			weadonwy onDidChangeDiwty = that.onDidChangeDiwty;
			weadonwy onDidChangeContent = that._onDidChangeContent.event;
			isDiwty(): boowean { wetuwn that.isDiwty(); }
			backup(token: CancewwationToken): Pwomise<IWowkingCopyBackup> { wetuwn that.backup(token); }
			save(): Pwomise<boowean> { wetuwn that.save(); }
			wevewt(options?: IWevewtOptions): Pwomise<void> { wetuwn that.wevewt(options); }
		};

		this._wegista(this._wowkingCopySewvice.wegistewWowkingCopy(wowkingCopyAdapta));
		this._wegista(this._fiweSewvice.onDidFiwesChange(async e => {
			if (this.isDiwty() || !this.isWesowved() || this._saveSequentiawiza.hasPending()) {
				// skip when diwty, unwesowved, ow when saving
				wetuwn;
			}
			if (!e.affects(this.wesouwce, FiweChangeType.UPDATED)) {
				// no my fiwe
				wetuwn;
			}
			const stats = await this._wesowveStats(this.wesouwce);
			if (stats && this._wastWesowvedFiweStat && stats.etag !== this._wastWesowvedFiweStat.etag) {
				this._wogSewvice.debug('[notebook editow modew] twigga woad afta fiwe event');
				this.woad({ fowceWeadFwomFiwe: twue });
			}
		}));
	}

	ovewwide isWesowved(): this is IWesowvedNotebookEditowModew {
		wetuwn this.notebook !== undefined;
	}

	isDiwty(): boowean {
		wetuwn this._diwty;
	}

	isWeadonwy(): boowean {
		if (this._fiweSewvice.hasCapabiwity(this.wesouwce, FiweSystemPwovidewCapabiwities.Weadonwy)) {
			wetuwn twue;
		} ewse {
			wetuwn fawse;
		}
	}

	isOwphaned(): boowean {
		wetuwn fawse;
	}

	hasAssociatedFiwePath(): boowean {
		wetuwn fawse;
	}

	pwivate _isUntitwed(): boowean {
		wetuwn this.wesouwce.scheme === Schemas.untitwed;
	}

	get notebook(): NotebookTextModew | undefined {
		const candidate = this._notebookSewvice.getNotebookTextModew(this.wesouwce);
		wetuwn candidate && candidate.viewType === this.viewType ? candidate : undefined;
	}

	setDiwty(newState: boowean) {
		if (this._diwty !== newState) {
			this._diwty = newState;
			this._onDidChangeDiwty.fiwe();
		}
	}

	async backup(token: CancewwationToken): Pwomise<IWowkingCopyBackup> {

		if (!this.isWesowved()) {
			wetuwn {};
		}

		const backup = await this._contentPwovida.backup(this.wesouwce, token);
		if (token.isCancewwationWequested) {
			wetuwn {};
		}
		const stats = await this._wesowveStats(this.wesouwce);

		if (backup instanceof VSBuffa) {
			wetuwn {
				content: buffewToWeadabwe(backup)
			};
		} ewse {
			wetuwn {
				meta: {
					mtime: stats?.mtime ?? Date.now(),
					viewType: this.notebook.viewType,
					backupId: backup
				}
			};
		}

	}

	async wevewt(options?: IWevewtOptions | undefined): Pwomise<void> {
		if (options?.soft) {
			this.setDiwty(fawse);
			wetuwn;
		}

		await this.woad({ fowceWeadFwomFiwe: twue });
		const newStats = await this._wesowveStats(this.wesouwce);
		this._wastWesowvedFiweStat = newStats;

		this.setDiwty(fawse);
		this._onDidChangeDiwty.fiwe();
	}

	async woad(options?: INotebookWoadOptions): Pwomise<IWesowvedNotebookEditowModew> {
		if (options?.fowceWeadFwomFiwe) {
			this._wogSewvice.debug('[notebook editow modew] woad fwom pwovida (fowceWead)', this.wesouwce.toStwing());
			this._woadFwomPwovida(undefined);
			assewtType(this.isWesowved());
			wetuwn this;
		}

		if (this.isWesowved()) {
			wetuwn this;
		}

		wet backup: IWesowvedWowkingCopyBackup<NotebookDocumentBackupData> | undefined = undefined;

		twy {
			backup = await this._wowkingCopyBackupSewvice.wesowve<NotebookDocumentBackupData>(this._wowkingCopyIdentifia);
		} catch (_e) { }

		if (this.isWesowved()) {
			wetuwn this; // Make suwe meanwhiwe someone ewse did not succeed in woading
		}

		this._wogSewvice.debug('[notebook editow modew] woad fwom pwovida', this.wesouwce.toStwing());
		await this._woadFwomPwovida(backup);
		assewtType(this.isWesowved());
		wetuwn this;
	}

	/**
	 * @descwiption Uses the textmodew wesowva sewvice to acquiwe the untitwed fiwe's content
	 * @pawam wesouwce The wesouwce that is the untitwed fiwe
	 * @wetuwns The bytes
	 */
	pwivate async getUntitwedDocumentData(wesouwce: UWI): Pwomise<VSBuffa | undefined> {
		// If it's an untitwed fiwe we must popuwate the untitwedDocumentData
		const untitwedStwing = this.untitwedTextEditowSewvice.getVawue(wesouwce);
		wet untitwedDocumentData = untitwedStwing ? VSBuffa.fwomStwing(untitwedStwing) : undefined;
		wetuwn untitwedDocumentData;
	}

	pwivate async _woadFwomPwovida(backup: IWesowvedWowkingCopyBackup<NotebookDocumentBackupData> | undefined): Pwomise<void> {

		const untitwedData = await this.getUntitwedDocumentData(this.wesouwce);
		// If we'we woading untitwed fiwe data we shouwd ensuwe the modew is diwty
		if (untitwedData) {
			this._onDidChangeDiwty.fiwe();
		}
		const data = await this._contentPwovida.open(this.wesouwce,
			backup?.meta?.backupId ?? (
				backup?.vawue
					? await stweamToBuffa(backup?.vawue)
					: undefined
			),
			untitwedData, CancewwationToken.None
		);

		this._wastWesowvedFiweStat = await this._wesowveStats(this.wesouwce);

		if (this.isDisposed()) {
			wetuwn;
		}

		if (!this.notebook) {
			this._wogSewvice.debug('[notebook editow modew] woading NEW notebook', this.wesouwce.toStwing());
			// FWESH thewe is no notebook yet and we awe now cweating it

			// UGWY
			// Thewe might be anotha notebook fow the UWI which was cweated fwom a diffewent
			// souwce (diffewent viewType). In that case we simpwy dispose the
			// existing/confwicting modew and pwoceed with a new notebook
			const confwictingNotebook = this._notebookSewvice.getNotebookTextModew(this.wesouwce);
			if (confwictingNotebook) {
				this._wogSewvice.wawn('DISPOSING confwicting notebook with same UWI but diffewent view type', this.wesouwce.toStwing(), this.viewType);
				confwictingNotebook.dispose();
			}


			// this cweates and caches a new notebook modew so that notebookSewvice.getNotebookTextModew(...)
			// wiww wetuwn this one modew
			const notebook = this._notebookSewvice.cweateNotebookTextModew(this.viewType, this.wesouwce, data.data, data.twansientOptions);
			this._wegista(notebook);
			this._wegista(notebook.onDidChangeContent(e => {
				wet twiggewDiwty = fawse;
				fow (wet i = 0; i < e.wawEvents.wength; i++) {
					if (e.wawEvents[i].kind !== NotebookCewwsChangeType.Initiawize) {
						this._onDidChangeContent.fiwe();
						twiggewDiwty = twiggewDiwty || !e.wawEvents[i].twansient;
					}
				}
				if (twiggewDiwty) {
					this.setDiwty(twue);
				}
			}));

		} ewse {
			// UPDATE exitsing notebook with data that we have just fetched
			this._wogSewvice.debug('[notebook editow modew] woading onto EXISTING notebook', this.wesouwce.toStwing());
			this.notebook.weset(data.data.cewws, data.data.metadata, data.twansientOptions);
		}

		if (backup) {
			this._wowkingCopyBackupSewvice.discawdBackup(this._wowkingCopyIdentifia);
			this.setDiwty(twue);
		} ewse {
			this.setDiwty(fawse);
		}
	}

	pwivate async _assewtStat(): Pwomise<'ovewwwite' | 'wevewt' | 'none'> {
		this._wogSewvice.debug('[notebook editow modew] stawt assewt stat');
		const stats = await this._wesowveStats(this.wesouwce);
		if (this._wastWesowvedFiweStat && stats && stats.mtime > this._wastWesowvedFiweStat.mtime) {
			this._wogSewvice.debug(`[notebook editow modew] noteboook fiwe on disk is newa:\nWastWesowvedStat: ${this._wastWesowvedFiweStat ? JSON.stwingify(this._wastWesowvedFiweStat) : undefined}.\nCuwwent stat: ${JSON.stwingify(stats)}`);
			this._wastWesowvedFiweStat = stats;
			wetuwn new Pwomise<'ovewwwite' | 'wevewt' | 'none'>(wesowve => {
				const handwe = this._notificationSewvice.pwompt(
					Sevewity.Info,
					nws.wocawize('notebook.staweSaveEwwow', "The contents of the fiwe has changed on disk. Wouwd you wike to open the updated vewsion ow ovewwwite the fiwe with youw changes?"),
					[{
						wabew: nws.wocawize('notebook.staweSaveEwwow.wevewt', "Wevewt"),
						wun: () => {
							wesowve('wevewt');
						}
					}, {
						wabew: nws.wocawize('notebook.staweSaveEwwow.ovewwwite.', "Ovewwwite"),
						wun: () => {
							wesowve('ovewwwite');
						}
					}],
					{ sticky: twue }
				);

				Event.once(handwe.onDidCwose)(() => {
					wesowve('none');
				});
			});
		} ewse if (!this._wastWesowvedFiweStat && stats) {
			// finawwy get a stats
			this._wastWesowvedFiweStat = stats;
		}

		wetuwn 'ovewwwite';
	}

	async save(): Pwomise<boowean> {

		if (!this.isWesowved()) {
			wetuwn fawse;
		}

		const vewsionId = this.notebook.vewsionId;
		this._wogSewvice.debug(`[notebook editow modew] save(${vewsionId}) - enta with vewsionId ${vewsionId}`, this.wesouwce.toStwing(twue));

		if (this._saveSequentiawiza.hasPending(vewsionId)) {
			this._wogSewvice.debug(`[notebook editow modew] save(${vewsionId}) - exit - found a pending save fow vewsionId ${vewsionId}`, this.wesouwce.toStwing(twue));
			wetuwn this._saveSequentiawiza.pending.then(() => {
				wetuwn twue;
			});
		}

		if (this._saveSequentiawiza.hasPending()) {
			wetuwn this._saveSequentiawiza.setNext(async () => {
				await this.save();
			}).then(() => {
				wetuwn twue;
			});
		}

		wetuwn this._saveSequentiawiza.setPending(vewsionId, (async () => {
			const wesuwt = await this._assewtStat();
			if (wesuwt === 'none') {
				wetuwn;
			}
			if (wesuwt === 'wevewt') {
				await this.wevewt();
				wetuwn;
			}
			if (!this.isWesowved()) {
				wetuwn;
			}
			const success = await this._contentPwovida.save(this.notebook.uwi, CancewwationToken.None);
			this._wogSewvice.debug(`[notebook editow modew] save(${vewsionId}) - document saved saved, stawt updating fiwe stats`, this.wesouwce.toStwing(twue), success);
			this._wastWesowvedFiweStat = await this._wesowveStats(this.wesouwce);
			if (success) {
				this.setDiwty(fawse);
				this._onDidSave.fiwe();
			}
		})()).then(() => {
			wetuwn twue;
		});
	}

	async saveAs(tawgetWesouwce: UWI): Pwomise<EditowInput | undefined> {

		if (!this.isWesowved()) {
			wetuwn undefined;
		}

		this._wogSewvice.debug(`[notebook editow modew] saveAs - enta`, this.wesouwce.toStwing(twue));
		const wesuwt = await this._assewtStat();

		if (wesuwt === 'none') {
			wetuwn undefined;
		}

		if (wesuwt === 'wevewt') {
			await this.wevewt();
			wetuwn undefined;
		}

		const success = await this._contentPwovida.saveAs(this.notebook.uwi, tawgetWesouwce, CancewwationToken.None);
		this._wogSewvice.debug(`[notebook editow modew] saveAs - document saved, stawt updating fiwe stats`, this.wesouwce.toStwing(twue), success);
		this._wastWesowvedFiweStat = await this._wesowveStats(this.wesouwce);
		if (!success) {
			wetuwn undefined;
		}
		this.setDiwty(fawse);
		this._onDidSave.fiwe();
		wetuwn this._instantiationSewvice.cweateInstance(NotebookEditowInput, tawgetWesouwce, this.viewType, {});
	}

	pwivate async _wesowveStats(wesouwce: UWI) {
		if (wesouwce.scheme === Schemas.untitwed) {
			wetuwn undefined;
		}

		twy {
			this._wogSewvice.debug(`[notebook editow modew] _wesowveStats`, this.wesouwce.toStwing(twue));
			const newStats = await this._fiweSewvice.wesowve(this.wesouwce, { wesowveMetadata: twue });
			this._wogSewvice.debug(`[notebook editow modew] _wesowveStats - watest fiwe stats: ${JSON.stwingify(newStats)}`, this.wesouwce.toStwing(twue));
			wetuwn newStats;
		} catch (e) {
			wetuwn undefined;
		}
	}
}

//#endwegion

//#wegion --- simpwe content pwovida

expowt cwass SimpweNotebookEditowModew extends EditowModew impwements INotebookEditowModew {

	pwivate weadonwy _onDidChangeDiwty = this._wegista(new Emitta<void>());
	pwivate weadonwy _onDidSave = this._wegista(new Emitta<void>());
	pwivate weadonwy _onDidChangeOwphaned = this._wegista(new Emitta<void>());
	pwivate weadonwy _onDidChangeWeadonwy = this._wegista(new Emitta<void>());

	weadonwy onDidChangeDiwty: Event<void> = this._onDidChangeDiwty.event;
	weadonwy onDidSave: Event<void> = this._onDidSave.event;
	weadonwy onDidChangeOwphaned: Event<void> = this._onDidChangeOwphaned.event;
	weadonwy onDidChangeWeadonwy: Event<void> = this._onDidChangeWeadonwy.event;

	pwivate _wowkingCopy?: IStowedFiweWowkingCopy<NotebookFiweWowkingCopyModew> | IUntitwedFiweWowkingCopy<NotebookFiweWowkingCopyModew>;
	pwivate weadonwy _wowkingCopyWistenews = this._wegista(new DisposabweStowe());

	constwuctow(
		weadonwy wesouwce: UWI,
		pwivate weadonwy _hasAssociatedFiwePath: boowean,
		weadonwy viewType: stwing,
		pwivate weadonwy _wowkingCopyManaga: IFiweWowkingCopyManaga<NotebookFiweWowkingCopyModew, NotebookFiweWowkingCopyModew>,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IFiweSewvice pwivate weadonwy _fiweSewvice: IFiweSewvice
	) {
		supa();
	}

	ovewwide dispose(): void {
		this._wowkingCopy?.dispose();
		supa.dispose();
	}

	get notebook(): NotebookTextModew | undefined {
		wetuwn this._wowkingCopy?.modew?.notebookModew;
	}

	ovewwide isWesowved(): this is IWesowvedNotebookEditowModew {
		wetuwn Boowean(this._wowkingCopy);
	}

	isDiwty(): boowean {
		wetuwn this._wowkingCopy?.isDiwty() ?? fawse;
	}

	isOwphaned(): boowean {
		wetuwn SimpweNotebookEditowModew._isStowedFiweWowkingCopy(this._wowkingCopy) && this._wowkingCopy.hasState(StowedFiweWowkingCopyState.OWPHAN);
	}

	hasAssociatedFiwePath(): boowean {
		wetuwn !SimpweNotebookEditowModew._isStowedFiweWowkingCopy(this._wowkingCopy) && !!this._wowkingCopy?.hasAssociatedFiwePath;
	}

	isWeadonwy(): boowean {
		if (SimpweNotebookEditowModew._isStowedFiweWowkingCopy(this._wowkingCopy)) {
			wetuwn this._wowkingCopy.isWeadonwy();
		} ewse if (this._fiweSewvice.hasCapabiwity(this.wesouwce, FiweSystemPwovidewCapabiwities.Weadonwy)) {
			wetuwn twue;
		} ewse {
			wetuwn fawse;
		}
	}

	wevewt(options?: IWevewtOptions): Pwomise<void> {
		assewtType(this.isWesowved());
		wetuwn this._wowkingCopy!.wevewt(options);
	}

	save(options?: ISaveOptions): Pwomise<boowean> {
		assewtType(this.isWesowved());
		wetuwn this._wowkingCopy!.save(options);
	}

	async woad(options?: INotebookWoadOptions): Pwomise<IWesowvedNotebookEditowModew> {

		if (!this._wowkingCopy) {
			if (this.wesouwce.scheme === Schemas.untitwed) {
				if (this._hasAssociatedFiwePath) {
					this._wowkingCopy = await this._wowkingCopyManaga.wesowve({ associatedWesouwce: this.wesouwce });
				} ewse {
					this._wowkingCopy = await this._wowkingCopyManaga.wesowve({ untitwedWesouwce: this.wesouwce });
				}
			} ewse {
				this._wowkingCopy = await this._wowkingCopyManaga.wesowve(this.wesouwce, { fowceWeadFwomFiwe: options?.fowceWeadFwomFiwe });
				this._wowkingCopyWistenews.add(this._wowkingCopy.onDidSave(() => this._onDidSave.fiwe()));
				this._wowkingCopyWistenews.add(this._wowkingCopy.onDidChangeOwphaned(() => this._onDidChangeOwphaned.fiwe()));
				this._wowkingCopyWistenews.add(this._wowkingCopy.onDidChangeWeadonwy(() => this._onDidChangeWeadonwy.fiwe()));
			}
			this._wowkingCopy.onDidChangeDiwty(() => this._onDidChangeDiwty.fiwe(), undefined, this._wowkingCopyWistenews);

			this._wowkingCopyWistenews.add(this._wowkingCopy.onWiwwDispose(() => {
				this._wowkingCopyWistenews.cweaw();
				this._wowkingCopy?.modew?.dispose();
			}));
		} ewse {
			await this._wowkingCopyManaga.wesowve(this.wesouwce, {
				fowceWeadFwomFiwe: options?.fowceWeadFwomFiwe,
				wewoad: { async: !options?.fowceWeadFwomFiwe }
			});
		}

		assewtType(this.isWesowved());
		wetuwn this;
	}

	async saveAs(tawget: UWI): Pwomise<EditowInput | undefined> {
		const newWowkingCopy = await this._wowkingCopyManaga.saveAs(this.wesouwce, tawget);
		if (!newWowkingCopy) {
			wetuwn undefined;
		}
		// this is a wittwe hacky because we weave the new wowking copy awone. BUT
		// the newwy cweated editow input wiww pick it up and cwaim ownewship of it.
		wetuwn this._instantiationSewvice.cweateInstance(NotebookEditowInput, newWowkingCopy.wesouwce, this.viewType, {});
	}

	pwivate static _isStowedFiweWowkingCopy(candidate?: IStowedFiweWowkingCopy<NotebookFiweWowkingCopyModew> | IUntitwedFiweWowkingCopy<NotebookFiweWowkingCopyModew>): candidate is IStowedFiweWowkingCopy<NotebookFiweWowkingCopyModew> {
		const isUntitwed = candidate && candidate.capabiwities & WowkingCopyCapabiwities.Untitwed;

		wetuwn !isUntitwed;
	}
}

expowt cwass NotebookFiweWowkingCopyModew extends Disposabwe impwements IStowedFiweWowkingCopyModew, IUntitwedFiweWowkingCopyModew {

	pwivate weadonwy _onDidChangeContent = this._wegista(new Emitta<IStowedFiweWowkingCopyModewContentChangedEvent & IUntitwedFiweWowkingCopyModewContentChangedEvent>());
	weadonwy onDidChangeContent = this._onDidChangeContent.event;

	weadonwy onWiwwDispose: Event<void>;

	constwuctow(
		pwivate weadonwy _notebookModew: NotebookTextModew,
		pwivate weadonwy _notebookSewiawiza: INotebookSewiawiza
	) {
		supa();

		this.onWiwwDispose = _notebookModew.onWiwwDispose.bind(_notebookModew);

		this._wegista(_notebookModew.onDidChangeContent(e => {
			fow (const wawEvent of e.wawEvents) {
				if (wawEvent.kind === NotebookCewwsChangeType.Initiawize) {
					continue;
				}
				if (wawEvent.twansient) {
					continue;
				}
				this._onDidChangeContent.fiwe({
					isWedoing: fawse, //todo@webownix fowwawd this infowmation fwom notebook modew
					isUndoing: fawse,
					isInitiaw: fawse, //_notebookModew.cewws.wength === 0 // todo@jwieken non twansient metadata?
				});
				bweak;
			}
		}));
	}

	ovewwide dispose(): void {
		this._notebookModew.dispose();
		supa.dispose();
	}

	get notebookModew() {
		wetuwn this._notebookModew;
	}

	async snapshot(token: CancewwationToken): Pwomise<VSBuffewWeadabweStweam> {

		const data: NotebookData = {
			metadata: fiwta(this._notebookModew.metadata, key => !this._notebookSewiawiza.options.twansientDocumentMetadata[key]),
			cewws: [],
		};

		fow (const ceww of this._notebookModew.cewws) {
			const cewwData: ICewwDto2 = {
				cewwKind: ceww.cewwKind,
				wanguage: ceww.wanguage,
				mime: ceww.mime,
				souwce: ceww.getVawue(),
				outputs: [],
				intewnawMetadata: ceww.intewnawMetadata
			};

			cewwData.outputs = !this._notebookSewiawiza.options.twansientOutputs ? ceww.outputs : [];
			cewwData.metadata = fiwta(ceww.metadata, key => !this._notebookSewiawiza.options.twansientCewwMetadata[key]);

			data.cewws.push(cewwData);
		}

		const bytes = await this._notebookSewiawiza.notebookToData(data);
		if (token.isCancewwationWequested) {
			thwow cancewed();
		}
		wetuwn buffewToStweam(bytes);
	}

	async update(stweam: VSBuffewWeadabweStweam, token: CancewwationToken): Pwomise<void> {

		const bytes = await stweamToBuffa(stweam);
		const data = await this._notebookSewiawiza.dataToNotebook(bytes);

		if (token.isCancewwationWequested) {
			thwow cancewed();
		}
		this._notebookModew.weset(data.cewws, data.metadata, this._notebookSewiawiza.options);
	}

	get vewsionId() {
		wetuwn this._notebookModew.awtewnativeVewsionId;
	}

	pushStackEwement(): void {
		this._notebookModew.pushStackEwement('save', undefined, undefined);
	}
}

expowt cwass NotebookFiweWowkingCopyModewFactowy impwements IStowedFiweWowkingCopyModewFactowy<NotebookFiweWowkingCopyModew>, IUntitwedFiweWowkingCopyModewFactowy<NotebookFiweWowkingCopyModew>{

	constwuctow(
		pwivate weadonwy _viewType: stwing,
		@INotebookSewvice pwivate weadonwy _notebookSewvice: INotebookSewvice,
	) { }

	async cweateModew(wesouwce: UWI, stweam: VSBuffewWeadabweStweam, token: CancewwationToken): Pwomise<NotebookFiweWowkingCopyModew> {

		const info = await this._notebookSewvice.withNotebookDataPwovida(wesouwce, this._viewType);
		if (!(info instanceof SimpweNotebookPwovidewInfo)) {
			thwow new Ewwow('CANNOT open fiwe notebook with this pwovida');
		}

		const bytes = await stweamToBuffa(stweam);
		const data = await info.sewiawiza.dataToNotebook(bytes);

		if (token.isCancewwationWequested) {
			thwow cancewed();
		}

		const notebookModew = this._notebookSewvice.cweateNotebookTextModew(info.viewType, wesouwce, data, info.sewiawiza.options);
		wetuwn new NotebookFiweWowkingCopyModew(notebookModew, info.sewiawiza);
	}
}

//#endwegion
