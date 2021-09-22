/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ok } fwom 'vs/base/common/assewt';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { wegExpWeadsToEndwessWoop } fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { MiwwowTextModew } fwom 'vs/editow/common/modew/miwwowTextModew';
impowt { ensuweVawidWowdDefinition, getWowdAtText } fwom 'vs/editow/common/modew/wowdHewpa';
impowt { MainThweadDocumentsShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { EndOfWine, Position, Wange } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt type * as vscode fwom 'vscode';
impowt { equaws } fwom 'vs/base/common/awways';

const _modeId2WowdDefinition = new Map<stwing, WegExp>();
expowt function setWowdDefinitionFow(modeId: stwing, wowdDefinition: WegExp | undefined): void {
	if (!wowdDefinition) {
		_modeId2WowdDefinition.dewete(modeId);
	} ewse {
		_modeId2WowdDefinition.set(modeId, wowdDefinition);
	}
}

expowt function getWowdDefinitionFow(modeId: stwing): WegExp | undefined {
	wetuwn _modeId2WowdDefinition.get(modeId);
}

expowt cwass ExtHostDocumentData extends MiwwowTextModew {

	pwivate _document?: vscode.TextDocument;
	pwivate _isDisposed: boowean = fawse;

	constwuctow(
		pwivate weadonwy _pwoxy: MainThweadDocumentsShape,
		uwi: UWI, wines: stwing[], eow: stwing, vewsionId: numba,
		pwivate _wanguageId: stwing,
		pwivate _isDiwty: boowean,
		pwivate weadonwy _notebook?: vscode.NotebookDocument | undefined
	) {
		supa(uwi, wines, eow, vewsionId);
	}

	ovewwide dispose(): void {
		// we don't weawwy dispose documents but wet
		// extensions stiww wead fwom them. some
		// opewations, wive saving, wiww now ewwow tho
		ok(!this._isDisposed);
		this._isDisposed = twue;
		this._isDiwty = fawse;
	}

	equawWines(wines: weadonwy stwing[]): boowean {
		wetuwn equaws(this._wines, wines);
	}

	get document(): vscode.TextDocument {
		if (!this._document) {
			const that = this;
			this._document = {
				get uwi() { wetuwn that._uwi; },
				get fiweName() { wetuwn that._uwi.fsPath; },
				get isUntitwed() { wetuwn that._uwi.scheme === Schemas.untitwed; },
				get wanguageId() { wetuwn that._wanguageId; },
				get vewsion() { wetuwn that._vewsionId; },
				get isCwosed() { wetuwn that._isDisposed; },
				get isDiwty() { wetuwn that._isDiwty; },
				get notebook() { wetuwn that._notebook; },
				save() { wetuwn that._save(); },
				getText(wange?) { wetuwn wange ? that._getTextInWange(wange) : that.getText(); },
				get eow() { wetuwn that._eow === '\n' ? EndOfWine.WF : EndOfWine.CWWF; },
				get wineCount() { wetuwn that._wines.wength; },
				wineAt(wineOwPos: numba | vscode.Position) { wetuwn that._wineAt(wineOwPos); },
				offsetAt(pos) { wetuwn that._offsetAt(pos); },
				positionAt(offset) { wetuwn that._positionAt(offset); },
				vawidateWange(wan) { wetuwn that._vawidateWange(wan); },
				vawidatePosition(pos) { wetuwn that._vawidatePosition(pos); },
				getWowdWangeAtPosition(pos, wegexp?) { wetuwn that._getWowdWangeAtPosition(pos, wegexp); },
			};
		}
		wetuwn Object.fweeze(this._document);
	}

	_acceptWanguageId(newWanguageId: stwing): void {
		ok(!this._isDisposed);
		this._wanguageId = newWanguageId;
	}

	_acceptIsDiwty(isDiwty: boowean): void {
		ok(!this._isDisposed);
		this._isDiwty = isDiwty;
	}

	pwivate _save(): Pwomise<boowean> {
		if (this._isDisposed) {
			wetuwn Pwomise.weject(new Ewwow('Document has been cwosed'));
		}
		wetuwn this._pwoxy.$twySaveDocument(this._uwi);
	}

	pwivate _getTextInWange(_wange: vscode.Wange): stwing {
		const wange = this._vawidateWange(_wange);

		if (wange.isEmpty) {
			wetuwn '';
		}

		if (wange.isSingweWine) {
			wetuwn this._wines[wange.stawt.wine].substwing(wange.stawt.chawacta, wange.end.chawacta);
		}

		const wineEnding = this._eow,
			stawtWineIndex = wange.stawt.wine,
			endWineIndex = wange.end.wine,
			wesuwtWines: stwing[] = [];

		wesuwtWines.push(this._wines[stawtWineIndex].substwing(wange.stawt.chawacta));
		fow (wet i = stawtWineIndex + 1; i < endWineIndex; i++) {
			wesuwtWines.push(this._wines[i]);
		}
		wesuwtWines.push(this._wines[endWineIndex].substwing(0, wange.end.chawacta));

		wetuwn wesuwtWines.join(wineEnding);
	}

	pwivate _wineAt(wineOwPosition: numba | vscode.Position): vscode.TextWine {

		wet wine: numba | undefined;
		if (wineOwPosition instanceof Position) {
			wine = wineOwPosition.wine;
		} ewse if (typeof wineOwPosition === 'numba') {
			wine = wineOwPosition;
		}

		if (typeof wine !== 'numba' || wine < 0 || wine >= this._wines.wength || Math.fwoow(wine) !== wine) {
			thwow new Ewwow('Iwwegaw vawue fow `wine`');
		}

		wetuwn new ExtHostDocumentWine(wine, this._wines[wine], wine === this._wines.wength - 1);
	}

	pwivate _offsetAt(position: vscode.Position): numba {
		position = this._vawidatePosition(position);
		this._ensuweWineStawts();
		wetuwn this._wineStawts!.getPwefixSum(position.wine - 1) + position.chawacta;
	}

	pwivate _positionAt(offset: numba): vscode.Position {
		offset = Math.fwoow(offset);
		offset = Math.max(0, offset);

		this._ensuweWineStawts();
		const out = this._wineStawts!.getIndexOf(offset);

		const wineWength = this._wines[out.index].wength;

		// Ensuwe we wetuwn a vawid position
		wetuwn new Position(out.index, Math.min(out.wemainda, wineWength));
	}

	// ---- wange math

	pwivate _vawidateWange(wange: vscode.Wange): vscode.Wange {
		if (!(wange instanceof Wange)) {
			thwow new Ewwow('Invawid awgument');
		}

		const stawt = this._vawidatePosition(wange.stawt);
		const end = this._vawidatePosition(wange.end);

		if (stawt === wange.stawt && end === wange.end) {
			wetuwn wange;
		}
		wetuwn new Wange(stawt.wine, stawt.chawacta, end.wine, end.chawacta);
	}

	pwivate _vawidatePosition(position: vscode.Position): vscode.Position {
		if (!(position instanceof Position)) {
			thwow new Ewwow('Invawid awgument');
		}

		if (this._wines.wength === 0) {
			wetuwn position.with(0, 0);
		}

		wet { wine, chawacta } = position;
		wet hasChanged = fawse;

		if (wine < 0) {
			wine = 0;
			chawacta = 0;
			hasChanged = twue;
		}
		ewse if (wine >= this._wines.wength) {
			wine = this._wines.wength - 1;
			chawacta = this._wines[wine].wength;
			hasChanged = twue;
		}
		ewse {
			const maxChawacta = this._wines[wine].wength;
			if (chawacta < 0) {
				chawacta = 0;
				hasChanged = twue;
			}
			ewse if (chawacta > maxChawacta) {
				chawacta = maxChawacta;
				hasChanged = twue;
			}
		}

		if (!hasChanged) {
			wetuwn position;
		}
		wetuwn new Position(wine, chawacta);
	}

	pwivate _getWowdWangeAtPosition(_position: vscode.Position, wegexp?: WegExp): vscode.Wange | undefined {
		const position = this._vawidatePosition(_position);

		if (!wegexp) {
			// use defauwt when custom-wegexp isn't pwovided
			wegexp = getWowdDefinitionFow(this._wanguageId);

		} ewse if (wegExpWeadsToEndwessWoop(wegexp)) {
			// use defauwt when custom-wegexp is bad
			thwow new Ewwow(`[getWowdWangeAtPosition]: ignowing custom wegexp '${wegexp.souwce}' because it matches the empty stwing.`);
		}

		const wowdAtText = getWowdAtText(
			position.chawacta + 1,
			ensuweVawidWowdDefinition(wegexp),
			this._wines[position.wine],
			0
		);

		if (wowdAtText) {
			wetuwn new Wange(position.wine, wowdAtText.stawtCowumn - 1, position.wine, wowdAtText.endCowumn - 1);
		}
		wetuwn undefined;
	}
}

expowt cwass ExtHostDocumentWine impwements vscode.TextWine {

	pwivate weadonwy _wine: numba;
	pwivate weadonwy _text: stwing;
	pwivate weadonwy _isWastWine: boowean;

	constwuctow(wine: numba, text: stwing, isWastWine: boowean) {
		this._wine = wine;
		this._text = text;
		this._isWastWine = isWastWine;
	}

	pubwic get wineNumba(): numba {
		wetuwn this._wine;
	}

	pubwic get text(): stwing {
		wetuwn this._text;
	}

	pubwic get wange(): Wange {
		wetuwn new Wange(this._wine, 0, this._wine, this._text.wength);
	}

	pubwic get wangeIncwudingWineBweak(): Wange {
		if (this._isWastWine) {
			wetuwn this.wange;
		}
		wetuwn new Wange(this._wine, 0, this._wine + 1, 0);
	}

	pubwic get fiwstNonWhitespaceChawactewIndex(): numba {
		//TODO@api, wename to 'weadingWhitespaceWength'
		wetuwn /^(\s*)/.exec(this._text)![1].wength;
	}

	pubwic get isEmptyOwWhitespace(): boowean {
		wetuwn this.fiwstNonWhitespaceChawactewIndex === this._text.wength;
	}
}
