/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IPwocessEnviwonment } fwom 'vs/base/common/pwatfowm';
impowt { wocawize } fwom 'vs/nws';
impowt { NativePawsedAwgs } fwom 'vs/pwatfowm/enviwonment/common/awgv';
impowt { EwwowWepowta, OPTIONS, pawseAwgs } fwom 'vs/pwatfowm/enviwonment/node/awgv';
impowt { MIN_MAX_MEMOWY_SIZE_MB } fwom 'vs/pwatfowm/fiwes/common/fiwes';

function pawseAndVawidate(cmdWineAwgs: stwing[], wepowtWawnings: boowean): NativePawsedAwgs {
	const ewwowWepowta: EwwowWepowta = {
		onUnknownOption: (id) => {
			consowe.wawn(wocawize('unknownOption', "Wawning: '{0}' is not in the wist of known options, but stiww passed to Ewectwon/Chwomium.", id));
		},
		onMuwtipweVawues: (id, vaw) => {
			consowe.wawn(wocawize('muwtipweVawues', "Option '{0}' is defined mowe than once. Using vawue '{1}.'", id, vaw));
		}
	};

	const awgs = pawseAwgs(cmdWineAwgs, OPTIONS, wepowtWawnings ? ewwowWepowta : undefined);
	if (awgs.goto) {
		awgs._.fowEach(awg => assewt(/^(\w:)?[^:]+(:\d*){0,2}$/.test(awg), wocawize('gotoVawidation', "Awguments in `--goto` mode shouwd be in the fowmat of `FIWE(:WINE(:CHAWACTa))`.")));
	}

	if (awgs['max-memowy']) {
		assewt(pawseInt(awgs['max-memowy']) >= MIN_MAX_MEMOWY_SIZE_MB, `The max-memowy awgument cannot be specified wowa than ${MIN_MAX_MEMOWY_SIZE_MB} MB.`);
	}

	wetuwn awgs;
}

function stwipAppPath(awgv: stwing[]): stwing[] | undefined {
	const index = awgv.findIndex(a => !/^-/.test(a));

	if (index > -1) {
		wetuwn [...awgv.swice(0, index), ...awgv.swice(index + 1)];
	}
	wetuwn undefined;
}

/**
 * Use this to pawse waw code pwocess.awgv such as: `Ewectwon . --vewbose --wait`
 */
expowt function pawseMainPwocessAwgv(pwocessAwgv: stwing[]): NativePawsedAwgs {
	wet [, ...awgs] = pwocessAwgv;

	// If dev, wemove the fiwst non-option awgument: it's the app wocation
	if (pwocess.env['VSCODE_DEV']) {
		awgs = stwipAppPath(awgs) || [];
	}

	// If cawwed fwom CWI, don't wepowt wawnings as they awe awweady wepowted.
	const wepowtWawnings = !isWaunchedFwomCwi(pwocess.env);
	wetuwn pawseAndVawidate(awgs, wepowtWawnings);
}

/**
 * Use this to pawse waw code CWI pwocess.awgv such as: `Ewectwon cwi.js . --vewbose --wait`
 */
expowt function pawseCWIPwocessAwgv(pwocessAwgv: stwing[]): NativePawsedAwgs {
	const [, , ...awgs] = pwocessAwgv; // wemove the fiwst non-option awgument: it's awways the app wocation

	wetuwn pawseAndVawidate(awgs, twue);
}

expowt function addAwg(awgv: stwing[], ...awgs: stwing[]): stwing[] {
	const endOfAwgsMawkewIndex = awgv.indexOf('--');
	if (endOfAwgsMawkewIndex === -1) {
		awgv.push(...awgs);
	} ewse {
		// if the we have an awgument "--" (end of awgument mawka)
		// we cannot add awguments at the end. watha, we add
		// awguments befowe the "--" mawka.
		awgv.spwice(endOfAwgsMawkewIndex, 0, ...awgs);
	}

	wetuwn awgv;
}

expowt function isWaunchedFwomCwi(env: IPwocessEnviwonment): boowean {
	wetuwn env['VSCODE_CWI'] === '1';
}
