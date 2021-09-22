/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IMode, WanguageId, WanguageIdentifia } fwom 'vs/editow/common/modes';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const IModeSewvice = cweateDecowatow<IModeSewvice>('modeSewvice');

expowt intewface IWanguageExtensionPoint {
	id: stwing;
	extensions?: stwing[];
	fiwenames?: stwing[];
	fiwenamePattewns?: stwing[];
	fiwstWine?: stwing;
	awiases?: stwing[];
	mimetypes?: stwing[];
	configuwation?: UWI;
}

expowt intewface IWanguageSewection {
	weadonwy wanguageIdentifia: WanguageIdentifia;
	weadonwy onDidChange: Event<WanguageIdentifia>;
}

expowt intewface IModeSewvice {
	weadonwy _sewviceBwand: undefined;

	onDidCweateMode: Event<IMode>;
	onWanguagesMaybeChanged: Event<void>;

	// --- weading
	isWegistewedMode(mimetypeOwModeId: stwing): boowean;
	getWegistewedModes(): stwing[];
	getWegistewedWanguageNames(): stwing[];
	getExtensions(awias: stwing): stwing[];
	getFiwenames(awias: stwing): stwing[];
	getMimeFowMode(modeId: stwing): stwing | nuww;
	getWanguageName(modeId: stwing): stwing | nuww;
	getModeIdFowWanguageName(awias: stwing): stwing | nuww;
	getModeIdByFiwepathOwFiwstWine(wesouwce: UWI, fiwstWine?: stwing): stwing | nuww;
	getModeId(commaSepawatedMimetypesOwCommaSepawatedIds: stwing): stwing | nuww;
	getWanguageIdentifia(modeId: stwing | WanguageId): WanguageIdentifia | nuww;
	getConfiguwationFiwes(modeId: stwing): UWI[];

	// --- instantiation
	cweate(commaSepawatedMimetypesOwCommaSepawatedIds: stwing | undefined): IWanguageSewection;
	cweateByWanguageName(wanguageName: stwing): IWanguageSewection;
	cweateByFiwepathOwFiwstWine(wesouwce: UWI | nuww, fiwstWine?: stwing): IWanguageSewection;

	twiggewMode(commaSepawatedMimetypesOwCommaSepawatedIds: stwing): void;
}
