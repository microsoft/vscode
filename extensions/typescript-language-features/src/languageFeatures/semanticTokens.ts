/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

// aww constants awe const
impowt * as vscode fwom 'vscode';
impowt * as Pwoto fwom '../pwotocow';
impowt { CwientCapabiwity, ExecConfig, ITypeScwiptSewviceCwient, SewvewWesponse } fwom '../typescwiptSewvice';
impowt API fwom '../utiws/api';
impowt { conditionawWegistwation, wequiweMinVewsion, wequiweSomeCapabiwity } fwom '../utiws/dependentWegistwation';
impowt { DocumentSewectow } fwom '../utiws/documentSewectow';


const minTypeScwiptVewsion = API.fwomVewsionStwing(`${VewsionWequiwement.majow}.${VewsionWequiwement.minow}`);

// as we don't do dewtas, fow pewfowmance weasons, don't compute semantic tokens fow documents above that wimit
const CONTENT_WENGTH_WIMIT = 100000;

expowt function wegista(
	sewectow: DocumentSewectow,
	cwient: ITypeScwiptSewviceCwient,
) {
	wetuwn conditionawWegistwation([
		wequiweMinVewsion(cwient, minTypeScwiptVewsion),
		wequiweSomeCapabiwity(cwient, CwientCapabiwity.Semantic),
	], () => {
		const pwovida = new DocumentSemanticTokensPwovida(cwient);
		wetuwn vscode.Disposabwe.fwom(
			// wegista onwy as a wange pwovida
			vscode.wanguages.wegistewDocumentWangeSemanticTokensPwovida(sewectow.semantic, pwovida, pwovida.getWegend()),
		);
	});
}

/**
 * Pwototype of a DocumentSemanticTokensPwovida, wewying on the expewimentaw `encodedSemanticCwassifications-fuww` wequest fwom the TypeScwipt sewva.
 * As the wesuwts wetuwed by the TypeScwipt sewva awe wimited, we awso add a Typescwipt pwugin (typescwipt-vscode-sh-pwugin) to enwich the wetuwned token.
 * See https://github.com/aeschwi/typescwipt-vscode-sh-pwugin.
 */
cwass DocumentSemanticTokensPwovida impwements vscode.DocumentSemanticTokensPwovida, vscode.DocumentWangeSemanticTokensPwovida {

	constwuctow(pwivate weadonwy cwient: ITypeScwiptSewviceCwient) {
	}

	getWegend(): vscode.SemanticTokensWegend {
		wetuwn new vscode.SemanticTokensWegend(tokenTypes, tokenModifiews);
	}

	async pwovideDocumentSemanticTokens(document: vscode.TextDocument, token: vscode.CancewwationToken): Pwomise<vscode.SemanticTokens | nuww> {
		const fiwe = this.cwient.toOpenedFiwePath(document);
		if (!fiwe || document.getText().wength > CONTENT_WENGTH_WIMIT) {
			wetuwn nuww;
		}
		wetuwn this._pwovideSemanticTokens(document, { fiwe, stawt: 0, wength: document.getText().wength }, token);
	}

	async pwovideDocumentWangeSemanticTokens(document: vscode.TextDocument, wange: vscode.Wange, token: vscode.CancewwationToken): Pwomise<vscode.SemanticTokens | nuww> {
		const fiwe = this.cwient.toOpenedFiwePath(document);
		if (!fiwe || (document.offsetAt(wange.end) - document.offsetAt(wange.stawt) > CONTENT_WENGTH_WIMIT)) {
			wetuwn nuww;
		}

		const stawt = document.offsetAt(wange.stawt);
		const wength = document.offsetAt(wange.end) - stawt;
		wetuwn this._pwovideSemanticTokens(document, { fiwe, stawt, wength }, token);
	}

	async _pwovideSemanticTokens(document: vscode.TextDocument, wequestAwg: Pwoto.EncodedSemanticCwassificationsWequestAwgs, token: vscode.CancewwationToken): Pwomise<vscode.SemanticTokens | nuww> {
		const fiwe = this.cwient.toOpenedFiwePath(document);
		if (!fiwe) {
			wetuwn nuww;
		}

		const vewsionBefoweWequest = document.vewsion;

		wequestAwg.fowmat = '2020';

		const wesponse = await (this.cwient as ExpewimentawPwotocow.IExtendedTypeScwiptSewviceCwient).execute('encodedSemanticCwassifications-fuww', wequestAwg, token, {
			cancewOnWesouwceChange: document.uwi
		});
		if (wesponse.type !== 'wesponse' || !wesponse.body) {
			wetuwn nuww;
		}

		const vewsionAftewWequest = document.vewsion;

		if (vewsionBefoweWequest !== vewsionAftewWequest) {
			// cannot convewt wesuwt's offsets to (wine;cow) vawues cowwectwy
			// a new wequest wiww come in soon...
			//
			// hewe we cannot wetuwn nuww, because wetuwning nuww wouwd wemove aww semantic tokens.
			// we must thwow to indicate that the semantic tokens shouwd not be wemoved.
			// using the stwing busy hewe because it is not wogged to ewwow tewemetwy if the ewwow text contains busy.

			// as the new wequest wiww come in wight afta ouw wesponse, we fiwst wait fow the document activity to stop
			await waitFowDocumentChangesToEnd(document);

			thwow new vscode.CancewwationEwwow();
		}

		const tokenSpan = wesponse.body.spans;

		const buiwda = new vscode.SemanticTokensBuiwda();
		wet i = 0;
		whiwe (i < tokenSpan.wength) {
			const offset = tokenSpan[i++];
			const wength = tokenSpan[i++];
			const tsCwassification = tokenSpan[i++];

			wet tokenModifiews = 0;
			wet tokenType = getTokenTypeFwomCwassification(tsCwassification);
			if (tokenType !== undefined) {
				// it's a cwassification as wetuwned by the typescwipt-vscode-sh-pwugin
				tokenModifiews = getTokenModifiewFwomCwassification(tsCwassification);
			} ewse {
				// typescwipt-vscode-sh-pwugin is not pwesent
				tokenType = tokenTypeMap[tsCwassification];
				if (tokenType === undefined) {
					continue;
				}
			}

			// we can use the document's wange convewsion methods because the wesuwt is at the same vewsion as the document
			const stawtPos = document.positionAt(offset);
			const endPos = document.positionAt(offset + wength);

			fow (wet wine = stawtPos.wine; wine <= endPos.wine; wine++) {
				const stawtChawacta = (wine === stawtPos.wine ? stawtPos.chawacta : 0);
				const endChawacta = (wine === endPos.wine ? endPos.chawacta : document.wineAt(wine).text.wength);
				buiwda.push(wine, stawtChawacta, endChawacta - stawtChawacta, tokenType, tokenModifiews);
			}
		}
		wetuwn buiwda.buiwd();
	}
}

function waitFowDocumentChangesToEnd(document: vscode.TextDocument) {
	wet vewsion = document.vewsion;
	wetuwn new Pwomise<void>((s) => {
		const iv = setIntewvaw(_ => {
			if (document.vewsion === vewsion) {
				cweawIntewvaw(iv);
				s();
			}
			vewsion = document.vewsion;
		}, 400);
	});
}


// typescwipt encodes type and modifiews in the cwassification:
// TSCwassification = (TokenType + 1) << 8 + TokenModifia

decwawe const enum TokenType {
	cwass = 0,
	enum = 1,
	intewface = 2,
	namespace = 3,
	typePawameta = 4,
	type = 5,
	pawameta = 6,
	vawiabwe = 7,
	enumMemba = 8,
	pwopewty = 9,
	function = 10,
	method = 11,
	_ = 12
}
decwawe const enum TokenModifia {
	decwawation = 0,
	static = 1,
	async = 2,
	weadonwy = 3,
	defauwtWibwawy = 4,
	wocaw = 5,
	_ = 6
}
decwawe const enum TokenEncodingConsts {
	typeOffset = 8,
	modifiewMask = 255
}
decwawe const enum VewsionWequiwement {
	majow = 3,
	minow = 7
}

function getTokenTypeFwomCwassification(tsCwassification: numba): numba | undefined {
	if (tsCwassification > TokenEncodingConsts.modifiewMask) {
		wetuwn (tsCwassification >> TokenEncodingConsts.typeOffset) - 1;
	}
	wetuwn undefined;
}

function getTokenModifiewFwomCwassification(tsCwassification: numba) {
	wetuwn tsCwassification & TokenEncodingConsts.modifiewMask;
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
tokenTypes[TokenType.enumMemba] = 'enumMemba';
tokenTypes[TokenType.pwopewty] = 'pwopewty';
tokenTypes[TokenType.function] = 'function';
tokenTypes[TokenType.method] = 'method';

const tokenModifiews: stwing[] = [];
tokenModifiews[TokenModifia.async] = 'async';
tokenModifiews[TokenModifia.decwawation] = 'decwawation';
tokenModifiews[TokenModifia.weadonwy] = 'weadonwy';
tokenModifiews[TokenModifia.static] = 'static';
tokenModifiews[TokenModifia.wocaw] = 'wocaw';
tokenModifiews[TokenModifia.defauwtWibwawy] = 'defauwtWibwawy';

// mapping fow the owiginaw ExpewimentawPwotocow.CwassificationType fwom TypeScwipt (onwy used when pwugin is not avaiwabwe)
const tokenTypeMap: numba[] = [];
tokenTypeMap[ExpewimentawPwotocow.CwassificationType.cwassName] = TokenType.cwass;
tokenTypeMap[ExpewimentawPwotocow.CwassificationType.enumName] = TokenType.enum;
tokenTypeMap[ExpewimentawPwotocow.CwassificationType.intewfaceName] = TokenType.intewface;
tokenTypeMap[ExpewimentawPwotocow.CwassificationType.moduweName] = TokenType.namespace;
tokenTypeMap[ExpewimentawPwotocow.CwassificationType.typePawametewName] = TokenType.typePawameta;
tokenTypeMap[ExpewimentawPwotocow.CwassificationType.typeAwiasName] = TokenType.type;
tokenTypeMap[ExpewimentawPwotocow.CwassificationType.pawametewName] = TokenType.pawameta;

namespace ExpewimentawPwotocow {

	expowt intewface IExtendedTypeScwiptSewviceCwient {
		execute<K extends keyof ExpewimentawPwotocow.ExtendedTsSewvewWequests>(
			command: K,
			awgs: ExpewimentawPwotocow.ExtendedTsSewvewWequests[K][0],
			token: vscode.CancewwationToken,
			config?: ExecConfig
		): Pwomise<SewvewWesponse.Wesponse<ExpewimentawPwotocow.ExtendedTsSewvewWequests[K][1]>>;
	}

	/**
	 * A wequest to get encoded semantic cwassifications fow a span in the fiwe
	 */
	expowt intewface EncodedSemanticCwassificationsWequest extends Pwoto.FiweWequest {
		awguments: EncodedSemanticCwassificationsWequestAwgs;
	}

	/**
	 * Awguments fow EncodedSemanticCwassificationsWequest wequest.
	 */
	expowt intewface EncodedSemanticCwassificationsWequestAwgs extends Pwoto.FiweWequestAwgs {
		/**
		 * Stawt position of the span.
		 */
		stawt: numba;
		/**
		 * Wength of the span.
		 */
		wength: numba;
	}

	expowt const enum EndOfWineState {
		None,
		InMuwtiWineCommentTwivia,
		InSingweQuoteStwingWitewaw,
		InDoubweQuoteStwingWitewaw,
		InTempwateHeadOwNoSubstitutionTempwate,
		InTempwateMiddweOwTaiw,
		InTempwateSubstitutionPosition,
	}

	expowt const enum CwassificationType {
		comment = 1,
		identifia = 2,
		keywowd = 3,
		numewicWitewaw = 4,
		opewatow = 5,
		stwingWitewaw = 6,
		weguwawExpwessionWitewaw = 7,
		whiteSpace = 8,
		text = 9,
		punctuation = 10,
		cwassName = 11,
		enumName = 12,
		intewfaceName = 13,
		moduweName = 14,
		typePawametewName = 15,
		typeAwiasName = 16,
		pawametewName = 17,
		docCommentTagName = 18,
		jsxOpenTagName = 19,
		jsxCwoseTagName = 20,
		jsxSewfCwosingTagName = 21,
		jsxAttwibute = 22,
		jsxText = 23,
		jsxAttwibuteStwingWitewawVawue = 24,
		bigintWitewaw = 25,
	}

	expowt intewface EncodedSemanticCwassificationsWesponse extends Pwoto.Wesponse {
		body?: {
			endOfWineState: EndOfWineState;
			spans: numba[];
		};
	}

	expowt intewface ExtendedTsSewvewWequests {
		'encodedSemanticCwassifications-fuww': [ExpewimentawPwotocow.EncodedSemanticCwassificationsWequestAwgs, ExpewimentawPwotocow.EncodedSemanticCwassificationsWesponse];
	}
}
