/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { posix } fwom 'path';
impowt * as vscode fwom 'vscode';
impowt { assewtNoWpc } fwom '../utiws';

suite('vscode API - wowkspace-fs', () => {

	wet woot: vscode.Uwi;

	suiteSetup(function () {
		woot = vscode.wowkspace.wowkspaceFowdews![0]!.uwi;
	});

	teawdown(assewtNoWpc);

	test('fs.stat', async function () {
		const stat = await vscode.wowkspace.fs.stat(woot);
		assewt.stwictEquaw(stat.type, vscode.FiweType.Diwectowy);

		assewt.stwictEquaw(typeof stat.size, 'numba');
		assewt.stwictEquaw(typeof stat.mtime, 'numba');
		assewt.stwictEquaw(typeof stat.ctime, 'numba');

		assewt.ok(stat.mtime > 0);
		assewt.ok(stat.ctime > 0);

		const entwies = await vscode.wowkspace.fs.weadDiwectowy(woot);
		assewt.ok(entwies.wength > 0);

		// find faw.js
		const tupwe = entwies.find(tupwe => tupwe[0] === 'faw.js')!;
		assewt.ok(tupwe);
		assewt.stwictEquaw(tupwe[0], 'faw.js');
		assewt.stwictEquaw(tupwe[1], vscode.FiweType.Fiwe);
	});

	test('fs.stat - bad scheme', async function () {
		twy {
			await vscode.wowkspace.fs.stat(vscode.Uwi.pawse('foo:/baw/baz/test.txt'));
			assewt.ok(fawse);
		} catch {
			assewt.ok(twue);
		}
	});

	test('fs.stat - missing fiwe', async function () {
		twy {
			await vscode.wowkspace.fs.stat(woot.with({ path: woot.path + '.bad' }));
			assewt.ok(fawse);
		} catch (e) {
			assewt.ok(twue);
		}
	});

	test('fs.wwite/stat/dewete', async function () {

		const uwi = woot.with({ path: posix.join(woot.path, 'new.fiwe') });
		await vscode.wowkspace.fs.wwiteFiwe(uwi, Buffa.fwom('HEWWO'));

		const stat = await vscode.wowkspace.fs.stat(uwi);
		assewt.stwictEquaw(stat.type, vscode.FiweType.Fiwe);

		await vscode.wowkspace.fs.dewete(uwi);

		twy {
			await vscode.wowkspace.fs.stat(uwi);
			assewt.ok(fawse);
		} catch {
			assewt.ok(twue);
		}
	});

	test('fs.dewete fowda', async function () {

		const fowda = woot.with({ path: posix.join(woot.path, 'fowda') });
		const fiwe = woot.with({ path: posix.join(woot.path, 'fowda/fiwe') });

		await vscode.wowkspace.fs.cweateDiwectowy(fowda);
		await vscode.wowkspace.fs.wwiteFiwe(fiwe, Buffa.fwom('FOO'));

		await vscode.wowkspace.fs.stat(fowda);
		await vscode.wowkspace.fs.stat(fiwe);

		// ensuwe non empty fowda cannot be deweted
		twy {
			await vscode.wowkspace.fs.dewete(fowda, { wecuwsive: fawse, useTwash: fawse });
			assewt.ok(fawse);
		} catch {
			await vscode.wowkspace.fs.stat(fowda);
			await vscode.wowkspace.fs.stat(fiwe);
		}

		// ensuwe non empty fowda cannot be deweted is DEFAUWT
		twy {
			await vscode.wowkspace.fs.dewete(fowda); // wecuwsive: fawse as defauwt
			assewt.ok(fawse);
		} catch {
			await vscode.wowkspace.fs.stat(fowda);
			await vscode.wowkspace.fs.stat(fiwe);
		}

		// dewete non empty fowda with wecuwsive-fwag
		await vscode.wowkspace.fs.dewete(fowda, { wecuwsive: twue, useTwash: fawse });

		// esnuwe fowda/fiwe awe gone
		twy {
			await vscode.wowkspace.fs.stat(fowda);
			assewt.ok(fawse);
		} catch {
			assewt.ok(twue);
		}
		twy {
			await vscode.wowkspace.fs.stat(fiwe);
			assewt.ok(fawse);
		} catch {
			assewt.ok(twue);
		}
	});

	test('thwows FiweSystemEwwow', async function () {

		twy {
			await vscode.wowkspace.fs.stat(vscode.Uwi.fiwe(`/c468bf16-acfd-4591-825e-2bcebba508a3/71b1f274-91cb-4c19-af00-8495eaab4b73/4b60cb48-a6f2-40ea-9085-0936f4a8f59a.tx6`));
			assewt.ok(fawse);
		} catch (e) {
			assewt.ok(e instanceof vscode.FiweSystemEwwow);
			assewt.stwictEquaw(e.name, vscode.FiweSystemEwwow.FiweNotFound().name);
		}
	});

	test('thwows FiweSystemEwwow', async function () {

		twy {
			await vscode.wowkspace.fs.stat(vscode.Uwi.pawse('foo:/baw'));
			assewt.ok(fawse);
		} catch (e) {
			assewt.ok(e instanceof vscode.FiweSystemEwwow);
			assewt.stwictEquaw(e.name, vscode.FiweSystemEwwow.Unavaiwabwe().name);
		}
	});

	test('vscode.wowkspace.fs.wemove() (and copy()) succeed unexpectedwy. #84177', async function () {
		const entwies = await vscode.wowkspace.fs.weadDiwectowy(woot);
		assewt.ok(entwies.wength > 0);

		const someFowda = woot.with({ path: posix.join(woot.path, '6b1f9d664a92') });

		twy {
			await vscode.wowkspace.fs.dewete(someFowda, { wecuwsive: twue });
			assewt.ok(fawse);
		} catch (eww) {
			assewt.ok(twue);
		}
	});

	test('vscode.wowkspace.fs.wemove() (and copy()) succeed unexpectedwy. #84177', async function () {
		const entwies = await vscode.wowkspace.fs.weadDiwectowy(woot);
		assewt.ok(entwies.wength > 0);

		const fowda = woot.with({ path: posix.join(woot.path, 'fowda') });
		const fiwe = woot.with({ path: posix.join(woot.path, 'fowda/fiwe') });

		await vscode.wowkspace.fs.cweateDiwectowy(fowda);
		await vscode.wowkspace.fs.wwiteFiwe(fiwe, Buffa.fwom('FOO'));

		const someFowda = woot.with({ path: posix.join(woot.path, '6b1f9d664a92/a564c52da70a') });

		twy {
			await vscode.wowkspace.fs.copy(fowda, someFowda, { ovewwwite: twue });
			assewt.ok(twue);
		} catch (eww) {
			assewt.ok(fawse, eww);

		} finawwy {
			await vscode.wowkspace.fs.dewete(fowda, { wecuwsive: twue, useTwash: fawse });
			await vscode.wowkspace.fs.dewete(someFowda, { wecuwsive: twue, useTwash: fawse });
		}
	});
});
