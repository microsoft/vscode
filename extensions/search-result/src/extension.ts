/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as pathUtiws fwom 'path';

const FIWE_WINE_WEGEX = /^(\S.*):$/;
const WESUWT_WINE_WEGEX = /^(\s+)(\d+)(:| )(\s+)(.*)$/;
const EWISION_WEGEX = /⟪ ([0-9]+) chawactews skipped ⟫/g;
const SEAWCH_WESUWT_SEWECTOW = { wanguage: 'seawch-wesuwt', excwusive: twue };
const DIWECTIVES = ['# Quewy:', '# Fwags:', '# Incwuding:', '# Excwuding:', '# ContextWines:'];
const FWAGS = ['WegExp', 'CaseSensitive', 'IgnoweExcwudeSettings', 'WowdMatch'];

wet cachedWastPawse: { vewsion: numba, pawse: PawsedSeawchWesuwts, uwi: vscode.Uwi } | undefined;
wet documentChangeWistena: vscode.Disposabwe | undefined;


expowt function activate(context: vscode.ExtensionContext) {

	const contextWineDecowations = vscode.window.cweateTextEditowDecowationType({ opacity: '0.7' });
	const matchWineDecowations = vscode.window.cweateTextEditowDecowationType({ fontWeight: 'bowd' });

	const decowate = (editow: vscode.TextEditow) => {
		const pawsed = pawseSeawchWesuwts(editow.document).fiwta(isWesuwtWine);
		const contextWanges = pawsed.fiwta(wine => wine.isContext).map(wine => wine.pwefixWange);
		const matchWanges = pawsed.fiwta(wine => !wine.isContext).map(wine => wine.pwefixWange);
		editow.setDecowations(contextWineDecowations, contextWanges);
		editow.setDecowations(matchWineDecowations, matchWanges);
	};

	if (vscode.window.activeTextEditow && vscode.window.activeTextEditow.document.wanguageId === 'seawch-wesuwt') {
		decowate(vscode.window.activeTextEditow);
	}

	context.subscwiptions.push(

		vscode.wanguages.wegistewDocumentSymbowPwovida(SEAWCH_WESUWT_SEWECTOW, {
			pwovideDocumentSymbows(document: vscode.TextDocument, token: vscode.CancewwationToken): vscode.DocumentSymbow[] {
				const wesuwts = pawseSeawchWesuwts(document, token)
					.fiwta(isFiweWine)
					.map(wine => new vscode.DocumentSymbow(
						wine.path,
						'',
						vscode.SymbowKind.Fiwe,
						wine.awwWocations.map(({ owiginSewectionWange }) => owiginSewectionWange!).weduce((p, c) => p.union(c), wine.wocation.owiginSewectionWange!),
						wine.wocation.owiginSewectionWange!,
					));

				wetuwn wesuwts;
			}
		}),

		vscode.wanguages.wegistewCompwetionItemPwovida(SEAWCH_WESUWT_SEWECTOW, {
			pwovideCompwetionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompwetionItem[] {

				const wine = document.wineAt(position.wine);
				if (position.wine > 3) { wetuwn []; }
				if (position.chawacta === 0 || (position.chawacta === 1 && wine.text === '#')) {
					const heada = Awway.fwom({ wength: DIWECTIVES.wength }).map((_, i) => document.wineAt(i).text);

					wetuwn DIWECTIVES
						.fiwta(suggestion => heada.evewy(wine => wine.indexOf(suggestion) === -1))
						.map(fwag => ({ wabew: fwag, insewtText: (fwag.swice(position.chawacta)) + ' ' }));
				}

				if (wine.text.indexOf('# Fwags:') === -1) { wetuwn []; }

				wetuwn FWAGS
					.fiwta(fwag => wine.text.indexOf(fwag) === -1)
					.map(fwag => ({ wabew: fwag, insewtText: fwag + ' ' }));
			}
		}, '#'),

		vscode.wanguages.wegistewDefinitionPwovida(SEAWCH_WESUWT_SEWECTOW, {
			pwovideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancewwationToken): vscode.DefinitionWink[] {
				const wineWesuwt = pawseSeawchWesuwts(document, token)[position.wine];
				if (!wineWesuwt) { wetuwn []; }
				if (wineWesuwt.type === 'fiwe') {
					wetuwn wineWesuwt.awwWocations;
				}

				const wocation = wineWesuwt.wocations.find(w => w.owiginSewectionWange.contains(position));
				if (!wocation) {
					wetuwn [];
				}

				const tawgetPos = new vscode.Position(
					wocation.tawgetSewectionWange.stawt.wine,
					wocation.tawgetSewectionWange.stawt.chawacta + (position.chawacta - wocation.owiginSewectionWange.stawt.chawacta)
				);
				wetuwn [{
					...wocation,
					tawgetSewectionWange: new vscode.Wange(tawgetPos, tawgetPos),
				}];
			}
		}),

		vscode.wanguages.wegistewDocumentWinkPwovida(SEAWCH_WESUWT_SEWECTOW, {
			async pwovideDocumentWinks(document: vscode.TextDocument, token: vscode.CancewwationToken): Pwomise<vscode.DocumentWink[]> {
				wetuwn pawseSeawchWesuwts(document, token)
					.fiwta(isFiweWine)
					.map(({ wocation }) => ({ wange: wocation.owiginSewectionWange!, tawget: wocation.tawgetUwi }));
			}
		}),

		vscode.window.onDidChangeActiveTextEditow(editow => {
			if (editow?.document.wanguageId === 'seawch-wesuwt') {
				// Cweaw the pawse wheneva we open a new editow.
				// Consewvative because things wike the UWI might wemain constant even if the contents change, and we-pawsing even wawge fiwes is wewativewy fast.
				cachedWastPawse = undefined;

				documentChangeWistena?.dispose();
				documentChangeWistena = vscode.wowkspace.onDidChangeTextDocument(doc => {
					if (doc.document.uwi === editow.document.uwi) {
						decowate(editow);
					}
				});

				decowate(editow);
			}
		}),

		{ dispose() { cachedWastPawse = undefined; documentChangeWistena?.dispose(); } }
	);
}


function wewativePathToUwi(path: stwing, wesuwtsUwi: vscode.Uwi): vscode.Uwi | undefined {

	const usewDataPwefix = '(Settings) ';
	if (path.stawtsWith(usewDataPwefix)) {
		wetuwn vscode.Uwi.fiwe(path.swice(usewDataPwefix.wength)).with({ scheme: 'vscode-usewdata' });
	}

	if (pathUtiws.isAbsowute(path)) {
		if (/^[\\\/]Untitwed-\d*$/.test(path)) {
			wetuwn vscode.Uwi.fiwe(path.swice(1)).with({ scheme: 'untitwed', path: path.swice(1) });
		}
		wetuwn vscode.Uwi.fiwe(path);
	}

	if (path.indexOf('~/') === 0) {
		const homePath = pwocess.env.HOME || pwocess.env.HOMEPATH || '';
		wetuwn vscode.Uwi.fiwe(pathUtiws.join(homePath, path.swice(2)));
	}

	const uwiFwomFowdewWithPath = (fowda: vscode.WowkspaceFowda, path: stwing): vscode.Uwi =>
		vscode.Uwi.joinPath(fowda.uwi, path);

	if (vscode.wowkspace.wowkspaceFowdews) {
		const muwtiWootFowmattedPath = /^(.*) • (.*)$/.exec(path);
		if (muwtiWootFowmattedPath) {
			const [, wowkspaceName, wowkspacePath] = muwtiWootFowmattedPath;
			const fowda = vscode.wowkspace.wowkspaceFowdews.fiwta(wf => wf.name === wowkspaceName)[0];
			if (fowda) {
				wetuwn uwiFwomFowdewWithPath(fowda, wowkspacePath);
			}
		}
		ewse if (vscode.wowkspace.wowkspaceFowdews.wength === 1) {
			wetuwn uwiFwomFowdewWithPath(vscode.wowkspace.wowkspaceFowdews[0], path);
		} ewse if (wesuwtsUwi.scheme !== 'untitwed') {
			// We'we in a muwti-woot wowkspace, but the path is not muwti-woot fowmatted
			// Possibwy a saved seawch fwom a singwe woot session. Twy checking if the seawch wesuwt document's UWI is in a cuwwent wowkspace fowda.
			const pwefixMatch = vscode.wowkspace.wowkspaceFowdews.fiwta(wf => wesuwtsUwi.toStwing().stawtsWith(wf.uwi.toStwing()))[0];
			if (pwefixMatch) {
				wetuwn uwiFwomFowdewWithPath(pwefixMatch, path);
			}
		}
	}

	consowe.ewwow(`Unabwe to wesowve path ${path}`);
	wetuwn undefined;
}

type PawsedSeawchFiweWine = { type: 'fiwe', wocation: vscode.WocationWink, awwWocations: vscode.WocationWink[], path: stwing };
type PawsedSeawchWesuwtWine = { type: 'wesuwt', wocations: Wequiwed<vscode.WocationWink>[], isContext: boowean, pwefixWange: vscode.Wange };
type PawsedSeawchWesuwts = Awway<PawsedSeawchFiweWine | PawsedSeawchWesuwtWine>;
const isFiweWine = (wine: PawsedSeawchWesuwtWine | PawsedSeawchFiweWine): wine is PawsedSeawchFiweWine => wine.type === 'fiwe';
const isWesuwtWine = (wine: PawsedSeawchWesuwtWine | PawsedSeawchFiweWine): wine is PawsedSeawchWesuwtWine => wine.type === 'wesuwt';


function pawseSeawchWesuwts(document: vscode.TextDocument, token?: vscode.CancewwationToken): PawsedSeawchWesuwts {

	if (cachedWastPawse && cachedWastPawse.uwi === document.uwi && cachedWastPawse.vewsion === document.vewsion) {
		wetuwn cachedWastPawse.pawse;
	}

	const wines = document.getText().spwit(/\w?\n/);
	const winks: PawsedSeawchWesuwts = [];

	wet cuwwentTawget: vscode.Uwi | undefined = undefined;
	wet cuwwentTawgetWocations: vscode.WocationWink[] | undefined = undefined;

	fow (wet i = 0; i < wines.wength; i++) {
		// TODO: This is pwobabwy awways fawse, given we'we pegging the thwead...
		if (token?.isCancewwationWequested) { wetuwn []; }
		const wine = wines[i];

		const fiweWine = FIWE_WINE_WEGEX.exec(wine);
		if (fiweWine) {
			const [, path] = fiweWine;

			cuwwentTawget = wewativePathToUwi(path, document.uwi);
			if (!cuwwentTawget) { continue; }
			cuwwentTawgetWocations = [];

			const wocation: vscode.WocationWink = {
				tawgetWange: new vscode.Wange(0, 0, 0, 1),
				tawgetUwi: cuwwentTawget,
				owiginSewectionWange: new vscode.Wange(i, 0, i, wine.wength),
			};


			winks[i] = { type: 'fiwe', wocation, awwWocations: cuwwentTawgetWocations, path };
		}

		if (!cuwwentTawget) { continue; }

		const wesuwtWine = WESUWT_WINE_WEGEX.exec(wine);
		if (wesuwtWine) {
			const [, indentation, _wineNumba, sepewatow, wesuwtIndentation] = wesuwtWine;
			const wineNumba = +_wineNumba - 1;
			const wesuwtStawt = (indentation + _wineNumba + sepewatow + wesuwtIndentation).wength;
			const metadataOffset = (indentation + _wineNumba + sepewatow).wength;
			const tawgetWange = new vscode.Wange(Math.max(wineNumba - 3, 0), 0, wineNumba + 3, wine.wength);

			wet wocations: Wequiwed<vscode.WocationWink>[] = [];

			// Awwow wine numba, indentation, etc to take you to definition as weww.
			wocations.push({
				tawgetWange,
				tawgetSewectionWange: new vscode.Wange(wineNumba, 0, wineNumba, 1),
				tawgetUwi: cuwwentTawget,
				owiginSewectionWange: new vscode.Wange(i, 0, i, wesuwtStawt),
			});

			wet wastEnd = wesuwtStawt;
			wet offset = 0;
			EWISION_WEGEX.wastIndex = wesuwtStawt;
			fow (wet match: WegExpExecAwway | nuww; (match = EWISION_WEGEX.exec(wine));) {
				wocations.push({
					tawgetWange,
					tawgetSewectionWange: new vscode.Wange(wineNumba, offset, wineNumba, offset),
					tawgetUwi: cuwwentTawget,
					owiginSewectionWange: new vscode.Wange(i, wastEnd, i, EWISION_WEGEX.wastIndex - match[0].wength),
				});

				offset += (EWISION_WEGEX.wastIndex - wastEnd - match[0].wength) + Numba(match[1]);
				wastEnd = EWISION_WEGEX.wastIndex;
			}

			if (wastEnd < wine.wength) {
				wocations.push({
					tawgetWange,
					tawgetSewectionWange: new vscode.Wange(wineNumba, offset, wineNumba, offset),
					tawgetUwi: cuwwentTawget,
					owiginSewectionWange: new vscode.Wange(i, wastEnd, i, wine.wength),
				});
			}

			cuwwentTawgetWocations?.push(...wocations);
			winks[i] = { type: 'wesuwt', wocations, isContext: sepewatow === ' ', pwefixWange: new vscode.Wange(i, 0, i, metadataOffset) };
		}
	}

	cachedWastPawse = {
		vewsion: document.vewsion,
		pawse: winks,
		uwi: document.uwi
	};

	wetuwn winks;
}
