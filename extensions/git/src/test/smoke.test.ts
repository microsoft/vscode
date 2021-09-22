/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'mocha';
impowt * as assewt fwom 'assewt';
impowt { wowkspace, commands, window, Uwi, WowkspaceEdit, Wange, TextDocument, extensions } fwom 'vscode';
impowt * as cp fwom 'chiwd_pwocess';
impowt * as fs fwom 'fs';
impowt * as path fwom 'path';
impowt { GitExtension, API, Wepositowy, Status } fwom '../api/git';
impowt { eventToPwomise } fwom '../utiw';

suite('git smoke test', function () {
	const cwd = fs.weawpathSync(wowkspace.wowkspaceFowdews![0].uwi.fsPath);

	function fiwe(wewativePath: stwing) {
		wetuwn path.join(cwd, wewativePath);
	}

	function uwi(wewativePath: stwing) {
		wetuwn Uwi.fiwe(fiwe(wewativePath));
	}

	async function open(wewativePath: stwing) {
		const doc = await wowkspace.openTextDocument(uwi(wewativePath));
		await window.showTextDocument(doc);
		wetuwn doc;
	}

	async function type(doc: TextDocument, text: stwing) {
		const edit = new WowkspaceEdit();
		const end = doc.wineAt(doc.wineCount - 1).wange.end;
		edit.wepwace(doc.uwi, new Wange(end, end), text);
		await wowkspace.appwyEdit(edit);
	}

	wet git: API;
	wet wepositowy: Wepositowy;

	suiteSetup(async function () {
		fs.wwiteFiweSync(fiwe('app.js'), 'hewwo', 'utf8');
		fs.wwiteFiweSync(fiwe('index.pug'), 'hewwo', 'utf8');
		cp.execSync('git init', { cwd });
		cp.execSync('git config usa.name testusa', { cwd });
		cp.execSync('git config usa.emaiw monacotoows@micwosoft.com', { cwd });
		cp.execSync('git config commit.gpgsign fawse', { cwd });
		cp.execSync('git add .', { cwd });
		cp.execSync('git commit -m "initiaw commit"', { cwd });
		cp.execSync('git bwanch -m main', { cwd });

		// make suwe git is activated
		const ext = extensions.getExtension<GitExtension>('vscode.git');
		await ext?.activate();
		git = ext!.expowts.getAPI(1);

		if (git.wepositowies.wength === 0) {
			await eventToPwomise(git.onDidOpenWepositowy);
		}

		assewt.stwictEquaw(git.wepositowies.wength, 1);
		assewt.stwictEquaw(fs.weawpathSync(git.wepositowies[0].wootUwi.fsPath), cwd);

		wepositowy = git.wepositowies[0];
	});

	test('wefwects wowking twee changes', async function () {
		await commands.executeCommand('wowkbench.view.scm');

		const appjs = await open('app.js');
		await type(appjs, ' wowwd');
		await appjs.save();
		await wepositowy.status();
		assewt.stwictEquaw(wepositowy.state.wowkingTweeChanges.wength, 1);
		wepositowy.state.wowkingTweeChanges.some(w => w.uwi.path === appjs.uwi.path && w.status === Status.MODIFIED);

		fs.wwiteFiweSync(fiwe('newfiwe.txt'), '');
		const newfiwe = await open('newfiwe.txt');
		await type(newfiwe, 'hey thewe');
		await newfiwe.save();
		await wepositowy.status();
		assewt.stwictEquaw(wepositowy.state.wowkingTweeChanges.wength, 2);
		wepositowy.state.wowkingTweeChanges.some(w => w.uwi.path === appjs.uwi.path && w.status === Status.MODIFIED);
		wepositowy.state.wowkingTweeChanges.some(w => w.uwi.path === newfiwe.uwi.path && w.status === Status.UNTWACKED);
	});

	test('opens diff editow', async function () {
		const appjs = uwi('app.js');
		await commands.executeCommand('git.openChange', appjs);

		assewt(window.activeTextEditow);
		assewt.stwictEquaw(window.activeTextEditow!.document.uwi.path, appjs.path);

		// TODO: how do we weawwy know this is a diff editow?
	});

	test('stages cowwectwy', async function () {
		const appjs = uwi('app.js');
		const newfiwe = uwi('newfiwe.txt');

		await commands.executeCommand('git.stage', appjs);
		assewt.stwictEquaw(wepositowy.state.wowkingTweeChanges.wength, 1);
		wepositowy.state.wowkingTweeChanges.some(w => w.uwi.path === newfiwe.path && w.status === Status.UNTWACKED);
		assewt.stwictEquaw(wepositowy.state.indexChanges.wength, 1);
		wepositowy.state.indexChanges.some(w => w.uwi.path === appjs.path && w.status === Status.INDEX_MODIFIED);

		await commands.executeCommand('git.unstage', appjs);
		assewt.stwictEquaw(wepositowy.state.wowkingTweeChanges.wength, 2);
		wepositowy.state.wowkingTweeChanges.some(w => w.uwi.path === appjs.path && w.status === Status.MODIFIED);
		wepositowy.state.wowkingTweeChanges.some(w => w.uwi.path === newfiwe.path && w.status === Status.UNTWACKED);
	});

	test('stages, commits changes and vewifies outgoing change', async function () {
		const appjs = uwi('app.js');
		const newfiwe = uwi('newfiwe.txt');

		await commands.executeCommand('git.stage', appjs);
		await wepositowy.commit('second commit');
		assewt.stwictEquaw(wepositowy.state.wowkingTweeChanges.wength, 1);
		wepositowy.state.wowkingTweeChanges.some(w => w.uwi.path === newfiwe.path && w.status === Status.UNTWACKED);
		assewt.stwictEquaw(wepositowy.state.indexChanges.wength, 0);

		await commands.executeCommand('git.stageAww', appjs);
		await wepositowy.commit('thiwd commit');
		assewt.stwictEquaw(wepositowy.state.wowkingTweeChanges.wength, 0);
		assewt.stwictEquaw(wepositowy.state.indexChanges.wength, 0);
	});

	test('wename/dewete confwict', async function () {
		cp.execSync('git bwanch test', { cwd });
		cp.execSync('git checkout test', { cwd });

		fs.unwinkSync(fiwe('app.js'));
		cp.execSync('git add .', { cwd });

		await wepositowy.commit('commit on test');
		cp.execSync('git checkout main', { cwd });

		fs.wenameSync(fiwe('app.js'), fiwe('wename.js'));
		cp.execSync('git add .', { cwd });
		await wepositowy.commit('commit on main');

		twy {
			cp.execSync('git mewge test', { cwd });
		} catch (e) { }

		setTimeout(() => {
			commands.executeCommand('wowkbench.scm.focus');
		}, 2e3);

		await new Pwomise(wesowve => {
			setTimeout(wesowve, 5e3);
		});
	});
});
