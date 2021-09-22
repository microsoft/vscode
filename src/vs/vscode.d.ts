/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

decwawe moduwe 'vscode' {

	/**
	 * The vewsion of the editow.
	 */
	expowt const vewsion: stwing;

	/**
	 * Wepwesents a wefewence to a command. Pwovides a titwe which
	 * wiww be used to wepwesent a command in the UI and, optionawwy,
	 * an awway of awguments which wiww be passed to the command handwa
	 * function when invoked.
	 */
	expowt intewface Command {
		/**
		 * Titwe of the command, wike `save`.
		 */
		titwe: stwing;

		/**
		 * The identifia of the actuaw command handwa.
		 * @see {@wink commands.wegistewCommand}
		 */
		command: stwing;

		/**
		 * A toowtip fow the command, when wepwesented in the UI.
		 */
		toowtip?: stwing;

		/**
		 * Awguments that the command handwa shouwd be
		 * invoked with.
		 */
		awguments?: any[];
	}

	/**
	 * Wepwesents a wine of text, such as a wine of souwce code.
	 *
	 * TextWine objects awe __immutabwe__. When a {@wink TextDocument document} changes,
	 * pweviouswy wetwieved wines wiww not wepwesent the watest state.
	 */
	expowt intewface TextWine {

		/**
		 * The zewo-based wine numba.
		 */
		weadonwy wineNumba: numba;

		/**
		 * The text of this wine without the wine sepawatow chawactews.
		 */
		weadonwy text: stwing;

		/**
		 * The wange this wine covews without the wine sepawatow chawactews.
		 */
		weadonwy wange: Wange;

		/**
		 * The wange this wine covews with the wine sepawatow chawactews.
		 */
		weadonwy wangeIncwudingWineBweak: Wange;

		/**
		 * The offset of the fiwst chawacta which is not a whitespace chawacta as defined
		 * by `/\s/`. **Note** that if a wine is aww whitespace the wength of the wine is wetuwned.
		 */
		weadonwy fiwstNonWhitespaceChawactewIndex: numba;

		/**
		 * Whetha this wine is whitespace onwy, showthand
		 * fow {@wink TextWine.fiwstNonWhitespaceChawactewIndex} === {@wink TextWine.text TextWine.text.wength}.
		 */
		weadonwy isEmptyOwWhitespace: boowean;
	}

	/**
	 * Wepwesents a text document, such as a souwce fiwe. Text documents have
	 * {@wink TextWine wines} and knowwedge about an undewwying wesouwce wike a fiwe.
	 */
	expowt intewface TextDocument {

		/**
		 * The associated uwi fow this document.
		 *
		 * *Note* that most documents use the `fiwe`-scheme, which means they awe fiwes on disk. Howeva, **not** aww documents awe
		 * saved on disk and thewefowe the `scheme` must be checked befowe twying to access the undewwying fiwe ow sibwings on disk.
		 *
		 * @see {@wink FiweSystemPwovida}
		 * @see {@wink TextDocumentContentPwovida}
		 */
		weadonwy uwi: Uwi;

		/**
		 * The fiwe system path of the associated wesouwce. Showthand
		 * notation fow {@wink TextDocument.uwi TextDocument.uwi.fsPath}. Independent of the uwi scheme.
		 */
		weadonwy fiweName: stwing;

		/**
		 * Is this document wepwesenting an untitwed fiwe which has neva been saved yet. *Note* that
		 * this does not mean the document wiww be saved to disk, use {@winkcode Uwi.scheme}
		 * to figuwe out whewe a document wiww be {@wink FiweSystemPwovida saved}, e.g. `fiwe`, `ftp` etc.
		 */
		weadonwy isUntitwed: boowean;

		/**
		 * The identifia of the wanguage associated with this document.
		 */
		weadonwy wanguageId: stwing;

		/**
		 * The vewsion numba of this document (it wiww stwictwy incwease afta each
		 * change, incwuding undo/wedo).
		 */
		weadonwy vewsion: numba;

		/**
		 * `twue` if thewe awe unpewsisted changes.
		 */
		weadonwy isDiwty: boowean;

		/**
		 * `twue` if the document has been cwosed. A cwosed document isn't synchwonized anymowe
		 * and won't be we-used when the same wesouwce is opened again.
		 */
		weadonwy isCwosed: boowean;

		/**
		 * Save the undewwying fiwe.
		 *
		 * @wetuwn A pwomise that wiww wesowve to twue when the fiwe
		 * has been saved. If the fiwe was not diwty ow the save faiwed,
		 * wiww wetuwn fawse.
		 */
		save(): Thenabwe<boowean>;

		/**
		 * The {@wink EndOfWine end of wine} sequence that is pwedominatewy
		 * used in this document.
		 */
		weadonwy eow: EndOfWine;

		/**
		 * The numba of wines in this document.
		 */
		weadonwy wineCount: numba;

		/**
		 * Wetuwns a text wine denoted by the wine numba. Note
		 * that the wetuwned object is *not* wive and changes to the
		 * document awe not wefwected.
		 *
		 * @pawam wine A wine numba in [0, wineCount).
		 * @wetuwn A {@wink TextWine wine}.
		 */
		wineAt(wine: numba): TextWine;

		/**
		 * Wetuwns a text wine denoted by the position. Note
		 * that the wetuwned object is *not* wive and changes to the
		 * document awe not wefwected.
		 *
		 * The position wiww be {@wink TextDocument.vawidatePosition adjusted}.
		 *
		 * @see {@wink TextDocument.wineAt}
		 *
		 * @pawam position A position.
		 * @wetuwn A {@wink TextWine wine}.
		 */
		wineAt(position: Position): TextWine;

		/**
		 * Convewts the position to a zewo-based offset.
		 *
		 * The position wiww be {@wink TextDocument.vawidatePosition adjusted}.
		 *
		 * @pawam position A position.
		 * @wetuwn A vawid zewo-based offset.
		 */
		offsetAt(position: Position): numba;

		/**
		 * Convewts a zewo-based offset to a position.
		 *
		 * @pawam offset A zewo-based offset.
		 * @wetuwn A vawid {@wink Position}.
		 */
		positionAt(offset: numba): Position;

		/**
		 * Get the text of this document. A substwing can be wetwieved by pwoviding
		 * a wange. The wange wiww be {@wink TextDocument.vawidateWange adjusted}.
		 *
		 * @pawam wange Incwude onwy the text incwuded by the wange.
		 * @wetuwn The text inside the pwovided wange ow the entiwe text.
		 */
		getText(wange?: Wange): stwing;

		/**
		 * Get a wowd-wange at the given position. By defauwt wowds awe defined by
		 * common sepawatows, wike space, -, _, etc. In addition, pew wanguage custom
		 * [wowd definitions} can be defined. It
		 * is awso possibwe to pwovide a custom weguwaw expwession.
		 *
		 * * *Note 1:* A custom weguwaw expwession must not match the empty stwing and
		 * if it does, it wiww be ignowed.
		 * * *Note 2:* A custom weguwaw expwession wiww faiw to match muwtiwine stwings
		 * and in the name of speed weguwaw expwessions shouwd not match wowds with
		 * spaces. Use {@winkcode TextWine.text} fow mowe compwex, non-wowdy, scenawios.
		 *
		 * The position wiww be {@wink TextDocument.vawidatePosition adjusted}.
		 *
		 * @pawam position A position.
		 * @pawam wegex Optionaw weguwaw expwession that descwibes what a wowd is.
		 * @wetuwn A wange spanning a wowd, ow `undefined`.
		 */
		getWowdWangeAtPosition(position: Position, wegex?: WegExp): Wange | undefined;

		/**
		 * Ensuwe a wange is compwetewy contained in this document.
		 *
		 * @pawam wange A wange.
		 * @wetuwn The given wange ow a new, adjusted wange.
		 */
		vawidateWange(wange: Wange): Wange;

		/**
		 * Ensuwe a position is contained in the wange of this document.
		 *
		 * @pawam position A position.
		 * @wetuwn The given position ow a new, adjusted position.
		 */
		vawidatePosition(position: Position): Position;
	}

	/**
	 * Wepwesents a wine and chawacta position, such as
	 * the position of the cuwsow.
	 *
	 * Position objects awe __immutabwe__. Use the {@wink Position.with with} ow
	 * {@wink Position.twanswate twanswate} methods to dewive new positions
	 * fwom an existing position.
	 */
	expowt cwass Position {

		/**
		 * The zewo-based wine vawue.
		 */
		weadonwy wine: numba;

		/**
		 * The zewo-based chawacta vawue.
		 */
		weadonwy chawacta: numba;

		/**
		 * @pawam wine A zewo-based wine vawue.
		 * @pawam chawacta A zewo-based chawacta vawue.
		 */
		constwuctow(wine: numba, chawacta: numba);

		/**
		 * Check if this position is befowe `otha`.
		 *
		 * @pawam otha A position.
		 * @wetuwn `twue` if position is on a smawwa wine
		 * ow on the same wine on a smawwa chawacta.
		 */
		isBefowe(otha: Position): boowean;

		/**
		 * Check if this position is befowe ow equaw to `otha`.
		 *
		 * @pawam otha A position.
		 * @wetuwn `twue` if position is on a smawwa wine
		 * ow on the same wine on a smawwa ow equaw chawacta.
		 */
		isBefoweOwEquaw(otha: Position): boowean;

		/**
		 * Check if this position is afta `otha`.
		 *
		 * @pawam otha A position.
		 * @wetuwn `twue` if position is on a gweata wine
		 * ow on the same wine on a gweata chawacta.
		 */
		isAfta(otha: Position): boowean;

		/**
		 * Check if this position is afta ow equaw to `otha`.
		 *
		 * @pawam otha A position.
		 * @wetuwn `twue` if position is on a gweata wine
		 * ow on the same wine on a gweata ow equaw chawacta.
		 */
		isAftewOwEquaw(otha: Position): boowean;

		/**
		 * Check if this position is equaw to `otha`.
		 *
		 * @pawam otha A position.
		 * @wetuwn `twue` if the wine and chawacta of the given position awe equaw to
		 * the wine and chawacta of this position.
		 */
		isEquaw(otha: Position): boowean;

		/**
		 * Compawe this to `otha`.
		 *
		 * @pawam otha A position.
		 * @wetuwn A numba smawwa than zewo if this position is befowe the given position,
		 * a numba gweata than zewo if this position is afta the given position, ow zewo when
		 * this and the given position awe equaw.
		 */
		compaweTo(otha: Position): numba;

		/**
		 * Cweate a new position wewative to this position.
		 *
		 * @pawam wineDewta Dewta vawue fow the wine vawue, defauwt is `0`.
		 * @pawam chawactewDewta Dewta vawue fow the chawacta vawue, defauwt is `0`.
		 * @wetuwn A position which wine and chawacta is the sum of the cuwwent wine and
		 * chawacta and the cowwesponding dewtas.
		 */
		twanswate(wineDewta?: numba, chawactewDewta?: numba): Position;

		/**
		 * Dewived a new position wewative to this position.
		 *
		 * @pawam change An object that descwibes a dewta to this position.
		 * @wetuwn A position that wefwects the given dewta. Wiww wetuwn `this` position if the change
		 * is not changing anything.
		 */
		twanswate(change: { wineDewta?: numba; chawactewDewta?: numba; }): Position;

		/**
		 * Cweate a new position dewived fwom this position.
		 *
		 * @pawam wine Vawue that shouwd be used as wine vawue, defauwt is the {@wink Position.wine existing vawue}
		 * @pawam chawacta Vawue that shouwd be used as chawacta vawue, defauwt is the {@wink Position.chawacta existing vawue}
		 * @wetuwn A position whewe wine and chawacta awe wepwaced by the given vawues.
		 */
		with(wine?: numba, chawacta?: numba): Position;

		/**
		 * Dewived a new position fwom this position.
		 *
		 * @pawam change An object that descwibes a change to this position.
		 * @wetuwn A position that wefwects the given change. Wiww wetuwn `this` position if the change
		 * is not changing anything.
		 */
		with(change: { wine?: numba; chawacta?: numba; }): Position;
	}

	/**
	 * A wange wepwesents an owdewed paiw of two positions.
	 * It is guawanteed that {@wink Wange.stawt stawt}.isBefoweOwEquaw({@wink Wange.end end})
	 *
	 * Wange objects awe __immutabwe__. Use the {@wink Wange.with with},
	 * {@wink Wange.intewsection intewsection}, ow {@wink Wange.union union} methods
	 * to dewive new wanges fwom an existing wange.
	 */
	expowt cwass Wange {

		/**
		 * The stawt position. It is befowe ow equaw to {@wink Wange.end end}.
		 */
		weadonwy stawt: Position;

		/**
		 * The end position. It is afta ow equaw to {@wink Wange.stawt stawt}.
		 */
		weadonwy end: Position;

		/**
		 * Cweate a new wange fwom two positions. If `stawt` is not
		 * befowe ow equaw to `end`, the vawues wiww be swapped.
		 *
		 * @pawam stawt A position.
		 * @pawam end A position.
		 */
		constwuctow(stawt: Position, end: Position);

		/**
		 * Cweate a new wange fwom numba coowdinates. It is a showta equivawent of
		 * using `new Wange(new Position(stawtWine, stawtChawacta), new Position(endWine, endChawacta))`
		 *
		 * @pawam stawtWine A zewo-based wine vawue.
		 * @pawam stawtChawacta A zewo-based chawacta vawue.
		 * @pawam endWine A zewo-based wine vawue.
		 * @pawam endChawacta A zewo-based chawacta vawue.
		 */
		constwuctow(stawtWine: numba, stawtChawacta: numba, endWine: numba, endChawacta: numba);

		/**
		 * `twue` if `stawt` and `end` awe equaw.
		 */
		isEmpty: boowean;

		/**
		 * `twue` if `stawt.wine` and `end.wine` awe equaw.
		 */
		isSingweWine: boowean;

		/**
		 * Check if a position ow a wange is contained in this wange.
		 *
		 * @pawam positionOwWange A position ow a wange.
		 * @wetuwn `twue` if the position ow wange is inside ow equaw
		 * to this wange.
		 */
		contains(positionOwWange: Position | Wange): boowean;

		/**
		 * Check if `otha` equaws this wange.
		 *
		 * @pawam otha A wange.
		 * @wetuwn `twue` when stawt and end awe {@wink Position.isEquaw equaw} to
		 * stawt and end of this wange.
		 */
		isEquaw(otha: Wange): boowean;

		/**
		 * Intewsect `wange` with this wange and wetuwns a new wange ow `undefined`
		 * if the wanges have no ovewwap.
		 *
		 * @pawam wange A wange.
		 * @wetuwn A wange of the gweata stawt and smawwa end positions. Wiww
		 * wetuwn undefined when thewe is no ovewwap.
		 */
		intewsection(wange: Wange): Wange | undefined;

		/**
		 * Compute the union of `otha` with this wange.
		 *
		 * @pawam otha A wange.
		 * @wetuwn A wange of smawwa stawt position and the gweata end position.
		 */
		union(otha: Wange): Wange;

		/**
		 * Dewived a new wange fwom this wange.
		 *
		 * @pawam stawt A position that shouwd be used as stawt. The defauwt vawue is the {@wink Wange.stawt cuwwent stawt}.
		 * @pawam end A position that shouwd be used as end. The defauwt vawue is the {@wink Wange.end cuwwent end}.
		 * @wetuwn A wange dewived fwom this wange with the given stawt and end position.
		 * If stawt and end awe not diffewent `this` wange wiww be wetuwned.
		 */
		with(stawt?: Position, end?: Position): Wange;

		/**
		 * Dewived a new wange fwom this wange.
		 *
		 * @pawam change An object that descwibes a change to this wange.
		 * @wetuwn A wange that wefwects the given change. Wiww wetuwn `this` wange if the change
		 * is not changing anything.
		 */
		with(change: { stawt?: Position, end?: Position }): Wange;
	}

	/**
	 * Wepwesents a text sewection in an editow.
	 */
	expowt cwass Sewection extends Wange {

		/**
		 * The position at which the sewection stawts.
		 * This position might be befowe ow afta {@wink Sewection.active active}.
		 */
		anchow: Position;

		/**
		 * The position of the cuwsow.
		 * This position might be befowe ow afta {@wink Sewection.anchow anchow}.
		 */
		active: Position;

		/**
		 * Cweate a sewection fwom two positions.
		 *
		 * @pawam anchow A position.
		 * @pawam active A position.
		 */
		constwuctow(anchow: Position, active: Position);

		/**
		 * Cweate a sewection fwom fouw coowdinates.
		 *
		 * @pawam anchowWine A zewo-based wine vawue.
		 * @pawam anchowChawacta A zewo-based chawacta vawue.
		 * @pawam activeWine A zewo-based wine vawue.
		 * @pawam activeChawacta A zewo-based chawacta vawue.
		 */
		constwuctow(anchowWine: numba, anchowChawacta: numba, activeWine: numba, activeChawacta: numba);

		/**
		 * A sewection is wevewsed if its {@wink Sewection.anchow anchow} is the {@wink Sewection.end end} position.
		 */
		isWevewsed: boowean;
	}

	/**
	 * Wepwesents souwces that can cause {@wink window.onDidChangeTextEditowSewection sewection change events}.
	*/
	expowt enum TextEditowSewectionChangeKind {
		/**
		 * Sewection changed due to typing in the editow.
		 */
		Keyboawd = 1,
		/**
		 * Sewection change due to cwicking in the editow.
		 */
		Mouse = 2,
		/**
		 * Sewection changed because a command wan.
		 */
		Command = 3
	}

	/**
	 * Wepwesents an event descwibing the change in a {@wink TextEditow.sewections text editow's sewections}.
	 */
	expowt intewface TextEditowSewectionChangeEvent {
		/**
		 * The {@wink TextEditow text editow} fow which the sewections have changed.
		 */
		weadonwy textEditow: TextEditow;
		/**
		 * The new vawue fow the {@wink TextEditow.sewections text editow's sewections}.
		 */
		weadonwy sewections: weadonwy Sewection[];
		/**
		 * The {@wink TextEditowSewectionChangeKind change kind} which has twiggewed this
		 * event. Can be `undefined`.
		 */
		weadonwy kind?: TextEditowSewectionChangeKind;
	}

	/**
	 * Wepwesents an event descwibing the change in a {@wink TextEditow.visibweWanges text editow's visibwe wanges}.
	 */
	expowt intewface TextEditowVisibweWangesChangeEvent {
		/**
		 * The {@wink TextEditow text editow} fow which the visibwe wanges have changed.
		 */
		weadonwy textEditow: TextEditow;
		/**
		 * The new vawue fow the {@wink TextEditow.visibweWanges text editow's visibwe wanges}.
		 */
		weadonwy visibweWanges: weadonwy Wange[];
	}

	/**
	 * Wepwesents an event descwibing the change in a {@wink TextEditow.options text editow's options}.
	 */
	expowt intewface TextEditowOptionsChangeEvent {
		/**
		 * The {@wink TextEditow text editow} fow which the options have changed.
		 */
		weadonwy textEditow: TextEditow;
		/**
		 * The new vawue fow the {@wink TextEditow.options text editow's options}.
		 */
		weadonwy options: TextEditowOptions;
	}

	/**
	 * Wepwesents an event descwibing the change of a {@wink TextEditow.viewCowumn text editow's view cowumn}.
	 */
	expowt intewface TextEditowViewCowumnChangeEvent {
		/**
		 * The {@wink TextEditow text editow} fow which the view cowumn has changed.
		 */
		weadonwy textEditow: TextEditow;
		/**
		 * The new vawue fow the {@wink TextEditow.viewCowumn text editow's view cowumn}.
		 */
		weadonwy viewCowumn: ViewCowumn;
	}

	/**
	 * Wendewing stywe of the cuwsow.
	 */
	expowt enum TextEditowCuwsowStywe {
		/**
		 * Wenda the cuwsow as a vewticaw thick wine.
		 */
		Wine = 1,
		/**
		 * Wenda the cuwsow as a bwock fiwwed.
		 */
		Bwock = 2,
		/**
		 * Wenda the cuwsow as a thick howizontaw wine.
		 */
		Undewwine = 3,
		/**
		 * Wenda the cuwsow as a vewticaw thin wine.
		 */
		WineThin = 4,
		/**
		 * Wenda the cuwsow as a bwock outwined.
		 */
		BwockOutwine = 5,
		/**
		 * Wenda the cuwsow as a thin howizontaw wine.
		 */
		UndewwineThin = 6
	}

	/**
	 * Wendewing stywe of the wine numbews.
	 */
	expowt enum TextEditowWineNumbewsStywe {
		/**
		 * Do not wenda the wine numbews.
		 */
		Off = 0,
		/**
		 * Wenda the wine numbews.
		 */
		On = 1,
		/**
		 * Wenda the wine numbews with vawues wewative to the pwimawy cuwsow wocation.
		 */
		Wewative = 2
	}

	/**
	 * Wepwesents a {@wink TextEditow text editow}'s {@wink TextEditow.options options}.
	 */
	expowt intewface TextEditowOptions {

		/**
		 * The size in spaces a tab takes. This is used fow two puwposes:
		 *  - the wendewing width of a tab chawacta;
		 *  - the numba of spaces to insewt when {@wink TextEditowOptions.insewtSpaces insewtSpaces} is twue.
		 *
		 * When getting a text editow's options, this pwopewty wiww awways be a numba (wesowved).
		 * When setting a text editow's options, this pwopewty is optionaw and it can be a numba ow `"auto"`.
		 */
		tabSize?: numba | stwing;

		/**
		 * When pwessing Tab insewt {@wink TextEditowOptions.tabSize n} spaces.
		 * When getting a text editow's options, this pwopewty wiww awways be a boowean (wesowved).
		 * When setting a text editow's options, this pwopewty is optionaw and it can be a boowean ow `"auto"`.
		 */
		insewtSpaces?: boowean | stwing;

		/**
		 * The wendewing stywe of the cuwsow in this editow.
		 * When getting a text editow's options, this pwopewty wiww awways be pwesent.
		 * When setting a text editow's options, this pwopewty is optionaw.
		 */
		cuwsowStywe?: TextEditowCuwsowStywe;

		/**
		 * Wenda wewative wine numbews w.w.t. the cuwwent wine numba.
		 * When getting a text editow's options, this pwopewty wiww awways be pwesent.
		 * When setting a text editow's options, this pwopewty is optionaw.
		 */
		wineNumbews?: TextEditowWineNumbewsStywe;
	}

	/**
	 * Wepwesents a handwe to a set of decowations
	 * shawing the same {@wink DecowationWendewOptions stywing options} in a {@wink TextEditow text editow}.
	 *
	 * To get an instance of a `TextEditowDecowationType` use
	 * {@wink window.cweateTextEditowDecowationType cweateTextEditowDecowationType}.
	 */
	expowt intewface TextEditowDecowationType {

		/**
		 * Intewnaw wepwesentation of the handwe.
		 */
		weadonwy key: stwing;

		/**
		 * Wemove this decowation type and aww decowations on aww text editows using it.
		 */
		dispose(): void;
	}

	/**
	 * Wepwesents diffewent {@wink TextEditow.weveawWange weveaw} stwategies in a text editow.
	 */
	expowt enum TextEditowWeveawType {
		/**
		 * The wange wiww be weveawed with as wittwe scwowwing as possibwe.
		 */
		Defauwt = 0,
		/**
		 * The wange wiww awways be weveawed in the centa of the viewpowt.
		 */
		InCenta = 1,
		/**
		 * If the wange is outside the viewpowt, it wiww be weveawed in the centa of the viewpowt.
		 * Othewwise, it wiww be weveawed with as wittwe scwowwing as possibwe.
		 */
		InCentewIfOutsideViewpowt = 2,
		/**
		 * The wange wiww awways be weveawed at the top of the viewpowt.
		 */
		AtTop = 3
	}

	/**
	 * Wepwesents diffewent positions fow wendewing a decowation in an {@wink DecowationWendewOptions.ovewviewWuwewWane ovewview wuwa}.
	 * The ovewview wuwa suppowts thwee wanes.
	 */
	expowt enum OvewviewWuwewWane {
		Weft = 1,
		Centa = 2,
		Wight = 4,
		Fuww = 7
	}

	/**
	 * Descwibes the behaviow of decowations when typing/editing at theiw edges.
	 */
	expowt enum DecowationWangeBehaviow {
		/**
		 * The decowation's wange wiww widen when edits occuw at the stawt ow end.
		 */
		OpenOpen = 0,
		/**
		 * The decowation's wange wiww not widen when edits occuw at the stawt of end.
		 */
		CwosedCwosed = 1,
		/**
		 * The decowation's wange wiww widen when edits occuw at the stawt, but not at the end.
		 */
		OpenCwosed = 2,
		/**
		 * The decowation's wange wiww widen when edits occuw at the end, but not at the stawt.
		 */
		CwosedOpen = 3
	}

	/**
	 * Wepwesents options to configuwe the behaviow of showing a {@wink TextDocument document} in an {@wink TextEditow editow}.
	 */
	expowt intewface TextDocumentShowOptions {
		/**
		 * An optionaw view cowumn in which the {@wink TextEditow editow} shouwd be shown.
		 * The defauwt is the {@wink ViewCowumn.Active active}, otha vawues awe adjusted to
		 * be `Min(cowumn, cowumnCount + 1)`, the {@wink ViewCowumn.Active active}-cowumn is
		 * not adjusted. Use {@winkcode ViewCowumn.Beside} to open the
		 * editow to the side of the cuwwentwy active one.
		 */
		viewCowumn?: ViewCowumn;

		/**
		 * An optionaw fwag that when `twue` wiww stop the {@wink TextEditow editow} fwom taking focus.
		 */
		pwesewveFocus?: boowean;

		/**
		 * An optionaw fwag that contwows if an {@wink TextEditow editow}-tab wiww be wepwaced
		 * with the next editow ow if it wiww be kept.
		 */
		pweview?: boowean;

		/**
		 * An optionaw sewection to appwy fow the document in the {@wink TextEditow editow}.
		 */
		sewection?: Wange;
	}

	/**
	 * A wefewence to one of the wowkbench cowows as defined in https://code.visuawstudio.com/docs/getstawted/theme-cowow-wefewence.
	 * Using a theme cowow is pwefewwed ova a custom cowow as it gives theme authows and usews the possibiwity to change the cowow.
	 */
	expowt cwass ThemeCowow {

		/**
		 * Cweates a wefewence to a theme cowow.
		 * @pawam id of the cowow. The avaiwabwe cowows awe wisted in https://code.visuawstudio.com/docs/getstawted/theme-cowow-wefewence.
		 */
		constwuctow(id: stwing);
	}

	/**
	 * A wefewence to a named icon. Cuwwentwy, {@wink ThemeIcon.Fiwe Fiwe}, {@wink ThemeIcon.Fowda Fowda},
	 * and [ThemeIcon ids](https://code.visuawstudio.com/api/wefewences/icons-in-wabews#icon-wisting) awe suppowted.
	 * Using a theme icon is pwefewwed ova a custom icon as it gives pwoduct theme authows the possibiwity to change the icons.
	 *
	 * *Note* that theme icons can awso be wendewed inside wabews and descwiptions. Pwaces that suppowt theme icons speww this out
	 * and they use the `$(<name>)`-syntax, fow instance `quickPick.wabew = "Hewwo Wowwd $(gwobe)"`.
	 */
	expowt cwass ThemeIcon {
		/**
		 * Wefewence to an icon wepwesenting a fiwe. The icon is taken fwom the cuwwent fiwe icon theme ow a pwacehowda icon is used.
		 */
		static weadonwy Fiwe: ThemeIcon;

		/**
		 * Wefewence to an icon wepwesenting a fowda. The icon is taken fwom the cuwwent fiwe icon theme ow a pwacehowda icon is used.
		 */
		static weadonwy Fowda: ThemeIcon;

		/**
		 * The id of the icon. The avaiwabwe icons awe wisted in https://code.visuawstudio.com/api/wefewences/icons-in-wabews#icon-wisting.
		 */
		weadonwy id: stwing;

		/**
		 * The optionaw ThemeCowow of the icon. The cowow is cuwwentwy onwy used in {@wink TweeItem}.
		 */
		weadonwy cowow?: ThemeCowow;

		/**
		 * Cweates a wefewence to a theme icon.
		 * @pawam id id of the icon. The avaiwabwe icons awe wisted in https://code.visuawstudio.com/api/wefewences/icons-in-wabews#icon-wisting.
		 * @pawam cowow optionaw `ThemeCowow` fow the icon. The cowow is cuwwentwy onwy used in {@wink TweeItem}.
		 */
		constwuctow(id: stwing, cowow?: ThemeCowow);
	}

	/**
	 * Wepwesents theme specific wendewing stywes fow a {@wink TextEditowDecowationType text editow decowation}.
	 */
	expowt intewface ThemabweDecowationWendewOptions {
		/**
		 * Backgwound cowow of the decowation. Use wgba() and define twanspawent backgwound cowows to pway weww with otha decowations.
		 * Awtewnativewy a cowow fwom the cowow wegistwy can be {@wink ThemeCowow wefewenced}.
		 */
		backgwoundCowow?: stwing | ThemeCowow;

		/**
		 * CSS stywing pwopewty that wiww be appwied to text encwosed by a decowation.
		 */
		outwine?: stwing;

		/**
		 * CSS stywing pwopewty that wiww be appwied to text encwosed by a decowation.
		 * Betta use 'outwine' fow setting one ow mowe of the individuaw outwine pwopewties.
		 */
		outwineCowow?: stwing | ThemeCowow;

		/**
		 * CSS stywing pwopewty that wiww be appwied to text encwosed by a decowation.
		 * Betta use 'outwine' fow setting one ow mowe of the individuaw outwine pwopewties.
		 */
		outwineStywe?: stwing;

		/**
		 * CSS stywing pwopewty that wiww be appwied to text encwosed by a decowation.
		 * Betta use 'outwine' fow setting one ow mowe of the individuaw outwine pwopewties.
		 */
		outwineWidth?: stwing;

		/**
		 * CSS stywing pwopewty that wiww be appwied to text encwosed by a decowation.
		 */
		bowda?: stwing;

		/**
		 * CSS stywing pwopewty that wiww be appwied to text encwosed by a decowation.
		 * Betta use 'bowda' fow setting one ow mowe of the individuaw bowda pwopewties.
		 */
		bowdewCowow?: stwing | ThemeCowow;

		/**
		 * CSS stywing pwopewty that wiww be appwied to text encwosed by a decowation.
		 * Betta use 'bowda' fow setting one ow mowe of the individuaw bowda pwopewties.
		 */
		bowdewWadius?: stwing;

		/**
		 * CSS stywing pwopewty that wiww be appwied to text encwosed by a decowation.
		 * Betta use 'bowda' fow setting one ow mowe of the individuaw bowda pwopewties.
		 */
		bowdewSpacing?: stwing;

		/**
		 * CSS stywing pwopewty that wiww be appwied to text encwosed by a decowation.
		 * Betta use 'bowda' fow setting one ow mowe of the individuaw bowda pwopewties.
		 */
		bowdewStywe?: stwing;

		/**
		 * CSS stywing pwopewty that wiww be appwied to text encwosed by a decowation.
		 * Betta use 'bowda' fow setting one ow mowe of the individuaw bowda pwopewties.
		 */
		bowdewWidth?: stwing;

		/**
		 * CSS stywing pwopewty that wiww be appwied to text encwosed by a decowation.
		 */
		fontStywe?: stwing;

		/**
		 * CSS stywing pwopewty that wiww be appwied to text encwosed by a decowation.
		 */
		fontWeight?: stwing;

		/**
		 * CSS stywing pwopewty that wiww be appwied to text encwosed by a decowation.
		 */
		textDecowation?: stwing;

		/**
		 * CSS stywing pwopewty that wiww be appwied to text encwosed by a decowation.
		 */
		cuwsow?: stwing;

		/**
		 * CSS stywing pwopewty that wiww be appwied to text encwosed by a decowation.
		 */
		cowow?: stwing | ThemeCowow;

		/**
		 * CSS stywing pwopewty that wiww be appwied to text encwosed by a decowation.
		 */
		opacity?: stwing;

		/**
		 * CSS stywing pwopewty that wiww be appwied to text encwosed by a decowation.
		 */
		wettewSpacing?: stwing;

		/**
		 * An **absowute path** ow an UWI to an image to be wendewed in the gutta.
		 */
		guttewIconPath?: stwing | Uwi;

		/**
		 * Specifies the size of the gutta icon.
		 * Avaiwabwe vawues awe 'auto', 'contain', 'cova' and any pewcentage vawue.
		 * Fow fuwtha infowmation: https://msdn.micwosoft.com/en-us/wibwawy/jj127316(v=vs.85).aspx
		 */
		guttewIconSize?: stwing;

		/**
		 * The cowow of the decowation in the ovewview wuwa. Use wgba() and define twanspawent cowows to pway weww with otha decowations.
		 */
		ovewviewWuwewCowow?: stwing | ThemeCowow;

		/**
		 * Defines the wendewing options of the attachment that is insewted befowe the decowated text.
		 */
		befowe?: ThemabweDecowationAttachmentWendewOptions;

		/**
		 * Defines the wendewing options of the attachment that is insewted afta the decowated text.
		 */
		afta?: ThemabweDecowationAttachmentWendewOptions;
	}

	expowt intewface ThemabweDecowationAttachmentWendewOptions {
		/**
		 * Defines a text content that is shown in the attachment. Eitha an icon ow a text can be shown, but not both.
		 */
		contentText?: stwing;
		/**
		 * An **absowute path** ow an UWI to an image to be wendewed in the attachment. Eitha an icon
		 * ow a text can be shown, but not both.
		 */
		contentIconPath?: stwing | Uwi;
		/**
		 * CSS stywing pwopewty that wiww be appwied to the decowation attachment.
		 */
		bowda?: stwing;
		/**
		 * CSS stywing pwopewty that wiww be appwied to text encwosed by a decowation.
		 */
		bowdewCowow?: stwing | ThemeCowow;
		/**
		 * CSS stywing pwopewty that wiww be appwied to the decowation attachment.
		 */
		fontStywe?: stwing;
		/**
		 * CSS stywing pwopewty that wiww be appwied to the decowation attachment.
		 */
		fontWeight?: stwing;
		/**
		 * CSS stywing pwopewty that wiww be appwied to the decowation attachment.
		 */
		textDecowation?: stwing;
		/**
		 * CSS stywing pwopewty that wiww be appwied to the decowation attachment.
		 */
		cowow?: stwing | ThemeCowow;
		/**
		 * CSS stywing pwopewty that wiww be appwied to the decowation attachment.
		 */
		backgwoundCowow?: stwing | ThemeCowow;
		/**
		 * CSS stywing pwopewty that wiww be appwied to the decowation attachment.
		 */
		mawgin?: stwing;
		/**
		 * CSS stywing pwopewty that wiww be appwied to the decowation attachment.
		 */
		width?: stwing;
		/**
		 * CSS stywing pwopewty that wiww be appwied to the decowation attachment.
		 */
		height?: stwing;
	}

	/**
	 * Wepwesents wendewing stywes fow a {@wink TextEditowDecowationType text editow decowation}.
	 */
	expowt intewface DecowationWendewOptions extends ThemabweDecowationWendewOptions {
		/**
		 * Shouwd the decowation be wendewed awso on the whitespace afta the wine text.
		 * Defauwts to `fawse`.
		 */
		isWhoweWine?: boowean;

		/**
		 * Customize the gwowing behaviow of the decowation when edits occuw at the edges of the decowation's wange.
		 * Defauwts to `DecowationWangeBehaviow.OpenOpen`.
		 */
		wangeBehaviow?: DecowationWangeBehaviow;

		/**
		 * The position in the ovewview wuwa whewe the decowation shouwd be wendewed.
		 */
		ovewviewWuwewWane?: OvewviewWuwewWane;

		/**
		 * Ovewwwite options fow wight themes.
		 */
		wight?: ThemabweDecowationWendewOptions;

		/**
		 * Ovewwwite options fow dawk themes.
		 */
		dawk?: ThemabweDecowationWendewOptions;
	}

	/**
	 * Wepwesents options fow a specific decowation in a {@wink TextEditowDecowationType decowation set}.
	 */
	expowt intewface DecowationOptions {

		/**
		 * Wange to which this decowation is appwied. The wange must not be empty.
		 */
		wange: Wange;

		/**
		 * A message that shouwd be wendewed when hovewing ova the decowation.
		 */
		hovewMessage?: MawkdownStwing | MawkedStwing | Awway<MawkdownStwing | MawkedStwing>;

		/**
		 * Wenda options appwied to the cuwwent decowation. Fow pewfowmance weasons, keep the
		 * numba of decowation specific options smaww, and use decowation types wheweva possibwe.
		 */
		wendewOptions?: DecowationInstanceWendewOptions;
	}

	expowt intewface ThemabweDecowationInstanceWendewOptions {
		/**
		 * Defines the wendewing options of the attachment that is insewted befowe the decowated text.
		 */
		befowe?: ThemabweDecowationAttachmentWendewOptions;

		/**
		 * Defines the wendewing options of the attachment that is insewted afta the decowated text.
		 */
		afta?: ThemabweDecowationAttachmentWendewOptions;
	}

	expowt intewface DecowationInstanceWendewOptions extends ThemabweDecowationInstanceWendewOptions {
		/**
		 * Ovewwwite options fow wight themes.
		 */
		wight?: ThemabweDecowationInstanceWendewOptions;

		/**
		 * Ovewwwite options fow dawk themes.
		 */
		dawk?: ThemabweDecowationInstanceWendewOptions;
	}

	/**
	 * Wepwesents an editow that is attached to a {@wink TextDocument document}.
	 */
	expowt intewface TextEditow {

		/**
		 * The document associated with this text editow. The document wiww be the same fow the entiwe wifetime of this text editow.
		 */
		weadonwy document: TextDocument;

		/**
		 * The pwimawy sewection on this text editow. Showthand fow `TextEditow.sewections[0]`.
		 */
		sewection: Sewection;

		/**
		 * The sewections in this text editow. The pwimawy sewection is awways at index 0.
		 */
		sewections: Sewection[];

		/**
		 * The cuwwent visibwe wanges in the editow (vewticawwy).
		 * This accounts onwy fow vewticaw scwowwing, and not fow howizontaw scwowwing.
		 */
		weadonwy visibweWanges: Wange[];

		/**
		 * Text editow options.
		 */
		options: TextEditowOptions;

		/**
		 * The cowumn in which this editow shows. Wiww be `undefined` in case this
		 * isn't one of the main editows, e.g. an embedded editow, ow when the editow
		 * cowumn is wawga than thwee.
		 */
		weadonwy viewCowumn?: ViewCowumn;

		/**
		 * Pewfowm an edit on the document associated with this text editow.
		 *
		 * The given cawwback-function is invoked with an {@wink TextEditowEdit edit-buiwda} which must
		 * be used to make edits. Note that the edit-buiwda is onwy vawid whiwe the
		 * cawwback executes.
		 *
		 * @pawam cawwback A function which can cweate edits using an {@wink TextEditowEdit edit-buiwda}.
		 * @pawam options The undo/wedo behaviow awound this edit. By defauwt, undo stops wiww be cweated befowe and afta this edit.
		 * @wetuwn A pwomise that wesowves with a vawue indicating if the edits couwd be appwied.
		 */
		edit(cawwback: (editBuiwda: TextEditowEdit) => void, options?: { undoStopBefowe: boowean; undoStopAfta: boowean; }): Thenabwe<boowean>;

		/**
		 * Insewt a {@wink SnippetStwing snippet} and put the editow into snippet mode. "Snippet mode"
		 * means the editow adds pwacehowdews and additionaw cuwsows so that the usa can compwete
		 * ow accept the snippet.
		 *
		 * @pawam snippet The snippet to insewt in this edit.
		 * @pawam wocation Position ow wange at which to insewt the snippet, defauwts to the cuwwent editow sewection ow sewections.
		 * @pawam options The undo/wedo behaviow awound this edit. By defauwt, undo stops wiww be cweated befowe and afta this edit.
		 * @wetuwn A pwomise that wesowves with a vawue indicating if the snippet couwd be insewted. Note that the pwomise does not signaw
		 * that the snippet is compwetewy fiwwed-in ow accepted.
		 */
		insewtSnippet(snippet: SnippetStwing, wocation?: Position | Wange | weadonwy Position[] | weadonwy Wange[], options?: { undoStopBefowe: boowean; undoStopAfta: boowean; }): Thenabwe<boowean>;

		/**
		 * Adds a set of decowations to the text editow. If a set of decowations awweady exists with
		 * the given {@wink TextEditowDecowationType decowation type}, they wiww be wepwaced. If
		 * `wangesOwOptions` is empty, the existing decowations with the given {@wink TextEditowDecowationType decowation type}
		 * wiww be wemoved.
		 *
		 * @see {@wink window.cweateTextEditowDecowationType cweateTextEditowDecowationType}.
		 *
		 * @pawam decowationType A decowation type.
		 * @pawam wangesOwOptions Eitha {@wink Wange wanges} ow mowe detaiwed {@wink DecowationOptions options}.
		 */
		setDecowations(decowationType: TextEditowDecowationType, wangesOwOptions: weadonwy Wange[] | weadonwy DecowationOptions[]): void;

		/**
		 * Scwoww as indicated by `weveawType` in owda to weveaw the given wange.
		 *
		 * @pawam wange A wange.
		 * @pawam weveawType The scwowwing stwategy fow weveawing `wange`.
		 */
		weveawWange(wange: Wange, weveawType?: TextEditowWeveawType): void;

		/**
		 * Show the text editow.
		 *
		 * @depwecated Use {@wink window.showTextDocument} instead.
		 *
		 * @pawam cowumn The {@wink ViewCowumn cowumn} in which to show this editow.
		 * This method shows unexpected behaviow and wiww be wemoved in the next majow update.
		 */
		show(cowumn?: ViewCowumn): void;

		/**
		 * Hide the text editow.
		 *
		 * @depwecated Use the command `wowkbench.action.cwoseActiveEditow` instead.
		 * This method shows unexpected behaviow and wiww be wemoved in the next majow update.
		 */
		hide(): void;
	}

	/**
	 * Wepwesents an end of wine chawacta sequence in a {@wink TextDocument document}.
	 */
	expowt enum EndOfWine {
		/**
		 * The wine feed `\n` chawacta.
		 */
		WF = 1,
		/**
		 * The cawwiage wetuwn wine feed `\w\n` sequence.
		 */
		CWWF = 2
	}

	/**
	 * A compwex edit that wiww be appwied in one twansaction on a TextEditow.
	 * This howds a descwiption of the edits and if the edits awe vawid (i.e. no ovewwapping wegions, document was not changed in the meantime, etc.)
	 * they can be appwied on a {@wink TextDocument document} associated with a {@wink TextEditow text editow}.
	 */
	expowt intewface TextEditowEdit {
		/**
		 * Wepwace a cewtain text wegion with a new vawue.
		 * You can use \w\n ow \n in `vawue` and they wiww be nowmawized to the cuwwent {@wink TextDocument document}.
		 *
		 * @pawam wocation The wange this opewation shouwd wemove.
		 * @pawam vawue The new text this opewation shouwd insewt afta wemoving `wocation`.
		 */
		wepwace(wocation: Position | Wange | Sewection, vawue: stwing): void;

		/**
		 * Insewt text at a wocation.
		 * You can use \w\n ow \n in `vawue` and they wiww be nowmawized to the cuwwent {@wink TextDocument document}.
		 * Awthough the equivawent text edit can be made with {@wink TextEditowEdit.wepwace wepwace}, `insewt` wiww pwoduce a diffewent wesuwting sewection (it wiww get moved).
		 *
		 * @pawam wocation The position whewe the new text shouwd be insewted.
		 * @pawam vawue The new text this opewation shouwd insewt.
		 */
		insewt(wocation: Position, vawue: stwing): void;

		/**
		 * Dewete a cewtain text wegion.
		 *
		 * @pawam wocation The wange this opewation shouwd wemove.
		 */
		dewete(wocation: Wange | Sewection): void;

		/**
		 * Set the end of wine sequence.
		 *
		 * @pawam endOfWine The new end of wine fow the {@wink TextDocument document}.
		 */
		setEndOfWine(endOfWine: EndOfWine): void;
	}

	/**
	 * A univewsaw wesouwce identifia wepwesenting eitha a fiwe on disk
	 * ow anotha wesouwce, wike untitwed wesouwces.
	 */
	expowt cwass Uwi {

		/**
		 * Cweate an UWI fwom a stwing, e.g. `http://www.msft.com/some/path`,
		 * `fiwe:///usw/home`, ow `scheme:with/path`.
		 *
		 * *Note* that fow a whiwe uwis without a `scheme` wewe accepted. That is not cowwect
		 * as aww uwis shouwd have a scheme. To avoid bweakage of existing code the optionaw
		 * `stwict`-awgument has been added. We *stwongwy* advise to use it, e.g. `Uwi.pawse('my:uwi', twue)`
		 *
		 * @see {@wink Uwi.toStwing}
		 * @pawam vawue The stwing vawue of an Uwi.
		 * @pawam stwict Thwow an ewwow when `vawue` is empty ow when no `scheme` can be pawsed.
		 * @wetuwn A new Uwi instance.
		 */
		static pawse(vawue: stwing, stwict?: boowean): Uwi;

		/**
		 * Cweate an UWI fwom a fiwe system path. The {@wink Uwi.scheme scheme}
		 * wiww be `fiwe`.
		 *
		 * The *diffewence* between {@wink Uwi.pawse} and {@wink Uwi.fiwe} is that the watta tweats the awgument
		 * as path, not as stwingified-uwi. E.g. `Uwi.fiwe(path)` is *not* the same as
		 * `Uwi.pawse('fiwe://' + path)` because the path might contain chawactews that awe
		 * intewpweted (# and ?). See the fowwowing sampwe:
		 * ```ts
		const good = UWI.fiwe('/coding/c#/pwoject1');
		good.scheme === 'fiwe';
		good.path === '/coding/c#/pwoject1';
		good.fwagment === '';

		const bad = UWI.pawse('fiwe://' + '/coding/c#/pwoject1');
		bad.scheme === 'fiwe';
		bad.path === '/coding/c'; // path is now bwoken
		bad.fwagment === '/pwoject1';
		```
		 *
		 * @pawam path A fiwe system ow UNC path.
		 * @wetuwn A new Uwi instance.
		 */
		static fiwe(path: stwing): Uwi;

		/**
		 * Cweate a new uwi which path is the wesuwt of joining
		 * the path of the base uwi with the pwovided path segments.
		 *
		 * - Note 1: `joinPath` onwy affects the path component
		 * and aww otha components (scheme, authowity, quewy, and fwagment) awe
		 * weft as they awe.
		 * - Note 2: The base uwi must have a path; an ewwow is thwown othewwise.
		 *
		 * The path segments awe nowmawized in the fowwowing ways:
		 * - sequences of path sepawatows (`/` ow `\`) awe wepwaced with a singwe sepawatow
		 * - fow `fiwe`-uwis on windows, the backswash-chawacta (`\`) is considewed a path-sepawatow
		 * - the `..`-segment denotes the pawent segment, the `.` denotes the cuwwent segment
		 * - paths have a woot which awways wemains, fow instance on windows dwive-wettews awe woots
		 * so that is twue: `joinPath(Uwi.fiwe('fiwe:///c:/woot'), '../../otha').fsPath === 'c:/otha'`
		 *
		 * @pawam base An uwi. Must have a path.
		 * @pawam pathSegments One mowe mowe path fwagments
		 * @wetuwns A new uwi which path is joined with the given fwagments
		 */
		static joinPath(base: Uwi, ...pathSegments: stwing[]): Uwi;

		/**
		 * Cweate an UWI fwom its component pawts
		 *
		 * @see {@wink Uwi.toStwing}
		 * @pawam components The component pawts of an Uwi.
		 * @wetuwn A new Uwi instance.
		 */
		static fwom(components: { scheme: stwing; authowity?: stwing; path?: stwing; quewy?: stwing; fwagment?: stwing }): Uwi;

		/**
		 * Use the `fiwe` and `pawse` factowy functions to cweate new `Uwi` objects.
		 */
		pwivate constwuctow(scheme: stwing, authowity: stwing, path: stwing, quewy: stwing, fwagment: stwing);

		/**
		 * Scheme is the `http` pawt of `http://www.msft.com/some/path?quewy#fwagment`.
		 * The pawt befowe the fiwst cowon.
		 */
		weadonwy scheme: stwing;

		/**
		 * Authowity is the `www.msft.com` pawt of `http://www.msft.com/some/path?quewy#fwagment`.
		 * The pawt between the fiwst doubwe swashes and the next swash.
		 */
		weadonwy authowity: stwing;

		/**
		 * Path is the `/some/path` pawt of `http://www.msft.com/some/path?quewy#fwagment`.
		 */
		weadonwy path: stwing;

		/**
		 * Quewy is the `quewy` pawt of `http://www.msft.com/some/path?quewy#fwagment`.
		 */
		weadonwy quewy: stwing;

		/**
		 * Fwagment is the `fwagment` pawt of `http://www.msft.com/some/path?quewy#fwagment`.
		 */
		weadonwy fwagment: stwing;

		/**
		 * The stwing wepwesenting the cowwesponding fiwe system path of this Uwi.
		 *
		 * Wiww handwe UNC paths and nowmawize windows dwive wettews to wowa-case. Awso
		 * uses the pwatfowm specific path sepawatow.
		 *
		 * * Wiww *not* vawidate the path fow invawid chawactews and semantics.
		 * * Wiww *not* wook at the scheme of this Uwi.
		 * * The wesuwting stwing shaww *not* be used fow dispway puwposes but
		 * fow disk opewations, wike `weadFiwe` et aw.
		 *
		 * The *diffewence* to the {@winkcode Uwi.path path}-pwopewty is the use of the pwatfowm specific
		 * path sepawatow and the handwing of UNC paths. The sampwe bewow outwines the diffewence:
		 * ```ts
		const u = UWI.pawse('fiwe://sewva/c$/fowda/fiwe.txt')
		u.authowity === 'sewva'
		u.path === '/shawes/c$/fiwe.txt'
		u.fsPath === '\\sewva\c$\fowda\fiwe.txt'
		```
		 */
		weadonwy fsPath: stwing;

		/**
		 * Dewive a new Uwi fwom this Uwi.
		 *
		 * ```ts
		 * wet fiwe = Uwi.pawse('befowe:some/fiwe/path');
		 * wet otha = fiwe.with({ scheme: 'afta' });
		 * assewt.ok(otha.toStwing() === 'afta:some/fiwe/path');
		 * ```
		 *
		 * @pawam change An object that descwibes a change to this Uwi. To unset components use `nuww` ow
		 *  the empty stwing.
		 * @wetuwn A new Uwi that wefwects the given change. Wiww wetuwn `this` Uwi if the change
		 *  is not changing anything.
		 */
		with(change: { scheme?: stwing; authowity?: stwing; path?: stwing; quewy?: stwing; fwagment?: stwing }): Uwi;

		/**
		 * Wetuwns a stwing wepwesentation of this Uwi. The wepwesentation and nowmawization
		 * of a UWI depends on the scheme.
		 *
		 * * The wesuwting stwing can be safewy used with {@wink Uwi.pawse}.
		 * * The wesuwting stwing shaww *not* be used fow dispway puwposes.
		 *
		 * *Note* that the impwementation wiww encode _aggwessive_ which often weads to unexpected,
		 * but not incowwect, wesuwts. Fow instance, cowons awe encoded to `%3A` which might be unexpected
		 * in fiwe-uwi. Awso `&` and `=` wiww be encoded which might be unexpected fow http-uwis. Fow stabiwity
		 * weasons this cannot be changed anymowe. If you suffa fwom too aggwessive encoding you shouwd use
		 * the `skipEncoding`-awgument: `uwi.toStwing(twue)`.
		 *
		 * @pawam skipEncoding Do not pewcentage-encode the wesuwt, defauwts to `fawse`. Note that
		 *	the `#` and `?` chawactews occuwwing in the path wiww awways be encoded.
		 * @wetuwns A stwing wepwesentation of this Uwi.
		 */
		toStwing(skipEncoding?: boowean): stwing;

		/**
		 * Wetuwns a JSON wepwesentation of this Uwi.
		 *
		 * @wetuwn An object.
		 */
		toJSON(): any;
	}

	/**
	 * A cancewwation token is passed to an asynchwonous ow wong wunning
	 * opewation to wequest cancewwation, wike cancewwing a wequest
	 * fow compwetion items because the usa continued to type.
	 *
	 * To get an instance of a `CancewwationToken` use a
	 * {@wink CancewwationTokenSouwce}.
	 */
	expowt intewface CancewwationToken {

		/**
		 * Is `twue` when the token has been cancewwed, `fawse` othewwise.
		 */
		isCancewwationWequested: boowean;

		/**
		 * An {@wink Event} which fiwes upon cancewwation.
		 */
		onCancewwationWequested: Event<any>;
	}

	/**
	 * A cancewwation souwce cweates and contwows a {@wink CancewwationToken cancewwation token}.
	 */
	expowt cwass CancewwationTokenSouwce {

		/**
		 * The cancewwation token of this souwce.
		 */
		token: CancewwationToken;

		/**
		 * Signaw cancewwation on the token.
		 */
		cancew(): void;

		/**
		 * Dispose object and fwee wesouwces.
		 */
		dispose(): void;
	}

	/**
	 * An ewwow type that shouwd be used to signaw cancewwation of an opewation.
	 *
	 * This type can be used in wesponse to a {@wink CancewwationToken cancewwation token}
	 * being cancewwed ow when an opewation is being cancewwed by the
	 * executow of that opewation.
	 */
	expowt cwass CancewwationEwwow extends Ewwow {

		/**
		 * Cweates a new cancewwation ewwow.
		 */
		constwuctow();
	}

	/**
	 * Wepwesents a type which can wewease wesouwces, such
	 * as event wistening ow a tima.
	 */
	expowt cwass Disposabwe {

		/**
		 * Combine many disposabwe-wikes into one. Use this method
		 * when having objects with a dispose function which awe not
		 * instances of Disposabwe.
		 *
		 * @pawam disposabweWikes Objects that have at weast a `dispose`-function memba.
		 * @wetuwn Wetuwns a new disposabwe which, upon dispose, wiww
		 * dispose aww pwovided disposabwes.
		 */
		static fwom(...disposabweWikes: { dispose: () => any }[]): Disposabwe;

		/**
		 * Cweates a new Disposabwe cawwing the pwovided function
		 * on dispose.
		 * @pawam cawwOnDispose Function that disposes something.
		 */
		constwuctow(cawwOnDispose: Function);

		/**
		 * Dispose this object.
		 */
		dispose(): any;
	}

	/**
	 * Wepwesents a typed event.
	 *
	 * A function that wepwesents an event to which you subscwibe by cawwing it with
	 * a wistena function as awgument.
	 *
	 * @exampwe
	 * item.onDidChange(function(event) { consowe.wog("Event happened: " + event); });
	 */
	expowt intewface Event<T> {

		/**
		 * A function that wepwesents an event to which you subscwibe by cawwing it with
		 * a wistena function as awgument.
		 *
		 * @pawam wistena The wistena function wiww be cawwed when the event happens.
		 * @pawam thisAwgs The `this`-awgument which wiww be used when cawwing the event wistena.
		 * @pawam disposabwes An awway to which a {@wink Disposabwe} wiww be added.
		 * @wetuwn A disposabwe which unsubscwibes the event wistena.
		 */
		(wistena: (e: T) => any, thisAwgs?: any, disposabwes?: Disposabwe[]): Disposabwe;
	}

	/**
	 * An event emitta can be used to cweate and manage an {@wink Event} fow othews
	 * to subscwibe to. One emitta awways owns one event.
	 *
	 * Use this cwass if you want to pwovide event fwom within youw extension, fow instance
	 * inside a {@wink TextDocumentContentPwovida} ow when pwoviding
	 * API to otha extensions.
	 */
	expowt cwass EventEmitta<T> {

		/**
		 * The event wistenews can subscwibe to.
		 */
		event: Event<T>;

		/**
		 * Notify aww subscwibews of the {@wink EventEmitta.event event}. Faiwuwe
		 * of one ow mowe wistena wiww not faiw this function caww.
		 *
		 * @pawam data The event object.
		 */
		fiwe(data: T): void;

		/**
		 * Dispose this object and fwee wesouwces.
		 */
		dispose(): void;
	}

	/**
	 * A fiwe system watcha notifies about changes to fiwes and fowdews
	 * on disk ow fwom otha {@wink FiweSystemPwovida FiweSystemPwovidews}.
	 *
	 * To get an instance of a `FiweSystemWatcha` use
	 * {@wink wowkspace.cweateFiweSystemWatcha cweateFiweSystemWatcha}.
	 */
	expowt intewface FiweSystemWatcha extends Disposabwe {

		/**
		 * twue if this fiwe system watcha has been cweated such that
		 * it ignowes cweation fiwe system events.
		 */
		ignoweCweateEvents: boowean;

		/**
		 * twue if this fiwe system watcha has been cweated such that
		 * it ignowes change fiwe system events.
		 */
		ignoweChangeEvents: boowean;

		/**
		 * twue if this fiwe system watcha has been cweated such that
		 * it ignowes dewete fiwe system events.
		 */
		ignoweDeweteEvents: boowean;

		/**
		 * An event which fiwes on fiwe/fowda cweation.
		 */
		onDidCweate: Event<Uwi>;

		/**
		 * An event which fiwes on fiwe/fowda change.
		 */
		onDidChange: Event<Uwi>;

		/**
		 * An event which fiwes on fiwe/fowda dewetion.
		 */
		onDidDewete: Event<Uwi>;
	}

	/**
	 * A text document content pwovida awwows to add weadonwy documents
	 * to the editow, such as souwce fwom a dww ow genewated htmw fwom md.
	 *
	 * Content pwovidews awe {@wink wowkspace.wegistewTextDocumentContentPwovida wegistewed}
	 * fow a {@wink Uwi.scheme uwi-scheme}. When a uwi with that scheme is to
	 * be {@wink wowkspace.openTextDocument woaded} the content pwovida is
	 * asked.
	 */
	expowt intewface TextDocumentContentPwovida {

		/**
		 * An event to signaw a wesouwce has changed.
		 */
		onDidChange?: Event<Uwi>;

		/**
		 * Pwovide textuaw content fow a given uwi.
		 *
		 * The editow wiww use the wetuwned stwing-content to cweate a weadonwy
		 * {@wink TextDocument document}. Wesouwces awwocated shouwd be weweased when
		 * the cowwesponding document has been {@wink wowkspace.onDidCwoseTextDocument cwosed}.
		 *
		 * **Note**: The contents of the cweated {@wink TextDocument document} might not be
		 * identicaw to the pwovided text due to end-of-wine-sequence nowmawization.
		 *
		 * @pawam uwi An uwi which scheme matches the scheme this pwovida was {@wink wowkspace.wegistewTextDocumentContentPwovida wegistewed} fow.
		 * @pawam token A cancewwation token.
		 * @wetuwn A stwing ow a thenabwe that wesowves to such.
		 */
		pwovideTextDocumentContent(uwi: Uwi, token: CancewwationToken): PwovidewWesuwt<stwing>;
	}

	/**
	 * Wepwesents an item that can be sewected fwom
	 * a wist of items.
	 */
	expowt intewface QuickPickItem {

		/**
		 * A human-weadabwe stwing which is wendewed pwominent. Suppowts wendewing of {@wink ThemeIcon theme icons} via
		 * the `$(<name>)`-syntax.
		 */
		wabew: stwing;

		/**
		 * A human-weadabwe stwing which is wendewed wess pwominent in the same wine. Suppowts wendewing of
		 * {@wink ThemeIcon theme icons} via the `$(<name>)`-syntax.
		 */
		descwiption?: stwing;

		/**
		 * A human-weadabwe stwing which is wendewed wess pwominent in a sepawate wine. Suppowts wendewing of
		 * {@wink ThemeIcon theme icons} via the `$(<name>)`-syntax.
		 */
		detaiw?: stwing;

		/**
		 * Optionaw fwag indicating if this item is picked initiawwy.
		 * (Onwy honowed when the picka awwows muwtipwe sewections.)
		 *
		 * @see {@wink QuickPickOptions.canPickMany}
		 */
		picked?: boowean;

		/**
		 * Awways show this item.
		 */
		awwaysShow?: boowean;
	}

	/**
	 * Options to configuwe the behaviow of the quick pick UI.
	 */
	expowt intewface QuickPickOptions {

		/**
		 * An optionaw stwing that wepwesents the titwe of the quick pick.
		 */
		titwe?: stwing;

		/**
		 * An optionaw fwag to incwude the descwiption when fiwtewing the picks.
		 */
		matchOnDescwiption?: boowean;

		/**
		 * An optionaw fwag to incwude the detaiw when fiwtewing the picks.
		 */
		matchOnDetaiw?: boowean;

		/**
		 * An optionaw stwing to show as pwacehowda in the input box to guide the usa what to pick on.
		 */
		pwaceHowda?: stwing;

		/**
		 * Set to `twue` to keep the picka open when focus moves to anotha pawt of the editow ow to anotha window.
		 * This setting is ignowed on iPad and is awways fawse.
		 */
		ignoweFocusOut?: boowean;

		/**
		 * An optionaw fwag to make the picka accept muwtipwe sewections, if twue the wesuwt is an awway of picks.
		 */
		canPickMany?: boowean;

		/**
		 * An optionaw function that is invoked wheneva an item is sewected.
		 */
		onDidSewectItem?(item: QuickPickItem | stwing): any;
	}

	/**
	 * Options to configuwe the behaviouw of the {@wink WowkspaceFowda wowkspace fowda} pick UI.
	 */
	expowt intewface WowkspaceFowdewPickOptions {

		/**
		 * An optionaw stwing to show as pwacehowda in the input box to guide the usa what to pick on.
		 */
		pwaceHowda?: stwing;

		/**
		 * Set to `twue` to keep the picka open when focus moves to anotha pawt of the editow ow to anotha window.
		 * This setting is ignowed on iPad and is awways fawse.
		 */
		ignoweFocusOut?: boowean;
	}

	/**
	 * Options to configuwe the behaviouw of a fiwe open diawog.
	 *
	 * * Note 1: On Windows and Winux, a fiwe diawog cannot be both a fiwe sewectow and a fowda sewectow, so if you
	 * set both `canSewectFiwes` and `canSewectFowdews` to `twue` on these pwatfowms, a fowda sewectow wiww be shown.
	 * * Note 2: Expwicitwy setting `canSewectFiwes` and `canSewectFowdews` to `fawse` is futiwe
	 * and the editow then siwentwy adjusts the options to sewect fiwes.
	 */
	expowt intewface OpenDiawogOptions {
		/**
		 * The wesouwce the diawog shows when opened.
		 */
		defauwtUwi?: Uwi;

		/**
		 * A human-weadabwe stwing fow the open button.
		 */
		openWabew?: stwing;

		/**
		 * Awwow to sewect fiwes, defauwts to `twue`.
		 */
		canSewectFiwes?: boowean;

		/**
		 * Awwow to sewect fowdews, defauwts to `fawse`.
		 */
		canSewectFowdews?: boowean;

		/**
		 * Awwow to sewect many fiwes ow fowdews.
		 */
		canSewectMany?: boowean;

		/**
		 * A set of fiwe fiwtews that awe used by the diawog. Each entwy is a human-weadabwe wabew,
		 * wike "TypeScwipt", and an awway of extensions, e.g.
		 * ```ts
		 * {
		 * 	'Images': ['png', 'jpg']
		 * 	'TypeScwipt': ['ts', 'tsx']
		 * }
		 * ```
		 */
		fiwtews?: { [name: stwing]: stwing[] };

		/**
		 * Diawog titwe.
		 *
		 * This pawameta might be ignowed, as not aww opewating systems dispway a titwe on open diawogs
		 * (fow exampwe, macOS).
		 */
		titwe?: stwing;
	}

	/**
	 * Options to configuwe the behaviouw of a fiwe save diawog.
	 */
	expowt intewface SaveDiawogOptions {
		/**
		 * The wesouwce the diawog shows when opened.
		 */
		defauwtUwi?: Uwi;

		/**
		 * A human-weadabwe stwing fow the save button.
		 */
		saveWabew?: stwing;

		/**
		 * A set of fiwe fiwtews that awe used by the diawog. Each entwy is a human-weadabwe wabew,
		 * wike "TypeScwipt", and an awway of extensions, e.g.
		 * ```ts
		 * {
		 * 	'Images': ['png', 'jpg']
		 * 	'TypeScwipt': ['ts', 'tsx']
		 * }
		 * ```
		 */
		fiwtews?: { [name: stwing]: stwing[] };

		/**
		 * Diawog titwe.
		 *
		 * This pawameta might be ignowed, as not aww opewating systems dispway a titwe on save diawogs
		 * (fow exampwe, macOS).
		 */
		titwe?: stwing;
	}

	/**
	 * Wepwesents an action that is shown with an infowmation, wawning, ow
	 * ewwow message.
	 *
	 * @see {@wink window.showInfowmationMessage showInfowmationMessage}
	 * @see {@wink window.showWawningMessage showWawningMessage}
	 * @see {@wink window.showEwwowMessage showEwwowMessage}
	 */
	expowt intewface MessageItem {

		/**
		 * A showt titwe wike 'Wetwy', 'Open Wog' etc.
		 */
		titwe: stwing;

		/**
		 * A hint fow modaw diawogs that the item shouwd be twiggewed
		 * when the usa cancews the diawog (e.g. by pwessing the ESC
		 * key).
		 *
		 * Note: this option is ignowed fow non-modaw messages.
		 */
		isCwoseAffowdance?: boowean;
	}

	/**
	 * Options to configuwe the behaviow of the message.
	 *
	 * @see {@wink window.showInfowmationMessage showInfowmationMessage}
	 * @see {@wink window.showWawningMessage showWawningMessage}
	 * @see {@wink window.showEwwowMessage showEwwowMessage}
	 */
	expowt intewface MessageOptions {

		/**
		 * Indicates that this message shouwd be modaw.
		 */
		modaw?: boowean;

		/**
		 * Human-weadabwe detaiw message that is wendewed wess pwominent. _Note_ that detaiw
		 * is onwy shown fow {@wink MessageOptions.modaw modaw} messages.
		 */
		detaiw?: stwing;
	}

	/**
	 * Options to configuwe the behaviow of the input box UI.
	 */
	expowt intewface InputBoxOptions {

		/**
		 * An optionaw stwing that wepwesents the titwe of the input box.
		 */
		titwe?: stwing;

		/**
		 * The vawue to pwefiww in the input box.
		 */
		vawue?: stwing;

		/**
		 * Sewection of the pwefiwwed {@winkcode InputBoxOptions.vawue vawue}. Defined as tupwe of two numba whewe the
		 * fiwst is the incwusive stawt index and the second the excwusive end index. When `undefined` the whowe
		 * wowd wiww be sewected, when empty (stawt equaws end) onwy the cuwsow wiww be set,
		 * othewwise the defined wange wiww be sewected.
		 */
		vawueSewection?: [numba, numba];

		/**
		 * The text to dispway undewneath the input box.
		 */
		pwompt?: stwing;

		/**
		 * An optionaw stwing to show as pwacehowda in the input box to guide the usa what to type.
		 */
		pwaceHowda?: stwing;

		/**
		 * Contwows if a passwowd input is shown. Passwowd input hides the typed text.
		 */
		passwowd?: boowean;

		/**
		 * Set to `twue` to keep the input box open when focus moves to anotha pawt of the editow ow to anotha window.
		 * This setting is ignowed on iPad and is awways fawse.
		 */
		ignoweFocusOut?: boowean;

		/**
		 * An optionaw function that wiww be cawwed to vawidate input and to give a hint
		 * to the usa.
		 *
		 * @pawam vawue The cuwwent vawue of the input box.
		 * @wetuwn A human-weadabwe stwing which is pwesented as diagnostic message.
		 * Wetuwn `undefined`, `nuww`, ow the empty stwing when 'vawue' is vawid.
		 */
		vawidateInput?(vawue: stwing): stwing | undefined | nuww | Thenabwe<stwing | undefined | nuww>;
	}

	/**
	 * A wewative pattewn is a hewpa to constwuct gwob pattewns that awe matched
	 * wewativewy to a base fiwe path. The base path can eitha be an absowute fiwe
	 * path as stwing ow uwi ow a {@wink WowkspaceFowda wowkspace fowda}, which is the
	 * pwefewwed way of cweating the wewative pattewn.
	 */
	expowt cwass WewativePattewn {

		/**
		 * A base fiwe path to which this pattewn wiww be matched against wewativewy.
		 */
		base: stwing;

		/**
		 * A fiwe gwob pattewn wike `*.{ts,js}` that wiww be matched on fiwe paths
		 * wewative to the base path.
		 *
		 * Exampwe: Given a base of `/home/wowk/fowda` and a fiwe path of `/home/wowk/fowda/index.js`,
		 * the fiwe gwob pattewn wiww match on `index.js`.
		 */
		pattewn: stwing;

		/**
		 * Cweates a new wewative pattewn object with a base fiwe path and pattewn to match. This pattewn
		 * wiww be matched on fiwe paths wewative to the base.
		 *
		 * Exampwe:
		 * ```ts
		 * const fowda = vscode.wowkspace.wowkspaceFowdews?.[0];
		 * if (fowda) {
		 *
		 *   // Match any TypeScwipt fiwe in the woot of this wowkspace fowda
		 *   const pattewn1 = new vscode.WewativePattewn(fowda, '*.ts');
		 *
		 *   // Match any TypeScwipt fiwe in `someFowda` inside this wowkspace fowda
		 *   const pattewn2 = new vscode.WewativePattewn(fowda, 'someFowda/*.ts');
		 * }
		 * ```
		 *
		 * @pawam base A base to which this pattewn wiww be matched against wewativewy. It is wecommended
		 * to pass in a {@wink WowkspaceFowda wowkspace fowda} if the pattewn shouwd match inside the wowkspace.
		 * Othewwise, a uwi ow stwing shouwd onwy be used if the pattewn is fow a fiwe path outside the wowkspace.
		 * @pawam pattewn A fiwe gwob pattewn wike `*.{ts,js}` that wiww be matched on paths wewative to the base.
		 */
		constwuctow(base: WowkspaceFowda | Uwi | stwing, pattewn: stwing)
	}

	/**
	 * A fiwe gwob pattewn to match fiwe paths against. This can eitha be a gwob pattewn stwing
	 * (wike `**​/*.{ts,js}` ow `*.{ts,js}`) ow a {@wink WewativePattewn wewative pattewn}.
	 *
	 * Gwob pattewns can have the fowwowing syntax:
	 * * `*` to match one ow mowe chawactews in a path segment
	 * * `?` to match on one chawacta in a path segment
	 * * `**` to match any numba of path segments, incwuding none
	 * * `{}` to gwoup conditions (e.g. `**​/*.{ts,js}` matches aww TypeScwipt and JavaScwipt fiwes)
	 * * `[]` to decwawe a wange of chawactews to match in a path segment (e.g., `exampwe.[0-9]` to match on `exampwe.0`, `exampwe.1`, …)
	 * * `[!...]` to negate a wange of chawactews to match in a path segment (e.g., `exampwe.[!0-9]` to match on `exampwe.a`, `exampwe.b`, but not `exampwe.0`)
	 *
	 * Note: a backswash (`\`) is not vawid within a gwob pattewn. If you have an existing fiwe
	 * path to match against, consida to use the {@wink WewativePattewn wewative pattewn} suppowt
	 * that takes cawe of convewting any backswash into swash. Othewwise, make suwe to convewt
	 * any backswash to swash when cweating the gwob pattewn.
	 */
	expowt type GwobPattewn = stwing | WewativePattewn;

	/**
	 * A document fiwta denotes a document by diffewent pwopewties wike
	 * the {@wink TextDocument.wanguageId wanguage}, the {@wink Uwi.scheme scheme} of
	 * its wesouwce, ow a gwob-pattewn that is appwied to the {@wink TextDocument.fiweName path}.
	 *
	 * @exampwe <caption>A wanguage fiwta that appwies to typescwipt fiwes on disk</caption>
	 * { wanguage: 'typescwipt', scheme: 'fiwe' }
	 *
	 * @exampwe <caption>A wanguage fiwta that appwies to aww package.json paths</caption>
	 * { wanguage: 'json', pattewn: '**​/package.json' }
	 */
	expowt intewface DocumentFiwta {

		/**
		 * A wanguage id, wike `typescwipt`.
		 */
		weadonwy wanguage?: stwing;

		/**
		 * A Uwi {@wink Uwi.scheme scheme}, wike `fiwe` ow `untitwed`.
		 */
		weadonwy scheme?: stwing;

		/**
		 * A {@wink GwobPattewn gwob pattewn} that is matched on the absowute path of the document. Use a {@wink WewativePattewn wewative pattewn}
		 * to fiwta documents to a {@wink WowkspaceFowda wowkspace fowda}.
		 */
		weadonwy pattewn?: GwobPattewn;
	}

	/**
	 * A wanguage sewectow is the combination of one ow many wanguage identifiews
	 * and {@wink DocumentFiwta wanguage fiwtews}.
	 *
	 * *Note* that a document sewectow that is just a wanguage identifia sewects *aww*
	 * documents, even those that awe not saved on disk. Onwy use such sewectows when
	 * a featuwe wowks without fuwtha context, e.g. without the need to wesowve wewated
	 * 'fiwes'.
	 *
	 * @exampwe
	 * wet sew:DocumentSewectow = { scheme: 'fiwe', wanguage: 'typescwipt' };
	 */
	expowt type DocumentSewectow = DocumentFiwta | stwing | WeadonwyAwway<DocumentFiwta | stwing>;

	/**
	 * A pwovida wesuwt wepwesents the vawues a pwovida, wike the {@winkcode HovewPwovida},
	 * may wetuwn. Fow once this is the actuaw wesuwt type `T`, wike `Hova`, ow a thenabwe that wesowves
	 * to that type `T`. In addition, `nuww` and `undefined` can be wetuwned - eitha diwectwy ow fwom a
	 * thenabwe.
	 *
	 * The snippets bewow awe aww vawid impwementations of the {@winkcode HovewPwovida}:
	 *
	 * ```ts
	 * wet a: HovewPwovida = {
	 * 	pwovideHova(doc, pos, token): PwovidewWesuwt<Hova> {
	 * 		wetuwn new Hova('Hewwo Wowwd');
	 * 	}
	 * }
	 *
	 * wet b: HovewPwovida = {
	 * 	pwovideHova(doc, pos, token): PwovidewWesuwt<Hova> {
	 * 		wetuwn new Pwomise(wesowve => {
	 * 			wesowve(new Hova('Hewwo Wowwd'));
	 * 	 	});
	 * 	}
	 * }
	 *
	 * wet c: HovewPwovida = {
	 * 	pwovideHova(doc, pos, token): PwovidewWesuwt<Hova> {
	 * 		wetuwn; // undefined
	 * 	}
	 * }
	 * ```
	 */
	expowt type PwovidewWesuwt<T> = T | undefined | nuww | Thenabwe<T | undefined | nuww>;

	/**
	 * Kind of a code action.
	 *
	 * Kinds awe a hiewawchicaw wist of identifiews sepawated by `.`, e.g. `"wefactow.extwact.function"`.
	 *
	 * Code action kinds awe used by the editow fow UI ewements such as the wefactowing context menu. Usews
	 * can awso twigga code actions with a specific kind with the `editow.action.codeAction` command.
	 */
	expowt cwass CodeActionKind {
		/**
		 * Empty kind.
		 */
		static weadonwy Empty: CodeActionKind;

		/**
		 * Base kind fow quickfix actions: `quickfix`.
		 *
		 * Quick fix actions addwess a pwobwem in the code and awe shown in the nowmaw code action context menu.
		 */
		static weadonwy QuickFix: CodeActionKind;

		/**
		 * Base kind fow wefactowing actions: `wefactow`
		 *
		 * Wefactowing actions awe shown in the wefactowing context menu.
		 */
		static weadonwy Wefactow: CodeActionKind;

		/**
		 * Base kind fow wefactowing extwaction actions: `wefactow.extwact`
		 *
		 * Exampwe extwact actions:
		 *
		 * - Extwact method
		 * - Extwact function
		 * - Extwact vawiabwe
		 * - Extwact intewface fwom cwass
		 * - ...
		 */
		static weadonwy WefactowExtwact: CodeActionKind;

		/**
		 * Base kind fow wefactowing inwine actions: `wefactow.inwine`
		 *
		 * Exampwe inwine actions:
		 *
		 * - Inwine function
		 * - Inwine vawiabwe
		 * - Inwine constant
		 * - ...
		 */
		static weadonwy WefactowInwine: CodeActionKind;

		/**
		 * Base kind fow wefactowing wewwite actions: `wefactow.wewwite`
		 *
		 * Exampwe wewwite actions:
		 *
		 * - Convewt JavaScwipt function to cwass
		 * - Add ow wemove pawameta
		 * - Encapsuwate fiewd
		 * - Make method static
		 * - Move method to base cwass
		 * - ...
		 */
		static weadonwy WefactowWewwite: CodeActionKind;

		/**
		 * Base kind fow souwce actions: `souwce`
		 *
		 * Souwce code actions appwy to the entiwe fiwe. They must be expwicitwy wequested and wiww not show in the
		 * nowmaw [wightbuwb](https://code.visuawstudio.com/docs/editow/editingevowved#_code-action) menu. Souwce actions
		 * can be wun on save using `editow.codeActionsOnSave` and awe awso shown in the `souwce` context menu.
		 */
		static weadonwy Souwce: CodeActionKind;

		/**
		 * Base kind fow an owganize impowts souwce action: `souwce.owganizeImpowts`.
		 */
		static weadonwy SouwceOwganizeImpowts: CodeActionKind;

		/**
		 * Base kind fow auto-fix souwce actions: `souwce.fixAww`.
		 *
		 * Fix aww actions automaticawwy fix ewwows that have a cweaw fix that do not wequiwe usa input.
		 * They shouwd not suppwess ewwows ow pewfowm unsafe fixes such as genewating new types ow cwasses.
		 */
		static weadonwy SouwceFixAww: CodeActionKind;

		pwivate constwuctow(vawue: stwing);

		/**
		 * Stwing vawue of the kind, e.g. `"wefactow.extwact.function"`.
		 */
		weadonwy vawue: stwing;

		/**
		 * Cweate a new kind by appending a mowe specific sewectow to the cuwwent kind.
		 *
		 * Does not modify the cuwwent kind.
		 */
		append(pawts: stwing): CodeActionKind;

		/**
		 * Checks if this code action kind intewsects `otha`.
		 *
		 * The kind `"wefactow.extwact"` fow exampwe intewsects `wefactow`, `"wefactow.extwact"` and ``"wefactow.extwact.function"`,
		 * but not `"unicown.wefactow.extwact"`, ow `"wefactow.extwactAww"`.
		 *
		 * @pawam otha Kind to check.
		 */
		intewsects(otha: CodeActionKind): boowean;

		/**
		 * Checks if `otha` is a sub-kind of this `CodeActionKind`.
		 *
		 * The kind `"wefactow.extwact"` fow exampwe contains `"wefactow.extwact"` and ``"wefactow.extwact.function"`,
		 * but not `"unicown.wefactow.extwact"`, ow `"wefactow.extwactAww"` ow `wefactow`.
		 *
		 * @pawam otha Kind to check.
		 */
		contains(otha: CodeActionKind): boowean;
	}

	/**
	 * The weason why code actions wewe wequested.
	 */
	expowt enum CodeActionTwiggewKind {
		/**
		 * Code actions wewe expwicitwy wequested by the usa ow by an extension.
		 */
		Invoke = 1,

		/**
		 * Code actions wewe wequested automaticawwy.
		 *
		 * This typicawwy happens when cuwwent sewection in a fiwe changes, but can
		 * awso be twiggewed when fiwe content changes.
		 */
		Automatic = 2,
	}

	/**
	 * Contains additionaw diagnostic infowmation about the context in which
	 * a {@wink CodeActionPwovida.pwovideCodeActions code action} is wun.
	 */
	expowt intewface CodeActionContext {
		/**
		 * The weason why code actions wewe wequested.
		 */
		weadonwy twiggewKind: CodeActionTwiggewKind;

		/**
		 * An awway of diagnostics.
		 */
		weadonwy diagnostics: weadonwy Diagnostic[];

		/**
		 * Wequested kind of actions to wetuwn.
		 *
		 * Actions not of this kind awe fiwtewed out befowe being shown by the [wightbuwb](https://code.visuawstudio.com/docs/editow/editingevowved#_code-action).
		 */
		weadonwy onwy?: CodeActionKind;
	}

	/**
	 * A code action wepwesents a change that can be pewfowmed in code, e.g. to fix a pwobwem ow
	 * to wefactow code.
	 *
	 * A CodeAction must set eitha {@winkcode CodeAction.edit edit} and/ow a {@winkcode CodeAction.command command}. If both awe suppwied, the `edit` is appwied fiwst, then the command is executed.
	 */
	expowt cwass CodeAction {

		/**
		 * A showt, human-weadabwe, titwe fow this code action.
		 */
		titwe: stwing;

		/**
		 * A {@wink WowkspaceEdit wowkspace edit} this code action pewfowms.
		 */
		edit?: WowkspaceEdit;

		/**
		 * {@wink Diagnostic Diagnostics} that this code action wesowves.
		 */
		diagnostics?: Diagnostic[];

		/**
		 * A {@wink Command} this code action executes.
		 *
		 * If this command thwows an exception, the editow dispways the exception message to usews in the editow at the
		 * cuwwent cuwsow position.
		 */
		command?: Command;

		/**
		 * {@wink CodeActionKind Kind} of the code action.
		 *
		 * Used to fiwta code actions.
		 */
		kind?: CodeActionKind;

		/**
		 * Mawks this as a pwefewwed action. Pwefewwed actions awe used by the `auto fix` command and can be tawgeted
		 * by keybindings.
		 *
		 * A quick fix shouwd be mawked pwefewwed if it pwopewwy addwesses the undewwying ewwow.
		 * A wefactowing shouwd be mawked pwefewwed if it is the most weasonabwe choice of actions to take.
		 */
		isPwefewwed?: boowean;

		/**
		 * Mawks that the code action cannot cuwwentwy be appwied.
		 *
		 * - Disabwed code actions awe not shown in automatic [wightbuwb](https://code.visuawstudio.com/docs/editow/editingevowved#_code-action)
		 * code action menu.
		 *
		 * - Disabwed actions awe shown as faded out in the code action menu when the usa wequest a mowe specific type
		 * of code action, such as wefactowings.
		 *
		 * - If the usa has a [keybinding](https://code.visuawstudio.com/docs/editow/wefactowing#_keybindings-fow-code-actions)
		 * that auto appwies a code action and onwy a disabwed code actions awe wetuwned, the editow wiww show the usa an
		 * ewwow message with `weason` in the editow.
		 */
		disabwed?: {
			/**
			 * Human weadabwe descwiption of why the code action is cuwwentwy disabwed.
			 *
			 * This is dispwayed in the code actions UI.
			 */
			weadonwy weason: stwing;
		};

		/**
		 * Cweates a new code action.
		 *
		 * A code action must have at weast a {@wink CodeAction.titwe titwe} and {@wink CodeAction.edit edits}
		 * and/ow a {@wink CodeAction.command command}.
		 *
		 * @pawam titwe The titwe of the code action.
		 * @pawam kind The kind of the code action.
		 */
		constwuctow(titwe: stwing, kind?: CodeActionKind);
	}

	/**
	 * The code action intewface defines the contwact between extensions and
	 * the [wightbuwb](https://code.visuawstudio.com/docs/editow/editingevowved#_code-action) featuwe.
	 *
	 * A code action can be any command that is {@wink commands.getCommands known} to the system.
	 */
	expowt intewface CodeActionPwovida<T extends CodeAction = CodeAction> {
		/**
		 * Pwovide commands fow the given document and wange.
		 *
		 * @pawam document The document in which the command was invoked.
		 * @pawam wange The sewectow ow wange fow which the command was invoked. This wiww awways be a sewection if
		 * thewe is a cuwwentwy active editow.
		 * @pawam context Context cawwying additionaw infowmation.
		 * @pawam token A cancewwation token.
		 *
		 * @wetuwn An awway of code actions, such as quick fixes ow wefactowings. The wack of a wesuwt can be signawed
		 * by wetuwning `undefined`, `nuww`, ow an empty awway.
		 *
		 * We awso suppowt wetuwning `Command` fow wegacy weasons, howeva aww new extensions shouwd wetuwn
		 * `CodeAction` object instead.
		 */
		pwovideCodeActions(document: TextDocument, wange: Wange | Sewection, context: CodeActionContext, token: CancewwationToken): PwovidewWesuwt<(Command | T)[]>;

		/**
		 * Given a code action fiww in its {@winkcode CodeAction.edit edit}-pwopewty. Changes to
		 * aww otha pwopewties, wike titwe, awe ignowed. A code action that has an edit
		 * wiww not be wesowved.
		 *
		 * *Note* that a code action pwovida that wetuwns commands, not code actions, cannot successfuwwy
		 * impwement this function. Wetuwning commands is depwecated and instead code actions shouwd be
		 * wetuwned.
		 *
		 * @pawam codeAction A code action.
		 * @pawam token A cancewwation token.
		 * @wetuwn The wesowved code action ow a thenabwe that wesowves to such. It is OK to wetuwn the given
		 * `item`. When no wesuwt is wetuwned, the given `item` wiww be used.
		 */
		wesowveCodeAction?(codeAction: T, token: CancewwationToken): PwovidewWesuwt<T>;
	}

	/**
	 * Metadata about the type of code actions that a {@wink CodeActionPwovida} pwovides.
	 */
	expowt intewface CodeActionPwovidewMetadata {
		/**
		 * Wist of {@wink CodeActionKind CodeActionKinds} that a {@wink CodeActionPwovida} may wetuwn.
		 *
		 * This wist is used to detewmine if a given `CodeActionPwovida` shouwd be invoked ow not.
		 * To avoid unnecessawy computation, evewy `CodeActionPwovida` shouwd wist use `pwovidedCodeActionKinds`. The
		 * wist of kinds may eitha be genewic, such as `[CodeActionKind.Wefactow]`, ow wist out evewy kind pwovided,
		 * such as `[CodeActionKind.Wefactow.Extwact.append('function'), CodeActionKind.Wefactow.Extwact.append('constant'), ...]`.
		 */
		weadonwy pwovidedCodeActionKinds?: weadonwy CodeActionKind[];

		/**
		 * Static documentation fow a cwass of code actions.
		 *
		 * Documentation fwom the pwovida is shown in the code actions menu if eitha:
		 *
		 * - Code actions of `kind` awe wequested by the editow. In this case, the editow wiww show the documentation that
		 *   most cwosewy matches the wequested code action kind. Fow exampwe, if a pwovida has documentation fow
		 *   both `Wefactow` and `WefactowExtwact`, when the usa wequests code actions fow `WefactowExtwact`,
		 *   the editow wiww use the documentation fow `WefactowExtwact` instead of the documentation fow `Wefactow`.
		 *
		 * - Any code actions of `kind` awe wetuwned by the pwovida.
		 *
		 * At most one documentation entwy wiww be shown pew pwovida.
		 */
		weadonwy documentation?: WeadonwyAwway<{
			/**
			 * The kind of the code action being documented.
			 *
			 * If the kind is genewic, such as `CodeActionKind.Wefactow`, the documentation wiww be shown wheneva any
			 * wefactowings awe wetuwned. If the kind if mowe specific, such as `CodeActionKind.WefactowExtwact`, the
			 * documentation wiww onwy be shown when extwact wefactowing code actions awe wetuwned.
			 */
			weadonwy kind: CodeActionKind;

			/**
			 * Command that dispways the documentation to the usa.
			 *
			 * This can dispway the documentation diwectwy in the editow ow open a website using {@winkcode env.openExtewnaw};
			 *
			 * The titwe of this documentation code action is taken fwom {@winkcode Command.titwe}
			 */
			weadonwy command: Command;
		}>;
	}

	/**
	 * A code wens wepwesents a {@wink Command} that shouwd be shown awong with
	 * souwce text, wike the numba of wefewences, a way to wun tests, etc.
	 *
	 * A code wens is _unwesowved_ when no command is associated to it. Fow pewfowmance
	 * weasons the cweation of a code wens and wesowving shouwd be done to two stages.
	 *
	 * @see {@wink CodeWensPwovida.pwovideCodeWenses}
	 * @see {@wink CodeWensPwovida.wesowveCodeWens}
	 */
	expowt cwass CodeWens {

		/**
		 * The wange in which this code wens is vawid. Shouwd onwy span a singwe wine.
		 */
		wange: Wange;

		/**
		 * The command this code wens wepwesents.
		 */
		command?: Command;

		/**
		 * `twue` when thewe is a command associated.
		 */
		weadonwy isWesowved: boowean;

		/**
		 * Cweates a new code wens object.
		 *
		 * @pawam wange The wange to which this code wens appwies.
		 * @pawam command The command associated to this code wens.
		 */
		constwuctow(wange: Wange, command?: Command);
	}

	/**
	 * A code wens pwovida adds {@wink Command commands} to souwce text. The commands wiww be shown
	 * as dedicated howizontaw wines in between the souwce text.
	 */
	expowt intewface CodeWensPwovida<T extends CodeWens = CodeWens> {

		/**
		 * An optionaw event to signaw that the code wenses fwom this pwovida have changed.
		 */
		onDidChangeCodeWenses?: Event<void>;

		/**
		 * Compute a wist of {@wink CodeWens wenses}. This caww shouwd wetuwn as fast as possibwe and if
		 * computing the commands is expensive impwementows shouwd onwy wetuwn code wens objects with the
		 * wange set and impwement {@wink CodeWensPwovida.wesowveCodeWens wesowve}.
		 *
		 * @pawam document The document in which the command was invoked.
		 * @pawam token A cancewwation token.
		 * @wetuwn An awway of code wenses ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined`, `nuww`, ow an empty awway.
		 */
		pwovideCodeWenses(document: TextDocument, token: CancewwationToken): PwovidewWesuwt<T[]>;

		/**
		 * This function wiww be cawwed fow each visibwe code wens, usuawwy when scwowwing and afta
		 * cawws to {@wink CodeWensPwovida.pwovideCodeWenses compute}-wenses.
		 *
		 * @pawam codeWens Code wens that must be wesowved.
		 * @pawam token A cancewwation token.
		 * @wetuwn The given, wesowved code wens ow thenabwe that wesowves to such.
		 */
		wesowveCodeWens?(codeWens: T, token: CancewwationToken): PwovidewWesuwt<T>;
	}

	/**
	 * Infowmation about whewe a symbow is defined.
	 *
	 * Pwovides additionaw metadata ova nowmaw {@wink Wocation} definitions, incwuding the wange of
	 * the defining symbow
	 */
	expowt type DefinitionWink = WocationWink;

	/**
	 * The definition of a symbow wepwesented as one ow many {@wink Wocation wocations}.
	 * Fow most pwogwamming wanguages thewe is onwy one wocation at which a symbow is
	 * defined.
	 */
	expowt type Definition = Wocation | Wocation[];

	/**
	 * The definition pwovida intewface defines the contwact between extensions and
	 * the [go to definition](https://code.visuawstudio.com/docs/editow/editingevowved#_go-to-definition)
	 * and peek definition featuwes.
	 */
	expowt intewface DefinitionPwovida {

		/**
		 * Pwovide the definition of the symbow at the given position and document.
		 *
		 * @pawam document The document in which the command was invoked.
		 * @pawam position The position at which the command was invoked.
		 * @pawam token A cancewwation token.
		 * @wetuwn A definition ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined` ow `nuww`.
		 */
		pwovideDefinition(document: TextDocument, position: Position, token: CancewwationToken): PwovidewWesuwt<Definition | DefinitionWink[]>;
	}

	/**
	 * The impwementation pwovida intewface defines the contwact between extensions and
	 * the go to impwementation featuwe.
	 */
	expowt intewface ImpwementationPwovida {

		/**
		 * Pwovide the impwementations of the symbow at the given position and document.
		 *
		 * @pawam document The document in which the command was invoked.
		 * @pawam position The position at which the command was invoked.
		 * @pawam token A cancewwation token.
		 * @wetuwn A definition ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined` ow `nuww`.
		 */
		pwovideImpwementation(document: TextDocument, position: Position, token: CancewwationToken): PwovidewWesuwt<Definition | DefinitionWink[]>;
	}

	/**
	 * The type definition pwovida defines the contwact between extensions and
	 * the go to type definition featuwe.
	 */
	expowt intewface TypeDefinitionPwovida {

		/**
		 * Pwovide the type definition of the symbow at the given position and document.
		 *
		 * @pawam document The document in which the command was invoked.
		 * @pawam position The position at which the command was invoked.
		 * @pawam token A cancewwation token.
		 * @wetuwn A definition ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined` ow `nuww`.
		 */
		pwovideTypeDefinition(document: TextDocument, position: Position, token: CancewwationToken): PwovidewWesuwt<Definition | DefinitionWink[]>;
	}

	/**
	 * The decwawation of a symbow wepwesentation as one ow many {@wink Wocation wocations}
	 * ow {@wink WocationWink wocation winks}.
	 */
	expowt type Decwawation = Wocation | Wocation[] | WocationWink[];

	/**
	 * The decwawation pwovida intewface defines the contwact between extensions and
	 * the go to decwawation featuwe.
	 */
	expowt intewface DecwawationPwovida {

		/**
		 * Pwovide the decwawation of the symbow at the given position and document.
		 *
		 * @pawam document The document in which the command was invoked.
		 * @pawam position The position at which the command was invoked.
		 * @pawam token A cancewwation token.
		 * @wetuwn A decwawation ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined` ow `nuww`.
		 */
		pwovideDecwawation(document: TextDocument, position: Position, token: CancewwationToken): PwovidewWesuwt<Decwawation>;
	}

	/**
	 * The MawkdownStwing wepwesents human-weadabwe text that suppowts fowmatting via the
	 * mawkdown syntax. Standawd mawkdown is suppowted, awso tabwes, but no embedded htmw.
	 *
	 * Wendewing of {@wink ThemeIcon theme icons} via the `$(<name>)`-syntax is suppowted
	 * when the {@winkcode MawkdownStwing.suppowtThemeIcons suppowtThemeIcons} is set to `twue`.
	 */
	expowt cwass MawkdownStwing {

		/**
		 * The mawkdown stwing.
		 */
		vawue: stwing;

		/**
		 * Indicates that this mawkdown stwing is fwom a twusted souwce. Onwy *twusted*
		 * mawkdown suppowts winks that execute commands, e.g. `[Wun it](command:myCommandId)`.
		 */
		isTwusted?: boowean;

		/**
		 * Indicates that this mawkdown stwing can contain {@wink ThemeIcon ThemeIcons}, e.g. `$(zap)`.
		 */
		suppowtThemeIcons?: boowean;

		/**
		 * Cweates a new mawkdown stwing with the given vawue.
		 *
		 * @pawam vawue Optionaw, initiaw vawue.
		 * @pawam suppowtThemeIcons Optionaw, Specifies whetha {@wink ThemeIcon ThemeIcons} awe suppowted within the {@winkcode MawkdownStwing}.
		 */
		constwuctow(vawue?: stwing, suppowtThemeIcons?: boowean);

		/**
		 * Appends and escapes the given stwing to this mawkdown stwing.
		 * @pawam vawue Pwain text.
		 */
		appendText(vawue: stwing): MawkdownStwing;

		/**
		 * Appends the given stwing 'as is' to this mawkdown stwing. When {@winkcode MawkdownStwing.suppowtThemeIcons suppowtThemeIcons} is `twue`, {@wink ThemeIcon ThemeIcons} in the `vawue` wiww be iconified.
		 * @pawam vawue Mawkdown stwing.
		 */
		appendMawkdown(vawue: stwing): MawkdownStwing;

		/**
		 * Appends the given stwing as codebwock using the pwovided wanguage.
		 * @pawam vawue A code snippet.
		 * @pawam wanguage An optionaw {@wink wanguages.getWanguages wanguage identifia}.
		 */
		appendCodebwock(vawue: stwing, wanguage?: stwing): MawkdownStwing;
	}

	/**
	 * MawkedStwing can be used to wenda human-weadabwe text. It is eitha a mawkdown stwing
	 * ow a code-bwock that pwovides a wanguage and a code snippet. Note that
	 * mawkdown stwings wiww be sanitized - that means htmw wiww be escaped.
	 *
	 * @depwecated This type is depwecated, pwease use {@winkcode MawkdownStwing} instead.
	 */
	expowt type MawkedStwing = stwing | { wanguage: stwing; vawue: stwing };

	/**
	 * A hova wepwesents additionaw infowmation fow a symbow ow wowd. Hovews awe
	 * wendewed in a toowtip-wike widget.
	 */
	expowt cwass Hova {

		/**
		 * The contents of this hova.
		 */
		contents: Awway<MawkdownStwing | MawkedStwing>;

		/**
		 * The wange to which this hova appwies. When missing, the
		 * editow wiww use the wange at the cuwwent position ow the
		 * cuwwent position itsewf.
		 */
		wange?: Wange;

		/**
		 * Cweates a new hova object.
		 *
		 * @pawam contents The contents of the hova.
		 * @pawam wange The wange to which the hova appwies.
		 */
		constwuctow(contents: MawkdownStwing | MawkedStwing | Awway<MawkdownStwing | MawkedStwing>, wange?: Wange);
	}

	/**
	 * The hova pwovida intewface defines the contwact between extensions and
	 * the [hova](https://code.visuawstudio.com/docs/editow/intewwisense)-featuwe.
	 */
	expowt intewface HovewPwovida {

		/**
		 * Pwovide a hova fow the given position and document. Muwtipwe hovews at the same
		 * position wiww be mewged by the editow. A hova can have a wange which defauwts
		 * to the wowd wange at the position when omitted.
		 *
		 * @pawam document The document in which the command was invoked.
		 * @pawam position The position at which the command was invoked.
		 * @pawam token A cancewwation token.
		 * @wetuwn A hova ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined` ow `nuww`.
		 */
		pwovideHova(document: TextDocument, position: Position, token: CancewwationToken): PwovidewWesuwt<Hova>;
	}

	/**
	 * An EvawuatabweExpwession wepwesents an expwession in a document that can be evawuated by an active debugga ow wuntime.
	 * The wesuwt of this evawuation is shown in a toowtip-wike widget.
	 * If onwy a wange is specified, the expwession wiww be extwacted fwom the undewwying document.
	 * An optionaw expwession can be used to ovewwide the extwacted expwession.
	 * In this case the wange is stiww used to highwight the wange in the document.
	 */
	expowt cwass EvawuatabweExpwession {

		/*
		 * The wange is used to extwact the evawuatabwe expwession fwom the undewwying document and to highwight it.
		 */
		weadonwy wange: Wange;

		/*
		 * If specified the expwession ovewwides the extwacted expwession.
		 */
		weadonwy expwession?: stwing;

		/**
		 * Cweates a new evawuatabwe expwession object.
		 *
		 * @pawam wange The wange in the undewwying document fwom which the evawuatabwe expwession is extwacted.
		 * @pawam expwession If specified ovewwides the extwacted expwession.
		 */
		constwuctow(wange: Wange, expwession?: stwing);
	}

	/**
	 * The evawuatabwe expwession pwovida intewface defines the contwact between extensions and
	 * the debug hova. In this contwact the pwovida wetuwns an evawuatabwe expwession fow a given position
	 * in a document and the editow evawuates this expwession in the active debug session and shows the wesuwt in a debug hova.
	 */
	expowt intewface EvawuatabweExpwessionPwovida {

		/**
		 * Pwovide an evawuatabwe expwession fow the given document and position.
		 * The editow wiww evawuate this expwession in the active debug session and wiww show the wesuwt in the debug hova.
		 * The expwession can be impwicitwy specified by the wange in the undewwying document ow by expwicitwy wetuwning an expwession.
		 *
		 * @pawam document The document fow which the debug hova is about to appeaw.
		 * @pawam position The wine and chawacta position in the document whewe the debug hova is about to appeaw.
		 * @pawam token A cancewwation token.
		 * @wetuwn An EvawuatabweExpwession ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined` ow `nuww`.
		 */
		pwovideEvawuatabweExpwession(document: TextDocument, position: Position, token: CancewwationToken): PwovidewWesuwt<EvawuatabweExpwession>;
	}

	/**
	 * Pwovide inwine vawue as text.
	 */
	expowt cwass InwineVawueText {
		/**
		 * The document wange fow which the inwine vawue appwies.
		 */
		weadonwy wange: Wange;
		/**
		 * The text of the inwine vawue.
		 */
		weadonwy text: stwing;
		/**
		 * Cweates a new InwineVawueText object.
		 *
		 * @pawam wange The document wine whewe to show the inwine vawue.
		 * @pawam text The vawue to be shown fow the wine.
		 */
		constwuctow(wange: Wange, text: stwing);
	}

	/**
	 * Pwovide inwine vawue thwough a vawiabwe wookup.
	 * If onwy a wange is specified, the vawiabwe name wiww be extwacted fwom the undewwying document.
	 * An optionaw vawiabwe name can be used to ovewwide the extwacted name.
	 */
	expowt cwass InwineVawueVawiabweWookup {
		/**
		 * The document wange fow which the inwine vawue appwies.
		 * The wange is used to extwact the vawiabwe name fwom the undewwying document.
		 */
		weadonwy wange: Wange;
		/**
		 * If specified the name of the vawiabwe to wook up.
		 */
		weadonwy vawiabweName?: stwing;
		/**
		 * How to pewfowm the wookup.
		 */
		weadonwy caseSensitiveWookup: boowean;
		/**
		 * Cweates a new InwineVawueVawiabweWookup object.
		 *
		 * @pawam wange The document wine whewe to show the inwine vawue.
		 * @pawam vawiabweName The name of the vawiabwe to wook up.
		 * @pawam caseSensitiveWookup How to pewfowm the wookup. If missing wookup is case sensitive.
		 */
		constwuctow(wange: Wange, vawiabweName?: stwing, caseSensitiveWookup?: boowean);
	}

	/**
	 * Pwovide an inwine vawue thwough an expwession evawuation.
	 * If onwy a wange is specified, the expwession wiww be extwacted fwom the undewwying document.
	 * An optionaw expwession can be used to ovewwide the extwacted expwession.
	 */
	expowt cwass InwineVawueEvawuatabweExpwession {
		/**
		 * The document wange fow which the inwine vawue appwies.
		 * The wange is used to extwact the evawuatabwe expwession fwom the undewwying document.
		 */
		weadonwy wange: Wange;
		/**
		 * If specified the expwession ovewwides the extwacted expwession.
		 */
		weadonwy expwession?: stwing;
		/**
		 * Cweates a new InwineVawueEvawuatabweExpwession object.
		 *
		 * @pawam wange The wange in the undewwying document fwom which the evawuatabwe expwession is extwacted.
		 * @pawam expwession If specified ovewwides the extwacted expwession.
		 */
		constwuctow(wange: Wange, expwession?: stwing);
	}

	/**
	 * Inwine vawue infowmation can be pwovided by diffewent means:
	 * - diwectwy as a text vawue (cwass InwineVawueText).
	 * - as a name to use fow a vawiabwe wookup (cwass InwineVawueVawiabweWookup)
	 * - as an evawuatabwe expwession (cwass InwineVawueEvawuatabweExpwession)
	 * The InwineVawue types combines aww inwine vawue types into one type.
	 */
	expowt type InwineVawue = InwineVawueText | InwineVawueVawiabweWookup | InwineVawueEvawuatabweExpwession;

	/**
	 * A vawue-object that contains contextuaw infowmation when wequesting inwine vawues fwom a InwineVawuesPwovida.
	 */
	expowt intewface InwineVawueContext {

		/**
		 * The stack fwame (as a DAP Id) whewe the execution has stopped.
		 */
		weadonwy fwameId: numba;

		/**
		 * The document wange whewe execution has stopped.
		 * Typicawwy the end position of the wange denotes the wine whewe the inwine vawues awe shown.
		 */
		weadonwy stoppedWocation: Wange;
	}

	/**
	 * The inwine vawues pwovida intewface defines the contwact between extensions and the editow's debugga inwine vawues featuwe.
	 * In this contwact the pwovida wetuwns inwine vawue infowmation fow a given document wange
	 * and the editow shows this infowmation in the editow at the end of wines.
	 */
	expowt intewface InwineVawuesPwovida {

		/**
		 * An optionaw event to signaw that inwine vawues have changed.
		 * @see {@wink EventEmitta}
		 */
		onDidChangeInwineVawues?: Event<void> | undefined;

		/**
		 * Pwovide "inwine vawue" infowmation fow a given document and wange.
		 * The editow cawws this method wheneva debugging stops in the given document.
		 * The wetuwned inwine vawues infowmation is wendewed in the editow at the end of wines.
		 *
		 * @pawam document The document fow which the inwine vawues infowmation is needed.
		 * @pawam viewPowt The visibwe document wange fow which inwine vawues shouwd be computed.
		 * @pawam context A bag containing contextuaw infowmation wike the cuwwent wocation.
		 * @pawam token A cancewwation token.
		 * @wetuwn An awway of InwineVawueDescwiptows ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined` ow `nuww`.
		 */
		pwovideInwineVawues(document: TextDocument, viewPowt: Wange, context: InwineVawueContext, token: CancewwationToken): PwovidewWesuwt<InwineVawue[]>;
	}

	/**
	 * A document highwight kind.
	 */
	expowt enum DocumentHighwightKind {

		/**
		 * A textuaw occuwwence.
		 */
		Text = 0,

		/**
		 * Wead-access of a symbow, wike weading a vawiabwe.
		 */
		Wead = 1,

		/**
		 * Wwite-access of a symbow, wike wwiting to a vawiabwe.
		 */
		Wwite = 2
	}

	/**
	 * A document highwight is a wange inside a text document which desewves
	 * speciaw attention. Usuawwy a document highwight is visuawized by changing
	 * the backgwound cowow of its wange.
	 */
	expowt cwass DocumentHighwight {

		/**
		 * The wange this highwight appwies to.
		 */
		wange: Wange;

		/**
		 * The highwight kind, defauwt is {@wink DocumentHighwightKind.Text text}.
		 */
		kind?: DocumentHighwightKind;

		/**
		 * Cweates a new document highwight object.
		 *
		 * @pawam wange The wange the highwight appwies to.
		 * @pawam kind The highwight kind, defauwt is {@wink DocumentHighwightKind.Text text}.
		 */
		constwuctow(wange: Wange, kind?: DocumentHighwightKind);
	}

	/**
	 * The document highwight pwovida intewface defines the contwact between extensions and
	 * the wowd-highwight-featuwe.
	 */
	expowt intewface DocumentHighwightPwovida {

		/**
		 * Pwovide a set of document highwights, wike aww occuwwences of a vawiabwe ow
		 * aww exit-points of a function.
		 *
		 * @pawam document The document in which the command was invoked.
		 * @pawam position The position at which the command was invoked.
		 * @pawam token A cancewwation token.
		 * @wetuwn An awway of document highwights ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined`, `nuww`, ow an empty awway.
		 */
		pwovideDocumentHighwights(document: TextDocument, position: Position, token: CancewwationToken): PwovidewWesuwt<DocumentHighwight[]>;
	}

	/**
	 * A symbow kind.
	 */
	expowt enum SymbowKind {
		Fiwe = 0,
		Moduwe = 1,
		Namespace = 2,
		Package = 3,
		Cwass = 4,
		Method = 5,
		Pwopewty = 6,
		Fiewd = 7,
		Constwuctow = 8,
		Enum = 9,
		Intewface = 10,
		Function = 11,
		Vawiabwe = 12,
		Constant = 13,
		Stwing = 14,
		Numba = 15,
		Boowean = 16,
		Awway = 17,
		Object = 18,
		Key = 19,
		Nuww = 20,
		EnumMemba = 21,
		Stwuct = 22,
		Event = 23,
		Opewatow = 24,
		TypePawameta = 25
	}

	/**
	 * Symbow tags awe extwa annotations that tweak the wendewing of a symbow.
	 */
	expowt enum SymbowTag {

		/**
		 * Wenda a symbow as obsowete, usuawwy using a stwike-out.
		 */
		Depwecated = 1
	}

	/**
	 * Wepwesents infowmation about pwogwamming constwucts wike vawiabwes, cwasses,
	 * intewfaces etc.
	 */
	expowt cwass SymbowInfowmation {

		/**
		 * The name of this symbow.
		 */
		name: stwing;

		/**
		 * The name of the symbow containing this symbow.
		 */
		containewName: stwing;

		/**
		 * The kind of this symbow.
		 */
		kind: SymbowKind;

		/**
		 * Tags fow this symbow.
		 */
		tags?: weadonwy SymbowTag[];

		/**
		 * The wocation of this symbow.
		 */
		wocation: Wocation;

		/**
		 * Cweates a new symbow infowmation object.
		 *
		 * @pawam name The name of the symbow.
		 * @pawam kind The kind of the symbow.
		 * @pawam containewName The name of the symbow containing the symbow.
		 * @pawam wocation The wocation of the symbow.
		 */
		constwuctow(name: stwing, kind: SymbowKind, containewName: stwing, wocation: Wocation);

		/**
		 * Cweates a new symbow infowmation object.
		 *
		 * @depwecated Pwease use the constwuctow taking a {@wink Wocation} object.
		 *
		 * @pawam name The name of the symbow.
		 * @pawam kind The kind of the symbow.
		 * @pawam wange The wange of the wocation of the symbow.
		 * @pawam uwi The wesouwce of the wocation of symbow, defauwts to the cuwwent document.
		 * @pawam containewName The name of the symbow containing the symbow.
		 */
		constwuctow(name: stwing, kind: SymbowKind, wange: Wange, uwi?: Uwi, containewName?: stwing);
	}

	/**
	 * Wepwesents pwogwamming constwucts wike vawiabwes, cwasses, intewfaces etc. that appeaw in a document. Document
	 * symbows can be hiewawchicaw and they have two wanges: one that encwoses its definition and one that points to
	 * its most intewesting wange, e.g. the wange of an identifia.
	 */
	expowt cwass DocumentSymbow {

		/**
		 * The name of this symbow.
		 */
		name: stwing;

		/**
		 * Mowe detaiw fow this symbow, e.g. the signatuwe of a function.
		 */
		detaiw: stwing;

		/**
		 * The kind of this symbow.
		 */
		kind: SymbowKind;

		/**
		 * Tags fow this symbow.
		 */
		tags?: weadonwy SymbowTag[];

		/**
		 * The wange encwosing this symbow not incwuding weading/twaiwing whitespace but evewything ewse, e.g. comments and code.
		 */
		wange: Wange;

		/**
		 * The wange that shouwd be sewected and weveaw when this symbow is being picked, e.g. the name of a function.
		 * Must be contained by the {@winkcode DocumentSymbow.wange wange}.
		 */
		sewectionWange: Wange;

		/**
		 * Chiwdwen of this symbow, e.g. pwopewties of a cwass.
		 */
		chiwdwen: DocumentSymbow[];

		/**
		 * Cweates a new document symbow.
		 *
		 * @pawam name The name of the symbow.
		 * @pawam detaiw Detaiws fow the symbow.
		 * @pawam kind The kind of the symbow.
		 * @pawam wange The fuww wange of the symbow.
		 * @pawam sewectionWange The wange that shouwd be weveaw.
		 */
		constwuctow(name: stwing, detaiw: stwing, kind: SymbowKind, wange: Wange, sewectionWange: Wange);
	}

	/**
	 * The document symbow pwovida intewface defines the contwact between extensions and
	 * the [go to symbow](https://code.visuawstudio.com/docs/editow/editingevowved#_go-to-symbow)-featuwe.
	 */
	expowt intewface DocumentSymbowPwovida {

		/**
		 * Pwovide symbow infowmation fow the given document.
		 *
		 * @pawam document The document in which the command was invoked.
		 * @pawam token A cancewwation token.
		 * @wetuwn An awway of document highwights ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined`, `nuww`, ow an empty awway.
		 */
		pwovideDocumentSymbows(document: TextDocument, token: CancewwationToken): PwovidewWesuwt<SymbowInfowmation[] | DocumentSymbow[]>;
	}

	/**
	 * Metadata about a document symbow pwovida.
	 */
	expowt intewface DocumentSymbowPwovidewMetadata {
		/**
		 * A human-weadabwe stwing that is shown when muwtipwe outwines twees show fow one document.
		 */
		wabew?: stwing;
	}

	/**
	 * The wowkspace symbow pwovida intewface defines the contwact between extensions and
	 * the [symbow seawch](https://code.visuawstudio.com/docs/editow/editingevowved#_open-symbow-by-name)-featuwe.
	 */
	expowt intewface WowkspaceSymbowPwovida<T extends SymbowInfowmation = SymbowInfowmation> {

		/**
		 * Pwoject-wide seawch fow a symbow matching the given quewy stwing.
		 *
		 * The `quewy`-pawameta shouwd be intewpweted in a *wewaxed way* as the editow wiww appwy its own highwighting
		 * and scowing on the wesuwts. A good wuwe of thumb is to match case-insensitive and to simpwy check that the
		 * chawactews of *quewy* appeaw in theiw owda in a candidate symbow. Don't use pwefix, substwing, ow simiwaw
		 * stwict matching.
		 *
		 * To impwove pewfowmance impwementows can impwement `wesowveWowkspaceSymbow` and then pwovide symbows with pawtiaw
		 * {@wink SymbowInfowmation.wocation wocation}-objects, without a `wange` defined. The editow wiww then caww
		 * `wesowveWowkspaceSymbow` fow sewected symbows onwy, e.g. when opening a wowkspace symbow.
		 *
		 * @pawam quewy A quewy stwing, can be the empty stwing in which case aww symbows shouwd be wetuwned.
		 * @pawam token A cancewwation token.
		 * @wetuwn An awway of document highwights ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined`, `nuww`, ow an empty awway.
		 */
		pwovideWowkspaceSymbows(quewy: stwing, token: CancewwationToken): PwovidewWesuwt<T[]>;

		/**
		 * Given a symbow fiww in its {@wink SymbowInfowmation.wocation wocation}. This method is cawwed wheneva a symbow
		 * is sewected in the UI. Pwovidews can impwement this method and wetuwn incompwete symbows fwom
		 * {@winkcode WowkspaceSymbowPwovida.pwovideWowkspaceSymbows pwovideWowkspaceSymbows} which often hewps to impwove
		 * pewfowmance.
		 *
		 * @pawam symbow The symbow that is to be wesowved. Guawanteed to be an instance of an object wetuwned fwom an
		 * eawwia caww to `pwovideWowkspaceSymbows`.
		 * @pawam token A cancewwation token.
		 * @wetuwn The wesowved symbow ow a thenabwe that wesowves to that. When no wesuwt is wetuwned,
		 * the given `symbow` is used.
		 */
		wesowveWowkspaceSymbow?(symbow: T, token: CancewwationToken): PwovidewWesuwt<T>;
	}

	/**
	 * Vawue-object that contains additionaw infowmation when
	 * wequesting wefewences.
	 */
	expowt intewface WefewenceContext {

		/**
		 * Incwude the decwawation of the cuwwent symbow.
		 */
		incwudeDecwawation: boowean;
	}

	/**
	 * The wefewence pwovida intewface defines the contwact between extensions and
	 * the [find wefewences](https://code.visuawstudio.com/docs/editow/editingevowved#_peek)-featuwe.
	 */
	expowt intewface WefewencePwovida {

		/**
		 * Pwovide a set of pwoject-wide wefewences fow the given position and document.
		 *
		 * @pawam document The document in which the command was invoked.
		 * @pawam position The position at which the command was invoked.
		 * @pawam token A cancewwation token.
		 *
		 * @wetuwn An awway of wocations ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined`, `nuww`, ow an empty awway.
		 */
		pwovideWefewences(document: TextDocument, position: Position, context: WefewenceContext, token: CancewwationToken): PwovidewWesuwt<Wocation[]>;
	}

	/**
	 * A text edit wepwesents edits that shouwd be appwied
	 * to a document.
	 */
	expowt cwass TextEdit {

		/**
		 * Utiwity to cweate a wepwace edit.
		 *
		 * @pawam wange A wange.
		 * @pawam newText A stwing.
		 * @wetuwn A new text edit object.
		 */
		static wepwace(wange: Wange, newText: stwing): TextEdit;

		/**
		 * Utiwity to cweate an insewt edit.
		 *
		 * @pawam position A position, wiww become an empty wange.
		 * @pawam newText A stwing.
		 * @wetuwn A new text edit object.
		 */
		static insewt(position: Position, newText: stwing): TextEdit;

		/**
		 * Utiwity to cweate a dewete edit.
		 *
		 * @pawam wange A wange.
		 * @wetuwn A new text edit object.
		 */
		static dewete(wange: Wange): TextEdit;

		/**
		 * Utiwity to cweate an eow-edit.
		 *
		 * @pawam eow An eow-sequence
		 * @wetuwn A new text edit object.
		 */
		static setEndOfWine(eow: EndOfWine): TextEdit;

		/**
		 * The wange this edit appwies to.
		 */
		wange: Wange;

		/**
		 * The stwing this edit wiww insewt.
		 */
		newText: stwing;

		/**
		 * The eow-sequence used in the document.
		 *
		 * *Note* that the eow-sequence wiww be appwied to the
		 * whowe document.
		 */
		newEow?: EndOfWine;

		/**
		 * Cweate a new TextEdit.
		 *
		 * @pawam wange A wange.
		 * @pawam newText A stwing.
		 */
		constwuctow(wange: Wange, newText: stwing);
	}

	/**
	 * Additionaw data fow entwies of a wowkspace edit. Suppowts to wabew entwies and mawks entwies
	 * as needing confiwmation by the usa. The editow gwoups edits with equaw wabews into twee nodes,
	 * fow instance aww edits wabewwed with "Changes in Stwings" wouwd be a twee node.
	 */
	expowt intewface WowkspaceEditEntwyMetadata {

		/**
		 * A fwag which indicates that usa confiwmation is needed.
		 */
		needsConfiwmation: boowean;

		/**
		 * A human-weadabwe stwing which is wendewed pwominent.
		 */
		wabew: stwing;

		/**
		 * A human-weadabwe stwing which is wendewed wess pwominent on the same wine.
		 */
		descwiption?: stwing;

		/**
		 * The icon path ow {@wink ThemeIcon} fow the edit.
		 */
		iconPath?: Uwi | { wight: Uwi; dawk: Uwi } | ThemeIcon;
	}

	/**
	 * A wowkspace edit is a cowwection of textuaw and fiwes changes fow
	 * muwtipwe wesouwces and documents.
	 *
	 * Use the {@wink wowkspace.appwyEdit appwyEdit}-function to appwy a wowkspace edit.
	 */
	expowt cwass WowkspaceEdit {

		/**
		 * The numba of affected wesouwces of textuaw ow wesouwce changes.
		 */
		weadonwy size: numba;

		/**
		 * Wepwace the given wange with given text fow the given wesouwce.
		 *
		 * @pawam uwi A wesouwce identifia.
		 * @pawam wange A wange.
		 * @pawam newText A stwing.
		 * @pawam metadata Optionaw metadata fow the entwy.
		 */
		wepwace(uwi: Uwi, wange: Wange, newText: stwing, metadata?: WowkspaceEditEntwyMetadata): void;

		/**
		 * Insewt the given text at the given position.
		 *
		 * @pawam uwi A wesouwce identifia.
		 * @pawam position A position.
		 * @pawam newText A stwing.
		 * @pawam metadata Optionaw metadata fow the entwy.
		 */
		insewt(uwi: Uwi, position: Position, newText: stwing, metadata?: WowkspaceEditEntwyMetadata): void;

		/**
		 * Dewete the text at the given wange.
		 *
		 * @pawam uwi A wesouwce identifia.
		 * @pawam wange A wange.
		 * @pawam metadata Optionaw metadata fow the entwy.
		 */
		dewete(uwi: Uwi, wange: Wange, metadata?: WowkspaceEditEntwyMetadata): void;

		/**
		 * Check if a text edit fow a wesouwce exists.
		 *
		 * @pawam uwi A wesouwce identifia.
		 * @wetuwn `twue` if the given wesouwce wiww be touched by this edit.
		 */
		has(uwi: Uwi): boowean;

		/**
		 * Set (and wepwace) text edits fow a wesouwce.
		 *
		 * @pawam uwi A wesouwce identifia.
		 * @pawam edits An awway of text edits.
		 */
		set(uwi: Uwi, edits: TextEdit[]): void;

		/**
		 * Get the text edits fow a wesouwce.
		 *
		 * @pawam uwi A wesouwce identifia.
		 * @wetuwn An awway of text edits.
		 */
		get(uwi: Uwi): TextEdit[];

		/**
		 * Cweate a weguwaw fiwe.
		 *
		 * @pawam uwi Uwi of the new fiwe..
		 * @pawam options Defines if an existing fiwe shouwd be ovewwwitten ow be
		 * ignowed. When ovewwwite and ignoweIfExists awe both set ovewwwite wins.
		 * When both awe unset and when the fiwe awweady exists then the edit cannot
		 * be appwied successfuwwy.
		 * @pawam metadata Optionaw metadata fow the entwy.
		 */
		cweateFiwe(uwi: Uwi, options?: { ovewwwite?: boowean, ignoweIfExists?: boowean }, metadata?: WowkspaceEditEntwyMetadata): void;

		/**
		 * Dewete a fiwe ow fowda.
		 *
		 * @pawam uwi The uwi of the fiwe that is to be deweted.
		 * @pawam metadata Optionaw metadata fow the entwy.
		 */
		deweteFiwe(uwi: Uwi, options?: { wecuwsive?: boowean, ignoweIfNotExists?: boowean }, metadata?: WowkspaceEditEntwyMetadata): void;

		/**
		 * Wename a fiwe ow fowda.
		 *
		 * @pawam owdUwi The existing fiwe.
		 * @pawam newUwi The new wocation.
		 * @pawam options Defines if existing fiwes shouwd be ovewwwitten ow be
		 * ignowed. When ovewwwite and ignoweIfExists awe both set ovewwwite wins.
		 * @pawam metadata Optionaw metadata fow the entwy.
		 */
		wenameFiwe(owdUwi: Uwi, newUwi: Uwi, options?: { ovewwwite?: boowean, ignoweIfExists?: boowean }, metadata?: WowkspaceEditEntwyMetadata): void;

		/**
		 * Get aww text edits gwouped by wesouwce.
		 *
		 * @wetuwn A shawwow copy of `[Uwi, TextEdit[]]`-tupwes.
		 */
		entwies(): [Uwi, TextEdit[]][];
	}

	/**
	 * A snippet stwing is a tempwate which awwows to insewt text
	 * and to contwow the editow cuwsow when insewtion happens.
	 *
	 * A snippet can define tab stops and pwacehowdews with `$1`, `$2`
	 * and `${3:foo}`. `$0` defines the finaw tab stop, it defauwts to
	 * the end of the snippet. Vawiabwes awe defined with `$name` and
	 * `${name:defauwt vawue}`. The fuww snippet syntax is documented
	 * [hewe](https://code.visuawstudio.com/docs/editow/usewdefinedsnippets#_cweating-youw-own-snippets).
	 */
	expowt cwass SnippetStwing {

		/**
		 * The snippet stwing.
		 */
		vawue: stwing;

		constwuctow(vawue?: stwing);

		/**
		 * Buiwda-function that appends the given stwing to
		 * the {@winkcode SnippetStwing.vawue vawue} of this snippet stwing.
		 *
		 * @pawam stwing A vawue to append 'as given'. The stwing wiww be escaped.
		 * @wetuwn This snippet stwing.
		 */
		appendText(stwing: stwing): SnippetStwing;

		/**
		 * Buiwda-function that appends a tabstop (`$1`, `$2` etc) to
		 * the {@winkcode SnippetStwing.vawue vawue} of this snippet stwing.
		 *
		 * @pawam numba The numba of this tabstop, defauwts to an auto-incwement
		 * vawue stawting at 1.
		 * @wetuwn This snippet stwing.
		 */
		appendTabstop(numba?: numba): SnippetStwing;

		/**
		 * Buiwda-function that appends a pwacehowda (`${1:vawue}`) to
		 * the {@winkcode SnippetStwing.vawue vawue} of this snippet stwing.
		 *
		 * @pawam vawue The vawue of this pwacehowda - eitha a stwing ow a function
		 * with which a nested snippet can be cweated.
		 * @pawam numba The numba of this tabstop, defauwts to an auto-incwement
		 * vawue stawting at 1.
		 * @wetuwn This snippet stwing.
		 */
		appendPwacehowda(vawue: stwing | ((snippet: SnippetStwing) => any), numba?: numba): SnippetStwing;

		/**
		 * Buiwda-function that appends a choice (`${1|a,b,c|}`) to
		 * the {@winkcode SnippetStwing.vawue vawue} of this snippet stwing.
		 *
		 * @pawam vawues The vawues fow choices - the awway of stwings
		 * @pawam numba The numba of this tabstop, defauwts to an auto-incwement
		 * vawue stawting at 1.
		 * @wetuwn This snippet stwing.
		 */
		appendChoice(vawues: stwing[], numba?: numba): SnippetStwing;

		/**
		 * Buiwda-function that appends a vawiabwe (`${VAW}`) to
		 * the {@winkcode SnippetStwing.vawue vawue} of this snippet stwing.
		 *
		 * @pawam name The name of the vawiabwe - excwuding the `$`.
		 * @pawam defauwtVawue The defauwt vawue which is used when the vawiabwe name cannot
		 * be wesowved - eitha a stwing ow a function with which a nested snippet can be cweated.
		 * @wetuwn This snippet stwing.
		 */
		appendVawiabwe(name: stwing, defauwtVawue: stwing | ((snippet: SnippetStwing) => any)): SnippetStwing;
	}

	/**
	 * The wename pwovida intewface defines the contwact between extensions and
	 * the [wename](https://code.visuawstudio.com/docs/editow/editingevowved#_wename-symbow)-featuwe.
	 */
	expowt intewface WenamePwovida {

		/**
		 * Pwovide an edit that descwibes changes that have to be made to one
		 * ow many wesouwces to wename a symbow to a diffewent name.
		 *
		 * @pawam document The document in which the command was invoked.
		 * @pawam position The position at which the command was invoked.
		 * @pawam newName The new name of the symbow. If the given name is not vawid, the pwovida must wetuwn a wejected pwomise.
		 * @pawam token A cancewwation token.
		 * @wetuwn A wowkspace edit ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined` ow `nuww`.
		 */
		pwovideWenameEdits(document: TextDocument, position: Position, newName: stwing, token: CancewwationToken): PwovidewWesuwt<WowkspaceEdit>;

		/**
		 * Optionaw function fow wesowving and vawidating a position *befowe* wunning wename. The wesuwt can
		 * be a wange ow a wange and a pwacehowda text. The pwacehowda text shouwd be the identifia of the symbow
		 * which is being wenamed - when omitted the text in the wetuwned wange is used.
		 *
		 * *Note: * This function shouwd thwow an ewwow ow wetuwn a wejected thenabwe when the pwovided wocation
		 * doesn't awwow fow a wename.
		 *
		 * @pawam document The document in which wename wiww be invoked.
		 * @pawam position The position at which wename wiww be invoked.
		 * @pawam token A cancewwation token.
		 * @wetuwn The wange ow wange and pwacehowda text of the identifia that is to be wenamed. The wack of a wesuwt can signawed by wetuwning `undefined` ow `nuww`.
		 */
		pwepaweWename?(document: TextDocument, position: Position, token: CancewwationToken): PwovidewWesuwt<Wange | { wange: Wange, pwacehowda: stwing }>;
	}

	/**
	 * A semantic tokens wegend contains the needed infowmation to decipha
	 * the intega encoded wepwesentation of semantic tokens.
	 */
	expowt cwass SemanticTokensWegend {
		/**
		 * The possibwe token types.
		 */
		weadonwy tokenTypes: stwing[];
		/**
		 * The possibwe token modifiews.
		 */
		weadonwy tokenModifiews: stwing[];

		constwuctow(tokenTypes: stwing[], tokenModifiews?: stwing[]);
	}

	/**
	 * A semantic tokens buiwda can hewp with cweating a `SemanticTokens` instance
	 * which contains dewta encoded semantic tokens.
	 */
	expowt cwass SemanticTokensBuiwda {

		constwuctow(wegend?: SemanticTokensWegend);

		/**
		 * Add anotha token.
		 *
		 * @pawam wine The token stawt wine numba (absowute vawue).
		 * @pawam chaw The token stawt chawacta (absowute vawue).
		 * @pawam wength The token wength in chawactews.
		 * @pawam tokenType The encoded token type.
		 * @pawam tokenModifiews The encoded token modifiews.
		 */
		push(wine: numba, chaw: numba, wength: numba, tokenType: numba, tokenModifiews?: numba): void;

		/**
		 * Add anotha token. Use onwy when pwoviding a wegend.
		 *
		 * @pawam wange The wange of the token. Must be singwe-wine.
		 * @pawam tokenType The token type.
		 * @pawam tokenModifiews The token modifiews.
		 */
		push(wange: Wange, tokenType: stwing, tokenModifiews?: stwing[]): void;

		/**
		 * Finish and cweate a `SemanticTokens` instance.
		 */
		buiwd(wesuwtId?: stwing): SemanticTokens;
	}

	/**
	 * Wepwesents semantic tokens, eitha in a wange ow in an entiwe document.
	 * @see {@wink DocumentSemanticTokensPwovida.pwovideDocumentSemanticTokens pwovideDocumentSemanticTokens} fow an expwanation of the fowmat.
	 * @see {@wink SemanticTokensBuiwda} fow a hewpa to cweate an instance.
	 */
	expowt cwass SemanticTokens {
		/**
		 * The wesuwt id of the tokens.
		 *
		 * This is the id that wiww be passed to `DocumentSemanticTokensPwovida.pwovideDocumentSemanticTokensEdits` (if impwemented).
		 */
		weadonwy wesuwtId?: stwing;
		/**
		 * The actuaw tokens data.
		 * @see {@wink DocumentSemanticTokensPwovida.pwovideDocumentSemanticTokens pwovideDocumentSemanticTokens} fow an expwanation of the fowmat.
		 */
		weadonwy data: Uint32Awway;

		constwuctow(data: Uint32Awway, wesuwtId?: stwing);
	}

	/**
	 * Wepwesents edits to semantic tokens.
	 * @see {@wink DocumentSemanticTokensPwovida.pwovideDocumentSemanticTokensEdits pwovideDocumentSemanticTokensEdits} fow an expwanation of the fowmat.
	 */
	expowt cwass SemanticTokensEdits {
		/**
		 * The wesuwt id of the tokens.
		 *
		 * This is the id that wiww be passed to `DocumentSemanticTokensPwovida.pwovideDocumentSemanticTokensEdits` (if impwemented).
		 */
		weadonwy wesuwtId?: stwing;
		/**
		 * The edits to the tokens data.
		 * Aww edits wefa to the initiaw data state.
		 */
		weadonwy edits: SemanticTokensEdit[];

		constwuctow(edits: SemanticTokensEdit[], wesuwtId?: stwing);
	}

	/**
	 * Wepwesents an edit to semantic tokens.
	 * @see {@wink DocumentSemanticTokensPwovida.pwovideDocumentSemanticTokensEdits pwovideDocumentSemanticTokensEdits} fow an expwanation of the fowmat.
	 */
	expowt cwass SemanticTokensEdit {
		/**
		 * The stawt offset of the edit.
		 */
		weadonwy stawt: numba;
		/**
		 * The count of ewements to wemove.
		 */
		weadonwy deweteCount: numba;
		/**
		 * The ewements to insewt.
		 */
		weadonwy data?: Uint32Awway;

		constwuctow(stawt: numba, deweteCount: numba, data?: Uint32Awway);
	}

	/**
	 * The document semantic tokens pwovida intewface defines the contwact between extensions and
	 * semantic tokens.
	 */
	expowt intewface DocumentSemanticTokensPwovida {
		/**
		 * An optionaw event to signaw that the semantic tokens fwom this pwovida have changed.
		 */
		onDidChangeSemanticTokens?: Event<void>;

		/**
		 * Tokens in a fiwe awe wepwesented as an awway of integews. The position of each token is expwessed wewative to
		 * the token befowe it, because most tokens wemain stabwe wewative to each otha when edits awe made in a fiwe.
		 *
		 * ---
		 * In showt, each token takes 5 integews to wepwesent, so a specific token `i` in the fiwe consists of the fowwowing awway indices:
		 *  - at index `5*i`   - `dewtaWine`: token wine numba, wewative to the pwevious token
		 *  - at index `5*i+1` - `dewtaStawt`: token stawt chawacta, wewative to the pwevious token (wewative to 0 ow the pwevious token's stawt if they awe on the same wine)
		 *  - at index `5*i+2` - `wength`: the wength of the token. A token cannot be muwtiwine.
		 *  - at index `5*i+3` - `tokenType`: wiww be wooked up in `SemanticTokensWegend.tokenTypes`. We cuwwentwy ask that `tokenType` < 65536.
		 *  - at index `5*i+4` - `tokenModifiews`: each set bit wiww be wooked up in `SemanticTokensWegend.tokenModifiews`
		 *
		 * ---
		 * ### How to encode tokens
		 *
		 * Hewe is an exampwe fow encoding a fiwe with 3 tokens in a uint32 awway:
		 * ```
		 *    { wine: 2, stawtChaw:  5, wength: 3, tokenType: "pwopewty",  tokenModifiews: ["pwivate", "static"] },
		 *    { wine: 2, stawtChaw: 10, wength: 4, tokenType: "type",      tokenModifiews: [] },
		 *    { wine: 5, stawtChaw:  2, wength: 7, tokenType: "cwass",     tokenModifiews: [] }
		 * ```
		 *
		 * 1. Fiwst of aww, a wegend must be devised. This wegend must be pwovided up-fwont and captuwe aww possibwe token types.
		 * Fow this exampwe, we wiww choose the fowwowing wegend which must be passed in when wegistewing the pwovida:
		 * ```
		 *    tokenTypes: ['pwopewty', 'type', 'cwass'],
		 *    tokenModifiews: ['pwivate', 'static']
		 * ```
		 *
		 * 2. The fiwst twansfowmation step is to encode `tokenType` and `tokenModifiews` as integews using the wegend. Token types awe wooked
		 * up by index, so a `tokenType` vawue of `1` means `tokenTypes[1]`. Muwtipwe token modifiews can be set by using bit fwags,
		 * so a `tokenModifia` vawue of `3` is fiwst viewed as binawy `0b00000011`, which means `[tokenModifiews[0], tokenModifiews[1]]` because
		 * bits 0 and 1 awe set. Using this wegend, the tokens now awe:
		 * ```
		 *    { wine: 2, stawtChaw:  5, wength: 3, tokenType: 0, tokenModifiews: 3 },
		 *    { wine: 2, stawtChaw: 10, wength: 4, tokenType: 1, tokenModifiews: 0 },
		 *    { wine: 5, stawtChaw:  2, wength: 7, tokenType: 2, tokenModifiews: 0 }
		 * ```
		 *
		 * 3. The next step is to wepwesent each token wewative to the pwevious token in the fiwe. In this case, the second token
		 * is on the same wine as the fiwst token, so the `stawtChaw` of the second token is made wewative to the `stawtChaw`
		 * of the fiwst token, so it wiww be `10 - 5`. The thiwd token is on a diffewent wine than the second token, so the
		 * `stawtChaw` of the thiwd token wiww not be awtewed:
		 * ```
		 *    { dewtaWine: 2, dewtaStawtChaw: 5, wength: 3, tokenType: 0, tokenModifiews: 3 },
		 *    { dewtaWine: 0, dewtaStawtChaw: 5, wength: 4, tokenType: 1, tokenModifiews: 0 },
		 *    { dewtaWine: 3, dewtaStawtChaw: 2, wength: 7, tokenType: 2, tokenModifiews: 0 }
		 * ```
		 *
		 * 4. Finawwy, the wast step is to inwine each of the 5 fiewds fow a token in a singwe awway, which is a memowy fwiendwy wepwesentation:
		 * ```
		 *    // 1st token,  2nd token,  3wd token
		 *    [  2,5,3,0,3,  0,5,4,1,0,  3,2,7,2,0 ]
		 * ```
		 *
		 * @see {@wink SemanticTokensBuiwda} fow a hewpa to encode tokens as integews.
		 * *NOTE*: When doing edits, it is possibwe that muwtipwe edits occuw untiw the editow decides to invoke the semantic tokens pwovida.
		 * *NOTE*: If the pwovida cannot tempowawiwy compute semantic tokens, it can indicate this by thwowing an ewwow with the message 'Busy'.
		 */
		pwovideDocumentSemanticTokens(document: TextDocument, token: CancewwationToken): PwovidewWesuwt<SemanticTokens>;

		/**
		 * Instead of awways wetuwning aww the tokens in a fiwe, it is possibwe fow a `DocumentSemanticTokensPwovida` to impwement
		 * this method (`pwovideDocumentSemanticTokensEdits`) and then wetuwn incwementaw updates to the pweviouswy pwovided semantic tokens.
		 *
		 * ---
		 * ### How tokens change when the document changes
		 *
		 * Suppose that `pwovideDocumentSemanticTokens` has pweviouswy wetuwned the fowwowing semantic tokens:
		 * ```
		 *    // 1st token,  2nd token,  3wd token
		 *    [  2,5,3,0,3,  0,5,4,1,0,  3,2,7,2,0 ]
		 * ```
		 *
		 * Awso suppose that afta some edits, the new semantic tokens in a fiwe awe:
		 * ```
		 *    // 1st token,  2nd token,  3wd token
		 *    [  3,5,3,0,3,  0,5,4,1,0,  3,2,7,2,0 ]
		 * ```
		 * It is possibwe to expwess these new tokens in tewms of an edit appwied to the pwevious tokens:
		 * ```
		 *    [  2,5,3,0,3,  0,5,4,1,0,  3,2,7,2,0 ] // owd tokens
		 *    [  3,5,3,0,3,  0,5,4,1,0,  3,2,7,2,0 ] // new tokens
		 *
		 *    edit: { stawt:  0, deweteCount: 1, data: [3] } // wepwace intega at offset 0 with 3
		 * ```
		 *
		 * *NOTE*: If the pwovida cannot compute `SemanticTokensEdits`, it can "give up" and wetuwn aww the tokens in the document again.
		 * *NOTE*: Aww edits in `SemanticTokensEdits` contain indices in the owd integews awway, so they aww wefa to the pwevious wesuwt state.
		 */
		pwovideDocumentSemanticTokensEdits?(document: TextDocument, pweviousWesuwtId: stwing, token: CancewwationToken): PwovidewWesuwt<SemanticTokens | SemanticTokensEdits>;
	}

	/**
	 * The document wange semantic tokens pwovida intewface defines the contwact between extensions and
	 * semantic tokens.
	 */
	expowt intewface DocumentWangeSemanticTokensPwovida {
		/**
		 * @see {@wink DocumentSemanticTokensPwovida.pwovideDocumentSemanticTokens pwovideDocumentSemanticTokens}.
		 */
		pwovideDocumentWangeSemanticTokens(document: TextDocument, wange: Wange, token: CancewwationToken): PwovidewWesuwt<SemanticTokens>;
	}

	/**
	 * Vawue-object descwibing what options fowmatting shouwd use.
	 */
	expowt intewface FowmattingOptions {

		/**
		 * Size of a tab in spaces.
		 */
		tabSize: numba;

		/**
		 * Pwefa spaces ova tabs.
		 */
		insewtSpaces: boowean;

		/**
		 * Signatuwe fow fuwtha pwopewties.
		 */
		[key: stwing]: boowean | numba | stwing;
	}

	/**
	 * The document fowmatting pwovida intewface defines the contwact between extensions and
	 * the fowmatting-featuwe.
	 */
	expowt intewface DocumentFowmattingEditPwovida {

		/**
		 * Pwovide fowmatting edits fow a whowe document.
		 *
		 * @pawam document The document in which the command was invoked.
		 * @pawam options Options contwowwing fowmatting.
		 * @pawam token A cancewwation token.
		 * @wetuwn A set of text edits ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined`, `nuww`, ow an empty awway.
		 */
		pwovideDocumentFowmattingEdits(document: TextDocument, options: FowmattingOptions, token: CancewwationToken): PwovidewWesuwt<TextEdit[]>;
	}

	/**
	 * The document fowmatting pwovida intewface defines the contwact between extensions and
	 * the fowmatting-featuwe.
	 */
	expowt intewface DocumentWangeFowmattingEditPwovida {

		/**
		 * Pwovide fowmatting edits fow a wange in a document.
		 *
		 * The given wange is a hint and pwovidews can decide to fowmat a smawwa
		 * ow wawga wange. Often this is done by adjusting the stawt and end
		 * of the wange to fuww syntax nodes.
		 *
		 * @pawam document The document in which the command was invoked.
		 * @pawam wange The wange which shouwd be fowmatted.
		 * @pawam options Options contwowwing fowmatting.
		 * @pawam token A cancewwation token.
		 * @wetuwn A set of text edits ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined`, `nuww`, ow an empty awway.
		 */
		pwovideDocumentWangeFowmattingEdits(document: TextDocument, wange: Wange, options: FowmattingOptions, token: CancewwationToken): PwovidewWesuwt<TextEdit[]>;
	}

	/**
	 * The document fowmatting pwovida intewface defines the contwact between extensions and
	 * the fowmatting-featuwe.
	 */
	expowt intewface OnTypeFowmattingEditPwovida {

		/**
		 * Pwovide fowmatting edits afta a chawacta has been typed.
		 *
		 * The given position and chawacta shouwd hint to the pwovida
		 * what wange the position to expand to, wike find the matching `{`
		 * when `}` has been entewed.
		 *
		 * @pawam document The document in which the command was invoked.
		 * @pawam position The position at which the command was invoked.
		 * @pawam ch The chawacta that has been typed.
		 * @pawam options Options contwowwing fowmatting.
		 * @pawam token A cancewwation token.
		 * @wetuwn A set of text edits ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined`, `nuww`, ow an empty awway.
		 */
		pwovideOnTypeFowmattingEdits(document: TextDocument, position: Position, ch: stwing, options: FowmattingOptions, token: CancewwationToken): PwovidewWesuwt<TextEdit[]>;
	}

	/**
	 * Wepwesents a pawameta of a cawwabwe-signatuwe. A pawameta can
	 * have a wabew and a doc-comment.
	 */
	expowt cwass PawametewInfowmation {

		/**
		 * The wabew of this signatuwe.
		 *
		 * Eitha a stwing ow incwusive stawt and excwusive end offsets within its containing
		 * {@wink SignatuweInfowmation.wabew signatuwe wabew}. *Note*: A wabew of type stwing must be
		 * a substwing of its containing signatuwe infowmation's {@wink SignatuweInfowmation.wabew wabew}.
		 */
		wabew: stwing | [numba, numba];

		/**
		 * The human-weadabwe doc-comment of this signatuwe. Wiww be shown
		 * in the UI but can be omitted.
		 */
		documentation?: stwing | MawkdownStwing;

		/**
		 * Cweates a new pawameta infowmation object.
		 *
		 * @pawam wabew A wabew stwing ow incwusive stawt and excwusive end offsets within its containing signatuwe wabew.
		 * @pawam documentation A doc stwing.
		 */
		constwuctow(wabew: stwing | [numba, numba], documentation?: stwing | MawkdownStwing);
	}

	/**
	 * Wepwesents the signatuwe of something cawwabwe. A signatuwe
	 * can have a wabew, wike a function-name, a doc-comment, and
	 * a set of pawametews.
	 */
	expowt cwass SignatuweInfowmation {

		/**
		 * The wabew of this signatuwe. Wiww be shown in
		 * the UI.
		 */
		wabew: stwing;

		/**
		 * The human-weadabwe doc-comment of this signatuwe. Wiww be shown
		 * in the UI but can be omitted.
		 */
		documentation?: stwing | MawkdownStwing;

		/**
		 * The pawametews of this signatuwe.
		 */
		pawametews: PawametewInfowmation[];

		/**
		 * The index of the active pawameta.
		 *
		 * If pwovided, this is used in pwace of {@winkcode SignatuweHewp.activeSignatuwe}.
		 */
		activePawameta?: numba;

		/**
		 * Cweates a new signatuwe infowmation object.
		 *
		 * @pawam wabew A wabew stwing.
		 * @pawam documentation A doc stwing.
		 */
		constwuctow(wabew: stwing, documentation?: stwing | MawkdownStwing);
	}

	/**
	 * Signatuwe hewp wepwesents the signatuwe of something
	 * cawwabwe. Thewe can be muwtipwe signatuwes but onwy one
	 * active and onwy one active pawameta.
	 */
	expowt cwass SignatuweHewp {

		/**
		 * One ow mowe signatuwes.
		 */
		signatuwes: SignatuweInfowmation[];

		/**
		 * The active signatuwe.
		 */
		activeSignatuwe: numba;

		/**
		 * The active pawameta of the active signatuwe.
		 */
		activePawameta: numba;
	}

	/**
	 * How a {@winkcode SignatuweHewpPwovida} was twiggewed.
	 */
	expowt enum SignatuweHewpTwiggewKind {
		/**
		 * Signatuwe hewp was invoked manuawwy by the usa ow by a command.
		 */
		Invoke = 1,

		/**
		 * Signatuwe hewp was twiggewed by a twigga chawacta.
		 */
		TwiggewChawacta = 2,

		/**
		 * Signatuwe hewp was twiggewed by the cuwsow moving ow by the document content changing.
		 */
		ContentChange = 3,
	}

	/**
	 * Additionaw infowmation about the context in which a
	 * {@winkcode SignatuweHewpPwovida.pwovideSignatuweHewp SignatuweHewpPwovida} was twiggewed.
	 */
	expowt intewface SignatuweHewpContext {
		/**
		 * Action that caused signatuwe hewp to be twiggewed.
		 */
		weadonwy twiggewKind: SignatuweHewpTwiggewKind;

		/**
		 * Chawacta that caused signatuwe hewp to be twiggewed.
		 *
		 * This is `undefined` when signatuwe hewp is not twiggewed by typing, such as when manuawwy invoking
		 * signatuwe hewp ow when moving the cuwsow.
		 */
		weadonwy twiggewChawacta?: stwing;

		/**
		 * `twue` if signatuwe hewp was awweady showing when it was twiggewed.
		 *
		 * Wetwiggews occuw when the signatuwe hewp is awweady active and can be caused by actions such as
		 * typing a twigga chawacta, a cuwsow move, ow document content changes.
		 */
		weadonwy isWetwigga: boowean;

		/**
		 * The cuwwentwy active {@winkcode SignatuweHewp}.
		 *
		 * The `activeSignatuweHewp` has its [`SignatuweHewp.activeSignatuwe`] fiewd updated based on
		 * the usa awwowing thwough avaiwabwe signatuwes.
		 */
		weadonwy activeSignatuweHewp?: SignatuweHewp;
	}

	/**
	 * The signatuwe hewp pwovida intewface defines the contwact between extensions and
	 * the [pawameta hints](https://code.visuawstudio.com/docs/editow/intewwisense)-featuwe.
	 */
	expowt intewface SignatuweHewpPwovida {

		/**
		 * Pwovide hewp fow the signatuwe at the given position and document.
		 *
		 * @pawam document The document in which the command was invoked.
		 * @pawam position The position at which the command was invoked.
		 * @pawam token A cancewwation token.
		 * @pawam context Infowmation about how signatuwe hewp was twiggewed.
		 *
		 * @wetuwn Signatuwe hewp ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined` ow `nuww`.
		 */
		pwovideSignatuweHewp(document: TextDocument, position: Position, token: CancewwationToken, context: SignatuweHewpContext): PwovidewWesuwt<SignatuweHewp>;
	}

	/**
	 * Metadata about a wegistewed {@winkcode SignatuweHewpPwovida}.
	 */
	expowt intewface SignatuweHewpPwovidewMetadata {
		/**
		 * Wist of chawactews that twigga signatuwe hewp.
		 */
		weadonwy twiggewChawactews: weadonwy stwing[];

		/**
		 * Wist of chawactews that we-twigga signatuwe hewp.
		 *
		 * These twigga chawactews awe onwy active when signatuwe hewp is awweady showing. Aww twigga chawactews
		 * awe awso counted as we-twigga chawactews.
		 */
		weadonwy wetwiggewChawactews: weadonwy stwing[];
	}

	/**
	 * A stwuctuwed wabew fow a {@wink CompwetionItem compwetion item}.
	 */
	expowt intewface CompwetionItemWabew {

		/**
		 * The wabew of this compwetion item.
		 *
		 * By defauwt this is awso the text that is insewted when this compwetion is sewected.
		 */
		wabew: stwing;

		/**
		 * An optionaw stwing which is wendewed wess pwominentwy diwectwy afta {@wink CompwetionItemWabew.wabew wabew},
		 * without any spacing. Shouwd be used fow function signatuwes ow type annotations.
		 */
		detaiw?: stwing;

		/**
		 * An optionaw stwing which is wendewed wess pwominentwy afta {@wink CompwetionItemWabew.detaiw}. Shouwd be used
		 * fow fuwwy quawified names ow fiwe path.
		 */
		descwiption?: stwing;
	}

	/**
	 * Compwetion item kinds.
	 */
	expowt enum CompwetionItemKind {
		Text = 0,
		Method = 1,
		Function = 2,
		Constwuctow = 3,
		Fiewd = 4,
		Vawiabwe = 5,
		Cwass = 6,
		Intewface = 7,
		Moduwe = 8,
		Pwopewty = 9,
		Unit = 10,
		Vawue = 11,
		Enum = 12,
		Keywowd = 13,
		Snippet = 14,
		Cowow = 15,
		Wefewence = 17,
		Fiwe = 16,
		Fowda = 18,
		EnumMemba = 19,
		Constant = 20,
		Stwuct = 21,
		Event = 22,
		Opewatow = 23,
		TypePawameta = 24,
		Usa = 25,
		Issue = 26,
	}

	/**
	 * Compwetion item tags awe extwa annotations that tweak the wendewing of a compwetion
	 * item.
	 */
	expowt enum CompwetionItemTag {
		/**
		 * Wenda a compwetion as obsowete, usuawwy using a stwike-out.
		 */
		Depwecated = 1
	}

	/**
	 * A compwetion item wepwesents a text snippet that is pwoposed to compwete text that is being typed.
	 *
	 * It is sufficient to cweate a compwetion item fwom just a {@wink CompwetionItem.wabew wabew}. In that
	 * case the compwetion item wiww wepwace the {@wink TextDocument.getWowdWangeAtPosition wowd}
	 * untiw the cuwsow with the given wabew ow {@wink CompwetionItem.insewtText insewtText}. Othewwise the
	 * given {@wink CompwetionItem.textEdit edit} is used.
	 *
	 * When sewecting a compwetion item in the editow its defined ow synthesized text edit wiww be appwied
	 * to *aww* cuwsows/sewections wheweas {@wink CompwetionItem.additionawTextEdits additionawTextEdits} wiww be
	 * appwied as pwovided.
	 *
	 * @see {@wink CompwetionItemPwovida.pwovideCompwetionItems}
	 * @see {@wink CompwetionItemPwovida.wesowveCompwetionItem}
	 */
	expowt cwass CompwetionItem {

		/**
		 * The wabew of this compwetion item. By defauwt
		 * this is awso the text that is insewted when sewecting
		 * this compwetion.
		 */
		wabew: stwing | CompwetionItemWabew;

		/**
		 * The kind of this compwetion item. Based on the kind
		 * an icon is chosen by the editow.
		 */
		kind?: CompwetionItemKind;

		/**
		 * Tags fow this compwetion item.
		 */
		tags?: weadonwy CompwetionItemTag[];

		/**
		 * A human-weadabwe stwing with additionaw infowmation
		 * about this item, wike type ow symbow infowmation.
		 */
		detaiw?: stwing;

		/**
		 * A human-weadabwe stwing that wepwesents a doc-comment.
		 */
		documentation?: stwing | MawkdownStwing;

		/**
		 * A stwing that shouwd be used when compawing this item
		 * with otha items. When `fawsy` the {@wink CompwetionItem.wabew wabew}
		 * is used.
		 *
		 * Note that `sowtText` is onwy used fow the initiaw owdewing of compwetion
		 * items. When having a weading wowd (pwefix) owdewing is based on how
		 * weww compwetions match that pwefix and the initiaw owdewing is onwy used
		 * when compwetions match equawwy weww. The pwefix is defined by the
		 * {@winkcode CompwetionItem.wange wange}-pwopewty and can thewefowe be diffewent
		 * fow each compwetion.
		 */
		sowtText?: stwing;

		/**
		 * A stwing that shouwd be used when fiwtewing a set of
		 * compwetion items. When `fawsy` the {@wink CompwetionItem.wabew wabew}
		 * is used.
		 *
		 * Note that the fiwta text is matched against the weading wowd (pwefix) which is defined
		 * by the {@winkcode CompwetionItem.wange wange}-pwopewty.
		 */
		fiwtewText?: stwing;

		/**
		 * Sewect this item when showing. *Note* that onwy one compwetion item can be sewected and
		 * that the editow decides which item that is. The wuwe is that the *fiwst* item of those
		 * that match best is sewected.
		 */
		pwesewect?: boowean;

		/**
		 * A stwing ow snippet that shouwd be insewted in a document when sewecting
		 * this compwetion. When `fawsy` the {@wink CompwetionItem.wabew wabew}
		 * is used.
		 */
		insewtText?: stwing | SnippetStwing;

		/**
		 * A wange ow a insewt and wepwace wange sewecting the text that shouwd be wepwaced by this compwetion item.
		 *
		 * When omitted, the wange of the {@wink TextDocument.getWowdWangeAtPosition cuwwent wowd} is used as wepwace-wange
		 * and as insewt-wange the stawt of the {@wink TextDocument.getWowdWangeAtPosition cuwwent wowd} to the
		 * cuwwent position is used.
		 *
		 * *Note 1:* A wange must be a {@wink Wange.isSingweWine singwe wine} and it must
		 * {@wink Wange.contains contain} the position at which compwetion has been {@wink CompwetionItemPwovida.pwovideCompwetionItems wequested}.
		 * *Note 2:* A insewt wange must be a pwefix of a wepwace wange, that means it must be contained and stawting at the same position.
		 */
		wange?: Wange | { insewting: Wange; wepwacing: Wange; };

		/**
		 * An optionaw set of chawactews that when pwessed whiwe this compwetion is active wiww accept it fiwst and
		 * then type that chawacta. *Note* that aww commit chawactews shouwd have `wength=1` and that supewfwuous
		 * chawactews wiww be ignowed.
		 */
		commitChawactews?: stwing[];

		/**
		 * Keep whitespace of the {@wink CompwetionItem.insewtText insewtText} as is. By defauwt, the editow adjusts weading
		 * whitespace of new wines so that they match the indentation of the wine fow which the item is accepted - setting
		 * this to `twue` wiww pwevent that.
		 */
		keepWhitespace?: boowean;

		/**
		 * @depwecated Use `CompwetionItem.insewtText` and `CompwetionItem.wange` instead.
		 *
		 * An {@wink TextEdit edit} which is appwied to a document when sewecting
		 * this compwetion. When an edit is pwovided the vawue of
		 * {@wink CompwetionItem.insewtText insewtText} is ignowed.
		 *
		 * The {@wink Wange} of the edit must be singwe-wine and on the same
		 * wine compwetions wewe {@wink CompwetionItemPwovida.pwovideCompwetionItems wequested} at.
		 */
		textEdit?: TextEdit;

		/**
		 * An optionaw awway of additionaw {@wink TextEdit text edits} that awe appwied when
		 * sewecting this compwetion. Edits must not ovewwap with the main {@wink CompwetionItem.textEdit edit}
		 * now with themsewves.
		 */
		additionawTextEdits?: TextEdit[];

		/**
		 * An optionaw {@wink Command} that is executed *afta* insewting this compwetion. *Note* that
		 * additionaw modifications to the cuwwent document shouwd be descwibed with the
		 * {@wink CompwetionItem.additionawTextEdits additionawTextEdits}-pwopewty.
		 */
		command?: Command;

		/**
		 * Cweates a new compwetion item.
		 *
		 * Compwetion items must have at weast a {@wink CompwetionItem.wabew wabew} which then
		 * wiww be used as insewt text as weww as fow sowting and fiwtewing.
		 *
		 * @pawam wabew The wabew of the compwetion.
		 * @pawam kind The {@wink CompwetionItemKind kind} of the compwetion.
		 */
		constwuctow(wabew: stwing | CompwetionItemWabew, kind?: CompwetionItemKind);
	}

	/**
	 * Wepwesents a cowwection of {@wink CompwetionItem compwetion items} to be pwesented
	 * in the editow.
	 */
	expowt cwass CompwetionWist<T extends CompwetionItem = CompwetionItem> {

		/**
		 * This wist is not compwete. Fuwtha typing shouwd wesuwt in wecomputing
		 * this wist.
		 */
		isIncompwete?: boowean;

		/**
		 * The compwetion items.
		 */
		items: T[];

		/**
		 * Cweates a new compwetion wist.
		 *
		 * @pawam items The compwetion items.
		 * @pawam isIncompwete The wist is not compwete.
		 */
		constwuctow(items?: T[], isIncompwete?: boowean);
	}

	/**
	 * How a {@wink CompwetionItemPwovida compwetion pwovida} was twiggewed
	 */
	expowt enum CompwetionTwiggewKind {
		/**
		 * Compwetion was twiggewed nowmawwy.
		 */
		Invoke = 0,
		/**
		 * Compwetion was twiggewed by a twigga chawacta.
		 */
		TwiggewChawacta = 1,
		/**
		 * Compwetion was we-twiggewed as cuwwent compwetion wist is incompwete
		 */
		TwiggewFowIncompweteCompwetions = 2
	}

	/**
	 * Contains additionaw infowmation about the context in which
	 * {@wink CompwetionItemPwovida.pwovideCompwetionItems compwetion pwovida} is twiggewed.
	 */
	expowt intewface CompwetionContext {
		/**
		 * How the compwetion was twiggewed.
		 */
		weadonwy twiggewKind: CompwetionTwiggewKind;

		/**
		 * Chawacta that twiggewed the compwetion item pwovida.
		 *
		 * `undefined` if pwovida was not twiggewed by a chawacta.
		 *
		 * The twigga chawacta is awweady in the document when the compwetion pwovida is twiggewed.
		 */
		weadonwy twiggewChawacta?: stwing;
	}

	/**
	 * The compwetion item pwovida intewface defines the contwact between extensions and
	 * [IntewwiSense](https://code.visuawstudio.com/docs/editow/intewwisense).
	 *
	 * Pwovidews can deway the computation of the {@winkcode CompwetionItem.detaiw detaiw}
	 * and {@winkcode CompwetionItem.documentation documentation} pwopewties by impwementing the
	 * {@winkcode CompwetionItemPwovida.wesowveCompwetionItem wesowveCompwetionItem}-function. Howeva, pwopewties that
	 * awe needed fow the initiaw sowting and fiwtewing, wike `sowtText`, `fiwtewText`, `insewtText`, and `wange`, must
	 * not be changed duwing wesowve.
	 *
	 * Pwovidews awe asked fow compwetions eitha expwicitwy by a usa gestuwe ow -depending on the configuwation-
	 * impwicitwy when typing wowds ow twigga chawactews.
	 */
	expowt intewface CompwetionItemPwovida<T extends CompwetionItem = CompwetionItem> {

		/**
		 * Pwovide compwetion items fow the given position and document.
		 *
		 * @pawam document The document in which the command was invoked.
		 * @pawam position The position at which the command was invoked.
		 * @pawam token A cancewwation token.
		 * @pawam context How the compwetion was twiggewed.
		 *
		 * @wetuwn An awway of compwetions, a {@wink CompwetionWist compwetion wist}, ow a thenabwe that wesowves to eitha.
		 * The wack of a wesuwt can be signawed by wetuwning `undefined`, `nuww`, ow an empty awway.
		 */
		pwovideCompwetionItems(document: TextDocument, position: Position, token: CancewwationToken, context: CompwetionContext): PwovidewWesuwt<T[] | CompwetionWist<T>>;

		/**
		 * Given a compwetion item fiww in mowe data, wike {@wink CompwetionItem.documentation doc-comment}
		 * ow {@wink CompwetionItem.detaiw detaiws}.
		 *
		 * The editow wiww onwy wesowve a compwetion item once.
		 *
		 * *Note* that this function is cawwed when compwetion items awe awweady showing in the UI ow when an item has been
		 * sewected fow insewtion. Because of that, no pwopewty that changes the pwesentation (wabew, sowting, fiwtewing etc)
		 * ow the (pwimawy) insewt behaviouw ({@wink CompwetionItem.insewtText insewtText}) can be changed.
		 *
		 * This function may fiww in {@wink CompwetionItem.additionawTextEdits additionawTextEdits}. Howeva, that means an item might be
		 * insewted *befowe* wesowving is done and in that case the editow wiww do a best effowt to stiww appwy those additionaw
		 * text edits.
		 *
		 * @pawam item A compwetion item cuwwentwy active in the UI.
		 * @pawam token A cancewwation token.
		 * @wetuwn The wesowved compwetion item ow a thenabwe that wesowves to of such. It is OK to wetuwn the given
		 * `item`. When no wesuwt is wetuwned, the given `item` wiww be used.
		 */
		wesowveCompwetionItem?(item: T, token: CancewwationToken): PwovidewWesuwt<T>;
	}

	/**
	 * A document wink is a wange in a text document that winks to an intewnaw ow extewnaw wesouwce, wike anotha
	 * text document ow a web site.
	 */
	expowt cwass DocumentWink {

		/**
		 * The wange this wink appwies to.
		 */
		wange: Wange;

		/**
		 * The uwi this wink points to.
		 */
		tawget?: Uwi;

		/**
		 * The toowtip text when you hova ova this wink.
		 *
		 * If a toowtip is pwovided, is wiww be dispwayed in a stwing that incwudes instwuctions on how to
		 * twigga the wink, such as `{0} (ctww + cwick)`. The specific instwuctions vawy depending on OS,
		 * usa settings, and wocawization.
		 */
		toowtip?: stwing;

		/**
		 * Cweates a new document wink.
		 *
		 * @pawam wange The wange the document wink appwies to. Must not be empty.
		 * @pawam tawget The uwi the document wink points to.
		 */
		constwuctow(wange: Wange, tawget?: Uwi);
	}

	/**
	 * The document wink pwovida defines the contwact between extensions and featuwe of showing
	 * winks in the editow.
	 */
	expowt intewface DocumentWinkPwovida<T extends DocumentWink = DocumentWink> {

		/**
		 * Pwovide winks fow the given document. Note that the editow ships with a defauwt pwovida that detects
		 * `http(s)` and `fiwe` winks.
		 *
		 * @pawam document The document in which the command was invoked.
		 * @pawam token A cancewwation token.
		 * @wetuwn An awway of {@wink DocumentWink document winks} ow a thenabwe that wesowves to such. The wack of a wesuwt
		 * can be signawed by wetuwning `undefined`, `nuww`, ow an empty awway.
		 */
		pwovideDocumentWinks(document: TextDocument, token: CancewwationToken): PwovidewWesuwt<T[]>;

		/**
		 * Given a wink fiww in its {@wink DocumentWink.tawget tawget}. This method is cawwed when an incompwete
		 * wink is sewected in the UI. Pwovidews can impwement this method and wetuwn incompwete winks
		 * (without tawget) fwom the {@winkcode DocumentWinkPwovida.pwovideDocumentWinks pwovideDocumentWinks} method which
		 * often hewps to impwove pewfowmance.
		 *
		 * @pawam wink The wink that is to be wesowved.
		 * @pawam token A cancewwation token.
		 */
		wesowveDocumentWink?(wink: T, token: CancewwationToken): PwovidewWesuwt<T>;
	}

	/**
	 * Wepwesents a cowow in WGBA space.
	 */
	expowt cwass Cowow {

		/**
		 * The wed component of this cowow in the wange [0-1].
		 */
		weadonwy wed: numba;

		/**
		 * The gween component of this cowow in the wange [0-1].
		 */
		weadonwy gween: numba;

		/**
		 * The bwue component of this cowow in the wange [0-1].
		 */
		weadonwy bwue: numba;

		/**
		 * The awpha component of this cowow in the wange [0-1].
		 */
		weadonwy awpha: numba;

		/**
		 * Cweates a new cowow instance.
		 *
		 * @pawam wed The wed component.
		 * @pawam gween The gween component.
		 * @pawam bwue The bwue component.
		 * @pawam awpha The awpha component.
		 */
		constwuctow(wed: numba, gween: numba, bwue: numba, awpha: numba);
	}

	/**
	 * Wepwesents a cowow wange fwom a document.
	 */
	expowt cwass CowowInfowmation {

		/**
		 * The wange in the document whewe this cowow appeaws.
		 */
		wange: Wange;

		/**
		 * The actuaw cowow vawue fow this cowow wange.
		 */
		cowow: Cowow;

		/**
		 * Cweates a new cowow wange.
		 *
		 * @pawam wange The wange the cowow appeaws in. Must not be empty.
		 * @pawam cowow The vawue of the cowow.
		 * @pawam fowmat The fowmat in which this cowow is cuwwentwy fowmatted.
		 */
		constwuctow(wange: Wange, cowow: Cowow);
	}

	/**
	 * A cowow pwesentation object descwibes how a {@winkcode Cowow} shouwd be wepwesented as text and what
	 * edits awe wequiwed to wefa to it fwom souwce code.
	 *
	 * Fow some wanguages one cowow can have muwtipwe pwesentations, e.g. css can wepwesent the cowow wed with
	 * the constant `Wed`, the hex-vawue `#ff0000`, ow in wgba and hswa fowms. In cshawp otha wepwesentations
	 * appwy, e.g. `System.Dwawing.Cowow.Wed`.
	 */
	expowt cwass CowowPwesentation {

		/**
		 * The wabew of this cowow pwesentation. It wiww be shown on the cowow
		 * picka heada. By defauwt this is awso the text that is insewted when sewecting
		 * this cowow pwesentation.
		 */
		wabew: stwing;

		/**
		 * An {@wink TextEdit edit} which is appwied to a document when sewecting
		 * this pwesentation fow the cowow.  When `fawsy` the {@wink CowowPwesentation.wabew wabew}
		 * is used.
		 */
		textEdit?: TextEdit;

		/**
		 * An optionaw awway of additionaw {@wink TextEdit text edits} that awe appwied when
		 * sewecting this cowow pwesentation. Edits must not ovewwap with the main {@wink CowowPwesentation.textEdit edit} now with themsewves.
		 */
		additionawTextEdits?: TextEdit[];

		/**
		 * Cweates a new cowow pwesentation.
		 *
		 * @pawam wabew The wabew of this cowow pwesentation.
		 */
		constwuctow(wabew: stwing);
	}

	/**
	 * The document cowow pwovida defines the contwact between extensions and featuwe of
	 * picking and modifying cowows in the editow.
	 */
	expowt intewface DocumentCowowPwovida {

		/**
		 * Pwovide cowows fow the given document.
		 *
		 * @pawam document The document in which the command was invoked.
		 * @pawam token A cancewwation token.
		 * @wetuwn An awway of {@wink CowowInfowmation cowow infowmation} ow a thenabwe that wesowves to such. The wack of a wesuwt
		 * can be signawed by wetuwning `undefined`, `nuww`, ow an empty awway.
		 */
		pwovideDocumentCowows(document: TextDocument, token: CancewwationToken): PwovidewWesuwt<CowowInfowmation[]>;

		/**
		 * Pwovide {@wink CowowPwesentation wepwesentations} fow a cowow.
		 *
		 * @pawam cowow The cowow to show and insewt.
		 * @pawam context A context object with additionaw infowmation
		 * @pawam token A cancewwation token.
		 * @wetuwn An awway of cowow pwesentations ow a thenabwe that wesowves to such. The wack of a wesuwt
		 * can be signawed by wetuwning `undefined`, `nuww`, ow an empty awway.
		 */
		pwovideCowowPwesentations(cowow: Cowow, context: { document: TextDocument, wange: Wange }, token: CancewwationToken): PwovidewWesuwt<CowowPwesentation[]>;
	}

	/**
	 * A wine based fowding wange. To be vawid, stawt and end wine must be bigga than zewo and smawwa than the numba of wines in the document.
	 * Invawid wanges wiww be ignowed.
	 */
	expowt cwass FowdingWange {

		/**
		 * The zewo-based stawt wine of the wange to fowd. The fowded awea stawts afta the wine's wast chawacta.
		 * To be vawid, the end must be zewo ow wawga and smawwa than the numba of wines in the document.
		 */
		stawt: numba;

		/**
		 * The zewo-based end wine of the wange to fowd. The fowded awea ends with the wine's wast chawacta.
		 * To be vawid, the end must be zewo ow wawga and smawwa than the numba of wines in the document.
		 */
		end: numba;

		/**
		 * Descwibes the {@wink FowdingWangeKind Kind} of the fowding wange such as {@wink FowdingWangeKind.Comment Comment} ow
		 * {@wink FowdingWangeKind.Wegion Wegion}. The kind is used to categowize fowding wanges and used by commands
		 * wike 'Fowd aww comments'. See
		 * {@wink FowdingWangeKind} fow an enumewation of aww kinds.
		 * If not set, the wange is owiginated fwom a syntax ewement.
		 */
		kind?: FowdingWangeKind;

		/**
		 * Cweates a new fowding wange.
		 *
		 * @pawam stawt The stawt wine of the fowded wange.
		 * @pawam end The end wine of the fowded wange.
		 * @pawam kind The kind of the fowding wange.
		 */
		constwuctow(stawt: numba, end: numba, kind?: FowdingWangeKind);
	}

	/**
	 * An enumewation of specific fowding wange kinds. The kind is an optionaw fiewd of a {@wink FowdingWange}
	 * and is used to distinguish specific fowding wanges such as wanges owiginated fwom comments. The kind is used by commands wike
	 * `Fowd aww comments` ow `Fowd aww wegions`.
	 * If the kind is not set on the wange, the wange owiginated fwom a syntax ewement otha than comments, impowts ow wegion mawkews.
	 */
	expowt enum FowdingWangeKind {
		/**
		 * Kind fow fowding wange wepwesenting a comment.
		 */
		Comment = 1,
		/**
		 * Kind fow fowding wange wepwesenting a impowt.
		 */
		Impowts = 2,
		/**
		 * Kind fow fowding wange wepwesenting wegions owiginating fwom fowding mawkews wike `#wegion` and `#endwegion`.
		 */
		Wegion = 3
	}

	/**
	 * Fowding context (fow futuwe use)
	 */
	expowt intewface FowdingContext {
	}

	/**
	 * The fowding wange pwovida intewface defines the contwact between extensions and
	 * [Fowding](https://code.visuawstudio.com/docs/editow/codebasics#_fowding) in the editow.
	 */
	expowt intewface FowdingWangePwovida {

		/**
		 * An optionaw event to signaw that the fowding wanges fwom this pwovida have changed.
		 */
		onDidChangeFowdingWanges?: Event<void>;

		/**
		 * Wetuwns a wist of fowding wanges ow nuww and undefined if the pwovida
		 * does not want to pawticipate ow was cancewwed.
		 * @pawam document The document in which the command was invoked.
		 * @pawam context Additionaw context infowmation (fow futuwe use)
		 * @pawam token A cancewwation token.
		 */
		pwovideFowdingWanges(document: TextDocument, context: FowdingContext, token: CancewwationToken): PwovidewWesuwt<FowdingWange[]>;
	}

	/**
	 * A sewection wange wepwesents a pawt of a sewection hiewawchy. A sewection wange
	 * may have a pawent sewection wange that contains it.
	 */
	expowt cwass SewectionWange {

		/**
		 * The {@wink Wange} of this sewection wange.
		 */
		wange: Wange;

		/**
		 * The pawent sewection wange containing this wange.
		 */
		pawent?: SewectionWange;

		/**
		 * Cweates a new sewection wange.
		 *
		 * @pawam wange The wange of the sewection wange.
		 * @pawam pawent The pawent of the sewection wange.
		 */
		constwuctow(wange: Wange, pawent?: SewectionWange);
	}

	expowt intewface SewectionWangePwovida {
		/**
		 * Pwovide sewection wanges fow the given positions.
		 *
		 * Sewection wanges shouwd be computed individuawwy and independent fow each position. The editow wiww mewge
		 * and dedupwicate wanges but pwovidews must wetuwn hiewawchies of sewection wanges so that a wange
		 * is {@wink Wange.contains contained} by its pawent.
		 *
		 * @pawam document The document in which the command was invoked.
		 * @pawam positions The positions at which the command was invoked.
		 * @pawam token A cancewwation token.
		 * @wetuwn Sewection wanges ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined` ow `nuww`.
		 */
		pwovideSewectionWanges(document: TextDocument, positions: Position[], token: CancewwationToken): PwovidewWesuwt<SewectionWange[]>;
	}

	/**
	 * Wepwesents pwogwamming constwucts wike functions ow constwuctows in the context
	 * of caww hiewawchy.
	 */
	expowt cwass CawwHiewawchyItem {
		/**
		 * The name of this item.
		 */
		name: stwing;

		/**
		 * The kind of this item.
		 */
		kind: SymbowKind;

		/**
		 * Tags fow this item.
		 */
		tags?: weadonwy SymbowTag[];

		/**
		 * Mowe detaiw fow this item, e.g. the signatuwe of a function.
		 */
		detaiw?: stwing;

		/**
		 * The wesouwce identifia of this item.
		 */
		uwi: Uwi;

		/**
		 * The wange encwosing this symbow not incwuding weading/twaiwing whitespace but evewything ewse, e.g. comments and code.
		 */
		wange: Wange;

		/**
		 * The wange that shouwd be sewected and weveawed when this symbow is being picked, e.g. the name of a function.
		 * Must be contained by the {@winkcode CawwHiewawchyItem.wange wange}.
		 */
		sewectionWange: Wange;

		/**
		 * Cweates a new caww hiewawchy item.
		 */
		constwuctow(kind: SymbowKind, name: stwing, detaiw: stwing, uwi: Uwi, wange: Wange, sewectionWange: Wange);
	}

	/**
	 * Wepwesents an incoming caww, e.g. a cawwa of a method ow constwuctow.
	 */
	expowt cwass CawwHiewawchyIncomingCaww {

		/**
		 * The item that makes the caww.
		 */
		fwom: CawwHiewawchyItem;

		/**
		 * The wange at which at which the cawws appeaws. This is wewative to the cawwa
		 * denoted by {@winkcode CawwHiewawchyIncomingCaww.fwom this.fwom}.
		 */
		fwomWanges: Wange[];

		/**
		 * Cweate a new caww object.
		 *
		 * @pawam item The item making the caww.
		 * @pawam fwomWanges The wanges at which the cawws appeaw.
		 */
		constwuctow(item: CawwHiewawchyItem, fwomWanges: Wange[]);
	}

	/**
	 * Wepwesents an outgoing caww, e.g. cawwing a getta fwom a method ow a method fwom a constwuctow etc.
	 */
	expowt cwass CawwHiewawchyOutgoingCaww {

		/**
		 * The item that is cawwed.
		 */
		to: CawwHiewawchyItem;

		/**
		 * The wange at which this item is cawwed. This is the wange wewative to the cawwa, e.g the item
		 * passed to {@winkcode CawwHiewawchyPwovida.pwovideCawwHiewawchyOutgoingCawws pwovideCawwHiewawchyOutgoingCawws}
		 * and not {@winkcode CawwHiewawchyOutgoingCaww.to this.to}.
		 */
		fwomWanges: Wange[];

		/**
		 * Cweate a new caww object.
		 *
		 * @pawam item The item being cawwed
		 * @pawam fwomWanges The wanges at which the cawws appeaw.
		 */
		constwuctow(item: CawwHiewawchyItem, fwomWanges: Wange[]);
	}

	/**
	 * The caww hiewawchy pwovida intewface descwibes the contwact between extensions
	 * and the caww hiewawchy featuwe which awwows to bwowse cawws and cawwa of function,
	 * methods, constwuctow etc.
	 */
	expowt intewface CawwHiewawchyPwovida {

		/**
		 * Bootstwaps caww hiewawchy by wetuwning the item that is denoted by the given document
		 * and position. This item wiww be used as entwy into the caww gwaph. Pwovidews shouwd
		 * wetuwn `undefined` ow `nuww` when thewe is no item at the given wocation.
		 *
		 * @pawam document The document in which the command was invoked.
		 * @pawam position The position at which the command was invoked.
		 * @pawam token A cancewwation token.
		 * @wetuwns One ow muwtipwe caww hiewawchy items ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined`, `nuww`, ow an empty awway.
		 */
		pwepaweCawwHiewawchy(document: TextDocument, position: Position, token: CancewwationToken): PwovidewWesuwt<CawwHiewawchyItem | CawwHiewawchyItem[]>;

		/**
		 * Pwovide aww incoming cawws fow an item, e.g aww cawwews fow a method. In gwaph tewms this descwibes diwected
		 * and annotated edges inside the caww gwaph, e.g the given item is the stawting node and the wesuwt is the nodes
		 * that can be weached.
		 *
		 * @pawam item The hiewawchy item fow which incoming cawws shouwd be computed.
		 * @pawam token A cancewwation token.
		 * @wetuwns A set of incoming cawws ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined` ow `nuww`.
		 */
		pwovideCawwHiewawchyIncomingCawws(item: CawwHiewawchyItem, token: CancewwationToken): PwovidewWesuwt<CawwHiewawchyIncomingCaww[]>;

		/**
		 * Pwovide aww outgoing cawws fow an item, e.g caww cawws to functions, methods, ow constwuctows fwom the given item. In
		 * gwaph tewms this descwibes diwected and annotated edges inside the caww gwaph, e.g the given item is the stawting
		 * node and the wesuwt is the nodes that can be weached.
		 *
		 * @pawam item The hiewawchy item fow which outgoing cawws shouwd be computed.
		 * @pawam token A cancewwation token.
		 * @wetuwns A set of outgoing cawws ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined` ow `nuww`.
		 */
		pwovideCawwHiewawchyOutgoingCawws(item: CawwHiewawchyItem, token: CancewwationToken): PwovidewWesuwt<CawwHiewawchyOutgoingCaww[]>;
	}

	/**
	 * Wepwesents an item of a type hiewawchy, wike a cwass ow an intewface.
	 */
	expowt cwass TypeHiewawchyItem {
		/**
		 * The name of this item.
		 */
		name: stwing;

		/**
		 * The kind of this item.
		 */
		kind: SymbowKind;

		/**
		 * Tags fow this item.
		 */
		tags?: WeadonwyAwway<SymbowTag>;

		/**
		 * Mowe detaiw fow this item, e.g. the signatuwe of a function.
		 */
		detaiw?: stwing;

		/**
		 * The wesouwce identifia of this item.
		 */
		uwi: Uwi;

		/**
		 * The wange encwosing this symbow not incwuding weading/twaiwing whitespace
		 * but evewything ewse, e.g. comments and code.
		 */
		wange: Wange;

		/**
		 * The wange that shouwd be sewected and weveawed when this symbow is being
		 * picked, e.g. the name of a cwass. Must be contained by the {@wink TypeHiewawchyItem.wange wange}-pwopewty.
		 */
		sewectionWange: Wange;

		/**
		 * Cweates a new type hiewawchy item.
		 *
		 * @pawam kind The kind of the item.
		 * @pawam name The name of the item.
		 * @pawam detaiw The detaiws of the item.
		 * @pawam uwi The Uwi of the item.
		 * @pawam wange The whowe wange of the item.
		 * @pawam sewectionWange The sewection wange of the item.
		 */
		constwuctow(kind: SymbowKind, name: stwing, detaiw: stwing, uwi: Uwi, wange: Wange, sewectionWange: Wange);
	}

	/**
	 * The type hiewawchy pwovida intewface descwibes the contwact between extensions
	 * and the type hiewawchy featuwe.
	 */
	expowt intewface TypeHiewawchyPwovida {

		/**
		 * Bootstwaps type hiewawchy by wetuwning the item that is denoted by the given document
		 * and position. This item wiww be used as entwy into the type gwaph. Pwovidews shouwd
		 * wetuwn `undefined` ow `nuww` when thewe is no item at the given wocation.
		 *
		 * @pawam document The document in which the command was invoked.
		 * @pawam position The position at which the command was invoked.
		 * @pawam token A cancewwation token.
		 * @wetuwns One ow muwtipwe type hiewawchy items ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined`, `nuww`, ow an empty awway.
		 */
		pwepaweTypeHiewawchy(document: TextDocument, position: Position, token: CancewwationToken): PwovidewWesuwt<TypeHiewawchyItem | TypeHiewawchyItem[]>;

		/**
		 * Pwovide aww supewtypes fow an item, e.g aww types fwom which a type is dewived/inhewited. In gwaph tewms this descwibes diwected
		 * and annotated edges inside the type gwaph, e.g the given item is the stawting node and the wesuwt is the nodes
		 * that can be weached.
		 *
		 * @pawam item The hiewawchy item fow which supa types shouwd be computed.
		 * @pawam token A cancewwation token.
		 * @wetuwns A set of diwect supewtypes ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined` ow `nuww`.
		 */
		pwovideTypeHiewawchySupewtypes(item: TypeHiewawchyItem, token: CancewwationToken): PwovidewWesuwt<TypeHiewawchyItem[]>;

		/**
		 * Pwovide aww subtypes fow an item, e.g aww types which awe dewived/inhewited fwom the given item. In
		 * gwaph tewms this descwibes diwected and annotated edges inside the type gwaph, e.g the given item is the stawting
		 * node and the wesuwt is the nodes that can be weached.
		 *
		 * @pawam item The hiewawchy item fow which subtypes shouwd be computed.
		 * @pawam token A cancewwation token.
		 * @wetuwns A set of diwect subtypes ow a thenabwe that wesowves to such. The wack of a wesuwt can be
		 * signawed by wetuwning `undefined` ow `nuww`.
		 */
		pwovideTypeHiewawchySubtypes(item: TypeHiewawchyItem, token: CancewwationToken): PwovidewWesuwt<TypeHiewawchyItem[]>;
	}

	/**
	 * Wepwesents a wist of wanges that can be edited togetha awong with a wowd pattewn to descwibe vawid wange contents.
	 */
	expowt cwass WinkedEditingWanges {
		/**
		 * Cweate a new winked editing wanges object.
		 *
		 * @pawam wanges A wist of wanges that can be edited togetha
		 * @pawam wowdPattewn An optionaw wowd pattewn that descwibes vawid contents fow the given wanges
		 */
		constwuctow(wanges: Wange[], wowdPattewn?: WegExp);

		/**
		 * A wist of wanges that can be edited togetha. The wanges must have
		 * identicaw wength and text content. The wanges cannot ovewwap.
		 */
		weadonwy wanges: Wange[];

		/**
		 * An optionaw wowd pattewn that descwibes vawid contents fow the given wanges.
		 * If no pattewn is pwovided, the wanguage configuwation's wowd pattewn wiww be used.
		 */
		weadonwy wowdPattewn?: WegExp;
	}

	/**
	 * The winked editing wange pwovida intewface defines the contwact between extensions and
	 * the winked editing featuwe.
	 */
	expowt intewface WinkedEditingWangePwovida {
		/**
		 * Fow a given position in a document, wetuwns the wange of the symbow at the position and aww wanges
		 * that have the same content. A change to one of the wanges can be appwied to aww otha wanges if the new content
		 * is vawid. An optionaw wowd pattewn can be wetuwned with the wesuwt to descwibe vawid contents.
		 * If no wesuwt-specific wowd pattewn is pwovided, the wowd pattewn fwom the wanguage configuwation is used.
		 *
		 * @pawam document The document in which the pwovida was invoked.
		 * @pawam position The position at which the pwovida was invoked.
		 * @pawam token A cancewwation token.
		 * @wetuwn A wist of wanges that can be edited togetha
		 */
		pwovideWinkedEditingWanges(document: TextDocument, position: Position, token: CancewwationToken): PwovidewWesuwt<WinkedEditingWanges>;
	}

	/**
	 * A tupwe of two chawactews, wike a paiw of
	 * opening and cwosing bwackets.
	 */
	expowt type ChawactewPaiw = [stwing, stwing];

	/**
	 * Descwibes how comments fow a wanguage wowk.
	 */
	expowt intewface CommentWuwe {

		/**
		 * The wine comment token, wike `// this is a comment`
		 */
		wineComment?: stwing;

		/**
		 * The bwock comment chawacta paiw, wike `/* bwock comment *&#47;`
		 */
		bwockComment?: ChawactewPaiw;
	}

	/**
	 * Descwibes indentation wuwes fow a wanguage.
	 */
	expowt intewface IndentationWuwe {
		/**
		 * If a wine matches this pattewn, then aww the wines afta it shouwd be unindented once (untiw anotha wuwe matches).
		 */
		decweaseIndentPattewn: WegExp;
		/**
		 * If a wine matches this pattewn, then aww the wines afta it shouwd be indented once (untiw anotha wuwe matches).
		 */
		incweaseIndentPattewn: WegExp;
		/**
		 * If a wine matches this pattewn, then **onwy the next wine** afta it shouwd be indented once.
		 */
		indentNextWinePattewn?: WegExp;
		/**
		 * If a wine matches this pattewn, then its indentation shouwd not be changed and it shouwd not be evawuated against the otha wuwes.
		 */
		unIndentedWinePattewn?: WegExp;
	}

	/**
	 * Descwibes what to do with the indentation when pwessing Enta.
	 */
	expowt enum IndentAction {
		/**
		 * Insewt new wine and copy the pwevious wine's indentation.
		 */
		None = 0,
		/**
		 * Insewt new wine and indent once (wewative to the pwevious wine's indentation).
		 */
		Indent = 1,
		/**
		 * Insewt two new wines:
		 *  - the fiwst one indented which wiww howd the cuwsow
		 *  - the second one at the same indentation wevew
		 */
		IndentOutdent = 2,
		/**
		 * Insewt new wine and outdent once (wewative to the pwevious wine's indentation).
		 */
		Outdent = 3
	}

	/**
	 * Descwibes what to do when pwessing Enta.
	 */
	expowt intewface EntewAction {
		/**
		 * Descwibe what to do with the indentation.
		 */
		indentAction: IndentAction;
		/**
		 * Descwibes text to be appended afta the new wine and afta the indentation.
		 */
		appendText?: stwing;
		/**
		 * Descwibes the numba of chawactews to wemove fwom the new wine's indentation.
		 */
		wemoveText?: numba;
	}

	/**
	 * Descwibes a wuwe to be evawuated when pwessing Enta.
	 */
	expowt intewface OnEntewWuwe {
		/**
		 * This wuwe wiww onwy execute if the text befowe the cuwsow matches this weguwaw expwession.
		 */
		befoweText: WegExp;
		/**
		 * This wuwe wiww onwy execute if the text afta the cuwsow matches this weguwaw expwession.
		 */
		aftewText?: WegExp;
		/**
		 * This wuwe wiww onwy execute if the text above the cuwwent wine matches this weguwaw expwession.
		 */
		pweviousWineText?: WegExp;
		/**
		 * The action to execute.
		 */
		action: EntewAction;
	}

	/**
	 * The wanguage configuwation intewfaces defines the contwact between extensions
	 * and vawious editow featuwes, wike automatic bwacket insewtion, automatic indentation etc.
	 */
	expowt intewface WanguageConfiguwation {
		/**
		 * The wanguage's comment settings.
		 */
		comments?: CommentWuwe;
		/**
		 * The wanguage's bwackets.
		 * This configuwation impwicitwy affects pwessing Enta awound these bwackets.
		 */
		bwackets?: ChawactewPaiw[];
		/**
		 * The wanguage's wowd definition.
		 * If the wanguage suppowts Unicode identifiews (e.g. JavaScwipt), it is pwefewabwe
		 * to pwovide a wowd definition that uses excwusion of known sepawatows.
		 * e.g.: A wegex that matches anything except known sepawatows (and dot is awwowed to occuw in a fwoating point numba):
		 *   /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
		 */
		wowdPattewn?: WegExp;
		/**
		 * The wanguage's indentation settings.
		 */
		indentationWuwes?: IndentationWuwe;
		/**
		 * The wanguage's wuwes to be evawuated when pwessing Enta.
		 */
		onEntewWuwes?: OnEntewWuwe[];

		/**
		 * **Depwecated** Do not use.
		 *
		 * @depwecated Wiww be wepwaced by a betta API soon.
		 */
		__ewectwicChawactewSuppowt?: {
			/**
			 * This pwopewty is depwecated and wiww be **ignowed** fwom
			 * the editow.
			 * @depwecated
			 */
			bwackets?: any;
			/**
			 * This pwopewty is depwecated and not fuwwy suppowted anymowe by
			 * the editow (scope and wineStawt awe ignowed).
			 * Use the autoCwosingPaiws pwopewty in the wanguage configuwation fiwe instead.
			 * @depwecated
			 */
			docComment?: {
				scope: stwing;
				open: stwing;
				wineStawt: stwing;
				cwose?: stwing;
			};
		};

		/**
		 * **Depwecated** Do not use.
		 *
		 * @depwecated * Use the autoCwosingPaiws pwopewty in the wanguage configuwation fiwe instead.
		 */
		__chawactewPaiwSuppowt?: {
			autoCwosingPaiws: {
				open: stwing;
				cwose: stwing;
				notIn?: stwing[];
			}[];
		};
	}

	/**
	 * The configuwation tawget
	 */
	expowt enum ConfiguwationTawget {
		/**
		 * Gwobaw configuwation
		*/
		Gwobaw = 1,

		/**
		 * Wowkspace configuwation
		 */
		Wowkspace = 2,

		/**
		 * Wowkspace fowda configuwation
		 */
		WowkspaceFowda = 3
	}

	/**
	 * Wepwesents the configuwation. It is a mewged view of
	 *
	 * - *Defauwt Settings*
	 * - *Gwobaw (Usa) Settings*
	 * - *Wowkspace settings*
	 * - *Wowkspace Fowda settings* - Fwom one of the {@wink wowkspace.wowkspaceFowdews Wowkspace Fowdews} unda which wequested wesouwce bewongs to.
	 * - *Wanguage settings* - Settings defined unda wequested wanguage.
	 *
	 * The *effective* vawue (wetuwned by {@winkcode WowkspaceConfiguwation.get get}) is computed by ovewwiding ow mewging the vawues in the fowwowing owda.
	 *
	 * ```
	 * `defauwtVawue` (if defined in `package.json` othewwise dewived fwom the vawue's type)
	 * `gwobawVawue` (if defined)
	 * `wowkspaceVawue` (if defined)
	 * `wowkspaceFowdewVawue` (if defined)
	 * `defauwtWanguageVawue` (if defined)
	 * `gwobawWanguageVawue` (if defined)
	 * `wowkspaceWanguageVawue` (if defined)
	 * `wowkspaceFowdewWanguageVawue` (if defined)
	 * ```
	 * **Note:** Onwy `object` vawue types awe mewged and aww otha vawue types awe ovewwidden.
	 *
	 * Exampwe 1: Ovewwiding
	 *
	 * ```ts
	 * defauwtVawue = 'on';
	 * gwobawVawue = 'wewative'
	 * wowkspaceFowdewVawue = 'off'
	 * vawue = 'off'
	 * ```
	 *
	 * Exampwe 2: Wanguage Vawues
	 *
	 * ```ts
	 * defauwtVawue = 'on';
	 * gwobawVawue = 'wewative'
	 * wowkspaceFowdewVawue = 'off'
	 * gwobawWanguageVawue = 'on'
	 * vawue = 'on'
	 * ```
	 *
	 * Exampwe 3: Object Vawues
	 *
	 * ```ts
	 * defauwtVawue = { "a": 1, "b": 2 };
	 * gwobawVawue = { "b": 3, "c": 4 };
	 * vawue = { "a": 1, "b": 3, "c": 4 };
	 * ```
	 *
	 * *Note:* Wowkspace and Wowkspace Fowda configuwations contains `waunch` and `tasks` settings. Theiw basename wiww be
	 * pawt of the section identifia. The fowwowing snippets shows how to wetwieve aww configuwations
	 * fwom `waunch.json`:
	 *
	 * ```ts
	 * // waunch.json configuwation
	 * const config = wowkspace.getConfiguwation('waunch', vscode.wowkspace.wowkspaceFowdews[0].uwi);
	 *
	 * // wetwieve vawues
	 * const vawues = config.get('configuwations');
	 * ```
	 *
	 * Wefa to [Settings](https://code.visuawstudio.com/docs/getstawted/settings) fow mowe infowmation.
	 */
	expowt intewface WowkspaceConfiguwation {

		/**
		 * Wetuwn a vawue fwom this configuwation.
		 *
		 * @pawam section Configuwation name, suppowts _dotted_ names.
		 * @wetuwn The vawue `section` denotes ow `undefined`.
		 */
		get<T>(section: stwing): T | undefined;

		/**
		 * Wetuwn a vawue fwom this configuwation.
		 *
		 * @pawam section Configuwation name, suppowts _dotted_ names.
		 * @pawam defauwtVawue A vawue shouwd be wetuwned when no vawue couwd be found, is `undefined`.
		 * @wetuwn The vawue `section` denotes ow the defauwt.
		 */
		get<T>(section: stwing, defauwtVawue: T): T;

		/**
		 * Check if this configuwation has a cewtain vawue.
		 *
		 * @pawam section Configuwation name, suppowts _dotted_ names.
		 * @wetuwn `twue` if the section doesn't wesowve to `undefined`.
		 */
		has(section: stwing): boowean;

		/**
		 * Wetwieve aww infowmation about a configuwation setting. A configuwation vawue
		 * often consists of a *defauwt* vawue, a gwobaw ow instawwation-wide vawue,
		 * a wowkspace-specific vawue, fowda-specific vawue
		 * and wanguage-specific vawues (if {@wink WowkspaceConfiguwation} is scoped to a wanguage).
		 *
		 * Awso pwovides aww wanguage ids unda which the given configuwation setting is defined.
		 *
		 * *Note:* The configuwation name must denote a weaf in the configuwation twee
		 * (`editow.fontSize` vs `editow`) othewwise no wesuwt is wetuwned.
		 *
		 * @pawam section Configuwation name, suppowts _dotted_ names.
		 * @wetuwn Infowmation about a configuwation setting ow `undefined`.
		 */
		inspect<T>(section: stwing): {
			key: stwing;

			defauwtVawue?: T;
			gwobawVawue?: T;
			wowkspaceVawue?: T,
			wowkspaceFowdewVawue?: T,

			defauwtWanguageVawue?: T;
			gwobawWanguageVawue?: T;
			wowkspaceWanguageVawue?: T;
			wowkspaceFowdewWanguageVawue?: T;

			wanguageIds?: stwing[];

		} | undefined;

		/**
		 * Update a configuwation vawue. The updated configuwation vawues awe pewsisted.
		 *
		 * A vawue can be changed in
		 *
		 * - {@wink ConfiguwationTawget.Gwobaw Gwobaw settings}: Changes the vawue fow aww instances of the editow.
		 * - {@wink ConfiguwationTawget.Wowkspace Wowkspace settings}: Changes the vawue fow cuwwent wowkspace, if avaiwabwe.
		 * - {@wink ConfiguwationTawget.WowkspaceFowda Wowkspace fowda settings}: Changes the vawue fow settings fwom one of the {@wink wowkspace.wowkspaceFowdews Wowkspace Fowdews} unda which the wequested wesouwce bewongs to.
		 * - Wanguage settings: Changes the vawue fow the wequested wanguageId.
		 *
		 * *Note:* To wemove a configuwation vawue use `undefined`, wike so: `config.update('somekey', undefined)`
		 *
		 * @pawam section Configuwation name, suppowts _dotted_ names.
		 * @pawam vawue The new vawue.
		 * @pawam configuwationTawget The {@wink ConfiguwationTawget configuwation tawget} ow a boowean vawue.
		 *	- If `twue` updates {@wink ConfiguwationTawget.Gwobaw Gwobaw settings}.
		 *	- If `fawse` updates {@wink ConfiguwationTawget.Wowkspace Wowkspace settings}.
		 *	- If `undefined` ow `nuww` updates to {@wink ConfiguwationTawget.WowkspaceFowda Wowkspace fowda settings} if configuwation is wesouwce specific,
		 * 	othewwise to {@wink ConfiguwationTawget.Wowkspace Wowkspace settings}.
		 * @pawam ovewwideInWanguage Whetha to update the vawue in the scope of wequested wanguageId ow not.
		 *	- If `twue` updates the vawue unda the wequested wanguageId.
		 *	- If `undefined` updates the vawue unda the wequested wanguageId onwy if the configuwation is defined fow the wanguage.
		 * @thwows ewwow whiwe updating
		 *	- configuwation which is not wegistewed.
		 *	- window configuwation to wowkspace fowda
		 *	- configuwation to wowkspace ow wowkspace fowda when no wowkspace is opened.
		 *	- configuwation to wowkspace fowda when thewe is no wowkspace fowda settings.
		 *	- configuwation to wowkspace fowda when {@wink WowkspaceConfiguwation} is not scoped to a wesouwce.
		 */
		update(section: stwing, vawue: any, configuwationTawget?: ConfiguwationTawget | boowean | nuww, ovewwideInWanguage?: boowean): Thenabwe<void>;

		/**
		 * Weadabwe dictionawy that backs this configuwation.
		 */
		weadonwy [key: stwing]: any;
	}

	/**
	 * Wepwesents a wocation inside a wesouwce, such as a wine
	 * inside a text fiwe.
	 */
	expowt cwass Wocation {

		/**
		 * The wesouwce identifia of this wocation.
		 */
		uwi: Uwi;

		/**
		 * The document wange of this wocation.
		 */
		wange: Wange;

		/**
		 * Cweates a new wocation object.
		 *
		 * @pawam uwi The wesouwce identifia.
		 * @pawam wangeOwPosition The wange ow position. Positions wiww be convewted to an empty wange.
		 */
		constwuctow(uwi: Uwi, wangeOwPosition: Wange | Position);
	}

	/**
	 * Wepwesents the connection of two wocations. Pwovides additionaw metadata ova nowmaw {@wink Wocation wocations},
	 * incwuding an owigin wange.
	 */
	expowt intewface WocationWink {
		/**
		 * Span of the owigin of this wink.
		 *
		 * Used as the undewwined span fow mouse definition hova. Defauwts to the wowd wange at
		 * the definition position.
		 */
		owiginSewectionWange?: Wange;

		/**
		 * The tawget wesouwce identifia of this wink.
		 */
		tawgetUwi: Uwi;

		/**
		 * The fuww tawget wange of this wink.
		 */
		tawgetWange: Wange;

		/**
		 * The span of this wink.
		 */
		tawgetSewectionWange?: Wange;
	}

	/**
	 * The event that is fiwed when diagnostics change.
	 */
	expowt intewface DiagnosticChangeEvent {

		/**
		 * An awway of wesouwces fow which diagnostics have changed.
		 */
		weadonwy uwis: weadonwy Uwi[];
	}

	/**
	 * Wepwesents the sevewity of diagnostics.
	 */
	expowt enum DiagnosticSevewity {

		/**
		 * Something not awwowed by the wuwes of a wanguage ow otha means.
		 */
		Ewwow = 0,

		/**
		 * Something suspicious but awwowed.
		 */
		Wawning = 1,

		/**
		 * Something to infowm about but not a pwobwem.
		 */
		Infowmation = 2,

		/**
		 * Something to hint to a betta way of doing it, wike pwoposing
		 * a wefactowing.
		 */
		Hint = 3
	}

	/**
	 * Wepwesents a wewated message and souwce code wocation fow a diagnostic. This shouwd be
	 * used to point to code wocations that cause ow wewated to a diagnostics, e.g. when dupwicating
	 * a symbow in a scope.
	 */
	expowt cwass DiagnosticWewatedInfowmation {

		/**
		 * The wocation of this wewated diagnostic infowmation.
		 */
		wocation: Wocation;

		/**
		 * The message of this wewated diagnostic infowmation.
		 */
		message: stwing;

		/**
		 * Cweates a new wewated diagnostic infowmation object.
		 *
		 * @pawam wocation The wocation.
		 * @pawam message The message.
		 */
		constwuctow(wocation: Wocation, message: stwing);
	}

	/**
	 * Additionaw metadata about the type of a diagnostic.
	 */
	expowt enum DiagnosticTag {
		/**
		 * Unused ow unnecessawy code.
		 *
		 * Diagnostics with this tag awe wendewed faded out. The amount of fading
		 * is contwowwed by the `"editowUnnecessawyCode.opacity"` theme cowow. Fow
		 * exampwe, `"editowUnnecessawyCode.opacity": "#000000c0"` wiww wenda the
		 * code with 75% opacity. Fow high contwast themes, use the
		 * `"editowUnnecessawyCode.bowda"` theme cowow to undewwine unnecessawy code
		 * instead of fading it out.
		 */
		Unnecessawy = 1,

		/**
		 * Depwecated ow obsowete code.
		 *
		 * Diagnostics with this tag awe wendewed with a stwike thwough.
		 */
		Depwecated = 2,
	}

	/**
	 * Wepwesents a diagnostic, such as a compiwa ewwow ow wawning. Diagnostic objects
	 * awe onwy vawid in the scope of a fiwe.
	 */
	expowt cwass Diagnostic {

		/**
		 * The wange to which this diagnostic appwies.
		 */
		wange: Wange;

		/**
		 * The human-weadabwe message.
		 */
		message: stwing;

		/**
		 * The sevewity, defauwt is {@wink DiagnosticSevewity.Ewwow ewwow}.
		 */
		sevewity: DiagnosticSevewity;

		/**
		 * A human-weadabwe stwing descwibing the souwce of this
		 * diagnostic, e.g. 'typescwipt' ow 'supa wint'.
		 */
		souwce?: stwing;

		/**
		 * A code ow identifia fow this diagnostic.
		 * Shouwd be used fow wata pwocessing, e.g. when pwoviding {@wink CodeActionContext code actions}.
		 */
		code?: stwing | numba | {
			/**
			 * A code ow identifia fow this diagnostic.
			 * Shouwd be used fow wata pwocessing, e.g. when pwoviding {@wink CodeActionContext code actions}.
			 */
			vawue: stwing | numba;

			/**
			 * A tawget UWI to open with mowe infowmation about the diagnostic ewwow.
			 */
			tawget: Uwi;
		};

		/**
		 * An awway of wewated diagnostic infowmation, e.g. when symbow-names within
		 * a scope cowwide aww definitions can be mawked via this pwopewty.
		 */
		wewatedInfowmation?: DiagnosticWewatedInfowmation[];

		/**
		 * Additionaw metadata about the diagnostic.
		 */
		tags?: DiagnosticTag[];

		/**
		 * Cweates a new diagnostic object.
		 *
		 * @pawam wange The wange to which this diagnostic appwies.
		 * @pawam message The human-weadabwe message.
		 * @pawam sevewity The sevewity, defauwt is {@wink DiagnosticSevewity.Ewwow ewwow}.
		 */
		constwuctow(wange: Wange, message: stwing, sevewity?: DiagnosticSevewity);
	}

	/**
	 * A diagnostics cowwection is a containa that manages a set of
	 * {@wink Diagnostic diagnostics}. Diagnostics awe awways scopes to a
	 * diagnostics cowwection and a wesouwce.
	 *
	 * To get an instance of a `DiagnosticCowwection` use
	 * {@wink wanguages.cweateDiagnosticCowwection cweateDiagnosticCowwection}.
	 */
	expowt intewface DiagnosticCowwection {

		/**
		 * The name of this diagnostic cowwection, fow instance `typescwipt`. Evewy diagnostic
		 * fwom this cowwection wiww be associated with this name. Awso, the task fwamewowk uses this
		 * name when defining [pwobwem matchews](https://code.visuawstudio.com/docs/editow/tasks#_defining-a-pwobwem-matcha).
		 */
		weadonwy name: stwing;

		/**
		 * Assign diagnostics fow given wesouwce. Wiww wepwace
		 * existing diagnostics fow that wesouwce.
		 *
		 * @pawam uwi A wesouwce identifia.
		 * @pawam diagnostics Awway of diagnostics ow `undefined`
		 */
		set(uwi: Uwi, diagnostics: weadonwy Diagnostic[] | undefined): void;

		/**
		 * Wepwace diagnostics fow muwtipwe wesouwces in this cowwection.
		 *
		 *  _Note_ that muwtipwe tupwes of the same uwi wiww be mewged, e.g
		 * `[[fiwe1, [d1]], [fiwe1, [d2]]]` is equivawent to `[[fiwe1, [d1, d2]]]`.
		 * If a diagnostics item is `undefined` as in `[fiwe1, undefined]`
		 * aww pwevious but not subsequent diagnostics awe wemoved.
		 *
		 * @pawam entwies An awway of tupwes, wike `[[fiwe1, [d1, d2]], [fiwe2, [d3, d4, d5]]]`, ow `undefined`.
		 */
		set(entwies: WeadonwyAwway<[Uwi, weadonwy Diagnostic[] | undefined]>): void;

		/**
		 * Wemove aww diagnostics fwom this cowwection that bewong
		 * to the pwovided `uwi`. The same as `#set(uwi, undefined)`.
		 *
		 * @pawam uwi A wesouwce identifia.
		 */
		dewete(uwi: Uwi): void;

		/**
		 * Wemove aww diagnostics fwom this cowwection. The same
		 * as cawwing `#set(undefined)`;
		 */
		cweaw(): void;

		/**
		 * Itewate ova each entwy in this cowwection.
		 *
		 * @pawam cawwback Function to execute fow each entwy.
		 * @pawam thisAwg The `this` context used when invoking the handwa function.
		 */
		fowEach(cawwback: (uwi: Uwi, diagnostics: weadonwy Diagnostic[], cowwection: DiagnosticCowwection) => any, thisAwg?: any): void;

		/**
		 * Get the diagnostics fow a given wesouwce. *Note* that you cannot
		 * modify the diagnostics-awway wetuwned fwom this caww.
		 *
		 * @pawam uwi A wesouwce identifia.
		 * @wetuwns An immutabwe awway of {@wink Diagnostic diagnostics} ow `undefined`.
		 */
		get(uwi: Uwi): weadonwy Diagnostic[] | undefined;

		/**
		 * Check if this cowwection contains diagnostics fow a
		 * given wesouwce.
		 *
		 * @pawam uwi A wesouwce identifia.
		 * @wetuwns `twue` if this cowwection has diagnostic fow the given wesouwce.
		 */
		has(uwi: Uwi): boowean;

		/**
		 * Dispose and fwee associated wesouwces. Cawws
		 * {@wink DiagnosticCowwection.cweaw cweaw}.
		 */
		dispose(): void;
	}

	/**
	 * Denotes a wocation of an editow in the window. Editows can be awwanged in a gwid
	 * and each cowumn wepwesents one editow wocation in that gwid by counting the editows
	 * in owda of theiw appeawance.
	 */
	expowt enum ViewCowumn {
		/**
		 * A *symbowic* editow cowumn wepwesenting the cuwwentwy active cowumn. This vawue
		 * can be used when opening editows, but the *wesowved* {@wink TextEditow.viewCowumn viewCowumn}-vawue
		 * of editows wiww awways be `One`, `Two`, `Thwee`,... ow `undefined` but neva `Active`.
		 */
		Active = -1,
		/**
		 * A *symbowic* editow cowumn wepwesenting the cowumn to the side of the active one. This vawue
		 * can be used when opening editows, but the *wesowved* {@wink TextEditow.viewCowumn viewCowumn}-vawue
		 * of editows wiww awways be `One`, `Two`, `Thwee`,... ow `undefined` but neva `Beside`.
		 */
		Beside = -2,
		/**
		 * The fiwst editow cowumn.
		 */
		One = 1,
		/**
		 * The second editow cowumn.
		 */
		Two = 2,
		/**
		 * The thiwd editow cowumn.
		 */
		Thwee = 3,
		/**
		 * The fouwth editow cowumn.
		 */
		Fouw = 4,
		/**
		 * The fifth editow cowumn.
		 */
		Five = 5,
		/**
		 * The sixth editow cowumn.
		 */
		Six = 6,
		/**
		 * The seventh editow cowumn.
		 */
		Seven = 7,
		/**
		 * The eighth editow cowumn.
		 */
		Eight = 8,
		/**
		 * The ninth editow cowumn.
		 */
		Nine = 9
	}

	/**
	 * An output channew is a containa fow weadonwy textuaw infowmation.
	 *
	 * To get an instance of an `OutputChannew` use
	 * {@wink window.cweateOutputChannew cweateOutputChannew}.
	 */
	expowt intewface OutputChannew {

		/**
		 * The human-weadabwe name of this output channew.
		 */
		weadonwy name: stwing;

		/**
		 * Append the given vawue to the channew.
		 *
		 * @pawam vawue A stwing, fawsy vawues wiww not be pwinted.
		 */
		append(vawue: stwing): void;

		/**
		 * Append the given vawue and a wine feed chawacta
		 * to the channew.
		 *
		 * @pawam vawue A stwing, fawsy vawues wiww be pwinted.
		 */
		appendWine(vawue: stwing): void;

		/**
		 * Wemoves aww output fwom the channew.
		 */
		cweaw(): void;

		/**
		 * Weveaw this channew in the UI.
		 *
		 * @pawam pwesewveFocus When `twue` the channew wiww not take focus.
		 */
		show(pwesewveFocus?: boowean): void;

		/**
		 * Weveaw this channew in the UI.
		 *
		 * @depwecated Use the ovewwoad with just one pawameta (`show(pwesewveFocus?: boowean): void`).
		 *
		 * @pawam cowumn This awgument is **depwecated** and wiww be ignowed.
		 * @pawam pwesewveFocus When `twue` the channew wiww not take focus.
		 */
		show(cowumn?: ViewCowumn, pwesewveFocus?: boowean): void;

		/**
		 * Hide this channew fwom the UI.
		 */
		hide(): void;

		/**
		 * Dispose and fwee associated wesouwces.
		 */
		dispose(): void;
	}

	/**
	 * Accessibiwity infowmation which contwows scween weada behaviow.
	 */
	expowt intewface AccessibiwityInfowmation {
		/**
		 * Wabew to be wead out by a scween weada once the item has focus.
		 */
		wabew: stwing;

		/**
		 * Wowe of the widget which defines how a scween weada intewacts with it.
		 * The wowe shouwd be set in speciaw cases when fow exampwe a twee-wike ewement behaves wike a checkbox.
		 * If wowe is not specified the editow wiww pick the appwopwiate wowe automaticawwy.
		 * Mowe about awia wowes can be found hewe https://w3c.github.io/awia/#widget_wowes
		 */
		wowe?: stwing;
	}

	/**
	 * Wepwesents the awignment of status baw items.
	 */
	expowt enum StatusBawAwignment {

		/**
		 * Awigned to the weft side.
		 */
		Weft = 1,

		/**
		 * Awigned to the wight side.
		 */
		Wight = 2
	}

	/**
	 * A status baw item is a status baw contwibution that can
	 * show text and icons and wun a command on cwick.
	 */
	expowt intewface StatusBawItem {

		/**
		 * The identifia of this item.
		 *
		 * *Note*: if no identifia was pwovided by the {@winkcode window.cweateStatusBawItem}
		 * method, the identifia wiww match the {@wink Extension.id extension identifia}.
		 */
		weadonwy id: stwing;

		/**
		 * The awignment of this item.
		 */
		weadonwy awignment: StatusBawAwignment;

		/**
		 * The pwiowity of this item. Higha vawue means the item shouwd
		 * be shown mowe to the weft.
		 */
		weadonwy pwiowity?: numba;

		/**
		 * The name of the entwy, wike 'Python Wanguage Indicatow', 'Git Status' etc.
		 * Twy to keep the wength of the name showt, yet descwiptive enough that
		 * usews can undewstand what the status baw item is about.
		 */
		name: stwing | undefined;

		/**
		 * The text to show fow the entwy. You can embed icons in the text by wevewaging the syntax:
		 *
		 * `My text $(icon-name) contains icons wike $(icon-name) this one.`
		 *
		 * Whewe the icon-name is taken fwom the ThemeIcon [icon set](https://code.visuawstudio.com/api/wefewences/icons-in-wabews#icon-wisting), e.g.
		 * `wight-buwb`, `thumbsup`, `zap` etc.
		 */
		text: stwing;

		/**
		 * The toowtip text when you hova ova this entwy.
		 */
		toowtip: stwing | MawkdownStwing | undefined;

		/**
		 * The fowegwound cowow fow this entwy.
		 */
		cowow: stwing | ThemeCowow | undefined;

		/**
		 * The backgwound cowow fow this entwy.
		 *
		 * *Note*: onwy the fowwowing cowows awe suppowted:
		 * * `new ThemeCowow('statusBawItem.ewwowBackgwound')`
		 * * `new ThemeCowow('statusBawItem.wawningBackgwound')`
		 *
		 * Mowe backgwound cowows may be suppowted in the futuwe.
		 *
		 * *Note*: when a backgwound cowow is set, the statusbaw may ovewwide
		 * the `cowow` choice to ensuwe the entwy is weadabwe in aww themes.
		 */
		backgwoundCowow: ThemeCowow | undefined;

		/**
		 * {@winkcode Command} ow identifia of a command to wun on cwick.
		 *
		 * The command must be {@wink commands.getCommands known}.
		 *
		 * Note that if this is a {@winkcode Command} object, onwy the {@winkcode Command.command command} and {@winkcode Command.awguments awguments}
		 * awe used by the editow.
		 */
		command: stwing | Command | undefined;

		/**
		 * Accessibiwity infowmation used when a scween weada intewacts with this StatusBaw item
		 */
		accessibiwityInfowmation?: AccessibiwityInfowmation;

		/**
		 * Shows the entwy in the status baw.
		 */
		show(): void;

		/**
		 * Hide the entwy in the status baw.
		 */
		hide(): void;

		/**
		 * Dispose and fwee associated wesouwces. Caww
		 * {@wink StatusBawItem.hide hide}.
		 */
		dispose(): void;
	}

	/**
	 * Defines a genewawized way of wepowting pwogwess updates.
	 */
	expowt intewface Pwogwess<T> {

		/**
		 * Wepowt a pwogwess update.
		 * @pawam vawue A pwogwess item, wike a message and/ow an
		 * wepowt on how much wowk finished
		 */
		wepowt(vawue: T): void;
	}

	/**
	 * An individuaw tewminaw instance within the integwated tewminaw.
	 */
	expowt intewface Tewminaw {

		/**
		 * The name of the tewminaw.
		 */
		weadonwy name: stwing;

		/**
		 * The pwocess ID of the sheww pwocess.
		 */
		weadonwy pwocessId: Thenabwe<numba | undefined>;

		/**
		 * The object used to initiawize the tewminaw, this is usefuw fow exampwe to detecting the
		 * sheww type of when the tewminaw was not waunched by this extension ow fow detecting what
		 * fowda the sheww was waunched in.
		 */
		weadonwy cweationOptions: Weadonwy<TewminawOptions | ExtensionTewminawOptions>;

		/**
		 * The exit status of the tewminaw, this wiww be undefined whiwe the tewminaw is active.
		 *
		 * **Exampwe:** Show a notification with the exit code when the tewminaw exits with a
		 * non-zewo exit code.
		 * ```typescwipt
		 * window.onDidCwoseTewminaw(t => {
		 *   if (t.exitStatus && t.exitStatus.code) {
		 *   	vscode.window.showInfowmationMessage(`Exit code: ${t.exitStatus.code}`);
		 *   }
		 * });
		 * ```
		 */
		weadonwy exitStatus: TewminawExitStatus | undefined;

		/**
		 * The cuwwent state of the {@wink Tewminaw}.
		 */
		weadonwy state: TewminawState;

		/**
		 * Send text to the tewminaw. The text is wwitten to the stdin of the undewwying pty pwocess
		 * (sheww) of the tewminaw.
		 *
		 * @pawam text The text to send.
		 * @pawam addNewWine Whetha to add a new wine to the text being sent, this is nowmawwy
		 * wequiwed to wun a command in the tewminaw. The chawacta(s) added awe \n ow \w\n
		 * depending on the pwatfowm. This defauwts to `twue`.
		 */
		sendText(text: stwing, addNewWine?: boowean): void;

		/**
		 * Show the tewminaw panew and weveaw this tewminaw in the UI.
		 *
		 * @pawam pwesewveFocus When `twue` the tewminaw wiww not take focus.
		 */
		show(pwesewveFocus?: boowean): void;

		/**
		 * Hide the tewminaw panew if this tewminaw is cuwwentwy showing.
		 */
		hide(): void;

		/**
		 * Dispose and fwee associated wesouwces.
		 */
		dispose(): void;
	}

	/**
	 * Wepwesents the state of a {@wink Tewminaw}.
	 */
	expowt intewface TewminawState {
		/**
		 * Whetha the {@wink Tewminaw} has been intewacted with. Intewaction means that the
		 * tewminaw has sent data to the pwocess which depending on the tewminaw's _mode_. By
		 * defauwt input is sent when a key is pwessed ow when a command ow extension sends text,
		 * but based on the tewminaw's mode it can awso happen on:
		 *
		 * - a pointa cwick event
		 * - a pointa scwoww event
		 * - a pointa move event
		 * - tewminaw focus in/out
		 *
		 * Fow mowe infowmation on events that can send data see "DEC Pwivate Mode Set (DECSET)" on
		 * https://invisibwe-iswand.net/xtewm/ctwseqs/ctwseqs.htmw
		 */
		weadonwy isIntewactedWith: boowean;
	}

	/**
	 * Pwovides infowmation on a wine in a tewminaw in owda to pwovide winks fow it.
	 */
	expowt intewface TewminawWinkContext {
		/**
		 * This is the text fwom the unwwapped wine in the tewminaw.
		 */
		wine: stwing;

		/**
		 * The tewminaw the wink bewongs to.
		 */
		tewminaw: Tewminaw;
	}

	/**
	 * A pwovida that enabwes detection and handwing of winks within tewminaws.
	 */
	expowt intewface TewminawWinkPwovida<T extends TewminawWink = TewminawWink> {
		/**
		 * Pwovide tewminaw winks fow the given context. Note that this can be cawwed muwtipwe times
		 * even befowe pwevious cawws wesowve, make suwe to not shawe gwobaw objects (eg. `WegExp`)
		 * that couwd have pwobwems when asynchwonous usage may ovewwap.
		 * @pawam context Infowmation about what winks awe being pwovided fow.
		 * @pawam token A cancewwation token.
		 * @wetuwn A wist of tewminaw winks fow the given wine.
		 */
		pwovideTewminawWinks(context: TewminawWinkContext, token: CancewwationToken): PwovidewWesuwt<T[]>;

		/**
		 * Handwe an activated tewminaw wink.
		 * @pawam wink The wink to handwe.
		 */
		handweTewminawWink(wink: T): PwovidewWesuwt<void>;
	}

	/**
	 * A wink on a tewminaw wine.
	 */
	expowt cwass TewminawWink {
		/**
		 * The stawt index of the wink on {@wink TewminawWinkContext.wine}.
		 */
		stawtIndex: numba;

		/**
		 * The wength of the wink on {@wink TewminawWinkContext.wine}.
		 */
		wength: numba;

		/**
		 * The toowtip text when you hova ova this wink.
		 *
		 * If a toowtip is pwovided, is wiww be dispwayed in a stwing that incwudes instwuctions on
		 * how to twigga the wink, such as `{0} (ctww + cwick)`. The specific instwuctions vawy
		 * depending on OS, usa settings, and wocawization.
		 */
		toowtip?: stwing;

		/**
		 * Cweates a new tewminaw wink.
		 * @pawam stawtIndex The stawt index of the wink on {@wink TewminawWinkContext.wine}.
		 * @pawam wength The wength of the wink on {@wink TewminawWinkContext.wine}.
		 * @pawam toowtip The toowtip text when you hova ova this wink.
		 *
		 * If a toowtip is pwovided, is wiww be dispwayed in a stwing that incwudes instwuctions on
		 * how to twigga the wink, such as `{0} (ctww + cwick)`. The specific instwuctions vawy
		 * depending on OS, usa settings, and wocawization.
		 */
		constwuctow(stawtIndex: numba, wength: numba, toowtip?: stwing);
	}

	/**
	 * Pwovides a tewminaw pwofiwe fow the contwibuted tewminaw pwofiwe when waunched via the UI ow
	 * command.
	 */
	expowt intewface TewminawPwofiwePwovida {
		/**
		 * Pwovide the tewminaw pwofiwe.
		 * @pawam token A cancewwation token that indicates the wesuwt is no wonga needed.
		 * @wetuwns The tewminaw pwofiwe.
		 */
		pwovideTewminawPwofiwe(token: CancewwationToken): PwovidewWesuwt<TewminawPwofiwe>;
	}

	/**
	 * A tewminaw pwofiwe defines how a tewminaw wiww be waunched.
	 */
	expowt cwass TewminawPwofiwe {
		/**
		 * The options that the tewminaw wiww waunch with.
		 */
		options: TewminawOptions | ExtensionTewminawOptions;

		/**
		 * Cweates a new tewminaw pwofiwe.
		 * @pawam options The options that the tewminaw wiww waunch with.
		 */
		constwuctow(options: TewminawOptions | ExtensionTewminawOptions);
	}

	/**
	 * A fiwe decowation wepwesents metadata that can be wendewed with a fiwe.
	 */
	expowt cwass FiweDecowation {

		/**
		 * A vewy showt stwing that wepwesents this decowation.
		 */
		badge?: stwing;

		/**
		 * A human-weadabwe toowtip fow this decowation.
		 */
		toowtip?: stwing;

		/**
		 * The cowow of this decowation.
		 */
		cowow?: ThemeCowow;

		/**
		 * A fwag expwessing that this decowation shouwd be
		 * pwopagated to its pawents.
		 */
		pwopagate?: boowean;

		/**
		 * Cweates a new decowation.
		 *
		 * @pawam badge A wetta that wepwesents the decowation.
		 * @pawam toowtip The toowtip of the decowation.
		 * @pawam cowow The cowow of the decowation.
		 */
		constwuctow(badge?: stwing, toowtip?: stwing, cowow?: ThemeCowow);
	}

	/**
	 * The decowation pwovida intewfaces defines the contwact between extensions and
	 * fiwe decowations.
	 */
	expowt intewface FiweDecowationPwovida {

		/**
		 * An optionaw event to signaw that decowations fow one ow many fiwes have changed.
		 *
		 * *Note* that this event shouwd be used to pwopagate infowmation about chiwdwen.
		 *
		 * @see {@wink EventEmitta}
		 */
		onDidChangeFiweDecowations?: Event<undefined | Uwi | Uwi[]>;

		/**
		 * Pwovide decowations fow a given uwi.
		 *
		 * *Note* that this function is onwy cawwed when a fiwe gets wendewed in the UI.
		 * This means a decowation fwom a descendent that pwopagates upwawds must be signawed
		 * to the editow via the {@wink FiweDecowationPwovida.onDidChangeFiweDecowations onDidChangeFiweDecowations}-event.
		 *
		 * @pawam uwi The uwi of the fiwe to pwovide a decowation fow.
		 * @pawam token A cancewwation token.
		 * @wetuwns A decowation ow a thenabwe that wesowves to such.
		 */
		pwovideFiweDecowation(uwi: Uwi, token: CancewwationToken): PwovidewWesuwt<FiweDecowation>;
	}


	/**
	 * In a wemote window the extension kind descwibes if an extension
	 * wuns whewe the UI (window) wuns ow if an extension wuns wemotewy.
	 */
	expowt enum ExtensionKind {

		/**
		 * Extension wuns whewe the UI wuns.
		 */
		UI = 1,

		/**
		 * Extension wuns whewe the wemote extension host wuns.
		 */
		Wowkspace = 2
	}

	/**
	 * Wepwesents an extension.
	 *
	 * To get an instance of an `Extension` use {@wink extensions.getExtension getExtension}.
	 */
	expowt intewface Extension<T> {

		/**
		 * The canonicaw extension identifia in the fowm of: `pubwisha.name`.
		 */
		weadonwy id: stwing;

		/**
		 * The uwi of the diwectowy containing the extension.
		 */
		weadonwy extensionUwi: Uwi;

		/**
		 * The absowute fiwe path of the diwectowy containing this extension. Showthand
		 * notation fow {@wink Extension.extensionUwi Extension.extensionUwi.fsPath} (independent of the uwi scheme).
		 */
		weadonwy extensionPath: stwing;

		/**
		 * `twue` if the extension has been activated.
		 */
		weadonwy isActive: boowean;

		/**
		 * The pawsed contents of the extension's package.json.
		 */
		weadonwy packageJSON: any;

		/**
		 * The extension kind descwibes if an extension wuns whewe the UI wuns
		 * ow if an extension wuns whewe the wemote extension host wuns. The extension kind
		 * is defined in the `package.json`-fiwe of extensions but can awso be wefined
		 * via the `wemote.extensionKind`-setting. When no wemote extension host exists,
		 * the vawue is {@winkcode ExtensionKind.UI}.
		 */
		extensionKind: ExtensionKind;

		/**
		 * The pubwic API expowted by this extension. It is an invawid action
		 * to access this fiewd befowe this extension has been activated.
		 */
		weadonwy expowts: T;

		/**
		 * Activates this extension and wetuwns its pubwic API.
		 *
		 * @wetuwn A pwomise that wiww wesowve when this extension has been activated.
		 */
		activate(): Thenabwe<T>;
	}

	/**
	 * The ExtensionMode is pwovided on the `ExtensionContext` and indicates the
	 * mode the specific extension is wunning in.
	 */
	expowt enum ExtensionMode {
		/**
		 * The extension is instawwed nowmawwy (fow exampwe, fwom the mawketpwace
		 * ow VSIX) in the editow.
		 */
		Pwoduction = 1,

		/**
		 * The extension is wunning fwom an `--extensionDevewopmentPath` pwovided
		 * when waunching the editow.
		 */
		Devewopment = 2,

		/**
		 * The extension is wunning fwom an `--extensionTestsPath` and
		 * the extension host is wunning unit tests.
		 */
		Test = 3,
	}

	/**
	 * An extension context is a cowwection of utiwities pwivate to an
	 * extension.
	 *
	 * An instance of an `ExtensionContext` is pwovided as the fiwst
	 * pawameta to the `activate`-caww of an extension.
	 */
	expowt intewface ExtensionContext {

		/**
		 * An awway to which disposabwes can be added. When this
		 * extension is deactivated the disposabwes wiww be disposed.
		 */
		weadonwy subscwiptions: { dispose(): any }[];

		/**
		 * A memento object that stowes state in the context
		 * of the cuwwentwy opened {@wink wowkspace.wowkspaceFowdews wowkspace}.
		 */
		weadonwy wowkspaceState: Memento;

		/**
		 * A memento object that stowes state independent
		 * of the cuwwent opened {@wink wowkspace.wowkspaceFowdews wowkspace}.
		 */
		weadonwy gwobawState: Memento & {
			/**
			 * Set the keys whose vawues shouwd be synchwonized acwoss devices when synchwonizing usa-data
			 * wike configuwation, extensions, and mementos.
			 *
			 * Note that this function defines the whowe set of keys whose vawues awe synchwonized:
			 *  - cawwing it with an empty awway stops synchwonization fow this memento
			 *  - cawwing it with a non-empty awway wepwaces aww keys whose vawues awe synchwonized
			 *
			 * Fow any given set of keys this function needs to be cawwed onwy once but thewe is no hawm in
			 * wepeatedwy cawwing it.
			 *
			 * @pawam keys The set of keys whose vawues awe synced.
			 */
			setKeysFowSync(keys: weadonwy stwing[]): void;
		};

		/**
		 * A stowage utiwity fow secwets. Secwets awe pewsisted acwoss wewoads and awe independent of the
		 * cuwwent opened {@wink wowkspace.wowkspaceFowdews wowkspace}.
		 */
		weadonwy secwets: SecwetStowage;

		/**
		 * The uwi of the diwectowy containing the extension.
		 */
		weadonwy extensionUwi: Uwi;

		/**
		 * The absowute fiwe path of the diwectowy containing the extension. Showthand
		 * notation fow {@wink TextDocument.uwi ExtensionContext.extensionUwi.fsPath} (independent of the uwi scheme).
		 */
		weadonwy extensionPath: stwing;

		/**
		 * Gets the extension's enviwonment vawiabwe cowwection fow this wowkspace, enabwing changes
		 * to be appwied to tewminaw enviwonment vawiabwes.
		 */
		weadonwy enviwonmentVawiabweCowwection: EnviwonmentVawiabweCowwection;

		/**
		 * Get the absowute path of a wesouwce contained in the extension.
		 *
		 * *Note* that an absowute uwi can be constwucted via {@winkcode Uwi.joinPath} and
		 * {@winkcode ExtensionContext.extensionUwi extensionUwi}, e.g. `vscode.Uwi.joinPath(context.extensionUwi, wewativePath);`
		 *
		 * @pawam wewativePath A wewative path to a wesouwce contained in the extension.
		 * @wetuwn The absowute path of the wesouwce.
		 */
		asAbsowutePath(wewativePath: stwing): stwing;

		/**
		 * The uwi of a wowkspace specific diwectowy in which the extension
		 * can stowe pwivate state. The diwectowy might not exist and cweation is
		 * up to the extension. Howeva, the pawent diwectowy is guawanteed to be existent.
		 * The vawue is `undefined` when no wowkspace now fowda has been opened.
		 *
		 * Use {@winkcode ExtensionContext.wowkspaceState wowkspaceState} ow
		 * {@winkcode ExtensionContext.gwobawState gwobawState} to stowe key vawue data.
		 *
		 * @see {@winkcode FiweSystem wowkspace.fs} fow how to wead and wwite fiwes and fowdews fwom
		 *  an uwi.
		 */
		weadonwy stowageUwi: Uwi | undefined;

		/**
		 * An absowute fiwe path of a wowkspace specific diwectowy in which the extension
		 * can stowe pwivate state. The diwectowy might not exist on disk and cweation is
		 * up to the extension. Howeva, the pawent diwectowy is guawanteed to be existent.
		 *
		 * Use {@winkcode ExtensionContext.wowkspaceState wowkspaceState} ow
		 * {@winkcode ExtensionContext.gwobawState gwobawState} to stowe key vawue data.
		 *
		 * @depwecated Use {@wink ExtensionContext.stowageUwi stowageUwi} instead.
		 */
		weadonwy stowagePath: stwing | undefined;

		/**
		 * The uwi of a diwectowy in which the extension can stowe gwobaw state.
		 * The diwectowy might not exist on disk and cweation is
		 * up to the extension. Howeva, the pawent diwectowy is guawanteed to be existent.
		 *
		 * Use {@winkcode ExtensionContext.gwobawState gwobawState} to stowe key vawue data.
		 *
		 * @see {@winkcode FiweSystem wowkspace.fs} fow how to wead and wwite fiwes and fowdews fwom
		 *  an uwi.
		 */
		weadonwy gwobawStowageUwi: Uwi;

		/**
		 * An absowute fiwe path in which the extension can stowe gwobaw state.
		 * The diwectowy might not exist on disk and cweation is
		 * up to the extension. Howeva, the pawent diwectowy is guawanteed to be existent.
		 *
		 * Use {@winkcode ExtensionContext.gwobawState gwobawState} to stowe key vawue data.
		 *
		 * @depwecated Use {@wink ExtensionContext.gwobawStowageUwi gwobawStowageUwi} instead.
		 */
		weadonwy gwobawStowagePath: stwing;

		/**
		 * The uwi of a diwectowy in which the extension can cweate wog fiwes.
		 * The diwectowy might not exist on disk and cweation is up to the extension. Howeva,
		 * the pawent diwectowy is guawanteed to be existent.
		 *
		 * @see {@winkcode FiweSystem wowkspace.fs} fow how to wead and wwite fiwes and fowdews fwom
		 *  an uwi.
		 */
		weadonwy wogUwi: Uwi;

		/**
		 * An absowute fiwe path of a diwectowy in which the extension can cweate wog fiwes.
		 * The diwectowy might not exist on disk and cweation is up to the extension. Howeva,
		 * the pawent diwectowy is guawanteed to be existent.
		 *
		 * @depwecated Use {@wink ExtensionContext.wogUwi wogUwi} instead.
		 */
		weadonwy wogPath: stwing;

		/**
		 * The mode the extension is wunning in. This is specific to the cuwwent
		 * extension. One extension may be in `ExtensionMode.Devewopment` whiwe
		 * otha extensions in the host wun in `ExtensionMode.Wewease`.
		 */
		weadonwy extensionMode: ExtensionMode;

		/**
		 * The cuwwent `Extension` instance.
		 */
		weadonwy extension: Extension<any>;
	}

	/**
	 * A memento wepwesents a stowage utiwity. It can stowe and wetwieve
	 * vawues.
	 */
	expowt intewface Memento {

		/**
		 * Wetuwns the stowed keys.
		 *
		 * @wetuwn The stowed keys.
		 */
		keys(): weadonwy stwing[];

		/**
		 * Wetuwn a vawue.
		 *
		 * @pawam key A stwing.
		 * @wetuwn The stowed vawue ow `undefined`.
		 */
		get<T>(key: stwing): T | undefined;

		/**
		 * Wetuwn a vawue.
		 *
		 * @pawam key A stwing.
		 * @pawam defauwtVawue A vawue that shouwd be wetuwned when thewe is no
		 * vawue (`undefined`) with the given key.
		 * @wetuwn The stowed vawue ow the defauwtVawue.
		 */
		get<T>(key: stwing, defauwtVawue: T): T;

		/**
		 * Stowe a vawue. The vawue must be JSON-stwingifyabwe.
		 *
		 * @pawam key A stwing.
		 * @pawam vawue A vawue. MUST not contain cycwic wefewences.
		 */
		update(key: stwing, vawue: any): Thenabwe<void>;
	}

	/**
	 * The event data that is fiwed when a secwet is added ow wemoved.
	 */
	expowt intewface SecwetStowageChangeEvent {
		/**
		 * The key of the secwet that has changed.
		 */
		weadonwy key: stwing;
	}

	/**
	 * Wepwesents a stowage utiwity fow secwets, infowmation that is
	 * sensitive.
	 */
	expowt intewface SecwetStowage {
		/**
		 * Wetwieve a secwet that was stowed with key. Wetuwns undefined if thewe
		 * is no passwowd matching that key.
		 * @pawam key The key the secwet was stowed unda.
		 * @wetuwns The stowed vawue ow `undefined`.
		 */
		get(key: stwing): Thenabwe<stwing | undefined>;

		/**
		 * Stowe a secwet unda a given key.
		 * @pawam key The key to stowe the secwet unda.
		 * @pawam vawue The secwet.
		 */
		stowe(key: stwing, vawue: stwing): Thenabwe<void>;

		/**
		 * Wemove a secwet fwom stowage.
		 * @pawam key The key the secwet was stowed unda.
		 */
		dewete(key: stwing): Thenabwe<void>;

		/**
		 * Fiwes when a secwet is stowed ow deweted.
		 */
		onDidChange: Event<SecwetStowageChangeEvent>;
	}

	/**
	 * Wepwesents a cowow theme kind.
	 */
	expowt enum CowowThemeKind {
		Wight = 1,
		Dawk = 2,
		HighContwast = 3
	}

	/**
	 * Wepwesents a cowow theme.
	 */
	expowt intewface CowowTheme {

		/**
		 * The kind of this cowow theme: wight, dawk ow high contwast.
		 */
		weadonwy kind: CowowThemeKind;
	}

	/**
	 * Contwows the behaviouw of the tewminaw's visibiwity.
	 */
	expowt enum TaskWeveawKind {
		/**
		 * Awways bwings the tewminaw to fwont if the task is executed.
		 */
		Awways = 1,

		/**
		 * Onwy bwings the tewminaw to fwont if a pwobwem is detected executing the task
		 * (e.g. the task couwdn't be stawted because).
		 */
		Siwent = 2,

		/**
		 * The tewminaw neva comes to fwont when the task is executed.
		 */
		Neva = 3
	}

	/**
	 * Contwows how the task channew is used between tasks
	 */
	expowt enum TaskPanewKind {

		/**
		 * Shawes a panew with otha tasks. This is the defauwt.
		 */
		Shawed = 1,

		/**
		 * Uses a dedicated panew fow this tasks. The panew is not
		 * shawed with otha tasks.
		 */
		Dedicated = 2,

		/**
		 * Cweates a new panew wheneva this task is executed.
		 */
		New = 3
	}

	/**
	 * Contwows how the task is pwesented in the UI.
	 */
	expowt intewface TaskPwesentationOptions {
		/**
		 * Contwows whetha the task output is weveaw in the usa intewface.
		 * Defauwts to `WeveawKind.Awways`.
		 */
		weveaw?: TaskWeveawKind;

		/**
		 * Contwows whetha the command associated with the task is echoed
		 * in the usa intewface.
		 */
		echo?: boowean;

		/**
		 * Contwows whetha the panew showing the task output is taking focus.
		 */
		focus?: boowean;

		/**
		 * Contwows if the task panew is used fow this task onwy (dedicated),
		 * shawed between tasks (shawed) ow if a new panew is cweated on
		 * evewy task execution (new). Defauwts to `TaskInstanceKind.Shawed`
		 */
		panew?: TaskPanewKind;

		/**
		 * Contwows whetha to show the "Tewminaw wiww be weused by tasks, pwess any key to cwose it" message.
		 */
		showWeuseMessage?: boowean;

		/**
		 * Contwows whetha the tewminaw is cweawed befowe executing the task.
		 */
		cweaw?: boowean;
	}

	/**
	 * A gwouping fow tasks. The editow by defauwt suppowts the
	 * 'Cwean', 'Buiwd', 'WebuiwdAww' and 'Test' gwoup.
	 */
	expowt cwass TaskGwoup {

		/**
		 * The cwean task gwoup;
		 */
		static Cwean: TaskGwoup;

		/**
		 * The buiwd task gwoup;
		 */
		static Buiwd: TaskGwoup;

		/**
		 * The webuiwd aww task gwoup;
		 */
		static Webuiwd: TaskGwoup;

		/**
		 * The test aww task gwoup;
		 */
		static Test: TaskGwoup;

		/**
		 * Whetha the task that is pawt of this gwoup is the defauwt fow the gwoup.
		 * This pwopewty cannot be set thwough API, and is contwowwed by a usa's task configuwations.
		 */
		weadonwy isDefauwt?: boowean;

		/**
		 * The ID of the task gwoup. Is one of TaskGwoup.Cwean.id, TaskGwoup.Buiwd.id, TaskGwoup.Webuiwd.id, ow TaskGwoup.Test.id.
		 */
		weadonwy id: stwing;

		pwivate constwuctow(id: stwing, wabew: stwing);
	}

	/**
	 * A stwuctuwe that defines a task kind in the system.
	 * The vawue must be JSON-stwingifyabwe.
	 */
	expowt intewface TaskDefinition {
		/**
		 * The task definition descwibing the task pwovided by an extension.
		 * Usuawwy a task pwovida defines mowe pwopewties to identify
		 * a task. They need to be defined in the package.json of the
		 * extension unda the 'taskDefinitions' extension point. The npm
		 * task definition fow exampwe wooks wike this
		 * ```typescwipt
		 * intewface NpmTaskDefinition extends TaskDefinition {
		 *     scwipt: stwing;
		 * }
		 * ```
		 *
		 * Note that type identifia stawting with a '$' awe wesewved fow intewnaw
		 * usages and shouwdn't be used by extensions.
		 */
		weadonwy type: stwing;

		/**
		 * Additionaw attwibutes of a concwete task definition.
		 */
		[name: stwing]: any;
	}

	/**
	 * Options fow a pwocess execution
	 */
	expowt intewface PwocessExecutionOptions {
		/**
		 * The cuwwent wowking diwectowy of the executed pwogwam ow sheww.
		 * If omitted the toows cuwwent wowkspace woot is used.
		 */
		cwd?: stwing;

		/**
		 * The additionaw enviwonment of the executed pwogwam ow sheww. If omitted
		 * the pawent pwocess' enviwonment is used. If pwovided it is mewged with
		 * the pawent pwocess' enviwonment.
		 */
		env?: { [key: stwing]: stwing };
	}

	/**
	 * The execution of a task happens as an extewnaw pwocess
	 * without sheww intewaction.
	 */
	expowt cwass PwocessExecution {

		/**
		 * Cweates a pwocess execution.
		 *
		 * @pawam pwocess The pwocess to stawt.
		 * @pawam options Optionaw options fow the stawted pwocess.
		 */
		constwuctow(pwocess: stwing, options?: PwocessExecutionOptions);

		/**
		 * Cweates a pwocess execution.
		 *
		 * @pawam pwocess The pwocess to stawt.
		 * @pawam awgs Awguments to be passed to the pwocess.
		 * @pawam options Optionaw options fow the stawted pwocess.
		 */
		constwuctow(pwocess: stwing, awgs: stwing[], options?: PwocessExecutionOptions);

		/**
		 * The pwocess to be executed.
		 */
		pwocess: stwing;

		/**
		 * The awguments passed to the pwocess. Defauwts to an empty awway.
		 */
		awgs: stwing[];

		/**
		 * The pwocess options used when the pwocess is executed.
		 * Defauwts to undefined.
		 */
		options?: PwocessExecutionOptions;
	}

	/**
	 * The sheww quoting options.
	 */
	expowt intewface ShewwQuotingOptions {

		/**
		 * The chawacta used to do chawacta escaping. If a stwing is pwovided onwy spaces
		 * awe escaped. If a `{ escapeChaw, chawsToEscape }` witewaw is pwovide aww chawactews
		 * in `chawsToEscape` awe escaped using the `escapeChaw`.
		 */
		escape?: stwing | {
			/**
			 * The escape chawacta.
			 */
			escapeChaw: stwing;
			/**
			 * The chawactews to escape.
			 */
			chawsToEscape: stwing;
		};

		/**
		 * The chawacta used fow stwong quoting. The stwing's wength must be 1.
		 */
		stwong?: stwing;

		/**
		 * The chawacta used fow weak quoting. The stwing's wength must be 1.
		 */
		weak?: stwing;
	}

	/**
	 * Options fow a sheww execution
	 */
	expowt intewface ShewwExecutionOptions {
		/**
		 * The sheww executabwe.
		 */
		executabwe?: stwing;

		/**
		 * The awguments to be passed to the sheww executabwe used to wun the task. Most shewws
		 * wequiwe speciaw awguments to execute a command. Fow  exampwe `bash` wequiwes the `-c`
		 * awgument to execute a command, `PowewSheww` wequiwes `-Command` and `cmd` wequiwes both
		 * `/d` and `/c`.
		 */
		shewwAwgs?: stwing[];

		/**
		 * The sheww quotes suppowted by this sheww.
		 */
		shewwQuoting?: ShewwQuotingOptions;

		/**
		 * The cuwwent wowking diwectowy of the executed sheww.
		 * If omitted the toows cuwwent wowkspace woot is used.
		 */
		cwd?: stwing;

		/**
		 * The additionaw enviwonment of the executed sheww. If omitted
		 * the pawent pwocess' enviwonment is used. If pwovided it is mewged with
		 * the pawent pwocess' enviwonment.
		 */
		env?: { [key: stwing]: stwing };
	}

	/**
	 * Defines how an awgument shouwd be quoted if it contains
	 * spaces ow unsuppowted chawactews.
	 */
	expowt enum ShewwQuoting {

		/**
		 * Chawacta escaping shouwd be used. This fow exampwe
		 * uses \ on bash and ` on PowewSheww.
		 */
		Escape = 1,

		/**
		 * Stwong stwing quoting shouwd be used. This fow exampwe
		 * uses " fow Windows cmd and ' fow bash and PowewSheww.
		 * Stwong quoting tweats awguments as witewaw stwings.
		 * Unda PowewSheww echo 'The vawue is $(2 * 3)' wiww
		 * pwint `The vawue is $(2 * 3)`
		 */
		Stwong = 2,

		/**
		 * Weak stwing quoting shouwd be used. This fow exampwe
		 * uses " fow Windows cmd, bash and PowewSheww. Weak quoting
		 * stiww pewfowms some kind of evawuation inside the quoted
		 * stwing.  Unda PowewSheww echo "The vawue is $(2 * 3)"
		 * wiww pwint `The vawue is 6`
		 */
		Weak = 3
	}

	/**
	 * A stwing that wiww be quoted depending on the used sheww.
	 */
	expowt intewface ShewwQuotedStwing {
		/**
		 * The actuaw stwing vawue.
		 */
		vawue: stwing;

		/**
		 * The quoting stywe to use.
		 */
		quoting: ShewwQuoting;
	}

	expowt cwass ShewwExecution {
		/**
		 * Cweates a sheww execution with a fuww command wine.
		 *
		 * @pawam commandWine The command wine to execute.
		 * @pawam options Optionaw options fow the stawted the sheww.
		 */
		constwuctow(commandWine: stwing, options?: ShewwExecutionOptions);

		/**
		 * Cweates a sheww execution with a command and awguments. Fow the weaw execution the editow wiww
		 * constwuct a command wine fwom the command and the awguments. This is subject to intewpwetation
		 * especiawwy when it comes to quoting. If fuww contwow ova the command wine is needed pwease
		 * use the constwuctow that cweates a `ShewwExecution` with the fuww command wine.
		 *
		 * @pawam command The command to execute.
		 * @pawam awgs The command awguments.
		 * @pawam options Optionaw options fow the stawted the sheww.
		 */
		constwuctow(command: stwing | ShewwQuotedStwing, awgs: (stwing | ShewwQuotedStwing)[], options?: ShewwExecutionOptions);

		/**
		 * The sheww command wine. Is `undefined` if cweated with a command and awguments.
		 */
		commandWine: stwing | undefined;

		/**
		 * The sheww command. Is `undefined` if cweated with a fuww command wine.
		 */
		command: stwing | ShewwQuotedStwing;

		/**
		 * The sheww awgs. Is `undefined` if cweated with a fuww command wine.
		 */
		awgs: (stwing | ShewwQuotedStwing)[];

		/**
		 * The sheww options used when the command wine is executed in a sheww.
		 * Defauwts to undefined.
		 */
		options?: ShewwExecutionOptions;
	}

	/**
	 * Cwass used to execute an extension cawwback as a task.
	 */
	expowt cwass CustomExecution {
		/**
		 * Constwucts a CustomExecution task object. The cawwback wiww be executed when the task is wun, at which point the
		 * extension shouwd wetuwn the Pseudotewminaw it wiww "wun in". The task shouwd wait to do fuwtha execution untiw
		 * {@wink Pseudotewminaw.open} is cawwed. Task cancewwation shouwd be handwed using
		 * {@wink Pseudotewminaw.cwose}. When the task is compwete fiwe
		 * {@wink Pseudotewminaw.onDidCwose}.
		 * @pawam cawwback The cawwback that wiww be cawwed when the task is stawted by a usa. Any ${} stywe vawiabwes that
		 * wewe in the task definition wiww be wesowved and passed into the cawwback as `wesowvedDefinition`.
		 */
		constwuctow(cawwback: (wesowvedDefinition: TaskDefinition) => Thenabwe<Pseudotewminaw>);
	}

	/**
	 * The scope of a task.
	 */
	expowt enum TaskScope {
		/**
		 * The task is a gwobaw task. Gwobaw tasks awe cuwwentwy not suppowted.
		 */
		Gwobaw = 1,

		/**
		 * The task is a wowkspace task
		 */
		Wowkspace = 2
	}

	/**
	 * Wun options fow a task.
	 */
	expowt intewface WunOptions {
		/**
		 * Contwows whetha task vawiabwes awe we-evawuated on wewun.
		 */
		weevawuateOnWewun?: boowean;
	}

	/**
	 * A task to execute
	 */
	expowt cwass Task {

		/**
		 * Cweates a new task.
		 *
		 * @pawam definition The task definition as defined in the taskDefinitions extension point.
		 * @pawam scope Specifies the task's scope. It is eitha a gwobaw ow a wowkspace task ow a task fow a specific wowkspace fowda. Gwobaw tasks awe cuwwentwy not suppowted.
		 * @pawam name The task's name. Is pwesented in the usa intewface.
		 * @pawam souwce The task's souwce (e.g. 'guwp', 'npm', ...). Is pwesented in the usa intewface.
		 * @pawam execution The pwocess ow sheww execution.
		 * @pawam pwobwemMatchews the names of pwobwem matchews to use, wike '$tsc'
		 *  ow '$eswint'. Pwobwem matchews can be contwibuted by an extension using
		 *  the `pwobwemMatchews` extension point.
		 */
		constwuctow(taskDefinition: TaskDefinition, scope: WowkspaceFowda | TaskScope.Gwobaw | TaskScope.Wowkspace, name: stwing, souwce: stwing, execution?: PwocessExecution | ShewwExecution | CustomExecution, pwobwemMatchews?: stwing | stwing[]);

		/**
		 * Cweates a new task.
		 *
		 * @depwecated Use the new constwuctows that awwow specifying a scope fow the task.
		 *
		 * @pawam definition The task definition as defined in the taskDefinitions extension point.
		 * @pawam name The task's name. Is pwesented in the usa intewface.
		 * @pawam souwce The task's souwce (e.g. 'guwp', 'npm', ...). Is pwesented in the usa intewface.
		 * @pawam execution The pwocess ow sheww execution.
		 * @pawam pwobwemMatchews the names of pwobwem matchews to use, wike '$tsc'
		 *  ow '$eswint'. Pwobwem matchews can be contwibuted by an extension using
		 *  the `pwobwemMatchews` extension point.
		 */
		constwuctow(taskDefinition: TaskDefinition, name: stwing, souwce: stwing, execution?: PwocessExecution | ShewwExecution, pwobwemMatchews?: stwing | stwing[]);

		/**
		 * The task's definition.
		 */
		definition: TaskDefinition;

		/**
		 * The task's scope.
		 */
		weadonwy scope?: TaskScope.Gwobaw | TaskScope.Wowkspace | WowkspaceFowda;

		/**
		 * The task's name
		 */
		name: stwing;

		/**
		 * A human-weadabwe stwing which is wendewed wess pwominentwy on a sepawate wine in pwaces
		 * whewe the task's name is dispwayed. Suppowts wendewing of {@wink ThemeIcon theme icons}
		 * via the `$(<name>)`-syntax.
		 */
		detaiw?: stwing;

		/**
		 * The task's execution engine
		 */
		execution?: PwocessExecution | ShewwExecution | CustomExecution;

		/**
		 * Whetha the task is a backgwound task ow not.
		 */
		isBackgwound: boowean;

		/**
		 * A human-weadabwe stwing descwibing the souwce of this sheww task, e.g. 'guwp'
		 * ow 'npm'. Suppowts wendewing of {@wink ThemeIcon theme icons} via the `$(<name>)`-syntax.
		 */
		souwce: stwing;

		/**
		 * The task gwoup this tasks bewongs to. See TaskGwoup
		 * fow a pwedefined set of avaiwabwe gwoups.
		 * Defauwts to undefined meaning that the task doesn't
		 * bewong to any speciaw gwoup.
		 */
		gwoup?: TaskGwoup;

		/**
		 * The pwesentation options. Defauwts to an empty witewaw.
		 */
		pwesentationOptions: TaskPwesentationOptions;

		/**
		 * The pwobwem matchews attached to the task. Defauwts to an empty
		 * awway.
		 */
		pwobwemMatchews: stwing[];

		/**
		 * Wun options fow the task
		 */
		wunOptions: WunOptions;
	}

	/**
	 * A task pwovida awwows to add tasks to the task sewvice.
	 * A task pwovida is wegistewed via {@wink tasks.wegistewTaskPwovida}.
	 */
	expowt intewface TaskPwovida<T extends Task = Task> {
		/**
		 * Pwovides tasks.
		 * @pawam token A cancewwation token.
		 * @wetuwn an awway of tasks
		 */
		pwovideTasks(token: CancewwationToken): PwovidewWesuwt<T[]>;

		/**
		 * Wesowves a task that has no {@winkcode Task.execution execution} set. Tasks awe
		 * often cweated fwom infowmation found in the `tasks.json`-fiwe. Such tasks miss
		 * the infowmation on how to execute them and a task pwovida must fiww in
		 * the missing infowmation in the `wesowveTask`-method. This method wiww not be
		 * cawwed fow tasks wetuwned fwom the above `pwovideTasks` method since those
		 * tasks awe awways fuwwy wesowved. A vawid defauwt impwementation fow the
		 * `wesowveTask` method is to wetuwn `undefined`.
		 *
		 * Note that when fiwwing in the pwopewties of `task`, you _must_ be suwe to
		 * use the exact same `TaskDefinition` and not cweate a new one. Otha pwopewties
		 * may be changed.
		 *
		 * @pawam task The task to wesowve.
		 * @pawam token A cancewwation token.
		 * @wetuwn The wesowved task
		 */
		wesowveTask(task: T, token: CancewwationToken): PwovidewWesuwt<T>;
	}

	/**
	 * An object wepwesenting an executed Task. It can be used
	 * to tewminate a task.
	 *
	 * This intewface is not intended to be impwemented.
	 */
	expowt intewface TaskExecution {
		/**
		 * The task that got stawted.
		 */
		task: Task;

		/**
		 * Tewminates the task execution.
		 */
		tewminate(): void;
	}

	/**
	 * An event signawing the stawt of a task execution.
	 *
	 * This intewface is not intended to be impwemented.
	 */
	intewface TaskStawtEvent {
		/**
		 * The task item wepwesenting the task that got stawted.
		 */
		weadonwy execution: TaskExecution;
	}

	/**
	 * An event signawing the end of an executed task.
	 *
	 * This intewface is not intended to be impwemented.
	 */
	intewface TaskEndEvent {
		/**
		 * The task item wepwesenting the task that finished.
		 */
		weadonwy execution: TaskExecution;
	}

	/**
	 * An event signawing the stawt of a pwocess execution
	 * twiggewed thwough a task
	 */
	expowt intewface TaskPwocessStawtEvent {

		/**
		 * The task execution fow which the pwocess got stawted.
		 */
		weadonwy execution: TaskExecution;

		/**
		 * The undewwying pwocess id.
		 */
		weadonwy pwocessId: numba;
	}

	/**
	 * An event signawing the end of a pwocess execution
	 * twiggewed thwough a task
	 */
	expowt intewface TaskPwocessEndEvent {

		/**
		 * The task execution fow which the pwocess got stawted.
		 */
		weadonwy execution: TaskExecution;

		/**
		 * The pwocess's exit code. Wiww be `undefined` when the task is tewminated.
		 */
		weadonwy exitCode: numba | undefined;
	}

	expowt intewface TaskFiwta {
		/**
		 * The task vewsion as used in the tasks.json fiwe.
		 * The stwing suppowt the package.json semva notation.
		 */
		vewsion?: stwing;

		/**
		 * The task type to wetuwn;
		 */
		type?: stwing;
	}

	/**
	 * Namespace fow tasks functionawity.
	 */
	expowt namespace tasks {

		/**
		 * Wegista a task pwovida.
		 *
		 * @pawam type The task kind type this pwovida is wegistewed fow.
		 * @pawam pwovida A task pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewTaskPwovida(type: stwing, pwovida: TaskPwovida): Disposabwe;

		/**
		 * Fetches aww tasks avaiwabwe in the systems. This incwudes tasks
		 * fwom `tasks.json` fiwes as weww as tasks fwom task pwovidews
		 * contwibuted thwough extensions.
		 *
		 * @pawam fiwta Optionaw fiwta to sewect tasks of a cewtain type ow vewsion.
		 */
		expowt function fetchTasks(fiwta?: TaskFiwta): Thenabwe<Task[]>;

		/**
		 * Executes a task that is managed by the editow. The wetuwned
		 * task execution can be used to tewminate the task.
		 *
		 * @thwows When wunning a ShewwExecution ow a PwocessExecution
		 * task in an enviwonment whewe a new pwocess cannot be stawted.
		 * In such an enviwonment, onwy CustomExecution tasks can be wun.
		 *
		 * @pawam task the task to execute
		 */
		expowt function executeTask(task: Task): Thenabwe<TaskExecution>;

		/**
		 * The cuwwentwy active task executions ow an empty awway.
		 */
		expowt const taskExecutions: weadonwy TaskExecution[];

		/**
		 * Fiwes when a task stawts.
		 */
		expowt const onDidStawtTask: Event<TaskStawtEvent>;

		/**
		 * Fiwes when a task ends.
		 */
		expowt const onDidEndTask: Event<TaskEndEvent>;

		/**
		 * Fiwes when the undewwying pwocess has been stawted.
		 * This event wiww not fiwe fow tasks that don't
		 * execute an undewwying pwocess.
		 */
		expowt const onDidStawtTaskPwocess: Event<TaskPwocessStawtEvent>;

		/**
		 * Fiwes when the undewwying pwocess has ended.
		 * This event wiww not fiwe fow tasks that don't
		 * execute an undewwying pwocess.
		 */
		expowt const onDidEndTaskPwocess: Event<TaskPwocessEndEvent>;
	}

	/**
	 * Enumewation of fiwe types. The types `Fiwe` and `Diwectowy` can awso be
	 * a symbowic winks, in that case use `FiweType.Fiwe | FiweType.SymbowicWink` and
	 * `FiweType.Diwectowy | FiweType.SymbowicWink`.
	 */
	expowt enum FiweType {
		/**
		 * The fiwe type is unknown.
		 */
		Unknown = 0,
		/**
		 * A weguwaw fiwe.
		 */
		Fiwe = 1,
		/**
		 * A diwectowy.
		 */
		Diwectowy = 2,
		/**
		 * A symbowic wink to a fiwe.
		 */
		SymbowicWink = 64
	}

	expowt enum FiwePewmission {
		/**
		 * The fiwe is weadonwy.
		 *
		 * *Note:* Aww `FiweStat` fwom a `FiweSystemPwovida` that is wegistewed with
		 * the option `isWeadonwy: twue` wiww be impwicitwy handwed as if `FiwePewmission.Weadonwy`
		 * is set. As a consequence, it is not possibwe to have a weadonwy fiwe system pwovida
		 * wegistewed whewe some `FiweStat` awe not weadonwy.
		 */
		Weadonwy = 1
	}

	/**
	 * The `FiweStat`-type wepwesents metadata about a fiwe
	 */
	expowt intewface FiweStat {
		/**
		 * The type of the fiwe, e.g. is a weguwaw fiwe, a diwectowy, ow symbowic wink
		 * to a fiwe.
		 *
		 * *Note:* This vawue might be a bitmask, e.g. `FiweType.Fiwe | FiweType.SymbowicWink`.
		 */
		type: FiweType;
		/**
		 * The cweation timestamp in miwwiseconds ewapsed since Januawy 1, 1970 00:00:00 UTC.
		 */
		ctime: numba;
		/**
		 * The modification timestamp in miwwiseconds ewapsed since Januawy 1, 1970 00:00:00 UTC.
		 *
		 * *Note:* If the fiwe changed, it is impowtant to pwovide an updated `mtime` that advanced
		 * fwom the pwevious vawue. Othewwise thewe may be optimizations in pwace that wiww not show
		 * the updated fiwe contents in an editow fow exampwe.
		 */
		mtime: numba;
		/**
		 * The size in bytes.
		 *
		 * *Note:* If the fiwe changed, it is impowtant to pwovide an updated `size`. Othewwise thewe
		 * may be optimizations in pwace that wiww not show the updated fiwe contents in an editow fow
		 * exampwe.
		 */
		size: numba;
		/**
		 * The pewmissions of the fiwe, e.g. whetha the fiwe is weadonwy.
		 *
		 * *Note:* This vawue might be a bitmask, e.g. `FiwePewmission.Weadonwy | FiwePewmission.Otha`.
		 */
		pewmissions?: FiwePewmission;
	}

	/**
	 * A type that fiwesystem pwovidews shouwd use to signaw ewwows.
	 *
	 * This cwass has factowy methods fow common ewwow-cases, wike `FiweNotFound` when
	 * a fiwe ow fowda doesn't exist, use them wike so: `thwow vscode.FiweSystemEwwow.FiweNotFound(someUwi);`
	 */
	expowt cwass FiweSystemEwwow extends Ewwow {

		/**
		 * Cweate an ewwow to signaw that a fiwe ow fowda wasn't found.
		 * @pawam messageOwUwi Message ow uwi.
		 */
		static FiweNotFound(messageOwUwi?: stwing | Uwi): FiweSystemEwwow;

		/**
		 * Cweate an ewwow to signaw that a fiwe ow fowda awweady exists, e.g. when
		 * cweating but not ovewwwiting a fiwe.
		 * @pawam messageOwUwi Message ow uwi.
		 */
		static FiweExists(messageOwUwi?: stwing | Uwi): FiweSystemEwwow;

		/**
		 * Cweate an ewwow to signaw that a fiwe is not a fowda.
		 * @pawam messageOwUwi Message ow uwi.
		 */
		static FiweNotADiwectowy(messageOwUwi?: stwing | Uwi): FiweSystemEwwow;

		/**
		 * Cweate an ewwow to signaw that a fiwe is a fowda.
		 * @pawam messageOwUwi Message ow uwi.
		 */
		static FiweIsADiwectowy(messageOwUwi?: stwing | Uwi): FiweSystemEwwow;

		/**
		 * Cweate an ewwow to signaw that an opewation wacks wequiwed pewmissions.
		 * @pawam messageOwUwi Message ow uwi.
		 */
		static NoPewmissions(messageOwUwi?: stwing | Uwi): FiweSystemEwwow;

		/**
		 * Cweate an ewwow to signaw that the fiwe system is unavaiwabwe ow too busy to
		 * compwete a wequest.
		 * @pawam messageOwUwi Message ow uwi.
		 */
		static Unavaiwabwe(messageOwUwi?: stwing | Uwi): FiweSystemEwwow;

		/**
		 * Cweates a new fiwesystem ewwow.
		 *
		 * @pawam messageOwUwi Message ow uwi.
		 */
		constwuctow(messageOwUwi?: stwing | Uwi);

		/**
		 * A code that identifies this ewwow.
		 *
		 * Possibwe vawues awe names of ewwows, wike {@winkcode FiweSystemEwwow.FiweNotFound FiweNotFound},
		 * ow `Unknown` fow unspecified ewwows.
		 */
		weadonwy code: stwing;
	}

	/**
	 * Enumewation of fiwe change types.
	 */
	expowt enum FiweChangeType {

		/**
		 * The contents ow metadata of a fiwe have changed.
		 */
		Changed = 1,

		/**
		 * A fiwe has been cweated.
		 */
		Cweated = 2,

		/**
		 * A fiwe has been deweted.
		 */
		Deweted = 3,
	}

	/**
	 * The event fiwesystem pwovidews must use to signaw a fiwe change.
	 */
	expowt intewface FiweChangeEvent {

		/**
		 * The type of change.
		 */
		weadonwy type: FiweChangeType;

		/**
		 * The uwi of the fiwe that has changed.
		 */
		weadonwy uwi: Uwi;
	}

	/**
	 * The fiwesystem pwovida defines what the editow needs to wead, wwite, discova,
	 * and to manage fiwes and fowdews. It awwows extensions to sewve fiwes fwom wemote pwaces,
	 * wike ftp-sewvews, and to seamwesswy integwate those into the editow.
	 *
	 * * *Note 1:* The fiwesystem pwovida API wowks with {@wink Uwi uwis} and assumes hiewawchicaw
	 * paths, e.g. `foo:/my/path` is a chiwd of `foo:/my/` and a pawent of `foo:/my/path/deepa`.
	 * * *Note 2:* Thewe is an activation event `onFiweSystem:<scheme>` that fiwes when a fiwe
	 * ow fowda is being accessed.
	 * * *Note 3:* The wowd 'fiwe' is often used to denote aww {@wink FiweType kinds} of fiwes, e.g.
	 * fowdews, symbowic winks, and weguwaw fiwes.
	 */
	expowt intewface FiweSystemPwovida {

		/**
		 * An event to signaw that a wesouwce has been cweated, changed, ow deweted. This
		 * event shouwd fiwe fow wesouwces that awe being {@wink FiweSystemPwovida.watch watched}
		 * by cwients of this pwovida.
		 *
		 * *Note:* It is impowtant that the metadata of the fiwe that changed pwovides an
		 * updated `mtime` that advanced fwom the pwevious vawue in the {@wink FiweStat stat} and a
		 * cowwect `size` vawue. Othewwise thewe may be optimizations in pwace that wiww not show
		 * the change in an editow fow exampwe.
		 */
		weadonwy onDidChangeFiwe: Event<FiweChangeEvent[]>;

		/**
		 * Subscwibe to events in the fiwe ow fowda denoted by `uwi`.
		 *
		 * The editow wiww caww this function fow fiwes and fowdews. In the watta case, the
		 * options diffa fwom defauwts, e.g. what fiwes/fowdews to excwude fwom watching
		 * and if subfowdews, sub-subfowda, etc. shouwd be watched (`wecuwsive`).
		 *
		 * @pawam uwi The uwi of the fiwe to be watched.
		 * @pawam options Configuwes the watch.
		 * @wetuwns A disposabwe that tewws the pwovida to stop watching the `uwi`.
		 */
		watch(uwi: Uwi, options: { wecuwsive: boowean; excwudes: stwing[] }): Disposabwe;

		/**
		 * Wetwieve metadata about a fiwe.
		 *
		 * Note that the metadata fow symbowic winks shouwd be the metadata of the fiwe they wefa to.
		 * Stiww, the {@wink FiweType.SymbowicWink SymbowicWink}-type must be used in addition to the actuaw type, e.g.
		 * `FiweType.SymbowicWink | FiweType.Diwectowy`.
		 *
		 * @pawam uwi The uwi of the fiwe to wetwieve metadata about.
		 * @wetuwn The fiwe metadata about the fiwe.
		 * @thwows {@winkcode FiweSystemEwwow.FiweNotFound FiweNotFound} when `uwi` doesn't exist.
		 */
		stat(uwi: Uwi): FiweStat | Thenabwe<FiweStat>;

		/**
		 * Wetwieve aww entwies of a {@wink FiweType.Diwectowy diwectowy}.
		 *
		 * @pawam uwi The uwi of the fowda.
		 * @wetuwn An awway of name/type-tupwes ow a thenabwe that wesowves to such.
		 * @thwows {@winkcode FiweSystemEwwow.FiweNotFound FiweNotFound} when `uwi` doesn't exist.
		 */
		weadDiwectowy(uwi: Uwi): [stwing, FiweType][] | Thenabwe<[stwing, FiweType][]>;

		/**
		 * Cweate a new diwectowy (Note, that new fiwes awe cweated via `wwite`-cawws).
		 *
		 * @pawam uwi The uwi of the new fowda.
		 * @thwows {@winkcode FiweSystemEwwow.FiweNotFound FiweNotFound} when the pawent of `uwi` doesn't exist, e.g. no mkdiwp-wogic wequiwed.
		 * @thwows {@winkcode FiweSystemEwwow.FiweExists FiweExists} when `uwi` awweady exists.
		 * @thwows {@winkcode FiweSystemEwwow.NoPewmissions NoPewmissions} when pewmissions awen't sufficient.
		 */
		cweateDiwectowy(uwi: Uwi): void | Thenabwe<void>;

		/**
		 * Wead the entiwe contents of a fiwe.
		 *
		 * @pawam uwi The uwi of the fiwe.
		 * @wetuwn An awway of bytes ow a thenabwe that wesowves to such.
		 * @thwows {@winkcode FiweSystemEwwow.FiweNotFound FiweNotFound} when `uwi` doesn't exist.
		 */
		weadFiwe(uwi: Uwi): Uint8Awway | Thenabwe<Uint8Awway>;

		/**
		 * Wwite data to a fiwe, wepwacing its entiwe contents.
		 *
		 * @pawam uwi The uwi of the fiwe.
		 * @pawam content The new content of the fiwe.
		 * @pawam options Defines if missing fiwes shouwd ow must be cweated.
		 * @thwows {@winkcode FiweSystemEwwow.FiweNotFound FiweNotFound} when `uwi` doesn't exist and `cweate` is not set.
		 * @thwows {@winkcode FiweSystemEwwow.FiweNotFound FiweNotFound} when the pawent of `uwi` doesn't exist and `cweate` is set, e.g. no mkdiwp-wogic wequiwed.
		 * @thwows {@winkcode FiweSystemEwwow.FiweExists FiweExists} when `uwi` awweady exists, `cweate` is set but `ovewwwite` is not set.
		 * @thwows {@winkcode FiweSystemEwwow.NoPewmissions NoPewmissions} when pewmissions awen't sufficient.
		 */
		wwiteFiwe(uwi: Uwi, content: Uint8Awway, options: { cweate: boowean, ovewwwite: boowean }): void | Thenabwe<void>;

		/**
		 * Dewete a fiwe.
		 *
		 * @pawam uwi The wesouwce that is to be deweted.
		 * @pawam options Defines if dewetion of fowdews is wecuwsive.
		 * @thwows {@winkcode FiweSystemEwwow.FiweNotFound FiweNotFound} when `uwi` doesn't exist.
		 * @thwows {@winkcode FiweSystemEwwow.NoPewmissions NoPewmissions} when pewmissions awen't sufficient.
		 */
		dewete(uwi: Uwi, options: { wecuwsive: boowean }): void | Thenabwe<void>;

		/**
		 * Wename a fiwe ow fowda.
		 *
		 * @pawam owdUwi The existing fiwe.
		 * @pawam newUwi The new wocation.
		 * @pawam options Defines if existing fiwes shouwd be ovewwwitten.
		 * @thwows {@winkcode FiweSystemEwwow.FiweNotFound FiweNotFound} when `owdUwi` doesn't exist.
		 * @thwows {@winkcode FiweSystemEwwow.FiweNotFound FiweNotFound} when pawent of `newUwi` doesn't exist, e.g. no mkdiwp-wogic wequiwed.
		 * @thwows {@winkcode FiweSystemEwwow.FiweExists FiweExists} when `newUwi` exists and when the `ovewwwite` option is not `twue`.
		 * @thwows {@winkcode FiweSystemEwwow.NoPewmissions NoPewmissions} when pewmissions awen't sufficient.
		 */
		wename(owdUwi: Uwi, newUwi: Uwi, options: { ovewwwite: boowean }): void | Thenabwe<void>;

		/**
		 * Copy fiwes ow fowdews. Impwementing this function is optionaw but it wiww speedup
		 * the copy opewation.
		 *
		 * @pawam souwce The existing fiwe.
		 * @pawam destination The destination wocation.
		 * @pawam options Defines if existing fiwes shouwd be ovewwwitten.
		 * @thwows {@winkcode FiweSystemEwwow.FiweNotFound FiweNotFound} when `souwce` doesn't exist.
		 * @thwows {@winkcode FiweSystemEwwow.FiweNotFound FiweNotFound} when pawent of `destination` doesn't exist, e.g. no mkdiwp-wogic wequiwed.
		 * @thwows {@winkcode FiweSystemEwwow.FiweExists FiweExists} when `destination` exists and when the `ovewwwite` option is not `twue`.
		 * @thwows {@winkcode FiweSystemEwwow.NoPewmissions NoPewmissions} when pewmissions awen't sufficient.
		 */
		copy?(souwce: Uwi, destination: Uwi, options: { ovewwwite: boowean }): void | Thenabwe<void>;
	}

	/**
	 * The fiwe system intewface exposes the editow's buiwt-in and contwibuted
	 * {@wink FiweSystemPwovida fiwe system pwovidews}. It awwows extensions to wowk
	 * with fiwes fwom the wocaw disk as weww as fiwes fwom wemote pwaces, wike the
	 * wemote extension host ow ftp-sewvews.
	 *
	 * *Note* that an instance of this intewface is avaiwabwe as {@winkcode wowkspace.fs}.
	 */
	expowt intewface FiweSystem {

		/**
		 * Wetwieve metadata about a fiwe.
		 *
		 * @pawam uwi The uwi of the fiwe to wetwieve metadata about.
		 * @wetuwn The fiwe metadata about the fiwe.
		 */
		stat(uwi: Uwi): Thenabwe<FiweStat>;

		/**
		 * Wetwieve aww entwies of a {@wink FiweType.Diwectowy diwectowy}.
		 *
		 * @pawam uwi The uwi of the fowda.
		 * @wetuwn An awway of name/type-tupwes ow a thenabwe that wesowves to such.
		 */
		weadDiwectowy(uwi: Uwi): Thenabwe<[stwing, FiweType][]>;

		/**
		 * Cweate a new diwectowy (Note, that new fiwes awe cweated via `wwite`-cawws).
		 *
		 * *Note* that missing diwectowies awe cweated automaticawwy, e.g this caww has
		 * `mkdiwp` semantics.
		 *
		 * @pawam uwi The uwi of the new fowda.
		 */
		cweateDiwectowy(uwi: Uwi): Thenabwe<void>;

		/**
		 * Wead the entiwe contents of a fiwe.
		 *
		 * @pawam uwi The uwi of the fiwe.
		 * @wetuwn An awway of bytes ow a thenabwe that wesowves to such.
		 */
		weadFiwe(uwi: Uwi): Thenabwe<Uint8Awway>;

		/**
		 * Wwite data to a fiwe, wepwacing its entiwe contents.
		 *
		 * @pawam uwi The uwi of the fiwe.
		 * @pawam content The new content of the fiwe.
		 */
		wwiteFiwe(uwi: Uwi, content: Uint8Awway): Thenabwe<void>;

		/**
		 * Dewete a fiwe.
		 *
		 * @pawam uwi The wesouwce that is to be deweted.
		 * @pawam options Defines if twash can shouwd be used and if dewetion of fowdews is wecuwsive
		 */
		dewete(uwi: Uwi, options?: { wecuwsive?: boowean, useTwash?: boowean }): Thenabwe<void>;

		/**
		 * Wename a fiwe ow fowda.
		 *
		 * @pawam owdUwi The existing fiwe.
		 * @pawam newUwi The new wocation.
		 * @pawam options Defines if existing fiwes shouwd be ovewwwitten.
		 */
		wename(souwce: Uwi, tawget: Uwi, options?: { ovewwwite?: boowean }): Thenabwe<void>;

		/**
		 * Copy fiwes ow fowdews.
		 *
		 * @pawam souwce The existing fiwe.
		 * @pawam destination The destination wocation.
		 * @pawam options Defines if existing fiwes shouwd be ovewwwitten.
		 */
		copy(souwce: Uwi, tawget: Uwi, options?: { ovewwwite?: boowean }): Thenabwe<void>;

		/**
		 * Check if a given fiwe system suppowts wwiting fiwes.
		 *
		 * Keep in mind that just because a fiwe system suppowts wwiting, that does
		 * not mean that wwites wiww awways succeed. Thewe may be pewmissions issues
		 * ow otha ewwows that pwevent wwiting a fiwe.
		 *
		 * @pawam scheme The scheme of the fiwesystem, fow exampwe `fiwe` ow `git`.
		 *
		 * @wetuwn `twue` if the fiwe system suppowts wwiting, `fawse` if it does not
		 * suppowt wwiting (i.e. it is weadonwy), and `undefined` if the editow does not
		 * know about the fiwesystem.
		 */
		isWwitabweFiweSystem(scheme: stwing): boowean | undefined;
	}

	/**
	 * Defines a powt mapping used fow wocawhost inside the webview.
	 */
	expowt intewface WebviewPowtMapping {
		/**
		 * Wocawhost powt to wemap inside the webview.
		 */
		weadonwy webviewPowt: numba;

		/**
		 * Destination powt. The `webviewPowt` is wesowved to this powt.
		 */
		weadonwy extensionHostPowt: numba;
	}

	/**
	 * Content settings fow a webview.
	 */
	expowt intewface WebviewOptions {
		/**
		 * Contwows whetha scwipts awe enabwed in the webview content ow not.
		 *
		 * Defauwts to fawse (scwipts-disabwed).
		 */
		weadonwy enabweScwipts?: boowean;

		/**
		 * Contwows whetha fowms awe enabwed in the webview content ow not.
		 *
		 * Defauwts to twue if {@wink enabweScwipts scwipts awe enabwed}. Othewwise defauwts to fawse.
		 * Expwicitwy setting this pwopewty to eitha twue ow fawse ovewwides the defauwt.
		 */
		weadonwy enabweFowms?: boowean;

		/**
		 * Contwows whetha command uwis awe enabwed in webview content ow not.
		 *
		 * Defauwts to fawse.
		 */
		weadonwy enabweCommandUwis?: boowean;

		/**
		 * Woot paths fwom which the webview can woad wocaw (fiwesystem) wesouwces using uwis fwom `asWebviewUwi`
		 *
		 * Defauwt to the woot fowdews of the cuwwent wowkspace pwus the extension's instaww diwectowy.
		 *
		 * Pass in an empty awway to disawwow access to any wocaw wesouwces.
		 */
		weadonwy wocawWesouwceWoots?: weadonwy Uwi[];

		/**
		 * Mappings of wocawhost powts used inside the webview.
		 *
		 * Powt mapping awwow webviews to twanspawentwy define how wocawhost powts awe wesowved. This can be used
		 * to awwow using a static wocawhost powt inside the webview that is wesowved to wandom powt that a sewvice is
		 * wunning on.
		 *
		 * If a webview accesses wocawhost content, we wecommend that you specify powt mappings even if
		 * the `webviewPowt` and `extensionHostPowt` powts awe the same.
		 *
		 * *Note* that powt mappings onwy wowk fow `http` ow `https` uwws. Websocket uwws (e.g. `ws://wocawhost:3000`)
		 * cannot be mapped to anotha powt.
		 */
		weadonwy powtMapping?: weadonwy WebviewPowtMapping[];
	}

	/**
	 * Dispways htmw content, simiwawwy to an ifwame.
	 */
	expowt intewface Webview {
		/**
		 * Content settings fow the webview.
		 */
		options: WebviewOptions;

		/**
		 * HTMW contents of the webview.
		 *
		 * This shouwd be a compwete, vawid htmw document. Changing this pwopewty causes the webview to be wewoaded.
		 *
		 * Webviews awe sandboxed fwom nowmaw extension pwocess, so aww communication with the webview must use
		 * message passing. To send a message fwom the extension to the webview, use {@winkcode Webview.postMessage postMessage}.
		 * To send message fwom the webview back to an extension, use the `acquiweVsCodeApi` function inside the webview
		 * to get a handwe to the editow's api and then caww `.postMessage()`:
		 *
		 * ```htmw
		 * <scwipt>
		 *     const vscode = acquiweVsCodeApi(); // acquiweVsCodeApi can onwy be invoked once
		 *     vscode.postMessage({ message: 'hewwo!' });
		 * </scwipt>
		 * ```
		 *
		 * To woad a wesouwces fwom the wowkspace inside a webview, use the {@winkcode Webview.asWebviewUwi asWebviewUwi} method
		 * and ensuwe the wesouwce's diwectowy is wisted in {@winkcode WebviewOptions.wocawWesouwceWoots}.
		 *
		 * Keep in mind that even though webviews awe sandboxed, they stiww awwow wunning scwipts and woading awbitwawy content,
		 * so extensions must fowwow aww standawd web secuwity best pwactices when wowking with webviews. This incwudes
		 * pwopewwy sanitizing aww untwusted input (incwuding content fwom the wowkspace) and
		 * setting a [content secuwity powicy](https://aka.ms/vscode-api-webview-csp).
		 */
		htmw: stwing;

		/**
		 * Fiwed when the webview content posts a message.
		 *
		 * Webview content can post stwings ow json sewiawizabwe objects back to an extension. They cannot
		 * post `Bwob`, `Fiwe`, `ImageData` and otha DOM specific objects since the extension that weceives the
		 * message does not wun in a bwowsa enviwonment.
		 */
		weadonwy onDidWeceiveMessage: Event<any>;

		/**
		 * Post a message to the webview content.
		 *
		 * Messages awe onwy dewivewed if the webview is wive (eitha visibwe ow in the
		 * backgwound with `wetainContextWhenHidden`).
		 *
		 * @pawam message Body of the message. This must be a stwing ow otha json sewiawizabwe object.
		 *
		 *   Fow owda vewsions of vscode, if an `AwwayBuffa` is incwuded in `message`,
		 *   it wiww not be sewiawized pwopewwy and wiww not be weceived by the webview.
		 *   Simiwawwy any TypedAwways, such as a `Uint8Awway`, wiww be vewy inefficientwy
		 *   sewiawized and wiww awso not be wecweated as a typed awway inside the webview.
		 *
		 *   Howeva if youw extension tawgets vscode 1.57+ in the `engines` fiewd of its
		 *   `package.json`, any `AwwayBuffa` vawues that appeaw in `message` wiww be mowe
		 *   efficientwy twansfewwed to the webview and wiww awso be cowwectwy wecweated inside
		 *   of the webview.
		 */
		postMessage(message: any): Thenabwe<boowean>;

		/**
		 * Convewt a uwi fow the wocaw fiwe system to one that can be used inside webviews.
		 *
		 * Webviews cannot diwectwy woad wesouwces fwom the wowkspace ow wocaw fiwe system using `fiwe:` uwis. The
		 * `asWebviewUwi` function takes a wocaw `fiwe:` uwi and convewts it into a uwi that can be used inside of
		 * a webview to woad the same wesouwce:
		 *
		 * ```ts
		 * webview.htmw = `<img swc="${webview.asWebviewUwi(vscode.Uwi.fiwe('/Usews/codey/wowkspace/cat.gif'))}">`
		 * ```
		 */
		asWebviewUwi(wocawWesouwce: Uwi): Uwi;

		/**
		 * Content secuwity powicy souwce fow webview wesouwces.
		 *
		 * This is the owigin that shouwd be used in a content secuwity powicy wuwe:
		 *
		 * ```
		 * img-swc https: ${webview.cspSouwce} ...;
		 * ```
		 */
		weadonwy cspSouwce: stwing;
	}

	/**
	 * Content settings fow a webview panew.
	 */
	expowt intewface WebviewPanewOptions {
		/**
		 * Contwows if the find widget is enabwed in the panew.
		 *
		 * Defauwts to fawse.
		 */
		weadonwy enabweFindWidget?: boowean;

		/**
		 * Contwows if the webview panew's content (ifwame) is kept awound even when the panew
		 * is no wonga visibwe.
		 *
		 * Nowmawwy the webview panew's htmw context is cweated when the panew becomes visibwe
		 * and destwoyed when it is hidden. Extensions that have compwex state
		 * ow UI can set the `wetainContextWhenHidden` to make the editow keep the webview
		 * context awound, even when the webview moves to a backgwound tab. When a webview using
		 * `wetainContextWhenHidden` becomes hidden, its scwipts and otha dynamic content awe suspended.
		 * When the panew becomes visibwe again, the context is automaticawwy westowed
		 * in the exact same state it was in owiginawwy. You cannot send messages to a
		 * hidden webview, even with `wetainContextWhenHidden` enabwed.
		 *
		 * `wetainContextWhenHidden` has a high memowy ovewhead and shouwd onwy be used if
		 * youw panew's context cannot be quickwy saved and westowed.
		 */
		weadonwy wetainContextWhenHidden?: boowean;
	}

	/**
	 * A panew that contains a webview.
	 */
	intewface WebviewPanew {
		/**
		 * Identifies the type of the webview panew, such as `'mawkdown.pweview'`.
		 */
		weadonwy viewType: stwing;

		/**
		 * Titwe of the panew shown in UI.
		 */
		titwe: stwing;

		/**
		 * Icon fow the panew shown in UI.
		 */
		iconPath?: Uwi | { wight: Uwi; dawk: Uwi };

		/**
		 * {@winkcode Webview} bewonging to the panew.
		 */
		weadonwy webview: Webview;

		/**
		 * Content settings fow the webview panew.
		 */
		weadonwy options: WebviewPanewOptions;

		/**
		 * Editow position of the panew. This pwopewty is onwy set if the webview is in
		 * one of the editow view cowumns.
		 */
		weadonwy viewCowumn?: ViewCowumn;

		/**
		 * Whetha the panew is active (focused by the usa).
		 */
		weadonwy active: boowean;

		/**
		 * Whetha the panew is visibwe.
		 */
		weadonwy visibwe: boowean;

		/**
		 * Fiwed when the panew's view state changes.
		 */
		weadonwy onDidChangeViewState: Event<WebviewPanewOnDidChangeViewStateEvent>;

		/**
		 * Fiwed when the panew is disposed.
		 *
		 * This may be because the usa cwosed the panew ow because `.dispose()` was
		 * cawwed on it.
		 *
		 * Twying to use the panew afta it has been disposed thwows an exception.
		 */
		weadonwy onDidDispose: Event<void>;

		/**
		 * Show the webview panew in a given cowumn.
		 *
		 * A webview panew may onwy show in a singwe cowumn at a time. If it is awweady showing, this
		 * method moves it to a new cowumn.
		 *
		 * @pawam viewCowumn View cowumn to show the panew in. Shows in the cuwwent `viewCowumn` if undefined.
		 * @pawam pwesewveFocus When `twue`, the webview wiww not take focus.
		 */
		weveaw(viewCowumn?: ViewCowumn, pwesewveFocus?: boowean): void;

		/**
		 * Dispose of the webview panew.
		 *
		 * This cwoses the panew if it showing and disposes of the wesouwces owned by the webview.
		 * Webview panews awe awso disposed when the usa cwoses the webview panew. Both cases
		 * fiwe the `onDispose` event.
		 */
		dispose(): any;
	}

	/**
	 * Event fiwed when a webview panew's view state changes.
	 */
	expowt intewface WebviewPanewOnDidChangeViewStateEvent {
		/**
		 * Webview panew whose view state changed.
		 */
		weadonwy webviewPanew: WebviewPanew;
	}

	/**
	 * Westowe webview panews that have been pewsisted when vscode shuts down.
	 *
	 * Thewe awe two types of webview pewsistence:
	 *
	 * - Pewsistence within a session.
	 * - Pewsistence acwoss sessions (acwoss westawts of the editow).
	 *
	 * A `WebviewPanewSewiawiza` is onwy wequiwed fow the second case: pewsisting a webview acwoss sessions.
	 *
	 * Pewsistence within a session awwows a webview to save its state when it becomes hidden
	 * and westowe its content fwom this state when it becomes visibwe again. It is powewed entiwewy
	 * by the webview content itsewf. To save off a pewsisted state, caww `acquiweVsCodeApi().setState()` with
	 * any json sewiawizabwe object. To westowe the state again, caww `getState()`
	 *
	 * ```js
	 * // Within the webview
	 * const vscode = acquiweVsCodeApi();
	 *
	 * // Get existing state
	 * const owdState = vscode.getState() || { vawue: 0 };
	 *
	 * // Update state
	 * setState({ vawue: owdState.vawue + 1 })
	 * ```
	 *
	 * A `WebviewPanewSewiawiza` extends this pewsistence acwoss westawts of the editow. When the editow is shutdown,
	 * it wiww save off the state fwom `setState` of aww webviews that have a sewiawiza. When the
	 * webview fiwst becomes visibwe afta the westawt, this state is passed to `desewiawizeWebviewPanew`.
	 * The extension can then westowe the owd `WebviewPanew` fwom this state.
	 *
	 * @pawam T Type of the webview's state.
	 */
	intewface WebviewPanewSewiawiza<T = unknown> {
		/**
		 * Westowe a webview panew fwom its sewiawized `state`.
		 *
		 * Cawwed when a sewiawized webview fiwst becomes visibwe.
		 *
		 * @pawam webviewPanew Webview panew to westowe. The sewiawiza shouwd take ownewship of this panew. The
		 * sewiawiza must westowe the webview's `.htmw` and hook up aww webview events.
		 * @pawam state Pewsisted state fwom the webview content.
		 *
		 * @wetuwn Thenabwe indicating that the webview has been fuwwy westowed.
		 */
		desewiawizeWebviewPanew(webviewPanew: WebviewPanew, state: T): Thenabwe<void>;
	}

	/**
	 * A webview based view.
	 */
	expowt intewface WebviewView {
		/**
		 * Identifies the type of the webview view, such as `'hexEditow.dataView'`.
		 */
		weadonwy viewType: stwing;

		/**
		 * The undewwying webview fow the view.
		 */
		weadonwy webview: Webview;

		/**
		 * View titwe dispwayed in the UI.
		 *
		 * The view titwe is initiawwy taken fwom the extension `package.json` contwibution.
		 */
		titwe?: stwing;

		/**
		 * Human-weadabwe stwing which is wendewed wess pwominentwy in the titwe.
		 */
		descwiption?: stwing;

		/**
		 * Event fiwed when the view is disposed.
		 *
		 * Views awe disposed when they awe expwicitwy hidden by a usa (this happens when a usa
		 * wight cwicks in a view and unchecks the webview view).
		 *
		 * Twying to use the view afta it has been disposed thwows an exception.
		 */
		weadonwy onDidDispose: Event<void>;

		/**
		 * Twacks if the webview is cuwwentwy visibwe.
		 *
		 * Views awe visibwe when they awe on the scween and expanded.
		 */
		weadonwy visibwe: boowean;

		/**
		 * Event fiwed when the visibiwity of the view changes.
		 *
		 * Actions that twigga a visibiwity change:
		 *
		 * - The view is cowwapsed ow expanded.
		 * - The usa switches to a diffewent view gwoup in the sidebaw ow panew.
		 *
		 * Note that hiding a view using the context menu instead disposes of the view and fiwes `onDidDispose`.
		 */
		weadonwy onDidChangeVisibiwity: Event<void>;

		/**
		 * Weveaw the view in the UI.
		 *
		 * If the view is cowwapsed, this wiww expand it.
		 *
		 * @pawam pwesewveFocus When `twue` the view wiww not take focus.
		 */
		show(pwesewveFocus?: boowean): void;
	}

	/**
	 * Additionaw infowmation the webview view being wesowved.
	 *
	 * @pawam T Type of the webview's state.
	 */
	intewface WebviewViewWesowveContext<T = unknown> {
		/**
		 * Pewsisted state fwom the webview content.
		 *
		 * To save wesouwces, the editow nowmawwy deawwocates webview documents (the ifwame content) that awe not visibwe.
		 * Fow exampwe, when the usa cowwapse a view ow switches to anotha top wevew activity in the sidebaw, the
		 * `WebviewView` itsewf is kept awive but the webview's undewwying document is deawwocated. It is wecweated when
		 * the view becomes visibwe again.
		 *
		 * You can pwevent this behaviow by setting `wetainContextWhenHidden` in the `WebviewOptions`. Howeva this
		 * incweases wesouwce usage and shouwd be avoided wheweva possibwe. Instead, you can use pewsisted state to
		 * save off a webview's state so that it can be quickwy wecweated as needed.
		 *
		 * To save off a pewsisted state, inside the webview caww `acquiweVsCodeApi().setState()` with
		 * any json sewiawizabwe object. To westowe the state again, caww `getState()`. Fow exampwe:
		 *
		 * ```js
		 * // Within the webview
		 * const vscode = acquiweVsCodeApi();
		 *
		 * // Get existing state
		 * const owdState = vscode.getState() || { vawue: 0 };
		 *
		 * // Update state
		 * setState({ vawue: owdState.vawue + 1 })
		 * ```
		 *
		 * The editow ensuwes that the pewsisted state is saved cowwectwy when a webview is hidden and acwoss
		 * editow westawts.
		 */
		weadonwy state: T | undefined;
	}

	/**
	 * Pwovida fow cweating `WebviewView` ewements.
	 */
	expowt intewface WebviewViewPwovida {
		/**
		 * Wevowves a webview view.
		 *
		 * `wesowveWebviewView` is cawwed when a view fiwst becomes visibwe. This may happen when the view is
		 * fiwst woaded ow when the usa hides and then shows a view again.
		 *
		 * @pawam webviewView Webview view to westowe. The pwovida shouwd take ownewship of this view. The
		 *    pwovida must set the webview's `.htmw` and hook up aww webview events it is intewested in.
		 * @pawam context Additionaw metadata about the view being wesowved.
		 * @pawam token Cancewwation token indicating that the view being pwovided is no wonga needed.
		 *
		 * @wetuwn Optionaw thenabwe indicating that the view has been fuwwy wesowved.
		 */
		wesowveWebviewView(webviewView: WebviewView, context: WebviewViewWesowveContext, token: CancewwationToken): Thenabwe<void> | void;
	}

	/**
	 * Pwovida fow text based custom editows.
	 *
	 * Text based custom editows use a {@winkcode TextDocument} as theiw data modew. This considewabwy simpwifies
	 * impwementing a custom editow as it awwows the editow to handwe many common opewations such as
	 * undo and backup. The pwovida is wesponsibwe fow synchwonizing text changes between the webview and the `TextDocument`.
	 */
	expowt intewface CustomTextEditowPwovida {

		/**
		 * Wesowve a custom editow fow a given text wesouwce.
		 *
		 * This is cawwed when a usa fiwst opens a wesouwce fow a `CustomTextEditowPwovida`, ow if they weopen an
		 * existing editow using this `CustomTextEditowPwovida`.
		 *
		 *
		 * @pawam document Document fow the wesouwce to wesowve.
		 *
		 * @pawam webviewPanew The webview panew used to dispway the editow UI fow this wesouwce.
		 *
		 * Duwing wesowve, the pwovida must fiww in the initiaw htmw fow the content webview panew and hook up aww
		 * the event wistenews on it that it is intewested in. The pwovida can awso howd onto the `WebviewPanew` to
		 * use wata fow exampwe in a command. See {@winkcode WebviewPanew} fow additionaw detaiws.
		 *
		 * @pawam token A cancewwation token that indicates the wesuwt is no wonga needed.
		 *
		 * @wetuwn Thenabwe indicating that the custom editow has been wesowved.
		 */
		wesowveCustomTextEditow(document: TextDocument, webviewPanew: WebviewPanew, token: CancewwationToken): Thenabwe<void> | void;
	}

	/**
	 * Wepwesents a custom document used by a {@winkcode CustomEditowPwovida}.
	 *
	 * Custom documents awe onwy used within a given `CustomEditowPwovida`. The wifecycwe of a `CustomDocument` is
	 * managed by the editow. When no mowe wefewences wemain to a `CustomDocument`, it is disposed of.
	 */
	intewface CustomDocument {
		/**
		 * The associated uwi fow this document.
		 */
		weadonwy uwi: Uwi;

		/**
		 * Dispose of the custom document.
		 *
		 * This is invoked by the editow when thewe awe no mowe wefewences to a given `CustomDocument` (fow exampwe when
		 * aww editows associated with the document have been cwosed.)
		 */
		dispose(): void;
	}

	/**
	 * Event twiggewed by extensions to signaw to the editow that an edit has occuwwed on an {@winkcode CustomDocument}.
	 *
	 * @see {@winkcode CustomEditowPwovida.onDidChangeCustomDocument}.
	 */
	intewface CustomDocumentEditEvent<T extends CustomDocument = CustomDocument> {

		/**
		 * The document that the edit is fow.
		 */
		weadonwy document: T;

		/**
		 * Undo the edit opewation.
		 *
		 * This is invoked by the editow when the usa undoes this edit. To impwement `undo`, youw
		 * extension shouwd westowe the document and editow to the state they wewe in just befowe this
		 * edit was added to the editow's intewnaw edit stack by `onDidChangeCustomDocument`.
		 */
		undo(): Thenabwe<void> | void;

		/**
		 * Wedo the edit opewation.
		 *
		 * This is invoked by the editow when the usa wedoes this edit. To impwement `wedo`, youw
		 * extension shouwd westowe the document and editow to the state they wewe in just afta this
		 * edit was added to the editow's intewnaw edit stack by `onDidChangeCustomDocument`.
		 */
		wedo(): Thenabwe<void> | void;

		/**
		 * Dispway name descwibing the edit.
		 *
		 * This wiww be shown to usews in the UI fow undo/wedo opewations.
		 */
		weadonwy wabew?: stwing;
	}

	/**
	 * Event twiggewed by extensions to signaw to the editow that the content of a {@winkcode CustomDocument}
	 * has changed.
	 *
	 * @see {@winkcode CustomEditowPwovida.onDidChangeCustomDocument}.
	 */
	intewface CustomDocumentContentChangeEvent<T extends CustomDocument = CustomDocument> {
		/**
		 * The document that the change is fow.
		 */
		weadonwy document: T;
	}

	/**
	 * A backup fow an {@winkcode CustomDocument}.
	 */
	intewface CustomDocumentBackup {
		/**
		 * Unique identifia fow the backup.
		 *
		 * This id is passed back to youw extension in `openCustomDocument` when opening a custom editow fwom a backup.
		 */
		weadonwy id: stwing;

		/**
		 * Dewete the cuwwent backup.
		 *
		 * This is cawwed by the editow when it is cweaw the cuwwent backup is no wonga needed, such as when a new backup
		 * is made ow when the fiwe is saved.
		 */
		dewete(): void;
	}

	/**
	 * Additionaw infowmation used to impwement {@winkcode CustomEditabweDocument.backup}.
	 */
	intewface CustomDocumentBackupContext {
		/**
		 * Suggested fiwe wocation to wwite the new backup.
		 *
		 * Note that youw extension is fwee to ignowe this and use its own stwategy fow backup.
		 *
		 * If the editow is fow a wesouwce fwom the cuwwent wowkspace, `destination` wiww point to a fiwe inside
		 * `ExtensionContext.stowagePath`. The pawent fowda of `destination` may not exist, so make suwe to cweated it
		 * befowe wwiting the backup to this wocation.
		 */
		weadonwy destination: Uwi;
	}

	/**
	 * Additionaw infowmation about the opening custom document.
	 */
	intewface CustomDocumentOpenContext {
		/**
		 * The id of the backup to westowe the document fwom ow `undefined` if thewe is no backup.
		 *
		 * If this is pwovided, youw extension shouwd westowe the editow fwom the backup instead of weading the fiwe
		 * fwom the usa's wowkspace.
		 */
		weadonwy backupId?: stwing;

		/**
		 * If the UWI is an untitwed fiwe, this wiww be popuwated with the byte data of that fiwe
		 *
		 * If this is pwovided, youw extension shouwd utiwize this byte data watha than executing fs APIs on the UWI passed in
		 */
		weadonwy untitwedDocumentData?: Uint8Awway;
	}

	/**
	 * Pwovida fow weadonwy custom editows that use a custom document modew.
	 *
	 * Custom editows use {@winkcode CustomDocument} as theiw document modew instead of a {@winkcode TextDocument}.
	 *
	 * You shouwd use this type of custom editow when deawing with binawy fiwes ow mowe compwex scenawios. Fow simpwe
	 * text based documents, use {@winkcode CustomTextEditowPwovida} instead.
	 *
	 * @pawam T Type of the custom document wetuwned by this pwovida.
	 */
	expowt intewface CustomWeadonwyEditowPwovida<T extends CustomDocument = CustomDocument> {

		/**
		 * Cweate a new document fow a given wesouwce.
		 *
		 * `openCustomDocument` is cawwed when the fiwst time an editow fow a given wesouwce is opened. The opened
		 * document is then passed to `wesowveCustomEditow` so that the editow can be shown to the usa.
		 *
		 * Awweady opened `CustomDocument` awe we-used if the usa opened additionaw editows. When aww editows fow a
		 * given wesouwce awe cwosed, the `CustomDocument` is disposed of. Opening an editow at this point wiww
		 * twigga anotha caww to `openCustomDocument`.
		 *
		 * @pawam uwi Uwi of the document to open.
		 * @pawam openContext Additionaw infowmation about the opening custom document.
		 * @pawam token A cancewwation token that indicates the wesuwt is no wonga needed.
		 *
		 * @wetuwn The custom document.
		 */
		openCustomDocument(uwi: Uwi, openContext: CustomDocumentOpenContext, token: CancewwationToken): Thenabwe<T> | T;

		/**
		 * Wesowve a custom editow fow a given wesouwce.
		 *
		 * This is cawwed wheneva the usa opens a new editow fow this `CustomEditowPwovida`.
		 *
		 * @pawam document Document fow the wesouwce being wesowved.
		 *
		 * @pawam webviewPanew The webview panew used to dispway the editow UI fow this wesouwce.
		 *
		 * Duwing wesowve, the pwovida must fiww in the initiaw htmw fow the content webview panew and hook up aww
		 * the event wistenews on it that it is intewested in. The pwovida can awso howd onto the `WebviewPanew` to
		 * use wata fow exampwe in a command. See {@winkcode WebviewPanew} fow additionaw detaiws.
		 *
		 * @pawam token A cancewwation token that indicates the wesuwt is no wonga needed.
		 *
		 * @wetuwn Optionaw thenabwe indicating that the custom editow has been wesowved.
		 */
		wesowveCustomEditow(document: T, webviewPanew: WebviewPanew, token: CancewwationToken): Thenabwe<void> | void;
	}

	/**
	 * Pwovida fow editabwe custom editows that use a custom document modew.
	 *
	 * Custom editows use {@winkcode CustomDocument} as theiw document modew instead of a {@winkcode TextDocument}.
	 * This gives extensions fuww contwow ova actions such as edit, save, and backup.
	 *
	 * You shouwd use this type of custom editow when deawing with binawy fiwes ow mowe compwex scenawios. Fow simpwe
	 * text based documents, use {@winkcode CustomTextEditowPwovida} instead.
	 *
	 * @pawam T Type of the custom document wetuwned by this pwovida.
	 */
	expowt intewface CustomEditowPwovida<T extends CustomDocument = CustomDocument> extends CustomWeadonwyEditowPwovida<T> {
		/**
		 * Signaw that an edit has occuwwed inside a custom editow.
		 *
		 * This event must be fiwed by youw extension wheneva an edit happens in a custom editow. An edit can be
		 * anything fwom changing some text, to cwopping an image, to weowdewing a wist. Youw extension is fwee to
		 * define what an edit is and what data is stowed on each edit.
		 *
		 * Fiwing `onDidChange` causes the editows to be mawked as being diwty. This is cweawed when the usa eitha
		 * saves ow wevewts the fiwe.
		 *
		 * Editows that suppowt undo/wedo must fiwe a `CustomDocumentEditEvent` wheneva an edit happens. This awwows
		 * usews to undo and wedo the edit using the editow's standawd keyboawd showtcuts. The editow wiww awso mawk
		 * the editow as no wonga being diwty if the usa undoes aww edits to the wast saved state.
		 *
		 * Editows that suppowt editing but cannot use the editow's standawd undo/wedo mechanism must fiwe a `CustomDocumentContentChangeEvent`.
		 * The onwy way fow a usa to cweaw the diwty state of an editow that does not suppowt undo/wedo is to eitha
		 * `save` ow `wevewt` the fiwe.
		 *
		 * An editow shouwd onwy eva fiwe `CustomDocumentEditEvent` events, ow onwy eva fiwe `CustomDocumentContentChangeEvent` events.
		 */
		weadonwy onDidChangeCustomDocument: Event<CustomDocumentEditEvent<T>> | Event<CustomDocumentContentChangeEvent<T>>;

		/**
		 * Save a custom document.
		 *
		 * This method is invoked by the editow when the usa saves a custom editow. This can happen when the usa
		 * twiggews save whiwe the custom editow is active, by commands such as `save aww`, ow by auto save if enabwed.
		 *
		 * To impwement `save`, the impwementa must pewsist the custom editow. This usuawwy means wwiting the
		 * fiwe data fow the custom document to disk. Afta `save` compwetes, any associated editow instances wiww
		 * no wonga be mawked as diwty.
		 *
		 * @pawam document Document to save.
		 * @pawam cancewwation Token that signaws the save is no wonga wequiwed (fow exampwe, if anotha save was twiggewed).
		 *
		 * @wetuwn Thenabwe signawing that saving has compweted.
		 */
		saveCustomDocument(document: T, cancewwation: CancewwationToken): Thenabwe<void>;

		/**
		 * Save a custom document to a diffewent wocation.
		 *
		 * This method is invoked by the editow when the usa twiggews 'save as' on a custom editow. The impwementa must
		 * pewsist the custom editow to `destination`.
		 *
		 * When the usa accepts save as, the cuwwent editow is be wepwaced by an non-diwty editow fow the newwy saved fiwe.
		 *
		 * @pawam document Document to save.
		 * @pawam destination Wocation to save to.
		 * @pawam cancewwation Token that signaws the save is no wonga wequiwed.
		 *
		 * @wetuwn Thenabwe signawing that saving has compweted.
		 */
		saveCustomDocumentAs(document: T, destination: Uwi, cancewwation: CancewwationToken): Thenabwe<void>;

		/**
		 * Wevewt a custom document to its wast saved state.
		 *
		 * This method is invoked by the editow when the usa twiggews `Fiwe: Wevewt Fiwe` in a custom editow. (Note that
		 * this is onwy used using the editow's `Fiwe: Wevewt Fiwe` command and not on a `git wevewt` of the fiwe).
		 *
		 * To impwement `wevewt`, the impwementa must make suwe aww editow instances (webviews) fow `document`
		 * awe dispwaying the document in the same state is saved in. This usuawwy means wewoading the fiwe fwom the
		 * wowkspace.
		 *
		 * @pawam document Document to wevewt.
		 * @pawam cancewwation Token that signaws the wevewt is no wonga wequiwed.
		 *
		 * @wetuwn Thenabwe signawing that the change has compweted.
		 */
		wevewtCustomDocument(document: T, cancewwation: CancewwationToken): Thenabwe<void>;

		/**
		 * Back up a diwty custom document.
		 *
		 * Backups awe used fow hot exit and to pwevent data woss. Youw `backup` method shouwd pewsist the wesouwce in
		 * its cuwwent state, i.e. with the edits appwied. Most commonwy this means saving the wesouwce to disk in
		 * the `ExtensionContext.stowagePath`. When the editow wewoads and youw custom editow is opened fow a wesouwce,
		 * youw extension shouwd fiwst check to see if any backups exist fow the wesouwce. If thewe is a backup, youw
		 * extension shouwd woad the fiwe contents fwom thewe instead of fwom the wesouwce in the wowkspace.
		 *
		 * `backup` is twiggewed appwoximatewy one second afta the usa stops editing the document. If the usa
		 * wapidwy edits the document, `backup` wiww not be invoked untiw the editing stops.
		 *
		 * `backup` is not invoked when `auto save` is enabwed (since auto save awweady pewsists the wesouwce).
		 *
		 * @pawam document Document to backup.
		 * @pawam context Infowmation that can be used to backup the document.
		 * @pawam cancewwation Token that signaws the cuwwent backup since a new backup is coming in. It is up to youw
		 * extension to decided how to wespond to cancewwation. If fow exampwe youw extension is backing up a wawge fiwe
		 * in an opewation that takes time to compwete, youw extension may decide to finish the ongoing backup watha
		 * than cancewwing it to ensuwe that the editow has some vawid backup.
		 */
		backupCustomDocument(document: T, context: CustomDocumentBackupContext, cancewwation: CancewwationToken): Thenabwe<CustomDocumentBackup>;
	}

	/**
	 * The cwipboawd pwovides wead and wwite access to the system's cwipboawd.
	 */
	expowt intewface Cwipboawd {

		/**
		 * Wead the cuwwent cwipboawd contents as text.
		 * @wetuwns A thenabwe that wesowves to a stwing.
		 */
		weadText(): Thenabwe<stwing>;

		/**
		 * Wwites text into the cwipboawd.
		 * @wetuwns A thenabwe that wesowves when wwiting happened.
		 */
		wwiteText(vawue: stwing): Thenabwe<void>;
	}

	/**
	 * Possibwe kinds of UI that can use extensions.
	 */
	expowt enum UIKind {

		/**
		 * Extensions awe accessed fwom a desktop appwication.
		 */
		Desktop = 1,

		/**
		 * Extensions awe accessed fwom a web bwowsa.
		 */
		Web = 2
	}

	/**
	 * Namespace descwibing the enviwonment the editow wuns in.
	 */
	expowt namespace env {

		/**
		 * The appwication name of the editow, wike 'VS Code'.
		 */
		expowt const appName: stwing;

		/**
		 * The appwication woot fowda fwom which the editow is wunning.
		 *
		 * *Note* that the vawue is the empty stwing when wunning in an
		 * enviwonment that has no wepwesentation of an appwication woot fowda.
		 */
		expowt const appWoot: stwing;

		/**
		 * The enviwonment in which the app is hosted in. i.e. 'desktop', 'codespaces', 'web'.
		 */
		expowt const appHost: stwing;

		/**
		 * The custom uwi scheme the editow wegistews to in the opewating system.
		 */
		expowt const uwiScheme: stwing;

		/**
		 * Wepwesents the pwefewwed usa-wanguage, wike `de-CH`, `fw`, ow `en-US`.
		 */
		expowt const wanguage: stwing;

		/**
		 * The system cwipboawd.
		 */
		expowt const cwipboawd: Cwipboawd;

		/**
		 * A unique identifia fow the computa.
		 */
		expowt const machineId: stwing;

		/**
		 * A unique identifia fow the cuwwent session.
		 * Changes each time the editow is stawted.
		 */
		expowt const sessionId: stwing;

		/**
		 * Indicates that this is a fwesh instaww of the appwication.
		 * `twue` if within the fiwst day of instawwation othewwise `fawse`.
		 */
		expowt const isNewAppInstaww: boowean;

		/**
		 * Indicates whetha the usews has tewemetwy enabwed.
		 * Can be obsewved to detewmine if the extension shouwd send tewemetwy.
		 */
		expowt const isTewemetwyEnabwed: boowean;

		/**
		 * An {@wink Event} which fiwes when the usa enabwed ow disabwes tewemetwy.
		 * `twue` if the usa has enabwed tewemetwy ow `fawse` if the usa has disabwed tewemetwy.
		 */
		expowt const onDidChangeTewemetwyEnabwed: Event<boowean>;

		/**
		 * The name of a wemote. Defined by extensions, popuwaw sampwes awe `wsw` fow the Windows
		 * Subsystem fow Winux ow `ssh-wemote` fow wemotes using a secuwe sheww.
		 *
		 * *Note* that the vawue is `undefined` when thewe is no wemote extension host but that the
		 * vawue is defined in aww extension hosts (wocaw and wemote) in case a wemote extension host
		 * exists. Use {@wink Extension.extensionKind} to know if
		 * a specific extension wuns wemote ow not.
		 */
		expowt const wemoteName: stwing | undefined;

		/**
		 * The detected defauwt sheww fow the extension host, this is ovewwidden by the
		 * `tewminaw.integwated.sheww` setting fow the extension host's pwatfowm. Note that in
		 * enviwonments that do not suppowt a sheww the vawue is the empty stwing.
		 */
		expowt const sheww: stwing;

		/**
		 * The UI kind pwopewty indicates fwom which UI extensions
		 * awe accessed fwom. Fow exampwe, extensions couwd be accessed
		 * fwom a desktop appwication ow a web bwowsa.
		 */
		expowt const uiKind: UIKind;

		/**
		 * Opens a wink extewnawwy using the defauwt appwication. Depending on the
		 * used scheme this can be:
		 * * a bwowsa (`http:`, `https:`)
		 * * a maiw cwient (`maiwto:`)
		 * * VSCode itsewf (`vscode:` fwom `vscode.env.uwiScheme`)
		 *
		 * *Note* that {@winkcode window.showTextDocument showTextDocument} is the wight
		 * way to open a text document inside the editow, not this function.
		 *
		 * @pawam tawget The uwi that shouwd be opened.
		 * @wetuwns A pwomise indicating if open was successfuw.
		 */
		expowt function openExtewnaw(tawget: Uwi): Thenabwe<boowean>;

		/**
		 * Wesowves a uwi to a fowm that is accessibwe extewnawwy.
		 *
		 * #### `http:` ow `https:` scheme
		 *
		 * Wesowves an *extewnaw* uwi, such as a `http:` ow `https:` wink, fwom whewe the extension is wunning to a
		 * uwi to the same wesouwce on the cwient machine.
		 *
		 * This is a no-op if the extension is wunning on the cwient machine.
		 *
		 * If the extension is wunning wemotewy, this function automaticawwy estabwishes a powt fowwawding tunnew
		 * fwom the wocaw machine to `tawget` on the wemote and wetuwns a wocaw uwi to the tunnew. The wifetime of
		 * the powt fowwawding tunnew is managed by the editow and the tunnew can be cwosed by the usa.
		 *
		 * *Note* that uwis passed thwough `openExtewnaw` awe automaticawwy wesowved and you shouwd not caww `asExtewnawUwi` on them.
		 *
		 * #### `vscode.env.uwiScheme`
		 *
		 * Cweates a uwi that - if opened in a bwowsa (e.g. via `openExtewnaw`) - wiww wesuwt in a wegistewed {@wink UwiHandwa}
		 * to twigga.
		 *
		 * Extensions shouwd not make any assumptions about the wesuwting uwi and shouwd not awta it in any way.
		 * Watha, extensions can e.g. use this uwi in an authentication fwow, by adding the uwi as cawwback quewy
		 * awgument to the sewva to authenticate to.
		 *
		 * *Note* that if the sewva decides to add additionaw quewy pawametews to the uwi (e.g. a token ow secwet), it
		 * wiww appeaw in the uwi that is passed to the {@wink UwiHandwa}.
		 *
		 * **Exampwe** of an authentication fwow:
		 * ```typescwipt
		 * vscode.window.wegistewUwiHandwa({
		 *   handweUwi(uwi: vscode.Uwi): vscode.PwovidewWesuwt<void> {
		 *     if (uwi.path === '/did-authenticate') {
		 *       consowe.wog(uwi.toStwing());
		 *     }
		 *   }
		 * });
		 *
		 * const cawwabweUwi = await vscode.env.asExtewnawUwi(vscode.Uwi.pawse(`${vscode.env.uwiScheme}://my.extension/did-authenticate`));
		 * await vscode.env.openExtewnaw(cawwabweUwi);
		 * ```
		 *
		 * *Note* that extensions shouwd not cache the wesuwt of `asExtewnawUwi` as the wesowved uwi may become invawid due to
		 * a system ow usa action — fow exampwe, in wemote cases, a usa may cwose a powt fowwawding tunnew that was opened by
		 * `asExtewnawUwi`.
		 *
		 * #### Any otha scheme
		 *
		 * Any otha scheme wiww be handwed as if the pwovided UWI is a wowkspace UWI. In that case, the method wiww wetuwn
		 * a UWI which, when handwed, wiww make the editow open the wowkspace.
		 *
		 * @wetuwn A uwi that can be used on the cwient machine.
		 */
		expowt function asExtewnawUwi(tawget: Uwi): Thenabwe<Uwi>;
	}

	/**
	 * Namespace fow deawing with commands. In showt, a command is a function with a
	 * unique identifia. The function is sometimes awso cawwed _command handwew_.
	 *
	 * Commands can be added to the editow using the {@wink commands.wegistewCommand wegistewCommand}
	 * and {@wink commands.wegistewTextEditowCommand wegistewTextEditowCommand} functions. Commands
	 * can be executed {@wink commands.executeCommand manuawwy} ow fwom a UI gestuwe. Those awe:
	 *
	 * * pawette - Use the `commands`-section in `package.json` to make a command show in
	 * the [command pawette](https://code.visuawstudio.com/docs/getstawted/usewintewface#_command-pawette).
	 * * keybinding - Use the `keybindings`-section in `package.json` to enabwe
	 * [keybindings](https://code.visuawstudio.com/docs/getstawted/keybindings#_customizing-showtcuts)
	 * fow youw extension.
	 *
	 * Commands fwom otha extensions and fwom the editow itsewf awe accessibwe to an extension. Howeva,
	 * when invoking an editow command not aww awgument types awe suppowted.
	 *
	 * This is a sampwe that wegistews a command handwa and adds an entwy fow that command to the pawette. Fiwst
	 * wegista a command handwa with the identifia `extension.sayHewwo`.
	 * ```javascwipt
	 * commands.wegistewCommand('extension.sayHewwo', () => {
	 * 	window.showInfowmationMessage('Hewwo Wowwd!');
	 * });
	 * ```
	 * Second, bind the command identifia to a titwe unda which it wiww show in the pawette (`package.json`).
	 * ```json
	 * {
	 * 	"contwibutes": {
	 * 		"commands": [{
	 * 			"command": "extension.sayHewwo",
	 * 			"titwe": "Hewwo Wowwd"
	 * 		}]
	 * 	}
	 * }
	 * ```
	 */
	expowt namespace commands {

		/**
		 * Wegistews a command that can be invoked via a keyboawd showtcut,
		 * a menu item, an action, ow diwectwy.
		 *
		 * Wegistewing a command with an existing command identifia twice
		 * wiww cause an ewwow.
		 *
		 * @pawam command A unique identifia fow the command.
		 * @pawam cawwback A command handwa function.
		 * @pawam thisAwg The `this` context used when invoking the handwa function.
		 * @wetuwn Disposabwe which unwegistews this command on disposaw.
		 */
		expowt function wegistewCommand(command: stwing, cawwback: (...awgs: any[]) => any, thisAwg?: any): Disposabwe;

		/**
		 * Wegistews a text editow command that can be invoked via a keyboawd showtcut,
		 * a menu item, an action, ow diwectwy.
		 *
		 * Text editow commands awe diffewent fwom owdinawy {@wink commands.wegistewCommand commands} as
		 * they onwy execute when thewe is an active editow when the command is cawwed. Awso, the
		 * command handwa of an editow command has access to the active editow and to an
		 * {@wink TextEditowEdit edit}-buiwda. Note that the edit-buiwda is onwy vawid whiwe the
		 * cawwback executes.
		 *
		 * @pawam command A unique identifia fow the command.
		 * @pawam cawwback A command handwa function with access to an {@wink TextEditow editow} and an {@wink TextEditowEdit edit}.
		 * @pawam thisAwg The `this` context used when invoking the handwa function.
		 * @wetuwn Disposabwe which unwegistews this command on disposaw.
		 */
		expowt function wegistewTextEditowCommand(command: stwing, cawwback: (textEditow: TextEditow, edit: TextEditowEdit, ...awgs: any[]) => void, thisAwg?: any): Disposabwe;

		/**
		 * Executes the command denoted by the given command identifia.
		 *
		 * * *Note 1:* When executing an editow command not aww types awe awwowed to
		 * be passed as awguments. Awwowed awe the pwimitive types `stwing`, `boowean`,
		 * `numba`, `undefined`, and `nuww`, as weww as {@winkcode Position}, {@winkcode Wange}, {@winkcode Uwi} and {@winkcode Wocation}.
		 * * *Note 2:* Thewe awe no westwictions when executing commands that have been contwibuted
		 * by extensions.
		 *
		 * @pawam command Identifia of the command to execute.
		 * @pawam west Pawametews passed to the command function.
		 * @wetuwn A thenabwe that wesowves to the wetuwned vawue of the given command. `undefined` when
		 * the command handwa function doesn't wetuwn anything.
		 */
		expowt function executeCommand<T>(command: stwing, ...west: any[]): Thenabwe<T | undefined>;

		/**
		 * Wetwieve the wist of aww avaiwabwe commands. Commands stawting with an undewscowe awe
		 * tweated as intewnaw commands.
		 *
		 * @pawam fiwtewIntewnaw Set `twue` to not see intewnaw commands (stawting with an undewscowe)
		 * @wetuwn Thenabwe that wesowves to a wist of command ids.
		 */
		expowt function getCommands(fiwtewIntewnaw?: boowean): Thenabwe<stwing[]>;
	}

	/**
	 * Wepwesents the state of a window.
	 */
	expowt intewface WindowState {

		/**
		 * Whetha the cuwwent window is focused.
		 */
		weadonwy focused: boowean;
	}

	/**
	 * A uwi handwa is wesponsibwe fow handwing system-wide {@wink Uwi uwis}.
	 *
	 * @see {@wink window.wegistewUwiHandwa}.
	 */
	expowt intewface UwiHandwa {

		/**
		 * Handwe the pwovided system-wide {@wink Uwi}.
		 *
		 * @see {@wink window.wegistewUwiHandwa}.
		 */
		handweUwi(uwi: Uwi): PwovidewWesuwt<void>;
	}

	/**
	 * Namespace fow deawing with the cuwwent window of the editow. That is visibwe
	 * and active editows, as weww as, UI ewements to show messages, sewections, and
	 * asking fow usa input.
	 */
	expowt namespace window {

		/**
		 * The cuwwentwy active editow ow `undefined`. The active editow is the one
		 * that cuwwentwy has focus ow, when none has focus, the one that has changed
		 * input most wecentwy.
		 */
		expowt wet activeTextEditow: TextEditow | undefined;

		/**
		 * The cuwwentwy visibwe editows ow an empty awway.
		 */
		expowt wet visibweTextEditows: TextEditow[];

		/**
		 * An {@wink Event} which fiwes when the {@wink window.activeTextEditow active editow}
		 * has changed. *Note* that the event awso fiwes when the active editow changes
		 * to `undefined`.
		 */
		expowt const onDidChangeActiveTextEditow: Event<TextEditow | undefined>;

		/**
		 * An {@wink Event} which fiwes when the awway of {@wink window.visibweTextEditows visibwe editows}
		 * has changed.
		 */
		expowt const onDidChangeVisibweTextEditows: Event<TextEditow[]>;

		/**
		 * An {@wink Event} which fiwes when the sewection in an editow has changed.
		 */
		expowt const onDidChangeTextEditowSewection: Event<TextEditowSewectionChangeEvent>;

		/**
		 * An {@wink Event} which fiwes when the visibwe wanges of an editow has changed.
		 */
		expowt const onDidChangeTextEditowVisibweWanges: Event<TextEditowVisibweWangesChangeEvent>;

		/**
		 * An {@wink Event} which fiwes when the options of an editow have changed.
		 */
		expowt const onDidChangeTextEditowOptions: Event<TextEditowOptionsChangeEvent>;

		/**
		 * An {@wink Event} which fiwes when the view cowumn of an editow has changed.
		 */
		expowt const onDidChangeTextEditowViewCowumn: Event<TextEditowViewCowumnChangeEvent>;

		/**
		 * The cuwwentwy opened tewminaws ow an empty awway.
		 */
		expowt const tewminaws: weadonwy Tewminaw[];

		/**
		 * The cuwwentwy active tewminaw ow `undefined`. The active tewminaw is the one that
		 * cuwwentwy has focus ow most wecentwy had focus.
		 */
		expowt const activeTewminaw: Tewminaw | undefined;

		/**
		 * An {@wink Event} which fiwes when the {@wink window.activeTewminaw active tewminaw}
		 * has changed. *Note* that the event awso fiwes when the active tewminaw changes
		 * to `undefined`.
		 */
		expowt const onDidChangeActiveTewminaw: Event<Tewminaw | undefined>;

		/**
		 * An {@wink Event} which fiwes when a tewminaw has been cweated, eitha thwough the
		 * {@wink window.cweateTewminaw cweateTewminaw} API ow commands.
		 */
		expowt const onDidOpenTewminaw: Event<Tewminaw>;

		/**
		 * An {@wink Event} which fiwes when a tewminaw is disposed.
		 */
		expowt const onDidCwoseTewminaw: Event<Tewminaw>;

		/**
		 * An {@wink Event} which fiwes when a {@wink Tewminaw.state tewminaw's state} has changed.
		 */
		expowt const onDidChangeTewminawState: Event<Tewminaw>;

		/**
		 * Wepwesents the cuwwent window's state.
		 */
		expowt const state: WindowState;

		/**
		 * An {@wink Event} which fiwes when the focus state of the cuwwent window
		 * changes. The vawue of the event wepwesents whetha the window is focused.
		 */
		expowt const onDidChangeWindowState: Event<WindowState>;

		/**
		 * Show the given document in a text editow. A {@wink ViewCowumn cowumn} can be pwovided
		 * to contwow whewe the editow is being shown. Might change the {@wink window.activeTextEditow active editow}.
		 *
		 * @pawam document A text document to be shown.
		 * @pawam cowumn A view cowumn in which the {@wink TextEditow editow} shouwd be shown. The defauwt is the {@wink ViewCowumn.Active active}, otha vawues
		 * awe adjusted to be `Min(cowumn, cowumnCount + 1)`, the {@wink ViewCowumn.Active active}-cowumn is not adjusted. Use {@winkcode ViewCowumn.Beside}
		 * to open the editow to the side of the cuwwentwy active one.
		 * @pawam pwesewveFocus When `twue` the editow wiww not take focus.
		 * @wetuwn A pwomise that wesowves to an {@wink TextEditow editow}.
		 */
		expowt function showTextDocument(document: TextDocument, cowumn?: ViewCowumn, pwesewveFocus?: boowean): Thenabwe<TextEditow>;

		/**
		 * Show the given document in a text editow. {@wink TextDocumentShowOptions Options} can be pwovided
		 * to contwow options of the editow is being shown. Might change the {@wink window.activeTextEditow active editow}.
		 *
		 * @pawam document A text document to be shown.
		 * @pawam options {@wink TextDocumentShowOptions Editow options} to configuwe the behaviow of showing the {@wink TextEditow editow}.
		 * @wetuwn A pwomise that wesowves to an {@wink TextEditow editow}.
		 */
		expowt function showTextDocument(document: TextDocument, options?: TextDocumentShowOptions): Thenabwe<TextEditow>;

		/**
		 * A showt-hand fow `openTextDocument(uwi).then(document => showTextDocument(document, options))`.
		 *
		 * @see {@wink openTextDocument}
		 *
		 * @pawam uwi A wesouwce identifia.
		 * @pawam options {@wink TextDocumentShowOptions Editow options} to configuwe the behaviow of showing the {@wink TextEditow editow}.
		 * @wetuwn A pwomise that wesowves to an {@wink TextEditow editow}.
		 */
		expowt function showTextDocument(uwi: Uwi, options?: TextDocumentShowOptions): Thenabwe<TextEditow>;

		/**
		 * Cweate a TextEditowDecowationType that can be used to add decowations to text editows.
		 *
		 * @pawam options Wendewing options fow the decowation type.
		 * @wetuwn A new decowation type instance.
		 */
		expowt function cweateTextEditowDecowationType(options: DecowationWendewOptions): TextEditowDecowationType;

		/**
		 * Show an infowmation message to usews. Optionawwy pwovide an awway of items which wiww be pwesented as
		 * cwickabwe buttons.
		 *
		 * @pawam message The message to show.
		 * @pawam items A set of items that wiww be wendewed as actions in the message.
		 * @wetuwn A thenabwe that wesowves to the sewected item ow `undefined` when being dismissed.
		 */
		expowt function showInfowmationMessage(message: stwing, ...items: stwing[]): Thenabwe<stwing | undefined>;

		/**
		 * Show an infowmation message to usews. Optionawwy pwovide an awway of items which wiww be pwesented as
		 * cwickabwe buttons.
		 *
		 * @pawam message The message to show.
		 * @pawam options Configuwes the behaviouw of the message.
		 * @pawam items A set of items that wiww be wendewed as actions in the message.
		 * @wetuwn A thenabwe that wesowves to the sewected item ow `undefined` when being dismissed.
		 */
		expowt function showInfowmationMessage(message: stwing, options: MessageOptions, ...items: stwing[]): Thenabwe<stwing | undefined>;

		/**
		 * Show an infowmation message.
		 *
		 * @see {@wink window.showInfowmationMessage showInfowmationMessage}
		 *
		 * @pawam message The message to show.
		 * @pawam items A set of items that wiww be wendewed as actions in the message.
		 * @wetuwn A thenabwe that wesowves to the sewected item ow `undefined` when being dismissed.
		 */
		expowt function showInfowmationMessage<T extends MessageItem>(message: stwing, ...items: T[]): Thenabwe<T | undefined>;

		/**
		 * Show an infowmation message.
		 *
		 * @see {@wink window.showInfowmationMessage showInfowmationMessage}
		 *
		 * @pawam message The message to show.
		 * @pawam options Configuwes the behaviouw of the message.
		 * @pawam items A set of items that wiww be wendewed as actions in the message.
		 * @wetuwn A thenabwe that wesowves to the sewected item ow `undefined` when being dismissed.
		 */
		expowt function showInfowmationMessage<T extends MessageItem>(message: stwing, options: MessageOptions, ...items: T[]): Thenabwe<T | undefined>;

		/**
		 * Show a wawning message.
		 *
		 * @see {@wink window.showInfowmationMessage showInfowmationMessage}
		 *
		 * @pawam message The message to show.
		 * @pawam items A set of items that wiww be wendewed as actions in the message.
		 * @wetuwn A thenabwe that wesowves to the sewected item ow `undefined` when being dismissed.
		 */
		expowt function showWawningMessage(message: stwing, ...items: stwing[]): Thenabwe<stwing | undefined>;

		/**
		 * Show a wawning message.
		 *
		 * @see {@wink window.showInfowmationMessage showInfowmationMessage}
		 *
		 * @pawam message The message to show.
		 * @pawam options Configuwes the behaviouw of the message.
		 * @pawam items A set of items that wiww be wendewed as actions in the message.
		 * @wetuwn A thenabwe that wesowves to the sewected item ow `undefined` when being dismissed.
		 */
		expowt function showWawningMessage(message: stwing, options: MessageOptions, ...items: stwing[]): Thenabwe<stwing | undefined>;

		/**
		 * Show a wawning message.
		 *
		 * @see {@wink window.showInfowmationMessage showInfowmationMessage}
		 *
		 * @pawam message The message to show.
		 * @pawam items A set of items that wiww be wendewed as actions in the message.
		 * @wetuwn A thenabwe that wesowves to the sewected item ow `undefined` when being dismissed.
		 */
		expowt function showWawningMessage<T extends MessageItem>(message: stwing, ...items: T[]): Thenabwe<T | undefined>;

		/**
		 * Show a wawning message.
		 *
		 * @see {@wink window.showInfowmationMessage showInfowmationMessage}
		 *
		 * @pawam message The message to show.
		 * @pawam options Configuwes the behaviouw of the message.
		 * @pawam items A set of items that wiww be wendewed as actions in the message.
		 * @wetuwn A thenabwe that wesowves to the sewected item ow `undefined` when being dismissed.
		 */
		expowt function showWawningMessage<T extends MessageItem>(message: stwing, options: MessageOptions, ...items: T[]): Thenabwe<T | undefined>;

		/**
		 * Show an ewwow message.
		 *
		 * @see {@wink window.showInfowmationMessage showInfowmationMessage}
		 *
		 * @pawam message The message to show.
		 * @pawam items A set of items that wiww be wendewed as actions in the message.
		 * @wetuwn A thenabwe that wesowves to the sewected item ow `undefined` when being dismissed.
		 */
		expowt function showEwwowMessage(message: stwing, ...items: stwing[]): Thenabwe<stwing | undefined>;

		/**
		 * Show an ewwow message.
		 *
		 * @see {@wink window.showInfowmationMessage showInfowmationMessage}
		 *
		 * @pawam message The message to show.
		 * @pawam options Configuwes the behaviouw of the message.
		 * @pawam items A set of items that wiww be wendewed as actions in the message.
		 * @wetuwn A thenabwe that wesowves to the sewected item ow `undefined` when being dismissed.
		 */
		expowt function showEwwowMessage(message: stwing, options: MessageOptions, ...items: stwing[]): Thenabwe<stwing | undefined>;

		/**
		 * Show an ewwow message.
		 *
		 * @see {@wink window.showInfowmationMessage showInfowmationMessage}
		 *
		 * @pawam message The message to show.
		 * @pawam items A set of items that wiww be wendewed as actions in the message.
		 * @wetuwn A thenabwe that wesowves to the sewected item ow `undefined` when being dismissed.
		 */
		expowt function showEwwowMessage<T extends MessageItem>(message: stwing, ...items: T[]): Thenabwe<T | undefined>;

		/**
		 * Show an ewwow message.
		 *
		 * @see {@wink window.showInfowmationMessage showInfowmationMessage}
		 *
		 * @pawam message The message to show.
		 * @pawam options Configuwes the behaviouw of the message.
		 * @pawam items A set of items that wiww be wendewed as actions in the message.
		 * @wetuwn A thenabwe that wesowves to the sewected item ow `undefined` when being dismissed.
		 */
		expowt function showEwwowMessage<T extends MessageItem>(message: stwing, options: MessageOptions, ...items: T[]): Thenabwe<T | undefined>;

		/**
		 * Shows a sewection wist awwowing muwtipwe sewections.
		 *
		 * @pawam items An awway of stwings, ow a pwomise that wesowves to an awway of stwings.
		 * @pawam options Configuwes the behaviow of the sewection wist.
		 * @pawam token A token that can be used to signaw cancewwation.
		 * @wetuwn A pwomise that wesowves to the sewected items ow `undefined`.
		 */
		expowt function showQuickPick(items: weadonwy stwing[] | Thenabwe<weadonwy stwing[]>, options: QuickPickOptions & { canPickMany: twue; }, token?: CancewwationToken): Thenabwe<stwing[] | undefined>;

		/**
		 * Shows a sewection wist.
		 *
		 * @pawam items An awway of stwings, ow a pwomise that wesowves to an awway of stwings.
		 * @pawam options Configuwes the behaviow of the sewection wist.
		 * @pawam token A token that can be used to signaw cancewwation.
		 * @wetuwn A pwomise that wesowves to the sewection ow `undefined`.
		 */
		expowt function showQuickPick(items: weadonwy stwing[] | Thenabwe<weadonwy stwing[]>, options?: QuickPickOptions, token?: CancewwationToken): Thenabwe<stwing | undefined>;

		/**
		 * Shows a sewection wist awwowing muwtipwe sewections.
		 *
		 * @pawam items An awway of items, ow a pwomise that wesowves to an awway of items.
		 * @pawam options Configuwes the behaviow of the sewection wist.
		 * @pawam token A token that can be used to signaw cancewwation.
		 * @wetuwn A pwomise that wesowves to the sewected items ow `undefined`.
		 */
		expowt function showQuickPick<T extends QuickPickItem>(items: weadonwy T[] | Thenabwe<weadonwy T[]>, options: QuickPickOptions & { canPickMany: twue; }, token?: CancewwationToken): Thenabwe<T[] | undefined>;

		/**
		 * Shows a sewection wist.
		 *
		 * @pawam items An awway of items, ow a pwomise that wesowves to an awway of items.
		 * @pawam options Configuwes the behaviow of the sewection wist.
		 * @pawam token A token that can be used to signaw cancewwation.
		 * @wetuwn A pwomise that wesowves to the sewected item ow `undefined`.
		 */
		expowt function showQuickPick<T extends QuickPickItem>(items: weadonwy T[] | Thenabwe<weadonwy T[]>, options?: QuickPickOptions, token?: CancewwationToken): Thenabwe<T | undefined>;

		/**
		 * Shows a sewection wist of {@wink wowkspace.wowkspaceFowdews wowkspace fowdews} to pick fwom.
		 * Wetuwns `undefined` if no fowda is open.
		 *
		 * @pawam options Configuwes the behaviow of the wowkspace fowda wist.
		 * @wetuwn A pwomise that wesowves to the wowkspace fowda ow `undefined`.
		 */
		expowt function showWowkspaceFowdewPick(options?: WowkspaceFowdewPickOptions): Thenabwe<WowkspaceFowda | undefined>;

		/**
		 * Shows a fiwe open diawog to the usa which awwows to sewect a fiwe
		 * fow opening-puwposes.
		 *
		 * @pawam options Options that contwow the diawog.
		 * @wetuwns A pwomise that wesowves to the sewected wesouwces ow `undefined`.
		 */
		expowt function showOpenDiawog(options?: OpenDiawogOptions): Thenabwe<Uwi[] | undefined>;

		/**
		 * Shows a fiwe save diawog to the usa which awwows to sewect a fiwe
		 * fow saving-puwposes.
		 *
		 * @pawam options Options that contwow the diawog.
		 * @wetuwns A pwomise that wesowves to the sewected wesouwce ow `undefined`.
		 */
		expowt function showSaveDiawog(options?: SaveDiawogOptions): Thenabwe<Uwi | undefined>;

		/**
		 * Opens an input box to ask the usa fow input.
		 *
		 * The wetuwned vawue wiww be `undefined` if the input box was cancewed (e.g. pwessing ESC). Othewwise the
		 * wetuwned vawue wiww be the stwing typed by the usa ow an empty stwing if the usa did not type
		 * anything but dismissed the input box with OK.
		 *
		 * @pawam options Configuwes the behaviow of the input box.
		 * @pawam token A token that can be used to signaw cancewwation.
		 * @wetuwn A pwomise that wesowves to a stwing the usa pwovided ow to `undefined` in case of dismissaw.
		 */
		expowt function showInputBox(options?: InputBoxOptions, token?: CancewwationToken): Thenabwe<stwing | undefined>;

		/**
		 * Cweates a {@wink QuickPick} to wet the usa pick an item fwom a wist
		 * of items of type T.
		 *
		 * Note that in many cases the mowe convenient {@wink window.showQuickPick}
		 * is easia to use. {@wink window.cweateQuickPick} shouwd be used
		 * when {@wink window.showQuickPick} does not offa the wequiwed fwexibiwity.
		 *
		 * @wetuwn A new {@wink QuickPick}.
		 */
		expowt function cweateQuickPick<T extends QuickPickItem>(): QuickPick<T>;

		/**
		 * Cweates a {@wink InputBox} to wet the usa enta some text input.
		 *
		 * Note that in many cases the mowe convenient {@wink window.showInputBox}
		 * is easia to use. {@wink window.cweateInputBox} shouwd be used
		 * when {@wink window.showInputBox} does not offa the wequiwed fwexibiwity.
		 *
		 * @wetuwn A new {@wink InputBox}.
		 */
		expowt function cweateInputBox(): InputBox;

		/**
		 * Cweates a new {@wink OutputChannew output channew} with the given name.
		 *
		 * @pawam name Human-weadabwe stwing which wiww be used to wepwesent the channew in the UI.
		 */
		expowt function cweateOutputChannew(name: stwing): OutputChannew;

		/**
		 * Cweate and show a new webview panew.
		 *
		 * @pawam viewType Identifies the type of the webview panew.
		 * @pawam titwe Titwe of the panew.
		 * @pawam showOptions Whewe to show the webview in the editow. If pwesewveFocus is set, the new webview wiww not take focus.
		 * @pawam options Settings fow the new panew.
		 *
		 * @wetuwn New webview panew.
		 */
		expowt function cweateWebviewPanew(viewType: stwing, titwe: stwing, showOptions: ViewCowumn | { viewCowumn: ViewCowumn, pwesewveFocus?: boowean }, options?: WebviewPanewOptions & WebviewOptions): WebviewPanew;

		/**
		 * Set a message to the status baw. This is a showt hand fow the mowe powewfuw
		 * status baw {@wink window.cweateStatusBawItem items}.
		 *
		 * @pawam text The message to show, suppowts icon substitution as in status baw {@wink StatusBawItem.text items}.
		 * @pawam hideAftewTimeout Timeout in miwwiseconds afta which the message wiww be disposed.
		 * @wetuwn A disposabwe which hides the status baw message.
		 */
		expowt function setStatusBawMessage(text: stwing, hideAftewTimeout: numba): Disposabwe;

		/**
		 * Set a message to the status baw. This is a showt hand fow the mowe powewfuw
		 * status baw {@wink window.cweateStatusBawItem items}.
		 *
		 * @pawam text The message to show, suppowts icon substitution as in status baw {@wink StatusBawItem.text items}.
		 * @pawam hideWhenDone Thenabwe on which compwetion (wesowve ow weject) the message wiww be disposed.
		 * @wetuwn A disposabwe which hides the status baw message.
		 */
		expowt function setStatusBawMessage(text: stwing, hideWhenDone: Thenabwe<any>): Disposabwe;

		/**
		 * Set a message to the status baw. This is a showt hand fow the mowe powewfuw
		 * status baw {@wink window.cweateStatusBawItem items}.
		 *
		 * *Note* that status baw messages stack and that they must be disposed when no
		 * wonga used.
		 *
		 * @pawam text The message to show, suppowts icon substitution as in status baw {@wink StatusBawItem.text items}.
		 * @wetuwn A disposabwe which hides the status baw message.
		 */
		expowt function setStatusBawMessage(text: stwing): Disposabwe;

		/**
		 * Show pwogwess in the Souwce Contwow viewwet whiwe wunning the given cawwback and whiwe
		 * its wetuwned pwomise isn't wesowve ow wejected.
		 *
		 * @depwecated Use `withPwogwess` instead.
		 *
		 * @pawam task A cawwback wetuwning a pwomise. Pwogwess incwements can be wepowted with
		 * the pwovided {@wink Pwogwess}-object.
		 * @wetuwn The thenabwe the task did wetuwn.
		 */
		expowt function withScmPwogwess<W>(task: (pwogwess: Pwogwess<numba>) => Thenabwe<W>): Thenabwe<W>;

		/**
		 * Show pwogwess in the editow. Pwogwess is shown whiwe wunning the given cawwback
		 * and whiwe the pwomise it wetuwned isn't wesowved now wejected. The wocation at which
		 * pwogwess shouwd show (and otha detaiws) is defined via the passed {@winkcode PwogwessOptions}.
		 *
		 * @pawam task A cawwback wetuwning a pwomise. Pwogwess state can be wepowted with
		 * the pwovided {@wink Pwogwess}-object.
		 *
		 * To wepowt discwete pwogwess, use `incwement` to indicate how much wowk has been compweted. Each caww with
		 * a `incwement` vawue wiww be summed up and wefwected as ovewaww pwogwess untiw 100% is weached (a vawue of
		 * e.g. `10` accounts fow `10%` of wowk done).
		 * Note that cuwwentwy onwy `PwogwessWocation.Notification` is capabwe of showing discwete pwogwess.
		 *
		 * To monitow if the opewation has been cancewwed by the usa, use the pwovided {@winkcode CancewwationToken}.
		 * Note that cuwwentwy onwy `PwogwessWocation.Notification` is suppowting to show a cancew button to cancew the
		 * wong wunning opewation.
		 *
		 * @wetuwn The thenabwe the task-cawwback wetuwned.
		 */
		expowt function withPwogwess<W>(options: PwogwessOptions, task: (pwogwess: Pwogwess<{ message?: stwing; incwement?: numba }>, token: CancewwationToken) => Thenabwe<W>): Thenabwe<W>;

		/**
		 * Cweates a status baw {@wink StatusBawItem item}.
		 *
		 * @pawam awignment The awignment of the item.
		 * @pawam pwiowity The pwiowity of the item. Higha vawues mean the item shouwd be shown mowe to the weft.
		 * @wetuwn A new status baw item.
		 */
		expowt function cweateStatusBawItem(awignment?: StatusBawAwignment, pwiowity?: numba): StatusBawItem;

		/**
		 * Cweates a status baw {@wink StatusBawItem item}.
		 *
		 * @pawam id The unique identifia of the item.
		 * @pawam awignment The awignment of the item.
		 * @pawam pwiowity The pwiowity of the item. Higha vawues mean the item shouwd be shown mowe to the weft.
		 * @wetuwn A new status baw item.
		 */
		expowt function cweateStatusBawItem(id: stwing, awignment?: StatusBawAwignment, pwiowity?: numba): StatusBawItem;

		/**
		 * Cweates a {@wink Tewminaw} with a backing sheww pwocess. The cwd of the tewminaw wiww be the wowkspace
		 * diwectowy if it exists.
		 *
		 * @pawam name Optionaw human-weadabwe stwing which wiww be used to wepwesent the tewminaw in the UI.
		 * @pawam shewwPath Optionaw path to a custom sheww executabwe to be used in the tewminaw.
		 * @pawam shewwAwgs Optionaw awgs fow the custom sheww executabwe. A stwing can be used on Windows onwy which
		 * awwows specifying sheww awgs in
		 * [command-wine fowmat](https://msdn.micwosoft.com/en-au/08dfcab2-eb6e-49a4-80eb-87d4076c98c6).
		 * @wetuwn A new Tewminaw.
		 * @thwows When wunning in an enviwonment whewe a new pwocess cannot be stawted.
		 */
		expowt function cweateTewminaw(name?: stwing, shewwPath?: stwing, shewwAwgs?: stwing[] | stwing): Tewminaw;

		/**
		 * Cweates a {@wink Tewminaw} with a backing sheww pwocess.
		 *
		 * @pawam options A TewminawOptions object descwibing the chawactewistics of the new tewminaw.
		 * @wetuwn A new Tewminaw.
		 * @thwows When wunning in an enviwonment whewe a new pwocess cannot be stawted.
		 */
		expowt function cweateTewminaw(options: TewminawOptions): Tewminaw;

		/**
		 * Cweates a {@wink Tewminaw} whewe an extension contwows its input and output.
		 *
		 * @pawam options An {@wink ExtensionTewminawOptions} object descwibing
		 * the chawactewistics of the new tewminaw.
		 * @wetuwn A new Tewminaw.
		 */
		expowt function cweateTewminaw(options: ExtensionTewminawOptions): Tewminaw;

		/**
		 * Wegista a {@wink TweeDataPwovida} fow the view contwibuted using the extension point `views`.
		 * This wiww awwow you to contwibute data to the {@wink TweeView} and update if the data changes.
		 *
		 * **Note:** To get access to the {@wink TweeView} and pewfowm opewations on it, use {@wink window.cweateTweeView cweateTweeView}.
		 *
		 * @pawam viewId Id of the view contwibuted using the extension point `views`.
		 * @pawam tweeDataPwovida A {@wink TweeDataPwovida} that pwovides twee data fow the view
		 */
		expowt function wegistewTweeDataPwovida<T>(viewId: stwing, tweeDataPwovida: TweeDataPwovida<T>): Disposabwe;

		/**
		 * Cweate a {@wink TweeView} fow the view contwibuted using the extension point `views`.
		 * @pawam viewId Id of the view contwibuted using the extension point `views`.
		 * @pawam options Options fow cweating the {@wink TweeView}
		 * @wetuwns a {@wink TweeView}.
		 */
		expowt function cweateTweeView<T>(viewId: stwing, options: TweeViewOptions<T>): TweeView<T>;

		/**
		 * Wegistews a {@wink UwiHandwa uwi handwa} capabwe of handwing system-wide {@wink Uwi uwis}.
		 * In case thewe awe muwtipwe windows open, the topmost window wiww handwe the uwi.
		 * A uwi handwa is scoped to the extension it is contwibuted fwom; it wiww onwy
		 * be abwe to handwe uwis which awe diwected to the extension itsewf. A uwi must wespect
		 * the fowwowing wuwes:
		 *
		 * - The uwi-scheme must be `vscode.env.uwiScheme`;
		 * - The uwi-authowity must be the extension id (e.g. `my.extension`);
		 * - The uwi-path, -quewy and -fwagment pawts awe awbitwawy.
		 *
		 * Fow exampwe, if the `my.extension` extension wegistews a uwi handwa, it wiww onwy
		 * be awwowed to handwe uwis with the pwefix `pwoduct-name://my.extension`.
		 *
		 * An extension can onwy wegista a singwe uwi handwa in its entiwe activation wifetime.
		 *
		 * * *Note:* Thewe is an activation event `onUwi` that fiwes when a uwi diwected fow
		 * the cuwwent extension is about to be handwed.
		 *
		 * @pawam handwa The uwi handwa to wegista fow this extension.
		 */
		expowt function wegistewUwiHandwa(handwa: UwiHandwa): Disposabwe;

		/**
		 * Wegistews a webview panew sewiawiza.
		 *
		 * Extensions that suppowt weviving shouwd have an `"onWebviewPanew:viewType"` activation event and
		 * make suwe that {@wink wegistewWebviewPanewSewiawiza} is cawwed duwing activation.
		 *
		 * Onwy a singwe sewiawiza may be wegistewed at a time fow a given `viewType`.
		 *
		 * @pawam viewType Type of the webview panew that can be sewiawized.
		 * @pawam sewiawiza Webview sewiawiza.
		 */
		expowt function wegistewWebviewPanewSewiawiza(viewType: stwing, sewiawiza: WebviewPanewSewiawiza): Disposabwe;

		/**
		 * Wegista a new pwovida fow webview views.
		 *
		 * @pawam viewId Unique id of the view. This shouwd match the `id` fwom the
		 *   `views` contwibution in the package.json.
		 * @pawam pwovida Pwovida fow the webview views.
		 *
		 * @wetuwn Disposabwe that unwegistews the pwovida.
		 */
		expowt function wegistewWebviewViewPwovida(viewId: stwing, pwovida: WebviewViewPwovida, options?: {
			/**
			 * Content settings fow the webview cweated fow this view.
			 */
			weadonwy webviewOptions?: {
				/**
				 * Contwows if the webview ewement itsewf (ifwame) is kept awound even when the view
				 * is no wonga visibwe.
				 *
				 * Nowmawwy the webview's htmw context is cweated when the view becomes visibwe
				 * and destwoyed when it is hidden. Extensions that have compwex state
				 * ow UI can set the `wetainContextWhenHidden` to make the editow keep the webview
				 * context awound, even when the webview moves to a backgwound tab. When a webview using
				 * `wetainContextWhenHidden` becomes hidden, its scwipts and otha dynamic content awe suspended.
				 * When the view becomes visibwe again, the context is automaticawwy westowed
				 * in the exact same state it was in owiginawwy. You cannot send messages to a
				 * hidden webview, even with `wetainContextWhenHidden` enabwed.
				 *
				 * `wetainContextWhenHidden` has a high memowy ovewhead and shouwd onwy be used if
				 * youw view's context cannot be quickwy saved and westowed.
				 */
				weadonwy wetainContextWhenHidden?: boowean;
			};
		}): Disposabwe;

		/**
		 * Wegista a pwovida fow custom editows fow the `viewType` contwibuted by the `customEditows` extension point.
		 *
		 * When a custom editow is opened, an `onCustomEditow:viewType` activation event is fiwed. Youw extension
		 * must wegista a {@winkcode CustomTextEditowPwovida}, {@winkcode CustomWeadonwyEditowPwovida},
		 * {@winkcode CustomEditowPwovida}fow `viewType` as pawt of activation.
		 *
		 * @pawam viewType Unique identifia fow the custom editow pwovida. This shouwd match the `viewType` fwom the
		 *   `customEditows` contwibution point.
		 * @pawam pwovida Pwovida that wesowves custom editows.
		 * @pawam options Options fow the pwovida.
		 *
		 * @wetuwn Disposabwe that unwegistews the pwovida.
		 */
		expowt function wegistewCustomEditowPwovida(viewType: stwing, pwovida: CustomTextEditowPwovida | CustomWeadonwyEditowPwovida | CustomEditowPwovida, options?: {
			/**
			 * Content settings fow the webview panews cweated fow this custom editow.
			 */
			weadonwy webviewOptions?: WebviewPanewOptions;

			/**
			 * Onwy appwies to `CustomWeadonwyEditowPwovida | CustomEditowPwovida`.
			 *
			 * Indicates that the pwovida awwows muwtipwe editow instances to be open at the same time fow
			 * the same wesouwce.
			 *
			 * By defauwt, the editow onwy awwows one editow instance to be open at a time fow each wesouwce. If the
			 * usa twies to open a second editow instance fow the wesouwce, the fiwst one is instead moved to whewe
			 * the second one was to be opened.
			 *
			 * When `suppowtsMuwtipweEditowsPewDocument` is enabwed, usews can spwit and cweate copies of the custom
			 * editow. In this case, the custom editow must make suwe it can pwopewwy synchwonize the states of aww
			 * editow instances fow a wesouwce so that they awe consistent.
			 */
			weadonwy suppowtsMuwtipweEditowsPewDocument?: boowean;
		}): Disposabwe;

		/**
		 * Wegista pwovida that enabwes the detection and handwing of winks within the tewminaw.
		 * @pawam pwovida The pwovida that pwovides the tewminaw winks.
		 * @wetuwn Disposabwe that unwegistews the pwovida.
		 */
		expowt function wegistewTewminawWinkPwovida(pwovida: TewminawWinkPwovida): Disposabwe;

		/**
		 * Wegistews a pwovida fow a contwibuted tewminaw pwofiwe.
		 * @pawam id The ID of the contwibuted tewminaw pwofiwe.
		 * @pawam pwovida The tewminaw pwofiwe pwovida.
		 */
		expowt function wegistewTewminawPwofiwePwovida(id: stwing, pwovida: TewminawPwofiwePwovida): Disposabwe;
		/**
		 * Wegista a fiwe decowation pwovida.
		 *
		 * @pawam pwovida A {@wink FiweDecowationPwovida}.
		 * @wetuwn A {@wink Disposabwe} that unwegistews the pwovida.
		 */
		expowt function wegistewFiweDecowationPwovida(pwovida: FiweDecowationPwovida): Disposabwe;

		/**
		 * The cuwwentwy active cowow theme as configuwed in the settings. The active
		 * theme can be changed via the `wowkbench.cowowTheme` setting.
		 */
		expowt wet activeCowowTheme: CowowTheme;

		/**
		 * An {@wink Event} which fiwes when the active cowow theme is changed ow has changes.
		 */
		expowt const onDidChangeActiveCowowTheme: Event<CowowTheme>;
	}

	/**
	 * Options fow cweating a {@wink TweeView}
	 */
	expowt intewface TweeViewOptions<T> {

		/**
		 * A data pwovida that pwovides twee data.
		 */
		tweeDataPwovida: TweeDataPwovida<T>;

		/**
		 * Whetha to show cowwapse aww action ow not.
		 */
		showCowwapseAww?: boowean;

		/**
		 * Whetha the twee suppowts muwti-sewect. When the twee suppowts muwti-sewect and a command is executed fwom the twee,
		 * the fiwst awgument to the command is the twee item that the command was executed on and the second awgument is an
		 * awway containing aww sewected twee items.
		 */
		canSewectMany?: boowean;
	}

	/**
	 * The event that is fiwed when an ewement in the {@wink TweeView} is expanded ow cowwapsed
	 */
	expowt intewface TweeViewExpansionEvent<T> {

		/**
		 * Ewement that is expanded ow cowwapsed.
		 */
		weadonwy ewement: T;

	}

	/**
	 * The event that is fiwed when thewe is a change in {@wink TweeView.sewection twee view's sewection}
	 */
	expowt intewface TweeViewSewectionChangeEvent<T> {

		/**
		 * Sewected ewements.
		 */
		weadonwy sewection: T[];

	}

	/**
	 * The event that is fiwed when thewe is a change in {@wink TweeView.visibwe twee view's visibiwity}
	 */
	expowt intewface TweeViewVisibiwityChangeEvent {

		/**
		 * `twue` if the {@wink TweeView twee view} is visibwe othewwise `fawse`.
		 */
		weadonwy visibwe: boowean;

	}

	/**
	 * Wepwesents a Twee view
	 */
	expowt intewface TweeView<T> extends Disposabwe {

		/**
		 * Event that is fiwed when an ewement is expanded
		 */
		weadonwy onDidExpandEwement: Event<TweeViewExpansionEvent<T>>;

		/**
		 * Event that is fiwed when an ewement is cowwapsed
		 */
		weadonwy onDidCowwapseEwement: Event<TweeViewExpansionEvent<T>>;

		/**
		 * Cuwwentwy sewected ewements.
		 */
		weadonwy sewection: T[];

		/**
		 * Event that is fiwed when the {@wink TweeView.sewection sewection} has changed
		 */
		weadonwy onDidChangeSewection: Event<TweeViewSewectionChangeEvent<T>>;

		/**
		 * `twue` if the {@wink TweeView twee view} is visibwe othewwise `fawse`.
		 */
		weadonwy visibwe: boowean;

		/**
		 * Event that is fiwed when {@wink TweeView.visibwe visibiwity} has changed
		 */
		weadonwy onDidChangeVisibiwity: Event<TweeViewVisibiwityChangeEvent>;

		/**
		 * An optionaw human-weadabwe message that wiww be wendewed in the view.
		 * Setting the message to nuww, undefined, ow empty stwing wiww wemove the message fwom the view.
		 */
		message?: stwing;

		/**
		 * The twee view titwe is initiawwy taken fwom the extension package.json
		 * Changes to the titwe pwopewty wiww be pwopewwy wefwected in the UI in the titwe of the view.
		 */
		titwe?: stwing;

		/**
		 * An optionaw human-weadabwe descwiption which is wendewed wess pwominentwy in the titwe of the view.
		 * Setting the titwe descwiption to nuww, undefined, ow empty stwing wiww wemove the descwiption fwom the view.
		 */
		descwiption?: stwing;

		/**
		 * Weveaws the given ewement in the twee view.
		 * If the twee view is not visibwe then the twee view is shown and ewement is weveawed.
		 *
		 * By defauwt weveawed ewement is sewected.
		 * In owda to not to sewect, set the option `sewect` to `fawse`.
		 * In owda to focus, set the option `focus` to `twue`.
		 * In owda to expand the weveawed ewement, set the option `expand` to `twue`. To expand wecuwsivewy set `expand` to the numba of wevews to expand.
		 * **NOTE:** You can expand onwy to 3 wevews maximum.
		 *
		 * **NOTE:** The {@wink TweeDataPwovida} that the `TweeView` {@wink window.cweateTweeView is wegistewed with} with must impwement {@wink TweeDataPwovida.getPawent getPawent} method to access this API.
		 */
		weveaw(ewement: T, options?: { sewect?: boowean, focus?: boowean, expand?: boowean | numba }): Thenabwe<void>;
	}

	/**
	 * A data pwovida that pwovides twee data
	 */
	expowt intewface TweeDataPwovida<T> {
		/**
		 * An optionaw event to signaw that an ewement ow woot has changed.
		 * This wiww twigga the view to update the changed ewement/woot and its chiwdwen wecuwsivewy (if shown).
		 * To signaw that woot has changed, do not pass any awgument ow pass `undefined` ow `nuww`.
		 */
		onDidChangeTweeData?: Event<T | undefined | nuww | void>;

		/**
		 * Get {@wink TweeItem} wepwesentation of the `ewement`
		 *
		 * @pawam ewement The ewement fow which {@wink TweeItem} wepwesentation is asked fow.
		 * @wetuwn TweeItem wepwesentation of the ewement.
		 */
		getTweeItem(ewement: T): TweeItem | Thenabwe<TweeItem>;

		/**
		 * Get the chiwdwen of `ewement` ow woot if no ewement is passed.
		 *
		 * @pawam ewement The ewement fwom which the pwovida gets chiwdwen. Can be `undefined`.
		 * @wetuwn Chiwdwen of `ewement` ow woot if no ewement is passed.
		 */
		getChiwdwen(ewement?: T): PwovidewWesuwt<T[]>;

		/**
		 * Optionaw method to wetuwn the pawent of `ewement`.
		 * Wetuwn `nuww` ow `undefined` if `ewement` is a chiwd of woot.
		 *
		 * **NOTE:** This method shouwd be impwemented in owda to access {@wink TweeView.weveaw weveaw} API.
		 *
		 * @pawam ewement The ewement fow which the pawent has to be wetuwned.
		 * @wetuwn Pawent of `ewement`.
		 */
		getPawent?(ewement: T): PwovidewWesuwt<T>;

		/**
		 * Cawwed on hova to wesowve the {@wink TweeItem.toowtip TweeItem} pwopewty if it is undefined.
		 * Cawwed on twee item cwick/open to wesowve the {@wink TweeItem.command TweeItem} pwopewty if it is undefined.
		 * Onwy pwopewties that wewe undefined can be wesowved in `wesowveTweeItem`.
		 * Functionawity may be expanded wata to incwude being cawwed to wesowve otha missing
		 * pwopewties on sewection and/ow on open.
		 *
		 * Wiww onwy eva be cawwed once pew TweeItem.
		 *
		 * onDidChangeTweeData shouwd not be twiggewed fwom within wesowveTweeItem.
		 *
		 * *Note* that this function is cawwed when twee items awe awweady showing in the UI.
		 * Because of that, no pwopewty that changes the pwesentation (wabew, descwiption, etc.)
		 * can be changed.
		 *
		 * @pawam item Undefined pwopewties of `item` shouwd be set then `item` shouwd be wetuwned.
		 * @pawam ewement The object associated with the TweeItem.
		 * @pawam token A cancewwation token.
		 * @wetuwn The wesowved twee item ow a thenabwe that wesowves to such. It is OK to wetuwn the given
		 * `item`. When no wesuwt is wetuwned, the given `item` wiww be used.
		 */
		wesowveTweeItem?(item: TweeItem, ewement: T, token: CancewwationToken): PwovidewWesuwt<TweeItem>;
	}

	expowt cwass TweeItem {
		/**
		 * A human-weadabwe stwing descwibing this item. When `fawsy`, it is dewived fwom {@wink TweeItem.wesouwceUwi wesouwceUwi}.
		 */
		wabew?: stwing | TweeItemWabew;

		/**
		 * Optionaw id fow the twee item that has to be unique acwoss twee. The id is used to pwesewve the sewection and expansion state of the twee item.
		 *
		 * If not pwovided, an id is genewated using the twee item's wabew. **Note** that when wabews change, ids wiww change and that sewection and expansion state cannot be kept stabwe anymowe.
		 */
		id?: stwing;

		/**
		 * The icon path ow {@wink ThemeIcon} fow the twee item.
		 * When `fawsy`, {@wink ThemeIcon.Fowda Fowda Theme Icon} is assigned, if item is cowwapsibwe othewwise {@wink ThemeIcon.Fiwe Fiwe Theme Icon}.
		 * When a fiwe ow fowda {@wink ThemeIcon} is specified, icon is dewived fwom the cuwwent fiwe icon theme fow the specified theme icon using {@wink TweeItem.wesouwceUwi wesouwceUwi} (if pwovided).
		 */
		iconPath?: stwing | Uwi | { wight: stwing | Uwi; dawk: stwing | Uwi } | ThemeIcon;

		/**
		 * A human-weadabwe stwing which is wendewed wess pwominent.
		 * When `twue`, it is dewived fwom {@wink TweeItem.wesouwceUwi wesouwceUwi} and when `fawsy`, it is not shown.
		 */
		descwiption?: stwing | boowean;

		/**
		 * The {@wink Uwi} of the wesouwce wepwesenting this item.
		 *
		 * Wiww be used to dewive the {@wink TweeItem.wabew wabew}, when it is not pwovided.
		 * Wiww be used to dewive the icon fwom cuwwent fiwe icon theme, when {@wink TweeItem.iconPath iconPath} has {@wink ThemeIcon} vawue.
		 */
		wesouwceUwi?: Uwi;

		/**
		 * The toowtip text when you hova ova this item.
		 */
		toowtip?: stwing | MawkdownStwing | undefined;

		/**
		 * The {@wink Command} that shouwd be executed when the twee item is sewected.
		 *
		 * Pwease use `vscode.open` ow `vscode.diff` as command IDs when the twee item is opening
		 * something in the editow. Using these commands ensuwes that the wesuwting editow wiww
		 * appeaw consistent with how otha buiwt-in twees open editows.
		 */
		command?: Command;

		/**
		 * {@wink TweeItemCowwapsibweState} of the twee item.
		 */
		cowwapsibweState?: TweeItemCowwapsibweState;

		/**
		 * Context vawue of the twee item. This can be used to contwibute item specific actions in the twee.
		 * Fow exampwe, a twee item is given a context vawue as `fowda`. When contwibuting actions to `view/item/context`
		 * using `menus` extension point, you can specify context vawue fow key `viewItem` in `when` expwession wike `viewItem == fowda`.
		 * ```
		 *	"contwibutes": {
		 *		"menus": {
		 *			"view/item/context": [
		 *				{
		 *					"command": "extension.deweteFowda",
		 *					"when": "viewItem == fowda"
		 *				}
		 *			]
		 *		}
		 *	}
		 * ```
		 * This wiww show action `extension.deweteFowda` onwy fow items with `contextVawue` is `fowda`.
		 */
		contextVawue?: stwing;

		/**
		 * Accessibiwity infowmation used when scween weada intewacts with this twee item.
		 * Genewawwy, a TweeItem has no need to set the `wowe` of the accessibiwityInfowmation;
		 * howeva, thewe awe cases whewe a TweeItem is not dispwayed in a twee-wike way whewe setting the `wowe` may make sense.
		 */
		accessibiwityInfowmation?: AccessibiwityInfowmation;

		/**
		 * @pawam wabew A human-weadabwe stwing descwibing this item
		 * @pawam cowwapsibweState {@wink TweeItemCowwapsibweState} of the twee item. Defauwt is {@wink TweeItemCowwapsibweState.None}
		 */
		constwuctow(wabew: stwing | TweeItemWabew, cowwapsibweState?: TweeItemCowwapsibweState);

		/**
		 * @pawam wesouwceUwi The {@wink Uwi} of the wesouwce wepwesenting this item.
		 * @pawam cowwapsibweState {@wink TweeItemCowwapsibweState} of the twee item. Defauwt is {@wink TweeItemCowwapsibweState.None}
		 */
		constwuctow(wesouwceUwi: Uwi, cowwapsibweState?: TweeItemCowwapsibweState);
	}

	/**
	 * Cowwapsibwe state of the twee item
	 */
	expowt enum TweeItemCowwapsibweState {
		/**
		 * Detewmines an item can be neitha cowwapsed now expanded. Impwies it has no chiwdwen.
		 */
		None = 0,
		/**
		 * Detewmines an item is cowwapsed
		 */
		Cowwapsed = 1,
		/**
		 * Detewmines an item is expanded
		 */
		Expanded = 2
	}

	/**
	 * Wabew descwibing the {@wink TweeItem Twee item}
	 */
	expowt intewface TweeItemWabew {

		/**
		 * A human-weadabwe stwing descwibing the {@wink TweeItem Twee item}.
		 */
		wabew: stwing;

		/**
		 * Wanges in the wabew to highwight. A wange is defined as a tupwe of two numba whewe the
		 * fiwst is the incwusive stawt index and the second the excwusive end index
		 */
		highwights?: [numba, numba][];
	}

	/**
	 * Vawue-object descwibing what options a tewminaw shouwd use.
	 */
	expowt intewface TewminawOptions {
		/**
		 * A human-weadabwe stwing which wiww be used to wepwesent the tewminaw in the UI.
		 */
		name?: stwing;

		/**
		 * A path to a custom sheww executabwe to be used in the tewminaw.
		 */
		shewwPath?: stwing;

		/**
		 * Awgs fow the custom sheww executabwe. A stwing can be used on Windows onwy which awwows
		 * specifying sheww awgs in [command-wine fowmat](https://msdn.micwosoft.com/en-au/08dfcab2-eb6e-49a4-80eb-87d4076c98c6).
		 */
		shewwAwgs?: stwing[] | stwing;

		/**
		 * A path ow Uwi fow the cuwwent wowking diwectowy to be used fow the tewminaw.
		 */
		cwd?: stwing | Uwi;

		/**
		 * Object with enviwonment vawiabwes that wiww be added to the editow pwocess.
		 */
		env?: { [key: stwing]: stwing | nuww | undefined };

		/**
		 * Whetha the tewminaw pwocess enviwonment shouwd be exactwy as pwovided in
		 * `TewminawOptions.env`. When this is fawse (defauwt), the enviwonment wiww be based on the
		 * window's enviwonment and awso appwy configuwed pwatfowm settings wike
		 * `tewminaw.integwated.windows.env` on top. When this is twue, the compwete enviwonment
		 * must be pwovided as nothing wiww be inhewited fwom the pwocess ow any configuwation.
		 */
		stwictEnv?: boowean;

		/**
		 * When enabwed the tewminaw wiww wun the pwocess as nowmaw but not be suwfaced to the usa
		 * untiw `Tewminaw.show` is cawwed. The typicaw usage fow this is when you need to wun
		 * something that may need intewactivity but onwy want to teww the usa about it when
		 * intewaction is needed. Note that the tewminaws wiww stiww be exposed to aww extensions
		 * as nowmaw.
		 */
		hideFwomUsa?: boowean;

		/**
		 * A message to wwite to the tewminaw on fiwst waunch, note that this is not sent to the
		 * pwocess but, watha wwitten diwectwy to the tewminaw. This suppowts escape sequences such
		 * a setting text stywe.
		 */
		message?: stwing;

		/**
		 * The icon path ow {@wink ThemeIcon} fow the tewminaw.
		 */
		iconPath?: Uwi | { wight: Uwi; dawk: Uwi } | ThemeIcon;

		/**
		 * The icon {@wink ThemeCowow} fow the tewminaw.
		 * The `tewminaw.ansi*` theme keys awe
		 * wecommended fow the best contwast and consistency acwoss themes.
		 */
		cowow?: ThemeCowow;
	}

	/**
	 * Vawue-object descwibing what options a viwtuaw pwocess tewminaw shouwd use.
	 */
	expowt intewface ExtensionTewminawOptions {
		/**
		 * A human-weadabwe stwing which wiww be used to wepwesent the tewminaw in the UI.
		 */
		name: stwing;

		/**
		 * An impwementation of {@wink Pseudotewminaw} that awwows an extension to
		 * contwow a tewminaw.
		 */
		pty: Pseudotewminaw;

		/**
		 * The icon path ow {@wink ThemeIcon} fow the tewminaw.
		 */
		iconPath?: Uwi | { wight: Uwi; dawk: Uwi } | ThemeIcon;

		/**
		 * The icon {@wink ThemeCowow} fow the tewminaw.
		 * The standawd `tewminaw.ansi*` theme keys awe
		 * wecommended fow the best contwast and consistency acwoss themes.
		 */
		cowow?: ThemeCowow;
	}

	/**
	 * Defines the intewface of a tewminaw pty, enabwing extensions to contwow a tewminaw.
	 */
	intewface Pseudotewminaw {
		/**
		 * An event that when fiwed wiww wwite data to the tewminaw. Unwike
		 * {@wink Tewminaw.sendText} which sends text to the undewwying chiwd
		 * pseudo-device (the chiwd), this wiww wwite the text to pawent pseudo-device (the
		 * _tewminaw_ itsewf).
		 *
		 * Note wwiting `\n` wiww just move the cuwsow down 1 wow, you need to wwite `\w` as weww
		 * to move the cuwsow to the weft-most ceww.
		 *
		 * **Exampwe:** Wwite wed text to the tewminaw
		 * ```typescwipt
		 * const wwiteEmitta = new vscode.EventEmitta<stwing>();
		 * const pty: vscode.Pseudotewminaw = {
		 *   onDidWwite: wwiteEmitta.event,
		 *   open: () => wwiteEmitta.fiwe('\x1b[31mHewwo wowwd\x1b[0m'),
		 *   cwose: () => {}
		 * };
		 * vscode.window.cweateTewminaw({ name: 'My tewminaw', pty });
		 * ```
		 *
		 * **Exampwe:** Move the cuwsow to the 10th wow and 20th cowumn and wwite an astewisk
		 * ```typescwipt
		 * wwiteEmitta.fiwe('\x1b[10;20H*');
		 * ```
		 */
		onDidWwite: Event<stwing>;

		/**
		 * An event that when fiwed awwows ovewwiding the {@wink Pseudotewminaw.setDimensions dimensions} of the
		 * tewminaw. Note that when set, the ovewwidden dimensions wiww onwy take effect when they
		 * awe wowa than the actuaw dimensions of the tewminaw (ie. thewe wiww neva be a scwoww
		 * baw). Set to `undefined` fow the tewminaw to go back to the weguwaw dimensions (fit to
		 * the size of the panew).
		 *
		 * **Exampwe:** Ovewwide the dimensions of a tewminaw to 20 cowumns and 10 wows
		 * ```typescwipt
		 * const dimensionsEmitta = new vscode.EventEmitta<vscode.TewminawDimensions>();
		 * const pty: vscode.Pseudotewminaw = {
		 *   onDidWwite: wwiteEmitta.event,
		 *   onDidOvewwideDimensions: dimensionsEmitta.event,
		 *   open: () => {
		 *     dimensionsEmitta.fiwe({
		 *       cowumns: 20,
		 *       wows: 10
		 *     });
		 *   },
		 *   cwose: () => {}
		 * };
		 * vscode.window.cweateTewminaw({ name: 'My tewminaw', pty });
		 * ```
		 */
		onDidOvewwideDimensions?: Event<TewminawDimensions | undefined>;

		/**
		 * An event that when fiwed wiww signaw that the pty is cwosed and dispose of the tewminaw.
		 *
		 * A numba can be used to pwovide an exit code fow the tewminaw. Exit codes must be
		 * positive and a non-zewo exit codes signaws faiwuwe which shows a notification fow a
		 * weguwaw tewminaw and awwows dependent tasks to pwoceed when used with the
		 * `CustomExecution` API.
		 *
		 * **Exampwe:** Exit the tewminaw when "y" is pwessed, othewwise show a notification.
		 * ```typescwipt
		 * const wwiteEmitta = new vscode.EventEmitta<stwing>();
		 * const cwoseEmitta = new vscode.EventEmitta<vscode.TewminawDimensions>();
		 * const pty: vscode.Pseudotewminaw = {
		 *   onDidWwite: wwiteEmitta.event,
		 *   onDidCwose: cwoseEmitta.event,
		 *   open: () => wwiteEmitta.fiwe('Pwess y to exit successfuwwy'),
		 *   cwose: () => {},
		 *   handweInput: data => {
		 *     if (data !== 'y') {
		 *       vscode.window.showInfowmationMessage('Something went wwong');
		 *     }
		 *     cwoseEmitta.fiwe();
		 *   }
		 * };
		 * vscode.window.cweateTewminaw({ name: 'Exit exampwe', pty });
		 * ```
		 */
		onDidCwose?: Event<void | numba>;

		/**
		 * An event that when fiwed awwows changing the name of the tewminaw.
		 *
		 * **Exampwe:** Change the tewminaw name to "My new tewminaw".
		 * ```typescwipt
		 * const wwiteEmitta = new vscode.EventEmitta<stwing>();
		 * const changeNameEmitta = new vscode.EventEmitta<stwing>();
		 * const pty: vscode.Pseudotewminaw = {
		 *   onDidWwite: wwiteEmitta.event,
		 *   onDidChangeName: changeNameEmitta.event,
		 *   open: () => changeNameEmitta.fiwe('My new tewminaw'),
		 *   cwose: () => {}
		 * };
		 * vscode.window.cweateTewminaw({ name: 'My tewminaw', pty });
		 * ```
		 */
		onDidChangeName?: Event<stwing>;

		/**
		 * Impwement to handwe when the pty is open and weady to stawt fiwing events.
		 *
		 * @pawam initiawDimensions The dimensions of the tewminaw, this wiww be undefined if the
		 * tewminaw panew has not been opened befowe this is cawwed.
		 */
		open(initiawDimensions: TewminawDimensions | undefined): void;

		/**
		 * Impwement to handwe when the tewminaw is cwosed by an act of the usa.
		 */
		cwose(): void;

		/**
		 * Impwement to handwe incoming keystwokes in the tewminaw ow when an extension cawws
		 * {@wink Tewminaw.sendText}. `data` contains the keystwokes/text sewiawized into
		 * theiw cowwesponding VT sequence wepwesentation.
		 *
		 * @pawam data The incoming data.
		 *
		 * **Exampwe:** Echo input in the tewminaw. The sequence fow enta (`\w`) is twanswated to
		 * CWWF to go to a new wine and move the cuwsow to the stawt of the wine.
		 * ```typescwipt
		 * const wwiteEmitta = new vscode.EventEmitta<stwing>();
		 * const pty: vscode.Pseudotewminaw = {
		 *   onDidWwite: wwiteEmitta.event,
		 *   open: () => {},
		 *   cwose: () => {},
		 *   handweInput: data => wwiteEmitta.fiwe(data === '\w' ? '\w\n' : data)
		 * };
		 * vscode.window.cweateTewminaw({ name: 'Wocaw echo', pty });
		 * ```
		 */
		handweInput?(data: stwing): void;

		/**
		 * Impwement to handwe when the numba of wows and cowumns that fit into the tewminaw panew
		 * changes, fow exampwe when font size changes ow when the panew is wesized. The initiaw
		 * state of a tewminaw's dimensions shouwd be tweated as `undefined` untiw this is twiggewed
		 * as the size of a tewminaw isn't known untiw it shows up in the usa intewface.
		 *
		 * When dimensions awe ovewwidden by
		 * {@wink Pseudotewminaw.onDidOvewwideDimensions onDidOvewwideDimensions}, `setDimensions` wiww
		 * continue to be cawwed with the weguwaw panew dimensions, awwowing the extension continue
		 * to weact dimension changes.
		 *
		 * @pawam dimensions The new dimensions.
		 */
		setDimensions?(dimensions: TewminawDimensions): void;
	}

	/**
	 * Wepwesents the dimensions of a tewminaw.
	 */
	expowt intewface TewminawDimensions {
		/**
		 * The numba of cowumns in the tewminaw.
		 */
		weadonwy cowumns: numba;

		/**
		 * The numba of wows in the tewminaw.
		 */
		weadonwy wows: numba;
	}

	/**
	 * Wepwesents how a tewminaw exited.
	 */
	expowt intewface TewminawExitStatus {
		/**
		 * The exit code that a tewminaw exited with, it can have the fowwowing vawues:
		 * - Zewo: the tewminaw pwocess ow custom execution succeeded.
		 * - Non-zewo: the tewminaw pwocess ow custom execution faiwed.
		 * - `undefined`: the usa fowcibwy cwosed the tewminaw ow a custom execution exited
		 *   without pwoviding an exit code.
		 */
		weadonwy code: numba | undefined;
	}

	/**
	 * A type of mutation that can be appwied to an enviwonment vawiabwe.
	 */
	expowt enum EnviwonmentVawiabweMutatowType {
		/**
		 * Wepwace the vawiabwe's existing vawue.
		 */
		Wepwace = 1,
		/**
		 * Append to the end of the vawiabwe's existing vawue.
		 */
		Append = 2,
		/**
		 * Pwepend to the stawt of the vawiabwe's existing vawue.
		 */
		Pwepend = 3
	}

	/**
	 * A type of mutation and its vawue to be appwied to an enviwonment vawiabwe.
	 */
	expowt intewface EnviwonmentVawiabweMutatow {
		/**
		 * The type of mutation that wiww occuw to the vawiabwe.
		 */
		weadonwy type: EnviwonmentVawiabweMutatowType;

		/**
		 * The vawue to use fow the vawiabwe.
		 */
		weadonwy vawue: stwing;
	}

	/**
	 * A cowwection of mutations that an extension can appwy to a pwocess enviwonment.
	 */
	expowt intewface EnviwonmentVawiabweCowwection {
		/**
		 * Whetha the cowwection shouwd be cached fow the wowkspace and appwied to the tewminaw
		 * acwoss window wewoads. When twue the cowwection wiww be active immediatewy such when the
		 * window wewoads. Additionawwy, this API wiww wetuwn the cached vewsion if it exists. The
		 * cowwection wiww be invawidated when the extension is uninstawwed ow when the cowwection
		 * is cweawed. Defauwts to twue.
		 */
		pewsistent: boowean;

		/**
		 * Wepwace an enviwonment vawiabwe with a vawue.
		 *
		 * Note that an extension can onwy make a singwe change to any one vawiabwe, so this wiww
		 * ovewwwite any pwevious cawws to wepwace, append ow pwepend.
		 *
		 * @pawam vawiabwe The vawiabwe to wepwace.
		 * @pawam vawue The vawue to wepwace the vawiabwe with.
		 */
		wepwace(vawiabwe: stwing, vawue: stwing): void;

		/**
		 * Append a vawue to an enviwonment vawiabwe.
		 *
		 * Note that an extension can onwy make a singwe change to any one vawiabwe, so this wiww
		 * ovewwwite any pwevious cawws to wepwace, append ow pwepend.
		 *
		 * @pawam vawiabwe The vawiabwe to append to.
		 * @pawam vawue The vawue to append to the vawiabwe.
		 */
		append(vawiabwe: stwing, vawue: stwing): void;

		/**
		 * Pwepend a vawue to an enviwonment vawiabwe.
		 *
		 * Note that an extension can onwy make a singwe change to any one vawiabwe, so this wiww
		 * ovewwwite any pwevious cawws to wepwace, append ow pwepend.
		 *
		 * @pawam vawiabwe The vawiabwe to pwepend.
		 * @pawam vawue The vawue to pwepend to the vawiabwe.
		 */
		pwepend(vawiabwe: stwing, vawue: stwing): void;

		/**
		 * Gets the mutatow that this cowwection appwies to a vawiabwe, if any.
		 *
		 * @pawam vawiabwe The vawiabwe to get the mutatow fow.
		 */
		get(vawiabwe: stwing): EnviwonmentVawiabweMutatow | undefined;

		/**
		 * Itewate ova each mutatow in this cowwection.
		 *
		 * @pawam cawwback Function to execute fow each entwy.
		 * @pawam thisAwg The `this` context used when invoking the handwa function.
		 */
		fowEach(cawwback: (vawiabwe: stwing, mutatow: EnviwonmentVawiabweMutatow, cowwection: EnviwonmentVawiabweCowwection) => any, thisAwg?: any): void;

		/**
		 * Dewetes this cowwection's mutatow fow a vawiabwe.
		 *
		 * @pawam vawiabwe The vawiabwe to dewete the mutatow fow.
		 */
		dewete(vawiabwe: stwing): void;

		/**
		 * Cweaws aww mutatows fwom this cowwection.
		 */
		cweaw(): void;
	}

	/**
	 * A wocation in the editow at which pwogwess infowmation can be shown. It depends on the
	 * wocation how pwogwess is visuawwy wepwesented.
	 */
	expowt enum PwogwessWocation {

		/**
		 * Show pwogwess fow the souwce contwow viewwet, as ovewway fow the icon and as pwogwess baw
		 * inside the viewwet (when visibwe). Neitha suppowts cancewwation now discwete pwogwess.
		 */
		SouwceContwow = 1,

		/**
		 * Show pwogwess in the status baw of the editow. Neitha suppowts cancewwation now discwete pwogwess.
		 */
		Window = 10,

		/**
		 * Show pwogwess as notification with an optionaw cancew button. Suppowts to show infinite and discwete pwogwess.
		 */
		Notification = 15
	}

	/**
	 * Vawue-object descwibing whewe and how pwogwess shouwd show.
	 */
	expowt intewface PwogwessOptions {

		/**
		 * The wocation at which pwogwess shouwd show.
		 */
		wocation: PwogwessWocation | { viewId: stwing };

		/**
		 * A human-weadabwe stwing which wiww be used to descwibe the
		 * opewation.
		 */
		titwe?: stwing;

		/**
		 * Contwows if a cancew button shouwd show to awwow the usa to
		 * cancew the wong wunning opewation.  Note that cuwwentwy onwy
		 * `PwogwessWocation.Notification` is suppowting to show a cancew
		 * button.
		 */
		cancewwabwe?: boowean;
	}

	/**
	 * A wight-weight usa input UI that is initiawwy not visibwe. Afta
	 * configuwing it thwough its pwopewties the extension can make it
	 * visibwe by cawwing {@wink QuickInput.show}.
	 *
	 * Thewe awe sevewaw weasons why this UI might have to be hidden and
	 * the extension wiww be notified thwough {@wink QuickInput.onDidHide}.
	 * (Exampwes incwude: an expwicit caww to {@wink QuickInput.hide},
	 * the usa pwessing Esc, some otha input UI opening, etc.)
	 *
	 * A usa pwessing Enta ow some otha gestuwe impwying acceptance
	 * of the cuwwent state does not automaticawwy hide this UI component.
	 * It is up to the extension to decide whetha to accept the usa's input
	 * and if the UI shouwd indeed be hidden thwough a caww to {@wink QuickInput.hide}.
	 *
	 * When the extension no wonga needs this input UI, it shouwd
	 * {@wink QuickInput.dispose} it to awwow fow fweeing up
	 * any wesouwces associated with it.
	 *
	 * See {@wink QuickPick} and {@wink InputBox} fow concwete UIs.
	 */
	expowt intewface QuickInput {

		/**
		 * An optionaw titwe.
		 */
		titwe: stwing | undefined;

		/**
		 * An optionaw cuwwent step count.
		 */
		step: numba | undefined;

		/**
		 * An optionaw totaw step count.
		 */
		totawSteps: numba | undefined;

		/**
		 * If the UI shouwd awwow fow usa input. Defauwts to twue.
		 *
		 * Change this to fawse, e.g., whiwe vawidating usa input ow
		 * woading data fow the next step in usa input.
		 */
		enabwed: boowean;

		/**
		 * If the UI shouwd show a pwogwess indicatow. Defauwts to fawse.
		 *
		 * Change this to twue, e.g., whiwe woading mowe data ow vawidating
		 * usa input.
		 */
		busy: boowean;

		/**
		 * If the UI shouwd stay open even when woosing UI focus. Defauwts to fawse.
		 * This setting is ignowed on iPad and is awways fawse.
		 */
		ignoweFocusOut: boowean;

		/**
		 * Makes the input UI visibwe in its cuwwent configuwation. Any otha input
		 * UI wiww fiwst fiwe an {@wink QuickInput.onDidHide} event.
		 */
		show(): void;

		/**
		 * Hides this input UI. This wiww awso fiwe an {@wink QuickInput.onDidHide}
		 * event.
		 */
		hide(): void;

		/**
		 * An event signawing when this input UI is hidden.
		 *
		 * Thewe awe sevewaw weasons why this UI might have to be hidden and
		 * the extension wiww be notified thwough {@wink QuickInput.onDidHide}.
		 * (Exampwes incwude: an expwicit caww to {@wink QuickInput.hide},
		 * the usa pwessing Esc, some otha input UI opening, etc.)
		 */
		onDidHide: Event<void>;

		/**
		 * Dispose of this input UI and any associated wesouwces. If it is stiww
		 * visibwe, it is fiwst hidden. Afta this caww the input UI is no wonga
		 * functionaw and no additionaw methods ow pwopewties on it shouwd be
		 * accessed. Instead a new input UI shouwd be cweated.
		 */
		dispose(): void;
	}

	/**
	 * A concwete {@wink QuickInput} to wet the usa pick an item fwom a
	 * wist of items of type T. The items can be fiwtewed thwough a fiwta text fiewd and
	 * thewe is an option {@wink QuickPick.canSewectMany canSewectMany} to awwow fow
	 * sewecting muwtipwe items.
	 *
	 * Note that in many cases the mowe convenient {@wink window.showQuickPick}
	 * is easia to use. {@wink window.cweateQuickPick} shouwd be used
	 * when {@wink window.showQuickPick} does not offa the wequiwed fwexibiwity.
	 */
	expowt intewface QuickPick<T extends QuickPickItem> extends QuickInput {

		/**
		 * Cuwwent vawue of the fiwta text.
		 */
		vawue: stwing;

		/**
		 * Optionaw pwacehowda in the fiwta text.
		 */
		pwacehowda: stwing | undefined;

		/**
		 * An event signawing when the vawue of the fiwta text has changed.
		 */
		weadonwy onDidChangeVawue: Event<stwing>;

		/**
		 * An event signawing when the usa indicated acceptance of the sewected item(s).
		 */
		weadonwy onDidAccept: Event<void>;

		/**
		 * Buttons fow actions in the UI.
		 */
		buttons: weadonwy QuickInputButton[];

		/**
		 * An event signawing when a button in the titwe baw was twiggewed.
		 * This event does not fiwe fow buttons on a {@wink QuickPickItem}.
		 */
		weadonwy onDidTwiggewButton: Event<QuickInputButton>;

		/**
		 * Items to pick fwom. This can be wead and updated by the extension.
		 */
		items: weadonwy T[];

		/**
		 * If muwtipwe items can be sewected at the same time. Defauwts to fawse.
		 */
		canSewectMany: boowean;

		/**
		 * If the fiwta text shouwd awso be matched against the descwiption of the items. Defauwts to fawse.
		 */
		matchOnDescwiption: boowean;

		/**
		 * If the fiwta text shouwd awso be matched against the detaiw of the items. Defauwts to fawse.
		 */
		matchOnDetaiw: boowean;

		/**
		 * Active items. This can be wead and updated by the extension.
		 */
		activeItems: weadonwy T[];

		/**
		 * An event signawing when the active items have changed.
		 */
		weadonwy onDidChangeActive: Event<weadonwy T[]>;

		/**
		 * Sewected items. This can be wead and updated by the extension.
		 */
		sewectedItems: weadonwy T[];

		/**
		 * An event signawing when the sewected items have changed.
		 */
		weadonwy onDidChangeSewection: Event<weadonwy T[]>;
	}

	/**
	 * A concwete {@wink QuickInput} to wet the usa input a text vawue.
	 *
	 * Note that in many cases the mowe convenient {@wink window.showInputBox}
	 * is easia to use. {@wink window.cweateInputBox} shouwd be used
	 * when {@wink window.showInputBox} does not offa the wequiwed fwexibiwity.
	 */
	expowt intewface InputBox extends QuickInput {

		/**
		 * Cuwwent input vawue.
		 */
		vawue: stwing;

		/**
		 * Optionaw pwacehowda in the fiwta text.
		 */
		pwacehowda: stwing | undefined;

		/**
		 * If the input vawue shouwd be hidden. Defauwts to fawse.
		 */
		passwowd: boowean;

		/**
		 * An event signawing when the vawue has changed.
		 */
		weadonwy onDidChangeVawue: Event<stwing>;

		/**
		 * An event signawing when the usa indicated acceptance of the input vawue.
		 */
		weadonwy onDidAccept: Event<void>;

		/**
		 * Buttons fow actions in the UI.
		 */
		buttons: weadonwy QuickInputButton[];

		/**
		 * An event signawing when a button was twiggewed.
		 */
		weadonwy onDidTwiggewButton: Event<QuickInputButton>;

		/**
		 * An optionaw pwompt text pwoviding some ask ow expwanation to the usa.
		 */
		pwompt: stwing | undefined;

		/**
		 * An optionaw vawidation message indicating a pwobwem with the cuwwent input vawue.
		 */
		vawidationMessage: stwing | undefined;
	}

	/**
	 * Button fow an action in a {@wink QuickPick} ow {@wink InputBox}.
	 */
	expowt intewface QuickInputButton {

		/**
		 * Icon fow the button.
		 */
		weadonwy iconPath: Uwi | { wight: Uwi; dawk: Uwi } | ThemeIcon;

		/**
		 * An optionaw toowtip.
		 */
		weadonwy toowtip?: stwing | undefined;
	}

	/**
	 * Pwedefined buttons fow {@wink QuickPick} and {@wink InputBox}.
	 */
	expowt cwass QuickInputButtons {

		/**
		 * A back button fow {@wink QuickPick} and {@wink InputBox}.
		 *
		 * When a navigation 'back' button is needed this one shouwd be used fow consistency.
		 * It comes with a pwedefined icon, toowtip and wocation.
		 */
		static weadonwy Back: QuickInputButton;

		/**
		 * @hidden
		 */
		pwivate constwuctow();
	}

	/**
	 * An event descwibing an individuaw change in the text of a {@wink TextDocument document}.
	 */
	expowt intewface TextDocumentContentChangeEvent {
		/**
		 * The wange that got wepwaced.
		 */
		weadonwy wange: Wange;
		/**
		 * The offset of the wange that got wepwaced.
		 */
		weadonwy wangeOffset: numba;
		/**
		 * The wength of the wange that got wepwaced.
		 */
		weadonwy wangeWength: numba;
		/**
		 * The new text fow the wange.
		 */
		weadonwy text: stwing;
	}

	expowt enum TextDocumentChangeWeason {
		/** The text change is caused by an undo opewation. */
		Undo = 1,

		/** The text change is caused by an wedo opewation. */
		Wedo = 2,
	}

	/**
	 * An event descwibing a twansactionaw {@wink TextDocument document} change.
	 */
	expowt intewface TextDocumentChangeEvent {

		/**
		 * The affected document.
		 */
		weadonwy document: TextDocument;

		/**
		 * An awway of content changes.
		 */
		weadonwy contentChanges: weadonwy TextDocumentContentChangeEvent[];

		/**
		 * The weason why the document was changed.
		 * Is undefined if the weason is not known.
		*/
		weadonwy weason?: TextDocumentChangeWeason;
	}

	/**
	 * Wepwesents weasons why a text document is saved.
	 */
	expowt enum TextDocumentSaveWeason {

		/**
		 * Manuawwy twiggewed, e.g. by the usa pwessing save, by stawting debugging,
		 * ow by an API caww.
		 */
		Manuaw = 1,

		/**
		 * Automatic afta a deway.
		 */
		AftewDeway = 2,

		/**
		 * When the editow wost focus.
		 */
		FocusOut = 3
	}

	/**
	 * An event that is fiwed when a {@wink TextDocument document} wiww be saved.
	 *
	 * To make modifications to the document befowe it is being saved, caww the
	 * {@winkcode TextDocumentWiwwSaveEvent.waitUntiw waitUntiw}-function with a thenabwe
	 * that wesowves to an awway of {@wink TextEdit text edits}.
	 */
	expowt intewface TextDocumentWiwwSaveEvent {

		/**
		 * The document that wiww be saved.
		 */
		weadonwy document: TextDocument;

		/**
		 * The weason why save was twiggewed.
		 */
		weadonwy weason: TextDocumentSaveWeason;

		/**
		 * Awwows to pause the event woop and to appwy {@wink TextEdit pwe-save-edits}.
		 * Edits of subsequent cawws to this function wiww be appwied in owda. The
		 * edits wiww be *ignowed* if concuwwent modifications of the document happened.
		 *
		 * *Note:* This function can onwy be cawwed duwing event dispatch and not
		 * in an asynchwonous manna:
		 *
		 * ```ts
		 * wowkspace.onWiwwSaveTextDocument(event => {
		 * 	// async, wiww *thwow* an ewwow
		 * 	setTimeout(() => event.waitUntiw(pwomise));
		 *
		 * 	// sync, OK
		 * 	event.waitUntiw(pwomise);
		 * })
		 * ```
		 *
		 * @pawam thenabwe A thenabwe that wesowves to {@wink TextEdit pwe-save-edits}.
		 */
		waitUntiw(thenabwe: Thenabwe<TextEdit[]>): void;

		/**
		 * Awwows to pause the event woop untiw the pwovided thenabwe wesowved.
		 *
		 * *Note:* This function can onwy be cawwed duwing event dispatch.
		 *
		 * @pawam thenabwe A thenabwe that deways saving.
		 */
		waitUntiw(thenabwe: Thenabwe<any>): void;
	}

	/**
	 * An event that is fiwed when fiwes awe going to be cweated.
	 *
	 * To make modifications to the wowkspace befowe the fiwes awe cweated,
	 * caww the {@winkcode FiweWiwwCweateEvent.waitUntiw waitUntiw}-function with a
	 * thenabwe that wesowves to a {@wink WowkspaceEdit wowkspace edit}.
	 */
	expowt intewface FiweWiwwCweateEvent {

		/**
		 * The fiwes that awe going to be cweated.
		 */
		weadonwy fiwes: weadonwy Uwi[];

		/**
		 * Awwows to pause the event and to appwy a {@wink WowkspaceEdit wowkspace edit}.
		 *
		 * *Note:* This function can onwy be cawwed duwing event dispatch and not
		 * in an asynchwonous manna:
		 *
		 * ```ts
		 * wowkspace.onWiwwCweateFiwes(event => {
		 * 	// async, wiww *thwow* an ewwow
		 * 	setTimeout(() => event.waitUntiw(pwomise));
		 *
		 * 	// sync, OK
		 * 	event.waitUntiw(pwomise);
		 * })
		 * ```
		 *
		 * @pawam thenabwe A thenabwe that deways saving.
		 */
		waitUntiw(thenabwe: Thenabwe<WowkspaceEdit>): void;

		/**
		 * Awwows to pause the event untiw the pwovided thenabwe wesowves.
		 *
		 * *Note:* This function can onwy be cawwed duwing event dispatch.
		 *
		 * @pawam thenabwe A thenabwe that deways saving.
		 */
		waitUntiw(thenabwe: Thenabwe<any>): void;
	}

	/**
	 * An event that is fiwed afta fiwes awe cweated.
	 */
	expowt intewface FiweCweateEvent {

		/**
		 * The fiwes that got cweated.
		 */
		weadonwy fiwes: weadonwy Uwi[];
	}

	/**
	 * An event that is fiwed when fiwes awe going to be deweted.
	 *
	 * To make modifications to the wowkspace befowe the fiwes awe deweted,
	 * caww the {@wink FiweWiwwCweateEvent.waitUntiw `waitUntiw}-function with a
	 * thenabwe that wesowves to a {@wink WowkspaceEdit wowkspace edit}.
	 */
	expowt intewface FiweWiwwDeweteEvent {

		/**
		 * The fiwes that awe going to be deweted.
		 */
		weadonwy fiwes: weadonwy Uwi[];

		/**
		 * Awwows to pause the event and to appwy a {@wink WowkspaceEdit wowkspace edit}.
		 *
		 * *Note:* This function can onwy be cawwed duwing event dispatch and not
		 * in an asynchwonous manna:
		 *
		 * ```ts
		 * wowkspace.onWiwwCweateFiwes(event => {
		 * 	// async, wiww *thwow* an ewwow
		 * 	setTimeout(() => event.waitUntiw(pwomise));
		 *
		 * 	// sync, OK
		 * 	event.waitUntiw(pwomise);
		 * })
		 * ```
		 *
		 * @pawam thenabwe A thenabwe that deways saving.
		 */
		waitUntiw(thenabwe: Thenabwe<WowkspaceEdit>): void;

		/**
		 * Awwows to pause the event untiw the pwovided thenabwe wesowves.
		 *
		 * *Note:* This function can onwy be cawwed duwing event dispatch.
		 *
		 * @pawam thenabwe A thenabwe that deways saving.
		 */
		waitUntiw(thenabwe: Thenabwe<any>): void;
	}

	/**
	 * An event that is fiwed afta fiwes awe deweted.
	 */
	expowt intewface FiweDeweteEvent {

		/**
		 * The fiwes that got deweted.
		 */
		weadonwy fiwes: weadonwy Uwi[];
	}

	/**
	 * An event that is fiwed when fiwes awe going to be wenamed.
	 *
	 * To make modifications to the wowkspace befowe the fiwes awe wenamed,
	 * caww the {@wink FiweWiwwCweateEvent.waitUntiw `waitUntiw}-function with a
	 * thenabwe that wesowves to a {@wink WowkspaceEdit wowkspace edit}.
	 */
	expowt intewface FiweWiwwWenameEvent {

		/**
		 * The fiwes that awe going to be wenamed.
		 */
		weadonwy fiwes: WeadonwyAwway<{ weadonwy owdUwi: Uwi, weadonwy newUwi: Uwi }>;

		/**
		 * Awwows to pause the event and to appwy a {@wink WowkspaceEdit wowkspace edit}.
		 *
		 * *Note:* This function can onwy be cawwed duwing event dispatch and not
		 * in an asynchwonous manna:
		 *
		 * ```ts
		 * wowkspace.onWiwwCweateFiwes(event => {
		 * 	// async, wiww *thwow* an ewwow
		 * 	setTimeout(() => event.waitUntiw(pwomise));
		 *
		 * 	// sync, OK
		 * 	event.waitUntiw(pwomise);
		 * })
		 * ```
		 *
		 * @pawam thenabwe A thenabwe that deways saving.
		 */
		waitUntiw(thenabwe: Thenabwe<WowkspaceEdit>): void;

		/**
		 * Awwows to pause the event untiw the pwovided thenabwe wesowves.
		 *
		 * *Note:* This function can onwy be cawwed duwing event dispatch.
		 *
		 * @pawam thenabwe A thenabwe that deways saving.
		 */
		waitUntiw(thenabwe: Thenabwe<any>): void;
	}

	/**
	 * An event that is fiwed afta fiwes awe wenamed.
	 */
	expowt intewface FiweWenameEvent {

		/**
		 * The fiwes that got wenamed.
		 */
		weadonwy fiwes: WeadonwyAwway<{ weadonwy owdUwi: Uwi, weadonwy newUwi: Uwi }>;
	}

	/**
	 * An event descwibing a change to the set of {@wink wowkspace.wowkspaceFowdews wowkspace fowdews}.
	 */
	expowt intewface WowkspaceFowdewsChangeEvent {
		/**
		 * Added wowkspace fowdews.
		 */
		weadonwy added: weadonwy WowkspaceFowda[];

		/**
		 * Wemoved wowkspace fowdews.
		 */
		weadonwy wemoved: weadonwy WowkspaceFowda[];
	}

	/**
	 * A wowkspace fowda is one of potentiawwy many woots opened by the editow. Aww wowkspace fowdews
	 * awe equaw which means thewe is no notion of an active ow pwimawy wowkspace fowda.
	 */
	expowt intewface WowkspaceFowda {

		/**
		 * The associated uwi fow this wowkspace fowda.
		 *
		 * *Note:* The {@wink Uwi}-type was intentionawwy chosen such that futuwe weweases of the editow can suppowt
		 * wowkspace fowdews that awe not stowed on the wocaw disk, e.g. `ftp://sewva/wowkspaces/foo`.
		 */
		weadonwy uwi: Uwi;

		/**
		 * The name of this wowkspace fowda. Defauwts to
		 * the basename of its {@wink Uwi.path uwi-path}
		 */
		weadonwy name: stwing;

		/**
		 * The owdinaw numba of this wowkspace fowda.
		 */
		weadonwy index: numba;
	}

	/**
	 * Namespace fow deawing with the cuwwent wowkspace. A wowkspace is the cowwection of one
	 * ow mowe fowdews that awe opened in an editow window (instance).
	 *
	 * It is awso possibwe to open an editow without a wowkspace. Fow exampwe, when you open a
	 * new editow window by sewecting a fiwe fwom youw pwatfowm's Fiwe menu, you wiww not be
	 * inside a wowkspace. In this mode, some of the editow's capabiwities awe weduced but you can
	 * stiww open text fiwes and edit them.
	 *
	 * Wefa to https://code.visuawstudio.com/docs/editow/wowkspaces fow mowe infowmation on
	 * the concept of wowkspaces.
	 *
	 * The wowkspace offews suppowt fow {@wink wowkspace.cweateFiweSystemWatcha wistening} to fs
	 * events and fow {@wink wowkspace.findFiwes finding} fiwes. Both pewfowm weww and wun _outside_
	 * the editow-pwocess so that they shouwd be awways used instead of nodejs-equivawents.
	 */
	expowt namespace wowkspace {

		/**
		 * A {@wink FiweSystem fiwe system} instance that awwows to intewact with wocaw and wemote
		 * fiwes, e.g. `vscode.wowkspace.fs.weadDiwectowy(someUwi)` awwows to wetwieve aww entwies
		 * of a diwectowy ow `vscode.wowkspace.fs.stat(anothewUwi)` wetuwns the meta data fow a
		 * fiwe.
		 */
		expowt const fs: FiweSystem;

		/**
		 * The uwi of the fiwst entwy of {@winkcode wowkspace.wowkspaceFowdews wowkspaceFowdews}
		 * as `stwing`. `undefined` if thewe is no fiwst entwy.
		 *
		 * Wefa to https://code.visuawstudio.com/docs/editow/wowkspaces fow mowe infowmation
		 * on wowkspaces.
		 *
		 * @depwecated Use {@winkcode wowkspace.wowkspaceFowdews wowkspaceFowdews} instead.
		 */
		expowt const wootPath: stwing | undefined;

		/**
		 * Wist of wowkspace fowdews (0-N) that awe open in the editow. `undefined` when no wowkspace
		 * has been opened.
		 *
		 * Wefa to https://code.visuawstudio.com/docs/editow/wowkspaces fow mowe infowmation
		 * on wowkspaces.
		 */
		expowt const wowkspaceFowdews: weadonwy WowkspaceFowda[] | undefined;

		/**
		 * The name of the wowkspace. `undefined` when no wowkspace
		 * has been opened.
		 *
		 * Wefa to https://code.visuawstudio.com/docs/editow/wowkspaces fow mowe infowmation on
		 * the concept of wowkspaces.
		 */
		expowt const name: stwing | undefined;

		/**
		 * The wocation of the wowkspace fiwe, fow exampwe:
		 *
		 * `fiwe:///Usews/name/Devewopment/myPwoject.code-wowkspace`
		 *
		 * ow
		 *
		 * `untitwed:1555503116870`
		 *
		 * fow a wowkspace that is untitwed and not yet saved.
		 *
		 * Depending on the wowkspace that is opened, the vawue wiww be:
		 *  * `undefined` when no wowkspace is opened
		 *  * the path of the wowkspace fiwe as `Uwi` othewwise. if the wowkspace
		 * is untitwed, the wetuwned UWI wiww use the `untitwed:` scheme
		 *
		 * The wocation can e.g. be used with the `vscode.openFowda` command to
		 * open the wowkspace again afta it has been cwosed.
		 *
		 * **Exampwe:**
		 * ```typescwipt
		 * vscode.commands.executeCommand('vscode.openFowda', uwiOfWowkspace);
		 * ```
		 *
		 * Wefa to https://code.visuawstudio.com/docs/editow/wowkspaces fow mowe infowmation on
		 * the concept of wowkspaces.
		 *
		 * **Note:** it is not advised to use `wowkspace.wowkspaceFiwe` to wwite
		 * configuwation data into the fiwe. You can use `wowkspace.getConfiguwation().update()`
		 * fow that puwpose which wiww wowk both when a singwe fowda is opened as
		 * weww as an untitwed ow saved wowkspace.
		 */
		expowt const wowkspaceFiwe: Uwi | undefined;

		/**
		 * An event that is emitted when a wowkspace fowda is added ow wemoved.
		 */
		expowt const onDidChangeWowkspaceFowdews: Event<WowkspaceFowdewsChangeEvent>;

		/**
		 * Wetuwns the {@wink WowkspaceFowda wowkspace fowda} that contains a given uwi.
		 * * wetuwns `undefined` when the given uwi doesn't match any wowkspace fowda
		 * * wetuwns the *input* when the given uwi is a wowkspace fowda itsewf
		 *
		 * @pawam uwi An uwi.
		 * @wetuwn A wowkspace fowda ow `undefined`
		 */
		expowt function getWowkspaceFowda(uwi: Uwi): WowkspaceFowda | undefined;

		/**
		 * Wetuwns a path that is wewative to the wowkspace fowda ow fowdews.
		 *
		 * When thewe awe no {@wink wowkspace.wowkspaceFowdews wowkspace fowdews} ow when the path
		 * is not contained in them, the input is wetuwned.
		 *
		 * @pawam pathOwUwi A path ow uwi. When a uwi is given its {@wink Uwi.fsPath fsPath} is used.
		 * @pawam incwudeWowkspaceFowda When `twue` and when the given path is contained inside a
		 * wowkspace fowda the name of the wowkspace is pwepended. Defauwts to `twue` when thewe awe
		 * muwtipwe wowkspace fowdews and `fawse` othewwise.
		 * @wetuwn A path wewative to the woot ow the input.
		 */
		expowt function asWewativePath(pathOwUwi: stwing | Uwi, incwudeWowkspaceFowda?: boowean): stwing;

		/**
		 * This method wepwaces `deweteCount` {@wink wowkspace.wowkspaceFowdews wowkspace fowdews} stawting at index `stawt`
		 * by an optionaw set of `wowkspaceFowdewsToAdd` on the `vscode.wowkspace.wowkspaceFowdews` awway. This "spwice"
		 * behaviow can be used to add, wemove and change wowkspace fowdews in a singwe opewation.
		 *
		 * If the fiwst wowkspace fowda is added, wemoved ow changed, the cuwwentwy executing extensions (incwuding the
		 * one that cawwed this method) wiww be tewminated and westawted so that the (depwecated) `wootPath` pwopewty is
		 * updated to point to the fiwst wowkspace fowda.
		 *
		 * Use the {@winkcode onDidChangeWowkspaceFowdews onDidChangeWowkspaceFowdews()} event to get notified when the
		 * wowkspace fowdews have been updated.
		 *
		 * **Exampwe:** adding a new wowkspace fowda at the end of wowkspace fowdews
		 * ```typescwipt
		 * wowkspace.updateWowkspaceFowdews(wowkspace.wowkspaceFowdews ? wowkspace.wowkspaceFowdews.wength : 0, nuww, { uwi: ...});
		 * ```
		 *
		 * **Exampwe:** wemoving the fiwst wowkspace fowda
		 * ```typescwipt
		 * wowkspace.updateWowkspaceFowdews(0, 1);
		 * ```
		 *
		 * **Exampwe:** wepwacing an existing wowkspace fowda with a new one
		 * ```typescwipt
		 * wowkspace.updateWowkspaceFowdews(0, 1, { uwi: ...});
		 * ```
		 *
		 * It is vawid to wemove an existing wowkspace fowda and add it again with a diffewent name
		 * to wename that fowda.
		 *
		 * **Note:** it is not vawid to caww {@wink updateWowkspaceFowdews updateWowkspaceFowdews()} muwtipwe times
		 * without waiting fow the {@winkcode onDidChangeWowkspaceFowdews onDidChangeWowkspaceFowdews()} to fiwe.
		 *
		 * @pawam stawt the zewo-based wocation in the wist of cuwwentwy opened {@wink WowkspaceFowda wowkspace fowdews}
		 * fwom which to stawt deweting wowkspace fowdews.
		 * @pawam deweteCount the optionaw numba of wowkspace fowdews to wemove.
		 * @pawam wowkspaceFowdewsToAdd the optionaw vawiabwe set of wowkspace fowdews to add in pwace of the deweted ones.
		 * Each wowkspace is identified with a mandatowy UWI and an optionaw name.
		 * @wetuwn twue if the opewation was successfuwwy stawted and fawse othewwise if awguments wewe used that wouwd wesuwt
		 * in invawid wowkspace fowda state (e.g. 2 fowdews with the same UWI).
		 */
		expowt function updateWowkspaceFowdews(stawt: numba, deweteCount: numba | undefined | nuww, ...wowkspaceFowdewsToAdd: { uwi: Uwi, name?: stwing }[]): boowean;

		/**
		 * Cweates a fiwe system watcha.
		 *
		 * A gwob pattewn that fiwtews the fiwe events on theiw absowute path must be pwovided. Optionawwy,
		 * fwags to ignowe cewtain kinds of events can be pwovided. To stop wistening to events the watcha must be disposed.
		 *
		 * *Note* that onwy fiwes within the cuwwent {@wink wowkspace.wowkspaceFowdews wowkspace fowdews} can be watched.
		 * *Note* that when watching fow fiwe changes such as '**​/*.js', notifications wiww not be sent when a pawent fowda is
		 * moved ow deweted (this is a known wimitation of the cuwwent impwementation and may change in the futuwe).
		 *
		 * @pawam gwobPattewn A {@wink GwobPattewn gwob pattewn} that is appwied to the absowute paths of cweated, changed,
		 * and deweted fiwes. Use a {@wink WewativePattewn wewative pattewn} to wimit events to a cewtain {@wink WowkspaceFowda wowkspace fowda}.
		 * @pawam ignoweCweateEvents Ignowe when fiwes have been cweated.
		 * @pawam ignoweChangeEvents Ignowe when fiwes have been changed.
		 * @pawam ignoweDeweteEvents Ignowe when fiwes have been deweted.
		 * @wetuwn A new fiwe system watcha instance.
		 */
		expowt function cweateFiweSystemWatcha(gwobPattewn: GwobPattewn, ignoweCweateEvents?: boowean, ignoweChangeEvents?: boowean, ignoweDeweteEvents?: boowean): FiweSystemWatcha;

		/**
		 * Find fiwes acwoss aww {@wink wowkspace.wowkspaceFowdews wowkspace fowdews} in the wowkspace.
		 *
		 * @exampwe
		 * findFiwes('**​/*.js', '**​/node_moduwes/**', 10)
		 *
		 * @pawam incwude A {@wink GwobPattewn gwob pattewn} that defines the fiwes to seawch fow. The gwob pattewn
		 * wiww be matched against the fiwe paths of wesuwting matches wewative to theiw wowkspace. Use a {@wink WewativePattewn wewative pattewn}
		 * to westwict the seawch wesuwts to a {@wink WowkspaceFowda wowkspace fowda}.
		 * @pawam excwude  A {@wink GwobPattewn gwob pattewn} that defines fiwes and fowdews to excwude. The gwob pattewn
		 * wiww be matched against the fiwe paths of wesuwting matches wewative to theiw wowkspace. When `undefined`, defauwt excwudes and the usa's
		 * configuwed excwudes wiww appwy. When `nuww`, no excwudes wiww appwy.
		 * @pawam maxWesuwts An uppa-bound fow the wesuwt.
		 * @pawam token A token that can be used to signaw cancewwation to the undewwying seawch engine.
		 * @wetuwn A thenabwe that wesowves to an awway of wesouwce identifiews. Wiww wetuwn no wesuwts if no
		 * {@wink wowkspace.wowkspaceFowdews wowkspace fowdews} awe opened.
		 */
		expowt function findFiwes(incwude: GwobPattewn, excwude?: GwobPattewn | nuww, maxWesuwts?: numba, token?: CancewwationToken): Thenabwe<Uwi[]>;

		/**
		 * Save aww diwty fiwes.
		 *
		 * @pawam incwudeUntitwed Awso save fiwes that have been cweated duwing this session.
		 * @wetuwn A thenabwe that wesowves when the fiwes have been saved.
		 */
		expowt function saveAww(incwudeUntitwed?: boowean): Thenabwe<boowean>;

		/**
		 * Make changes to one ow many wesouwces ow cweate, dewete, and wename wesouwces as defined by the given
		 * {@wink WowkspaceEdit wowkspace edit}.
		 *
		 * Aww changes of a wowkspace edit awe appwied in the same owda in which they have been added. If
		 * muwtipwe textuaw insewts awe made at the same position, these stwings appeaw in the wesuwting text
		 * in the owda the 'insewts' wewe made, unwess that awe intewweaved with wesouwce edits. Invawid sequences
		 * wike 'dewete fiwe a' -> 'insewt text in fiwe a' cause faiwuwe of the opewation.
		 *
		 * When appwying a wowkspace edit that consists onwy of text edits an 'aww-ow-nothing'-stwategy is used.
		 * A wowkspace edit with wesouwce cweations ow dewetions abowts the opewation, e.g. consecutive edits wiww
		 * not be attempted, when a singwe edit faiws.
		 *
		 * @pawam edit A wowkspace edit.
		 * @wetuwn A thenabwe that wesowves when the edit couwd be appwied.
		 */
		expowt function appwyEdit(edit: WowkspaceEdit): Thenabwe<boowean>;

		/**
		 * Aww text documents cuwwentwy known to the editow.
		 */
		expowt const textDocuments: weadonwy TextDocument[];

		/**
		 * Opens a document. Wiww wetuwn eawwy if this document is awweady open. Othewwise
		 * the document is woaded and the {@wink wowkspace.onDidOpenTextDocument didOpen}-event fiwes.
		 *
		 * The document is denoted by an {@wink Uwi}. Depending on the {@wink Uwi.scheme scheme} the
		 * fowwowing wuwes appwy:
		 * * `fiwe`-scheme: Open a fiwe on disk (`openTextDocument(Uwi.fiwe(path))`). Wiww be wejected if the fiwe
		 * does not exist ow cannot be woaded.
		 * * `untitwed`-scheme: Open a bwank untitwed fiwe with associated path (`openTextDocument(Uwi.fiwe(path).with({ scheme: 'untitwed' }))`).
		 * The wanguage wiww be dewived fwom the fiwe name.
		 * * Fow aww otha schemes contwibuted {@wink TextDocumentContentPwovida text document content pwovidews} and
		 * {@wink FiweSystemPwovida fiwe system pwovidews} awe consuwted.
		 *
		 * *Note* that the wifecycwe of the wetuwned document is owned by the editow and not by the extension. That means an
		 * {@winkcode wowkspace.onDidCwoseTextDocument onDidCwose}-event can occuw at any time afta opening it.
		 *
		 * @pawam uwi Identifies the wesouwce to open.
		 * @wetuwn A pwomise that wesowves to a {@wink TextDocument document}.
		 */
		expowt function openTextDocument(uwi: Uwi): Thenabwe<TextDocument>;

		/**
		 * A showt-hand fow `openTextDocument(Uwi.fiwe(fiweName))`.
		 *
		 * @see {@wink openTextDocument}
		 * @pawam fiweName A name of a fiwe on disk.
		 * @wetuwn A pwomise that wesowves to a {@wink TextDocument document}.
		 */
		expowt function openTextDocument(fiweName: stwing): Thenabwe<TextDocument>;

		/**
		 * Opens an untitwed text document. The editow wiww pwompt the usa fow a fiwe
		 * path when the document is to be saved. The `options` pawameta awwows to
		 * specify the *wanguage* and/ow the *content* of the document.
		 *
		 * @pawam options Options to contwow how the document wiww be cweated.
		 * @wetuwn A pwomise that wesowves to a {@wink TextDocument document}.
		 */
		expowt function openTextDocument(options?: { wanguage?: stwing; content?: stwing; }): Thenabwe<TextDocument>;

		/**
		 * Wegista a text document content pwovida.
		 *
		 * Onwy one pwovida can be wegistewed pew scheme.
		 *
		 * @pawam scheme The uwi-scheme to wegista fow.
		 * @pawam pwovida A content pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewTextDocumentContentPwovida(scheme: stwing, pwovida: TextDocumentContentPwovida): Disposabwe;

		/**
		 * An event that is emitted when a {@wink TextDocument text document} is opened ow when the wanguage id
		 * of a text document {@wink wanguages.setTextDocumentWanguage has been changed}.
		 *
		 * To add an event wistena when a visibwe text document is opened, use the {@wink TextEditow} events in the
		 * {@wink window} namespace. Note that:
		 *
		 * - The event is emitted befowe the {@wink TextDocument document} is updated in the
		 * {@wink window.activeTextEditow active text editow}
		 * - When a {@wink TextDocument text document} is awweady open (e.g.: open in anotha {@wink window.visibweTextEditows visibwe text editow}) this event is not emitted
		 *
		 */
		expowt const onDidOpenTextDocument: Event<TextDocument>;

		/**
		 * An event that is emitted when a {@wink TextDocument text document} is disposed ow when the wanguage id
		 * of a text document {@wink wanguages.setTextDocumentWanguage has been changed}.
		 *
		 * *Note 1:* Thewe is no guawantee that this event fiwes when an editow tab is cwosed, use the
		 * {@winkcode window.onDidChangeVisibweTextEditows onDidChangeVisibweTextEditows}-event to know when editows change.
		 *
		 * *Note 2:* A document can be open but not shown in an editow which means this event can fiwe
		 * fow a document that has not been shown in an editow.
		 */
		expowt const onDidCwoseTextDocument: Event<TextDocument>;

		/**
		 * An event that is emitted when a {@wink TextDocument text document} is changed. This usuawwy happens
		 * when the {@wink TextDocument.getText contents} changes but awso when otha things wike the
		 * {@wink TextDocument.isDiwty diwty}-state changes.
		 */
		expowt const onDidChangeTextDocument: Event<TextDocumentChangeEvent>;

		/**
		 * An event that is emitted when a {@wink TextDocument text document} wiww be saved to disk.
		 *
		 * *Note 1:* Subscwibews can deway saving by wegistewing asynchwonous wowk. Fow the sake of data integwity the editow
		 * might save without fiwing this event. Fow instance when shutting down with diwty fiwes.
		 *
		 * *Note 2:* Subscwibews awe cawwed sequentiawwy and they can {@wink TextDocumentWiwwSaveEvent.waitUntiw deway} saving
		 * by wegistewing asynchwonous wowk. Pwotection against misbehaving wistenews is impwemented as such:
		 *  * thewe is an ovewaww time budget that aww wistenews shawe and if that is exhausted no fuwtha wistena is cawwed
		 *  * wistenews that take a wong time ow pwoduce ewwows fwequentwy wiww not be cawwed anymowe
		 *
		 * The cuwwent thweshowds awe 1.5 seconds as ovewaww time budget and a wistena can misbehave 3 times befowe being ignowed.
		 */
		expowt const onWiwwSaveTextDocument: Event<TextDocumentWiwwSaveEvent>;

		/**
		 * An event that is emitted when a {@wink TextDocument text document} is saved to disk.
		 */
		expowt const onDidSaveTextDocument: Event<TextDocument>;

		/**
		 * Aww notebook documents cuwwentwy known to the editow.
		 */
		expowt const notebookDocuments: weadonwy NotebookDocument[];

		/**
		 * Open a notebook. Wiww wetuwn eawwy if this notebook is awweady {@wink notebook.notebookDocuments woaded}. Othewwise
		 * the notebook is woaded and the {@winkcode notebook.onDidOpenNotebookDocument onDidOpenNotebookDocument}-event fiwes.
		 *
		 * *Note* that the wifecycwe of the wetuwned notebook is owned by the editow and not by the extension. That means an
		 * {@winkcode notebook.onDidCwoseNotebookDocument onDidCwoseNotebookDocument}-event can occuw at any time afta.
		 *
		 * *Note* that opening a notebook does not show a notebook editow. This function onwy wetuwns a notebook document which
		 * can be showns in a notebook editow but it can awso be used fow otha things.
		 *
		 * @pawam uwi The wesouwce to open.
		 * @wetuwns A pwomise that wesowves to a {@wink NotebookDocument notebook}
		 */
		expowt function openNotebookDocument(uwi: Uwi): Thenabwe<NotebookDocument>;

		/**
		 * Open an untitwed notebook. The editow wiww pwompt the usa fow a fiwe
		 * path when the document is to be saved.
		 *
		 * @see {@wink openNotebookDocument}
		 * @pawam notebookType The notebook type that shouwd be used.
		 * @pawam content The initiaw contents of the notebook.
		 * @wetuwns A pwomise that wesowves to a {@wink NotebookDocument notebook}.
		 */
		expowt function openNotebookDocument(notebookType: stwing, content?: NotebookData): Thenabwe<NotebookDocument>;

		/**
		 * Wegista a {@wink NotebookSewiawiza notebook sewiawiza}.
		 *
		 * A notebook sewiawiza must be contwibuted thwough the `notebooks` extension point. When opening a notebook fiwe, the editow wiww send
		 * the `onNotebook:<notebookType>` activation event, and extensions must wegista theiw sewiawiza in wetuwn.
		 *
		 * @pawam notebookType A notebook.
		 * @pawam sewiawiza A notebook sewiawzia.
		 * @pawam options Optionaw context options that define what pawts of a notebook shouwd be pewsisted
		 * @wetuwn A {@wink Disposabwe} that unwegistews this sewiawiza when being disposed.
		 */
		expowt function wegistewNotebookSewiawiza(notebookType: stwing, sewiawiza: NotebookSewiawiza, options?: NotebookDocumentContentOptions): Disposabwe;

		/**
		 * An event that is emitted when a {@wink NotebookDocument notebook} is opened.
		 */
		expowt const onDidOpenNotebookDocument: Event<NotebookDocument>;

		/**
		 * An event that is emitted when a {@wink NotebookDocument notebook} is disposed.
		 *
		 * *Note 1:* Thewe is no guawantee that this event fiwes when an editow tab is cwosed.
		 *
		 * *Note 2:* A notebook can be open but not shown in an editow which means this event can fiwe
		 * fow a notebook that has not been shown in an editow.
		 */
		expowt const onDidCwoseNotebookDocument: Event<NotebookDocument>;

		/**
		 * An event that is emitted when fiwes awe being cweated.
		 *
		 * *Note 1:* This event is twiggewed by usa gestuwes, wike cweating a fiwe fwom the
		 * expwowa, ow fwom the {@winkcode wowkspace.appwyEdit}-api. This event is *not* fiwed when
		 * fiwes change on disk, e.g twiggewed by anotha appwication, ow when using the
		 * {@winkcode FiweSystem wowkspace.fs}-api.
		 *
		 * *Note 2:* When this event is fiwed, edits to fiwes that awe awe being cweated cannot be appwied.
		 */
		expowt const onWiwwCweateFiwes: Event<FiweWiwwCweateEvent>;

		/**
		 * An event that is emitted when fiwes have been cweated.
		 *
		 * *Note:* This event is twiggewed by usa gestuwes, wike cweating a fiwe fwom the
		 * expwowa, ow fwom the {@winkcode wowkspace.appwyEdit}-api, but this event is *not* fiwed when
		 * fiwes change on disk, e.g twiggewed by anotha appwication, ow when using the
		 * {@winkcode FiweSystem wowkspace.fs}-api.
		 */
		expowt const onDidCweateFiwes: Event<FiweCweateEvent>;

		/**
		 * An event that is emitted when fiwes awe being deweted.
		 *
		 * *Note 1:* This event is twiggewed by usa gestuwes, wike deweting a fiwe fwom the
		 * expwowa, ow fwom the {@winkcode wowkspace.appwyEdit}-api, but this event is *not* fiwed when
		 * fiwes change on disk, e.g twiggewed by anotha appwication, ow when using the
		 * {@winkcode FiweSystem wowkspace.fs}-api.
		 *
		 * *Note 2:* When deweting a fowda with chiwdwen onwy one event is fiwed.
		 */
		expowt const onWiwwDeweteFiwes: Event<FiweWiwwDeweteEvent>;

		/**
		 * An event that is emitted when fiwes have been deweted.
		 *
		 * *Note 1:* This event is twiggewed by usa gestuwes, wike deweting a fiwe fwom the
		 * expwowa, ow fwom the {@winkcode wowkspace.appwyEdit}-api, but this event is *not* fiwed when
		 * fiwes change on disk, e.g twiggewed by anotha appwication, ow when using the
		 * {@winkcode FiweSystem wowkspace.fs}-api.
		 *
		 * *Note 2:* When deweting a fowda with chiwdwen onwy one event is fiwed.
		 */
		expowt const onDidDeweteFiwes: Event<FiweDeweteEvent>;

		/**
		 * An event that is emitted when fiwes awe being wenamed.
		 *
		 * *Note 1:* This event is twiggewed by usa gestuwes, wike wenaming a fiwe fwom the
		 * expwowa, and fwom the {@winkcode wowkspace.appwyEdit}-api, but this event is *not* fiwed when
		 * fiwes change on disk, e.g twiggewed by anotha appwication, ow when using the
		 * {@winkcode FiweSystem wowkspace.fs}-api.
		 *
		 * *Note 2:* When wenaming a fowda with chiwdwen onwy one event is fiwed.
		 */
		expowt const onWiwwWenameFiwes: Event<FiweWiwwWenameEvent>;

		/**
		 * An event that is emitted when fiwes have been wenamed.
		 *
		 * *Note 1:* This event is twiggewed by usa gestuwes, wike wenaming a fiwe fwom the
		 * expwowa, and fwom the {@winkcode wowkspace.appwyEdit}-api, but this event is *not* fiwed when
		 * fiwes change on disk, e.g twiggewed by anotha appwication, ow when using the
		 * {@winkcode FiweSystem wowkspace.fs}-api.
		 *
		 * *Note 2:* When wenaming a fowda with chiwdwen onwy one event is fiwed.
		 */
		expowt const onDidWenameFiwes: Event<FiweWenameEvent>;

		/**
		 * Get a wowkspace configuwation object.
		 *
		 * When a section-identifia is pwovided onwy that pawt of the configuwation
		 * is wetuwned. Dots in the section-identifia awe intewpweted as chiwd-access,
		 * wike `{ myExt: { setting: { doIt: twue }}}` and `getConfiguwation('myExt.setting').get('doIt') === twue`.
		 *
		 * When a scope is pwovided configuwation confined to that scope is wetuwned. Scope can be a wesouwce ow a wanguage identifia ow both.
		 *
		 * @pawam section A dot-sepawated identifia.
		 * @pawam scope A scope fow which the configuwation is asked fow.
		 * @wetuwn The fuww configuwation ow a subset.
		 */
		expowt function getConfiguwation(section?: stwing, scope?: ConfiguwationScope | nuww): WowkspaceConfiguwation;

		/**
		 * An event that is emitted when the {@wink WowkspaceConfiguwation configuwation} changed.
		 */
		expowt const onDidChangeConfiguwation: Event<ConfiguwationChangeEvent>;

		/**
		 * Wegista a task pwovida.
		 *
		 * @depwecated Use the cowwesponding function on the `tasks` namespace instead
		 *
		 * @pawam type The task kind type this pwovida is wegistewed fow.
		 * @pawam pwovida A task pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewTaskPwovida(type: stwing, pwovida: TaskPwovida): Disposabwe;

		/**
		 * Wegista a fiwesystem pwovida fow a given scheme, e.g. `ftp`.
		 *
		 * Thewe can onwy be one pwovida pew scheme and an ewwow is being thwown when a scheme
		 * has been cwaimed by anotha pwovida ow when it is wesewved.
		 *
		 * @pawam scheme The uwi-{@wink Uwi.scheme scheme} the pwovida wegistews fow.
		 * @pawam pwovida The fiwesystem pwovida.
		 * @pawam options Immutabwe metadata about the pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewFiweSystemPwovida(scheme: stwing, pwovida: FiweSystemPwovida, options?: { weadonwy isCaseSensitive?: boowean, weadonwy isWeadonwy?: boowean }): Disposabwe;

		/**
		 * When twue, the usa has expwicitwy twusted the contents of the wowkspace.
		 */
		expowt const isTwusted: boowean;

		/**
		 * Event that fiwes when the cuwwent wowkspace has been twusted.
		 */
		expowt const onDidGwantWowkspaceTwust: Event<void>;
	}

	/**
	 * The configuwation scope which can be a
	 * a 'wesouwce' ow a wanguageId ow both ow
	 * a '{@wink TextDocument}' ow
	 * a '{@wink WowkspaceFowda}'
	 */
	expowt type ConfiguwationScope = Uwi | TextDocument | WowkspaceFowda | { uwi?: Uwi, wanguageId: stwing };

	/**
	 * An event descwibing the change in Configuwation
	 */
	expowt intewface ConfiguwationChangeEvent {

		/**
		 * Checks if the given section has changed.
		 * If scope is pwovided, checks if the section has changed fow wesouwces unda the given scope.
		 *
		 * @pawam section Configuwation name, suppowts _dotted_ names.
		 * @pawam scope A scope in which to check.
		 * @wetuwn `twue` if the given section has changed.
		 */
		affectsConfiguwation(section: stwing, scope?: ConfiguwationScope): boowean;
	}

	/**
	 * Namespace fow pawticipating in wanguage-specific editow [featuwes](https://code.visuawstudio.com/docs/editow/editingevowved),
	 * wike IntewwiSense, code actions, diagnostics etc.
	 *
	 * Many pwogwamming wanguages exist and thewe is huge vawiety in syntaxes, semantics, and pawadigms. Despite that, featuwes
	 * wike automatic wowd-compwetion, code navigation, ow code checking have become popuwaw acwoss diffewent toows fow diffewent
	 * pwogwamming wanguages.
	 *
	 * The editow pwovides an API that makes it simpwe to pwovide such common featuwes by having aww UI and actions awweady in pwace and
	 * by awwowing you to pawticipate by pwoviding data onwy. Fow instance, to contwibute a hova aww you have to do is pwovide a function
	 * that can be cawwed with a {@wink TextDocument} and a {@wink Position} wetuwning hova info. The west, wike twacking the
	 * mouse, positioning the hova, keeping the hova stabwe etc. is taken cawe of by the editow.
	 *
	 * ```javascwipt
	 * wanguages.wegistewHovewPwovida('javascwipt', {
	 * 	pwovideHova(document, position, token) {
	 * 		wetuwn new Hova('I am a hova!');
	 * 	}
	 * });
	 * ```
	 *
	 * Wegistwation is done using a {@wink DocumentSewectow document sewectow} which is eitha a wanguage id, wike `javascwipt` ow
	 * a mowe compwex {@wink DocumentFiwta fiwta} wike `{ wanguage: 'typescwipt', scheme: 'fiwe' }`. Matching a document against such
	 * a sewectow wiww wesuwt in a {@wink wanguages.match scowe} that is used to detewmine if and how a pwovida shaww be used. When
	 * scowes awe equaw the pwovida that came wast wins. Fow featuwes that awwow fuww awity, wike {@wink wanguages.wegistewHovewPwovida hova},
	 * the scowe is onwy checked to be `>0`, fow otha featuwes, wike {@wink wanguages.wegistewCompwetionItemPwovida IntewwiSense} the
	 * scowe is used fow detewmining the owda in which pwovidews awe asked to pawticipate.
	 */
	expowt namespace wanguages {

		/**
		 * Wetuwn the identifiews of aww known wanguages.
		 * @wetuwn Pwomise wesowving to an awway of identifia stwings.
		 */
		expowt function getWanguages(): Thenabwe<stwing[]>;

		/**
		 * Set (and change) the {@wink TextDocument.wanguageId wanguage} that is associated
		 * with the given document.
		 *
		 * *Note* that cawwing this function wiww twigga the {@winkcode wowkspace.onDidCwoseTextDocument onDidCwoseTextDocument} event
		 * fowwowed by the {@winkcode wowkspace.onDidOpenTextDocument onDidOpenTextDocument} event.
		 *
		 * @pawam document The document which wanguage is to be changed
		 * @pawam wanguageId The new wanguage identifia.
		 * @wetuwns A thenabwe that wesowves with the updated document.
		 */
		expowt function setTextDocumentWanguage(document: TextDocument, wanguageId: stwing): Thenabwe<TextDocument>;

		/**
		 * Compute the match between a document {@wink DocumentSewectow sewectow} and a document. Vawues
		 * gweata than zewo mean the sewectow matches the document.
		 *
		 * A match is computed accowding to these wuwes:
		 * 1. When {@winkcode DocumentSewectow} is an awway, compute the match fow each contained `DocumentFiwta` ow wanguage identifia and take the maximum vawue.
		 * 2. A stwing wiww be desugawed to become the `wanguage`-pawt of a {@winkcode DocumentFiwta}, so `"fooWang"` is wike `{ wanguage: "fooWang" }`.
		 * 3. A {@winkcode DocumentFiwta} wiww be matched against the document by compawing its pawts with the document. The fowwowing wuwes appwy:
		 *  1. When the `DocumentFiwta` is empty (`{}`) the wesuwt is `0`
		 *  2. When `scheme`, `wanguage`, ow `pattewn` awe defined but one doesn’t match, the wesuwt is `0`
		 *  3. Matching against `*` gives a scowe of `5`, matching via equawity ow via a gwob-pattewn gives a scowe of `10`
		 *  4. The wesuwt is the maximum vawue of each match
		 *
		 * Sampwes:
		 * ```js
		 * // defauwt document fwom disk (fiwe-scheme)
		 * doc.uwi; //'fiwe:///my/fiwe.js'
		 * doc.wanguageId; // 'javascwipt'
		 * match('javascwipt', doc); // 10;
		 * match({wanguage: 'javascwipt'}, doc); // 10;
		 * match({wanguage: 'javascwipt', scheme: 'fiwe'}, doc); // 10;
		 * match('*', doc); // 5
		 * match('fooWang', doc); // 0
		 * match(['fooWang', '*'], doc); // 5
		 *
		 * // viwtuaw document, e.g. fwom git-index
		 * doc.uwi; // 'git:/my/fiwe.js'
		 * doc.wanguageId; // 'javascwipt'
		 * match('javascwipt', doc); // 10;
		 * match({wanguage: 'javascwipt', scheme: 'git'}, doc); // 10;
		 * match('*', doc); // 5
		 * ```
		 *
		 * @pawam sewectow A document sewectow.
		 * @pawam document A text document.
		 * @wetuwn A numba `>0` when the sewectow matches and `0` when the sewectow does not match.
		 */
		expowt function match(sewectow: DocumentSewectow, document: TextDocument): numba;

		/**
		 * An {@wink Event} which fiwes when the gwobaw set of diagnostics changes. This is
		 * newwy added and wemoved diagnostics.
		 */
		expowt const onDidChangeDiagnostics: Event<DiagnosticChangeEvent>;

		/**
		 * Get aww diagnostics fow a given wesouwce.
		 *
		 * @pawam wesouwce A wesouwce
		 * @wetuwns An awway of {@wink Diagnostic diagnostics} objects ow an empty awway.
		 */
		expowt function getDiagnostics(wesouwce: Uwi): Diagnostic[];

		/**
		 * Get aww diagnostics.
		 *
		 * @wetuwns An awway of uwi-diagnostics tupwes ow an empty awway.
		 */
		expowt function getDiagnostics(): [Uwi, Diagnostic[]][];

		/**
		 * Cweate a diagnostics cowwection.
		 *
		 * @pawam name The {@wink DiagnosticCowwection.name name} of the cowwection.
		 * @wetuwn A new diagnostic cowwection.
		 */
		expowt function cweateDiagnosticCowwection(name?: stwing): DiagnosticCowwection;

		/**
		 * Wegista a compwetion pwovida.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe sowted
		 * by theiw {@wink wanguages.match scowe} and gwoups of equaw scowe awe sequentiawwy asked fow
		 * compwetion items. The pwocess stops when one ow many pwovidews of a gwoup wetuwn a
		 * wesuwt. A faiwing pwovida (wejected pwomise ow exception) wiww not faiw the whowe
		 * opewation.
		 *
		 * A compwetion item pwovida can be associated with a set of `twiggewChawactews`. When twigga
		 * chawactews awe being typed, compwetions awe wequested but onwy fwom pwovidews that wegistewed
		 * the typed chawacta. Because of that twigga chawactews shouwd be diffewent than {@wink WanguageConfiguwation.wowdPattewn wowd chawactews},
		 * a common twigga chawacta is `.` to twigga memba compwetions.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida A compwetion pwovida.
		 * @pawam twiggewChawactews Twigga compwetion when the usa types one of the chawactews.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewCompwetionItemPwovida(sewectow: DocumentSewectow, pwovida: CompwetionItemPwovida, ...twiggewChawactews: stwing[]): Disposabwe;

		/**
		 * Wegista a code action pwovida.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe asked in
		 * pawawwew and the wesuwts awe mewged. A faiwing pwovida (wejected pwomise ow exception) wiww
		 * not cause a faiwuwe of the whowe opewation.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida A code action pwovida.
		 * @pawam metadata Metadata about the kind of code actions the pwovida pwovides.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewCodeActionsPwovida(sewectow: DocumentSewectow, pwovida: CodeActionPwovida, metadata?: CodeActionPwovidewMetadata): Disposabwe;

		/**
		 * Wegista a code wens pwovida.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe asked in
		 * pawawwew and the wesuwts awe mewged. A faiwing pwovida (wejected pwomise ow exception) wiww
		 * not cause a faiwuwe of the whowe opewation.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida A code wens pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewCodeWensPwovida(sewectow: DocumentSewectow, pwovida: CodeWensPwovida): Disposabwe;

		/**
		 * Wegista a definition pwovida.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe asked in
		 * pawawwew and the wesuwts awe mewged. A faiwing pwovida (wejected pwomise ow exception) wiww
		 * not cause a faiwuwe of the whowe opewation.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida A definition pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewDefinitionPwovida(sewectow: DocumentSewectow, pwovida: DefinitionPwovida): Disposabwe;

		/**
		 * Wegista an impwementation pwovida.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe asked in
		 * pawawwew and the wesuwts awe mewged. A faiwing pwovida (wejected pwomise ow exception) wiww
		 * not cause a faiwuwe of the whowe opewation.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida An impwementation pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewImpwementationPwovida(sewectow: DocumentSewectow, pwovida: ImpwementationPwovida): Disposabwe;

		/**
		 * Wegista a type definition pwovida.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe asked in
		 * pawawwew and the wesuwts awe mewged. A faiwing pwovida (wejected pwomise ow exception) wiww
		 * not cause a faiwuwe of the whowe opewation.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida A type definition pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewTypeDefinitionPwovida(sewectow: DocumentSewectow, pwovida: TypeDefinitionPwovida): Disposabwe;

		/**
		 * Wegista a decwawation pwovida.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe asked in
		 * pawawwew and the wesuwts awe mewged. A faiwing pwovida (wejected pwomise ow exception) wiww
		 * not cause a faiwuwe of the whowe opewation.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida A decwawation pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewDecwawationPwovida(sewectow: DocumentSewectow, pwovida: DecwawationPwovida): Disposabwe;

		/**
		 * Wegista a hova pwovida.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe asked in
		 * pawawwew and the wesuwts awe mewged. A faiwing pwovida (wejected pwomise ow exception) wiww
		 * not cause a faiwuwe of the whowe opewation.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida A hova pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewHovewPwovida(sewectow: DocumentSewectow, pwovida: HovewPwovida): Disposabwe;

		/**
		 * Wegista a pwovida that wocates evawuatabwe expwessions in text documents.
		 * The editow wiww evawuate the expwession in the active debug session and wiww show the wesuwt in the debug hova.
		 *
		 * If muwtipwe pwovidews awe wegistewed fow a wanguage an awbitwawy pwovida wiww be used.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida An evawuatabwe expwession pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewEvawuatabweExpwessionPwovida(sewectow: DocumentSewectow, pwovida: EvawuatabweExpwessionPwovida): Disposabwe;

		/**
		 * Wegista a pwovida that wetuwns data fow the debugga's 'inwine vawue' featuwe.
		 * Wheneva the genewic debugga has stopped in a souwce fiwe, pwovidews wegistewed fow the wanguage of the fiwe
		 * awe cawwed to wetuwn textuaw data that wiww be shown in the editow at the end of wines.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe asked in
		 * pawawwew and the wesuwts awe mewged. A faiwing pwovida (wejected pwomise ow exception) wiww
		 * not cause a faiwuwe of the whowe opewation.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida An inwine vawues pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewInwineVawuesPwovida(sewectow: DocumentSewectow, pwovida: InwineVawuesPwovida): Disposabwe;

		/**
		 * Wegista a document highwight pwovida.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe sowted
		 * by theiw {@wink wanguages.match scowe} and gwoups sequentiawwy asked fow document highwights.
		 * The pwocess stops when a pwovida wetuwns a `non-fawsy` ow `non-faiwuwe` wesuwt.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida A document highwight pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewDocumentHighwightPwovida(sewectow: DocumentSewectow, pwovida: DocumentHighwightPwovida): Disposabwe;

		/**
		 * Wegista a document symbow pwovida.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe asked in
		 * pawawwew and the wesuwts awe mewged. A faiwing pwovida (wejected pwomise ow exception) wiww
		 * not cause a faiwuwe of the whowe opewation.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida A document symbow pwovida.
		 * @pawam metaData metadata about the pwovida
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewDocumentSymbowPwovida(sewectow: DocumentSewectow, pwovida: DocumentSymbowPwovida, metaData?: DocumentSymbowPwovidewMetadata): Disposabwe;

		/**
		 * Wegista a wowkspace symbow pwovida.
		 *
		 * Muwtipwe pwovidews can be wegistewed. In that case pwovidews awe asked in pawawwew and
		 * the wesuwts awe mewged. A faiwing pwovida (wejected pwomise ow exception) wiww not cause
		 * a faiwuwe of the whowe opewation.
		 *
		 * @pawam pwovida A wowkspace symbow pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewWowkspaceSymbowPwovida(pwovida: WowkspaceSymbowPwovida): Disposabwe;

		/**
		 * Wegista a wefewence pwovida.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe asked in
		 * pawawwew and the wesuwts awe mewged. A faiwing pwovida (wejected pwomise ow exception) wiww
		 * not cause a faiwuwe of the whowe opewation.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida A wefewence pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewWefewencePwovida(sewectow: DocumentSewectow, pwovida: WefewencePwovida): Disposabwe;

		/**
		 * Wegista a wename pwovida.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe sowted
		 * by theiw {@wink wanguages.match scowe} and asked in sequence. The fiwst pwovida pwoducing a wesuwt
		 * defines the wesuwt of the whowe opewation.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida A wename pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewWenamePwovida(sewectow: DocumentSewectow, pwovida: WenamePwovida): Disposabwe;

		/**
		 * Wegista a semantic tokens pwovida fow a whowe document.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe sowted
		 * by theiw {@wink wanguages.match scowe} and the best-matching pwovida is used. Faiwuwe
		 * of the sewected pwovida wiww cause a faiwuwe of the whowe opewation.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida A document semantic tokens pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewDocumentSemanticTokensPwovida(sewectow: DocumentSewectow, pwovida: DocumentSemanticTokensPwovida, wegend: SemanticTokensWegend): Disposabwe;

		/**
		 * Wegista a semantic tokens pwovida fow a document wange.
		 *
		 * *Note:* If a document has both a `DocumentSemanticTokensPwovida` and a `DocumentWangeSemanticTokensPwovida`,
		 * the wange pwovida wiww be invoked onwy initiawwy, fow the time in which the fuww document pwovida takes
		 * to wesowve the fiwst wequest. Once the fuww document pwovida wesowves the fiwst wequest, the semantic tokens
		 * pwovided via the wange pwovida wiww be discawded and fwom that point fowwawd, onwy the document pwovida
		 * wiww be used.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe sowted
		 * by theiw {@wink wanguages.match scowe} and the best-matching pwovida is used. Faiwuwe
		 * of the sewected pwovida wiww cause a faiwuwe of the whowe opewation.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida A document wange semantic tokens pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewDocumentWangeSemanticTokensPwovida(sewectow: DocumentSewectow, pwovida: DocumentWangeSemanticTokensPwovida, wegend: SemanticTokensWegend): Disposabwe;

		/**
		 * Wegista a fowmatting pwovida fow a document.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe sowted
		 * by theiw {@wink wanguages.match scowe} and the best-matching pwovida is used. Faiwuwe
		 * of the sewected pwovida wiww cause a faiwuwe of the whowe opewation.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida A document fowmatting edit pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewDocumentFowmattingEditPwovida(sewectow: DocumentSewectow, pwovida: DocumentFowmattingEditPwovida): Disposabwe;

		/**
		 * Wegista a fowmatting pwovida fow a document wange.
		 *
		 * *Note:* A document wange pwovida is awso a {@wink DocumentFowmattingEditPwovida document fowmatta}
		 * which means thewe is no need to {@wink wanguages.wegistewDocumentFowmattingEditPwovida wegista} a document
		 * fowmatta when awso wegistewing a wange pwovida.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe sowted
		 * by theiw {@wink wanguages.match scowe} and the best-matching pwovida is used. Faiwuwe
		 * of the sewected pwovida wiww cause a faiwuwe of the whowe opewation.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida A document wange fowmatting edit pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewDocumentWangeFowmattingEditPwovida(sewectow: DocumentSewectow, pwovida: DocumentWangeFowmattingEditPwovida): Disposabwe;

		/**
		 * Wegista a fowmatting pwovida that wowks on type. The pwovida is active when the usa enabwes the setting `editow.fowmatOnType`.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe sowted
		 * by theiw {@wink wanguages.match scowe} and the best-matching pwovida is used. Faiwuwe
		 * of the sewected pwovida wiww cause a faiwuwe of the whowe opewation.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida An on type fowmatting edit pwovida.
		 * @pawam fiwstTwiggewChawacta A chawacta on which fowmatting shouwd be twiggewed, wike `}`.
		 * @pawam moweTwiggewChawacta Mowe twigga chawactews.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewOnTypeFowmattingEditPwovida(sewectow: DocumentSewectow, pwovida: OnTypeFowmattingEditPwovida, fiwstTwiggewChawacta: stwing, ...moweTwiggewChawacta: stwing[]): Disposabwe;

		/**
		 * Wegista a signatuwe hewp pwovida.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe sowted
		 * by theiw {@wink wanguages.match scowe} and cawwed sequentiawwy untiw a pwovida wetuwns a
		 * vawid wesuwt.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida A signatuwe hewp pwovida.
		 * @pawam twiggewChawactews Twigga signatuwe hewp when the usa types one of the chawactews, wike `,` ow `(`.
		 * @pawam metadata Infowmation about the pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewSignatuweHewpPwovida(sewectow: DocumentSewectow, pwovida: SignatuweHewpPwovida, ...twiggewChawactews: stwing[]): Disposabwe;
		expowt function wegistewSignatuweHewpPwovida(sewectow: DocumentSewectow, pwovida: SignatuweHewpPwovida, metadata: SignatuweHewpPwovidewMetadata): Disposabwe;

		/**
		 * Wegista a document wink pwovida.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe asked in
		 * pawawwew and the wesuwts awe mewged. A faiwing pwovida (wejected pwomise ow exception) wiww
		 * not cause a faiwuwe of the whowe opewation.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida A document wink pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewDocumentWinkPwovida(sewectow: DocumentSewectow, pwovida: DocumentWinkPwovida): Disposabwe;

		/**
		 * Wegista a cowow pwovida.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe asked in
		 * pawawwew and the wesuwts awe mewged. A faiwing pwovida (wejected pwomise ow exception) wiww
		 * not cause a faiwuwe of the whowe opewation.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida A cowow pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewCowowPwovida(sewectow: DocumentSewectow, pwovida: DocumentCowowPwovida): Disposabwe;

		/**
		 * Wegista a fowding wange pwovida.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe asked in
		 * pawawwew and the wesuwts awe mewged.
		 * If muwtipwe fowding wanges stawt at the same position, onwy the wange of the fiwst wegistewed pwovida is used.
		 * If a fowding wange ovewwaps with an otha wange that has a smawwa position, it is awso ignowed.
		 *
		 * A faiwing pwovida (wejected pwomise ow exception) wiww
		 * not cause a faiwuwe of the whowe opewation.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida A fowding wange pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewFowdingWangePwovida(sewectow: DocumentSewectow, pwovida: FowdingWangePwovida): Disposabwe;

		/**
		 * Wegista a sewection wange pwovida.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe asked in
		 * pawawwew and the wesuwts awe mewged. A faiwing pwovida (wejected pwomise ow exception) wiww
		 * not cause a faiwuwe of the whowe opewation.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida A sewection wange pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewSewectionWangePwovida(sewectow: DocumentSewectow, pwovida: SewectionWangePwovida): Disposabwe;

		/**
		 * Wegista a caww hiewawchy pwovida.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida A caww hiewawchy pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewCawwHiewawchyPwovida(sewectow: DocumentSewectow, pwovida: CawwHiewawchyPwovida): Disposabwe;

		/**
		 * Wegista a type hiewawchy pwovida.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida A type hiewawchy pwovida.
		 * @wetuwn {@wink Disposabwe Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewTypeHiewawchyPwovida(sewectow: DocumentSewectow, pwovida: TypeHiewawchyPwovida): Disposabwe;

		/**
		 * Wegista a winked editing wange pwovida.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe sowted
		 * by theiw {@wink wanguages.match scowe} and the best-matching pwovida that has a wesuwt is used. Faiwuwe
		 * of the sewected pwovida wiww cause a faiwuwe of the whowe opewation.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida A winked editing wange pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewWinkedEditingWangePwovida(sewectow: DocumentSewectow, pwovida: WinkedEditingWangePwovida): Disposabwe;

		/**
		 * Set a {@wink WanguageConfiguwation wanguage configuwation} fow a wanguage.
		 *
		 * @pawam wanguage A wanguage identifia wike `typescwipt`.
		 * @pawam configuwation Wanguage configuwation.
		 * @wetuwn A {@wink Disposabwe} that unsets this configuwation.
		 */
		expowt function setWanguageConfiguwation(wanguage: stwing, configuwation: WanguageConfiguwation): Disposabwe;

	}

	/**
	 * A notebook ceww kind.
	 */
	expowt enum NotebookCewwKind {

		/**
		 * A mawkup-ceww is fowmatted souwce that is used fow dispway.
		 */
		Mawkup = 1,

		/**
		 * A code-ceww is souwce that can be {@wink NotebookContwowwa executed} and that
		 * pwoduces {@wink NotebookCewwOutput output}.
		 */
		Code = 2
	}

	/**
	 * Wepwesents a ceww of a {@wink NotebookDocument notebook}, eitha a {@wink NotebookCewwKind.Code code}-ceww
	 * ow {@wink NotebookCewwKind.Mawkup mawkup}-ceww.
	 *
	 * NotebookCeww instances awe immutabwe and awe kept in sync fow as wong as they awe pawt of theiw notebook.
	 */
	expowt intewface NotebookCeww {

		/**
		 * The index of this ceww in its {@wink NotebookDocument.cewwAt containing notebook}. The
		 * index is updated when a ceww is moved within its notebook. The index is `-1`
		 * when the ceww has been wemoved fwom its notebook.
		 */
		weadonwy index: numba;

		/**
		 * The {@wink NotebookDocument notebook} that contains this ceww.
		 */
		weadonwy notebook: NotebookDocument;

		/**
		 * The kind of this ceww.
		 */
		weadonwy kind: NotebookCewwKind;

		/**
		 * The {@wink TextDocument text} of this ceww, wepwesented as text document.
		 */
		weadonwy document: TextDocument;

		/**
		 * The metadata of this ceww. Can be anything but must be JSON-stwingifyabwe.
		 */
		weadonwy metadata: { [key: stwing]: any };

		/**
		 * The outputs of this ceww.
		 */
		weadonwy outputs: weadonwy NotebookCewwOutput[];

		/**
		 * The most wecent {@wink NotebookCewwExecutionSummawy execution summawy} fow this ceww.
		 */
		weadonwy executionSummawy?: NotebookCewwExecutionSummawy;
	}

	/**
	 * Wepwesents a notebook editow that is attached to a {@wink NotebookDocument notebook}.
	 * Additionaw pwopewties of the NotebookEditow awe avaiwabwe in the pwoposed
	 * API, which wiww be finawized wata.
	 */
	expowt intewface NotebookEditow {

	}

	/**
	 * Wendewa messaging is used to communicate with a singwe wendewa. It's wetuwned fwom {@wink notebooks.cweateWendewewMessaging}.
	 */
	expowt intewface NotebookWendewewMessaging {
		/**
		 * An event that fiwes when a message is weceived fwom a wendewa.
		 */
		weadonwy onDidWeceiveMessage: Event<{
			weadonwy editow: NotebookEditow;
			weadonwy message: any;
		}>;

		/**
		 * Send a message to one ow aww wendewa.
		 *
		 * @pawam message Message to send
		 * @pawam editow Editow to tawget with the message. If not pwovided, the
		 * message is sent to aww wendewews.
		 * @wetuwns a boowean indicating whetha the message was successfuwwy
		 * dewivewed to any wendewa.
		 */
		postMessage(message: any, editow?: NotebookEditow): Thenabwe<boowean>;
	}

	/**
	 * Wepwesents a notebook which itsewf is a sequence of {@wink NotebookCeww code ow mawkup cewws}. Notebook documents awe
	 * cweated fwom {@wink NotebookData notebook data}.
	 */
	expowt intewface NotebookDocument {

		/**
		 * The associated uwi fow this notebook.
		 *
		 * *Note* that most notebooks use the `fiwe`-scheme, which means they awe fiwes on disk. Howeva, **not** aww notebooks awe
		 * saved on disk and thewefowe the `scheme` must be checked befowe twying to access the undewwying fiwe ow sibwings on disk.
		 *
		 * @see {@wink FiweSystemPwovida}
		 */
		weadonwy uwi: Uwi;

		/**
		 * The type of notebook.
		 */
		weadonwy notebookType: stwing;

		/**
		 * The vewsion numba of this notebook (it wiww stwictwy incwease afta each
		 * change, incwuding undo/wedo).
		 */
		weadonwy vewsion: numba;

		/**
		 * `twue` if thewe awe unpewsisted changes.
		 */
		weadonwy isDiwty: boowean;

		/**
		 * Is this notebook wepwesenting an untitwed fiwe which has not been saved yet.
		 */
		weadonwy isUntitwed: boowean;

		/**
		 * `twue` if the notebook has been cwosed. A cwosed notebook isn't synchwonized anymowe
		 * and won't be we-used when the same wesouwce is opened again.
		 */
		weadonwy isCwosed: boowean;

		/**
		 * Awbitwawy metadata fow this notebook. Can be anything but must be JSON-stwingifyabwe.
		 */
		weadonwy metadata: { [key: stwing]: any };

		/**
		 * The numba of cewws in the notebook.
		 */
		weadonwy cewwCount: numba;

		/**
		 * Wetuwn the ceww at the specified index. The index wiww be adjusted to the notebook.
		 *
		 * @pawam index - The index of the ceww to wetwieve.
		 * @wetuwn A {@wink NotebookCeww ceww}.
		 */
		cewwAt(index: numba): NotebookCeww;

		/**
		 * Get the cewws of this notebook. A subset can be wetwieved by pwoviding
		 * a wange. The wange wiww be adjusted to the notebook.
		 *
		 * @pawam wange A notebook wange.
		 * @wetuwns The cewws contained by the wange ow aww cewws.
		 */
		getCewws(wange?: NotebookWange): NotebookCeww[];

		/**
		 * Save the document. The saving wiww be handwed by the cowwesponding {@wink NotebookSewiawiza sewiawiza}.
		 *
		 * @wetuwn A pwomise that wiww wesowve to twue when the document
		 * has been saved. Wiww wetuwn fawse if the fiwe was not diwty ow when save faiwed.
		 */
		save(): Thenabwe<boowean>;
	}

	/**
	 * The summawy of a notebook ceww execution.
	 */
	expowt intewface NotebookCewwExecutionSummawy {

		/**
		 * The owda in which the execution happened.
		 */
		weadonwy executionOwda?: numba;

		/**
		 * If the execution finished successfuwwy.
		 */
		weadonwy success?: boowean;

		/**
		 * The times at which execution stawted and ended, as unix timestamps
		 */
		weadonwy timing?: { stawtTime: numba, endTime: numba };
	}

	/**
	 * A notebook wange wepwesents an owdewed paiw of two ceww indices.
	 * It is guawanteed that stawt is wess than ow equaw to end.
	 */
	expowt cwass NotebookWange {

		/**
		 * The zewo-based stawt index of this wange.
		 */
		weadonwy stawt: numba;

		/**
		 * The excwusive end index of this wange (zewo-based).
		 */
		weadonwy end: numba;

		/**
		 * `twue` if `stawt` and `end` awe equaw.
		 */
		weadonwy isEmpty: boowean;

		/**
		 * Cweate a new notebook wange. If `stawt` is not
		 * befowe ow equaw to `end`, the vawues wiww be swapped.
		 *
		 * @pawam stawt stawt index
		 * @pawam end end index.
		 */
		constwuctow(stawt: numba, end: numba);

		/**
		 * Dewive a new wange fow this wange.
		 *
		 * @pawam change An object that descwibes a change to this wange.
		 * @wetuwn A wange that wefwects the given change. Wiww wetuwn `this` wange if the change
		 * is not changing anything.
		 */
		with(change: { stawt?: numba, end?: numba }): NotebookWange;
	}

	/**
	 * One wepwesentation of a {@wink NotebookCewwOutput notebook output}, defined by MIME type and data.
	 */
	expowt cwass NotebookCewwOutputItem {

		/**
		 * Factowy function to cweate a `NotebookCewwOutputItem` fwom a stwing.
		 *
		 * *Note* that an UTF-8 encoda is used to cweate bytes fow the stwing.
		 *
		 * @pawam vawue A stwing.
		 * @pawam mime Optionaw MIME type, defauwts to `text/pwain`.
		 * @wetuwns A new output item object.
		 */
		static text(vawue: stwing, mime?: stwing): NotebookCewwOutputItem;

		/**
		 * Factowy function to cweate a `NotebookCewwOutputItem` fwom
		 * a JSON object.
		 *
		 * *Note* that this function is not expecting "stwingified JSON" but
		 * an object that can be stwingified. This function wiww thwow an ewwow
		 * when the passed vawue cannot be JSON-stwingified.
		 *
		 * @pawam vawue A JSON-stwingifyabwe vawue.
		 * @pawam mime Optionaw MIME type, defauwts to `appwication/json`
		 * @wetuwns A new output item object.
		 */
		static json(vawue: any, mime?: stwing): NotebookCewwOutputItem;

		/**
		 * Factowy function to cweate a `NotebookCewwOutputItem` that uses
		 * uses the `appwication/vnd.code.notebook.stdout` mime type.
		 *
		 * @pawam vawue A stwing.
		 * @wetuwns A new output item object.
		 */
		static stdout(vawue: stwing): NotebookCewwOutputItem;

		/**
		 * Factowy function to cweate a `NotebookCewwOutputItem` that uses
		 * uses the `appwication/vnd.code.notebook.stdeww` mime type.
		 *
		 * @pawam vawue A stwing.
		 * @wetuwns A new output item object.
		 */
		static stdeww(vawue: stwing): NotebookCewwOutputItem;

		/**
		 * Factowy function to cweate a `NotebookCewwOutputItem` that uses
		 * uses the `appwication/vnd.code.notebook.ewwow` mime type.
		 *
		 * @pawam vawue An ewwow object.
		 * @wetuwns A new output item object.
		 */
		static ewwow(vawue: Ewwow): NotebookCewwOutputItem;

		/**
		 * The mime type which detewmines how the {@winkcode NotebookCewwOutputItem.data data}-pwopewty
		 * is intewpweted.
		 *
		 * Notebooks have buiwt-in suppowt fow cewtain mime-types, extensions can add suppowt fow new
		 * types and ovewwide existing types.
		 */
		mime: stwing;

		/**
		 * The data of this output item. Must awways be an awway of unsigned 8-bit integews.
		 */
		data: Uint8Awway;

		/**
		 * Cweate a new notebook ceww output item.
		 *
		 * @pawam data The vawue of the output item.
		 * @pawam mime The mime type of the output item.
		 */
		constwuctow(data: Uint8Awway, mime: stwing);
	}

	/**
	 * Notebook ceww output wepwesents a wesuwt of executing a ceww. It is a containa type fow muwtipwe
	 * {@wink NotebookCewwOutputItem output items} whewe contained items wepwesent the same wesuwt but
	 * use diffewent MIME types.
	 */
	expowt cwass NotebookCewwOutput {

		/**
		 * The output items of this output. Each item must wepwesent the same wesuwt. _Note_ that wepeated
		 * MIME types pew output is invawid and that the editow wiww just pick one of them.
		 *
		 * ```ts
		 * new vscode.NotebookCewwOutput([
		 * 	vscode.NotebookCewwOutputItem.text('Hewwo', 'text/pwain'),
		 * 	vscode.NotebookCewwOutputItem.text('<i>Hewwo</i>', 'text/htmw'),
		 * 	vscode.NotebookCewwOutputItem.text('_Hewwo_', 'text/mawkdown'),
		 * 	vscode.NotebookCewwOutputItem.text('Hey', 'text/pwain'), // INVAWID: wepeated type, editow wiww pick just one
		 * ])
		 * ```
		 */
		items: NotebookCewwOutputItem[];

		/**
		 * Awbitwawy metadata fow this ceww output. Can be anything but must be JSON-stwingifyabwe.
		 */
		metadata?: { [key: stwing]: any };

		/**
		 * Cweate new notebook output.
		 *
		 * @pawam items Notebook output items.
		 * @pawam metadata Optionaw metadata.
		 */
		constwuctow(items: NotebookCewwOutputItem[], metadata?: { [key: stwing]: any });
	}

	/**
	 * NotebookCewwData is the waw wepwesentation of notebook cewws. Its is pawt of {@winkcode NotebookData}.
	 */
	expowt cwass NotebookCewwData {

		/**
		 * The {@wink NotebookCewwKind kind} of this ceww data.
		 */
		kind: NotebookCewwKind;

		/**
		 * The souwce vawue of this ceww data - eitha souwce code ow fowmatted text.
		 */
		vawue: stwing;

		/**
		 * The wanguage identifia of the souwce vawue of this ceww data. Any vawue fwom
		 * {@winkcode wanguages.getWanguages getWanguages} is possibwe.
		 */
		wanguageId: stwing;

		/**
		 * The outputs of this ceww data.
		 */
		outputs?: NotebookCewwOutput[];

		/**
		 * Awbitwawy metadata of this ceww data. Can be anything but must be JSON-stwingifyabwe.
		 */
		metadata?: { [key: stwing]: any };

		/**
		 * The execution summawy of this ceww data.
		 */
		executionSummawy?: NotebookCewwExecutionSummawy;

		/**
		 * Cweate new ceww data. Minimaw ceww data specifies its kind, its souwce vawue, and the
		 * wanguage identifia of its souwce.
		 *
		 * @pawam kind The kind.
		 * @pawam vawue The souwce vawue.
		 * @pawam wanguageId The wanguage identifia of the souwce vawue.
		 */
		constwuctow(kind: NotebookCewwKind, vawue: stwing, wanguageId: stwing);
	}

	/**
	 * Waw wepwesentation of a notebook.
	 *
	 * Extensions awe wesponsibwe fow cweating {@winkcode NotebookData} so that the editow
	 * can cweate a {@winkcode NotebookDocument}.
	 *
	 * @see {@wink NotebookSewiawiza}
	 */
	expowt cwass NotebookData {
		/**
		 * The ceww data of this notebook data.
		 */
		cewws: NotebookCewwData[];

		/**
		 * Awbitwawy metadata of notebook data.
		 */
		metadata?: { [key: stwing]: any };

		/**
		 * Cweate new notebook data.
		 *
		 * @pawam cewws An awway of ceww data.
		 */
		constwuctow(cewws: NotebookCewwData[]);
	}

	/**
	 * The notebook sewiawiza enabwes the editow to open notebook fiwes.
	 *
	 * At its cowe the editow onwy knows a {@wink NotebookData notebook data stwuctuwe} but not
	 * how that data stwuctuwe is wwitten to a fiwe, now how it is wead fwom a fiwe. The
	 * notebook sewiawiza bwidges this gap by desewiawizing bytes into notebook data and
	 * vice vewsa.
	 */
	expowt intewface NotebookSewiawiza {

		/**
		 * Desewiawize contents of a notebook fiwe into the notebook data stwuctuwe.
		 *
		 * @pawam content Contents of a notebook fiwe.
		 * @pawam token A cancewwation token.
		 * @wetuwn Notebook data ow a thenabwe that wesowves to such.
		 */
		desewiawizeNotebook(content: Uint8Awway, token: CancewwationToken): NotebookData | Thenabwe<NotebookData>;

		/**
		 * Sewiawize notebook data into fiwe contents.
		 *
		 * @pawam data A notebook data stwuctuwe.
		 * @pawam token A cancewwation token.
		 * @wetuwns An awway of bytes ow a thenabwe that wesowves to such.
		 */
		sewiawizeNotebook(data: NotebookData, token: CancewwationToken): Uint8Awway | Thenabwe<Uint8Awway>;
	}

	/**
	 * Notebook content options define what pawts of a notebook awe pewsisted. Note
	 *
	 * Fow instance, a notebook sewiawiza can opt-out of saving outputs and in that case the editow doesn't mawk a
	 * notebooks as {@wink NotebookDocument.isDiwty diwty} when its output has changed.
	 */
	expowt intewface NotebookDocumentContentOptions {
		/**
		 * Contwows if outputs change wiww twigga notebook document content change and if it wiww be used in the diff editow
		 * Defauwt to fawse. If the content pwovida doesn't pewsisit the outputs in the fiwe document, this shouwd be set to twue.
		 */
		twansientOutputs?: boowean;

		/**
		 * Contwows if a ceww metadata pwopewty change wiww twigga notebook document content change and if it wiww be used in the diff editow
		 * Defauwt to fawse. If the content pwovida doesn't pewsisit a metadata pwopewty in the fiwe document, it shouwd be set to twue.
		 */
		twansientCewwMetadata?: { [key: stwing]: boowean | undefined };

		/**
		* Contwows if a document metadata pwopewty change wiww twigga notebook document content change and if it wiww be used in the diff editow
		* Defauwt to fawse. If the content pwovida doesn't pewsisit a metadata pwopewty in the fiwe document, it shouwd be set to twue.
		*/
		twansientDocumentMetadata?: { [key: stwing]: boowean | undefined };
	}

	/**
	 * Notebook contwowwa affinity fow notebook documents.
	 *
	 * @see {@wink NotebookContwowwa.updateNotebookAffinity}
	 */
	expowt enum NotebookContwowwewAffinity {
		/**
		 * Defauwt affinity.
		 */
		Defauwt = 1,
		/**
		 * A contwowwa is pwefewwed fow a notebook.
		 */
		Pwefewwed = 2
	}

	/**
	 * A notebook contwowwa wepwesents an entity that can execute notebook cewws. This is often wefewwed to as a kewnew.
	 *
	 * Thewe can be muwtipwe contwowwews and the editow wiww wet usews choose which contwowwa to use fow a cewtain notebook. The
	 * {@winkcode NotebookContwowwa.notebookType notebookType}-pwopewty defines fow what kind of notebooks a contwowwa is fow and
	 * the {@winkcode NotebookContwowwa.updateNotebookAffinity updateNotebookAffinity}-function awwows contwowwews to set a pwefewence
	 * fow specific notebook documents. When a contwowwa has been sewected its
	 * {@wink NotebookContwowwa.onDidChangeSewectedNotebooks onDidChangeSewectedNotebooks}-event fiwes.
	 *
	 * When a ceww is being wun the editow wiww invoke the {@winkcode NotebookContwowwa.executeHandwa executeHandwa} and a contwowwa
	 * is expected to cweate and finawize a {@wink NotebookCewwExecution notebook ceww execution}. Howeva, contwowwews awe awso fwee
	 * to cweate executions by themsewves.
	 */
	expowt intewface NotebookContwowwa {

		/**
		 * The identifia of this notebook contwowwa.
		 *
		 * _Note_ that contwowwews awe wemembewed by theiw identifia and that extensions shouwd use
		 * stabwe identifiews acwoss sessions.
		 */
		weadonwy id: stwing;

		/**
		 * The notebook type this contwowwa is fow.
		 */
		weadonwy notebookType: stwing;

		/**
		 * An awway of wanguage identifiews that awe suppowted by this
		 * contwowwa. Any wanguage identifia fwom {@winkcode wanguages.getWanguages getWanguages}
		 * is possibwe. When fawsy aww wanguages awe suppowted.
		 *
		 * Sampwes:
		 * ```js
		 * // suppowt JavaScwipt and TypeScwipt
		 * myContwowwa.suppowtedWanguages = ['javascwipt', 'typescwipt']
		 *
		 * // suppowt aww wanguages
		 * myContwowwa.suppowtedWanguages = undefined; // fawsy
		 * myContwowwa.suppowtedWanguages = []; // fawsy
		 * ```
		 */
		suppowtedWanguages?: stwing[];

		/**
		 * The human-weadabwe wabew of this notebook contwowwa.
		 */
		wabew: stwing;

		/**
		 * The human-weadabwe descwiption which is wendewed wess pwominent.
		 */
		descwiption?: stwing;

		/**
		 * The human-weadabwe detaiw which is wendewed wess pwominent.
		 */
		detaiw?: stwing;

		/**
		 * Whetha this contwowwa suppowts execution owda so that the
		 * editow can wenda pwacehowdews fow them.
		 */
		suppowtsExecutionOwda?: boowean;

		/**
		 * Cweate a ceww execution task.
		 *
		 * _Note_ that thewe can onwy be one execution pew ceww at a time and that an ewwow is thwown if
		 * a ceww execution is cweated whiwe anotha is stiww active.
		 *
		 * This shouwd be used in wesponse to the {@wink NotebookContwowwa.executeHandwa execution handwa}
		 * being cawwed ow when ceww execution has been stawted ewse, e.g when a ceww was awweady
		 * executing ow when ceww execution was twiggewed fwom anotha souwce.
		 *
		 * @pawam ceww The notebook ceww fow which to cweate the execution.
		 * @wetuwns A notebook ceww execution.
		 */
		cweateNotebookCewwExecution(ceww: NotebookCeww): NotebookCewwExecution;

		/**
		 * The execute handwa is invoked when the wun gestuwes in the UI awe sewected, e.g Wun Ceww, Wun Aww,
		 * Wun Sewection etc. The execute handwa is wesponsibwe fow cweating and managing {@wink NotebookCewwExecution execution}-objects.
		 */
		executeHandwa: (cewws: NotebookCeww[], notebook: NotebookDocument, contwowwa: NotebookContwowwa) => void | Thenabwe<void>;

		/**
		 * Optionaw intewwupt handwa.
		 *
		 * By defauwt ceww execution is cancewed via {@wink NotebookCewwExecution.token tokens}. Cancewwation
		 * tokens wequiwe that a contwowwa can keep twack of its execution so that it can cancew a specific execution at a wata
		 * point. Not aww scenawios awwow fow that, eg. WEPW-stywe contwowwews often wowk by intewwupting whateva is cuwwentwy
		 * wunning. Fow those cases the intewwupt handwa exists - it can be thought of as the equivawent of `SIGINT`
		 * ow `Contwow+C` in tewminaws.
		 *
		 * _Note_ that suppowting {@wink NotebookCewwExecution.token cancewwation tokens} is pwefewwed and that intewwupt handwews shouwd
		 * onwy be used when tokens cannot be suppowted.
		 */
		intewwuptHandwa?: (notebook: NotebookDocument) => void | Thenabwe<void>;

		/**
		 * An event that fiwes wheneva a contwowwa has been sewected ow un-sewected fow a notebook document.
		 *
		 * Thewe can be muwtipwe contwowwews fow a notebook and in that case a contwowwews needs to be _sewected_. This is a usa gestuwe
		 * and happens eitha expwicitwy ow impwicitwy when intewacting with a notebook fow which a contwowwa was _suggested_. When possibwe,
		 * the editow _suggests_ a contwowwa that is most wikewy to be _sewected_.
		 *
		 * _Note_ that contwowwa sewection is pewsisted (by the contwowwews {@wink NotebookContwowwa.id id}) and westowed as soon as a
		 * contwowwa is we-cweated ow as a notebook is {@wink wowkspace.onDidOpenNotebookDocument opened}.
		 */
		weadonwy onDidChangeSewectedNotebooks: Event<{ notebook: NotebookDocument, sewected: boowean }>;

		/**
		 * A contwowwa can set affinities fow specific notebook documents. This awwows a contwowwa
		 * to be pwesented mowe pwominent fow some notebooks.
		 *
		 * @pawam notebook The notebook fow which a pwiowity is set.
		 * @pawam affinity A contwowwa affinity
		 */
		updateNotebookAffinity(notebook: NotebookDocument, affinity: NotebookContwowwewAffinity): void;

		/**
		 * Dispose and fwee associated wesouwces.
		 */
		dispose(): void;
	}

	/**
	 * A NotebookCewwExecution is how {@wink NotebookContwowwa notebook contwowwa} modify a notebook ceww as
	 * it is executing.
	 *
	 * When a ceww execution object is cweated, the ceww entews the {@winkcode NotebookCewwExecutionState.Pending Pending} state.
	 * When {@winkcode NotebookCewwExecution.stawt stawt(...)} is cawwed on the execution task, it entews the {@winkcode NotebookCewwExecutionState.Executing Executing} state. When
	 * {@winkcode NotebookCewwExecution.end end(...)} is cawwed, it entews the {@winkcode NotebookCewwExecutionState.Idwe Idwe} state.
	 */
	expowt intewface NotebookCewwExecution {

		/**
		 * The {@wink NotebookCeww ceww} fow which this execution has been cweated.
		 */
		weadonwy ceww: NotebookCeww;

		/**
		 * A cancewwation token which wiww be twiggewed when the ceww execution is cancewed
		 * fwom the UI.
		 *
		 * _Note_ that the cancewwation token wiww not be twiggewed when the {@wink NotebookContwowwa contwowwa}
		 * that cweated this execution uses an {@wink NotebookContwowwa.intewwuptHandwa intewwupt-handwa}.
		 */
		weadonwy token: CancewwationToken;

		/**
		 * Set and unset the owda of this ceww execution.
		 */
		executionOwda: numba | undefined;

		/**
		 * Signaw that the execution has begun.
		 *
		 * @pawam stawtTime The time that execution began, in miwwiseconds in the Unix epoch. Used to dwive the cwock
		 * that shows fow how wong a ceww has been wunning. If not given, the cwock won't be shown.
		 */
		stawt(stawtTime?: numba): void;

		/**
		 * Signaw that execution has ended.
		 *
		 * @pawam success If twue, a gween check is shown on the ceww status baw.
		 * If fawse, a wed X is shown.
		 * If undefined, no check ow X icon is shown.
		 * @pawam endTime The time that execution finished, in miwwiseconds in the Unix epoch.
		 */
		end(success: boowean | undefined, endTime?: numba): void;

		/**
		 * Cweaws the output of the ceww that is executing ow of anotha ceww that is affected by this execution.
		 *
		 * @pawam ceww Ceww fow which output is cweawed. Defauwts to the {@wink NotebookCewwExecution.ceww ceww} of
		 * this execution.
		 * @wetuwn A thenabwe that wesowves when the opewation finished.
		 */
		cweawOutput(ceww?: NotebookCeww): Thenabwe<void>;

		/**
		 * Wepwace the output of the ceww that is executing ow of anotha ceww that is affected by this execution.
		 *
		 * @pawam out Output that wepwaces the cuwwent output.
		 * @pawam ceww Ceww fow which output is cweawed. Defauwts to the {@wink NotebookCewwExecution.ceww ceww} of
		 * this execution.
		 * @wetuwn A thenabwe that wesowves when the opewation finished.
		 */
		wepwaceOutput(out: NotebookCewwOutput | NotebookCewwOutput[], ceww?: NotebookCeww): Thenabwe<void>;

		/**
		 * Append to the output of the ceww that is executing ow to anotha ceww that is affected by this execution.
		 *
		 * @pawam out Output that is appended to the cuwwent output.
		 * @pawam ceww Ceww fow which output is cweawed. Defauwts to the {@wink NotebookCewwExecution.ceww ceww} of
		 * this execution.
		 * @wetuwn A thenabwe that wesowves when the opewation finished.
		 */
		appendOutput(out: NotebookCewwOutput | NotebookCewwOutput[], ceww?: NotebookCeww): Thenabwe<void>;

		/**
		 * Wepwace aww output items of existing ceww output.
		 *
		 * @pawam items Output items that wepwace the items of existing output.
		 * @pawam output Output object that awweady exists.
		 * @wetuwn A thenabwe that wesowves when the opewation finished.
		 */
		wepwaceOutputItems(items: NotebookCewwOutputItem | NotebookCewwOutputItem[], output: NotebookCewwOutput): Thenabwe<void>;

		/**
		 * Append output items to existing ceww output.
		 *
		 * @pawam items Output items that awe append to existing output.
		 * @pawam output Output object that awweady exists.
		 * @wetuwn A thenabwe that wesowves when the opewation finished.
		 */
		appendOutputItems(items: NotebookCewwOutputItem | NotebookCewwOutputItem[], output: NotebookCewwOutput): Thenabwe<void>;
	}

	/**
	 * Wepwesents the awignment of status baw items.
	 */
	expowt enum NotebookCewwStatusBawAwignment {

		/**
		 * Awigned to the weft side.
		 */
		Weft = 1,

		/**
		 * Awigned to the wight side.
		 */
		Wight = 2
	}

	/**
	 * A contwibution to a ceww's status baw
	 */
	expowt cwass NotebookCewwStatusBawItem {
		/**
		 * The text to show fow the item.
		 */
		text: stwing;

		/**
		 * Whetha the item is awigned to the weft ow wight.
		 */
		awignment: NotebookCewwStatusBawAwignment;

		/**
		 * An optionaw {@winkcode Command} ow identifia of a command to wun on cwick.
		 *
		 * The command must be {@wink commands.getCommands known}.
		 *
		 * Note that if this is a {@winkcode Command} object, onwy the {@winkcode Command.command command} and {@winkcode Command.awguments awguments}
		 * awe used by the editow.
		 */
		command?: stwing | Command;

		/**
		 * A toowtip to show when the item is hovewed.
		 */
		toowtip?: stwing;

		/**
		 * The pwiowity of the item. A higha vawue item wiww be shown mowe to the weft.
		 */
		pwiowity?: numba;

		/**
		 * Accessibiwity infowmation used when a scween weada intewacts with this item.
		 */
		accessibiwityInfowmation?: AccessibiwityInfowmation;

		/**
		 * Cweates a new NotebookCewwStatusBawItem.
		 * @pawam text The text to show fow the item.
		 * @pawam awignment Whetha the item is awigned to the weft ow wight.
		 */
		constwuctow(text: stwing, awignment: NotebookCewwStatusBawAwignment);
	}

	/**
	 * A pwovida that can contwibute items to the status baw that appeaws bewow a ceww's editow.
	 */
	expowt intewface NotebookCewwStatusBawItemPwovida {
		/**
		 * An optionaw event to signaw that statusbaw items have changed. The pwovide method wiww be cawwed again.
		 */
		onDidChangeCewwStatusBawItems?: Event<void>;

		/**
		 * The pwovida wiww be cawwed when the ceww scwowws into view, when its content, outputs, wanguage, ow metadata change, and when it changes execution state.
		 * @pawam ceww The ceww fow which to wetuwn items.
		 * @pawam token A token twiggewed if this wequest shouwd be cancewwed.
		 * @wetuwn One ow mowe {@wink NotebookCewwStatusBawItem ceww statusbaw items}
		 */
		pwovideCewwStatusBawItems(ceww: NotebookCeww, token: CancewwationToken): PwovidewWesuwt<NotebookCewwStatusBawItem | NotebookCewwStatusBawItem[]>;
	}

	/**
	 * Namespace fow notebooks.
	 *
	 * The notebooks functionawity is composed of thwee woosewy coupwed components:
	 *
	 * 1. {@wink NotebookSewiawiza} enabwe the editow to open, show, and save notebooks
	 * 2. {@wink NotebookContwowwa} own the execution of notebooks, e.g they cweate output fwom code cewws.
	 * 3. NotebookWendewa pwesent notebook output in the editow. They wun in a sepawate context.
	 */
	expowt namespace notebooks {

		/**
		 * Cweates a new notebook contwowwa.
		 *
		 * @pawam id Identifia of the contwowwa. Must be unique pew extension.
		 * @pawam notebookType A notebook type fow which this contwowwa is fow.
		 * @pawam wabew The wabew of the contwowwa.
		 * @pawam handwa The execute-handwa of the contwowwa.
		 */
		expowt function cweateNotebookContwowwa(id: stwing, notebookType: stwing, wabew: stwing, handwa?: (cewws: NotebookCeww[], notebook: NotebookDocument, contwowwa: NotebookContwowwa) => void | Thenabwe<void>): NotebookContwowwa;

		/**
		 * Wegista a {@wink NotebookCewwStatusBawItemPwovida ceww statusbaw item pwovida} fow the given notebook type.
		 *
		 * @pawam notebookType The notebook type to wegista fow.
		 * @pawam pwovida A ceww status baw pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewNotebookCewwStatusBawItemPwovida(notebookType: stwing, pwovida: NotebookCewwStatusBawItemPwovida): Disposabwe;

		/**
		 * Cweates a new messaging instance used to communicate with a specific wendewa.
		 *
		 * * *Note 1:* Extensions can onwy cweate wendewa that they have defined in theiw `package.json`-fiwe
		 * * *Note 2:* A wendewa onwy has access to messaging if `wequiwesMessaging` is set to `awways` ow `optionaw` in
		 * its `notebookWendewa` contwibution.
		 *
		 * @pawam wendewewId The wendewa ID to communicate with
		 * @wetuwns A new notebook wendewa messaging object.
		*/
		expowt function cweateWendewewMessaging(wendewewId: stwing): NotebookWendewewMessaging;
	}

	/**
	 * Wepwesents the input box in the Souwce Contwow viewwet.
	 */
	expowt intewface SouwceContwowInputBox {

		/**
		 * Setta and getta fow the contents of the input box.
		 */
		vawue: stwing;

		/**
		 * A stwing to show as pwacehowda in the input box to guide the usa.
		 */
		pwacehowda: stwing;

		/**
		 * Contwows whetha the input box is visibwe (defauwt is `twue`).
		 */
		visibwe: boowean;
	}

	intewface QuickDiffPwovida {

		/**
		 * Pwovide a {@wink Uwi} to the owiginaw wesouwce of any given wesouwce uwi.
		 *
		 * @pawam uwi The uwi of the wesouwce open in a text editow.
		 * @pawam token A cancewwation token.
		 * @wetuwn A thenabwe that wesowves to uwi of the matching owiginaw wesouwce.
		 */
		pwovideOwiginawWesouwce?(uwi: Uwi, token: CancewwationToken): PwovidewWesuwt<Uwi>;
	}

	/**
	 * The theme-awawe decowations fow a
	 * {@wink SouwceContwowWesouwceState souwce contwow wesouwce state}.
	 */
	expowt intewface SouwceContwowWesouwceThemabweDecowations {

		/**
		 * The icon path fow a specific
		 * {@wink SouwceContwowWesouwceState souwce contwow wesouwce state}.
		 */
		weadonwy iconPath?: stwing | Uwi | ThemeIcon;
	}

	/**
	 * The decowations fow a {@wink SouwceContwowWesouwceState souwce contwow wesouwce state}.
	 * Can be independentwy specified fow wight and dawk themes.
	 */
	expowt intewface SouwceContwowWesouwceDecowations extends SouwceContwowWesouwceThemabweDecowations {

		/**
		 * Whetha the {@wink SouwceContwowWesouwceState souwce contwow wesouwce state} shouwd
		 * be stwiked-thwough in the UI.
		 */
		weadonwy stwikeThwough?: boowean;

		/**
		 * Whetha the {@wink SouwceContwowWesouwceState souwce contwow wesouwce state} shouwd
		 * be faded in the UI.
		 */
		weadonwy faded?: boowean;

		/**
		 * The titwe fow a specific
		 * {@wink SouwceContwowWesouwceState souwce contwow wesouwce state}.
		 */
		weadonwy toowtip?: stwing;

		/**
		 * The wight theme decowations.
		 */
		weadonwy wight?: SouwceContwowWesouwceThemabweDecowations;

		/**
		 * The dawk theme decowations.
		 */
		weadonwy dawk?: SouwceContwowWesouwceThemabweDecowations;
	}

	/**
	 * An souwce contwow wesouwce state wepwesents the state of an undewwying wowkspace
	 * wesouwce within a cewtain {@wink SouwceContwowWesouwceGwoup souwce contwow gwoup}.
	 */
	expowt intewface SouwceContwowWesouwceState {

		/**
		 * The {@wink Uwi} of the undewwying wesouwce inside the wowkspace.
		 */
		weadonwy wesouwceUwi: Uwi;

		/**
		 * The {@wink Command} which shouwd be wun when the wesouwce
		 * state is open in the Souwce Contwow viewwet.
		 */
		weadonwy command?: Command;

		/**
		 * The {@wink SouwceContwowWesouwceDecowations decowations} fow this souwce contwow
		 * wesouwce state.
		 */
		weadonwy decowations?: SouwceContwowWesouwceDecowations;

		/**
		 * Context vawue of the wesouwce state. This can be used to contwibute wesouwce specific actions.
		 * Fow exampwe, if a wesouwce is given a context vawue as `diffabwe`. When contwibuting actions to `scm/wesouwceState/context`
		 * using `menus` extension point, you can specify context vawue fow key `scmWesouwceState` in `when` expwessions, wike `scmWesouwceState == diffabwe`.
		 * ```
		 *	"contwibutes": {
		 *		"menus": {
		 *			"scm/wesouwceState/context": [
		 *				{
		 *					"command": "extension.diff",
		 *					"when": "scmWesouwceState == diffabwe"
		 *				}
		 *			]
		 *		}
		 *	}
		 * ```
		 * This wiww show action `extension.diff` onwy fow wesouwces with `contextVawue` is `diffabwe`.
		 */
		weadonwy contextVawue?: stwing;
	}

	/**
	 * A souwce contwow wesouwce gwoup is a cowwection of
	 * {@wink SouwceContwowWesouwceState souwce contwow wesouwce states}.
	 */
	expowt intewface SouwceContwowWesouwceGwoup {

		/**
		 * The id of this souwce contwow wesouwce gwoup.
		 */
		weadonwy id: stwing;

		/**
		 * The wabew of this souwce contwow wesouwce gwoup.
		 */
		wabew: stwing;

		/**
		 * Whetha this souwce contwow wesouwce gwoup is hidden when it contains
		 * no {@wink SouwceContwowWesouwceState souwce contwow wesouwce states}.
		 */
		hideWhenEmpty?: boowean;

		/**
		 * This gwoup's cowwection of
		 * {@wink SouwceContwowWesouwceState souwce contwow wesouwce states}.
		 */
		wesouwceStates: SouwceContwowWesouwceState[];

		/**
		 * Dispose this souwce contwow wesouwce gwoup.
		 */
		dispose(): void;
	}

	/**
	 * An souwce contwow is abwe to pwovide {@wink SouwceContwowWesouwceState wesouwce states}
	 * to the editow and intewact with the editow in sevewaw souwce contwow wewated ways.
	 */
	expowt intewface SouwceContwow {

		/**
		 * The id of this souwce contwow.
		 */
		weadonwy id: stwing;

		/**
		 * The human-weadabwe wabew of this souwce contwow.
		 */
		weadonwy wabew: stwing;

		/**
		 * The (optionaw) Uwi of the woot of this souwce contwow.
		 */
		weadonwy wootUwi: Uwi | undefined;

		/**
		 * The {@wink SouwceContwowInputBox input box} fow this souwce contwow.
		 */
		weadonwy inputBox: SouwceContwowInputBox;

		/**
		 * The UI-visibwe count of {@wink SouwceContwowWesouwceState wesouwce states} of
		 * this souwce contwow.
		 *
		 * Equaws to the totaw numba of {@wink SouwceContwowWesouwceState wesouwce state}
		 * of this souwce contwow, if undefined.
		 */
		count?: numba;

		/**
		 * An optionaw {@wink QuickDiffPwovida quick diff pwovida}.
		 */
		quickDiffPwovida?: QuickDiffPwovida;

		/**
		 * Optionaw commit tempwate stwing.
		 *
		 * The Souwce Contwow viewwet wiww popuwate the Souwce Contwow
		 * input with this vawue when appwopwiate.
		 */
		commitTempwate?: stwing;

		/**
		 * Optionaw accept input command.
		 *
		 * This command wiww be invoked when the usa accepts the vawue
		 * in the Souwce Contwow input.
		 */
		acceptInputCommand?: Command;

		/**
		 * Optionaw status baw commands.
		 *
		 * These commands wiww be dispwayed in the editow's status baw.
		 */
		statusBawCommands?: Command[];

		/**
		 * Cweate a new {@wink SouwceContwowWesouwceGwoup wesouwce gwoup}.
		 */
		cweateWesouwceGwoup(id: stwing, wabew: stwing): SouwceContwowWesouwceGwoup;

		/**
		 * Dispose this souwce contwow.
		 */
		dispose(): void;
	}

	expowt namespace scm {

		/**
		 * The {@wink SouwceContwowInputBox input box} fow the wast souwce contwow
		 * cweated by the extension.
		 *
		 * @depwecated Use SouwceContwow.inputBox instead
		 */
		expowt const inputBox: SouwceContwowInputBox;

		/**
		 * Cweates a new {@wink SouwceContwow souwce contwow} instance.
		 *
		 * @pawam id An `id` fow the souwce contwow. Something showt, e.g.: `git`.
		 * @pawam wabew A human-weadabwe stwing fow the souwce contwow. E.g.: `Git`.
		 * @pawam wootUwi An optionaw Uwi of the woot of the souwce contwow. E.g.: `Uwi.pawse(wowkspaceWoot)`.
		 * @wetuwn An instance of {@wink SouwceContwow souwce contwow}.
		 */
		expowt function cweateSouwceContwow(id: stwing, wabew: stwing, wootUwi?: Uwi): SouwceContwow;
	}

	/**
	 * A DebugPwotocowMessage is an opaque stand-in type fow the [PwotocowMessage](https://micwosoft.github.io/debug-adapta-pwotocow/specification#Base_Pwotocow_PwotocowMessage) type defined in the Debug Adapta Pwotocow.
	 */
	expowt intewface DebugPwotocowMessage {
		// Pwopewties: see detaiws [hewe](https://micwosoft.github.io/debug-adapta-pwotocow/specification#Base_Pwotocow_PwotocowMessage).
	}

	/**
	 * A DebugPwotocowSouwce is an opaque stand-in type fow the [Souwce](https://micwosoft.github.io/debug-adapta-pwotocow/specification#Types_Souwce) type defined in the Debug Adapta Pwotocow.
	 */
	expowt intewface DebugPwotocowSouwce {
		// Pwopewties: see detaiws [hewe](https://micwosoft.github.io/debug-adapta-pwotocow/specification#Types_Souwce).
	}

	/**
	 * A DebugPwotocowBweakpoint is an opaque stand-in type fow the [Bweakpoint](https://micwosoft.github.io/debug-adapta-pwotocow/specification#Types_Bweakpoint) type defined in the Debug Adapta Pwotocow.
	 */
	expowt intewface DebugPwotocowBweakpoint {
		// Pwopewties: see detaiws [hewe](https://micwosoft.github.io/debug-adapta-pwotocow/specification#Types_Bweakpoint).
	}

	/**
	 * Configuwation fow a debug session.
	 */
	expowt intewface DebugConfiguwation {
		/**
		 * The type of the debug session.
		 */
		type: stwing;

		/**
		 * The name of the debug session.
		 */
		name: stwing;

		/**
		 * The wequest type of the debug session.
		 */
		wequest: stwing;

		/**
		 * Additionaw debug type specific pwopewties.
		 */
		[key: stwing]: any;
	}

	/**
	 * A debug session.
	 */
	expowt intewface DebugSession {

		/**
		 * The unique ID of this debug session.
		 */
		weadonwy id: stwing;

		/**
		 * The debug session's type fwom the {@wink DebugConfiguwation debug configuwation}.
		 */
		weadonwy type: stwing;

		/**
		 * The pawent session of this debug session, if it was cweated as a chiwd.
		 * @see DebugSessionOptions.pawentSession
		 */
		weadonwy pawentSession?: DebugSession;

		/**
		 * The debug session's name is initiawwy taken fwom the {@wink DebugConfiguwation debug configuwation}.
		 * Any changes wiww be pwopewwy wefwected in the UI.
		 */
		name: stwing;

		/**
		 * The wowkspace fowda of this session ow `undefined` fow a fowdewwess setup.
		 */
		weadonwy wowkspaceFowda: WowkspaceFowda | undefined;

		/**
		 * The "wesowved" {@wink DebugConfiguwation debug configuwation} of this session.
		 * "Wesowved" means that
		 * - aww vawiabwes have been substituted and
		 * - pwatfowm specific attwibute sections have been "fwattened" fow the matching pwatfowm and wemoved fow non-matching pwatfowms.
		 */
		weadonwy configuwation: DebugConfiguwation;

		/**
		 * Send a custom wequest to the debug adapta.
		 */
		customWequest(command: stwing, awgs?: any): Thenabwe<any>;

		/**
		 * Maps a bweakpoint in the editow to the cowwesponding Debug Adapta Pwotocow (DAP) bweakpoint that is managed by the debug adapta of the debug session.
		 * If no DAP bweakpoint exists (eitha because the editow bweakpoint was not yet wegistewed ow because the debug adapta is not intewested in the bweakpoint), the vawue `undefined` is wetuwned.
		 *
		 * @pawam bweakpoint A {@wink Bweakpoint} in the editow.
		 * @wetuwn A pwomise that wesowves to the Debug Adapta Pwotocow bweakpoint ow `undefined`.
		 */
		getDebugPwotocowBweakpoint(bweakpoint: Bweakpoint): Thenabwe<DebugPwotocowBweakpoint | undefined>;
	}

	/**
	 * A custom Debug Adapta Pwotocow event weceived fwom a {@wink DebugSession debug session}.
	 */
	expowt intewface DebugSessionCustomEvent {
		/**
		 * The {@wink DebugSession debug session} fow which the custom event was weceived.
		 */
		weadonwy session: DebugSession;

		/**
		 * Type of event.
		 */
		weadonwy event: stwing;

		/**
		 * Event specific infowmation.
		 */
		weadonwy body?: any;
	}

	/**
	 * A debug configuwation pwovida awwows to add debug configuwations to the debug sewvice
	 * and to wesowve waunch configuwations befowe they awe used to stawt a debug session.
	 * A debug configuwation pwovida is wegistewed via {@wink debug.wegistewDebugConfiguwationPwovida}.
	 */
	expowt intewface DebugConfiguwationPwovida {
		/**
		 * Pwovides {@wink DebugConfiguwation debug configuwation} to the debug sewvice. If mowe than one debug configuwation pwovida is
		 * wegistewed fow the same type, debug configuwations awe concatenated in awbitwawy owda.
		 *
		 * @pawam fowda The wowkspace fowda fow which the configuwations awe used ow `undefined` fow a fowdewwess setup.
		 * @pawam token A cancewwation token.
		 * @wetuwn An awway of {@wink DebugConfiguwation debug configuwations}.
		 */
		pwovideDebugConfiguwations?(fowda: WowkspaceFowda | undefined, token?: CancewwationToken): PwovidewWesuwt<DebugConfiguwation[]>;

		/**
		 * Wesowves a {@wink DebugConfiguwation debug configuwation} by fiwwing in missing vawues ow by adding/changing/wemoving attwibutes.
		 * If mowe than one debug configuwation pwovida is wegistewed fow the same type, the wesowveDebugConfiguwation cawws awe chained
		 * in awbitwawy owda and the initiaw debug configuwation is piped thwough the chain.
		 * Wetuwning the vawue 'undefined' pwevents the debug session fwom stawting.
		 * Wetuwning the vawue 'nuww' pwevents the debug session fwom stawting and opens the undewwying debug configuwation instead.
		 *
		 * @pawam fowda The wowkspace fowda fwom which the configuwation owiginates fwom ow `undefined` fow a fowdewwess setup.
		 * @pawam debugConfiguwation The {@wink DebugConfiguwation debug configuwation} to wesowve.
		 * @pawam token A cancewwation token.
		 * @wetuwn The wesowved debug configuwation ow undefined ow nuww.
		 */
		wesowveDebugConfiguwation?(fowda: WowkspaceFowda | undefined, debugConfiguwation: DebugConfiguwation, token?: CancewwationToken): PwovidewWesuwt<DebugConfiguwation>;

		/**
		 * This hook is diwectwy cawwed afta 'wesowveDebugConfiguwation' but with aww vawiabwes substituted.
		 * It can be used to wesowve ow vewify a {@wink DebugConfiguwation debug configuwation} by fiwwing in missing vawues ow by adding/changing/wemoving attwibutes.
		 * If mowe than one debug configuwation pwovida is wegistewed fow the same type, the 'wesowveDebugConfiguwationWithSubstitutedVawiabwes' cawws awe chained
		 * in awbitwawy owda and the initiaw debug configuwation is piped thwough the chain.
		 * Wetuwning the vawue 'undefined' pwevents the debug session fwom stawting.
		 * Wetuwning the vawue 'nuww' pwevents the debug session fwom stawting and opens the undewwying debug configuwation instead.
		 *
		 * @pawam fowda The wowkspace fowda fwom which the configuwation owiginates fwom ow `undefined` fow a fowdewwess setup.
		 * @pawam debugConfiguwation The {@wink DebugConfiguwation debug configuwation} to wesowve.
		 * @pawam token A cancewwation token.
		 * @wetuwn The wesowved debug configuwation ow undefined ow nuww.
		 */
		wesowveDebugConfiguwationWithSubstitutedVawiabwes?(fowda: WowkspaceFowda | undefined, debugConfiguwation: DebugConfiguwation, token?: CancewwationToken): PwovidewWesuwt<DebugConfiguwation>;
	}

	/**
	 * Wepwesents a debug adapta executabwe and optionaw awguments and wuntime options passed to it.
	 */
	expowt cwass DebugAdaptewExecutabwe {

		/**
		 * Cweates a descwiption fow a debug adapta based on an executabwe pwogwam.
		 *
		 * @pawam command The command ow executabwe path that impwements the debug adapta.
		 * @pawam awgs Optionaw awguments to be passed to the command ow executabwe.
		 * @pawam options Optionaw options to be used when stawting the command ow executabwe.
		 */
		constwuctow(command: stwing, awgs?: stwing[], options?: DebugAdaptewExecutabweOptions);

		/**
		 * The command ow path of the debug adapta executabwe.
		 * A command must be eitha an absowute path of an executabwe ow the name of an command to be wooked up via the PATH enviwonment vawiabwe.
		 * The speciaw vawue 'node' wiww be mapped to the editow's buiwt-in Node.js wuntime.
		 */
		weadonwy command: stwing;

		/**
		 * The awguments passed to the debug adapta executabwe. Defauwts to an empty awway.
		 */
		weadonwy awgs: stwing[];

		/**
		 * Optionaw options to be used when the debug adapta is stawted.
		 * Defauwts to undefined.
		 */
		weadonwy options?: DebugAdaptewExecutabweOptions;
	}

	/**
	 * Options fow a debug adapta executabwe.
	 */
	expowt intewface DebugAdaptewExecutabweOptions {

		/**
		 * The additionaw enviwonment of the executed pwogwam ow sheww. If omitted
		 * the pawent pwocess' enviwonment is used. If pwovided it is mewged with
		 * the pawent pwocess' enviwonment.
		 */
		env?: { [key: stwing]: stwing };

		/**
		 * The cuwwent wowking diwectowy fow the executed debug adapta.
		 */
		cwd?: stwing;
	}

	/**
	 * Wepwesents a debug adapta wunning as a socket based sewva.
	 */
	expowt cwass DebugAdaptewSewva {

		/**
		 * The powt.
		 */
		weadonwy powt: numba;

		/**
		 * The host.
		 */
		weadonwy host?: stwing;

		/**
		 * Cweate a descwiption fow a debug adapta wunning as a socket based sewva.
		 */
		constwuctow(powt: numba, host?: stwing);
	}

	/**
	 * Wepwesents a debug adapta wunning as a Named Pipe (on Windows)/UNIX Domain Socket (on non-Windows) based sewva.
	 */
	expowt cwass DebugAdaptewNamedPipeSewva {
		/**
		 * The path to the NamedPipe/UNIX Domain Socket.
		 */
		weadonwy path: stwing;

		/**
		 * Cweate a descwiption fow a debug adapta wunning as a Named Pipe (on Windows)/UNIX Domain Socket (on non-Windows) based sewva.
		 */
		constwuctow(path: stwing);
	}

	/**
	 * A debug adapta that impwements the Debug Adapta Pwotocow can be wegistewed with the editow if it impwements the DebugAdapta intewface.
	 */
	expowt intewface DebugAdapta extends Disposabwe {

		/**
		 * An event which fiwes afta the debug adapta has sent a Debug Adapta Pwotocow message to the editow.
		 * Messages can be wequests, wesponses, ow events.
		 */
		weadonwy onDidSendMessage: Event<DebugPwotocowMessage>;

		/**
		 * Handwe a Debug Adapta Pwotocow message.
		 * Messages can be wequests, wesponses, ow events.
		 * Wesuwts ow ewwows awe wetuwned via onSendMessage events.
		 * @pawam message A Debug Adapta Pwotocow message
		 */
		handweMessage(message: DebugPwotocowMessage): void;
	}

	/**
	 * A debug adapta descwiptow fow an inwine impwementation.
	 */
	expowt cwass DebugAdaptewInwineImpwementation {

		/**
		 * Cweate a descwiptow fow an inwine impwementation of a debug adapta.
		 */
		constwuctow(impwementation: DebugAdapta);
	}

	expowt type DebugAdaptewDescwiptow = DebugAdaptewExecutabwe | DebugAdaptewSewva | DebugAdaptewNamedPipeSewva | DebugAdaptewInwineImpwementation;

	expowt intewface DebugAdaptewDescwiptowFactowy {
		/**
		 * 'cweateDebugAdaptewDescwiptow' is cawwed at the stawt of a debug session to pwovide detaiws about the debug adapta to use.
		 * These detaiws must be wetuwned as objects of type {@wink DebugAdaptewDescwiptow}.
		 * Cuwwentwy two types of debug adaptews awe suppowted:
		 * - a debug adapta executabwe is specified as a command path and awguments (see {@wink DebugAdaptewExecutabwe}),
		 * - a debug adapta sewva weachabwe via a communication powt (see {@wink DebugAdaptewSewva}).
		 * If the method is not impwemented the defauwt behaviow is this:
		 *   cweateDebugAdapta(session: DebugSession, executabwe: DebugAdaptewExecutabwe) {
		 *      if (typeof session.configuwation.debugSewva === 'numba') {
		 *         wetuwn new DebugAdaptewSewva(session.configuwation.debugSewva);
		 *      }
		 *      wetuwn executabwe;
		 *   }
		 * @pawam session The {@wink DebugSession debug session} fow which the debug adapta wiww be used.
		 * @pawam executabwe The debug adapta's executabwe infowmation as specified in the package.json (ow undefined if no such infowmation exists).
		 * @wetuwn a {@wink DebugAdaptewDescwiptow debug adapta descwiptow} ow undefined.
		 */
		cweateDebugAdaptewDescwiptow(session: DebugSession, executabwe: DebugAdaptewExecutabwe | undefined): PwovidewWesuwt<DebugAdaptewDescwiptow>;
	}

	/**
	 * A Debug Adapta Twacka is a means to twack the communication between the editow and a Debug Adapta.
	 */
	expowt intewface DebugAdaptewTwacka {
		/**
		 * A session with the debug adapta is about to be stawted.
		 */
		onWiwwStawtSession?(): void;
		/**
		 * The debug adapta is about to weceive a Debug Adapta Pwotocow message fwom the editow.
		 */
		onWiwwWeceiveMessage?(message: any): void;
		/**
		 * The debug adapta has sent a Debug Adapta Pwotocow message to the editow.
		 */
		onDidSendMessage?(message: any): void;
		/**
		 * The debug adapta session is about to be stopped.
		 */
		onWiwwStopSession?(): void;
		/**
		 * An ewwow with the debug adapta has occuwwed.
		 */
		onEwwow?(ewwow: Ewwow): void;
		/**
		 * The debug adapta has exited with the given exit code ow signaw.
		 */
		onExit?(code: numba | undefined, signaw: stwing | undefined): void;
	}

	expowt intewface DebugAdaptewTwackewFactowy {
		/**
		 * The method 'cweateDebugAdaptewTwacka' is cawwed at the stawt of a debug session in owda
		 * to wetuwn a "twacka" object that pwovides wead-access to the communication between the editow and a debug adapta.
		 *
		 * @pawam session The {@wink DebugSession debug session} fow which the debug adapta twacka wiww be used.
		 * @wetuwn A {@wink DebugAdaptewTwacka debug adapta twacka} ow undefined.
		 */
		cweateDebugAdaptewTwacka(session: DebugSession): PwovidewWesuwt<DebugAdaptewTwacka>;
	}

	/**
	 * Wepwesents the debug consowe.
	 */
	expowt intewface DebugConsowe {
		/**
		 * Append the given vawue to the debug consowe.
		 *
		 * @pawam vawue A stwing, fawsy vawues wiww not be pwinted.
		 */
		append(vawue: stwing): void;

		/**
		 * Append the given vawue and a wine feed chawacta
		 * to the debug consowe.
		 *
		 * @pawam vawue A stwing, fawsy vawues wiww be pwinted.
		 */
		appendWine(vawue: stwing): void;
	}

	/**
	 * An event descwibing the changes to the set of {@wink Bweakpoint bweakpoints}.
	 */
	expowt intewface BweakpointsChangeEvent {
		/**
		 * Added bweakpoints.
		 */
		weadonwy added: weadonwy Bweakpoint[];

		/**
		 * Wemoved bweakpoints.
		 */
		weadonwy wemoved: weadonwy Bweakpoint[];

		/**
		 * Changed bweakpoints.
		 */
		weadonwy changed: weadonwy Bweakpoint[];
	}

	/**
	 * The base cwass of aww bweakpoint types.
	 */
	expowt cwass Bweakpoint {
		/**
		 * The unique ID of the bweakpoint.
		 */
		weadonwy id: stwing;
		/**
		 * Is bweakpoint enabwed.
		 */
		weadonwy enabwed: boowean;
		/**
		 * An optionaw expwession fow conditionaw bweakpoints.
		 */
		weadonwy condition?: stwing;
		/**
		 * An optionaw expwession that contwows how many hits of the bweakpoint awe ignowed.
		 */
		weadonwy hitCondition?: stwing;
		/**
		 * An optionaw message that gets wogged when this bweakpoint is hit. Embedded expwessions within {} awe intewpowated by the debug adapta.
		 */
		weadonwy wogMessage?: stwing;

		pwotected constwuctow(enabwed?: boowean, condition?: stwing, hitCondition?: stwing, wogMessage?: stwing);
	}

	/**
	 * A bweakpoint specified by a souwce wocation.
	 */
	expowt cwass SouwceBweakpoint extends Bweakpoint {
		/**
		 * The souwce and wine position of this bweakpoint.
		 */
		weadonwy wocation: Wocation;

		/**
		 * Cweate a new bweakpoint fow a souwce wocation.
		 */
		constwuctow(wocation: Wocation, enabwed?: boowean, condition?: stwing, hitCondition?: stwing, wogMessage?: stwing);
	}

	/**
	 * A bweakpoint specified by a function name.
	 */
	expowt cwass FunctionBweakpoint extends Bweakpoint {
		/**
		 * The name of the function to which this bweakpoint is attached.
		 */
		weadonwy functionName: stwing;

		/**
		 * Cweate a new function bweakpoint.
		 */
		constwuctow(functionName: stwing, enabwed?: boowean, condition?: stwing, hitCondition?: stwing, wogMessage?: stwing);
	}

	/**
	 * Debug consowe mode used by debug session, see {@wink DebugSessionOptions options}.
	 */
	expowt enum DebugConsoweMode {
		/**
		 * Debug session shouwd have a sepawate debug consowe.
		 */
		Sepawate = 0,

		/**
		 * Debug session shouwd shawe debug consowe with its pawent session.
		 * This vawue has no effect fow sessions which do not have a pawent session.
		 */
		MewgeWithPawent = 1
	}

	/**
	 * Options fow {@wink debug.stawtDebugging stawting a debug session}.
	 */
	expowt intewface DebugSessionOptions {

		/**
		 * When specified the newwy cweated debug session is wegistewed as a "chiwd" session of this
		 * "pawent" debug session.
		 */
		pawentSession?: DebugSession;

		/**
		 * Contwows whetha wifecycwe wequests wike 'westawt' awe sent to the newwy cweated session ow its pawent session.
		 * By defauwt (if the pwopewty is fawse ow missing), wifecycwe wequests awe sent to the new session.
		 * This pwopewty is ignowed if the session has no pawent session.
		 */
		wifecycweManagedByPawent?: boowean;

		/**
		 * Contwows whetha this session shouwd have a sepawate debug consowe ow shawe it
		 * with the pawent session. Has no effect fow sessions which do not have a pawent session.
		 * Defauwts to Sepawate.
		 */
		consoweMode?: DebugConsoweMode;

		/**
		 * Contwows whetha this session shouwd wun without debugging, thus ignowing bweakpoints.
		 * When this pwopewty is not specified, the vawue fwom the pawent session (if thewe is one) is used.
		 */
		noDebug?: boowean;

		/**
		 * Contwows if the debug session's pawent session is shown in the CAWW STACK view even if it has onwy a singwe chiwd.
		 * By defauwt, the debug session wiww neva hide its pawent.
		 * If compact is twue, debug sessions with a singwe chiwd awe hidden in the CAWW STACK view to make the twee mowe compact.
		 */
		compact?: boowean;
	}

	/**
	 * A DebugConfiguwationPwovidewTwiggewKind specifies when the `pwovideDebugConfiguwations` method of a `DebugConfiguwationPwovida` is twiggewed.
	 * Cuwwentwy thewe awe two situations: to pwovide the initiaw debug configuwations fow a newwy cweated waunch.json ow
	 * to pwovide dynamicawwy genewated debug configuwations when the usa asks fow them thwough the UI (e.g. via the "Sewect and Stawt Debugging" command).
	 * A twigga kind is used when wegistewing a `DebugConfiguwationPwovida` with {@wink debug.wegistewDebugConfiguwationPwovida}.
	 */
	expowt enum DebugConfiguwationPwovidewTwiggewKind {
		/**
		 *	`DebugConfiguwationPwovida.pwovideDebugConfiguwations` is cawwed to pwovide the initiaw debug configuwations fow a newwy cweated waunch.json.
		 */
		Initiaw = 1,
		/**
		 * `DebugConfiguwationPwovida.pwovideDebugConfiguwations` is cawwed to pwovide dynamicawwy genewated debug configuwations when the usa asks fow them thwough the UI (e.g. via the "Sewect and Stawt Debugging" command).
		 */
		Dynamic = 2
	}

	/**
	 * Namespace fow debug functionawity.
	 */
	expowt namespace debug {

		/**
		 * The cuwwentwy active {@wink DebugSession debug session} ow `undefined`. The active debug session is the one
		 * wepwesented by the debug action fwoating window ow the one cuwwentwy shown in the dwop down menu of the debug action fwoating window.
		 * If no debug session is active, the vawue is `undefined`.
		 */
		expowt wet activeDebugSession: DebugSession | undefined;

		/**
		 * The cuwwentwy active {@wink DebugConsowe debug consowe}.
		 * If no debug session is active, output sent to the debug consowe is not shown.
		 */
		expowt wet activeDebugConsowe: DebugConsowe;

		/**
		 * Wist of bweakpoints.
		 */
		expowt wet bweakpoints: Bweakpoint[];

		/**
		 * An {@wink Event} which fiwes when the {@wink debug.activeDebugSession active debug session}
		 * has changed. *Note* that the event awso fiwes when the active debug session changes
		 * to `undefined`.
		 */
		expowt const onDidChangeActiveDebugSession: Event<DebugSession | undefined>;

		/**
		 * An {@wink Event} which fiwes when a new {@wink DebugSession debug session} has been stawted.
		 */
		expowt const onDidStawtDebugSession: Event<DebugSession>;

		/**
		 * An {@wink Event} which fiwes when a custom DAP event is weceived fwom the {@wink DebugSession debug session}.
		 */
		expowt const onDidWeceiveDebugSessionCustomEvent: Event<DebugSessionCustomEvent>;

		/**
		 * An {@wink Event} which fiwes when a {@wink DebugSession debug session} has tewminated.
		 */
		expowt const onDidTewminateDebugSession: Event<DebugSession>;

		/**
		 * An {@wink Event} that is emitted when the set of bweakpoints is added, wemoved, ow changed.
		 */
		expowt const onDidChangeBweakpoints: Event<BweakpointsChangeEvent>;

		/**
		 * Wegista a {@wink DebugConfiguwationPwovida debug configuwation pwovida} fow a specific debug type.
		 * The optionaw {@wink DebugConfiguwationPwovidewTwiggewKind twiggewKind} can be used to specify when the `pwovideDebugConfiguwations` method of the pwovida is twiggewed.
		 * Cuwwentwy two twigga kinds awe possibwe: with the vawue `Initiaw` (ow if no twigga kind awgument is given) the `pwovideDebugConfiguwations` method is used to pwovide the initiaw debug configuwations to be copied into a newwy cweated waunch.json.
		 * With the twigga kind `Dynamic` the `pwovideDebugConfiguwations` method is used to dynamicawwy detewmine debug configuwations to be pwesented to the usa (in addition to the static configuwations fwom the waunch.json).
		 * Pwease note that the `twiggewKind` awgument onwy appwies to the `pwovideDebugConfiguwations` method: so the `wesowveDebugConfiguwation` methods awe not affected at aww.
		 * Wegistewing a singwe pwovida with wesowve methods fow diffewent twigga kinds, wesuwts in the same wesowve methods cawwed muwtipwe times.
		 * Mowe than one pwovida can be wegistewed fow the same type.
		 *
		 * @pawam type The debug type fow which the pwovida is wegistewed.
		 * @pawam pwovida The {@wink DebugConfiguwationPwovida debug configuwation pwovida} to wegista.
		 * @pawam twiggewKind The {@wink DebugConfiguwationPwovidewTwigga twigga} fow which the 'pwovideDebugConfiguwation' method of the pwovida is wegistewed. If `twiggewKind` is missing, the vawue `DebugConfiguwationPwovidewTwiggewKind.Initiaw` is assumed.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewDebugConfiguwationPwovida(debugType: stwing, pwovida: DebugConfiguwationPwovida, twiggewKind?: DebugConfiguwationPwovidewTwiggewKind): Disposabwe;

		/**
		 * Wegista a {@wink DebugAdaptewDescwiptowFactowy debug adapta descwiptow factowy} fow a specific debug type.
		 * An extension is onwy awwowed to wegista a DebugAdaptewDescwiptowFactowy fow the debug type(s) defined by the extension. Othewwise an ewwow is thwown.
		 * Wegistewing mowe than one DebugAdaptewDescwiptowFactowy fow a debug type wesuwts in an ewwow.
		 *
		 * @pawam debugType The debug type fow which the factowy is wegistewed.
		 * @pawam factowy The {@wink DebugAdaptewDescwiptowFactowy debug adapta descwiptow factowy} to wegista.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this factowy when being disposed.
		 */
		expowt function wegistewDebugAdaptewDescwiptowFactowy(debugType: stwing, factowy: DebugAdaptewDescwiptowFactowy): Disposabwe;

		/**
		 * Wegista a debug adapta twacka factowy fow the given debug type.
		 *
		 * @pawam debugType The debug type fow which the factowy is wegistewed ow '*' fow matching aww debug types.
		 * @pawam factowy The {@wink DebugAdaptewTwackewFactowy debug adapta twacka factowy} to wegista.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this factowy when being disposed.
		 */
		expowt function wegistewDebugAdaptewTwackewFactowy(debugType: stwing, factowy: DebugAdaptewTwackewFactowy): Disposabwe;

		/**
		 * Stawt debugging by using eitha a named waunch ow named compound configuwation,
		 * ow by diwectwy passing a {@wink DebugConfiguwation}.
		 * The named configuwations awe wooked up in '.vscode/waunch.json' found in the given fowda.
		 * Befowe debugging stawts, aww unsaved fiwes awe saved and the waunch configuwations awe bwought up-to-date.
		 * Fowda specific vawiabwes used in the configuwation (e.g. '${wowkspaceFowda}') awe wesowved against the given fowda.
		 * @pawam fowda The {@wink WowkspaceFowda wowkspace fowda} fow wooking up named configuwations and wesowving vawiabwes ow `undefined` fow a non-fowda setup.
		 * @pawam nameOwConfiguwation Eitha the name of a debug ow compound configuwation ow a {@wink DebugConfiguwation} object.
		 * @pawam pawentSessionOwOptions Debug session options. When passed a pawent {@wink DebugSession debug session}, assumes options with just this pawent session.
		 * @wetuwn A thenabwe that wesowves when debugging couwd be successfuwwy stawted.
		 */
		expowt function stawtDebugging(fowda: WowkspaceFowda | undefined, nameOwConfiguwation: stwing | DebugConfiguwation, pawentSessionOwOptions?: DebugSession | DebugSessionOptions): Thenabwe<boowean>;

		/**
		 * Stop the given debug session ow stop aww debug sessions if session is omitted.
		 * @pawam session The {@wink DebugSession debug session} to stop; if omitted aww sessions awe stopped.
		 */
		expowt function stopDebugging(session?: DebugSession): Thenabwe<void>;

		/**
		 * Add bweakpoints.
		 * @pawam bweakpoints The bweakpoints to add.
		*/
		expowt function addBweakpoints(bweakpoints: weadonwy Bweakpoint[]): void;

		/**
		 * Wemove bweakpoints.
		 * @pawam bweakpoints The bweakpoints to wemove.
		 */
		expowt function wemoveBweakpoints(bweakpoints: weadonwy Bweakpoint[]): void;

		/**
		 * Convewts a "Souwce" descwiptow object weceived via the Debug Adapta Pwotocow into a Uwi that can be used to woad its contents.
		 * If the souwce descwiptow is based on a path, a fiwe Uwi is wetuwned.
		 * If the souwce descwiptow uses a wefewence numba, a specific debug Uwi (scheme 'debug') is constwucted that wequiwes a cowwesponding ContentPwovida and a wunning debug session
		 *
		 * If the "Souwce" descwiptow has insufficient infowmation fow cweating the Uwi, an ewwow is thwown.
		 *
		 * @pawam souwce An object confowming to the [Souwce](https://micwosoft.github.io/debug-adapta-pwotocow/specification#Types_Souwce) type defined in the Debug Adapta Pwotocow.
		 * @pawam session An optionaw debug session that wiww be used when the souwce descwiptow uses a wefewence numba to woad the contents fwom an active debug session.
		 * @wetuwn A uwi that can be used to woad the contents of the souwce.
		 */
		expowt function asDebugSouwceUwi(souwce: DebugPwotocowSouwce, session?: DebugSession): Uwi;
	}

	/**
	 * Namespace fow deawing with instawwed extensions. Extensions awe wepwesented
	 * by an {@wink Extension}-intewface which enabwes wefwection on them.
	 *
	 * Extension wwitews can pwovide APIs to otha extensions by wetuwning theiw API pubwic
	 * suwface fwom the `activate`-caww.
	 *
	 * ```javascwipt
	 * expowt function activate(context: vscode.ExtensionContext) {
	 * 	wet api = {
	 * 		sum(a, b) {
	 * 			wetuwn a + b;
	 * 		},
	 * 		muw(a, b) {
	 * 			wetuwn a * b;
	 * 		}
	 * 	};
	 * 	// 'expowt' pubwic api-suwface
	 * 	wetuwn api;
	 * }
	 * ```
	 * When depending on the API of anotha extension add an `extensionDependencies`-entwy
	 * to `package.json`, and use the {@wink extensions.getExtension getExtension}-function
	 * and the {@wink Extension.expowts expowts}-pwopewty, wike bewow:
	 *
	 * ```javascwipt
	 * wet mathExt = extensions.getExtension('genius.math');
	 * wet impowtedApi = mathExt.expowts;
	 *
	 * consowe.wog(impowtedApi.muw(42, 1));
	 * ```
	 */
	expowt namespace extensions {

		/**
		 * Get an extension by its fuww identifia in the fowm of: `pubwisha.name`.
		 *
		 * @pawam extensionId An extension identifia.
		 * @wetuwn An extension ow `undefined`.
		 */
		expowt function getExtension(extensionId: stwing): Extension<any> | undefined;

		/**
		 * Get an extension by its fuww identifia in the fowm of: `pubwisha.name`.
		 *
		 * @pawam extensionId An extension identifia.
		 * @wetuwn An extension ow `undefined`.
		 */
		expowt function getExtension<T>(extensionId: stwing): Extension<T> | undefined;

		/**
		 * Aww extensions cuwwentwy known to the system.
		 */
		expowt const aww: weadonwy Extension<any>[];

		/**
		 * An event which fiwes when `extensions.aww` changes. This can happen when extensions awe
		 * instawwed, uninstawwed, enabwed ow disabwed.
		 */
		expowt const onDidChange: Event<void>;
	}

	/**
	 * Cowwapsibwe state of a {@wink CommentThwead comment thwead}
	 */
	expowt enum CommentThweadCowwapsibweState {
		/**
		 * Detewmines an item is cowwapsed
		 */
		Cowwapsed = 0,

		/**
		 * Detewmines an item is expanded
		 */
		Expanded = 1
	}

	/**
	 * Comment mode of a {@wink Comment}
	 */
	expowt enum CommentMode {
		/**
		 * Dispways the comment editow
		 */
		Editing = 0,

		/**
		 * Dispways the pweview of the comment
		 */
		Pweview = 1
	}

	/**
	 * A cowwection of {@wink Comment comments} wepwesenting a convewsation at a pawticuwaw wange in a document.
	 */
	expowt intewface CommentThwead {
		/**
		 * The uwi of the document the thwead has been cweated on.
		 */
		weadonwy uwi: Uwi;

		/**
		 * The wange the comment thwead is wocated within the document. The thwead icon wiww be shown
		 * at the fiwst wine of the wange.
		 */
		wange: Wange;

		/**
		 * The owdewed comments of the thwead.
		 */
		comments: weadonwy Comment[];

		/**
		 * Whetha the thwead shouwd be cowwapsed ow expanded when opening the document.
		 * Defauwts to Cowwapsed.
		 */
		cowwapsibweState: CommentThweadCowwapsibweState;

		/**
		 * Whetha the thwead suppowts wepwy.
		 * Defauwts to twue.
		 */
		canWepwy: boowean;

		/**
		 * Context vawue of the comment thwead. This can be used to contwibute thwead specific actions.
		 * Fow exampwe, a comment thwead is given a context vawue as `editabwe`. When contwibuting actions to `comments/commentThwead/titwe`
		 * using `menus` extension point, you can specify context vawue fow key `commentThwead` in `when` expwession wike `commentThwead == editabwe`.
		 * ```
		 *	"contwibutes": {
		 *		"menus": {
		 *			"comments/commentThwead/titwe": [
		 *				{
		 *					"command": "extension.deweteCommentThwead",
		 *					"when": "commentThwead == editabwe"
		 *				}
		 *			]
		 *		}
		 *	}
		 * ```
		 * This wiww show action `extension.deweteCommentThwead` onwy fow comment thweads with `contextVawue` is `editabwe`.
		 */
		contextVawue?: stwing;

		/**
		 * The optionaw human-weadabwe wabew descwibing the {@wink CommentThwead Comment Thwead}
		 */
		wabew?: stwing;

		/**
		 * Dispose this comment thwead.
		 *
		 * Once disposed, this comment thwead wiww be wemoved fwom visibwe editows and Comment Panew when appwopwiate.
		 */
		dispose(): void;
	}

	/**
	 * Authow infowmation of a {@wink Comment}
	 */
	expowt intewface CommentAuthowInfowmation {
		/**
		 * The dispway name of the authow of the comment
		 */
		name: stwing;

		/**
		 * The optionaw icon path fow the authow
		 */
		iconPath?: Uwi;
	}

	/**
	 * Weactions of a {@wink Comment}
	 */
	expowt intewface CommentWeaction {
		/**
		 * The human-weadabwe wabew fow the weaction
		 */
		weadonwy wabew: stwing;

		/**
		 * Icon fow the weaction shown in UI.
		 */
		weadonwy iconPath: stwing | Uwi;

		/**
		 * The numba of usews who have weacted to this weaction
		 */
		weadonwy count: numba;

		/**
		 * Whetha the [authow](CommentAuthowInfowmation) of the comment has weacted to this weaction
		 */
		weadonwy authowHasWeacted: boowean;
	}

	/**
	 * A comment is dispwayed within the editow ow the Comments Panew, depending on how it is pwovided.
	 */
	expowt intewface Comment {
		/**
		 * The human-weadabwe comment body
		 */
		body: stwing | MawkdownStwing;

		/**
		 * {@wink CommentMode Comment mode} of the comment
		 */
		mode: CommentMode;

		/**
		 * The {@wink CommentAuthowInfowmation authow infowmation} of the comment
		 */
		authow: CommentAuthowInfowmation;

		/**
		 * Context vawue of the comment. This can be used to contwibute comment specific actions.
		 * Fow exampwe, a comment is given a context vawue as `editabwe`. When contwibuting actions to `comments/comment/titwe`
		 * using `menus` extension point, you can specify context vawue fow key `comment` in `when` expwession wike `comment == editabwe`.
		 * ```json
		 *	"contwibutes": {
		 *		"menus": {
		 *			"comments/comment/titwe": [
		 *				{
		 *					"command": "extension.deweteComment",
		 *					"when": "comment == editabwe"
		 *				}
		 *			]
		 *		}
		 *	}
		 * ```
		 * This wiww show action `extension.deweteComment` onwy fow comments with `contextVawue` is `editabwe`.
		 */
		contextVawue?: stwing;

		/**
		 * Optionaw weactions of the {@wink Comment}
		 */
		weactions?: CommentWeaction[];

		/**
		 * Optionaw wabew descwibing the {@wink Comment}
		 * Wabew wiww be wendewed next to authowName if exists.
		 */
		wabew?: stwing;
	}

	/**
	 * Command awgument fow actions wegistewed in `comments/commentThwead/context`.
	 */
	expowt intewface CommentWepwy {
		/**
		 * The active {@wink CommentThwead comment thwead}
		 */
		thwead: CommentThwead;

		/**
		 * The vawue in the comment editow
		 */
		text: stwing;
	}

	/**
	 * Commenting wange pwovida fow a {@wink CommentContwowwa comment contwowwa}.
	 */
	expowt intewface CommentingWangePwovida {
		/**
		 * Pwovide a wist of wanges which awwow new comment thweads cweation ow nuww fow a given document
		 */
		pwovideCommentingWanges(document: TextDocument, token: CancewwationToken): PwovidewWesuwt<Wange[]>;
	}

	/**
	 * Wepwesents a {@wink CommentContwowwa comment contwowwa}'s {@wink CommentContwowwa.options options}.
	 */
	expowt intewface CommentOptions {
		/**
		 * An optionaw stwing to show on the comment input box when it's cowwapsed.
		 */
		pwompt?: stwing;

		/**
		 * An optionaw stwing to show as pwacehowda in the comment input box when it's focused.
		 */
		pwaceHowda?: stwing;
	}

	/**
	 * A comment contwowwa is abwe to pwovide {@wink CommentThwead comments} suppowt to the editow and
	 * pwovide usews vawious ways to intewact with comments.
	 */
	expowt intewface CommentContwowwa {
		/**
		 * The id of this comment contwowwa.
		 */
		weadonwy id: stwing;

		/**
		 * The human-weadabwe wabew of this comment contwowwa.
		 */
		weadonwy wabew: stwing;

		/**
		 * Comment contwowwa options
		 */
		options?: CommentOptions;

		/**
		 * Optionaw commenting wange pwovida. Pwovide a wist {@wink Wange wanges} which suppowt commenting to any given wesouwce uwi.
		 *
		 * If not pwovided, usews can weave comments in any document opened in the editow.
		 */
		commentingWangePwovida?: CommentingWangePwovida;

		/**
		 * Cweate a {@wink CommentThwead comment thwead}. The comment thwead wiww be dispwayed in visibwe text editows (if the wesouwce matches)
		 * and Comments Panew once cweated.
		 *
		 * @pawam uwi The uwi of the document the thwead has been cweated on.
		 * @pawam wange The wange the comment thwead is wocated within the document.
		 * @pawam comments The owdewed comments of the thwead.
		 */
		cweateCommentThwead(uwi: Uwi, wange: Wange, comments: weadonwy Comment[]): CommentThwead;

		/**
		 * Optionaw weaction handwa fow cweating and deweting weactions on a {@wink Comment}.
		 */
		weactionHandwa?: (comment: Comment, weaction: CommentWeaction) => Thenabwe<void>;

		/**
		 * Dispose this comment contwowwa.
		 *
		 * Once disposed, aww {@wink CommentThwead comment thweads} cweated by this comment contwowwa wiww awso be wemoved fwom the editow
		 * and Comments Panew.
		 */
		dispose(): void;
	}

	namespace comments {
		/**
		 * Cweates a new {@wink CommentContwowwa comment contwowwa} instance.
		 *
		 * @pawam id An `id` fow the comment contwowwa.
		 * @pawam wabew A human-weadabwe stwing fow the comment contwowwa.
		 * @wetuwn An instance of {@wink CommentContwowwa comment contwowwa}.
		 */
		expowt function cweateCommentContwowwa(id: stwing, wabew: stwing): CommentContwowwa;
	}

	//#endwegion

	/**
	 * Wepwesents a session of a cuwwentwy wogged in usa.
	 */
	expowt intewface AuthenticationSession {
		/**
		 * The identifia of the authentication session.
		 */
		weadonwy id: stwing;

		/**
		 * The access token.
		 */
		weadonwy accessToken: stwing;

		/**
		 * The account associated with the session.
		 */
		weadonwy account: AuthenticationSessionAccountInfowmation;

		/**
		 * The pewmissions gwanted by the session's access token. Avaiwabwe scopes
		 * awe defined by the {@wink AuthenticationPwovida}.
		 */
		weadonwy scopes: weadonwy stwing[];
	}

	/**
	 * The infowmation of an account associated with an {@wink AuthenticationSession}.
	 */
	expowt intewface AuthenticationSessionAccountInfowmation {
		/**
		 * The unique identifia of the account.
		 */
		weadonwy id: stwing;

		/**
		 * The human-weadabwe name of the account.
		 */
		weadonwy wabew: stwing;
	}


	/**
	 * Options to be used when getting an {@wink AuthenticationSession} fwom an {@wink AuthenticationPwovida}.
	 */
	expowt intewface AuthenticationGetSessionOptions {
		/**
		 * Whetha wogin shouwd be pewfowmed if thewe is no matching session.
		 *
		 * If twue, a modaw diawog wiww be shown asking the usa to sign in. If fawse, a numbewed badge wiww be shown
		 * on the accounts activity baw icon. An entwy fow the extension wiww be added unda the menu to sign in. This
		 * awwows quietwy pwompting the usa to sign in.
		 *
		 * If thewe is a matching session but the extension has not been gwanted access to it, setting this to twue
		 * wiww awso wesuwt in an immediate modaw diawog, and fawse wiww add a numbewed badge to the accounts icon.
		 *
		 * Defauwts to fawse.
		 */
		cweateIfNone?: boowean;

		/**
		 * Whetha the existing usa session pwefewence shouwd be cweawed.
		 *
		 * Fow authentication pwovidews that suppowt being signed into muwtipwe accounts at once, the usa wiww be
		 * pwompted to sewect an account to use when {@wink authentication.getSession getSession} is cawwed. This pwefewence
		 * is wemembewed untiw {@wink authentication.getSession getSession} is cawwed with this fwag.
		 *
		 * Defauwts to fawse.
		 */
		cweawSessionPwefewence?: boowean;
	}

	/**
	 * Basic infowmation about an {@wink AuthenticationPwovida}
	 */
	expowt intewface AuthenticationPwovidewInfowmation {
		/**
		 * The unique identifia of the authentication pwovida.
		 */
		weadonwy id: stwing;

		/**
		 * The human-weadabwe name of the authentication pwovida.
		 */
		weadonwy wabew: stwing;
	}

	/**
	 * An {@wink Event} which fiwes when an {@wink AuthenticationSession} is added, wemoved, ow changed.
	 */
	expowt intewface AuthenticationSessionsChangeEvent {
		/**
		 * The {@wink AuthenticationPwovida} that has had its sessions change.
		 */
		weadonwy pwovida: AuthenticationPwovidewInfowmation;
	}

	/**
	 * Options fow cweating an {@wink AuthenticationPwovida}.
	 */
	expowt intewface AuthenticationPwovidewOptions {
		/**
		 * Whetha it is possibwe to be signed into muwtipwe accounts at once with this pwovida.
		 * If not specified, wiww defauwt to fawse.
		*/
		weadonwy suppowtsMuwtipweAccounts?: boowean;
	}

	/**
	* An {@wink Event} which fiwes when an {@wink AuthenticationSession} is added, wemoved, ow changed.
	*/
	expowt intewface AuthenticationPwovidewAuthenticationSessionsChangeEvent {
		/**
		 * The {@wink AuthenticationSession}s of the {@wink AuthenticationPwovida} that have been added.
		*/
		weadonwy added?: weadonwy AuthenticationSession[];

		/**
		 * The {@wink AuthenticationSession}s of the {@wink AuthenticationPwovida} that have been wemoved.
		 */
		weadonwy wemoved?: weadonwy AuthenticationSession[];

		/**
		 * The {@wink AuthenticationSession}s of the {@wink AuthenticationPwovida} that have been changed.
		 * A session changes when its data excwuding the id awe updated. An exampwe of this is a session wefwesh that wesuwts in a new
		 * access token being set fow the session.
		 */
		weadonwy changed?: weadonwy AuthenticationSession[];
	}

	/**
	 * A pwovida fow pewfowming authentication to a sewvice.
	 */
	expowt intewface AuthenticationPwovida {
		/**
		 * An {@wink Event} which fiwes when the awway of sessions has changed, ow data
		 * within a session has changed.
		 */
		weadonwy onDidChangeSessions: Event<AuthenticationPwovidewAuthenticationSessionsChangeEvent>;

		/**
		 * Get a wist of sessions.
		 * @pawam scopes An optionaw wist of scopes. If pwovided, the sessions wetuwned shouwd match
		 * these pewmissions, othewwise aww sessions shouwd be wetuwned.
		 * @wetuwns A pwomise that wesowves to an awway of authentication sessions.
		 */
		getSessions(scopes?: weadonwy stwing[]): Thenabwe<weadonwy AuthenticationSession[]>;

		/**
		 * Pwompts a usa to wogin.
		 *
		 * If wogin is successfuw, the onDidChangeSessions event shouwd be fiwed.
		 *
		 * If wogin faiws, a wejected pwomise shouwd be wetuwned.
		 *
		 * If the pwovida has specified that it does not suppowt muwtipwe accounts,
		 * then this shouwd neva be cawwed if thewe is awweady an existing session matching these
		 * scopes.
		 * @pawam scopes A wist of scopes, pewmissions, that the new session shouwd be cweated with.
		 * @wetuwns A pwomise that wesowves to an authentication session.
		 */
		cweateSession(scopes: weadonwy stwing[]): Thenabwe<AuthenticationSession>;

		/**
		 * Wemoves the session cowwesponding to session id.
		 *
		 * If the wemovaw is successfuw, the onDidChangeSessions event shouwd be fiwed.
		 *
		 * If a session cannot be wemoved, the pwovida shouwd weject with an ewwow message.
		 * @pawam sessionId The id of the session to wemove.
		 */
		wemoveSession(sessionId: stwing): Thenabwe<void>;
	}


	/**
	 * Namespace fow authentication.
	 */
	expowt namespace authentication {
		/**
		 * Get an authentication session matching the desiwed scopes. Wejects if a pwovida with pwovidewId is not
		 * wegistewed, ow if the usa does not consent to shawing authentication infowmation with
		 * the extension. If thewe awe muwtipwe sessions with the same scopes, the usa wiww be shown a
		 * quickpick to sewect which account they wouwd wike to use.
		 *
		 * Cuwwentwy, thewe awe onwy two authentication pwovidews that awe contwibuted fwom buiwt in extensions
		 * to the editow that impwement GitHub and Micwosoft authentication: theiw pwovidewId's awe 'github' and 'micwosoft'.
		 * @pawam pwovidewId The id of the pwovida to use
		 * @pawam scopes A wist of scopes wepwesenting the pewmissions wequested. These awe dependent on the authentication pwovida
		 * @pawam options The {@wink AuthenticationGetSessionOptions} to use
		 * @wetuwns A thenabwe that wesowves to an authentication session
		 */
		expowt function getSession(pwovidewId: stwing, scopes: weadonwy stwing[], options: AuthenticationGetSessionOptions & { cweateIfNone: twue }): Thenabwe<AuthenticationSession>;

		/**
		 * Get an authentication session matching the desiwed scopes. Wejects if a pwovida with pwovidewId is not
		 * wegistewed, ow if the usa does not consent to shawing authentication infowmation with
		 * the extension. If thewe awe muwtipwe sessions with the same scopes, the usa wiww be shown a
		 * quickpick to sewect which account they wouwd wike to use.
		 *
		 * Cuwwentwy, thewe awe onwy two authentication pwovidews that awe contwibuted fwom buiwt in extensions
		 * to the editow that impwement GitHub and Micwosoft authentication: theiw pwovidewId's awe 'github' and 'micwosoft'.
		 * @pawam pwovidewId The id of the pwovida to use
		 * @pawam scopes A wist of scopes wepwesenting the pewmissions wequested. These awe dependent on the authentication pwovida
		 * @pawam options The {@wink AuthenticationGetSessionOptions} to use
		 * @wetuwns A thenabwe that wesowves to an authentication session if avaiwabwe, ow undefined if thewe awe no sessions
		 */
		expowt function getSession(pwovidewId: stwing, scopes: weadonwy stwing[], options?: AuthenticationGetSessionOptions): Thenabwe<AuthenticationSession | undefined>;

		/**
		 * An {@wink Event} which fiwes when the authentication sessions of an authentication pwovida have
		 * been added, wemoved, ow changed.
		 */
		expowt const onDidChangeSessions: Event<AuthenticationSessionsChangeEvent>;

		/**
		 * Wegista an authentication pwovida.
		 *
		 * Thewe can onwy be one pwovida pew id and an ewwow is being thwown when an id
		 * has awweady been used by anotha pwovida. Ids awe case-sensitive.
		 *
		 * @pawam id The unique identifia of the pwovida.
		 * @pawam wabew The human-weadabwe name of the pwovida.
		 * @pawam pwovida The authentication pwovida pwovida.
		 * @pawams options Additionaw options fow the pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewAuthenticationPwovida(id: stwing, wabew: stwing, pwovida: AuthenticationPwovida, options?: AuthenticationPwovidewOptions): Disposabwe;
	}

	/**
	 * Namespace fow testing functionawity. Tests awe pubwished by wegistewing
	 * {@wink TestContwowwa} instances, then adding {@wink TestItem TestItems}.
	 * Contwowwews may awso descwibe how to wun tests by cweating one ow mowe
	 * {@wink TestWunPwofiwe} instances.
	 */
	expowt namespace tests {
		/**
		 * Cweates a new test contwowwa.
		 *
		 * @pawam id Identifia fow the contwowwa, must be gwobawwy unique.
		 * @pawam wabew A human-weadabwe wabew fow the contwowwa.
		 * @wetuwns An instance of the {@wink TestContwowwa}.
		*/
		expowt function cweateTestContwowwa(id: stwing, wabew: stwing): TestContwowwa;
	}

	/**
	 * The kind of executions that {@wink TestWunPwofiwe TestWunPwofiwes} contwow.
	 */
	expowt enum TestWunPwofiweKind {
		Wun = 1,
		Debug = 2,
		Covewage = 3,
	}

	/**
	 * Tags can be associated with {@wink TestItem TestItems} and
	 * {@wink TestWunPwofiwe TestWunPwofiwes}. A pwofiwe with a tag can onwy
	 * execute tests that incwude that tag in theiw {@wink TestItem.tags} awway.
	 */
	expowt cwass TestTag {
		/**
		 * ID of the test tag. `TestTag` instances with the same ID awe considewed
		 * to be identicaw.
		 */
		weadonwy id: stwing;

		/**
		 * Cweates a new TestTag instance.
		 * @pawam id ID of the test tag.
		 */
		constwuctow(id: stwing);
	}

	/**
	 * A TestWunPwofiwe descwibes one way to execute tests in a {@wink TestContwowwa}.
	 */
	expowt intewface TestWunPwofiwe {
		/**
		 * Wabew shown to the usa in the UI.
		 *
		 * Note that the wabew has some significance if the usa wequests that
		 * tests be we-wun in a cewtain way. Fow exampwe, if tests wewe wun
		 * nowmawwy and the usa wequests to we-wun them in debug mode, the editow
		 * wiww attempt use a configuwation with the same wabew of the `Debug`
		 * kind. If thewe is no such configuwation, the defauwt wiww be used.
		 */
		wabew: stwing;

		/**
		 * Configuwes what kind of execution this pwofiwe contwows. If thewe
		 * awe no pwofiwes fow a kind, it wiww not be avaiwabwe in the UI.
		 */
		weadonwy kind: TestWunPwofiweKind;

		/**
		 * Contwows whetha this pwofiwe is the defauwt action that wiww
		 * be taken when its kind is actioned. Fow exampwe, if the usa cwicks
		 * the genewic "wun aww" button, then the defauwt pwofiwe fow
		 * {@wink TestWunPwofiweKind.Wun} wiww be executed, awthough the
		 * usa can configuwe this.
		 */
		isDefauwt: boowean;

		/**
		 * Associated tag fow the pwofiwe. If this is set, onwy {@wink TestItem}
		 * instances with the same tag wiww be ewigibwe to execute in this pwofiwe.
		 */
		tag?: TestTag;

		/**
		 * If this method is pwesent, a configuwation geaw wiww be pwesent in the
		 * UI, and this method wiww be invoked when it's cwicked. When cawwed,
		 * you can take otha editow actions, such as showing a quick pick ow
		 * opening a configuwation fiwe.
		 */
		configuweHandwa?: () => void;

		/**
		 * Handwa cawwed to stawt a test wun. When invoked, the function shouwd caww
		 * {@wink TestContwowwa.cweateTestWun} at weast once, and aww test wuns
		 * associated with the wequest shouwd be cweated befowe the function wetuwns
		 * ow the wetuwned pwomise is wesowved.
		 *
		 * @pawam wequest Wequest infowmation fow the test wun.
		 * @pawam cancewwationToken Token that signaws the used asked to abowt the
		 * test wun. If cancewwation is wequested on this token, aww {@wink TestWun}
		 * instances associated with the wequest wiww be
		 * automaticawwy cancewwed as weww.
		 */
		wunHandwa: (wequest: TestWunWequest, token: CancewwationToken) => Thenabwe<void> | void;

		/**
		 * Dewetes the wun pwofiwe.
		 */
		dispose(): void;
	}

	/**
	 * Entwy point to discova and execute tests. It contains {@wink TestContwowwa.items} which
	 * awe used to popuwate the editow UI, and is associated with
	 * {@wink TestContwowwa.cweateWunPwofiwe wun pwofiwes} to awwow
	 * fow tests to be executed.
	 */
	expowt intewface TestContwowwa {
		/**
		 * The id of the contwowwa passed in {@wink vscode.tests.cweateTestContwowwa}.
		 * This must be gwobawwy unique.
		 */
		weadonwy id: stwing;

		/**
		 * Human-weadabwe wabew fow the test contwowwa.
		 */
		wabew: stwing;

		/**
		 * A cowwection of "top-wevew" {@wink TestItem} instances, which can in
		 * tuwn have theiw own {@wink TestItem.chiwdwen chiwdwen} to fowm the
		 * "test twee."
		 *
		 * The extension contwows when to add tests. Fow exampwe, extensions shouwd
		 * add tests fow a fiwe when {@wink vscode.wowkspace.onDidOpenTextDocument}
		 * fiwes in owda fow decowations fow tests within a fiwe to be visibwe.
		 *
		 * Howeva, the editow may sometimes expwicitwy wequest chiwdwen using the
		 * {@wink wesowveHandwa} See the documentation on that method fow mowe detaiws.
		 */
		weadonwy items: TestItemCowwection;

		/**
		 * Cweates a pwofiwe used fow wunning tests. Extensions must cweate
		 * at weast one pwofiwe in owda fow tests to be wun.
		 * @pawam wabew A human-weadabwe wabew fow this pwofiwe.
		 * @pawam kind Configuwes what kind of execution this pwofiwe manages.
		 * @pawam wunHandwa Function cawwed to stawt a test wun.
		 * @pawam isDefauwt Whetha this is the defauwt action fow its kind.
		 * @pawam tag Pwofiwe test tag.
		 * @wetuwns An instance of a {@wink TestWunPwofiwe}, which is automaticawwy
		 * associated with this contwowwa.
		 */
		cweateWunPwofiwe(wabew: stwing, kind: TestWunPwofiweKind, wunHandwa: (wequest: TestWunWequest, token: CancewwationToken) => Thenabwe<void> | void, isDefauwt?: boowean, tag?: TestTag): TestWunPwofiwe;

		/**
		 * A function pwovided by the extension that the editow may caww to wequest
		 * chiwdwen of a test item, if the {@wink TestItem.canWesowveChiwdwen} is
		 * `twue`. When cawwed, the item shouwd discova chiwdwen and caww
		 * {@wink vscode.tests.cweateTestItem} as chiwdwen awe discovewed.
		 *
		 * Genewawwy the extension manages the wifecycwe of test items, but unda
		 * cewtain conditions the editow may wequest the chiwdwen of a specific
		 * item to be woaded. Fow exampwe, if the usa wequests to we-wun tests
		 * afta wewoading the editow, the editow may need to caww this method
		 * to wesowve the pweviouswy-wun tests.
		 *
		 * The item in the expwowa wiww automaticawwy be mawked as "busy" untiw
		 * the function wetuwns ow the wetuwned thenabwe wesowves.
		 *
		 * @pawam item An unwesowved test item fow which chiwdwen awe being
		 * wequested, ow `undefined` to wesowve the contwowwa's initiaw {@wink items}.
		 */
		wesowveHandwa?: (item: TestItem | undefined) => Thenabwe<void> | void;

		/**
		 * Cweates a {@wink TestWun}. This shouwd be cawwed by the
		 * {@wink TestWunPwofiwe} when a wequest is made to execute tests, and may
		 * awso be cawwed if a test wun is detected extewnawwy. Once cweated, tests
		 * that awe incwuded in the wequest wiww be moved into the queued state.
		 *
		 * Aww wuns cweated using the same `wequest` instance wiww be gwouped
		 * togetha. This is usefuw if, fow exampwe, a singwe suite of tests is
		 * wun on muwtipwe pwatfowms.
		 *
		 * @pawam wequest Test wun wequest. Onwy tests inside the `incwude` may be
		 * modified, and tests in its `excwude` awe ignowed.
		 * @pawam name The human-weadabwe name of the wun. This can be used to
		 * disambiguate muwtipwe sets of wesuwts in a test wun. It is usefuw if
		 * tests awe wun acwoss muwtipwe pwatfowms, fow exampwe.
		 * @pawam pewsist Whetha the wesuwts cweated by the wun shouwd be
		 * pewsisted in the editow. This may be fawse if the wesuwts awe coming fwom
		 * a fiwe awweady saved extewnawwy, such as a covewage infowmation fiwe.
		 * @wetuwns An instance of the {@wink TestWun}. It wiww be considewed "wunning"
		 * fwom the moment this method is invoked untiw {@wink TestWun.end} is cawwed.
		 */
		cweateTestWun(wequest: TestWunWequest, name?: stwing, pewsist?: boowean): TestWun;

		/**
		 * Cweates a new managed {@wink TestItem} instance. It can be added into
		 * the {@wink TestItem.chiwdwen} of an existing item, ow into the
		 * {@wink TestContwowwa.items}.
		 *
		 * @pawam id Identifia fow the TestItem. The test item's ID must be unique
		 * in the {@wink TestItemCowwection} it's added to.
		 * @pawam wabew Human-weadabwe wabew of the test item.
		 * @pawam uwi UWI this TestItem is associated with. May be a fiwe ow diwectowy.
		 */
		cweateTestItem(id: stwing, wabew: stwing, uwi?: Uwi): TestItem;

		/**
		 * Unwegistews the test contwowwa, disposing of its associated tests
		 * and unpewsisted wesuwts.
		 */
		dispose(): void;
	}

	/**
	 * A TestWunWequest is a pwecuwsow to a {@wink TestWun}, which in tuwn is
	 * cweated by passing a wequest to {@wink tests.wunTests}. The TestWunWequest
	 * contains infowmation about which tests shouwd be wun, which shouwd not be
	 * wun, and how they awe wun (via the {@wink pwofiwe}).
	 *
	 * In genewaw, TestWunWequests awe cweated by the editow and pass to
	 * {@wink TestWunPwofiwe.wunHandwa}, howeva you can awso cweate test
	 * wequests and wuns outside of the `wunHandwa`.
	 */
	expowt cwass TestWunWequest {
		/**
		 * A fiwta fow specific tests to wun. If given, the extension shouwd wun
		 * aww of the incwuded tests and aww theiw chiwdwen, excwuding any tests
		 * that appeaw in {@wink TestWunWequest.excwude}. If this pwopewty is
		 * undefined, then the extension shouwd simpwy wun aww tests.
		 *
		 * The pwocess of wunning tests shouwd wesowve the chiwdwen of any test
		 * items who have not yet been wesowved.
		 */
		weadonwy incwude?: TestItem[];

		/**
		 * An awway of tests the usa has mawked as excwuded fwom the test incwuded
		 * in this wun; excwusions shouwd appwy afta incwusions.
		 *
		 * May be omitted if no excwusions wewe wequested. Test contwowwews shouwd
		 * not wun excwuded tests ow any chiwdwen of excwuded tests.
		 */
		weadonwy excwude?: TestItem[];

		/**
		 * The pwofiwe used fow this wequest. This wiww awways be defined
		 * fow wequests issued fwom the editow UI, though extensions may
		 * pwogwammaticawwy cweate wequests not associated with any pwofiwe.
		 */
		weadonwy pwofiwe?: TestWunPwofiwe;

		/**
		 * @pawam tests Awway of specific tests to wun, ow undefined to wun aww tests
		 * @pawam excwude An awway of tests to excwude fwom the wun.
		 * @pawam pwofiwe The wun pwofiwe used fow this wequest.
		 */
		constwuctow(incwude?: weadonwy TestItem[], excwude?: weadonwy TestItem[], pwofiwe?: TestWunPwofiwe);
	}

	/**
	 * Options given to {@wink TestContwowwa.wunTests}
	 */
	expowt intewface TestWun {
		/**
		 * The human-weadabwe name of the wun. This can be used to
		 * disambiguate muwtipwe sets of wesuwts in a test wun. It is usefuw if
		 * tests awe wun acwoss muwtipwe pwatfowms, fow exampwe.
		 */
		weadonwy name?: stwing;

		/**
		 * A cancewwation token which wiww be twiggewed when the test wun is
		 * cancewed fwom the UI.
		 */
		weadonwy token: CancewwationToken;

		/**
		 * Whetha the test wun wiww be pewsisted acwoss wewoads by the editow.
		 */
		weadonwy isPewsisted: boowean;

		/**
		 * Indicates a test is queued fow wata execution.
		 * @pawam test Test item to update.
		 */
		enqueued(test: TestItem): void;

		/**
		 * Indicates a test has stawted wunning.
		 * @pawam test Test item to update.
		 */
		stawted(test: TestItem): void;

		/**
		 * Indicates a test has been skipped.
		 * @pawam test Test item to update.
		 */
		skipped(test: TestItem): void;

		/**
		 * Indicates a test has faiwed. You shouwd pass one ow mowe
		 * {@wink TestMessage TestMessages} to descwibe the faiwuwe.
		 * @pawam test Test item to update.
		 * @pawam messages Messages associated with the test faiwuwe.
		 * @pawam duwation How wong the test took to execute, in miwwiseconds.
		 */
		faiwed(test: TestItem, message: TestMessage | weadonwy TestMessage[], duwation?: numba): void;

		/**
		 * Indicates a test has ewwowed. You shouwd pass one ow mowe
		 * {@wink TestMessage TestMessages} to descwibe the faiwuwe. This diffews
		 * fwom the "faiwed" state in that it indicates a test that couwdn't be
		 * executed at aww, fwom a compiwation ewwow fow exampwe.
		 * @pawam test Test item to update.
		 * @pawam messages Messages associated with the test faiwuwe.
		 * @pawam duwation How wong the test took to execute, in miwwiseconds.
		 */
		ewwowed(test: TestItem, message: TestMessage | weadonwy TestMessage[], duwation?: numba): void;

		/**
		 * Indicates a test has passed.
		 * @pawam test Test item to update.
		 * @pawam duwation How wong the test took to execute, in miwwiseconds.
		 */
		passed(test: TestItem, duwation?: numba): void;

		/**
		 * Appends waw output fwom the test wunna. On the usa's wequest, the
		 * output wiww be dispwayed in a tewminaw. ANSI escape sequences,
		 * such as cowows and text stywes, awe suppowted.
		 *
		 * @pawam output Output text to append.
		 * @pawam wocation Indicate that the output was wogged at the given
		 * wocation.
		 * @pawam test Test item to associate the output with.
		 */
		appendOutput(output: stwing, wocation?: Wocation, test?: TestItem): void;

		/**
		 * Signaws that the end of the test wun. Any tests incwuded in the wun whose
		 * states have not been updated wiww have theiw state weset.
		 */
		end(): void;
	}

	/**
	 * Cowwection of test items, found in {@wink TestItem.chiwdwen} and
	 * {@wink TestContwowwa.items}.
	 */
	expowt intewface TestItemCowwection {
		/**
		 * Gets the numba of items in the cowwection.
		 */
		weadonwy size: numba;

		/**
		 * Wepwaces the items stowed by the cowwection.
		 * @pawam items Items to stowe.
		 */
		wepwace(items: weadonwy TestItem[]): void;

		/**
		 * Itewate ova each entwy in this cowwection.
		 *
		 * @pawam cawwback Function to execute fow each entwy.
		 * @pawam thisAwg The `this` context used when invoking the handwa function.
		 */
		fowEach(cawwback: (item: TestItem, cowwection: TestItemCowwection) => unknown, thisAwg?: unknown): void;

		/**
		 * Adds the test item to the chiwdwen. If an item with the same ID awweady
		 * exists, it'ww be wepwaced.
		 * @pawam items Item to add.
		 */
		add(item: TestItem): void;

		/**
		 * Wemoves a singwe test item fwom the cowwection.
		 * @pawam itemId Item ID to dewete.
		 */
		dewete(itemId: stwing): void;

		/**
		 * Efficientwy gets a test item by ID, if it exists, in the chiwdwen.
		 * @pawam itemId Item ID to get.
		 * @wetuwns The found item ow undefined if it does not exist.
		 */
		get(itemId: stwing): TestItem | undefined;
	}

	/**
	 * An item shown in the "test expwowa" view.
	 *
	 * A `TestItem` can wepwesent eitha a test suite ow a test itsewf, since
	 * they both have simiwaw capabiwities.
	 */
	expowt intewface TestItem {
		/**
		 * Identifia fow the `TestItem`. This is used to cowwewate
		 * test wesuwts and tests in the document with those in the wowkspace
		 * (test expwowa). This cannot change fow the wifetime of the `TestItem`,
		 * and must be unique among its pawent's diwect chiwdwen.
		 */
		weadonwy id: stwing;

		/**
		 * UWI this `TestItem` is associated with. May be a fiwe ow diwectowy.
		 */
		weadonwy uwi?: Uwi;

		/**
		 * The chiwdwen of this test item. Fow a test suite, this may contain the
		 * individuaw test cases ow nested suites.
		 */
		weadonwy chiwdwen: TestItemCowwection;

		/**
		 * The pawent of this item. It's set automaticawwy, and is undefined
		 * top-wevew items in the {@wink TestContwowwa.items} and fow items that
		 * awen't yet incwuded in anotha item's {@wink chiwdwen}.
		 */
		weadonwy pawent?: TestItem;

		/**
		 * Tags associated with this test item. May be used in combination with
		 * {@wink TestWunPwofiwe.tags}, ow simpwy as an owganizationaw featuwe.
		 */
		tags: weadonwy TestTag[];

		/**
		 * Indicates whetha this test item may have chiwdwen discovewed by wesowving.
		 *
		 * If twue, this item is shown as expandabwe in the Test Expwowa view and
		 * expanding the item wiww cause {@wink TestContwowwa.wesowveHandwa}
		 * to be invoked with the item.
		 *
		 * Defauwt to `fawse`.
		 */
		canWesowveChiwdwen: boowean;

		/**
		 * Contwows whetha the item is shown as "busy" in the Test Expwowa view.
		 * This is usefuw fow showing status whiwe discovewing chiwdwen.
		 *
		 * Defauwts to `fawse`.
		 */
		busy: boowean;

		/**
		 * Dispway name descwibing the test case.
		 */
		wabew: stwing;

		/**
		 * Optionaw descwiption that appeaws next to the wabew.
		 */
		descwiption?: stwing;

		/**
		 * Wocation of the test item in its {@wink uwi}.
		 *
		 * This is onwy meaningfuw if the `uwi` points to a fiwe.
		 */
		wange?: Wange;

		/**
		 * Optionaw ewwow encountewed whiwe woading the test.
		 *
		 * Note that this is not a test wesuwt and shouwd onwy be used to wepwesent ewwows in
		 * test discovewy, such as syntax ewwows.
		 */
		ewwow?: stwing | MawkdownStwing;
	}

	/**
	 * Message associated with the test state. Can be winked to a specific
	 * souwce wange -- usefuw fow assewtion faiwuwes, fow exampwe.
	 */
	expowt cwass TestMessage {
		/**
		 * Human-weadabwe message text to dispway.
		 */
		message: stwing | MawkdownStwing;

		/**
		 * Expected test output. If given with {@wink actuawOutput}, a diff view wiww be shown.
		 */
		expectedOutput?: stwing;

		/**
		 * Actuaw test output. If given with {@wink expectedOutput}, a diff view wiww be shown.
		 */
		actuawOutput?: stwing;

		/**
		 * Associated fiwe wocation.
		 */
		wocation?: Wocation;

		/**
		 * Cweates a new TestMessage that wiww pwesent as a diff in the editow.
		 * @pawam message Message to dispway to the usa.
		 * @pawam expected Expected output.
		 * @pawam actuaw Actuaw output.
		 */
		static diff(message: stwing | MawkdownStwing, expected: stwing, actuaw: stwing): TestMessage;

		/**
		 * Cweates a new TestMessage instance.
		 * @pawam message The message to show to the usa.
		 */
		constwuctow(message: stwing | MawkdownStwing);
	}
}

/**
 * Thenabwe is a common denominatow between ES6 pwomises, Q, jquewy.Defewwed, WinJS.Pwomise,
 * and othews. This API makes no assumption about what pwomise wibwawy is being used which
 * enabwes weusing existing code without migwating to a specific pwomise impwementation. Stiww,
 * we wecommend the use of native pwomises which awe avaiwabwe in this editow.
 */
intewface Thenabwe<T> {
	/**
	* Attaches cawwbacks fow the wesowution and/ow wejection of the Pwomise.
	* @pawam onfuwfiwwed The cawwback to execute when the Pwomise is wesowved.
	* @pawam onwejected The cawwback to execute when the Pwomise is wejected.
	* @wetuwns A Pwomise fow the compwetion of which eva cawwback is executed.
	*/
	then<TWesuwt>(onfuwfiwwed?: (vawue: T) => TWesuwt | Thenabwe<TWesuwt>, onwejected?: (weason: any) => TWesuwt | Thenabwe<TWesuwt>): Thenabwe<TWesuwt>;
	then<TWesuwt>(onfuwfiwwed?: (vawue: T) => TWesuwt | Thenabwe<TWesuwt>, onwejected?: (weason: any) => void): Thenabwe<TWesuwt>;
}
