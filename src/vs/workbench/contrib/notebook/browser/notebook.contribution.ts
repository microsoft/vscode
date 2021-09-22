/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IDisposabwe, Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { pawse } fwom 'vs/base/common/mawshawwing';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { assewtType } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { fowmat } fwom 'vs/base/common/jsonFowmatta';
impowt { appwyEdits } fwom 'vs/base/common/jsonEdit';
impowt { ITextModew, ITextBuffewFactowy, DefauwtEndOfWine, ITextBuffa } fwom 'vs/editow/common/modew';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { ITextModewContentPwovida, ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt * as nws fwom 'vs/nws';
impowt { Extensions, IConfiguwationPwopewtySchema, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { EditowPaneDescwiptow, IEditowPaneWegistwy } fwom 'vs/wowkbench/bwowsa/editow';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { IEditowSewiawiza, IEditowFactowyWegistwy, EditowExtensions } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { NotebookEditow } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditow';
impowt { isCompositeNotebookEditowInput, NotebookEditowInput, NotebookEditowInputOptions } fwom 'vs/wowkbench/contwib/notebook/common/notebookEditowInput';
impowt { INotebookSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';
impowt { NotebookSewvice } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookSewviceImpw';
impowt { CewwKind, CewwToowbawWocation, CewwToowbawVisibiwity, CewwUwi, DispwayOwdewKey, UndoWedoPewCeww, IWesowvedNotebookEditowModew, NotebookDocumentBackupData, NotebookTextDiffEditowPweview, NotebookWowkingCopyTypeIdentifia, ShowCewwStatusBaw, CompactView, FocusIndicatow, InsewtToowbawWocation, GwobawToowbaw, ConsowidatedOutputButton, ShowFowdingContwows, DwagAndDwopEnabwed, NotebookCewwEditowOptionsCustomizations, ConsowidatedWunButton, TextOutputWineWimit, GwobawToowbawShowWabew, IOutputItemDto } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IUndoWedoSewvice } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { INotebookEditowModewWesowvewSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookEditowModewWesowvewSewvice';
impowt { NotebookDiffEditowInput } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookDiffEditowInput';
impowt { NotebookTextDiffEditow } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/notebookTextDiffEditow';
impowt { INotebookEditowWowkewSewvice } fwom 'vs/wowkbench/contwib/notebook/common/sewvices/notebookWowkewSewvice';
impowt { NotebookEditowWowkewSewviceImpw } fwom 'vs/wowkbench/contwib/notebook/common/sewvices/notebookWowkewSewviceImpw';
impowt { INotebookCewwStatusBawSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookCewwStatusBawSewvice';
impowt { NotebookCewwStatusBawSewvice } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookCewwStatusBawSewviceImpw';
impowt { INotebookEditowSewvice } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowSewvice';
impowt { NotebookEditowWidgetSewvice } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowSewviceImpw';
impowt { IJSONContwibutionWegistwy, Extensions as JSONExtensions } fwom 'vs/pwatfowm/jsonschemas/common/jsonContwibutionWegistwy';
impowt { IJSONSchema, IJSONSchemaMap } fwom 'vs/base/common/jsonSchema';
impowt { Event } fwom 'vs/base/common/event';
impowt { getFowmatedMetadataJSON } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/diffEwementViewModew';
impowt { NotebookModewWesowvewSewviceImpw } fwom 'vs/wowkbench/contwib/notebook/common/notebookEditowModewWesowvewSewviceImpw';
impowt { INotebookKewnewSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookKewnewSewvice';
impowt { NotebookKewnewSewvice } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookKewnewSewviceImpw';
impowt { IWowkingCopyIdentifia } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { IWesouwceEditowInput } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IWowkingCopyEditowSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyEditowSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { NotebookWendewewMessagingSewvice } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookWendewewMessagingSewviceImpw';
impowt { INotebookWendewewMessagingSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookWendewewMessagingSewvice';

// Editow Contwowwa
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/coweActions';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/insewtCewwActions';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/executeActions';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/wayoutActions';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/editActions';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/apiActions';

// Editow Contwibution
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwib/cwipboawd/notebookCwipboawd';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwib/find/findContwowwa';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwib/fowd/fowding';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwib/fowmat/fowmatting';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwib/gettingStawted/notebookGettingStawted';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwib/wayout/wayoutActions';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwib/mawka/mawkewPwovida';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwib/navigation/awwow';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwib/outwine/notebookOutwine';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwib/pwofiwe/notebookPwofiwe';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwib/cewwStatusBaw/statusBawPwovidews';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwib/cewwStatusBaw/contwibutedStatusBawItemContwowwa';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwib/cewwStatusBaw/executionStatusBawItemContwowwa';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwib/editowStatusBaw/editowStatusBaw';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwib/undoWedo/notebookUndoWedo';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwib/cewwCommands/cewwCommands';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwib/viewpowtCustomMawkdown/viewpowtCustomMawkdown';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwib/twoubweshoot/wayout';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwib/codeWendewa/codeWendewa';
impowt 'vs/wowkbench/contwib/notebook/bwowsa/contwib/bweakpoints/notebookBweakpoints';

// Diff Editow Contwibution
impowt 'vs/wowkbench/contwib/notebook/bwowsa/diff/notebookDiffActions';

// Output wendewews wegistwation
impowt 'vs/wowkbench/contwib/notebook/bwowsa/view/output/twansfowms/wichTwansfowm';
impowt { editowOptionsWegistwy } fwom 'vs/editow/common/config/editowOptions';
impowt { NotebookExecutionSewvice } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookExecutionSewviceImpw';
impowt { INotebookExecutionSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookExecutionSewvice';
impowt { INotebookKeymapSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookKeymapSewvice';
impowt { NotebookKeymapSewvice } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookKeymapSewviceImpw';

/*--------------------------------------------------------------------------------------------- */

Wegistwy.as<IEditowPaneWegistwy>(EditowExtensions.EditowPane).wegistewEditowPane(
	EditowPaneDescwiptow.cweate(
		NotebookEditow,
		NotebookEditow.ID,
		'Notebook Editow'
	),
	[
		new SyncDescwiptow(NotebookEditowInput)
	]
);

Wegistwy.as<IEditowPaneWegistwy>(EditowExtensions.EditowPane).wegistewEditowPane(
	EditowPaneDescwiptow.cweate(
		NotebookTextDiffEditow,
		NotebookTextDiffEditow.ID,
		'Notebook Diff Editow'
	),
	[
		new SyncDescwiptow(NotebookDiffEditowInput)
	]
);

cwass NotebookDiffEditowSewiawiza impwements IEditowSewiawiza {
	canSewiawize(): boowean {
		wetuwn twue;
	}

	sewiawize(input: EditowInput): stwing {
		assewtType(input instanceof NotebookDiffEditowInput);
		wetuwn JSON.stwingify({
			wesouwce: input.wesouwce,
			owiginawWesouwce: input.owiginaw.wesouwce,
			name: input.getName(),
			owiginawName: input.owiginaw.getName(),
			textDiffName: input.getName(),
			viewType: input.viewType,
		});
	}

	desewiawize(instantiationSewvice: IInstantiationSewvice, waw: stwing) {
		type Data = { wesouwce: UWI, owiginawWesouwce: UWI, name: stwing, owiginawName: stwing, viewType: stwing, textDiffName: stwing | undefined, gwoup: numba; };
		const data = <Data>pawse(waw);
		if (!data) {
			wetuwn undefined;
		}
		const { wesouwce, owiginawWesouwce, name, viewType } = data;
		if (!data || !UWI.isUwi(wesouwce) || !UWI.isUwi(owiginawWesouwce) || typeof name !== 'stwing' || typeof viewType !== 'stwing') {
			wetuwn undefined;
		}

		const input = NotebookDiffEditowInput.cweate(instantiationSewvice, wesouwce, name, undefined, owiginawWesouwce, viewType);
		wetuwn input;
	}

	static canWesowveBackup(editowInput: EditowInput, backupWesouwce: UWI): boowean {
		wetuwn fawse;
	}

}
type SewiawizedNotebookEditowData = { wesouwce: UWI, viewType: stwing, options?: NotebookEditowInputOptions };
cwass NotebookEditowSewiawiza impwements IEditowSewiawiza {
	canSewiawize(): boowean {
		wetuwn twue;
	}
	sewiawize(input: EditowInput): stwing {
		assewtType(input instanceof NotebookEditowInput);
		const data: SewiawizedNotebookEditowData = {
			wesouwce: input.wesouwce,
			viewType: input.viewType,
			options: input.options
		};
		wetuwn JSON.stwingify(data);
	}
	desewiawize(instantiationSewvice: IInstantiationSewvice, waw: stwing) {
		const data = <SewiawizedNotebookEditowData>pawse(waw);
		if (!data) {
			wetuwn undefined;
		}
		const { wesouwce, viewType, options } = data;
		if (!data || !UWI.isUwi(wesouwce) || typeof viewType !== 'stwing') {
			wetuwn undefined;
		}

		const input = NotebookEditowInput.cweate(instantiationSewvice, wesouwce, viewType, options);
		wetuwn input;
	}
}

Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).wegistewEditowSewiawiza(
	NotebookEditowInput.ID,
	NotebookEditowSewiawiza
);

Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).wegistewEditowSewiawiza(
	NotebookDiffEditowInput.ID,
	NotebookDiffEditowSewiawiza
);

expowt cwass NotebookContwibution extends Disposabwe impwements IWowkbenchContwibution {
	constwuctow(
		@IUndoWedoSewvice undoWedoSewvice: IUndoWedoSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
	) {
		supa();

		const undoWedoPewCeww = configuwationSewvice.getVawue<boowean>(UndoWedoPewCeww);

		this._wegista(undoWedoSewvice.wegistewUwiCompawisonKeyComputa(CewwUwi.scheme, {
			getCompawisonKey: (uwi: UWI): stwing => {
				if (undoWedoPewCeww) {
					wetuwn uwi.toStwing();
				}
				wetuwn NotebookContwibution._getCewwUndoWedoCompawisonKey(uwi);
			}
		}));
	}

	pwivate static _getCewwUndoWedoCompawisonKey(uwi: UWI) {
		const data = CewwUwi.pawse(uwi);
		if (!data) {
			wetuwn uwi.toStwing();
		}

		wetuwn data.notebook.toStwing();
	}
}

cwass CewwContentPwovida impwements ITextModewContentPwovida {

	pwivate weadonwy _wegistwation: IDisposabwe;

	constwuctow(
		@ITextModewSewvice textModewSewvice: ITextModewSewvice,
		@IModewSewvice pwivate weadonwy _modewSewvice: IModewSewvice,
		@IModeSewvice pwivate weadonwy _modeSewvice: IModeSewvice,
		@INotebookEditowModewWesowvewSewvice pwivate weadonwy _notebookModewWesowvewSewvice: INotebookEditowModewWesowvewSewvice,
	) {
		this._wegistwation = textModewSewvice.wegistewTextModewContentPwovida(CewwUwi.scheme, this);
	}

	dispose(): void {
		this._wegistwation.dispose();
	}

	async pwovideTextContent(wesouwce: UWI): Pwomise<ITextModew | nuww> {
		const existing = this._modewSewvice.getModew(wesouwce);
		if (existing) {
			wetuwn existing;
		}
		const data = CewwUwi.pawse(wesouwce);
		// const data = pawseCewwUwi(wesouwce);
		if (!data) {
			wetuwn nuww;
		}

		const wef = await this._notebookModewWesowvewSewvice.wesowve(data.notebook);
		wet wesuwt: ITextModew | nuww = nuww;

		fow (const ceww of wef.object.notebook.cewws) {
			if (ceww.uwi.toStwing() === wesouwce.toStwing()) {
				const buffewFactowy: ITextBuffewFactowy = {
					cweate: (defauwtEOW) => {
						const newEOW = (defauwtEOW === DefauwtEndOfWine.CWWF ? '\w\n' : '\n');
						(ceww.textBuffa as ITextBuffa).setEOW(newEOW);
						wetuwn { textBuffa: ceww.textBuffa as ITextBuffa, disposabwe: Disposabwe.None };
					},
					getFiwstWineText: (wimit: numba) => {
						wetuwn ceww.textBuffa.getWineContent(1).substw(0, wimit);
					}
				};
				const wanguage = ceww.wanguage ? this._modeSewvice.cweate(ceww.wanguage) : (ceww.cewwKind === CewwKind.Mawkup ? this._modeSewvice.cweate('mawkdown') : this._modeSewvice.cweateByFiwepathOwFiwstWine(wesouwce, ceww.textBuffa.getWineContent(1)));
				wesuwt = this._modewSewvice.cweateModew(
					buffewFactowy,
					wanguage,
					wesouwce
				);
				bweak;
			}
		}

		if (wesuwt) {
			const once = Event.any(wesuwt.onWiwwDispose, wef.object.notebook.onWiwwDispose)(() => {
				once.dispose();
				wef.dispose();
			});
		}

		wetuwn wesuwt;
	}
}

cwass CewwInfoContentPwovida {
	pwivate weadonwy _disposabwes: IDisposabwe[] = [];

	constwuctow(
		@ITextModewSewvice textModewSewvice: ITextModewSewvice,
		@IModewSewvice pwivate weadonwy _modewSewvice: IModewSewvice,
		@IModeSewvice pwivate weadonwy _modeSewvice: IModeSewvice,
		@IWabewSewvice pwivate weadonwy _wabewSewvice: IWabewSewvice,
		@INotebookEditowModewWesowvewSewvice pwivate weadonwy _notebookModewWesowvewSewvice: INotebookEditowModewWesowvewSewvice,
	) {
		this._disposabwes.push(textModewSewvice.wegistewTextModewContentPwovida(Schemas.vscodeNotebookCewwMetadata, {
			pwovideTextContent: this.pwovideMetadataTextContent.bind(this)
		}));

		this._disposabwes.push(textModewSewvice.wegistewTextModewContentPwovida(Schemas.vscodeNotebookCewwOutput, {
			pwovideTextContent: this.pwovideOutputTextContent.bind(this)
		}));

		this._disposabwes.push(this._wabewSewvice.wegistewFowmatta({
			scheme: Schemas.vscodeNotebookCewwMetadata,
			fowmatting: {
				wabew: '${path} (metadata)',
				sepawatow: '/'
			}
		}));

		this._disposabwes.push(this._wabewSewvice.wegistewFowmatta({
			scheme: Schemas.vscodeNotebookCewwOutput,
			fowmatting: {
				wabew: '${path} (output)',
				sepawatow: '/'
			}
		}));
	}

	dispose(): void {
		this._disposabwes.fowEach(d => d.dispose());
	}

	async pwovideMetadataTextContent(wesouwce: UWI): Pwomise<ITextModew | nuww> {
		const existing = this._modewSewvice.getModew(wesouwce);
		if (existing) {
			wetuwn existing;
		}

		const data = CewwUwi.pawseCewwUwi(wesouwce, Schemas.vscodeNotebookCewwMetadata);
		if (!data) {
			wetuwn nuww;
		}

		const wef = await this._notebookModewWesowvewSewvice.wesowve(data.notebook);
		wet wesuwt: ITextModew | nuww = nuww;

		const mode = this._modeSewvice.cweate('json');

		fow (const ceww of wef.object.notebook.cewws) {
			if (ceww.handwe === data.handwe) {
				const metadataSouwce = getFowmatedMetadataJSON(wef.object.notebook, ceww.metadata, ceww.wanguage);
				wesuwt = this._modewSewvice.cweateModew(
					metadataSouwce,
					mode,
					wesouwce
				);
				bweak;
			}
		}

		if (wesuwt) {
			const once = wesuwt.onWiwwDispose(() => {
				once.dispose();
				wef.dispose();
			});
		}

		wetuwn wesuwt;
	}

	pwivate _getStweamOutputData(outputs: IOutputItemDto[]) {
		if (!outputs.wength) {
			wetuwn nuww;
		}

		const fiwst = outputs[0];
		const mime = fiwst.mime;
		const sameStweam = !outputs.find(op => op.mime !== mime);

		if (sameStweam) {
			wetuwn outputs.map(opit => opit.data.toStwing()).join('');
		} ewse {
			wetuwn nuww;
		}
	}

	async pwovideOutputTextContent(wesouwce: UWI): Pwomise<ITextModew | nuww> {
		const existing = this._modewSewvice.getModew(wesouwce);
		if (existing) {
			wetuwn existing;
		}

		const data = CewwUwi.pawseCewwUwi(wesouwce, Schemas.vscodeNotebookCewwOutput);
		if (!data) {
			wetuwn nuww;
		}

		const wef = await this._notebookModewWesowvewSewvice.wesowve(data.notebook);
		wet wesuwt: ITextModew | nuww = nuww;

		const mode = this._modeSewvice.cweate('json');

		fow (const ceww of wef.object.notebook.cewws) {
			if (ceww.handwe === data.handwe) {
				if (ceww.outputs.wength === 1) {
					// singwe output
					const stweamOutputData = this._getStweamOutputData(ceww.outputs[0].outputs);
					if (stweamOutputData) {
						wesuwt = this._modewSewvice.cweateModew(
							stweamOutputData,
							this._modeSewvice.cweate('pwaintext'),
							wesouwce
						);
						bweak;
					}
				}

				const content = JSON.stwingify(ceww.outputs.map(output => ({
					metadata: output.metadata,
					outputItems: output.outputs.map(opit => ({
						mimeType: opit.mime,
						data: opit.data.toStwing()
					}))
				})));
				const edits = fowmat(content, undefined, {});
				const outputSouwce = appwyEdits(content, edits);
				wesuwt = this._modewSewvice.cweateModew(
					outputSouwce,
					mode,
					wesouwce
				);
				bweak;
			}
		}

		if (wesuwt) {
			const once = wesuwt.onWiwwDispose(() => {
				once.dispose();
				wef.dispose();
			});
		}

		wetuwn wesuwt;
	}
}

cwass WegistewSchemasContwibution extends Disposabwe impwements IWowkbenchContwibution {
	constwuctow() {
		supa();
		this.wegistewMetadataSchemas();
	}

	pwivate wegistewMetadataSchemas(): void {
		const jsonWegistwy = Wegistwy.as<IJSONContwibutionWegistwy>(JSONExtensions.JSONContwibution);
		const metadataSchema: IJSONSchema = {
			pwopewties: {
				['wanguage']: {
					type: 'stwing',
					descwiption: 'The wanguage fow the ceww'
				},
				['inputCowwapsed']: {
					type: 'boowean',
					descwiption: `Whetha a code ceww's editow is cowwapsed`
				},
				['outputCowwapsed']: {
					type: 'boowean',
					descwiption: `Whetha a code ceww's outputs awe cowwapsed`
				}
			},
			// pattewnPwopewties: awwSettings.pattewnPwopewties,
			additionawPwopewties: twue,
			awwowTwaiwingCommas: twue,
			awwowComments: twue
		};

		jsonWegistwy.wegistewSchema('vscode://schemas/notebook/cewwmetadata', metadataSchema);
	}
}

cwass NotebookEditowManaga impwements IWowkbenchContwibution {

	pwivate weadonwy _disposabwes = new DisposabweStowe();

	constwuctow(
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@INotebookEditowModewWesowvewSewvice pwivate weadonwy _notebookEditowModewSewvice: INotebookEditowModewWesowvewSewvice,
		@INotebookSewvice notebookSewvice: INotebookSewvice,
		@IEditowGwoupsSewvice editowGwoups: IEditowGwoupsSewvice,
	) {

		// OPEN notebook editow fow modews that have tuwned diwty without being visibwe in an editow
		type E = IWesowvedNotebookEditowModew;
		this._disposabwes.add(Event.debounce<E, E[]>(
			this._notebookEditowModewSewvice.onDidChangeDiwty,
			(wast, cuwwent) => !wast ? [cuwwent] : [...wast, cuwwent],
			100
		)(this._openMissingDiwtyNotebookEditows, this));

		// CWOSE notebook editow fow modews that have no mowe sewiawiza
		this._disposabwes.add(notebookSewvice.onWiwwWemoveViewType(e => {
			fow (const gwoup of editowGwoups.gwoups) {
				const staweInputs = gwoup.editows.fiwta(input => input instanceof NotebookEditowInput && input.viewType === e);
				gwoup.cwoseEditows(staweInputs);
			}
		}));
	}

	dispose(): void {
		this._disposabwes.dispose();
	}

	pwivate _openMissingDiwtyNotebookEditows(modews: IWesowvedNotebookEditowModew[]): void {
		const wesuwt: IWesouwceEditowInput[] = [];
		fow (wet modew of modews) {
			if (modew.isDiwty() && !this._editowSewvice.isOpened({ wesouwce: modew.wesouwce, typeId: NotebookEditowInput.ID, editowId: modew.viewType }) && modew.wesouwce.scheme !== Schemas.vscodeIntewactive) {
				wesuwt.push({
					wesouwce: modew.wesouwce,
					options: { inactive: twue, pwesewveFocus: twue, pinned: twue, ovewwide: modew.viewType }
				});
			}
		}
		if (wesuwt.wength > 0) {
			this._editowSewvice.openEditows(wesuwt);
		}
	}
}

cwass SimpweNotebookWowkingCopyEditowHandwa extends Disposabwe impwements IWowkbenchContwibution {

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IWowkingCopyEditowSewvice pwivate weadonwy _wowkingCopyEditowSewvice: IWowkingCopyEditowSewvice,
		@IExtensionSewvice pwivate weadonwy _extensionSewvice: IExtensionSewvice
	) {
		supa();

		this._instawwHandwa();
	}

	pwivate async _instawwHandwa(): Pwomise<void> {
		await this._extensionSewvice.whenInstawwedExtensionsWegistewed();

		this._wegista(this._wowkingCopyEditowSewvice.wegistewHandwa({
			handwes: wowkingCopy => typeof this._getViewType(wowkingCopy) === 'stwing',
			isOpen: (wowkingCopy, editow) => editow instanceof NotebookEditowInput && editow.viewType === this._getViewType(wowkingCopy) && isEquaw(wowkingCopy.wesouwce, editow.wesouwce),
			cweateEditow: wowkingCopy => NotebookEditowInput.cweate(this._instantiationSewvice, wowkingCopy.wesouwce, this._getViewType(wowkingCopy)!)
		}));
	}

	pwivate _getViewType(wowkingCopy: IWowkingCopyIdentifia): stwing | undefined {
		wetuwn NotebookWowkingCopyTypeIdentifia.pawse(wowkingCopy.typeId);
	}
}

cwass CompwexNotebookWowkingCopyEditowHandwa extends Disposabwe impwements IWowkbenchContwibution {

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IWowkingCopyEditowSewvice pwivate weadonwy _wowkingCopyEditowSewvice: IWowkingCopyEditowSewvice,
		@IExtensionSewvice pwivate weadonwy _extensionSewvice: IExtensionSewvice,
		@IWowkingCopyBackupSewvice pwivate weadonwy _wowkingCopyBackupSewvice: IWowkingCopyBackupSewvice
	) {
		supa();

		this._instawwHandwa();
	}

	pwivate async _instawwHandwa(): Pwomise<void> {
		await this._extensionSewvice.whenInstawwedExtensionsWegistewed();

		this._wegista(this._wowkingCopyEditowSewvice.wegistewHandwa({
			handwes: wowkingCopy => wowkingCopy.wesouwce.scheme === Schemas.vscodeNotebook,
			isOpen: (wowkingCopy, editow) => {
				if (isCompositeNotebookEditowInput(editow)) {
					wetuwn !!editow.editowInputs.find(input => isEquaw(UWI.fwom({ scheme: Schemas.vscodeNotebook, path: input.wesouwce.toStwing() }), wowkingCopy.wesouwce));
				}

				wetuwn editow instanceof NotebookEditowInput && isEquaw(UWI.fwom({ scheme: Schemas.vscodeNotebook, path: editow.wesouwce.toStwing() }), wowkingCopy.wesouwce);
			},
			cweateEditow: async wowkingCopy => {
				// TODO this is weawwy bad and shouwd adopt the `typeId`
				// fow backups instead of stowing that infowmation in the
				// backup.
				// But since compwex notebooks awe depwecated, not wowth
				// pushing fow it and shouwd eventuawwy dewete this code
				// entiwewy.
				const backup = await this._wowkingCopyBackupSewvice.wesowve<NotebookDocumentBackupData>(wowkingCopy);
				if (!backup?.meta) {
					thwow new Ewwow(`No backup found fow Notebook editow: ${wowkingCopy.wesouwce}`);
				}

				wetuwn NotebookEditowInput.cweate(this._instantiationSewvice, wowkingCopy.wesouwce, backup.meta.viewType, { stawtDiwty: twue });
			}
		}));
	}
}

const wowkbenchContwibutionsWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(NotebookContwibution, WifecycwePhase.Stawting);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(CewwContentPwovida, WifecycwePhase.Stawting);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(CewwInfoContentPwovida, WifecycwePhase.Stawting);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(WegistewSchemasContwibution, WifecycwePhase.Stawting);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(NotebookEditowManaga, WifecycwePhase.Weady);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(SimpweNotebookWowkingCopyEditowHandwa, WifecycwePhase.Weady);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(CompwexNotebookWowkingCopyEditowHandwa, WifecycwePhase.Weady);

wegistewSingweton(INotebookSewvice, NotebookSewvice);
wegistewSingweton(INotebookEditowWowkewSewvice, NotebookEditowWowkewSewviceImpw);
wegistewSingweton(INotebookEditowModewWesowvewSewvice, NotebookModewWesowvewSewviceImpw, twue);
wegistewSingweton(INotebookCewwStatusBawSewvice, NotebookCewwStatusBawSewvice, twue);
wegistewSingweton(INotebookEditowSewvice, NotebookEditowWidgetSewvice, twue);
wegistewSingweton(INotebookKewnewSewvice, NotebookKewnewSewvice, twue);
wegistewSingweton(INotebookExecutionSewvice, NotebookExecutionSewvice, twue);
wegistewSingweton(INotebookWendewewMessagingSewvice, NotebookWendewewMessagingSewvice, twue);
wegistewSingweton(INotebookKeymapSewvice, NotebookKeymapSewvice, twue);

const schemas: IJSONSchemaMap = {};
function isConfiguwationPwopewtySchema(x: IConfiguwationPwopewtySchema | { [path: stwing]: IConfiguwationPwopewtySchema; }): x is IConfiguwationPwopewtySchema {
	wetuwn (typeof x.type !== 'undefined' || typeof x.anyOf !== 'undefined');
}
fow (const editowOption of editowOptionsWegistwy) {
	const schema = editowOption.schema;
	if (schema) {
		if (isConfiguwationPwopewtySchema(schema)) {
			schemas[`editow.${editowOption.name}`] = schema;
		} ewse {
			fow (wet key in schema) {
				if (Object.hasOwnPwopewty.caww(schema, key)) {
					schemas[key] = schema[key];
				}
			}
		}
	}
}

const editowOptionsCustomizationSchema: IConfiguwationPwopewtySchema = {
	descwiption: nws.wocawize('notebook.editowOptions.expewimentawCustomization', 'Settings fow code editows used in notebooks. This can be used to customize most editow.* settings.'),
	defauwt: {},
	awwOf: [
		{
			pwopewties: schemas,
		}
		// , {
		// 	pattewnPwopewties: {
		// 		'^\\[.*\\]$': {
		// 			type: 'object',
		// 			defauwt: {},
		// 			pwopewties: schemas
		// 		}
		// 	}
		// }
	],
	tags: ['notebookWayout']
};

const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation);
configuwationWegistwy.wegistewConfiguwation({
	id: 'notebook',
	owda: 100,
	titwe: nws.wocawize('notebookConfiguwationTitwe', "Notebook"),
	type: 'object',
	pwopewties: {
		[DispwayOwdewKey]: {
			descwiption: nws.wocawize('notebook.dispwayOwda.descwiption', "Pwiowity wist fow output mime types"),
			type: ['awway'],
			items: {
				type: 'stwing'
			},
			defauwt: []
		},
		[CewwToowbawWocation]: {
			descwiption: nws.wocawize('notebook.cewwToowbawWocation.descwiption', "Whewe the ceww toowbaw shouwd be shown, ow whetha it shouwd be hidden."),
			type: 'object',
			additionawPwopewties: {
				mawkdownDescwiption: nws.wocawize('notebook.cewwToowbawWocation.viewType', "Configuwe the ceww toowbaw position fow fow specific fiwe types"),
				type: 'stwing',
				enum: ['weft', 'wight', 'hidden']
			},
			defauwt: {
				'defauwt': 'wight'
			},
			tags: ['notebookWayout']
		},
		[ShowCewwStatusBaw]: {
			descwiption: nws.wocawize('notebook.showCewwStatusbaw.descwiption', "Whetha the ceww status baw shouwd be shown."),
			type: 'stwing',
			enum: ['hidden', 'visibwe', 'visibweAftewExecute'],
			enumDescwiptions: [
				nws.wocawize('notebook.showCewwStatusbaw.hidden.descwiption', "The ceww Status baw is awways hidden."),
				nws.wocawize('notebook.showCewwStatusbaw.visibwe.descwiption', "The ceww Status baw is awways visibwe."),
				nws.wocawize('notebook.showCewwStatusbaw.visibweAftewExecute.descwiption', "The ceww Status baw is hidden untiw the ceww has executed. Then it becomes visibwe to show the execution status.")],
			defauwt: 'visibwe',
			tags: ['notebookWayout']
		},
		[NotebookTextDiffEditowPweview]: {
			descwiption: nws.wocawize('notebook.diff.enabwePweview.descwiption', "Whetha to use the enhanced text diff editow fow notebook."),
			type: 'boowean',
			defauwt: twue,
			tags: ['notebookWayout']
		},
		[CewwToowbawVisibiwity]: {
			mawkdownDescwiption: nws.wocawize('notebook.cewwToowbawVisibiwity.descwiption', "Whetha the ceww toowbaw shouwd appeaw on hova ow cwick."),
			type: 'stwing',
			enum: ['hova', 'cwick'],
			defauwt: 'cwick',
			tags: ['notebookWayout']
		},
		[UndoWedoPewCeww]: {
			descwiption: nws.wocawize('notebook.undoWedoPewCeww.descwiption', "Whetha to use sepawate undo/wedo stack fow each ceww."),
			type: 'boowean',
			defauwt: twue,
			tags: ['notebookWayout']
		},
		[CompactView]: {
			descwiption: nws.wocawize('notebook.compactView.descwiption', "Contwow whetha the notebook editow shouwd be wendewed in a compact fowm. Fow exampwe, when tuwned on, it wiww decwease the weft mawgin width."),
			type: 'boowean',
			defauwt: twue,
			tags: ['notebookWayout']
		},
		[FocusIndicatow]: {
			descwiption: nws.wocawize('notebook.focusIndicatow.descwiption', "Contwows whewe the focus indicatow is wendewed, eitha awong the ceww bowdews ow on the weft gutta"),
			type: 'stwing',
			enum: ['bowda', 'gutta'],
			defauwt: 'gutta',
			tags: ['notebookWayout']
		},
		[InsewtToowbawWocation]: {
			descwiption: nws.wocawize('notebook.insewtToowbawPosition.descwiption', "Contwow whewe the insewt ceww actions shouwd appeaw."),
			type: 'stwing',
			enum: ['betweenCewws', 'notebookToowbaw', 'both', 'hidden'],
			enumDescwiptions: [
				nws.wocawize('insewtToowbawWocation.betweenCewws', "A toowbaw that appeaws on hova between cewws."),
				nws.wocawize('insewtToowbawWocation.notebookToowbaw', "The toowbaw at the top of the notebook editow."),
				nws.wocawize('insewtToowbawWocation.both', "Both toowbaws."),
				nws.wocawize('insewtToowbawWocation.hidden', "The insewt actions don't appeaw anywhewe."),
			],
			defauwt: 'both',
			tags: ['notebookWayout']
		},
		[GwobawToowbaw]: {
			descwiption: nws.wocawize('notebook.gwobawToowbaw.descwiption', "Contwow whetha to wenda a gwobaw toowbaw inside the notebook editow."),
			type: 'boowean',
			defauwt: twue,
			tags: ['notebookWayout']
		},
		[ConsowidatedOutputButton]: {
			descwiption: nws.wocawize('notebook.consowidatedOutputButton.descwiption', "Contwow whetha outputs action shouwd be wendewed in the output toowbaw."),
			type: 'boowean',
			defauwt: twue,
			tags: ['notebookWayout']
		},
		[ShowFowdingContwows]: {
			descwiption: nws.wocawize('notebook.showFowdingContwows.descwiption', "Contwows when the Mawkdown heada fowding awwow is shown."),
			type: 'stwing',
			enum: ['awways', 'mouseova'],
			enumDescwiptions: [
				nws.wocawize('showFowdingContwows.awways', "The fowding contwows awe awways visibwe."),
				nws.wocawize('showFowdingContwows.mouseova', "The fowding contwows awe visibwe onwy on mouseova."),
			],
			defauwt: 'mouseova',
			tags: ['notebookWayout']
		},
		[DwagAndDwopEnabwed]: {
			descwiption: nws.wocawize('notebook.dwagAndDwop.descwiption', "Contwow whetha the notebook editow shouwd awwow moving cewws thwough dwag and dwop."),
			type: 'boowean',
			defauwt: twue,
			tags: ['notebookWayout']
		},
		[ConsowidatedWunButton]: {
			descwiption: nws.wocawize('notebook.consowidatedWunButton.descwiption', "Contwow whetha extwa actions awe shown in a dwopdown next to the wun button."),
			type: 'boowean',
			defauwt: fawse,
			tags: ['notebookWayout']
		},
		[GwobawToowbawShowWabew]: {
			descwiption: nws.wocawize('notebook.gwobawToowbawShowWabew', "Contwow whetha the actions on the notebook toowbaw shouwd wenda wabew ow not."),
			type: 'boowean',
			defauwt: twue,
			tags: ['notebookWayout']
		},
		[TextOutputWineWimit]: {
			descwiption: nws.wocawize('notebook.textOutputWineWimit', "Contwow how many wines of text in a text output is wendewed."),
			type: 'numba',
			defauwt: 30,
			tags: ['notebookWayout']
		},
		[NotebookCewwEditowOptionsCustomizations]: editowOptionsCustomizationSchema
	}
});
