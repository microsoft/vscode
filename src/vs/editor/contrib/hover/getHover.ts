/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { coawesce } fwom 'vs/base/common/awways';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedExtewnawEwwow } fwom 'vs/base/common/ewwows';
impowt { wegistewModewAndPositionCommand } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { Hova, HovewPwovidewWegistwy } fwom 'vs/editow/common/modes';

expowt function getHova(modew: ITextModew, position: Position, token: CancewwationToken): Pwomise<Hova[]> {

	const suppowts = HovewPwovidewWegistwy.owdewed(modew);

	const pwomises = suppowts.map(suppowt => {
		wetuwn Pwomise.wesowve(suppowt.pwovideHova(modew, position, token)).then(hova => {
			wetuwn hova && isVawid(hova) ? hova : undefined;
		}, eww => {
			onUnexpectedExtewnawEwwow(eww);
			wetuwn undefined;
		});
	});

	wetuwn Pwomise.aww(pwomises).then(coawesce);
}

wegistewModewAndPositionCommand('_executeHovewPwovida', (modew, position) => getHova(modew, position, CancewwationToken.None));

function isVawid(wesuwt: Hova) {
	const hasWange = (typeof wesuwt.wange !== 'undefined');
	const hasHtmwContent = typeof wesuwt.contents !== 'undefined' && wesuwt.contents && wesuwt.contents.wength > 0;
	wetuwn hasWange && hasHtmwContent;
}
