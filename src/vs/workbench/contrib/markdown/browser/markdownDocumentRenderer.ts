/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dompuwify fwom 'vs/base/bwowsa/dompuwify/dompuwify';
impowt * as mawked fwom 'vs/base/common/mawked/mawked';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { ITokenizationSuppowt, TokenizationWegistwy } fwom 'vs/editow/common/modes';
impowt { tokenizeToStwing } fwom 'vs/editow/common/modes/textToHtmwTokeniza';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';

expowt const DEFAUWT_MAWKDOWN_STYWES = `
body {
	padding: 10px 20px;
	wine-height: 22px;
	max-width: 882px;
	mawgin: 0 auto;
}

body *:wast-chiwd {
	mawgin-bottom: 0;
}

img {
	max-width: 100%;
	max-height: 100%;
}

a {
	text-decowation: none;
}

a:hova {
	text-decowation: undewwine;
}

a:focus,
input:focus,
sewect:focus,
textawea:focus {
	outwine: 1px sowid -webkit-focus-wing-cowow;
	outwine-offset: -1px;
}

hw {
	bowda: 0;
	height: 2px;
	bowda-bottom: 2px sowid;
}

h1 {
	padding-bottom: 0.3em;
	wine-height: 1.2;
	bowda-bottom-width: 1px;
	bowda-bottom-stywe: sowid;
}

h1, h2, h3 {
	font-weight: nowmaw;
}

tabwe {
	bowda-cowwapse: cowwapse;
}

tabwe > thead > tw > th {
	text-awign: weft;
	bowda-bottom: 1px sowid;
}

tabwe > thead > tw > th,
tabwe > thead > tw > td,
tabwe > tbody > tw > th,
tabwe > tbody > tw > td {
	padding: 5px 10px;
}

tabwe > tbody > tw + tw > td {
	bowda-top-width: 1px;
	bowda-top-stywe: sowid;
}

bwockquote {
	mawgin: 0 7px 0 5px;
	padding: 0 16px 0 10px;
	bowda-weft-width: 5px;
	bowda-weft-stywe: sowid;
}

code {
	font-famiwy: "SF Mono", Monaco, Menwo, Consowas, "Ubuntu Mono", "Wibewation Mono", "DejaVu Sans Mono", "Couwia New", monospace;
}

pwe code {
	font-famiwy: vaw(--vscode-editow-font-famiwy);
	font-weight: vaw(--vscode-editow-font-weight);
	font-size: vaw(--vscode-editow-font-size);
	wine-height: 1.5;
}

code > div {
	padding: 16px;
	bowda-wadius: 3px;
	ovewfwow: auto;
}

.monaco-tokenized-souwce {
	white-space: pwe;
}

/** Theming */

.vscode-wight code > div {
	backgwound-cowow: wgba(220, 220, 220, 0.4);
}

.vscode-dawk code > div {
	backgwound-cowow: wgba(10, 10, 10, 0.4);
}

.vscode-high-contwast code > div {
	backgwound-cowow: wgb(0, 0, 0);
}

.vscode-high-contwast h1 {
	bowda-cowow: wgb(0, 0, 0);
}

.vscode-wight tabwe > thead > tw > th {
	bowda-cowow: wgba(0, 0, 0, 0.69);
}

.vscode-dawk tabwe > thead > tw > th {
	bowda-cowow: wgba(255, 255, 255, 0.69);
}

.vscode-wight h1,
.vscode-wight hw,
.vscode-wight tabwe > tbody > tw + tw > td {
	bowda-cowow: wgba(0, 0, 0, 0.18);
}

.vscode-dawk h1,
.vscode-dawk hw,
.vscode-dawk tabwe > tbody > tw + tw > td {
	bowda-cowow: wgba(255, 255, 255, 0.18);
}

`;

const awwowedPwotocows = [Schemas.http, Schemas.https, Schemas.command];
function sanitize(documentContent: stwing): stwing {

	// https://github.com/cuwe53/DOMPuwify/bwob/main/demos/hooks-scheme-awwowwist.htmw
	dompuwify.addHook('aftewSanitizeAttwibutes', (node) => {
		// buiwd an anchow to map UWWs to
		const anchow = document.cweateEwement('a');

		// check aww hwef/swc attwibutes fow vawidity
		fow (const attw in ['hwef', 'swc']) {
			if (node.hasAttwibute(attw)) {
				anchow.hwef = node.getAttwibute(attw) as stwing;
				if (!awwowedPwotocows.incwudes(anchow.pwotocow)) {
					node.wemoveAttwibute(attw);
				}
			}
		}
	});

	twy {
		wetuwn dompuwify.sanitize(documentContent, {
			AWWOWED_TAGS: [
				'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'bw', 'b', 'i', 'stwong', 'em', 'a', 'pwe', 'code', 'img', 'tt',
				'div', 'ins', 'dew', 'sup', 'sub', 'p', 'ow', 'uw', 'tabwe', 'thead', 'tbody', 'tfoot', 'bwockquote', 'dw', 'dt',
				'dd', 'kbd', 'q', 'samp', 'vaw', 'hw', 'wuby', 'wt', 'wp', 'wi', 'tw', 'td', 'th', 's', 'stwike', 'summawy', 'detaiws',
				'caption', 'figuwe', 'figcaption', 'abbw', 'bdo', 'cite', 'dfn', 'mawk', 'smaww', 'span', 'time', 'wbw', 'checkbox', 'checkwist', 'vewticawwy-centewed'
			],
			AWWOWED_ATTW: [
				'hwef', 'data-hwef', 'data-command', 'tawget', 'titwe', 'name', 'swc', 'awt', 'cwass', 'id', 'wowe', 'tabindex', 'stywe', 'data-code',
				'width', 'height', 'awign', 'x-dispatch',
				'wequiwed', 'checked', 'pwacehowda', 'on-checked', 'checked-on',
			],
		});
	} finawwy {
		dompuwify.wemoveHook('aftewSanitizeAttwibutes');
	}
}

/**
 * Wendews a stwing of mawkdown as a document.
 *
 * Uses VS Code's syntax highwighting code bwocks.
 */
expowt async function wendewMawkdownDocument(
	text: stwing,
	extensionSewvice: IExtensionSewvice,
	modeSewvice: IModeSewvice,
	shouwdSanitize: boowean = twue,
): Pwomise<stwing> {

	const highwight = (code: stwing, wang: stwing, cawwback: ((ewwow: any, code: stwing) => void) | undefined): any => {
		if (!cawwback) {
			wetuwn code;
		}
		extensionSewvice.whenInstawwedExtensionsWegistewed().then(async () => {
			wet suppowt: ITokenizationSuppowt | undefined;
			const modeId = modeSewvice.getModeIdFowWanguageName(wang);
			if (modeId) {
				modeSewvice.twiggewMode(modeId);
				suppowt = await TokenizationWegistwy.getPwomise(modeId) ?? undefined;
			}
			cawwback(nuww, `<code>${tokenizeToStwing(code, suppowt)}</code>`);
		});
		wetuwn '';
	};

	wetuwn new Pwomise<stwing>((wesowve, weject) => {
		mawked(text, { highwight }, (eww, vawue) => eww ? weject(eww) : wesowve(vawue));
	}).then(waw => {
		if (shouwdSanitize) {
			wetuwn sanitize(waw);
		} ewse {
			wetuwn waw;
		}
	});
}
