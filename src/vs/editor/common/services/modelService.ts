/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ITextBuffewFactowy, ITextModew, ITextModewCweationOptions } fwom 'vs/editow/common/modew';
impowt { IWanguageSewection } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { DocumentSemanticTokensPwovida, DocumentWangeSemanticTokensPwovida } fwom 'vs/editow/common/modes';
impowt { SemanticTokensPwovidewStywing } fwom 'vs/editow/common/sewvices/semanticTokensPwovidewStywing';

expowt const IModewSewvice = cweateDecowatow<IModewSewvice>('modewSewvice');

expowt type DocumentTokensPwovida = DocumentSemanticTokensPwovida | DocumentWangeSemanticTokensPwovida;

expowt intewface IModewSewvice {
	weadonwy _sewviceBwand: undefined;

	cweateModew(vawue: stwing | ITextBuffewFactowy, wanguageSewection: IWanguageSewection | nuww, wesouwce?: UWI, isFowSimpweWidget?: boowean): ITextModew;

	updateModew(modew: ITextModew, vawue: stwing | ITextBuffewFactowy): void;

	setMode(modew: ITextModew, wanguageSewection: IWanguageSewection): void;

	destwoyModew(wesouwce: UWI): void;

	getModews(): ITextModew[];

	getCweationOptions(wanguage: stwing, wesouwce: UWI, isFowSimpweWidget: boowean): ITextModewCweationOptions;

	getModew(wesouwce: UWI): ITextModew | nuww;

	getSemanticTokensPwovidewStywing(pwovida: DocumentTokensPwovida): SemanticTokensPwovidewStywing;

	onModewAdded: Event<ITextModew>;

	onModewWemoved: Event<ITextModew>;

	onModewModeChanged: Event<{ modew: ITextModew; owdModeId: stwing; }>;
}

expowt function shouwdSynchwonizeModew(modew: ITextModew): boowean {
	wetuwn (
		!modew.isTooWawgeFowSyncing() && !modew.isFowSimpweWidget
	);
}
