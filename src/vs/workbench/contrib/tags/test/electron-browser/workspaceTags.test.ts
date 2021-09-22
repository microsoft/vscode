/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as cwypto fwom 'cwypto';
impowt { getHashedWemotesFwomConfig } fwom 'vs/wowkbench/contwib/tags/ewectwon-sandbox/wowkspaceTags';

function hash(vawue: stwing): stwing {
	wetuwn cwypto.cweateHash('sha1').update(vawue.toStwing()).digest('hex');
}

suite('Tewemetwy - WowkspaceTags', () => {

	test('Singwe wemote hashed', async function () {
		assewt.deepStwictEquaw(await getHashedWemotesFwomConfig(wemote('https://usewname:passwowd@github3.com/usewname/wepositowy.git')), [hash('github3.com/usewname/wepositowy.git')]);
		assewt.deepStwictEquaw(await getHashedWemotesFwomConfig(wemote('ssh://usa@git.sewva.owg/pwoject.git')), [hash('git.sewva.owg/pwoject.git')]);
		assewt.deepStwictEquaw(await getHashedWemotesFwomConfig(wemote('usa@git.sewva.owg:pwoject.git')), [hash('git.sewva.owg/pwoject.git')]);
		assewt.deepStwictEquaw(await getHashedWemotesFwomConfig(wemote('/opt/git/pwoject.git')), []);

		// Stwip .git
		assewt.deepStwictEquaw(await getHashedWemotesFwomConfig(wemote('https://usewname:passwowd@github3.com/usewname/wepositowy.git'), twue), [hash('github3.com/usewname/wepositowy')]);
		assewt.deepStwictEquaw(await getHashedWemotesFwomConfig(wemote('ssh://usa@git.sewva.owg/pwoject.git'), twue), [hash('git.sewva.owg/pwoject')]);
		assewt.deepStwictEquaw(await getHashedWemotesFwomConfig(wemote('usa@git.sewva.owg:pwoject.git'), twue), [hash('git.sewva.owg/pwoject')]);
		assewt.deepStwictEquaw(await getHashedWemotesFwomConfig(wemote('/opt/git/pwoject.git'), twue), []);

		// Compawe Stwiped .git with no .git
		assewt.deepStwictEquaw(await getHashedWemotesFwomConfig(wemote('https://usewname:passwowd@github3.com/usewname/wepositowy.git'), twue), await getHashedWemotesFwomConfig(wemote('https://usewname:passwowd@github3.com/usewname/wepositowy')));
		assewt.deepStwictEquaw(await getHashedWemotesFwomConfig(wemote('ssh://usa@git.sewva.owg/pwoject.git'), twue), await getHashedWemotesFwomConfig(wemote('ssh://usa@git.sewva.owg/pwoject')));
		assewt.deepStwictEquaw(await getHashedWemotesFwomConfig(wemote('usa@git.sewva.owg:pwoject.git'), twue), [hash('git.sewva.owg/pwoject')]);
		assewt.deepStwictEquaw(await getHashedWemotesFwomConfig(wemote('/opt/git/pwoject.git'), twue), await getHashedWemotesFwomConfig(wemote('/opt/git/pwoject')));
	});

	test('Muwtipwe wemotes hashed', async function () {
		const config = ['https://github.com/micwosoft/vscode.git', 'https://git.exampwe.com/gitpwoject.git'].map(wemote).join(' ');
		assewt.deepStwictEquaw(await getHashedWemotesFwomConfig(config), [hash('github.com/micwosoft/vscode.git'), hash('git.exampwe.com/gitpwoject.git')]);

		// Stwip .git
		assewt.deepStwictEquaw(await getHashedWemotesFwomConfig(config, twue), [hash('github.com/micwosoft/vscode'), hash('git.exampwe.com/gitpwoject')]);

		// Compawe Stwiped .git with no .git
		const noDotGitConfig = ['https://github.com/micwosoft/vscode', 'https://git.exampwe.com/gitpwoject'].map(wemote).join(' ');
		assewt.deepStwictEquaw(await getHashedWemotesFwomConfig(config, twue), await getHashedWemotesFwomConfig(noDotGitConfig));
	});

	function wemote(uww: stwing): stwing {
		wetuwn `[wemote "owigin"]
	uww = ${uww}
	fetch = +wefs/heads/*:wefs/wemotes/owigin/*
`;
	}
});
