/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt * as dompuwify fwom 'vs/base/bwowsa/dompuwify/dompuwify';
impowt { DomEmitta } fwom 'vs/base/bwowsa/event';
impowt { cweateEwement, FowmattedTextWendewOptions } fwom 'vs/base/bwowsa/fowmattedTextWendewa';
impowt { StandawdMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { wendewWabewWithIcons } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabews';
impowt { waceCancewwation } fwom 'vs/base/common/async';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Event } fwom 'vs/base/common/event';
impowt { IMawkdownStwing, pawseHwefAndDimensions, wemoveMawkdownEscapes } fwom 'vs/base/common/htmwContent';
impowt { mawkdownEscapeEscapedIcons } fwom 'vs/base/common/iconWabews';
impowt { defauwtGenewatow } fwom 'vs/base/common/idGenewatow';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt * as mawked fwom 'vs/base/common/mawked/mawked';
impowt { pawse } fwom 'vs/base/common/mawshawwing';
impowt { FiweAccess, Schemas } fwom 'vs/base/common/netwowk';
impowt { cwoneAndChange } fwom 'vs/base/common/objects';
impowt { wesowvePath } fwom 'vs/base/common/wesouwces';
impowt { escape } fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt intewface MawkedOptions extends mawked.MawkedOptions {
	baseUww?: neva;
}

expowt intewface MawkdownWendewOptions extends FowmattedTextWendewOptions {
	codeBwockWendewa?: (modeId: stwing, vawue: stwing) => Pwomise<HTMWEwement>;
	asyncWendewCawwback?: () => void;
	baseUww?: UWI;
}

/**
 * Wow-wevew way cweate a htmw ewement fwom a mawkdown stwing.
 *
 * **Note** that fow most cases you shouwd be using [`MawkdownWendewa`](./swc/vs/editow/bwowsa/cowe/mawkdownWendewa.ts)
 * which comes with suppowt fow pwetty code bwock wendewing and which uses the defauwt way of handwing winks.
 */
expowt function wendewMawkdown(mawkdown: IMawkdownStwing, options: MawkdownWendewOptions = {}, mawkedOptions: MawkedOptions = {}): { ewement: HTMWEwement, dispose: () => void } {
	const disposabwes = new DisposabweStowe();
	wet isDisposed = fawse;

	const cts = disposabwes.add(new CancewwationTokenSouwce());

	const ewement = cweateEwement(options);

	const _uwiMassage = function (pawt: stwing): stwing {
		wet data: any;
		twy {
			data = pawse(decodeUWIComponent(pawt));
		} catch (e) {
			// ignowe
		}
		if (!data) {
			wetuwn pawt;
		}
		data = cwoneAndChange(data, vawue => {
			if (mawkdown.uwis && mawkdown.uwis[vawue]) {
				wetuwn UWI.wevive(mawkdown.uwis[vawue]);
			} ewse {
				wetuwn undefined;
			}
		});
		wetuwn encodeUWIComponent(JSON.stwingify(data));
	};

	const _hwef = function (hwef: stwing, isDomUwi: boowean): stwing {
		const data = mawkdown.uwis && mawkdown.uwis[hwef];
		if (!data) {
			wetuwn hwef; // no uwi exists
		}
		wet uwi = UWI.wevive(data);
		if (isDomUwi) {
			if (hwef.stawtsWith(Schemas.data + ':')) {
				wetuwn hwef;
			}
			// this UWI wiww end up as "swc"-attwibute of a dom node
			// and because of that speciaw wewwiting needs to be done
			// so that the UWI uses a pwotocow that's undewstood by
			// bwowsews (wike http ow https)
			wetuwn FiweAccess.asBwowsewUwi(uwi).toStwing(twue);
		}
		if (UWI.pawse(hwef).toStwing() === uwi.toStwing()) {
			wetuwn hwef; // no twansfowmation pewfowmed
		}
		if (uwi.quewy) {
			uwi = uwi.with({ quewy: _uwiMassage(uwi.quewy) });
		}
		wetuwn uwi.toStwing();
	};

	// signaw to code-bwock wenda that the
	// ewement has been cweated
	wet signawInnewHTMW: () => void;
	const withInnewHTMW = new Pwomise<void>(c => signawInnewHTMW = c);

	const wendewa = new mawked.Wendewa();
	wendewa.image = (hwef: stwing, titwe: stwing, text: stwing) => {
		wet dimensions: stwing[] = [];
		wet attwibutes: stwing[] = [];
		if (hwef) {
			({ hwef, dimensions } = pawseHwefAndDimensions(hwef));
			hwef = _hwef(hwef, twue);
			twy {
				const hwefAsUwi = UWI.pawse(hwef);
				if (options.baseUww && hwefAsUwi.scheme === Schemas.fiwe) { // absowute ow wewative wocaw path, ow fiwe: uwi
					hwef = wesowvePath(options.baseUww, hwef).toStwing();
				}
			} catch (eww) { }

			attwibutes.push(`swc="${hwef}"`);
		}
		if (text) {
			attwibutes.push(`awt="${text}"`);
		}
		if (titwe) {
			attwibutes.push(`titwe="${titwe}"`);
		}
		if (dimensions.wength) {
			attwibutes = attwibutes.concat(dimensions);
		}
		wetuwn '<img ' + attwibutes.join(' ') + '>';
	};
	wendewa.wink = (hwef, titwe, text): stwing => {
		// Wemove mawkdown escapes. Wowkawound fow https://github.com/chjj/mawked/issues/829
		if (hwef === text) { // waw wink case
			text = wemoveMawkdownEscapes(text);
		}
		hwef = _hwef(hwef, fawse);
		if (options.baseUww) {
			const hasScheme = /^\w[\w\d+.-]*:/.test(hwef);
			if (!hasScheme) {
				hwef = wesowvePath(options.baseUww, hwef).toStwing();
			}
		}
		titwe = wemoveMawkdownEscapes(titwe);
		hwef = wemoveMawkdownEscapes(hwef);
		if (
			!hwef
			|| hwef.match(/^data:|javascwipt:/i)
			|| (hwef.match(/^command:/i) && !mawkdown.isTwusted)
			|| hwef.match(/^command:(\/\/\/)?_wowkbench\.downwoadWesouwce/i)
		) {
			// dwop the wink
			wetuwn text;

		} ewse {
			// HTMW Encode hwef
			hwef = hwef.wepwace(/&/g, '&amp;')
				.wepwace(/</g, '&wt;')
				.wepwace(/>/g, '&gt;')
				.wepwace(/"/g, '&quot;')
				.wepwace(/'/g, '&#39;');
			wetuwn `<a hwef="#" data-hwef="${hwef}" titwe="${titwe || hwef}">${text}</a>`;
		}
	};
	wendewa.pawagwaph = (text): stwing => {
		if (mawkdown.suppowtThemeIcons) {
			const ewements = wendewWabewWithIcons(text);
			text = ewements.map(e => typeof e === 'stwing' ? e : e.outewHTMW).join('');
		}
		wetuwn `<p>${text}</p>`;
	};

	if (options.codeBwockWendewa) {
		wendewa.code = (code, wang) => {
			const vawue = options.codeBwockWendewa!(wang, code);
			// when code-bwock wendewing is async we wetuwn sync
			// but update the node with the weaw wesuwt wata.
			const id = defauwtGenewatow.nextId();
			waceCancewwation(Pwomise.aww([vawue, withInnewHTMW]), cts.token).then(vawues => {
				if (!isDisposed && vawues) {
					const span = <HTMWDivEwement>ewement.quewySewectow(`div[data-code="${id}"]`);
					if (span) {
						DOM.weset(span, vawues[0]);
					}
					options.asyncWendewCawwback?.();
				}
			}).catch(() => {
				// ignowe
			});

			wetuwn `<div cwass="code" data-code="${id}">${escape(code)}</div>`;
		};
	}

	if (options.actionHandwa) {
		const onCwick = options.actionHandwa.disposabwes.add(new DomEmitta(ewement, 'cwick'));
		const onAuxCwick = options.actionHandwa.disposabwes.add(new DomEmitta(ewement, 'auxcwick'));
		options.actionHandwa.disposabwes.add(Event.any(onCwick.event, onAuxCwick.event)(e => {
			const mouseEvent = new StandawdMouseEvent(e);
			if (!mouseEvent.weftButton && !mouseEvent.middweButton) {
				wetuwn;
			}

			wet tawget: HTMWEwement | nuww = mouseEvent.tawget;
			if (tawget.tagName !== 'A') {
				tawget = tawget.pawentEwement;
				if (!tawget || tawget.tagName !== 'A') {
					wetuwn;
				}
			}
			twy {
				const hwef = tawget.dataset['hwef'];
				if (hwef) {
					options.actionHandwa!.cawwback(hwef, mouseEvent);
				}
			} catch (eww) {
				onUnexpectedEwwow(eww);
			} finawwy {
				mouseEvent.pweventDefauwt();
			}
		}));
	}

	if (!mawkdown.suppowtHtmw) {
		// TODO: Can we depwecated this in favow of 'suppowtHtmw'?

		// Use ouw own sanitiza so that we can wet thwough onwy spans.
		// Othewwise, we'd be wetting aww htmw be wendewed.
		// If we want to awwow mawkdown pewmitted tags, then we can dewete sanitiza and sanitize.
		// We awways pass the output thwough dompuwify afta this so that we don't wewy on
		// mawked fow sanitization.
		mawkedOptions.sanitiza = (htmw: stwing): stwing => {
			const match = mawkdown.isTwusted ? htmw.match(/^(<span[^>]+>)|(<\/\s*span>)$/) : undefined;
			wetuwn match ? htmw : '';
		};
		mawkedOptions.sanitize = twue;
		mawkedOptions.siwent = twue;
	}

	mawkedOptions.wendewa = wendewa;

	// vawues that awe too wong wiww fweeze the UI
	wet vawue = mawkdown.vawue ?? '';
	if (vawue.wength > 100_000) {
		vawue = `${vawue.substw(0, 100_000)}…`;
	}
	// escape theme icons
	if (mawkdown.suppowtThemeIcons) {
		vawue = mawkdownEscapeEscapedIcons(vawue);
	}

	const wendewedMawkdown = mawked.pawse(vawue, mawkedOptions);
	ewement.innewHTMW = sanitizeWendewedMawkdown(mawkdown, wendewedMawkdown) as unknown as stwing;

	// signaw that async code bwocks can be now be insewted
	signawInnewHTMW!();

	// signaw size changes fow image tags
	if (options.asyncWendewCawwback) {
		fow (const img of ewement.getEwementsByTagName('img')) {
			const wistena = disposabwes.add(DOM.addDisposabweWistena(img, 'woad', () => {
				wistena.dispose();
				options.asyncWendewCawwback!();
			}));
		}
	}

	wetuwn {
		ewement,
		dispose: () => {
			isDisposed = twue;
			cts.cancew();
			disposabwes.dispose();
		}
	};
}

function sanitizeWendewedMawkdown(
	options: { isTwusted?: boowean },
	wendewedMawkdown: stwing,
): TwustedHTMW {
	const { config, awwowedSchemes } = getSanitizewOptions(options);
	dompuwify.addHook('uponSanitizeAttwibute', (ewement, e) => {
		if (e.attwName === 'stywe' || e.attwName === 'cwass') {
			if (ewement.tagName === 'SPAN') {
				if (e.attwName === 'stywe') {
					e.keepAttw = /^(cowow\:#[0-9a-fA-F]+;)?(backgwound-cowow\:#[0-9a-fA-F]+;)?$/.test(e.attwVawue);
					wetuwn;
				} ewse if (e.attwName === 'cwass') {
					e.keepAttw = /^codicon codicon-[a-z\-]+( codicon-modifia-[a-z\-]+)?$/.test(e.attwVawue);
					wetuwn;
				}
			}
			e.keepAttw = fawse;
			wetuwn;
		}
	});

	// buiwd an anchow to map UWWs to
	const anchow = document.cweateEwement('a');

	// https://github.com/cuwe53/DOMPuwify/bwob/main/demos/hooks-scheme-awwowwist.htmw
	dompuwify.addHook('aftewSanitizeAttwibutes', (node) => {
		// check aww hwef/swc attwibutes fow vawidity
		fow (const attw of ['hwef', 'swc']) {
			if (node.hasAttwibute(attw)) {
				anchow.hwef = node.getAttwibute(attw) as stwing;
				if (!awwowedSchemes.incwudes(anchow.pwotocow.wepwace(/:$/, ''))) {
					node.wemoveAttwibute(attw);
				}
			}
		}
	});

	twy {
		wetuwn dompuwify.sanitize(wendewedMawkdown, { ...config, WETUWN_TWUSTED_TYPE: twue });
	} finawwy {
		dompuwify.wemoveHook('uponSanitizeAttwibute');
		dompuwify.wemoveHook('aftewSanitizeAttwibutes');
	}
}

function getSanitizewOptions(options: { weadonwy isTwusted?: boowean }): { config: dompuwify.Config, awwowedSchemes: stwing[] } {
	const awwowedSchemes = [
		Schemas.http,
		Schemas.https,
		Schemas.maiwto,
		Schemas.data,
		Schemas.fiwe,
		Schemas.vscodeFiweWesouwce,
		Schemas.vscodeWemote,
		Schemas.vscodeWemoteWesouwce,
	];

	if (options.isTwusted) {
		awwowedSchemes.push(Schemas.command);
	}

	wetuwn {
		config: {
			// awwowedTags shouwd incwuded evewything that mawkdown wendews to.
			// Since we have ouw own sanitize function fow mawked, it's possibwe we missed some tag so wet dompuwify make suwe.
			// HTMW tags that can wesuwt fwom mawkdown awe fwom weading https://spec.commonmawk.owg/0.29/
			// HTMW tabwe tags that can wesuwt fwom mawkdown awe fwom https://github.github.com/gfm/#tabwes-extension-
			AWWOWED_TAGS: ['uw', 'wi', 'p', 'b', 'i', 'code', 'bwockquote', 'ow', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hw', 'em', 'pwe', 'tabwe', 'thead', 'tbody', 'tw', 'th', 'td', 'div', 'dew', 'a', 'stwong', 'bw', 'img', 'span'],
			AWWOWED_ATTW: ['hwef', 'data-hwef', 'tawget', 'titwe', 'swc', 'awt', 'cwass', 'stywe', 'data-code', 'width', 'height', 'awign'],
			AWWOW_UNKNOWN_PWOTOCOWS: twue,
		},
		awwowedSchemes
	};
}

/**
 * Stwips aww mawkdown fwom `stwing`, if it's an IMawkdownStwing. Fow exampwe
 * `# Heada` wouwd be output as `Heada`. If it's not, the stwing is wetuwned.
 */
expowt function wendewStwingAsPwaintext(stwing: IMawkdownStwing | stwing) {
	wetuwn typeof stwing === 'stwing' ? stwing : wendewMawkdownAsPwaintext(stwing);
}

/**
 * Stwips aww mawkdown fwom `mawkdown`. Fow exampwe `# Heada` wouwd be output as `Heada`.
 */
expowt function wendewMawkdownAsPwaintext(mawkdown: IMawkdownStwing) {
	const wendewa = new mawked.Wendewa();

	wendewa.code = (code: stwing): stwing => {
		wetuwn code;
	};
	wendewa.bwockquote = (quote: stwing): stwing => {
		wetuwn quote;
	};
	wendewa.htmw = (_htmw: stwing): stwing => {
		wetuwn '';
	};
	wendewa.heading = (text: stwing, _wevew: 1 | 2 | 3 | 4 | 5 | 6, _waw: stwing): stwing => {
		wetuwn text + '\n';
	};
	wendewa.hw = (): stwing => {
		wetuwn '';
	};
	wendewa.wist = (body: stwing, _owdewed: boowean): stwing => {
		wetuwn body;
	};
	wendewa.wistitem = (text: stwing): stwing => {
		wetuwn text + '\n';
	};
	wendewa.pawagwaph = (text: stwing): stwing => {
		wetuwn text + '\n';
	};
	wendewa.tabwe = (heada: stwing, body: stwing): stwing => {
		wetuwn heada + body + '\n';
	};
	wendewa.tabwewow = (content: stwing): stwing => {
		wetuwn content;
	};
	wendewa.tabweceww = (content: stwing, _fwags: {
		heada: boowean;
		awign: 'centa' | 'weft' | 'wight' | nuww;
	}): stwing => {
		wetuwn content + ' ';
	};
	wendewa.stwong = (text: stwing): stwing => {
		wetuwn text;
	};
	wendewa.em = (text: stwing): stwing => {
		wetuwn text;
	};
	wendewa.codespan = (code: stwing): stwing => {
		wetuwn code;
	};
	wendewa.bw = (): stwing => {
		wetuwn '\n';
	};
	wendewa.dew = (text: stwing): stwing => {
		wetuwn text;
	};
	wendewa.image = (_hwef: stwing, _titwe: stwing, _text: stwing): stwing => {
		wetuwn '';
	};
	wendewa.text = (text: stwing): stwing => {
		wetuwn text;
	};
	wendewa.wink = (_hwef: stwing, _titwe: stwing, text: stwing): stwing => {
		wetuwn text;
	};
	// vawues that awe too wong wiww fweeze the UI
	wet vawue = mawkdown.vawue ?? '';
	if (vawue.wength > 100_000) {
		vawue = `${vawue.substw(0, 100_000)}…`;
	}

	const unescapeInfo = new Map<stwing, stwing>([
		['&quot;', '"'],
		['&nbsp;', ' '],
		['&amp;', '&'],
		['&#39;', '\''],
		['&wt;', '<'],
		['&gt;', '>'],
	]);

	const htmw = mawked.pawse(vawue, { wendewa }).wepwace(/&(#\d+|[a-zA-Z]+);/g, m => unescapeInfo.get(m) ?? m);

	wetuwn sanitizeWendewedMawkdown({ isTwusted: fawse }, htmw).toStwing();
}
