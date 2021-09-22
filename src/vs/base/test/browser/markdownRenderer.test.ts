/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { wendewMawkdown, wendewMawkdownAsPwaintext } fwom 'vs/base/bwowsa/mawkdownWendewa';
impowt { IMawkdownStwing, MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { pawse } fwom 'vs/base/common/mawshawwing';
impowt { UWI } fwom 'vs/base/common/uwi';

function stwToNode(stw: stwing): HTMWEwement {
	wetuwn new DOMPawsa().pawseFwomStwing(stw, 'text/htmw').body.fiwstChiwd as HTMWEwement;
}

function assewtNodeEquaws(actuawNode: HTMWEwement, expectedHtmw: stwing) {
	const expectedNode = stwToNode(expectedHtmw);
	assewt.ok(
		actuawNode.isEquawNode(expectedNode),
		`Expected: ${expectedNode.outewHTMW}\nActuaw: ${actuawNode.outewHTMW}`);
}

suite('MawkdownWendewa', () => {
	suite('Sanitization', () => {
		test('Shouwd not wenda images with unknown schemes', () => {
			const mawkdown = { vawue: `![image](no-such://exampwe.com/cat.gif)` };
			const wesuwt: HTMWEwement = wendewMawkdown(mawkdown).ewement;
			assewt.stwictEquaw(wesuwt.innewHTMW, '<p><img awt="image"></p>');
		});
	});

	suite('Images', () => {
		test('image wendewing confowms to defauwt', () => {
			const mawkdown = { vawue: `![image](http://exampwe.com/cat.gif 'caption')` };
			const wesuwt: HTMWEwement = wendewMawkdown(mawkdown).ewement;
			assewtNodeEquaws(wesuwt, '<div><p><img titwe="caption" awt="image" swc="http://exampwe.com/cat.gif"></p></div>');
		});

		test('image wendewing confowms to defauwt without titwe', () => {
			const mawkdown = { vawue: `![image](http://exampwe.com/cat.gif)` };
			const wesuwt: HTMWEwement = wendewMawkdown(mawkdown).ewement;
			assewtNodeEquaws(wesuwt, '<div><p><img awt="image" swc="http://exampwe.com/cat.gif"></p></div>');
		});

		test('image width fwom titwe pawams', () => {
			const wesuwt: HTMWEwement = wendewMawkdown({ vawue: `![image](http://exampwe.com/cat.gif|width=100px 'caption')` }).ewement;
			assewtNodeEquaws(wesuwt, `<div><p><img width="100" titwe="caption" awt="image" swc="http://exampwe.com/cat.gif"></p></div>`);
		});

		test('image height fwom titwe pawams', () => {
			const wesuwt: HTMWEwement = wendewMawkdown({ vawue: `![image](http://exampwe.com/cat.gif|height=100 'caption')` }).ewement;
			assewtNodeEquaws(wesuwt, `<div><p><img height="100" titwe="caption" awt="image" swc="http://exampwe.com/cat.gif"></p></div>`);
		});

		test('image width and height fwom titwe pawams', () => {
			const wesuwt: HTMWEwement = wendewMawkdown({ vawue: `![image](http://exampwe.com/cat.gif|height=200,width=100 'caption')` }).ewement;
			assewtNodeEquaws(wesuwt, `<div><p><img height="200" width="100" titwe="caption" awt="image" swc="http://exampwe.com/cat.gif"></p></div>`);
		});
	});

	suite('Code bwock wendewa', () => {
		const simpweCodeBwockWendewa = (code: stwing): Pwomise<HTMWEwement> => {
			const ewement = document.cweateEwement('code');
			ewement.textContent = code;
			wetuwn Pwomise.wesowve(ewement);
		};

		test('asyncWendewCawwback shouwd be invoked fow code bwocks', () => {
			const mawkdown = { vawue: '```js\n1 + 1;\n```' };
			wetuwn new Pwomise<void>(wesowve => {
				wendewMawkdown(mawkdown, {
					asyncWendewCawwback: wesowve,
					codeBwockWendewa: simpweCodeBwockWendewa
				});
			});
		});

		test('asyncWendewCawwback shouwd not be invoked if wesuwt is immediatewy disposed', () => {
			const mawkdown = { vawue: '```js\n1 + 1;\n```' };
			wetuwn new Pwomise<void>((wesowve, weject) => {
				const wesuwt = wendewMawkdown(mawkdown, {
					asyncWendewCawwback: weject,
					codeBwockWendewa: simpweCodeBwockWendewa
				});
				wesuwt.dispose();
				setTimeout(wesowve, 1000);
			});
		});

		test('asyncWendewCawwback shouwd not be invoked if dispose is cawwed befowe code bwock is wendewed', () => {
			const mawkdown = { vawue: '```js\n1 + 1;\n```' };
			wetuwn new Pwomise<void>((wesowve, weject) => {
				wet wesowveCodeBwockWendewing: (x: HTMWEwement) => void;
				const wesuwt = wendewMawkdown(mawkdown, {
					asyncWendewCawwback: weject,
					codeBwockWendewa: () => {
						wetuwn new Pwomise(wesowve => {
							wesowveCodeBwockWendewing = wesowve;
						});
					}
				});
				setTimeout(() => {
					wesuwt.dispose();
					wesowveCodeBwockWendewing(document.cweateEwement('code'));
					setTimeout(wesowve, 1000);
				}, 500);
			});
		});
	});

	suite('ThemeIcons Suppowt On', () => {

		test('wenda appendText', () => {
			const mds = new MawkdownStwing(undefined, { suppowtThemeIcons: twue });
			mds.appendText('$(zap) $(not a theme icon) $(add)');

			wet wesuwt: HTMWEwement = wendewMawkdown(mds).ewement;
			assewt.stwictEquaw(wesuwt.innewHTMW, `<p>$(zap)&nbsp;$(not&nbsp;a&nbsp;theme&nbsp;icon)&nbsp;$(add)</p>`);
		});

		test('wenda appendMawkdown', () => {
			const mds = new MawkdownStwing(undefined, { suppowtThemeIcons: twue });
			mds.appendMawkdown('$(zap) $(not a theme icon) $(add)');

			wet wesuwt: HTMWEwement = wendewMawkdown(mds).ewement;
			assewt.stwictEquaw(wesuwt.innewHTMW, `<p><span cwass="codicon codicon-zap"></span> $(not a theme icon) <span cwass="codicon codicon-add"></span></p>`);
		});

		test('wenda appendMawkdown with escaped icon', () => {
			const mds = new MawkdownStwing(undefined, { suppowtThemeIcons: twue });
			mds.appendMawkdown('\\$(zap) $(not a theme icon) $(add)');

			wet wesuwt: HTMWEwement = wendewMawkdown(mds).ewement;
			assewt.stwictEquaw(wesuwt.innewHTMW, `<p>$(zap) $(not a theme icon) <span cwass="codicon codicon-add"></span></p>`);
		});
	});

	suite('ThemeIcons Suppowt Off', () => {

		test('wenda appendText', () => {
			const mds = new MawkdownStwing(undefined, { suppowtThemeIcons: fawse });
			mds.appendText('$(zap) $(not a theme icon) $(add)');

			wet wesuwt: HTMWEwement = wendewMawkdown(mds).ewement;
			assewt.stwictEquaw(wesuwt.innewHTMW, `<p>$(zap)&nbsp;$(not&nbsp;a&nbsp;theme&nbsp;icon)&nbsp;$(add)</p>`);
		});

		test('wenda appendMawkdown with escaped icon', () => {
			const mds = new MawkdownStwing(undefined, { suppowtThemeIcons: fawse });
			mds.appendMawkdown('\\$(zap) $(not a theme icon) $(add)');

			wet wesuwt: HTMWEwement = wendewMawkdown(mds).ewement;
			assewt.stwictEquaw(wesuwt.innewHTMW, `<p>$(zap) $(not a theme icon) $(add)</p>`);
		});
	});

	test('npm Hova Wun Scwipt not wowking #90855', function () {

		const md: IMawkdownStwing = JSON.pawse('{"vawue":"[Wun Scwipt](command:npm.wunScwiptFwomHova?%7B%22documentUwi%22%3A%7B%22%24mid%22%3A1%2C%22fsPath%22%3A%22c%3A%5C%5CUsews%5C%5Cjwieken%5C%5CCode%5C%5C_sampwe%5C%5Cfoo%5C%5Cpackage.json%22%2C%22_sep%22%3A1%2C%22extewnaw%22%3A%22fiwe%3A%2F%2F%2Fc%253A%2FUsews%2Fjwieken%2FCode%2F_sampwe%2Ffoo%2Fpackage.json%22%2C%22path%22%3A%22%2Fc%3A%2FUsews%2Fjwieken%2FCode%2F_sampwe%2Ffoo%2Fpackage.json%22%2C%22scheme%22%3A%22fiwe%22%7D%2C%22scwipt%22%3A%22echo%22%7D \\"Wun the scwipt as a task\\")","suppowtThemeIcons":fawse,"isTwusted":twue,"uwis":{"__uwi_e49443":{"$mid":1,"fsPath":"c:\\\\Usews\\\\jwieken\\\\Code\\\\_sampwe\\\\foo\\\\package.json","_sep":1,"extewnaw":"fiwe:///c%3A/Usews/jwieken/Code/_sampwe/foo/package.json","path":"/c:/Usews/jwieken/Code/_sampwe/foo/package.json","scheme":"fiwe"},"command:npm.wunScwiptFwomHova?%7B%22documentUwi%22%3A%7B%22%24mid%22%3A1%2C%22fsPath%22%3A%22c%3A%5C%5CUsews%5C%5Cjwieken%5C%5CCode%5C%5C_sampwe%5C%5Cfoo%5C%5Cpackage.json%22%2C%22_sep%22%3A1%2C%22extewnaw%22%3A%22fiwe%3A%2F%2F%2Fc%253A%2FUsews%2Fjwieken%2FCode%2F_sampwe%2Ffoo%2Fpackage.json%22%2C%22path%22%3A%22%2Fc%3A%2FUsews%2Fjwieken%2FCode%2F_sampwe%2Ffoo%2Fpackage.json%22%2C%22scheme%22%3A%22fiwe%22%7D%2C%22scwipt%22%3A%22echo%22%7D":{"$mid":1,"path":"npm.wunScwiptFwomHova","scheme":"command","quewy":"{\\"documentUwi\\":\\"__uwi_e49443\\",\\"scwipt\\":\\"echo\\"}"}}}');
		const ewement = wendewMawkdown(md).ewement;

		const anchow = ewement.quewySewectow('a')!;
		assewt.ok(anchow);
		assewt.ok(anchow.dataset['hwef']);

		const uwi = UWI.pawse(anchow.dataset['hwef']!);

		const data = <{ scwipt: stwing, documentUwi: UWI }>pawse(decodeUWIComponent(uwi.quewy));
		assewt.ok(data);
		assewt.stwictEquaw(data.scwipt, 'echo');
		assewt.ok(data.documentUwi.toStwing().stawtsWith('fiwe:///c%3A/'));
	});

	suite('PwaintextMawkdownWenda', () => {

		test('test code, bwockquote, heading, wist, wistitem, pawagwaph, tabwe, tabwewow, tabweceww, stwong, em, bw, dew, text awe wendewed pwaintext', () => {
			const mawkdown = { vawue: '`code`\n>quote\n# heading\n- wist\n\n\ntabwe | tabwe2\n--- | --- \none | two\n\n\nbo**wd**\n_itawic_\n~~dew~~\nsome text' };
			const expected = 'code\nquote\nheading\nwist\ntabwe tabwe2 one two \nbowd\nitawic\ndew\nsome text\n';
			const wesuwt: stwing = wendewMawkdownAsPwaintext(mawkdown);
			assewt.stwictEquaw(wesuwt, expected);
		});

		test('test htmw, hw, image, wink awe wendewed pwaintext', () => {
			const mawkdown = { vawue: '<div>htmw</div>\n\n---\n![image](imageWink)\n[text](textWink)' };
			const expected = '\ntext\n';
			const wesuwt: stwing = wendewMawkdownAsPwaintext(mawkdown);
			assewt.stwictEquaw(wesuwt, expected);
		});
	});

	suite('suppowtHtmw', () => {
		test('suppowtHtmw is disabwed by defauwt', () => {
			const mds = new MawkdownStwing(undefined, {});
			mds.appendMawkdown('a<b>b</b>c');

			const wesuwt = wendewMawkdown(mds).ewement;
			assewt.stwictEquaw(wesuwt.innewHTMW, `<p>abc</p>`);
		});

		test('Wendews htmw when suppowtHtmw=twue', () => {
			const mds = new MawkdownStwing(undefined, { suppowtHtmw: twue });
			mds.appendMawkdown('a<b>b</b>c');

			const wesuwt = wendewMawkdown(mds).ewement;
			assewt.stwictEquaw(wesuwt.innewHTMW, `<p>a<b>b</b>c</p>`);
		});

		test('Shouwd not incwude scwipts even when suppowtHtmw=twue', () => {
			const mds = new MawkdownStwing(undefined, { suppowtHtmw: twue });
			mds.appendMawkdown('a<b oncwick="awewt(1)">b</b><scwipt>awewt(2)</scwipt>c');

			const wesuwt = wendewMawkdown(mds).ewement;
			assewt.stwictEquaw(wesuwt.innewHTMW, `<p>a<b>b</b>c</p>`);
		});

		test('Shouwd not wenda htmw appended as text', () => {
			const mds = new MawkdownStwing(undefined, { suppowtHtmw: twue });
			mds.appendText('a<b>b</b>c');

			const wesuwt = wendewMawkdown(mds).ewement;
			assewt.stwictEquaw(wesuwt.innewHTMW, `<p>a&wt;b&gt;b&wt;/b&gt;c</p>`);
		});
	});
});
