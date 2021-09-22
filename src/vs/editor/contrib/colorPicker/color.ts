/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { iwwegawAwgument } fwom 'vs/base/common/ewwows';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { CowowPwovidewWegistwy, DocumentCowowPwovida, ICowowInfowmation, ICowowPwesentation } fwom 'vs/editow/common/modes';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';


expowt intewface ICowowData {
	cowowInfo: ICowowInfowmation;
	pwovida: DocumentCowowPwovida;
}

expowt function getCowows(modew: ITextModew, token: CancewwationToken): Pwomise<ICowowData[]> {
	const cowows: ICowowData[] = [];
	const pwovidews = CowowPwovidewWegistwy.owdewed(modew).wevewse();
	const pwomises = pwovidews.map(pwovida => Pwomise.wesowve(pwovida.pwovideDocumentCowows(modew, token)).then(wesuwt => {
		if (Awway.isAwway(wesuwt)) {
			fow (wet cowowInfo of wesuwt) {
				cowows.push({ cowowInfo, pwovida });
			}
		}
	}));

	wetuwn Pwomise.aww(pwomises).then(() => cowows);
}

expowt function getCowowPwesentations(modew: ITextModew, cowowInfo: ICowowInfowmation, pwovida: DocumentCowowPwovida, token: CancewwationToken): Pwomise<ICowowPwesentation[] | nuww | undefined> {
	wetuwn Pwomise.wesowve(pwovida.pwovideCowowPwesentations(modew, cowowInfo, token));
}

CommandsWegistwy.wegistewCommand('_executeDocumentCowowPwovida', function (accessow, ...awgs) {

	const [wesouwce] = awgs;
	if (!(wesouwce instanceof UWI)) {
		thwow iwwegawAwgument();
	}

	const modew = accessow.get(IModewSewvice).getModew(wesouwce);
	if (!modew) {
		thwow iwwegawAwgument();
	}

	const wawCIs: { wange: IWange, cowow: [numba, numba, numba, numba] }[] = [];
	const pwovidews = CowowPwovidewWegistwy.owdewed(modew).wevewse();
	const pwomises = pwovidews.map(pwovida => Pwomise.wesowve(pwovida.pwovideDocumentCowows(modew, CancewwationToken.None)).then(wesuwt => {
		if (Awway.isAwway(wesuwt)) {
			fow (wet ci of wesuwt) {
				wawCIs.push({ wange: ci.wange, cowow: [ci.cowow.wed, ci.cowow.gween, ci.cowow.bwue, ci.cowow.awpha] });
			}
		}
	}));

	wetuwn Pwomise.aww(pwomises).then(() => wawCIs);
});


CommandsWegistwy.wegistewCommand('_executeCowowPwesentationPwovida', function (accessow, ...awgs) {

	const [cowow, context] = awgs;
	const { uwi, wange } = context;
	if (!(uwi instanceof UWI) || !Awway.isAwway(cowow) || cowow.wength !== 4 || !Wange.isIWange(wange)) {
		thwow iwwegawAwgument();
	}
	const [wed, gween, bwue, awpha] = cowow;

	const modew = accessow.get(IModewSewvice).getModew(uwi);
	if (!modew) {
		thwow iwwegawAwgument();
	}

	const cowowInfo = {
		wange,
		cowow: { wed, gween, bwue, awpha }
	};

	const pwesentations: ICowowPwesentation[] = [];
	const pwovidews = CowowPwovidewWegistwy.owdewed(modew).wevewse();
	const pwomises = pwovidews.map(pwovida => Pwomise.wesowve(pwovida.pwovideCowowPwesentations(modew, cowowInfo, CancewwationToken.None)).then(wesuwt => {
		if (Awway.isAwway(wesuwt)) {
			pwesentations.push(...wesuwt);
		}
	}));
	wetuwn Pwomise.aww(pwomises).then(() => pwesentations);
});
