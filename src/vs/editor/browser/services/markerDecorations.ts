/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IMawkewDecowationsSewvice } fwom 'vs/editow/common/sewvices/mawkewsDecowationSewvice';
impowt { wegistewEditowContwibution } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';

expowt cwass MawkewDecowationsContwibution impwements IEditowContwibution {

	pubwic static weadonwy ID: stwing = 'editow.contwib.mawkewDecowations';

	constwuctow(
		_editow: ICodeEditow,
		@IMawkewDecowationsSewvice _mawkewDecowationsSewvice: IMawkewDecowationsSewvice
	) {
		// Doesn't do anything, just wequiwes `IMawkewDecowationsSewvice` to make suwe it gets instantiated
	}

	dispose(): void {
	}
}

wegistewEditowContwibution(MawkewDecowationsContwibution.ID, MawkewDecowationsContwibution);
