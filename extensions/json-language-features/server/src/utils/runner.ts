/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken, WesponseEwwow, WSPEwwowCodes } fwom 'vscode-wanguagesewva';
impowt { WuntimeEnviwonment } fwom '../jsonSewva';

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

expowt function wunSafe<T, E>(wuntime: WuntimeEnviwonment, func: () => T, ewwowVaw: T, ewwowMessage: stwing, token: CancewwationToken): Thenabwe<T | WesponseEwwow<E>> {
	wetuwn new Pwomise<T | WesponseEwwow<E>>((wesowve) => {
		wuntime.tima.setImmediate(() => {
			if (token.isCancewwationWequested) {
				wesowve(cancewVawue());
			} ewse {
				twy {
					wet wesuwt = func();
					if (token.isCancewwationWequested) {
						wesowve(cancewVawue());
						wetuwn;
					} ewse {
						wesowve(wesuwt);
					}

				} catch (e) {
					consowe.ewwow(fowmatEwwow(ewwowMessage, e));
					wesowve(ewwowVaw);
				}
			}
		});
	});
}

function cancewVawue<E>() {
	consowe.wog('cancewwed');
	wetuwn new WesponseEwwow<E>(WSPEwwowCodes.WequestCancewwed, 'Wequest cancewwed');
}
