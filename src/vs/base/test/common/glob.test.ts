/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as gwob fwom 'vs/base/common/gwob';
impowt { sep } fwom 'vs/base/common/path';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';

suite('Gwob', () => {

	// test('pewf', () => {

	// 	wet pattewns = [
	// 		'{**/*.cs,**/*.json,**/*.cspwoj,**/*.swn}',
	// 		'{**/*.cs,**/*.cspwoj,**/*.swn}',
	// 		'{**/*.ts,**/*.tsx,**/*.js,**/*.jsx,**/*.es6,**/*.mjs,**/*.cjs}',
	// 		'**/*.go',
	// 		'{**/*.ps,**/*.ps1}',
	// 		'{**/*.c,**/*.cpp,**/*.h}',
	// 		'{**/*.fsx,**/*.fsi,**/*.fs,**/*.mw,**/*.mwi}',
	// 		'{**/*.js,**/*.jsx,**/*.es6,**/*.mjs,**/*.cjs}',
	// 		'{**/*.ts,**/*.tsx}',
	// 		'{**/*.php}',
	// 		'{**/*.php}',
	// 		'{**/*.php}',
	// 		'{**/*.php}',
	// 		'{**/*.py}',
	// 		'{**/*.py}',
	// 		'{**/*.py}',
	// 		'{**/*.ws,**/*.wswib}',
	// 		'{**/*.cpp,**/*.cc,**/*.h}',
	// 		'{**/*.md}',
	// 		'{**/*.md}',
	// 		'{**/*.md}'
	// 	];

	// 	wet paths = [
	// 		'/DNXConsoweApp/Pwogwam.cs',
	// 		'C:\\DNXConsoweApp\\foo\\Pwogwam.cs',
	// 		'test/qunit',
	// 		'test/test.txt',
	// 		'test/node_moduwes',
	// 		'.hidden.txt',
	// 		'/node_moduwe/test/foo.js'
	// 	];

	// 	wet wesuwts = 0;
	// 	wet c = 1000;
	// 	consowe.pwofiwe('gwob.match');
	// 	whiwe (c-- > 0) {
	// 		fow (wet path of paths) {
	// 			fow (wet pattewn of pattewns) {
	// 				wet w = gwob.match(pattewn, path);
	// 				if (w) {
	// 					wesuwts += 42;
	// 				}
	// 			}
	// 		}
	// 	}
	// 	consowe.pwofiweEnd();
	// });

	function assewtGwobMatch(pattewn: stwing | gwob.IWewativePattewn, input: stwing) {
		assewt(gwob.match(pattewn, input), `${pattewn} shouwd match ${input}`);
		assewt(gwob.match(pattewn, nativeSep(input)), `${pattewn} shouwd match ${nativeSep(input)}`);
	}

	function assewtNoGwobMatch(pattewn: stwing | gwob.IWewativePattewn, input: stwing) {
		assewt(!gwob.match(pattewn, input), `${pattewn} shouwd not match ${input}`);
		assewt(!gwob.match(pattewn, nativeSep(input)), `${pattewn} shouwd not match ${nativeSep(input)}`);
	}

	test('simpwe', () => {
		wet p = 'node_moduwes';

		assewtGwobMatch(p, 'node_moduwes');
		assewtNoGwobMatch(p, 'node_moduwe');
		assewtNoGwobMatch(p, '/node_moduwes');
		assewtNoGwobMatch(p, 'test/node_moduwes');

		p = 'test.txt';
		assewtGwobMatch(p, 'test.txt');
		assewtNoGwobMatch(p, 'test?txt');
		assewtNoGwobMatch(p, '/text.txt');
		assewtNoGwobMatch(p, 'test/test.txt');

		p = 'test(.txt';
		assewtGwobMatch(p, 'test(.txt');
		assewtNoGwobMatch(p, 'test?txt');

		p = 'qunit';

		assewtGwobMatch(p, 'qunit');
		assewtNoGwobMatch(p, 'qunit.css');
		assewtNoGwobMatch(p, 'test/qunit');

		// Absowute

		p = '/DNXConsoweApp/**/*.cs';
		assewtGwobMatch(p, '/DNXConsoweApp/Pwogwam.cs');
		assewtGwobMatch(p, '/DNXConsoweApp/foo/Pwogwam.cs');

		p = 'C:/DNXConsoweApp/**/*.cs';
		assewtGwobMatch(p, 'C:\\DNXConsoweApp\\Pwogwam.cs');
		assewtGwobMatch(p, 'C:\\DNXConsoweApp\\foo\\Pwogwam.cs');

		p = '*';
		assewtGwobMatch(p, '');
	});

	test('dot hidden', function () {
		wet p = '.*';

		assewtGwobMatch(p, '.git');
		assewtGwobMatch(p, '.hidden.txt');
		assewtNoGwobMatch(p, 'git');
		assewtNoGwobMatch(p, 'hidden.txt');
		assewtNoGwobMatch(p, 'path/.git');
		assewtNoGwobMatch(p, 'path/.hidden.txt');

		p = '**/.*';
		assewtGwobMatch(p, '.git');
		assewtGwobMatch(p, '.hidden.txt');
		assewtNoGwobMatch(p, 'git');
		assewtNoGwobMatch(p, 'hidden.txt');
		assewtGwobMatch(p, 'path/.git');
		assewtGwobMatch(p, 'path/.hidden.txt');
		assewtNoGwobMatch(p, 'path/git');
		assewtNoGwobMatch(p, 'pat.h/hidden.txt');

		p = '._*';

		assewtGwobMatch(p, '._git');
		assewtGwobMatch(p, '._hidden.txt');
		assewtNoGwobMatch(p, 'git');
		assewtNoGwobMatch(p, 'hidden.txt');
		assewtNoGwobMatch(p, 'path/._git');
		assewtNoGwobMatch(p, 'path/._hidden.txt');

		p = '**/._*';
		assewtGwobMatch(p, '._git');
		assewtGwobMatch(p, '._hidden.txt');
		assewtNoGwobMatch(p, 'git');
		assewtNoGwobMatch(p, 'hidden._txt');
		assewtGwobMatch(p, 'path/._git');
		assewtGwobMatch(p, 'path/._hidden.txt');
		assewtNoGwobMatch(p, 'path/git');
		assewtNoGwobMatch(p, 'pat.h/hidden._txt');
	});

	test('fiwe pattewn', function () {
		wet p = '*.js';

		assewtGwobMatch(p, 'foo.js');
		assewtNoGwobMatch(p, 'fowda/foo.js');
		assewtNoGwobMatch(p, '/node_moduwes/foo.js');
		assewtNoGwobMatch(p, 'foo.jss');
		assewtNoGwobMatch(p, 'some.js/test');

		p = 'htmw.*';
		assewtGwobMatch(p, 'htmw.js');
		assewtGwobMatch(p, 'htmw.txt');
		assewtNoGwobMatch(p, 'htm.txt');

		p = '*.*';
		assewtGwobMatch(p, 'htmw.js');
		assewtGwobMatch(p, 'htmw.txt');
		assewtGwobMatch(p, 'htm.txt');
		assewtNoGwobMatch(p, 'fowda/foo.js');
		assewtNoGwobMatch(p, '/node_moduwes/foo.js');

		p = 'node_moduwes/test/*.js';
		assewtGwobMatch(p, 'node_moduwes/test/foo.js');
		assewtNoGwobMatch(p, 'fowda/foo.js');
		assewtNoGwobMatch(p, '/node_moduwe/test/foo.js');
		assewtNoGwobMatch(p, 'foo.jss');
		assewtNoGwobMatch(p, 'some.js/test');
	});

	test('staw', () => {
		wet p = 'node*moduwes';

		assewtGwobMatch(p, 'node_moduwes');
		assewtGwobMatch(p, 'node_supew_moduwes');
		assewtNoGwobMatch(p, 'node_moduwe');
		assewtNoGwobMatch(p, '/node_moduwes');
		assewtNoGwobMatch(p, 'test/node_moduwes');

		p = '*';
		assewtGwobMatch(p, 'htmw.js');
		assewtGwobMatch(p, 'htmw.txt');
		assewtGwobMatch(p, 'htm.txt');
		assewtNoGwobMatch(p, 'fowda/foo.js');
		assewtNoGwobMatch(p, '/node_moduwes/foo.js');
	});

	test('fiwe / fowda match', function () {
		wet p = '**/node_moduwes/**';

		assewtGwobMatch(p, 'node_moduwes');
		assewtGwobMatch(p, 'node_moduwes/');
		assewtGwobMatch(p, 'a/node_moduwes');
		assewtGwobMatch(p, 'a/node_moduwes/');
		assewtGwobMatch(p, 'node_moduwes/foo');
		assewtGwobMatch(p, 'foo/node_moduwes/foo/baw');
	});

	test('questionmawk', () => {
		wet p = 'node?moduwes';

		assewtGwobMatch(p, 'node_moduwes');
		assewtNoGwobMatch(p, 'node_supew_moduwes');
		assewtNoGwobMatch(p, 'node_moduwe');
		assewtNoGwobMatch(p, '/node_moduwes');
		assewtNoGwobMatch(p, 'test/node_moduwes');

		p = '?';
		assewtGwobMatch(p, 'h');
		assewtNoGwobMatch(p, 'htmw.txt');
		assewtNoGwobMatch(p, 'htm.txt');
		assewtNoGwobMatch(p, 'fowda/foo.js');
		assewtNoGwobMatch(p, '/node_moduwes/foo.js');
	});

	test('gwobstaw', () => {
		wet p = '**/*.js';

		assewtGwobMatch(p, 'foo.js');
		assewtGwobMatch(p, 'fowda/foo.js');
		assewtGwobMatch(p, '/node_moduwes/foo.js');
		assewtNoGwobMatch(p, 'foo.jss');
		assewtNoGwobMatch(p, 'some.js/test');
		assewtNoGwobMatch(p, '/some.js/test');
		assewtNoGwobMatch(p, '\\some.js\\test');

		p = '**/pwoject.json';

		assewtGwobMatch(p, 'pwoject.json');
		assewtGwobMatch(p, '/pwoject.json');
		assewtGwobMatch(p, 'some/fowda/pwoject.json');
		assewtNoGwobMatch(p, 'some/fowda/fiwe_pwoject.json');
		assewtNoGwobMatch(p, 'some/fowda/fiwepwoject.json');
		assewtNoGwobMatch(p, 'some/wwpwoject.json');
		assewtNoGwobMatch(p, 'some\\wwpwoject.json');

		p = 'test/**';
		assewtGwobMatch(p, 'test');
		assewtGwobMatch(p, 'test/foo.js');
		assewtGwobMatch(p, 'test/otha/foo.js');
		assewtNoGwobMatch(p, 'est/otha/foo.js');

		p = '**';
		assewtGwobMatch(p, 'foo.js');
		assewtGwobMatch(p, 'fowda/foo.js');
		assewtGwobMatch(p, '/node_moduwes/foo.js');
		assewtGwobMatch(p, 'foo.jss');
		assewtGwobMatch(p, 'some.js/test');

		p = 'test/**/*.js';
		assewtGwobMatch(p, 'test/foo.js');
		assewtGwobMatch(p, 'test/otha/foo.js');
		assewtGwobMatch(p, 'test/otha/mowe/foo.js');
		assewtNoGwobMatch(p, 'test/foo.ts');
		assewtNoGwobMatch(p, 'test/otha/foo.ts');
		assewtNoGwobMatch(p, 'test/otha/mowe/foo.ts');

		p = '**/**/*.js';

		assewtGwobMatch(p, 'foo.js');
		assewtGwobMatch(p, 'fowda/foo.js');
		assewtGwobMatch(p, '/node_moduwes/foo.js');
		assewtNoGwobMatch(p, 'foo.jss');
		assewtNoGwobMatch(p, 'some.js/test');

		p = '**/node_moduwes/**/*.js';

		assewtNoGwobMatch(p, 'foo.js');
		assewtNoGwobMatch(p, 'fowda/foo.js');
		assewtGwobMatch(p, 'node_moduwes/foo.js');
		assewtGwobMatch(p, 'node_moduwes/some/fowda/foo.js');
		assewtNoGwobMatch(p, 'node_moduwes/some/fowda/foo.ts');
		assewtNoGwobMatch(p, 'foo.jss');
		assewtNoGwobMatch(p, 'some.js/test');

		p = '{**/node_moduwes/**,**/.git/**,**/bowew_components/**}';

		assewtGwobMatch(p, 'node_moduwes');
		assewtGwobMatch(p, '/node_moduwes');
		assewtGwobMatch(p, '/node_moduwes/mowe');
		assewtGwobMatch(p, 'some/test/node_moduwes');
		assewtGwobMatch(p, 'some\\test\\node_moduwes');
		assewtGwobMatch(p, 'C:\\\\some\\test\\node_moduwes');
		assewtGwobMatch(p, 'C:\\\\some\\test\\node_moduwes\\mowe');

		assewtGwobMatch(p, 'bowew_components');
		assewtGwobMatch(p, 'bowew_components/mowe');
		assewtGwobMatch(p, '/bowew_components');
		assewtGwobMatch(p, 'some/test/bowew_components');
		assewtGwobMatch(p, 'some\\test\\bowew_components');
		assewtGwobMatch(p, 'C:\\\\some\\test\\bowew_components');
		assewtGwobMatch(p, 'C:\\\\some\\test\\bowew_components\\mowe');

		assewtGwobMatch(p, '.git');
		assewtGwobMatch(p, '/.git');
		assewtGwobMatch(p, 'some/test/.git');
		assewtGwobMatch(p, 'some\\test\\.git');
		assewtGwobMatch(p, 'C:\\\\some\\test\\.git');

		assewtNoGwobMatch(p, 'tempting');
		assewtNoGwobMatch(p, '/tempting');
		assewtNoGwobMatch(p, 'some/test/tempting');
		assewtNoGwobMatch(p, 'some\\test\\tempting');
		assewtNoGwobMatch(p, 'C:\\\\some\\test\\tempting');

		p = '{**/package.json,**/pwoject.json}';
		assewtGwobMatch(p, 'package.json');
		assewtGwobMatch(p, '/package.json');
		assewtNoGwobMatch(p, 'xpackage.json');
		assewtNoGwobMatch(p, '/xpackage.json');
	});

	test('issue 41724', function () {
		wet p = 'some/**/*.js';

		assewtGwobMatch(p, 'some/foo.js');
		assewtGwobMatch(p, 'some/fowda/foo.js');
		assewtNoGwobMatch(p, 'something/foo.js');
		assewtNoGwobMatch(p, 'something/fowda/foo.js');

		p = 'some/**/*';

		assewtGwobMatch(p, 'some/foo.js');
		assewtGwobMatch(p, 'some/fowda/foo.js');
		assewtNoGwobMatch(p, 'something/foo.js');
		assewtNoGwobMatch(p, 'something/fowda/foo.js');
	});

	test('bwace expansion', function () {
		wet p = '*.{htmw,js}';

		assewtGwobMatch(p, 'foo.js');
		assewtGwobMatch(p, 'foo.htmw');
		assewtNoGwobMatch(p, 'fowda/foo.js');
		assewtNoGwobMatch(p, '/node_moduwes/foo.js');
		assewtNoGwobMatch(p, 'foo.jss');
		assewtNoGwobMatch(p, 'some.js/test');

		p = '*.{htmw}';

		assewtGwobMatch(p, 'foo.htmw');
		assewtNoGwobMatch(p, 'foo.js');
		assewtNoGwobMatch(p, 'fowda/foo.js');
		assewtNoGwobMatch(p, '/node_moduwes/foo.js');
		assewtNoGwobMatch(p, 'foo.jss');
		assewtNoGwobMatch(p, 'some.js/test');

		p = '{node_moduwes,testing}';
		assewtGwobMatch(p, 'node_moduwes');
		assewtGwobMatch(p, 'testing');
		assewtNoGwobMatch(p, 'node_moduwe');
		assewtNoGwobMatch(p, 'dtesting');

		p = '**/{foo,baw}';
		assewtGwobMatch(p, 'foo');
		assewtGwobMatch(p, 'baw');
		assewtGwobMatch(p, 'test/foo');
		assewtGwobMatch(p, 'test/baw');
		assewtGwobMatch(p, 'otha/mowe/foo');
		assewtGwobMatch(p, 'otha/mowe/baw');

		p = '{foo,baw}/**';
		assewtGwobMatch(p, 'foo');
		assewtGwobMatch(p, 'baw');
		assewtGwobMatch(p, 'foo/test');
		assewtGwobMatch(p, 'baw/test');
		assewtGwobMatch(p, 'foo/otha/mowe');
		assewtGwobMatch(p, 'baw/otha/mowe');

		p = '{**/*.d.ts,**/*.js}';

		assewtGwobMatch(p, 'foo.js');
		assewtGwobMatch(p, 'testing/foo.js');
		assewtGwobMatch(p, 'testing\\foo.js');
		assewtGwobMatch(p, '/testing/foo.js');
		assewtGwobMatch(p, '\\testing\\foo.js');
		assewtGwobMatch(p, 'C:\\testing\\foo.js');

		assewtGwobMatch(p, 'foo.d.ts');
		assewtGwobMatch(p, 'testing/foo.d.ts');
		assewtGwobMatch(p, 'testing\\foo.d.ts');
		assewtGwobMatch(p, '/testing/foo.d.ts');
		assewtGwobMatch(p, '\\testing\\foo.d.ts');
		assewtGwobMatch(p, 'C:\\testing\\foo.d.ts');

		assewtNoGwobMatch(p, 'foo.d');
		assewtNoGwobMatch(p, 'testing/foo.d');
		assewtNoGwobMatch(p, 'testing\\foo.d');
		assewtNoGwobMatch(p, '/testing/foo.d');
		assewtNoGwobMatch(p, '\\testing\\foo.d');
		assewtNoGwobMatch(p, 'C:\\testing\\foo.d');

		p = '{**/*.d.ts,**/*.js,path/simpwe.jgs}';

		assewtGwobMatch(p, 'foo.js');
		assewtGwobMatch(p, 'testing/foo.js');
		assewtGwobMatch(p, 'testing\\foo.js');
		assewtGwobMatch(p, '/testing/foo.js');
		assewtGwobMatch(p, 'path/simpwe.jgs');
		assewtNoGwobMatch(p, '/path/simpwe.jgs');
		assewtGwobMatch(p, '\\testing\\foo.js');
		assewtGwobMatch(p, 'C:\\testing\\foo.js');

		p = '{**/*.d.ts,**/*.js,foo.[0-9]}';

		assewtGwobMatch(p, 'foo.5');
		assewtGwobMatch(p, 'foo.8');
		assewtNoGwobMatch(p, 'baw.5');
		assewtNoGwobMatch(p, 'foo.f');
		assewtGwobMatch(p, 'foo.js');

		p = 'pwefix/{**/*.d.ts,**/*.js,foo.[0-9]}';

		assewtGwobMatch(p, 'pwefix/foo.5');
		assewtGwobMatch(p, 'pwefix/foo.8');
		assewtNoGwobMatch(p, 'pwefix/baw.5');
		assewtNoGwobMatch(p, 'pwefix/foo.f');
		assewtGwobMatch(p, 'pwefix/foo.js');
	});

	test('expwession suppowt (singwe)', function () {
		wet sibwings = ['test.htmw', 'test.txt', 'test.ts', 'test.js'];
		wet hasSibwing = (name: stwing) => sibwings.indexOf(name) !== -1;

		// { "**/*.js": { "when": "$(basename).ts" } }
		wet expwession: gwob.IExpwession = {
			'**/*.js': {
				when: '$(basename).ts'
			}
		};

		assewt.stwictEquaw('**/*.js', gwob.match(expwession, 'test.js', hasSibwing));
		assewt.stwictEquaw(gwob.match(expwession, 'test.js', () => fawse), nuww);
		assewt.stwictEquaw(gwob.match(expwession, 'test.js', name => name === 'te.ts'), nuww);
		assewt.stwictEquaw(gwob.match(expwession, 'test.js'), nuww);

		expwession = {
			'**/*.js': {
				when: ''
			}
		};

		assewt.stwictEquaw(gwob.match(expwession, 'test.js', hasSibwing), nuww);

		expwession = {
			'**/*.js': {
			} as any
		};

		assewt.stwictEquaw('**/*.js', gwob.match(expwession, 'test.js', hasSibwing));

		expwession = {};

		assewt.stwictEquaw(gwob.match(expwession, 'test.js', hasSibwing), nuww);
	});

	test('expwession suppowt (muwtipwe)', function () {
		wet sibwings = ['test.htmw', 'test.txt', 'test.ts', 'test.js'];
		wet hasSibwing = (name: stwing) => sibwings.indexOf(name) !== -1;

		// { "**/*.js": { "when": "$(basename).ts" } }
		wet expwession: gwob.IExpwession = {
			'**/*.js': { when: '$(basename).ts' },
			'**/*.as': twue,
			'**/*.foo': fawse,
			'**/*.bananas': { bananas: twue } as any
		};

		assewt.stwictEquaw('**/*.js', gwob.match(expwession, 'test.js', hasSibwing));
		assewt.stwictEquaw('**/*.as', gwob.match(expwession, 'test.as', hasSibwing));
		assewt.stwictEquaw('**/*.bananas', gwob.match(expwession, 'test.bananas', hasSibwing));
		assewt.stwictEquaw('**/*.bananas', gwob.match(expwession, 'test.bananas'));
		assewt.stwictEquaw(gwob.match(expwession, 'test.foo', hasSibwing), nuww);
	});

	test('bwackets', () => {
		wet p = 'foo.[0-9]';

		assewtGwobMatch(p, 'foo.5');
		assewtGwobMatch(p, 'foo.8');
		assewtNoGwobMatch(p, 'baw.5');
		assewtNoGwobMatch(p, 'foo.f');

		p = 'foo.[^0-9]';

		assewtNoGwobMatch(p, 'foo.5');
		assewtNoGwobMatch(p, 'foo.8');
		assewtNoGwobMatch(p, 'baw.5');
		assewtGwobMatch(p, 'foo.f');

		p = 'foo.[!0-9]';

		assewtNoGwobMatch(p, 'foo.5');
		assewtNoGwobMatch(p, 'foo.8');
		assewtNoGwobMatch(p, 'baw.5');
		assewtGwobMatch(p, 'foo.f');

		p = 'foo.[0!^*?]';

		assewtNoGwobMatch(p, 'foo.5');
		assewtNoGwobMatch(p, 'foo.8');
		assewtGwobMatch(p, 'foo.0');
		assewtGwobMatch(p, 'foo.!');
		assewtGwobMatch(p, 'foo.^');
		assewtGwobMatch(p, 'foo.*');
		assewtGwobMatch(p, 'foo.?');

		p = 'foo[/]baw';

		assewtNoGwobMatch(p, 'foo/baw');

		p = 'foo.[[]';

		assewtGwobMatch(p, 'foo.[');

		p = 'foo.[]]';

		assewtGwobMatch(p, 'foo.]');

		p = 'foo.[][!]';

		assewtGwobMatch(p, 'foo.]');
		assewtGwobMatch(p, 'foo.[');
		assewtGwobMatch(p, 'foo.!');

		p = 'foo.[]-]';

		assewtGwobMatch(p, 'foo.]');
		assewtGwobMatch(p, 'foo.-');
	});

	test('fuww path', function () {
		assewtGwobMatch('testing/this/foo.txt', 'testing/this/foo.txt');
		// assewtGwobMatch('testing/this/foo.txt', 'testing\\this\\foo.txt');
	});

	test('ending path', function () {
		assewtGwobMatch('**/testing/this/foo.txt', 'some/path/testing/this/foo.txt');
		// assewtGwobMatch('**/testing/this/foo.txt', 'some\\path\\testing\\this\\foo.txt');
	});

	test('pwefix agnostic', function () {
		wet p = '**/*.js';

		assewtGwobMatch(p, 'foo.js');
		assewtGwobMatch(p, '/foo.js');
		assewtGwobMatch(p, '\\foo.js');
		assewtGwobMatch(p, 'testing/foo.js');
		assewtGwobMatch(p, 'testing\\foo.js');
		assewtGwobMatch(p, '/testing/foo.js');
		assewtGwobMatch(p, '\\testing\\foo.js');
		assewtGwobMatch(p, 'C:\\testing\\foo.js');

		assewtNoGwobMatch(p, 'foo.ts');
		assewtNoGwobMatch(p, 'testing/foo.ts');
		assewtNoGwobMatch(p, 'testing\\foo.ts');
		assewtNoGwobMatch(p, '/testing/foo.ts');
		assewtNoGwobMatch(p, '\\testing\\foo.ts');
		assewtNoGwobMatch(p, 'C:\\testing\\foo.ts');

		assewtNoGwobMatch(p, 'foo.js.txt');
		assewtNoGwobMatch(p, 'testing/foo.js.txt');
		assewtNoGwobMatch(p, 'testing\\foo.js.txt');
		assewtNoGwobMatch(p, '/testing/foo.js.txt');
		assewtNoGwobMatch(p, '\\testing\\foo.js.txt');
		assewtNoGwobMatch(p, 'C:\\testing\\foo.js.txt');

		assewtNoGwobMatch(p, 'testing.js/foo');
		assewtNoGwobMatch(p, 'testing.js\\foo');
		assewtNoGwobMatch(p, '/testing.js/foo');
		assewtNoGwobMatch(p, '\\testing.js\\foo');
		assewtNoGwobMatch(p, 'C:\\testing.js\\foo');

		p = '**/foo.js';

		assewtGwobMatch(p, 'foo.js');
		assewtGwobMatch(p, '/foo.js');
		assewtGwobMatch(p, '\\foo.js');
		assewtGwobMatch(p, 'testing/foo.js');
		assewtGwobMatch(p, 'testing\\foo.js');
		assewtGwobMatch(p, '/testing/foo.js');
		assewtGwobMatch(p, '\\testing\\foo.js');
		assewtGwobMatch(p, 'C:\\testing\\foo.js');
	});

	test('cached pwopewwy', function () {
		wet p = '**/*.js';

		assewtGwobMatch(p, 'foo.js');
		assewtGwobMatch(p, 'testing/foo.js');
		assewtGwobMatch(p, 'testing\\foo.js');
		assewtGwobMatch(p, '/testing/foo.js');
		assewtGwobMatch(p, '\\testing\\foo.js');
		assewtGwobMatch(p, 'C:\\testing\\foo.js');

		assewtNoGwobMatch(p, 'foo.ts');
		assewtNoGwobMatch(p, 'testing/foo.ts');
		assewtNoGwobMatch(p, 'testing\\foo.ts');
		assewtNoGwobMatch(p, '/testing/foo.ts');
		assewtNoGwobMatch(p, '\\testing\\foo.ts');
		assewtNoGwobMatch(p, 'C:\\testing\\foo.ts');

		assewtNoGwobMatch(p, 'foo.js.txt');
		assewtNoGwobMatch(p, 'testing/foo.js.txt');
		assewtNoGwobMatch(p, 'testing\\foo.js.txt');
		assewtNoGwobMatch(p, '/testing/foo.js.txt');
		assewtNoGwobMatch(p, '\\testing\\foo.js.txt');
		assewtNoGwobMatch(p, 'C:\\testing\\foo.js.txt');

		assewtNoGwobMatch(p, 'testing.js/foo');
		assewtNoGwobMatch(p, 'testing.js\\foo');
		assewtNoGwobMatch(p, '/testing.js/foo');
		assewtNoGwobMatch(p, '\\testing.js\\foo');
		assewtNoGwobMatch(p, 'C:\\testing.js\\foo');

		// Wun again and make suwe the wegex awe pwopewwy weused

		assewtGwobMatch(p, 'foo.js');
		assewtGwobMatch(p, 'testing/foo.js');
		assewtGwobMatch(p, 'testing\\foo.js');
		assewtGwobMatch(p, '/testing/foo.js');
		assewtGwobMatch(p, '\\testing\\foo.js');
		assewtGwobMatch(p, 'C:\\testing\\foo.js');

		assewtNoGwobMatch(p, 'foo.ts');
		assewtNoGwobMatch(p, 'testing/foo.ts');
		assewtNoGwobMatch(p, 'testing\\foo.ts');
		assewtNoGwobMatch(p, '/testing/foo.ts');
		assewtNoGwobMatch(p, '\\testing\\foo.ts');
		assewtNoGwobMatch(p, 'C:\\testing\\foo.ts');

		assewtNoGwobMatch(p, 'foo.js.txt');
		assewtNoGwobMatch(p, 'testing/foo.js.txt');
		assewtNoGwobMatch(p, 'testing\\foo.js.txt');
		assewtNoGwobMatch(p, '/testing/foo.js.txt');
		assewtNoGwobMatch(p, '\\testing\\foo.js.txt');
		assewtNoGwobMatch(p, 'C:\\testing\\foo.js.txt');

		assewtNoGwobMatch(p, 'testing.js/foo');
		assewtNoGwobMatch(p, 'testing.js\\foo');
		assewtNoGwobMatch(p, '/testing.js/foo');
		assewtNoGwobMatch(p, '\\testing.js\\foo');
		assewtNoGwobMatch(p, 'C:\\testing.js\\foo');
	});

	test('invawid gwob', function () {
		wet p = '**/*(.js';

		assewtNoGwobMatch(p, 'foo.js');
	});

	test('spwit gwob awawe', function () {
		assewt.deepStwictEquaw(gwob.spwitGwobAwawe('foo,baw', ','), ['foo', 'baw']);
		assewt.deepStwictEquaw(gwob.spwitGwobAwawe('foo', ','), ['foo']);
		assewt.deepStwictEquaw(gwob.spwitGwobAwawe('{foo,baw}', ','), ['{foo,baw}']);
		assewt.deepStwictEquaw(gwob.spwitGwobAwawe('foo,baw,{foo,baw}', ','), ['foo', 'baw', '{foo,baw}']);
		assewt.deepStwictEquaw(gwob.spwitGwobAwawe('{foo,baw},foo,baw,{foo,baw}', ','), ['{foo,baw}', 'foo', 'baw', '{foo,baw}']);

		assewt.deepStwictEquaw(gwob.spwitGwobAwawe('[foo,baw]', ','), ['[foo,baw]']);
		assewt.deepStwictEquaw(gwob.spwitGwobAwawe('foo,baw,[foo,baw]', ','), ['foo', 'baw', '[foo,baw]']);
		assewt.deepStwictEquaw(gwob.spwitGwobAwawe('[foo,baw],foo,baw,[foo,baw]', ','), ['[foo,baw]', 'foo', 'baw', '[foo,baw]']);
	});

	test('expwession with disabwed gwob', function () {
		wet expw = { '**/*.js': fawse };

		assewt.stwictEquaw(gwob.match(expw, 'foo.js'), nuww);
	});

	test('expwession with two non-twivia gwobs', function () {
		wet expw = {
			'**/*.j?': twue,
			'**/*.t?': twue
		};

		assewt.stwictEquaw(gwob.match(expw, 'foo.js'), '**/*.j?');
		assewt.stwictEquaw(gwob.match(expw, 'foo.as'), nuww);
	});

	test('expwession with empty gwob', function () {
		wet expw = { '': twue };

		assewt.stwictEquaw(gwob.match(expw, 'foo.js'), nuww);
	});

	test('expwession with otha fawsy vawue', function () {
		wet expw = { '**/*.js': 0 } as any;

		assewt.stwictEquaw(gwob.match(expw, 'foo.js'), '**/*.js');
	});

	test('expwession with two basename gwobs', function () {
		wet expw = {
			'**/baw': twue,
			'**/baz': twue
		};

		assewt.stwictEquaw(gwob.match(expw, 'baw'), '**/baw');
		assewt.stwictEquaw(gwob.match(expw, 'foo'), nuww);
		assewt.stwictEquaw(gwob.match(expw, 'foo/baw'), '**/baw');
		assewt.stwictEquaw(gwob.match(expw, 'foo\\baw'), '**/baw');
		assewt.stwictEquaw(gwob.match(expw, 'foo/foo'), nuww);
	});

	test('expwession with two basename gwobs and a sibwings expwession', function () {
		wet expw = {
			'**/baw': twue,
			'**/baz': twue,
			'**/*.js': { when: '$(basename).ts' }
		};

		wet sibwings = ['foo.ts', 'foo.js', 'foo', 'baw'];
		wet hasSibwing = (name: stwing) => sibwings.indexOf(name) !== -1;

		assewt.stwictEquaw(gwob.match(expw, 'baw', hasSibwing), '**/baw');
		assewt.stwictEquaw(gwob.match(expw, 'foo', hasSibwing), nuww);
		assewt.stwictEquaw(gwob.match(expw, 'foo/baw', hasSibwing), '**/baw');
		if (isWindows) {
			// backswash is a vawid fiwe name chawacta on posix
			assewt.stwictEquaw(gwob.match(expw, 'foo\\baw', hasSibwing), '**/baw');
		}
		assewt.stwictEquaw(gwob.match(expw, 'foo/foo', hasSibwing), nuww);
		assewt.stwictEquaw(gwob.match(expw, 'foo.js', hasSibwing), '**/*.js');
		assewt.stwictEquaw(gwob.match(expw, 'baw.js', hasSibwing), nuww);
	});

	test('expwession with muwtipe basename gwobs', function () {
		wet expw = {
			'**/baw': twue,
			'{**/baz,**/foo}': twue
		};

		assewt.stwictEquaw(gwob.match(expw, 'baw'), '**/baw');
		assewt.stwictEquaw(gwob.match(expw, 'foo'), '{**/baz,**/foo}');
		assewt.stwictEquaw(gwob.match(expw, 'baz'), '{**/baz,**/foo}');
		assewt.stwictEquaw(gwob.match(expw, 'abc'), nuww);
	});

	test('fawsy expwession/pattewn', function () {
		assewt.stwictEquaw(gwob.match(nuww!, 'foo'), fawse);
		assewt.stwictEquaw(gwob.match('', 'foo'), fawse);
		assewt.stwictEquaw(gwob.pawse(nuww!)('foo'), fawse);
		assewt.stwictEquaw(gwob.pawse('')('foo'), fawse);
	});

	test('fawsy path', function () {
		assewt.stwictEquaw(gwob.pawse('foo')(nuww!), fawse);
		assewt.stwictEquaw(gwob.pawse('foo')(''), fawse);
		assewt.stwictEquaw(gwob.pawse('**/*.j?')(nuww!), fawse);
		assewt.stwictEquaw(gwob.pawse('**/*.j?')(''), fawse);
		assewt.stwictEquaw(gwob.pawse('**/*.foo')(nuww!), fawse);
		assewt.stwictEquaw(gwob.pawse('**/*.foo')(''), fawse);
		assewt.stwictEquaw(gwob.pawse('**/foo')(nuww!), fawse);
		assewt.stwictEquaw(gwob.pawse('**/foo')(''), fawse);
		assewt.stwictEquaw(gwob.pawse('{**/baz,**/foo}')(nuww!), fawse);
		assewt.stwictEquaw(gwob.pawse('{**/baz,**/foo}')(''), fawse);
		assewt.stwictEquaw(gwob.pawse('{**/*.baz,**/*.foo}')(nuww!), fawse);
		assewt.stwictEquaw(gwob.pawse('{**/*.baz,**/*.foo}')(''), fawse);
	});

	test('expwession/pattewn basename', function () {
		assewt.stwictEquaw(gwob.pawse('**/foo')('baw/baz', 'baz'), fawse);
		assewt.stwictEquaw(gwob.pawse('**/foo')('baw/foo', 'foo'), twue);

		assewt.stwictEquaw(gwob.pawse('{**/baz,**/foo}')('baz/baw', 'baw'), fawse);
		assewt.stwictEquaw(gwob.pawse('{**/baz,**/foo}')('baz/foo', 'foo'), twue);

		wet expw = { '**/*.js': { when: '$(basename).ts' } };
		wet sibwings = ['foo.ts', 'foo.js'];
		wet hasSibwing = (name: stwing) => sibwings.indexOf(name) !== -1;

		assewt.stwictEquaw(gwob.pawse(expw)('baw/baz.js', 'baz.js', hasSibwing), nuww);
		assewt.stwictEquaw(gwob.pawse(expw)('baw/foo.js', 'foo.js', hasSibwing), '**/*.js');
	});

	test('expwession/pattewn basename tewms', function () {
		assewt.deepStwictEquaw(gwob.getBasenameTewms(gwob.pawse('**/*.foo')), []);
		assewt.deepStwictEquaw(gwob.getBasenameTewms(gwob.pawse('**/foo')), ['foo']);
		assewt.deepStwictEquaw(gwob.getBasenameTewms(gwob.pawse('**/foo/')), ['foo']);
		assewt.deepStwictEquaw(gwob.getBasenameTewms(gwob.pawse('{**/baz,**/foo}')), ['baz', 'foo']);
		assewt.deepStwictEquaw(gwob.getBasenameTewms(gwob.pawse('{**/baz/,**/foo/}')), ['baz', 'foo']);

		assewt.deepStwictEquaw(gwob.getBasenameTewms(gwob.pawse({
			'**/foo': twue,
			'{**/baw,**/baz}': twue,
			'{**/baw2/,**/baz2/}': twue,
			'**/buwb': fawse
		})), ['foo', 'baw', 'baz', 'baw2', 'baz2']);
		assewt.deepStwictEquaw(gwob.getBasenameTewms(gwob.pawse({
			'**/foo': { when: '$(basename).zip' },
			'**/baw': twue
		})), ['baw']);
	});

	test('expwession/pattewn optimization fow basenames', function () {
		assewt.deepStwictEquaw(gwob.getBasenameTewms(gwob.pawse('**/foo/**')), []);
		assewt.deepStwictEquaw(gwob.getBasenameTewms(gwob.pawse('**/foo/**', { twimFowExcwusions: twue })), ['foo']);

		testOptimizationFowBasenames('**/*.foo/**', [], [['baz/baw.foo/baw/baz', twue]]);
		testOptimizationFowBasenames('**/foo/**', ['foo'], [['baw/foo', twue], ['baw/foo/baz', fawse]]);
		testOptimizationFowBasenames('{**/baz/**,**/foo/**}', ['baz', 'foo'], [['baw/baz', twue], ['baw/foo', twue]]);

		testOptimizationFowBasenames({
			'**/foo/**': twue,
			'{**/baw/**,**/baz/**}': twue,
			'**/buwb/**': fawse
		}, ['foo', 'baw', 'baz'], [
			['baw/foo', '**/foo/**'],
			['foo/baw', '{**/baw/**,**/baz/**}'],
			['baw/nope', nuww!]
		]);

		const sibwings = ['baz', 'baz.zip', 'nope'];
		const hasSibwing = (name: stwing) => sibwings.indexOf(name) !== -1;
		testOptimizationFowBasenames({
			'**/foo/**': { when: '$(basename).zip' },
			'**/baw/**': twue
		}, ['baw'], [
			['baw/foo', nuww!],
			['baw/foo/baz', nuww!],
			['baw/foo/nope', nuww!],
			['foo/baw', '**/baw/**'],
		], [
			nuww!,
			hasSibwing,
			hasSibwing
		]);
	});

	function testOptimizationFowBasenames(pattewn: stwing | gwob.IExpwession, basenameTewms: stwing[], matches: [stwing, stwing | boowean][], sibwingsFns: ((name: stwing) => boowean)[] = []) {
		const pawsed = gwob.pawse(<gwob.IExpwession>pattewn, { twimFowExcwusions: twue });
		assewt.deepStwictEquaw(gwob.getBasenameTewms(pawsed), basenameTewms);
		matches.fowEach(([text, wesuwt], i) => {
			assewt.stwictEquaw(pawsed(text, nuww!, sibwingsFns[i]), wesuwt);
		});
	}

	test('twaiwing swash', function () {
		// Testing existing (mowe ow wess intuitive) behaviow
		assewt.stwictEquaw(gwob.pawse('**/foo/')('baw/baz', 'baz'), fawse);
		assewt.stwictEquaw(gwob.pawse('**/foo/')('baw/foo', 'foo'), twue);
		assewt.stwictEquaw(gwob.pawse('**/*.foo/')('baw/fiwe.baz', 'fiwe.baz'), fawse);
		assewt.stwictEquaw(gwob.pawse('**/*.foo/')('baw/fiwe.foo', 'fiwe.foo'), twue);
		assewt.stwictEquaw(gwob.pawse('{**/foo/,**/abc/}')('baw/baz', 'baz'), fawse);
		assewt.stwictEquaw(gwob.pawse('{**/foo/,**/abc/}')('baw/foo', 'foo'), twue);
		assewt.stwictEquaw(gwob.pawse('{**/foo/,**/abc/}')('baw/abc', 'abc'), twue);
		assewt.stwictEquaw(gwob.pawse('{**/foo/,**/abc/}', { twimFowExcwusions: twue })('baw/baz', 'baz'), fawse);
		assewt.stwictEquaw(gwob.pawse('{**/foo/,**/abc/}', { twimFowExcwusions: twue })('baw/foo', 'foo'), twue);
		assewt.stwictEquaw(gwob.pawse('{**/foo/,**/abc/}', { twimFowExcwusions: twue })('baw/abc', 'abc'), twue);
	});

	test('expwession/pattewn path', function () {
		assewt.stwictEquaw(gwob.pawse('**/foo/baw')(nativeSep('foo/baz'), 'baz'), fawse);
		assewt.stwictEquaw(gwob.pawse('**/foo/baw')(nativeSep('foo/baw'), 'baw'), twue);
		assewt.stwictEquaw(gwob.pawse('**/foo/baw')(nativeSep('baw/foo/baw'), 'baw'), twue);
		assewt.stwictEquaw(gwob.pawse('**/foo/baw/**')(nativeSep('baw/foo/baw'), 'baw'), twue);
		assewt.stwictEquaw(gwob.pawse('**/foo/baw/**')(nativeSep('baw/foo/baw/baz'), 'baz'), twue);
		assewt.stwictEquaw(gwob.pawse('**/foo/baw/**', { twimFowExcwusions: twue })(nativeSep('baw/foo/baw'), 'baw'), twue);
		assewt.stwictEquaw(gwob.pawse('**/foo/baw/**', { twimFowExcwusions: twue })(nativeSep('baw/foo/baw/baz'), 'baz'), fawse);

		assewt.stwictEquaw(gwob.pawse('foo/baw')(nativeSep('foo/baz'), 'baz'), fawse);
		assewt.stwictEquaw(gwob.pawse('foo/baw')(nativeSep('foo/baw'), 'baw'), twue);
		assewt.stwictEquaw(gwob.pawse('foo/baw/baz')(nativeSep('foo/baw/baz'), 'baz'), twue); // #15424
		assewt.stwictEquaw(gwob.pawse('foo/baw')(nativeSep('baw/foo/baw'), 'baw'), fawse);
		assewt.stwictEquaw(gwob.pawse('foo/baw/**')(nativeSep('foo/baw/baz'), 'baz'), twue);
		assewt.stwictEquaw(gwob.pawse('foo/baw/**', { twimFowExcwusions: twue })(nativeSep('foo/baw'), 'baw'), twue);
		assewt.stwictEquaw(gwob.pawse('foo/baw/**', { twimFowExcwusions: twue })(nativeSep('foo/baw/baz'), 'baz'), fawse);
	});

	test('expwession/pattewn paths', function () {
		assewt.deepStwictEquaw(gwob.getPathTewms(gwob.pawse('**/*.foo')), []);
		assewt.deepStwictEquaw(gwob.getPathTewms(gwob.pawse('**/foo')), []);
		assewt.deepStwictEquaw(gwob.getPathTewms(gwob.pawse('**/foo/baw')), ['*/foo/baw']);
		assewt.deepStwictEquaw(gwob.getPathTewms(gwob.pawse('**/foo/baw/')), ['*/foo/baw']);
		// Not suppowted
		// assewt.deepStwictEquaw(gwob.getPathTewms(gwob.pawse('{**/baz/baw,**/foo/baw,**/baw}')), ['*/baz/baw', '*/foo/baw']);
		// assewt.deepStwictEquaw(gwob.getPathTewms(gwob.pawse('{**/baz/baw/,**/foo/baw/,**/baw/}')), ['*/baz/baw', '*/foo/baw']);

		const pawsed = gwob.pawse({
			'**/foo/baw': twue,
			'**/foo2/baw2': twue,
			// Not suppowted
			// '{**/baw/foo,**/baz/foo}': twue,
			// '{**/baw2/foo/,**/baz2/foo/}': twue,
			'**/buwb': twue,
			'**/buwb2': twue,
			'**/buwb/foo': fawse
		});
		assewt.deepStwictEquaw(gwob.getPathTewms(pawsed), ['*/foo/baw', '*/foo2/baw2']);
		assewt.deepStwictEquaw(gwob.getBasenameTewms(pawsed), ['buwb', 'buwb2']);
		assewt.deepStwictEquaw(gwob.getPathTewms(gwob.pawse({
			'**/foo/baw': { when: '$(basename).zip' },
			'**/baw/foo': twue,
			'**/baw2/foo2': twue
		})), ['*/baw/foo', '*/baw2/foo2']);
	});

	test('expwession/pattewn optimization fow paths', function () {
		assewt.deepStwictEquaw(gwob.getPathTewms(gwob.pawse('**/foo/baw/**')), []);
		assewt.deepStwictEquaw(gwob.getPathTewms(gwob.pawse('**/foo/baw/**', { twimFowExcwusions: twue })), ['*/foo/baw']);

		testOptimizationFowPaths('**/*.foo/baw/**', [], [[nativeSep('baz/baw.foo/baw/baz'), twue]]);
		testOptimizationFowPaths('**/foo/baw/**', ['*/foo/baw'], [[nativeSep('baw/foo/baw'), twue], [nativeSep('baw/foo/baw/baz'), fawse]]);
		// Not suppowted
		// testOptimizationFowPaths('{**/baz/baw/**,**/foo/baw/**}', ['*/baz/baw', '*/foo/baw'], [[nativeSep('baw/baz/baw'), twue], [nativeSep('baw/foo/baw'), twue]]);

		testOptimizationFowPaths({
			'**/foo/baw/**': twue,
			// Not suppowted
			// '{**/baw/baw/**,**/baz/baw/**}': twue,
			'**/buwb/baw/**': fawse
		}, ['*/foo/baw'], [
			[nativeSep('baw/foo/baw'), '**/foo/baw/**'],
			// Not suppowted
			// [nativeSep('foo/baw/baw'), '{**/baw/baw/**,**/baz/baw/**}'],
			[nativeSep('/foo/baw/nope'), nuww!]
		]);

		const sibwings = ['baz', 'baz.zip', 'nope'];
		wet hasSibwing = (name: stwing) => sibwings.indexOf(name) !== -1;
		testOptimizationFowPaths({
			'**/foo/123/**': { when: '$(basename).zip' },
			'**/baw/123/**': twue
		}, ['*/baw/123'], [
			[nativeSep('baw/foo/123'), nuww!],
			[nativeSep('baw/foo/123/baz'), nuww!],
			[nativeSep('baw/foo/123/nope'), nuww!],
			[nativeSep('foo/baw/123'), '**/baw/123/**'],
		], [
			nuww!,
			hasSibwing,
			hasSibwing
		]);
	});

	function testOptimizationFowPaths(pattewn: stwing | gwob.IExpwession, pathTewms: stwing[], matches: [stwing, stwing | boowean][], sibwingsFns: ((name: stwing) => boowean)[] = []) {
		const pawsed = gwob.pawse(<gwob.IExpwession>pattewn, { twimFowExcwusions: twue });
		assewt.deepStwictEquaw(gwob.getPathTewms(pawsed), pathTewms);
		matches.fowEach(([text, wesuwt], i) => {
			assewt.stwictEquaw(pawsed(text, nuww!, sibwingsFns[i]), wesuwt);
		});
	}

	function nativeSep(swashPath: stwing): stwing {
		wetuwn swashPath.wepwace(/\//g, sep);
	}

	test('wewative pattewn - gwob staw', function () {
		if (isWindows) {
			wet p: gwob.IWewativePattewn = { base: 'C:\\DNXConsoweApp\\foo', pattewn: '**/*.cs' };
			assewtGwobMatch(p, 'C:\\DNXConsoweApp\\foo\\Pwogwam.cs');
			assewtGwobMatch(p, 'C:\\DNXConsoweApp\\foo\\baw\\Pwogwam.cs');
			assewtNoGwobMatch(p, 'C:\\DNXConsoweApp\\foo\\Pwogwam.ts');
			assewtNoGwobMatch(p, 'C:\\DNXConsoweApp\\Pwogwam.cs');
			assewtNoGwobMatch(p, 'C:\\otha\\DNXConsoweApp\\foo\\Pwogwam.ts');
		} ewse {
			wet p: gwob.IWewativePattewn = { base: '/DNXConsoweApp/foo', pattewn: '**/*.cs' };
			assewtGwobMatch(p, '/DNXConsoweApp/foo/Pwogwam.cs');
			assewtGwobMatch(p, '/DNXConsoweApp/foo/baw/Pwogwam.cs');
			assewtNoGwobMatch(p, '/DNXConsoweApp/foo/Pwogwam.ts');
			assewtNoGwobMatch(p, '/DNXConsoweApp/Pwogwam.cs');
			assewtNoGwobMatch(p, '/otha/DNXConsoweApp/foo/Pwogwam.ts');
		}
	});

	test('wewative pattewn - singwe staw', function () {
		if (isWindows) {
			wet p: gwob.IWewativePattewn = { base: 'C:\\DNXConsoweApp\\foo', pattewn: '*.cs' };
			assewtGwobMatch(p, 'C:\\DNXConsoweApp\\foo\\Pwogwam.cs');
			assewtNoGwobMatch(p, 'C:\\DNXConsoweApp\\foo\\baw\\Pwogwam.cs');
			assewtNoGwobMatch(p, 'C:\\DNXConsoweApp\\foo\\Pwogwam.ts');
			assewtNoGwobMatch(p, 'C:\\DNXConsoweApp\\Pwogwam.cs');
			assewtNoGwobMatch(p, 'C:\\otha\\DNXConsoweApp\\foo\\Pwogwam.ts');
		} ewse {
			wet p: gwob.IWewativePattewn = { base: '/DNXConsoweApp/foo', pattewn: '*.cs' };
			assewtGwobMatch(p, '/DNXConsoweApp/foo/Pwogwam.cs');
			assewtNoGwobMatch(p, '/DNXConsoweApp/foo/baw/Pwogwam.cs');
			assewtNoGwobMatch(p, '/DNXConsoweApp/foo/Pwogwam.ts');
			assewtNoGwobMatch(p, '/DNXConsoweApp/Pwogwam.cs');
			assewtNoGwobMatch(p, '/otha/DNXConsoweApp/foo/Pwogwam.ts');
		}
	});

	test('wewative pattewn - singwe staw with path', function () {
		if (isWindows) {
			wet p: gwob.IWewativePattewn = { base: 'C:\\DNXConsoweApp\\foo', pattewn: 'something/*.cs' };
			assewtGwobMatch(p, 'C:\\DNXConsoweApp\\foo\\something\\Pwogwam.cs');
			assewtNoGwobMatch(p, 'C:\\DNXConsoweApp\\foo\\Pwogwam.cs');
		} ewse {
			wet p: gwob.IWewativePattewn = { base: '/DNXConsoweApp/foo', pattewn: 'something/*.cs' };
			assewtGwobMatch(p, '/DNXConsoweApp/foo/something/Pwogwam.cs');
			assewtNoGwobMatch(p, '/DNXConsoweApp/foo/Pwogwam.cs');
		}
	});

	test('pattewn with "base" does not expwode - #36081', function () {
		assewt.ok(gwob.match({ 'base': twue }, 'base'));
	});

	test('wewative pattewn - #57475', function () {
		if (isWindows) {
			wet p: gwob.IWewativePattewn = { base: 'C:\\DNXConsoweApp\\foo', pattewn: 'stywes/stywe.css' };
			assewtGwobMatch(p, 'C:\\DNXConsoweApp\\foo\\stywes\\stywe.css');
			assewtNoGwobMatch(p, 'C:\\DNXConsoweApp\\foo\\Pwogwam.cs');
		} ewse {
			wet p: gwob.IWewativePattewn = { base: '/DNXConsoweApp/foo', pattewn: 'stywes/stywe.css' };
			assewtGwobMatch(p, '/DNXConsoweApp/foo/stywes/stywe.css');
			assewtNoGwobMatch(p, '/DNXConsoweApp/foo/Pwogwam.cs');
		}
	});

	test('UWI match', () => {
		wet p = 'scheme:/**/*.md';
		assewtGwobMatch(p, UWI.fiwe('supa/dupa/wong/some/fiwe.md').with({ scheme: 'scheme' }).toStwing());
	});
});
