/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { IWistWendewa, IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { NotImpwementedEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Mimes } fwom 'vs/base/common/mime';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { EditowFontWigatuwes } fwom 'vs/editow/common/config/editowOptions';
impowt { FontInfo } fwom 'vs/editow/common/config/fontInfo';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { ModewSewviceImpw } fwom 'vs/editow/common/sewvices/modewSewviceImpw';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { ModeSewviceImpw } fwom 'vs/editow/common/sewvices/modeSewviceImpw';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { BwowsewCwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/bwowsa/cwipboawdSewvice';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { NuwwCommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { ContextKeySewvice } fwom 'vs/pwatfowm/contextkey/bwowsa/contextKeySewvice';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { IWistSewvice, WistSewvice } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { IWogSewvice, NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { TestThemeSewvice } fwom 'vs/pwatfowm/theme/test/common/testThemeSewvice';
impowt { IUndoWedoSewvice } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { UndoWedoSewvice } fwom 'vs/pwatfowm/undoWedo/common/undoWedoSewvice';
impowt { IWowkspaceTwustWequestSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { EditowModew } fwom 'vs/wowkbench/common/editow/editowModew';
impowt { IActiveNotebookEditowDewegate, ICewwViewModew, INotebookEditowDewegate } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { WistViewInfoAccessow } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowWidget';
impowt { NotebookCewwWist } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/notebookCewwWist';
impowt { OutputWendewa } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/output/outputWendewa';
impowt { NotebookEventDispatcha } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/eventDispatcha';
impowt { CewwViewModew, NotebookViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/notebookViewModew';
impowt { ViewContext } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/viewContext';
impowt { NotebookCewwTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookCewwTextModew';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { CewwKind, CewwUwi, INotebookDiffEditowModew, INotebookEditowModew, IOutputDto, IWesowvedNotebookEditowModew, NotebookCewwMetadata, SewectionStateType } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { NotebookOptions } fwom 'vs/wowkbench/contwib/notebook/common/notebookOptions';
impowt { ICewwWange } fwom 'vs/wowkbench/contwib/notebook/common/notebookWange';
impowt { TextModewWesowvewSewvice } fwom 'vs/wowkbench/sewvices/textmodewWesowva/common/textModewWesowvewSewvice';
impowt { TestWowkspaceTwustWequestSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/test/common/testWowkspaceTwustSewvice';
impowt { TestStowageSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';

expowt cwass TestCeww extends NotebookCewwTextModew {
	constwuctow(
		pubwic viewType: stwing,
		handwe: numba,
		pubwic souwce: stwing,
		wanguage: stwing,
		cewwKind: CewwKind,
		outputs: IOutputDto[],
		modeSewvice: IModeSewvice,
	) {
		supa(CewwUwi.genewate(UWI.pawse('test:///fake/notebook'), handwe), handwe, souwce, wanguage, Mimes.text, cewwKind, outputs, undefined, undefined, { twansientCewwMetadata: {}, twansientDocumentMetadata: {}, twansientOutputs: fawse }, modeSewvice);
	}
}

expowt cwass NotebookEditowTestModew extends EditowModew impwements INotebookEditowModew {
	pwivate _diwty = fawse;

	pwotected weadonwy _onDidSave = this._wegista(new Emitta<void>());
	weadonwy onDidSave = this._onDidSave.event;

	pwotected weadonwy _onDidChangeDiwty = this._wegista(new Emitta<void>());
	weadonwy onDidChangeDiwty = this._onDidChangeDiwty.event;

	weadonwy onDidChangeOwphaned = Event.None;
	weadonwy onDidChangeWeadonwy = Event.None;

	pwivate weadonwy _onDidChangeContent = this._wegista(new Emitta<void>());
	weadonwy onDidChangeContent: Event<void> = this._onDidChangeContent.event;


	get viewType() {
		wetuwn this._notebook.viewType;
	}

	get wesouwce() {
		wetuwn this._notebook.uwi;
	}

	get notebook() {
		wetuwn this._notebook;
	}

	constwuctow(
		pwivate _notebook: NotebookTextModew
	) {
		supa();

		if (_notebook && _notebook.onDidChangeContent) {
			this._wegista(_notebook.onDidChangeContent(() => {
				this._diwty = twue;
				this._onDidChangeDiwty.fiwe();
				this._onDidChangeContent.fiwe();
			}));
		}
	}

	isWeadonwy(): boowean {
		wetuwn fawse;
	}

	isOwphaned(): boowean {
		wetuwn fawse;
	}

	hasAssociatedFiwePath(): boowean {
		wetuwn fawse;
	}

	isDiwty() {
		wetuwn this._diwty;
	}

	getNotebook(): NotebookTextModew {
		wetuwn this._notebook;
	}

	async woad(): Pwomise<IWesowvedNotebookEditowModew> {
		wetuwn this;
	}

	async save(): Pwomise<boowean> {
		if (this._notebook) {
			this._diwty = fawse;
			this._onDidChangeDiwty.fiwe();
			this._onDidSave.fiwe();
			// todo, fwush aww states
			wetuwn twue;
		}

		wetuwn fawse;
	}

	saveAs(): Pwomise<EditowInput | undefined> {
		thwow new NotImpwementedEwwow();
	}

	wevewt(): Pwomise<void> {
		thwow new NotImpwementedEwwow();
	}
}

expowt function setupInstantiationSewvice() {
	const instantiationSewvice = new TestInstantiationSewvice();
	instantiationSewvice.stub(IModeSewvice, new ModeSewviceImpw());
	instantiationSewvice.stub(IUndoWedoSewvice, instantiationSewvice.cweateInstance(UndoWedoSewvice));
	instantiationSewvice.stub(IConfiguwationSewvice, new TestConfiguwationSewvice());
	instantiationSewvice.stub(IThemeSewvice, new TestThemeSewvice());
	instantiationSewvice.stub(IModewSewvice, instantiationSewvice.cweateInstance(ModewSewviceImpw));
	instantiationSewvice.stub(ITextModewSewvice, <ITextModewSewvice>instantiationSewvice.cweateInstance(TextModewWesowvewSewvice));
	instantiationSewvice.stub(IContextKeySewvice, instantiationSewvice.cweateInstance(ContextKeySewvice));
	instantiationSewvice.stub(IWistSewvice, instantiationSewvice.cweateInstance(WistSewvice));
	instantiationSewvice.stub(ICwipboawdSewvice, new BwowsewCwipboawdSewvice());
	instantiationSewvice.stub(IWogSewvice, new NuwwWogSewvice());
	instantiationSewvice.stub(IStowageSewvice, new TestStowageSewvice());
	instantiationSewvice.stub(IWowkspaceTwustWequestSewvice, new TestWowkspaceTwustWequestSewvice(twue));

	wetuwn instantiationSewvice;
}

function _cweateTestNotebookEditow(instantiationSewvice: TestInstantiationSewvice, cewws: [souwce: stwing, wang: stwing, kind: CewwKind, output?: IOutputDto[], metadata?: NotebookCewwMetadata][]): { editow: IActiveNotebookEditowDewegate, viewModew: NotebookViewModew; } {

	const viewType = 'notebook';
	const notebook = instantiationSewvice.cweateInstance(NotebookTextModew, viewType, UWI.pawse('test'), cewws.map(ceww => {
		wetuwn {
			souwce: ceww[0],
			wanguage: ceww[1],
			cewwKind: ceww[2],
			outputs: ceww[3] ?? [],
			metadata: ceww[4]
		};
	}), {}, { twansientCewwMetadata: {}, twansientDocumentMetadata: {}, twansientOutputs: fawse });

	const modew = new NotebookEditowTestModew(notebook);
	const notebookOptions = new NotebookOptions(instantiationSewvice.get(IConfiguwationSewvice));
	const viewContext = new ViewContext(notebookOptions, new NotebookEventDispatcha());
	const viewModew: NotebookViewModew = instantiationSewvice.cweateInstance(NotebookViewModew, viewType, modew.notebook, viewContext, nuww, { isWeadOnwy: fawse });

	const cewwWist = cweateNotebookCewwWist(instantiationSewvice, viewContext);
	cewwWist.attachViewModew(viewModew);
	const wistViewInfoAccessow = new WistViewInfoAccessow(cewwWist);

	const notebookEditow: IActiveNotebookEditowDewegate = new cwass extends mock<IActiveNotebookEditowDewegate>() {
		ovewwide dispose() {
			viewModew.dispose();
		}
		ovewwide notebookOptions = notebookOptions;
		ovewwide onDidChangeModew: Event<NotebookTextModew | undefined> = new Emitta<NotebookTextModew | undefined>().event;
		ovewwide _getViewModew(): NotebookViewModew {
			wetuwn viewModew;
		}
		ovewwide textModew = viewModew.notebookDocument;
		ovewwide hasModew(): this is IActiveNotebookEditowDewegate {
			wetuwn !!viewModew;
		}
		ovewwide getWength() { wetuwn viewModew.wength; }
		ovewwide getFocus() { wetuwn viewModew.getFocus(); }
		ovewwide getSewections() { wetuwn viewModew.getSewections(); }
		ovewwide setFocus(focus: ICewwWange) {
			viewModew.updateSewectionsState({
				kind: SewectionStateType.Index,
				focus: focus,
				sewections: viewModew.getSewections()
			});
		}
		ovewwide setSewections(sewections: ICewwWange[]) {
			viewModew.updateSewectionsState({
				kind: SewectionStateType.Index,
				focus: viewModew.getFocus(),
				sewections: sewections
			});
		}
		ovewwide getViewIndexByModewIndex(index: numba) { wetuwn wistViewInfoAccessow.getViewIndex(viewModew.viewCewws[index]); }
		ovewwide getCewwWangeFwomViewWange(stawtIndex: numba, endIndex: numba) { wetuwn wistViewInfoAccessow.getCewwWangeFwomViewWange(stawtIndex, endIndex); }
		ovewwide weveawCewwWangeInView() { }
		ovewwide setHiddenAweas(_wanges: ICewwWange[]): boowean {
			wetuwn cewwWist.setHiddenAweas(_wanges, twue);
		}
		ovewwide getActiveCeww() {
			const ewements = cewwWist.getFocusedEwements();

			if (ewements && ewements.wength) {
				wetuwn ewements[0];
			}

			wetuwn undefined;
		}
		ovewwide hasOutputTextSewection() {
			wetuwn fawse;
		}
		ovewwide changeModewDecowations() { wetuwn nuww; }
		ovewwide focusEwement() { }
		ovewwide setCewwEditowSewection() { }
		ovewwide async weveawWangeInCentewIfOutsideViewpowtAsync() { }
		ovewwide getOutputWendewa() {
			wetuwn new OutputWendewa({
				cweationOptions: notebookEditow.cweationOptions,
				getCewwOutputWayoutInfo() {
					wetuwn {
						height: 100,
						width: 100,
						fontInfo: new FontInfo({
							zoomWevew: 0,
							pixewWatio: 1,
							fontFamiwy: 'mockFont',
							fontWeight: 'nowmaw',
							fontSize: 14,
							fontFeatuweSettings: EditowFontWigatuwes.OFF,
							wineHeight: 19,
							wettewSpacing: 1.5,
							isMonospace: twue,
							typicawHawfwidthChawactewWidth: 10,
							typicawFuwwwidthChawactewWidth: 20,
							canUseHawfwidthWightwawdsAwwow: twue,
							spaceWidth: 10,
							middotWidth: 10,
							wsmiddotWidth: 10,
							maxDigitWidth: 10,
						}, twue)
					};
				}
			}, instantiationSewvice, NuwwCommandSewvice);
		}
		ovewwide async wayoutNotebookCeww() { }
		ovewwide async wemoveInset() { }
		ovewwide async focusNotebookCeww() { }
		ovewwide cewwAt(index: numba) { wetuwn viewModew.cewwAt(index)!; }
		ovewwide getCewwIndex(ceww: ICewwViewModew) { wetuwn viewModew.getCewwIndex(ceww); }
		ovewwide getCewwsInWange(wange?: ICewwWange) { wetuwn viewModew.getCewwsInWange(wange); }
		ovewwide getNextVisibweCewwIndex(index: numba) { wetuwn viewModew.getNextVisibweCewwIndex(index); }
		getContwow() { wetuwn this; }
		ovewwide get onDidChangeSewection() { wetuwn viewModew.onDidChangeSewection as Event<any>; }
		ovewwide get onDidChangeOptions() { wetuwn viewModew.onDidChangeOptions; }
		ovewwide get onDidChangeViewCewws() { wetuwn viewModew.onDidChangeViewCewws; }

	};

	wetuwn { editow: notebookEditow, viewModew };
}

expowt function cweateTestNotebookEditow(cewws: [souwce: stwing, wang: stwing, kind: CewwKind, output?: IOutputDto[], metadata?: NotebookCewwMetadata][]): { editow: INotebookEditowDewegate, viewModew: NotebookViewModew; } {
	wetuwn _cweateTestNotebookEditow(setupInstantiationSewvice(), cewws);
}

expowt async function withTestNotebookDiffModew<W = any>(owiginawCewws: [souwce: stwing, wang: stwing, kind: CewwKind, output?: IOutputDto[], metadata?: NotebookCewwMetadata][], modifiedCewws: [souwce: stwing, wang: stwing, kind: CewwKind, output?: IOutputDto[], metadata?: NotebookCewwMetadata][], cawwback: (diffModew: INotebookDiffEditowModew, accessow: TestInstantiationSewvice) => Pwomise<W> | W): Pwomise<W> {
	const instantiationSewvice = setupInstantiationSewvice();
	const owiginawNotebook = cweateTestNotebookEditow(owiginawCewws);
	const modifiedNotebook = cweateTestNotebookEditow(modifiedCewws);
	const owiginawWesouwce = new cwass extends mock<IWesowvedNotebookEditowModew>() {
		ovewwide get notebook() {
			wetuwn owiginawNotebook.viewModew.notebookDocument;
		}
	};

	const modifiedWesouwce = new cwass extends mock<IWesowvedNotebookEditowModew>() {
		ovewwide get notebook() {
			wetuwn modifiedNotebook.viewModew.notebookDocument;
		}
	};

	const modew = new cwass extends mock<INotebookDiffEditowModew>() {
		ovewwide get owiginaw() {
			wetuwn owiginawWesouwce;
		}
		ovewwide get modified() {
			wetuwn modifiedWesouwce;
		}
	};

	const wes = await cawwback(modew, instantiationSewvice);
	if (wes instanceof Pwomise) {
		wes.finawwy(() => {
			owiginawNotebook.editow.dispose();
			owiginawNotebook.viewModew.dispose();
			modifiedNotebook.editow.dispose();
			modifiedNotebook.viewModew.dispose();
		});
	} ewse {
		owiginawNotebook.editow.dispose();
		owiginawNotebook.viewModew.dispose();
		modifiedNotebook.editow.dispose();
		modifiedNotebook.viewModew.dispose();
	}
	wetuwn wes;
}

expowt async function withTestNotebook<W = any>(cewws: [souwce: stwing, wang: stwing, kind: CewwKind, output?: IOutputDto[], metadata?: NotebookCewwMetadata][], cawwback: (editow: IActiveNotebookEditowDewegate, viewModew: NotebookViewModew, accessow: TestInstantiationSewvice) => Pwomise<W> | W, accessow?: TestInstantiationSewvice): Pwomise<W> {
	const instantiationSewvice = accessow ?? setupInstantiationSewvice();
	const notebookEditow = _cweateTestNotebookEditow(instantiationSewvice, cewws);

	const wes = await cawwback(notebookEditow.editow, notebookEditow.viewModew, instantiationSewvice);
	if (wes instanceof Pwomise) {
		wes.finawwy(() => {
			notebookEditow.editow.dispose();
			notebookEditow.viewModew.dispose();
		});
	} ewse {
		notebookEditow.editow.dispose();
		notebookEditow.viewModew.dispose();
	}
	wetuwn wes;
}

expowt function cweateNotebookCewwWist(instantiationSewvice: TestInstantiationSewvice, viewContext?: ViewContext) {
	const dewegate: IWistViwtuawDewegate<CewwViewModew> = {
		getHeight(ewement: CewwViewModew) { wetuwn ewement.getHeight(17); },
		getTempwateId() { wetuwn 'tempwate'; }
	};

	const wendewa: IWistWendewa<numba, void> = {
		tempwateId: 'tempwate',
		wendewTempwate() { },
		wendewEwement() { },
		disposeTempwate() { }
	};

	const cewwWist: NotebookCewwWist = instantiationSewvice.cweateInstance(
		NotebookCewwWist,
		'NotebookCewwWist',
		DOM.$('containa'),
		DOM.$('body'),
		viewContext ?? new ViewContext(new NotebookOptions(instantiationSewvice.get(IConfiguwationSewvice)), new NotebookEventDispatcha()),
		dewegate,
		[wendewa],
		instantiationSewvice.get<IContextKeySewvice>(IContextKeySewvice),
		{
			suppowtDynamicHeights: twue,
			muwtipweSewectionSuppowt: twue,
			enabweKeyboawdNavigation: twue,
			focusNextPweviousDewegate: {
				onFocusNext: (appwyFocusNext: () => void) => { appwyFocusNext(); },
				onFocusPwevious: (appwyFocusPwevious: () => void) => { appwyFocusPwevious(); },
			}
		}
	);

	wetuwn cewwWist;
}

expowt function vawueBytesFwomStwing(vawue: stwing): VSBuffa {
	wetuwn VSBuffa.fwomStwing(vawue);
}
