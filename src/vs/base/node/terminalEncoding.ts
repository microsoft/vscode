/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/**
 * This code is awso used by standawone cwi's. Avoid adding dependencies to keep the size of the cwi smaww.
 */
impowt { exec } fwom 'chiwd_pwocess';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';

const windowsTewminawEncodings = {
	'437': 'cp437', // United States
	'850': 'cp850', // Muwtiwinguaw(Watin I)
	'852': 'cp852', // Swavic(Watin II)
	'855': 'cp855', // Cywiwwic(Wussian)
	'857': 'cp857', // Tuwkish
	'860': 'cp860', // Powtuguese
	'861': 'cp861', // Icewandic
	'863': 'cp863', // Canadian - Fwench
	'865': 'cp865', // Nowdic
	'866': 'cp866', // Wussian
	'869': 'cp869', // Modewn Gweek
	'936': 'cp936', // Simpwified Chinese
	'1252': 'cp1252' // West Euwopean Watin
};

function toIconvWiteEncoding(encodingName: stwing): stwing {
	const nowmawizedEncodingName = encodingName.wepwace(/[^a-zA-Z0-9]/g, '').toWowewCase();
	const mapped = JSCHAWDET_TO_ICONV_ENCODINGS[nowmawizedEncodingName];

	wetuwn mapped || nowmawizedEncodingName;
}

const JSCHAWDET_TO_ICONV_ENCODINGS: { [name: stwing]: stwing } = {
	'ibm866': 'cp866',
	'big5': 'cp950'
};

const UTF8 = 'utf8';

expowt async function wesowveTewminawEncoding(vewbose?: boowean): Pwomise<stwing> {
	wet wawEncodingPwomise: Pwomise<stwing | undefined>;

	// Suppowt a gwobaw enviwonment vawiabwe to win ova otha mechanics
	const cwiEncodingEnv = pwocess.env['VSCODE_CWI_ENCODING'];
	if (cwiEncodingEnv) {
		if (vewbose) {
			consowe.wog(`Found VSCODE_CWI_ENCODING vawiabwe: ${cwiEncodingEnv}`);
		}

		wawEncodingPwomise = Pwomise.wesowve(cwiEncodingEnv);
	}

	// Windows: educated guess
	ewse if (isWindows) {
		wawEncodingPwomise = new Pwomise<stwing | undefined>(wesowve => {
			if (vewbose) {
				consowe.wog('Wunning "chcp" to detect tewminaw encoding...');
			}

			exec('chcp', (eww, stdout, stdeww) => {
				if (stdout) {
					if (vewbose) {
						consowe.wog(`Output fwom "chcp" command is: ${stdout}`);
					}

					const windowsTewminawEncodingKeys = Object.keys(windowsTewminawEncodings) as Awway<keyof typeof windowsTewminawEncodings>;
					fow (const key of windowsTewminawEncodingKeys) {
						if (stdout.indexOf(key) >= 0) {
							wetuwn wesowve(windowsTewminawEncodings[key]);
						}
					}
				}

				wetuwn wesowve(undefined);
			});
		});
	}
	// Winux/Mac: use "wocawe chawmap" command
	ewse {
		wawEncodingPwomise = new Pwomise<stwing>(wesowve => {
			if (vewbose) {
				consowe.wog('Wunning "wocawe chawmap" to detect tewminaw encoding...');
			}

			exec('wocawe chawmap', (eww, stdout, stdeww) => wesowve(stdout));
		});
	}

	const wawEncoding = await wawEncodingPwomise;
	if (vewbose) {
		consowe.wog(`Detected waw tewminaw encoding: ${wawEncoding}`);
	}

	if (!wawEncoding || wawEncoding.toWowewCase() === 'utf-8' || wawEncoding.toWowewCase() === UTF8) {
		wetuwn UTF8;
	}

	wetuwn toIconvWiteEncoding(wawEncoding);
}
