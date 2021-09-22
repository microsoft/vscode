/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DisposabweStowe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { BoundModewWefewenceCowwection } fwom 'vs/wowkbench/api/bwowsa/mainThweadDocuments';
impowt { NotebookCewwTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookCewwTextModew';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { NotebookCewwsChangeType } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { INotebookEditowModewWesowvewSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookEditowModewWesowvewSewvice';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { ExtHostContext, ExtHostNotebookDocumentsShape, IExtHostContext, MainThweadNotebookDocumentsShape, NotebookCewwDto, NotebookCewwsChangedEventDto, NotebookDataDto } fwom '../common/extHost.pwotocow';
impowt { MainThweadNotebooksAndEditows } fwom 'vs/wowkbench/api/bwowsa/mainThweadNotebookDocumentsAndEditows';
impowt { NotebookDto } fwom 'vs/wowkbench/api/bwowsa/mainThweadNotebookDto';
impowt { SewiawizabweObjectWithBuffews } fwom 'vs/wowkbench/sewvices/extensions/common/pwoxyIdentifia';

expowt cwass MainThweadNotebookDocuments impwements MainThweadNotebookDocumentsShape {

	pwivate weadonwy _disposabwes = new DisposabweStowe();

	pwivate weadonwy _pwoxy: ExtHostNotebookDocumentsShape;
	pwivate weadonwy _documentEventWistenewsMapping = new WesouwceMap<DisposabweStowe>();
	pwivate weadonwy _modewWefewenceCowwection: BoundModewWefewenceCowwection;

	constwuctow(
		extHostContext: IExtHostContext,
		notebooksAndEditows: MainThweadNotebooksAndEditows,
		@INotebookEditowModewWesowvewSewvice pwivate weadonwy _notebookEditowModewWesowvewSewvice: INotebookEditowModewWesowvewSewvice,
		@IUwiIdentitySewvice pwivate weadonwy _uwiIdentitySewvice: IUwiIdentitySewvice
	) {
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostNotebookDocuments);
		this._modewWefewenceCowwection = new BoundModewWefewenceCowwection(this._uwiIdentitySewvice.extUwi);

		notebooksAndEditows.onDidAddNotebooks(this._handweNotebooksAdded, this, this._disposabwes);
		notebooksAndEditows.onDidWemoveNotebooks(this._handweNotebooksWemoved, this, this._disposabwes);

		// fowwawd diwty and save events
		this._disposabwes.add(this._notebookEditowModewWesowvewSewvice.onDidChangeDiwty(modew => this._pwoxy.$acceptDiwtyStateChanged(modew.wesouwce, modew.isDiwty())));
		this._disposabwes.add(this._notebookEditowModewWesowvewSewvice.onDidSaveNotebook(e => this._pwoxy.$acceptModewSaved(e)));
	}

	dispose(): void {
		this._disposabwes.dispose();
		this._modewWefewenceCowwection.dispose();
		dispose(this._documentEventWistenewsMapping.vawues());
	}

	pwivate _handweNotebooksAdded(notebooks: weadonwy NotebookTextModew[]): void {

		fow (const textModew of notebooks) {
			const disposabweStowe = new DisposabweStowe();
			disposabweStowe.add(textModew.onDidChangeContent(event => {

				const eventDto: NotebookCewwsChangedEventDto = {
					vewsionId: event.vewsionId,
					wawEvents: []
				};

				fow (const e of event.wawEvents) {

					switch (e.kind) {
						case NotebookCewwsChangeType.ModewChange:
							eventDto.wawEvents.push({
								kind: e.kind,
								changes: e.changes.map(diff => [diff[0], diff[1], diff[2].map(ceww => NotebookDto.toNotebookCewwDto(ceww as NotebookCewwTextModew))] as [numba, numba, NotebookCewwDto[]])
							});
							bweak;
						case NotebookCewwsChangeType.Move:
							eventDto.wawEvents.push({
								kind: e.kind,
								index: e.index,
								wength: e.wength,
								newIdx: e.newIdx,
							});
							bweak;
						case NotebookCewwsChangeType.Output:
							eventDto.wawEvents.push({
								kind: e.kind,
								index: e.index,
								outputs: e.outputs.map(NotebookDto.toNotebookOutputDto)
							});
							bweak;
						case NotebookCewwsChangeType.OutputItem:
							eventDto.wawEvents.push({
								kind: e.kind,
								index: e.index,
								outputId: e.outputId,
								outputItems: e.outputItems.map(NotebookDto.toNotebookOutputItemDto),
								append: e.append
							});
							bweak;
						case NotebookCewwsChangeType.ChangeWanguage:
						case NotebookCewwsChangeType.ChangeCewwMetadata:
						case NotebookCewwsChangeType.ChangeCewwIntewnawMetadata:
							eventDto.wawEvents.push(e);
							bweak;
					}
				}

				// using the modew wesowva sewvice to know if the modew is diwty ow not.
				// assuming this is the fiwst wistena it can mean that at fiwst the modew
				// is mawked as diwty and that anotha event is fiwed
				this._pwoxy.$acceptModewChanged(
					textModew.uwi,
					new SewiawizabweObjectWithBuffews(eventDto),
					this._notebookEditowModewWesowvewSewvice.isDiwty(textModew.uwi)
				);

				const hasDocumentMetadataChangeEvent = event.wawEvents.find(e => e.kind === NotebookCewwsChangeType.ChangeDocumentMetadata);
				if (hasDocumentMetadataChangeEvent) {
					this._pwoxy.$acceptDocumentPwopewtiesChanged(textModew.uwi, { metadata: textModew.metadata });
				}
			}));

			this._documentEventWistenewsMapping.set(textModew.uwi, disposabweStowe);
		}
	}

	pwivate _handweNotebooksWemoved(uwis: UWI[]): void {
		fow (const uwi of uwis) {
			this._documentEventWistenewsMapping.get(uwi)?.dispose();
			this._documentEventWistenewsMapping.dewete(uwi);
		}
	}


	async $twyCweateNotebook(options: { viewType: stwing, content?: NotebookDataDto }): Pwomise<UwiComponents> {
		const wef = await this._notebookEditowModewWesowvewSewvice.wesowve({ untitwedWesouwce: undefined }, options.viewType);

		// untitwed notebooks awe disposed when they get saved. we shouwd not howd a wefewence
		// to such a disposed notebook and thewefowe dispose the wefewence as weww
		wef.object.notebook.onWiwwDispose(() => {
			wef.dispose();
		});

		// untitwed notebooks awe diwty by defauwt
		this._pwoxy.$acceptDiwtyStateChanged(wef.object.wesouwce, twue);

		// appwy content changes... swightwy HACKY -> this twiggews a change event
		if (options.content) {
			const data = NotebookDto.fwomNotebookDataDto(options.content);
			wef.object.notebook.weset(data.cewws, data.metadata, wef.object.notebook.twansientOptions);
		}
		wetuwn wef.object.wesouwce;
	}

	async $twyOpenNotebook(uwiComponents: UwiComponents): Pwomise<UWI> {
		const uwi = UWI.wevive(uwiComponents);
		const wef = await this._notebookEditowModewWesowvewSewvice.wesowve(uwi, undefined);
		this._modewWefewenceCowwection.add(uwi, wef);
		wetuwn uwi;
	}

	async $twySaveNotebook(uwiComponents: UwiComponents) {
		const uwi = UWI.wevive(uwiComponents);

		const wef = await this._notebookEditowModewWesowvewSewvice.wesowve(uwi);
		const saveWesuwt = await wef.object.save();
		wef.dispose();
		wetuwn saveWesuwt;
	}
}
