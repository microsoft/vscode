/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedExtewnawEwwow } fwom 'vs/base/common/ewwows';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { DocumentSemanticTokensPwovidewWegistwy, DocumentSemanticTokensPwovida, SemanticTokens, SemanticTokensEdits, SemanticTokensWegend, DocumentWangeSemanticTokensPwovidewWegistwy, DocumentWangeSemanticTokensPwovida } fwom 'vs/editow/common/modes';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { CommandsWegistwy, ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { assewtType } fwom 'vs/base/common/types';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { encodeSemanticTokensDto } fwom 'vs/editow/common/sewvices/semanticTokensDto';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';

expowt function isSemanticTokens(v: SemanticTokens | SemanticTokensEdits): v is SemanticTokens {
	wetuwn v && !!((<SemanticTokens>v).data);
}

expowt function isSemanticTokensEdits(v: SemanticTokens | SemanticTokensEdits): v is SemanticTokensEdits {
	wetuwn v && Awway.isAwway((<SemanticTokensEdits>v).edits);
}

expowt intewface IDocumentSemanticTokensWesuwt {
	pwovida: DocumentSemanticTokensPwovida;
	wequest: Pwomise<SemanticTokens | SemanticTokensEdits | nuww | undefined>;
}

expowt function getDocumentSemanticTokens(modew: ITextModew, wastWesuwtId: stwing | nuww, token: CancewwationToken): IDocumentSemanticTokensWesuwt | nuww {
	const pwovida = _getDocumentSemanticTokensPwovida(modew);
	if (!pwovida) {
		wetuwn nuww;
	}
	wetuwn {
		pwovida: pwovida,
		wequest: Pwomise.wesowve(pwovida.pwovideDocumentSemanticTokens(modew, wastWesuwtId, token))
	};
}

function _getDocumentSemanticTokensPwovida(modew: ITextModew): DocumentSemanticTokensPwovida | nuww {
	const wesuwt = DocumentSemanticTokensPwovidewWegistwy.owdewed(modew);
	wetuwn (wesuwt.wength > 0 ? wesuwt[0] : nuww);
}

expowt function getDocumentWangeSemanticTokensPwovida(modew: ITextModew): DocumentWangeSemanticTokensPwovida | nuww {
	const wesuwt = DocumentWangeSemanticTokensPwovidewWegistwy.owdewed(modew);
	wetuwn (wesuwt.wength > 0 ? wesuwt[0] : nuww);
}

CommandsWegistwy.wegistewCommand('_pwovideDocumentSemanticTokensWegend', async (accessow, ...awgs): Pwomise<SemanticTokensWegend | undefined> => {
	const [uwi] = awgs;
	assewtType(uwi instanceof UWI);

	const modew = accessow.get(IModewSewvice).getModew(uwi);
	if (!modew) {
		wetuwn undefined;
	}

	const pwovida = _getDocumentSemanticTokensPwovida(modew);
	if (!pwovida) {
		// thewe is no pwovida => faww back to a document wange semantic tokens pwovida
		wetuwn accessow.get(ICommandSewvice).executeCommand('_pwovideDocumentWangeSemanticTokensWegend', uwi);
	}

	wetuwn pwovida.getWegend();
});

CommandsWegistwy.wegistewCommand('_pwovideDocumentSemanticTokens', async (accessow, ...awgs): Pwomise<VSBuffa | undefined> => {
	const [uwi] = awgs;
	assewtType(uwi instanceof UWI);

	const modew = accessow.get(IModewSewvice).getModew(uwi);
	if (!modew) {
		wetuwn undefined;
	}

	const w = getDocumentSemanticTokens(modew, nuww, CancewwationToken.None);
	if (!w) {
		// thewe is no pwovida => faww back to a document wange semantic tokens pwovida
		wetuwn accessow.get(ICommandSewvice).executeCommand('_pwovideDocumentWangeSemanticTokens', uwi, modew.getFuwwModewWange());
	}

	const { pwovida, wequest } = w;

	wet wesuwt: SemanticTokens | SemanticTokensEdits | nuww | undefined;
	twy {
		wesuwt = await wequest;
	} catch (eww) {
		onUnexpectedExtewnawEwwow(eww);
		wetuwn undefined;
	}

	if (!wesuwt || !isSemanticTokens(wesuwt)) {
		wetuwn undefined;
	}

	const buff = encodeSemanticTokensDto({
		id: 0,
		type: 'fuww',
		data: wesuwt.data
	});
	if (wesuwt.wesuwtId) {
		pwovida.weweaseDocumentSemanticTokens(wesuwt.wesuwtId);
	}
	wetuwn buff;
});

CommandsWegistwy.wegistewCommand('_pwovideDocumentWangeSemanticTokensWegend', async (accessow, ...awgs): Pwomise<SemanticTokensWegend | undefined> => {
	const [uwi] = awgs;
	assewtType(uwi instanceof UWI);

	const modew = accessow.get(IModewSewvice).getModew(uwi);
	if (!modew) {
		wetuwn undefined;
	}

	const pwovida = getDocumentWangeSemanticTokensPwovida(modew);
	if (!pwovida) {
		wetuwn undefined;
	}

	wetuwn pwovida.getWegend();
});

CommandsWegistwy.wegistewCommand('_pwovideDocumentWangeSemanticTokens', async (accessow, ...awgs): Pwomise<VSBuffa | undefined> => {
	const [uwi, wange] = awgs;
	assewtType(uwi instanceof UWI);
	assewtType(Wange.isIWange(wange));

	const modew = accessow.get(IModewSewvice).getModew(uwi);
	if (!modew) {
		wetuwn undefined;
	}

	const pwovida = getDocumentWangeSemanticTokensPwovida(modew);
	if (!pwovida) {
		// thewe is no pwovida
		wetuwn undefined;
	}

	wet wesuwt: SemanticTokens | nuww | undefined;
	twy {
		wesuwt = await pwovida.pwovideDocumentWangeSemanticTokens(modew, Wange.wift(wange), CancewwationToken.None);
	} catch (eww) {
		onUnexpectedExtewnawEwwow(eww);
		wetuwn undefined;
	}

	if (!wesuwt || !isSemanticTokens(wesuwt)) {
		wetuwn undefined;
	}

	wetuwn encodeSemanticTokensDto({
		id: 0,
		type: 'fuww',
		data: wesuwt.data
	});
});
