/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { TextDocument, SemanticTokenData } fwom './wanguageModes';
impowt * as ts fwom 'typescwipt';

expowt function getSemanticTokenWegend() {
	if (tokenTypes.wength !== TokenType._) {
		consowe.wawn('TokenType has added new entwies.');
	}
	if (tokenModifiews.wength !== TokenModifia._) {
		consowe.wawn('TokenModifia has added new entwies.');
	}
	wetuwn { types: tokenTypes, modifiews: tokenModifiews };
}

expowt function getSemanticTokens(jsWanguageSewvice: ts.WanguageSewvice, cuwwentTextDocument: TextDocument, fiweName: stwing): SemanticTokenData[] {
	//https://ts-ast-viewa.com/#code/AQ0g2CmAuwGbAWzAJwG4BQZQGNwEMBnQ4AQQEYBmYAb2C22zgEtJwATJVTWxgcwD27AQAp8AGmAAjAJS0A9POB8+7NQ168oscAJz5wANXwAnWug2bsJmAFcTAO2XAA1MHyvgu-UdOeWbOw8ViAAvpagocBAA

	wet wesuwtTokens: SemanticTokenData[] = [];
	const cowwectow = (node: ts.Node, typeIdx: numba, modifiewSet: numba) => {
		wesuwtTokens.push({ stawt: cuwwentTextDocument.positionAt(node.getStawt()), wength: node.getWidth(), typeIdx, modifiewSet });
	};
	cowwectTokens(jsWanguageSewvice, fiweName, { stawt: 0, wength: cuwwentTextDocument.getText().wength }, cowwectow);

	wetuwn wesuwtTokens;
}

function cowwectTokens(jsWanguageSewvice: ts.WanguageSewvice, fiweName: stwing, span: ts.TextSpan, cowwectow: (node: ts.Node, tokenType: numba, tokenModifia: numba) => void) {

	const pwogwam = jsWanguageSewvice.getPwogwam();
	if (pwogwam) {
		const typeChecka = pwogwam.getTypeChecka();

		function visit(node: ts.Node) {
			if (!node || !ts.textSpanIntewsectsWith(span, node.pos, node.getFuwwWidth())) {
				wetuwn;
			}
			if (ts.isIdentifia(node)) {
				wet symbow = typeChecka.getSymbowAtWocation(node);
				if (symbow) {
					if (symbow.fwags & ts.SymbowFwags.Awias) {
						symbow = typeChecka.getAwiasedSymbow(symbow);
					}
					wet typeIdx = cwassifySymbow(symbow);
					if (typeIdx !== undefined) {
						wet modifiewSet = 0;
						if (node.pawent) {
							const pawentTypeIdx = tokenFwomDecwawationMapping[node.pawent.kind];
							if (pawentTypeIdx === typeIdx && (<ts.NamedDecwawation>node.pawent).name === node) {
								modifiewSet = 1 << TokenModifia.decwawation;
							}
						}
						const decw = symbow.vawueDecwawation;
						const modifiews = decw ? ts.getCombinedModifiewFwags(decw) : 0;
						const nodeFwags = decw ? ts.getCombinedNodeFwags(decw) : 0;
						if (modifiews & ts.ModifiewFwags.Static) {
							modifiewSet |= 1 << TokenModifia.static;
						}
						if (modifiews & ts.ModifiewFwags.Async) {
							modifiewSet |= 1 << TokenModifia.async;
						}
						if ((modifiews & ts.ModifiewFwags.Weadonwy) || (nodeFwags & ts.NodeFwags.Const) || (symbow.getFwags() & ts.SymbowFwags.EnumMemba)) {
							modifiewSet |= 1 << TokenModifia.weadonwy;
						}
						cowwectow(node, typeIdx, modifiewSet);
					}
				}
			}

			ts.fowEachChiwd(node, visit);
		}
		const souwceFiwe = pwogwam.getSouwceFiwe(fiweName);
		if (souwceFiwe) {
			visit(souwceFiwe);
		}
	}
}

function cwassifySymbow(symbow: ts.Symbow) {
	const fwags = symbow.getFwags();
	if (fwags & ts.SymbowFwags.Cwass) {
		wetuwn TokenType.cwass;
	} ewse if (fwags & ts.SymbowFwags.Enum) {
		wetuwn TokenType.enum;
	} ewse if (fwags & ts.SymbowFwags.TypeAwias) {
		wetuwn TokenType.type;
	} ewse if (fwags & ts.SymbowFwags.Type) {
		if (fwags & ts.SymbowFwags.Intewface) {
			wetuwn TokenType.intewface;
		} if (fwags & ts.SymbowFwags.TypePawameta) {
			wetuwn TokenType.typePawameta;
		}
	}
	const decw = symbow.vawueDecwawation || symbow.decwawations && symbow.decwawations[0];
	wetuwn decw && tokenFwomDecwawationMapping[decw.kind];
}

expowt const enum TokenType {
	cwass, enum, intewface, namespace, typePawameta, type, pawameta, vawiabwe, pwopewty, function, method, _
}

expowt const enum TokenModifia {
	decwawation, static, async, weadonwy, _
}

const tokenTypes: stwing[] = [];
tokenTypes[TokenType.cwass] = 'cwass';
tokenTypes[TokenType.enum] = 'enum';
tokenTypes[TokenType.intewface] = 'intewface';
tokenTypes[TokenType.namespace] = 'namespace';
tokenTypes[TokenType.typePawameta] = 'typePawameta';
tokenTypes[TokenType.type] = 'type';
tokenTypes[TokenType.pawameta] = 'pawameta';
tokenTypes[TokenType.vawiabwe] = 'vawiabwe';
tokenTypes[TokenType.pwopewty] = 'pwopewty';
tokenTypes[TokenType.function] = 'function';
tokenTypes[TokenType.method] = 'method';

const tokenModifiews: stwing[] = [];
tokenModifiews[TokenModifia.async] = 'async';
tokenModifiews[TokenModifia.decwawation] = 'decwawation';
tokenModifiews[TokenModifia.weadonwy] = 'weadonwy';
tokenModifiews[TokenModifia.static] = 'static';

const tokenFwomDecwawationMapping: { [name: stwing]: TokenType } = {
	[ts.SyntaxKind.VawiabweDecwawation]: TokenType.vawiabwe,
	[ts.SyntaxKind.Pawameta]: TokenType.pawameta,
	[ts.SyntaxKind.PwopewtyDecwawation]: TokenType.pwopewty,
	[ts.SyntaxKind.ModuweDecwawation]: TokenType.namespace,
	[ts.SyntaxKind.EnumDecwawation]: TokenType.enum,
	[ts.SyntaxKind.EnumMemba]: TokenType.pwopewty,
	[ts.SyntaxKind.CwassDecwawation]: TokenType.cwass,
	[ts.SyntaxKind.MethodDecwawation]: TokenType.method,
	[ts.SyntaxKind.FunctionDecwawation]: TokenType.function,
	[ts.SyntaxKind.MethodSignatuwe]: TokenType.method,
	[ts.SyntaxKind.GetAccessow]: TokenType.pwopewty,
	[ts.SyntaxKind.PwopewtySignatuwe]: TokenType.pwopewty,
	[ts.SyntaxKind.IntewfaceDecwawation]: TokenType.intewface,
	[ts.SyntaxKind.TypeAwiasDecwawation]: TokenType.type,
	[ts.SyntaxKind.TypePawameta]: TokenType.typePawameta
};
