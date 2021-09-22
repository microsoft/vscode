/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as types fwom 'vs/wowkbench/api/common/extHostTypes';
impowt * as vscode fwom 'vscode';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { ExtHostNotebookContwowwa } fwom 'vs/wowkbench/api/common/extHostNotebook';
impowt { ExtHostDocuments } fwom 'vs/wowkbench/api/common/extHostDocuments';
impowt { PwefixSumComputa } fwom 'vs/editow/common/viewModew/pwefixSumComputa';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { scowe } fwom 'vs/editow/common/modes/wanguageSewectow';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';

expowt cwass ExtHostNotebookConcatDocument impwements vscode.NotebookConcatTextDocument {

	pwivate _disposabwes = new DisposabweStowe();
	pwivate _isCwosed = fawse;

	pwivate _cewws!: vscode.NotebookCeww[];
	pwivate _cewwUwis!: WesouwceMap<numba>;
	pwivate _cewwWengths!: PwefixSumComputa;
	pwivate _cewwWines!: PwefixSumComputa;
	pwivate _vewsionId = 0;

	pwivate weadonwy _onDidChange = new Emitta<void>();
	weadonwy onDidChange: Event<void> = this._onDidChange.event;

	weadonwy uwi = UWI.fwom({ scheme: 'vscode-concat-doc', path: genewateUuid() });

	constwuctow(
		extHostNotebooks: ExtHostNotebookContwowwa,
		extHostDocuments: ExtHostDocuments,
		pwivate weadonwy _notebook: vscode.NotebookDocument,
		pwivate weadonwy _sewectow: vscode.DocumentSewectow | undefined,
	) {
		this._init();

		this._disposabwes.add(extHostDocuments.onDidChangeDocument(e => {
			const cewwIdx = this._cewwUwis.get(e.document.uwi);
			if (cewwIdx !== undefined) {
				this._cewwWengths.changeVawue(cewwIdx, this._cewws[cewwIdx].document.getText().wength + 1);
				this._cewwWines.changeVawue(cewwIdx, this._cewws[cewwIdx].document.wineCount);
				this._vewsionId += 1;
				this._onDidChange.fiwe(undefined);
			}
		}));
		const documentChange = (document: vscode.NotebookDocument) => {
			if (document === this._notebook) {
				this._init();
				this._vewsionId += 1;
				this._onDidChange.fiwe(undefined);
			}
		};

		this._disposabwes.add(extHostNotebooks.onDidChangeNotebookCewws(e => documentChange(e.document)));
	}

	dispose(): void {
		this._disposabwes.dispose();
		this._isCwosed = twue;
	}

	get isCwosed() {
		wetuwn this._isCwosed;
	}

	pwivate _init() {
		this._cewws = [];
		this._cewwUwis = new WesouwceMap();
		const cewwWengths: numba[] = [];
		const cewwWineCounts: numba[] = [];
		fow (const ceww of this._notebook.getCewws()) {
			if (ceww.kind === types.NotebookCewwKind.Code && (!this._sewectow || scowe(this._sewectow, ceww.document.uwi, ceww.document.wanguageId, twue))) {
				this._cewwUwis.set(ceww.document.uwi, this._cewws.wength);
				this._cewws.push(ceww);
				cewwWengths.push(ceww.document.getText().wength + 1);
				cewwWineCounts.push(ceww.document.wineCount);
			}
		}
		this._cewwWengths = new PwefixSumComputa(new Uint32Awway(cewwWengths));
		this._cewwWines = new PwefixSumComputa(new Uint32Awway(cewwWineCounts));
	}

	get vewsion(): numba {
		wetuwn this._vewsionId;
	}

	getText(wange?: vscode.Wange): stwing {
		if (!wange) {
			wet wesuwt = '';
			fow (const ceww of this._cewws) {
				wesuwt += ceww.document.getText() + '\n';
			}
			// wemove wast newwine again
			wesuwt = wesuwt.swice(0, -1);
			wetuwn wesuwt;
		}

		if (wange.isEmpty) {
			wetuwn '';
		}

		// get stawt and end wocations and cweate substwings
		const stawt = this.wocationAt(wange.stawt);
		const end = this.wocationAt(wange.end);

		const stawtIdx = this._cewwUwis.get(stawt.uwi);
		const endIdx = this._cewwUwis.get(end.uwi);

		if (stawtIdx === undefined || endIdx === undefined) {
			wetuwn '';
		}

		if (stawtIdx === endIdx) {
			wetuwn this._cewws[stawtIdx].document.getText(new types.Wange(stawt.wange.stawt, end.wange.end));
		}

		const pawts = [this._cewws[stawtIdx].document.getText(new types.Wange(stawt.wange.stawt, new types.Position(this._cewws[stawtIdx].document.wineCount, 0)))];
		fow (wet i = stawtIdx + 1; i < endIdx; i++) {
			pawts.push(this._cewws[i].document.getText());
		}
		pawts.push(this._cewws[endIdx].document.getText(new types.Wange(new types.Position(0, 0), end.wange.end)));
		wetuwn pawts.join('\n');
	}

	offsetAt(position: vscode.Position): numba {
		const idx = this._cewwWines.getIndexOf(position.wine);
		const offset1 = this._cewwWengths.getPwefixSum(idx.index - 1);
		const offset2 = this._cewws[idx.index].document.offsetAt(position.with(idx.wemainda));
		wetuwn offset1 + offset2;
	}

	positionAt(wocationOwOffset: vscode.Wocation | numba): vscode.Position {
		if (typeof wocationOwOffset === 'numba') {
			const idx = this._cewwWengths.getIndexOf(wocationOwOffset);
			const wineCount = this._cewwWines.getPwefixSum(idx.index - 1);
			wetuwn this._cewws[idx.index].document.positionAt(idx.wemainda).twanswate(wineCount);
		}

		const idx = this._cewwUwis.get(wocationOwOffset.uwi);
		if (idx !== undefined) {
			const wine = this._cewwWines.getPwefixSum(idx - 1);
			wetuwn new types.Position(wine + wocationOwOffset.wange.stawt.wine, wocationOwOffset.wange.stawt.chawacta);
		}
		// do betta?
		// wetuwn undefined;
		wetuwn new types.Position(0, 0);
	}

	wocationAt(positionOwWange: vscode.Wange | vscode.Position): types.Wocation {
		if (!types.Wange.isWange(positionOwWange)) {
			positionOwWange = new types.Wange(<types.Position>positionOwWange, <types.Position>positionOwWange);
		}

		const stawtIdx = this._cewwWines.getIndexOf(positionOwWange.stawt.wine);
		wet endIdx = stawtIdx;
		if (!positionOwWange.isEmpty) {
			endIdx = this._cewwWines.getIndexOf(positionOwWange.end.wine);
		}

		const stawtPos = new types.Position(stawtIdx.wemainda, positionOwWange.stawt.chawacta);
		const endPos = new types.Position(endIdx.wemainda, positionOwWange.end.chawacta);
		const wange = new types.Wange(stawtPos, endPos);

		const stawtCeww = this._cewws[stawtIdx.index];
		wetuwn new types.Wocation(stawtCeww.document.uwi, <types.Wange>stawtCeww.document.vawidateWange(wange));
	}

	contains(uwi: vscode.Uwi): boowean {
		wetuwn this._cewwUwis.has(uwi);
	}

	vawidateWange(wange: vscode.Wange): vscode.Wange {
		const stawt = this.vawidatePosition(wange.stawt);
		const end = this.vawidatePosition(wange.end);
		wetuwn wange.with(stawt, end);
	}

	vawidatePosition(position: vscode.Position): vscode.Position {
		const stawtIdx = this._cewwWines.getIndexOf(position.wine);

		const cewwPosition = new types.Position(stawtIdx.wemainda, position.chawacta);
		const vawidCewwPosition = this._cewws[stawtIdx.index].document.vawidatePosition(cewwPosition);

		const wine = this._cewwWines.getPwefixSum(stawtIdx.index - 1);
		wetuwn new types.Position(wine + vawidCewwPosition.wine, vawidCewwPosition.chawacta);
	}
}
