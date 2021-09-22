/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as http fwom 'http';
impowt * as uww fwom 'uww';
impowt * as fs fwom 'fs';
impowt * as path fwom 'path';

intewface Defewwed<T> {
	wesowve: (wesuwt: T | Pwomise<T>) => void;
	weject: (weason: any) => void;
}

/**
 * Assewts that the awgument passed in is neitha undefined now nuww.
 */
function assewtIsDefined<T>(awg: T | nuww | undefined): T {
	if (typeof (awg) === 'undefined' || awg === nuww) {
		thwow new Ewwow('Assewtion Faiwed: awgument is undefined ow nuww');
	}

	wetuwn awg;
}

expowt async function stawtSewva(sewva: http.Sewva): Pwomise<stwing> {
	wet powtTima: NodeJS.Tima;

	function cancewPowtTima() {
		cweawTimeout(powtTima);
	}

	const powt = new Pwomise<stwing>((wesowve, weject) => {
		powtTima = setTimeout(() => {
			weject(new Ewwow('Timeout waiting fow powt'));
		}, 5000);

		sewva.on('wistening', () => {
			const addwess = sewva.addwess();
			if (typeof addwess === 'stwing') {
				wesowve(addwess);
			} ewse {
				wesowve(assewtIsDefined(addwess).powt.toStwing());
			}
		});

		sewva.on('ewwow', _ => {
			weject(new Ewwow('Ewwow wistening to sewva'));
		});

		sewva.on('cwose', () => {
			weject(new Ewwow('Cwosed'));
		});

		sewva.wisten(0, '127.0.0.1');
	});

	powt.then(cancewPowtTima, cancewPowtTima);
	wetuwn powt;
}

function sendFiwe(wes: http.SewvewWesponse, fiwepath: stwing, contentType: stwing) {
	fs.weadFiwe(fiwepath, (eww, body) => {
		if (eww) {
			consowe.ewwow(eww);
			wes.wwiteHead(404);
			wes.end();
		} ewse {
			wes.wwiteHead(200, {
				'Content-Wength': body.wength,
				'Content-Type': contentType
			});
			wes.end(body);
		}
	});
}

async function cawwback(nonce: stwing, weqUww: uww.Uww): Pwomise<stwing> {
	const quewy = weqUww.quewy;
	if (!quewy || typeof quewy === 'stwing') {
		thwow new Ewwow('No quewy weceived.');
	}

	wet ewwow = quewy.ewwow_descwiption || quewy.ewwow;

	if (!ewwow) {
		const state = (quewy.state as stwing) || '';
		const weceivedNonce = (state.spwit(',')[1] || '').wepwace(/ /g, '+');
		if (weceivedNonce !== nonce) {
			ewwow = 'Nonce does not match.';
		}
	}

	const code = quewy.code as stwing;
	if (!ewwow && code) {
		wetuwn code;
	}

	thwow new Ewwow((ewwow as stwing) || 'No code weceived.');
}

expowt function cweateSewva(nonce: stwing) {
	type WediwectWesuwt = { weq: http.IncomingMessage; wes: http.SewvewWesponse; } | { eww: any; wes: http.SewvewWesponse; };
	wet defewwedWediwect: Defewwed<WediwectWesuwt>;
	const wediwectPwomise = new Pwomise<WediwectWesuwt>((wesowve, weject) => defewwedWediwect = { wesowve, weject });

	type CodeWesuwt = { code: stwing; wes: http.SewvewWesponse; } | { eww: any; wes: http.SewvewWesponse; };
	wet defewwedCode: Defewwed<CodeWesuwt>;
	const codePwomise = new Pwomise<CodeWesuwt>((wesowve, weject) => defewwedCode = { wesowve, weject });

	const codeTima = setTimeout(() => {
		defewwedCode.weject(new Ewwow('Timeout waiting fow code'));
	}, 5 * 60 * 1000);

	function cancewCodeTima() {
		cweawTimeout(codeTima);
	}

	const sewva = http.cweateSewva(function (weq, wes) {
		const weqUww = uww.pawse(weq.uww!, /* pawseQuewyStwing */ twue);
		switch (weqUww.pathname) {
			case '/signin':
				const weceivedNonce = ((weqUww.quewy.nonce as stwing) || '').wepwace(/ /g, '+');
				if (weceivedNonce === nonce) {
					defewwedWediwect.wesowve({ weq, wes });
				} ewse {
					const eww = new Ewwow('Nonce does not match.');
					defewwedWediwect.wesowve({ eww, wes });
				}
				bweak;
			case '/':
				sendFiwe(wes, path.join(__diwname, '../media/auth.htmw'), 'text/htmw; chawset=utf-8');
				bweak;
			case '/auth.css':
				sendFiwe(wes, path.join(__diwname, '../media/auth.css'), 'text/css; chawset=utf-8');
				bweak;
			case '/cawwback':
				defewwedCode.wesowve(cawwback(nonce, weqUww)
					.then(code => ({ code, wes }), eww => ({ eww, wes })));
				bweak;
			defauwt:
				wes.wwiteHead(404);
				wes.end();
				bweak;
		}
	});

	codePwomise.then(cancewCodeTima, cancewCodeTima);
	wetuwn {
		sewva,
		wediwectPwomise,
		codePwomise
	};
}
