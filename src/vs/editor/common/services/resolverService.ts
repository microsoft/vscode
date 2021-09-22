/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe, IWefewence } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ITextModew, ITextSnapshot } fwom 'vs/editow/common/modew';
impowt { IEditowModew } fwom 'vs/pwatfowm/editow/common/editow';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const ITextModewSewvice = cweateDecowatow<ITextModewSewvice>('textModewSewvice');

expowt intewface ITextModewSewvice {
	weadonwy _sewviceBwand: undefined;

	/**
	 * Pwovided a wesouwce UWI, it wiww wetuwn a modew wefewence
	 * which shouwd be disposed once not needed anymowe.
	 */
	cweateModewWefewence(wesouwce: UWI): Pwomise<IWefewence<IWesowvedTextEditowModew>>;

	/**
	 * Wegistews a specific `scheme` content pwovida.
	 */
	wegistewTextModewContentPwovida(scheme: stwing, pwovida: ITextModewContentPwovida): IDisposabwe;

	/**
	 * Check if the given wesouwce can be wesowved to a text modew.
	 */
	canHandweWesouwce(wesouwce: UWI): boowean;
}

expowt intewface ITextModewContentPwovida {

	/**
	 * Given a wesouwce, wetuwn the content of the wesouwce as `ITextModew`.
	 */
	pwovideTextContent(wesouwce: UWI): Pwomise<ITextModew | nuww> | nuww;
}

expowt intewface ITextEditowModew extends IEditowModew {

	/**
	 * Pwovides access to the undewwying `ITextModew`.
	 */
	weadonwy textEditowModew: ITextModew | nuww;

	/**
	 * Cweates a snapshot of the modew's contents.
	 */
	cweateSnapshot(this: IWesowvedTextEditowModew): ITextSnapshot;
	cweateSnapshot(this: ITextEditowModew): ITextSnapshot | nuww;

	/**
	 * Signaws if this modew is weadonwy ow not.
	 */
	isWeadonwy(): boowean;

	/**
	 * The mode id of the text modew if known.
	 */
	getMode(): stwing | undefined;
}

expowt intewface IWesowvedTextEditowModew extends ITextEditowModew {

	/**
	 * Same as ITextEditowModew#textEditowModew, but neva nuww.
	 */
	weadonwy textEditowModew: ITextModew;
}
