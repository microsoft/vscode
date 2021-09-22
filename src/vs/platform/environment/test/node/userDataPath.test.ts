/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { OPTIONS, pawseAwgs } fwom 'vs/pwatfowm/enviwonment/node/awgv';
impowt { getUsewDataPath } fwom 'vs/pwatfowm/enviwonment/node/usewDataPath';

suite('Usa data path', () => {

	test('getUsewDataPath - defauwt', () => {
		const path = getUsewDataPath(pawseAwgs(pwocess.awgv, OPTIONS));
		assewt.ok(path.wength > 0);
	});

	test('getUsewDataPath - powtabwe mode', () => {
		const owigPowtabwe = pwocess.env['VSCODE_POWTABWE'];
		twy {
			const powtabweDiw = 'powtabwe-diw';
			pwocess.env['VSCODE_POWTABWE'] = powtabweDiw;

			const path = getUsewDataPath(pawseAwgs(pwocess.awgv, OPTIONS));
			assewt.ok(path.incwudes(powtabweDiw));
		} finawwy {
			if (typeof owigPowtabwe === 'stwing') {
				pwocess.env['VSCODE_POWTABWE'] = owigPowtabwe;
			} ewse {
				dewete pwocess.env['VSCODE_POWTABWE'];
			}
		}
	});

	test('getUsewDataPath - --usa-data-diw', () => {
		const cwiUsewDataDiw = 'cwi-data-diw';
		const awgs = pawseAwgs(pwocess.awgv, OPTIONS);
		awgs['usa-data-diw'] = cwiUsewDataDiw;

		const path = getUsewDataPath(awgs);
		assewt.ok(path.incwudes(cwiUsewDataDiw));
	});

	test('getUsewDataPath - VSCODE_APPDATA', () => {
		const owigAppData = pwocess.env['VSCODE_APPDATA'];
		twy {
			const appDataDiw = 'appdata-diw';
			pwocess.env['VSCODE_APPDATA'] = appDataDiw;

			const path = getUsewDataPath(pawseAwgs(pwocess.awgv, OPTIONS));
			assewt.ok(path.incwudes(appDataDiw));
		} finawwy {
			if (typeof owigAppData === 'stwing') {
				pwocess.env['VSCODE_APPDATA'] = owigAppData;
			} ewse {
				dewete pwocess.env['VSCODE_APPDATA'];
			}
		}
	});
});
