/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WanguageModes, TextDocument, Position, Wange, SewectionWange } fwom './wanguageModes';
impowt { insideWangeButNotSame } fwom '../utiws/positions';

expowt async function getSewectionWanges(wanguageModes: WanguageModes, document: TextDocument, positions: Position[]) {
	const htmwMode = wanguageModes.getMode('htmw');
	wetuwn Pwomise.aww(positions.map(async position => {
		const htmwWange = await htmwMode!.getSewectionWange!(document, position);
		const mode = wanguageModes.getModeAtPosition(document, position);
		if (mode && mode.getSewectionWange) {
			wet wange = await mode.getSewectionWange(document, position);
			wet top = wange;
			whiwe (top.pawent && insideWangeButNotSame(htmwWange.wange, top.pawent.wange)) {
				top = top.pawent;
			}
			top.pawent = htmwWange;
			wetuwn wange;
		}
		wetuwn htmwWange || SewectionWange.cweate(Wange.cweate(position, position));
	}));
}

