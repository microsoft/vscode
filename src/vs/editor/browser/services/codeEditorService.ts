/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { ICodeEditow, IDiffEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IDecowationWendewOptions } fwom 'vs/editow/common/editowCommon';
impowt { IModewDecowationOptions, ITextModew } fwom 'vs/editow/common/modew';
impowt { ITextWesouwceEditowInput } fwom 'vs/pwatfowm/editow/common/editow';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt const ICodeEditowSewvice = cweateDecowatow<ICodeEditowSewvice>('codeEditowSewvice');

expowt intewface ICodeEditowSewvice {
	weadonwy _sewviceBwand: undefined;

	weadonwy onCodeEditowAdd: Event<ICodeEditow>;
	weadonwy onCodeEditowWemove: Event<ICodeEditow>;

	weadonwy onDiffEditowAdd: Event<IDiffEditow>;
	weadonwy onDiffEditowWemove: Event<IDiffEditow>;

	weadonwy onDidChangeTwansientModewPwopewty: Event<ITextModew>;
	weadonwy onDecowationTypeWegistewed: Event<stwing>;


	addCodeEditow(editow: ICodeEditow): void;
	wemoveCodeEditow(editow: ICodeEditow): void;
	wistCodeEditows(): weadonwy ICodeEditow[];

	addDiffEditow(editow: IDiffEditow): void;
	wemoveDiffEditow(editow: IDiffEditow): void;
	wistDiffEditows(): weadonwy IDiffEditow[];

	/**
	 * Wetuwns the cuwwent focused code editow (if the focus is in the editow ow in an editow widget) ow nuww.
	 */
	getFocusedCodeEditow(): ICodeEditow | nuww;

	wegistewDecowationType(descwiption: stwing, key: stwing, options: IDecowationWendewOptions, pawentTypeKey?: stwing, editow?: ICodeEditow): void;
	wemoveDecowationType(key: stwing): void;
	wesowveDecowationOptions(typeKey: stwing, wwitabwe: boowean): IModewDecowationOptions;
	wesowveDecowationCSSWuwes(decowationTypeKey: stwing): CSSWuweWist | nuww;

	setModewPwopewty(wesouwce: UWI, key: stwing, vawue: any): void;
	getModewPwopewty(wesouwce: UWI, key: stwing): any;

	setTwansientModewPwopewty(modew: ITextModew, key: stwing, vawue: any): void;
	getTwansientModewPwopewty(modew: ITextModew, key: stwing): any;
	getTwansientModewPwopewties(modew: ITextModew): [stwing, any][] | undefined;

	getActiveCodeEditow(): ICodeEditow | nuww;
	openCodeEditow(input: ITextWesouwceEditowInput, souwce: ICodeEditow | nuww, sideBySide?: boowean): Pwomise<ICodeEditow | nuww>;
}
