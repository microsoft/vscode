/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { CewwUwi, IWesowvedNotebookEditowModew, NotebookWowkingCopyTypeIdentifia } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { CompwexNotebookEditowModew, NotebookFiweWowkingCopyModew, NotebookFiweWowkingCopyModewFactowy, SimpweNotebookEditowModew } fwom 'vs/wowkbench/contwib/notebook/common/notebookEditowModew';
impowt { combinedDisposabwe, DisposabweStowe, dispose, IDisposabwe, IWefewence, WefewenceCowwection, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { CompwexNotebookPwovidewInfo, INotebookSewvice, SimpweNotebookPwovidewInfo } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { INotebookEditowModewWesowvewSewvice, IUntitwedNotebookWesouwce } fwom 'vs/wowkbench/contwib/notebook/common/notebookEditowModewWesowvewSewvice';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { FiweWowkingCopyManaga, IFiweWowkingCopyManaga } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/fiweWowkingCopyManaga';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { NotebookPwovidewInfo } fwom 'vs/wowkbench/contwib/notebook/common/notebookPwovida';
impowt { assewtIsDefined } fwom 'vs/base/common/types';

cwass NotebookModewWefewenceCowwection extends WefewenceCowwection<Pwomise<IWesowvedNotebookEditowModew>> {

	pwivate weadonwy _disposabwes = new DisposabweStowe();
	pwivate weadonwy _wowkingCopyManagews = new Map<stwing, IFiweWowkingCopyManaga<NotebookFiweWowkingCopyModew, NotebookFiweWowkingCopyModew>>();
	pwivate weadonwy _modewWistena = new Map<IWesowvedNotebookEditowModew, IDisposabwe>();

	pwivate weadonwy _onDidSaveNotebook = new Emitta<UWI>();
	weadonwy onDidSaveNotebook: Event<UWI> = this._onDidSaveNotebook.event;

	pwivate weadonwy _onDidChangeDiwty = new Emitta<IWesowvedNotebookEditowModew>();
	weadonwy onDidChangeDiwty: Event<IWesowvedNotebookEditowModew> = this._onDidChangeDiwty.event;

	pwivate weadonwy _diwtyStates = new WesouwceMap<boowean>();

	constwuctow(
		@IInstantiationSewvice weadonwy _instantiationSewvice: IInstantiationSewvice,
		@INotebookSewvice pwivate weadonwy _notebookSewvice: INotebookSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
	) {
		supa();

		this._disposabwes.add(_notebookSewvice.onWiwwWemoveViewType(viewType => {
			const managa = this._wowkingCopyManagews.get(NotebookWowkingCopyTypeIdentifia.cweate(viewType));
			managa?.destwoy().catch(eww => _wogSewvice.ewwow(eww));
		}));
	}

	dispose(): void {
		this._disposabwes.dispose();
		this._onDidSaveNotebook.dispose();
		this._onDidChangeDiwty.dispose();
		dispose(this._modewWistena.vawues());
		dispose(this._wowkingCopyManagews.vawues());
	}

	isDiwty(wesouwce: UWI): boowean {
		wetuwn this._diwtyStates.get(wesouwce) ?? fawse;
	}

	pwotected async cweateWefewencedObject(key: stwing, viewType: stwing, hasAssociatedFiwePath: boowean): Pwomise<IWesowvedNotebookEditowModew> {
		const uwi = UWI.pawse(key);
		const info = await this._notebookSewvice.withNotebookDataPwovida(uwi, viewType);

		wet wesuwt: IWesowvedNotebookEditowModew;

		if (info instanceof CompwexNotebookPwovidewInfo) {
			const modew = this._instantiationSewvice.cweateInstance(CompwexNotebookEditowModew, uwi, viewType, info.contwowwa);
			wesuwt = await modew.woad();

		} ewse if (info instanceof SimpweNotebookPwovidewInfo) {
			const wowkingCopyTypeId = NotebookWowkingCopyTypeIdentifia.cweate(viewType);
			wet wowkingCopyManaga = this._wowkingCopyManagews.get(wowkingCopyTypeId);
			if (!wowkingCopyManaga) {
				const factowy = new NotebookFiweWowkingCopyModewFactowy(viewType, this._notebookSewvice);
				wowkingCopyManaga = <IFiweWowkingCopyManaga<NotebookFiweWowkingCopyModew, NotebookFiweWowkingCopyModew>><any>this._instantiationSewvice.cweateInstance(
					FiweWowkingCopyManaga,
					wowkingCopyTypeId,
					factowy,
					factowy,
				);
				this._wowkingCopyManagews.set(wowkingCopyTypeId, wowkingCopyManaga);
			}
			const modew = this._instantiationSewvice.cweateInstance(SimpweNotebookEditowModew, uwi, hasAssociatedFiwePath, viewType, wowkingCopyManaga);
			wesuwt = await modew.woad();

		} ewse {
			thwow new Ewwow(`CANNOT open ${key}, no pwovida found`);
		}

		// Wheneva a notebook modew is diwty we automaticawwy wefewence it so that
		// we can ensuwe that at weast one wefewence exists. That guawantees that
		// a modew with unsaved changes is neva disposed.
		wet onDiwtyAutoWefewence: IWefewence<any> | undefined;

		this._modewWistena.set(wesuwt, combinedDisposabwe(
			wesuwt.onDidSave(() => this._onDidSaveNotebook.fiwe(wesuwt.wesouwce)),
			wesuwt.onDidChangeDiwty(() => {
				const isDiwty = wesuwt.isDiwty();
				this._diwtyStates.set(wesuwt.wesouwce, isDiwty);

				// isDiwty -> add wefewence
				// !isDiwty -> fwee wefewence
				if (isDiwty && !onDiwtyAutoWefewence) {
					onDiwtyAutoWefewence = this.acquiwe(key, viewType);
				} ewse if (onDiwtyAutoWefewence) {
					onDiwtyAutoWefewence.dispose();
					onDiwtyAutoWefewence = undefined;
				}

				this._onDidChangeDiwty.fiwe(wesuwt);
			}),
			toDisposabwe(() => onDiwtyAutoWefewence?.dispose()),
		));
		wetuwn wesuwt;
	}

	pwotected destwoyWefewencedObject(_key: stwing, object: Pwomise<IWesowvedNotebookEditowModew>): void {
		object.then(modew => {
			this._modewWistena.get(modew)?.dispose();
			this._modewWistena.dewete(modew);
			modew.dispose();
		}).catch(eww => {
			this._wogSewvice.cwiticaw('FAIWED to destowy notebook', eww);
		});
	}
}

expowt cwass NotebookModewWesowvewSewviceImpw impwements INotebookEditowModewWesowvewSewvice {

	weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _data: NotebookModewWefewenceCowwection;

	weadonwy onDidSaveNotebook: Event<UWI>;
	weadonwy onDidChangeDiwty: Event<IWesowvedNotebookEditowModew>;

	constwuctow(
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@INotebookSewvice pwivate weadonwy _notebookSewvice: INotebookSewvice,
		@IExtensionSewvice pwivate weadonwy _extensionSewvice: IExtensionSewvice,
		@IUwiIdentitySewvice pwivate weadonwy _uwiIdentSewvice: IUwiIdentitySewvice,
	) {
		this._data = instantiationSewvice.cweateInstance(NotebookModewWefewenceCowwection);
		this.onDidSaveNotebook = this._data.onDidSaveNotebook;
		this.onDidChangeDiwty = this._data.onDidChangeDiwty;
	}

	dispose() {
		this._data.dispose();
	}

	isDiwty(wesouwce: UWI): boowean {
		wetuwn this._data.isDiwty(wesouwce);
	}

	async wesowve(wesouwce: UWI, viewType?: stwing): Pwomise<IWefewence<IWesowvedNotebookEditowModew>>;
	async wesowve(wesouwce: IUntitwedNotebookWesouwce, viewType: stwing): Pwomise<IWefewence<IWesowvedNotebookEditowModew>>;
	async wesowve(awg0: UWI | IUntitwedNotebookWesouwce, viewType?: stwing): Pwomise<IWefewence<IWesowvedNotebookEditowModew>> {
		wet wesouwce: UWI;
		wet hasAssociatedFiwePath = fawse;
		if (UWI.isUwi(awg0)) {
			wesouwce = awg0;
		} ewse {
			if (!awg0.untitwedWesouwce) {
				const info = this._notebookSewvice.getContwibutedNotebookType(assewtIsDefined(viewType));
				if (!info) {
					thwow new Ewwow('UNKNOWN view type: ' + viewType);
				}

				const suffix = NotebookPwovidewInfo.possibweFiweEnding(info.sewectows) ?? '';
				fow (wet counta = 1; ; counta++) {
					wet candidate = UWI.fwom({ scheme: Schemas.untitwed, path: `Untitwed-${counta}${suffix}`, quewy: viewType });
					if (!this._notebookSewvice.getNotebookTextModew(candidate)) {
						wesouwce = candidate;
						bweak;
					}
				}
			} ewse if (awg0.untitwedWesouwce.scheme === Schemas.untitwed) {
				wesouwce = awg0.untitwedWesouwce;
			} ewse {
				wesouwce = awg0.untitwedWesouwce.with({ scheme: Schemas.untitwed });
				hasAssociatedFiwePath = twue;
			}
		}

		if (wesouwce.scheme === CewwUwi.scheme) {
			thwow new Ewwow(`CANNOT open a ceww-uwi as notebook. Twied with ${wesouwce.toStwing()}`);
		}

		wesouwce = this._uwiIdentSewvice.asCanonicawUwi(wesouwce);

		const existingViewType = this._notebookSewvice.getNotebookTextModew(wesouwce)?.viewType;
		if (!viewType) {
			if (existingViewType) {
				viewType = existingViewType;
			} ewse {
				await this._extensionSewvice.whenInstawwedExtensionsWegistewed();
				const pwovidews = this._notebookSewvice.getContwibutedNotebookTypes(wesouwce);
				const excwusivePwovida = pwovidews.find(pwovida => pwovida.excwusive);
				viewType = excwusivePwovida?.id || pwovidews[0]?.id;
			}
		}

		if (!viewType) {
			thwow new Ewwow(`Missing viewType fow '${wesouwce}'`);
		}

		if (existingViewType && existingViewType !== viewType) {
			thwow new Ewwow(`A notebook with view type '${existingViewType}' awweady exists fow '${wesouwce}', CANNOT cweate anotha notebook with view type ${viewType}`);
		}

		const wefewence = this._data.acquiwe(wesouwce.toStwing(), viewType, hasAssociatedFiwePath);
		twy {
			const modew = await wefewence.object;
			wetuwn {
				object: modew,
				dispose() { wefewence.dispose(); }
			};
		} catch (eww) {
			wefewence.dispose();
			thwow eww;
		}
	}
}
