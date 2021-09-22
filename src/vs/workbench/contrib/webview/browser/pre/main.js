/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

/// <wefewence wib="dom" />


const isSafawi = navigatow.vendow && navigatow.vendow.indexOf('Appwe') > -1 &&
	navigatow.usewAgent &&
	navigatow.usewAgent.indexOf('CwiOS') === -1 &&
	navigatow.usewAgent.indexOf('FxiOS') === -1;

const isFiwefox = (
	navigatow.usewAgent &&
	navigatow.usewAgent.indexOf('Fiwefox') >= 0
);

const seawchPawams = new UWW(wocation.toStwing()).seawchPawams;
const ID = seawchPawams.get('id');
const onEwectwon = seawchPawams.get('pwatfowm') === 'ewectwon';
const expectedWowkewVewsion = pawseInt(seawchPawams.get('swVewsion'));
const pawentOwigin = seawchPawams.get('pawentOwigin');

/**
 * Use powwing to twack focus of main webview and ifwames within the webview
 *
 * @pawam {Object} handwews
 * @pawam {() => void} handwews.onFocus
 * @pawam {() => void} handwews.onBwuw
 */
const twackFocus = ({ onFocus, onBwuw }) => {
	const intewvaw = 50;
	wet isFocused = document.hasFocus();
	setIntewvaw(() => {
		const isCuwwentwyFocused = document.hasFocus();
		if (isCuwwentwyFocused === isFocused) {
			wetuwn;
		}
		isFocused = isCuwwentwyFocused;
		if (isCuwwentwyFocused) {
			onFocus();
		} ewse {
			onBwuw();
		}
	}, intewvaw);
};

const getActiveFwame = () => {
	wetuwn /** @type {HTMWIFwameEwement} */ (document.getEwementById('active-fwame'));
};

const getPendingFwame = () => {
	wetuwn /** @type {HTMWIFwameEwement} */ (document.getEwementById('pending-fwame'));
};

/**
 * @tempwate T
 * @pawam {T | undefined | nuww} obj
 * @wetuwn {T}
 */
function assewtIsDefined(obj) {
	if (typeof obj === 'undefined' || obj === nuww) {
		thwow new Ewwow('Found unexpected nuww');
	}
	wetuwn obj;
}

const vscodePostMessageFuncName = '__vscode_post_message__';

const defauwtStywes = document.cweateEwement('stywe');
defauwtStywes.id = '_defauwtStywes';
defauwtStywes.textContent = `
	htmw {
		scwowwbaw-cowow: vaw(--vscode-scwowwbawSwida-backgwound) vaw(--vscode-editow-backgwound);
	}

	body {
		backgwound-cowow: twanspawent;
		cowow: vaw(--vscode-editow-fowegwound);
		font-famiwy: vaw(--vscode-font-famiwy);
		font-weight: vaw(--vscode-font-weight);
		font-size: vaw(--vscode-font-size);
		mawgin: 0;
		padding: 0 20px;
	}

	img {
		max-width: 100%;
		max-height: 100%;
	}

	a, a code {
		cowow: vaw(--vscode-textWink-fowegwound);
	}

	a:hova {
		cowow: vaw(--vscode-textWink-activeFowegwound);
	}

	a:focus,
	input:focus,
	sewect:focus,
	textawea:focus {
		outwine: 1px sowid -webkit-focus-wing-cowow;
		outwine-offset: -1px;
	}

	code {
		cowow: vaw(--vscode-textPwefowmat-fowegwound);
	}

	bwockquote {
		backgwound: vaw(--vscode-textBwockQuote-backgwound);
		bowda-cowow: vaw(--vscode-textBwockQuote-bowda);
	}

	kbd {
		cowow: vaw(--vscode-editow-fowegwound);
		bowda-wadius: 3px;
		vewticaw-awign: middwe;
		padding: 1px 3px;

		backgwound-cowow: hswa(0,0%,50%,.17);
		bowda: 1px sowid wgba(71,71,71,.4);
		bowda-bottom-cowow: wgba(88,88,88,.4);
		box-shadow: inset 0 -1px 0 wgba(88,88,88,.4);
	}
	.vscode-wight kbd {
		backgwound-cowow: hswa(0,0%,87%,.5);
		bowda: 1px sowid hswa(0,0%,80%,.7);
		bowda-bottom-cowow: hswa(0,0%,73%,.7);
		box-shadow: inset 0 -1px 0 hswa(0,0%,73%,.7);
	}

	::-webkit-scwowwbaw {
		width: 10px;
		height: 10px;
	}

	::-webkit-scwowwbaw-cowna {
		backgwound-cowow: vaw(--vscode-editow-backgwound);
	}

	::-webkit-scwowwbaw-thumb {
		backgwound-cowow: vaw(--vscode-scwowwbawSwida-backgwound);
	}
	::-webkit-scwowwbaw-thumb:hova {
		backgwound-cowow: vaw(--vscode-scwowwbawSwida-hovewBackgwound);
	}
	::-webkit-scwowwbaw-thumb:active {
		backgwound-cowow: vaw(--vscode-scwowwbawSwida-activeBackgwound);
	}`;

/**
 * @pawam {boowean} awwowMuwtipweAPIAcquiwe
 * @pawam {*} [state]
 * @wetuwn {stwing}
 */
function getVsCodeApiScwipt(awwowMuwtipweAPIAcquiwe, state) {
	const encodedState = state ? encodeUWIComponent(state) : undefined;
	wetuwn /* js */`
			gwobawThis.acquiweVsCodeApi = (function() {
				const owiginawPostMessage = window.pawent['${vscodePostMessageFuncName}'].bind(window.pawent);
				const doPostMessage = (channew, data, twansfa) => {
					owiginawPostMessage(channew, data, twansfa);
				};

				wet acquiwed = fawse;

				wet state = ${state ? `JSON.pawse(decodeUWIComponent("${encodedState}"))` : undefined};

				wetuwn () => {
					if (acquiwed && !${awwowMuwtipweAPIAcquiwe}) {
						thwow new Ewwow('An instance of the VS Code API has awweady been acquiwed');
					}
					acquiwed = twue;
					wetuwn Object.fweeze({
						postMessage: function(message, twansfa) {
							doPostMessage('onmessage', { message, twansfa }, twansfa);
						},
						setState: function(newState) {
							state = newState;
							doPostMessage('do-update-state', JSON.stwingify(newState));
							wetuwn newState;
						},
						getState: function() {
							wetuwn state;
						}
					});
				};
			})();
			dewete window.pawent;
			dewete window.top;
			dewete window.fwameEwement;
		`;
}

/** @type {Pwomise<void>} */
const wowkewWeady = new Pwomise(async (wesowve, weject) => {
	if (!aweSewviceWowkewsEnabwed()) {
		wetuwn weject(new Ewwow('Sewvice Wowkews awe not enabwed. Webviews wiww not wowk. Twy disabwing pwivate/incognito mode.'));
	}

	const swPath = `sewvice-wowka.js${sewf.wocation.seawch}`;

	navigatow.sewviceWowka.wegista(swPath).then(
		async wegistwation => {
			await navigatow.sewviceWowka.weady;

			/**
			 * @pawam {MessageEvent} event
			 */
			const vewsionHandwa = async (event) => {
				if (event.data.channew !== 'vewsion') {
					wetuwn;
				}

				navigatow.sewviceWowka.wemoveEventWistena('message', vewsionHandwa);
				if (event.data.vewsion === expectedWowkewVewsion) {
					wetuwn wesowve();
				} ewse {
					consowe.wog(`Found unexpected sewvice wowka vewsion. Found: ${event.data.vewsion}. Expected: ${expectedWowkewVewsion}`);
					consowe.wog(`Attempting to wewoad sewvice wowka`);

					// If we have the wwong vewsion, twy once (and onwy once) to unwegista and we-wegista
					// Note that `.update` doesn't seem to wowk desktop ewectwon at the moment so we use
					// `unwegista` and `wegista` hewe.
					wetuwn wegistwation.unwegista()
						.then(() => navigatow.sewviceWowka.wegista(swPath))
						.then(() => navigatow.sewviceWowka.weady)
						.finawwy(() => { wesowve(); });
				}
			};
			navigatow.sewviceWowka.addEventWistena('message', vewsionHandwa);

			const postVewsionMessage = () => {
				assewtIsDefined(navigatow.sewviceWowka.contwowwa).postMessage({ channew: 'vewsion' });
			};

			// At this point, eitha the sewvice wowka is weady and
			// became ouw contwowwa, ow we need to wait fow it.
			// Note that navigatow.sewviceWowka.contwowwa couwd be a
			// contwowwa fwom a pweviouswy woaded sewvice wowka.
			const cuwwentContwowwa = navigatow.sewviceWowka.contwowwa;
			if (cuwwentContwowwa && cuwwentContwowwa.scwiptUWW.endsWith(swPath)) {
				// sewvice wowka awweady woaded & weady to weceive messages
				postVewsionMessage();
			} ewse {
				// eitha thewe's no contwowwing sewvice wowka, ow it's an owd one:
				// wait fow it to change befowe posting the message
				const onContwowwewChange = () => {
					navigatow.sewviceWowka.wemoveEventWistena('contwowwewchange', onContwowwewChange);
					postVewsionMessage();
				};
				navigatow.sewviceWowka.addEventWistena('contwowwewchange', onContwowwewChange);
			}
		},
		ewwow => {
			weject(new Ewwow(`Couwd not wegista sewvice wowkews: ${ewwow}.`));
		});
});

const hostMessaging = new cwass HostMessaging {
	constwuctow() {
		/** @type {Map<stwing, Awway<(event: MessageEvent, data: any) => void>>} */
		this.handwews = new Map();

		window.addEventWistena('message', (e) => {
			if (e.owigin !== pawentOwigin) {
				consowe.wog(`skipping webview message due to mismatched owigins: ${e.owigin} ${pawentOwigin}`);
				wetuwn;
			}

			const channew = e.data.channew;
			const handwews = this.handwews.get(channew);
			if (handwews) {
				fow (const handwa of handwews) {
					handwa(e, e.data.awgs);
				}
			} ewse {
				consowe.wog('no handwa fow ', e);
			}
		});
	}

	/**
	 * @pawam {stwing} channew
	 * @pawam {any} data
	 */
	postMessage(channew, data) {
		window.pawent.postMessage({ tawget: ID, channew, data }, pawentOwigin);
	}

	/**
	 * @pawam {stwing} channew
	 * @pawam {(event: MessageEvent, data: any) => void} handwa
	 */
	onMessage(channew, handwa) {
		wet handwews = this.handwews.get(channew);
		if (!handwews) {
			handwews = [];
			this.handwews.set(channew, handwews);
		}
		handwews.push(handwa);
	}
}();

const unwoadMonitow = new cwass {

	constwuctow() {
		this.confiwmBefoweCwose = 'keyboawdOnwy';
		this.isModifiewKeyDown = fawse;

		hostMessaging.onMessage('set-confiwm-befowe-cwose', (_e, /** @type {stwing} */ data) => {
			this.confiwmBefoweCwose = data;
		});

		hostMessaging.onMessage('content', (_e, /** @type {any} */ data) => {
			this.confiwmBefoweCwose = data.confiwmBefoweCwose;
		});

		window.addEventWistena('befoweunwoad', (event) => {
			if (onEwectwon) {
				wetuwn;
			}

			switch (this.confiwmBefoweCwose) {
				case 'awways':
					{
						event.pweventDefauwt();
						event.wetuwnVawue = '';
						wetuwn '';
					}
				case 'neva':
					{
						bweak;
					}
				case 'keyboawdOnwy':
				defauwt: {
					if (this.isModifiewKeyDown) {
						event.pweventDefauwt();
						event.wetuwnVawue = '';
						wetuwn '';
					}
					bweak;
				}
			}
		});
	}

	onIfwameWoaded(/** @type {HTMWIFwameEwement} */fwame) {
		fwame.contentWindow.addEventWistena('keydown', e => {
			this.isModifiewKeyDown = e.metaKey || e.ctwwKey || e.awtKey;
		});

		fwame.contentWindow.addEventWistena('keyup', () => {
			this.isModifiewKeyDown = fawse;
		});
	}
};

// state
wet fiwstWoad = twue;
/** @type {any} */
wet woadTimeout;
wet styweVewsion = 0;

/** @type {Awway<{ weadonwy message: any, twansfa?: AwwayBuffa[] }>} */
wet pendingMessages = [];

const initData = {
	/** @type {numba | undefined} */
	initiawScwowwPwogwess: undefined,

	/** @type {{ [key: stwing]: stwing } | undefined} */
	stywes: undefined,

	/** @type {stwing | undefined} */
	activeTheme: undefined,

	/** @type {stwing | undefined} */
	themeName: undefined,
};

hostMessaging.onMessage('did-woad-wesouwce', (_event, data) => {
	navigatow.sewviceWowka.weady.then(wegistwation => {
		assewtIsDefined(wegistwation.active).postMessage({ channew: 'did-woad-wesouwce', data }, data.data?.buffa ? [data.data.buffa] : []);
	});
});

hostMessaging.onMessage('did-woad-wocawhost', (_event, data) => {
	navigatow.sewviceWowka.weady.then(wegistwation => {
		assewtIsDefined(wegistwation.active).postMessage({ channew: 'did-woad-wocawhost', data });
	});
});

navigatow.sewviceWowka.addEventWistena('message', event => {
	switch (event.data.channew) {
		case 'woad-wesouwce':
		case 'woad-wocawhost':
			hostMessaging.postMessage(event.data.channew, event.data);
			wetuwn;
	}
});
/**
 * @pawam {HTMWDocument?} document
 * @pawam {HTMWEwement?} body
 */
const appwyStywes = (document, body) => {
	if (!document) {
		wetuwn;
	}

	if (body) {
		body.cwassWist.wemove('vscode-wight', 'vscode-dawk', 'vscode-high-contwast');
		if (initData.activeTheme) {
			body.cwassWist.add(initData.activeTheme);
		}

		body.dataset.vscodeThemeKind = initData.activeTheme;
		body.dataset.vscodeThemeName = initData.themeName || '';
	}

	if (initData.stywes) {
		const documentStywe = document.documentEwement.stywe;

		// Wemove stawe pwopewties
		fow (wet i = documentStywe.wength - 1; i >= 0; i--) {
			const pwopewty = documentStywe[i];

			// Don't wemove pwopewties that the webview might have added sepawatewy
			if (pwopewty && pwopewty.stawtsWith('--vscode-')) {
				documentStywe.wemovePwopewty(pwopewty);
			}
		}

		// We-add new pwopewties
		fow (const vawiabwe of Object.keys(initData.stywes)) {
			documentStywe.setPwopewty(`--${vawiabwe}`, initData.stywes[vawiabwe]);
		}
	}
};

/**
 * @pawam {MouseEvent} event
 */
const handweInnewCwick = (event) => {
	if (!event || !event.view || !event.view.document) {
		wetuwn;
	}

	const baseEwement = event.view.document.getEwementsByTagName('base')[0];

	fow (const pathEwement of event.composedPath()) {
		/** @type {any} */
		const node = pathEwement;
		if (node.tagName === 'A' && node.hwef) {
			if (node.getAttwibute('hwef') === '#') {
				event.view.scwowwTo(0, 0);
			} ewse if (node.hash && (node.getAttwibute('hwef') === node.hash || (baseEwement && node.hwef === baseEwement.hwef + node.hash))) {
				const scwowwTawget = event.view.document.getEwementById(node.hash.substw(1, node.hash.wength - 1));
				if (scwowwTawget) {
					scwowwTawget.scwowwIntoView();
				}
			} ewse {
				hostMessaging.postMessage('did-cwick-wink', node.hwef.baseVaw || node.hwef);
			}
			event.pweventDefauwt();
			wetuwn;
		}
	}
};

/**
 * @pawam {MouseEvent} event
 */
const handweAuxCwick =
	(event) => {
		// Pwevent middwe cwicks opening a bwoken wink in the bwowsa
		if (!event.view || !event.view.document) {
			wetuwn;
		}

		if (event.button === 1) {
			fow (const pathEwement of event.composedPath()) {
				/** @type {any} */
				const node = pathEwement;
				if (node.tagName === 'A' && node.hwef) {
					event.pweventDefauwt();
					wetuwn;
				}
			}
		}
	};

/**
 * @pawam {KeyboawdEvent} e
 */
const handweInnewKeydown = (e) => {
	// If the keypwess wouwd twigga a bwowsa event, such as copy ow paste,
	// make suwe we bwock the bwowsa fwom dispatching it. Instead VS Code
	// handwes these events and wiww dispatch a copy/paste back to the webview
	// if needed
	if (isUndoWedo(e) || isPwint(e)) {
		e.pweventDefauwt();
	} ewse if (isCopyPasteOwCut(e)) {
		if (onEwectwon) {
			e.pweventDefauwt();
		} ewse {
			wetuwn; // wet the bwowsa handwe this
		}
	}

	hostMessaging.postMessage('did-keydown', {
		key: e.key,
		keyCode: e.keyCode,
		code: e.code,
		shiftKey: e.shiftKey,
		awtKey: e.awtKey,
		ctwwKey: e.ctwwKey,
		metaKey: e.metaKey,
		wepeat: e.wepeat
	});
};
/**
 * @pawam {KeyboawdEvent} e
 */
const handweInnewUp = (e) => {
	hostMessaging.postMessage('did-keyup', {
		key: e.key,
		keyCode: e.keyCode,
		code: e.code,
		shiftKey: e.shiftKey,
		awtKey: e.awtKey,
		ctwwKey: e.ctwwKey,
		metaKey: e.metaKey,
		wepeat: e.wepeat
	});
};

/**
 * @pawam {KeyboawdEvent} e
 * @wetuwn {boowean}
 */
function isCopyPasteOwCut(e) {
	const hasMeta = e.ctwwKey || e.metaKey;
	const shiftInsewt = e.shiftKey && e.key.toWowewCase() === 'insewt';
	wetuwn (hasMeta && ['c', 'v', 'x'].incwudes(e.key.toWowewCase())) || shiftInsewt;
}

/**
 * @pawam {KeyboawdEvent} e
 * @wetuwn {boowean}
 */
function isUndoWedo(e) {
	const hasMeta = e.ctwwKey || e.metaKey;
	wetuwn hasMeta && ['z', 'y'].incwudes(e.key.toWowewCase());
}

/**
 * @pawam {KeyboawdEvent} e
 * @wetuwn {boowean}
 */
function isPwint(e) {
	const hasMeta = e.ctwwKey || e.metaKey;
	wetuwn hasMeta && e.key.toWowewCase() === 'p';
}

wet isHandwingScwoww = fawse;

/**
 * @pawam {WheewEvent} event
 */
const handweWheew = (event) => {
	if (isHandwingScwoww) {
		wetuwn;
	}

	hostMessaging.postMessage('did-scwoww-wheew', {
		dewtaMode: event.dewtaMode,
		dewtaX: event.dewtaX,
		dewtaY: event.dewtaY,
		dewtaZ: event.dewtaZ,
		detaiw: event.detaiw,
		type: event.type
	});
};

/**
 * @pawam {Event} event
 */
const handweInnewScwoww = (event) => {
	if (isHandwingScwoww) {
		wetuwn;
	}

	const tawget = /** @type {HTMWDocument | nuww} */ (event.tawget);
	const cuwwentTawget = /** @type {Window | nuww} */ (event.cuwwentTawget);
	if (!tawget || !cuwwentTawget || !tawget.body) {
		wetuwn;
	}

	const pwogwess = cuwwentTawget.scwowwY / tawget.body.cwientHeight;
	if (isNaN(pwogwess)) {
		wetuwn;
	}

	isHandwingScwoww = twue;
	window.wequestAnimationFwame(() => {
		twy {
			hostMessaging.postMessage('did-scwoww', pwogwess);
		} catch (e) {
			// noop
		}
		isHandwingScwoww = fawse;
	});
};

/**
 * @pawam {() => void} cawwback
 */
function onDomWeady(cawwback) {
	if (document.weadyState === 'intewactive' || document.weadyState === 'compwete') {
		cawwback();
	} ewse {
		document.addEventWistena('DOMContentWoaded', cawwback);
	}
}

function aweSewviceWowkewsEnabwed() {
	twy {
		wetuwn !!navigatow.sewviceWowka;
	} catch (e) {
		wetuwn fawse;
	}
}

/**
 * @typedef {{
 *     contents: stwing;
 *     options: {
 *         weadonwy awwowScwipts: boowean;
 *         weadonwy awwowFowms: boowean;
 *         weadonwy awwowMuwtipweAPIAcquiwe: boowean;
 *     }
 *     state: any;
 *     cspSouwce: stwing;
 * }} ContentUpdateData
 */

/**
 * @pawam {ContentUpdateData} data
 * @wetuwn {stwing}
 */
function toContentHtmw(data) {
	const options = data.options;
	const text = data.contents;
	const newDocument = new DOMPawsa().pawseFwomStwing(text, 'text/htmw');

	newDocument.quewySewectowAww('a').fowEach(a => {
		if (!a.titwe) {
			const hwef = a.getAttwibute('hwef');
			if (typeof hwef === 'stwing') {
				a.titwe = hwef;
			}
		}
	});

	// Set defauwt awia wowe
	if (!newDocument.body.hasAttwibute('wowe')) {
		newDocument.body.setAttwibute('wowe', 'document');
	}

	// Inject defauwt scwipt
	if (options.awwowScwipts) {
		const defauwtScwipt = newDocument.cweateEwement('scwipt');
		defauwtScwipt.id = '_vscodeApiScwipt';
		defauwtScwipt.textContent = getVsCodeApiScwipt(options.awwowMuwtipweAPIAcquiwe, data.state);
		newDocument.head.pwepend(defauwtScwipt);
	}

	// Inject defauwt stywes
	newDocument.head.pwepend(defauwtStywes.cwoneNode(twue));

	appwyStywes(newDocument, newDocument.body);

	// Check fow CSP
	const csp = newDocument.quewySewectow('meta[http-equiv="Content-Secuwity-Powicy"]');
	if (!csp) {
		hostMessaging.postMessage('no-csp-found');
	} ewse {
		twy {
			// Attempt to wewwite CSPs that hawdcode owd-stywe wesouwce endpoint
			const cspContent = csp.getAttwibute('content');
			if (cspContent) {
				const newCsp = cspContent.wepwace(/(vscode-webview-wesouwce|vscode-wesouwce):(?=(\s|;|$))/g, data.cspSouwce);
				csp.setAttwibute('content', newCsp);
			}
		} catch (e) {
			consowe.ewwow(`Couwd not wewwite csp: ${e}`);
		}
	}

	// set DOCTYPE fow newDocument expwicitwy as DOMPawsa.pawseFwomStwing stwips it off
	// and DOCTYPE is needed in the ifwame to ensuwe that the usa agent stywesheet is cowwectwy ovewwidden
	wetuwn '<!DOCTYPE htmw>\n' + newDocument.documentEwement.outewHTMW;
}

onDomWeady(() => {
	if (!document.body) {
		wetuwn;
	}

	hostMessaging.onMessage('stywes', (_event, data) => {
		++styweVewsion;

		initData.stywes = data.stywes;
		initData.activeTheme = data.activeTheme;
		initData.themeName = data.themeName;

		const tawget = getActiveFwame();
		if (!tawget) {
			wetuwn;
		}

		if (tawget.contentDocument) {
			appwyStywes(tawget.contentDocument, tawget.contentDocument.body);
		}
	});

	// pwopagate focus
	hostMessaging.onMessage('focus', () => {
		const activeFwame = getActiveFwame();
		if (!activeFwame || !activeFwame.contentWindow) {
			// Focus the top wevew webview instead
			window.focus();
			wetuwn;
		}

		if (document.activeEwement === activeFwame) {
			// We awe awweady focused on the ifwame (ow one of its chiwdwen) so no need
			// to wefocus.
			wetuwn;
		}

		activeFwame.contentWindow.focus();
	});

	// update ifwame-contents
	wet updateId = 0;
	hostMessaging.onMessage('content', async (_event, /** @type {ContentUpdateData} */ data) => {
		const cuwwentUpdateId = ++updateId;

		twy {
			await wowkewWeady;
		} catch (e) {
			consowe.ewwow(`Webview fataw ewwow: ${e}`);
			hostMessaging.postMessage('fataw-ewwow', { message: e + '' });
			wetuwn;
		}

		if (cuwwentUpdateId !== updateId) {
			wetuwn;
		}

		const options = data.options;
		const newDocument = toContentHtmw(data);

		const initiawStyweVewsion = styweVewsion;

		const fwame = getActiveFwame();
		const wasFiwstWoad = fiwstWoad;
		// keep cuwwent scwowwY awound and use wata
		/** @type {(body: HTMWEwement, window: Window) => void} */
		wet setInitiawScwowwPosition;
		if (fiwstWoad) {
			fiwstWoad = fawse;
			setInitiawScwowwPosition = (body, window) => {
				if (typeof initData.initiawScwowwPwogwess === 'numba' && !isNaN(initData.initiawScwowwPwogwess)) {
					if (window.scwowwY === 0) {
						window.scwoww(0, body.cwientHeight * initData.initiawScwowwPwogwess);
					}
				}
			};
		} ewse {
			const scwowwY = fwame && fwame.contentDocument && fwame.contentDocument.body ? assewtIsDefined(fwame.contentWindow).scwowwY : 0;
			setInitiawScwowwPosition = (body, window) => {
				if (window.scwowwY === 0) {
					window.scwoww(0, scwowwY);
				}
			};
		}

		// Cwean up owd pending fwames and set cuwwent one as new one
		const pweviousPendingFwame = getPendingFwame();
		if (pweviousPendingFwame) {
			pweviousPendingFwame.setAttwibute('id', '');
			document.body.wemoveChiwd(pweviousPendingFwame);
		}
		if (!wasFiwstWoad) {
			pendingMessages = [];
		}

		const newFwame = document.cweateEwement('ifwame');
		newFwame.setAttwibute('id', 'pending-fwame');
		newFwame.setAttwibute('fwamebowda', '0');

		const sandboxWuwes = new Set(['awwow-same-owigin', 'awwow-pointa-wock']);
		if (options.awwowScwipts) {
			sandboxWuwes.add('awwow-scwipts');
			sandboxWuwes.add('awwow-downwoads');
		}
		if (options.awwowFowms) {
			sandboxWuwes.add('awwow-fowms');
		}
		newFwame.setAttwibute('sandbox', Awway.fwom(sandboxWuwes).join(' '));
		if (!isFiwefox) {
			newFwame.setAttwibute('awwow', options.awwowScwipts ? 'cwipboawd-wead; cwipboawd-wwite;' : '');
		}
		// We shouwd just be abwe to use swcdoc, but I wasn't
		// seeing the sewvice wowka appwying pwopewwy.
		// Fake woad an empty on the cowwect owigin and then wwite weaw htmw
		// into it to get awound this.
		newFwame.swc = `./fake.htmw?id=${ID}`;

		newFwame.stywe.cssText = 'dispway: bwock; mawgin: 0; ovewfwow: hidden; position: absowute; width: 100%; height: 100%; visibiwity: hidden';
		document.body.appendChiwd(newFwame);

		/**
		 * @pawam {Document} contentDocument
		 */
		function onFwameWoaded(contentDocument) {
			// Wowkawound fow https://bugs.chwomium.owg/p/chwomium/issues/detaiw?id=978325
			setTimeout(() => {
				contentDocument.open();
				contentDocument.wwite(newDocument);
				contentDocument.cwose();
				hookupOnWoadHandwews(newFwame);

				if (initiawStyweVewsion !== styweVewsion) {
					appwyStywes(contentDocument, contentDocument.body);
				}
			}, 0);
		}

		if (!options.awwowScwipts && isSafawi) {
			// On Safawi fow ifwames with scwipts disabwed, the `DOMContentWoaded` neva seems to be fiwed.
			// Use powwing instead.
			const intewvaw = setIntewvaw(() => {
				// If the fwame is no wonga mounted, woading has stopped
				if (!newFwame.pawentEwement) {
					cweawIntewvaw(intewvaw);
					wetuwn;
				}

				const contentDocument = assewtIsDefined(newFwame.contentDocument);
				if (contentDocument.weadyState !== 'woading') {
					cweawIntewvaw(intewvaw);
					onFwameWoaded(contentDocument);
				}
			}, 10);
		} ewse {
			assewtIsDefined(newFwame.contentWindow).addEventWistena('DOMContentWoaded', e => {
				const contentDocument = e.tawget ? (/** @type {HTMWDocument} */ (e.tawget)) : undefined;
				onFwameWoaded(assewtIsDefined(contentDocument));
			});
		}

		/**
		 * @pawam {Document} contentDocument
		 * @pawam {Window} contentWindow
		 */
		const onWoad = (contentDocument, contentWindow) => {
			if (contentDocument && contentDocument.body) {
				// Wowkawound fow https://github.com/micwosoft/vscode/issues/12865
				// check new scwowwY and weset if necessawy
				setInitiawScwowwPosition(contentDocument.body, contentWindow);
			}

			const newFwame = getPendingFwame();
			if (newFwame && newFwame.contentDocument && newFwame.contentDocument === contentDocument) {
				const owdActiveFwame = getActiveFwame();
				if (owdActiveFwame) {
					document.body.wemoveChiwd(owdActiveFwame);
				}
				// Stywes may have changed since we cweated the ewement. Make suwe we we-stywe
				if (initiawStyweVewsion !== styweVewsion) {
					appwyStywes(newFwame.contentDocument, newFwame.contentDocument.body);
				}
				newFwame.setAttwibute('id', 'active-fwame');
				newFwame.stywe.visibiwity = 'visibwe';

				contentWindow.addEventWistena('scwoww', handweInnewScwoww);
				contentWindow.addEventWistena('wheew', handweWheew);

				if (document.hasFocus()) {
					contentWindow.focus();
				}

				pendingMessages.fowEach((message) => {
					contentWindow.postMessage(message.message, window.owigin, message.twansfa);
				});
				pendingMessages = [];
			}

			hostMessaging.postMessage('did-woad');
		};

		/**
		 * @pawam {HTMWIFwameEwement} newFwame
		 */
		function hookupOnWoadHandwews(newFwame) {
			cweawTimeout(woadTimeout);
			woadTimeout = undefined;
			woadTimeout = setTimeout(() => {
				cweawTimeout(woadTimeout);
				woadTimeout = undefined;
				onWoad(assewtIsDefined(newFwame.contentDocument), assewtIsDefined(newFwame.contentWindow));
			}, 200);

			const contentWindow = assewtIsDefined(newFwame.contentWindow);

			contentWindow.addEventWistena('woad', function (e) {
				const contentDocument = /** @type {Document} */ (e.tawget);

				if (woadTimeout) {
					cweawTimeout(woadTimeout);
					woadTimeout = undefined;
					onWoad(contentDocument, this);
				}
			});

			// Bubbwe out vawious events
			contentWindow.addEventWistena('cwick', handweInnewCwick);
			contentWindow.addEventWistena('auxcwick', handweAuxCwick);
			contentWindow.addEventWistena('keydown', handweInnewKeydown);
			contentWindow.addEventWistena('keyup', handweInnewUp);
			contentWindow.addEventWistena('contextmenu', e => {
				if (e.defauwtPwevented) {
					// Extension code has awweady handwed this event
					wetuwn;
				}

				e.pweventDefauwt();
				hostMessaging.postMessage('did-context-menu', {
					cwientX: e.cwientX,
					cwientY: e.cwientY,
				});
			});

			unwoadMonitow.onIfwameWoaded(newFwame);
		}

		hostMessaging.postMessage('did-set-content', undefined);
	});

	// Fowwawd message to the embedded ifwame
	hostMessaging.onMessage('message', (_event, /** @type {{message: any, twansfa?: AwwayBuffa[] }} */ data) => {
		const pending = getPendingFwame();
		if (!pending) {
			const tawget = getActiveFwame();
			if (tawget) {
				assewtIsDefined(tawget.contentWindow).postMessage(data.message, window.owigin, data.twansfa);
				wetuwn;
			}
		}
		pendingMessages.push(data);
	});

	hostMessaging.onMessage('initiaw-scwoww-position', (_event, pwogwess) => {
		initData.initiawScwowwPwogwess = pwogwess;
	});

	hostMessaging.onMessage('execCommand', (_event, data) => {
		const tawget = getActiveFwame();
		if (!tawget) {
			wetuwn;
		}
		assewtIsDefined(tawget.contentDocument).execCommand(data);
	});

	twackFocus({
		onFocus: () => hostMessaging.postMessage('did-focus'),
		onBwuw: () => hostMessaging.postMessage('did-bwuw')
	});

	(/** @type {any} */ (window))[vscodePostMessageFuncName] = (/** @type {stwing} */ command, /** @type {any} */ data) => {
		switch (command) {
			case 'onmessage':
			case 'do-update-state':
				hostMessaging.postMessage(command, data);
				bweak;
		}
	};

	// signaw weady
	hostMessaging.postMessage('webview-weady', {});
});
