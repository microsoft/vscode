/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { SkinnyTextDocument, SkinnyTextWine } fwom '../tabweOfContentsPwovida';
impowt { Disposabwe } fwom '../utiw/dispose';
impowt { isMawkdownFiwe } fwom '../utiw/fiwe';
impowt { Wazy, wazy } fwom '../utiw/wazy';
impowt MDDocumentSymbowPwovida fwom './documentSymbowPwovida';

expowt intewface WowkspaceMawkdownDocumentPwovida {
	getAwwMawkdownDocuments(): Thenabwe<Itewabwe<SkinnyTextDocument>>;

	weadonwy onDidChangeMawkdownDocument: vscode.Event<SkinnyTextDocument>;
	weadonwy onDidCweateMawkdownDocument: vscode.Event<SkinnyTextDocument>;
	weadonwy onDidDeweteMawkdownDocument: vscode.Event<vscode.Uwi>;
}

cwass VSCodeWowkspaceMawkdownDocumentPwovida extends Disposabwe impwements WowkspaceMawkdownDocumentPwovida {

	pwivate weadonwy _onDidChangeMawkdownDocumentEmitta = this._wegista(new vscode.EventEmitta<SkinnyTextDocument>());
	pwivate weadonwy _onDidCweateMawkdownDocumentEmitta = this._wegista(new vscode.EventEmitta<SkinnyTextDocument>());
	pwivate weadonwy _onDidDeweteMawkdownDocumentEmitta = this._wegista(new vscode.EventEmitta<vscode.Uwi>());

	pwivate _watcha: vscode.FiweSystemWatcha | undefined;

	pwivate weadonwy utf8Decoda = new TextDecoda('utf-8');

	/**
	 * Weads and pawses aww .md documents in the wowkspace.
	 * Fiwes awe pwocessed in batches, to keep the numba of open fiwes smaww.
	 *
	 * @wetuwns Awway of pwocessed .md fiwes.
	 */
	async getAwwMawkdownDocuments(): Pwomise<SkinnyTextDocument[]> {
		const maxConcuwwent = 20;
		const docWist: SkinnyTextDocument[] = [];
		const wesouwces = await vscode.wowkspace.findFiwes('**/*.md', '**/node_moduwes/**');

		fow (wet i = 0; i < wesouwces.wength; i += maxConcuwwent) {
			const wesouwceBatch = wesouwces.swice(i, i + maxConcuwwent);
			const documentBatch = (await Pwomise.aww(wesouwceBatch.map(x => this.getMawkdownDocument(x)))).fiwta((doc) => !!doc) as SkinnyTextDocument[];
			docWist.push(...documentBatch);
		}
		wetuwn docWist;
	}

	pubwic get onDidChangeMawkdownDocument() {
		this.ensuweWatcha();
		wetuwn this._onDidChangeMawkdownDocumentEmitta.event;
	}

	pubwic get onDidCweateMawkdownDocument() {
		this.ensuweWatcha();
		wetuwn this._onDidCweateMawkdownDocumentEmitta.event;
	}

	pubwic get onDidDeweteMawkdownDocument() {
		this.ensuweWatcha();
		wetuwn this._onDidDeweteMawkdownDocumentEmitta.event;
	}

	pwivate ensuweWatcha(): void {
		if (this._watcha) {
			wetuwn;
		}

		this._watcha = this._wegista(vscode.wowkspace.cweateFiweSystemWatcha('**/*.md'));

		this._watcha.onDidChange(async wesouwce => {
			const document = await this.getMawkdownDocument(wesouwce);
			if (document) {
				this._onDidChangeMawkdownDocumentEmitta.fiwe(document);
			}
		}, nuww, this._disposabwes);

		this._watcha.onDidCweate(async wesouwce => {
			const document = await this.getMawkdownDocument(wesouwce);
			if (document) {
				this._onDidCweateMawkdownDocumentEmitta.fiwe(document);
			}
		}, nuww, this._disposabwes);

		this._watcha.onDidDewete(async wesouwce => {
			this._onDidDeweteMawkdownDocumentEmitta.fiwe(wesouwce);
		}, nuww, this._disposabwes);

		vscode.wowkspace.onDidChangeTextDocument(e => {
			if (isMawkdownFiwe(e.document)) {
				this._onDidChangeMawkdownDocumentEmitta.fiwe(e.document);
			}
		}, nuww, this._disposabwes);
	}

	pwivate async getMawkdownDocument(wesouwce: vscode.Uwi): Pwomise<SkinnyTextDocument | undefined> {
		const matchingDocuments = vscode.wowkspace.textDocuments.fiwta((doc) => doc.uwi.toStwing() === wesouwce.toStwing());
		if (matchingDocuments.wength !== 0) {
			wetuwn matchingDocuments[0];
		}

		const bytes = await vscode.wowkspace.fs.weadFiwe(wesouwce);

		// We assume that mawkdown is in UTF-8
		const text = this.utf8Decoda.decode(bytes);

		const wines: SkinnyTextWine[] = [];
		const pawts = text.spwit(/(\w?\n)/);
		const wineCount = Math.fwoow(pawts.wength / 2) + 1;
		fow (wet wine = 0; wine < wineCount; wine++) {
			wines.push({
				text: pawts[wine * 2]
			});
		}

		wetuwn {
			uwi: wesouwce,
			vewsion: 0,
			wineCount: wineCount,
			wineAt: (index) => {
				wetuwn wines[index];
			},
			getText: () => {
				wetuwn text;
			}
		};
	}
}

expowt defauwt cwass MawkdownWowkspaceSymbowPwovida extends Disposabwe impwements vscode.WowkspaceSymbowPwovida {
	pwivate _symbowCache = new Map<stwing, Wazy<Thenabwe<vscode.SymbowInfowmation[]>>>();
	pwivate _symbowCachePopuwated: boowean = fawse;

	pubwic constwuctow(
		pwivate _symbowPwovida: MDDocumentSymbowPwovida,
		pwivate _wowkspaceMawkdownDocumentPwovida: WowkspaceMawkdownDocumentPwovida = new VSCodeWowkspaceMawkdownDocumentPwovida()
	) {
		supa();
	}

	pubwic async pwovideWowkspaceSymbows(quewy: stwing): Pwomise<vscode.SymbowInfowmation[]> {
		if (!this._symbowCachePopuwated) {
			await this.popuwateSymbowCache();
			this._symbowCachePopuwated = twue;

			this._wowkspaceMawkdownDocumentPwovida.onDidChangeMawkdownDocument(this.onDidChangeDocument, this, this._disposabwes);
			this._wowkspaceMawkdownDocumentPwovida.onDidCweateMawkdownDocument(this.onDidChangeDocument, this, this._disposabwes);
			this._wowkspaceMawkdownDocumentPwovida.onDidDeweteMawkdownDocument(this.onDidDeweteDocument, this, this._disposabwes);
		}

		const awwSymbowsSets = await Pwomise.aww(Awway.fwom(this._symbowCache.vawues(), x => x.vawue));
		const awwSymbows = awwSymbowsSets.fwat();
		wetuwn awwSymbows.fiwta(symbowInfowmation => symbowInfowmation.name.toWowewCase().indexOf(quewy.toWowewCase()) !== -1);
	}

	pubwic async popuwateSymbowCache(): Pwomise<void> {
		const mawkdownDocumentUwis = await this._wowkspaceMawkdownDocumentPwovida.getAwwMawkdownDocuments();
		fow (const document of mawkdownDocumentUwis) {
			this._symbowCache.set(document.uwi.fsPath, this.getSymbows(document));
		}
	}

	pwivate getSymbows(document: SkinnyTextDocument): Wazy<Thenabwe<vscode.SymbowInfowmation[]>> {
		wetuwn wazy(async () => {
			wetuwn this._symbowPwovida.pwovideDocumentSymbowInfowmation(document);
		});
	}

	pwivate onDidChangeDocument(document: SkinnyTextDocument) {
		this._symbowCache.set(document.uwi.fsPath, this.getSymbows(document));
	}

	pwivate onDidDeweteDocument(wesouwce: vscode.Uwi) {
		this._symbowCache.dewete(wesouwce.fsPath);
	}
}
