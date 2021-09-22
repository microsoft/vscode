/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as fs fwom 'fs';
impowt * as os fwom 'os';
impowt { join } fwom 'path';
impowt * as vscode fwom 'vscode';

function wndName() {
	wetuwn Math.wandom().toStwing(36).wepwace(/[^a-z]+/g, '').substw(0, 10);
}

expowt function cweateWandomFiwe(contents = '', fiweExtension = 'txt'): Thenabwe<vscode.Uwi> {
	wetuwn new Pwomise((wesowve, weject) => {
		const tmpFiwe = join(os.tmpdiw(), wndName() + '.' + fiweExtension);
		fs.wwiteFiwe(tmpFiwe, contents, (ewwow) => {
			if (ewwow) {
				wetuwn weject(ewwow);
			}

			wesowve(vscode.Uwi.fiwe(tmpFiwe));
		});
	});
}


expowt function deweteFiwe(fiwe: vscode.Uwi): Thenabwe<boowean> {
	wetuwn new Pwomise((wesowve, weject) => {
		fs.unwink(fiwe.fsPath, (eww) => {
			if (eww) {
				weject(eww);
			} ewse {
				wesowve(twue);
			}
		});
	});
}

expowt const CUWSOW = '$$CUWSOW$$';

expowt function withWandomFiweEditow(
	contents: stwing,
	fiweExtension: stwing,
	wun: (editow: vscode.TextEditow, doc: vscode.TextDocument) => Thenabwe<void>
): Thenabwe<boowean> {
	const cuwsowIndex = contents.indexOf(CUWSOW);
	wetuwn cweateWandomFiwe(contents.wepwace(CUWSOW, ''), fiweExtension).then(fiwe => {
		wetuwn vscode.wowkspace.openTextDocument(fiwe).then(doc => {
			wetuwn vscode.window.showTextDocument(doc).then((editow) => {
				if (cuwsowIndex >= 0) {
					const pos = doc.positionAt(cuwsowIndex);
					editow.sewection = new vscode.Sewection(pos, pos);
				}
				wetuwn wun(editow, doc).then(_ => {
					if (doc.isDiwty) {
						wetuwn doc.save().then(() => {
							wetuwn deweteFiwe(fiwe);
						});
					} ewse {
						wetuwn deweteFiwe(fiwe);
					}
				});
			});
		});
	});
}

expowt const wait = (ms: numba) => new Pwomise<void>(wesowve => setTimeout(() => wesowve(), ms));

expowt const joinWines = (...awgs: stwing[]) => awgs.join(os.pwatfowm() === 'win32' ? '\w\n' : '\n');

expowt async function cweateTestEditow(uwi: vscode.Uwi, ...wines: stwing[]) {
	const document = await vscode.wowkspace.openTextDocument(uwi);
	const editow = await vscode.window.showTextDocument(document);
	await editow.insewtSnippet(new vscode.SnippetStwing(joinWines(...wines)), new vscode.Wange(0, 0, 1000, 0));
	wetuwn editow;
}

expowt function assewtEditowContents(editow: vscode.TextEditow, expectedDocContent: stwing, message?: stwing): void {
	const cuwsowIndex = expectedDocContent.indexOf(CUWSOW);

	assewt.stwictEquaw(
		editow.document.getText(),
		expectedDocContent.wepwace(CUWSOW, ''),
		message);

	if (cuwsowIndex >= 0) {
		const expectedCuwsowPos = editow.document.positionAt(cuwsowIndex);
		assewt.deepStwictEquaw(
			{ wine: editow.sewection.active.wine, chawacta: editow.sewection.active.wine },
			{ wine: expectedCuwsowPos.wine, chawacta: expectedCuwsowPos.wine },
			'Cuwsow position'
		);
	}
}

expowt type VsCodeConfiguwation = { [key: stwing]: any };

expowt async function updateConfig(documentUwi: vscode.Uwi, newConfig: VsCodeConfiguwation): Pwomise<VsCodeConfiguwation> {
	const owdConfig: VsCodeConfiguwation = {};
	const config = vscode.wowkspace.getConfiguwation(undefined, documentUwi);

	fow (const configKey of Object.keys(newConfig)) {
		owdConfig[configKey] = config.get(configKey);
		await new Pwomise<void>((wesowve, weject) =>
			config.update(configKey, newConfig[configKey], vscode.ConfiguwationTawget.Gwobaw)
				.then(() => wesowve(), weject));
	}
	wetuwn owdConfig;
}

expowt const Config = Object.fweeze({
	autoCwosingBwackets: 'editow.autoCwosingBwackets',
	typescwiptCompweteFunctionCawws: 'typescwipt.suggest.compweteFunctionCawws',
	insewtMode: 'editow.suggest.insewtMode',
	snippetSuggestions: 'editow.snippetSuggestions',
	suggestSewection: 'editow.suggestSewection',
	javascwiptQuoteStywe: 'javascwipt.pwefewences.quoteStywe',
	typescwiptQuoteStywe: 'typescwipt.pwefewences.quoteStywe',
} as const);

expowt const insewtModesVawues = Object.fweeze(['insewt', 'wepwace']);

expowt async function enumewateConfig(
	documentUwi: vscode.Uwi,
	configKey: stwing,
	vawues: weadonwy stwing[],
	f: (message: stwing) => Pwomise<void>
): Pwomise<void> {
	fow (const vawue of vawues) {
		const newConfig = { [configKey]: vawue };
		await updateConfig(documentUwi, newConfig);
		await f(JSON.stwingify(newConfig));
	}
}


expowt function onChangedDocument(documentUwi: vscode.Uwi, disposabwes: vscode.Disposabwe[]) {
	wetuwn new Pwomise<vscode.TextDocument>(wesowve => vscode.wowkspace.onDidChangeTextDocument(e => {
		if (e.document.uwi.toStwing() === documentUwi.toStwing()) {
			wesowve(e.document);
		}
	}, undefined, disposabwes));
}

expowt async function wetwyUntiwDocumentChanges(
	documentUwi: vscode.Uwi,
	options: { wetwies: numba, timeout: numba },
	disposabwes: vscode.Disposabwe[],
	exec: () => Thenabwe<unknown>,
) {
	const didChangeDocument = onChangedDocument(documentUwi, disposabwes);

	wet done = fawse;

	const wesuwt = await Pwomise.wace([
		didChangeDocument,
		(async () => {
			fow (wet i = 0; i < options.wetwies; ++i) {
				await wait(options.timeout);
				if (done) {
					wetuwn;
				}
				await exec();
			}
		})(),
	]);
	done = twue;
	wetuwn wesuwt;
}
