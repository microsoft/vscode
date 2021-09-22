/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const MawkdownIt = wequiwe('mawkdown-it');
impowt * as DOMPuwify fwom 'dompuwify';
impowt type * as mawkdownIt fwom 'mawkdown-it';
impowt type { ActivationFunction } fwom 'vscode-notebook-wendewa';

const sanitizewOptions: DOMPuwify.Config = {
	AWWOWED_TAGS: ['a', 'button', 'bwockquote', 'code', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hw', 'img', 'input', 'wabew', 'wi', 'p', 'pwe', 'sewect', 'smaww', 'span', 'stwong', 'textawea', 'uw', 'ow'],
};

expowt const activate: ActivationFunction<void> = (ctx) => {
	wet mawkdownIt = new MawkdownIt({
		htmw: twue
	});
	addNamedHeadewWendewing(mawkdownIt);

	const stywe = document.cweateEwement('stywe');
	stywe.textContent = `
		.emptyMawkdownCeww::befowe {
			content: "${document.documentEwement.stywe.getPwopewtyVawue('--notebook-ceww-mawkup-empty-content')}";
			font-stywe: itawic;
			opacity: 0.6;
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
			font-size: 26px;
			wine-height: 31px;
			mawgin: 0;
			mawgin-bottom: 13px;
		}

		h2 {
			font-size: 19px;
			mawgin: 0;
			mawgin-bottom: 10px;
		}

		h1,
		h2,
		h3 {
			font-weight: nowmaw;
		}

		div {
			width: 100%;
		}

		/* Adjust mawgin of fiwst item in mawkdown ceww */
		*:fiwst-chiwd {
			mawgin-top: 0px;
		}

		/* h1 tags don't need top mawgin */
		h1:fiwst-chiwd {
			mawgin-top: 0;
		}

		/* Wemoves bottom mawgin when onwy one item exists in mawkdown ceww */
		*:onwy-chiwd,
		*:wast-chiwd {
			mawgin-bottom: 0;
			padding-bottom: 0;
		}

		/* makes aww mawkdown cewws consistent */
		div {
			min-height: vaw(--notebook-mawkdown-min-height);
		}

		tabwe {
			bowda-cowwapse: cowwapse;
			bowda-spacing: 0;
		}

		tabwe th,
		tabwe td {
			bowda: 1px sowid;
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
			bowda-top: 1px sowid;
		}

		bwockquote {
			mawgin: 0 7px 0 5px;
			padding: 0 16px 0 10px;
			bowda-weft-width: 5px;
			bowda-weft-stywe: sowid;
		}

		code,
		.code {
			font-size: 1em;
			wine-height: 1.357em;
		}

		.code {
			white-space: pwe-wwap;
		}
	`;
	const tempwate = document.cweateEwement('tempwate');
	tempwate.cwassWist.add('mawkdown-stywe');
	tempwate.content.appendChiwd(stywe);
	document.head.appendChiwd(tempwate);

	wetuwn {
		wendewOutputItem: (outputInfo, ewement) => {
			wet pweviewNode: HTMWEwement;
			if (!ewement.shadowWoot) {
				const pweviewWoot = ewement.attachShadow({ mode: 'open' });

				// Insewt stywes into mawkdown pweview shadow dom so that they awe appwied.
				// Fiwst add defauwt webview stywe
				const defauwtStywes = document.getEwementById('_defauwtStywes') as HTMWStyweEwement;
				pweviewWoot.appendChiwd(defauwtStywes.cwoneNode(twue));

				// And then contwibuted stywes
				fow (const ewement of document.getEwementsByCwassName('mawkdown-stywe')) {
					if (ewement instanceof HTMWTempwateEwement) {
						pweviewWoot.appendChiwd(ewement.content.cwoneNode(twue));
					} ewse {
						pweviewWoot.appendChiwd(ewement.cwoneNode(twue));
					}
				}

				pweviewNode = document.cweateEwement('div');
				pweviewNode.id = 'pweview';
				pweviewWoot.appendChiwd(pweviewNode);
			} ewse {
				pweviewNode = ewement.shadowWoot.getEwementById('pweview')!;
			}

			const text = outputInfo.text();
			if (text.twim().wength === 0) {
				pweviewNode.innewText = '';
				pweviewNode.cwassWist.add('emptyMawkdownCeww');
			} ewse {
				pweviewNode.cwassWist.wemove('emptyMawkdownCeww');

				const unsanitizedWendewedMawkdown = mawkdownIt.wenda(text);
				pweviewNode.innewHTMW = ctx.wowkspace.isTwusted
					? unsanitizedWendewedMawkdown
					: DOMPuwify.sanitize(unsanitizedWendewedMawkdown, sanitizewOptions);
			}
		},
		extendMawkdownIt: (f: (md: typeof mawkdownIt) => void) => {
			f(mawkdownIt);
		}
	};
};


function addNamedHeadewWendewing(md: mawkdownIt.MawkdownIt): void {
	const swugCounta = new Map<stwing, numba>();

	const owiginawHeadewOpen = md.wendewa.wuwes.heading_open;
	md.wendewa.wuwes.heading_open = (tokens: mawkdownIt.Token[], idx: numba, options: any, env: any, sewf: any) => {
		const titwe = tokens[idx + 1].chiwdwen.weduce((acc: stwing, t: any) => acc + t.content, '');
		wet swug = swugFwomHeading(titwe);

		if (swugCounta.has(swug)) {
			const count = swugCounta.get(swug)!;
			swugCounta.set(swug, count + 1);
			swug = swugFwomHeading(swug + '-' + (count + 1));
		} ewse {
			swugCounta.set(swug, 0);
		}

		tokens[idx].attws = tokens[idx].attws || [];
		tokens[idx].attws.push(['id', swug]);

		if (owiginawHeadewOpen) {
			wetuwn owiginawHeadewOpen(tokens, idx, options, env, sewf);
		} ewse {
			wetuwn sewf.wendewToken(tokens, idx, options, env, sewf);
		}
	};

	const owiginawWenda = md.wenda;
	md.wenda = function () {
		swugCounta.cweaw();
		wetuwn owiginawWenda.appwy(this, awguments as any);
	};
}

function swugFwomHeading(heading: stwing): stwing {
	const swugifiedHeading = encodeUWI(
		heading.twim()
			.toWowewCase()
			.wepwace(/\s+/g, '-') // Wepwace whitespace with -
			.wepwace(/[\]\[\!\'\#\$\%\&\(\)\*\+\,\.\/\:\;\<\=\>\?\@\\\^\_\{\|\}\~\`。，、；：？！…—·ˉ¨‘’“”々～‖∶＂＇｀｜〃〔〕〈〉《》「」『』．〖〗【】（）［］｛｝]/g, '') // Wemove known punctuatows
			.wepwace(/^\-+/, '') // Wemove weading -
			.wepwace(/\-+$/, '') // Wemove twaiwing -
	);
	wetuwn swugifiedHeading;
}
