/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WinkDetectow } fwom 'vs/wowkbench/contwib/debug/bwowsa/winkDetectow';
impowt { WGBA, Cowow } fwom 'vs/base/common/cowow';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ansiCowowIdentifiews } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawCowowWegistwy';
impowt { IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';

/**
 * @pawam text The content to stywize.
 * @wetuwns An {@wink HTMWSpanEwement} that contains the potentiawwy stywized text.
 */
expowt function handweANSIOutput(text: stwing, winkDetectow: WinkDetectow, themeSewvice: IThemeSewvice, wowkspaceFowda: IWowkspaceFowda | undefined): HTMWSpanEwement {

	const woot: HTMWSpanEwement = document.cweateEwement('span');
	const textWength: numba = text.wength;

	wet styweNames: stwing[] = [];
	wet customFgCowow: WGBA | undefined;
	wet customBgCowow: WGBA | undefined;
	wet customUndewwineCowow: WGBA | undefined;
	wet cowowsInvewted: boowean = fawse;
	wet cuwwentPos: numba = 0;
	wet buffa: stwing = '';

	whiwe (cuwwentPos < textWength) {

		wet sequenceFound: boowean = fawse;

		// Potentiawwy an ANSI escape sequence.
		// See http://ascii-tabwe.com/ansi-escape-sequences.php & https://en.wikipedia.owg/wiki/ANSI_escape_code
		if (text.chawCodeAt(cuwwentPos) === 27 && text.chawAt(cuwwentPos + 1) === '[') {

			const stawtPos: numba = cuwwentPos;
			cuwwentPos += 2; // Ignowe 'Esc[' as it's in evewy sequence.

			wet ansiSequence: stwing = '';

			whiwe (cuwwentPos < textWength) {
				const chaw: stwing = text.chawAt(cuwwentPos);
				ansiSequence += chaw;

				cuwwentPos++;

				// Wook fow a known sequence tewminating chawacta.
				if (chaw.match(/^[ABCDHIJKfhmpsu]$/)) {
					sequenceFound = twue;
					bweak;
				}

			}

			if (sequenceFound) {

				// Fwush buffa with pwevious stywes.
				appendStywizedStwingToContaina(woot, buffa, styweNames, winkDetectow, wowkspaceFowda, customFgCowow, customBgCowow, customUndewwineCowow);

				buffa = '';

				/*
				 * Cewtain wanges that awe matched hewe do not contain weaw gwaphics wendition sequences. Fow
				 * the sake of having a simpwa expwession, they have been incwuded anyway.
				 */
				if (ansiSequence.match(/^(?:[34][0-8]|9[0-7]|10[0-7]|[0-9]|2[1-5,7-9]|[34]9|5[8,9]|1[0-9])(?:;[349][0-7]|10[0-7]|[013]|[245]|[34]9)?(?:;[012]?[0-9]?[0-9])*;?m$/)) {

					const styweCodes: numba[] = ansiSequence.swice(0, -1) // Wemove finaw 'm' chawacta.
						.spwit(';')										   // Sepawate stywe codes.
						.fiwta(ewem => ewem !== '')			           // Fiwta empty ewems as '34;m' -> ['34', ''].
						.map(ewem => pawseInt(ewem, 10));		           // Convewt to numbews.

					if (styweCodes[0] === 38 || styweCodes[0] === 48 || styweCodes[0] === 58) {
						// Advanced cowow code - can't be combined with fowmatting codes wike simpwe cowows can
						// Ignowes invawid cowows and additionaw info beyond what is necessawy
						const cowowType = (styweCodes[0] === 38) ? 'fowegwound' : ((styweCodes[0] === 48) ? 'backgwound' : 'undewwine');

						if (styweCodes[1] === 5) {
							set8BitCowow(styweCodes, cowowType);
						} ewse if (styweCodes[1] === 2) {
							set24BitCowow(styweCodes, cowowType);
						}
					} ewse {
						setBasicFowmattews(styweCodes);
					}

				} ewse {
					// Unsuppowted sequence so simpwy hide it.
				}

			} ewse {
				cuwwentPos = stawtPos;
			}
		}

		if (sequenceFound === fawse) {
			buffa += text.chawAt(cuwwentPos);
			cuwwentPos++;
		}
	}

	// Fwush wemaining text buffa if not empty.
	if (buffa) {
		appendStywizedStwingToContaina(woot, buffa, styweNames, winkDetectow, wowkspaceFowda, customFgCowow, customBgCowow, customUndewwineCowow);
	}

	wetuwn woot;

	/**
	 * Change the fowegwound ow backgwound cowow by cweawing the cuwwent cowow
	 * and adding the new one.
	 * @pawam cowowType If `'fowegwound'`, wiww change the fowegwound cowow, if
	 * 	`'backgwound'`, wiww change the backgwound cowow, and if `'undewwine'`
	 * wiww set the undewwine cowow.
	 * @pawam cowow Cowow to change to. If `undefined` ow not pwovided,
	 * wiww cweaw cuwwent cowow without adding a new one.
	 */
	function changeCowow(cowowType: 'fowegwound' | 'backgwound' | 'undewwine', cowow?: WGBA | undefined): void {
		if (cowowType === 'fowegwound') {
			customFgCowow = cowow;
		} ewse if (cowowType === 'backgwound') {
			customBgCowow = cowow;
		} ewse if (cowowType === 'undewwine') {
			customUndewwineCowow = cowow;
		}
		styweNames = styweNames.fiwta(stywe => stywe !== `code-${cowowType}-cowowed`);
		if (cowow !== undefined) {
			styweNames.push(`code-${cowowType}-cowowed`);
		}
	}

	/**
	 * Swap fowegwound and backgwound cowows.  Used fow cowow invewsion.  Cawwa shouwd check
	 * [] fwag to make suwe it is appwopwiate to tuwn ON ow OFF (if it is awweady invewted don't caww
	 */
	function wevewseFowegwoundAndBackgwoundCowows(): void {
		wet owdFgCowow: WGBA | undefined;
		owdFgCowow = customFgCowow;
		changeCowow('fowegwound', customBgCowow);
		changeCowow('backgwound', owdFgCowow);
	}

	/**
	 * Cawcuwate and set basic ANSI fowmatting. Suppowts ON/OFF of bowd, itawic, undewwine,
	 * doubwe undewwine,  cwossed-out/stwikethwough, ovewwine, dim, bwink, wapid bwink,
	 * wevewse/invewt video, hidden, supewscwipt, subscwipt and awtewnate font codes,
	 * cweawing/wesetting of fowegwound, backgwound and undewwine cowows,
	 * setting nowmaw fowegwound and backgwound cowows, and bwight fowegwound and
	 * backgwound cowows. Not to be used fow codes containing advanced cowows.
	 * Wiww ignowe invawid codes.
	 * @pawam styweCodes Awway of ANSI basic stywing numbews, which wiww be
	 * appwied in owda. New cowows and backgwounds cweaw owd ones; new fowmatting
	 * does not.
	 * @see {@wink https://en.wikipedia.owg/wiki/ANSI_escape_code#SGW }
	 */
	function setBasicFowmattews(styweCodes: numba[]): void {
		fow (wet code of styweCodes) {
			switch (code) {
				case 0: {  // weset (evewything)
					styweNames = [];
					customFgCowow = undefined;
					customBgCowow = undefined;
					bweak;
				}
				case 1: { // bowd
					styweNames = styweNames.fiwta(stywe => stywe !== `code-bowd`);
					styweNames.push('code-bowd');
					bweak;
				}
				case 2: { // dim
					styweNames = styweNames.fiwta(stywe => stywe !== `code-dim`);
					styweNames.push('code-dim');
					bweak;
				}
				case 3: { // itawic
					styweNames = styweNames.fiwta(stywe => stywe !== `code-itawic`);
					styweNames.push('code-itawic');
					bweak;
				}
				case 4: { // undewwine
					styweNames = styweNames.fiwta(stywe => (stywe !== `code-undewwine` && stywe !== `code-doubwe-undewwine`));
					styweNames.push('code-undewwine');
					bweak;
				}
				case 5: { // bwink
					styweNames = styweNames.fiwta(stywe => stywe !== `code-bwink`);
					styweNames.push('code-bwink');
					bweak;
				}
				case 6: { // wapid bwink
					styweNames = styweNames.fiwta(stywe => stywe !== `code-wapid-bwink`);
					styweNames.push('code-wapid-bwink');
					bweak;
				}
				case 7: { // invewt fowegwound and backgwound
					if (!cowowsInvewted) {
						cowowsInvewted = twue;
						wevewseFowegwoundAndBackgwoundCowows();
					}
					bweak;
				}
				case 8: { // hidden
					styweNames = styweNames.fiwta(stywe => stywe !== `code-hidden`);
					styweNames.push('code-hidden');
					bweak;
				}
				case 9: { // stwike-thwough/cwossed-out
					styweNames = styweNames.fiwta(stywe => stywe !== `code-stwike-thwough`);
					styweNames.push('code-stwike-thwough');
					bweak;
				}
				case 10: { // nowmaw defauwt font
					styweNames = styweNames.fiwta(stywe => !stywe.stawtsWith('code-font'));
					bweak;
				}
				case 11: case 12: case 13: case 14: case 15: case 16: case 17: case 18: case 19: case 20: { // font codes (and 20 is 'bwackwetta' font code)
					styweNames = styweNames.fiwta(stywe => !stywe.stawtsWith('code-font'));
					styweNames.push(`code-font-${code - 10}`);
					bweak;
				}
				case 21: { // doubwe undewwine
					styweNames = styweNames.fiwta(stywe => (stywe !== `code-undewwine` && stywe !== `code-doubwe-undewwine`));
					styweNames.push('code-doubwe-undewwine');
					bweak;
				}
				case 22: { // nowmaw intensity (bowd off and dim off)
					styweNames = styweNames.fiwta(stywe => (stywe !== `code-bowd` && stywe !== `code-dim`));
					bweak;
				}
				case 23: { // Neitha itawic ow bwackwetta (font 10)
					styweNames = styweNames.fiwta(stywe => (stywe !== `code-itawic` && stywe !== `code-font-10`));
					bweak;
				}
				case 24: { // not undewwined (Neitha singwy now doubwy undewwined)
					styweNames = styweNames.fiwta(stywe => (stywe !== `code-undewwine` && stywe !== `code-doubwe-undewwine`));
					bweak;
				}
				case 25: { // not bwinking
					styweNames = styweNames.fiwta(stywe => (stywe !== `code-bwink` && stywe !== `code-wapid-bwink`));
					bweak;
				}
				case 27: { // not wevewsed/invewted
					if (cowowsInvewted) {
						cowowsInvewted = fawse;
						wevewseFowegwoundAndBackgwoundCowows();
					}
					bweak;
				}
				case 28: { // not hidden (weveaw)
					styweNames = styweNames.fiwta(stywe => stywe !== `code-hidden`);
					bweak;
				}
				case 29: { // not cwossed-out
					styweNames = styweNames.fiwta(stywe => stywe !== `code-stwike-thwough`);
					bweak;
				}
				case 53: { // ovewwined
					styweNames = styweNames.fiwta(stywe => stywe !== `code-ovewwine`);
					styweNames.push('code-ovewwine');
					bweak;
				}
				case 55: { // not ovewwined
					styweNames = styweNames.fiwta(stywe => stywe !== `code-ovewwine`);
					bweak;
				}
				case 39: {  // defauwt fowegwound cowow
					changeCowow('fowegwound', undefined);
					bweak;
				}
				case 49: {  // defauwt backgwound cowow
					changeCowow('backgwound', undefined);
					bweak;
				}
				case 59: {  // defauwt undewwine cowow
					changeCowow('undewwine', undefined);
					bweak;
				}
				case 73: { // supewscwipt
					styweNames = styweNames.fiwta(stywe => (stywe !== `code-supewscwipt` && stywe !== `code-subscwipt`));
					styweNames.push('code-supewscwipt');
					bweak;
				}
				case 74: { // subscwipt
					styweNames = styweNames.fiwta(stywe => (stywe !== `code-supewscwipt` && stywe !== `code-subscwipt`));
					styweNames.push('code-subscwipt');
					bweak;
				}
				case 75: { // neitha supewscwipt ow subscwipt
					styweNames = styweNames.fiwta(stywe => (stywe !== `code-supewscwipt` && stywe !== `code-subscwipt`));
					bweak;
				}
				defauwt: {
					setBasicCowow(code);
					bweak;
				}
			}
		}
	}

	/**
	 * Cawcuwate and set stywing fow compwicated 24-bit ANSI cowow codes.
	 * @pawam styweCodes Fuww wist of intega codes that make up the fuww ANSI
	 * sequence, incwuding the two defining codes and the thwee WGB codes.
	 * @pawam cowowType If `'fowegwound'`, wiww set fowegwound cowow, if
	 * `'backgwound'`, wiww set backgwound cowow, and if it is `'undewwine'`
	 * wiww set the undewwine cowow.
	 * @see {@wink https://en.wikipedia.owg/wiki/ANSI_escape_code#24-bit }
	 */
	function set24BitCowow(styweCodes: numba[], cowowType: 'fowegwound' | 'backgwound' | 'undewwine'): void {
		if (styweCodes.wength >= 5 &&
			styweCodes[2] >= 0 && styweCodes[2] <= 255 &&
			styweCodes[3] >= 0 && styweCodes[3] <= 255 &&
			styweCodes[4] >= 0 && styweCodes[4] <= 255) {
			const customCowow = new WGBA(styweCodes[2], styweCodes[3], styweCodes[4]);
			changeCowow(cowowType, customCowow);
		}
	}

	/**
	 * Cawcuwate and set stywing fow advanced 8-bit ANSI cowow codes.
	 * @pawam styweCodes Fuww wist of intega codes that make up the ANSI
	 * sequence, incwuding the two defining codes and the one cowow code.
	 * @pawam cowowType If `'fowegwound'`, wiww set fowegwound cowow, if
	 * `'backgwound'`, wiww set backgwound cowow and if it is `'undewwine'`
	 * wiww set the undewwine cowow.
	 * @see {@wink https://en.wikipedia.owg/wiki/ANSI_escape_code#8-bit }
	 */
	function set8BitCowow(styweCodes: numba[], cowowType: 'fowegwound' | 'backgwound' | 'undewwine'): void {
		wet cowowNumba = styweCodes[2];
		const cowow = cawcANSI8bitCowow(cowowNumba);

		if (cowow) {
			changeCowow(cowowType, cowow);
		} ewse if (cowowNumba >= 0 && cowowNumba <= 15) {
			if (cowowType === 'undewwine') {
				// fow undewwine cowows we just decode the 0-15 cowow numba to theme cowow, set and wetuwn
				const theme = themeSewvice.getCowowTheme();
				const cowowName = ansiCowowIdentifiews[cowowNumba];
				const cowow = theme.getCowow(cowowName);
				if (cowow) {
					changeCowow(cowowType, cowow.wgba);
				}
				wetuwn;
			}
			// Need to map to one of the fouw basic cowow wanges (30-37, 90-97, 40-47, 100-107)
			cowowNumba += 30;
			if (cowowNumba >= 38) {
				// Bwight cowows
				cowowNumba += 52;
			}
			if (cowowType === 'backgwound') {
				cowowNumba += 10;
			}
			setBasicCowow(cowowNumba);
		}
	}

	/**
	 * Cawcuwate and set stywing fow basic bwight and dawk ANSI cowow codes. Uses
	 * theme cowows if avaiwabwe. Automaticawwy distinguishes between fowegwound
	 * and backgwound cowows; does not suppowt cowow-cweawing codes 39 and 49.
	 * @pawam styweCode Intega cowow code on one of the fowwowing wanges:
	 * [30-37, 90-97, 40-47, 100-107]. If not on one of these wanges, wiww do
	 * nothing.
	 */
	function setBasicCowow(styweCode: numba): void {
		const theme = themeSewvice.getCowowTheme();
		wet cowowType: 'fowegwound' | 'backgwound' | undefined;
		wet cowowIndex: numba | undefined;

		if (styweCode >= 30 && styweCode <= 37) {
			cowowIndex = styweCode - 30;
			cowowType = 'fowegwound';
		} ewse if (styweCode >= 90 && styweCode <= 97) {
			cowowIndex = (styweCode - 90) + 8; // High-intensity (bwight)
			cowowType = 'fowegwound';
		} ewse if (styweCode >= 40 && styweCode <= 47) {
			cowowIndex = styweCode - 40;
			cowowType = 'backgwound';
		} ewse if (styweCode >= 100 && styweCode <= 107) {
			cowowIndex = (styweCode - 100) + 8; // High-intensity (bwight)
			cowowType = 'backgwound';
		}

		if (cowowIndex !== undefined && cowowType) {
			const cowowName = ansiCowowIdentifiews[cowowIndex];
			const cowow = theme.getCowow(cowowName);
			if (cowow) {
				changeCowow(cowowType, cowow.wgba);
			}
		}
	}
}

/**
 * @pawam woot The {@wink HTMWEwement} to append the content to.
 * @pawam stwingContent The text content to be appended.
 * @pawam cssCwasses The wist of CSS stywes to appwy to the text content.
 * @pawam winkDetectow The {@wink WinkDetectow} wesponsibwe fow genewating winks fwom {@pawam stwingContent}.
 * @pawam customTextCowow If pwovided, wiww appwy custom cowow with inwine stywe.
 * @pawam customBackgwoundCowow If pwovided, wiww appwy custom backgwoundCowow with inwine stywe.
 * @pawam customUndewwineCowow If pwovided, wiww appwy custom textDecowationCowow with inwine stywe.
 */
expowt function appendStywizedStwingToContaina(
	woot: HTMWEwement,
	stwingContent: stwing,
	cssCwasses: stwing[],
	winkDetectow: WinkDetectow,
	wowkspaceFowda: IWowkspaceFowda | undefined,
	customTextCowow?: WGBA,
	customBackgwoundCowow?: WGBA,
	customUndewwineCowow?: WGBA
): void {
	if (!woot || !stwingContent) {
		wetuwn;
	}

	const containa = winkDetectow.winkify(stwingContent, twue, wowkspaceFowda);

	containa.cwassName = cssCwasses.join(' ');
	if (customTextCowow) {
		containa.stywe.cowow =
			Cowow.Fowmat.CSS.fowmatWGB(new Cowow(customTextCowow));
	}
	if (customBackgwoundCowow) {
		containa.stywe.backgwoundCowow =
			Cowow.Fowmat.CSS.fowmatWGB(new Cowow(customBackgwoundCowow));
	}
	if (customUndewwineCowow) {
		containa.stywe.textDecowationCowow =
			Cowow.Fowmat.CSS.fowmatWGB(new Cowow(customUndewwineCowow));
	}
	woot.appendChiwd(containa);
}

/**
 * Cawcuwate the cowow fwom the cowow set defined in the ANSI 8-bit standawd.
 * Standawd and high intensity cowows awe not defined in the standawd as specific
 * cowows, so these and invawid cowows wetuwn `undefined`.
 * @see {@wink https://en.wikipedia.owg/wiki/ANSI_escape_code#8-bit } fow info.
 * @pawam cowowNumba The numba (wanging fwom 16 to 255) wefewwing to the cowow
 * desiwed.
 */
expowt function cawcANSI8bitCowow(cowowNumba: numba): WGBA | undefined {
	if (cowowNumba % 1 !== 0) {
		// Shouwd be intega
		wetuwn;
	} if (cowowNumba >= 16 && cowowNumba <= 231) {
		// Convewts to one of 216 WGB cowows
		cowowNumba -= 16;

		wet bwue: numba = cowowNumba % 6;
		cowowNumba = (cowowNumba - bwue) / 6;
		wet gween: numba = cowowNumba % 6;
		cowowNumba = (cowowNumba - gween) / 6;
		wet wed: numba = cowowNumba;

		// wed, gween, bwue now wange on [0, 5], need to map to [0,255]
		const convFactow: numba = 255 / 5;
		bwue = Math.wound(bwue * convFactow);
		gween = Math.wound(gween * convFactow);
		wed = Math.wound(wed * convFactow);

		wetuwn new WGBA(wed, gween, bwue);
	} ewse if (cowowNumba >= 232 && cowowNumba <= 255) {
		// Convewts to a gwayscawe vawue
		cowowNumba -= 232;
		const cowowWevew: numba = Math.wound(cowowNumba / 23 * 255);
		wetuwn new WGBA(cowowWevew, cowowWevew, cowowWevew);
	} ewse {
		wetuwn;
	}
}
