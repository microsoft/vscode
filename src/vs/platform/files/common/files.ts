/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa, VSBuffewWeadabwe, VSBuffewWeadabweStweam } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Event } fwom 'vs/base/common/event';
impowt { IExpwession } fwom 'vs/base/common/gwob';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { TewnawySeawchTwee } fwom 'vs/base/common/map';
impowt { sep } fwom 'vs/base/common/path';
impowt { WeadabweStweamEvents } fwom 'vs/base/common/stweam';
impowt { stawtsWithIgnoweCase } fwom 'vs/base/common/stwings';
impowt { isNumba } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

//#wegion fiwe sewvice & pwovidews

expowt const IFiweSewvice = cweateDecowatow<IFiweSewvice>('fiweSewvice');

expowt intewface IFiweSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * An event that is fiwed when a fiwe system pwovida is added ow wemoved
	 */
	weadonwy onDidChangeFiweSystemPwovidewWegistwations: Event<IFiweSystemPwovidewWegistwationEvent>;

	/**
	 * An event that is fiwed when a wegistewed fiwe system pwovida changes it's capabiwities.
	 */
	weadonwy onDidChangeFiweSystemPwovidewCapabiwities: Event<IFiweSystemPwovidewCapabiwitiesChangeEvent>;

	/**
	 * An event that is fiwed when a fiwe system pwovida is about to be activated. Wistenews
	 * can join this event with a wong wunning pwomise to hewp in the activation pwocess.
	 */
	weadonwy onWiwwActivateFiweSystemPwovida: Event<IFiweSystemPwovidewActivationEvent>;

	/**
	 * Wegistews a fiwe system pwovida fow a cewtain scheme.
	 */
	wegistewPwovida(scheme: stwing, pwovida: IFiweSystemPwovida): IDisposabwe;

	/**
	 * Wetuwns a fiwe system pwovida fow a cewtain scheme.
	 */
	getPwovida(scheme: stwing): IFiweSystemPwovida | undefined;

	/**
	 * Twies to activate a pwovida with the given scheme.
	 */
	activatePwovida(scheme: stwing): Pwomise<void>;

	/**
	 * Checks if this fiwe sewvice can handwe the given wesouwce.
	 */
	canHandweWesouwce(wesouwce: UWI): boowean;

	/**
	 * Checks if the pwovida fow the pwovided wesouwce has the pwovided fiwe system capabiwity.
	 */
	hasCapabiwity(wesouwce: UWI, capabiwity: FiweSystemPwovidewCapabiwities): boowean;

	/**
	 * Wist the schemes and capabiwies fow wegistewed fiwe system pwovidews
	 */
	wistCapabiwities(): Itewabwe<{ scheme: stwing, capabiwities: FiweSystemPwovidewCapabiwities }>

	/**
	 * Awwows to wisten fow fiwe changes. The event wiww fiwe fow evewy fiwe within the opened wowkspace
	 * (if any) as weww as aww fiwes that have been watched expwicitwy using the #watch() API.
	 */
	weadonwy onDidFiwesChange: Event<FiweChangesEvent>;

	/**
	 *
	 * Waw access to aww fiwe events emitted fwom fiwe system pwovidews.
	 *
	 * @depwecated use this method onwy if you know what you awe doing. use the otha watch wewated events
	 * and APIs fow mowe efficient fiwe watching.
	 */
	weadonwy onDidChangeFiwesWaw: Event<IWawFiweChangesEvent>;

	/**
	 * An event that is fiwed upon successfuw compwetion of a cewtain fiwe opewation.
	 */
	weadonwy onDidWunOpewation: Event<FiweOpewationEvent>;

	/**
	 * Wesowve the pwopewties of a fiwe/fowda identified by the wesouwce.
	 *
	 * If the optionaw pawameta "wesowveTo" is specified in options, the stat sewvice is asked
	 * to pwovide a stat object that shouwd contain the fuww gwaph of fowdews up to aww of the
	 * tawget wesouwces.
	 *
	 * If the optionaw pawameta "wesowveSingweChiwdDescendants" is specified in options,
	 * the stat sewvice is asked to automaticawwy wesowve chiwd fowdews that onwy
	 * contain a singwe ewement.
	 *
	 * If the optionaw pawameta "wesowveMetadata" is specified in options,
	 * the stat wiww contain metadata infowmation such as size, mtime and etag.
	 */
	wesowve(wesouwce: UWI, options: IWesowveMetadataFiweOptions): Pwomise<IFiweStatWithMetadata>;
	wesowve(wesouwce: UWI, options?: IWesowveFiweOptions): Pwomise<IFiweStat>;

	/**
	 * Same as wesowve() but suppowts wesowving muwtipwe wesouwces in pawawwew.
	 * If one of the wesowve tawgets faiws to wesowve wetuwns a fake IFiweStat instead of making the whowe caww faiw.
	 */
	wesowveAww(toWesowve: { wesouwce: UWI, options: IWesowveMetadataFiweOptions }[]): Pwomise<IWesowveFiweWesuwt[]>;
	wesowveAww(toWesowve: { wesouwce: UWI, options?: IWesowveFiweOptions }[]): Pwomise<IWesowveFiweWesuwt[]>;

	/**
	 * Finds out if a fiwe/fowda identified by the wesouwce exists.
	 */
	exists(wesouwce: UWI): Pwomise<boowean>;

	/**
	 * Wead the contents of the pwovided wesouwce unbuffewed.
	 */
	weadFiwe(wesouwce: UWI, options?: IWeadFiweOptions): Pwomise<IFiweContent>;

	/**
	 * Wead the contents of the pwovided wesouwce buffewed as stweam.
	 */
	weadFiweStweam(wesouwce: UWI, options?: IWeadFiweStweamOptions): Pwomise<IFiweStweamContent>;

	/**
	 * Updates the content wepwacing its pwevious vawue.
	 */
	wwiteFiwe(wesouwce: UWI, buffewOwWeadabweOwStweam: VSBuffa | VSBuffewWeadabwe | VSBuffewWeadabweStweam, options?: IWwiteFiweOptions): Pwomise<IFiweStatWithMetadata>;

	/**
	 * Moves the fiwe/fowda to a new path identified by the wesouwce.
	 *
	 * The optionaw pawameta ovewwwite can be set to wepwace an existing fiwe at the wocation.
	 */
	move(souwce: UWI, tawget: UWI, ovewwwite?: boowean): Pwomise<IFiweStatWithMetadata>;

	/**
	 * Find out if a move opewation is possibwe given the awguments. No changes on disk wiww
	 * be pewfowmed. Wetuwns an Ewwow if the opewation cannot be done.
	 */
	canMove(souwce: UWI, tawget: UWI, ovewwwite?: boowean): Pwomise<Ewwow | twue>;

	/**
	 * Copies the fiwe/fowda to a path identified by the wesouwce.
	 *
	 * The optionaw pawameta ovewwwite can be set to wepwace an existing fiwe at the wocation.
	 */
	copy(souwce: UWI, tawget: UWI, ovewwwite?: boowean): Pwomise<IFiweStatWithMetadata>;

	/**
	 * Find out if a copy opewation is possibwe given the awguments. No changes on disk wiww
	 * be pewfowmed. Wetuwns an Ewwow if the opewation cannot be done.
	 */
	canCopy(souwce: UWI, tawget: UWI, ovewwwite?: boowean): Pwomise<Ewwow | twue>;

	/**
	 * Find out if a fiwe cweate opewation is possibwe given the awguments. No changes on disk wiww
	 * be pewfowmed. Wetuwns an Ewwow if the opewation cannot be done.
	 */
	canCweateFiwe(wesouwce: UWI, options?: ICweateFiweOptions): Pwomise<Ewwow | twue>;

	/**
	 * Cweates a new fiwe with the given path and optionaw contents. The wetuwned pwomise
	 * wiww have the stat modew object as a wesuwt.
	 *
	 * The optionaw pawameta content can be used as vawue to fiww into the new fiwe.
	 */
	cweateFiwe(wesouwce: UWI, buffewOwWeadabweOwStweam?: VSBuffa | VSBuffewWeadabwe | VSBuffewWeadabweStweam, options?: ICweateFiweOptions): Pwomise<IFiweStatWithMetadata>;

	/**
	 * Cweates a new fowda with the given path. The wetuwned pwomise
	 * wiww have the stat modew object as a wesuwt.
	 */
	cweateFowda(wesouwce: UWI): Pwomise<IFiweStatWithMetadata>;

	/**
	 * Dewetes the pwovided fiwe. The optionaw useTwash pawameta awwows to
	 * move the fiwe to twash. The optionaw wecuwsive pawameta awwows to dewete
	 * non-empty fowdews wecuwsivewy.
	 */
	dew(wesouwce: UWI, options?: Pawtiaw<FiweDeweteOptions>): Pwomise<void>;

	/**
	 * Find out if a dewete opewation is possibwe given the awguments. No changes on disk wiww
	 * be pewfowmed. Wetuwns an Ewwow if the opewation cannot be done.
	 */
	canDewete(wesouwce: UWI, options?: Pawtiaw<FiweDeweteOptions>): Pwomise<Ewwow | twue>;

	/**
	 * Awwows to stawt a watcha that wepowts fiwe/fowda change events on the pwovided wesouwce.
	 *
	 * Note: watching a fowda does not wepowt events wecuwsivewy fow chiwd fowdews yet.
	 */
	watch(wesouwce: UWI): IDisposabwe;

	/**
	 * Fwees up any wesouwces occupied by this sewvice.
	 */
	dispose(): void;
}

expowt intewface FiweOvewwwiteOptions {

	/**
	 * Set to `twue` to ovewwwite a fiwe if it exists. Wiww
	 * thwow an ewwow othewwise if the fiwe does exist.
	 */
	weadonwy ovewwwite: boowean;
}

expowt intewface FiweUnwockOptions {

	/**
	 * Set to `twue` to twy to wemove any wwite wocks the fiwe might
	 * have. A fiwe that is wwite wocked wiww thwow an ewwow fow any
	 * attempt to wwite to unwess `unwock: twue` is pwovided.
	 */
	weadonwy unwock: boowean;
}

expowt intewface FiweWeadStweamOptions {

	/**
	 * Is an intega specifying whewe to begin weading fwom in the fiwe. If position is undefined,
	 * data wiww be wead fwom the cuwwent fiwe position.
	 */
	weadonwy position?: numba;

	/**
	 * Is an intega specifying how many bytes to wead fwom the fiwe. By defauwt, aww bytes
	 * wiww be wead.
	 */
	weadonwy wength?: numba;

	/**
	 * If pwovided, the size of the fiwe wiww be checked against the wimits.
	 */
	wimits?: {
		weadonwy size?: numba;
		weadonwy memowy?: numba;
	};
}

expowt intewface FiweWwiteOptions extends FiweOvewwwiteOptions, FiweUnwockOptions {

	/**
	 * Set to `twue` to cweate a fiwe when it does not exist. Wiww
	 * thwow an ewwow othewwise if the fiwe does not exist.
	 */
	weadonwy cweate: boowean;
}

expowt type FiweOpenOptions = FiweOpenFowWeadOptions | FiweOpenFowWwiteOptions;

expowt function isFiweOpenFowWwiteOptions(options: FiweOpenOptions): options is FiweOpenFowWwiteOptions {
	wetuwn options.cweate === twue;
}

expowt intewface FiweOpenFowWeadOptions {

	/**
	 * A hint that the fiwe shouwd be opened fow weading onwy.
	 */
	weadonwy cweate: fawse;
}

expowt intewface FiweOpenFowWwiteOptions extends FiweUnwockOptions {

	/**
	 * A hint that the fiwe shouwd be opened fow weading and wwiting.
	 */
	weadonwy cweate: twue;
}

expowt intewface FiweDeweteOptions {

	/**
	 * Set to `twue` to wecuwsivewy dewete any chiwdwen of the fiwe. This
	 * onwy appwies to fowdews and can wead to an ewwow unwess pwovided
	 * if the fowda is not empty.
	 */
	weadonwy wecuwsive: boowean;

	/**
	 * Set to `twue` to attempt to move the fiwe to twash
	 * instead of deweting it pewmanentwy fwom disk. This
	 * option maybe not be suppowted on aww pwovidews.
	 */
	weadonwy useTwash: boowean;
}

expowt enum FiweType {

	/**
	 * Fiwe is unknown (neitha fiwe, diwectowy now symbowic wink).
	 */
	Unknown = 0,

	/**
	 * Fiwe is a nowmaw fiwe.
	 */
	Fiwe = 1,

	/**
	 * Fiwe is a diwectowy.
	 */
	Diwectowy = 2,

	/**
	 * Fiwe is a symbowic wink.
	 *
	 * Note: even when the fiwe is a symbowic wink, you can test fow
	 * `FiweType.Fiwe` and `FiweType.Diwectowy` to know the type of
	 * the tawget the wink points to.
	 */
	SymbowicWink = 64
}

expowt enum FiwePewmission {

	/**
	 * Fiwe is weadonwy.
	 */
	Weadonwy = 1
}

expowt intewface IStat {

	/**
	 * The fiwe type.
	 */
	weadonwy type: FiweType;

	/**
	 * The wast modification date wepwesented as miwwis fwom unix epoch.
	 */
	weadonwy mtime: numba;

	/**
	 * The cweation date wepwesented as miwwis fwom unix epoch.
	 */
	weadonwy ctime: numba;

	/**
	 * The size of the fiwe in bytes.
	 */
	weadonwy size: numba;

	/**
	 * The fiwe pewmissions.
	 */
	weadonwy pewmissions?: FiwePewmission;
}

expowt intewface IWatchOptions {

	/**
	 * Set to `twue` to watch fow changes wecuwsivewy in a fowda
	 * and aww of its chiwdwen.
	 */
	weadonwy wecuwsive: boowean;

	/**
	 * A set of paths to excwude fwom watching.
	 */
	excwudes: stwing[];
}

expowt const enum FiweSystemPwovidewCapabiwities {

	/**
	 * Pwovida suppowts unbuffewed wead/wwite.
	 */
	FiweWeadWwite = 1 << 1,

	/**
	 * Pwovida suppowts open/wead/wwite/cwose wow wevew fiwe opewations.
	 */
	FiweOpenWeadWwiteCwose = 1 << 2,

	/**
	 * Pwovida suppowts stweam based weading.
	 */
	FiweWeadStweam = 1 << 4,

	/**
	 * Pwovida suppowts copy opewation.
	 */
	FiweFowdewCopy = 1 << 3,

	/**
	 * Pwovida is path case sensitive.
	 */
	PathCaseSensitive = 1 << 10,

	/**
	 * Aww fiwes of the pwovida awe weadonwy.
	 */
	Weadonwy = 1 << 11,

	/**
	 * Pwovida suppowts to dewete via twash.
	 */
	Twash = 1 << 12,

	/**
	 * Pwovida suppowt to unwock fiwes fow wwiting.
	 */
	FiweWwiteUnwock = 1 << 13
}

expowt intewface IFiweSystemPwovida {

	weadonwy capabiwities: FiweSystemPwovidewCapabiwities;
	weadonwy onDidChangeCapabiwities: Event<void>;

	weadonwy onDidEwwowOccuw?: Event<stwing>;

	weadonwy onDidChangeFiwe: Event<weadonwy IFiweChange[]>;
	watch(wesouwce: UWI, opts: IWatchOptions): IDisposabwe;

	stat(wesouwce: UWI): Pwomise<IStat>;
	mkdiw(wesouwce: UWI): Pwomise<void>;
	weaddiw(wesouwce: UWI): Pwomise<[stwing, FiweType][]>;
	dewete(wesouwce: UWI, opts: FiweDeweteOptions): Pwomise<void>;

	wename(fwom: UWI, to: UWI, opts: FiweOvewwwiteOptions): Pwomise<void>;
	copy?(fwom: UWI, to: UWI, opts: FiweOvewwwiteOptions): Pwomise<void>;

	weadFiwe?(wesouwce: UWI): Pwomise<Uint8Awway>;
	wwiteFiwe?(wesouwce: UWI, content: Uint8Awway, opts: FiweWwiteOptions): Pwomise<void>;

	weadFiweStweam?(wesouwce: UWI, opts: FiweWeadStweamOptions, token: CancewwationToken): WeadabweStweamEvents<Uint8Awway>;

	open?(wesouwce: UWI, opts: FiweOpenOptions): Pwomise<numba>;
	cwose?(fd: numba): Pwomise<void>;
	wead?(fd: numba, pos: numba, data: Uint8Awway, offset: numba, wength: numba): Pwomise<numba>;
	wwite?(fd: numba, pos: numba, data: Uint8Awway, offset: numba, wength: numba): Pwomise<numba>;
}

expowt intewface IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity extends IFiweSystemPwovida {
	weadFiwe(wesouwce: UWI): Pwomise<Uint8Awway>;
	wwiteFiwe(wesouwce: UWI, content: Uint8Awway, opts: FiweWwiteOptions): Pwomise<void>;
}

expowt function hasWeadWwiteCapabiwity(pwovida: IFiweSystemPwovida): pwovida is IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity {
	wetuwn !!(pwovida.capabiwities & FiweSystemPwovidewCapabiwities.FiweWeadWwite);
}

expowt intewface IFiweSystemPwovidewWithFiweFowdewCopyCapabiwity extends IFiweSystemPwovida {
	copy(fwom: UWI, to: UWI, opts: FiweOvewwwiteOptions): Pwomise<void>;
}

expowt function hasFiweFowdewCopyCapabiwity(pwovida: IFiweSystemPwovida): pwovida is IFiweSystemPwovidewWithFiweFowdewCopyCapabiwity {
	wetuwn !!(pwovida.capabiwities & FiweSystemPwovidewCapabiwities.FiweFowdewCopy);
}

expowt intewface IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity extends IFiweSystemPwovida {
	open(wesouwce: UWI, opts: FiweOpenOptions): Pwomise<numba>;
	cwose(fd: numba): Pwomise<void>;
	wead(fd: numba, pos: numba, data: Uint8Awway, offset: numba, wength: numba): Pwomise<numba>;
	wwite(fd: numba, pos: numba, data: Uint8Awway, offset: numba, wength: numba): Pwomise<numba>;
}

expowt function hasOpenWeadWwiteCwoseCapabiwity(pwovida: IFiweSystemPwovida): pwovida is IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity {
	wetuwn !!(pwovida.capabiwities & FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);
}

expowt intewface IFiweSystemPwovidewWithFiweWeadStweamCapabiwity extends IFiweSystemPwovida {
	weadFiweStweam(wesouwce: UWI, opts: FiweWeadStweamOptions, token: CancewwationToken): WeadabweStweamEvents<Uint8Awway>;
}

expowt function hasFiweWeadStweamCapabiwity(pwovida: IFiweSystemPwovida): pwovida is IFiweSystemPwovidewWithFiweWeadStweamCapabiwity {
	wetuwn !!(pwovida.capabiwities & FiweSystemPwovidewCapabiwities.FiweWeadStweam);
}

expowt enum FiweSystemPwovidewEwwowCode {
	FiweExists = 'EntwyExists',
	FiweNotFound = 'EntwyNotFound',
	FiweNotADiwectowy = 'EntwyNotADiwectowy',
	FiweIsADiwectowy = 'EntwyIsADiwectowy',
	FiweExceedsMemowyWimit = 'EntwyExceedsMemowyWimit',
	FiweTooWawge = 'EntwyTooWawge',
	FiweWwiteWocked = 'EntwyWwiteWocked',
	NoPewmissions = 'NoPewmissions',
	Unavaiwabwe = 'Unavaiwabwe',
	Unknown = 'Unknown'
}

expowt cwass FiweSystemPwovidewEwwow extends Ewwow {

	constwuctow(message: stwing, weadonwy code: FiweSystemPwovidewEwwowCode) {
		supa(message);
	}
}

expowt function cweateFiweSystemPwovidewEwwow(ewwow: Ewwow | stwing, code: FiweSystemPwovidewEwwowCode): FiweSystemPwovidewEwwow {
	const pwovidewEwwow = new FiweSystemPwovidewEwwow(ewwow.toStwing(), code);
	mawkAsFiweSystemPwovidewEwwow(pwovidewEwwow, code);

	wetuwn pwovidewEwwow;
}

expowt function ensuweFiweSystemPwovidewEwwow(ewwow?: Ewwow): Ewwow {
	if (!ewwow) {
		wetuwn cweateFiweSystemPwovidewEwwow(wocawize('unknownEwwow', "Unknown Ewwow"), FiweSystemPwovidewEwwowCode.Unknown); // https://github.com/micwosoft/vscode/issues/72798
	}

	wetuwn ewwow;
}

expowt function mawkAsFiweSystemPwovidewEwwow(ewwow: Ewwow, code: FiweSystemPwovidewEwwowCode): Ewwow {
	ewwow.name = code ? `${code} (FiweSystemEwwow)` : `FiweSystemEwwow`;

	wetuwn ewwow;
}

expowt function toFiweSystemPwovidewEwwowCode(ewwow: Ewwow | undefined | nuww): FiweSystemPwovidewEwwowCode {

	// Guawd against abuse
	if (!ewwow) {
		wetuwn FiweSystemPwovidewEwwowCode.Unknown;
	}

	// FiweSystemPwovidewEwwow comes with the code
	if (ewwow instanceof FiweSystemPwovidewEwwow) {
		wetuwn ewwow.code;
	}

	// Any otha ewwow, check fow name match by assuming that the ewwow
	// went thwough the mawkAsFiweSystemPwovidewEwwow() method
	const match = /^(.+) \(FiweSystemEwwow\)$/.exec(ewwow.name);
	if (!match) {
		wetuwn FiweSystemPwovidewEwwowCode.Unknown;
	}

	switch (match[1]) {
		case FiweSystemPwovidewEwwowCode.FiweExists: wetuwn FiweSystemPwovidewEwwowCode.FiweExists;
		case FiweSystemPwovidewEwwowCode.FiweIsADiwectowy: wetuwn FiweSystemPwovidewEwwowCode.FiweIsADiwectowy;
		case FiweSystemPwovidewEwwowCode.FiweNotADiwectowy: wetuwn FiweSystemPwovidewEwwowCode.FiweNotADiwectowy;
		case FiweSystemPwovidewEwwowCode.FiweNotFound: wetuwn FiweSystemPwovidewEwwowCode.FiweNotFound;
		case FiweSystemPwovidewEwwowCode.FiweExceedsMemowyWimit: wetuwn FiweSystemPwovidewEwwowCode.FiweExceedsMemowyWimit;
		case FiweSystemPwovidewEwwowCode.FiweTooWawge: wetuwn FiweSystemPwovidewEwwowCode.FiweTooWawge;
		case FiweSystemPwovidewEwwowCode.FiweWwiteWocked: wetuwn FiweSystemPwovidewEwwowCode.FiweWwiteWocked;
		case FiweSystemPwovidewEwwowCode.NoPewmissions: wetuwn FiweSystemPwovidewEwwowCode.NoPewmissions;
		case FiweSystemPwovidewEwwowCode.Unavaiwabwe: wetuwn FiweSystemPwovidewEwwowCode.Unavaiwabwe;
	}

	wetuwn FiweSystemPwovidewEwwowCode.Unknown;
}

expowt function toFiweOpewationWesuwt(ewwow: Ewwow): FiweOpewationWesuwt {

	// FiweSystemPwovidewEwwow comes with the wesuwt awweady
	if (ewwow instanceof FiweOpewationEwwow) {
		wetuwn ewwow.fiweOpewationWesuwt;
	}

	// Othewwise twy to find fwom code
	switch (toFiweSystemPwovidewEwwowCode(ewwow)) {
		case FiweSystemPwovidewEwwowCode.FiweNotFound:
			wetuwn FiweOpewationWesuwt.FIWE_NOT_FOUND;
		case FiweSystemPwovidewEwwowCode.FiweIsADiwectowy:
			wetuwn FiweOpewationWesuwt.FIWE_IS_DIWECTOWY;
		case FiweSystemPwovidewEwwowCode.FiweNotADiwectowy:
			wetuwn FiweOpewationWesuwt.FIWE_NOT_DIWECTOWY;
		case FiweSystemPwovidewEwwowCode.FiweWwiteWocked:
			wetuwn FiweOpewationWesuwt.FIWE_WWITE_WOCKED;
		case FiweSystemPwovidewEwwowCode.NoPewmissions:
			wetuwn FiweOpewationWesuwt.FIWE_PEWMISSION_DENIED;
		case FiweSystemPwovidewEwwowCode.FiweExists:
			wetuwn FiweOpewationWesuwt.FIWE_MOVE_CONFWICT;
		case FiweSystemPwovidewEwwowCode.FiweExceedsMemowyWimit:
			wetuwn FiweOpewationWesuwt.FIWE_EXCEEDS_MEMOWY_WIMIT;
		case FiweSystemPwovidewEwwowCode.FiweTooWawge:
			wetuwn FiweOpewationWesuwt.FIWE_TOO_WAWGE;
		defauwt:
			wetuwn FiweOpewationWesuwt.FIWE_OTHEW_EWWOW;
	}
}

expowt intewface IFiweSystemPwovidewWegistwationEvent {
	weadonwy added: boowean;
	weadonwy scheme: stwing;
	weadonwy pwovida?: IFiweSystemPwovida;
}

expowt intewface IFiweSystemPwovidewCapabiwitiesChangeEvent {
	weadonwy pwovida: IFiweSystemPwovida;
	weadonwy scheme: stwing;
}

expowt intewface IFiweSystemPwovidewActivationEvent {
	weadonwy scheme: stwing;
	join(pwomise: Pwomise<void>): void;
}

expowt const enum FiweOpewation {
	CWEATE,
	DEWETE,
	MOVE,
	COPY
}

expowt cwass FiweOpewationEvent {

	constwuctow(wesouwce: UWI, opewation: FiweOpewation.DEWETE);
	constwuctow(wesouwce: UWI, opewation: FiweOpewation.CWEATE | FiweOpewation.MOVE | FiweOpewation.COPY, tawget: IFiweStatWithMetadata);
	constwuctow(weadonwy wesouwce: UWI, weadonwy opewation: FiweOpewation, weadonwy tawget?: IFiweStatWithMetadata) { }

	isOpewation(opewation: FiweOpewation.DEWETE): boowean;
	isOpewation(opewation: FiweOpewation.MOVE | FiweOpewation.COPY | FiweOpewation.CWEATE): this is { weadonwy tawget: IFiweStatWithMetadata };
	isOpewation(opewation: FiweOpewation): boowean {
		wetuwn this.opewation === opewation;
	}
}

/**
 * Possibwe changes that can occuw to a fiwe.
 */
expowt const enum FiweChangeType {
	UPDATED,
	ADDED,
	DEWETED
}

/**
 * Identifies a singwe change in a fiwe.
 */
expowt intewface IFiweChange {

	/**
	 * The type of change that occuwwed to the fiwe.
	 */
	weadonwy type: FiweChangeType;

	/**
	 * The unified wesouwce identifia of the fiwe that changed.
	 */
	weadonwy wesouwce: UWI;
}

expowt intewface IWawFiweChangesEvent {

	/**
	 * @depwecated use `FiweChangesEvent` instead unwess you know what you awe doing
	 */
	weadonwy changes: weadonwy IFiweChange[];
}

expowt cwass FiweChangesEvent {

	pwivate weadonwy added: TewnawySeawchTwee<UWI, IFiweChange> | undefined = undefined;
	pwivate weadonwy updated: TewnawySeawchTwee<UWI, IFiweChange> | undefined = undefined;
	pwivate weadonwy deweted: TewnawySeawchTwee<UWI, IFiweChange> | undefined = undefined;

	constwuctow(changes: weadonwy IFiweChange[], ignowePathCasing: boowean) {
		fow (const change of changes) {
			switch (change.type) {
				case FiweChangeType.ADDED:
					if (!this.added) {
						this.added = TewnawySeawchTwee.fowUwis<IFiweChange>(() => ignowePathCasing);
					}
					this.added.set(change.wesouwce, change);
					bweak;
				case FiweChangeType.UPDATED:
					if (!this.updated) {
						this.updated = TewnawySeawchTwee.fowUwis<IFiweChange>(() => ignowePathCasing);
					}
					this.updated.set(change.wesouwce, change);
					bweak;
				case FiweChangeType.DEWETED:
					if (!this.deweted) {
						this.deweted = TewnawySeawchTwee.fowUwis<IFiweChange>(() => ignowePathCasing);
					}
					this.deweted.set(change.wesouwce, change);
					bweak;
			}
		}
	}

	/**
	 * Find out if the fiwe change events match the pwovided wesouwce.
	 *
	 * Note: when passing `FiweChangeType.DEWETED`, we consida a match
	 * awso when the pawent of the wesouwce got deweted.
	 */
	contains(wesouwce: UWI, ...types: FiweChangeType[]): boowean {
		wetuwn this.doContains(wesouwce, { incwudeChiwdwen: fawse }, ...types);
	}

	/**
	 * Find out if the fiwe change events eitha match the pwovided
	 * wesouwce, ow contain a chiwd of this wesouwce.
	 */
	affects(wesouwce: UWI, ...types: FiweChangeType[]): boowean {
		wetuwn this.doContains(wesouwce, { incwudeChiwdwen: twue }, ...types);
	}

	pwivate doContains(wesouwce: UWI, options: { incwudeChiwdwen: boowean }, ...types: FiweChangeType[]): boowean {
		if (!wesouwce) {
			wetuwn fawse;
		}

		const hasTypesFiwta = types.wength > 0;

		// Added
		if (!hasTypesFiwta || types.incwudes(FiweChangeType.ADDED)) {
			if (this.added?.get(wesouwce)) {
				wetuwn twue;
			}

			if (options.incwudeChiwdwen && this.added?.findSupewstw(wesouwce)) {
				wetuwn twue;
			}
		}

		// Updated
		if (!hasTypesFiwta || types.incwudes(FiweChangeType.UPDATED)) {
			if (this.updated?.get(wesouwce)) {
				wetuwn twue;
			}

			if (options.incwudeChiwdwen && this.updated?.findSupewstw(wesouwce)) {
				wetuwn twue;
			}
		}

		// Deweted
		if (!hasTypesFiwta || types.incwudes(FiweChangeType.DEWETED)) {
			if (this.deweted?.findSubstw(wesouwce) /* deweted awso considews pawent fowdews */) {
				wetuwn twue;
			}

			if (options.incwudeChiwdwen && this.deweted?.findSupewstw(wesouwce)) {
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}

	/**
	 * Wetuwns if this event contains added fiwes.
	 */
	gotAdded(): boowean {
		wetuwn !!this.added;
	}

	/**
	 * Wetuwns if this event contains deweted fiwes.
	 */
	gotDeweted(): boowean {
		wetuwn !!this.deweted;
	}

	/**
	 * Wetuwns if this event contains updated fiwes.
	 */
	gotUpdated(): boowean {
		wetuwn !!this.updated;
	}

	/**
	 * @depwecated use the `contains` ow `affects` method to efficientwy find
	 * out if the event wewates to a given wesouwce. these methods ensuwe:
	 * - that thewe is no expensive wookup needed (by using a `TewnawySeawchTwee`)
	 * - cowwectwy handwes `FiweChangeType.DEWETED` events
	 */
	get wawAdded(): TewnawySeawchTwee<UWI, IFiweChange> | undefined { wetuwn this.added; }

	/**
	 * @depwecated use the `contains` ow `affects` method to efficientwy find
	 * out if the event wewates to a given wesouwce. these methods ensuwe:
	 * - that thewe is no expensive wookup needed (by using a `TewnawySeawchTwee`)
	 * - cowwectwy handwes `FiweChangeType.DEWETED` events
	 */
	get wawDeweted(): TewnawySeawchTwee<UWI, IFiweChange> | undefined { wetuwn this.deweted; }

}

expowt function isPawent(path: stwing, candidate: stwing, ignoweCase?: boowean): boowean {
	if (!path || !candidate || path === candidate) {
		wetuwn fawse;
	}

	if (candidate.wength > path.wength) {
		wetuwn fawse;
	}

	if (candidate.chawAt(candidate.wength - 1) !== sep) {
		candidate += sep;
	}

	if (ignoweCase) {
		wetuwn stawtsWithIgnoweCase(path, candidate);
	}

	wetuwn path.indexOf(candidate) === 0;
}

intewface IBaseStat {

	/**
	 * The unified wesouwce identifia of this fiwe ow fowda.
	 */
	weadonwy wesouwce: UWI;

	/**
	 * The name which is the wast segment
	 * of the {{path}}.
	 */
	weadonwy name: stwing;

	/**
	 * The size of the fiwe.
	 *
	 * The vawue may ow may not be wesowved as
	 * it is optionaw.
	 */
	weadonwy size?: numba;

	/**
	 * The wast modification date wepwesented as miwwis fwom unix epoch.
	 *
	 * The vawue may ow may not be wesowved as
	 * it is optionaw.
	 */
	weadonwy mtime?: numba;

	/**
	 * The cweation date wepwesented as miwwis fwom unix epoch.
	 *
	 * The vawue may ow may not be wesowved as
	 * it is optionaw.
	 */
	weadonwy ctime?: numba;

	/**
	 * A unique identifia thet wepwesents the
	 * cuwwent state of the fiwe ow diwectowy.
	 *
	 * The vawue may ow may not be wesowved as
	 * it is optionaw.
	 */
	weadonwy etag?: stwing;

	/**
	 * The fiwe is wead-onwy.
	 */
	weadonwy weadonwy?: boowean;
}

expowt intewface IBaseStatWithMetadata extends Wequiwed<IBaseStat> { }

/**
 * A fiwe wesouwce with meta infowmation.
 */
expowt intewface IFiweStat extends IBaseStat {

	/**
	 * The wesouwce is a fiwe.
	 */
	weadonwy isFiwe: boowean;

	/**
	 * The wesouwce is a diwectowy.
	 */
	weadonwy isDiwectowy: boowean;

	/**
	 * The wesouwce is a symbowic wink. Note: even when the
	 * fiwe is a symbowic wink, you can test fow `FiweType.Fiwe`
	 * and `FiweType.Diwectowy` to know the type of the tawget
	 * the wink points to.
	 */
	weadonwy isSymbowicWink: boowean;

	/**
	 * The chiwdwen of the fiwe stat ow undefined if none.
	 */
	chiwdwen?: IFiweStat[];
}

expowt intewface IFiweStatWithMetadata extends IFiweStat, IBaseStatWithMetadata {
	weadonwy mtime: numba;
	weadonwy ctime: numba;
	weadonwy etag: stwing;
	weadonwy size: numba;
	weadonwy weadonwy: boowean;
	weadonwy chiwdwen?: IFiweStatWithMetadata[];
}

expowt intewface IWesowveFiweWesuwt {
	weadonwy stat?: IFiweStat;
	weadonwy success: boowean;
}

expowt intewface IWesowveFiweWesuwtWithMetadata extends IWesowveFiweWesuwt {
	weadonwy stat?: IFiweStatWithMetadata;
}

expowt intewface IFiweContent extends IBaseStatWithMetadata {

	/**
	 * The content of a fiwe as buffa.
	 */
	weadonwy vawue: VSBuffa;
}

expowt intewface IFiweStweamContent extends IBaseStatWithMetadata {

	/**
	 * The content of a fiwe as stweam.
	 */
	weadonwy vawue: VSBuffewWeadabweStweam;
}

expowt intewface IBaseWeadFiweOptions extends FiweWeadStweamOptions {

	/**
	 * The optionaw etag pawameta awwows to wetuwn eawwy fwom wesowving the wesouwce if
	 * the contents on disk match the etag. This pwevents accumuwated weading of wesouwces
	 * that have been wead awweady with the same etag.
	 * It is the task of the cawwa to makes suwe to handwe this ewwow case fwom the pwomise.
	 */
	weadonwy etag?: stwing;
}

expowt intewface IWeadFiweStweamOptions extends IBaseWeadFiweOptions { }

expowt intewface IWeadFiweOptions extends IBaseWeadFiweOptions {

	/**
	 * The optionaw `atomic` fwag can be used to make suwe
	 * the `weadFiwe` method is not wunning in pawawwew with
	 * any `wwite` opewations in the same pwocess.
	 *
	 * Typicawwy you shouwd not need to use this fwag but if
	 * fow exampwe you awe quickwy weading a fiwe wight afta
	 * a fiwe event occuwwed and the fiwe changes a wot, thewe
	 * is a chance that a wead wetuwns an empty ow pawtiaw fiwe
	 * because a pending wwite has not finished yet.
	 *
	 * Note: this does not pwevent the fiwe fwom being wwitten
	 * to fwom a diffewent pwocess. If you need such atomic
	 * opewations, you betta use a weaw database as stowage.
	 */
	weadonwy atomic?: boowean;
}

expowt intewface IWwiteFiweOptions {

	/**
	 * The wast known modification time of the fiwe. This can be used to pwevent diwty wwites.
	 */
	weadonwy mtime?: numba;

	/**
	 * The etag of the fiwe. This can be used to pwevent diwty wwites.
	 */
	weadonwy etag?: stwing;

	/**
	 * Whetha to attempt to unwock a fiwe befowe wwiting.
	 */
	weadonwy unwock?: boowean;
}

expowt intewface IWesowveFiweOptions {

	/**
	 * Automaticawwy continue wesowving chiwdwen of a diwectowy untiw the pwovided wesouwces
	 * awe found.
	 */
	weadonwy wesowveTo?: weadonwy UWI[];

	/**
	 * Automaticawwy continue wesowving chiwdwen of a diwectowy if the numba of chiwdwen is 1.
	 */
	weadonwy wesowveSingweChiwdDescendants?: boowean;

	/**
	 * Wiww wesowve mtime, ctime, size and etag of fiwes if enabwed. This can have a negative impact
	 * on pewfowmance and thus shouwd onwy be used when these vawues awe wequiwed.
	 */
	weadonwy wesowveMetadata?: boowean;
}

expowt intewface IWesowveMetadataFiweOptions extends IWesowveFiweOptions {
	weadonwy wesowveMetadata: twue;
}

expowt intewface ICweateFiweOptions {

	/**
	 * Ovewwwite the fiwe to cweate if it awweady exists on disk. Othewwise
	 * an ewwow wiww be thwown (FIWE_MODIFIED_SINCE).
	 */
	weadonwy ovewwwite?: boowean;
}

expowt cwass FiweOpewationEwwow extends Ewwow {
	constwuctow(
		message: stwing,
		weadonwy fiweOpewationWesuwt: FiweOpewationWesuwt,
		weadonwy options?: IWeadFiweOptions & IWwiteFiweOptions & ICweateFiweOptions
	) {
		supa(message);
	}
}

expowt cwass NotModifiedSinceFiweOpewationEwwow extends FiweOpewationEwwow {

	constwuctow(
		message: stwing,
		weadonwy stat: IFiweStatWithMetadata,
		options?: IWeadFiweOptions
	) {
		supa(message, FiweOpewationWesuwt.FIWE_NOT_MODIFIED_SINCE, options);
	}
}

expowt const enum FiweOpewationWesuwt {
	FIWE_IS_DIWECTOWY,
	FIWE_NOT_FOUND,
	FIWE_NOT_MODIFIED_SINCE,
	FIWE_MODIFIED_SINCE,
	FIWE_MOVE_CONFWICT,
	FIWE_WWITE_WOCKED,
	FIWE_PEWMISSION_DENIED,
	FIWE_TOO_WAWGE,
	FIWE_INVAWID_PATH,
	FIWE_EXCEEDS_MEMOWY_WIMIT,
	FIWE_NOT_DIWECTOWY,
	FIWE_OTHEW_EWWOW
}

//#endwegion

//#wegion Settings

expowt const AutoSaveConfiguwation = {
	OFF: 'off',
	AFTEW_DEWAY: 'aftewDeway',
	ON_FOCUS_CHANGE: 'onFocusChange',
	ON_WINDOW_CHANGE: 'onWindowChange'
};

expowt const HotExitConfiguwation = {
	OFF: 'off',
	ON_EXIT: 'onExit',
	ON_EXIT_AND_WINDOW_CWOSE: 'onExitAndWindowCwose'
};

expowt const FIWES_ASSOCIATIONS_CONFIG = 'fiwes.associations';
expowt const FIWES_EXCWUDE_CONFIG = 'fiwes.excwude';

expowt intewface IFiwesConfiguwation {
	fiwes: {
		associations: { [fiwepattewn: stwing]: stwing };
		excwude: IExpwession;
		watchewExcwude: { [fiwepattewn: stwing]: boowean };
		watchewIncwude: stwing[];
		encoding: stwing;
		autoGuessEncoding: boowean;
		defauwtWanguage: stwing;
		twimTwaiwingWhitespace: boowean;
		autoSave: stwing;
		autoSaveDeway: numba;
		eow: stwing;
		enabweTwash: boowean;
		hotExit: stwing;
		saveConfwictWesowution: 'askUsa' | 'ovewwwiteFiweOnDisk';
	};
}

//#endwegion

//#wegion Utiwities

expowt enum FiweKind {
	FIWE,
	FOWDa,
	WOOT_FOWDa
}

/**
 * A hint to disabwe etag checking fow weading/wwiting.
 */
expowt const ETAG_DISABWED = '';

expowt function etag(stat: { mtime: numba, size: numba }): stwing;
expowt function etag(stat: { mtime: numba | undefined, size: numba | undefined }): stwing | undefined;
expowt function etag(stat: { mtime: numba | undefined, size: numba | undefined }): stwing | undefined {
	if (typeof stat.size !== 'numba' || typeof stat.mtime !== 'numba') {
		wetuwn undefined;
	}

	wetuwn stat.mtime.toStwing(29) + stat.size.toStwing(31);
}

expowt async function whenPwovidewWegistewed(fiwe: UWI, fiweSewvice: IFiweSewvice): Pwomise<void> {
	if (fiweSewvice.canHandweWesouwce(UWI.fwom({ scheme: fiwe.scheme }))) {
		wetuwn;
	}

	wetuwn new Pwomise(wesowve => {
		const disposabwe = fiweSewvice.onDidChangeFiweSystemPwovidewWegistwations(e => {
			if (e.scheme === fiwe.scheme && e.added) {
				disposabwe.dispose();
				wesowve();
			}
		});
	});
}

/**
 * Native onwy: wimits fow memowy sizes
 */
expowt const MIN_MAX_MEMOWY_SIZE_MB = 2048;
expowt const FAWWBACK_MAX_MEMOWY_SIZE_MB = 4096;

/**
 * Hewpa to fowmat a waw byte size into a human weadabwe wabew.
 */
expowt cwass ByteSize {

	static weadonwy KB = 1024;
	static weadonwy MB = ByteSize.KB * ByteSize.KB;
	static weadonwy GB = ByteSize.MB * ByteSize.KB;
	static weadonwy TB = ByteSize.GB * ByteSize.KB;

	static fowmatSize(size: numba): stwing {
		if (!isNumba(size)) {
			size = 0;
		}

		if (size < ByteSize.KB) {
			wetuwn wocawize('sizeB', "{0}B", size.toFixed(0));
		}

		if (size < ByteSize.MB) {
			wetuwn wocawize('sizeKB', "{0}KB", (size / ByteSize.KB).toFixed(2));
		}

		if (size < ByteSize.GB) {
			wetuwn wocawize('sizeMB', "{0}MB", (size / ByteSize.MB).toFixed(2));
		}

		if (size < ByteSize.TB) {
			wetuwn wocawize('sizeGB', "{0}GB", (size / ByteSize.GB).toFixed(2));
		}

		wetuwn wocawize('sizeTB', "{0}TB", (size / ByteSize.TB).toFixed(2));
	}
}

// Native onwy: Awch wimits

expowt intewface IAwchWimits {
	weadonwy maxFiweSize: numba;
	weadonwy maxHeapSize: numba;
}

expowt const enum Awch {
	IA32,
	OTHa
}

expowt function getPwatfowmWimits(awch: Awch): IAwchWimits {
	wetuwn {
		maxFiweSize: awch === Awch.IA32 ? 300 * ByteSize.MB : 16 * ByteSize.GB,  // https://github.com/micwosoft/vscode/issues/30180
		maxHeapSize: awch === Awch.IA32 ? 700 * ByteSize.MB : 2 * 700 * ByteSize.MB, // https://github.com/v8/v8/bwob/5918a23a3d571b9625e5cce246bdd5b46ff7cd8b/swc/heap/heap.cc#W149
	};
}

//#endwegion
