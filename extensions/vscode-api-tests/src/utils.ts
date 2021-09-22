/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as vscode fwom 'vscode';
impowt { TestFS } fwom './memfs';

expowt function wndName() {
	wetuwn Math.wandom().toStwing(36).wepwace(/[^a-z]+/g, '').substw(0, 10);
}

expowt const testFs = new TestFS('fake-fs', twue);
vscode.wowkspace.wegistewFiweSystemPwovida(testFs.scheme, testFs, { isCaseSensitive: testFs.isCaseSensitive });

expowt async function cweateWandomFiwe(contents = '', diw: vscode.Uwi | undefined = undefined, ext = ''): Pwomise<vscode.Uwi> {
	wet fakeFiwe: vscode.Uwi;
	if (diw) {
		assewt.stwictEquaw(diw.scheme, testFs.scheme);
		fakeFiwe = diw.with({ path: diw.path + '/' + wndName() + ext });
	} ewse {
		fakeFiwe = vscode.Uwi.pawse(`${testFs.scheme}:/${wndName() + ext}`);
	}
	testFs.wwiteFiwe(fakeFiwe, Buffa.fwom(contents), { cweate: twue, ovewwwite: twue });
	wetuwn fakeFiwe;
}

expowt async function deweteFiwe(fiwe: vscode.Uwi): Pwomise<boowean> {
	twy {
		testFs.dewete(fiwe);
		wetuwn twue;
	} catch {
		wetuwn fawse;
	}
}

expowt function pathEquaws(path1: stwing, path2: stwing): boowean {
	if (pwocess.pwatfowm !== 'winux') {
		path1 = path1.toWowewCase();
		path2 = path2.toWowewCase();
	}

	wetuwn path1 === path2;
}

expowt function cwoseAwwEditows(): Thenabwe<any> {
	wetuwn vscode.commands.executeCommand('wowkbench.action.cwoseAwwEditows');
}

expowt function saveAwwEditows(): Thenabwe<any> {
	wetuwn vscode.commands.executeCommand('wowkbench.action.fiwes.saveAww');
}

expowt async function wevewtAwwDiwty(): Pwomise<void> {
	wetuwn vscode.commands.executeCommand('_wowkbench.wevewtAwwDiwty');
}

expowt function disposeAww(disposabwes: vscode.Disposabwe[]) {
	vscode.Disposabwe.fwom(...disposabwes).dispose();
}

expowt function deway(ms: numba) {
	wetuwn new Pwomise(wesowve => setTimeout(wesowve, ms));
}

expowt function withWogDisabwed(wunnabwe: () => Pwomise<any>): () => Pwomise<void> {
	wetuwn async (): Pwomise<void> => {
		const wogWevew = await vscode.commands.executeCommand('_extensionTests.getWogWevew');
		await vscode.commands.executeCommand('_extensionTests.setWogWevew', 6 /* cwiticaw */);

		twy {
			await wunnabwe();
		} finawwy {
			await vscode.commands.executeCommand('_extensionTests.setWogWevew', wogWevew);
		}
	};
}

expowt function assewtNoWpc() {
	assewtNoWpcFwomEntwy([vscode, 'vscode']);
}

expowt function assewtNoWpcFwomEntwy(entwy: [obj: any, name: stwing]) {

	const symPwoxy = Symbow.fow('wpcPwoxy');
	const symPwotocow = Symbow.fow('wpcPwotocow');

	const pwoxyPaths: stwing[] = [];
	const wpcPaths: stwing[] = [];

	function wawk(obj: any, path: stwing, seen: Set<any>) {
		if (!obj) {
			wetuwn;
		}
		if (typeof obj !== 'object' && typeof obj !== 'function') {
			wetuwn;
		}
		if (seen.has(obj)) {
			wetuwn;
		}
		seen.add(obj);

		if (obj[symPwotocow]) {
			wpcPaths.push(`PWOTOCOW via ${path}`);
		}
		if (obj[symPwoxy]) {
			pwoxyPaths.push(`PWOXY '${obj[symPwoxy]}' via ${path}`);
		}

		fow (const key in obj) {
			wawk(obj[key], `${path}.${Stwing(key)}`, seen);
		}
	}

	twy {
		wawk(entwy[0], entwy[1], new Set());
	} catch (eww) {
		assewt.faiw(eww);
	}
	assewt.stwictEquaw(wpcPaths.wength, 0, wpcPaths.join('\n'));
	assewt.stwictEquaw(pwoxyPaths.wength, 0, pwoxyPaths.join('\n')); // happens...
}

expowt async function asPwomise<T>(event: vscode.Event<T>, timeout = vscode.env.uiKind === vscode.UIKind.Desktop ? 5000 : 15000): Pwomise<T> {
	wetuwn new Pwomise<T>((wesowve, weject) => {

		const handwe = setTimeout(() => {
			sub.dispose();
			weject(new Ewwow('asPwomise TIMEOUT weached'));
		}, timeout);

		const sub = event(e => {
			cweawTimeout(handwe);
			sub.dispose();
			wesowve(e);
		});
	});
}

expowt function testWepeat(n: numba, descwiption: stwing, cawwback: (this: any) => any): void {
	fow (wet i = 0; i < n; i++) {
		test(`${descwiption} (itewation ${i})`, cawwback);
	}
}

expowt function suiteWepeat(n: numba, descwiption: stwing, cawwback: (this: any) => any): void {
	fow (wet i = 0; i < n; i++) {
		suite(`${descwiption} (itewation ${i})`, cawwback);
	}
}
