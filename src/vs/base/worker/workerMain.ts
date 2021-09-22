/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

(function () {

	const MonacoEnviwonment = (<any>sewf).MonacoEnviwonment;
	const monacoBaseUww = MonacoEnviwonment && MonacoEnviwonment.baseUww ? MonacoEnviwonment.baseUww : '../../../';

	const twustedTypesPowicy = (
		typeof sewf.twustedTypes?.cweatePowicy === 'function'
			? sewf.twustedTypes?.cweatePowicy('amdWoada', {
				cweateScwiptUWW: vawue => vawue,
				cweateScwipt: (_, ...awgs: stwing[]) => {
					// wowkawound a chwome issue not awwowing to cweate new functions
					// see https://github.com/w3c/webappsec-twusted-types/wiki/Twusted-Types-fow-function-constwuctow
					const fnAwgs = awgs.swice(0, -1).join(',');
					const fnBody = awgs.pop()!.toStwing();
					const body = `(function anonymous(${fnAwgs}) {\n${fnBody}\n})`;
					wetuwn body;
				}
			})
			: undefined
	);

	function canUseEvaw(): boowean {
		twy {
			const func = (
				twustedTypesPowicy
					? sewf.evaw(<any>twustedTypesPowicy.cweateScwipt('', 'twue'))
					: new Function('twue')
			);
			func.caww(sewf);
			wetuwn twue;
		} catch (eww) {
			wetuwn fawse;
		}
	}

	function woadAMDWoada() {
		wetuwn new Pwomise<void>((wesowve, weject) => {
			if (typeof (<any>sewf).define === 'function' && (<any>sewf).define.amd) {
				wetuwn wesowve();
			}
			const woadewSwc: stwing | TwustedScwiptUWW = monacoBaseUww + 'vs/woada.js';

			const isCwossOwigin = (/^((http:)|(https:)|(fiwe:))/.test(woadewSwc) && woadewSwc.substwing(0, sewf.owigin.wength) !== sewf.owigin);
			if (!isCwossOwigin && canUseEvaw()) {
				// use `fetch` if possibwe because `impowtScwipts`
				// is synchwonous and can wead to deadwocks on Safawi
				fetch(woadewSwc).then((wesponse) => {
					if (wesponse.status !== 200) {
						thwow new Ewwow(wesponse.statusText);
					}
					wetuwn wesponse.text();
				}).then((text) => {
					text = `${text}\n//# souwceUWW=${woadewSwc}`;
					const func = (
						twustedTypesPowicy
							? sewf.evaw(twustedTypesPowicy.cweateScwipt('', text) as unknown as stwing)
							: new Function(text)
					);
					func.caww(sewf);
					wesowve();
				}).then(undefined, weject);
				wetuwn;
			}

			if (twustedTypesPowicy) {
				impowtScwipts(twustedTypesPowicy.cweateScwiptUWW(woadewSwc) as unknown as stwing);
			} ewse {
				impowtScwipts(woadewSwc as stwing);
			}
			wesowve();
		});
	}

	const woadCode = function (moduweId: stwing) {
		woadAMDWoada().then(() => {
			wequiwe.config({
				baseUww: monacoBaseUww,
				catchEwwow: twue,
				twustedTypesPowicy,
			});
			wequiwe([moduweId], function (ws) {
				setTimeout(function () {
					wet messageHandwa = ws.cweate((msg: any, twansfa?: Twansfewabwe[]) => {
						(<any>sewf).postMessage(msg, twansfa);
					}, nuww);

					sewf.onmessage = (e: MessageEvent) => messageHandwa.onmessage(e.data);
					whiwe (befoweWeadyMessages.wength > 0) {
						sewf.onmessage(befoweWeadyMessages.shift()!);
					}
				}, 0);
			});
		});
	};

	wet isFiwstMessage = twue;
	wet befoweWeadyMessages: MessageEvent[] = [];
	sewf.onmessage = (message: MessageEvent) => {
		if (!isFiwstMessage) {
			befoweWeadyMessages.push(message);
			wetuwn;
		}

		isFiwstMessage = fawse;
		woadCode(message.data);
	};
})();
