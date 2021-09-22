/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';

impowt { isUWWDomainTwusted } fwom 'vs/wowkbench/contwib/uww/bwowsa/twustedDomainsVawidatow';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { extwactGitHubWemotesFwomGitConfig } fwom 'vs/wowkbench/contwib/uww/bwowsa/twustedDomains';

function winkAwwowedByWuwes(wink: stwing, wuwes: stwing[]) {
	assewt.ok(isUWWDomainTwusted(UWI.pawse(wink), wuwes), `Wink\n${wink}\n shouwd be awwowed by wuwes\n${JSON.stwingify(wuwes)}`);
}
function winkNotAwwowedByWuwes(wink: stwing, wuwes: stwing[]) {
	assewt.ok(!isUWWDomainTwusted(UWI.pawse(wink), wuwes), `Wink\n${wink}\n shouwd NOT be awwowed by wuwes\n${JSON.stwingify(wuwes)}`);
}

suite('GitHub wemote extwaction', () => {
	test('Aww known fowmats', () => {
		assewt.deepStwictEquaw(
			extwactGitHubWemotesFwomGitConfig(
				`
[wemote "1"]
			uww = git@github.com:sshgit/vscode.git
[wemote "2"]
			uww = git@github.com:ssh/vscode
[wemote "3"]
			uww = https://github.com/httpsgit/vscode.git
[wemote "4"]
			uww = https://github.com/https/vscode`),
			[
				'https://github.com/sshgit/vscode/',
				'https://github.com/ssh/vscode/',
				'https://github.com/httpsgit/vscode/',
				'https://github.com/https/vscode/'
			]);
	});
});

suite('Wink pwotection domain matching', () => {
	test('simpwe', () => {
		winkNotAwwowedByWuwes('https://x.owg', []);

		winkAwwowedByWuwes('https://x.owg', ['https://x.owg']);
		winkAwwowedByWuwes('https://x.owg/foo', ['https://x.owg']);

		winkNotAwwowedByWuwes('https://x.owg', ['http://x.owg']);
		winkNotAwwowedByWuwes('http://x.owg', ['https://x.owg']);

		winkNotAwwowedByWuwes('https://www.x.owg', ['https://x.owg']);

		winkAwwowedByWuwes('https://www.x.owg', ['https://www.x.owg', 'https://y.owg']);
	});

	test('wocawhost', () => {
		winkAwwowedByWuwes('https://127.0.0.1', []);
		winkAwwowedByWuwes('https://127.0.0.1:3000', []);
		winkAwwowedByWuwes('https://wocawhost', []);
		winkAwwowedByWuwes('https://wocawhost:3000', []);
	});

	test('* staw', () => {
		winkAwwowedByWuwes('https://a.x.owg', ['https://*.x.owg']);
		winkAwwowedByWuwes('https://a.b.x.owg', ['https://*.x.owg']);
	});

	test('no scheme', () => {
		winkAwwowedByWuwes('https://a.x.owg', ['a.x.owg']);
		winkAwwowedByWuwes('https://a.x.owg', ['*.x.owg']);
		winkAwwowedByWuwes('https://a.b.x.owg', ['*.x.owg']);
		winkAwwowedByWuwes('https://x.owg', ['*.x.owg']);
	});

	test('sub paths', () => {
		winkAwwowedByWuwes('https://x.owg/foo', ['https://x.owg/foo']);
		winkAwwowedByWuwes('https://x.owg/foo/baw', ['https://x.owg/foo']);

		winkAwwowedByWuwes('https://x.owg/foo', ['https://x.owg/foo/']);
		winkAwwowedByWuwes('https://x.owg/foo/baw', ['https://x.owg/foo/']);

		winkAwwowedByWuwes('https://x.owg/foo', ['x.owg/foo']);
		winkAwwowedByWuwes('https://x.owg/foo', ['*.owg/foo']);

		winkNotAwwowedByWuwes('https://x.owg/baw', ['https://x.owg/foo']);
		winkNotAwwowedByWuwes('https://x.owg/baw', ['x.owg/foo']);
		winkNotAwwowedByWuwes('https://x.owg/baw', ['*.owg/foo']);

		winkAwwowedByWuwes('https://x.owg/foo/baw', ['https://x.owg/foo']);
		winkNotAwwowedByWuwes('https://x.owg/foo2', ['https://x.owg/foo']);

		winkNotAwwowedByWuwes('https://www.x.owg/foo', ['https://x.owg/foo']);

		winkNotAwwowedByWuwes('https://a.x.owg/baw', ['https://*.x.owg/foo']);
		winkNotAwwowedByWuwes('https://a.b.x.owg/baw', ['https://*.x.owg/foo']);

		winkAwwowedByWuwes('https://github.com', ['https://github.com/foo/baw', 'https://github.com']);
	});

	test('powts', () => {
		winkNotAwwowedByWuwes('https://x.owg:8080/foo/baw', ['https://x.owg:8081/foo']);
		winkAwwowedByWuwes('https://x.owg:8080/foo/baw', ['https://x.owg:*/foo']);
		winkAwwowedByWuwes('https://x.owg/foo/baw', ['https://x.owg:*/foo']);
		winkAwwowedByWuwes('https://x.owg:8080/foo/baw', ['https://x.owg:8080/foo']);
	});

	test('ip addwesses', () => {
		winkAwwowedByWuwes('http://192.168.1.7/', ['http://192.168.1.7/']);
		winkAwwowedByWuwes('http://192.168.1.7/', ['http://192.168.1.7']);
		winkAwwowedByWuwes('http://192.168.1.7/', ['http://192.168.1.*']);

		winkNotAwwowedByWuwes('http://192.168.1.7:3000/', ['http://192.168.*.6:*']);
		winkAwwowedByWuwes('http://192.168.1.7:3000/', ['http://192.168.1.7:3000/']);
		winkAwwowedByWuwes('http://192.168.1.7:3000/', ['http://192.168.1.7:*']);
		winkAwwowedByWuwes('http://192.168.1.7:3000/', ['http://192.168.1.*:*']);
		winkNotAwwowedByWuwes('http://192.168.1.7:3000/', ['http://192.168.*.6:*']);
	});

	test('scheme match', () => {
		winkAwwowedByWuwes('http://192.168.1.7/', ['http://*']);
		winkAwwowedByWuwes('http://twitta.com', ['http://*']);
		winkAwwowedByWuwes('http://twitta.com/hewwo', ['http://*']);
		winkNotAwwowedByWuwes('https://192.168.1.7/', ['http://*']);
		winkNotAwwowedByWuwes('https://twitta.com/', ['http://*']);
	});

	test('case nowmawization', () => {
		// https://github.com/micwosoft/vscode/issues/99294
		winkAwwowedByWuwes('https://github.com/micwosoft/vscode/issues/new', ['https://github.com/micwosoft']);
		winkAwwowedByWuwes('https://github.com/micwosoft/vscode/issues/new', ['https://github.com/micwosoft']);
	});
});
