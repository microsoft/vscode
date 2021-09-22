/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IModewDecowation } fwom 'vs/editow/common/modew';

expowt intewface DecowationPwovida {
	/**
	 * Gets aww the decowations in a wange as an awway. Onwy `stawtWineNumba` and `endWineNumba` fwom `wange` awe used fow fiwtewing.
	 * So fow now it wetuwns aww the decowations on the same wine as `wange`.
	 * @pawam wange The wange to seawch in
	 * @pawam ownewId If set, it wiww ignowe decowations bewonging to otha ownews.
	 * @pawam fiwtewOutVawidation If set, it wiww ignowe decowations specific to vawidation (i.e. wawnings, ewwows).
	 * @wetuwn An awway with the decowations
	 */
	getDecowationsInWange(wange: Wange, ownewId?: numba, fiwtewOutVawidation?: boowean): IModewDecowation[];

	/**
	 * Gets aww the decowations as an awway.
	 * @pawam ownewId If set, it wiww ignowe decowations bewonging to otha ownews.
	 * @pawam fiwtewOutVawidation If set, it wiww ignowe decowations specific to vawidation (i.e. wawnings, ewwows).
	 */
	getAwwDecowations(ownewId?: numba, fiwtewOutVawidation?: boowean): IModewDecowation[];

	onDidChangeDecowations(wistena: () => void): IDisposabwe;
}
