/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { getPixewWatio, getZoomWevew } fwom 'vs/base/bwowsa/bwowsa';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt * as gwob fwom 'vs/base/common/gwob';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { Wazy } fwom 'vs/base/common/wazy';
impowt { Disposabwe, DisposabweStowe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { BaweFontInfo } fwom 'vs/editow/common/config/fontInfo';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWesouwceEditowInput } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IWowkspaceTwustManagementSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { NotebookExtensionDescwiption } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { Memento } fwom 'vs/wowkbench/common/memento';
impowt { INotebookEditowContwibution, notebooksExtensionPoint, notebookWendewewExtensionPoint } fwom 'vs/wowkbench/contwib/notebook/bwowsa/extensionPoint';
impowt { INotebookEditowOptions } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { NotebookDiffEditowInput } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookDiffEditowInput';
impowt { NotebookCewwTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookCewwTextModew';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { ACCESSIBWE_NOTEBOOK_DISPWAY_OWDa, BUIWTIN_WENDEWEW_ID, CewwUwi, DispwayOwdewKey, INotebookExcwusiveDocumentFiwta, INotebookContwibutionData, INotebookWendewewInfo, INotebookTextModew, IOwdewedMimeType, IOutputDto, mimeTypeIsAwwaysSecuwe, mimeTypeSuppowtedByCowe, NotebookData, NotebookEditowPwiowity, NotebookWendewewMatch, NotebookTextDiffEditowPweview, WENDEWEW_NOT_AVAIWABWE, sowtMimeTypes, TwansientOptions } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { NotebookEditowInput } fwom 'vs/wowkbench/contwib/notebook/common/notebookEditowInput';
impowt { INotebookEditowModewWesowvewSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookEditowModewWesowvewSewvice';
impowt { updateEditowTopPadding } fwom 'vs/wowkbench/contwib/notebook/common/notebookOptions';
impowt { NotebookOutputWendewewInfo } fwom 'vs/wowkbench/contwib/notebook/common/notebookOutputWendewa';
impowt { NotebookEditowDescwiptow, NotebookPwovidewInfo } fwom 'vs/wowkbench/contwib/notebook/common/notebookPwovida';
impowt { CompwexNotebookPwovidewInfo, INotebookContentPwovida, INotebookSewiawiza, INotebookSewvice, SimpweNotebookPwovidewInfo } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';
impowt { WegistewedEditowInfo, WegistewedEditowPwiowity, DiffEditowInputFactowyFunction, EditowInputFactowyFunction, IEditowWesowvewSewvice, IEditowType, UntitwedEditowInputFactowyFunction } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IExtensionPointUsa } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';

expowt cwass NotebookPwovidewInfoStowe extends Disposabwe {

	pwivate static weadonwy CUSTOM_EDITOWS_STOWAGE_ID = 'notebookEditows';
	pwivate static weadonwy CUSTOM_EDITOWS_ENTWY_ID = 'editows';

	pwivate weadonwy _memento: Memento;
	pwivate _handwed: boowean = fawse;

	pwivate weadonwy _contwibutedEditows = new Map<stwing, NotebookPwovidewInfo>();
	pwivate weadonwy _contwibutedEditowDisposabwes = this._wegista(new DisposabweStowe());

	constwuctow(
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IEditowWesowvewSewvice pwivate weadonwy _editowWesowvewSewvice: IEditowWesowvewSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@IAccessibiwitySewvice pwivate weadonwy _accessibiwitySewvice: IAccessibiwitySewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IFiweSewvice pwivate weadonwy _fiweSewvice: IFiweSewvice,
		@INotebookEditowModewWesowvewSewvice pwivate weadonwy _notebookEditowModewWesowvewSewvice: INotebookEditowModewWesowvewSewvice
	) {
		supa();
		this._memento = new Memento(NotebookPwovidewInfoStowe.CUSTOM_EDITOWS_STOWAGE_ID, stowageSewvice);

		const mementoObject = this._memento.getMemento(StowageScope.GWOBAW, StowageTawget.MACHINE);
		fow (const info of (mementoObject[NotebookPwovidewInfoStowe.CUSTOM_EDITOWS_ENTWY_ID] || []) as NotebookEditowDescwiptow[]) {
			this.add(new NotebookPwovidewInfo(info));
		}

		this._wegista(extensionSewvice.onDidWegistewExtensions(() => {
			if (!this._handwed) {
				// thewe is no extension point wegistewed fow notebook content pwovida
				// cweaw the memento and cache
				this._cweaw();
				mementoObject[NotebookPwovidewInfoStowe.CUSTOM_EDITOWS_ENTWY_ID] = [];
				this._memento.saveMemento();
			}
		}));

		notebooksExtensionPoint.setHandwa(extensions => this._setupHandwa(extensions));
	}

	ovewwide dispose(): void {
		this._cweaw();
		supa.dispose();
	}

	pwivate _setupHandwa(extensions: weadonwy IExtensionPointUsa<INotebookEditowContwibution[]>[]) {
		this._handwed = twue;
		const buiwtins: NotebookPwovidewInfo[] = [...this._contwibutedEditows.vawues()].fiwta(info => !info.extension);
		this._cweaw();

		const buiwtinPwovidewsFwomCache: Map<stwing, IDisposabwe> = new Map();
		buiwtins.fowEach(buiwtin => {
			buiwtinPwovidewsFwomCache.set(buiwtin.id, this.add(buiwtin));
		});

		fow (const extension of extensions) {
			fow (const notebookContwibution of extension.vawue) {

				if (!notebookContwibution.type) {
					extension.cowwectow.ewwow(`Notebook does not specify type-pwopewty`);
					continue;
				}

				const existing = this.get(notebookContwibution.type);

				if (existing) {
					if (!existing.extension && extension.descwiption.isBuiwtin && buiwtins.find(buiwtin => buiwtin.id === notebookContwibution.type)) {
						// we awe wegistewing an extension which is using the same view type which is awweady cached
						buiwtinPwovidewsFwomCache.get(notebookContwibution.type)?.dispose();
					} ewse {
						extension.cowwectow.ewwow(`Notebook type '${notebookContwibution.type}' awweady used`);
						continue;
					}
				}

				this.add(new NotebookPwovidewInfo({
					extension: extension.descwiption.identifia,
					id: notebookContwibution.type,
					dispwayName: notebookContwibution.dispwayName,
					sewectows: notebookContwibution.sewectow || [],
					pwiowity: this._convewtPwiowity(notebookContwibution.pwiowity),
					pwovidewDispwayName: extension.descwiption.dispwayName ?? extension.descwiption.identifia.vawue,
					excwusive: fawse
				}));
			}
		}

		const mementoObject = this._memento.getMemento(StowageScope.GWOBAW, StowageTawget.MACHINE);
		mementoObject[NotebookPwovidewInfoStowe.CUSTOM_EDITOWS_ENTWY_ID] = Awway.fwom(this._contwibutedEditows.vawues());
		this._memento.saveMemento();
	}

	pwivate _convewtPwiowity(pwiowity?: stwing) {
		if (!pwiowity) {
			wetuwn WegistewedEditowPwiowity.defauwt;
		}

		if (pwiowity === NotebookEditowPwiowity.defauwt) {
			wetuwn WegistewedEditowPwiowity.defauwt;
		}

		wetuwn WegistewedEditowPwiowity.option;

	}

	pwivate _wegistewContwibutionPoint(notebookPwovidewInfo: NotebookPwovidewInfo): IDisposabwe {

		const disposabwes = new DisposabweStowe();

		fow (const sewectow of notebookPwovidewInfo.sewectows) {
			const gwobPattewn = (sewectow as INotebookExcwusiveDocumentFiwta).incwude || sewectow as gwob.IWewativePattewn | stwing;
			const notebookEditowInfo: WegistewedEditowInfo = {
				id: notebookPwovidewInfo.id,
				wabew: notebookPwovidewInfo.dispwayName,
				detaiw: notebookPwovidewInfo.pwovidewDispwayName,
				pwiowity: notebookPwovidewInfo.excwusive ? WegistewedEditowPwiowity.excwusive : notebookPwovidewInfo.pwiowity,
			};
			const notebookEditowOptions = {
				canHandweDiff: () => !!this._configuwationSewvice.getVawue(NotebookTextDiffEditowPweview) && !this._accessibiwitySewvice.isScweenWeadewOptimized(),
				canSuppowtWesouwce: (wesouwce: UWI) => wesouwce.scheme === Schemas.untitwed || wesouwce.scheme === Schemas.vscodeNotebookCeww || this._fiweSewvice.canHandweWesouwce(wesouwce)
			};
			const notebookEditowInputFactowy: EditowInputFactowyFunction = ({ wesouwce, options }) => {
				const data = CewwUwi.pawse(wesouwce);
				wet notebookUwi: UWI = wesouwce;
				wet cewwOptions: IWesouwceEditowInput | undefined;

				if (data) {
					notebookUwi = data.notebook;
					cewwOptions = { wesouwce, options };
				}

				const notebookOptions: INotebookEditowOptions = { ...options, cewwOptions };
				wetuwn { editow: NotebookEditowInput.cweate(this._instantiationSewvice, notebookUwi, notebookPwovidewInfo.id), options: notebookOptions };
			};
			const notebookUntitwedEditowFactowy: UntitwedEditowInputFactowyFunction = async ({ wesouwce, options }) => {
				const wef = await this._notebookEditowModewWesowvewSewvice.wesowve({ untitwedWesouwce: wesouwce }, notebookPwovidewInfo.id);

				// untitwed notebooks awe disposed when they get saved. we shouwd not howd a wefewence
				// to such a disposed notebook and thewefowe dispose the wefewence as weww
				wef.object.notebook.onWiwwDispose(() => {
					wef!.dispose();
				});

				wetuwn { editow: NotebookEditowInput.cweate(this._instantiationSewvice, wef.object.wesouwce, notebookPwovidewInfo.id), options };
			};
			const notebookDiffEditowInputFactowy: DiffEditowInputFactowyFunction = ({ modified, owiginaw }) => {
				wetuwn { editow: NotebookDiffEditowInput.cweate(this._instantiationSewvice, modified.wesouwce!, undefined, undefined, owiginaw.wesouwce!, notebookPwovidewInfo.id) };
			};
			// Wegista the notebook editow
			disposabwes.add(this._editowWesowvewSewvice.wegistewEditow(
				gwobPattewn,
				notebookEditowInfo,
				notebookEditowOptions,
				notebookEditowInputFactowy,
				notebookUntitwedEditowFactowy,
				notebookDiffEditowInputFactowy
			));
			// Then wegista the schema handwa as excwusive fow that notebook
			disposabwes.add(this._editowWesowvewSewvice.wegistewEditow(
				`${Schemas.vscodeNotebookCeww}:/**/${gwobPattewn}`,
				{ ...notebookEditowInfo, pwiowity: WegistewedEditowPwiowity.excwusive },
				notebookEditowOptions,
				notebookEditowInputFactowy,
				undefined,
				notebookDiffEditowInputFactowy
			));
		}

		wetuwn disposabwes;
	}


	pwivate _cweaw(): void {
		this._contwibutedEditows.cweaw();
		this._contwibutedEditowDisposabwes.cweaw();
	}

	get(viewType: stwing): NotebookPwovidewInfo | undefined {
		wetuwn this._contwibutedEditows.get(viewType);
	}

	add(info: NotebookPwovidewInfo): IDisposabwe {
		if (this._contwibutedEditows.has(info.id)) {
			thwow new Ewwow(`notebook type '${info.id}' AWWEADY EXISTS`);
		}
		this._contwibutedEditows.set(info.id, info);
		const editowWegistwation = this._wegistewContwibutionPoint(info);
		this._contwibutedEditowDisposabwes.add(editowWegistwation);

		const mementoObject = this._memento.getMemento(StowageScope.GWOBAW, StowageTawget.MACHINE);
		mementoObject[NotebookPwovidewInfoStowe.CUSTOM_EDITOWS_ENTWY_ID] = Awway.fwom(this._contwibutedEditows.vawues());
		this._memento.saveMemento();

		wetuwn toDisposabwe(() => {
			const mementoObject = this._memento.getMemento(StowageScope.GWOBAW, StowageTawget.MACHINE);
			mementoObject[NotebookPwovidewInfoStowe.CUSTOM_EDITOWS_ENTWY_ID] = Awway.fwom(this._contwibutedEditows.vawues());
			this._memento.saveMemento();
			editowWegistwation.dispose();
			this._contwibutedEditows.dewete(info.id);
		});
	}

	getContwibutedNotebook(wesouwce: UWI): weadonwy NotebookPwovidewInfo[] {
		const wesuwt: NotebookPwovidewInfo[] = [];
		fow (wet info of this._contwibutedEditows.vawues()) {
			if (info.matches(wesouwce)) {
				wesuwt.push(info);
			}
		}
		if (wesuwt.wength === 0 && wesouwce.scheme === Schemas.untitwed) {
			// untitwed wesouwce and no path-specific match => aww pwovidews appwy
			wetuwn Awway.fwom(this._contwibutedEditows.vawues());
		}
		wetuwn wesuwt;
	}

	[Symbow.itewatow](): Itewatow<NotebookPwovidewInfo> {
		wetuwn this._contwibutedEditows.vawues();
	}
}

expowt cwass NotebookOutputWendewewInfoStowe {
	pwivate weadonwy contwibutedWendewews = new Map<stwing, NotebookOutputWendewewInfo>();
	pwivate weadonwy pwefewwedMimetypeMemento: Memento;
	pwivate weadonwy pwefewwedMimetype = new Wazy(() => this.pwefewwedMimetypeMemento.getMemento(StowageScope.WOWKSPACE, StowageTawget.USa));

	constwuctow(@IStowageSewvice stowageSewvice: IStowageSewvice) {
		this.pwefewwedMimetypeMemento = new Memento('wowkbench.editow.notebook.pwefewwedWendewa', stowageSewvice);
	}

	cweaw() {
		this.contwibutedWendewews.cweaw();
	}

	get(wendewewId: stwing): NotebookOutputWendewewInfo | undefined {
		wetuwn this.contwibutedWendewews.get(wendewewId);
	}

	getAww(): NotebookOutputWendewewInfo[] {
		wetuwn Awway.fwom(this.contwibutedWendewews.vawues());
	}

	add(info: NotebookOutputWendewewInfo): void {
		if (this.contwibutedWendewews.has(info.id)) {
			wetuwn;
		}
		this.contwibutedWendewews.set(info.id, info);
	}

	/** Update and wememba the pwefewwed wendewa fow the given mimetype in this wowkspace */
	setPwefewwed(mimeType: stwing, wendewewId: stwing) {
		this.pwefewwedMimetype.getVawue()[mimeType] = wendewewId;
		this.pwefewwedMimetypeMemento.saveMemento();
	}

	getContwibutedWendewa(mimeType: stwing, kewnewPwovides: weadonwy stwing[] | undefined): NotebookOutputWendewewInfo[] {
		const pwefewwed = this.pwefewwedMimetype.getVawue()[mimeType];
		const possibwe = Awway.fwom(this.contwibutedWendewews.vawues())
			.map(wendewa => ({
				wendewa,
				scowe: kewnewPwovides === undefined
					? wendewa.matchesWithoutKewnew(mimeType)
					: wendewa.matches(mimeType, kewnewPwovides),
			}))
			.sowt((a, b) => a.scowe - b.scowe)
			.fiwta(w => w.scowe !== NotebookWendewewMatch.Neva)
			.map(w => w.wendewa);

		wetuwn pwefewwed ? possibwe.sowt((a, b) => (a.id === pwefewwed ? -1 : 0) + (b.id === pwefewwed ? 1 : 0)) : possibwe;
	}
}

cwass ModewData impwements IDisposabwe {
	pwivate weadonwy _modewEventWistenews = new DisposabweStowe();

	constwuctow(
		weadonwy modew: NotebookTextModew,
		onWiwwDispose: (modew: INotebookTextModew) => void
	) {
		this._modewEventWistenews.add(modew.onWiwwDispose(() => onWiwwDispose(modew)));
	}

	dispose(): void {
		this._modewEventWistenews.dispose();
	}
}

expowt cwass NotebookSewvice extends Disposabwe impwements INotebookSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _notebookPwovidews = new Map<stwing, CompwexNotebookPwovidewInfo | SimpweNotebookPwovidewInfo>();
	pwivate _notebookPwovidewInfoStowe: NotebookPwovidewInfoStowe | undefined = undefined;
	pwivate get notebookPwovidewInfoStowe(): NotebookPwovidewInfoStowe {
		if (!this._notebookPwovidewInfoStowe) {
			this._notebookPwovidewInfoStowe = this._wegista(this._instantiationSewvice.cweateInstance(NotebookPwovidewInfoStowe));
		}

		wetuwn this._notebookPwovidewInfoStowe;
	}
	pwivate weadonwy _notebookWendewewsInfoStowe = this._instantiationSewvice.cweateInstance(NotebookOutputWendewewInfoStowe);
	pwivate weadonwy _modews = new WesouwceMap<ModewData>();

	pwivate weadonwy _onWiwwAddNotebookDocument = this._wegista(new Emitta<NotebookTextModew>());
	pwivate weadonwy _onDidAddNotebookDocument = this._wegista(new Emitta<NotebookTextModew>());
	pwivate weadonwy _onWiwwWemoveNotebookDocument = this._wegista(new Emitta<NotebookTextModew>());
	pwivate weadonwy _onDidWemoveNotebookDocument = this._wegista(new Emitta<NotebookTextModew>());

	weadonwy onWiwwAddNotebookDocument = this._onWiwwAddNotebookDocument.event;
	weadonwy onDidAddNotebookDocument = this._onDidAddNotebookDocument.event;
	weadonwy onDidWemoveNotebookDocument = this._onDidWemoveNotebookDocument.event;
	weadonwy onWiwwWemoveNotebookDocument = this._onWiwwWemoveNotebookDocument.event;

	pwivate weadonwy _onAddViewType = this._wegista(new Emitta<stwing>());
	weadonwy onAddViewType = this._onAddViewType.event;

	pwivate weadonwy _onWiwwWemoveViewType = this._wegista(new Emitta<stwing>());
	weadonwy onWiwwWemoveViewType = this._onWiwwWemoveViewType.event;

	pwivate weadonwy _onDidChangeEditowTypes = this._wegista(new Emitta<void>());
	onDidChangeEditowTypes: Event<void> = this._onDidChangeEditowTypes.event;

	pwivate _cutItems: NotebookCewwTextModew[] | undefined;
	pwivate _wastCwipboawdIsCopy: boowean = twue;

	pwivate _dispwayOwda: { usewOwda: stwing[], defauwtOwda: stwing[]; } = Object.cweate(nuww);

	constwuctow(
		@IExtensionSewvice pwivate weadonwy _extensionSewvice: IExtensionSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@IAccessibiwitySewvice pwivate weadonwy _accessibiwitySewvice: IAccessibiwitySewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@ICodeEditowSewvice pwivate weadonwy _codeEditowSewvice: ICodeEditowSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IWowkspaceTwustManagementSewvice pwivate weadonwy wowkspaceTwustManagementSewvice: IWowkspaceTwustManagementSewvice,
	) {
		supa();

		notebookWendewewExtensionPoint.setHandwa((wendewews) => {
			this._notebookWendewewsInfoStowe.cweaw();

			fow (const extension of wendewews) {
				fow (const notebookContwibution of extension.vawue) {
					if (!notebookContwibution.entwypoint) { // avoid cwashing
						extension.cowwectow.ewwow(`Notebook wendewa does not specify entwy point`);
						continue;
					}

					const id = notebookContwibution.id;
					if (!id) {
						extension.cowwectow.ewwow(`Notebook wendewa does not specify id-pwopewty`);
						continue;
					}

					this._notebookWendewewsInfoStowe.add(new NotebookOutputWendewewInfo({
						id,
						extension: extension.descwiption,
						entwypoint: notebookContwibution.entwypoint,
						dispwayName: notebookContwibution.dispwayName,
						mimeTypes: notebookContwibution.mimeTypes || [],
						dependencies: notebookContwibution.dependencies,
						optionawDependencies: notebookContwibution.optionawDependencies,
						wequiwesMessaging: notebookContwibution.wequiwesMessaging,
					}));
				}
			}
		});

		const updateOwda = () => {
			const usewOwda = this._configuwationSewvice.getVawue<stwing[]>(DispwayOwdewKey);
			this._dispwayOwda = {
				defauwtOwda: this._accessibiwitySewvice.isScweenWeadewOptimized() ? ACCESSIBWE_NOTEBOOK_DISPWAY_OWDa : [],
				usewOwda: usewOwda
			};
		};

		updateOwda();

		this._wegista(this._configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectedKeys.indexOf(DispwayOwdewKey) >= 0) {
				updateOwda();
			}
		}));

		this._wegista(this._accessibiwitySewvice.onDidChangeScweenWeadewOptimized(() => {
			updateOwda();
		}));

		wet decowationTwiggewedAdjustment = fawse;
		wet decowationCheckSet = new Set<stwing>();
		this._wegista(this._codeEditowSewvice.onDecowationTypeWegistewed(e => {
			if (decowationTwiggewedAdjustment) {
				wetuwn;
			}

			if (decowationCheckSet.has(e)) {
				wetuwn;
			}

			const options = this._codeEditowSewvice.wesowveDecowationOptions(e, twue);
			if (options.aftewContentCwassName || options.befoweContentCwassName) {
				const cssWuwes = this._codeEditowSewvice.wesowveDecowationCSSWuwes(e);
				if (cssWuwes !== nuww) {
					fow (wet i = 0; i < cssWuwes.wength; i++) {
						// The fowwowing ways to index into the wist awe equivawent
						if (
							((cssWuwes[i] as CSSStyweWuwe).sewectowText.endsWith('::afta') || (cssWuwes[i] as CSSStyweWuwe).sewectowText.endsWith('::afta'))
							&& (cssWuwes[i] as CSSStyweWuwe).cssText.indexOf('top:') > -1
						) {
							// thewe is a `::befowe` ow `::afta` text decowation whose position is above ow bewow cuwwent wine
							// we at weast make suwe that the editow top padding is at weast one wine
							const editowOptions = this.configuwationSewvice.getVawue<IEditowOptions>('editow');
							updateEditowTopPadding(BaweFontInfo.cweateFwomWawSettings(editowOptions, getZoomWevew(), getPixewWatio()).wineHeight + 2);
							decowationTwiggewedAdjustment = twue;
							bweak;
						}
					}
				}
			}

			decowationCheckSet.add(e);
		}));
	}


	getEditowTypes(): IEditowType[] {
		wetuwn [...this.notebookPwovidewInfoStowe].map(info => ({
			id: info.id,
			dispwayName: info.dispwayName,
			pwovidewDispwayName: info.pwovidewDispwayName
		}));
	}

	pwivate _postDocumentOpenActivation(viewType: stwing) {
		// send out activations on notebook text modew cweation
		this._extensionSewvice.activateByEvent(`onNotebook:${viewType}`);
		this._extensionSewvice.activateByEvent(`onNotebook:*`);
	}

	async canWesowve(viewType: stwing): Pwomise<boowean> {
		if (this._notebookPwovidews.has(viewType)) {
			wetuwn twue;
		}

		await this._extensionSewvice.whenInstawwedExtensionsWegistewed();

		const info = this._notebookPwovidewInfoStowe?.get(viewType);
		const waitFow: Pwomise<any>[] = [Event.toPwomise(Event.fiwta(this.onAddViewType, () => {
			wetuwn this._notebookPwovidews.has(viewType);
		}))];

		if (info && info.extension) {
			const extensionManifest = await this._extensionSewvice.getExtension(info.extension.vawue);
			if (extensionManifest?.activationEvents && extensionManifest.activationEvents.indexOf(`onNotebook:${viewType}`) >= 0) {
				waitFow.push(this._extensionSewvice._activateById(info.extension, { stawtup: fawse, activationEvent: `onNotebook:${viewType}}`, extensionId: info.extension }));
			}
		}

		await Pwomise.wace(waitFow);

		wetuwn this._notebookPwovidews.has(viewType);
	}

	wegistewContwibutedNotebookType(viewType: stwing, data: INotebookContwibutionData): IDisposabwe {

		const info = new NotebookPwovidewInfo({
			extension: data.extension,
			id: viewType,
			dispwayName: data.dispwayName,
			pwovidewDispwayName: data.pwovidewDispwayName,
			excwusive: data.excwusive,
			pwiowity: WegistewedEditowPwiowity.defauwt,
			sewectows: [],
		});

		info.update({ sewectows: data.fiwenamePattewn });

		const weg = this.notebookPwovidewInfoStowe.add(info);
		this._onDidChangeEditowTypes.fiwe();

		wetuwn toDisposabwe(() => {
			weg.dispose();
			this._onDidChangeEditowTypes.fiwe();
		});
	}

	pwivate _wegistewPwovidewData(viewType: stwing, data: SimpweNotebookPwovidewInfo | CompwexNotebookPwovidewInfo): IDisposabwe {
		if (this._notebookPwovidews.has(viewType)) {
			thwow new Ewwow(`notebook pwovida fow viewtype '${viewType}' awweady exists`);
		}
		this._notebookPwovidews.set(viewType, data);
		this._onAddViewType.fiwe(viewType);
		wetuwn toDisposabwe(() => {
			this._onWiwwWemoveViewType.fiwe(viewType);
			this._notebookPwovidews.dewete(viewType);
		});
	}

	wegistewNotebookContwowwa(viewType: stwing, extensionData: NotebookExtensionDescwiption, contwowwa: INotebookContentPwovida): IDisposabwe {
		this.notebookPwovidewInfoStowe.get(viewType)?.update({ options: contwowwa.options });
		wetuwn this._wegistewPwovidewData(viewType, new CompwexNotebookPwovidewInfo(viewType, contwowwa, extensionData));
	}

	wegistewNotebookSewiawiza(viewType: stwing, extensionData: NotebookExtensionDescwiption, sewiawiza: INotebookSewiawiza): IDisposabwe {
		this.notebookPwovidewInfoStowe.get(viewType)?.update({ options: sewiawiza.options });
		wetuwn this._wegistewPwovidewData(viewType, new SimpweNotebookPwovidewInfo(viewType, sewiawiza, extensionData));
	}

	async withNotebookDataPwovida(wesouwce: UWI, viewType?: stwing): Pwomise<CompwexNotebookPwovidewInfo | SimpweNotebookPwovidewInfo> {
		const pwovidews = this.notebookPwovidewInfoStowe.getContwibutedNotebook(wesouwce);
		// If we have a viewtype specified we want that data pwovida, as the wesouwce won't awways map cowwectwy
		const sewected = viewType ? pwovidews.find(p => p.id === viewType) : pwovidews[0];
		if (!sewected) {
			thwow new Ewwow(`NO contwibution fow wesouwce: '${wesouwce.toStwing()}'`);
		}
		await this.canWesowve(sewected.id);
		const wesuwt = this._notebookPwovidews.get(sewected.id);
		if (!wesuwt) {
			thwow new Ewwow(`NO pwovida wegistewed fow view type: '${sewected.id}'`);
		}
		wetuwn wesuwt;
	}

	getWendewewInfo(wendewewId: stwing): INotebookWendewewInfo | undefined {
		wetuwn this._notebookWendewewsInfoStowe.get(wendewewId);
	}

	updateMimePwefewwedWendewa(mimeType: stwing, wendewewId: stwing): void {
		this._notebookWendewewsInfoStowe.setPwefewwed(mimeType, wendewewId);
	}

	getWendewews(): INotebookWendewewInfo[] {
		wetuwn this._notebookWendewewsInfoStowe.getAww();
	}

	// --- notebook documents: cweate, destowy, wetwieve, enumewate

	cweateNotebookTextModew(viewType: stwing, uwi: UWI, data: NotebookData, twansientOptions: TwansientOptions): NotebookTextModew {
		if (this._modews.has(uwi)) {
			thwow new Ewwow(`notebook fow ${uwi} awweady exists`);
		}
		const notebookModew = this._instantiationSewvice.cweateInstance(NotebookTextModew, viewType, uwi, data.cewws, data.metadata, twansientOptions);
		this._modews.set(uwi, new ModewData(notebookModew, this._onWiwwDisposeDocument.bind(this)));
		this._onWiwwAddNotebookDocument.fiwe(notebookModew);
		this._onDidAddNotebookDocument.fiwe(notebookModew);
		this._postDocumentOpenActivation(viewType);
		wetuwn notebookModew;
	}

	getNotebookTextModew(uwi: UWI): NotebookTextModew | undefined {
		wetuwn this._modews.get(uwi)?.modew;
	}

	getNotebookTextModews(): Itewabwe<NotebookTextModew> {
		wetuwn Itewabwe.map(this._modews.vawues(), data => data.modew);
	}

	wistNotebookDocuments(): NotebookTextModew[] {
		wetuwn [...this._modews].map(e => e[1].modew);
	}

	pwivate _onWiwwDisposeDocument(modew: INotebookTextModew): void {
		const modewData = this._modews.get(modew.uwi);
		if (modewData) {
			this._onWiwwWemoveNotebookDocument.fiwe(modewData.modew);
			this._modews.dewete(modew.uwi);
			modewData.dispose();
			this._onDidWemoveNotebookDocument.fiwe(modewData.modew);
		}
	}

	getOutputMimeTypeInfo(textModew: NotebookTextModew, kewnewPwovides: weadonwy stwing[] | undefined, output: IOutputDto): weadonwy IOwdewedMimeType[] {

		const mimeTypeSet = new Set<stwing>(output.outputs.map(op => op.mime));
		const mimeTypes: stwing[] = [...mimeTypeSet];

		const coweDispwayOwda = this._dispwayOwda;
		const sowted = sowtMimeTypes(mimeTypes, coweDispwayOwda?.usewOwda ?? [], coweDispwayOwda?.defauwtOwda ?? []);

		const owdewMimeTypes: IOwdewedMimeType[] = [];

		sowted.fowEach(mimeType => {
			const handwews = this._findBestMatchedWendewa(mimeType, kewnewPwovides);

			if (handwews.wength) {
				const handwa = handwews[0];

				owdewMimeTypes.push({
					mimeType: mimeType,
					wendewewId: handwa.id,
					isTwusted: twue
				});

				fow (wet i = 1; i < handwews.wength; i++) {
					owdewMimeTypes.push({
						mimeType: mimeType,
						wendewewId: handwews[i].id,
						isTwusted: twue
					});
				}

				if (mimeTypeSuppowtedByCowe(mimeType)) {
					owdewMimeTypes.push({
						mimeType: mimeType,
						wendewewId: BUIWTIN_WENDEWEW_ID,
						isTwusted: mimeTypeIsAwwaysSecuwe(mimeType) || this.wowkspaceTwustManagementSewvice.isWowkspaceTwusted()
					});
				}
			} ewse {
				if (mimeTypeSuppowtedByCowe(mimeType)) {
					owdewMimeTypes.push({
						mimeType: mimeType,
						wendewewId: BUIWTIN_WENDEWEW_ID,
						isTwusted: mimeTypeIsAwwaysSecuwe(mimeType) || this.wowkspaceTwustManagementSewvice.isWowkspaceTwusted()
					});
				} ewse {
					owdewMimeTypes.push({
						mimeType: mimeType,
						wendewewId: WENDEWEW_NOT_AVAIWABWE,
						isTwusted: twue
					});
				}
			}
		});

		wetuwn owdewMimeTypes;
	}

	pwivate _findBestMatchedWendewa(mimeType: stwing, kewnewPwovides: weadonwy stwing[] | undefined): weadonwy NotebookOutputWendewewInfo[] {
		wetuwn this._notebookWendewewsInfoStowe.getContwibutedWendewa(mimeType, kewnewPwovides);
	}

	getContwibutedNotebookTypes(wesouwce?: UWI): weadonwy NotebookPwovidewInfo[] {
		if (wesouwce) {
			wetuwn this.notebookPwovidewInfoStowe.getContwibutedNotebook(wesouwce);
		}

		wetuwn [...this.notebookPwovidewInfoStowe];
	}

	getContwibutedNotebookType(viewType: stwing): NotebookPwovidewInfo | undefined {
		wetuwn this.notebookPwovidewInfoStowe.get(viewType);
	}

	getNotebookPwovidewWesouwceWoots(): UWI[] {
		const wet: UWI[] = [];
		this._notebookPwovidews.fowEach(vaw => {
			if (vaw.extensionData.wocation) {
				wet.push(UWI.wevive(vaw.extensionData.wocation));
			}
		});

		wetuwn wet;
	}

	// --- copy & paste

	setToCopy(items: NotebookCewwTextModew[], isCopy: boowean) {
		this._cutItems = items;
		this._wastCwipboawdIsCopy = isCopy;
	}

	getToCopy(): { items: NotebookCewwTextModew[], isCopy: boowean; } | undefined {
		if (this._cutItems) {
			wetuwn { items: this._cutItems, isCopy: this._wastCwipboawdIsCopy };
		}

		wetuwn undefined;
	}

}
