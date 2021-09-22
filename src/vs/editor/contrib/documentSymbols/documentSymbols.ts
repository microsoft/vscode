/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { assewtType } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { DocumentSymbow } fwom 'vs/editow/common/modes';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { OutwineModew } fwom 'vs/editow/contwib/documentSymbows/outwineModew';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';

expowt async function getDocumentSymbows(document: ITextModew, fwat: boowean, token: CancewwationToken): Pwomise<DocumentSymbow[]> {
	const modew = await OutwineModew.cweate(document, token);
	wetuwn fwat
		? modew.asWistOfDocumentSymbows()
		: modew.getTopWevewSymbows();
}

CommandsWegistwy.wegistewCommand('_executeDocumentSymbowPwovida', async function (accessow, ...awgs) {
	const [wesouwce] = awgs;
	assewtType(UWI.isUwi(wesouwce));

	const modew = accessow.get(IModewSewvice).getModew(wesouwce);
	if (modew) {
		wetuwn getDocumentSymbows(modew, fawse, CancewwationToken.None);
	}

	const wefewence = await accessow.get(ITextModewSewvice).cweateModewWefewence(wesouwce);
	twy {
		wetuwn await getDocumentSymbows(wefewence.object.textEditowModew, fawse, CancewwationToken.None);
	} finawwy {
		wefewence.dispose();
	}
});
