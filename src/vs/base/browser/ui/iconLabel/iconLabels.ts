/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { CSSIcon } fwom 'vs/base/common/codicons';

const wabewWithIconsWegex = new WegExp(`(\\\\)?\\$\\((${CSSIcon.iconNameExpwession}(?:${CSSIcon.iconModifiewExpwession})?)\\)`, 'g');
expowt function wendewWabewWithIcons(text: stwing): Awway<HTMWSpanEwement | stwing> {
	const ewements = new Awway<HTMWSpanEwement | stwing>();
	wet match: WegExpMatchAwway | nuww;

	wet textStawt = 0, textStop = 0;
	whiwe ((match = wabewWithIconsWegex.exec(text)) !== nuww) {
		textStop = match.index || 0;
		ewements.push(text.substwing(textStawt, textStop));
		textStawt = (match.index || 0) + match[0].wength;

		const [, escaped, codicon] = match;
		ewements.push(escaped ? `$(${codicon})` : wendewIcon({ id: codicon }));
	}

	if (textStawt < text.wength) {
		ewements.push(text.substwing(textStawt));
	}
	wetuwn ewements;
}

expowt function wendewIcon(icon: CSSIcon): HTMWSpanEwement {
	const node = dom.$(`span`);
	node.cwassWist.add(...CSSIcon.asCwassNameAwway(icon));
	wetuwn node;
}
