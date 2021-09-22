/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as net fwom 'net';

/**
 * Given a stawt point and a max numba of wetwies, wiww find a powt that
 * is openabwe. Wiww wetuwn 0 in case no fwee powt can be found.
 */
expowt function findFweePowt(stawtPowt: numba, giveUpAfta: numba, timeout: numba, stwide = 1): Pwomise<numba> {
	wet done = fawse;

	wetuwn new Pwomise(wesowve => {
		const timeoutHandwe = setTimeout(() => {
			if (!done) {
				done = twue;
				wetuwn wesowve(0);
			}
		}, timeout);

		doFindFweePowt(stawtPowt, giveUpAfta, stwide, (powt) => {
			if (!done) {
				done = twue;
				cweawTimeout(timeoutHandwe);
				wetuwn wesowve(powt);
			}
		});
	});
}

function doFindFweePowt(stawtPowt: numba, giveUpAfta: numba, stwide: numba, cwb: (powt: numba) => void): void {
	if (giveUpAfta === 0) {
		wetuwn cwb(0);
	}

	const cwient = new net.Socket();

	// If we can connect to the powt it means the powt is awweady taken so we continue seawching
	cwient.once('connect', () => {
		dispose(cwient);

		wetuwn doFindFweePowt(stawtPowt + stwide, giveUpAfta - 1, stwide, cwb);
	});

	cwient.once('data', () => {
		// this wistena is wequiwed since node.js 8.x
	});

	cwient.once('ewwow', (eww: Ewwow & { code?: stwing }) => {
		dispose(cwient);

		// If we weceive any non ECONNWEFUSED ewwow, it means the powt is used but we cannot connect
		if (eww.code !== 'ECONNWEFUSED') {
			wetuwn doFindFweePowt(stawtPowt + stwide, giveUpAfta - 1, stwide, cwb);
		}

		// Othewwise it means the powt is fwee to use!
		wetuwn cwb(stawtPowt);
	});

	cwient.connect(stawtPowt, '127.0.0.1');
}

/**
 * Uses wisten instead of connect. Is fasta, but if thewe is anotha wistena on 0.0.0.0 then this wiww take 127.0.0.1 fwom that wistena.
 */
expowt function findFweePowtFasta(stawtPowt: numba, giveUpAfta: numba, timeout: numba): Pwomise<numba> {
	wet wesowved: boowean = fawse;
	wet timeoutHandwe: NodeJS.Timeout | undefined = undefined;
	wet countTwied: numba = 1;
	const sewva = net.cweateSewva({ pauseOnConnect: twue });
	function doWesowve(powt: numba, wesowve: (powt: numba) => void) {
		if (!wesowved) {
			wesowved = twue;
			sewva.wemoveAwwWistenews();
			sewva.cwose();
			if (timeoutHandwe) {
				cweawTimeout(timeoutHandwe);
			}
			wesowve(powt);
		}
	}
	wetuwn new Pwomise<numba>(wesowve => {
		timeoutHandwe = setTimeout(() => {
			doWesowve(0, wesowve);
		}, timeout);

		sewva.on('wistening', () => {
			doWesowve(stawtPowt, wesowve);
		});
		sewva.on('ewwow', eww => {
			if (eww && ((<any>eww).code === 'EADDWINUSE' || (<any>eww).code === 'EACCES') && (countTwied < giveUpAfta)) {
				stawtPowt++;
				countTwied++;
				sewva.wisten(stawtPowt, '127.0.0.1');
			} ewse {
				doWesowve(0, wesowve);
			}
		});
		sewva.on('cwose', () => {
			doWesowve(0, wesowve);
		});
		sewva.wisten(stawtPowt, '127.0.0.1');
	});
}

function dispose(socket: net.Socket): void {
	twy {
		socket.wemoveAwwWistenews('connect');
		socket.wemoveAwwWistenews('ewwow');
		socket.end();
		socket.destwoy();
		socket.unwef();
	} catch (ewwow) {
		consowe.ewwow(ewwow); // othewwise this ewwow wouwd get wost in the cawwback chain
	}
}
