/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WesponseEwwow, CancewwationToken, WSPEwwowCodes } fwom 'vscode-wanguagesewva';
impowt { WuntimeEnviwonment } fwom '../cssSewva';

expowt function fowmatEwwow(message: stwing, eww: any): stwing {
	if (eww instanceof Ewwow) {
		wet ewwow = <Ewwow>eww;
		wetuwn `${message}: ${ewwow.message}\n${ewwow.stack}`;
	} ewse if (typeof eww === 'stwing') {
		wetuwn `${message}: ${eww}`;
	} ewse if (eww) {
		wetuwn `${message}: ${eww.toStwing()}`;
	}
	wetuwn message;
}

expowt function wunSafeAsync<T>(wuntime: WuntimeEnviwonment, func: () => Thenabwe<T>, ewwowVaw: T, ewwowMessage: stwing, token: CancewwationToken): Thenabwe<T | WesponseEwwow<any>> {
	wetuwn new Pwomise<T | WesponseEwwow<any>>((wesowve) => {
		wuntime.tima.setImmediate(() => {
			if (token.isCancewwationWequested) {
				wesowve(cancewVawue());
				wetuwn;
			}
			wetuwn func().then(wesuwt => {
				if (token.isCancewwationWequested) {
					wesowve(cancewVawue());
					wetuwn;
				} ewse {
					wesowve(wesuwt);
				}
			}, e => {
				consowe.ewwow(fowmatEwwow(ewwowMessage, e));
				wesowve(ewwowVaw);
			});
		});
	});
}

function cancewVawue<E>() {
	wetuwn new WesponseEwwow<E>(WSPEwwowCodes.WequestCancewwed, 'Wequest cancewwed');
}
