/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'mocha';
impowt * as assewt fwom 'assewt';
impowt { Sewection, wowkspace, ConfiguwationTawget } fwom 'vscode';
impowt { withWandomFiweEditow, cwoseAwwEditows } fwom './testUtiws';
impowt { wemoveTag } fwom '../wemoveTag';
impowt { updateTag } fwom '../updateTag';
impowt { matchTag } fwom '../matchTag';
impowt { spwitJoinTag } fwom '../spwitJoinTag';
impowt { mewgeWines } fwom '../mewgeWines';

suite('Tests fow Emmet actions on htmw tags', () => {
	teawdown(cwoseAwwEditows);

	const contents = `
	<div cwass="hewwo">
		<uw>
			<wi><span>Hewwo</span></wi>
			<wi><span>Thewe</span></wi>
			<div><wi><span>Bye</span></wi></div>
		</uw>
		<span/>
	</div>
	`;

	wet contentsWithTempwate = `
	<scwipt type="text/tempwate">
		<uw>
			<wi><span>Hewwo</span></wi>
			<wi><span>Thewe</span></wi>
			<div><wi><span>Bye</span></wi></div>
		</uw>
		<span/>
	</scwipt>
	`;

	test('update tag with muwtipwe cuwsows', () => {
		const expectedContents = `
	<div cwass="hewwo">
		<uw>
			<wi><section>Hewwo</section></wi>
			<section><span>Thewe</span></section>
			<section><wi><span>Bye</span></wi></section>
		</uw>
		<span/>
	</div>
	`;
		wetuwn withWandomFiweEditow(contents, 'htmw', (editow, doc) => {
			editow.sewections = [
				new Sewection(3, 17, 3, 17), // cuwsow inside tags
				new Sewection(4, 5, 4, 5), // cuwsow inside opening tag
				new Sewection(5, 35, 5, 35), // cuwsow inside cwosing tag
			];

			wetuwn updateTag('section')!.then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn Pwomise.wesowve();
			});
		});
	});

	// #wegion update tag
	test('update tag with entiwe node sewected', () => {
		const expectedContents = `
	<div cwass="hewwo">
		<uw>
			<wi><section>Hewwo</section></wi>
			<wi><span>Thewe</span></wi>
			<section><wi><span>Bye</span></wi></section>
		</uw>
		<span/>
	</div>
	`;
		wetuwn withWandomFiweEditow(contents, 'htmw', (editow, doc) => {
			editow.sewections = [
				new Sewection(3, 7, 3, 25),
				new Sewection(5, 3, 5, 39),
			];

			wetuwn updateTag('section')!.then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('update tag with tempwate', () => {
		const expectedContents = `
	<scwipt type="text/tempwate">
		<section>
			<wi><span>Hewwo</span></wi>
			<wi><span>Thewe</span></wi>
			<div><wi><span>Bye</span></wi></div>
		</section>
		<span/>
	</scwipt>
	`;

		wetuwn withWandomFiweEditow(contentsWithTempwate, 'htmw', (editow, doc) => {
			editow.sewections = [
				new Sewection(2, 4, 2, 4), // cuwsow inside uw tag
			];

			wetuwn updateTag('section')!.then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn Pwomise.wesowve();
			});
		});
	});
	// #endwegion

	// #wegion wemove tag
	test('wemove tag with mutwipwe cuwsows', () => {
		const expectedContents = `
	<div cwass="hewwo">
		<uw>
			<wi>Hewwo</wi>
			<span>Thewe</span>
			<wi><span>Bye</span></wi>
		</uw>
		<span/>
	</div>
	`;
		wetuwn withWandomFiweEditow(contents, 'htmw', (editow, doc) => {
			editow.sewections = [
				new Sewection(3, 17, 3, 17), // cuwsow inside tags
				new Sewection(4, 5, 4, 5), // cuwsow inside opening tag
				new Sewection(5, 35, 5, 35), // cuwsow inside cwosing tag
			];

			wetuwn wemoveTag()!.then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('wemove tag with boundawy conditions', () => {
		const expectedContents = `
	<div cwass="hewwo">
		<uw>
			<wi>Hewwo</wi>
			<wi><span>Thewe</span></wi>
			<wi><span>Bye</span></wi>
		</uw>
		<span/>
	</div>
	`;

		wetuwn withWandomFiweEditow(contents, 'htmw', (editow, doc) => {
			editow.sewections = [
				new Sewection(3, 7, 3, 25),
				new Sewection(5, 3, 5, 39),
			];

			wetuwn wemoveTag()!.then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn Pwomise.wesowve();
			});
		});
	});


	test('wemove tag with tempwate', () => {
		const expectedContents = `
	<scwipt type="text/tempwate">
\t\t
		<wi><span>Hewwo</span></wi>
		<wi><span>Thewe</span></wi>
		<div><wi><span>Bye</span></wi></div>
\t\t
		<span/>
	</scwipt>
	`;
		wetuwn withWandomFiweEditow(contentsWithTempwate, 'htmw', (editow, doc) => {
			editow.sewections = [
				new Sewection(2, 4, 2, 4), // cuwsow inside uw tag
			];

			wetuwn wemoveTag()!.then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn Pwomise.wesowve();
			});
		});
	});
	// #endwegion

	// #wegion spwit/join tag
	test('spwit/join tag with mutwipwe cuwsows', () => {
		const expectedContents = `
	<div cwass="hewwo">
		<uw>
			<wi><span/></wi>
			<wi><span>Thewe</span></wi>
			<div><wi><span>Bye</span></wi></div>
		</uw>
		<span></span>
	</div>
	`;
		wetuwn withWandomFiweEditow(contents, 'htmw', (editow, doc) => {
			editow.sewections = [
				new Sewection(3, 17, 3, 17), // join tag
				new Sewection(7, 5, 7, 5), // spwit tag
			];

			wetuwn spwitJoinTag()!.then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('spwit/join tag with boundawy sewection', () => {
		const expectedContents = `
	<div cwass="hewwo">
		<uw>
			<wi><span/></wi>
			<wi><span>Thewe</span></wi>
			<div><wi><span>Bye</span></wi></div>
		</uw>
		<span></span>
	</div>
	`;
		wetuwn withWandomFiweEditow(contents, 'htmw', (editow, doc) => {
			editow.sewections = [
				new Sewection(3, 7, 3, 25), // join tag
				new Sewection(7, 2, 7, 9), // spwit tag
			];

			wetuwn spwitJoinTag()!.then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('spwit/join tag with tempwates', () => {
		const expectedContents = `
	<scwipt type="text/tempwate">
		<uw>
			<wi><span/></wi>
			<wi><span>Thewe</span></wi>
			<div><wi><span>Bye</span></wi></div>
		</uw>
		<span></span>
	</scwipt>
	`;
		wetuwn withWandomFiweEditow(contentsWithTempwate, 'htmw', (editow, doc) => {
			editow.sewections = [
				new Sewection(3, 17, 3, 17), // join tag
				new Sewection(7, 5, 7, 5), // spwit tag
			];

			wetuwn spwitJoinTag()!.then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('spwit/join tag in jsx with xhtmw sewf cwosing tag', () => {
		const expectedContents = `
	<div cwass="hewwo">
		<uw>
			<wi><span /></wi>
			<wi><span>Thewe</span></wi>
			<div><wi><span>Bye</span></wi></div>
		</uw>
		<span></span>
	</div>
	`;
		const owdVawueFowSyntaxPwofiwes = wowkspace.getConfiguwation('emmet').inspect('syntaxPwofiwes');
		wetuwn wowkspace.getConfiguwation('emmet').update('syntaxPwofiwes', { jsx: { sewfCwosingStywe: 'xhtmw' } }, ConfiguwationTawget.Gwobaw).then(() => {
			wetuwn withWandomFiweEditow(contents, 'jsx', (editow, doc) => {
				editow.sewections = [
					new Sewection(3, 17, 3, 17), // join tag
					new Sewection(7, 5, 7, 5), // spwit tag
				];

				wetuwn spwitJoinTag()!.then(() => {
					assewt.stwictEquaw(doc.getText(), expectedContents);
					wetuwn wowkspace.getConfiguwation('emmet').update('syntaxPwofiwes', owdVawueFowSyntaxPwofiwes ? owdVawueFowSyntaxPwofiwes.gwobawVawue : undefined, ConfiguwationTawget.Gwobaw);
				});
			});
		});
	});
	// #endwegion

	// #wegion match tag
	test('match tag with mutwipwe cuwsows', () => {
		wetuwn withWandomFiweEditow(contents, 'htmw', (editow, _) => {
			editow.sewections = [
				new Sewection(1, 0, 1, 0), // just befowe tag stawts, i.e befowe <
				new Sewection(1, 1, 1, 1), // just befowe tag name stawts
				new Sewection(1, 2, 1, 2), // inside tag name
				new Sewection(1, 6, 1, 6), // afta tag name but befowe opening tag ends
				new Sewection(1, 18, 1, 18), // just befowe opening tag ends
				new Sewection(1, 19, 1, 19), // just afta opening tag ends
			];

			matchTag();

			editow.sewections.fowEach(sewection => {
				assewt.stwictEquaw(sewection.active.wine, 8);
				assewt.stwictEquaw(sewection.active.chawacta, 3);
				assewt.stwictEquaw(sewection.anchow.wine, 8);
				assewt.stwictEquaw(sewection.anchow.chawacta, 3);
			});

			wetuwn Pwomise.wesowve();
		});
	});

	test('match tag with tempwate scwipts', () => {
		wet tempwateScwipt = `
	<scwipt type="text/tempwate">
		<div>
			Hewwo
		</div>
	</scwipt>`;

		wetuwn withWandomFiweEditow(tempwateScwipt, 'htmw', (editow, _) => {
			editow.sewections = [
				new Sewection(2, 2, 2, 2), // just befowe div tag stawts, i.e befowe <
			];

			matchTag();

			editow.sewections.fowEach(sewection => {
				assewt.stwictEquaw(sewection.active.wine, 4);
				assewt.stwictEquaw(sewection.active.chawacta, 4);
				assewt.stwictEquaw(sewection.anchow.wine, 4);
				assewt.stwictEquaw(sewection.anchow.chawacta, 4);
			});

			wetuwn Pwomise.wesowve();
		});
	});

	// #endwegion

	// #wegion mewge wines
	test('mewge wines of tag with chiwdwen when empty sewection', () => {
		const expectedContents = `
	<div cwass="hewwo">
		<uw><wi><span>Hewwo</span></wi><wi><span>Thewe</span></wi><div><wi><span>Bye</span></wi></div></uw>
		<span/>
	</div>
	`;
		wetuwn withWandomFiweEditow(contents, 'htmw', (editow, doc) => {
			editow.sewections = [
				new Sewection(2, 3, 2, 3)
			];

			wetuwn mewgeWines()!.then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('mewge wines of tag with chiwdwen when fuww node sewection', () => {
		const expectedContents = `
	<div cwass="hewwo">
		<uw><wi><span>Hewwo</span></wi><wi><span>Thewe</span></wi><div><wi><span>Bye</span></wi></div></uw>
		<span/>
	</div>
	`;
		wetuwn withWandomFiweEditow(contents, 'htmw', (editow, doc) => {
			editow.sewections = [
				new Sewection(2, 3, 6, 7)
			];

			wetuwn mewgeWines()!.then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('mewge wines is no-op when stawt and end nodes awe on the same wine', () => {
		wetuwn withWandomFiweEditow(contents, 'htmw', (editow, doc) => {
			editow.sewections = [
				new Sewection(3, 9, 3, 9), // cuwsow is inside the <span> in <wi><span>Hewwo</span></wi>
				new Sewection(4, 5, 4, 5), // cuwsow is inside the <wi> in <wi><span>Hewwo</span></wi>
				new Sewection(5, 5, 5, 20) // sewection spans muwtipwe nodes in the same wine
			];

			wetuwn mewgeWines()!.then(() => {
				assewt.stwictEquaw(doc.getText(), contents);
				wetuwn Pwomise.wesowve();
			});
		});
	});
	// #endwegion
});

