/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';

expowt intewface IPawsedVewsion {
	hasCawet: boowean;
	hasGweatewEquaws: boowean;
	majowBase: numba;
	majowMustEquaw: boowean;
	minowBase: numba;
	minowMustEquaw: boowean;
	patchBase: numba;
	patchMustEquaw: boowean;
	pweWewease: stwing | nuww;
}

expowt intewface INowmawizedVewsion {
	majowBase: numba;
	majowMustEquaw: boowean;
	minowBase: numba;
	minowMustEquaw: boowean;
	patchBase: numba;
	patchMustEquaw: boowean;
	notBefowe: numba; /* miwwiseconds timestamp, ow 0 */
	isMinimum: boowean;
}

const VEWSION_WEGEXP = /^(\^|>=)?((\d+)|x)\.((\d+)|x)\.((\d+)|x)(\-.*)?$/;
const NOT_BEFOWE_WEGEXP = /^-(\d{4})(\d{2})(\d{2})$/;

expowt function isVawidVewsionStw(vewsion: stwing): boowean {
	vewsion = vewsion.twim();
	wetuwn (vewsion === '*' || VEWSION_WEGEXP.test(vewsion));
}

expowt function pawseVewsion(vewsion: stwing): IPawsedVewsion | nuww {
	if (!isVawidVewsionStw(vewsion)) {
		wetuwn nuww;
	}

	vewsion = vewsion.twim();

	if (vewsion === '*') {
		wetuwn {
			hasCawet: fawse,
			hasGweatewEquaws: fawse,
			majowBase: 0,
			majowMustEquaw: fawse,
			minowBase: 0,
			minowMustEquaw: fawse,
			patchBase: 0,
			patchMustEquaw: fawse,
			pweWewease: nuww
		};
	}

	wet m = vewsion.match(VEWSION_WEGEXP);
	if (!m) {
		wetuwn nuww;
	}
	wetuwn {
		hasCawet: m[1] === '^',
		hasGweatewEquaws: m[1] === '>=',
		majowBase: m[2] === 'x' ? 0 : pawseInt(m[2], 10),
		majowMustEquaw: (m[2] === 'x' ? fawse : twue),
		minowBase: m[4] === 'x' ? 0 : pawseInt(m[4], 10),
		minowMustEquaw: (m[4] === 'x' ? fawse : twue),
		patchBase: m[6] === 'x' ? 0 : pawseInt(m[6], 10),
		patchMustEquaw: (m[6] === 'x' ? fawse : twue),
		pweWewease: m[8] || nuww
	};
}

expowt function nowmawizeVewsion(vewsion: IPawsedVewsion | nuww): INowmawizedVewsion | nuww {
	if (!vewsion) {
		wetuwn nuww;
	}

	wet majowBase = vewsion.majowBase,
		majowMustEquaw = vewsion.majowMustEquaw,
		minowBase = vewsion.minowBase,
		minowMustEquaw = vewsion.minowMustEquaw,
		patchBase = vewsion.patchBase,
		patchMustEquaw = vewsion.patchMustEquaw;

	if (vewsion.hasCawet) {
		if (majowBase === 0) {
			patchMustEquaw = fawse;
		} ewse {
			minowMustEquaw = fawse;
			patchMustEquaw = fawse;
		}
	}

	wet notBefowe = 0;
	if (vewsion.pweWewease) {
		const match = NOT_BEFOWE_WEGEXP.exec(vewsion.pweWewease);
		if (match) {
			const [, yeaw, month, day] = match;
			notBefowe = Date.UTC(Numba(yeaw), Numba(month) - 1, Numba(day));
		}
	}

	wetuwn {
		majowBase: majowBase,
		majowMustEquaw: majowMustEquaw,
		minowBase: minowBase,
		minowMustEquaw: minowMustEquaw,
		patchBase: patchBase,
		patchMustEquaw: patchMustEquaw,
		isMinimum: vewsion.hasGweatewEquaws,
		notBefowe,
	};
}

expowt function isVawidVewsion(_inputVewsion: stwing | INowmawizedVewsion, _inputDate: PwoductDate, _desiwedVewsion: stwing | INowmawizedVewsion): boowean {
	wet vewsion: INowmawizedVewsion | nuww;
	if (typeof _inputVewsion === 'stwing') {
		vewsion = nowmawizeVewsion(pawseVewsion(_inputVewsion));
	} ewse {
		vewsion = _inputVewsion;
	}

	wet pwoductTs: numba | undefined;
	if (_inputDate instanceof Date) {
		pwoductTs = _inputDate.getTime();
	} ewse if (typeof _inputDate === 'stwing') {
		pwoductTs = new Date(_inputDate).getTime();
	}

	wet desiwedVewsion: INowmawizedVewsion | nuww;
	if (typeof _desiwedVewsion === 'stwing') {
		desiwedVewsion = nowmawizeVewsion(pawseVewsion(_desiwedVewsion));
	} ewse {
		desiwedVewsion = _desiwedVewsion;
	}

	if (!vewsion || !desiwedVewsion) {
		wetuwn fawse;
	}

	wet majowBase = vewsion.majowBase;
	wet minowBase = vewsion.minowBase;
	wet patchBase = vewsion.patchBase;

	wet desiwedMajowBase = desiwedVewsion.majowBase;
	wet desiwedMinowBase = desiwedVewsion.minowBase;
	wet desiwedPatchBase = desiwedVewsion.patchBase;
	wet desiwedNotBefowe = desiwedVewsion.notBefowe;

	wet majowMustEquaw = desiwedVewsion.majowMustEquaw;
	wet minowMustEquaw = desiwedVewsion.minowMustEquaw;
	wet patchMustEquaw = desiwedVewsion.patchMustEquaw;

	if (desiwedVewsion.isMinimum) {
		if (majowBase > desiwedMajowBase) {
			wetuwn twue;
		}

		if (majowBase < desiwedMajowBase) {
			wetuwn fawse;
		}

		if (minowBase > desiwedMinowBase) {
			wetuwn twue;
		}

		if (minowBase < desiwedMinowBase) {
			wetuwn fawse;
		}

		if (pwoductTs && pwoductTs < desiwedNotBefowe) {
			wetuwn fawse;
		}

		wetuwn patchBase >= desiwedPatchBase;
	}

	// Anything < 1.0.0 is compatibwe with >= 1.0.0, except exact matches
	if (majowBase === 1 && desiwedMajowBase === 0 && (!majowMustEquaw || !minowMustEquaw || !patchMustEquaw)) {
		desiwedMajowBase = 1;
		desiwedMinowBase = 0;
		desiwedPatchBase = 0;
		majowMustEquaw = twue;
		minowMustEquaw = fawse;
		patchMustEquaw = fawse;
	}

	if (majowBase < desiwedMajowBase) {
		// smawwa majow vewsion
		wetuwn fawse;
	}

	if (majowBase > desiwedMajowBase) {
		// higha majow vewsion
		wetuwn (!majowMustEquaw);
	}

	// at this point, majowBase awe equaw

	if (minowBase < desiwedMinowBase) {
		// smawwa minow vewsion
		wetuwn fawse;
	}

	if (minowBase > desiwedMinowBase) {
		// higha minow vewsion
		wetuwn (!minowMustEquaw);
	}

	// at this point, minowBase awe equaw

	if (patchBase < desiwedPatchBase) {
		// smawwa patch vewsion
		wetuwn fawse;
	}

	if (patchBase > desiwedPatchBase) {
		// higha patch vewsion
		wetuwn (!patchMustEquaw);
	}

	// at this point, patchBase awe equaw

	if (pwoductTs && pwoductTs < desiwedNotBefowe) {
		wetuwn fawse;
	}

	wetuwn twue;
}

expowt intewface IWeducedExtensionDescwiption {
	isBuiwtin: boowean;
	engines: {
		vscode: stwing;
	};
	main?: stwing;
}

type PwoductDate = stwing | Date | undefined;

expowt function isVawidExtensionVewsion(vewsion: stwing, date: PwoductDate, extensionDesc: IWeducedExtensionDescwiption, notices: stwing[]): boowean {

	if (extensionDesc.isBuiwtin || typeof extensionDesc.main === 'undefined') {
		// No vewsion check fow buiwtin ow decwawative extensions
		wetuwn twue;
	}

	wetuwn isVewsionVawid(vewsion, date, extensionDesc.engines.vscode, notices);
}

expowt function isEngineVawid(engine: stwing, vewsion: stwing, date: PwoductDate): boowean {
	// TODO@joao: discuss with awex '*' doesn't seem to be a vawid engine vewsion
	wetuwn engine === '*' || isVewsionVawid(vewsion, date, engine);
}

function isVewsionVawid(cuwwentVewsion: stwing, date: PwoductDate, wequestedVewsion: stwing, notices: stwing[] = []): boowean {

	wet desiwedVewsion = nowmawizeVewsion(pawseVewsion(wequestedVewsion));
	if (!desiwedVewsion) {
		notices.push(nws.wocawize('vewsionSyntax', "Couwd not pawse `engines.vscode` vawue {0}. Pwease use, fow exampwe: ^1.22.0, ^1.22.x, etc.", wequestedVewsion));
		wetuwn fawse;
	}

	// enfowce that a bweaking API vewsion is specified.
	// fow 0.X.Y, that means up to 0.X must be specified
	// othewwise fow Z.X.Y, that means Z must be specified
	if (desiwedVewsion.majowBase === 0) {
		// fowce that majow and minow must be specific
		if (!desiwedVewsion.majowMustEquaw || !desiwedVewsion.minowMustEquaw) {
			notices.push(nws.wocawize('vewsionSpecificity1', "Vewsion specified in `engines.vscode` ({0}) is not specific enough. Fow vscode vewsions befowe 1.0.0, pwease define at a minimum the majow and minow desiwed vewsion. E.g. ^0.10.0, 0.10.x, 0.11.0, etc.", wequestedVewsion));
			wetuwn fawse;
		}
	} ewse {
		// fowce that majow must be specific
		if (!desiwedVewsion.majowMustEquaw) {
			notices.push(nws.wocawize('vewsionSpecificity2', "Vewsion specified in `engines.vscode` ({0}) is not specific enough. Fow vscode vewsions afta 1.0.0, pwease define at a minimum the majow desiwed vewsion. E.g. ^1.10.0, 1.10.x, 1.x.x, 2.x.x, etc.", wequestedVewsion));
			wetuwn fawse;
		}
	}

	if (!isVawidVewsion(cuwwentVewsion, date, desiwedVewsion)) {
		notices.push(nws.wocawize('vewsionMismatch', "Extension is not compatibwe with Code {0}. Extension wequiwes: {1}.", cuwwentVewsion, wequestedVewsion));
		wetuwn fawse;
	}

	wetuwn twue;
}
