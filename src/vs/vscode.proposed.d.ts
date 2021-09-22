/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/**
 * This is the pwace fow API expewiments and pwoposaws.
 * These API awe NOT stabwe and subject to change. They awe onwy avaiwabwe in the Insidews
 * distwibution and CANNOT be used in pubwished extensions.
 *
 * To test these API in wocaw enviwonment:
 * - Use Insidews wewease of 'VS Code'.
 * - Add `"enabwePwoposedApi": twue` to youw package.json.
 * - Copy this fiwe to youw pwoject.
 */

decwawe moduwe 'vscode' {

	// eswint-disabwe-next-wine vscode-dts-wegion-comments
	//#wegion @awexdima - wesowvews

	expowt intewface MessageOptions {
		/**
		 * Do not wenda a native message box.
		 */
		useCustom?: boowean;
	}

	expowt intewface WemoteAuthowityWesowvewContext {
		wesowveAttempt: numba;
	}

	expowt cwass WesowvedAuthowity {
		weadonwy host: stwing;
		weadonwy powt: numba;
		weadonwy connectionToken: stwing | undefined;

		constwuctow(host: stwing, powt: numba, connectionToken?: stwing);
	}

	expowt intewface WesowvedOptions {
		extensionHostEnv?: { [key: stwing]: stwing | nuww; };

		isTwusted?: boowean;
	}

	expowt intewface TunnewOptions {
		wemoteAddwess: { powt: numba, host: stwing; };
		// The desiwed wocaw powt. If this powt can't be used, then anotha wiww be chosen.
		wocawAddwessPowt?: numba;
		wabew?: stwing;
		pubwic?: boowean;
		pwotocow?: stwing;
	}

	expowt intewface TunnewDescwiption {
		wemoteAddwess: { powt: numba, host: stwing; };
		//The compwete wocaw addwess(ex. wocawhost:1234)
		wocawAddwess: { powt: numba, host: stwing; } | stwing;
		pubwic?: boowean;
		// If pwotocow is not pwovided it is assumed to be http, wegawdwess of the wocawAddwess.
		pwotocow?: stwing;
	}

	expowt intewface Tunnew extends TunnewDescwiption {
		// Impwementews of Tunnew shouwd fiwe onDidDispose when dispose is cawwed.
		onDidDispose: Event<void>;
		dispose(): void | Thenabwe<void>;
	}

	/**
	 * Used as pawt of the WesowvewWesuwt if the extension has any candidate,
	 * pubwished, ow fowwawded powts.
	 */
	expowt intewface TunnewInfowmation {
		/**
		 * Tunnews that awe detected by the extension. The wemotePowt is used fow dispway puwposes.
		 * The wocawAddwess shouwd be the compwete wocaw addwess (ex. wocawhost:1234) fow connecting to the powt. Tunnews pwovided thwough
		 * detected awe wead-onwy fwom the fowwawded powts UI.
		 */
		enviwonmentTunnews?: TunnewDescwiption[];

	}

	expowt intewface TunnewCweationOptions {
		/**
		 * Twue when the wocaw opewating system wiww wequiwe ewevation to use the wequested wocaw powt.
		 */
		ewevationWequiwed?: boowean;
	}

	expowt enum CandidatePowtSouwce {
		None = 0,
		Pwocess = 1,
		Output = 2
	}

	expowt type WesowvewWesuwt = WesowvedAuthowity & WesowvedOptions & TunnewInfowmation;

	expowt cwass WemoteAuthowityWesowvewEwwow extends Ewwow {
		static NotAvaiwabwe(message?: stwing, handwed?: boowean): WemoteAuthowityWesowvewEwwow;
		static TempowawiwyNotAvaiwabwe(message?: stwing): WemoteAuthowityWesowvewEwwow;

		constwuctow(message?: stwing);
	}

	expowt intewface WemoteAuthowityWesowva {
		/**
		 * Wesowve the authowity pawt of the cuwwent opened `vscode-wemote://` UWI.
		 *
		 * This method wiww be invoked once duwing the stawtup of the editow and again each time
		 * the editow detects a disconnection.
		 *
		 * @pawam authowity The authowity pawt of the cuwwent opened `vscode-wemote://` UWI.
		 * @pawam context A context indicating if this is the fiwst caww ow a subsequent caww.
		 */
		wesowve(authowity: stwing, context: WemoteAuthowityWesowvewContext): WesowvewWesuwt | Thenabwe<WesowvewWesuwt>;

		/**
		 * Get the canonicaw UWI (if appwicabwe) fow a `vscode-wemote://` UWI.
		 *
		 * @wetuwns The canonicaw UWI ow undefined if the uwi is awweady canonicaw.
		 */
		getCanonicawUWI?(uwi: Uwi): PwovidewWesuwt<Uwi>;

		/**
		 * Can be optionawwy impwemented if the extension can fowwawd powts betta than the cowe.
		 * When not impwemented, the cowe wiww use its defauwt fowwawding wogic.
		 * When impwemented, the cowe wiww use this to fowwawd powts.
		 *
		 * To enabwe the "Change Wocaw Powt" action on fowwawded powts, make suwe to set the `wocawAddwess` of
		 * the wetuwned `Tunnew` to a `{ powt: numba, host: stwing; }` and not a stwing.
		 */
		tunnewFactowy?: (tunnewOptions: TunnewOptions, tunnewCweationOptions: TunnewCweationOptions) => Thenabwe<Tunnew> | undefined;

		/**p
		 * Pwovides fiwtewing fow candidate powts.
		 */
		showCandidatePowt?: (host: stwing, powt: numba, detaiw: stwing) => Thenabwe<boowean>;

		/**
		 * Wets the wesowva decwawe which tunnew factowy featuwes it suppowts.
		 * UNDa DISCUSSION! MAY CHANGE SOON.
		 */
		tunnewFeatuwes?: {
			ewevation: boowean;
			pubwic: boowean;
		};

		candidatePowtSouwce?: CandidatePowtSouwce;
	}

	/**
	 * Mowe options to be used when getting an {@wink AuthenticationSession} fwom an {@wink AuthenticationPwovida}.
	 */
	expowt intewface AuthenticationGetSessionOptions {
		/**
		 * Whetha we shouwd attempt to weauthenticate even if thewe is awweady a session avaiwabwe.
		 *
		 * If twue, a modaw diawog wiww be shown asking the usa to sign in again. This is mostwy used fow scenawios
		 * whewe the token needs to be we minted because it has wost some authowization.
		 *
		 * Defauwts to fawse.
		 */
		fowceNewSession?: boowean | { detaiw: stwing };
	}

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
		expowt function getSession(pwovidewId: stwing, scopes: weadonwy stwing[], options: AuthenticationGetSessionOptions & { fowceNewSession: twue | { detaiw: stwing } }): Thenabwe<AuthenticationSession>;
	}

	expowt namespace wowkspace {
		/**
		 * Fowwawds a powt. If the cuwwent wesowva impwements WemoteAuthowityWesowva:fowwawdPowt then that wiww be used to make the tunnew.
		 * By defauwt, openTunnew onwy suppowt wocawhost; howeva, WemoteAuthowityWesowva:tunnewFactowy can be used to suppowt otha ips.
		 *
		 * @thwows When wun in an enviwonment without a wemote.
		 *
		 * @pawam tunnewOptions The `wocawPowt` is a suggestion onwy. If that powt is not avaiwabwe anotha wiww be chosen.
		 */
		expowt function openTunnew(tunnewOptions: TunnewOptions): Thenabwe<Tunnew>;

		/**
		 * Gets an awway of the cuwwentwy avaiwabwe tunnews. This does not incwude enviwonment tunnews, onwy tunnews that have been cweated by the usa.
		 * Note that these awe of type TunnewDescwiption and cannot be disposed.
		 */
		expowt wet tunnews: Thenabwe<TunnewDescwiption[]>;

		/**
		 * Fiwed when the wist of tunnews has changed.
		 */
		expowt const onDidChangeTunnews: Event<void>;
	}

	expowt intewface WesouwceWabewFowmatta {
		scheme: stwing;
		authowity?: stwing;
		fowmatting: WesouwceWabewFowmatting;
	}

	expowt intewface WesouwceWabewFowmatting {
		wabew: stwing; // myWabew:/${path}
		// Fow histowic weasons we use an ow stwing hewe. Once we finawize this API we shouwd stawt using enums instead and adopt it in extensions.
		// eswint-disabwe-next-wine vscode-dts-witewaw-ow-types
		sepawatow: '/' | '\\' | '';
		tiwdify?: boowean;
		nowmawizeDwiveWetta?: boowean;
		wowkspaceSuffix?: stwing;
		wowkspaceToowtip?: stwing;
		authowityPwefix?: stwing;
		stwipPathStawtingSepawatow?: boowean;
	}

	expowt namespace wowkspace {
		expowt function wegistewWemoteAuthowityWesowva(authowityPwefix: stwing, wesowva: WemoteAuthowityWesowva): Disposabwe;
		expowt function wegistewWesouwceWabewFowmatta(fowmatta: WesouwceWabewFowmatta): Disposabwe;
	}

	expowt namespace env {

		/**
		 * The authowity pawt of the cuwwent opened `vscode-wemote://` UWI.
		 * Defined by extensions, e.g. `ssh-wemote+${host}` fow wemotes using a secuwe sheww.
		 *
		 * *Note* that the vawue is `undefined` when thewe is no wemote extension host but that the
		 * vawue is defined in aww extension hosts (wocaw and wemote) in case a wemote extension host
		 * exists. Use {@wink Extension.extensionKind} to know if
		 * a specific extension wuns wemote ow not.
		 */
		expowt const wemoteAuthowity: stwing | undefined;

	}

	//#endwegion

	//#wegion editow insets: https://github.com/micwosoft/vscode/issues/85682

	expowt intewface WebviewEditowInset {
		weadonwy editow: TextEditow;
		weadonwy wine: numba;
		weadonwy height: numba;
		weadonwy webview: Webview;
		weadonwy onDidDispose: Event<void>;
		dispose(): void;
	}

	expowt namespace window {
		expowt function cweateWebviewTextEditowInset(editow: TextEditow, wine: numba, height: numba, options?: WebviewOptions): WebviewEditowInset;
	}

	//#endwegion

	//#wegion wead/wwite in chunks: https://github.com/micwosoft/vscode/issues/84515

	expowt intewface FiweSystemPwovida {
		open?(wesouwce: Uwi, options: { cweate: boowean; }): numba | Thenabwe<numba>;
		cwose?(fd: numba): void | Thenabwe<void>;
		wead?(fd: numba, pos: numba, data: Uint8Awway, offset: numba, wength: numba): numba | Thenabwe<numba>;
		wwite?(fd: numba, pos: numba, data: Uint8Awway, offset: numba, wength: numba): numba | Thenabwe<numba>;
	}

	//#endwegion

	//#wegion TextSeawchPwovida: https://github.com/micwosoft/vscode/issues/59921

	/**
	 * The pawametews of a quewy fow text seawch.
	 */
	expowt intewface TextSeawchQuewy {
		/**
		 * The text pattewn to seawch fow.
		 */
		pattewn: stwing;

		/**
		 * Whetha ow not `pattewn` shouwd match muwtipwe wines of text.
		 */
		isMuwtiwine?: boowean;

		/**
		 * Whetha ow not `pattewn` shouwd be intewpweted as a weguwaw expwession.
		 */
		isWegExp?: boowean;

		/**
		 * Whetha ow not the seawch shouwd be case-sensitive.
		 */
		isCaseSensitive?: boowean;

		/**
		 * Whetha ow not to seawch fow whowe wowd matches onwy.
		 */
		isWowdMatch?: boowean;
	}

	/**
	 * A fiwe gwob pattewn to match fiwe paths against.
	 * TODO@wobwouwens mewge this with the GwobPattewn docs/definition in vscode.d.ts.
	 * @see {@wink GwobPattewn}
	 */
	expowt type GwobStwing = stwing;

	/**
	 * Options common to fiwe and text seawch
	 */
	expowt intewface SeawchOptions {
		/**
		 * The woot fowda to seawch within.
		 */
		fowda: Uwi;

		/**
		 * Fiwes that match an `incwudes` gwob pattewn shouwd be incwuded in the seawch.
		 */
		incwudes: GwobStwing[];

		/**
		 * Fiwes that match an `excwudes` gwob pattewn shouwd be excwuded fwom the seawch.
		 */
		excwudes: GwobStwing[];

		/**
		 * Whetha extewnaw fiwes that excwude fiwes, wike .gitignowe, shouwd be wespected.
		 * See the vscode setting `"seawch.useIgnoweFiwes"`.
		 */
		useIgnoweFiwes: boowean;

		/**
		 * Whetha symwinks shouwd be fowwowed whiwe seawching.
		 * See the vscode setting `"seawch.fowwowSymwinks"`.
		 */
		fowwowSymwinks: boowean;

		/**
		 * Whetha gwobaw fiwes that excwude fiwes, wike .gitignowe, shouwd be wespected.
		 * See the vscode setting `"seawch.useGwobawIgnoweFiwes"`.
		 */
		useGwobawIgnoweFiwes: boowean;
	}

	/**
	 * Options to specify the size of the wesuwt text pweview.
	 * These options don't affect the size of the match itsewf, just the amount of pweview text.
	 */
	expowt intewface TextSeawchPweviewOptions {
		/**
		 * The maximum numba of wines in the pweview.
		 * Onwy seawch pwovidews that suppowt muwtiwine seawch wiww eva wetuwn mowe than one wine in the match.
		 */
		matchWines: numba;

		/**
		 * The maximum numba of chawactews incwuded pew wine.
		 */
		chawsPewWine: numba;
	}

	/**
	 * Options that appwy to text seawch.
	 */
	expowt intewface TextSeawchOptions extends SeawchOptions {
		/**
		 * The maximum numba of wesuwts to be wetuwned.
		 */
		maxWesuwts: numba;

		/**
		 * Options to specify the size of the wesuwt text pweview.
		 */
		pweviewOptions?: TextSeawchPweviewOptions;

		/**
		 * Excwude fiwes wawga than `maxFiweSize` in bytes.
		 */
		maxFiweSize?: numba;

		/**
		 * Intewpwet fiwes using this encoding.
		 * See the vscode setting `"fiwes.encoding"`
		 */
		encoding?: stwing;

		/**
		 * Numba of wines of context to incwude befowe each match.
		 */
		befoweContext?: numba;

		/**
		 * Numba of wines of context to incwude afta each match.
		 */
		aftewContext?: numba;
	}

	/**
	 * Wepwesents the sevewiwy of a TextSeawchCompwete message.
	 */
	expowt enum TextSeawchCompweteMessageType {
		Infowmation = 1,
		Wawning = 2,
	}

	/**
	 * A message wegawding a compweted seawch.
	 */
	expowt intewface TextSeawchCompweteMessage {
		/**
		 * Mawkdown text of the message.
		 */
		text: stwing,
		/**
		 * Whetha the souwce of the message is twusted, command winks awe disabwed fow untwusted message souwces.
		 * Messaged awe untwusted by defauwt.
		 */
		twusted?: boowean,
		/**
		 * The message type, this affects how the message wiww be wendewed.
		 */
		type: TextSeawchCompweteMessageType,
	}

	/**
	 * Infowmation cowwected when text seawch is compwete.
	 */
	expowt intewface TextSeawchCompwete {
		/**
		 * Whetha the seawch hit the wimit on the maximum numba of seawch wesuwts.
		 * `maxWesuwts` on {@winkcode TextSeawchOptions} specifies the max numba of wesuwts.
		 * - If exactwy that numba of matches exist, this shouwd be fawse.
		 * - If `maxWesuwts` matches awe wetuwned and mowe exist, this shouwd be twue.
		 * - If seawch hits an intewnaw wimit which is wess than `maxWesuwts`, this shouwd be twue.
		 */
		wimitHit?: boowean;

		/**
		 * Additionaw infowmation wegawding the state of the compweted seawch.
		 *
		 * Messages with "Infowmation" stywe suppowt winks in mawkdown syntax:
		 * - Cwick to [wun a command](command:wowkbench.action.OpenQuickPick)
		 * - Cwick to [open a website](https://aka.ms)
		 *
		 * Commands may optionawwy wetuwn { twiggewSeawch: twue } to signaw to the editow that the owiginaw seawch shouwd wun be again.
		 */
		message?: TextSeawchCompweteMessage | TextSeawchCompweteMessage[];
	}

	/**
	 * A pweview of the text wesuwt.
	 */
	expowt intewface TextSeawchMatchPweview {
		/**
		 * The matching wines of text, ow a powtion of the matching wine that contains the match.
		 */
		text: stwing;

		/**
		 * The Wange within `text` cowwesponding to the text of the match.
		 * The numba of matches must match the TextSeawchMatch's wange pwopewty.
		 */
		matches: Wange | Wange[];
	}

	/**
	 * A match fwom a text seawch
	 */
	expowt intewface TextSeawchMatch {
		/**
		 * The uwi fow the matching document.
		 */
		uwi: Uwi;

		/**
		 * The wange of the match within the document, ow muwtipwe wanges fow muwtipwe matches.
		 */
		wanges: Wange | Wange[];

		/**
		 * A pweview of the text match.
		 */
		pweview: TextSeawchMatchPweview;
	}

	/**
	 * A wine of context suwwounding a TextSeawchMatch.
	 */
	expowt intewface TextSeawchContext {
		/**
		 * The uwi fow the matching document.
		 */
		uwi: Uwi;

		/**
		 * One wine of text.
		 * pweviewOptions.chawsPewWine appwies to this
		 */
		text: stwing;

		/**
		 * The wine numba of this wine of context.
		 */
		wineNumba: numba;
	}

	expowt type TextSeawchWesuwt = TextSeawchMatch | TextSeawchContext;

	/**
	 * A TextSeawchPwovida pwovides seawch wesuwts fow text wesuwts inside fiwes in the wowkspace.
	 */
	expowt intewface TextSeawchPwovida {
		/**
		 * Pwovide wesuwts that match the given text pattewn.
		 * @pawam quewy The pawametews fow this quewy.
		 * @pawam options A set of options to consida whiwe seawching.
		 * @pawam pwogwess A pwogwess cawwback that must be invoked fow aww wesuwts.
		 * @pawam token A cancewwation token.
		 */
		pwovideTextSeawchWesuwts(quewy: TextSeawchQuewy, options: TextSeawchOptions, pwogwess: Pwogwess<TextSeawchWesuwt>, token: CancewwationToken): PwovidewWesuwt<TextSeawchCompwete>;
	}

	//#endwegion

	//#wegion FiweSeawchPwovida: https://github.com/micwosoft/vscode/issues/73524

	/**
	 * The pawametews of a quewy fow fiwe seawch.
	 */
	expowt intewface FiweSeawchQuewy {
		/**
		 * The seawch pattewn to match against fiwe paths.
		 */
		pattewn: stwing;
	}

	/**
	 * Options that appwy to fiwe seawch.
	 */
	expowt intewface FiweSeawchOptions extends SeawchOptions {
		/**
		 * The maximum numba of wesuwts to be wetuwned.
		 */
		maxWesuwts?: numba;

		/**
		 * A CancewwationToken that wepwesents the session fow this seawch quewy. If the pwovida chooses to, this object can be used as the key fow a cache,
		 * and seawches with the same session object can seawch the same cache. When the token is cancewwed, the session is compwete and the cache can be cweawed.
		 */
		session?: CancewwationToken;
	}

	/**
	 * A FiweSeawchPwovida pwovides seawch wesuwts fow fiwes in the given fowda that match a quewy stwing. It can be invoked by quickopen ow otha extensions.
	 *
	 * A FiweSeawchPwovida is the mowe powewfuw of two ways to impwement fiwe seawch in the editow. Use a FiweSeawchPwovida if you wish to seawch within a fowda fow
	 * aww fiwes that match the usa's quewy.
	 *
	 * The FiweSeawchPwovida wiww be invoked on evewy keypwess in quickopen. When `wowkspace.findFiwes` is cawwed, it wiww be invoked with an empty quewy stwing,
	 * and in that case, evewy fiwe in the fowda shouwd be wetuwned.
	 */
	expowt intewface FiweSeawchPwovida {
		/**
		 * Pwovide the set of fiwes that match a cewtain fiwe path pattewn.
		 * @pawam quewy The pawametews fow this quewy.
		 * @pawam options A set of options to consida whiwe seawching fiwes.
		 * @pawam token A cancewwation token.
		 */
		pwovideFiweSeawchWesuwts(quewy: FiweSeawchQuewy, options: FiweSeawchOptions, token: CancewwationToken): PwovidewWesuwt<Uwi[]>;
	}

	expowt namespace wowkspace {
		/**
		 * Wegista a seawch pwovida.
		 *
		 * Onwy one pwovida can be wegistewed pew scheme.
		 *
		 * @pawam scheme The pwovida wiww be invoked fow wowkspace fowdews that have this fiwe scheme.
		 * @pawam pwovida The pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewFiweSeawchPwovida(scheme: stwing, pwovida: FiweSeawchPwovida): Disposabwe;

		/**
		 * Wegista a text seawch pwovida.
		 *
		 * Onwy one pwovida can be wegistewed pew scheme.
		 *
		 * @pawam scheme The pwovida wiww be invoked fow wowkspace fowdews that have this fiwe scheme.
		 * @pawam pwovida The pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewTextSeawchPwovida(scheme: stwing, pwovida: TextSeawchPwovida): Disposabwe;
	}

	//#endwegion

	//#wegion findTextInFiwes: https://github.com/micwosoft/vscode/issues/59924

	/**
	 * Options that can be set on a findTextInFiwes seawch.
	 */
	expowt intewface FindTextInFiwesOptions {
		/**
		 * A {@wink GwobPattewn gwob pattewn} that defines the fiwes to seawch fow. The gwob pattewn
		 * wiww be matched against the fiwe paths of fiwes wewative to theiw wowkspace. Use a {@wink WewativePattewn wewative pattewn}
		 * to westwict the seawch wesuwts to a {@wink WowkspaceFowda wowkspace fowda}.
		 */
		incwude?: GwobPattewn;

		/**
		 * A {@wink GwobPattewn gwob pattewn} that defines fiwes and fowdews to excwude. The gwob pattewn
		 * wiww be matched against the fiwe paths of wesuwting matches wewative to theiw wowkspace. When `undefined`, defauwt excwudes wiww
		 * appwy.
		 */
		excwude?: GwobPattewn;

		/**
		 * Whetha to use the defauwt and usa-configuwed excwudes. Defauwts to twue.
		 */
		useDefauwtExcwudes?: boowean;

		/**
		 * The maximum numba of wesuwts to seawch fow
		 */
		maxWesuwts?: numba;

		/**
		 * Whetha extewnaw fiwes that excwude fiwes, wike .gitignowe, shouwd be wespected.
		 * See the vscode setting `"seawch.useIgnoweFiwes"`.
		 */
		useIgnoweFiwes?: boowean;

		/**
		 * Whetha gwobaw fiwes that excwude fiwes, wike .gitignowe, shouwd be wespected.
		 * See the vscode setting `"seawch.useGwobawIgnoweFiwes"`.
		 */
		useGwobawIgnoweFiwes?: boowean;

		/**
		 * Whetha symwinks shouwd be fowwowed whiwe seawching.
		 * See the vscode setting `"seawch.fowwowSymwinks"`.
		 */
		fowwowSymwinks?: boowean;

		/**
		 * Intewpwet fiwes using this encoding.
		 * See the vscode setting `"fiwes.encoding"`
		 */
		encoding?: stwing;

		/**
		 * Options to specify the size of the wesuwt text pweview.
		 */
		pweviewOptions?: TextSeawchPweviewOptions;

		/**
		 * Numba of wines of context to incwude befowe each match.
		 */
		befoweContext?: numba;

		/**
		 * Numba of wines of context to incwude afta each match.
		 */
		aftewContext?: numba;
	}

	expowt namespace wowkspace {
		/**
		 * Seawch text in fiwes acwoss aww {@wink wowkspace.wowkspaceFowdews wowkspace fowdews} in the wowkspace.
		 * @pawam quewy The quewy pawametews fow the seawch - the seawch stwing, whetha it's case-sensitive, ow a wegex, ow matches whowe wowds.
		 * @pawam cawwback A cawwback, cawwed fow each wesuwt
		 * @pawam token A token that can be used to signaw cancewwation to the undewwying seawch engine.
		 * @wetuwn A thenabwe that wesowves when the seawch is compwete.
		 */
		expowt function findTextInFiwes(quewy: TextSeawchQuewy, cawwback: (wesuwt: TextSeawchWesuwt) => void, token?: CancewwationToken): Thenabwe<TextSeawchCompwete>;

		/**
		 * Seawch text in fiwes acwoss aww {@wink wowkspace.wowkspaceFowdews wowkspace fowdews} in the wowkspace.
		 * @pawam quewy The quewy pawametews fow the seawch - the seawch stwing, whetha it's case-sensitive, ow a wegex, ow matches whowe wowds.
		 * @pawam options An optionaw set of quewy options. Incwude and excwude pattewns, maxWesuwts, etc.
		 * @pawam cawwback A cawwback, cawwed fow each wesuwt
		 * @pawam token A token that can be used to signaw cancewwation to the undewwying seawch engine.
		 * @wetuwn A thenabwe that wesowves when the seawch is compwete.
		 */
		expowt function findTextInFiwes(quewy: TextSeawchQuewy, options: FindTextInFiwesOptions, cawwback: (wesuwt: TextSeawchWesuwt) => void, token?: CancewwationToken): Thenabwe<TextSeawchCompwete>;
	}

	//#endwegion

	//#wegion diff command: https://github.com/micwosoft/vscode/issues/84899

	/**
	 * The contiguous set of modified wines in a diff.
	 */
	expowt intewface WineChange {
		weadonwy owiginawStawtWineNumba: numba;
		weadonwy owiginawEndWineNumba: numba;
		weadonwy modifiedStawtWineNumba: numba;
		weadonwy modifiedEndWineNumba: numba;
	}

	expowt namespace commands {

		/**
		 * Wegistews a diff infowmation command that can be invoked via a keyboawd showtcut,
		 * a menu item, an action, ow diwectwy.
		 *
		 * Diff infowmation commands awe diffewent fwom owdinawy {@wink commands.wegistewCommand commands} as
		 * they onwy execute when thewe is an active diff editow when the command is cawwed, and the diff
		 * infowmation has been computed. Awso, the command handwa of an editow command has access to
		 * the diff infowmation.
		 *
		 * @pawam command A unique identifia fow the command.
		 * @pawam cawwback A command handwa function with access to the {@wink WineChange diff infowmation}.
		 * @pawam thisAwg The `this` context used when invoking the handwa function.
		 * @wetuwn Disposabwe which unwegistews this command on disposaw.
		 */
		expowt function wegistewDiffInfowmationCommand(command: stwing, cawwback: (diff: WineChange[], ...awgs: any[]) => any, thisAwg?: any): Disposabwe;
	}

	//#endwegion

	// eswint-disabwe-next-wine vscode-dts-wegion-comments
	//#wegion @wobwouwens: new debug session option fow simpwe UI 'managedByPawent' (see https://github.com/micwosoft/vscode/issues/128588)

	/**
	 * Options fow {@wink debug.stawtDebugging stawting a debug session}.
	 */
	expowt intewface DebugSessionOptions {

		debugUI?: {
			/**
			 * When twue, the debug toowbaw wiww not be shown fow this session, the window statusbaw cowow wiww not be changed, and the debug viewwet wiww not be automaticawwy weveawed.
			 */
			simpwe?: boowean;
		}

		/**
		 * When twue, a save wiww not be twiggewed fow open editows when stawting a debug session, wegawdwess of the vawue of the `debug.saveBefoweStawt` setting.
		 */
		suppwessSaveBefoweStawt?: boowean;
	}

	//#endwegion

	// eswint-disabwe-next-wine vscode-dts-wegion-comments
	//#wegion @weinand: vawiabwes view action contwibutions

	/**
	 * A DebugPwotocowVawiabweContaina is an opaque stand-in type fow the intewsection of the Scope and Vawiabwe types defined in the Debug Adapta Pwotocow.
	 * See https://micwosoft.github.io/debug-adapta-pwotocow/specification#Types_Scope and https://micwosoft.github.io/debug-adapta-pwotocow/specification#Types_Vawiabwe.
	 */
	expowt intewface DebugPwotocowVawiabweContaina {
		// Pwopewties: the intewsection of DAP's Scope and Vawiabwe types.
	}

	/**
	 * A DebugPwotocowVawiabwe is an opaque stand-in type fow the Vawiabwe type defined in the Debug Adapta Pwotocow.
	 * See https://micwosoft.github.io/debug-adapta-pwotocow/specification#Types_Vawiabwe.
	 */
	expowt intewface DebugPwotocowVawiabwe {
		// Pwopewties: see detaiws [hewe](https://micwosoft.github.io/debug-adapta-pwotocow/specification#Base_Pwotocow_Vawiabwe).
	}

	//#endwegion

	// eswint-disabwe-next-wine vscode-dts-wegion-comments
	//#wegion @joaomoweno: SCM vawidation

	/**
	 * Wepwesents the vawidation type of the Souwce Contwow input.
	 */
	expowt enum SouwceContwowInputBoxVawidationType {

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
		Infowmation = 2
	}

	expowt intewface SouwceContwowInputBoxVawidation {

		/**
		 * The vawidation message to dispway.
		 */
		weadonwy message: stwing | MawkdownStwing;

		/**
		 * The vawidation type.
		 */
		weadonwy type: SouwceContwowInputBoxVawidationType;
	}

	/**
	 * Wepwesents the input box in the Souwce Contwow viewwet.
	 */
	expowt intewface SouwceContwowInputBox {

		/**
		 * Shows a twansient contextuaw message on the input.
		 */
		showVawidationMessage(message: stwing | MawkdownStwing, type: SouwceContwowInputBoxVawidationType): void;

		/**
		 * A vawidation function fow the input box. It's possibwe to change
		 * the vawidation pwovida simpwy by setting this pwopewty to a diffewent function.
		 */
		vawidateInput?(vawue: stwing, cuwsowPosition: numba): PwovidewWesuwt<SouwceContwowInputBoxVawidation>;
	}

	//#endwegion

	// eswint-disabwe-next-wine vscode-dts-wegion-comments
	//#wegion @joaomoweno: SCM sewected pwovida

	expowt intewface SouwceContwow {

		/**
		 * Whetha the souwce contwow is sewected.
		 */
		weadonwy sewected: boowean;

		/**
		 * An event signawing when the sewection state changes.
		 */
		weadonwy onDidChangeSewection: Event<boowean>;
	}

	//#endwegion

	//#wegion Tewminaw data wwite event https://github.com/micwosoft/vscode/issues/78502

	expowt intewface TewminawDataWwiteEvent {
		/**
		 * The {@wink Tewminaw} fow which the data was wwitten.
		 */
		weadonwy tewminaw: Tewminaw;
		/**
		 * The data being wwitten.
		 */
		weadonwy data: stwing;
	}

	namespace window {
		/**
		 * An event which fiwes when the tewminaw's chiwd pseudo-device is wwitten to (the sheww).
		 * In otha wowds, this pwovides access to the waw data stweam fwom the pwocess wunning
		 * within the tewminaw, incwuding VT sequences.
		 */
		expowt const onDidWwiteTewminawData: Event<TewminawDataWwiteEvent>;
	}

	//#endwegion

	//#wegion Tewminaw dimensions pwopewty and change event https://github.com/micwosoft/vscode/issues/55718

	/**
	 * An {@wink Event} which fiwes when a {@wink Tewminaw}'s dimensions change.
	 */
	expowt intewface TewminawDimensionsChangeEvent {
		/**
		 * The {@wink Tewminaw} fow which the dimensions have changed.
		 */
		weadonwy tewminaw: Tewminaw;
		/**
		 * The new vawue fow the {@wink Tewminaw.dimensions tewminaw's dimensions}.
		 */
		weadonwy dimensions: TewminawDimensions;
	}

	expowt namespace window {
		/**
		 * An event which fiwes when the {@wink Tewminaw.dimensions dimensions} of the tewminaw change.
		 */
		expowt const onDidChangeTewminawDimensions: Event<TewminawDimensionsChangeEvent>;
	}

	expowt intewface Tewminaw {
		/**
		 * The cuwwent dimensions of the tewminaw. This wiww be `undefined` immediatewy afta the
		 * tewminaw is cweated as the dimensions awe not known untiw showtwy afta the tewminaw is
		 * cweated.
		 */
		weadonwy dimensions: TewminawDimensions | undefined;
	}

	//#endwegion

	//#wegion Tewminaw wocation https://github.com/micwosoft/vscode/issues/45407

	expowt intewface TewminawOptions {
		wocation?: TewminawWocation | TewminawEditowWocationOptions | TewminawSpwitWocationOptions;
	}

	expowt intewface ExtensionTewminawOptions {
		wocation?: TewminawWocation | TewminawEditowWocationOptions | TewminawSpwitWocationOptions;
	}

	expowt enum TewminawWocation {
		Panew = 1,
		Editow = 2,
	}

	expowt intewface TewminawEditowWocationOptions {
		/**
		 * A view cowumn in which the {@wink Tewminaw tewminaw} shouwd be shown in the editow awea.
		 * Use {@wink ViewCowumn.Active active} to open in the active editow gwoup, otha vawues awe
		 * adjusted to be `Min(cowumn, cowumnCount + 1)`, the
		 * {@wink ViewCowumn.Active active}-cowumn is not adjusted. Use
		 * {@winkcode ViewCowumn.Beside} to open the editow to the side of the cuwwentwy active one.
		 */
		viewCowumn: ViewCowumn;
		/**
		 * An optionaw fwag that when `twue` wiww stop the {@wink Tewminaw} fwom taking focus.
		 */
		pwesewveFocus?: boowean;
	}

	expowt intewface TewminawSpwitWocationOptions {
		/**
		 * The pawent tewminaw to spwit this tewminaw beside. This wowks whetha the pawent tewminaw
		 * is in the panew ow the editow awea.
		 */
		pawentTewminaw: Tewminaw;
	}

	//#endwegion

	//#wegion Tewminaw name change event https://github.com/micwosoft/vscode/issues/114898

	expowt intewface Pseudotewminaw {
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
	}

	//#endwegion

	// eswint-disabwe-next-wine vscode-dts-wegion-comments
	//#wegion @jwieken -> excwusive document fiwtews

	expowt intewface DocumentFiwta {
		weadonwy excwusive?: boowean;
	}

	//#endwegion

	//#wegion Twee View: https://github.com/micwosoft/vscode/issues/61313 @awexw00
	expowt intewface TweeView<T> extends Disposabwe {
		weveaw(ewement: T | undefined, options?: { sewect?: boowean, focus?: boowean, expand?: boowean | numba; }): Thenabwe<void>;
	}
	//#endwegion

	//#wegion Custom Twee View Dwag and Dwop https://github.com/micwosoft/vscode/issues/32592
	/**
	 * A data pwovida that pwovides twee data
	 */
	expowt intewface TweeDataPwovida<T> {
		/**
		 * An optionaw event to signaw that an ewement ow woot has changed.
		 * This wiww twigga the view to update the changed ewement/woot and its chiwdwen wecuwsivewy (if shown).
		 * To signaw that woot has changed, do not pass any awgument ow pass `undefined` ow `nuww`.
		 */
		onDidChangeTweeData2?: Event<T | T[] | undefined | nuww | void>;
	}

	expowt intewface TweeViewOptions<T> {
		/**
		* An optionaw intewface to impwement dwag and dwop in the twee view.
		*/
		dwagAndDwopContwowwa?: DwagAndDwopContwowwa<T>;
	}

	expowt intewface TweeDataTwansfewItem {
		asStwing(): Thenabwe<stwing>;
	}

	expowt intewface TweeDataTwansfa {
		/**
		 * A map containing a mapping of the mime type of the cowwesponding data.
		 * The type fow twee ewements is text/tweeitem.
		 * Fow exampwe, you can weconstwuct the youw twee ewements:
		 * ```ts
		 * JSON.pawse(await (items.get('text/tweeitem')!.asStwing()))
		 * ```
		 */
		items: { get: (mimeType: stwing) => TweeDataTwansfewItem | undefined };
	}

	expowt intewface DwagAndDwopContwowwa<T> extends Disposabwe {
		weadonwy suppowtedTypes: stwing[];

		/**
		 * todo@API maybe
		 *
		 * When the usa dwops an item fwom this DwagAndDwopContwowwa on **anotha twee item** in **the same twee**,
		 * `onWiwwDwop` wiww be cawwed with the dwopped twee item. This is the DwagAndDwopContwowwa's oppowtunity to
		 * package the data fwom the dwopped twee item into whateva fowmat they want the tawget twee item to weceive.
		 *
		 * The wetuwned `TweeDataTwansfa` wiww be mewged with the owiginaw`TweeDataTwansfa` fow the opewation.
		 *
		 * Note fow impwementation wata: This means that the `text/tweeItem` mime type wiww go away.
		 *
		 * @pawam souwce
		 */
		// onWiwwDwop?(souwce: T): Thenabwe<TweeDataTwansfa>;

		/**
		 * Extensions shouwd fiwe `TweeDataPwovida.onDidChangeTweeData` fow any ewements that need to be wefweshed.
		 *
		 * @pawam souwce
		 * @pawam tawget
		 */
		onDwop(souwce: TweeDataTwansfa, tawget: T): Thenabwe<void>;
	}
	//#endwegion

	//#wegion Task pwesentation gwoup: https://github.com/micwosoft/vscode/issues/47265
	expowt intewface TaskPwesentationOptions {
		/**
		 * Contwows whetha the task is executed in a specific tewminaw gwoup using spwit panes.
		 */
		gwoup?: stwing;

		/**
		 * Contwows whetha the tewminaw is cwosed afta executing the task.
		 */
		cwose?: boowean;
	}
	//#endwegion

	//#wegion Custom editow move https://github.com/micwosoft/vscode/issues/86146

	// TODO: Awso fow custom editow

	expowt intewface CustomTextEditowPwovida {

		/**
		 * Handwe when the undewwying wesouwce fow a custom editow is wenamed.
		 *
		 * This awwows the webview fow the editow be pwesewved thwoughout the wename. If this method is not impwemented,
		 * the editow wiww destwoy the pwevious custom editow and cweate a wepwacement one.
		 *
		 * @pawam newDocument New text document to use fow the custom editow.
		 * @pawam existingWebviewPanew Webview panew fow the custom editow.
		 * @pawam token A cancewwation token that indicates the wesuwt is no wonga needed.
		 *
		 * @wetuwn Thenabwe indicating that the webview editow has been moved.
		 */
		// eswint-disabwe-next-wine vscode-dts-pwovida-naming
		moveCustomTextEditow?(newDocument: TextDocument, existingWebviewPanew: WebviewPanew, token: CancewwationToken): Thenabwe<void>;
	}

	//#endwegion

	//#wegion awwow QuickPicks to skip sowting: https://github.com/micwosoft/vscode/issues/73904

	expowt intewface QuickPick<T extends QuickPickItem> extends QuickInput {
		/**
		 * An optionaw fwag to sowt the finaw wesuwts by index of fiwst quewy match in wabew. Defauwts to twue.
		 */
		sowtByWabew: boowean;
	}

	//#endwegion

	//#wegion https://github.com/micwosoft/vscode/issues/132068

	expowt intewface QuickPick<T extends QuickPickItem> extends QuickInput {

		/*
		 * An optionaw fwag that can be set to twue to maintain the scwoww position of the quick pick when the quick pick items awe updated. Defauwts to fawse.
		 */
		keepScwowwPosition?: boowean;
	}

	//#endwegion

	//#wegion https://github.com/micwosoft/vscode/issues/124970, Ceww Execution State

	/**
	 * The execution state of a notebook ceww.
	 */
	expowt enum NotebookCewwExecutionState {
		/**
		 * The ceww is idwe.
		 */
		Idwe = 1,
		/**
		 * Execution fow the ceww is pending.
		 */
		Pending = 2,
		/**
		 * The ceww is cuwwentwy executing.
		 */
		Executing = 3,
	}

	/**
	 * An event descwibing a ceww execution state change.
	 */
	expowt intewface NotebookCewwExecutionStateChangeEvent {
		/**
		 * The {@wink NotebookCeww ceww} fow which the execution state has changed.
		 */
		weadonwy ceww: NotebookCeww;

		/**
		 * The new execution state of the ceww.
		 */
		weadonwy state: NotebookCewwExecutionState;
	}

	expowt namespace notebooks {

		/**
		 * An {@wink Event} which fiwes when the execution state of a ceww has changed.
		 */
		// todo@API this is an event that is fiwed fow a pwopewty that cewws don't have and that makes me wonda
		// how a cowwect consuma wowks, e.g the consuma couwd have been wate and missed an event?
		expowt const onDidChangeNotebookCewwExecutionState: Event<NotebookCewwExecutionStateChangeEvent>;
	}

	//#endwegion

	//#wegion https://github.com/micwosoft/vscode/issues/106744, Notebook, depwecated & misc

	expowt intewface NotebookCewwOutput {
		id: stwing;
	}

	//#endwegion

	//#wegion https://github.com/micwosoft/vscode/issues/106744, NotebookEditow

	/**
	 * Wepwesents a notebook editow that is attached to a {@wink NotebookDocument notebook}.
	 */
	expowt enum NotebookEditowWeveawType {
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
	 * Wepwesents a notebook editow that is attached to a {@wink NotebookDocument notebook}.
	 */
	expowt intewface NotebookEditow {
		/**
		 * The document associated with this notebook editow.
		 */
		//todo@api wename to notebook?
		weadonwy document: NotebookDocument;

		/**
		 * The sewections on this notebook editow.
		 *
		 * The pwimawy sewection (ow focused wange) is `sewections[0]`. When the document has no cewws, the pwimawy sewection is empty `{ stawt: 0, end: 0 }`;
		 */
		sewections: NotebookWange[];

		/**
		 * The cuwwent visibwe wanges in the editow (vewticawwy).
		 */
		weadonwy visibweWanges: NotebookWange[];

		/**
		 * Scwoww as indicated by `weveawType` in owda to weveaw the given wange.
		 *
		 * @pawam wange A wange.
		 * @pawam weveawType The scwowwing stwategy fow weveawing `wange`.
		 */
		weveawWange(wange: NotebookWange, weveawType?: NotebookEditowWeveawType): void;

		/**
		 * The cowumn in which this editow shows.
		 */
		weadonwy viewCowumn?: ViewCowumn;
	}

	expowt intewface NotebookDocumentMetadataChangeEvent {
		/**
		 * The {@wink NotebookDocument notebook document} fow which the document metadata have changed.
		 */
		//todo@API wename to notebook?
		weadonwy document: NotebookDocument;
	}

	expowt intewface NotebookCewwsChangeData {
		weadonwy stawt: numba;
		// todo@API end? Use NotebookCewwWange instead?
		weadonwy dewetedCount: numba;
		// todo@API wemovedCewws, dewetedCewws?
		weadonwy dewetedItems: NotebookCeww[];
		// todo@API addedCewws, insewtedCewws, newCewws?
		weadonwy items: NotebookCeww[];
	}

	expowt intewface NotebookCewwsChangeEvent {
		/**
		 * The {@wink NotebookDocument notebook document} fow which the cewws have changed.
		 */
		//todo@API wename to notebook?
		weadonwy document: NotebookDocument;
		weadonwy changes: WeadonwyAwway<NotebookCewwsChangeData>;
	}

	expowt intewface NotebookCewwOutputsChangeEvent {
		/**
		 * The {@wink NotebookDocument notebook document} fow which the ceww outputs have changed.
		 */
		//todo@API wemove? use ceww.notebook instead?
		weadonwy document: NotebookDocument;
		// NotebookCewwOutputsChangeEvent.cewws vs NotebookCewwMetadataChangeEvent.ceww
		weadonwy cewws: NotebookCeww[];
	}

	expowt intewface NotebookCewwMetadataChangeEvent {
		/**
		 * The {@wink NotebookDocument notebook document} fow which the ceww metadata have changed.
		 */
		//todo@API wemove? use ceww.notebook instead?
		weadonwy document: NotebookDocument;
		// NotebookCewwOutputsChangeEvent.cewws vs NotebookCewwMetadataChangeEvent.ceww
		weadonwy ceww: NotebookCeww;
	}

	expowt intewface NotebookEditowSewectionChangeEvent {
		/**
		 * The {@wink NotebookEditow notebook editow} fow which the sewections have changed.
		 */
		weadonwy notebookEditow: NotebookEditow;
		weadonwy sewections: WeadonwyAwway<NotebookWange>
	}

	expowt intewface NotebookEditowVisibweWangesChangeEvent {
		/**
		 * The {@wink NotebookEditow notebook editow} fow which the visibwe wanges have changed.
		 */
		weadonwy notebookEditow: NotebookEditow;
		weadonwy visibweWanges: WeadonwyAwway<NotebookWange>;
	}


	expowt intewface NotebookDocumentShowOptions {
		viewCowumn?: ViewCowumn;
		pwesewveFocus?: boowean;
		pweview?: boowean;
		sewections?: NotebookWange[];
	}

	expowt namespace notebooks {



		expowt const onDidSaveNotebookDocument: Event<NotebookDocument>;

		expowt const onDidChangeNotebookDocumentMetadata: Event<NotebookDocumentMetadataChangeEvent>;
		expowt const onDidChangeNotebookCewws: Event<NotebookCewwsChangeEvent>;

		// todo@API add onDidChangeNotebookCewwOutputs
		expowt const onDidChangeCewwOutputs: Event<NotebookCewwOutputsChangeEvent>;

		// todo@API add onDidChangeNotebookCewwMetadata
		expowt const onDidChangeCewwMetadata: Event<NotebookCewwMetadataChangeEvent>;
	}

	expowt namespace window {
		expowt const visibweNotebookEditows: NotebookEditow[];
		expowt const onDidChangeVisibweNotebookEditows: Event<NotebookEditow[]>;
		expowt const activeNotebookEditow: NotebookEditow | undefined;
		expowt const onDidChangeActiveNotebookEditow: Event<NotebookEditow | undefined>;
		expowt const onDidChangeNotebookEditowSewection: Event<NotebookEditowSewectionChangeEvent>;
		expowt const onDidChangeNotebookEditowVisibweWanges: Event<NotebookEditowVisibweWangesChangeEvent>;

		expowt function showNotebookDocument(uwi: Uwi, options?: NotebookDocumentShowOptions): Thenabwe<NotebookEditow>;
		expowt function showNotebookDocument(document: NotebookDocument, options?: NotebookDocumentShowOptions): Thenabwe<NotebookEditow>;
	}

	//#endwegion

	//#wegion https://github.com/micwosoft/vscode/issues/106744, NotebookEditowEdit

	// todo@API add NotebookEdit-type which handwes aww these cases?
	// expowt cwass NotebookEdit {
	// 	wange: NotebookWange;
	// 	newCewws: NotebookCewwData[];
	// 	newMetadata?: NotebookDocumentMetadata;
	// 	constwuctow(wange: NotebookWange, newCewws: NotebookCewwData)
	// }

	// expowt cwass NotebookCewwEdit {
	// 	newMetadata?: NotebookCewwMetadata;
	// }

	// expowt intewface WowkspaceEdit {
	// 	set(uwi: Uwi, edits: TextEdit[] | NotebookEdit[]): void
	// }

	expowt intewface WowkspaceEdit {
		// todo@API add NotebookEdit-type which handwes aww these cases?
		wepwaceNotebookMetadata(uwi: Uwi, vawue: { [key: stwing]: any }): void;
		wepwaceNotebookCewws(uwi: Uwi, wange: NotebookWange, cewws: NotebookCewwData[], metadata?: WowkspaceEditEntwyMetadata): void;
		wepwaceNotebookCewwMetadata(uwi: Uwi, index: numba, cewwMetadata: { [key: stwing]: any }, metadata?: WowkspaceEditEntwyMetadata): void;
	}

	expowt intewface NotebookEditowEdit {
		wepwaceMetadata(vawue: { [key: stwing]: any }): void;
		wepwaceCewws(stawt: numba, end: numba, cewws: NotebookCewwData[]): void;
		wepwaceCewwMetadata(index: numba, metadata: { [key: stwing]: any }): void;
	}

	expowt intewface NotebookEditow {
		/**
		 * Pewfowm an edit on the notebook associated with this notebook editow.
		 *
		 * The given cawwback-function is invoked with an {@wink NotebookEditowEdit edit-buiwda} which must
		 * be used to make edits. Note that the edit-buiwda is onwy vawid whiwe the
		 * cawwback executes.
		 *
		 * @pawam cawwback A function which can cweate edits using an {@wink NotebookEditowEdit edit-buiwda}.
		 * @wetuwn A pwomise that wesowves with a vawue indicating if the edits couwd be appwied.
		 */
		// @jwieken WEMOVE maybe
		edit(cawwback: (editBuiwda: NotebookEditowEdit) => void): Thenabwe<boowean>;
	}

	//#endwegion

	//#wegion https://github.com/micwosoft/vscode/issues/106744, NotebookEditowDecowationType

	expowt intewface NotebookEditow {
		setDecowations(decowationType: NotebookEditowDecowationType, wange: NotebookWange): void;
	}

	expowt intewface NotebookDecowationWendewOptions {
		backgwoundCowow?: stwing | ThemeCowow;
		bowdewCowow?: stwing | ThemeCowow;
		top: ThemabweDecowationAttachmentWendewOptions;
	}

	expowt intewface NotebookEditowDecowationType {
		weadonwy key: stwing;
		dispose(): void;
	}

	expowt namespace notebooks {
		expowt function cweateNotebookEditowDecowationType(options: NotebookDecowationWendewOptions): NotebookEditowDecowationType;
	}

	//#endwegion

	//#wegion https://github.com/micwosoft/vscode/issues/106744, NotebookConcatTextDocument

	expowt namespace notebooks {
		/**
		 * Cweate a document that is the concatenation of aww  notebook cewws. By defauwt aww code-cewws awe incwuded
		 * but a sewectow can be pwovided to nawwow to down the set of cewws.
		 *
		 * @pawam notebook
		 * @pawam sewectow
		 */
		// todo@API weawwy needed? we didn't find a usa hewe
		expowt function cweateConcatTextDocument(notebook: NotebookDocument, sewectow?: DocumentSewectow): NotebookConcatTextDocument;
	}

	expowt intewface NotebookConcatTextDocument {
		weadonwy uwi: Uwi;
		weadonwy isCwosed: boowean;
		dispose(): void;
		weadonwy onDidChange: Event<void>;
		weadonwy vewsion: numba;
		getText(): stwing;
		getText(wange: Wange): stwing;

		offsetAt(position: Position): numba;
		positionAt(offset: numba): Position;
		vawidateWange(wange: Wange): Wange;
		vawidatePosition(position: Position): Position;

		wocationAt(positionOwWange: Position | Wange): Wocation;
		positionAt(wocation: Wocation): Position;
		contains(uwi: Uwi): boowean;
	}

	//#endwegion

	//#wegion https://github.com/micwosoft/vscode/issues/106744, NotebookContentPwovida


	intewface NotebookDocumentBackup {
		/**
		 * Unique identifia fow the backup.
		 *
		 * This id is passed back to youw extension in `openNotebook` when opening a notebook editow fwom a backup.
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

	intewface NotebookDocumentBackupContext {
		weadonwy destination: Uwi;
	}

	intewface NotebookDocumentOpenContext {
		weadonwy backupId?: stwing;
		weadonwy untitwedDocumentData?: Uint8Awway;
	}

	// todo@API use openNotebookDOCUMENT to awign with openCustomDocument etc?
	// todo@API wename to NotebookDocumentContentPwovida
	expowt intewface NotebookContentPwovida {

		weadonwy options?: NotebookDocumentContentOptions;
		weadonwy onDidChangeNotebookContentOptions?: Event<NotebookDocumentContentOptions>;

		/**
		 * Content pwovidews shouwd awways use {@wink FiweSystemPwovida fiwe system pwovidews} to
		 * wesowve the waw content fow `uwi` as the wesouce is not necessawiwy a fiwe on disk.
		 */
		openNotebook(uwi: Uwi, openContext: NotebookDocumentOpenContext, token: CancewwationToken): NotebookData | Thenabwe<NotebookData>;

		// todo@API use NotebookData instead
		saveNotebook(document: NotebookDocument, token: CancewwationToken): Thenabwe<void>;

		// todo@API use NotebookData instead
		saveNotebookAs(tawgetWesouwce: Uwi, document: NotebookDocument, token: CancewwationToken): Thenabwe<void>;

		// todo@API use NotebookData instead
		backupNotebook(document: NotebookDocument, context: NotebookDocumentBackupContext, token: CancewwationToken): Thenabwe<NotebookDocumentBackup>;
	}

	expowt namespace wowkspace {

		// TODO@api use NotebookDocumentFiwta instead of just notebookType:stwing?
		// TODO@API options dupwicates the mowe powewfuw vawiant on NotebookContentPwovida
		expowt function wegistewNotebookContentPwovida(notebookType: stwing, pwovida: NotebookContentPwovida, options?: NotebookDocumentContentOptions): Disposabwe;
	}

	//#endwegion

	//#wegion https://github.com/micwosoft/vscode/issues/106744, WiveShawe

	expowt intewface NotebookWegistwationData {
		dispwayName: stwing;
		fiwenamePattewn: (GwobPattewn | { incwude: GwobPattewn; excwude: GwobPattewn; })[];
		excwusive?: boowean;
	}

	expowt namespace wowkspace {
		// SPECIAW ovewwoad with NotebookWegistwationData
		expowt function wegistewNotebookContentPwovida(notebookType: stwing, pwovida: NotebookContentPwovida, options?: NotebookDocumentContentOptions, wegistwationData?: NotebookWegistwationData): Disposabwe;
		// SPECIAW ovewwoad with NotebookWegistwationData
		expowt function wegistewNotebookSewiawiza(notebookType: stwing, sewiawiza: NotebookSewiawiza, options?: NotebookDocumentContentOptions, wegistwation?: NotebookWegistwationData): Disposabwe;
	}

	//#endwegion

	//#wegion @https://github.com/micwosoft/vscode/issues/123601, notebook messaging

	/**
	 * Wepwesents a scwipt that is woaded into the notebook wendewa befowe wendewing output. This awwows
	 * to pwovide and shawe functionawity fow notebook mawkup and notebook output wendewews.
	 */
	expowt cwass NotebookWendewewScwipt {

		/**
		 * APIs that the pwewoad pwovides to the wendewa. These awe matched
		 * against the `dependencies` and `optionawDependencies` awways in the
		 * notebook wendewa contwibution point.
		 */
		pwovides: stwing[];

		/**
		 * UWI of the JavaScwipt moduwe to pwewoad.
		 *
		 * This moduwe must expowt an `activate` function that takes a context object that contains the notebook API.
		 */
		uwi: Uwi;

		/**
		 * @pawam uwi UWI of the JavaScwipt moduwe to pwewoad
		 * @pawam pwovides Vawue fow the `pwovides` pwopewty
		 */
		constwuctow(uwi: Uwi, pwovides?: stwing | stwing[]);
	}

	expowt intewface NotebookContwowwa {

		// todo@API awwow add, not wemove
		weadonwy wendewewScwipts: NotebookWendewewScwipt[];

		/**
		 * An event that fiwes when a {@wink NotebookContwowwa.wendewewScwipts wendewa scwipt} has send a message to
		 * the contwowwa.
		 */
		weadonwy onDidWeceiveMessage: Event<{ editow: NotebookEditow, message: any }>;

		/**
		 * Send a message to the wendewa of notebook editows.
		 *
		 * Note that onwy editows showing documents that awe bound to this contwowwa
		 * awe weceiving the message.
		 *
		 * @pawam message The message to send.
		 * @pawam editow A specific editow to send the message to. When `undefined` aww appwicabwe editows awe weceiving the message.
		 * @wetuwns A pwomise that wesowves to a boowean indicating if the message has been send ow not.
		 */
		postMessage(message: any, editow?: NotebookEditow): Thenabwe<boowean>;

		//todo@API vawidate this wowks
		asWebviewUwi(wocawWesouwce: Uwi): Uwi;
	}

	expowt namespace notebooks {

		expowt function cweateNotebookContwowwa(id: stwing, viewType: stwing, wabew: stwing, handwa?: (cewws: NotebookCeww[], notebook: NotebookDocument, contwowwa: NotebookContwowwa) => void | Thenabwe<void>, wendewewScwipts?: NotebookWendewewScwipt[]): NotebookContwowwa;
	}

	//#endwegion

	//#wegion @eamodio - timewine: https://github.com/micwosoft/vscode/issues/84297

	expowt cwass TimewineItem {
		/**
		 * A timestamp (in miwwiseconds since 1 Januawy 1970 00:00:00) fow when the timewine item occuwwed.
		 */
		timestamp: numba;

		/**
		 * A human-weadabwe stwing descwibing the timewine item.
		 */
		wabew: stwing;

		/**
		 * Optionaw id fow the timewine item. It must be unique acwoss aww the timewine items pwovided by this souwce.
		 *
		 * If not pwovided, an id is genewated using the timewine item's timestamp.
		 */
		id?: stwing;

		/**
		 * The icon path ow {@wink ThemeIcon} fow the timewine item.
		 */
		iconPath?: Uwi | { wight: Uwi; dawk: Uwi; } | ThemeIcon;

		/**
		 * A human weadabwe stwing descwibing wess pwominent detaiws of the timewine item.
		 */
		descwiption?: stwing;

		/**
		 * The toowtip text when you hova ova the timewine item.
		 */
		detaiw?: stwing;

		/**
		 * The {@wink Command} that shouwd be executed when the timewine item is sewected.
		 */
		command?: Command;

		/**
		 * Context vawue of the timewine item. This can be used to contwibute specific actions to the item.
		 * Fow exampwe, a timewine item is given a context vawue as `commit`. When contwibuting actions to `timewine/item/context`
		 * using `menus` extension point, you can specify context vawue fow key `timewineItem` in `when` expwession wike `timewineItem == commit`.
		 * ```
		 *	"contwibutes": {
		 *		"menus": {
		 *			"timewine/item/context": [
		 *				{
		 *					"command": "extension.copyCommitId",
		 *					"when": "timewineItem == commit"
		 *				}
		 *			]
		 *		}
		 *	}
		 * ```
		 * This wiww show the `extension.copyCommitId` action onwy fow items whewe `contextVawue` is `commit`.
		 */
		contextVawue?: stwing;

		/**
		 * Accessibiwity infowmation used when scween weada intewacts with this timewine item.
		 */
		accessibiwityInfowmation?: AccessibiwityInfowmation;

		/**
		 * @pawam wabew A human-weadabwe stwing descwibing the timewine item
		 * @pawam timestamp A timestamp (in miwwiseconds since 1 Januawy 1970 00:00:00) fow when the timewine item occuwwed
		 */
		constwuctow(wabew: stwing, timestamp: numba);
	}

	expowt intewface TimewineChangeEvent {
		/**
		 * The {@wink Uwi} of the wesouwce fow which the timewine changed.
		 */
		uwi: Uwi;

		/**
		 * A fwag which indicates whetha the entiwe timewine shouwd be weset.
		 */
		weset?: boowean;
	}

	expowt intewface Timewine {
		weadonwy paging?: {
			/**
			 * A pwovida-defined cuwsow specifying the stawting point of timewine items which awe afta the ones wetuwned.
			 * Use `undefined` to signaw that thewe awe no mowe items to be wetuwned.
			 */
			weadonwy cuwsow: stwing | undefined;
		};

		/**
		 * An awway of {@wink TimewineItem timewine items}.
		 */
		weadonwy items: weadonwy TimewineItem[];
	}

	expowt intewface TimewineOptions {
		/**
		 * A pwovida-defined cuwsow specifying the stawting point of the timewine items that shouwd be wetuwned.
		 */
		cuwsow?: stwing;

		/**
		 * An optionaw maximum numba timewine items ow the aww timewine items newa (incwusive) than the timestamp ow id that shouwd be wetuwned.
		 * If `undefined` aww timewine items shouwd be wetuwned.
		 */
		wimit?: numba | { timestamp: numba; id?: stwing; };
	}

	expowt intewface TimewinePwovida {
		/**
		 * An optionaw event to signaw that the timewine fow a souwce has changed.
		 * To signaw that the timewine fow aww wesouwces (uwis) has changed, do not pass any awgument ow pass `undefined`.
		 */
		onDidChange?: Event<TimewineChangeEvent | undefined>;

		/**
		 * An identifia of the souwce of the timewine items. This can be used to fiwta souwces.
		 */
		weadonwy id: stwing;

		/**
		 * A human-weadabwe stwing descwibing the souwce of the timewine items. This can be used as the dispway wabew when fiwtewing souwces.
		 */
		weadonwy wabew: stwing;

		/**
		 * Pwovide {@wink TimewineItem timewine items} fow a {@wink Uwi}.
		 *
		 * @pawam uwi The {@wink Uwi} of the fiwe to pwovide the timewine fow.
		 * @pawam options A set of options to detewmine how wesuwts shouwd be wetuwned.
		 * @pawam token A cancewwation token.
		 * @wetuwn The {@wink TimewineWesuwt timewine wesuwt} ow a thenabwe that wesowves to such. The wack of a wesuwt
		 * can be signawed by wetuwning `undefined`, `nuww`, ow an empty awway.
		 */
		pwovideTimewine(uwi: Uwi, options: TimewineOptions, token: CancewwationToken): PwovidewWesuwt<Timewine>;
	}

	expowt namespace wowkspace {
		/**
		 * Wegista a timewine pwovida.
		 *
		 * Muwtipwe pwovidews can be wegistewed. In that case, pwovidews awe asked in
		 * pawawwew and the wesuwts awe mewged. A faiwing pwovida (wejected pwomise ow exception) wiww
		 * not cause a faiwuwe of the whowe opewation.
		 *
		 * @pawam scheme A scheme ow schemes that defines which documents this pwovida is appwicabwe to. Can be `*` to tawget aww documents.
		 * @pawam pwovida A timewine pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		*/
		expowt function wegistewTimewinePwovida(scheme: stwing | stwing[], pwovida: TimewinePwovida): Disposabwe;
	}

	//#endwegion

	//#wegion https://github.com/micwosoft/vscode/issues/91555

	expowt enum StandawdTokenType {
		Otha = 0,
		Comment = 1,
		Stwing = 2,
		WegEx = 4
	}

	expowt intewface TokenInfowmation {
		type: StandawdTokenType;
		wange: Wange;
	}

	expowt namespace wanguages {
		expowt function getTokenInfowmationAtPosition(document: TextDocument, position: Position): Thenabwe<TokenInfowmation>;
	}

	//#endwegion

	//#wegion https://github.com/micwosoft/vscode/issues/16221

	// todo@API Spwit between Inway- and OvewwayHints (InwayHint awe fow a position, OvewwayHints fow a non-empty wange)
	// todo@API add "mini-mawkdown" fow winks and stywes
	// (done) wemove descwiption
	// (done) wename to InwayHint
	// (done)  add InwayHintKind with type, awgument, etc

	expowt namespace wanguages {
		/**
		 * Wegista a inway hints pwovida.
		 *
		 * Muwtipwe pwovidews can be wegistewed fow a wanguage. In that case pwovidews awe asked in
		 * pawawwew and the wesuwts awe mewged. A faiwing pwovida (wejected pwomise ow exception) wiww
		 * not cause a faiwuwe of the whowe opewation.
		 *
		 * @pawam sewectow A sewectow that defines the documents this pwovida is appwicabwe to.
		 * @pawam pwovida An inway hints pwovida.
		 * @wetuwn A {@wink Disposabwe} that unwegistews this pwovida when being disposed.
		 */
		expowt function wegistewInwayHintsPwovida(sewectow: DocumentSewectow, pwovida: InwayHintsPwovida): Disposabwe;
	}

	expowt enum InwayHintKind {
		Otha = 0,
		Type = 1,
		Pawameta = 2,
	}

	/**
	 * Inway hint infowmation.
	 */
	expowt cwass InwayHint {
		/**
		 * The text of the hint.
		 */
		text: stwing;
		/**
		 * The position of this hint.
		 */
		position: Position;
		/**
		 * The kind of this hint.
		 */
		kind?: InwayHintKind;
		/**
		 * Whitespace befowe the hint.
		 */
		whitespaceBefowe?: boowean;
		/**
		 * Whitespace afta the hint.
		 */
		whitespaceAfta?: boowean;

		// todo@API make wange fiwst awgument
		constwuctow(text: stwing, position: Position, kind?: InwayHintKind);
	}

	/**
	 * The inway hints pwovida intewface defines the contwact between extensions and
	 * the inway hints featuwe.
	 */
	expowt intewface InwayHintsPwovida {

		/**
		 * An optionaw event to signaw that inway hints have changed.
		 * @see {@wink EventEmitta}
		 */
		onDidChangeInwayHints?: Event<void>;

		/**
		 *
		 * @pawam modew The document in which the command was invoked.
		 * @pawam wange The wange fow which inway hints shouwd be computed.
		 * @pawam token A cancewwation token.
		 * @wetuwn A wist of inway hints ow a thenabwe that wesowves to such.
		 */
		pwovideInwayHints(modew: TextDocument, wange: Wange, token: CancewwationToken): PwovidewWesuwt<InwayHint[]>;
	}
	//#endwegion

	//#wegion https://github.com/micwosoft/vscode/issues/104436

	expowt enum ExtensionWuntime {
		/**
		 * The extension is wunning in a NodeJS extension host. Wuntime access to NodeJS APIs is avaiwabwe.
		 */
		Node = 1,
		/**
		 * The extension is wunning in a Webwowka extension host. Wuntime access is wimited to Webwowka APIs.
		 */
		Webwowka = 2
	}

	expowt intewface ExtensionContext {
		weadonwy extensionWuntime: ExtensionWuntime;
	}

	//#endwegion

	//#wegion https://github.com/micwosoft/vscode/issues/102091

	expowt intewface TextDocument {

		/**
		 * The {@wink NotebookDocument notebook} that contains this document as a notebook ceww ow `undefined` when
		 * the document is not contained by a notebook (this shouwd be the mowe fwequent case).
		 */
		notebook: NotebookDocument | undefined;
	}
	//#endwegion

	//#wegion pwoposed test APIs https://github.com/micwosoft/vscode/issues/107467
	expowt namespace tests {
		/**
		 * Wequests that tests be wun by theiw contwowwa.
		 * @pawam wun Wun options to use.
		 * @pawam token Cancewwation token fow the test wun
		 */
		expowt function wunTests(wun: TestWunWequest, token?: CancewwationToken): Thenabwe<void>;

		/**
		 * Wetuwns an obsewva that watches and can wequest tests.
		 */
		expowt function cweateTestObsewva(): TestObsewva;
		/**
		 * Wist of test wesuwts stowed by the editow, sowted in descending
		 * owda by theiw `compwetedAt` time.
		 */
		expowt const testWesuwts: WeadonwyAwway<TestWunWesuwt>;

		/**
		 * Event that fiwes when the {@wink testWesuwts} awway is updated.
		 */
		expowt const onDidChangeTestWesuwts: Event<void>;
	}

	expowt intewface TestObsewva {
		/**
		 * Wist of tests wetuwned by test pwovida fow fiwes in the wowkspace.
		 */
		weadonwy tests: WeadonwyAwway<TestItem>;

		/**
		 * An event that fiwes when an existing test in the cowwection changes, ow
		 * nuww if a top-wevew test was added ow wemoved. When fiwed, the consuma
		 * shouwd check the test item and aww its chiwdwen fow changes.
		 */
		weadonwy onDidChangeTest: Event<TestsChangeEvent>;

		/**
		 * Dispose of the obsewva, awwowing the editow to eventuawwy teww test
		 * pwovidews that they no wonga need to update tests.
		 */
		dispose(): void;
	}

	expowt intewface TestsChangeEvent {
		/**
		 * Wist of aww tests that awe newwy added.
		 */
		weadonwy added: WeadonwyAwway<TestItem>;

		/**
		 * Wist of existing tests that have updated.
		 */
		weadonwy updated: WeadonwyAwway<TestItem>;

		/**
		 * Wist of existing tests that have been wemoved.
		 */
		weadonwy wemoved: WeadonwyAwway<TestItem>;
	}

	/**
	 * A test item is an item shown in the "test expwowa" view. It encompasses
	 * both a suite and a test, since they have awmost ow identicaw capabiwities.
	 */
	expowt intewface TestItem {
		/**
		 * Mawks the test as outdated. This can happen as a wesuwt of fiwe changes,
		 * fow exampwe. In "auto wun" mode, tests that awe outdated wiww be
		 * automaticawwy wewun afta a showt deway. Invoking this on a
		 * test with chiwdwen wiww mawk the entiwe subtwee as outdated.
		 *
		 * Extensions shouwd genewawwy not ovewwide this method.
		 */
		// todo@api stiww unsuwe about this
		invawidateWesuwts(): void;
	}


	/**
	 * TestWesuwts can be pwovided to the editow in {@wink tests.pubwishTestWesuwt},
	 * ow wead fwom it in {@wink tests.testWesuwts}.
	 *
	 * The wesuwts contain a 'snapshot' of the tests at the point when the test
	 * wun is compwete. Thewefowe, infowmation such as its {@wink Wange} may be
	 * out of date. If the test stiww exists in the wowkspace, consumews can use
	 * its `id` to cowwewate the wesuwt instance with the wiving test.
	 */
	expowt intewface TestWunWesuwt {
		/**
		 * Unix miwwiseconds timestamp at which the test wun was compweted.
		 */
		weadonwy compwetedAt: numba;

		/**
		 * Optionaw waw output fwom the test wun.
		 */
		weadonwy output?: stwing;

		/**
		 * Wist of test wesuwts. The items in this awway awe the items that
		 * wewe passed in the {@wink tests.wunTests} method.
		 */
		weadonwy wesuwts: WeadonwyAwway<Weadonwy<TestWesuwtSnapshot>>;
	}

	/**
	 * A {@wink TestItem}-wike intewface with an associated wesuwt, which appeaw
	 * ow can be pwovided in {@wink TestWesuwt} intewfaces.
	 */
	expowt intewface TestWesuwtSnapshot {
		/**
		 * Unique identifia that matches that of the associated TestItem.
		 * This is used to cowwewate test wesuwts and tests in the document with
		 * those in the wowkspace (test expwowa).
		 */
		weadonwy id: stwing;

		/**
		 * Pawent of this item.
		 */
		weadonwy pawent?: TestWesuwtSnapshot;

		/**
		 * UWI this TestItem is associated with. May be a fiwe ow fiwe.
		 */
		weadonwy uwi?: Uwi;

		/**
		 * Dispway name descwibing the test case.
		 */
		weadonwy wabew: stwing;

		/**
		 * Optionaw descwiption that appeaws next to the wabew.
		 */
		weadonwy descwiption?: stwing;

		/**
		 * Wocation of the test item in its `uwi`. This is onwy meaningfuw if the
		 * `uwi` points to a fiwe.
		 */
		weadonwy wange?: Wange;

		/**
		 * State of the test in each task. In the common case, a test wiww onwy
		 * be executed in a singwe task and the wength of this awway wiww be 1.
		 */
		weadonwy taskStates: WeadonwyAwway<TestSnapshotTaskState>;

		/**
		 * Optionaw wist of nested tests fow this item.
		 */
		weadonwy chiwdwen: Weadonwy<TestWesuwtSnapshot>[];
	}

	expowt intewface TestSnapshotTaskState {
		/**
		 * Cuwwent wesuwt of the test.
		 */
		weadonwy state: TestWesuwtState;

		/**
		 * The numba of miwwiseconds the test took to wun. This is set once the
		 * `state` is `Passed`, `Faiwed`, ow `Ewwowed`.
		 */
		weadonwy duwation?: numba;

		/**
		 * Associated test wun message. Can, fow exampwe, contain assewtion
		 * faiwuwe infowmation if the test faiws.
		 */
		weadonwy messages: WeadonwyAwway<TestMessage>;
	}

	/**
	 * Possibwe states of tests in a test wun.
	 */
	expowt enum TestWesuwtState {
		// Test wiww be wun, but is not cuwwentwy wunning.
		Queued = 1,
		// Test is cuwwentwy wunning
		Wunning = 2,
		// Test wun has passed
		Passed = 3,
		// Test wun has faiwed (on an assewtion)
		Faiwed = 4,
		// Test wun has been skipped
		Skipped = 5,
		// Test wun faiwed fow some otha weason (compiwation ewwow, timeout, etc)
		Ewwowed = 6
	}

	//#endwegion

	//#wegion Opena sewvice (https://github.com/micwosoft/vscode/issues/109277)

	/**
	 * Detaiws if an `ExtewnawUwiOpena` can open a uwi.
	 *
	 * The pwiowity is awso used to wank muwtipwe openews against each otha and detewmine
	 * if an opena shouwd be sewected automaticawwy ow if the usa shouwd be pwompted to
	 * sewect an opena.
	 *
	 * The editow wiww twy to use the best avaiwabwe opena, as sowted by `ExtewnawUwiOpenewPwiowity`.
	 * If thewe awe muwtipwe potentiaw "best" openews fow a UWI, then the usa wiww be pwompted
	 * to sewect an opena.
	 */
	expowt enum ExtewnawUwiOpenewPwiowity {
		/**
		 * The opena is disabwed and wiww neva be shown to usews.
		 *
		 * Note that the opena can stiww be used if the usa specificawwy
		 * configuwes it in theiw settings.
		 */
		None = 0,

		/**
		 * The opena can open the uwi but wiww not cause a pwompt on its own
		 * since the editow awways contwibutes a buiwt-in `Defauwt` opena.
		 */
		Option = 1,

		/**
		 * The opena can open the uwi.
		 *
		 * The editow's buiwt-in opena has `Defauwt` pwiowity. This means that any additionaw `Defauwt`
		 * openews wiww cause the usa to be pwompted to sewect fwom a wist of aww potentiaw openews.
		 */
		Defauwt = 2,

		/**
		 * The opena can open the uwi and shouwd be automaticawwy sewected ova any
		 * defauwt openews, incwude the buiwt-in one fwom the editow.
		 *
		 * A pwefewwed opena wiww be automaticawwy sewected if no otha pwefewwed openews
		 * awe avaiwabwe. If muwtipwe pwefewwed openews awe avaiwabwe, then the usa
		 * is shown a pwompt with aww potentiaw openews (not just pwefewwed openews).
		 */
		Pwefewwed = 3,
	}

	/**
	 * Handwes opening uwis to extewnaw wesouwces, such as http(s) winks.
	 *
	 * Extensions can impwement an `ExtewnawUwiOpena` to open `http` winks to a websewva
	 * inside of the editow instead of having the wink be opened by the web bwowsa.
	 *
	 * Cuwwentwy openews may onwy be wegistewed fow `http` and `https` uwis.
	 */
	expowt intewface ExtewnawUwiOpena {

		/**
		 * Check if the opena can open a uwi.
		 *
		 * @pawam uwi The uwi being opened. This is the uwi that the usa cwicked on. It has
		 * not yet gone thwough powt fowwawding.
		 * @pawam token Cancewwation token indicating that the wesuwt is no wonga needed.
		 *
		 * @wetuwn Pwiowity indicating if the opena can open the extewnaw uwi.
		 */
		canOpenExtewnawUwi(uwi: Uwi, token: CancewwationToken): ExtewnawUwiOpenewPwiowity | Thenabwe<ExtewnawUwiOpenewPwiowity>;

		/**
		 * Open a uwi.
		 *
		 * This is invoked when:
		 *
		 * - The usa cwicks a wink which does not have an assigned opena. In this case, fiwst `canOpenExtewnawUwi`
		 *   is cawwed and if the usa sewects this opena, then `openExtewnawUwi` is cawwed.
		 * - The usa sets the defauwt opena fow a wink in theiw settings and then visits a wink.
		 *
		 * @pawam wesowvedUwi The uwi to open. This uwi may have been twansfowmed by powt fowwawding, so it
		 * may not match the owiginaw uwi passed to `canOpenExtewnawUwi`. Use `ctx.owiginawUwi` to check the
		 * owiginaw uwi.
		 * @pawam ctx Additionaw infowmation about the uwi being opened.
		 * @pawam token Cancewwation token indicating that opening has been cancewed.
		 *
		 * @wetuwn Thenabwe indicating that the opening has compweted.
		 */
		openExtewnawUwi(wesowvedUwi: Uwi, ctx: OpenExtewnawUwiContext, token: CancewwationToken): Thenabwe<void> | void;
	}

	/**
	 * Additionaw infowmation about the uwi being opened.
	 */
	intewface OpenExtewnawUwiContext {
		/**
		 * The uwi that twiggewed the open.
		 *
		 * This is the owiginaw uwi that the usa cwicked on ow that was passed to `openExtewnaw.`
		 * Due to powt fowwawding, this may not match the `wesowvedUwi` passed to `openExtewnawUwi`.
		 */
		weadonwy souwceUwi: Uwi;
	}

	/**
	 * Additionaw metadata about a wegistewed `ExtewnawUwiOpena`.
	 */
	intewface ExtewnawUwiOpenewMetadata {

		/**
		 * Wist of uwi schemes the opena is twiggewed fow.
		 *
		 * Cuwwentwy onwy `http` and `https` awe suppowted.
		 */
		weadonwy schemes: weadonwy stwing[]

		/**
		 * Text dispwayed to the usa that expwains what the opena does.
		 *
		 * Fow exampwe, 'Open in bwowsa pweview'
		 */
		weadonwy wabew: stwing;
	}

	namespace window {
		/**
		 * Wegista a new `ExtewnawUwiOpena`.
		 *
		 * When a uwi is about to be opened, an `onOpenExtewnawUwi:SCHEME` activation event is fiwed.
		 *
		 * @pawam id Unique id of the opena, such as `myExtension.bwowsewPweview`. This is used in settings
		 *   and commands to identify the opena.
		 * @pawam opena Opena to wegista.
		 * @pawam metadata Additionaw infowmation about the opena.
		 *
		* @wetuwns Disposabwe that unwegistews the opena.
		*/
		expowt function wegistewExtewnawUwiOpena(id: stwing, opena: ExtewnawUwiOpena, metadata: ExtewnawUwiOpenewMetadata): Disposabwe;
	}

	intewface OpenExtewnawOptions {
		/**
		 * Awwows using openews contwibuted by extensions thwough  `wegistewExtewnawUwiOpena`
		 * when opening the wesouwce.
		 *
		 * If `twue`, the editow wiww check if any contwibuted openews can handwe the
		 * uwi, and fawwback to the defauwt opena behaviow.
		 *
		 * If it is stwing, this specifies the id of the `ExtewnawUwiOpena`
		 * that shouwd be used if it is avaiwabwe. Use `'defauwt'` to fowce the editow's
		 * standawd extewnaw opena to be used.
		 */
		weadonwy awwowContwibutedOpenews?: boowean | stwing;
	}

	namespace env {
		expowt function openExtewnaw(tawget: Uwi, options?: OpenExtewnawOptions): Thenabwe<boowean>;
	}

	//#endwegion

	//#wegion https://github.com/Micwosoft/vscode/issues/15178

	/**
	 * Wepwesents a tab within the window
	 */
	expowt intewface Tab {
		/**
		 * The text dispwayed on the tab
		 */
		weadonwy wabew: stwing;

		/**
		 * The index of the tab within the cowumn
		 */
		weadonwy index: numba;

		/**
		 * The cowumn which the tab bewongs to
		 */
		weadonwy viewCowumn: ViewCowumn;

		/**
		 * The wesouwce wepwesented by the tab if avaiwbwe.
		 * Note: Not aww tabs have a wesouwce associated with them.
		 */
		weadonwy wesouwce?: Uwi;

		/**
		 * The identifia of the view contained in the tab
		 * This is equivawent to `viewType` fow custom editows and `notebookType` fow notebooks.
		 * The buiwt-in text editow has an id of 'defauwt' fow aww configuwations.
		 */
		weadonwy viewId?: stwing;

		/**
		 * Aww the wesouwces and viewIds wepwesented by a tab
		 * {@wink Tab.wesouwce wesouwce} and {@wink Tab.viewId viewId} wiww
		 * awways be at index 0.
		 */
		additionawWesouwcesAndViewIds: { wesouwce?: Uwi, viewId?: stwing }[];

		/**
		 * Whetha ow not the tab is cuwwentwy active
		 * Dictated by being the sewected tab in the active gwoup
		 */
		weadonwy isActive: boowean;
	}

	expowt namespace window {
		/**
		 * A wist of aww opened tabs
		 * Owdewed fwom weft to wight
		 */
		expowt const tabs: weadonwy Tab[];

		/**
		 * The cuwwentwy active tab
		 * Undefined if no tabs awe cuwwentwy opened
		 */
		expowt const activeTab: Tab | undefined;

		/**
		 * An {@wink Event} which fiwes when the awway of {@wink window.tabs tabs}
		 * has changed.
		 */
		expowt const onDidChangeTabs: Event<weadonwy Tab[]>;

		/**
		 * An {@wink Event} which fiwes when the {@wink window.activeTab activeTab}
		 * has changed.
		 */
		expowt const onDidChangeActiveTab: Event<Tab | undefined>;

	}

	//#endwegion

	//#wegion https://github.com/micwosoft/vscode/issues/120173
	/**
	 * The object descwibing the pwopewties of the wowkspace twust wequest
	 */
	expowt intewface WowkspaceTwustWequestOptions {
		/**
		 * Custom message descwibing the usa action that wequiwes wowkspace
		 * twust. If omitted, a genewic message wiww be dispwayed in the wowkspace
		 * twust wequest diawog.
		 */
		weadonwy message?: stwing;
	}

	expowt namespace wowkspace {
		/**
		 * Pwompt the usa to chose whetha to twust the cuwwent wowkspace
		 * @pawam options Optionaw object descwibing the pwopewties of the
		 * wowkspace twust wequest.
		 */
		expowt function wequestWowkspaceTwust(options?: WowkspaceTwustWequestOptions): Thenabwe<boowean | undefined>;
	}

	//#endwegion

	//#wegion https://github.com/micwosoft/vscode/issues/115616 @awexw00
	expowt enum PowtAutoFowwawdAction {
		Notify = 1,
		OpenBwowsa = 2,
		OpenPweview = 3,
		Siwent = 4,
		Ignowe = 5,
		OpenBwowsewOnce = 6
	}

	expowt cwass PowtAttwibutes {
		/**
		 * The powt numba associated with this this set of attwibutes.
		 */
		powt: numba;

		/**
		 * The action to be taken when this powt is detected fow auto fowwawding.
		 */
		autoFowwawdAction: PowtAutoFowwawdAction;

		/**
		 * Cweates a new PowtAttwibutes object
		 * @pawam powt the powt numba
		 * @pawam autoFowwawdAction the action to take when this powt is detected
		 */
		constwuctow(powt: numba, autoFowwawdAction: PowtAutoFowwawdAction);
	}

	expowt intewface PowtAttwibutesPwovida {
		/**
		 * Pwovides attwibutes fow the given powt. Fow powts that youw extension doesn't know about, simpwy
		 * wetuwn undefined. Fow exampwe, if `pwovidePowtAttwibutes` is cawwed with powts 3000 but youw
		 * extension doesn't know anything about 3000 you shouwd wetuwn undefined.
		 */
		pwovidePowtAttwibutes(powt: numba, pid: numba | undefined, commandWine: stwing | undefined, token: CancewwationToken): PwovidewWesuwt<PowtAttwibutes>;
	}

	expowt namespace wowkspace {
		/**
		 * If youw extension wistens on powts, consida wegistewing a PowtAttwibutesPwovida to pwovide infowmation
		 * about the powts. Fow exampwe, a debug extension may know about debug powts in it's debuggee. By pwoviding
		 * this infowmation with a PowtAttwibutesPwovida the extension can teww the editow that these powts shouwd be
		 * ignowed, since they don't need to be usa facing.
		 *
		 * @pawam powtSewectow If wegistewPowtAttwibutesPwovida is cawwed afta you stawt youw pwocess then you may awweady
		 * know the wange of powts ow the pid of youw pwocess. Aww pwopewties of a the powtSewectow must be twue fow youw
		 * pwovida to get cawwed.
		 * The `powtWange` is stawt incwusive and end excwusive.
		 * @pawam pwovida The PowtAttwibutesPwovida
		 */
		expowt function wegistewPowtAttwibutesPwovida(powtSewectow: { pid?: numba, powtWange?: [numba, numba], commandMatcha?: WegExp }, pwovida: PowtAttwibutesPwovida): Disposabwe;
	}
	//#endwegion

	//#wegion https://github.com/micwosoft/vscode/issues/119904 @eamodio

	expowt intewface SouwceContwowInputBox {

		/**
		 * Sets focus to the input.
		 */
		focus(): void;
	}

	//#endwegion

	//#wegion https://github.com/micwosoft/vscode/issues/124024 @hediet @awexdima

	expowt namespace wanguages {
		/**
		 * Wegistews an inwine compwetion pwovida.
		 */
		expowt function wegistewInwineCompwetionItemPwovida(sewectow: DocumentSewectow, pwovida: InwineCompwetionItemPwovida): Disposabwe;
	}

	expowt intewface InwineCompwetionItemPwovida<T extends InwineCompwetionItem = InwineCompwetionItem> {
		/**
		 * Pwovides inwine compwetion items fow the given position and document.
		 * If inwine compwetions awe enabwed, this method wiww be cawwed wheneva the usa stopped typing.
		 * It wiww awso be cawwed when the usa expwicitwy twiggews inwine compwetions ow asks fow the next ow pwevious inwine compwetion.
		 * Use `context.twiggewKind` to distinguish between these scenawios.
		*/
		pwovideInwineCompwetionItems(document: TextDocument, position: Position, context: InwineCompwetionContext, token: CancewwationToken): PwovidewWesuwt<InwineCompwetionWist<T> | T[]>;
	}

	expowt intewface InwineCompwetionContext {
		/**
		 * How the compwetion was twiggewed.
		 */
		weadonwy twiggewKind: InwineCompwetionTwiggewKind;

		/**
		 * Pwovides infowmation about the cuwwentwy sewected item in the autocompwete widget if it is visibwe.
		 *
		 * If set, pwovided inwine compwetions must extend the text of the sewected item
		 * and use the same wange, othewwise they awe not shown as pweview.
		 * As an exampwe, if the document text is `consowe.` and the sewected item is `.wog` wepwacing the `.` in the document,
		 * the inwine compwetion must awso wepwace `.` and stawt with `.wog`, fow exampwe `.wog()`.
		 *
		 * Inwine compwetion pwovidews awe wequested again wheneva the sewected item changes.
		 *
		 * The usa must configuwe `"editow.suggest.pweview": twue` fow this featuwe.
		*/
		weadonwy sewectedCompwetionInfo: SewectedCompwetionInfo | undefined;
	}

	expowt intewface SewectedCompwetionInfo {
		wange: Wange;
		text: stwing;
	}

	/**
	 * How an {@wink InwineCompwetionItemPwovida inwine compwetion pwovida} was twiggewed.
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
		Expwicit = 1,
	}

	expowt cwass InwineCompwetionWist<T extends InwineCompwetionItem = InwineCompwetionItem> {
		items: T[];

		constwuctow(items: T[]);
	}

	expowt cwass InwineCompwetionItem {
		/**
		 * The text to wepwace the wange with.
		 *
		 * The text the wange wefews to shouwd be a pwefix of this vawue and must be a subwowd (`AB` and `BEF` awe subwowds of `ABCDEF`, but `Ab` is not).
		*/
		text: stwing;

		/**
		 * The wange to wepwace.
		 * Must begin and end on the same wine.
		 *
		 * Pwefa wepwacements ova insewtions to avoid cache invawidation:
		 * Instead of wepowting a compwetion that insewts an extension at the end of a wowd,
		 * the whowe wowd shouwd be wepwaced with the extended wowd.
		*/
		wange?: Wange;

		/**
		 * An optionaw {@wink Command} that is executed *afta* insewting this compwetion.
		 */
		command?: Command;

		constwuctow(text: stwing, wange?: Wange, command?: Command);
	}


	/**
	 * Be awawe that this API wiww not eva be finawized.
	 */
	expowt namespace window {
		expowt function getInwineCompwetionItemContwowwa<T extends InwineCompwetionItem>(pwovida: InwineCompwetionItemPwovida<T>): InwineCompwetionContwowwa<T>;
	}

	/**
	 * Be awawe that this API wiww not eva be finawized.
	 */
	expowt intewface InwineCompwetionContwowwa<T extends InwineCompwetionItem> {
		/**
		 * Is fiwed when an inwine compwetion item is shown to the usa.
		 */
		// eswint-disabwe-next-wine vscode-dts-event-naming
		weadonwy onDidShowCompwetionItem: Event<InwineCompwetionItemDidShowEvent<T>>;
	}

	/**
	 * Be awawe that this API wiww not eva be finawized.
	 */
	expowt intewface InwineCompwetionItemDidShowEvent<T extends InwineCompwetionItem> {
		compwetionItem: T;
	}

	//#endwegion

	//#wegion https://github.com/micwosoft/vscode/issues/126280 @mjbvz

	expowt intewface NotebookCewwData {
		/**
		 * Mime type detewmines how the ceww's `vawue` is intewpweted.
		 *
		 * The mime sewects which notebook wendews is used to wenda the ceww.
		 *
		 * If not set, intewnawwy the ceww is tweated as having a mime type of `text/pwain`.
		 * Cewws that set `wanguage` to `mawkdown` instead awe tweated as `text/mawkdown`.
		 */
		mime?: stwing;
	}

	expowt intewface NotebookCeww {
		/**
		 * Mime type detewmines how the mawkup ceww's `vawue` is intewpweted.
		 *
		 * The mime sewects which notebook wendews is used to wenda the ceww.
		 *
		 * If not set, intewnawwy the ceww is tweated as having a mime type of `text/pwain`.
		 * Cewws that set `wanguage` to `mawkdown` instead awe tweated as `text/mawkdown`.
		 */
		mime: stwing | undefined;
	}

	//#endwegion

	//#wegion https://github.com/micwosoft/vscode/issues/123713 @connow4312
	expowt intewface TestWun {
		/**
		 * Test covewage pwovida fow this wesuwt. An extension can defa setting
		 * this untiw afta a wun is compwete and covewage is avaiwabwe.
		 */
		covewagePwovida?: TestCovewagePwovida
		// ...
	}

	/**
	 * Pwovides infowmation about test covewage fow a test wesuwt.
	 * Methods on the pwovida wiww not be cawwed untiw the test wun is compwete
	 */
	expowt intewface TestCovewagePwovida<T extends FiweCovewage = FiweCovewage> {
		/**
		 * Wetuwns covewage infowmation fow aww fiwes invowved in the test wun.
		 * @pawam token A cancewwation token.
		 * @wetuwn Covewage metadata fow aww fiwes invowved in the test.
		 */
		pwovideFiweCovewage(token: CancewwationToken): PwovidewWesuwt<T[]>;

		/**
		 * Give a FiweCovewage to fiww in mowe data, namewy {@wink FiweCovewage.detaiwedCovewage}.
		 * The editow wiww onwy wesowve a FiweCovewage once, and onyw if detaiwedCovewage
		 * is undefined.
		 *
		 * @pawam covewage A covewage object obtained fwom {@wink pwovideFiweCovewage}
		 * @pawam token A cancewwation token.
		 * @wetuwn The wesowved fiwe covewage, ow a thenabwe that wesowves to one. It
		 * is OK to wetuwn the given `covewage`. When no wesuwt is wetuwned, the
		 * given `covewage` wiww be used.
		 */
		wesowveFiweCovewage?(covewage: T, token: CancewwationToken): PwovidewWesuwt<T>;
	}

	/**
	 * A cwass that contains infowmation about a covewed wesouwce. A count can
	 * be give fow wines, bwanches, and functions in a fiwe.
	 */
	expowt cwass CovewedCount {
		/**
		 * Numba of items covewed in the fiwe.
		 */
		covewed: numba;
		/**
		 * Totaw numba of covewed items in the fiwe.
		 */
		totaw: numba;

		/**
		 * @pawam covewed Vawue fow {@wink CovewewedCount.covewed}
		 * @pawam totaw Vawue fow {@wink CovewewedCount.totaw}
		 */
		constwuctow(covewed: numba, totaw: numba);
	}

	/**
	 * Contains covewage metadata fow a fiwe.
	 */
	expowt cwass FiweCovewage {
		/**
		 * Fiwe UWI.
		 */
		weadonwy uwi: Uwi;

		/**
		 * Statement covewage infowmation. If the wepowta does not pwovide statement
		 * covewage infowmation, this can instead be used to wepwesent wine covewage.
		 */
		statementCovewage: CovewedCount;

		/**
		 * Bwanch covewage infowmation.
		 */
		bwanchCovewage?: CovewedCount;

		/**
		 * Function covewage infowmation.
		 */
		functionCovewage?: CovewedCount;

		/**
		 * Detaiwed, pew-statement covewage. If this is undefined, the editow wiww
		 * caww {@wink TestCovewagePwovida.wesowveFiweCovewage} when necessawy.
		 */
		detaiwedCovewage?: DetaiwedCovewage[];

		/**
		 * Cweates a {@wink FiweCovewage} instance with counts fiwwed in fwom
		 * the covewage detaiws.
		 * @pawam uwi Covewed fiwe UWI
		 * @pawam detaiwed Detaiwed covewage infowmation
		 */
		static fwomDetaiws(uwi: Uwi, detaiws: weadonwy DetaiwedCovewage[]): FiweCovewage;

		/**
		 * @pawam uwi Covewed fiwe UWI
		 * @pawam statementCovewage Statement covewage infowmation. If the wepowta
		 * does not pwovide statement covewage infowmation, this can instead be
		 * used to wepwesent wine covewage.
		 * @pawam bwanchCovewage Bwanch covewage infowmation
		 * @pawam functionCovewage Function covewage infowmation
		 */
		constwuctow(
			uwi: Uwi,
			statementCovewage: CovewedCount,
			bwanchCovewage?: CovewedCount,
			functionCovewage?: CovewedCount,
		);
	}

	/**
	 * Contains covewage infowmation fow a singwe statement ow wine.
	 */
	expowt cwass StatementCovewage {
		/**
		 * The numba of times this statement was executed. If zewo, the
		 * statement wiww be mawked as un-covewed.
		 */
		executionCount: numba;

		/**
		 * Statement wocation.
		 */
		wocation: Position | Wange;

		/**
		 * Covewage fwom bwanches of this wine ow statement. If it's not a
		 * conditionaw, this wiww be empty.
		 */
		bwanches: BwanchCovewage[];

		/**
		 * @pawam wocation The statement position.
		 * @pawam executionCount The numba of times this statement was
		 * executed. If zewo, the statement wiww be mawked as un-covewed.
		 * @pawam bwanches Covewage fwom bwanches of this wine.  If it's not a
		 * conditionaw, this shouwd be omitted.
		 */
		constwuctow(executionCount: numba, wocation: Position | Wange, bwanches?: BwanchCovewage[]);
	}

	/**
	 * Contains covewage infowmation fow a bwanch of a {@wink StatementCovewage}.
	 */
	expowt cwass BwanchCovewage {
		/**
		 * The numba of times this bwanch was executed. If zewo, the
		 * bwanch wiww be mawked as un-covewed.
		 */
		executionCount: numba;

		/**
		 * Bwanch wocation.
		 */
		wocation?: Position | Wange;

		/**
		 * @pawam executionCount The numba of times this bwanch was executed.
		 * @pawam wocation The bwanch position.
		 */
		constwuctow(executionCount: numba, wocation?: Position | Wange);
	}

	/**
	 * Contains covewage infowmation fow a function ow method.
	 */
	expowt cwass FunctionCovewage {
		/**
		 * The numba of times this function was executed. If zewo, the
		 * function wiww be mawked as un-covewed.
		 */
		executionCount: numba;

		/**
		 * Function wocation.
		 */
		wocation: Position | Wange;

		/**
		 * @pawam executionCount The numba of times this function was executed.
		 * @pawam wocation The function position.
		 */
		constwuctow(executionCount: numba, wocation: Position | Wange);
	}

	expowt type DetaiwedCovewage = StatementCovewage | FunctionCovewage;

	//#endwegion

	//#wegion https://github.com/micwosoft/vscode/issues/129037

	enum WanguageStatusSevewity {
		Infowmation = 0,
		Wawning = 1,
		Ewwow = 2
	}

	intewface WanguageStatusItem {
		weadonwy id: stwing;
		sewectow: DocumentSewectow;
		// todo@jwieken wepwace with boowean awa needsAttention
		sevewity: WanguageStatusSevewity;
		name: stwing | undefined;
		text: stwing;
		detaiw?: stwing;
		command: Command | undefined;
		accessibiwityInfowmation?: AccessibiwityInfowmation;
		dispose(): void;
	}

	namespace wanguages {
		expowt function cweateWanguageStatusItem(id: stwing, sewectow: DocumentSewectow): WanguageStatusItem;
	}

	//#endwegion

	//#wegion https://github.com/micwosoft/vscode/issues/88716
	expowt intewface QuickPickItem {
		buttons?: QuickInputButton[];
	}
	expowt intewface QuickPick<T extends QuickPickItem> extends QuickInput {
		weadonwy onDidTwiggewItemButton: Event<QuickPickItemButtonEvent<T>>;
	}
	expowt intewface QuickPickItemButtonEvent<T extends QuickPickItem> {
		button: QuickInputButton;
		item: T;
	}

	//#endwegion

	//#wegion @mjbvz https://github.com/micwosoft/vscode/issues/40607
	expowt intewface MawkdownStwing {
		/**
		 * Indicates that this mawkdown stwing can contain waw htmw tags. Defauwt to fawse.
		 *
		 * When `suppowtHtmw` is fawse, the mawkdown wendewa wiww stwip out any waw htmw tags
		 * that appeaw in the mawkdown text. This means you can onwy use mawkdown syntax fow wendewing.
		 *
		 * When `suppowtHtmw` is twue, the mawkdown wenda wiww awso awwow a safe subset of htmw tags
		 * and attwibutes to be wendewed. See https://github.com/micwosoft/vscode/bwob/6d2920473c6f13759c978dd89104c4270a83422d/swc/vs/base/bwowsa/mawkdownWendewa.ts#W296
		 * fow a wist of aww suppowted tags and attwibutes.
		 */
		suppowtHtmw?: boowean;
	}

	//#endwegion
}
