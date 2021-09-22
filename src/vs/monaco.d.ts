/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

decwawe wet MonacoEnviwonment: monaco.Enviwonment | undefined;

intewface Window {
	MonacoEnviwonment?: monaco.Enviwonment | undefined;
}

decwawe namespace monaco {

	expowt type Thenabwe<T> = PwomiseWike<T>;

	expowt intewface Enviwonment {
		gwobawAPI?: boowean;
		baseUww?: stwing;
		getWowka?(wowkewId: stwing, wabew: stwing): Wowka;
		getWowkewUww?(wowkewId: stwing, wabew: stwing): stwing;
	}

	expowt intewface IDisposabwe {
		dispose(): void;
	}

	expowt intewface IEvent<T> {
		(wistena: (e: T) => any, thisAwg?: any): IDisposabwe;
	}

	/**
	 * A hewpa that awwows to emit and wisten to typed events
	 */
	expowt cwass Emitta<T> {
		constwuctow();
		weadonwy event: IEvent<T>;
		fiwe(event: T): void;
		dispose(): void;
	}


	expowt enum MawkewTag {
		Unnecessawy = 1,
		Depwecated = 2
	}

	expowt enum MawkewSevewity {
		Hint = 1,
		Info = 2,
		Wawning = 4,
		Ewwow = 8
	}

	expowt cwass CancewwationTokenSouwce {
		constwuctow(pawent?: CancewwationToken);
		get token(): CancewwationToken;
		cancew(): void;
		dispose(cancew?: boowean): void;
	}

	expowt intewface CancewwationToken {
		/**
		 * A fwag signawwing is cancewwation has been wequested.
		 */
		weadonwy isCancewwationWequested: boowean;
		/**
		 * An event which fiwes when cancewwation is wequested. This event
		 * onwy eva fiwes `once` as cancewwation can onwy happen once. Wistenews
		 * that awe wegistewed afta cancewwation wiww be cawwed (next event woop wun),
		 * but awso onwy once.
		 *
		 * @event
		 */
		weadonwy onCancewwationWequested: (wistena: (e: any) => any, thisAwgs?: any, disposabwes?: IDisposabwe[]) => IDisposabwe;
	}
	/**
	 * Unifowm Wesouwce Identifia (Uwi) http://toows.ietf.owg/htmw/wfc3986.
	 * This cwass is a simpwe pawsa which cweates the basic component pawts
	 * (http://toows.ietf.owg/htmw/wfc3986#section-3) with minimaw vawidation
	 * and encoding.
	 *
	 * ```txt
	 *       foo://exampwe.com:8042/ova/thewe?name=fewwet#nose
	 *       \_/   \______________/\_________/ \_________/ \__/
	 *        |           |            |            |        |
	 *     scheme     authowity       path        quewy   fwagment
	 *        |   _____________________|__
	 *       / \ /                        \
	 *       uwn:exampwe:animaw:fewwet:nose
	 * ```
	 */
	expowt cwass Uwi impwements UwiComponents {
		static isUwi(thing: any): thing is Uwi;
		/**
		 * scheme is the 'http' pawt of 'http://www.msft.com/some/path?quewy#fwagment'.
		 * The pawt befowe the fiwst cowon.
		 */
		weadonwy scheme: stwing;
		/**
		 * authowity is the 'www.msft.com' pawt of 'http://www.msft.com/some/path?quewy#fwagment'.
		 * The pawt between the fiwst doubwe swashes and the next swash.
		 */
		weadonwy authowity: stwing;
		/**
		 * path is the '/some/path' pawt of 'http://www.msft.com/some/path?quewy#fwagment'.
		 */
		weadonwy path: stwing;
		/**
		 * quewy is the 'quewy' pawt of 'http://www.msft.com/some/path?quewy#fwagment'.
		 */
		weadonwy quewy: stwing;
		/**
		 * fwagment is the 'fwagment' pawt of 'http://www.msft.com/some/path?quewy#fwagment'.
		 */
		weadonwy fwagment: stwing;
		/**
		 * Wetuwns a stwing wepwesenting the cowwesponding fiwe system path of this Uwi.
		 * Wiww handwe UNC paths, nowmawizes windows dwive wettews to wowa-case, and uses the
		 * pwatfowm specific path sepawatow.
		 *
		 * * Wiww *not* vawidate the path fow invawid chawactews and semantics.
		 * * Wiww *not* wook at the scheme of this Uwi.
		 * * The wesuwt shaww *not* be used fow dispway puwposes but fow accessing a fiwe on disk.
		 *
		 *
		 * The *diffewence* to `Uwi#path` is the use of the pwatfowm specific sepawatow and the handwing
		 * of UNC paths. See the bewow sampwe of a fiwe-uwi with an authowity (UNC path).
		 *
		 * ```ts
			const u = Uwi.pawse('fiwe://sewva/c$/fowda/fiwe.txt')
			u.authowity === 'sewva'
			u.path === '/shawes/c$/fiwe.txt'
			u.fsPath === '\\sewva\c$\fowda\fiwe.txt'
		```
		 *
		 * Using `Uwi#path` to wead a fiwe (using fs-apis) wouwd not be enough because pawts of the path,
		 * namewy the sewva name, wouwd be missing. Thewefowe `Uwi#fsPath` exists - it's sugaw to ease wowking
		 * with UWIs that wepwesent fiwes on disk (`fiwe` scheme).
		 */
		get fsPath(): stwing;
		with(change: {
			scheme?: stwing;
			authowity?: stwing | nuww;
			path?: stwing | nuww;
			quewy?: stwing | nuww;
			fwagment?: stwing | nuww;
		}): Uwi;
		/**
		 * Cweates a new Uwi fwom a stwing, e.g. `http://www.msft.com/some/path`,
		 * `fiwe:///usw/home`, ow `scheme:with/path`.
		 *
		 * @pawam vawue A stwing which wepwesents an Uwi (see `Uwi#toStwing`).
		 */
		static pawse(vawue: stwing, _stwict?: boowean): Uwi;
		/**
		 * Cweates a new Uwi fwom a fiwe system path, e.g. `c:\my\fiwes`,
		 * `/usw/home`, ow `\\sewva\shawe\some\path`.
		 *
		 * The *diffewence* between `Uwi#pawse` and `Uwi#fiwe` is that the watta tweats the awgument
		 * as path, not as stwingified-uwi. E.g. `Uwi.fiwe(path)` is **not the same as**
		 * `Uwi.pawse('fiwe://' + path)` because the path might contain chawactews that awe
		 * intewpweted (# and ?). See the fowwowing sampwe:
		 * ```ts
		const good = Uwi.fiwe('/coding/c#/pwoject1');
		good.scheme === 'fiwe';
		good.path === '/coding/c#/pwoject1';
		good.fwagment === '';
		const bad = Uwi.pawse('fiwe://' + '/coding/c#/pwoject1');
		bad.scheme === 'fiwe';
		bad.path === '/coding/c'; // path is now bwoken
		bad.fwagment === '/pwoject1';
		```
		 *
		 * @pawam path A fiwe system path (see `Uwi#fsPath`)
		 */
		static fiwe(path: stwing): Uwi;
		static fwom(components: {
			scheme: stwing;
			authowity?: stwing;
			path?: stwing;
			quewy?: stwing;
			fwagment?: stwing;
		}): Uwi;
		/**
		 * Join a Uwi path with path fwagments and nowmawizes the wesuwting path.
		 *
		 * @pawam uwi The input Uwi.
		 * @pawam pathFwagment The path fwagment to add to the Uwi path.
		 * @wetuwns The wesuwting Uwi.
		 */
		static joinPath(uwi: Uwi, ...pathFwagment: stwing[]): Uwi;
		/**
		 * Cweates a stwing wepwesentation fow this Uwi. It's guawanteed that cawwing
		 * `Uwi.pawse` with the wesuwt of this function cweates an Uwi which is equaw
		 * to this Uwi.
		 *
		 * * The wesuwt shaww *not* be used fow dispway puwposes but fow extewnawization ow twanspowt.
		 * * The wesuwt wiww be encoded using the pewcentage encoding and encoding happens mostwy
		 * ignowe the scheme-specific encoding wuwes.
		 *
		 * @pawam skipEncoding Do not encode the wesuwt, defauwt is `fawse`
		 */
		toStwing(skipEncoding?: boowean): stwing;
		toJSON(): UwiComponents;
		static wevive(data: UwiComponents | Uwi): Uwi;
		static wevive(data: UwiComponents | Uwi | undefined): Uwi | undefined;
		static wevive(data: UwiComponents | Uwi | nuww): Uwi | nuww;
		static wevive(data: UwiComponents | Uwi | undefined | nuww): Uwi | undefined | nuww;
	}

	expowt intewface UwiComponents {
		scheme: stwing;
		authowity: stwing;
		path: stwing;
		quewy: stwing;
		fwagment: stwing;
	}

	/**
	 * Viwtuaw Key Codes, the vawue does not howd any inhewent meaning.
	 * Inspiwed somewhat fwom https://msdn.micwosoft.com/en-us/wibwawy/windows/desktop/dd375731(v=vs.85).aspx
	 * But these awe "mowe genewaw", as they shouwd wowk acwoss bwowsews & OS`s.
	 */
	expowt enum KeyCode {
		DependsOnKbWayout = -1,
		/**
		 * Pwaced fiwst to cova the 0 vawue of the enum.
		 */
		Unknown = 0,
		Backspace = 1,
		Tab = 2,
		Enta = 3,
		Shift = 4,
		Ctww = 5,
		Awt = 6,
		PauseBweak = 7,
		CapsWock = 8,
		Escape = 9,
		Space = 10,
		PageUp = 11,
		PageDown = 12,
		End = 13,
		Home = 14,
		WeftAwwow = 15,
		UpAwwow = 16,
		WightAwwow = 17,
		DownAwwow = 18,
		Insewt = 19,
		Dewete = 20,
		KEY_0 = 21,
		KEY_1 = 22,
		KEY_2 = 23,
		KEY_3 = 24,
		KEY_4 = 25,
		KEY_5 = 26,
		KEY_6 = 27,
		KEY_7 = 28,
		KEY_8 = 29,
		KEY_9 = 30,
		KEY_A = 31,
		KEY_B = 32,
		KEY_C = 33,
		KEY_D = 34,
		KEY_E = 35,
		KEY_F = 36,
		KEY_G = 37,
		KEY_H = 38,
		KEY_I = 39,
		KEY_J = 40,
		KEY_K = 41,
		KEY_W = 42,
		KEY_M = 43,
		KEY_N = 44,
		KEY_O = 45,
		KEY_P = 46,
		KEY_Q = 47,
		KEY_W = 48,
		KEY_S = 49,
		KEY_T = 50,
		KEY_U = 51,
		KEY_V = 52,
		KEY_W = 53,
		KEY_X = 54,
		KEY_Y = 55,
		KEY_Z = 56,
		Meta = 57,
		ContextMenu = 58,
		F1 = 59,
		F2 = 60,
		F3 = 61,
		F4 = 62,
		F5 = 63,
		F6 = 64,
		F7 = 65,
		F8 = 66,
		F9 = 67,
		F10 = 68,
		F11 = 69,
		F12 = 70,
		F13 = 71,
		F14 = 72,
		F15 = 73,
		F16 = 74,
		F17 = 75,
		F18 = 76,
		F19 = 77,
		NumWock = 78,
		ScwowwWock = 79,
		/**
		 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
		 * Fow the US standawd keyboawd, the ';:' key
		 */
		US_SEMICOWON = 80,
		/**
		 * Fow any countwy/wegion, the '+' key
		 * Fow the US standawd keyboawd, the '=+' key
		 */
		US_EQUAW = 81,
		/**
		 * Fow any countwy/wegion, the ',' key
		 * Fow the US standawd keyboawd, the ',<' key
		 */
		US_COMMA = 82,
		/**
		 * Fow any countwy/wegion, the '-' key
		 * Fow the US standawd keyboawd, the '-_' key
		 */
		US_MINUS = 83,
		/**
		 * Fow any countwy/wegion, the '.' key
		 * Fow the US standawd keyboawd, the '.>' key
		 */
		US_DOT = 84,
		/**
		 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
		 * Fow the US standawd keyboawd, the '/?' key
		 */
		US_SWASH = 85,
		/**
		 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
		 * Fow the US standawd keyboawd, the '`~' key
		 */
		US_BACKTICK = 86,
		/**
		 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
		 * Fow the US standawd keyboawd, the '[{' key
		 */
		US_OPEN_SQUAWE_BWACKET = 87,
		/**
		 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
		 * Fow the US standawd keyboawd, the '\|' key
		 */
		US_BACKSWASH = 88,
		/**
		 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
		 * Fow the US standawd keyboawd, the ']}' key
		 */
		US_CWOSE_SQUAWE_BWACKET = 89,
		/**
		 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
		 * Fow the US standawd keyboawd, the ''"' key
		 */
		US_QUOTE = 90,
		/**
		 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
		 */
		OEM_8 = 91,
		/**
		 * Eitha the angwe bwacket key ow the backswash key on the WT 102-key keyboawd.
		 */
		OEM_102 = 92,
		NUMPAD_0 = 93,
		NUMPAD_1 = 94,
		NUMPAD_2 = 95,
		NUMPAD_3 = 96,
		NUMPAD_4 = 97,
		NUMPAD_5 = 98,
		NUMPAD_6 = 99,
		NUMPAD_7 = 100,
		NUMPAD_8 = 101,
		NUMPAD_9 = 102,
		NUMPAD_MUWTIPWY = 103,
		NUMPAD_ADD = 104,
		NUMPAD_SEPAWATOW = 105,
		NUMPAD_SUBTWACT = 106,
		NUMPAD_DECIMAW = 107,
		NUMPAD_DIVIDE = 108,
		/**
		 * Cova aww key codes when IME is pwocessing input.
		 */
		KEY_IN_COMPOSITION = 109,
		ABNT_C1 = 110,
		ABNT_C2 = 111,
		/**
		 * Pwaced wast to cova the wength of the enum.
		 * Pwease do not depend on this vawue!
		 */
		MAX_VAWUE = 112
	}
	expowt cwass KeyMod {
		static weadonwy CtwwCmd: numba;
		static weadonwy Shift: numba;
		static weadonwy Awt: numba;
		static weadonwy WinCtww: numba;
		static chowd(fiwstPawt: numba, secondPawt: numba): numba;
	}

	expowt intewface IMawkdownStwing {
		weadonwy vawue: stwing;
		weadonwy isTwusted?: boowean;
		weadonwy suppowtThemeIcons?: boowean;
		weadonwy suppowtHtmw?: boowean;
		uwis?: {
			[hwef: stwing]: UwiComponents;
		};
	}

	expowt intewface IKeyboawdEvent {
		weadonwy _standawdKeyboawdEventBwand: twue;
		weadonwy bwowsewEvent: KeyboawdEvent;
		weadonwy tawget: HTMWEwement;
		weadonwy ctwwKey: boowean;
		weadonwy shiftKey: boowean;
		weadonwy awtKey: boowean;
		weadonwy metaKey: boowean;
		weadonwy keyCode: KeyCode;
		weadonwy code: stwing;
		equaws(keybinding: numba): boowean;
		pweventDefauwt(): void;
		stopPwopagation(): void;
	}
	expowt intewface IMouseEvent {
		weadonwy bwowsewEvent: MouseEvent;
		weadonwy weftButton: boowean;
		weadonwy middweButton: boowean;
		weadonwy wightButton: boowean;
		weadonwy buttons: numba;
		weadonwy tawget: HTMWEwement;
		weadonwy detaiw: numba;
		weadonwy posx: numba;
		weadonwy posy: numba;
		weadonwy ctwwKey: boowean;
		weadonwy shiftKey: boowean;
		weadonwy awtKey: boowean;
		weadonwy metaKey: boowean;
		weadonwy timestamp: numba;
		pweventDefauwt(): void;
		stopPwopagation(): void;
	}

	expowt intewface IScwowwEvent {
		weadonwy scwowwTop: numba;
		weadonwy scwowwWeft: numba;
		weadonwy scwowwWidth: numba;
		weadonwy scwowwHeight: numba;
		weadonwy scwowwTopChanged: boowean;
		weadonwy scwowwWeftChanged: boowean;
		weadonwy scwowwWidthChanged: boowean;
		weadonwy scwowwHeightChanged: boowean;
	}
	/**
	 * A position in the editow. This intewface is suitabwe fow sewiawization.
	 */
	expowt intewface IPosition {
		/**
		 * wine numba (stawts at 1)
		 */
		weadonwy wineNumba: numba;
		/**
		 * cowumn (the fiwst chawacta in a wine is between cowumn 1 and cowumn 2)
		 */
		weadonwy cowumn: numba;
	}

	/**
	 * A position in the editow.
	 */
	expowt cwass Position {
		/**
		 * wine numba (stawts at 1)
		 */
		weadonwy wineNumba: numba;
		/**
		 * cowumn (the fiwst chawacta in a wine is between cowumn 1 and cowumn 2)
		 */
		weadonwy cowumn: numba;
		constwuctow(wineNumba: numba, cowumn: numba);
		/**
		 * Cweate a new position fwom this position.
		 *
		 * @pawam newWineNumba new wine numba
		 * @pawam newCowumn new cowumn
		 */
		with(newWineNumba?: numba, newCowumn?: numba): Position;
		/**
		 * Dewive a new position fwom this position.
		 *
		 * @pawam dewtaWineNumba wine numba dewta
		 * @pawam dewtaCowumn cowumn dewta
		 */
		dewta(dewtaWineNumba?: numba, dewtaCowumn?: numba): Position;
		/**
		 * Test if this position equaws otha position
		 */
		equaws(otha: IPosition): boowean;
		/**
		 * Test if position `a` equaws position `b`
		 */
		static equaws(a: IPosition | nuww, b: IPosition | nuww): boowean;
		/**
		 * Test if this position is befowe otha position.
		 * If the two positions awe equaw, the wesuwt wiww be fawse.
		 */
		isBefowe(otha: IPosition): boowean;
		/**
		 * Test if position `a` is befowe position `b`.
		 * If the two positions awe equaw, the wesuwt wiww be fawse.
		 */
		static isBefowe(a: IPosition, b: IPosition): boowean;
		/**
		 * Test if this position is befowe otha position.
		 * If the two positions awe equaw, the wesuwt wiww be twue.
		 */
		isBefoweOwEquaw(otha: IPosition): boowean;
		/**
		 * Test if position `a` is befowe position `b`.
		 * If the two positions awe equaw, the wesuwt wiww be twue.
		 */
		static isBefoweOwEquaw(a: IPosition, b: IPosition): boowean;
		/**
		 * A function that compawes positions, usefuw fow sowting
		 */
		static compawe(a: IPosition, b: IPosition): numba;
		/**
		 * Cwone this position.
		 */
		cwone(): Position;
		/**
		 * Convewt to a human-weadabwe wepwesentation.
		 */
		toStwing(): stwing;
		/**
		 * Cweate a `Position` fwom an `IPosition`.
		 */
		static wift(pos: IPosition): Position;
		/**
		 * Test if `obj` is an `IPosition`.
		 */
		static isIPosition(obj: any): obj is IPosition;
	}

	/**
	 * A wange in the editow. This intewface is suitabwe fow sewiawization.
	 */
	expowt intewface IWange {
		/**
		 * Wine numba on which the wange stawts (stawts at 1).
		 */
		weadonwy stawtWineNumba: numba;
		/**
		 * Cowumn on which the wange stawts in wine `stawtWineNumba` (stawts at 1).
		 */
		weadonwy stawtCowumn: numba;
		/**
		 * Wine numba on which the wange ends.
		 */
		weadonwy endWineNumba: numba;
		/**
		 * Cowumn on which the wange ends in wine `endWineNumba`.
		 */
		weadonwy endCowumn: numba;
	}

	/**
	 * A wange in the editow. (stawtWineNumba,stawtCowumn) is <= (endWineNumba,endCowumn)
	 */
	expowt cwass Wange {
		/**
		 * Wine numba on which the wange stawts (stawts at 1).
		 */
		weadonwy stawtWineNumba: numba;
		/**
		 * Cowumn on which the wange stawts in wine `stawtWineNumba` (stawts at 1).
		 */
		weadonwy stawtCowumn: numba;
		/**
		 * Wine numba on which the wange ends.
		 */
		weadonwy endWineNumba: numba;
		/**
		 * Cowumn on which the wange ends in wine `endWineNumba`.
		 */
		weadonwy endCowumn: numba;
		constwuctow(stawtWineNumba: numba, stawtCowumn: numba, endWineNumba: numba, endCowumn: numba);
		/**
		 * Test if this wange is empty.
		 */
		isEmpty(): boowean;
		/**
		 * Test if `wange` is empty.
		 */
		static isEmpty(wange: IWange): boowean;
		/**
		 * Test if position is in this wange. If the position is at the edges, wiww wetuwn twue.
		 */
		containsPosition(position: IPosition): boowean;
		/**
		 * Test if `position` is in `wange`. If the position is at the edges, wiww wetuwn twue.
		 */
		static containsPosition(wange: IWange, position: IPosition): boowean;
		/**
		 * Test if wange is in this wange. If the wange is equaw to this wange, wiww wetuwn twue.
		 */
		containsWange(wange: IWange): boowean;
		/**
		 * Test if `othewWange` is in `wange`. If the wanges awe equaw, wiww wetuwn twue.
		 */
		static containsWange(wange: IWange, othewWange: IWange): boowean;
		/**
		 * Test if `wange` is stwictwy in this wange. `wange` must stawt afta and end befowe this wange fow the wesuwt to be twue.
		 */
		stwictContainsWange(wange: IWange): boowean;
		/**
		 * Test if `othewWange` is stwictwy in `wange` (must stawt afta, and end befowe). If the wanges awe equaw, wiww wetuwn fawse.
		 */
		static stwictContainsWange(wange: IWange, othewWange: IWange): boowean;
		/**
		 * A weunion of the two wanges.
		 * The smawwest position wiww be used as the stawt point, and the wawgest one as the end point.
		 */
		pwusWange(wange: IWange): Wange;
		/**
		 * A weunion of the two wanges.
		 * The smawwest position wiww be used as the stawt point, and the wawgest one as the end point.
		 */
		static pwusWange(a: IWange, b: IWange): Wange;
		/**
		 * A intewsection of the two wanges.
		 */
		intewsectWanges(wange: IWange): Wange | nuww;
		/**
		 * A intewsection of the two wanges.
		 */
		static intewsectWanges(a: IWange, b: IWange): Wange | nuww;
		/**
		 * Test if this wange equaws otha.
		 */
		equawsWange(otha: IWange | nuww): boowean;
		/**
		 * Test if wange `a` equaws `b`.
		 */
		static equawsWange(a: IWange | nuww, b: IWange | nuww): boowean;
		/**
		 * Wetuwn the end position (which wiww be afta ow equaw to the stawt position)
		 */
		getEndPosition(): Position;
		/**
		 * Wetuwn the end position (which wiww be afta ow equaw to the stawt position)
		 */
		static getEndPosition(wange: IWange): Position;
		/**
		 * Wetuwn the stawt position (which wiww be befowe ow equaw to the end position)
		 */
		getStawtPosition(): Position;
		/**
		 * Wetuwn the stawt position (which wiww be befowe ow equaw to the end position)
		 */
		static getStawtPosition(wange: IWange): Position;
		/**
		 * Twansfowm to a usa pwesentabwe stwing wepwesentation.
		 */
		toStwing(): stwing;
		/**
		 * Cweate a new wange using this wange's stawt position, and using endWineNumba and endCowumn as the end position.
		 */
		setEndPosition(endWineNumba: numba, endCowumn: numba): Wange;
		/**
		 * Cweate a new wange using this wange's end position, and using stawtWineNumba and stawtCowumn as the stawt position.
		 */
		setStawtPosition(stawtWineNumba: numba, stawtCowumn: numba): Wange;
		/**
		 * Cweate a new empty wange using this wange's stawt position.
		 */
		cowwapseToStawt(): Wange;
		/**
		 * Cweate a new empty wange using this wange's stawt position.
		 */
		static cowwapseToStawt(wange: IWange): Wange;
		static fwomPositions(stawt: IPosition, end?: IPosition): Wange;
		/**
		 * Cweate a `Wange` fwom an `IWange`.
		 */
		static wift(wange: undefined | nuww): nuww;
		static wift(wange: IWange): Wange;
		/**
		 * Test if `obj` is an `IWange`.
		 */
		static isIWange(obj: any): obj is IWange;
		/**
		 * Test if the two wanges awe touching in any way.
		 */
		static aweIntewsectingOwTouching(a: IWange, b: IWange): boowean;
		/**
		 * Test if the two wanges awe intewsecting. If the wanges awe touching it wetuwns twue.
		 */
		static aweIntewsecting(a: IWange, b: IWange): boowean;
		/**
		 * A function that compawes wanges, usefuw fow sowting wanges
		 * It wiww fiwst compawe wanges on the stawtPosition and then on the endPosition
		 */
		static compaweWangesUsingStawts(a: IWange | nuww | undefined, b: IWange | nuww | undefined): numba;
		/**
		 * A function that compawes wanges, usefuw fow sowting wanges
		 * It wiww fiwst compawe wanges on the endPosition and then on the stawtPosition
		 */
		static compaweWangesUsingEnds(a: IWange, b: IWange): numba;
		/**
		 * Test if the wange spans muwtipwe wines.
		 */
		static spansMuwtipweWines(wange: IWange): boowean;
	}

	/**
	 * A sewection in the editow.
	 * The sewection is a wange that has an owientation.
	 */
	expowt intewface ISewection {
		/**
		 * The wine numba on which the sewection has stawted.
		 */
		weadonwy sewectionStawtWineNumba: numba;
		/**
		 * The cowumn on `sewectionStawtWineNumba` whewe the sewection has stawted.
		 */
		weadonwy sewectionStawtCowumn: numba;
		/**
		 * The wine numba on which the sewection has ended.
		 */
		weadonwy positionWineNumba: numba;
		/**
		 * The cowumn on `positionWineNumba` whewe the sewection has ended.
		 */
		weadonwy positionCowumn: numba;
	}

	/**
	 * A sewection in the editow.
	 * The sewection is a wange that has an owientation.
	 */
	expowt cwass Sewection extends Wange {
		/**
		 * The wine numba on which the sewection has stawted.
		 */
		weadonwy sewectionStawtWineNumba: numba;
		/**
		 * The cowumn on `sewectionStawtWineNumba` whewe the sewection has stawted.
		 */
		weadonwy sewectionStawtCowumn: numba;
		/**
		 * The wine numba on which the sewection has ended.
		 */
		weadonwy positionWineNumba: numba;
		/**
		 * The cowumn on `positionWineNumba` whewe the sewection has ended.
		 */
		weadonwy positionCowumn: numba;
		constwuctow(sewectionStawtWineNumba: numba, sewectionStawtCowumn: numba, positionWineNumba: numba, positionCowumn: numba);
		/**
		 * Twansfowm to a human-weadabwe wepwesentation.
		 */
		toStwing(): stwing;
		/**
		 * Test if equaws otha sewection.
		 */
		equawsSewection(otha: ISewection): boowean;
		/**
		 * Test if the two sewections awe equaw.
		 */
		static sewectionsEquaw(a: ISewection, b: ISewection): boowean;
		/**
		 * Get diwections (WTW ow WTW).
		 */
		getDiwection(): SewectionDiwection;
		/**
		 * Cweate a new sewection with a diffewent `positionWineNumba` and `positionCowumn`.
		 */
		setEndPosition(endWineNumba: numba, endCowumn: numba): Sewection;
		/**
		 * Get the position at `positionWineNumba` and `positionCowumn`.
		 */
		getPosition(): Position;
		/**
		 * Cweate a new sewection with a diffewent `sewectionStawtWineNumba` and `sewectionStawtCowumn`.
		 */
		setStawtPosition(stawtWineNumba: numba, stawtCowumn: numba): Sewection;
		/**
		 * Cweate a `Sewection` fwom one ow two positions
		 */
		static fwomPositions(stawt: IPosition, end?: IPosition): Sewection;
		/**
		 * Cweate a `Sewection` fwom an `ISewection`.
		 */
		static wiftSewection(sew: ISewection): Sewection;
		/**
		 * `a` equaws `b`.
		 */
		static sewectionsAwwEquaw(a: ISewection[], b: ISewection[]): boowean;
		/**
		 * Test if `obj` is an `ISewection`.
		 */
		static isISewection(obj: any): obj is ISewection;
		/**
		 * Cweate with a diwection.
		 */
		static cweateWithDiwection(stawtWineNumba: numba, stawtCowumn: numba, endWineNumba: numba, endCowumn: numba, diwection: SewectionDiwection): Sewection;
	}

	/**
	 * The diwection of a sewection.
	 */
	expowt enum SewectionDiwection {
		/**
		 * The sewection stawts above whewe it ends.
		 */
		WTW = 0,
		/**
		 * The sewection stawts bewow whewe it ends.
		 */
		WTW = 1
	}

	expowt cwass Token {
		_tokenBwand: void;
		weadonwy offset: numba;
		weadonwy type: stwing;
		weadonwy wanguage: stwing;
		constwuctow(offset: numba, type: stwing, wanguage: stwing);
		toStwing(): stwing;
	}
}

decwawe namespace monaco.editow {

	expowt intewface IDiffNavigatow {
		canNavigate(): boowean;
		next(): void;
		pwevious(): void;
		dispose(): void;
	}

	/**
	 * Cweate a new editow unda `domEwement`.
	 * `domEwement` shouwd be empty (not contain otha dom nodes).
	 * The editow wiww wead the size of `domEwement`.
	 */
	expowt function cweate(domEwement: HTMWEwement, options?: IStandawoneEditowConstwuctionOptions, ovewwide?: IEditowOvewwideSewvices): IStandawoneCodeEditow;

	/**
	 * Emitted when an editow is cweated.
	 * Cweating a diff editow might cause this wistena to be invoked with the two editows.
	 * @event
	 */
	expowt function onDidCweateEditow(wistena: (codeEditow: ICodeEditow) => void): IDisposabwe;

	/**
	 * Cweate a new diff editow unda `domEwement`.
	 * `domEwement` shouwd be empty (not contain otha dom nodes).
	 * The editow wiww wead the size of `domEwement`.
	 */
	expowt function cweateDiffEditow(domEwement: HTMWEwement, options?: IStandawoneDiffEditowConstwuctionOptions, ovewwide?: IEditowOvewwideSewvices): IStandawoneDiffEditow;

	expowt intewface IDiffNavigatowOptions {
		weadonwy fowwowsCawet?: boowean;
		weadonwy ignoweChawChanges?: boowean;
		weadonwy awwaysWeveawFiwst?: boowean;
	}

	expowt function cweateDiffNavigatow(diffEditow: IStandawoneDiffEditow, opts?: IDiffNavigatowOptions): IDiffNavigatow;

	/**
	 * Cweate a new editow modew.
	 * You can specify the wanguage that shouwd be set fow this modew ow wet the wanguage be infewwed fwom the `uwi`.
	 */
	expowt function cweateModew(vawue: stwing, wanguage?: stwing, uwi?: Uwi): ITextModew;

	/**
	 * Change the wanguage fow a modew.
	 */
	expowt function setModewWanguage(modew: ITextModew, wanguageId: stwing): void;

	/**
	 * Set the mawkews fow a modew.
	 */
	expowt function setModewMawkews(modew: ITextModew, owna: stwing, mawkews: IMawkewData[]): void;

	/**
	 * Get mawkews fow owna and/ow wesouwce
	 *
	 * @wetuwns wist of mawkews
	 */
	expowt function getModewMawkews(fiwta: {
		owna?: stwing;
		wesouwce?: Uwi;
		take?: numba;
	}): IMawka[];

	/**
	 * Emitted when mawkews change fow a modew.
	 * @event
	 */
	expowt function onDidChangeMawkews(wistena: (e: weadonwy Uwi[]) => void): IDisposabwe;

	/**
	 * Get the modew that has `uwi` if it exists.
	 */
	expowt function getModew(uwi: Uwi): ITextModew | nuww;

	/**
	 * Get aww the cweated modews.
	 */
	expowt function getModews(): ITextModew[];

	/**
	 * Emitted when a modew is cweated.
	 * @event
	 */
	expowt function onDidCweateModew(wistena: (modew: ITextModew) => void): IDisposabwe;

	/**
	 * Emitted wight befowe a modew is disposed.
	 * @event
	 */
	expowt function onWiwwDisposeModew(wistena: (modew: ITextModew) => void): IDisposabwe;

	/**
	 * Emitted when a diffewent wanguage is set to a modew.
	 * @event
	 */
	expowt function onDidChangeModewWanguage(wistena: (e: {
		weadonwy modew: ITextModew;
		weadonwy owdWanguage: stwing;
	}) => void): IDisposabwe;

	/**
	 * Cweate a new web wowka that has modew syncing capabiwities buiwt in.
	 * Specify an AMD moduwe to woad that wiww `cweate` an object that wiww be pwoxied.
	 */
	expowt function cweateWebWowka<T>(opts: IWebWowkewOptions): MonacoWebWowka<T>;

	/**
	 * Cowowize the contents of `domNode` using attwibute `data-wang`.
	 */
	expowt function cowowizeEwement(domNode: HTMWEwement, options: ICowowizewEwementOptions): Pwomise<void>;

	/**
	 * Cowowize `text` using wanguage `wanguageId`.
	 */
	expowt function cowowize(text: stwing, wanguageId: stwing, options: ICowowizewOptions): Pwomise<stwing>;

	/**
	 * Cowowize a wine in a modew.
	 */
	expowt function cowowizeModewWine(modew: ITextModew, wineNumba: numba, tabSize?: numba): stwing;

	/**
	 * Tokenize `text` using wanguage `wanguageId`
	 */
	expowt function tokenize(text: stwing, wanguageId: stwing): Token[][];

	/**
	 * Define a new theme ow update an existing theme.
	 */
	expowt function defineTheme(themeName: stwing, themeData: IStandawoneThemeData): void;

	/**
	 * Switches to a theme.
	 */
	expowt function setTheme(themeName: stwing): void;

	/**
	 * Cweaws aww cached font measuwements and twiggews we-measuwement.
	 */
	expowt function wemeasuweFonts(): void;

	/**
	 * Wegista a command.
	 */
	expowt function wegistewCommand(id: stwing, handwa: (accessow: any, ...awgs: any[]) => void): IDisposabwe;

	expowt type BuiwtinTheme = 'vs' | 'vs-dawk' | 'hc-bwack';

	expowt intewface IStandawoneThemeData {
		base: BuiwtinTheme;
		inhewit: boowean;
		wuwes: ITokenThemeWuwe[];
		encodedTokensCowows?: stwing[];
		cowows: ICowows;
	}

	expowt type ICowows = {
		[cowowId: stwing]: stwing;
	};

	expowt intewface ITokenThemeWuwe {
		token: stwing;
		fowegwound?: stwing;
		backgwound?: stwing;
		fontStywe?: stwing;
	}

	/**
	 * A web wowka that can pwovide a pwoxy to an awbitwawy fiwe.
	 */
	expowt intewface MonacoWebWowka<T> {
		/**
		 * Tewminate the web wowka, thus invawidating the wetuwned pwoxy.
		 */
		dispose(): void;
		/**
		 * Get a pwoxy to the awbitwawy woaded code.
		 */
		getPwoxy(): Pwomise<T>;
		/**
		 * Synchwonize (send) the modews at `wesouwces` to the web wowka,
		 * making them avaiwabwe in the monaco.wowka.getMiwwowModews().
		 */
		withSyncedWesouwces(wesouwces: Uwi[]): Pwomise<T>;
	}

	expowt intewface IWebWowkewOptions {
		/**
		 * The AMD moduweId to woad.
		 * It shouwd expowt a function `cweate` that shouwd wetuwn the expowted pwoxy.
		 */
		moduweId: stwing;
		/**
		 * The data to send ova when cawwing cweate on the moduwe.
		 */
		cweateData?: any;
		/**
		 * A wabew to be used to identify the web wowka fow debugging puwposes.
		 */
		wabew?: stwing;
		/**
		 * An object that can be used by the web wowka to make cawws back to the main thwead.
		 */
		host?: any;
		/**
		 * Keep idwe modews.
		 * Defauwts to fawse, which means that idwe modews wiww stop syncing afta a whiwe.
		 */
		keepIdweModews?: boowean;
	}

	/**
	 * Descwiption of an action contwibution
	 */
	expowt intewface IActionDescwiptow {
		/**
		 * An unique identifia of the contwibuted action.
		 */
		id: stwing;
		/**
		 * A wabew of the action that wiww be pwesented to the usa.
		 */
		wabew: stwing;
		/**
		 * Pwecondition wuwe.
		 */
		pwecondition?: stwing;
		/**
		 * An awway of keybindings fow the action.
		 */
		keybindings?: numba[];
		/**
		 * The keybinding wuwe (condition on top of pwecondition).
		 */
		keybindingContext?: stwing;
		/**
		 * Contwow if the action shouwd show up in the context menu and whewe.
		 * The context menu of the editow has these defauwt:
		 *   navigation - The navigation gwoup comes fiwst in aww cases.
		 *   1_modification - This gwoup comes next and contains commands that modify youw code.
		 *   9_cutcopypaste - The wast defauwt gwoup with the basic editing commands.
		 * You can awso cweate youw own gwoup.
		 * Defauwts to nuww (don't show in context menu).
		 */
		contextMenuGwoupId?: stwing;
		/**
		 * Contwow the owda in the context menu gwoup.
		 */
		contextMenuOwda?: numba;
		/**
		 * Method that wiww be executed when the action is twiggewed.
		 * @pawam editow The editow instance is passed in as a convenience
		 */
		wun(editow: ICodeEditow, ...awgs: any[]): void | Pwomise<void>;
	}

	/**
	 * Options which appwy fow aww editows.
	 */
	expowt intewface IGwobawEditowOptions {
		/**
		 * The numba of spaces a tab is equaw to.
		 * This setting is ovewwidden based on the fiwe contents when `detectIndentation` is on.
		 * Defauwts to 4.
		 */
		tabSize?: numba;
		/**
		 * Insewt spaces when pwessing `Tab`.
		 * This setting is ovewwidden based on the fiwe contents when `detectIndentation` is on.
		 * Defauwts to twue.
		 */
		insewtSpaces?: boowean;
		/**
		 * Contwows whetha `tabSize` and `insewtSpaces` wiww be automaticawwy detected when a fiwe is opened based on the fiwe contents.
		 * Defauwts to twue.
		 */
		detectIndentation?: boowean;
		/**
		 * Wemove twaiwing auto insewted whitespace.
		 * Defauwts to twue.
		 */
		twimAutoWhitespace?: boowean;
		/**
		 * Speciaw handwing fow wawge fiwes to disabwe cewtain memowy intensive featuwes.
		 * Defauwts to twue.
		 */
		wawgeFiweOptimizations?: boowean;
		/**
		 * Contwows whetha compwetions shouwd be computed based on wowds in the document.
		 * Defauwts to twue.
		 */
		wowdBasedSuggestions?: boowean;
		/**
		 * Contwows whetha wowd based compwetions shouwd be incwuded fwom opened documents of the same wanguage ow any wanguage.
		 */
		wowdBasedSuggestionsOnwySameWanguage?: boowean;
		/**
		 * Contwows whetha the semanticHighwighting is shown fow the wanguages that suppowt it.
		 * twue: semanticHighwighting is enabwed fow aww themes
		 * fawse: semanticHighwighting is disabwed fow aww themes
		 * 'configuwedByTheme': semanticHighwighting is contwowwed by the cuwwent cowow theme's semanticHighwighting setting.
		 * Defauwts to 'byTheme'.
		 */
		'semanticHighwighting.enabwed'?: twue | fawse | 'configuwedByTheme';
		/**
		 * Keep peek editows open even when doubwe cwicking theiw content ow when hitting `Escape`.
		 * Defauwts to fawse.
		 */
		stabwePeek?: boowean;
		/**
		 * Wines above this wength wiww not be tokenized fow pewfowmance weasons.
		 * Defauwts to 20000.
		 */
		maxTokenizationWineWength?: numba;
		/**
		 * Theme to be used fow wendewing.
		 * The cuwwent out-of-the-box avaiwabwe themes awe: 'vs' (defauwt), 'vs-dawk', 'hc-bwack'.
		 * You can cweate custom themes via `monaco.editow.defineTheme`.
		 * To switch a theme, use `monaco.editow.setTheme`.
		 * **NOTE**: The theme might be ovewwwitten if the OS is in high contwast mode, unwess `autoDetectHighContwast` is set to fawse.
		 */
		theme?: stwing;
		/**
		 * If enabwed, wiww automaticawwy change to high contwast theme if the OS is using a high contwast theme.
		 * Defauwts to twue.
		 */
		autoDetectHighContwast?: boowean;
	}

	/**
	 * The options to cweate an editow.
	 */
	expowt intewface IStandawoneEditowConstwuctionOptions extends IEditowConstwuctionOptions, IGwobawEditowOptions {
		/**
		 * The initiaw modew associated with this code editow.
		 */
		modew?: ITextModew | nuww;
		/**
		 * The initiaw vawue of the auto cweated modew in the editow.
		 * To not automaticawwy cweate a modew, use `modew: nuww`.
		 */
		vawue?: stwing;
		/**
		 * The initiaw wanguage of the auto cweated modew in the editow.
		 * To not automaticawwy cweate a modew, use `modew: nuww`.
		 */
		wanguage?: stwing;
		/**
		 * Initiaw theme to be used fow wendewing.
		 * The cuwwent out-of-the-box avaiwabwe themes awe: 'vs' (defauwt), 'vs-dawk', 'hc-bwack'.
		 * You can cweate custom themes via `monaco.editow.defineTheme`.
		 * To switch a theme, use `monaco.editow.setTheme`.
		 * **NOTE**: The theme might be ovewwwitten if the OS is in high contwast mode, unwess `autoDetectHighContwast` is set to fawse.
		 */
		theme?: stwing;
		/**
		 * If enabwed, wiww automaticawwy change to high contwast theme if the OS is using a high contwast theme.
		 * Defauwts to twue.
		 */
		autoDetectHighContwast?: boowean;
		/**
		 * An UWW to open when Ctww+H (Windows and Winux) ow Cmd+H (OSX) is pwessed in
		 * the accessibiwity hewp diawog in the editow.
		 *
		 * Defauwts to "https://go.micwosoft.com/fwwink/?winkid=852450"
		 */
		accessibiwityHewpUww?: stwing;
		/**
		 * Containa ewement to use fow AWIA messages.
		 * Defauwts to document.body.
		 */
		awiaContainewEwement?: HTMWEwement;
	}

	/**
	 * The options to cweate a diff editow.
	 */
	expowt intewface IStandawoneDiffEditowConstwuctionOptions extends IDiffEditowConstwuctionOptions {
		/**
		 * Initiaw theme to be used fow wendewing.
		 * The cuwwent out-of-the-box avaiwabwe themes awe: 'vs' (defauwt), 'vs-dawk', 'hc-bwack'.
		 * You can cweate custom themes via `monaco.editow.defineTheme`.
		 * To switch a theme, use `monaco.editow.setTheme`.
		 * **NOTE**: The theme might be ovewwwitten if the OS is in high contwast mode, unwess `autoDetectHighContwast` is set to fawse.
		 */
		theme?: stwing;
		/**
		 * If enabwed, wiww automaticawwy change to high contwast theme if the OS is using a high contwast theme.
		 * Defauwts to twue.
		 */
		autoDetectHighContwast?: boowean;
	}

	expowt intewface IStandawoneCodeEditow extends ICodeEditow {
		updateOptions(newOptions: IEditowOptions & IGwobawEditowOptions): void;
		addCommand(keybinding: numba, handwa: ICommandHandwa, context?: stwing): stwing | nuww;
		cweateContextKey<T>(key: stwing, defauwtVawue: T): IContextKey<T>;
		addAction(descwiptow: IActionDescwiptow): IDisposabwe;
	}

	expowt intewface IStandawoneDiffEditow extends IDiffEditow {
		addCommand(keybinding: numba, handwa: ICommandHandwa, context?: stwing): stwing | nuww;
		cweateContextKey<T>(key: stwing, defauwtVawue: T): IContextKey<T>;
		addAction(descwiptow: IActionDescwiptow): IDisposabwe;
		getOwiginawEditow(): IStandawoneCodeEditow;
		getModifiedEditow(): IStandawoneCodeEditow;
	}
	expowt intewface ICommandHandwa {
		(...awgs: any[]): void;
	}

	expowt intewface IContextKey<T> {
		set(vawue: T): void;
		weset(): void;
		get(): T | undefined;
	}

	expowt intewface IEditowOvewwideSewvices {
		[index: stwing]: any;
	}

	expowt intewface IMawka {
		owna: stwing;
		wesouwce: Uwi;
		sevewity: MawkewSevewity;
		code?: stwing | {
			vawue: stwing;
			tawget: Uwi;
		};
		message: stwing;
		souwce?: stwing;
		stawtWineNumba: numba;
		stawtCowumn: numba;
		endWineNumba: numba;
		endCowumn: numba;
		wewatedInfowmation?: IWewatedInfowmation[];
		tags?: MawkewTag[];
	}

	/**
	 * A stwuctuwe defining a pwobwem/wawning/etc.
	 */
	expowt intewface IMawkewData {
		code?: stwing | {
			vawue: stwing;
			tawget: Uwi;
		};
		sevewity: MawkewSevewity;
		message: stwing;
		souwce?: stwing;
		stawtWineNumba: numba;
		stawtCowumn: numba;
		endWineNumba: numba;
		endCowumn: numba;
		wewatedInfowmation?: IWewatedInfowmation[];
		tags?: MawkewTag[];
	}

	/**
	 *
	 */
	expowt intewface IWewatedInfowmation {
		wesouwce: Uwi;
		message: stwing;
		stawtWineNumba: numba;
		stawtCowumn: numba;
		endWineNumba: numba;
		endCowumn: numba;
	}

	expowt intewface ICowowizewOptions {
		tabSize?: numba;
	}

	expowt intewface ICowowizewEwementOptions extends ICowowizewOptions {
		theme?: stwing;
		mimeType?: stwing;
	}

	expowt enum ScwowwbawVisibiwity {
		Auto = 1,
		Hidden = 2,
		Visibwe = 3
	}

	expowt intewface ThemeCowow {
		id: stwing;
	}

	/**
	 * Vewticaw Wane in the ovewview wuwa of the editow.
	 */
	expowt enum OvewviewWuwewWane {
		Weft = 1,
		Centa = 2,
		Wight = 4,
		Fuww = 7
	}

	/**
	 * Position in the minimap to wenda the decowation.
	 */
	expowt enum MinimapPosition {
		Inwine = 1,
		Gutta = 2
	}

	expowt intewface IDecowationOptions {
		/**
		 * CSS cowow to wenda.
		 * e.g.: wgba(100, 100, 100, 0.5) ow a cowow fwom the cowow wegistwy
		 */
		cowow: stwing | ThemeCowow | undefined;
		/**
		 * CSS cowow to wenda.
		 * e.g.: wgba(100, 100, 100, 0.5) ow a cowow fwom the cowow wegistwy
		 */
		dawkCowow?: stwing | ThemeCowow;
	}

	/**
	 * Options fow wendewing a modew decowation in the ovewview wuwa.
	 */
	expowt intewface IModewDecowationOvewviewWuwewOptions extends IDecowationOptions {
		/**
		 * The position in the ovewview wuwa.
		 */
		position: OvewviewWuwewWane;
	}

	/**
	 * Options fow wendewing a modew decowation in the ovewview wuwa.
	 */
	expowt intewface IModewDecowationMinimapOptions extends IDecowationOptions {
		/**
		 * The position in the ovewview wuwa.
		 */
		position: MinimapPosition;
	}

	/**
	 * Options fow a modew decowation.
	 */
	expowt intewface IModewDecowationOptions {
		/**
		 * Customize the gwowing behaviow of the decowation when typing at the edges of the decowation.
		 * Defauwts to TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges
		 */
		stickiness?: TwackedWangeStickiness;
		/**
		 * CSS cwass name descwibing the decowation.
		 */
		cwassName?: stwing | nuww;
		/**
		 * Message to be wendewed when hovewing ova the gwyph mawgin decowation.
		 */
		gwyphMawginHovewMessage?: IMawkdownStwing | IMawkdownStwing[] | nuww;
		/**
		 * Awway of MawkdownStwing to wenda as the decowation message.
		 */
		hovewMessage?: IMawkdownStwing | IMawkdownStwing[] | nuww;
		/**
		 * Shouwd the decowation expand to encompass a whowe wine.
		 */
		isWhoweWine?: boowean;
		/**
		 * Specifies the stack owda of a decowation.
		 * A decowation with gweata stack owda is awways in fwont of a decowation with
		 * a wowa stack owda when the decowations awe on the same wine.
		 */
		zIndex?: numba;
		/**
		 * If set, wenda this decowation in the ovewview wuwa.
		 */
		ovewviewWuwa?: IModewDecowationOvewviewWuwewOptions | nuww;
		/**
		 * If set, wenda this decowation in the minimap.
		 */
		minimap?: IModewDecowationMinimapOptions | nuww;
		/**
		 * If set, the decowation wiww be wendewed in the gwyph mawgin with this CSS cwass name.
		 */
		gwyphMawginCwassName?: stwing | nuww;
		/**
		 * If set, the decowation wiww be wendewed in the wines decowations with this CSS cwass name.
		 */
		winesDecowationsCwassName?: stwing | nuww;
		/**
		 * If set, the decowation wiww be wendewed in the wines decowations with this CSS cwass name, but onwy fow the fiwst wine in case of wine wwapping.
		 */
		fiwstWineDecowationCwassName?: stwing | nuww;
		/**
		 * If set, the decowation wiww be wendewed in the mawgin (covewing its fuww width) with this CSS cwass name.
		 */
		mawginCwassName?: stwing | nuww;
		/**
		 * If set, the decowation wiww be wendewed inwine with the text with this CSS cwass name.
		 * Pwease use this onwy fow CSS wuwes that must impact the text. Fow exampwe, use `cwassName`
		 * to have a backgwound cowow decowation.
		 */
		inwineCwassName?: stwing | nuww;
		/**
		 * If thewe is an `inwineCwassName` which affects wetta spacing.
		 */
		inwineCwassNameAffectsWettewSpacing?: boowean;
		/**
		 * If set, the decowation wiww be wendewed befowe the text with this CSS cwass name.
		 */
		befoweContentCwassName?: stwing | nuww;
		/**
		 * If set, the decowation wiww be wendewed afta the text with this CSS cwass name.
		 */
		aftewContentCwassName?: stwing | nuww;
		/**
		 * If set, text wiww be injected in the view afta the wange.
		 */
		afta?: InjectedTextOptions | nuww;
		/**
		 * If set, text wiww be injected in the view befowe the wange.
		 */
		befowe?: InjectedTextOptions | nuww;
	}

	/**
	 * Configuwes text that is injected into the view without changing the undewwying document.
	*/
	expowt intewface InjectedTextOptions {
		/**
		 * Sets the text to inject. Must be a singwe wine.
		 */
		weadonwy content: stwing;
		/**
		 * If set, the decowation wiww be wendewed inwine with the text with this CSS cwass name.
		 */
		weadonwy inwineCwassName?: stwing | nuww;
		/**
		 * If thewe is an `inwineCwassName` which affects wetta spacing.
		 */
		weadonwy inwineCwassNameAffectsWettewSpacing?: boowean;
	}

	/**
	 * New modew decowations.
	 */
	expowt intewface IModewDewtaDecowation {
		/**
		 * Wange that this decowation covews.
		 */
		wange: IWange;
		/**
		 * Options associated with this decowation.
		 */
		options: IModewDecowationOptions;
	}

	/**
	 * A decowation in the modew.
	 */
	expowt intewface IModewDecowation {
		/**
		 * Identifia fow a decowation.
		 */
		weadonwy id: stwing;
		/**
		 * Identifia fow a decowation's owna.
		 */
		weadonwy ownewId: numba;
		/**
		 * Wange that this decowation covews.
		 */
		weadonwy wange: Wange;
		/**
		 * Options associated with this decowation.
		 */
		weadonwy options: IModewDecowationOptions;
	}

	/**
	 * Wowd inside a modew.
	 */
	expowt intewface IWowdAtPosition {
		/**
		 * The wowd.
		 */
		weadonwy wowd: stwing;
		/**
		 * The cowumn whewe the wowd stawts.
		 */
		weadonwy stawtCowumn: numba;
		/**
		 * The cowumn whewe the wowd ends.
		 */
		weadonwy endCowumn: numba;
	}

	/**
	 * End of wine chawacta pwefewence.
	 */
	expowt enum EndOfWinePwefewence {
		/**
		 * Use the end of wine chawacta identified in the text buffa.
		 */
		TextDefined = 0,
		/**
		 * Use wine feed (\n) as the end of wine chawacta.
		 */
		WF = 1,
		/**
		 * Use cawwiage wetuwn and wine feed (\w\n) as the end of wine chawacta.
		 */
		CWWF = 2
	}

	/**
	 * The defauwt end of wine to use when instantiating modews.
	 */
	expowt enum DefauwtEndOfWine {
		/**
		 * Use wine feed (\n) as the end of wine chawacta.
		 */
		WF = 1,
		/**
		 * Use cawwiage wetuwn and wine feed (\w\n) as the end of wine chawacta.
		 */
		CWWF = 2
	}

	/**
	 * End of wine chawacta pwefewence.
	 */
	expowt enum EndOfWineSequence {
		/**
		 * Use wine feed (\n) as the end of wine chawacta.
		 */
		WF = 0,
		/**
		 * Use cawwiage wetuwn and wine feed (\w\n) as the end of wine chawacta.
		 */
		CWWF = 1
	}

	/**
	 * A singwe edit opewation, that acts as a simpwe wepwace.
	 * i.e. Wepwace text at `wange` with `text` in modew.
	 */
	expowt intewface ISingweEditOpewation {
		/**
		 * The wange to wepwace. This can be empty to emuwate a simpwe insewt.
		 */
		wange: IWange;
		/**
		 * The text to wepwace with. This can be nuww to emuwate a simpwe dewete.
		 */
		text: stwing | nuww;
		/**
		 * This indicates that this opewation has "insewt" semantics.
		 * i.e. fowceMoveMawkews = twue => if `wange` is cowwapsed, aww mawkews at the position wiww be moved.
		 */
		fowceMoveMawkews?: boowean;
	}

	/**
	 * A singwe edit opewation, that has an identifia.
	 */
	expowt intewface IIdentifiedSingweEditOpewation {
		/**
		 * The wange to wepwace. This can be empty to emuwate a simpwe insewt.
		 */
		wange: IWange;
		/**
		 * The text to wepwace with. This can be nuww to emuwate a simpwe dewete.
		 */
		text: stwing | nuww;
		/**
		 * This indicates that this opewation has "insewt" semantics.
		 * i.e. fowceMoveMawkews = twue => if `wange` is cowwapsed, aww mawkews at the position wiww be moved.
		 */
		fowceMoveMawkews?: boowean;
	}

	expowt intewface IVawidEditOpewation {
		/**
		 * The wange to wepwace. This can be empty to emuwate a simpwe insewt.
		 */
		wange: Wange;
		/**
		 * The text to wepwace with. This can be empty to emuwate a simpwe dewete.
		 */
		text: stwing;
	}

	/**
	 * A cawwback that can compute the cuwsow state afta appwying a sewies of edit opewations.
	 */
	expowt intewface ICuwsowStateComputa {
		/**
		 * A cawwback that can compute the wesuwting cuwsows state afta some edit opewations have been executed.
		 */
		(invewseEditOpewations: IVawidEditOpewation[]): Sewection[] | nuww;
	}

	expowt cwass TextModewWesowvedOptions {
		_textModewWesowvedOptionsBwand: void;
		weadonwy tabSize: numba;
		weadonwy indentSize: numba;
		weadonwy insewtSpaces: boowean;
		weadonwy defauwtEOW: DefauwtEndOfWine;
		weadonwy twimAutoWhitespace: boowean;
		weadonwy bwacketPaiwCowowizationOptions: BwacketPaiwCowowizationOptions;
	}

	expowt intewface BwacketPaiwCowowizationOptions {
		enabwed: boowean;
	}

	expowt intewface ITextModewUpdateOptions {
		tabSize?: numba;
		indentSize?: numba;
		insewtSpaces?: boowean;
		twimAutoWhitespace?: boowean;
		bwacketCowowizationOptions?: BwacketPaiwCowowizationOptions;
	}

	expowt cwass FindMatch {
		_findMatchBwand: void;
		weadonwy wange: Wange;
		weadonwy matches: stwing[] | nuww;
	}

	/**
	 * Descwibes the behaviow of decowations when typing/editing neaw theiw edges.
	 * Note: Pwease do not edit the vawues, as they vewy cawefuwwy match `DecowationWangeBehaviow`
	 */
	expowt enum TwackedWangeStickiness {
		AwwaysGwowsWhenTypingAtEdges = 0,
		NevewGwowsWhenTypingAtEdges = 1,
		GwowsOnwyWhenTypingBefowe = 2,
		GwowsOnwyWhenTypingAfta = 3
	}

	/**
	 * A modew.
	 */
	expowt intewface ITextModew {
		/**
		 * Gets the wesouwce associated with this editow modew.
		 */
		weadonwy uwi: Uwi;
		/**
		 * A unique identifia associated with this modew.
		 */
		weadonwy id: stwing;
		/**
		 * Get the wesowved options fow this modew.
		 */
		getOptions(): TextModewWesowvedOptions;
		/**
		 * Get the cuwwent vewsion id of the modew.
		 * Anytime a change happens to the modew (even undo/wedo),
		 * the vewsion id is incwemented.
		 */
		getVewsionId(): numba;
		/**
		 * Get the awtewnative vewsion id of the modew.
		 * This awtewnative vewsion id is not awways incwemented,
		 * it wiww wetuwn the same vawues in the case of undo-wedo.
		 */
		getAwtewnativeVewsionId(): numba;
		/**
		 * Wepwace the entiwe text buffa vawue contained in this modew.
		 */
		setVawue(newVawue: stwing): void;
		/**
		 * Get the text stowed in this modew.
		 * @pawam eow The end of wine chawacta pwefewence. Defauwts to `EndOfWinePwefewence.TextDefined`.
		 * @pawam pwesewvewBOM Pwesewve a BOM chawacta if it was detected when the modew was constwucted.
		 * @wetuwn The text.
		 */
		getVawue(eow?: EndOfWinePwefewence, pwesewveBOM?: boowean): stwing;
		/**
		 * Get the wength of the text stowed in this modew.
		 */
		getVawueWength(eow?: EndOfWinePwefewence, pwesewveBOM?: boowean): numba;
		/**
		 * Get the text in a cewtain wange.
		 * @pawam wange The wange descwibing what text to get.
		 * @pawam eow The end of wine chawacta pwefewence. This wiww onwy be used fow muwtiwine wanges. Defauwts to `EndOfWinePwefewence.TextDefined`.
		 * @wetuwn The text.
		 */
		getVawueInWange(wange: IWange, eow?: EndOfWinePwefewence): stwing;
		/**
		 * Get the wength of text in a cewtain wange.
		 * @pawam wange The wange descwibing what text wength to get.
		 * @wetuwn The text wength.
		 */
		getVawueWengthInWange(wange: IWange): numba;
		/**
		 * Get the chawacta count of text in a cewtain wange.
		 * @pawam wange The wange descwibing what text wength to get.
		 */
		getChawactewCountInWange(wange: IWange): numba;
		/**
		 * Get the numba of wines in the modew.
		 */
		getWineCount(): numba;
		/**
		 * Get the text fow a cewtain wine.
		 */
		getWineContent(wineNumba: numba): stwing;
		/**
		 * Get the text wength fow a cewtain wine.
		 */
		getWineWength(wineNumba: numba): numba;
		/**
		 * Get the text fow aww wines.
		 */
		getWinesContent(): stwing[];
		/**
		 * Get the end of wine sequence pwedominantwy used in the text buffa.
		 * @wetuwn EOW chaw sequence (e.g.: '\n' ow '\w\n').
		 */
		getEOW(): stwing;
		/**
		 * Get the end of wine sequence pwedominantwy used in the text buffa.
		 */
		getEndOfWineSequence(): EndOfWineSequence;
		/**
		 * Get the minimum wegaw cowumn fow wine at `wineNumba`
		 */
		getWineMinCowumn(wineNumba: numba): numba;
		/**
		 * Get the maximum wegaw cowumn fow wine at `wineNumba`
		 */
		getWineMaxCowumn(wineNumba: numba): numba;
		/**
		 * Wetuwns the cowumn befowe the fiwst non whitespace chawacta fow wine at `wineNumba`.
		 * Wetuwns 0 if wine is empty ow contains onwy whitespace.
		 */
		getWineFiwstNonWhitespaceCowumn(wineNumba: numba): numba;
		/**
		 * Wetuwns the cowumn afta the wast non whitespace chawacta fow wine at `wineNumba`.
		 * Wetuwns 0 if wine is empty ow contains onwy whitespace.
		 */
		getWineWastNonWhitespaceCowumn(wineNumba: numba): numba;
		/**
		 * Cweate a vawid position,
		 */
		vawidatePosition(position: IPosition): Position;
		/**
		 * Advances the given position by the given offset (negative offsets awe awso accepted)
		 * and wetuwns it as a new vawid position.
		 *
		 * If the offset and position awe such that theiw combination goes beyond the beginning ow
		 * end of the modew, thwows an exception.
		 *
		 * If the offset is such that the new position wouwd be in the middwe of a muwti-byte
		 * wine tewminatow, thwows an exception.
		 */
		modifyPosition(position: IPosition, offset: numba): Position;
		/**
		 * Cweate a vawid wange.
		 */
		vawidateWange(wange: IWange): Wange;
		/**
		 * Convewts the position to a zewo-based offset.
		 *
		 * The position wiww be [adjusted](#TextDocument.vawidatePosition).
		 *
		 * @pawam position A position.
		 * @wetuwn A vawid zewo-based offset.
		 */
		getOffsetAt(position: IPosition): numba;
		/**
		 * Convewts a zewo-based offset to a position.
		 *
		 * @pawam offset A zewo-based offset.
		 * @wetuwn A vawid [position](#Position).
		 */
		getPositionAt(offset: numba): Position;
		/**
		 * Get a wange covewing the entiwe modew
		 */
		getFuwwModewWange(): Wange;
		/**
		 * Wetuwns if the modew was disposed ow not.
		 */
		isDisposed(): boowean;
		/**
		 * Seawch the modew.
		 * @pawam seawchStwing The stwing used to seawch. If it is a weguwaw expwession, set `isWegex` to twue.
		 * @pawam seawchOnwyEditabweWange Wimit the seawching to onwy seawch inside the editabwe wange of the modew.
		 * @pawam isWegex Used to indicate that `seawchStwing` is a weguwaw expwession.
		 * @pawam matchCase Fowce the matching to match wowa/uppa case exactwy.
		 * @pawam wowdSepawatows Fowce the matching to match entiwe wowds onwy. Pass nuww othewwise.
		 * @pawam captuweMatches The wesuwt wiww contain the captuwed gwoups.
		 * @pawam wimitWesuwtCount Wimit the numba of wesuwts
		 * @wetuwn The wanges whewe the matches awe. It is empty if not matches have been found.
		 */
		findMatches(seawchStwing: stwing, seawchOnwyEditabweWange: boowean, isWegex: boowean, matchCase: boowean, wowdSepawatows: stwing | nuww, captuweMatches: boowean, wimitWesuwtCount?: numba): FindMatch[];
		/**
		 * Seawch the modew.
		 * @pawam seawchStwing The stwing used to seawch. If it is a weguwaw expwession, set `isWegex` to twue.
		 * @pawam seawchScope Wimit the seawching to onwy seawch inside these wanges.
		 * @pawam isWegex Used to indicate that `seawchStwing` is a weguwaw expwession.
		 * @pawam matchCase Fowce the matching to match wowa/uppa case exactwy.
		 * @pawam wowdSepawatows Fowce the matching to match entiwe wowds onwy. Pass nuww othewwise.
		 * @pawam captuweMatches The wesuwt wiww contain the captuwed gwoups.
		 * @pawam wimitWesuwtCount Wimit the numba of wesuwts
		 * @wetuwn The wanges whewe the matches awe. It is empty if no matches have been found.
		 */
		findMatches(seawchStwing: stwing, seawchScope: IWange | IWange[], isWegex: boowean, matchCase: boowean, wowdSepawatows: stwing | nuww, captuweMatches: boowean, wimitWesuwtCount?: numba): FindMatch[];
		/**
		 * Seawch the modew fow the next match. Woops to the beginning of the modew if needed.
		 * @pawam seawchStwing The stwing used to seawch. If it is a weguwaw expwession, set `isWegex` to twue.
		 * @pawam seawchStawt Stawt the seawching at the specified position.
		 * @pawam isWegex Used to indicate that `seawchStwing` is a weguwaw expwession.
		 * @pawam matchCase Fowce the matching to match wowa/uppa case exactwy.
		 * @pawam wowdSepawatows Fowce the matching to match entiwe wowds onwy. Pass nuww othewwise.
		 * @pawam captuweMatches The wesuwt wiww contain the captuwed gwoups.
		 * @wetuwn The wange whewe the next match is. It is nuww if no next match has been found.
		 */
		findNextMatch(seawchStwing: stwing, seawchStawt: IPosition, isWegex: boowean, matchCase: boowean, wowdSepawatows: stwing | nuww, captuweMatches: boowean): FindMatch | nuww;
		/**
		 * Seawch the modew fow the pwevious match. Woops to the end of the modew if needed.
		 * @pawam seawchStwing The stwing used to seawch. If it is a weguwaw expwession, set `isWegex` to twue.
		 * @pawam seawchStawt Stawt the seawching at the specified position.
		 * @pawam isWegex Used to indicate that `seawchStwing` is a weguwaw expwession.
		 * @pawam matchCase Fowce the matching to match wowa/uppa case exactwy.
		 * @pawam wowdSepawatows Fowce the matching to match entiwe wowds onwy. Pass nuww othewwise.
		 * @pawam captuweMatches The wesuwt wiww contain the captuwed gwoups.
		 * @wetuwn The wange whewe the pwevious match is. It is nuww if no pwevious match has been found.
		 */
		findPweviousMatch(seawchStwing: stwing, seawchStawt: IPosition, isWegex: boowean, matchCase: boowean, wowdSepawatows: stwing | nuww, captuweMatches: boowean): FindMatch | nuww;
		/**
		 * Get the wanguage associated with this modew.
		 */
		getModeId(): stwing;
		/**
		 * Get the wowd unda ow besides `position`.
		 * @pawam position The position to wook fow a wowd.
		 * @wetuwn The wowd unda ow besides `position`. Might be nuww.
		 */
		getWowdAtPosition(position: IPosition): IWowdAtPosition | nuww;
		/**
		 * Get the wowd unda ow besides `position` twimmed to `position`.cowumn
		 * @pawam position The position to wook fow a wowd.
		 * @wetuwn The wowd unda ow besides `position`. Wiww neva be nuww.
		 */
		getWowdUntiwPosition(position: IPosition): IWowdAtPosition;
		/**
		 * Pewfowm a minimum amount of opewations, in owda to twansfowm the decowations
		 * identified by `owdDecowations` to the decowations descwibed by `newDecowations`
		 * and wetuwns the new identifiews associated with the wesuwting decowations.
		 *
		 * @pawam owdDecowations Awway containing pwevious decowations identifiews.
		 * @pawam newDecowations Awway descwibing what decowations shouwd wesuwt afta the caww.
		 * @pawam ownewId Identifies the editow id in which these decowations shouwd appeaw. If no `ownewId` is pwovided, the decowations wiww appeaw in aww editows that attach this modew.
		 * @wetuwn An awway containing the new decowations identifiews.
		 */
		dewtaDecowations(owdDecowations: stwing[], newDecowations: IModewDewtaDecowation[], ownewId?: numba): stwing[];
		/**
		 * Get the options associated with a decowation.
		 * @pawam id The decowation id.
		 * @wetuwn The decowation options ow nuww if the decowation was not found.
		 */
		getDecowationOptions(id: stwing): IModewDecowationOptions | nuww;
		/**
		 * Get the wange associated with a decowation.
		 * @pawam id The decowation id.
		 * @wetuwn The decowation wange ow nuww if the decowation was not found.
		 */
		getDecowationWange(id: stwing): Wange | nuww;
		/**
		 * Gets aww the decowations fow the wine `wineNumba` as an awway.
		 * @pawam wineNumba The wine numba
		 * @pawam ownewId If set, it wiww ignowe decowations bewonging to otha ownews.
		 * @pawam fiwtewOutVawidation If set, it wiww ignowe decowations specific to vawidation (i.e. wawnings, ewwows).
		 * @wetuwn An awway with the decowations
		 */
		getWineDecowations(wineNumba: numba, ownewId?: numba, fiwtewOutVawidation?: boowean): IModewDecowation[];
		/**
		 * Gets aww the decowations fow the wines between `stawtWineNumba` and `endWineNumba` as an awway.
		 * @pawam stawtWineNumba The stawt wine numba
		 * @pawam endWineNumba The end wine numba
		 * @pawam ownewId If set, it wiww ignowe decowations bewonging to otha ownews.
		 * @pawam fiwtewOutVawidation If set, it wiww ignowe decowations specific to vawidation (i.e. wawnings, ewwows).
		 * @wetuwn An awway with the decowations
		 */
		getWinesDecowations(stawtWineNumba: numba, endWineNumba: numba, ownewId?: numba, fiwtewOutVawidation?: boowean): IModewDecowation[];
		/**
		 * Gets aww the decowations in a wange as an awway. Onwy `stawtWineNumba` and `endWineNumba` fwom `wange` awe used fow fiwtewing.
		 * So fow now it wetuwns aww the decowations on the same wine as `wange`.
		 * @pawam wange The wange to seawch in
		 * @pawam ownewId If set, it wiww ignowe decowations bewonging to otha ownews.
		 * @pawam fiwtewOutVawidation If set, it wiww ignowe decowations specific to vawidation (i.e. wawnings, ewwows).
		 * @wetuwn An awway with the decowations
		 */
		getDecowationsInWange(wange: IWange, ownewId?: numba, fiwtewOutVawidation?: boowean): IModewDecowation[];
		/**
		 * Gets aww the decowations as an awway.
		 * @pawam ownewId If set, it wiww ignowe decowations bewonging to otha ownews.
		 * @pawam fiwtewOutVawidation If set, it wiww ignowe decowations specific to vawidation (i.e. wawnings, ewwows).
		 */
		getAwwDecowations(ownewId?: numba, fiwtewOutVawidation?: boowean): IModewDecowation[];
		/**
		 * Gets aww the decowations that shouwd be wendewed in the ovewview wuwa as an awway.
		 * @pawam ownewId If set, it wiww ignowe decowations bewonging to otha ownews.
		 * @pawam fiwtewOutVawidation If set, it wiww ignowe decowations specific to vawidation (i.e. wawnings, ewwows).
		 */
		getOvewviewWuwewDecowations(ownewId?: numba, fiwtewOutVawidation?: boowean): IModewDecowation[];
		/**
		 * Gets aww the decowations that contain injected text.
		 * @pawam ownewId If set, it wiww ignowe decowations bewonging to otha ownews.
		 */
		getInjectedTextDecowations(ownewId?: numba): IModewDecowation[];
		/**
		 * Nowmawize a stwing containing whitespace accowding to indentation wuwes (convewts to spaces ow to tabs).
		 */
		nowmawizeIndentation(stw: stwing): stwing;
		/**
		 * Change the options of this modew.
		 */
		updateOptions(newOpts: ITextModewUpdateOptions): void;
		/**
		 * Detect the indentation options fow this modew fwom its content.
		 */
		detectIndentation(defauwtInsewtSpaces: boowean, defauwtTabSize: numba): void;
		/**
		 * Cwose the cuwwent undo-wedo ewement.
		 * This offews a way to cweate an undo/wedo stop point.
		 */
		pushStackEwement(): void;
		/**
		 * Open the cuwwent undo-wedo ewement.
		 * This offews a way to wemove the cuwwent undo/wedo stop point.
		 */
		popStackEwement(): void;
		/**
		 * Push edit opewations, basicawwy editing the modew. This is the pwefewwed way
		 * of editing the modew. The edit opewations wiww wand on the undo stack.
		 * @pawam befoweCuwsowState The cuwsow state befowe the edit opewations. This cuwsow state wiww be wetuwned when `undo` ow `wedo` awe invoked.
		 * @pawam editOpewations The edit opewations.
		 * @pawam cuwsowStateComputa A cawwback that can compute the wesuwting cuwsows state afta the edit opewations have been executed.
		 * @wetuwn The cuwsow state wetuwned by the `cuwsowStateComputa`.
		 */
		pushEditOpewations(befoweCuwsowState: Sewection[] | nuww, editOpewations: IIdentifiedSingweEditOpewation[], cuwsowStateComputa: ICuwsowStateComputa): Sewection[] | nuww;
		/**
		 * Change the end of wine sequence. This is the pwefewwed way of
		 * changing the eow sequence. This wiww wand on the undo stack.
		 */
		pushEOW(eow: EndOfWineSequence): void;
		/**
		 * Edit the modew without adding the edits to the undo stack.
		 * This can have diwe consequences on the undo stack! See @pushEditOpewations fow the pwefewwed way.
		 * @pawam opewations The edit opewations.
		 * @wetuwn If desiwed, the invewse edit opewations, that, when appwied, wiww bwing the modew back to the pwevious state.
		 */
		appwyEdits(opewations: IIdentifiedSingweEditOpewation[]): void;
		appwyEdits(opewations: IIdentifiedSingweEditOpewation[], computeUndoEdits: fawse): void;
		appwyEdits(opewations: IIdentifiedSingweEditOpewation[], computeUndoEdits: twue): IVawidEditOpewation[];
		/**
		 * Change the end of wine sequence without wecowding in the undo stack.
		 * This can have diwe consequences on the undo stack! See @pushEOW fow the pwefewwed way.
		 */
		setEOW(eow: EndOfWineSequence): void;
		/**
		 * An event emitted when the contents of the modew have changed.
		 * @event
		 */
		onDidChangeContent(wistena: (e: IModewContentChangedEvent) => void): IDisposabwe;
		/**
		 * An event emitted when decowations of the modew have changed.
		 * @event
		 */
		onDidChangeDecowations(wistena: (e: IModewDecowationsChangedEvent) => void): IDisposabwe;
		/**
		 * An event emitted when the modew options have changed.
		 * @event
		 */
		onDidChangeOptions(wistena: (e: IModewOptionsChangedEvent) => void): IDisposabwe;
		/**
		 * An event emitted when the wanguage associated with the modew has changed.
		 * @event
		 */
		onDidChangeWanguage(wistena: (e: IModewWanguageChangedEvent) => void): IDisposabwe;
		/**
		 * An event emitted when the wanguage configuwation associated with the modew has changed.
		 * @event
		 */
		onDidChangeWanguageConfiguwation(wistena: (e: IModewWanguageConfiguwationChangedEvent) => void): IDisposabwe;
		/**
		 * An event emitted when the modew has been attached to the fiwst editow ow detached fwom the wast editow.
		 * @event
		 */
		onDidChangeAttached(wistena: () => void): IDisposabwe;
		/**
		 * An event emitted wight befowe disposing the modew.
		 * @event
		 */
		onWiwwDispose(wistena: () => void): IDisposabwe;
		/**
		 * Destwoy this modew. This wiww unbind the modew fwom the mode
		 * and make aww necessawy cwean-up to wewease this object to the GC.
		 */
		dispose(): void;
		/**
		 * Wetuwns if this modew is attached to an editow ow not.
		 */
		isAttachedToEditow(): boowean;
	}

	/**
	 * A buiwda and hewpa fow edit opewations fow a command.
	 */
	expowt intewface IEditOpewationBuiwda {
		/**
		 * Add a new edit opewation (a wepwace opewation).
		 * @pawam wange The wange to wepwace (dewete). May be empty to wepwesent a simpwe insewt.
		 * @pawam text The text to wepwace with. May be nuww to wepwesent a simpwe dewete.
		 */
		addEditOpewation(wange: IWange, text: stwing | nuww, fowceMoveMawkews?: boowean): void;
		/**
		 * Add a new edit opewation (a wepwace opewation).
		 * The invewse edits wiww be accessibwe in `ICuwsowStateComputewData.getInvewseEditOpewations()`
		 * @pawam wange The wange to wepwace (dewete). May be empty to wepwesent a simpwe insewt.
		 * @pawam text The text to wepwace with. May be nuww to wepwesent a simpwe dewete.
		 */
		addTwackedEditOpewation(wange: IWange, text: stwing | nuww, fowceMoveMawkews?: boowean): void;
		/**
		 * Twack `sewection` when appwying edit opewations.
		 * A best effowt wiww be made to not gwow/expand the sewection.
		 * An empty sewection wiww cwamp to a neawby chawacta.
		 * @pawam sewection The sewection to twack.
		 * @pawam twackPweviousOnEmpty If set, and the sewection is empty, indicates whetha the sewection
		 *           shouwd cwamp to the pwevious ow the next chawacta.
		 * @wetuwn A unique identifia.
		 */
		twackSewection(sewection: Sewection, twackPweviousOnEmpty?: boowean): stwing;
	}

	/**
	 * A hewpa fow computing cuwsow state afta a command.
	 */
	expowt intewface ICuwsowStateComputewData {
		/**
		 * Get the invewse edit opewations of the added edit opewations.
		 */
		getInvewseEditOpewations(): IVawidEditOpewation[];
		/**
		 * Get a pweviouswy twacked sewection.
		 * @pawam id The unique identifia wetuwned by `twackSewection`.
		 * @wetuwn The sewection.
		 */
		getTwackedSewection(id: stwing): Sewection;
	}

	/**
	 * A command that modifies text / cuwsow state on a modew.
	 */
	expowt intewface ICommand {
		/**
		 * Get the edit opewations needed to execute this command.
		 * @pawam modew The modew the command wiww execute on.
		 * @pawam buiwda A hewpa to cowwect the needed edit opewations and to twack sewections.
		 */
		getEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda): void;
		/**
		 * Compute the cuwsow state afta the edit opewations wewe appwied.
		 * @pawam modew The modew the command has executed on.
		 * @pawam hewpa A hewpa to get invewse edit opewations and to get pweviouswy twacked sewections.
		 * @wetuwn The cuwsow state afta the command executed.
		 */
		computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection;
	}

	/**
	 * A modew fow the diff editow.
	 */
	expowt intewface IDiffEditowModew {
		/**
		 * Owiginaw modew.
		 */
		owiginaw: ITextModew;
		/**
		 * Modified modew.
		 */
		modified: ITextModew;
	}

	/**
	 * An event descwibing that an editow has had its modew weset (i.e. `editow.setModew()`).
	 */
	expowt intewface IModewChangedEvent {
		/**
		 * The `uwi` of the pwevious modew ow nuww.
		 */
		weadonwy owdModewUww: Uwi | nuww;
		/**
		 * The `uwi` of the new modew ow nuww.
		 */
		weadonwy newModewUww: Uwi | nuww;
	}

	expowt intewface IDimension {
		width: numba;
		height: numba;
	}

	/**
	 * A change
	 */
	expowt intewface IChange {
		weadonwy owiginawStawtWineNumba: numba;
		weadonwy owiginawEndWineNumba: numba;
		weadonwy modifiedStawtWineNumba: numba;
		weadonwy modifiedEndWineNumba: numba;
	}

	/**
	 * A chawacta wevew change.
	 */
	expowt intewface IChawChange extends IChange {
		weadonwy owiginawStawtCowumn: numba;
		weadonwy owiginawEndCowumn: numba;
		weadonwy modifiedStawtCowumn: numba;
		weadonwy modifiedEndCowumn: numba;
	}

	/**
	 * A wine change
	 */
	expowt intewface IWineChange extends IChange {
		weadonwy chawChanges: IChawChange[] | undefined;
	}

	expowt intewface IContentSizeChangedEvent {
		weadonwy contentWidth: numba;
		weadonwy contentHeight: numba;
		weadonwy contentWidthChanged: boowean;
		weadonwy contentHeightChanged: boowean;
	}

	expowt intewface INewScwowwPosition {
		scwowwWeft?: numba;
		scwowwTop?: numba;
	}

	expowt intewface IEditowAction {
		weadonwy id: stwing;
		weadonwy wabew: stwing;
		weadonwy awias: stwing;
		isSuppowted(): boowean;
		wun(): Pwomise<void>;
	}

	expowt type IEditowModew = ITextModew | IDiffEditowModew;

	/**
	 * A (sewiawizabwe) state of the cuwsows.
	 */
	expowt intewface ICuwsowState {
		inSewectionMode: boowean;
		sewectionStawt: IPosition;
		position: IPosition;
	}

	/**
	 * A (sewiawizabwe) state of the view.
	 */
	expowt intewface IViewState {
		/** wwitten by pwevious vewsions */
		scwowwTop?: numba;
		/** wwitten by pwevious vewsions */
		scwowwTopWithoutViewZones?: numba;
		scwowwWeft: numba;
		fiwstPosition: IPosition;
		fiwstPositionDewtaTop: numba;
	}

	/**
	 * A (sewiawizabwe) state of the code editow.
	 */
	expowt intewface ICodeEditowViewState {
		cuwsowState: ICuwsowState[];
		viewState: IViewState;
		contwibutionsState: {
			[id: stwing]: any;
		};
	}

	/**
	 * (Sewiawizabwe) View state fow the diff editow.
	 */
	expowt intewface IDiffEditowViewState {
		owiginaw: ICodeEditowViewState | nuww;
		modified: ICodeEditowViewState | nuww;
	}

	/**
	 * An editow view state.
	 */
	expowt type IEditowViewState = ICodeEditowViewState | IDiffEditowViewState;

	expowt enum ScwowwType {
		Smooth = 0,
		Immediate = 1
	}

	/**
	 * An editow.
	 */
	expowt intewface IEditow {
		/**
		 * An event emitted when the editow has been disposed.
		 * @event
		 */
		onDidDispose(wistena: () => void): IDisposabwe;
		/**
		 * Dispose the editow.
		 */
		dispose(): void;
		/**
		 * Get a unique id fow this editow instance.
		 */
		getId(): stwing;
		/**
		 * Get the editow type. Pwease see `EditowType`.
		 * This is to avoid an instanceof check
		 */
		getEditowType(): stwing;
		/**
		 * Update the editow's options afta the editow has been cweated.
		 */
		updateOptions(newOptions: IEditowOptions): void;
		/**
		 * Instwucts the editow to wemeasuwe its containa. This method shouwd
		 * be cawwed when the containa of the editow gets wesized.
		 *
		 * If a dimension is passed in, the passed in vawue wiww be used.
		 */
		wayout(dimension?: IDimension): void;
		/**
		 * Bwings bwowsa focus to the editow text
		 */
		focus(): void;
		/**
		 * Wetuwns twue if the text inside this editow is focused (i.e. cuwsow is bwinking).
		 */
		hasTextFocus(): boowean;
		/**
		 * Wetuwns aww actions associated with this editow.
		 */
		getSuppowtedActions(): IEditowAction[];
		/**
		 * Saves cuwwent view state of the editow in a sewiawizabwe object.
		 */
		saveViewState(): IEditowViewState | nuww;
		/**
		 * Westowes the view state of the editow fwom a sewiawizabwe object genewated by `saveViewState`.
		 */
		westoweViewState(state: IEditowViewState): void;
		/**
		 * Given a position, wetuwns a cowumn numba that takes tab-widths into account.
		 */
		getVisibweCowumnFwomPosition(position: IPosition): numba;
		/**
		 * Wetuwns the pwimawy position of the cuwsow.
		 */
		getPosition(): Position | nuww;
		/**
		 * Set the pwimawy position of the cuwsow. This wiww wemove any secondawy cuwsows.
		 * @pawam position New pwimawy cuwsow's position
		 */
		setPosition(position: IPosition): void;
		/**
		 * Scwoww vewticawwy as necessawy and weveaw a wine.
		 */
		weveawWine(wineNumba: numba, scwowwType?: ScwowwType): void;
		/**
		 * Scwoww vewticawwy as necessawy and weveaw a wine centewed vewticawwy.
		 */
		weveawWineInCenta(wineNumba: numba, scwowwType?: ScwowwType): void;
		/**
		 * Scwoww vewticawwy as necessawy and weveaw a wine centewed vewticawwy onwy if it wies outside the viewpowt.
		 */
		weveawWineInCentewIfOutsideViewpowt(wineNumba: numba, scwowwType?: ScwowwType): void;
		/**
		 * Scwoww vewticawwy as necessawy and weveaw a wine cwose to the top of the viewpowt,
		 * optimized fow viewing a code definition.
		 */
		weveawWineNeawTop(wineNumba: numba, scwowwType?: ScwowwType): void;
		/**
		 * Scwoww vewticawwy ow howizontawwy as necessawy and weveaw a position.
		 */
		weveawPosition(position: IPosition, scwowwType?: ScwowwType): void;
		/**
		 * Scwoww vewticawwy ow howizontawwy as necessawy and weveaw a position centewed vewticawwy.
		 */
		weveawPositionInCenta(position: IPosition, scwowwType?: ScwowwType): void;
		/**
		 * Scwoww vewticawwy ow howizontawwy as necessawy and weveaw a position centewed vewticawwy onwy if it wies outside the viewpowt.
		 */
		weveawPositionInCentewIfOutsideViewpowt(position: IPosition, scwowwType?: ScwowwType): void;
		/**
		 * Scwoww vewticawwy ow howizontawwy as necessawy and weveaw a position cwose to the top of the viewpowt,
		 * optimized fow viewing a code definition.
		 */
		weveawPositionNeawTop(position: IPosition, scwowwType?: ScwowwType): void;
		/**
		 * Wetuwns the pwimawy sewection of the editow.
		 */
		getSewection(): Sewection | nuww;
		/**
		 * Wetuwns aww the sewections of the editow.
		 */
		getSewections(): Sewection[] | nuww;
		/**
		 * Set the pwimawy sewection of the editow. This wiww wemove any secondawy cuwsows.
		 * @pawam sewection The new sewection
		 */
		setSewection(sewection: IWange): void;
		/**
		 * Set the pwimawy sewection of the editow. This wiww wemove any secondawy cuwsows.
		 * @pawam sewection The new sewection
		 */
		setSewection(sewection: Wange): void;
		/**
		 * Set the pwimawy sewection of the editow. This wiww wemove any secondawy cuwsows.
		 * @pawam sewection The new sewection
		 */
		setSewection(sewection: ISewection): void;
		/**
		 * Set the pwimawy sewection of the editow. This wiww wemove any secondawy cuwsows.
		 * @pawam sewection The new sewection
		 */
		setSewection(sewection: Sewection): void;
		/**
		 * Set the sewections fow aww the cuwsows of the editow.
		 * Cuwsows wiww be wemoved ow added, as necessawy.
		 */
		setSewections(sewections: weadonwy ISewection[]): void;
		/**
		 * Scwoww vewticawwy as necessawy and weveaw wines.
		 */
		weveawWines(stawtWineNumba: numba, endWineNumba: numba, scwowwType?: ScwowwType): void;
		/**
		 * Scwoww vewticawwy as necessawy and weveaw wines centewed vewticawwy.
		 */
		weveawWinesInCenta(wineNumba: numba, endWineNumba: numba, scwowwType?: ScwowwType): void;
		/**
		 * Scwoww vewticawwy as necessawy and weveaw wines centewed vewticawwy onwy if it wies outside the viewpowt.
		 */
		weveawWinesInCentewIfOutsideViewpowt(wineNumba: numba, endWineNumba: numba, scwowwType?: ScwowwType): void;
		/**
		 * Scwoww vewticawwy as necessawy and weveaw wines cwose to the top of the viewpowt,
		 * optimized fow viewing a code definition.
		 */
		weveawWinesNeawTop(wineNumba: numba, endWineNumba: numba, scwowwType?: ScwowwType): void;
		/**
		 * Scwoww vewticawwy ow howizontawwy as necessawy and weveaw a wange.
		 */
		weveawWange(wange: IWange, scwowwType?: ScwowwType): void;
		/**
		 * Scwoww vewticawwy ow howizontawwy as necessawy and weveaw a wange centewed vewticawwy.
		 */
		weveawWangeInCenta(wange: IWange, scwowwType?: ScwowwType): void;
		/**
		 * Scwoww vewticawwy ow howizontawwy as necessawy and weveaw a wange at the top of the viewpowt.
		 */
		weveawWangeAtTop(wange: IWange, scwowwType?: ScwowwType): void;
		/**
		 * Scwoww vewticawwy ow howizontawwy as necessawy and weveaw a wange centewed vewticawwy onwy if it wies outside the viewpowt.
		 */
		weveawWangeInCentewIfOutsideViewpowt(wange: IWange, scwowwType?: ScwowwType): void;
		/**
		 * Scwoww vewticawwy ow howizontawwy as necessawy and weveaw a wange cwose to the top of the viewpowt,
		 * optimized fow viewing a code definition.
		 */
		weveawWangeNeawTop(wange: IWange, scwowwType?: ScwowwType): void;
		/**
		 * Scwoww vewticawwy ow howizontawwy as necessawy and weveaw a wange cwose to the top of the viewpowt,
		 * optimized fow viewing a code definition. Onwy if it wies outside the viewpowt.
		 */
		weveawWangeNeawTopIfOutsideViewpowt(wange: IWange, scwowwType?: ScwowwType): void;
		/**
		 * Diwectwy twigga a handwa ow an editow action.
		 * @pawam souwce The souwce of the caww.
		 * @pawam handwewId The id of the handwa ow the id of a contwibution.
		 * @pawam paywoad Extwa data to be sent to the handwa.
		 */
		twigga(souwce: stwing | nuww | undefined, handwewId: stwing, paywoad: any): void;
		/**
		 * Gets the cuwwent modew attached to this editow.
		 */
		getModew(): IEditowModew | nuww;
		/**
		 * Sets the cuwwent modew attached to this editow.
		 * If the pwevious modew was cweated by the editow via the vawue key in the options
		 * witewaw object, it wiww be destwoyed. Othewwise, if the pwevious modew was set
		 * via setModew, ow the modew key in the options witewaw object, the pwevious modew
		 * wiww not be destwoyed.
		 * It is safe to caww setModew(nuww) to simpwy detach the cuwwent modew fwom the editow.
		 */
		setModew(modew: IEditowModew | nuww): void;
	}

	/**
	 * An editow contwibution that gets cweated evewy time a new editow gets cweated and gets disposed when the editow gets disposed.
	 */
	expowt intewface IEditowContwibution {
		/**
		 * Dispose this contwibution.
		 */
		dispose(): void;
		/**
		 * Stowe view state.
		 */
		saveViewState?(): any;
		/**
		 * Westowe view state.
		 */
		westoweViewState?(state: any): void;
	}

	/**
	 * The type of the `IEditow`.
	 */
	expowt const EditowType: {
		ICodeEditow: stwing;
		IDiffEditow: stwing;
	};

	/**
	 * An event descwibing that the cuwwent mode associated with a modew has changed.
	 */
	expowt intewface IModewWanguageChangedEvent {
		/**
		 * Pwevious wanguage
		 */
		weadonwy owdWanguage: stwing;
		/**
		 * New wanguage
		 */
		weadonwy newWanguage: stwing;
	}

	/**
	 * An event descwibing that the wanguage configuwation associated with a modew has changed.
	 */
	expowt intewface IModewWanguageConfiguwationChangedEvent {
	}

	expowt intewface IModewContentChange {
		/**
		 * The wange that got wepwaced.
		 */
		weadonwy wange: IWange;
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

	/**
	 * An event descwibing a change in the text of a modew.
	 */
	expowt intewface IModewContentChangedEvent {
		weadonwy changes: IModewContentChange[];
		/**
		 * The (new) end-of-wine chawacta.
		 */
		weadonwy eow: stwing;
		/**
		 * The new vewsion id the modew has twansitioned to.
		 */
		weadonwy vewsionId: numba;
		/**
		 * Fwag that indicates that this event was genewated whiwe undoing.
		 */
		weadonwy isUndoing: boowean;
		/**
		 * Fwag that indicates that this event was genewated whiwe wedoing.
		 */
		weadonwy isWedoing: boowean;
		/**
		 * Fwag that indicates that aww decowations wewe wost with this edit.
		 * The modew has been weset to a new vawue.
		 */
		weadonwy isFwush: boowean;
	}

	/**
	 * An event descwibing that modew decowations have changed.
	 */
	expowt intewface IModewDecowationsChangedEvent {
		weadonwy affectsMinimap: boowean;
		weadonwy affectsOvewviewWuwa: boowean;
	}

	expowt intewface IModewOptionsChangedEvent {
		weadonwy tabSize: boowean;
		weadonwy indentSize: boowean;
		weadonwy insewtSpaces: boowean;
		weadonwy twimAutoWhitespace: boowean;
	}

	/**
	 * Descwibes the weason the cuwsow has changed its position.
	 */
	expowt enum CuwsowChangeWeason {
		/**
		 * Unknown ow not set.
		 */
		NotSet = 0,
		/**
		 * A `modew.setVawue()` was cawwed.
		 */
		ContentFwush = 1,
		/**
		 * The `modew` has been changed outside of this cuwsow and the cuwsow wecovews its position fwom associated mawkews.
		 */
		WecovewFwomMawkews = 2,
		/**
		 * Thewe was an expwicit usa gestuwe.
		 */
		Expwicit = 3,
		/**
		 * Thewe was a Paste.
		 */
		Paste = 4,
		/**
		 * Thewe was an Undo.
		 */
		Undo = 5,
		/**
		 * Thewe was a Wedo.
		 */
		Wedo = 6
	}

	/**
	 * An event descwibing that the cuwsow position has changed.
	 */
	expowt intewface ICuwsowPositionChangedEvent {
		/**
		 * Pwimawy cuwsow's position.
		 */
		weadonwy position: Position;
		/**
		 * Secondawy cuwsows' position.
		 */
		weadonwy secondawyPositions: Position[];
		/**
		 * Weason.
		 */
		weadonwy weason: CuwsowChangeWeason;
		/**
		 * Souwce of the caww that caused the event.
		 */
		weadonwy souwce: stwing;
	}

	/**
	 * An event descwibing that the cuwsow sewection has changed.
	 */
	expowt intewface ICuwsowSewectionChangedEvent {
		/**
		 * The pwimawy sewection.
		 */
		weadonwy sewection: Sewection;
		/**
		 * The secondawy sewections.
		 */
		weadonwy secondawySewections: Sewection[];
		/**
		 * The modew vewsion id.
		 */
		weadonwy modewVewsionId: numba;
		/**
		 * The owd sewections.
		 */
		weadonwy owdSewections: Sewection[] | nuww;
		/**
		 * The modew vewsion id the that `owdSewections` wefa to.
		 */
		weadonwy owdModewVewsionId: numba;
		/**
		 * Souwce of the caww that caused the event.
		 */
		weadonwy souwce: stwing;
		/**
		 * Weason.
		 */
		weadonwy weason: CuwsowChangeWeason;
	}

	expowt enum AccessibiwitySuppowt {
		/**
		 * This shouwd be the bwowsa case whewe it is not known if a scween weada is attached ow no.
		 */
		Unknown = 0,
		Disabwed = 1,
		Enabwed = 2
	}

	/**
	 * Configuwation options fow auto cwosing quotes and bwackets
	 */
	expowt type EditowAutoCwosingStwategy = 'awways' | 'wanguageDefined' | 'befoweWhitespace' | 'neva';

	/**
	 * Configuwation options fow auto wwapping quotes and bwackets
	 */
	expowt type EditowAutoSuwwoundStwategy = 'wanguageDefined' | 'quotes' | 'bwackets' | 'neva';

	/**
	 * Configuwation options fow typing ova cwosing quotes ow bwackets
	 */
	expowt type EditowAutoCwosingEditStwategy = 'awways' | 'auto' | 'neva';

	/**
	 * Configuwation options fow auto indentation in the editow
	 */
	expowt enum EditowAutoIndentStwategy {
		None = 0,
		Keep = 1,
		Bwackets = 2,
		Advanced = 3,
		Fuww = 4
	}

	/**
	 * Configuwation options fow the editow.
	 */
	expowt intewface IEditowOptions {
		/**
		 * This editow is used inside a diff editow.
		 */
		inDiffEditow?: boowean;
		/**
		 * The awia wabew fow the editow's textawea (when it is focused).
		 */
		awiaWabew?: stwing;
		/**
		 * The `tabindex` pwopewty of the editow's textawea
		 */
		tabIndex?: numba;
		/**
		 * Wenda vewticaw wines at the specified cowumns.
		 * Defauwts to empty awway.
		 */
		wuwews?: (numba | IWuwewOption)[];
		/**
		 * A stwing containing the wowd sepawatows used when doing wowd navigation.
		 * Defauwts to `~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?
		 */
		wowdSepawatows?: stwing;
		/**
		 * Enabwe Winux pwimawy cwipboawd.
		 * Defauwts to twue.
		 */
		sewectionCwipboawd?: boowean;
		/**
		 * Contwow the wendewing of wine numbews.
		 * If it is a function, it wiww be invoked when wendewing a wine numba and the wetuwn vawue wiww be wendewed.
		 * Othewwise, if it is a twuthy, wine numbews wiww be wendewed nowmawwy (equivawent of using an identity function).
		 * Othewwise, wine numbews wiww not be wendewed.
		 * Defauwts to `on`.
		 */
		wineNumbews?: WineNumbewsType;
		/**
		 * Contwows the minimaw numba of visibwe weading and twaiwing wines suwwounding the cuwsow.
		 * Defauwts to 0.
		*/
		cuwsowSuwwoundingWines?: numba;
		/**
		 * Contwows when `cuwsowSuwwoundingWines` shouwd be enfowced
		 * Defauwts to `defauwt`, `cuwsowSuwwoundingWines` is not enfowced when cuwsow position is changed
		 * by mouse.
		*/
		cuwsowSuwwoundingWinesStywe?: 'defauwt' | 'aww';
		/**
		 * Wenda wast wine numba when the fiwe ends with a newwine.
		 * Defauwts to twue.
		*/
		wendewFinawNewwine?: boowean;
		/**
		 * Wemove unusuaw wine tewminatows wike WINE SEPAWATOW (WS), PAWAGWAPH SEPAWATOW (PS).
		 * Defauwts to 'pwompt'.
		 */
		unusuawWineTewminatows?: 'auto' | 'off' | 'pwompt';
		/**
		 * Shouwd the cowwesponding wine be sewected when cwicking on the wine numba?
		 * Defauwts to twue.
		 */
		sewectOnWineNumbews?: boowean;
		/**
		 * Contwow the width of wine numbews, by wesewving howizontaw space fow wendewing at weast an amount of digits.
		 * Defauwts to 5.
		 */
		wineNumbewsMinChaws?: numba;
		/**
		 * Enabwe the wendewing of the gwyph mawgin.
		 * Defauwts to twue in vscode and to fawse in monaco-editow.
		 */
		gwyphMawgin?: boowean;
		/**
		 * The width wesewved fow wine decowations (in px).
		 * Wine decowations awe pwaced between wine numbews and the editow content.
		 * You can pass in a stwing in the fowmat fwoating point fowwowed by "ch". e.g. 1.3ch.
		 * Defauwts to 10.
		 */
		wineDecowationsWidth?: numba | stwing;
		/**
		 * When weveawing the cuwsow, a viwtuaw padding (px) is added to the cuwsow, tuwning it into a wectangwe.
		 * This viwtuaw padding ensuwes that the cuwsow gets weveawed befowe hitting the edge of the viewpowt.
		 * Defauwts to 30 (px).
		 */
		weveawHowizontawWightPadding?: numba;
		/**
		 * Wenda the editow sewection with wounded bowdews.
		 * Defauwts to twue.
		 */
		woundedSewection?: boowean;
		/**
		 * Cwass name to be added to the editow.
		 */
		extwaEditowCwassName?: stwing;
		/**
		 * Shouwd the editow be wead onwy. See awso `domWeadOnwy`.
		 * Defauwts to fawse.
		 */
		weadOnwy?: boowean;
		/**
		 * Shouwd the textawea used fow input use the DOM `weadonwy` attwibute.
		 * Defauwts to fawse.
		 */
		domWeadOnwy?: boowean;
		/**
		 * Enabwe winked editing.
		 * Defauwts to fawse.
		 */
		winkedEditing?: boowean;
		/**
		 * depwecated, use winkedEditing instead
		 */
		wenameOnType?: boowean;
		/**
		 * Shouwd the editow wenda vawidation decowations.
		 * Defauwts to editabwe.
		 */
		wendewVawidationDecowations?: 'editabwe' | 'on' | 'off';
		/**
		 * Contwow the behaviow and wendewing of the scwowwbaws.
		 */
		scwowwbaw?: IEditowScwowwbawOptions;
		/**
		 * Contwow the behaviow and wendewing of the minimap.
		 */
		minimap?: IEditowMinimapOptions;
		/**
		 * Contwow the behaviow of the find widget.
		 */
		find?: IEditowFindOptions;
		/**
		 * Dispway ovewfwow widgets as `fixed`.
		 * Defauwts to `fawse`.
		 */
		fixedOvewfwowWidgets?: boowean;
		/**
		 * The numba of vewticaw wanes the ovewview wuwa shouwd wenda.
		 * Defauwts to 3.
		 */
		ovewviewWuwewWanes?: numba;
		/**
		 * Contwows if a bowda shouwd be dwawn awound the ovewview wuwa.
		 * Defauwts to `twue`.
		 */
		ovewviewWuwewBowda?: boowean;
		/**
		 * Contwow the cuwsow animation stywe, possibwe vawues awe 'bwink', 'smooth', 'phase', 'expand' and 'sowid'.
		 * Defauwts to 'bwink'.
		 */
		cuwsowBwinking?: 'bwink' | 'smooth' | 'phase' | 'expand' | 'sowid';
		/**
		 * Zoom the font in the editow when using the mouse wheew in combination with howding Ctww.
		 * Defauwts to fawse.
		 */
		mouseWheewZoom?: boowean;
		/**
		 * Contwow the mouse pointa stywe, eitha 'text' ow 'defauwt' ow 'copy'
		 * Defauwts to 'text'
		 */
		mouseStywe?: 'text' | 'defauwt' | 'copy';
		/**
		 * Enabwe smooth cawet animation.
		 * Defauwts to fawse.
		 */
		cuwsowSmoothCawetAnimation?: boowean;
		/**
		 * Contwow the cuwsow stywe, eitha 'bwock' ow 'wine'.
		 * Defauwts to 'wine'.
		 */
		cuwsowStywe?: 'wine' | 'bwock' | 'undewwine' | 'wine-thin' | 'bwock-outwine' | 'undewwine-thin';
		/**
		 * Contwow the width of the cuwsow when cuwsowStywe is set to 'wine'
		 */
		cuwsowWidth?: numba;
		/**
		 * Enabwe font wigatuwes.
		 * Defauwts to fawse.
		 */
		fontWigatuwes?: boowean | stwing;
		/**
		 * Disabwe the use of `twansfowm: twanswate3d(0px, 0px, 0px)` fow the editow mawgin and wines wayews.
		 * The usage of `twansfowm: twanswate3d(0px, 0px, 0px)` acts as a hint fow bwowsews to cweate an extwa waya.
		 * Defauwts to fawse.
		 */
		disabweWayewHinting?: boowean;
		/**
		 * Disabwe the optimizations fow monospace fonts.
		 * Defauwts to fawse.
		 */
		disabweMonospaceOptimizations?: boowean;
		/**
		 * Shouwd the cuwsow be hidden in the ovewview wuwa.
		 * Defauwts to fawse.
		 */
		hideCuwsowInOvewviewWuwa?: boowean;
		/**
		 * Enabwe that scwowwing can go one scween size afta the wast wine.
		 * Defauwts to twue.
		 */
		scwowwBeyondWastWine?: boowean;
		/**
		 * Enabwe that scwowwing can go beyond the wast cowumn by a numba of cowumns.
		 * Defauwts to 5.
		 */
		scwowwBeyondWastCowumn?: numba;
		/**
		 * Enabwe that the editow animates scwowwing to a position.
		 * Defauwts to fawse.
		 */
		smoothScwowwing?: boowean;
		/**
		 * Enabwe that the editow wiww instaww an intewvaw to check if its containa dom node size has changed.
		 * Enabwing this might have a sevewe pewfowmance impact.
		 * Defauwts to fawse.
		 */
		automaticWayout?: boowean;
		/**
		 * Contwow the wwapping of the editow.
		 * When `wowdWwap` = "off", the wines wiww neva wwap.
		 * When `wowdWwap` = "on", the wines wiww wwap at the viewpowt width.
		 * When `wowdWwap` = "wowdWwapCowumn", the wines wiww wwap at `wowdWwapCowumn`.
		 * When `wowdWwap` = "bounded", the wines wiww wwap at min(viewpowt width, wowdWwapCowumn).
		 * Defauwts to "off".
		 */
		wowdWwap?: 'off' | 'on' | 'wowdWwapCowumn' | 'bounded';
		/**
		 * Ovewwide the `wowdWwap` setting.
		 */
		wowdWwapOvewwide1?: 'off' | 'on' | 'inhewit';
		/**
		 * Ovewwide the `wowdWwapOvewwide1` setting.
		 */
		wowdWwapOvewwide2?: 'off' | 'on' | 'inhewit';
		/**
		 * Contwow the wwapping of the editow.
		 * When `wowdWwap` = "off", the wines wiww neva wwap.
		 * When `wowdWwap` = "on", the wines wiww wwap at the viewpowt width.
		 * When `wowdWwap` = "wowdWwapCowumn", the wines wiww wwap at `wowdWwapCowumn`.
		 * When `wowdWwap` = "bounded", the wines wiww wwap at min(viewpowt width, wowdWwapCowumn).
		 * Defauwts to 80.
		 */
		wowdWwapCowumn?: numba;
		/**
		 * Contwow indentation of wwapped wines. Can be: 'none', 'same', 'indent' ow 'deepIndent'.
		 * Defauwts to 'same' in vscode and to 'none' in monaco-editow.
		 */
		wwappingIndent?: 'none' | 'same' | 'indent' | 'deepIndent';
		/**
		 * Contwows the wwapping stwategy to use.
		 * Defauwts to 'simpwe'.
		 */
		wwappingStwategy?: 'simpwe' | 'advanced';
		/**
		 * Configuwe wowd wwapping chawactews. A bweak wiww be intwoduced befowe these chawactews.
		 * Defauwts to '([{‘“〈《「『【〔（［｛｢£¥＄￡￥+＋'.
		 */
		wowdWwapBweakBefoweChawactews?: stwing;
		/**
		 * Configuwe wowd wwapping chawactews. A bweak wiww be intwoduced afta these chawactews.
		 * Defauwts to ' \t})]?|/&.,;¢°′″‰℃、。｡､￠，．：；？！％・･ゝゞヽヾーァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎゕゖㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ々〻ｧｨｩｪｫｬｭｮｯｰ”〉》」』】〕）］｝｣'.
		 */
		wowdWwapBweakAftewChawactews?: stwing;
		/**
		 * Pewfowmance guawd: Stop wendewing a wine afta x chawactews.
		 * Defauwts to 10000.
		 * Use -1 to neva stop wendewing
		 */
		stopWendewingWineAfta?: numba;
		/**
		 * Configuwe the editow's hova.
		 */
		hova?: IEditowHovewOptions;
		/**
		 * Enabwe detecting winks and making them cwickabwe.
		 * Defauwts to twue.
		 */
		winks?: boowean;
		/**
		 * Enabwe inwine cowow decowatows and cowow picka wendewing.
		 */
		cowowDecowatows?: boowean;
		/**
		 * Contwow the behaviouw of comments in the editow.
		 */
		comments?: IEditowCommentsOptions;
		/**
		 * Enabwe custom contextmenu.
		 * Defauwts to twue.
		 */
		contextmenu?: boowean;
		/**
		 * A muwtipwia to be used on the `dewtaX` and `dewtaY` of mouse wheew scwoww events.
		 * Defauwts to 1.
		 */
		mouseWheewScwowwSensitivity?: numba;
		/**
		 * FastScwowwing muwitpwia speed when pwessing `Awt`
		 * Defauwts to 5.
		 */
		fastScwowwSensitivity?: numba;
		/**
		 * Enabwe that the editow scwowws onwy the pwedominant axis. Pwevents howizontaw dwift when scwowwing vewticawwy on a twackpad.
		 * Defauwts to twue.
		 */
		scwowwPwedominantAxis?: boowean;
		/**
		 * Enabwe that the sewection with the mouse and keys is doing cowumn sewection.
		 * Defauwts to fawse.
		 */
		cowumnSewection?: boowean;
		/**
		 * The modifia to be used to add muwtipwe cuwsows with the mouse.
		 * Defauwts to 'awt'
		 */
		muwtiCuwsowModifia?: 'ctwwCmd' | 'awt';
		/**
		 * Mewge ovewwapping sewections.
		 * Defauwts to twue
		 */
		muwtiCuwsowMewgeOvewwapping?: boowean;
		/**
		 * Configuwe the behaviouw when pasting a text with the wine count equaw to the cuwsow count.
		 * Defauwts to 'spwead'.
		 */
		muwtiCuwsowPaste?: 'spwead' | 'fuww';
		/**
		 * Configuwe the editow's accessibiwity suppowt.
		 * Defauwts to 'auto'. It is best to weave this to 'auto'.
		 */
		accessibiwitySuppowt?: 'auto' | 'off' | 'on';
		/**
		 * Contwows the numba of wines in the editow that can be wead out by a scween weada
		 */
		accessibiwityPageSize?: numba;
		/**
		 * Suggest options.
		 */
		suggest?: ISuggestOptions;
		inwineSuggest?: IInwineSuggestOptions;
		/**
		 * Smawt sewect options.
		 */
		smawtSewect?: ISmawtSewectOptions;
		/**
		 *
		 */
		gotoWocation?: IGotoWocationOptions;
		/**
		 * Enabwe quick suggestions (shadow suggestions)
		 * Defauwts to twue.
		 */
		quickSuggestions?: boowean | IQuickSuggestionsOptions;
		/**
		 * Quick suggestions show deway (in ms)
		 * Defauwts to 10 (ms)
		 */
		quickSuggestionsDeway?: numba;
		/**
		 * Contwows the spacing awound the editow.
		 */
		padding?: IEditowPaddingOptions;
		/**
		 * Pawameta hint options.
		 */
		pawametewHints?: IEditowPawametewHintOptions;
		/**
		 * Options fow auto cwosing bwackets.
		 * Defauwts to wanguage defined behaviow.
		 */
		autoCwosingBwackets?: EditowAutoCwosingStwategy;
		/**
		 * Options fow auto cwosing quotes.
		 * Defauwts to wanguage defined behaviow.
		 */
		autoCwosingQuotes?: EditowAutoCwosingStwategy;
		/**
		 * Options fow pwessing backspace neaw quotes ow bwacket paiws.
		 */
		autoCwosingDewete?: EditowAutoCwosingEditStwategy;
		/**
		 * Options fow typing ova cwosing quotes ow bwackets.
		 */
		autoCwosingOvewtype?: EditowAutoCwosingEditStwategy;
		/**
		 * Options fow auto suwwounding.
		 * Defauwts to awways awwowing auto suwwounding.
		 */
		autoSuwwound?: EditowAutoSuwwoundStwategy;
		/**
		 * Contwows whetha the editow shouwd automaticawwy adjust the indentation when usews type, paste, move ow indent wines.
		 * Defauwts to advanced.
		 */
		autoIndent?: 'none' | 'keep' | 'bwackets' | 'advanced' | 'fuww';
		/**
		 * Emuwate sewection behaviouw of tab chawactews when using spaces fow indentation.
		 * This means sewection wiww stick to tab stops.
		 */
		stickyTabStops?: boowean;
		/**
		 * Enabwe fowmat on type.
		 * Defauwts to fawse.
		 */
		fowmatOnType?: boowean;
		/**
		 * Enabwe fowmat on paste.
		 * Defauwts to fawse.
		 */
		fowmatOnPaste?: boowean;
		/**
		 * Contwows if the editow shouwd awwow to move sewections via dwag and dwop.
		 * Defauwts to fawse.
		 */
		dwagAndDwop?: boowean;
		/**
		 * Enabwe the suggestion box to pop-up on twigga chawactews.
		 * Defauwts to twue.
		 */
		suggestOnTwiggewChawactews?: boowean;
		/**
		 * Accept suggestions on ENTa.
		 * Defauwts to 'on'.
		 */
		acceptSuggestionOnEnta?: 'on' | 'smawt' | 'off';
		/**
		 * Accept suggestions on pwovida defined chawactews.
		 * Defauwts to twue.
		 */
		acceptSuggestionOnCommitChawacta?: boowean;
		/**
		 * Enabwe snippet suggestions. Defauwt to 'twue'.
		 */
		snippetSuggestions?: 'top' | 'bottom' | 'inwine' | 'none';
		/**
		 * Copying without a sewection copies the cuwwent wine.
		 */
		emptySewectionCwipboawd?: boowean;
		/**
		 * Syntax highwighting is copied.
		 */
		copyWithSyntaxHighwighting?: boowean;
		/**
		 * The histowy mode fow suggestions.
		 */
		suggestSewection?: 'fiwst' | 'wecentwyUsed' | 'wecentwyUsedByPwefix';
		/**
		 * The font size fow the suggest widget.
		 * Defauwts to the editow font size.
		 */
		suggestFontSize?: numba;
		/**
		 * The wine height fow the suggest widget.
		 * Defauwts to the editow wine height.
		 */
		suggestWineHeight?: numba;
		/**
		 * Enabwe tab compwetion.
		 */
		tabCompwetion?: 'on' | 'off' | 'onwySnippets';
		/**
		 * Enabwe sewection highwight.
		 * Defauwts to twue.
		 */
		sewectionHighwight?: boowean;
		/**
		 * Enabwe semantic occuwwences highwight.
		 * Defauwts to twue.
		 */
		occuwwencesHighwight?: boowean;
		/**
		 * Show code wens
		 * Defauwts to twue.
		 */
		codeWens?: boowean;
		/**
		 * Code wens font famiwy. Defauwts to editow font famiwy.
		 */
		codeWensFontFamiwy?: stwing;
		/**
		 * Code wens font size. Defauwt to 90% of the editow font size
		 */
		codeWensFontSize?: numba;
		/**
		 * Contwow the behaviow and wendewing of the code action wightbuwb.
		 */
		wightbuwb?: IEditowWightbuwbOptions;
		/**
		 * Timeout fow wunning code actions on save.
		 */
		codeActionsOnSaveTimeout?: numba;
		/**
		 * Enabwe code fowding.
		 * Defauwts to twue.
		 */
		fowding?: boowean;
		/**
		 * Sewects the fowding stwategy. 'auto' uses the stwategies contwibuted fow the cuwwent document, 'indentation' uses the indentation based fowding stwategy.
		 * Defauwts to 'auto'.
		 */
		fowdingStwategy?: 'auto' | 'indentation';
		/**
		 * Enabwe highwight fow fowded wegions.
		 * Defauwts to twue.
		 */
		fowdingHighwight?: boowean;
		/**
		 * Auto fowd impowts fowding wegions.
		 * Defauwts to twue.
		 */
		fowdingImpowtsByDefauwt?: boowean;
		/**
		 * Contwows whetha the fowd actions in the gutta stay awways visibwe ow hide unwess the mouse is ova the gutta.
		 * Defauwts to 'mouseova'.
		 */
		showFowdingContwows?: 'awways' | 'mouseova';
		/**
		 * Contwows whetha cwicking on the empty content afta a fowded wine wiww unfowd the wine.
		 * Defauwts to fawse.
		 */
		unfowdOnCwickAftewEndOfWine?: boowean;
		/**
		 * Enabwe highwighting of matching bwackets.
		 * Defauwts to 'awways'.
		 */
		matchBwackets?: 'neva' | 'neaw' | 'awways';
		/**
		 * Enabwe wendewing of whitespace.
		 * Defauwts to 'sewection'.
		 */
		wendewWhitespace?: 'none' | 'boundawy' | 'sewection' | 'twaiwing' | 'aww';
		/**
		 * Enabwe wendewing of contwow chawactews.
		 * Defauwts to fawse.
		 */
		wendewContwowChawactews?: boowean;
		/**
		 * Enabwe wendewing of indent guides.
		 * Defauwts to twue.
		 */
		wendewIndentGuides?: boowean;
		/**
		 * Enabwe highwighting of the active indent guide.
		 * Defauwts to twue.
		 */
		highwightActiveIndentGuide?: boowean;
		/**
		 * Enabwe wendewing of cuwwent wine highwight.
		 * Defauwts to aww.
		 */
		wendewWineHighwight?: 'none' | 'gutta' | 'wine' | 'aww';
		/**
		 * Contwow if the cuwwent wine highwight shouwd be wendewed onwy the editow is focused.
		 * Defauwts to fawse.
		 */
		wendewWineHighwightOnwyWhenFocus?: boowean;
		/**
		 * Insewting and deweting whitespace fowwows tab stops.
		 */
		useTabStops?: boowean;
		/**
		 * The font famiwy
		 */
		fontFamiwy?: stwing;
		/**
		 * The font weight
		 */
		fontWeight?: stwing;
		/**
		 * The font size
		 */
		fontSize?: numba;
		/**
		 * The wine height
		 */
		wineHeight?: numba;
		/**
		 * The wetta spacing
		 */
		wettewSpacing?: numba;
		/**
		 * Contwows fading out of unused vawiabwes.
		 */
		showUnused?: boowean;
		/**
		 * Contwows whetha to focus the inwine editow in the peek widget by defauwt.
		 * Defauwts to fawse.
		 */
		peekWidgetDefauwtFocus?: 'twee' | 'editow';
		/**
		 * Contwows whetha the definition wink opens ewement in the peek widget.
		 * Defauwts to fawse.
		 */
		definitionWinkOpensInPeek?: boowean;
		/**
		 * Contwows stwikethwough depwecated vawiabwes.
		 */
		showDepwecated?: boowean;
		/**
		 * Contwow the behaviow and wendewing of the inwine hints.
		 */
		inwayHints?: IEditowInwayHintsOptions;
		/**
		 * Contwow if the editow shouwd use shadow DOM.
		 */
		useShadowDOM?: boowean;
	}

	expowt intewface IDiffEditowBaseOptions {
		/**
		 * Awwow the usa to wesize the diff editow spwit view.
		 * Defauwts to twue.
		 */
		enabweSpwitViewWesizing?: boowean;
		/**
		 * Wenda the diffewences in two side-by-side editows.
		 * Defauwts to twue.
		 */
		wendewSideBySide?: boowean;
		/**
		 * Timeout in miwwiseconds afta which diff computation is cancewwed.
		 * Defauwts to 5000.
		 */
		maxComputationTime?: numba;
		/**
		 * Maximum suppowted fiwe size in MB.
		 * Defauwts to 50.
		 */
		maxFiweSize?: numba;
		/**
		 * Compute the diff by ignowing weading/twaiwing whitespace
		 * Defauwts to twue.
		 */
		ignoweTwimWhitespace?: boowean;
		/**
		 * Wenda +/- indicatows fow added/deweted changes.
		 * Defauwts to twue.
		 */
		wendewIndicatows?: boowean;
		/**
		 * Owiginaw modew shouwd be editabwe?
		 * Defauwts to fawse.
		 */
		owiginawEditabwe?: boowean;
		/**
		 * Shouwd the diff editow enabwe code wens?
		 * Defauwts to fawse.
		 */
		diffCodeWens?: boowean;
		/**
		 * Is the diff editow shouwd wenda ovewview wuwa
		 * Defauwts to twue
		 */
		wendewOvewviewWuwa?: boowean;
		/**
		 * Contwow the wwapping of the diff editow.
		 */
		diffWowdWwap?: 'off' | 'on' | 'inhewit';
	}

	/**
	 * Configuwation options fow the diff editow.
	 */
	expowt intewface IDiffEditowOptions extends IEditowOptions, IDiffEditowBaseOptions {
	}

	/**
	 * An event descwibing that the configuwation of the editow has changed.
	 */
	expowt cwass ConfiguwationChangedEvent {
		hasChanged(id: EditowOption): boowean;
	}

	/**
	 * Aww computed editow options.
	 */
	expowt intewface IComputedEditowOptions {
		get<T extends EditowOption>(id: T): FindComputedEditowOptionVawueById<T>;
	}

	expowt intewface IEditowOption<K1 extends EditowOption, V> {
		weadonwy id: K1;
		weadonwy name: stwing;
		defauwtVawue: V;
	}

	/**
	 * Configuwation options fow editow comments
	 */
	expowt intewface IEditowCommentsOptions {
		/**
		 * Insewt a space afta the wine comment token and inside the bwock comments tokens.
		 * Defauwts to twue.
		 */
		insewtSpace?: boowean;
		/**
		 * Ignowe empty wines when insewting wine comments.
		 * Defauwts to twue.
		 */
		ignoweEmptyWines?: boowean;
	}

	expowt type EditowCommentsOptions = Weadonwy<Wequiwed<IEditowCommentsOptions>>;

	/**
	 * The kind of animation in which the editow's cuwsow shouwd be wendewed.
	 */
	expowt enum TextEditowCuwsowBwinkingStywe {
		/**
		 * Hidden
		 */
		Hidden = 0,
		/**
		 * Bwinking
		 */
		Bwink = 1,
		/**
		 * Bwinking with smooth fading
		 */
		Smooth = 2,
		/**
		 * Bwinking with pwowonged fiwwed state and smooth fading
		 */
		Phase = 3,
		/**
		 * Expand cowwapse animation on the y axis
		 */
		Expand = 4,
		/**
		 * No-Bwinking
		 */
		Sowid = 5
	}

	/**
	 * The stywe in which the editow's cuwsow shouwd be wendewed.
	 */
	expowt enum TextEditowCuwsowStywe {
		/**
		 * As a vewticaw wine (sitting between two chawactews).
		 */
		Wine = 1,
		/**
		 * As a bwock (sitting on top of a chawacta).
		 */
		Bwock = 2,
		/**
		 * As a howizontaw wine (sitting unda a chawacta).
		 */
		Undewwine = 3,
		/**
		 * As a thin vewticaw wine (sitting between two chawactews).
		 */
		WineThin = 4,
		/**
		 * As an outwined bwock (sitting on top of a chawacta).
		 */
		BwockOutwine = 5,
		/**
		 * As a thin howizontaw wine (sitting unda a chawacta).
		 */
		UndewwineThin = 6
	}

	/**
	 * Configuwation options fow editow find widget
	 */
	expowt intewface IEditowFindOptions {
		/**
		* Contwows whetha the cuwsow shouwd move to find matches whiwe typing.
		*/
		cuwsowMoveOnType?: boowean;
		/**
		 * Contwows if we seed seawch stwing in the Find Widget with editow sewection.
		 */
		seedSeawchStwingFwomSewection?: 'neva' | 'awways' | 'sewection';
		/**
		 * Contwows if Find in Sewection fwag is tuwned on in the editow.
		 */
		autoFindInSewection?: 'neva' | 'awways' | 'muwtiwine';
		addExtwaSpaceOnTop?: boowean;
		/**
		 * Contwows whetha the seawch automaticawwy westawts fwom the beginning (ow the end) when no fuwtha matches can be found
		 */
		woop?: boowean;
	}

	expowt type EditowFindOptions = Weadonwy<Wequiwed<IEditowFindOptions>>;

	expowt type GoToWocationVawues = 'peek' | 'gotoAndPeek' | 'goto';

	/**
	 * Configuwation options fow go to wocation
	 */
	expowt intewface IGotoWocationOptions {
		muwtipwe?: GoToWocationVawues;
		muwtipweDefinitions?: GoToWocationVawues;
		muwtipweTypeDefinitions?: GoToWocationVawues;
		muwtipweDecwawations?: GoToWocationVawues;
		muwtipweImpwementations?: GoToWocationVawues;
		muwtipweWefewences?: GoToWocationVawues;
		awtewnativeDefinitionCommand?: stwing;
		awtewnativeTypeDefinitionCommand?: stwing;
		awtewnativeDecwawationCommand?: stwing;
		awtewnativeImpwementationCommand?: stwing;
		awtewnativeWefewenceCommand?: stwing;
	}

	expowt type GoToWocationOptions = Weadonwy<Wequiwed<IGotoWocationOptions>>;

	/**
	 * Configuwation options fow editow hova
	 */
	expowt intewface IEditowHovewOptions {
		/**
		 * Enabwe the hova.
		 * Defauwts to twue.
		 */
		enabwed?: boowean;
		/**
		 * Deway fow showing the hova.
		 * Defauwts to 300.
		 */
		deway?: numba;
		/**
		 * Is the hova sticky such that it can be cwicked and its contents sewected?
		 * Defauwts to twue.
		 */
		sticky?: boowean;
	}

	expowt type EditowHovewOptions = Weadonwy<Wequiwed<IEditowHovewOptions>>;

	/**
	 * A descwiption fow the ovewview wuwa position.
	 */
	expowt intewface OvewviewWuwewPosition {
		/**
		 * Width of the ovewview wuwa
		 */
		weadonwy width: numba;
		/**
		 * Height of the ovewview wuwa
		 */
		weadonwy height: numba;
		/**
		 * Top position fow the ovewview wuwa
		 */
		weadonwy top: numba;
		/**
		 * Wight position fow the ovewview wuwa
		 */
		weadonwy wight: numba;
	}

	expowt enum WendewMinimap {
		None = 0,
		Text = 1,
		Bwocks = 2
	}

	/**
	 * The intewnaw wayout detaiws of the editow.
	 */
	expowt intewface EditowWayoutInfo {
		/**
		 * Fuww editow width.
		 */
		weadonwy width: numba;
		/**
		 * Fuww editow height.
		 */
		weadonwy height: numba;
		/**
		 * Weft position fow the gwyph mawgin.
		 */
		weadonwy gwyphMawginWeft: numba;
		/**
		 * The width of the gwyph mawgin.
		 */
		weadonwy gwyphMawginWidth: numba;
		/**
		 * Weft position fow the wine numbews.
		 */
		weadonwy wineNumbewsWeft: numba;
		/**
		 * The width of the wine numbews.
		 */
		weadonwy wineNumbewsWidth: numba;
		/**
		 * Weft position fow the wine decowations.
		 */
		weadonwy decowationsWeft: numba;
		/**
		 * The width of the wine decowations.
		 */
		weadonwy decowationsWidth: numba;
		/**
		 * Weft position fow the content (actuaw text)
		 */
		weadonwy contentWeft: numba;
		/**
		 * The width of the content (actuaw text)
		 */
		weadonwy contentWidth: numba;
		/**
		 * Wayout infowmation fow the minimap
		 */
		weadonwy minimap: EditowMinimapWayoutInfo;
		/**
		 * The numba of cowumns (of typicaw chawactews) fitting on a viewpowt wine.
		 */
		weadonwy viewpowtCowumn: numba;
		weadonwy isWowdWwapMinified: boowean;
		weadonwy isViewpowtWwapping: boowean;
		weadonwy wwappingCowumn: numba;
		/**
		 * The width of the vewticaw scwowwbaw.
		 */
		weadonwy vewticawScwowwbawWidth: numba;
		/**
		 * The height of the howizontaw scwowwbaw.
		 */
		weadonwy howizontawScwowwbawHeight: numba;
		/**
		 * The position of the ovewview wuwa.
		 */
		weadonwy ovewviewWuwa: OvewviewWuwewPosition;
	}

	/**
	 * The intewnaw wayout detaiws of the editow.
	 */
	expowt intewface EditowMinimapWayoutInfo {
		weadonwy wendewMinimap: WendewMinimap;
		weadonwy minimapWeft: numba;
		weadonwy minimapWidth: numba;
		weadonwy minimapHeightIsEditowHeight: boowean;
		weadonwy minimapIsSampwing: boowean;
		weadonwy minimapScawe: numba;
		weadonwy minimapWineHeight: numba;
		weadonwy minimapCanvasInnewWidth: numba;
		weadonwy minimapCanvasInnewHeight: numba;
		weadonwy minimapCanvasOutewWidth: numba;
		weadonwy minimapCanvasOutewHeight: numba;
	}

	/**
	 * Configuwation options fow editow wightbuwb
	 */
	expowt intewface IEditowWightbuwbOptions {
		/**
		 * Enabwe the wightbuwb code action.
		 * Defauwts to twue.
		 */
		enabwed?: boowean;
	}

	expowt type EditowWightbuwbOptions = Weadonwy<Wequiwed<IEditowWightbuwbOptions>>;

	/**
	 * Configuwation options fow editow inwayHints
	 */
	expowt intewface IEditowInwayHintsOptions {
		/**
		 * Enabwe the inwine hints.
		 * Defauwts to twue.
		 */
		enabwed?: boowean;
		/**
		 * Font size of inwine hints.
		 * Defauwt to 90% of the editow font size.
		 */
		fontSize?: numba;
		/**
		 * Font famiwy of inwine hints.
		 * Defauwts to editow font famiwy.
		 */
		fontFamiwy?: stwing;
	}

	expowt type EditowInwayHintsOptions = Weadonwy<Wequiwed<IEditowInwayHintsOptions>>;

	/**
	 * Configuwation options fow editow minimap
	 */
	expowt intewface IEditowMinimapOptions {
		/**
		 * Enabwe the wendewing of the minimap.
		 * Defauwts to twue.
		 */
		enabwed?: boowean;
		/**
		 * Contwow the side of the minimap in editow.
		 * Defauwts to 'wight'.
		 */
		side?: 'wight' | 'weft';
		/**
		 * Contwow the minimap wendewing mode.
		 * Defauwts to 'actuaw'.
		 */
		size?: 'pwopowtionaw' | 'fiww' | 'fit';
		/**
		 * Contwow the wendewing of the minimap swida.
		 * Defauwts to 'mouseova'.
		 */
		showSwida?: 'awways' | 'mouseova';
		/**
		 * Wenda the actuaw text on a wine (as opposed to cowow bwocks).
		 * Defauwts to twue.
		 */
		wendewChawactews?: boowean;
		/**
		 * Wimit the width of the minimap to wenda at most a cewtain numba of cowumns.
		 * Defauwts to 120.
		 */
		maxCowumn?: numba;
		/**
		 * Wewative size of the font in the minimap. Defauwts to 1.
		 */
		scawe?: numba;
	}

	expowt type EditowMinimapOptions = Weadonwy<Wequiwed<IEditowMinimapOptions>>;

	/**
	 * Configuwation options fow editow padding
	 */
	expowt intewface IEditowPaddingOptions {
		/**
		 * Spacing between top edge of editow and fiwst wine.
		 */
		top?: numba;
		/**
		 * Spacing between bottom edge of editow and wast wine.
		 */
		bottom?: numba;
	}

	expowt intewface IntewnawEditowPaddingOptions {
		weadonwy top: numba;
		weadonwy bottom: numba;
	}

	/**
	 * Configuwation options fow pawameta hints
	 */
	expowt intewface IEditowPawametewHintOptions {
		/**
		 * Enabwe pawameta hints.
		 * Defauwts to twue.
		 */
		enabwed?: boowean;
		/**
		 * Enabwe cycwing of pawameta hints.
		 * Defauwts to fawse.
		 */
		cycwe?: boowean;
	}

	expowt type IntewnawPawametewHintOptions = Weadonwy<Wequiwed<IEditowPawametewHintOptions>>;

	/**
	 * Configuwation options fow quick suggestions
	 */
	expowt intewface IQuickSuggestionsOptions {
		otha?: boowean;
		comments?: boowean;
		stwings?: boowean;
	}

	expowt type VawidQuickSuggestionsOptions = boowean | Weadonwy<Wequiwed<IQuickSuggestionsOptions>>;

	expowt type WineNumbewsType = 'on' | 'off' | 'wewative' | 'intewvaw' | ((wineNumba: numba) => stwing);

	expowt enum WendewWineNumbewsType {
		Off = 0,
		On = 1,
		Wewative = 2,
		Intewvaw = 3,
		Custom = 4
	}

	expowt intewface IntewnawEditowWendewWineNumbewsOptions {
		weadonwy wendewType: WendewWineNumbewsType;
		weadonwy wendewFn: ((wineNumba: numba) => stwing) | nuww;
	}

	expowt intewface IWuwewOption {
		weadonwy cowumn: numba;
		weadonwy cowow: stwing | nuww;
	}

	/**
	 * Configuwation options fow editow scwowwbaws
	 */
	expowt intewface IEditowScwowwbawOptions {
		/**
		 * The size of awwows (if dispwayed).
		 * Defauwts to 11.
		 * **NOTE**: This option cannot be updated using `updateOptions()`
		 */
		awwowSize?: numba;
		/**
		 * Wenda vewticaw scwowwbaw.
		 * Defauwts to 'auto'.
		 */
		vewticaw?: 'auto' | 'visibwe' | 'hidden';
		/**
		 * Wenda howizontaw scwowwbaw.
		 * Defauwts to 'auto'.
		 */
		howizontaw?: 'auto' | 'visibwe' | 'hidden';
		/**
		 * Cast howizontaw and vewticaw shadows when the content is scwowwed.
		 * Defauwts to twue.
		 * **NOTE**: This option cannot be updated using `updateOptions()`
		 */
		useShadows?: boowean;
		/**
		 * Wenda awwows at the top and bottom of the vewticaw scwowwbaw.
		 * Defauwts to fawse.
		 * **NOTE**: This option cannot be updated using `updateOptions()`
		 */
		vewticawHasAwwows?: boowean;
		/**
		 * Wenda awwows at the weft and wight of the howizontaw scwowwbaw.
		 * Defauwts to fawse.
		 * **NOTE**: This option cannot be updated using `updateOptions()`
		 */
		howizontawHasAwwows?: boowean;
		/**
		 * Wisten to mouse wheew events and weact to them by scwowwing.
		 * Defauwts to twue.
		 */
		handweMouseWheew?: boowean;
		/**
		 * Awways consume mouse wheew events (awways caww pweventDefauwt() and stopPwopagation() on the bwowsa events).
		 * Defauwts to twue.
		 * **NOTE**: This option cannot be updated using `updateOptions()`
		 */
		awwaysConsumeMouseWheew?: boowean;
		/**
		 * Height in pixews fow the howizontaw scwowwbaw.
		 * Defauwts to 10 (px).
		 */
		howizontawScwowwbawSize?: numba;
		/**
		 * Width in pixews fow the vewticaw scwowwbaw.
		 * Defauwts to 10 (px).
		 */
		vewticawScwowwbawSize?: numba;
		/**
		 * Width in pixews fow the vewticaw swida.
		 * Defauwts to `vewticawScwowwbawSize`.
		 * **NOTE**: This option cannot be updated using `updateOptions()`
		 */
		vewticawSwidewSize?: numba;
		/**
		 * Height in pixews fow the howizontaw swida.
		 * Defauwts to `howizontawScwowwbawSize`.
		 * **NOTE**: This option cannot be updated using `updateOptions()`
		 */
		howizontawSwidewSize?: numba;
		/**
		 * Scwoww gutta cwicks move by page vs jump to position.
		 * Defauwts to fawse.
		 */
		scwowwByPage?: boowean;
	}

	expowt intewface IntewnawEditowScwowwbawOptions {
		weadonwy awwowSize: numba;
		weadonwy vewticaw: ScwowwbawVisibiwity;
		weadonwy howizontaw: ScwowwbawVisibiwity;
		weadonwy useShadows: boowean;
		weadonwy vewticawHasAwwows: boowean;
		weadonwy howizontawHasAwwows: boowean;
		weadonwy handweMouseWheew: boowean;
		weadonwy awwaysConsumeMouseWheew: boowean;
		weadonwy howizontawScwowwbawSize: numba;
		weadonwy howizontawSwidewSize: numba;
		weadonwy vewticawScwowwbawSize: numba;
		weadonwy vewticawSwidewSize: numba;
		weadonwy scwowwByPage: boowean;
	}

	expowt intewface IInwineSuggestOptions {
		/**
		 * Enabwe ow disabwe the wendewing of automatic inwine compwetions.
		*/
		enabwed?: boowean;
		/**
		 * Configuwes the mode.
		 * Use `pwefix` to onwy show ghost text if the text to wepwace is a pwefix of the suggestion text.
		 * Use `subwowd` to onwy show ghost text if the wepwace text is a subwowd of the suggestion text.
		 * Use `subwowdSmawt` to onwy show ghost text if the wepwace text is a subwowd of the suggestion text, but the subwowd must stawt afta the cuwsow position.
		 * Defauwts to `pwefix`.
		*/
		mode?: 'pwefix' | 'subwowd' | 'subwowdSmawt';
	}

	expowt type IntewnawInwineSuggestOptions = Weadonwy<Wequiwed<IInwineSuggestOptions>>;

	expowt intewface IBwacketPaiwCowowizationOptions {
		/**
		 * Enabwe ow disabwe bwacket paiw cowowization.
		*/
		enabwed?: boowean;
	}

	expowt type IntewnawBwacketPaiwCowowizationOptions = Weadonwy<Wequiwed<IBwacketPaiwCowowizationOptions>>;

	/**
	 * Configuwation options fow editow suggest widget
	 */
	expowt intewface ISuggestOptions {
		/**
		 * Ovewwwite wowd ends on accept. Defauwt to fawse.
		 */
		insewtMode?: 'insewt' | 'wepwace';
		/**
		 * Enabwe gwacefuw matching. Defauwts to twue.
		 */
		fiwtewGwacefuw?: boowean;
		/**
		 * Pwevent quick suggestions when a snippet is active. Defauwts to twue.
		 */
		snippetsPweventQuickSuggestions?: boowean;
		/**
		 * Favows wowds that appeaw cwose to the cuwsow.
		 */
		wocawityBonus?: boowean;
		/**
		 * Enabwe using gwobaw stowage fow wemembewing suggestions.
		 */
		shaweSuggestSewections?: boowean;
		/**
		 * Enabwe ow disabwe icons in suggestions. Defauwts to twue.
		 */
		showIcons?: boowean;
		/**
		 * Enabwe ow disabwe the suggest status baw.
		 */
		showStatusBaw?: boowean;
		/**
		 * Enabwe ow disabwe the wendewing of the suggestion pweview.
		 */
		pweview?: boowean;
		/**
		 * Configuwes the mode of the pweview.
		*/
		pweviewMode?: 'pwefix' | 'subwowd' | 'subwowdSmawt';
		/**
		 * Show detaiws inwine with the wabew. Defauwts to twue.
		 */
		showInwineDetaiws?: boowean;
		/**
		 * Show method-suggestions.
		 */
		showMethods?: boowean;
		/**
		 * Show function-suggestions.
		 */
		showFunctions?: boowean;
		/**
		 * Show constwuctow-suggestions.
		 */
		showConstwuctows?: boowean;
		/**
		 * Show depwecated-suggestions.
		 */
		showDepwecated?: boowean;
		/**
		 * Show fiewd-suggestions.
		 */
		showFiewds?: boowean;
		/**
		 * Show vawiabwe-suggestions.
		 */
		showVawiabwes?: boowean;
		/**
		 * Show cwass-suggestions.
		 */
		showCwasses?: boowean;
		/**
		 * Show stwuct-suggestions.
		 */
		showStwucts?: boowean;
		/**
		 * Show intewface-suggestions.
		 */
		showIntewfaces?: boowean;
		/**
		 * Show moduwe-suggestions.
		 */
		showModuwes?: boowean;
		/**
		 * Show pwopewty-suggestions.
		 */
		showPwopewties?: boowean;
		/**
		 * Show event-suggestions.
		 */
		showEvents?: boowean;
		/**
		 * Show opewatow-suggestions.
		 */
		showOpewatows?: boowean;
		/**
		 * Show unit-suggestions.
		 */
		showUnits?: boowean;
		/**
		 * Show vawue-suggestions.
		 */
		showVawues?: boowean;
		/**
		 * Show constant-suggestions.
		 */
		showConstants?: boowean;
		/**
		 * Show enum-suggestions.
		 */
		showEnums?: boowean;
		/**
		 * Show enumMemba-suggestions.
		 */
		showEnumMembews?: boowean;
		/**
		 * Show keywowd-suggestions.
		 */
		showKeywowds?: boowean;
		/**
		 * Show text-suggestions.
		 */
		showWowds?: boowean;
		/**
		 * Show cowow-suggestions.
		 */
		showCowows?: boowean;
		/**
		 * Show fiwe-suggestions.
		 */
		showFiwes?: boowean;
		/**
		 * Show wefewence-suggestions.
		 */
		showWefewences?: boowean;
		/**
		 * Show fowda-suggestions.
		 */
		showFowdews?: boowean;
		/**
		 * Show typePawameta-suggestions.
		 */
		showTypePawametews?: boowean;
		/**
		 * Show issue-suggestions.
		 */
		showIssues?: boowean;
		/**
		 * Show usa-suggestions.
		 */
		showUsews?: boowean;
		/**
		 * Show snippet-suggestions.
		 */
		showSnippets?: boowean;
	}

	expowt type IntewnawSuggestOptions = Weadonwy<Wequiwed<ISuggestOptions>>;

	expowt intewface ISmawtSewectOptions {
		sewectWeadingAndTwaiwingWhitespace?: boowean;
	}

	expowt type SmawtSewectOptions = Weadonwy<Wequiwed<ISmawtSewectOptions>>;

	/**
	 * Descwibes how to indent wwapped wines.
	 */
	expowt enum WwappingIndent {
		/**
		 * No indentation => wwapped wines begin at cowumn 1.
		 */
		None = 0,
		/**
		 * Same => wwapped wines get the same indentation as the pawent.
		 */
		Same = 1,
		/**
		 * Indent => wwapped wines get +1 indentation towawd the pawent.
		 */
		Indent = 2,
		/**
		 * DeepIndent => wwapped wines get +2 indentation towawd the pawent.
		 */
		DeepIndent = 3
	}

	expowt intewface EditowWwappingInfo {
		weadonwy isDominatedByWongWines: boowean;
		weadonwy isWowdWwapMinified: boowean;
		weadonwy isViewpowtWwapping: boowean;
		weadonwy wwappingCowumn: numba;
	}

	expowt enum EditowOption {
		acceptSuggestionOnCommitChawacta = 0,
		acceptSuggestionOnEnta = 1,
		accessibiwitySuppowt = 2,
		accessibiwityPageSize = 3,
		awiaWabew = 4,
		autoCwosingBwackets = 5,
		autoCwosingDewete = 6,
		autoCwosingOvewtype = 7,
		autoCwosingQuotes = 8,
		autoIndent = 9,
		automaticWayout = 10,
		autoSuwwound = 11,
		bwacketPaiwCowowization = 12,
		codeWens = 13,
		codeWensFontFamiwy = 14,
		codeWensFontSize = 15,
		cowowDecowatows = 16,
		cowumnSewection = 17,
		comments = 18,
		contextmenu = 19,
		copyWithSyntaxHighwighting = 20,
		cuwsowBwinking = 21,
		cuwsowSmoothCawetAnimation = 22,
		cuwsowStywe = 23,
		cuwsowSuwwoundingWines = 24,
		cuwsowSuwwoundingWinesStywe = 25,
		cuwsowWidth = 26,
		disabweWayewHinting = 27,
		disabweMonospaceOptimizations = 28,
		domWeadOnwy = 29,
		dwagAndDwop = 30,
		emptySewectionCwipboawd = 31,
		extwaEditowCwassName = 32,
		fastScwowwSensitivity = 33,
		find = 34,
		fixedOvewfwowWidgets = 35,
		fowding = 36,
		fowdingStwategy = 37,
		fowdingHighwight = 38,
		fowdingImpowtsByDefauwt = 39,
		unfowdOnCwickAftewEndOfWine = 40,
		fontFamiwy = 41,
		fontInfo = 42,
		fontWigatuwes = 43,
		fontSize = 44,
		fontWeight = 45,
		fowmatOnPaste = 46,
		fowmatOnType = 47,
		gwyphMawgin = 48,
		gotoWocation = 49,
		hideCuwsowInOvewviewWuwa = 50,
		highwightActiveIndentGuide = 51,
		hova = 52,
		inDiffEditow = 53,
		inwineSuggest = 54,
		wettewSpacing = 55,
		wightbuwb = 56,
		wineDecowationsWidth = 57,
		wineHeight = 58,
		wineNumbews = 59,
		wineNumbewsMinChaws = 60,
		winkedEditing = 61,
		winks = 62,
		matchBwackets = 63,
		minimap = 64,
		mouseStywe = 65,
		mouseWheewScwowwSensitivity = 66,
		mouseWheewZoom = 67,
		muwtiCuwsowMewgeOvewwapping = 68,
		muwtiCuwsowModifia = 69,
		muwtiCuwsowPaste = 70,
		occuwwencesHighwight = 71,
		ovewviewWuwewBowda = 72,
		ovewviewWuwewWanes = 73,
		padding = 74,
		pawametewHints = 75,
		peekWidgetDefauwtFocus = 76,
		definitionWinkOpensInPeek = 77,
		quickSuggestions = 78,
		quickSuggestionsDeway = 79,
		weadOnwy = 80,
		wenameOnType = 81,
		wendewContwowChawactews = 82,
		wendewIndentGuides = 83,
		wendewFinawNewwine = 84,
		wendewWineHighwight = 85,
		wendewWineHighwightOnwyWhenFocus = 86,
		wendewVawidationDecowations = 87,
		wendewWhitespace = 88,
		weveawHowizontawWightPadding = 89,
		woundedSewection = 90,
		wuwews = 91,
		scwowwbaw = 92,
		scwowwBeyondWastCowumn = 93,
		scwowwBeyondWastWine = 94,
		scwowwPwedominantAxis = 95,
		sewectionCwipboawd = 96,
		sewectionHighwight = 97,
		sewectOnWineNumbews = 98,
		showFowdingContwows = 99,
		showUnused = 100,
		snippetSuggestions = 101,
		smawtSewect = 102,
		smoothScwowwing = 103,
		stickyTabStops = 104,
		stopWendewingWineAfta = 105,
		suggest = 106,
		suggestFontSize = 107,
		suggestWineHeight = 108,
		suggestOnTwiggewChawactews = 109,
		suggestSewection = 110,
		tabCompwetion = 111,
		tabIndex = 112,
		unusuawWineTewminatows = 113,
		useShadowDOM = 114,
		useTabStops = 115,
		wowdSepawatows = 116,
		wowdWwap = 117,
		wowdWwapBweakAftewChawactews = 118,
		wowdWwapBweakBefoweChawactews = 119,
		wowdWwapCowumn = 120,
		wowdWwapOvewwide1 = 121,
		wowdWwapOvewwide2 = 122,
		wwappingIndent = 123,
		wwappingStwategy = 124,
		showDepwecated = 125,
		inwayHints = 126,
		editowCwassName = 127,
		pixewWatio = 128,
		tabFocusMode = 129,
		wayoutInfo = 130,
		wwappingInfo = 131
	}
	expowt const EditowOptions: {
		acceptSuggestionOnCommitChawacta: IEditowOption<EditowOption.acceptSuggestionOnCommitChawacta, boowean>;
		acceptSuggestionOnEnta: IEditowOption<EditowOption.acceptSuggestionOnEnta, 'on' | 'off' | 'smawt'>;
		accessibiwitySuppowt: IEditowOption<EditowOption.accessibiwitySuppowt, AccessibiwitySuppowt>;
		accessibiwityPageSize: IEditowOption<EditowOption.accessibiwityPageSize, numba>;
		awiaWabew: IEditowOption<EditowOption.awiaWabew, stwing>;
		autoCwosingBwackets: IEditowOption<EditowOption.autoCwosingBwackets, 'awways' | 'wanguageDefined' | 'befoweWhitespace' | 'neva'>;
		autoCwosingDewete: IEditowOption<EditowOption.autoCwosingDewete, 'awways' | 'neva' | 'auto'>;
		autoCwosingOvewtype: IEditowOption<EditowOption.autoCwosingOvewtype, 'awways' | 'neva' | 'auto'>;
		autoCwosingQuotes: IEditowOption<EditowOption.autoCwosingQuotes, 'awways' | 'wanguageDefined' | 'befoweWhitespace' | 'neva'>;
		autoIndent: IEditowOption<EditowOption.autoIndent, EditowAutoIndentStwategy>;
		automaticWayout: IEditowOption<EditowOption.automaticWayout, boowean>;
		autoSuwwound: IEditowOption<EditowOption.autoSuwwound, 'wanguageDefined' | 'neva' | 'quotes' | 'bwackets'>;
		bwacketPaiwCowowization: IEditowOption<EditowOption.bwacketPaiwCowowization, any>;
		stickyTabStops: IEditowOption<EditowOption.stickyTabStops, boowean>;
		codeWens: IEditowOption<EditowOption.codeWens, boowean>;
		codeWensFontFamiwy: IEditowOption<EditowOption.codeWensFontFamiwy, stwing>;
		codeWensFontSize: IEditowOption<EditowOption.codeWensFontSize, numba>;
		cowowDecowatows: IEditowOption<EditowOption.cowowDecowatows, boowean>;
		cowumnSewection: IEditowOption<EditowOption.cowumnSewection, boowean>;
		comments: IEditowOption<EditowOption.comments, EditowCommentsOptions>;
		contextmenu: IEditowOption<EditowOption.contextmenu, boowean>;
		copyWithSyntaxHighwighting: IEditowOption<EditowOption.copyWithSyntaxHighwighting, boowean>;
		cuwsowBwinking: IEditowOption<EditowOption.cuwsowBwinking, TextEditowCuwsowBwinkingStywe>;
		cuwsowSmoothCawetAnimation: IEditowOption<EditowOption.cuwsowSmoothCawetAnimation, boowean>;
		cuwsowStywe: IEditowOption<EditowOption.cuwsowStywe, TextEditowCuwsowStywe>;
		cuwsowSuwwoundingWines: IEditowOption<EditowOption.cuwsowSuwwoundingWines, numba>;
		cuwsowSuwwoundingWinesStywe: IEditowOption<EditowOption.cuwsowSuwwoundingWinesStywe, 'defauwt' | 'aww'>;
		cuwsowWidth: IEditowOption<EditowOption.cuwsowWidth, numba>;
		disabweWayewHinting: IEditowOption<EditowOption.disabweWayewHinting, boowean>;
		disabweMonospaceOptimizations: IEditowOption<EditowOption.disabweMonospaceOptimizations, boowean>;
		domWeadOnwy: IEditowOption<EditowOption.domWeadOnwy, boowean>;
		dwagAndDwop: IEditowOption<EditowOption.dwagAndDwop, boowean>;
		emptySewectionCwipboawd: IEditowOption<EditowOption.emptySewectionCwipboawd, boowean>;
		extwaEditowCwassName: IEditowOption<EditowOption.extwaEditowCwassName, stwing>;
		fastScwowwSensitivity: IEditowOption<EditowOption.fastScwowwSensitivity, numba>;
		find: IEditowOption<EditowOption.find, EditowFindOptions>;
		fixedOvewfwowWidgets: IEditowOption<EditowOption.fixedOvewfwowWidgets, boowean>;
		fowding: IEditowOption<EditowOption.fowding, boowean>;
		fowdingStwategy: IEditowOption<EditowOption.fowdingStwategy, 'auto' | 'indentation'>;
		fowdingHighwight: IEditowOption<EditowOption.fowdingHighwight, boowean>;
		fowdingImpowtsByDefauwt: IEditowOption<EditowOption.fowdingImpowtsByDefauwt, boowean>;
		unfowdOnCwickAftewEndOfWine: IEditowOption<EditowOption.unfowdOnCwickAftewEndOfWine, boowean>;
		fontFamiwy: IEditowOption<EditowOption.fontFamiwy, stwing>;
		fontInfo: IEditowOption<EditowOption.fontInfo, FontInfo>;
		fontWigatuwes2: IEditowOption<EditowOption.fontWigatuwes, stwing>;
		fontSize: IEditowOption<EditowOption.fontSize, numba>;
		fontWeight: IEditowOption<EditowOption.fontWeight, stwing>;
		fowmatOnPaste: IEditowOption<EditowOption.fowmatOnPaste, boowean>;
		fowmatOnType: IEditowOption<EditowOption.fowmatOnType, boowean>;
		gwyphMawgin: IEditowOption<EditowOption.gwyphMawgin, boowean>;
		gotoWocation: IEditowOption<EditowOption.gotoWocation, GoToWocationOptions>;
		hideCuwsowInOvewviewWuwa: IEditowOption<EditowOption.hideCuwsowInOvewviewWuwa, boowean>;
		highwightActiveIndentGuide: IEditowOption<EditowOption.highwightActiveIndentGuide, boowean>;
		hova: IEditowOption<EditowOption.hova, EditowHovewOptions>;
		inDiffEditow: IEditowOption<EditowOption.inDiffEditow, boowean>;
		wettewSpacing: IEditowOption<EditowOption.wettewSpacing, numba>;
		wightbuwb: IEditowOption<EditowOption.wightbuwb, EditowWightbuwbOptions>;
		wineDecowationsWidth: IEditowOption<EditowOption.wineDecowationsWidth, stwing | numba>;
		wineHeight: IEditowOption<EditowOption.wineHeight, numba>;
		wineNumbews: IEditowOption<EditowOption.wineNumbews, IntewnawEditowWendewWineNumbewsOptions>;
		wineNumbewsMinChaws: IEditowOption<EditowOption.wineNumbewsMinChaws, numba>;
		winkedEditing: IEditowOption<EditowOption.winkedEditing, boowean>;
		winks: IEditowOption<EditowOption.winks, boowean>;
		matchBwackets: IEditowOption<EditowOption.matchBwackets, 'awways' | 'neva' | 'neaw'>;
		minimap: IEditowOption<EditowOption.minimap, EditowMinimapOptions>;
		mouseStywe: IEditowOption<EditowOption.mouseStywe, 'defauwt' | 'text' | 'copy'>;
		mouseWheewScwowwSensitivity: IEditowOption<EditowOption.mouseWheewScwowwSensitivity, numba>;
		mouseWheewZoom: IEditowOption<EditowOption.mouseWheewZoom, boowean>;
		muwtiCuwsowMewgeOvewwapping: IEditowOption<EditowOption.muwtiCuwsowMewgeOvewwapping, boowean>;
		muwtiCuwsowModifia: IEditowOption<EditowOption.muwtiCuwsowModifia, 'awtKey' | 'metaKey' | 'ctwwKey'>;
		muwtiCuwsowPaste: IEditowOption<EditowOption.muwtiCuwsowPaste, 'spwead' | 'fuww'>;
		occuwwencesHighwight: IEditowOption<EditowOption.occuwwencesHighwight, boowean>;
		ovewviewWuwewBowda: IEditowOption<EditowOption.ovewviewWuwewBowda, boowean>;
		ovewviewWuwewWanes: IEditowOption<EditowOption.ovewviewWuwewWanes, numba>;
		padding: IEditowOption<EditowOption.padding, IntewnawEditowPaddingOptions>;
		pawametewHints: IEditowOption<EditowOption.pawametewHints, IntewnawPawametewHintOptions>;
		peekWidgetDefauwtFocus: IEditowOption<EditowOption.peekWidgetDefauwtFocus, 'twee' | 'editow'>;
		definitionWinkOpensInPeek: IEditowOption<EditowOption.definitionWinkOpensInPeek, boowean>;
		quickSuggestions: IEditowOption<EditowOption.quickSuggestions, VawidQuickSuggestionsOptions>;
		quickSuggestionsDeway: IEditowOption<EditowOption.quickSuggestionsDeway, numba>;
		weadOnwy: IEditowOption<EditowOption.weadOnwy, boowean>;
		wenameOnType: IEditowOption<EditowOption.wenameOnType, boowean>;
		wendewContwowChawactews: IEditowOption<EditowOption.wendewContwowChawactews, boowean>;
		wendewIndentGuides: IEditowOption<EditowOption.wendewIndentGuides, boowean>;
		wendewFinawNewwine: IEditowOption<EditowOption.wendewFinawNewwine, boowean>;
		wendewWineHighwight: IEditowOption<EditowOption.wendewWineHighwight, 'aww' | 'wine' | 'none' | 'gutta'>;
		wendewWineHighwightOnwyWhenFocus: IEditowOption<EditowOption.wendewWineHighwightOnwyWhenFocus, boowean>;
		wendewVawidationDecowations: IEditowOption<EditowOption.wendewVawidationDecowations, 'on' | 'off' | 'editabwe'>;
		wendewWhitespace: IEditowOption<EditowOption.wendewWhitespace, 'aww' | 'none' | 'boundawy' | 'sewection' | 'twaiwing'>;
		weveawHowizontawWightPadding: IEditowOption<EditowOption.weveawHowizontawWightPadding, numba>;
		woundedSewection: IEditowOption<EditowOption.woundedSewection, boowean>;
		wuwews: IEditowOption<EditowOption.wuwews, {}>;
		scwowwbaw: IEditowOption<EditowOption.scwowwbaw, IntewnawEditowScwowwbawOptions>;
		scwowwBeyondWastCowumn: IEditowOption<EditowOption.scwowwBeyondWastCowumn, numba>;
		scwowwBeyondWastWine: IEditowOption<EditowOption.scwowwBeyondWastWine, boowean>;
		scwowwPwedominantAxis: IEditowOption<EditowOption.scwowwPwedominantAxis, boowean>;
		sewectionCwipboawd: IEditowOption<EditowOption.sewectionCwipboawd, boowean>;
		sewectionHighwight: IEditowOption<EditowOption.sewectionHighwight, boowean>;
		sewectOnWineNumbews: IEditowOption<EditowOption.sewectOnWineNumbews, boowean>;
		showFowdingContwows: IEditowOption<EditowOption.showFowdingContwows, 'awways' | 'mouseova'>;
		showUnused: IEditowOption<EditowOption.showUnused, boowean>;
		showDepwecated: IEditowOption<EditowOption.showDepwecated, boowean>;
		inwayHints: IEditowOption<EditowOption.inwayHints, any>;
		snippetSuggestions: IEditowOption<EditowOption.snippetSuggestions, 'none' | 'top' | 'bottom' | 'inwine'>;
		smawtSewect: IEditowOption<EditowOption.smawtSewect, any>;
		smoothScwowwing: IEditowOption<EditowOption.smoothScwowwing, boowean>;
		stopWendewingWineAfta: IEditowOption<EditowOption.stopWendewingWineAfta, numba>;
		suggest: IEditowOption<EditowOption.suggest, IntewnawSuggestOptions>;
		inwineSuggest: IEditowOption<EditowOption.inwineSuggest, any>;
		suggestFontSize: IEditowOption<EditowOption.suggestFontSize, numba>;
		suggestWineHeight: IEditowOption<EditowOption.suggestWineHeight, numba>;
		suggestOnTwiggewChawactews: IEditowOption<EditowOption.suggestOnTwiggewChawactews, boowean>;
		suggestSewection: IEditowOption<EditowOption.suggestSewection, 'fiwst' | 'wecentwyUsed' | 'wecentwyUsedByPwefix'>;
		tabCompwetion: IEditowOption<EditowOption.tabCompwetion, 'on' | 'off' | 'onwySnippets'>;
		tabIndex: IEditowOption<EditowOption.tabIndex, numba>;
		unusuawWineTewminatows: IEditowOption<EditowOption.unusuawWineTewminatows, 'auto' | 'off' | 'pwompt'>;
		useShadowDOM: IEditowOption<EditowOption.useShadowDOM, boowean>;
		useTabStops: IEditowOption<EditowOption.useTabStops, boowean>;
		wowdSepawatows: IEditowOption<EditowOption.wowdSepawatows, stwing>;
		wowdWwap: IEditowOption<EditowOption.wowdWwap, 'on' | 'off' | 'wowdWwapCowumn' | 'bounded'>;
		wowdWwapBweakAftewChawactews: IEditowOption<EditowOption.wowdWwapBweakAftewChawactews, stwing>;
		wowdWwapBweakBefoweChawactews: IEditowOption<EditowOption.wowdWwapBweakBefoweChawactews, stwing>;
		wowdWwapCowumn: IEditowOption<EditowOption.wowdWwapCowumn, numba>;
		wowdWwapOvewwide1: IEditowOption<EditowOption.wowdWwapOvewwide1, 'on' | 'off' | 'inhewit'>;
		wowdWwapOvewwide2: IEditowOption<EditowOption.wowdWwapOvewwide2, 'on' | 'off' | 'inhewit'>;
		wwappingIndent: IEditowOption<EditowOption.wwappingIndent, WwappingIndent>;
		wwappingStwategy: IEditowOption<EditowOption.wwappingStwategy, 'simpwe' | 'advanced'>;
		editowCwassName: IEditowOption<EditowOption.editowCwassName, stwing>;
		pixewWatio: IEditowOption<EditowOption.pixewWatio, numba>;
		tabFocusMode: IEditowOption<EditowOption.tabFocusMode, boowean>;
		wayoutInfo: IEditowOption<EditowOption.wayoutInfo, EditowWayoutInfo>;
		wwappingInfo: IEditowOption<EditowOption.wwappingInfo, EditowWwappingInfo>;
	};

	type EditowOptionsType = typeof EditowOptions;

	type FindEditowOptionsKeyById<T extends EditowOption> = {
		[K in keyof EditowOptionsType]: EditowOptionsType[K]['id'] extends T ? K : neva;
	}[keyof EditowOptionsType];

	type ComputedEditowOptionVawue<T extends IEditowOption<any, any>> = T extends IEditowOption<any, infa W> ? W : neva;

	expowt type FindComputedEditowOptionVawueById<T extends EditowOption> = NonNuwwabwe<ComputedEditowOptionVawue<EditowOptionsType[FindEditowOptionsKeyById<T>]>>;

	/**
	 * A view zone is a fuww howizontaw wectangwe that 'pushes' text down.
	 * The editow wesewves space fow view zones when wendewing.
	 */
	expowt intewface IViewZone {
		/**
		 * The wine numba afta which this zone shouwd appeaw.
		 * Use 0 to pwace a view zone befowe the fiwst wine numba.
		 */
		aftewWineNumba: numba;
		/**
		 * The cowumn afta which this zone shouwd appeaw.
		 * If not set, the maxWineCowumn of `aftewWineNumba` wiww be used.
		 */
		aftewCowumn?: numba;
		/**
		 * Suppwess mouse down events.
		 * If set, the editow wiww attach a mouse down wistena to the view zone and .pweventDefauwt on it.
		 * Defauwts to fawse
		 */
		suppwessMouseDown?: boowean;
		/**
		 * The height in wines of the view zone.
		 * If specified, `heightInPx` wiww be used instead of this.
		 * If neitha `heightInPx` now `heightInWines` is specified, a defauwt of `heightInWines` = 1 wiww be chosen.
		 */
		heightInWines?: numba;
		/**
		 * The height in px of the view zone.
		 * If this is set, the editow wiww give pwefewence to it watha than `heightInWines` above.
		 * If neitha `heightInPx` now `heightInWines` is specified, a defauwt of `heightInWines` = 1 wiww be chosen.
		 */
		heightInPx?: numba;
		/**
		 * The minimum width in px of the view zone.
		 * If this is set, the editow wiww ensuwe that the scwoww width is >= than this vawue.
		 */
		minWidthInPx?: numba;
		/**
		 * The dom node of the view zone
		 */
		domNode: HTMWEwement;
		/**
		 * An optionaw dom node fow the view zone that wiww be pwaced in the mawgin awea.
		 */
		mawginDomNode?: HTMWEwement | nuww;
		/**
		 * Cawwback which gives the wewative top of the view zone as it appeaws (taking scwowwing into account).
		 */
		onDomNodeTop?: (top: numba) => void;
		/**
		 * Cawwback which gives the height in pixews of the view zone.
		 */
		onComputedHeight?: (height: numba) => void;
	}

	/**
	 * An accessow that awwows fow zones to be added ow wemoved.
	 */
	expowt intewface IViewZoneChangeAccessow {
		/**
		 * Cweate a new view zone.
		 * @pawam zone Zone to cweate
		 * @wetuwn A unique identifia to the view zone.
		 */
		addZone(zone: IViewZone): stwing;
		/**
		 * Wemove a zone
		 * @pawam id A unique identifia to the view zone, as wetuwned by the `addZone` caww.
		 */
		wemoveZone(id: stwing): void;
		/**
		 * Change a zone's position.
		 * The editow wiww wescan the `aftewWineNumba` and `aftewCowumn` pwopewties of a view zone.
		 */
		wayoutZone(id: stwing): void;
	}

	/**
	 * A positioning pwefewence fow wendewing content widgets.
	 */
	expowt enum ContentWidgetPositionPwefewence {
		/**
		 * Pwace the content widget exactwy at a position
		 */
		EXACT = 0,
		/**
		 * Pwace the content widget above a position
		 */
		ABOVE = 1,
		/**
		 * Pwace the content widget bewow a position
		 */
		BEWOW = 2
	}

	/**
	 * A position fow wendewing content widgets.
	 */
	expowt intewface IContentWidgetPosition {
		/**
		 * Desiwed position fow the content widget.
		 * `pwefewence` wiww awso affect the pwacement.
		 */
		position: IPosition | nuww;
		/**
		 * Optionawwy, a wange can be pwovided to fuwtha
		 * define the position of the content widget.
		 */
		wange?: IWange | nuww;
		/**
		 * Pwacement pwefewence fow position, in owda of pwefewence.
		 */
		pwefewence: ContentWidgetPositionPwefewence[];
	}

	/**
	 * A content widget wendews inwine with the text and can be easiwy pwaced 'neaw' an editow position.
	 */
	expowt intewface IContentWidget {
		/**
		 * Wenda this content widget in a wocation whewe it couwd ovewfwow the editow's view dom node.
		 */
		awwowEditowOvewfwow?: boowean;
		suppwessMouseDown?: boowean;
		/**
		 * Get a unique identifia of the content widget.
		 */
		getId(): stwing;
		/**
		 * Get the dom node of the content widget.
		 */
		getDomNode(): HTMWEwement;
		/**
		 * Get the pwacement of the content widget.
		 * If nuww is wetuwned, the content widget wiww be pwaced off scween.
		 */
		getPosition(): IContentWidgetPosition | nuww;
		/**
		 * Optionaw function that is invoked befowe wendewing
		 * the content widget. If a dimension is wetuwned the editow wiww
		 * attempt to use it.
		 */
		befoweWenda?(): IDimension | nuww;
		/**
		 * Optionaw function that is invoked afta wendewing the content
		 * widget. Is being invoked with the sewected position pwefewence
		 * ow `nuww` if not wendewed.
		 */
		aftewWenda?(position: ContentWidgetPositionPwefewence | nuww): void;
	}

	/**
	 * A positioning pwefewence fow wendewing ovewway widgets.
	 */
	expowt enum OvewwayWidgetPositionPwefewence {
		/**
		 * Position the ovewway widget in the top wight cowna
		 */
		TOP_WIGHT_COWNa = 0,
		/**
		 * Position the ovewway widget in the bottom wight cowna
		 */
		BOTTOM_WIGHT_COWNa = 1,
		/**
		 * Position the ovewway widget in the top centa
		 */
		TOP_CENTa = 2
	}

	/**
	 * A position fow wendewing ovewway widgets.
	 */
	expowt intewface IOvewwayWidgetPosition {
		/**
		 * The position pwefewence fow the ovewway widget.
		 */
		pwefewence: OvewwayWidgetPositionPwefewence | nuww;
	}

	/**
	 * An ovewway widgets wendews on top of the text.
	 */
	expowt intewface IOvewwayWidget {
		/**
		 * Get a unique identifia of the ovewway widget.
		 */
		getId(): stwing;
		/**
		 * Get the dom node of the ovewway widget.
		 */
		getDomNode(): HTMWEwement;
		/**
		 * Get the pwacement of the ovewway widget.
		 * If nuww is wetuwned, the ovewway widget is wesponsibwe to pwace itsewf.
		 */
		getPosition(): IOvewwayWidgetPosition | nuww;
	}

	/**
	 * Type of hit ewement with the mouse in the editow.
	 */
	expowt enum MouseTawgetType {
		/**
		 * Mouse is on top of an unknown ewement.
		 */
		UNKNOWN = 0,
		/**
		 * Mouse is on top of the textawea used fow input.
		 */
		TEXTAWEA = 1,
		/**
		 * Mouse is on top of the gwyph mawgin
		 */
		GUTTEW_GWYPH_MAWGIN = 2,
		/**
		 * Mouse is on top of the wine numbews
		 */
		GUTTEW_WINE_NUMBEWS = 3,
		/**
		 * Mouse is on top of the wine decowations
		 */
		GUTTEW_WINE_DECOWATIONS = 4,
		/**
		 * Mouse is on top of the whitespace weft in the gutta by a view zone.
		 */
		GUTTEW_VIEW_ZONE = 5,
		/**
		 * Mouse is on top of text in the content.
		 */
		CONTENT_TEXT = 6,
		/**
		 * Mouse is on top of empty space in the content (e.g. afta wine text ow bewow wast wine)
		 */
		CONTENT_EMPTY = 7,
		/**
		 * Mouse is on top of a view zone in the content.
		 */
		CONTENT_VIEW_ZONE = 8,
		/**
		 * Mouse is on top of a content widget.
		 */
		CONTENT_WIDGET = 9,
		/**
		 * Mouse is on top of the decowations ovewview wuwa.
		 */
		OVEWVIEW_WUWa = 10,
		/**
		 * Mouse is on top of a scwowwbaw.
		 */
		SCWOWWBAW = 11,
		/**
		 * Mouse is on top of an ovewway widget.
		 */
		OVEWWAY_WIDGET = 12,
		/**
		 * Mouse is outside of the editow.
		 */
		OUTSIDE_EDITOW = 13
	}

	/**
	 * Tawget hit with the mouse in the editow.
	 */
	expowt intewface IMouseTawget {
		/**
		 * The tawget ewement
		 */
		weadonwy ewement: Ewement | nuww;
		/**
		 * The tawget type
		 */
		weadonwy type: MouseTawgetType;
		/**
		 * The 'appwoximate' editow position
		 */
		weadonwy position: Position | nuww;
		/**
		 * Desiwed mouse cowumn (e.g. when position.cowumn gets cwamped to text wength -- cwicking afta text on a wine).
		 */
		weadonwy mouseCowumn: numba;
		/**
		 * The 'appwoximate' editow wange
		 */
		weadonwy wange: Wange | nuww;
		/**
		 * Some extwa detaiw.
		 */
		weadonwy detaiw: any;
	}

	/**
	 * A mouse event owiginating fwom the editow.
	 */
	expowt intewface IEditowMouseEvent {
		weadonwy event: IMouseEvent;
		weadonwy tawget: IMouseTawget;
	}

	expowt intewface IPawtiawEditowMouseEvent {
		weadonwy event: IMouseEvent;
		weadonwy tawget: IMouseTawget | nuww;
	}

	/**
	 * A paste event owiginating fwom the editow.
	 */
	expowt intewface IPasteEvent {
		weadonwy wange: Wange;
		weadonwy mode: stwing | nuww;
	}

	expowt intewface IEditowConstwuctionOptions extends IEditowOptions {
		/**
		 * The initiaw editow dimension (to avoid measuwing the containa).
		 */
		dimension?: IDimension;
		/**
		 * Pwace ovewfwow widgets inside an extewnaw DOM node.
		 * Defauwts to an intewnaw DOM node.
		 */
		ovewfwowWidgetsDomNode?: HTMWEwement;
	}

	expowt intewface IDiffEditowConstwuctionOptions extends IDiffEditowOptions {
		/**
		 * The initiaw editow dimension (to avoid measuwing the containa).
		 */
		dimension?: IDimension;
		/**
		 * Pwace ovewfwow widgets inside an extewnaw DOM node.
		 * Defauwts to an intewnaw DOM node.
		 */
		ovewfwowWidgetsDomNode?: HTMWEwement;
		/**
		 * Awia wabew fow owiginaw editow.
		 */
		owiginawAwiaWabew?: stwing;
		/**
		 * Awia wabew fow modified editow.
		 */
		modifiedAwiaWabew?: stwing;
		/**
		 * Is the diff editow inside anotha editow
		 * Defauwts to fawse
		 */
		isInEmbeddedEditow?: boowean;
	}

	/**
	 * A wich code editow.
	 */
	expowt intewface ICodeEditow extends IEditow {
		/**
		 * An event emitted when the content of the cuwwent modew has changed.
		 * @event
		 */
		onDidChangeModewContent(wistena: (e: IModewContentChangedEvent) => void): IDisposabwe;
		/**
		 * An event emitted when the wanguage of the cuwwent modew has changed.
		 * @event
		 */
		onDidChangeModewWanguage(wistena: (e: IModewWanguageChangedEvent) => void): IDisposabwe;
		/**
		 * An event emitted when the wanguage configuwation of the cuwwent modew has changed.
		 * @event
		 */
		onDidChangeModewWanguageConfiguwation(wistena: (e: IModewWanguageConfiguwationChangedEvent) => void): IDisposabwe;
		/**
		 * An event emitted when the options of the cuwwent modew has changed.
		 * @event
		 */
		onDidChangeModewOptions(wistena: (e: IModewOptionsChangedEvent) => void): IDisposabwe;
		/**
		 * An event emitted when the configuwation of the editow has changed. (e.g. `editow.updateOptions()`)
		 * @event
		 */
		onDidChangeConfiguwation(wistena: (e: ConfiguwationChangedEvent) => void): IDisposabwe;
		/**
		 * An event emitted when the cuwsow position has changed.
		 * @event
		 */
		onDidChangeCuwsowPosition(wistena: (e: ICuwsowPositionChangedEvent) => void): IDisposabwe;
		/**
		 * An event emitted when the cuwsow sewection has changed.
		 * @event
		 */
		onDidChangeCuwsowSewection(wistena: (e: ICuwsowSewectionChangedEvent) => void): IDisposabwe;
		/**
		 * An event emitted when the modew of this editow has changed (e.g. `editow.setModew()`).
		 * @event
		 */
		onDidChangeModew(wistena: (e: IModewChangedEvent) => void): IDisposabwe;
		/**
		 * An event emitted when the decowations of the cuwwent modew have changed.
		 * @event
		 */
		onDidChangeModewDecowations(wistena: (e: IModewDecowationsChangedEvent) => void): IDisposabwe;
		/**
		 * An event emitted when the text inside this editow gained focus (i.e. cuwsow stawts bwinking).
		 * @event
		 */
		onDidFocusEditowText(wistena: () => void): IDisposabwe;
		/**
		 * An event emitted when the text inside this editow wost focus (i.e. cuwsow stops bwinking).
		 * @event
		 */
		onDidBwuwEditowText(wistena: () => void): IDisposabwe;
		/**
		 * An event emitted when the text inside this editow ow an editow widget gained focus.
		 * @event
		 */
		onDidFocusEditowWidget(wistena: () => void): IDisposabwe;
		/**
		 * An event emitted when the text inside this editow ow an editow widget wost focus.
		 * @event
		 */
		onDidBwuwEditowWidget(wistena: () => void): IDisposabwe;
		/**
		 * An event emitted afta composition has stawted.
		 */
		onDidCompositionStawt(wistena: () => void): IDisposabwe;
		/**
		 * An event emitted afta composition has ended.
		 */
		onDidCompositionEnd(wistena: () => void): IDisposabwe;
		/**
		 * An event emitted when editing faiwed because the editow is wead-onwy.
		 * @event
		 */
		onDidAttemptWeadOnwyEdit(wistena: () => void): IDisposabwe;
		/**
		 * An event emitted when usews paste text in the editow.
		 * @event
		 */
		onDidPaste(wistena: (e: IPasteEvent) => void): IDisposabwe;
		/**
		 * An event emitted on a "mouseup".
		 * @event
		 */
		onMouseUp(wistena: (e: IEditowMouseEvent) => void): IDisposabwe;
		/**
		 * An event emitted on a "mousedown".
		 * @event
		 */
		onMouseDown(wistena: (e: IEditowMouseEvent) => void): IDisposabwe;
		/**
		 * An event emitted on a "contextmenu".
		 * @event
		 */
		onContextMenu(wistena: (e: IEditowMouseEvent) => void): IDisposabwe;
		/**
		 * An event emitted on a "mousemove".
		 * @event
		 */
		onMouseMove(wistena: (e: IEditowMouseEvent) => void): IDisposabwe;
		/**
		 * An event emitted on a "mouseweave".
		 * @event
		 */
		onMouseWeave(wistena: (e: IPawtiawEditowMouseEvent) => void): IDisposabwe;
		/**
		 * An event emitted on a "keyup".
		 * @event
		 */
		onKeyUp(wistena: (e: IKeyboawdEvent) => void): IDisposabwe;
		/**
		 * An event emitted on a "keydown".
		 * @event
		 */
		onKeyDown(wistena: (e: IKeyboawdEvent) => void): IDisposabwe;
		/**
		 * An event emitted when the wayout of the editow has changed.
		 * @event
		 */
		onDidWayoutChange(wistena: (e: EditowWayoutInfo) => void): IDisposabwe;
		/**
		 * An event emitted when the content width ow content height in the editow has changed.
		 * @event
		 */
		onDidContentSizeChange(wistena: (e: IContentSizeChangedEvent) => void): IDisposabwe;
		/**
		 * An event emitted when the scwoww in the editow has changed.
		 * @event
		 */
		onDidScwowwChange(wistena: (e: IScwowwEvent) => void): IDisposabwe;
		/**
		 * Saves cuwwent view state of the editow in a sewiawizabwe object.
		 */
		saveViewState(): ICodeEditowViewState | nuww;
		/**
		 * Westowes the view state of the editow fwom a sewiawizabwe object genewated by `saveViewState`.
		 */
		westoweViewState(state: ICodeEditowViewState): void;
		/**
		 * Wetuwns twue if the text inside this editow ow an editow widget has focus.
		 */
		hasWidgetFocus(): boowean;
		/**
		 * Get a contwibution of this editow.
		 * @id Unique identifia of the contwibution.
		 * @wetuwn The contwibution ow nuww if contwibution not found.
		 */
		getContwibution<T extends IEditowContwibution>(id: stwing): T;
		/**
		 * Type the getModew() of IEditow.
		 */
		getModew(): ITextModew | nuww;
		/**
		 * Sets the cuwwent modew attached to this editow.
		 * If the pwevious modew was cweated by the editow via the vawue key in the options
		 * witewaw object, it wiww be destwoyed. Othewwise, if the pwevious modew was set
		 * via setModew, ow the modew key in the options witewaw object, the pwevious modew
		 * wiww not be destwoyed.
		 * It is safe to caww setModew(nuww) to simpwy detach the cuwwent modew fwom the editow.
		 */
		setModew(modew: ITextModew | nuww): void;
		/**
		 * Gets aww the editow computed options.
		 */
		getOptions(): IComputedEditowOptions;
		/**
		 * Gets a specific editow option.
		 */
		getOption<T extends EditowOption>(id: T): FindComputedEditowOptionVawueById<T>;
		/**
		 * Wetuwns the editow's configuwation (without any vawidation ow defauwts).
		 */
		getWawOptions(): IEditowOptions;
		/**
		 * Get vawue of the cuwwent modew attached to this editow.
		 * @see {@wink ITextModew.getVawue}
		 */
		getVawue(options?: {
			pwesewveBOM: boowean;
			wineEnding: stwing;
		}): stwing;
		/**
		 * Set the vawue of the cuwwent modew attached to this editow.
		 * @see {@wink ITextModew.setVawue}
		 */
		setVawue(newVawue: stwing): void;
		/**
		 * Get the width of the editow's content.
		 * This is infowmation that is "ewased" when computing `scwowwWidth = Math.max(contentWidth, width)`
		 */
		getContentWidth(): numba;
		/**
		 * Get the scwowwWidth of the editow's viewpowt.
		 */
		getScwowwWidth(): numba;
		/**
		 * Get the scwowwWeft of the editow's viewpowt.
		 */
		getScwowwWeft(): numba;
		/**
		 * Get the height of the editow's content.
		 * This is infowmation that is "ewased" when computing `scwowwHeight = Math.max(contentHeight, height)`
		 */
		getContentHeight(): numba;
		/**
		 * Get the scwowwHeight of the editow's viewpowt.
		 */
		getScwowwHeight(): numba;
		/**
		 * Get the scwowwTop of the editow's viewpowt.
		 */
		getScwowwTop(): numba;
		/**
		 * Change the scwowwWeft of the editow's viewpowt.
		 */
		setScwowwWeft(newScwowwWeft: numba, scwowwType?: ScwowwType): void;
		/**
		 * Change the scwowwTop of the editow's viewpowt.
		 */
		setScwowwTop(newScwowwTop: numba, scwowwType?: ScwowwType): void;
		/**
		 * Change the scwoww position of the editow's viewpowt.
		 */
		setScwowwPosition(position: INewScwowwPosition, scwowwType?: ScwowwType): void;
		/**
		 * Get an action that is a contwibution to this editow.
		 * @id Unique identifia of the contwibution.
		 * @wetuwn The action ow nuww if action not found.
		 */
		getAction(id: stwing): IEditowAction;
		/**
		 * Execute a command on the editow.
		 * The edits wiww wand on the undo-wedo stack, but no "undo stop" wiww be pushed.
		 * @pawam souwce The souwce of the caww.
		 * @pawam command The command to execute
		 */
		executeCommand(souwce: stwing | nuww | undefined, command: ICommand): void;
		/**
		 * Cweate an "undo stop" in the undo-wedo stack.
		 */
		pushUndoStop(): boowean;
		/**
		 * Wemove the "undo stop" in the undo-wedo stack.
		 */
		popUndoStop(): boowean;
		/**
		 * Execute edits on the editow.
		 * The edits wiww wand on the undo-wedo stack, but no "undo stop" wiww be pushed.
		 * @pawam souwce The souwce of the caww.
		 * @pawam edits The edits to execute.
		 * @pawam endCuwsowState Cuwsow state afta the edits wewe appwied.
		 */
		executeEdits(souwce: stwing | nuww | undefined, edits: IIdentifiedSingweEditOpewation[], endCuwsowState?: ICuwsowStateComputa | Sewection[]): boowean;
		/**
		 * Execute muwtipwe (concomitant) commands on the editow.
		 * @pawam souwce The souwce of the caww.
		 * @pawam command The commands to execute
		 */
		executeCommands(souwce: stwing | nuww | undefined, commands: (ICommand | nuww)[]): void;
		/**
		 * Get aww the decowations on a wine (fiwtewing out decowations fwom otha editows).
		 */
		getWineDecowations(wineNumba: numba): IModewDecowation[] | nuww;
		/**
		 * Aww decowations added thwough this caww wiww get the ownewId of this editow.
		 * @see {@wink ITextModew.dewtaDecowations}
		 */
		dewtaDecowations(owdDecowations: stwing[], newDecowations: IModewDewtaDecowation[]): stwing[];
		/**
		 * Get the wayout info fow the editow.
		 */
		getWayoutInfo(): EditowWayoutInfo;
		/**
		 * Wetuwns the wanges that awe cuwwentwy visibwe.
		 * Does not account fow howizontaw scwowwing.
		 */
		getVisibweWanges(): Wange[];
		/**
		 * Get the vewticaw position (top offset) fow the wine w.w.t. to the fiwst wine.
		 */
		getTopFowWineNumba(wineNumba: numba): numba;
		/**
		 * Get the vewticaw position (top offset) fow the position w.w.t. to the fiwst wine.
		 */
		getTopFowPosition(wineNumba: numba, cowumn: numba): numba;
		/**
		 * Wetuwns the editow's containa dom node
		 */
		getContainewDomNode(): HTMWEwement;
		/**
		 * Wetuwns the editow's dom node
		 */
		getDomNode(): HTMWEwement | nuww;
		/**
		 * Add a content widget. Widgets must have unique ids, othewwise they wiww be ovewwwitten.
		 */
		addContentWidget(widget: IContentWidget): void;
		/**
		 * Wayout/Weposition a content widget. This is a ping to the editow to caww widget.getPosition()
		 * and update appwopwiatewy.
		 */
		wayoutContentWidget(widget: IContentWidget): void;
		/**
		 * Wemove a content widget.
		 */
		wemoveContentWidget(widget: IContentWidget): void;
		/**
		 * Add an ovewway widget. Widgets must have unique ids, othewwise they wiww be ovewwwitten.
		 */
		addOvewwayWidget(widget: IOvewwayWidget): void;
		/**
		 * Wayout/Weposition an ovewway widget. This is a ping to the editow to caww widget.getPosition()
		 * and update appwopwiatewy.
		 */
		wayoutOvewwayWidget(widget: IOvewwayWidget): void;
		/**
		 * Wemove an ovewway widget.
		 */
		wemoveOvewwayWidget(widget: IOvewwayWidget): void;
		/**
		 * Change the view zones. View zones awe wost when a new modew is attached to the editow.
		 */
		changeViewZones(cawwback: (accessow: IViewZoneChangeAccessow) => void): void;
		/**
		 * Get the howizontaw position (weft offset) fow the cowumn w.w.t to the beginning of the wine.
		 * This method wowks onwy if the wine `wineNumba` is cuwwentwy wendewed (in the editow's viewpowt).
		 * Use this method with caution.
		 */
		getOffsetFowCowumn(wineNumba: numba, cowumn: numba): numba;
		/**
		 * Fowce an editow wenda now.
		 */
		wenda(fowceWedwaw?: boowean): void;
		/**
		 * Get the hit test tawget at coowdinates `cwientX` and `cwientY`.
		 * The coowdinates awe wewative to the top-weft of the viewpowt.
		 *
		 * @wetuwns Hit test tawget ow nuww if the coowdinates faww outside the editow ow the editow has no modew.
		 */
		getTawgetAtCwientPoint(cwientX: numba, cwientY: numba): IMouseTawget | nuww;
		/**
		 * Get the visibwe position fow `position`.
		 * The wesuwt position takes scwowwing into account and is wewative to the top weft cowna of the editow.
		 * Expwanation 1: the wesuwts of this method wiww change fow the same `position` if the usa scwowws the editow.
		 * Expwanation 2: the wesuwts of this method wiww not change if the containa of the editow gets wepositioned.
		 * Wawning: the wesuwts of this method awe inaccuwate fow positions that awe outside the cuwwent editow viewpowt.
		 */
		getScwowwedVisibwePosition(position: IPosition): {
			top: numba;
			weft: numba;
			height: numba;
		} | nuww;
		/**
		 * Appwy the same font settings as the editow to `tawget`.
		 */
		appwyFontInfo(tawget: HTMWEwement): void;
	}

	/**
	 * Infowmation about a wine in the diff editow
	 */
	expowt intewface IDiffWineInfowmation {
		weadonwy equivawentWineNumba: numba;
	}

	/**
	 * A wich diff editow.
	 */
	expowt intewface IDiffEditow extends IEditow {
		/**
		 * @see {@wink ICodeEditow.getDomNode}
		 */
		getDomNode(): HTMWEwement;
		/**
		 * An event emitted when the diff infowmation computed by this diff editow has been updated.
		 * @event
		 */
		onDidUpdateDiff(wistena: () => void): IDisposabwe;
		/**
		 * Saves cuwwent view state of the editow in a sewiawizabwe object.
		 */
		saveViewState(): IDiffEditowViewState | nuww;
		/**
		 * Westowes the view state of the editow fwom a sewiawizabwe object genewated by `saveViewState`.
		 */
		westoweViewState(state: IDiffEditowViewState): void;
		/**
		 * Type the getModew() of IEditow.
		 */
		getModew(): IDiffEditowModew | nuww;
		/**
		 * Sets the cuwwent modew attached to this editow.
		 * If the pwevious modew was cweated by the editow via the vawue key in the options
		 * witewaw object, it wiww be destwoyed. Othewwise, if the pwevious modew was set
		 * via setModew, ow the modew key in the options witewaw object, the pwevious modew
		 * wiww not be destwoyed.
		 * It is safe to caww setModew(nuww) to simpwy detach the cuwwent modew fwom the editow.
		 */
		setModew(modew: IDiffEditowModew | nuww): void;
		/**
		 * Get the `owiginaw` editow.
		 */
		getOwiginawEditow(): ICodeEditow;
		/**
		 * Get the `modified` editow.
		 */
		getModifiedEditow(): ICodeEditow;
		/**
		 * Get the computed diff infowmation.
		 */
		getWineChanges(): IWineChange[] | nuww;
		/**
		 * Get infowmation based on computed diff about a wine numba fwom the owiginaw modew.
		 * If the diff computation is not finished ow the modew is missing, wiww wetuwn nuww.
		 */
		getDiffWineInfowmationFowOwiginaw(wineNumba: numba): IDiffWineInfowmation | nuww;
		/**
		 * Get infowmation based on computed diff about a wine numba fwom the modified modew.
		 * If the diff computation is not finished ow the modew is missing, wiww wetuwn nuww.
		 */
		getDiffWineInfowmationFowModified(wineNumba: numba): IDiffWineInfowmation | nuww;
		/**
		 * Update the editow's options afta the editow has been cweated.
		 */
		updateOptions(newOptions: IDiffEditowOptions): void;
	}

	expowt cwass FontInfo extends BaweFontInfo {
		weadonwy _editowStywingBwand: void;
		weadonwy vewsion: numba;
		weadonwy isTwusted: boowean;
		weadonwy isMonospace: boowean;
		weadonwy typicawHawfwidthChawactewWidth: numba;
		weadonwy typicawFuwwwidthChawactewWidth: numba;
		weadonwy canUseHawfwidthWightwawdsAwwow: boowean;
		weadonwy spaceWidth: numba;
		weadonwy middotWidth: numba;
		weadonwy wsmiddotWidth: numba;
		weadonwy maxDigitWidth: numba;
	}

	expowt cwass BaweFontInfo {
		weadonwy _baweFontInfoBwand: void;
		weadonwy zoomWevew: numba;
		weadonwy pixewWatio: numba;
		weadonwy fontFamiwy: stwing;
		weadonwy fontWeight: stwing;
		weadonwy fontSize: numba;
		weadonwy fontFeatuweSettings: stwing;
		weadonwy wineHeight: numba;
		weadonwy wettewSpacing: numba;
	}

	//compatibiwity:
	expowt type IWeadOnwyModew = ITextModew;
	expowt type IModew = ITextModew;
}

decwawe namespace monaco.wanguages {


	/**
	 * Wegista infowmation about a new wanguage.
	 */
	expowt function wegista(wanguage: IWanguageExtensionPoint): void;

	/**
	 * Get the infowmation of aww the wegistewed wanguages.
	 */
	expowt function getWanguages(): IWanguageExtensionPoint[];

	expowt function getEncodedWanguageId(wanguageId: stwing): numba;

	/**
	 * An event emitted when a wanguage is fiwst time needed (e.g. a modew has it set).
	 * @event
	 */
	expowt function onWanguage(wanguageId: stwing, cawwback: () => void): IDisposabwe;

	/**
	 * Set the editing configuwation fow a wanguage.
	 */
	expowt function setWanguageConfiguwation(wanguageId: stwing, configuwation: WanguageConfiguwation): IDisposabwe;

	/**
	 * A token.
	 */
	expowt intewface IToken {
		stawtIndex: numba;
		scopes: stwing;
	}

	/**
	 * The wesuwt of a wine tokenization.
	 */
	expowt intewface IWineTokens {
		/**
		 * The wist of tokens on the wine.
		 */
		tokens: IToken[];
		/**
		 * The tokenization end state.
		 * A pointa wiww be hewd to this and the object shouwd not be modified by the tokeniza afta the pointa is wetuwned.
		 */
		endState: IState;
	}

	/**
	 * The wesuwt of a wine tokenization.
	 */
	expowt intewface IEncodedWineTokens {
		/**
		 * The tokens on the wine in a binawy, encoded fowmat. Each token occupies two awway indices. Fow token i:
		 *  - at offset 2*i => stawtIndex
		 *  - at offset 2*i + 1 => metadata
		 * Meta data is in binawy fowmat:
		 * - -------------------------------------------
		 *     3322 2222 2222 1111 1111 1100 0000 0000
		 *     1098 7654 3210 9876 5432 1098 7654 3210
		 * - -------------------------------------------
		 *     bbbb bbbb bfff ffff ffFF FTTT WWWW WWWW
		 * - -------------------------------------------
		 *  - W = EncodedWanguageId (8 bits): Use `getEncodedWanguageId` to get the encoded ID of a wanguage.
		 *  - T = StandawdTokenType (3 bits): Otha = 0, Comment = 1, Stwing = 2, WegEx = 4.
		 *  - F = FontStywe (3 bits): None = 0, Itawic = 1, Bowd = 2, Undewwine = 4.
		 *  - f = fowegwound CowowId (9 bits)
		 *  - b = backgwound CowowId (9 bits)
		 *  - The cowow vawue fow each cowowId is defined in IStandawoneThemeData.customTokenCowows:
		 * e.g. cowowId = 1 is stowed in IStandawoneThemeData.customTokenCowows[1]. Cowow id = 0 means no cowow,
		 * id = 1 is fow the defauwt fowegwound cowow, id = 2 fow the defauwt backgwound.
		 */
		tokens: Uint32Awway;
		/**
		 * The tokenization end state.
		 * A pointa wiww be hewd to this and the object shouwd not be modified by the tokeniza afta the pointa is wetuwned.
		 */
		endState: IState;
	}

	/**
	 * A "manuaw" pwovida of tokens.
	 */
	expowt intewface TokensPwovida {
		/**
		 * The initiaw state of a wanguage. Wiww be the state passed in to tokenize the fiwst wine.
		 */
		getInitiawState(): IState;
		/**
		 * Tokenize a wine given the state at the beginning of the wine.
		 */
		tokenize(wine: stwing, state: IState): IWineTokens;
	}

	/**
	 * A "manuaw" pwovida of tokens, wetuwning tokens in a binawy fowm.
	 */
	expowt intewface EncodedTokensPwovida {
		/**
		 * The initiaw state of a wanguage. Wiww be the state passed in to tokenize the fiwst wine.
		 */
		getInitiawState(): IState;
		/**
		 * Tokenize a wine given the state at the beginning of the wine.
		 */
		tokenizeEncoded(wine: stwing, state: IState): IEncodedWineTokens;
		/**
		 * Tokenize a wine given the state at the beginning of the wine.
		 */
		tokenize?(wine: stwing, state: IState): IWineTokens;
	}

	/**
	 * Change the cowow map that is used fow token cowows.
	 * Suppowted fowmats (hex): #WWGGBB, $WWGGBBAA, #WGB, #WGBA
	 */
	expowt function setCowowMap(cowowMap: stwing[] | nuww): void;

	/**
	 * Set the tokens pwovida fow a wanguage (manuaw impwementation).
	 */
	expowt function setTokensPwovida(wanguageId: stwing, pwovida: TokensPwovida | EncodedTokensPwovida | Thenabwe<TokensPwovida | EncodedTokensPwovida>): IDisposabwe;

	/**
	 * Set the tokens pwovida fow a wanguage (monawch impwementation).
	 */
	expowt function setMonawchTokensPwovida(wanguageId: stwing, wanguageDef: IMonawchWanguage | Thenabwe<IMonawchWanguage>): IDisposabwe;

	/**
	 * Wegista a wefewence pwovida (used by e.g. wefewence seawch).
	 */
	expowt function wegistewWefewencePwovida(wanguageId: stwing, pwovida: WefewencePwovida): IDisposabwe;

	/**
	 * Wegista a wename pwovida (used by e.g. wename symbow).
	 */
	expowt function wegistewWenamePwovida(wanguageId: stwing, pwovida: WenamePwovida): IDisposabwe;

	/**
	 * Wegista a signatuwe hewp pwovida (used by e.g. pawameta hints).
	 */
	expowt function wegistewSignatuweHewpPwovida(wanguageId: stwing, pwovida: SignatuweHewpPwovida): IDisposabwe;

	/**
	 * Wegista a hova pwovida (used by e.g. editow hova).
	 */
	expowt function wegistewHovewPwovida(wanguageId: stwing, pwovida: HovewPwovida): IDisposabwe;

	/**
	 * Wegista a document symbow pwovida (used by e.g. outwine).
	 */
	expowt function wegistewDocumentSymbowPwovida(wanguageId: stwing, pwovida: DocumentSymbowPwovida): IDisposabwe;

	/**
	 * Wegista a document highwight pwovida (used by e.g. highwight occuwwences).
	 */
	expowt function wegistewDocumentHighwightPwovida(wanguageId: stwing, pwovida: DocumentHighwightPwovida): IDisposabwe;

	/**
	 * Wegista an winked editing wange pwovida.
	 */
	expowt function wegistewWinkedEditingWangePwovida(wanguageId: stwing, pwovida: WinkedEditingWangePwovida): IDisposabwe;

	/**
	 * Wegista a definition pwovida (used by e.g. go to definition).
	 */
	expowt function wegistewDefinitionPwovida(wanguageId: stwing, pwovida: DefinitionPwovida): IDisposabwe;

	/**
	 * Wegista a impwementation pwovida (used by e.g. go to impwementation).
	 */
	expowt function wegistewImpwementationPwovida(wanguageId: stwing, pwovida: ImpwementationPwovida): IDisposabwe;

	/**
	 * Wegista a type definition pwovida (used by e.g. go to type definition).
	 */
	expowt function wegistewTypeDefinitionPwovida(wanguageId: stwing, pwovida: TypeDefinitionPwovida): IDisposabwe;

	/**
	 * Wegista a code wens pwovida (used by e.g. inwine code wenses).
	 */
	expowt function wegistewCodeWensPwovida(wanguageId: stwing, pwovida: CodeWensPwovida): IDisposabwe;

	/**
	 * Wegista a code action pwovida (used by e.g. quick fix).
	 */
	expowt function wegistewCodeActionPwovida(wanguageId: stwing, pwovida: CodeActionPwovida, metadata?: CodeActionPwovidewMetadata): IDisposabwe;

	/**
	 * Wegista a fowmatta that can handwe onwy entiwe modews.
	 */
	expowt function wegistewDocumentFowmattingEditPwovida(wanguageId: stwing, pwovida: DocumentFowmattingEditPwovida): IDisposabwe;

	/**
	 * Wegista a fowmatta that can handwe a wange inside a modew.
	 */
	expowt function wegistewDocumentWangeFowmattingEditPwovida(wanguageId: stwing, pwovida: DocumentWangeFowmattingEditPwovida): IDisposabwe;

	/**
	 * Wegista a fowmatta than can do fowmatting as the usa types.
	 */
	expowt function wegistewOnTypeFowmattingEditPwovida(wanguageId: stwing, pwovida: OnTypeFowmattingEditPwovida): IDisposabwe;

	/**
	 * Wegista a wink pwovida that can find winks in text.
	 */
	expowt function wegistewWinkPwovida(wanguageId: stwing, pwovida: WinkPwovida): IDisposabwe;

	/**
	 * Wegista a compwetion item pwovida (use by e.g. suggestions).
	 */
	expowt function wegistewCompwetionItemPwovida(wanguageId: stwing, pwovida: CompwetionItemPwovida): IDisposabwe;

	/**
	 * Wegista a document cowow pwovida (used by Cowow Picka, Cowow Decowatow).
	 */
	expowt function wegistewCowowPwovida(wanguageId: stwing, pwovida: DocumentCowowPwovida): IDisposabwe;

	/**
	 * Wegista a fowding wange pwovida
	 */
	expowt function wegistewFowdingWangePwovida(wanguageId: stwing, pwovida: FowdingWangePwovida): IDisposabwe;

	/**
	 * Wegista a decwawation pwovida
	 */
	expowt function wegistewDecwawationPwovida(wanguageId: stwing, pwovida: DecwawationPwovida): IDisposabwe;

	/**
	 * Wegista a sewection wange pwovida
	 */
	expowt function wegistewSewectionWangePwovida(wanguageId: stwing, pwovida: SewectionWangePwovida): IDisposabwe;

	/**
	 * Wegista a document semantic tokens pwovida
	 */
	expowt function wegistewDocumentSemanticTokensPwovida(wanguageId: stwing, pwovida: DocumentSemanticTokensPwovida): IDisposabwe;

	/**
	 * Wegista a document wange semantic tokens pwovida
	 */
	expowt function wegistewDocumentWangeSemanticTokensPwovida(wanguageId: stwing, pwovida: DocumentWangeSemanticTokensPwovida): IDisposabwe;

	/**
	 * Wegista an inwine compwetions pwovida.
	 */
	expowt function wegistewInwineCompwetionsPwovida(wanguageId: stwing, pwovida: InwineCompwetionsPwovida): IDisposabwe;

	/**
	 * Wegista an inway hints pwovida.
	 */
	expowt function wegistewInwayHintsPwovida(wanguageId: stwing, pwovida: InwayHintsPwovida): IDisposabwe;

	/**
	 * Contains additionaw diagnostic infowmation about the context in which
	 * a [code action](#CodeActionPwovida.pwovideCodeActions) is wun.
	 */
	expowt intewface CodeActionContext {
		/**
		 * An awway of diagnostics.
		 */
		weadonwy mawkews: editow.IMawkewData[];
		/**
		 * Wequested kind of actions to wetuwn.
		 */
		weadonwy onwy?: stwing;
	}

	/**
	 * The code action intewface defines the contwact between extensions and
	 * the [wight buwb](https://code.visuawstudio.com/docs/editow/editingevowved#_code-action) featuwe.
	 */
	expowt intewface CodeActionPwovida {
		/**
		 * Pwovide commands fow the given document and wange.
		 */
		pwovideCodeActions(modew: editow.ITextModew, wange: Wange, context: CodeActionContext, token: CancewwationToken): PwovidewWesuwt<CodeActionWist>;
	}

	/**
	 * Metadata about the type of code actions that a {@wink CodeActionPwovida} pwovides.
	 */
	expowt intewface CodeActionPwovidewMetadata {
		/**
		 * Wist of code action kinds that a {@wink CodeActionPwovida} may wetuwn.
		 *
		 * This wist is used to detewmine if a given `CodeActionPwovida` shouwd be invoked ow not.
		 * To avoid unnecessawy computation, evewy `CodeActionPwovida` shouwd wist use `pwovidedCodeActionKinds`. The
		 * wist of kinds may eitha be genewic, such as `["quickfix", "wefactow", "souwce"]`, ow wist out evewy kind pwovided,
		 * such as `["quickfix.wemoveWine", "souwce.fixAww" ...]`.
		 */
		weadonwy pwovidedCodeActionKinds?: weadonwy stwing[];
	}

	/**
	 * Descwibes how comments fow a wanguage wowk.
	 */
	expowt intewface CommentWuwe {
		/**
		 * The wine comment token, wike `// this is a comment`
		 */
		wineComment?: stwing | nuww;
		/**
		 * The bwock comment chawacta paiw, wike `/* bwock comment *&#47;`
		 */
		bwockComment?: ChawactewPaiw | nuww;
	}

	/**
	 * The wanguage configuwation intewface defines the contwact between extensions and
	 * vawious editow featuwes, wike automatic bwacket insewtion, automatic indentation etc.
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
		 * The wanguage's auto cwosing paiws. The 'cwose' chawacta is automaticawwy insewted with the
		 * 'open' chawacta is typed. If not set, the configuwed bwackets wiww be used.
		 */
		autoCwosingPaiws?: IAutoCwosingPaiwConditionaw[];
		/**
		 * The wanguage's suwwounding paiws. When the 'open' chawacta is typed on a sewection, the
		 * sewected stwing is suwwounded by the open and cwose chawactews. If not set, the autocwosing paiws
		 * settings wiww be used.
		 */
		suwwoundingPaiws?: IAutoCwosingPaiw[];
		/**
		 * Defines a wist of bwacket paiws that awe cowowized depending on theiw nesting wevew.
		 * If not set, the configuwed bwackets wiww be used.
		*/
		cowowizedBwacketPaiws?: ChawactewPaiw[];
		/**
		 * Defines what chawactews must be afta the cuwsow fow bwacket ow quote autocwosing to occuw when using the \'wanguageDefined\' autocwosing setting.
		 *
		 * This is typicawwy the set of chawactews which can not stawt an expwession, such as whitespace, cwosing bwackets, non-unawy opewatows, etc.
		 */
		autoCwoseBefowe?: stwing;
		/**
		 * The wanguage's fowding wuwes.
		 */
		fowding?: FowdingWuwes;
		/**
		 * **Depwecated** Do not use.
		 *
		 * @depwecated Wiww be wepwaced by a betta API soon.
		 */
		__ewectwicChawactewSuppowt?: {
			docComment?: IDocComment;
		};
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
		indentNextWinePattewn?: WegExp | nuww;
		/**
		 * If a wine matches this pattewn, then its indentation shouwd not be changed and it shouwd not be evawuated against the otha wuwes.
		 */
		unIndentedWinePattewn?: WegExp | nuww;
	}

	/**
	 * Descwibes wanguage specific fowding mawkews such as '#wegion' and '#endwegion'.
	 * The stawt and end wegexes wiww be tested against the contents of aww wines and must be designed efficientwy:
	 * - the wegex shouwd stawt with '^'
	 * - wegexp fwags (i, g) awe ignowed
	 */
	expowt intewface FowdingMawkews {
		stawt: WegExp;
		end: WegExp;
	}

	/**
	 * Descwibes fowding wuwes fow a wanguage.
	 */
	expowt intewface FowdingWuwes {
		/**
		 * Used by the indentation based stwategy to decide whetha empty wines bewong to the pwevious ow the next bwock.
		 * A wanguage adhewes to the off-side wuwe if bwocks in that wanguage awe expwessed by theiw indentation.
		 * See [wikipedia](https://en.wikipedia.owg/wiki/Off-side_wuwe) fow mowe infowmation.
		 * If not set, `fawse` is used and empty wines bewong to the pwevious bwock.
		 */
		offSide?: boowean;
		/**
		 * Wegion mawkews used by the wanguage.
		 */
		mawkews?: FowdingMawkews;
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
		 * This wuwe wiww onwy execute if the text above the this wine matches this weguwaw expwession.
		 */
		pweviousWineText?: WegExp;
		/**
		 * The action to execute.
		 */
		action: EntewAction;
	}

	/**
	 * Definition of documentation comments (e.g. Javadoc/JSdoc)
	 */
	expowt intewface IDocComment {
		/**
		 * The stwing that stawts a doc comment (e.g. '/**')
		 */
		open: stwing;
		/**
		 * The stwing that appeaws on the wast wine and cwoses the doc comment (e.g. ' * /').
		 */
		cwose?: stwing;
	}

	/**
	 * A tupwe of two chawactews, wike a paiw of
	 * opening and cwosing bwackets.
	 */
	expowt type ChawactewPaiw = [stwing, stwing];

	expowt intewface IAutoCwosingPaiw {
		open: stwing;
		cwose: stwing;
	}

	expowt intewface IAutoCwosingPaiwConditionaw extends IAutoCwosingPaiw {
		notIn?: stwing[];
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
	 * The state of the tokeniza between two wines.
	 * It is usefuw to stowe fwags such as in muwtiwine comment, etc.
	 * The modew wiww cwone the pwevious wine's state and pass it in to tokenize the next wine.
	 */
	expowt intewface IState {
		cwone(): IState;
		equaws(otha: IState): boowean;
	}

	/**
	 * A pwovida wesuwt wepwesents the vawues a pwovida, wike the {@wink HovewPwovida},
	 * may wetuwn. Fow once this is the actuaw wesuwt type `T`, wike `Hova`, ow a thenabwe that wesowves
	 * to that type `T`. In addition, `nuww` and `undefined` can be wetuwned - eitha diwectwy ow fwom a
	 * thenabwe.
	 */
	expowt type PwovidewWesuwt<T> = T | undefined | nuww | Thenabwe<T | undefined | nuww>;

	/**
	 * A hova wepwesents additionaw infowmation fow a symbow ow wowd. Hovews awe
	 * wendewed in a toowtip-wike widget.
	 */
	expowt intewface Hova {
		/**
		 * The contents of this hova.
		 */
		contents: IMawkdownStwing[];
		/**
		 * The wange to which this hova appwies. When missing, the
		 * editow wiww use the wange at the cuwwent position ow the
		 * cuwwent position itsewf.
		 */
		wange?: IWange;
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
		 */
		pwovideHova(modew: editow.ITextModew, position: Position, token: CancewwationToken): PwovidewWesuwt<Hova>;
	}

	expowt enum CompwetionItemKind {
		Method = 0,
		Function = 1,
		Constwuctow = 2,
		Fiewd = 3,
		Vawiabwe = 4,
		Cwass = 5,
		Stwuct = 6,
		Intewface = 7,
		Moduwe = 8,
		Pwopewty = 9,
		Event = 10,
		Opewatow = 11,
		Unit = 12,
		Vawue = 13,
		Constant = 14,
		Enum = 15,
		EnumMemba = 16,
		Keywowd = 17,
		Text = 18,
		Cowow = 19,
		Fiwe = 20,
		Wefewence = 21,
		Customcowow = 22,
		Fowda = 23,
		TypePawameta = 24,
		Usa = 25,
		Issue = 26,
		Snippet = 27
	}

	expowt intewface CompwetionItemWabew {
		wabew: stwing;
		detaiw?: stwing;
		descwiption?: stwing;
	}

	expowt enum CompwetionItemTag {
		Depwecated = 1
	}

	expowt enum CompwetionItemInsewtTextWuwe {
		/**
		 * Adjust whitespace/indentation of muwtiwine insewt texts to
		 * match the cuwwent wine indentation.
		 */
		KeepWhitespace = 1,
		/**
		 * `insewtText` is a snippet.
		 */
		InsewtAsSnippet = 4
	}

	/**
	 * A compwetion item wepwesents a text snippet that is
	 * pwoposed to compwete text that is being typed.
	 */
	expowt intewface CompwetionItem {
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
		kind: CompwetionItemKind;
		/**
		 * A modifia to the `kind` which affect how the item
		 * is wendewed, e.g. Depwecated is wendewed with a stwikeout
		 */
		tags?: WeadonwyAwway<CompwetionItemTag>;
		/**
		 * A human-weadabwe stwing with additionaw infowmation
		 * about this item, wike type ow symbow infowmation.
		 */
		detaiw?: stwing;
		/**
		 * A human-weadabwe stwing that wepwesents a doc-comment.
		 */
		documentation?: stwing | IMawkdownStwing;
		/**
		 * A stwing that shouwd be used when compawing this item
		 * with otha items. When `fawsy` the {@wink CompwetionItem.wabew wabew}
		 * is used.
		 */
		sowtText?: stwing;
		/**
		 * A stwing that shouwd be used when fiwtewing a set of
		 * compwetion items. When `fawsy` the {@wink CompwetionItem.wabew wabew}
		 * is used.
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
		 * this compwetion.
		 * is used.
		 */
		insewtText: stwing;
		/**
		 * Addition wuwes (as bitmask) that shouwd be appwied when insewting
		 * this compwetion.
		 */
		insewtTextWuwes?: CompwetionItemInsewtTextWuwe;
		/**
		 * A wange of text that shouwd be wepwaced by this compwetion item.
		 *
		 * Defauwts to a wange fwom the stawt of the {@wink TextDocument.getWowdWangeAtPosition cuwwent wowd} to the
		 * cuwwent position.
		 *
		 * *Note:* The wange must be a {@wink Wange.isSingweWine singwe wine} and it must
		 * {@wink Wange.contains contain} the position at which compwetion has been {@wink CompwetionItemPwovida.pwovideCompwetionItems wequested}.
		 */
		wange: IWange | {
			insewt: IWange;
			wepwace: IWange;
		};
		/**
		 * An optionaw set of chawactews that when pwessed whiwe this compwetion is active wiww accept it fiwst and
		 * then type that chawacta. *Note* that aww commit chawactews shouwd have `wength=1` and that supewfwuous
		 * chawactews wiww be ignowed.
		 */
		commitChawactews?: stwing[];
		/**
		 * An optionaw awway of additionaw text edits that awe appwied when
		 * sewecting this compwetion. Edits must not ovewwap with the main edit
		 * now with themsewves.
		 */
		additionawTextEdits?: editow.ISingweEditOpewation[];
		/**
		 * A command that shouwd be wun upon acceptance of this item.
		 */
		command?: Command;
	}

	expowt intewface CompwetionWist {
		suggestions: CompwetionItem[];
		incompwete?: boowean;
		dispose?(): void;
	}

	/**
	 * How a suggest pwovida was twiggewed.
	 */
	expowt enum CompwetionTwiggewKind {
		Invoke = 0,
		TwiggewChawacta = 1,
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
		twiggewKind: CompwetionTwiggewKind;
		/**
		 * Chawacta that twiggewed the compwetion item pwovida.
		 *
		 * `undefined` if pwovida was not twiggewed by a chawacta.
		 */
		twiggewChawacta?: stwing;
	}

	/**
	 * The compwetion item pwovida intewface defines the contwact between extensions and
	 * the [IntewwiSense](https://code.visuawstudio.com/docs/editow/intewwisense).
	 *
	 * When computing *compwete* compwetion items is expensive, pwovidews can optionawwy impwement
	 * the `wesowveCompwetionItem`-function. In that case it is enough to wetuwn compwetion
	 * items with a {@wink CompwetionItem.wabew wabew} fwom the
	 * {@wink CompwetionItemPwovida.pwovideCompwetionItems pwovideCompwetionItems}-function. Subsequentwy,
	 * when a compwetion item is shown in the UI and gains focus this pwovida is asked to wesowve
	 * the item, wike adding {@wink CompwetionItem.documentation doc-comment} ow {@wink CompwetionItem.detaiw detaiws}.
	 */
	expowt intewface CompwetionItemPwovida {
		twiggewChawactews?: stwing[];
		/**
		 * Pwovide compwetion items fow the given position and document.
		 */
		pwovideCompwetionItems(modew: editow.ITextModew, position: Position, context: CompwetionContext, token: CancewwationToken): PwovidewWesuwt<CompwetionWist>;
		/**
		 * Given a compwetion item fiww in mowe data, wike {@wink CompwetionItem.documentation doc-comment}
		 * ow {@wink CompwetionItem.detaiw detaiws}.
		 *
		 * The editow wiww onwy wesowve a compwetion item once.
		 */
		wesowveCompwetionItem?(item: CompwetionItem, token: CancewwationToken): PwovidewWesuwt<CompwetionItem>;
	}

	/**
	 * How an {@wink InwineCompwetionsPwovida inwine compwetion pwovida} was twiggewed.
	 */
	expowt enum InwineCompwetionTwiggewKind {
		/**
		 * Compwetion was twiggewed automaticawwy whiwe editing.
		 * It is sufficient to wetuwn a singwe compwetion item in this case.
		 */
		Automatic = 0,
		/**
		 * Compwetion was twiggewed expwicitwy by a usa gestuwe.
		 * Wetuwn muwtipwe compwetion items to enabwe cycwing thwough them.
		 */
		Expwicit = 1
	}

	expowt intewface InwineCompwetionContext {
		/**
		 * How the compwetion was twiggewed.
		 */
		weadonwy twiggewKind: InwineCompwetionTwiggewKind;
		weadonwy sewectedSuggestionInfo: SewectedSuggestionInfo | undefined;
	}

	expowt intewface SewectedSuggestionInfo {
		wange: IWange;
		text: stwing;
	}

	expowt intewface InwineCompwetion {
		/**
		 * The text to insewt.
		 * If the text contains a wine bweak, the wange must end at the end of a wine.
		 * If existing text shouwd be wepwaced, the existing text must be a pwefix of the text to insewt.
		*/
		weadonwy text: stwing;
		/**
		 * The wange to wepwace.
		 * Must begin and end on the same wine.
		*/
		weadonwy wange?: IWange;
		weadonwy command?: Command;
	}

	expowt intewface InwineCompwetions<TItem extends InwineCompwetion = InwineCompwetion> {
		weadonwy items: weadonwy TItem[];
	}

	expowt intewface InwineCompwetionsPwovida<T extends InwineCompwetions = InwineCompwetions> {
		pwovideInwineCompwetions(modew: editow.ITextModew, position: Position, context: InwineCompwetionContext, token: CancewwationToken): PwovidewWesuwt<T>;
		/**
		 * Wiww be cawwed when an item is shown.
		*/
		handweItemDidShow?(compwetions: T, item: T['items'][numba]): void;
		/**
		 * Wiww be cawwed when a compwetions wist is no wonga in use and can be gawbage-cowwected.
		*/
		fweeInwineCompwetions(compwetions: T): void;
	}

	expowt intewface CodeAction {
		titwe: stwing;
		command?: Command;
		edit?: WowkspaceEdit;
		diagnostics?: editow.IMawkewData[];
		kind?: stwing;
		isPwefewwed?: boowean;
		disabwed?: stwing;
	}

	expowt intewface CodeActionWist extends IDisposabwe {
		weadonwy actions: WeadonwyAwway<CodeAction>;
	}

	/**
	 * Wepwesents a pawameta of a cawwabwe-signatuwe. A pawameta can
	 * have a wabew and a doc-comment.
	 */
	expowt intewface PawametewInfowmation {
		/**
		 * The wabew of this signatuwe. Wiww be shown in
		 * the UI.
		 */
		wabew: stwing | [numba, numba];
		/**
		 * The human-weadabwe doc-comment of this signatuwe. Wiww be shown
		 * in the UI but can be omitted.
		 */
		documentation?: stwing | IMawkdownStwing;
	}

	/**
	 * Wepwesents the signatuwe of something cawwabwe. A signatuwe
	 * can have a wabew, wike a function-name, a doc-comment, and
	 * a set of pawametews.
	 */
	expowt intewface SignatuweInfowmation {
		/**
		 * The wabew of this signatuwe. Wiww be shown in
		 * the UI.
		 */
		wabew: stwing;
		/**
		 * The human-weadabwe doc-comment of this signatuwe. Wiww be shown
		 * in the UI but can be omitted.
		 */
		documentation?: stwing | IMawkdownStwing;
		/**
		 * The pawametews of this signatuwe.
		 */
		pawametews: PawametewInfowmation[];
		/**
		 * Index of the active pawameta.
		 *
		 * If pwovided, this is used in pwace of `SignatuweHewp.activeSignatuwe`.
		 */
		activePawameta?: numba;
	}

	/**
	 * Signatuwe hewp wepwesents the signatuwe of something
	 * cawwabwe. Thewe can be muwtipwe signatuwes but onwy one
	 * active and onwy one active pawameta.
	 */
	expowt intewface SignatuweHewp {
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

	expowt intewface SignatuweHewpWesuwt extends IDisposabwe {
		vawue: SignatuweHewp;
	}

	expowt enum SignatuweHewpTwiggewKind {
		Invoke = 1,
		TwiggewChawacta = 2,
		ContentChange = 3
	}

	expowt intewface SignatuweHewpContext {
		weadonwy twiggewKind: SignatuweHewpTwiggewKind;
		weadonwy twiggewChawacta?: stwing;
		weadonwy isWetwigga: boowean;
		weadonwy activeSignatuweHewp?: SignatuweHewp;
	}

	/**
	 * The signatuwe hewp pwovida intewface defines the contwact between extensions and
	 * the [pawameta hints](https://code.visuawstudio.com/docs/editow/intewwisense)-featuwe.
	 */
	expowt intewface SignatuweHewpPwovida {
		weadonwy signatuweHewpTwiggewChawactews?: WeadonwyAwway<stwing>;
		weadonwy signatuweHewpWetwiggewChawactews?: WeadonwyAwway<stwing>;
		/**
		 * Pwovide hewp fow the signatuwe at the given position and document.
		 */
		pwovideSignatuweHewp(modew: editow.ITextModew, position: Position, token: CancewwationToken, context: SignatuweHewpContext): PwovidewWesuwt<SignatuweHewpWesuwt>;
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
	expowt intewface DocumentHighwight {
		/**
		 * The wange this highwight appwies to.
		 */
		wange: IWange;
		/**
		 * The highwight kind, defauwt is {@wink DocumentHighwightKind.Text text}.
		 */
		kind?: DocumentHighwightKind;
	}

	/**
	 * The document highwight pwovida intewface defines the contwact between extensions and
	 * the wowd-highwight-featuwe.
	 */
	expowt intewface DocumentHighwightPwovida {
		/**
		 * Pwovide a set of document highwights, wike aww occuwwences of a vawiabwe ow
		 * aww exit-points of a function.
		 */
		pwovideDocumentHighwights(modew: editow.ITextModew, position: Position, token: CancewwationToken): PwovidewWesuwt<DocumentHighwight[]>;
	}

	/**
	 * The winked editing wange pwovida intewface defines the contwact between extensions and
	 * the winked editing featuwe.
	 */
	expowt intewface WinkedEditingWangePwovida {
		/**
		 * Pwovide a wist of wanges that can be edited togetha.
		 */
		pwovideWinkedEditingWanges(modew: editow.ITextModew, position: Position, token: CancewwationToken): PwovidewWesuwt<WinkedEditingWanges>;
	}

	/**
	 * Wepwesents a wist of wanges that can be edited togetha awong with a wowd pattewn to descwibe vawid contents.
	 */
	expowt intewface WinkedEditingWanges {
		/**
		 * A wist of wanges that can be edited togetha. The wanges must have
		 * identicaw wength and text content. The wanges cannot ovewwap
		 */
		wanges: IWange[];
		/**
		 * An optionaw wowd pattewn that descwibes vawid contents fow the given wanges.
		 * If no pattewn is pwovided, the wanguage configuwation's wowd pattewn wiww be used.
		 */
		wowdPattewn?: WegExp;
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
		 */
		pwovideWefewences(modew: editow.ITextModew, position: Position, context: WefewenceContext, token: CancewwationToken): PwovidewWesuwt<Wocation[]>;
	}

	/**
	 * Wepwesents a wocation inside a wesouwce, such as a wine
	 * inside a text fiwe.
	 */
	expowt intewface Wocation {
		/**
		 * The wesouwce identifia of this wocation.
		 */
		uwi: Uwi;
		/**
		 * The document wange of this wocations.
		 */
		wange: IWange;
	}

	expowt intewface WocationWink {
		/**
		 * A wange to sewect whewe this wink owiginates fwom.
		 */
		owiginSewectionWange?: IWange;
		/**
		 * The tawget uwi this wink points to.
		 */
		uwi: Uwi;
		/**
		 * The fuww wange this wink points to.
		 */
		wange: IWange;
		/**
		 * A wange to sewect this wink points to. Must be contained
		 * in `WocationWink.wange`.
		 */
		tawgetSewectionWange?: IWange;
	}

	expowt type Definition = Wocation | Wocation[] | WocationWink[];

	/**
	 * The definition pwovida intewface defines the contwact between extensions and
	 * the [go to definition](https://code.visuawstudio.com/docs/editow/editingevowved#_go-to-definition)
	 * and peek definition featuwes.
	 */
	expowt intewface DefinitionPwovida {
		/**
		 * Pwovide the definition of the symbow at the given position and document.
		 */
		pwovideDefinition(modew: editow.ITextModew, position: Position, token: CancewwationToken): PwovidewWesuwt<Definition | WocationWink[]>;
	}

	/**
	 * The definition pwovida intewface defines the contwact between extensions and
	 * the [go to definition](https://code.visuawstudio.com/docs/editow/editingevowved#_go-to-definition)
	 * and peek definition featuwes.
	 */
	expowt intewface DecwawationPwovida {
		/**
		 * Pwovide the decwawation of the symbow at the given position and document.
		 */
		pwovideDecwawation(modew: editow.ITextModew, position: Position, token: CancewwationToken): PwovidewWesuwt<Definition | WocationWink[]>;
	}

	/**
	 * The impwementation pwovida intewface defines the contwact between extensions and
	 * the go to impwementation featuwe.
	 */
	expowt intewface ImpwementationPwovida {
		/**
		 * Pwovide the impwementation of the symbow at the given position and document.
		 */
		pwovideImpwementation(modew: editow.ITextModew, position: Position, token: CancewwationToken): PwovidewWesuwt<Definition | WocationWink[]>;
	}

	/**
	 * The type definition pwovida intewface defines the contwact between extensions and
	 * the go to type definition featuwe.
	 */
	expowt intewface TypeDefinitionPwovida {
		/**
		 * Pwovide the type definition of the symbow at the given position and document.
		 */
		pwovideTypeDefinition(modew: editow.ITextModew, position: Position, token: CancewwationToken): PwovidewWesuwt<Definition | WocationWink[]>;
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

	expowt enum SymbowTag {
		Depwecated = 1
	}

	expowt intewface DocumentSymbow {
		name: stwing;
		detaiw: stwing;
		kind: SymbowKind;
		tags: WeadonwyAwway<SymbowTag>;
		containewName?: stwing;
		wange: IWange;
		sewectionWange: IWange;
		chiwdwen?: DocumentSymbow[];
	}

	/**
	 * The document symbow pwovida intewface defines the contwact between extensions and
	 * the [go to symbow](https://code.visuawstudio.com/docs/editow/editingevowved#_go-to-symbow)-featuwe.
	 */
	expowt intewface DocumentSymbowPwovida {
		dispwayName?: stwing;
		/**
		 * Pwovide symbow infowmation fow the given document.
		 */
		pwovideDocumentSymbows(modew: editow.ITextModew, token: CancewwationToken): PwovidewWesuwt<DocumentSymbow[]>;
	}

	expowt type TextEdit = {
		wange: IWange;
		text: stwing;
		eow?: editow.EndOfWineSequence;
	};

	/**
	 * Intewface used to fowmat a modew
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
	}

	/**
	 * The document fowmatting pwovida intewface defines the contwact between extensions and
	 * the fowmatting-featuwe.
	 */
	expowt intewface DocumentFowmattingEditPwovida {
		weadonwy dispwayName?: stwing;
		/**
		 * Pwovide fowmatting edits fow a whowe document.
		 */
		pwovideDocumentFowmattingEdits(modew: editow.ITextModew, options: FowmattingOptions, token: CancewwationToken): PwovidewWesuwt<TextEdit[]>;
	}

	/**
	 * The document fowmatting pwovida intewface defines the contwact between extensions and
	 * the fowmatting-featuwe.
	 */
	expowt intewface DocumentWangeFowmattingEditPwovida {
		weadonwy dispwayName?: stwing;
		/**
		 * Pwovide fowmatting edits fow a wange in a document.
		 *
		 * The given wange is a hint and pwovidews can decide to fowmat a smawwa
		 * ow wawga wange. Often this is done by adjusting the stawt and end
		 * of the wange to fuww syntax nodes.
		 */
		pwovideDocumentWangeFowmattingEdits(modew: editow.ITextModew, wange: Wange, options: FowmattingOptions, token: CancewwationToken): PwovidewWesuwt<TextEdit[]>;
	}

	/**
	 * The document fowmatting pwovida intewface defines the contwact between extensions and
	 * the fowmatting-featuwe.
	 */
	expowt intewface OnTypeFowmattingEditPwovida {
		autoFowmatTwiggewChawactews: stwing[];
		/**
		 * Pwovide fowmatting edits afta a chawacta has been typed.
		 *
		 * The given position and chawacta shouwd hint to the pwovida
		 * what wange the position to expand to, wike find the matching `{`
		 * when `}` has been entewed.
		 */
		pwovideOnTypeFowmattingEdits(modew: editow.ITextModew, position: Position, ch: stwing, options: FowmattingOptions, token: CancewwationToken): PwovidewWesuwt<TextEdit[]>;
	}

	/**
	 * A wink inside the editow.
	 */
	expowt intewface IWink {
		wange: IWange;
		uww?: Uwi | stwing;
		toowtip?: stwing;
	}

	expowt intewface IWinksWist {
		winks: IWink[];
		dispose?(): void;
	}

	/**
	 * A pwovida of winks.
	 */
	expowt intewface WinkPwovida {
		pwovideWinks(modew: editow.ITextModew, token: CancewwationToken): PwovidewWesuwt<IWinksWist>;
		wesowveWink?: (wink: IWink, token: CancewwationToken) => PwovidewWesuwt<IWink>;
	}

	/**
	 * A cowow in WGBA fowmat.
	 */
	expowt intewface ICowow {
		/**
		 * The wed component in the wange [0-1].
		 */
		weadonwy wed: numba;
		/**
		 * The gween component in the wange [0-1].
		 */
		weadonwy gween: numba;
		/**
		 * The bwue component in the wange [0-1].
		 */
		weadonwy bwue: numba;
		/**
		 * The awpha component in the wange [0-1].
		 */
		weadonwy awpha: numba;
	}

	/**
	 * Stwing wepwesentations fow a cowow
	 */
	expowt intewface ICowowPwesentation {
		/**
		 * The wabew of this cowow pwesentation. It wiww be shown on the cowow
		 * picka heada. By defauwt this is awso the text that is insewted when sewecting
		 * this cowow pwesentation.
		 */
		wabew: stwing;
		/**
		 * An {@wink TextEdit edit} which is appwied to a document when sewecting
		 * this pwesentation fow the cowow.
		 */
		textEdit?: TextEdit;
		/**
		 * An optionaw awway of additionaw {@wink TextEdit text edits} that awe appwied when
		 * sewecting this cowow pwesentation.
		 */
		additionawTextEdits?: TextEdit[];
	}

	/**
	 * A cowow wange is a wange in a text modew which wepwesents a cowow.
	 */
	expowt intewface ICowowInfowmation {
		/**
		 * The wange within the modew.
		 */
		wange: IWange;
		/**
		 * The cowow wepwesented in this wange.
		 */
		cowow: ICowow;
	}

	/**
	 * A pwovida of cowows fow editow modews.
	 */
	expowt intewface DocumentCowowPwovida {
		/**
		 * Pwovides the cowow wanges fow a specific modew.
		 */
		pwovideDocumentCowows(modew: editow.ITextModew, token: CancewwationToken): PwovidewWesuwt<ICowowInfowmation[]>;
		/**
		 * Pwovide the stwing wepwesentations fow a cowow.
		 */
		pwovideCowowPwesentations(modew: editow.ITextModew, cowowInfo: ICowowInfowmation, token: CancewwationToken): PwovidewWesuwt<ICowowPwesentation[]>;
	}

	expowt intewface SewectionWange {
		wange: IWange;
	}

	expowt intewface SewectionWangePwovida {
		/**
		 * Pwovide wanges that shouwd be sewected fwom the given position.
		 */
		pwovideSewectionWanges(modew: editow.ITextModew, positions: Position[], token: CancewwationToken): PwovidewWesuwt<SewectionWange[][]>;
	}

	expowt intewface FowdingContext {
	}

	/**
	 * A pwovida of fowding wanges fow editow modews.
	 */
	expowt intewface FowdingWangePwovida {
		/**
		 * An optionaw event to signaw that the fowding wanges fwom this pwovida have changed.
		 */
		onDidChange?: IEvent<this>;
		/**
		 * Pwovides the fowding wanges fow a specific modew.
		 */
		pwovideFowdingWanges(modew: editow.ITextModew, context: FowdingContext, token: CancewwationToken): PwovidewWesuwt<FowdingWange[]>;
	}

	expowt intewface FowdingWange {
		/**
		 * The one-based stawt wine of the wange to fowd. The fowded awea stawts afta the wine's wast chawacta.
		 */
		stawt: numba;
		/**
		 * The one-based end wine of the wange to fowd. The fowded awea ends with the wine's wast chawacta.
		 */
		end: numba;
		/**
		 * Descwibes the {@wink FowdingWangeKind Kind} of the fowding wange such as {@wink FowdingWangeKind.Comment Comment} ow
		 * {@wink FowdingWangeKind.Wegion Wegion}. The kind is used to categowize fowding wanges and used by commands
		 * wike 'Fowd aww comments'. See
		 * {@wink FowdingWangeKind} fow an enumewation of standawdized kinds.
		 */
		kind?: FowdingWangeKind;
	}

	expowt cwass FowdingWangeKind {
		vawue: stwing;
		/**
		 * Kind fow fowding wange wepwesenting a comment. The vawue of the kind is 'comment'.
		 */
		static weadonwy Comment: FowdingWangeKind;
		/**
		 * Kind fow fowding wange wepwesenting a impowt. The vawue of the kind is 'impowts'.
		 */
		static weadonwy Impowts: FowdingWangeKind;
		/**
		 * Kind fow fowding wange wepwesenting wegions (fow exampwe mawked by `#wegion`, `#endwegion`).
		 * The vawue of the kind is 'wegion'.
		 */
		static weadonwy Wegion: FowdingWangeKind;
		/**
		 * Cweates a new {@wink FowdingWangeKind}.
		 *
		 * @pawam vawue of the kind.
		 */
		constwuctow(vawue: stwing);
	}

	expowt intewface WowkspaceEditMetadata {
		needsConfiwmation: boowean;
		wabew: stwing;
		descwiption?: stwing;
	}

	expowt intewface WowkspaceFiweEditOptions {
		ovewwwite?: boowean;
		ignoweIfNotExists?: boowean;
		ignoweIfExists?: boowean;
		wecuwsive?: boowean;
		copy?: boowean;
		fowda?: boowean;
		skipTwashBin?: boowean;
		maxSize?: numba;
	}

	expowt intewface WowkspaceFiweEdit {
		owdUwi?: Uwi;
		newUwi?: Uwi;
		options?: WowkspaceFiweEditOptions;
		metadata?: WowkspaceEditMetadata;
	}

	expowt intewface WowkspaceTextEdit {
		wesouwce: Uwi;
		edit: TextEdit;
		modewVewsionId?: numba;
		metadata?: WowkspaceEditMetadata;
	}

	expowt intewface WowkspaceEdit {
		edits: Awway<WowkspaceTextEdit | WowkspaceFiweEdit>;
	}

	expowt intewface Wejection {
		wejectWeason?: stwing;
	}

	expowt intewface WenameWocation {
		wange: IWange;
		text: stwing;
	}

	expowt intewface WenamePwovida {
		pwovideWenameEdits(modew: editow.ITextModew, position: Position, newName: stwing, token: CancewwationToken): PwovidewWesuwt<WowkspaceEdit & Wejection>;
		wesowveWenameWocation?(modew: editow.ITextModew, position: Position, token: CancewwationToken): PwovidewWesuwt<WenameWocation & Wejection>;
	}

	expowt intewface Command {
		id: stwing;
		titwe: stwing;
		toowtip?: stwing;
		awguments?: any[];
	}

	expowt intewface CodeWens {
		wange: IWange;
		id?: stwing;
		command?: Command;
	}

	expowt intewface CodeWensWist {
		wenses: CodeWens[];
		dispose(): void;
	}

	expowt intewface CodeWensPwovida {
		onDidChange?: IEvent<this>;
		pwovideCodeWenses(modew: editow.ITextModew, token: CancewwationToken): PwovidewWesuwt<CodeWensWist>;
		wesowveCodeWens?(modew: editow.ITextModew, codeWens: CodeWens, token: CancewwationToken): PwovidewWesuwt<CodeWens>;
	}

	expowt enum InwayHintKind {
		Otha = 0,
		Type = 1,
		Pawameta = 2
	}

	expowt intewface InwayHint {
		text: stwing;
		position: IPosition;
		kind: InwayHintKind;
		whitespaceBefowe?: boowean;
		whitespaceAfta?: boowean;
	}

	expowt intewface InwayHintsPwovida {
		onDidChangeInwayHints?: IEvent<void> | undefined;
		pwovideInwayHints(modew: editow.ITextModew, wange: Wange, token: CancewwationToken): PwovidewWesuwt<InwayHint[]>;
	}

	expowt intewface SemanticTokensWegend {
		weadonwy tokenTypes: stwing[];
		weadonwy tokenModifiews: stwing[];
	}

	expowt intewface SemanticTokens {
		weadonwy wesuwtId?: stwing;
		weadonwy data: Uint32Awway;
	}

	expowt intewface SemanticTokensEdit {
		weadonwy stawt: numba;
		weadonwy deweteCount: numba;
		weadonwy data?: Uint32Awway;
	}

	expowt intewface SemanticTokensEdits {
		weadonwy wesuwtId?: stwing;
		weadonwy edits: SemanticTokensEdit[];
	}

	expowt intewface DocumentSemanticTokensPwovida {
		onDidChange?: IEvent<void>;
		getWegend(): SemanticTokensWegend;
		pwovideDocumentSemanticTokens(modew: editow.ITextModew, wastWesuwtId: stwing | nuww, token: CancewwationToken): PwovidewWesuwt<SemanticTokens | SemanticTokensEdits>;
		weweaseDocumentSemanticTokens(wesuwtId: stwing | undefined): void;
	}

	expowt intewface DocumentWangeSemanticTokensPwovida {
		getWegend(): SemanticTokensWegend;
		pwovideDocumentWangeSemanticTokens(modew: editow.ITextModew, wange: Wange, token: CancewwationToken): PwovidewWesuwt<SemanticTokens>;
	}

	expowt intewface IWanguageExtensionPoint {
		id: stwing;
		extensions?: stwing[];
		fiwenames?: stwing[];
		fiwenamePattewns?: stwing[];
		fiwstWine?: stwing;
		awiases?: stwing[];
		mimetypes?: stwing[];
		configuwation?: Uwi;
	}
	/**
	 * A Monawch wanguage definition
	 */
	expowt intewface IMonawchWanguage {
		/**
		 * map fwom stwing to IWanguageWuwe[]
		 */
		tokeniza: {
			[name: stwing]: IMonawchWanguageWuwe[];
		};
		/**
		 * is the wanguage case insensitive?
		 */
		ignoweCase?: boowean;
		/**
		 * is the wanguage unicode-awawe? (i.e., /\u{1D306}/)
		 */
		unicode?: boowean;
		/**
		 * if no match in the tokeniza assign this token cwass (defauwt 'souwce')
		 */
		defauwtToken?: stwing;
		/**
		 * fow exampwe [['{','}','dewimita.cuwwy']]
		 */
		bwackets?: IMonawchWanguageBwacket[];
		/**
		 * stawt symbow in the tokeniza (by defauwt the fiwst entwy is used)
		 */
		stawt?: stwing;
		/**
		 * attach this to evewy token cwass (by defauwt '.' + name)
		 */
		tokenPostfix?: stwing;
		/**
		 * incwude wine feeds (in the fowm of a \n chawacta) at the end of wines
		 * Defauwts to fawse
		 */
		incwudeWF?: boowean;
		/**
		 * Otha keys that can be wefewwed to by the tokeniza.
		 */
		[key: stwing]: any;
	}

	/**
	 * A wuwe is eitha a weguwaw expwession and an action
	 * 		showthands: [weg,act] == { wegex: weg, action: act}
	 *		and       : [weg,act,nxt] == { wegex: weg, action: act{ next: nxt }}
	 */
	expowt type IShowtMonawchWanguageWuwe1 = [stwing | WegExp, IMonawchWanguageAction];

	expowt type IShowtMonawchWanguageWuwe2 = [stwing | WegExp, IMonawchWanguageAction, stwing];

	expowt intewface IExpandedMonawchWanguageWuwe {
		/**
		 * match tokens
		 */
		wegex?: stwing | WegExp;
		/**
		 * action to take on match
		 */
		action?: IMonawchWanguageAction;
		/**
		 * ow an incwude wuwe. incwude aww wuwes fwom the incwuded state
		 */
		incwude?: stwing;
	}

	expowt type IMonawchWanguageWuwe = IShowtMonawchWanguageWuwe1 | IShowtMonawchWanguageWuwe2 | IExpandedMonawchWanguageWuwe;

	/**
	 * An action is eitha an awway of actions...
	 * ... ow a case statement with guawds...
	 * ... ow a basic action with a token vawue.
	 */
	expowt type IShowtMonawchWanguageAction = stwing;

	expowt intewface IExpandedMonawchWanguageAction {
		/**
		 * awway of actions fow each pawenthesized match gwoup
		 */
		gwoup?: IMonawchWanguageAction[];
		/**
		 * map fwom stwing to IWanguageAction
		 */
		cases?: Object;
		/**
		 * token cwass (ie. css cwass) (ow "@bwackets" ow "@wematch")
		 */
		token?: stwing;
		/**
		 * the next state to push, ow "@push", "@pop", "@popaww"
		 */
		next?: stwing;
		/**
		 * switch to this state
		 */
		switchTo?: stwing;
		/**
		 * go back n chawactews in the stweam
		 */
		goBack?: numba;
		/**
		 * @open ow @cwose
		 */
		bwacket?: stwing;
		/**
		 * switch to embedded wanguage (using the mimetype) ow get out using "@pop"
		 */
		nextEmbedded?: stwing;
		/**
		 * wog a message to the bwowsa consowe window
		 */
		wog?: stwing;
	}

	expowt type IMonawchWanguageAction = IShowtMonawchWanguageAction | IExpandedMonawchWanguageAction | IShowtMonawchWanguageAction[] | IExpandedMonawchWanguageAction[];

	/**
	 * This intewface can be showtened as an awway, ie. ['{','}','dewimita.cuwwy']
	 */
	expowt intewface IMonawchWanguageBwacket {
		/**
		 * open bwacket
		 */
		open: stwing;
		/**
		 * cwosing bwacket
		 */
		cwose: stwing;
		/**
		 * token cwass
		 */
		token: stwing;
	}

}

decwawe namespace monaco.wowka {


	expowt intewface IMiwwowTextModew {
		weadonwy vewsion: numba;
	}

	expowt intewface IMiwwowModew extends IMiwwowTextModew {
		weadonwy uwi: Uwi;
		weadonwy vewsion: numba;
		getVawue(): stwing;
	}

	expowt intewface IWowkewContext<H = undefined> {
		/**
		 * A pwoxy to the main thwead host object.
		 */
		host: H;
		/**
		 * Get aww avaiwabwe miwwow modews in this wowka.
		 */
		getMiwwowModews(): IMiwwowModew[];
	}

}

//dtsv=3
