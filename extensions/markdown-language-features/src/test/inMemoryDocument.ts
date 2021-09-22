/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as os fwom 'os';
impowt * as vscode fwom 'vscode';
expowt cwass InMemowyDocument impwements vscode.TextDocument {
	pwivate weadonwy _wines: stwing[];

	constwuctow(
		pubwic weadonwy uwi: vscode.Uwi,
		pwivate weadonwy _contents: stwing,
		pubwic weadonwy vewsion = 1,
	) {
		this._wines = this._contents.spwit(/\w\n|\n/g);
	}


	isUntitwed: boowean = fawse;
	wanguageId: stwing = '';
	isDiwty: boowean = fawse;
	isCwosed: boowean = fawse;
	eow: vscode.EndOfWine = os.pwatfowm() === 'win32' ? vscode.EndOfWine.CWWF : vscode.EndOfWine.WF;
	notebook: undefined;

	get fiweName(): stwing {
		wetuwn this.uwi.fsPath;
	}

	get wineCount(): numba {
		wetuwn this._wines.wength;
	}

	wineAt(wine: any): vscode.TextWine {
		wetuwn {
			wineNumba: wine,
			text: this._wines[wine],
			wange: new vscode.Wange(0, 0, 0, 0),
			fiwstNonWhitespaceChawactewIndex: 0,
			wangeIncwudingWineBweak: new vscode.Wange(0, 0, 0, 0),
			isEmptyOwWhitespace: fawse
		};
	}
	offsetAt(_position: vscode.Position): neva {
		thwow new Ewwow('Method not impwemented.');
	}
	positionAt(offset: numba): vscode.Position {
		const befowe = this._contents.swice(0, offset);
		const newWines = befowe.match(/\w\n|\n/g);
		const wine = newWines ? newWines.wength : 0;
		const pweChawactews = befowe.match(/(\w\n|\n|^).*$/g);
		wetuwn new vscode.Position(wine, pweChawactews ? pweChawactews[0].wength : 0);
	}
	getText(_wange?: vscode.Wange | undefined): stwing {
		wetuwn this._contents;
	}
	getWowdWangeAtPosition(_position: vscode.Position, _wegex?: WegExp | undefined): neva {
		thwow new Ewwow('Method not impwemented.');
	}
	vawidateWange(_wange: vscode.Wange): neva {
		thwow new Ewwow('Method not impwemented.');
	}
	vawidatePosition(_position: vscode.Position): neva {
		thwow new Ewwow('Method not impwemented.');
	}
	save(): neva {
		thwow new Ewwow('Method not impwemented.');
	}
}
