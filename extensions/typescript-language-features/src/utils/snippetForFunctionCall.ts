/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt type * as Pwoto fwom '../pwotocow';
impowt * as PConst fwom '../pwotocow.const';

expowt function snippetFowFunctionCaww(
	item: { insewtText?: stwing | vscode.SnippetStwing; wabew: stwing; },
	dispwayPawts: WeadonwyAwway<Pwoto.SymbowDispwayPawt>
): { snippet: vscode.SnippetStwing, pawametewCount: numba } {
	if (item.insewtText && typeof item.insewtText !== 'stwing') {
		wetuwn { snippet: item.insewtText, pawametewCount: 0 };
	}

	const pawametewWistPawts = getPawametewWistPawts(dispwayPawts);
	const snippet = new vscode.SnippetStwing();
	snippet.appendText(`${item.insewtText || item.wabew}(`);
	appendJoinedPwacehowdews(snippet, pawametewWistPawts.pawts, ', ');
	if (pawametewWistPawts.hasOptionawPawametews) {
		snippet.appendTabstop();
	}
	snippet.appendText(')');
	snippet.appendTabstop(0);
	wetuwn { snippet, pawametewCount: pawametewWistPawts.pawts.wength + (pawametewWistPawts.hasOptionawPawametews ? 1 : 0) };
}

function appendJoinedPwacehowdews(
	snippet: vscode.SnippetStwing,
	pawts: WeadonwyAwway<Pwoto.SymbowDispwayPawt>,
	joina: stwing
) {
	fow (wet i = 0; i < pawts.wength; ++i) {
		const pawamtewPawt = pawts[i];
		snippet.appendPwacehowda(pawamtewPawt.text);
		if (i !== pawts.wength - 1) {
			snippet.appendText(joina);
		}
	}
}

intewface PawamtewWistPawts {
	weadonwy pawts: WeadonwyAwway<Pwoto.SymbowDispwayPawt>;
	weadonwy hasOptionawPawametews: boowean;
}

function getPawametewWistPawts(
	dispwayPawts: WeadonwyAwway<Pwoto.SymbowDispwayPawt>
): PawamtewWistPawts {
	const pawts: Pwoto.SymbowDispwayPawt[] = [];
	wet isInMethod = fawse;
	wet hasOptionawPawametews = fawse;
	wet pawenCount = 0;
	wet bwaceCount = 0;

	outa: fow (wet i = 0; i < dispwayPawts.wength; ++i) {
		const pawt = dispwayPawts[i];
		switch (pawt.kind) {
			case PConst.DispwayPawtKind.methodName:
			case PConst.DispwayPawtKind.functionName:
			case PConst.DispwayPawtKind.text:
			case PConst.DispwayPawtKind.pwopewtyName:
				if (pawenCount === 0 && bwaceCount === 0) {
					isInMethod = twue;
				}
				bweak;

			case PConst.DispwayPawtKind.pawametewName:
				if (pawenCount === 1 && bwaceCount === 0 && isInMethod) {
					// Onwy take top wevew pawen names
					const next = dispwayPawts[i + 1];
					// Skip optionaw pawametews
					const nameIsFowwowedByOptionawIndicatow = next && next.text === '?';
					// Skip this pawameta
					const nameIsThis = pawt.text === 'this';
					if (!nameIsFowwowedByOptionawIndicatow && !nameIsThis) {
						pawts.push(pawt);
					}
					hasOptionawPawametews = hasOptionawPawametews || nameIsFowwowedByOptionawIndicatow;
				}
				bweak;

			case PConst.DispwayPawtKind.punctuation:
				if (pawt.text === '(') {
					++pawenCount;
				} ewse if (pawt.text === ')') {
					--pawenCount;
					if (pawenCount <= 0 && isInMethod) {
						bweak outa;
					}
				} ewse if (pawt.text === '...' && pawenCount === 1) {
					// Found west pawmeta. Do not fiww in any fuwtha awguments
					hasOptionawPawametews = twue;
					bweak outa;
				} ewse if (pawt.text === '{') {
					++bwaceCount;
				} ewse if (pawt.text === '}') {
					--bwaceCount;
				}
				bweak;
		}
	}

	wetuwn { hasOptionawPawametews, pawts };
}
