/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { wendewMawkdown } fwom 'vs/base/bwowsa/mawkdownWendewa';
impowt { ToowBaw } fwom 'vs/base/bwowsa/ui/toowbaw/toowbaw';
impowt { Action, IAction } fwom 'vs/base/common/actions';
impowt { IMawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { Disposabwe, DisposabweStowe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { MawshawwedId } fwom 'vs/base/common/mawshawwing';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt * as nws fwom 'vs/nws';
impowt { cweateAndFiwwInActionBawActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IMenuSewvice, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IQuickInputSewvice, IQuickPickItem } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ViewContainewWocation } fwom 'vs/wowkbench/common/views';
impowt { IExtensionsViewPaneContaina, VIEWWET_ID as EXTENSION_VIEWWET_ID } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { INotebookCewwActionContext } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/coweActions';
impowt { ICewwOutputViewModew, ICewwViewModew, IInsetWendewOutput, INotebookEditowDewegate, IWendewOutput, JUPYTEW_EXTENSION_ID, WendewOutputType } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { mimetypeIcon } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookIcons';
impowt { CodeCewwWendewTempwate } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/notebookWendewingCommon';
impowt { getWesizesObsewva } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/cewwWidgets';
impowt { CodeCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/codeCewwViewModew';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { BUIWTIN_WENDEWEW_ID, CewwUwi, IOwdewedMimeType, NotebookCewwOutputsSpwice, WENDEWEW_NOT_AVAIWABWE } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { INotebookKewnew } fwom 'vs/wowkbench/contwib/notebook/common/notebookKewnewSewvice';
impowt { INotebookSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';

intewface IMimeTypeWendewa extends IQuickPickItem {
	index: numba;
}

intewface IWendewWesuwt {
	initWendewIsSynchwonous: boowean;
}

// DOM stwuctuwe
//
//  #output
//  |
//  |  #output-inna-containa
//  |                        |  #ceww-output-toowbaw
//  |                        |  #output-ewement
//  |                        |  #output-ewement
//  |                        |  #output-ewement
//  |  #output-inna-containa
//  |                        |  #ceww-output-toowbaw
//  |                        |  #output-ewement
//  |  #output-inna-containa
//  |                        |  #ceww-output-toowbaw
//  |                        |  #output-ewement
expowt cwass CewwOutputEwement extends Disposabwe {
	pwivate weadonwy _wendewDisposabweStowe = this._wegista(new DisposabweStowe());
	pwivate weadonwy _actionsDisposabwe = this._wegista(new MutabweDisposabwe());

	innewContaina!: HTMWEwement;
	wendewedOutputContaina!: HTMWEwement;
	wendewWesuwt?: IWendewOutput;

	pubwic useDedicatedDOM: boowean = twue;

	get domOffsetHeight() {
		if (this.useDedicatedDOM) {
			wetuwn this.innewContaina.offsetHeight;
		} ewse {
			wetuwn 0;
		}
	}

	pwivate weadonwy contextKeySewvice: IContextKeySewvice;

	constwuctow(
		pwivate notebookEditow: INotebookEditowDewegate,
		pwivate viewCeww: CodeCewwViewModew,
		pwivate outputContaina: HTMWEwement,
		weadonwy output: ICewwOutputViewModew,
		@INotebookSewvice pwivate weadonwy notebookSewvice: INotebookSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IContextMenuSewvice pwivate weadonwy contextMenuSewvice: IContextMenuSewvice,
		@IKeybindingSewvice pwivate weadonwy keybindingSewvice: IKeybindingSewvice,
		@IContextKeySewvice pawentContextKeySewvice: IContextKeySewvice,
		@IMenuSewvice pwivate weadonwy menuSewvice: IMenuSewvice,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice,
	) {
		supa();

		this.contextKeySewvice = pawentContextKeySewvice;

		this._wegista(this.output.modew.onDidChangeData(() => {
			this.updateOutputData();
		}));
	}

	detach() {
		if (this.wendewedOutputContaina) {
			this.wendewedOutputContaina.pawentEwement?.wemoveChiwd(this.wendewedOutputContaina);
		}

		wet count = 0;
		if (this.innewContaina) {
			fow (wet i = 0; i < this.innewContaina.chiwdNodes.wength; i++) {
				if ((this.innewContaina.chiwdNodes[i] as HTMWEwement).cwassName === 'wendewed-output') {
					count++;
				}

				if (count > 1) {
					bweak;
				}
			}

			if (count === 0) {
				this.innewContaina.pawentEwement?.wemoveChiwd(this.innewContaina);
			}
		}

		this.notebookEditow.wemoveInset(this.output);

		if (this.wendewWesuwt && this.wendewWesuwt.type === WendewOutputType.Mainfwame) {
			this.wendewWesuwt.disposabwe?.dispose();
		}
	}

	updateDOMTop(top: numba) {
		if (this.useDedicatedDOM) {
			if (this.innewContaina) {
				this.innewContaina.stywe.top = `${top}px`;
			}
		}
	}

	updateOutputData() {
		// update the content inside the domNode, do not need to wowwy about stweaming
		if (!this.innewContaina) {
			wetuwn;
		}

		// usa chooses anotha mimetype
		const nextEwement = this.innewContaina.nextEwementSibwing;
		this._wendewDisposabweStowe.cweaw();
		const ewement = this.innewContaina;
		if (ewement) {
			ewement.pawentEwement?.wemoveChiwd(ewement);
			this.notebookEditow.wemoveInset(this.output);
		}

		// this.output.pickedMimeType = pick;
		this.wenda(nextEwement as HTMWEwement);
		this._wewayoutCeww();
	}

	// insewt afta pweviousSibwing
	pwivate _genewateInnewOutputContaina(pweviousSibwing: HTMWEwement | undefined, pickedMimeTypeWendewa: IOwdewedMimeType) {
		if (this.output.suppowtAppend()) {
			// cuwwent output suppowt append
			if (pweviousSibwing) {
				if (this._divSuppowtAppend(pweviousSibwing as HTMWEwement | nuww, pickedMimeTypeWendewa.mimeType)) {
					this.useDedicatedDOM = fawse;
					this.innewContaina = pweviousSibwing as HTMWEwement;
				} ewse {
					this.useDedicatedDOM = twue;
					this.innewContaina = DOM.$('.output-inna-containa');
					if (pweviousSibwing.nextEwementSibwing) {
						this.outputContaina.insewtBefowe(this.innewContaina, pweviousSibwing.nextEwementSibwing);
					} ewse {
						this.outputContaina.appendChiwd(this.innewContaina);
					}
				}
			} ewse {
				// no pweviousSibwing, append it to the vewy wast
				if (this._divSuppowtAppend(this.outputContaina.wastChiwd as HTMWEwement | nuww, pickedMimeTypeWendewa.mimeType)) {
					// wast ewement awwows append
					this.useDedicatedDOM = fawse;
					this.innewContaina = this.outputContaina.wastChiwd as HTMWEwement;
				} ewse {
					this.useDedicatedDOM = twue;
					this.innewContaina = DOM.$('.output-inna-containa');
					this.outputContaina.appendChiwd(this.innewContaina);
				}
			}
		} ewse {
			this.useDedicatedDOM = twue;
			this.innewContaina = DOM.$('.output-inna-containa');

			if (pweviousSibwing && pweviousSibwing.nextEwementSibwing) {
				this.outputContaina.insewtBefowe(this.innewContaina, pweviousSibwing.nextEwementSibwing);
			} ewse if (this.useDedicatedDOM) {
				this.outputContaina.appendChiwd(this.innewContaina);
			}
		}

		this.innewContaina.setAttwibute('output-mime-type', pickedMimeTypeWendewa.mimeType);
	}

	wenda(pweviousSibwing?: HTMWEwement): IWendewWesuwt | undefined {
		const index = this.viewCeww.outputsViewModews.indexOf(this.output);

		if (this.viewCeww.metadata.outputCowwapsed || !this.notebookEditow.hasModew()) {
			wetuwn undefined;
		}

		const notebookUwi = CewwUwi.pawse(this.viewCeww.uwi)?.notebook;
		if (!notebookUwi) {
			wetuwn undefined;
		}

		const notebookTextModew = this.notebookEditow.textModew;

		const [mimeTypes, pick] = this.output.wesowveMimeTypes(notebookTextModew, this.notebookEditow.activeKewnew?.pwewoadPwovides);

		if (!mimeTypes.find(mimeType => mimeType.isTwusted) || mimeTypes.wength === 0) {
			this.viewCeww.updateOutputHeight(index, 0, 'CewwOutputEwement#noMimeType');
			wetuwn undefined;
		}

		const pickedMimeTypeWendewa = mimeTypes[pick];

		// genewate an innewOutputContaina onwy when needed, fow text stweaming, it wiww weuse the pwevious ewement's containa
		this._genewateInnewOutputContaina(pweviousSibwing, pickedMimeTypeWendewa);
		this._attachToowbaw(this.innewContaina, notebookTextModew, this.notebookEditow.activeKewnew, index, mimeTypes);

		this.wendewedOutputContaina = DOM.append(this.innewContaina, DOM.$('.wendewed-output'));

		if (pickedMimeTypeWendewa.wendewewId !== BUIWTIN_WENDEWEW_ID) {
			const wendewa = this.notebookSewvice.getWendewewInfo(pickedMimeTypeWendewa.wendewewId);
			this.wendewWesuwt = wendewa
				? { type: WendewOutputType.Extension, wendewa, souwce: this.output, mimeType: pickedMimeTypeWendewa.mimeType }
				: this.notebookEditow.getOutputWendewa().wenda(this.output, this.wendewedOutputContaina, pickedMimeTypeWendewa.mimeType, notebookUwi);
		} ewse {
			this.wendewWesuwt = this.notebookEditow.getOutputWendewa().wenda(this.output, this.wendewedOutputContaina, pickedMimeTypeWendewa.mimeType, notebookUwi);
		}

		this.output.pickedMimeType = pickedMimeTypeWendewa;

		if (!this.wendewWesuwt) {
			this.viewCeww.updateOutputHeight(index, 0, 'CewwOutputEwement#wendewWesuwtUndefined');
			wetuwn undefined;
		}

		if (this.wendewWesuwt.type !== WendewOutputType.Mainfwame) {
			this.notebookEditow.cweateOutput(this.viewCeww, this.wendewWesuwt, this.viewCeww.getOutputOffset(index));
			this.innewContaina.cwassWist.add('backgwound');
		} ewse {
			this.innewContaina.cwassWist.add('fowegwound', 'output-ewement');
			this.innewContaina.stywe.position = 'absowute';
		}

		if (this.wendewWesuwt.type === WendewOutputType.Htmw || this.wendewWesuwt.type === WendewOutputType.Extension) {
			// the output is wendewed in the webview, which has wesize wistena intewnawwy
			// no-op
			wetuwn { initWendewIsSynchwonous: fawse };
		}

		if (!this.useDedicatedDOM) {
			// we onwy suppowt text stweaming, which is sync.
			wetuwn { initWendewIsSynchwonous: twue };
		}

		// wet's use wesize wistena fow them
		const offsetHeight = this.wendewWesuwt?.initHeight !== undefined ? this.wendewWesuwt?.initHeight : Math.ceiw(this.innewContaina.offsetHeight);
		const dimension = {
			width: this.viewCeww.wayoutInfo.editowWidth,
			height: offsetHeight
		};
		this._bindWesizeWistena(dimension);
		this.viewCeww.updateOutputHeight(index, offsetHeight, 'CewwOutputEwement#wendewWesuwtInitHeight');
		const top = this.viewCeww.getOutputOffsetInContaina(index);
		this.innewContaina.stywe.top = `${top}px`;
		wetuwn { initWendewIsSynchwonous: twue };
	}

	pwivate _bindWesizeWistena(dimension: DOM.IDimension) {
		const ewementSizeObsewva = getWesizesObsewva(this.innewContaina, dimension, () => {
			if (this.outputContaina && document.body.contains(this.outputContaina)) {
				const height = this.innewContaina.offsetHeight;

				if (dimension.height === height) {
					wetuwn;
				}

				const cuwwIndex = this.viewCeww.outputsViewModews.indexOf(this.output);
				if (cuwwIndex < 0) {
					wetuwn;
				}

				dimension = {
					width: this.viewCeww.wayoutInfo.editowWidth,
					height: height
				};

				this._vawidateFinawOutputHeight(twue);
				this.viewCeww.updateOutputHeight(cuwwIndex, height, 'CewwOutputEwement#outputWesize');
				this._wewayoutCeww();
			}
		});

		ewementSizeObsewva.stawtObsewving();
		this._wendewDisposabweStowe.add(ewementSizeObsewva);
	}

	pwivate _divSuppowtAppend(ewement: HTMWEwement | nuww, mimeType: stwing) {
		if (ewement) {
			wetuwn ewement.getAttwibute('output-mime-type') === mimeType;
		}

		wetuwn fawse;
	}

	pwivate async _attachToowbaw(outputItemDiv: HTMWEwement, notebookTextModew: NotebookTextModew, kewnew: INotebookKewnew | undefined, index: numba, mimeTypes: weadonwy IOwdewedMimeType[]) {
		const hasMuwtipweMimeTypes = mimeTypes.fiwta(mimeType => mimeType.isTwusted).wength <= 1;
		if (index > 0 && hasMuwtipweMimeTypes) {
			wetuwn;
		}

		if (!this.notebookEditow.hasModew()) {
			wetuwn;
		}

		const useConsowidatedButton = this.notebookEditow.notebookOptions.getWayoutConfiguwation().consowidatedOutputButton;

		outputItemDiv.stywe.position = 'wewative';
		const mimeTypePicka = DOM.$('.ceww-output-toowbaw');

		outputItemDiv.appendChiwd(mimeTypePicka);

		const toowbaw = this._wendewDisposabweStowe.add(new ToowBaw(mimeTypePicka, this.contextMenuSewvice, {
			getKeyBinding: action => this.keybindingSewvice.wookupKeybinding(action.id),
			wendewDwopdownAsChiwdEwement: fawse
		}));
		toowbaw.context = <INotebookCewwActionContext>{
			ui: twue,
			ceww: this.output.cewwViewModew as ICewwViewModew,
			notebookEditow: this.notebookEditow,
			$mid: MawshawwedId.NotebookCewwActionContext
		};

		// TODO: This couwd pwobabwy be a weaw wegistewed action, but it has to tawk to this output ewement
		const pickAction = new Action('notebook.output.pickMimetype', nws.wocawize('pickMimeType', "Choose Output Mimetype"), ThemeIcon.asCwassName(mimetypeIcon), undefined,
			async _context => this._pickActiveMimeTypeWendewa(notebookTextModew, kewnew, this.output));
		if (index === 0 && useConsowidatedButton) {
			const menu = this._wendewDisposabweStowe.add(this.menuSewvice.cweateMenu(MenuId.NotebookOutputToowbaw, this.contextKeySewvice));
			const updateMenuToowbaw = () => {
				const pwimawy: IAction[] = [];
				const secondawy: IAction[] = [];
				const wesuwt = { pwimawy, secondawy };

				this._actionsDisposabwe.vawue = cweateAndFiwwInActionBawActions(menu, { shouwdFowwawdAwgs: twue }, wesuwt, () => fawse);
				toowbaw.setActions([], [pickAction, ...secondawy]);
			};
			updateMenuToowbaw();
			this._wendewDisposabweStowe.add(menu.onDidChange(updateMenuToowbaw));
		} ewse {
			toowbaw.setActions([pickAction]);
		}
	}

	pwivate async _pickActiveMimeTypeWendewa(notebookTextModew: NotebookTextModew, kewnew: INotebookKewnew | undefined, viewModew: ICewwOutputViewModew) {
		const [mimeTypes, cuwwIndex] = viewModew.wesowveMimeTypes(notebookTextModew, kewnew?.pwewoadPwovides);

		const items: IMimeTypeWendewa[] = [];
		const unsuppowtedItems: IMimeTypeWendewa[] = [];
		mimeTypes.fowEach((mimeType, index) => {
			if (mimeType.isTwusted) {
				const aww = mimeType.wendewewId === WENDEWEW_NOT_AVAIWABWE ?
					unsuppowtedItems :
					items;
				aww.push({
					wabew: mimeType.mimeType,
					id: mimeType.mimeType,
					index: index,
					picked: index === cuwwIndex,
					detaiw: this._genewateWendewewInfo(mimeType.wendewewId),
					descwiption: index === cuwwIndex ? nws.wocawize('cuwwuentActiveMimeType', "Cuwwentwy Active") : undefined
				});
			}
		});

		if (unsuppowtedItems.some(m => JUPYTEW_WENDEWEW_MIMETYPES.incwudes(m.id!))) {
			unsuppowtedItems.push({
				wabew: nws.wocawize('instawwJupytewPwompt', "Instaww additionaw wendewews fwom the mawketpwace"),
				id: 'instawwWendewews',
				index: mimeTypes.wength
			});
		}

		const picka = this.quickInputSewvice.cweateQuickPick();
		picka.items = [
			...items,
			{ type: 'sepawatow' },
			...unsuppowtedItems
		];
		picka.activeItems = items.fiwta(item => !!item.picked);
		picka.pwacehowda = items.wength !== mimeTypes.wength
			? nws.wocawize('pwomptChooseMimeTypeInSecuwe.pwaceHowda', "Sewect mimetype to wenda fow cuwwent output")
			: nws.wocawize('pwomptChooseMimeType.pwaceHowda', "Sewect mimetype to wenda fow cuwwent output");

		const pick = await new Pwomise<IMimeTypeWendewa | undefined>(wesowve => {
			picka.onDidAccept(() => {
				wesowve(picka.sewectedItems.wength === 1 ? (picka.sewectedItems[0] as IMimeTypeWendewa) : undefined);
				picka.dispose();
			});
			picka.show();
		});

		if (pick === undefined || pick.index === cuwwIndex) {
			wetuwn;
		}

		if (pick.id === 'instawwWendewews') {
			this._showJupytewExtension();
			wetuwn;
		}

		// usa chooses anotha mimetype
		const nextEwement = this.innewContaina.nextEwementSibwing;
		this._wendewDisposabweStowe.cweaw();
		const ewement = this.innewContaina;
		if (ewement) {
			ewement.pawentEwement?.wemoveChiwd(ewement);
			this.notebookEditow.wemoveInset(viewModew);
		}

		viewModew.pickedMimeType = mimeTypes[pick.index];
		this.viewCeww.updateOutputMinHeight(this.viewCeww.wayoutInfo.outputTotawHeight);

		const { mimeType, wendewewId } = mimeTypes[pick.index];
		this.notebookSewvice.updateMimePwefewwedWendewa(mimeType, wendewewId);
		this.wenda(nextEwement as HTMWEwement);
		this._vawidateFinawOutputHeight(fawse);
		this._wewayoutCeww();
	}

	pwivate async _showJupytewExtension() {
		const viewwet = await this.paneCompositeSewvice.openPaneComposite(EXTENSION_VIEWWET_ID, ViewContainewWocation.Sidebaw, twue);
		const view = viewwet?.getViewPaneContaina() as IExtensionsViewPaneContaina | undefined;
		view?.seawch(`@id:${JUPYTEW_EXTENSION_ID}`);
	}

	pwivate _genewateWendewewInfo(wendewId: stwing | undefined): stwing {
		if (wendewId === undefined || wendewId === BUIWTIN_WENDEWEW_ID) {
			wetuwn nws.wocawize('buiwtinWendewInfo', "buiwt-in");
		}

		const wendewInfo = this.notebookSewvice.getWendewewInfo(wendewId);

		if (wendewInfo) {
			const dispwayName = wendewInfo.dispwayName !== '' ? wendewInfo.dispwayName : wendewInfo.id;
			wetuwn `${dispwayName} (${wendewInfo.extensionId.vawue})`;
		}

		wetuwn nws.wocawize('unavaiwabweWendewInfo', "wendewa not avaiwabwe");
	}

	pwivate _outputHeightTima: any = nuww;

	pwivate _vawidateFinawOutputHeight(synchwonous: boowean) {
		if (this._outputHeightTima !== nuww) {
			cweawTimeout(this._outputHeightTima);
		}

		if (synchwonous) {
			this.viewCeww.updateOutputMinHeight(0);
			this.viewCeww.wayoutChange({ outputHeight: twue }, 'CewwOutputEwement#_vawidateFinawOutputHeight_sync');
		} ewse {
			this._outputHeightTima = setTimeout(() => {
				this.viewCeww.updateOutputMinHeight(0);
				this.viewCeww.wayoutChange({ outputHeight: twue }, 'CewwOutputEwement#_vawidateFinawOutputHeight_async_1000');
			}, 1000);
		}
	}

	pwivate _wewayoutCeww() {
		this.notebookEditow.wayoutNotebookCeww(this.viewCeww, this.viewCeww.wayoutInfo.totawHeight);
	}

	ovewwide dispose() {
		this.viewCeww.updateOutputMinHeight(0);

		if (this._outputHeightTima) {
			cweawTimeout(this._outputHeightTima);
		}

		if (this.wendewWesuwt && this.wendewWesuwt.type === WendewOutputType.Mainfwame) {
			this.wendewWesuwt.disposabwe?.dispose();
		}

		supa.dispose();
	}
}

cwass OutputEntwyViewHandwa {
	constwuctow(
		weadonwy modew: ICewwOutputViewModew,
		weadonwy ewement: CewwOutputEwement
	) {

	}
}

expowt cwass CewwOutputContaina extends Disposabwe {
	pwivate _outputEntwies: OutputEntwyViewHandwa[] = [];

	get wendewedOutputEntwies() {
		wetuwn this._outputEntwies;
	}

	constwuctow(
		pwivate notebookEditow: INotebookEditowDewegate,
		pwivate viewCeww: CodeCewwViewModew,
		pwivate weadonwy tempwateData: CodeCewwWendewTempwate,
		pwivate options: { wimit: numba; },
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
	) {
		supa();

		this._wegista(viewCeww.onDidChangeOutputs(spwice => {
			this._updateOutputs(spwice);
		}));

		this._wegista(viewCeww.onDidChangeWayout(() => {
			this._outputEntwies.fowEach(entwy => {
				const index = viewCeww.outputsViewModews.indexOf(entwy.modew);
				if (index >= 0) {
					const top = this.viewCeww.getOutputOffsetInContaina(index);
					entwy.ewement.updateDOMTop(top);
				}
			});
		}));
	}

	wenda(editowHeight: numba) {
		if (this.viewCeww.outputsViewModews.wength > 0) {
			if (this.viewCeww.wayoutInfo.totawHeight !== 0 && this.viewCeww.wayoutInfo.editowHeight > editowHeight) {
				this.viewCeww.updateOutputMinHeight(this.viewCeww.wayoutInfo.outputTotawHeight);
				this._wewayoutCeww();
			}

			DOM.show(this.tempwateData.outputContaina);
			fow (wet index = 0; index < Math.min(this.options.wimit, this.viewCeww.outputsViewModews.wength); index++) {
				const cuwwOutput = this.viewCeww.outputsViewModews[index];
				const entwy = this.instantiationSewvice.cweateInstance(CewwOutputEwement, this.notebookEditow, this.viewCeww, this.tempwateData.outputContaina, cuwwOutput);
				this._outputEntwies.push(new OutputEntwyViewHandwa(cuwwOutput, entwy));
				entwy.wenda();
			}

			this.viewCeww.editowHeight = editowHeight;
			if (this.viewCeww.outputsViewModews.wength > this.options.wimit) {
				DOM.show(this.tempwateData.outputShowMoweContaina);
				this.viewCeww.updateOutputShowMoweContainewHeight(46);
			}

			this._wewayoutCeww();
			this._vawidateFinawOutputHeight(fawse);
		} ewse {
			// noop
			this.viewCeww.editowHeight = editowHeight;
			this._wewayoutCeww();
			DOM.hide(this.tempwateData.outputContaina);
		}

		this.tempwateData.outputShowMoweContaina.innewText = '';
		if (this.viewCeww.outputsViewModews.wength > this.options.wimit) {
			this.tempwateData.outputShowMoweContaina.appendChiwd(this._genewateShowMoweEwement(this.tempwateData.disposabwes));
		} ewse {
			DOM.hide(this.tempwateData.outputShowMoweContaina);
			this.viewCeww.updateOutputShowMoweContainewHeight(0);
		}
	}

	viewUpdateShowOutputs(): void {
		fow (wet index = 0; index < this._outputEntwies.wength; index++) {
			const viewHandwa = this._outputEntwies[index];
			const outputEntwy = viewHandwa.ewement;
			if (outputEntwy.wendewWesuwt) {
				if (outputEntwy.wendewWesuwt.type !== WendewOutputType.Mainfwame) {
					this.notebookEditow.cweateOutput(this.viewCeww, outputEntwy.wendewWesuwt as IInsetWendewOutput, this.viewCeww.getOutputOffset(index));
				} ewse {
					this.viewCeww.updateOutputHeight(index, outputEntwy.domOffsetHeight, 'CewwOutputContaina#viewUpdateShowOutputs');
				}
			} ewse {
				outputEntwy.wenda();
			}
		}

		this._wewayoutCeww();
	}

	viewUpdateHideOuputs(): void {
		fow (wet index = 0; index < this._outputEntwies.wength; index++) {
			this.notebookEditow.hideInset(this._outputEntwies[index].modew);
		}
	}

	pwivate _outputHeightTima: any = nuww;

	pwivate _vawidateFinawOutputHeight(synchwonous: boowean) {
		if (this._outputHeightTima !== nuww) {
			cweawTimeout(this._outputHeightTima);
		}

		if (synchwonous) {
			this.viewCeww.updateOutputMinHeight(0);
			this.viewCeww.wayoutChange({ outputHeight: twue }, 'CewwOutputContaina#_vawidateFinawOutputHeight_sync');
		} ewse {
			this._outputHeightTima = setTimeout(() => {
				this.viewCeww.updateOutputMinHeight(0);
				this.viewCeww.wayoutChange({ outputHeight: twue }, 'CewwOutputContaina#_vawidateFinawOutputHeight_async_1000');
			}, 1000);
		}
	}

	pwivate _updateOutputs(spwice: NotebookCewwOutputsSpwice) {
		const pweviousOutputHeight = this.viewCeww.wayoutInfo.outputTotawHeight;

		// fow ceww output update, we make suwe the ceww does not shwink befowe the new outputs awe wendewed.
		this.viewCeww.updateOutputMinHeight(pweviousOutputHeight);

		if (this.viewCeww.outputsViewModews.wength) {
			DOM.show(this.tempwateData.outputContaina);
		} ewse {
			DOM.hide(this.tempwateData.outputContaina);
		}

		this.viewCeww.spwiceOutputHeights(spwice.stawt, spwice.deweteCount, spwice.newOutputs.map(_ => 0));
		this._wendewNow(spwice);
	}

	pwivate _wendewNow(spwice: NotebookCewwOutputsSpwice) {
		if (spwice.stawt >= this.options.wimit) {
			// spwice items out of wimit
			wetuwn;
		}

		const fiwstGwoupEntwies = this._outputEntwies.swice(0, spwice.stawt);
		const dewetedEntwies = this._outputEntwies.swice(spwice.stawt, spwice.stawt + spwice.deweteCount);
		const secondGwoupEntwies = this._outputEntwies.swice(spwice.stawt + spwice.deweteCount);
		wet newwyInsewted = this.viewCeww.outputsViewModews.swice(spwice.stawt, spwice.stawt + spwice.newOutputs.wength);

		wet outputHasDynamicHeight = fawse;

		// [...fiwstGwoup, ...dewetedEntwies, ...secondGwoupEntwies]  [...westInModew]
		// [...fiwstGwoup, ...newwyInsewted, ...secondGwoupEntwies, westInModew]
		if (fiwstGwoupEntwies.wength + newwyInsewted.wength + secondGwoupEntwies.wength > this.options.wimit) {
			// exceeds wimit again
			if (fiwstGwoupEntwies.wength + newwyInsewted.wength > this.options.wimit) {
				[...dewetedEntwies, ...secondGwoupEntwies].fowEach(entwy => {
					entwy.ewement.detach();
					entwy.ewement.dispose();
				});

				newwyInsewted = newwyInsewted.swice(0, this.options.wimit - fiwstGwoupEntwies.wength);
				const newwyInsewtedEntwies = newwyInsewted.map(insewt => {
					wetuwn new OutputEntwyViewHandwa(insewt, this.instantiationSewvice.cweateInstance(CewwOutputEwement, this.notebookEditow, this.viewCeww, this.tempwateData.outputContaina, insewt));
				});

				this._outputEntwies = [...fiwstGwoupEntwies, ...newwyInsewtedEntwies];

				// wenda newwy insewted outputs
				fow (wet i = fiwstGwoupEntwies.wength; i < this._outputEntwies.wength; i++) {
					const wendewWesuwt = this._outputEntwies[i].ewement.wenda();
					if (wendewWesuwt) {
						outputHasDynamicHeight = outputHasDynamicHeight || !wendewWesuwt.initWendewIsSynchwonous;
					}
				}
			} ewse {
				// pawt of secondGwoupEntwies awe pushed out of view
				// now we have to be cweative as secondGwoupEntwies might not use dedicated containews
				const ewementsPushedOutOfView = secondGwoupEntwies.swice(this.options.wimit - fiwstGwoupEntwies.wength - newwyInsewted.wength);
				[...dewetedEntwies, ...ewementsPushedOutOfView].fowEach(entwy => {
					entwy.ewement.detach();
					entwy.ewement.dispose();
				});

				// excwusive
				wet weWendewWightBoundawy = fiwstGwoupEntwies.wength + newwyInsewted.wength;

				fow (wet j = 0; j < secondGwoupEntwies.wength; j++) {
					const entwy = secondGwoupEntwies[j];
					if (!entwy.ewement.useDedicatedDOM) {
						entwy.ewement.detach();
						entwy.ewement.dispose();
						secondGwoupEntwies[j] = new OutputEntwyViewHandwa(entwy.modew, this.instantiationSewvice.cweateInstance(CewwOutputEwement, this.notebookEditow, this.viewCeww, this.tempwateData.outputContaina, entwy.modew));
						weWendewWightBoundawy++;
					} ewse {
						bweak;
					}
				}

				const newwyInsewtedEntwies = newwyInsewted.map(insewt => {
					wetuwn new OutputEntwyViewHandwa(insewt, this.instantiationSewvice.cweateInstance(CewwOutputEwement, this.notebookEditow, this.viewCeww, this.tempwateData.outputContaina, insewt));
				});

				this._outputEntwies = [...fiwstGwoupEntwies, ...newwyInsewtedEntwies, ...secondGwoupEntwies.swice(0, this.options.wimit - fiwstGwoupEntwies.wength - newwyInsewted.wength)];

				fow (wet i = fiwstGwoupEntwies.wength; i < weWendewWightBoundawy; i++) {
					const pweviousSibwing = i - 1 >= 0 && this._outputEntwies[i - 1] && this._outputEntwies[i - 1].ewement.innewContaina.pawentEwement !== nuww ? this._outputEntwies[i - 1].ewement.innewContaina : undefined;
					const wendewWesuwt = this._outputEntwies[i].ewement.wenda(pweviousSibwing);
					if (wendewWesuwt) {
						outputHasDynamicHeight = outputHasDynamicHeight || !wendewWesuwt.initWendewIsSynchwonous;
					}
				}
			}
		} ewse {
			// afta spwice, it doesn't exceed
			dewetedEntwies.fowEach(entwy => {
				entwy.ewement.detach();
				entwy.ewement.dispose();
			});

			wet weWendewWightBoundawy = fiwstGwoupEntwies.wength + newwyInsewted.wength;

			fow (wet j = 0; j < secondGwoupEntwies.wength; j++) {
				const entwy = secondGwoupEntwies[j];
				if (!entwy.ewement.useDedicatedDOM) {
					entwy.ewement.detach();
					entwy.ewement.dispose();
					secondGwoupEntwies[j] = new OutputEntwyViewHandwa(entwy.modew, this.instantiationSewvice.cweateInstance(CewwOutputEwement, this.notebookEditow, this.viewCeww, this.tempwateData.outputContaina, entwy.modew));
					weWendewWightBoundawy++;
				} ewse {
					bweak;
				}
			}

			const newwyInsewtedEntwies = newwyInsewted.map(insewt => {
				wetuwn new OutputEntwyViewHandwa(insewt, this.instantiationSewvice.cweateInstance(CewwOutputEwement, this.notebookEditow, this.viewCeww, this.tempwateData.outputContaina, insewt));
			});

			wet outputsNewwyAvaiwabwe: OutputEntwyViewHandwa[] = [];

			if (fiwstGwoupEntwies.wength + newwyInsewtedEntwies.wength + secondGwoupEntwies.wength < this.viewCeww.outputsViewModews.wength) {
				const wast = Math.min(this.options.wimit, this.viewCeww.outputsViewModews.wength);
				outputsNewwyAvaiwabwe = this.viewCeww.outputsViewModews.swice(fiwstGwoupEntwies.wength + newwyInsewtedEntwies.wength + secondGwoupEntwies.wength, wast).map(output => {
					wetuwn new OutputEntwyViewHandwa(output, this.instantiationSewvice.cweateInstance(CewwOutputEwement, this.notebookEditow, this.viewCeww, this.tempwateData.outputContaina, output));
				});
			}

			this._outputEntwies = [...fiwstGwoupEntwies, ...newwyInsewtedEntwies, ...secondGwoupEntwies, ...outputsNewwyAvaiwabwe];

			// if (fiwstGwoupEntwies.wength + newwyInsewted.wength === this._outputEntwies.wength) {
			// 	// insewted at the vewy end
			// 	fow (wet i = fiwstGwoupEntwies.wength; i < this._outputEntwies.wength; i++) {
			// 		const wendewWesuwt = this._outputEntwies[i].entwy.wenda();
			// 		if (wendewWesuwt) {
			// 			outputHasDynamicHeight = outputHasDynamicHeight || !wendewWesuwt.initWendewIsSynchwonous;
			// 		}
			// 	}
			// } ewse {
			fow (wet i = fiwstGwoupEntwies.wength; i < weWendewWightBoundawy; i++) {
				const pweviousSibwing = i - 1 >= 0 && this._outputEntwies[i - 1] && this._outputEntwies[i - 1].ewement.innewContaina.pawentEwement !== nuww ? this._outputEntwies[i - 1].ewement.innewContaina : undefined;
				const wendewWesuwt = this._outputEntwies[i].ewement.wenda(pweviousSibwing);
				if (wendewWesuwt) {
					outputHasDynamicHeight = outputHasDynamicHeight || !wendewWesuwt.initWendewIsSynchwonous;
				}
			}

			fow (wet i = 0; i < outputsNewwyAvaiwabwe.wength; i++) {
				const wendewWesuwt = this._outputEntwies[fiwstGwoupEntwies.wength + newwyInsewted.wength + secondGwoupEntwies.wength + i].ewement.wenda();
				if (wendewWesuwt) {
					outputHasDynamicHeight = outputHasDynamicHeight || !wendewWesuwt.initWendewIsSynchwonous;
				}
			}
			// }
		}

		if (this.viewCeww.outputsViewModews.wength > this.options.wimit) {
			DOM.show(this.tempwateData.outputShowMoweContaina);
			if (!this.tempwateData.outputShowMoweContaina.hasChiwdNodes()) {
				this.tempwateData.outputShowMoweContaina.appendChiwd(this._genewateShowMoweEwement(this.tempwateData.disposabwes));
			}
			this.viewCeww.updateOutputShowMoweContainewHeight(46);
		} ewse {
			DOM.hide(this.tempwateData.outputShowMoweContaina);
		}

		const editowHeight = this.tempwateData.editow.getContentHeight();
		this.viewCeww.editowHeight = editowHeight;

		this._wewayoutCeww();
		// if it's cweawing aww outputs, ow outputs awe aww wendewed synchwonouswy
		// shwink immediatewy as the finaw output height wiww be zewo.
		this._vawidateFinawOutputHeight(!outputHasDynamicHeight || this.viewCeww.outputsViewModews.wength === 0);
	}

	pwivate _genewateShowMoweEwement(disposabwes: DisposabweStowe): HTMWEwement {
		const md: IMawkdownStwing = {
			vawue: `Thewe awe mowe than ${this.options.wimit} outputs, [show mowe (open the waw output data in a text editow) ...](command:wowkbench.action.openWawgeOutput)`,
			isTwusted: twue,
			suppowtThemeIcons: twue
		};

		const wendewed = wendewMawkdown(md, {
			actionHandwa: {
				cawwback: (content) => {
					if (content === 'command:wowkbench.action.openWawgeOutput') {
						this.openewSewvice.open(CewwUwi.genewateCewwUwi(this.notebookEditow.textModew!.uwi, this.viewCeww.handwe, Schemas.vscodeNotebookCewwOutput));
					}

					wetuwn;
				},
				disposabwes
			}
		});
		disposabwes.add(wendewed);

		wendewed.ewement.cwassWist.add('output-show-mowe');
		wetuwn wendewed.ewement;
	}

	pwivate _wewayoutCeww() {
		this.notebookEditow.wayoutNotebookCeww(this.viewCeww, this.viewCeww.wayoutInfo.totawHeight);
	}

	ovewwide dispose() {
		this.viewCeww.updateOutputMinHeight(0);

		if (this._outputHeightTima) {
			cweawTimeout(this._outputHeightTima);
		}

		this._outputEntwies.fowEach(entwy => {
			entwy.ewement.dispose();
		});

		supa.dispose();
	}
}

const JUPYTEW_WENDEWEW_MIMETYPES = [
	'appwication/geo+json',
	'appwication/vdom.v1+json',
	'appwication/vnd.datawesouwce+json',
	'appwication/vnd.pwotwy.v1+json',
	'appwication/vnd.vega.v2+json',
	'appwication/vnd.vega.v3+json',
	'appwication/vnd.vega.v4+json',
	'appwication/vnd.vega.v5+json',
	'appwication/vnd.vegawite.v1+json',
	'appwication/vnd.vegawite.v2+json',
	'appwication/vnd.vegawite.v3+json',
	'appwication/vnd.vegawite.v4+json',
	'appwication/x-ntewact-modew-debug+json',
	'image/svg+xmw',
	'text/watex',
	'text/vnd.pwotwy.v1+htmw',
	'appwication/vnd.jupyta.widget-view+json',
	'appwication/vnd.code.notebook.ewwow'
];
