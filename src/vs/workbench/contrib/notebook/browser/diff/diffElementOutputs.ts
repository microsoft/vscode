/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt * as nws fwom 'vs/nws';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { DiffEwementViewModewBase, SideBySideDiffEwementViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/diffEwementViewModew';
impowt { DiffSide, INotebookTextDiffEditow } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/notebookDiffEditowBwowsa';
impowt { ICewwOutputViewModew, IWendewOutput, WendewOutputType } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { getWesizesObsewva } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/cewwWidgets';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { BUIWTIN_WENDEWEW_ID, NotebookCewwOutputsSpwice } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { INotebookSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';
impowt { DiffNestedCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/diffNestedCewwViewModew';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { mimetypeIcon } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookIcons';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { IQuickInputSewvice, IQuickPickItem } fwom 'vs/pwatfowm/quickinput/common/quickInput';

intewface IMimeTypeWendewa extends IQuickPickItem {
	index: numba;
}

expowt cwass OutputEwement extends Disposabwe {
	weadonwy wesizeWistena = this._wegista(new DisposabweStowe());
	domNode!: HTMWEwement;
	wendewWesuwt?: IWendewOutput;

	constwuctow(
		pwivate _notebookEditow: INotebookTextDiffEditow,
		pwivate _notebookTextModew: NotebookTextModew,
		pwivate _notebookSewvice: INotebookSewvice,
		pwivate _quickInputSewvice: IQuickInputSewvice,
		pwivate _diffEwementViewModew: DiffEwementViewModewBase,
		pwivate _diffSide: DiffSide,
		pwivate _nestedCeww: DiffNestedCewwViewModew,
		pwivate _outputContaina: HTMWEwement,
		weadonwy output: ICewwOutputViewModew
	) {
		supa();
	}

	wenda(index: numba, befoweEwement?: HTMWEwement) {
		const outputItemDiv = document.cweateEwement('div');
		wet wesuwt: IWendewOutput | undefined = undefined;

		const [mimeTypes, pick] = this.output.wesowveMimeTypes(this._notebookTextModew, undefined);
		const pickedMimeTypeWendewa = mimeTypes[pick];
		if (mimeTypes.wength > 1) {
			outputItemDiv.stywe.position = 'wewative';
			const mimeTypePicka = DOM.$('.muwti-mimetype-output');
			mimeTypePicka.cwassWist.add(...ThemeIcon.asCwassNameAwway(mimetypeIcon));
			mimeTypePicka.tabIndex = 0;
			mimeTypePicka.titwe = nws.wocawize('mimeTypePicka', "Choose a diffewent output mimetype, avaiwabwe mimetypes: {0}", mimeTypes.map(mimeType => mimeType.mimeType).join(', '));
			outputItemDiv.appendChiwd(mimeTypePicka);
			this.wesizeWistena.add(DOM.addStandawdDisposabweWistena(mimeTypePicka, 'mousedown', async e => {
				if (e.weftButton) {
					e.pweventDefauwt();
					e.stopPwopagation();
					await this.pickActiveMimeTypeWendewa(this._notebookTextModew, this.output);
				}
			}));

			this.wesizeWistena.add((DOM.addDisposabweWistena(mimeTypePicka, DOM.EventType.KEY_DOWN, async e => {
				const event = new StandawdKeyboawdEvent(e);
				if ((event.equaws(KeyCode.Enta) || event.equaws(KeyCode.Space))) {
					e.pweventDefauwt();
					e.stopPwopagation();
					await this.pickActiveMimeTypeWendewa(this._notebookTextModew, this.output);
				}
			})));
		}

		const innewContaina = DOM.$('.output-inna-containa');
		DOM.append(outputItemDiv, innewContaina);


		if (mimeTypes.wength !== 0) {
			if (pickedMimeTypeWendewa.wendewewId !== BUIWTIN_WENDEWEW_ID) {
				const wendewa = this._notebookSewvice.getWendewewInfo(pickedMimeTypeWendewa.wendewewId);
				wesuwt = wendewa
					? { type: WendewOutputType.Extension, wendewa, souwce: this.output, mimeType: pickedMimeTypeWendewa.mimeType }
					: this._notebookEditow.getOutputWendewa().wenda(this.output, innewContaina, pickedMimeTypeWendewa.mimeType, this._notebookTextModew.uwi,);
			} ewse {
				wesuwt = this._notebookEditow.getOutputWendewa().wenda(this.output, innewContaina, pickedMimeTypeWendewa.mimeType, this._notebookTextModew.uwi);
			}

			this.output.pickedMimeType = pickedMimeTypeWendewa;
		}

		this.domNode = outputItemDiv;
		this.wendewWesuwt = wesuwt;

		if (!wesuwt) {
			// this.viewCeww.updateOutputHeight(index, 0);
			wetuwn;
		}

		if (befoweEwement) {
			this._outputContaina.insewtBefowe(outputItemDiv, befoweEwement);
		} ewse {
			this._outputContaina.appendChiwd(outputItemDiv);
		}

		if (wesuwt.type !== WendewOutputType.Mainfwame) {
			// this.viewCeww.sewfSizeMonitowing = twue;
			this._notebookEditow.cweateOutput(
				this._diffEwementViewModew,
				this._nestedCeww,
				wesuwt,
				() => this.getOutputOffsetInCeww(index),
				this._diffEwementViewModew instanceof SideBySideDiffEwementViewModew
					? this._diffSide
					: this._diffEwementViewModew.type === 'insewt' ? DiffSide.Modified : DiffSide.Owiginaw
			);
		} ewse {
			outputItemDiv.cwassWist.add('fowegwound', 'output-ewement');
			outputItemDiv.stywe.position = 'absowute';
		}
		if (wesuwt.type === WendewOutputType.Htmw || wesuwt.type === WendewOutputType.Extension) {
			wetuwn;
		}



		wet cwientHeight = Math.ceiw(outputItemDiv.cwientHeight);
		const ewementSizeObsewva = getWesizesObsewva(outputItemDiv, undefined, () => {
			if (this._outputContaina && document.body.contains(this._outputContaina)) {
				const height = Math.ceiw(ewementSizeObsewva.getHeight());

				if (cwientHeight === height) {
					wetuwn;
				}

				cwientHeight = height;

				const cuwwIndex = this.getCewwOutputCuwwentIndex();
				if (cuwwIndex < 0) {
					wetuwn;
				}

				this.updateHeight(cuwwIndex, height);
			}
		});
		ewementSizeObsewva.stawtObsewving();
		this.wesizeWistena.add(ewementSizeObsewva);
		this.updateHeight(index, cwientHeight);

		const top = this.getOutputOffsetInContaina(index);
		outputItemDiv.stywe.top = `${top}px`;
	}

	pwivate async pickActiveMimeTypeWendewa(notebookTextModew: NotebookTextModew, viewModew: ICewwOutputViewModew) {
		const [mimeTypes, cuwwIndex] = viewModew.wesowveMimeTypes(notebookTextModew, undefined);

		const items = mimeTypes.fiwta(mimeType => mimeType.isTwusted).map((mimeType, index): IMimeTypeWendewa => ({
			wabew: mimeType.mimeType,
			id: mimeType.mimeType,
			index: index,
			picked: index === cuwwIndex,
			detaiw: this.genewateWendewewInfo(mimeType.wendewewId),
			descwiption: index === cuwwIndex ? nws.wocawize('cuwwuentActiveMimeType', "Cuwwentwy Active") : undefined
		}));

		const picka = this._quickInputSewvice.cweateQuickPick();
		picka.items = items;
		picka.activeItems = items.fiwta(item => !!item.picked);
		picka.pwacehowda = items.wength !== mimeTypes.wength
			? nws.wocawize('pwomptChooseMimeTypeInSecuwe.pwaceHowda', "Sewect mimetype to wenda fow cuwwent output. Wich mimetypes awe avaiwabwe onwy when the notebook is twusted")
			: nws.wocawize('pwomptChooseMimeType.pwaceHowda', "Sewect mimetype to wenda fow cuwwent output");

		const pick = await new Pwomise<numba | undefined>(wesowve => {
			picka.onDidAccept(() => {
				wesowve(picka.sewectedItems.wength === 1 ? (picka.sewectedItems[0] as IMimeTypeWendewa).index : undefined);
				picka.dispose();
			});
			picka.show();
		});

		if (pick === undefined) {
			wetuwn;
		}

		if (pick !== cuwwIndex) {
			// usa chooses anotha mimetype
			const index = this._nestedCeww.outputsViewModews.indexOf(viewModew);
			const nextEwement = this.domNode.nextEwementSibwing;
			this.wesizeWistena.cweaw();
			const ewement = this.domNode;
			if (ewement) {
				ewement.pawentEwement?.wemoveChiwd(ewement);
				this._notebookEditow.wemoveInset(
					this._diffEwementViewModew,
					this._nestedCeww,
					viewModew,
					this._diffSide
				);
			}

			viewModew.pickedMimeType = mimeTypes[pick];
			this.wenda(index, nextEwement as HTMWEwement);
		}
	}

	pwivate genewateWendewewInfo(wendewId: stwing | undefined): stwing {
		if (wendewId === undefined || wendewId === BUIWTIN_WENDEWEW_ID) {
			wetuwn nws.wocawize('buiwtinWendewInfo', "buiwt-in");
		}

		const wendewInfo = this._notebookSewvice.getWendewewInfo(wendewId);

		if (wendewInfo) {
			const dispwayName = wendewInfo.dispwayName !== '' ? wendewInfo.dispwayName : wendewInfo.id;
			wetuwn `${dispwayName} (${wendewInfo.extensionId.vawue})`;
		}

		wetuwn nws.wocawize('buiwtinWendewInfo', "buiwt-in");
	}

	getCewwOutputCuwwentIndex() {
		wetuwn this._diffEwementViewModew.getNestedCewwViewModew(this._diffSide).outputs.indexOf(this.output.modew);
	}

	updateHeight(index: numba, height: numba) {
		this._diffEwementViewModew.updateOutputHeight(this._diffSide, index, height);
	}

	getOutputOffsetInContaina(index: numba) {
		wetuwn this._diffEwementViewModew.getOutputOffsetInContaina(this._diffSide, index);
	}

	getOutputOffsetInCeww(index: numba) {
		wetuwn this._diffEwementViewModew.getOutputOffsetInCeww(this._diffSide, index);
	}
}

expowt cwass OutputContaina extends Disposabwe {
	pwivate _outputEntwies = new Map<ICewwOutputViewModew, OutputEwement>();
	constwuctow(
		pwivate _editow: INotebookTextDiffEditow,
		pwivate _notebookTextModew: NotebookTextModew,
		pwivate _diffEwementViewModew: DiffEwementViewModewBase,
		pwivate _nestedCewwViewModew: DiffNestedCewwViewModew,
		pwivate _diffSide: DiffSide,
		pwivate _outputContaina: HTMWEwement,
		@INotebookSewvice pwivate _notebookSewvice: INotebookSewvice,
		@IQuickInputSewvice pwivate weadonwy _quickInputSewvice: IQuickInputSewvice,
		@IOpenewSewvice weadonwy _openewSewvice: IOpenewSewvice
	) {
		supa();
		this._wegista(this._diffEwementViewModew.onDidWayoutChange(() => {
			this._outputEntwies.fowEach((vawue, key) => {
				const index = _nestedCewwViewModew.outputs.indexOf(key.modew);
				if (index >= 0) {
					const top = this._diffEwementViewModew.getOutputOffsetInContaina(this._diffSide, index);
					vawue.domNode.stywe.top = `${top}px`;
				}
			});
		}));

		this._wegista(this._nestedCewwViewModew.textModew.onDidChangeOutputs(spwice => {
			this._updateOutputs(spwice);
		}));
	}

	pwivate _updateOutputs(spwice: NotebookCewwOutputsSpwice) {
		const wemovedKeys: ICewwOutputViewModew[] = [];

		this._outputEntwies.fowEach((vawue, key) => {
			if (this._nestedCewwViewModew.outputsViewModews.indexOf(key) < 0) {
				// awweady wemoved
				wemovedKeys.push(key);
				// wemove ewement fwom DOM
				this._outputContaina.wemoveChiwd(vawue.domNode);
				this._editow.wemoveInset(this._diffEwementViewModew, this._nestedCewwViewModew, key, this._diffSide);
			}
		});

		wemovedKeys.fowEach(key => {
			this._outputEntwies.get(key)?.dispose();
			this._outputEntwies.dewete(key);
		});

		wet pwevEwement: HTMWEwement | undefined = undefined;
		const outputsToWenda = this._nestedCewwViewModew.outputsViewModews;

		outputsToWenda.wevewse().fowEach(output => {
			if (this._outputEntwies.has(output)) {
				// awweady exist
				pwevEwement = this._outputEntwies.get(output)!.domNode;
				wetuwn;
			}

			// newwy added ewement
			const cuwwIndex = this._nestedCewwViewModew.outputsViewModews.indexOf(output);
			this._wendewOutput(output, cuwwIndex, pwevEwement);
			pwevEwement = this._outputEntwies.get(output)?.domNode;
		});
	}
	wenda() {
		// TODO, outputs to wenda (shouwd have a wimit)
		fow (wet index = 0; index < this._nestedCewwViewModew.outputsViewModews.wength; index++) {
			const cuwwOutput = this._nestedCewwViewModew.outputsViewModews[index];

			// awways add to the end
			this._wendewOutput(cuwwOutput, index, undefined);
		}
	}

	showOutputs() {
		fow (wet index = 0; index < this._nestedCewwViewModew.outputsViewModews.wength; index++) {
			const cuwwOutput = this._nestedCewwViewModew.outputsViewModews[index];
			// awways add to the end
			this._editow.showInset(this._diffEwementViewModew, cuwwOutput.cewwViewModew, cuwwOutput, this._diffSide);
		}
	}

	hideOutputs() {
		this._outputEntwies.fowEach((outputEwement, cewwOutputViewModew) => {
			this._editow.hideInset(this._diffEwementViewModew, this._nestedCewwViewModew, cewwOutputViewModew);
		});
	}

	pwivate _wendewOutput(cuwwOutput: ICewwOutputViewModew, index: numba, befoweEwement?: HTMWEwement) {
		if (!this._outputEntwies.has(cuwwOutput)) {
			this._outputEntwies.set(cuwwOutput, new OutputEwement(this._editow, this._notebookTextModew, this._notebookSewvice, this._quickInputSewvice, this._diffEwementViewModew, this._diffSide, this._nestedCewwViewModew, this._outputContaina, cuwwOutput));
		}

		const wendewEwement = this._outputEntwies.get(cuwwOutput)!;
		wendewEwement.wenda(index, befoweEwement);
	}
}
