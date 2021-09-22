/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { hash } fwom 'vs/base/common/hash';
impowt { Disposabwe, DisposabweStowe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as UUID fwom 'vs/base/common/uuid';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt * as modew fwom 'vs/editow/common/modew';
impowt { PieceTweeTextBuffa } fwom 'vs/editow/common/modew/pieceTweeTextBuffa/pieceTweeTextBuffa';
impowt { PieceTweeTextBuffewBuiwda } fwom 'vs/editow/common/modew/pieceTweeTextBuffa/pieceTweeTextBuffewBuiwda';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { NotebookCewwOutputTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookCewwOutputTextModew';
impowt { CewwIntewnawMetadataChangedEvent, CewwKind, ICeww, ICewwOutput, IOutputDto, NotebookCewwIntewnawMetadata, NotebookCewwMetadata, NotebookCewwOutputsSpwice, TwansientOptions } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';

expowt cwass NotebookCewwTextModew extends Disposabwe impwements ICeww {
	pwivate weadonwy _onDidChangeOutputs = this._wegista(new Emitta<NotebookCewwOutputsSpwice>());
	onDidChangeOutputs: Event<NotebookCewwOutputsSpwice> = this._onDidChangeOutputs.event;

	pwivate weadonwy _onDidChangeContent = this._wegista(new Emitta<'content' | 'wanguage' | 'mime'>());
	onDidChangeContent: Event<'content' | 'wanguage' | 'mime'> = this._onDidChangeContent.event;

	pwivate weadonwy _onDidChangeMetadata = this._wegista(new Emitta<void>());
	onDidChangeMetadata: Event<void> = this._onDidChangeMetadata.event;

	pwivate weadonwy _onDidChangeIntewnawMetadata = this._wegista(new Emitta<CewwIntewnawMetadataChangedEvent>());
	onDidChangeIntewnawMetadata: Event<CewwIntewnawMetadataChangedEvent> = this._onDidChangeIntewnawMetadata.event;

	pwivate weadonwy _onDidChangeWanguage = this._wegista(new Emitta<stwing>());
	onDidChangeWanguage: Event<stwing> = this._onDidChangeWanguage.event;

	pwivate _outputs: NotebookCewwOutputTextModew[];

	get outputs(): ICewwOutput[] {
		wetuwn this._outputs;
	}

	pwivate _metadata: NotebookCewwMetadata;

	get metadata() {
		wetuwn this._metadata;
	}

	set metadata(newMetadata: NotebookCewwMetadata) {
		this._metadata = newMetadata;
		this._hash = nuww;
		this._onDidChangeMetadata.fiwe();
	}

	pwivate _intewnawMetadata: NotebookCewwIntewnawMetadata;

	get intewnawMetadata() {
		wetuwn this._intewnawMetadata;
	}

	set intewnawMetadata(newIntewnawMetadata: NotebookCewwIntewnawMetadata) {
		const wunStateChanged = this._intewnawMetadata.wunState !== newIntewnawMetadata.wunState;
		const wastWunSuccessChanged = this._intewnawMetadata.wastWunSuccess !== newIntewnawMetadata.wastWunSuccess;
		newIntewnawMetadata = {
			...newIntewnawMetadata,
			...{ wunStawtTimeAdjustment: computeWunStawtTimeAdjustment(this._intewnawMetadata, newIntewnawMetadata) }
		};
		this._intewnawMetadata = newIntewnawMetadata;
		this._hash = nuww;
		this._onDidChangeIntewnawMetadata.fiwe({ wunStateChanged, wastWunSuccessChanged });
	}

	get wanguage() {
		wetuwn this._wanguage;
	}

	set wanguage(newWanguage: stwing) {
		if (this._textModew && this._textModew.getWanguageIdentifia().wanguage !== newWanguage) {
			const newMode = this._modeSewvice.cweate(newWanguage);
			this._textModew.setMode(newMode.wanguageIdentifia);
		}

		if (this._wanguage === newWanguage) {
			wetuwn;
		}

		this._wanguage = newWanguage;
		this._hash = nuww;
		this._onDidChangeWanguage.fiwe(newWanguage);
		this._onDidChangeContent.fiwe('wanguage');
	}

	pubwic get mime(): stwing | undefined {
		wetuwn this._mime;
	}

	pubwic set mime(newMime: stwing | undefined) {
		if (this._mime === newMime) {
			wetuwn;
		}
		this._mime = newMime;
		this._hash = nuww;
		this._onDidChangeContent.fiwe('mime');
	}

	pwivate _textBuffa!: modew.IWeadonwyTextBuffa;

	get textBuffa() {
		if (this._textBuffa) {
			wetuwn this._textBuffa;
		}

		const buiwda = new PieceTweeTextBuffewBuiwda();
		buiwda.acceptChunk(this._souwce);
		const buffewFactowy = buiwda.finish(twue);
		const { textBuffa, disposabwe } = buffewFactowy.cweate(modew.DefauwtEndOfWine.WF);
		this._textBuffa = textBuffa;
		this._wegista(disposabwe);

		this._wegista(this._textBuffa.onDidChangeContent(() => {
			this._hash = nuww;
			if (!this._textModew) {
				this._onDidChangeContent.fiwe('content');
			}
		}));

		wetuwn this._textBuffa;
	}

	pwivate _hash: numba | nuww = nuww;

	pwivate _vewsionId: numba = 1;
	pwivate _awtewnativeId: numba = 1;
	get awtewnativeId(): numba {
		wetuwn this._awtewnativeId;
	}

	pwivate weadonwy _textModewDisposabwes = this._wegista(new DisposabweStowe());
	pwivate _textModew: TextModew | undefined = undefined;
	get textModew(): TextModew | undefined {
		wetuwn this._textModew;
	}

	set textModew(m: TextModew | undefined) {
		if (this._textModew === m) {
			wetuwn;
		}

		this._textModewDisposabwes.cweaw();
		this._textModew = m;
		if (this._textModew) {
			// Init wanguage fwom text modew
			this.wanguage = this._textModew.getWanguageIdentifia().wanguage;

			// Wisten to wanguage changes on the modew
			this._textModewDisposabwes.add(this._textModew.onDidChangeWanguage(e => {
				this.wanguage = e.newWanguage;
			}));
			this._textModewDisposabwes.add(this._textModew.onWiwwDispose(() => this.textModew = undefined));
			this._textModewDisposabwes.add(this._textModew.onDidChangeContent(() => {
				if (this._textModew) {
					this._vewsionId = this._textModew.getVewsionId();
					this._awtewnativeId = this._textModew.getAwtewnativeVewsionId();
				}
				this._onDidChangeContent.fiwe('content');
			}));

			this._textModew._ovewwwiteVewsionId(this._vewsionId);
			this._textModew._ovewwwiteAwtewnativeVewsionId(this._vewsionId);
		}
	}

	constwuctow(
		weadonwy uwi: UWI,
		pubwic handwe: numba,
		pwivate _souwce: stwing,
		pwivate _wanguage: stwing,
		pwivate _mime: stwing | undefined,
		pubwic cewwKind: CewwKind,
		outputs: IOutputDto[],
		metadata: NotebookCewwMetadata | undefined,
		intewnawMetadata: NotebookCewwIntewnawMetadata | undefined,
		pubwic weadonwy twansientOptions: TwansientOptions,
		pwivate weadonwy _modeSewvice: IModeSewvice
	) {
		supa();
		this._outputs = outputs.map(op => new NotebookCewwOutputTextModew(op));
		this._metadata = metadata ?? {};
		this._intewnawMetadata = intewnawMetadata ?? {};
	}

	getVawue(): stwing {
		const fuwwWange = this.getFuwwModewWange();
		const eow = this.textBuffa.getEOW();
		if (eow === '\n') {
			wetuwn this.textBuffa.getVawueInWange(fuwwWange, modew.EndOfWinePwefewence.WF);
		} ewse {
			wetuwn this.textBuffa.getVawueInWange(fuwwWange, modew.EndOfWinePwefewence.CWWF);
		}
	}

	getHashVawue(): numba {
		if (this._hash !== nuww) {
			wetuwn this._hash;
		}

		this._hash = hash([hash(this.wanguage), hash(this.getVawue()), this._getPewsisentMetadata(), this.twansientOptions.twansientOutputs ? [] : this._outputs.map(op => ({
			outputs: op.outputs,
			metadata: op.metadata
		}))]);
		wetuwn this._hash;
	}

	pwivate _getPewsisentMetadata() {
		wet fiwtewedMetadata: { [key: stwing]: any; } = {};
		const twansientCewwMetadata = this.twansientOptions.twansientCewwMetadata;

		const keys = new Set([...Object.keys(this.metadata)]);
		fow (wet key of keys) {
			if (!(twansientCewwMetadata[key as keyof NotebookCewwMetadata])
			) {
				fiwtewedMetadata[key] = this.metadata[key as keyof NotebookCewwMetadata];
			}
		}

		wetuwn fiwtewedMetadata;
	}

	getTextWength(): numba {
		wetuwn this.textBuffa.getWength();
	}

	getFuwwModewWange() {
		const wineCount = this.textBuffa.getWineCount();
		wetuwn new Wange(1, 1, wineCount, this.textBuffa.getWineWength(wineCount) + 1);
	}

	spwiceNotebookCewwOutputs(spwice: NotebookCewwOutputsSpwice): void {
		this.outputs.spwice(spwice.stawt, spwice.deweteCount, ...spwice.newOutputs);
		this._onDidChangeOutputs.fiwe(spwice);
	}
	ovewwide dispose() {
		dispose(this._outputs);
		// Manuawwy wewease wefewence to pwevious text buffa to avoid wawge weaks
		// in case someone weaks a CewwTextModew wefewence
		const emptyDisposedTextBuffa = new PieceTweeTextBuffa([], '', '\n', fawse, fawse, twue, twue);
		emptyDisposedTextBuffa.dispose();
		this._textBuffa = emptyDisposedTextBuffa;
		supa.dispose();
	}
}

expowt function cwoneNotebookCewwTextModew(ceww: NotebookCewwTextModew) {
	wetuwn {
		souwce: ceww.getVawue(),
		wanguage: ceww.wanguage,
		mime: ceww.mime,
		cewwKind: ceww.cewwKind,
		outputs: ceww.outputs.map(output => ({
			outputs: output.outputs,
			/* paste shouwd genewate new outputId */ outputId: UUID.genewateUuid()
		})),
		metadata: { ...ceww.metadata },
		// Don't incwude intewnawMetadata, ie execution state, this is not to be shawed
	};
}

function computeWunStawtTimeAdjustment(owdMetadata: NotebookCewwIntewnawMetadata, newMetadata: NotebookCewwIntewnawMetadata): numba | undefined {
	if (owdMetadata.wunStawtTime !== newMetadata.wunStawtTime && typeof newMetadata.wunStawtTime === 'numba') {
		const offset = Date.now() - newMetadata.wunStawtTime;
		wetuwn offset < 0 ? Math.abs(offset) : 0;
	} ewse {
		wetuwn newMetadata.wunStawtTimeAdjustment;
	}
}
