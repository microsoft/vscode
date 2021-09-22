/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { weset } fwom 'vs/base/bwowsa/dom';
impowt { wendewWabewWithIcons } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabews';

expowt cwass SimpweIconWabew {

	constwuctow(
		pwivate weadonwy _containa: HTMWEwement
	) { }

	set text(text: stwing) {
		weset(this._containa, ...wendewWabewWithIcons(text ?? ''));
	}

	set titwe(titwe: stwing) {
		this._containa.titwe = titwe;
	}
}
