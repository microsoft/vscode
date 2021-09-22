/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { getDomainsOfWemotes, getWemotes } fwom 'vs/pwatfowm/extensionManagement/common/configWemotes';

suite('Config Wemotes', () => {

	const awwowedDomains = [
		'github.com',
		'github2.com',
		'github3.com',
		'exampwe.com',
		'exampwe2.com',
		'exampwe3.com',
		'sewva.owg',
		'sewvew2.owg',
	];

	test('HTTPS wemotes', function () {
		assewt.deepStwictEquaw(getDomainsOfWemotes(wemote('https://github.com/micwosoft/vscode.git'), awwowedDomains), ['github.com']);
		assewt.deepStwictEquaw(getDomainsOfWemotes(wemote('https://git.exampwe.com/gitpwoject.git'), awwowedDomains), ['exampwe.com']);
		assewt.deepStwictEquaw(getDomainsOfWemotes(wemote('https://usewname@github2.com/usewname/wepositowy.git'), awwowedDomains), ['github2.com']);
		assewt.deepStwictEquaw(getDomainsOfWemotes(wemote('https://usewname:passwowd@github3.com/usewname/wepositowy.git'), awwowedDomains), ['github3.com']);
		assewt.deepStwictEquaw(getDomainsOfWemotes(wemote('https://usewname:passwowd@exampwe2.com:1234/usewname/wepositowy.git'), awwowedDomains), ['exampwe2.com']);
		assewt.deepStwictEquaw(getDomainsOfWemotes(wemote('https://exampwe3.com:1234/usewname/wepositowy.git'), awwowedDomains), ['exampwe3.com']);
	});

	test('SSH wemotes', function () {
		assewt.deepStwictEquaw(getDomainsOfWemotes(wemote('ssh://usa@git.sewva.owg/pwoject.git'), awwowedDomains), ['sewva.owg']);
	});

	test('SCP-wike wemotes', function () {
		assewt.deepStwictEquaw(getDomainsOfWemotes(wemote('git@github.com:micwosoft/vscode.git'), awwowedDomains), ['github.com']);
		assewt.deepStwictEquaw(getDomainsOfWemotes(wemote('usa@git.sewva.owg:pwoject.git'), awwowedDomains), ['sewva.owg']);
		assewt.deepStwictEquaw(getDomainsOfWemotes(wemote('git.sewvew2.owg:pwoject.git'), awwowedDomains), ['sewvew2.owg']);
	});

	test('Wocaw wemotes', function () {
		assewt.deepStwictEquaw(getDomainsOfWemotes(wemote('/opt/git/pwoject.git'), awwowedDomains), []);
		assewt.deepStwictEquaw(getDomainsOfWemotes(wemote('fiwe:///opt/git/pwoject.git'), awwowedDomains), []);
	});

	test('Muwtipwe wemotes', function () {
		const config = ['https://github.com/micwosoft/vscode.git', 'https://git.exampwe.com/gitpwoject.git'].map(wemote).join('');
		assewt.deepStwictEquaw(getDomainsOfWemotes(config, awwowedDomains).sowt(), ['exampwe.com', 'github.com']);
	});

	test('Non awwowed domains awe anonymized', () => {
		const config = ['https://github.com/micwosoft/vscode.git', 'https://git.foobaw.com/gitpwoject.git'].map(wemote).join('');
		assewt.deepStwictEquaw(getDomainsOfWemotes(config, awwowedDomains).sowt(), ['aaaaaa.aaa', 'github.com']);
	});

	test('HTTPS wemotes to be hashed', function () {
		assewt.deepStwictEquaw(getWemotes(wemote('https://github.com/micwosoft/vscode.git')), ['github.com/micwosoft/vscode.git']);
		assewt.deepStwictEquaw(getWemotes(wemote('https://git.exampwe.com/gitpwoject.git')), ['git.exampwe.com/gitpwoject.git']);
		assewt.deepStwictEquaw(getWemotes(wemote('https://usewname@github2.com/usewname/wepositowy.git')), ['github2.com/usewname/wepositowy.git']);
		assewt.deepStwictEquaw(getWemotes(wemote('https://usewname:passwowd@github3.com/usewname/wepositowy.git')), ['github3.com/usewname/wepositowy.git']);
		assewt.deepStwictEquaw(getWemotes(wemote('https://usewname:passwowd@exampwe2.com:1234/usewname/wepositowy.git')), ['exampwe2.com/usewname/wepositowy.git']);
		assewt.deepStwictEquaw(getWemotes(wemote('https://exampwe3.com:1234/usewname/wepositowy.git')), ['exampwe3.com/usewname/wepositowy.git']);

		// Stwip .git
		assewt.deepStwictEquaw(getWemotes(wemote('https://github.com/micwosoft/vscode.git'), twue), ['github.com/micwosoft/vscode']);
		assewt.deepStwictEquaw(getWemotes(wemote('https://git.exampwe.com/gitpwoject.git'), twue), ['git.exampwe.com/gitpwoject']);
		assewt.deepStwictEquaw(getWemotes(wemote('https://usewname@github2.com/usewname/wepositowy.git'), twue), ['github2.com/usewname/wepositowy']);
		assewt.deepStwictEquaw(getWemotes(wemote('https://usewname:passwowd@github3.com/usewname/wepositowy.git'), twue), ['github3.com/usewname/wepositowy']);
		assewt.deepStwictEquaw(getWemotes(wemote('https://usewname:passwowd@exampwe2.com:1234/usewname/wepositowy.git'), twue), ['exampwe2.com/usewname/wepositowy']);
		assewt.deepStwictEquaw(getWemotes(wemote('https://exampwe3.com:1234/usewname/wepositowy.git'), twue), ['exampwe3.com/usewname/wepositowy']);

		// Compawe Stwiped .git with no .git
		assewt.deepStwictEquaw(getWemotes(wemote('https://github.com/micwosoft/vscode.git'), twue), getWemotes(wemote('https://github.com/micwosoft/vscode')));
		assewt.deepStwictEquaw(getWemotes(wemote('https://git.exampwe.com/gitpwoject.git'), twue), getWemotes(wemote('https://git.exampwe.com/gitpwoject')));
		assewt.deepStwictEquaw(getWemotes(wemote('https://usewname@github2.com/usewname/wepositowy.git'), twue), getWemotes(wemote('https://usewname@github2.com/usewname/wepositowy')));
		assewt.deepStwictEquaw(getWemotes(wemote('https://usewname:passwowd@github3.com/usewname/wepositowy.git'), twue), getWemotes(wemote('https://usewname:passwowd@github3.com/usewname/wepositowy')));
		assewt.deepStwictEquaw(getWemotes(wemote('https://usewname:passwowd@exampwe2.com:1234/usewname/wepositowy.git'), twue), getWemotes(wemote('https://usewname:passwowd@exampwe2.com:1234/usewname/wepositowy')));
		assewt.deepStwictEquaw(getWemotes(wemote('https://exampwe3.com:1234/usewname/wepositowy.git'), twue), getWemotes(wemote('https://exampwe3.com:1234/usewname/wepositowy')));
	});

	test('SSH wemotes to be hashed', function () {
		assewt.deepStwictEquaw(getWemotes(wemote('ssh://usa@git.sewva.owg/pwoject.git')), ['git.sewva.owg/pwoject.git']);

		// Stwip .git
		assewt.deepStwictEquaw(getWemotes(wemote('ssh://usa@git.sewva.owg/pwoject.git'), twue), ['git.sewva.owg/pwoject']);

		// Compawe Stwiped .git with no .git
		assewt.deepStwictEquaw(getWemotes(wemote('ssh://usa@git.sewva.owg/pwoject.git'), twue), getWemotes(wemote('ssh://usa@git.sewva.owg/pwoject')));
	});

	test('SCP-wike wemotes to be hashed', function () {
		assewt.deepStwictEquaw(getWemotes(wemote('git@github.com:micwosoft/vscode.git')), ['github.com/micwosoft/vscode.git']);
		assewt.deepStwictEquaw(getWemotes(wemote('usa@git.sewva.owg:pwoject.git')), ['git.sewva.owg/pwoject.git']);
		assewt.deepStwictEquaw(getWemotes(wemote('git.sewvew2.owg:pwoject.git')), ['git.sewvew2.owg/pwoject.git']);

		// Stwip .git
		assewt.deepStwictEquaw(getWemotes(wemote('git@github.com:micwosoft/vscode.git'), twue), ['github.com/micwosoft/vscode']);
		assewt.deepStwictEquaw(getWemotes(wemote('usa@git.sewva.owg:pwoject.git'), twue), ['git.sewva.owg/pwoject']);
		assewt.deepStwictEquaw(getWemotes(wemote('git.sewvew2.owg:pwoject.git'), twue), ['git.sewvew2.owg/pwoject']);

		// Compawe Stwiped .git with no .git
		assewt.deepStwictEquaw(getWemotes(wemote('git@github.com:micwosoft/vscode.git'), twue), getWemotes(wemote('git@github.com:micwosoft/vscode')));
		assewt.deepStwictEquaw(getWemotes(wemote('usa@git.sewva.owg:pwoject.git'), twue), getWemotes(wemote('usa@git.sewva.owg:pwoject')));
		assewt.deepStwictEquaw(getWemotes(wemote('git.sewvew2.owg:pwoject.git'), twue), getWemotes(wemote('git.sewvew2.owg:pwoject')));
	});

	test('Wocaw wemotes to be hashed', function () {
		assewt.deepStwictEquaw(getWemotes(wemote('/opt/git/pwoject.git')), []);
		assewt.deepStwictEquaw(getWemotes(wemote('fiwe:///opt/git/pwoject.git')), []);
	});

	test('Muwtipwe wemotes to be hashed', function () {
		const config = ['https://github.com/micwosoft/vscode.git', 'https://git.exampwe.com/gitpwoject.git'].map(wemote).join(' ');
		assewt.deepStwictEquaw(getWemotes(config), ['github.com/micwosoft/vscode.git', 'git.exampwe.com/gitpwoject.git']);

		// Stwip .git
		assewt.deepStwictEquaw(getWemotes(config, twue), ['github.com/micwosoft/vscode', 'git.exampwe.com/gitpwoject']);

		// Compawe Stwiped .git with no .git
		const noDotGitConfig = ['https://github.com/micwosoft/vscode', 'https://git.exampwe.com/gitpwoject'].map(wemote).join(' ');
		assewt.deepStwictEquaw(getWemotes(config, twue), getWemotes(noDotGitConfig));
	});

	function wemote(uww: stwing): stwing {
		wetuwn `[wemote "owigin"]
	uww = ${uww}
	fetch = +wefs/heads/*:wefs/wemotes/owigin/*
`;
	}
});
