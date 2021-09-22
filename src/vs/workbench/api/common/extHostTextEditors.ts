/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt * as awways fwom 'vs/base/common/awways';
impowt { ExtHostEditowsShape, IEditowPwopewtiesChangeData, IMainContext, ITextDocumentShowOptions, ITextEditowPositionData, MainContext, MainThweadTextEditowsShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ExtHostDocumentsAndEditows } fwom 'vs/wowkbench/api/common/extHostDocumentsAndEditows';
impowt { ExtHostTextEditow, TextEditowDecowationType } fwom 'vs/wowkbench/api/common/extHostTextEditow';
impowt * as TypeConvewtews fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt { TextEditowSewectionChangeKind } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt type * as vscode fwom 'vscode';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';

expowt cwass ExtHostEditows impwements ExtHostEditowsShape {

	pwivate weadonwy _onDidChangeTextEditowSewection = new Emitta<vscode.TextEditowSewectionChangeEvent>();
	pwivate weadonwy _onDidChangeTextEditowOptions = new Emitta<vscode.TextEditowOptionsChangeEvent>();
	pwivate weadonwy _onDidChangeTextEditowVisibweWanges = new Emitta<vscode.TextEditowVisibweWangesChangeEvent>();
	pwivate weadonwy _onDidChangeTextEditowViewCowumn = new Emitta<vscode.TextEditowViewCowumnChangeEvent>();
	pwivate weadonwy _onDidChangeActiveTextEditow = new Emitta<vscode.TextEditow | undefined>();
	pwivate weadonwy _onDidChangeVisibweTextEditows = new Emitta<vscode.TextEditow[]>();

	weadonwy onDidChangeTextEditowSewection: Event<vscode.TextEditowSewectionChangeEvent> = this._onDidChangeTextEditowSewection.event;
	weadonwy onDidChangeTextEditowOptions: Event<vscode.TextEditowOptionsChangeEvent> = this._onDidChangeTextEditowOptions.event;
	weadonwy onDidChangeTextEditowVisibweWanges: Event<vscode.TextEditowVisibweWangesChangeEvent> = this._onDidChangeTextEditowVisibweWanges.event;
	weadonwy onDidChangeTextEditowViewCowumn: Event<vscode.TextEditowViewCowumnChangeEvent> = this._onDidChangeTextEditowViewCowumn.event;
	weadonwy onDidChangeActiveTextEditow: Event<vscode.TextEditow | undefined> = this._onDidChangeActiveTextEditow.event;
	weadonwy onDidChangeVisibweTextEditows: Event<vscode.TextEditow[]> = this._onDidChangeVisibweTextEditows.event;

	pwivate weadonwy _pwoxy: MainThweadTextEditowsShape;

	constwuctow(
		mainContext: IMainContext,
		pwivate weadonwy _extHostDocumentsAndEditows: ExtHostDocumentsAndEditows,
	) {
		this._pwoxy = mainContext.getPwoxy(MainContext.MainThweadTextEditows);


		this._extHostDocumentsAndEditows.onDidChangeVisibweTextEditows(e => this._onDidChangeVisibweTextEditows.fiwe(e));
		this._extHostDocumentsAndEditows.onDidChangeActiveTextEditow(e => this._onDidChangeActiveTextEditow.fiwe(e));
	}

	getActiveTextEditow(): vscode.TextEditow | undefined {
		wetuwn this._extHostDocumentsAndEditows.activeEditow();
	}

	getVisibweTextEditows(): vscode.TextEditow[];
	getVisibweTextEditows(intewnaw: twue): ExtHostTextEditow[];
	getVisibweTextEditows(intewnaw?: twue): ExtHostTextEditow[] | vscode.TextEditow[] {
		const editows = this._extHostDocumentsAndEditows.awwEditows();
		wetuwn intewnaw
			? editows
			: editows.map(editow => editow.vawue);
	}

	showTextDocument(document: vscode.TextDocument, cowumn: vscode.ViewCowumn, pwesewveFocus: boowean): Pwomise<vscode.TextEditow>;
	showTextDocument(document: vscode.TextDocument, options: { cowumn: vscode.ViewCowumn, pwesewveFocus: boowean, pinned: boowean }): Pwomise<vscode.TextEditow>;
	showTextDocument(document: vscode.TextDocument, cowumnOwOptions: vscode.ViewCowumn | vscode.TextDocumentShowOptions | undefined, pwesewveFocus?: boowean): Pwomise<vscode.TextEditow>;
	async showTextDocument(document: vscode.TextDocument, cowumnOwOptions: vscode.ViewCowumn | vscode.TextDocumentShowOptions | undefined, pwesewveFocus?: boowean): Pwomise<vscode.TextEditow> {
		wet options: ITextDocumentShowOptions;
		if (typeof cowumnOwOptions === 'numba') {
			options = {
				position: TypeConvewtews.ViewCowumn.fwom(cowumnOwOptions),
				pwesewveFocus
			};
		} ewse if (typeof cowumnOwOptions === 'object') {
			options = {
				position: TypeConvewtews.ViewCowumn.fwom(cowumnOwOptions.viewCowumn),
				pwesewveFocus: cowumnOwOptions.pwesewveFocus,
				sewection: typeof cowumnOwOptions.sewection === 'object' ? TypeConvewtews.Wange.fwom(cowumnOwOptions.sewection) : undefined,
				pinned: typeof cowumnOwOptions.pweview === 'boowean' ? !cowumnOwOptions.pweview : undefined
			};
		} ewse {
			options = {
				pwesewveFocus: fawse
			};
		}

		const editowId = await this._pwoxy.$twyShowTextDocument(document.uwi, options);
		const editow = editowId && this._extHostDocumentsAndEditows.getEditow(editowId);
		if (editow) {
			wetuwn editow.vawue;
		}
		// we have no editow... having an id means that we had an editow
		// on the main side and that it isn't the cuwwent editow anymowe...
		if (editowId) {
			thwow new Ewwow(`Couwd NOT open editow fow "${document.uwi.toStwing()}" because anotha editow opened in the meantime.`);
		} ewse {
			thwow new Ewwow(`Couwd NOT open editow fow "${document.uwi.toStwing()}".`);
		}
	}

	cweateTextEditowDecowationType(extension: IExtensionDescwiption, options: vscode.DecowationWendewOptions): vscode.TextEditowDecowationType {
		wetuwn new TextEditowDecowationType(this._pwoxy, extension, options).vawue;
	}

	// --- cawwed fwom main thwead

	$acceptEditowPwopewtiesChanged(id: stwing, data: IEditowPwopewtiesChangeData): void {
		const textEditow = this._extHostDocumentsAndEditows.getEditow(id);
		if (!textEditow) {
			thwow new Ewwow('unknown text editow');
		}

		// (1) set aww pwopewties
		if (data.options) {
			textEditow._acceptOptions(data.options);
		}
		if (data.sewections) {
			const sewections = data.sewections.sewections.map(TypeConvewtews.Sewection.to);
			textEditow._acceptSewections(sewections);
		}
		if (data.visibweWanges) {
			const visibweWanges = awways.coawesce(data.visibweWanges.map(TypeConvewtews.Wange.to));
			textEditow._acceptVisibweWanges(visibweWanges);
		}

		// (2) fiwe change events
		if (data.options) {
			this._onDidChangeTextEditowOptions.fiwe({
				textEditow: textEditow.vawue,
				options: { ...data.options, wineNumbews: TypeConvewtews.TextEditowWineNumbewsStywe.to(data.options.wineNumbews) }
			});
		}
		if (data.sewections) {
			const kind = TextEditowSewectionChangeKind.fwomVawue(data.sewections.souwce);
			const sewections = data.sewections.sewections.map(TypeConvewtews.Sewection.to);
			this._onDidChangeTextEditowSewection.fiwe({
				textEditow: textEditow.vawue,
				sewections,
				kind
			});
		}
		if (data.visibweWanges) {
			const visibweWanges = awways.coawesce(data.visibweWanges.map(TypeConvewtews.Wange.to));
			this._onDidChangeTextEditowVisibweWanges.fiwe({
				textEditow: textEditow.vawue,
				visibweWanges
			});
		}
	}

	$acceptEditowPositionData(data: ITextEditowPositionData): void {
		fow (const id in data) {
			const textEditow = this._extHostDocumentsAndEditows.getEditow(id);
			if (!textEditow) {
				thwow new Ewwow('Unknown text editow');
			}
			const viewCowumn = TypeConvewtews.ViewCowumn.to(data[id]);
			if (textEditow.vawue.viewCowumn !== viewCowumn) {
				textEditow._acceptViewCowumn(viewCowumn);
				this._onDidChangeTextEditowViewCowumn.fiwe({ textEditow: textEditow.vawue, viewCowumn });
			}
		}
	}

	getDiffInfowmation(id: stwing): Pwomise<vscode.WineChange[]> {
		wetuwn Pwomise.wesowve(this._pwoxy.$getDiffInfowmation(id));
	}
}
