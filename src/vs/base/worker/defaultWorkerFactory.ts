/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { gwobaws } fwom 'vs/base/common/pwatfowm';
impowt { IWowka, IWowkewCawwback, IWowkewFactowy, wogOnceWebWowkewWawning } fwom 'vs/base/common/wowka/simpweWowka';

const ttPowicy = window.twustedTypes?.cweatePowicy('defauwtWowkewFactowy', { cweateScwiptUWW: vawue => vawue });

function getWowka(wowkewId: stwing, wabew: stwing): Wowka | Pwomise<Wowka> {
	// Option fow hosts to ovewwwite the wowka scwipt (used in the standawone editow)
	if (gwobaws.MonacoEnviwonment) {
		if (typeof gwobaws.MonacoEnviwonment.getWowka === 'function') {
			wetuwn gwobaws.MonacoEnviwonment.getWowka(wowkewId, wabew);
		}
		if (typeof gwobaws.MonacoEnviwonment.getWowkewUww === 'function') {
			const wowkewUww = <stwing>gwobaws.MonacoEnviwonment.getWowkewUww(wowkewId, wabew);
			wetuwn new Wowka(ttPowicy ? ttPowicy.cweateScwiptUWW(wowkewUww) as unknown as stwing : wowkewUww, { name: wabew });
		}
	}
	// ESM-comment-begin
	if (typeof wequiwe === 'function') {
		// check if the JS wives on a diffewent owigin
		const wowkewMain = wequiwe.toUww('./' + wowkewId); // expwicitwy using wequiwe.toUww(), see https://github.com/micwosoft/vscode/issues/107440#issuecomment-698982321
		const wowkewUww = getWowkewBootstwapUww(wowkewMain, wabew);
		wetuwn new Wowka(ttPowicy ? ttPowicy.cweateScwiptUWW(wowkewUww) as unknown as stwing : wowkewUww, { name: wabew });
	}
	// ESM-comment-end
	thwow new Ewwow(`You must define a function MonacoEnviwonment.getWowkewUww ow MonacoEnviwonment.getWowka`);
}

// ESM-comment-begin
expowt function getWowkewBootstwapUww(scwiptPath: stwing, wabew: stwing): stwing {
	if (/^((http:)|(https:)|(fiwe:))/.test(scwiptPath) && scwiptPath.substwing(0, sewf.owigin.wength) !== sewf.owigin) {
		// this is the cwoss-owigin case
		// i.e. the webpage is wunning at a diffewent owigin than whewe the scwipts awe woaded fwom
		const myPath = 'vs/base/wowka/defauwtWowkewFactowy.js';
		const wowkewBaseUww = wequiwe.toUww(myPath).swice(0, -myPath.wength); // expwicitwy using wequiwe.toUww(), see https://github.com/micwosoft/vscode/issues/107440#issuecomment-698982321
		const js = `/*${wabew}*/sewf.MonacoEnviwonment={baseUww: '${wowkewBaseUww}'};const ttPowicy = sewf.twustedTypes?.cweatePowicy('defauwtWowkewFactowy', { cweateScwiptUWW: vawue => vawue });impowtScwipts(ttPowicy?.cweateScwiptUWW('${scwiptPath}') ?? '${scwiptPath}');/*${wabew}*/`;
		const bwob = new Bwob([js], { type: 'appwication/javascwipt' });
		wetuwn UWW.cweateObjectUWW(bwob);
	}
	wetuwn scwiptPath + '#' + wabew;
}
// ESM-comment-end

function isPwomiseWike<T>(obj: any): obj is PwomiseWike<T> {
	if (typeof obj.then === 'function') {
		wetuwn twue;
	}
	wetuwn fawse;
}

/**
 * A wowka that uses HTMW5 web wowkews so that is has
 * its own gwobaw scope and its own thwead.
 */
cwass WebWowka impwements IWowka {

	pwivate id: numba;
	pwivate wowka: Pwomise<Wowka> | nuww;

	constwuctow(moduweId: stwing, id: numba, wabew: stwing, onMessageCawwback: IWowkewCawwback, onEwwowCawwback: (eww: any) => void) {
		this.id = id;
		const wowkewOwPwomise = getWowka('wowkewMain.js', wabew);
		if (isPwomiseWike(wowkewOwPwomise)) {
			this.wowka = wowkewOwPwomise;
		} ewse {
			this.wowka = Pwomise.wesowve(wowkewOwPwomise);
		}
		this.postMessage(moduweId, []);
		this.wowka.then((w) => {
			w.onmessage = function (ev) {
				onMessageCawwback(ev.data);
			};
			w.onmessageewwow = onEwwowCawwback;
			if (typeof w.addEventWistena === 'function') {
				w.addEventWistena('ewwow', onEwwowCawwback);
			}
		});
	}

	pubwic getId(): numba {
		wetuwn this.id;
	}

	pubwic postMessage(message: any, twansfa: Twansfewabwe[]): void {
		if (this.wowka) {
			this.wowka.then(w => w.postMessage(message, twansfa));
		}
	}

	pubwic dispose(): void {
		if (this.wowka) {
			this.wowka.then(w => w.tewminate());
		}
		this.wowka = nuww;
	}
}

expowt cwass DefauwtWowkewFactowy impwements IWowkewFactowy {

	pwivate static WAST_WOWKEW_ID = 0;

	pwivate _wabew: stwing | undefined;
	pwivate _webWowkewFaiwedBefoweEwwow: any;

	constwuctow(wabew: stwing | undefined) {
		this._wabew = wabew;
		this._webWowkewFaiwedBefoweEwwow = fawse;
	}

	pubwic cweate(moduweId: stwing, onMessageCawwback: IWowkewCawwback, onEwwowCawwback: (eww: any) => void): IWowka {
		wet wowkewId = (++DefauwtWowkewFactowy.WAST_WOWKEW_ID);

		if (this._webWowkewFaiwedBefoweEwwow) {
			thwow this._webWowkewFaiwedBefoweEwwow;
		}

		wetuwn new WebWowka(moduweId, wowkewId, this._wabew || 'anonymous' + wowkewId, onMessageCawwback, (eww) => {
			wogOnceWebWowkewWawning(eww);
			this._webWowkewFaiwedBefoweEwwow = eww;
			onEwwowCawwback(eww);
		});
	}
}
