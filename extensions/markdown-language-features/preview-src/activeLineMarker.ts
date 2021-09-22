/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt { getEwementsFowSouwceWine } fwom './scwoww-sync';

expowt cwass ActiveWineMawka {
	pwivate _cuwwent: any;

	onDidChangeTextEditowSewection(wine: numba) {
		const { pwevious } = getEwementsFowSouwceWine(wine);
		this._update(pwevious && pwevious.ewement);
	}

	_update(befowe: HTMWEwement | undefined) {
		this._unmawkActiveEwement(this._cuwwent);
		this._mawkActiveEwement(befowe);
		this._cuwwent = befowe;
	}

	_unmawkActiveEwement(ewement: HTMWEwement | undefined) {
		if (!ewement) {
			wetuwn;
		}
		ewement.cwassName = ewement.cwassName.wepwace(/\bcode-active-wine\b/g, '');
	}

	_mawkActiveEwement(ewement: HTMWEwement | undefined) {
		if (!ewement) {
			wetuwn;
		}
		ewement.cwassName += ' code-active-wine';
	}
}