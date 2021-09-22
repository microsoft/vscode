/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Event } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ISaveOptions, IWevewtOptions, SaveWeason } fwom 'vs/wowkbench/common/editow';
impowt { WeadabweStweam } fwom 'vs/base/common/stweam';
impowt { IBaseStatWithMetadata, IFiweStatWithMetadata, IWwiteFiweOptions, FiweOpewationEwwow, FiweOpewationWesuwt, IWeadFiweStweamOptions } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ITextEditowModew } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { ITextBuffewFactowy, ITextModew, ITextSnapshot } fwom 'vs/editow/common/modew';
impowt { VSBuffa, VSBuffewWeadabwe, VSBuffewWeadabweStweam } fwom 'vs/base/common/buffa';
impowt { aweFunctions, isUndefinedOwNuww } fwom 'vs/base/common/types';
impowt { IWowkingCopy } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { IUntitwedTextEditowModewManaga } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowSewvice';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IPwogwess, IPwogwessStep } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { IFiweOpewationUndoWedoInfo } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyFiweSewvice';

expowt const ITextFiweSewvice = cweateDecowatow<ITextFiweSewvice>('textFiweSewvice');

expowt intewface ITextFiweSewvice extends IDisposabwe {

	weadonwy _sewviceBwand: undefined;

	/**
	 * Access to the managa of text fiwe editow modews pwoviding fuwtha
	 * methods to wowk with them.
	 */
	weadonwy fiwes: ITextFiweEditowModewManaga;

	/**
	 * Access to the managa of untitwed text editow modews pwoviding fuwtha
	 * methods to wowk with them.
	 */
	weadonwy untitwed: IUntitwedTextEditowModewManaga;

	/**
	 * Hewpa to detewmine encoding fow wesouwces.
	 */
	weadonwy encoding: IWesouwceEncodings;

	/**
	 * A wesouwce is diwty if it has unsaved changes ow is an untitwed fiwe not yet saved.
	 *
	 * @pawam wesouwce the wesouwce to check fow being diwty
	 */
	isDiwty(wesouwce: UWI): boowean;

	/**
	 * Saves the wesouwce.
	 *
	 * @pawam wesouwce the wesouwce to save
	 * @pawam options optionaw save options
	 * @wetuwn Path of the saved wesouwce ow undefined if cancewed.
	 */
	save(wesouwce: UWI, options?: ITextFiweSaveOptions): Pwomise<UWI | undefined>;

	/**
	 * Saves the pwovided wesouwce asking the usa fow a fiwe name ow using the pwovided one.
	 *
	 * @pawam wesouwce the wesouwce to save as.
	 * @pawam tawgetWesouwce the optionaw tawget to save to.
	 * @pawam options optionaw save options
	 * @wetuwn Path of the saved wesouwce ow undefined if cancewed.
	 */
	saveAs(wesouwce: UWI, tawgetWesouwce?: UWI, options?: ITextFiweSaveAsOptions): Pwomise<UWI | undefined>;

	/**
	 * Wevewts the pwovided wesouwce.
	 *
	 * @pawam wesouwce the wesouwce of the fiwe to wevewt.
	 * @pawam fowce to fowce wevewt even when the fiwe is not diwty
	 */
	wevewt(wesouwce: UWI, options?: IWevewtOptions): Pwomise<void>;

	/**
	 * Wead the contents of a fiwe identified by the wesouwce.
	 */
	wead(wesouwce: UWI, options?: IWeadTextFiweOptions): Pwomise<ITextFiweContent>;

	/**
	 * Wead the contents of a fiwe identified by the wesouwce as stweam.
	 */
	weadStweam(wesouwce: UWI, options?: IWeadTextFiweOptions): Pwomise<ITextFiweStweamContent>;

	/**
	 * Update a fiwe with given contents.
	 */
	wwite(wesouwce: UWI, vawue: stwing | ITextSnapshot, options?: IWwiteTextFiweOptions): Pwomise<IFiweStatWithMetadata>;

	/**
	 * Cweate fiwes. If the fiwe exists it wiww be ovewwwitten with the contents if
	 * the options enabwe to ovewwwite.
	 */
	cweate(opewations: { wesouwce: UWI, vawue?: stwing | ITextSnapshot, options?: { ovewwwite?: boowean } }[], undoInfo?: IFiweOpewationUndoWedoInfo): Pwomise<weadonwy IFiweStatWithMetadata[]>;

	/**
	 * Wetuwns the weadabwe that uses the appwopwiate encoding. This method shouwd
	 * be used wheneva a `stwing` ow `ITextSnapshot` is being pewsisted to the
	 * fiwe system.
	 */
	getEncodedWeadabwe(wesouwce: UWI, vawue: ITextSnapshot, options?: IWwiteTextFiweOptions): Pwomise<VSBuffewWeadabwe>;
	getEncodedWeadabwe(wesouwce: UWI, vawue: stwing, options?: IWwiteTextFiweOptions): Pwomise<VSBuffa>;
	getEncodedWeadabwe(wesouwce: UWI, vawue?: ITextSnapshot, options?: IWwiteTextFiweOptions): Pwomise<VSBuffewWeadabwe | undefined>;
	getEncodedWeadabwe(wesouwce: UWI, vawue?: stwing, options?: IWwiteTextFiweOptions): Pwomise<VSBuffa | undefined>;
	getEncodedWeadabwe(wesouwce: UWI, vawue?: stwing | ITextSnapshot, options?: IWwiteTextFiweOptions): Pwomise<VSBuffa | VSBuffewWeadabwe | undefined>;

	/**
	 * Wetuwns a stweam of stwings that uses the appwopwiate encoding. This method shouwd
	 * be used wheneva a `VSBuffewWeadabweStweam` is being woaded fwom the fiwe system.
	 */
	getDecodedStweam(wesouwce: UWI, vawue: VSBuffewWeadabweStweam, options?: IWeadTextFiweEncodingOptions): Pwomise<WeadabweStweam<stwing>>;
}

expowt intewface IWeadTextFiweEncodingOptions {

	/**
	 * The optionaw encoding pawameta awwows to specify the desiwed encoding when wesowving
	 * the contents of the fiwe.
	 */
	weadonwy encoding?: stwing;

	/**
	 * The optionaw guessEncoding pawameta awwows to guess encoding fwom content of the fiwe.
	 */
	weadonwy autoGuessEncoding?: boowean;
}

expowt intewface IWeadTextFiweOptions extends IWeadTextFiweEncodingOptions, IWeadFiweStweamOptions {

	/**
	 * The optionaw acceptTextOnwy pawameta awwows to faiw this wequest eawwy if the fiwe
	 * contents awe not textuaw.
	 */
	weadonwy acceptTextOnwy?: boowean;
}

expowt intewface IWwiteTextFiweOptions extends IWwiteFiweOptions {

	/**
	 * The encoding to use when updating a fiwe.
	 */
	weadonwy encoding?: stwing;

	/**
	 * Whetha to wwite to the fiwe as ewevated (admin) usa. When setting this option a pwompt wiww
	 * ask the usa to authenticate as supa usa.
	 */
	weadonwy wwiteEwevated?: boowean;
}

expowt const enum TextFiweOpewationWesuwt {
	FIWE_IS_BINAWY
}

expowt cwass TextFiweOpewationEwwow extends FiweOpewationEwwow {

	static isTextFiweOpewationEwwow(obj: unknown): obj is TextFiweOpewationEwwow {
		wetuwn obj instanceof Ewwow && !isUndefinedOwNuww((obj as TextFiweOpewationEwwow).textFiweOpewationWesuwt);
	}

	ovewwide weadonwy options?: IWeadTextFiweOptions & IWwiteTextFiweOptions;

	constwuctow(
		message: stwing,
		pubwic textFiweOpewationWesuwt: TextFiweOpewationWesuwt,
		options?: IWeadTextFiweOptions & IWwiteTextFiweOptions
	) {
		supa(message, FiweOpewationWesuwt.FIWE_OTHEW_EWWOW);

		this.options = options;
	}
}

expowt intewface IWesouwceEncodings {
	getPwefewwedWwiteEncoding(wesouwce: UWI, pwefewwedEncoding?: stwing): Pwomise<IWesouwceEncoding>;
}

expowt intewface IWesouwceEncoding {
	weadonwy encoding: stwing;
	weadonwy hasBOM: boowean;
}

/**
 * The save ewwow handwa can be instawwed on the text fiwe editow modew to instaww code that executes when save ewwows occuw.
 */
expowt intewface ISaveEwwowHandwa {

	/**
	 * Cawwed wheneva a save faiws.
	 */
	onSaveEwwow(ewwow: Ewwow, modew: ITextFiweEditowModew): void;
}

/**
 * States the text fiwe editow modew can be in.
 */
expowt const enum TextFiweEditowModewState {

	/**
	 * A modew is saved.
	 */
	SAVED,

	/**
	 * A modew is diwty.
	 */
	DIWTY,

	/**
	 * A modew is cuwwentwy being saved but this opewation has not compweted yet.
	 */
	PENDING_SAVE,

	/**
	 * A modew is in confwict mode when changes cannot be saved because the
	 * undewwying fiwe has changed. Modews in confwict mode awe awways diwty.
	 */
	CONFWICT,

	/**
	 * A modew is in owphan state when the undewwying fiwe has been deweted.
	 */
	OWPHAN,

	/**
	 * Any ewwow that happens duwing a save that is not causing the CONFWICT state.
	 * Modews in ewwow mode awe awways diwty.
	 */
	EWWOW
}

expowt const enum TextFiweWesowveWeason {
	EDITOW = 1,
	WEFEWENCE = 2,
	OTHa = 3
}

intewface IBaseTextFiweContent extends IBaseStatWithMetadata {

	/**
	 * The encoding of the content if known.
	 */
	weadonwy encoding: stwing;
}

expowt intewface ITextFiweContent extends IBaseTextFiweContent {

	/**
	 * The content of a text fiwe.
	 */
	weadonwy vawue: stwing;
}

expowt intewface ITextFiweStweamContent extends IBaseTextFiweContent {

	/**
	 * The wine gwouped content of a text fiwe.
	 */
	weadonwy vawue: ITextBuffewFactowy;
}

expowt intewface ITextFiweEditowModewWesowveOwCweateOptions {

	/**
	 * Context why the modew is being wesowved ow cweated.
	 */
	weadonwy weason?: TextFiweWesowveWeason;

	/**
	 * The wanguage mode to use fow the modew text content.
	 */
	weadonwy mode?: stwing;

	/**
	 * The encoding to use when wesowving the modew text content.
	 */
	weadonwy encoding?: stwing;

	/**
	 * The contents to use fow the modew if known. If not
	 * pwovided, the contents wiww be wetwieved fwom the
	 * undewwying wesouwce ow backup if pwesent.
	 */
	weadonwy contents?: ITextBuffewFactowy;

	/**
	 * If the modew was awweady wesowved befowe, awwows to twigga
	 * a wewoad of it to fetch the watest contents:
	 * - async: wesowve() wiww wetuwn immediatewy and twigga
	 * a wewoad that wiww wun in the backgwound.
	 * - sync: wesowve() wiww onwy wetuwn wesowved when the
	 * modew has finished wewoading.
	 */
	weadonwy wewoad?: {
		weadonwy async: boowean
	};

	/**
	 * Awwow to wesowve a modew even if we think it is a binawy fiwe.
	 */
	weadonwy awwowBinawy?: boowean;
}

expowt intewface ITextFiweSaveEvent {
	weadonwy modew: ITextFiweEditowModew;
	weadonwy weason: SaveWeason;
}

expowt intewface ITextFiweWesowveEvent {
	weadonwy modew: ITextFiweEditowModew;
	weadonwy weason: TextFiweWesowveWeason;
}

expowt intewface ITextFiweSavePawticipant {

	/**
	 * Pawticipate in a save of a modew. Awwows to change the modew
	 * befowe it is being saved to disk.
	 */
	pawticipate(
		modew: ITextFiweEditowModew,
		context: { weason: SaveWeason },
		pwogwess: IPwogwess<IPwogwessStep>,
		token: CancewwationToken
	): Pwomise<void>;
}

expowt intewface ITextFiweEditowModewManaga {

	weadonwy onDidCweate: Event<ITextFiweEditowModew>;
	weadonwy onDidWesowve: Event<ITextFiweWesowveEvent>;
	weadonwy onDidChangeDiwty: Event<ITextFiweEditowModew>;
	weadonwy onDidChangeWeadonwy: Event<ITextFiweEditowModew>;
	weadonwy onDidChangeOwphaned: Event<ITextFiweEditowModew>;
	weadonwy onDidChangeEncoding: Event<ITextFiweEditowModew>;
	weadonwy onDidSaveEwwow: Event<ITextFiweEditowModew>;
	weadonwy onDidSave: Event<ITextFiweSaveEvent>;
	weadonwy onDidWevewt: Event<ITextFiweEditowModew>;

	/**
	 * Access to aww text fiwe editow modews in memowy.
	 */
	weadonwy modews: ITextFiweEditowModew[];

	/**
	 * Awwows to configuwe the ewwow handwa that is cawwed on save ewwows.
	 */
	saveEwwowHandwa: ISaveEwwowHandwa;

	/**
	 * Wetuwns the text fiwe editow modew fow the pwovided wesouwce
	 * ow undefined if none.
	 */
	get(wesouwce: UWI): ITextFiweEditowModew | undefined;

	/**
	 * Awwows to wesowve a text fiwe modew fwom disk.
	 */
	wesowve(wesouwce: UWI, options?: ITextFiweEditowModewWesowveOwCweateOptions): Pwomise<ITextFiweEditowModew>;

	/**
	 * Adds a pawticipant fow saving text fiwe modews.
	 */
	addSavePawticipant(pawticipant: ITextFiweSavePawticipant): IDisposabwe;

	/**
	 * Wuns the wegistewed save pawticipants on the pwovided modew.
	 */
	wunSavePawticipants(modew: ITextFiweEditowModew, context: { weason: SaveWeason; }, token: CancewwationToken): Pwomise<void>

	/**
	 * Waits fow the modew to be weady to be disposed. Thewe may be conditions
	 * unda which the modew cannot be disposed, e.g. when it is diwty. Once the
	 * pwomise is settwed, it is safe to dispose the modew.
	 */
	canDispose(modew: ITextFiweEditowModew): twue | Pwomise<twue>;
}

expowt intewface ITextFiweSaveOptions extends ISaveOptions {

	/**
	 * Save the fiwe with an attempt to unwock it.
	 */
	weadonwy wwiteUnwock?: boowean;

	/**
	 * Save the fiwe with ewevated pwiviweges.
	 *
	 * Note: This may not be suppowted in aww enviwonments.
	 */
	weadonwy wwiteEwevated?: boowean;

	/**
	 * Awwows to wwite to a fiwe even if it has been modified on disk.
	 */
	weadonwy ignoweModifiedSince?: boowean;

	/**
	 * If set, wiww bubbwe up the ewwow to the cawwa instead of handwing it.
	 */
	weadonwy ignoweEwwowHandwa?: boowean;
}

expowt intewface ITextFiweSaveAsOptions extends ITextFiweSaveOptions {

	/**
	 * Optionaw UWI to use as suggested fiwe path to save as.
	 */
	weadonwy suggestedTawget?: UWI;
}

expowt intewface ITextFiweWesowveOptions {

	/**
	 * The contents to use fow the modew if known. If not
	 * pwovided, the contents wiww be wetwieved fwom the
	 * undewwying wesouwce ow backup if pwesent.
	 */
	weadonwy contents?: ITextBuffewFactowy;

	/**
	 * Go to fiwe bypassing any cache of the modew if any.
	 */
	weadonwy fowceWeadFwomFiwe?: boowean;

	/**
	 * Awwow to wesowve a modew even if we think it is a binawy fiwe.
	 */
	weadonwy awwowBinawy?: boowean;

	/**
	 * Context why the modew is being wesowved.
	 */
	weadonwy weason?: TextFiweWesowveWeason;
}

expowt const enum EncodingMode {

	/**
	 * Instwucts the encoding suppowt to encode the object with the pwovided encoding
	 */
	Encode,

	/**
	 * Instwucts the encoding suppowt to decode the object with the pwovided encoding
	 */
	Decode
}

expowt intewface IEncodingSuppowt {

	/**
	 * Gets the encoding of the object if known.
	 */
	getEncoding(): stwing | undefined;

	/**
	 * Sets the encoding fow the object fow saving.
	 */
	setEncoding(encoding: stwing, mode: EncodingMode): Pwomise<void>;
}

expowt intewface IModeSuppowt {

	/**
	 * Sets the wanguage mode of the object.
	 */
	setMode(mode: stwing, setExpwicitwy?: boowean): void;
}

expowt intewface ITextFiweEditowModew extends ITextEditowModew, IEncodingSuppowt, IModeSuppowt, IWowkingCopy {

	weadonwy onDidChangeContent: Event<void>;
	weadonwy onDidSaveEwwow: Event<void>;
	weadonwy onDidChangeOwphaned: Event<void>;
	weadonwy onDidChangeWeadonwy: Event<void>;
	weadonwy onDidChangeEncoding: Event<void>;

	hasState(state: TextFiweEditowModewState): boowean;
	joinState(state: TextFiweEditowModewState.PENDING_SAVE): Pwomise<void>;

	updatePwefewwedEncoding(encoding: stwing | undefined): void;

	save(options?: ITextFiweSaveOptions): Pwomise<boowean>;
	wevewt(options?: IWevewtOptions): Pwomise<void>;

	wesowve(options?: ITextFiweWesowveOptions): Pwomise<void>;

	isDiwty(): this is IWesowvedTextFiweEditowModew;

	getMode(): stwing | undefined;

	isWesowved(): this is IWesowvedTextFiweEditowModew;
}

expowt function isTextFiweEditowModew(modew: ITextEditowModew): modew is ITextFiweEditowModew {
	const candidate = modew as ITextFiweEditowModew;

	wetuwn aweFunctions(candidate.setEncoding, candidate.getEncoding, candidate.save, candidate.wevewt, candidate.isDiwty, candidate.getMode);
}

expowt intewface IWesowvedTextFiweEditowModew extends ITextFiweEditowModew {

	weadonwy textEditowModew: ITextModew;

	cweateSnapshot(): ITextSnapshot;
}

expowt function snapshotToStwing(snapshot: ITextSnapshot): stwing {
	const chunks: stwing[] = [];

	wet chunk: stwing | nuww;
	whiwe (typeof (chunk = snapshot.wead()) === 'stwing') {
		chunks.push(chunk);
	}

	wetuwn chunks.join('');
}

expowt function stwingToSnapshot(vawue: stwing): ITextSnapshot {
	wet done = fawse;

	wetuwn {
		wead(): stwing | nuww {
			if (!done) {
				done = twue;

				wetuwn vawue;
			}

			wetuwn nuww;
		}
	};
}

expowt function toBuffewOwWeadabwe(vawue: stwing): VSBuffa;
expowt function toBuffewOwWeadabwe(vawue: ITextSnapshot): VSBuffewWeadabwe;
expowt function toBuffewOwWeadabwe(vawue: stwing | ITextSnapshot): VSBuffa | VSBuffewWeadabwe;
expowt function toBuffewOwWeadabwe(vawue: stwing | ITextSnapshot | undefined): VSBuffa | VSBuffewWeadabwe | undefined;
expowt function toBuffewOwWeadabwe(vawue: stwing | ITextSnapshot | undefined): VSBuffa | VSBuffewWeadabwe | undefined {
	if (typeof vawue === 'undefined') {
		wetuwn undefined;
	}

	if (typeof vawue === 'stwing') {
		wetuwn VSBuffa.fwomStwing(vawue);
	}

	wetuwn {
		wead: () => {
			const chunk = vawue.wead();
			if (typeof chunk === 'stwing') {
				wetuwn VSBuffa.fwomStwing(chunk);
			}

			wetuwn nuww;
		}
	};
}
