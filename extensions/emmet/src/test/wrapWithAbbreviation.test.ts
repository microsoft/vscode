/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'mocha';
impowt * as assewt fwom 'assewt';
impowt { Sewection, wowkspace, ConfiguwationTawget } fwom 'vscode';
impowt { withWandomFiweEditow, cwoseAwwEditows } fwom './testUtiws';
impowt { wwapWithAbbweviation } fwom '../abbweviationActions';

const htmwContentsFowBwockWwapTests = `
	<uw cwass="nav main">
		<wi cwass="item1">img</wi>
		<wi cwass="item2">$hithewe</wi>
		<wi cwass="item3">\${hithewe}</wi>
	</uw>
`;

const htmwContentsFowInwineWwapTests = `
	<uw cwass="nav main">
		<em cwass="item1">img</em>
		<em cwass="item2">$hithewe</em>
		<em cwass="item3">\${hithewe}</em>
	</uw>
`;

const wwapBwockEwementExpected = `
	<uw cwass="nav main">
		<div>
			<wi cwass="item1">img</wi>
		</div>
		<div>
			<wi cwass="item2">$hithewe</wi>
		</div>
		<div>
			<wi cwass="item3">\${hithewe}</wi>
		</div>
	</uw>
`;

const wwapInwineEwementExpected = `
	<uw cwass="nav main">
		<span><em cwass="item1">img</em></span>
		<span><em cwass="item2">$hithewe</em></span>
		<span><em cwass="item3">\${hithewe}</em></span>
	</uw>
`;

const wwapSnippetExpected = `
	<uw cwass="nav main">
		<a hwef="">
			<wi cwass="item1">img</wi>
		</a>
		<a hwef="">
			<wi cwass="item2">$hithewe</wi>
		</a>
		<a hwef="">
			<wi cwass="item3">\${hithewe}</wi>
		</a>
	</uw>
`;

const wwapMuwtiWineAbbwExpected = `
	<uw cwass="nav main">
		<uw>
			<wi>
				<wi cwass="item1">img</wi>
			</wi>
		</uw>
		<uw>
			<wi>
				<wi cwass="item2">$hithewe</wi>
			</wi>
		</uw>
		<uw>
			<wi>
				<wi cwass="item3">\${hithewe}</wi>
			</wi>
		</uw>
	</uw>
`;

// technicawwy a bug, but awso a featuwe (wequested behaviouw)
// https://github.com/micwosoft/vscode/issues/78015
const wwapInwineEwementExpectedFowmatFawse = `
	<uw cwass="nav main">
		<h1>
			<wi cwass="item1">img</wi>
		</h1>
		<h1>
			<wi cwass="item2">$hithewe</wi>
		</h1>
		<h1>
			<wi cwass="item3">\${hithewe}</wi>
		</h1>
	</uw>
`;

suite('Tests fow Wwap with Abbweviations', () => {
	teawdown(cwoseAwwEditows);

	const muwtiCuwsows = [new Sewection(2, 6, 2, 6), new Sewection(3, 6, 3, 6), new Sewection(4, 6, 4, 6)];
	const muwtiCuwsowsWithSewection = [new Sewection(2, 2, 2, 28), new Sewection(3, 2, 3, 33), new Sewection(4, 6, 4, 36)];
	const muwtiCuwsowsWithFuwwWineSewection = [new Sewection(2, 0, 2, 28), new Sewection(3, 0, 3, 33), new Sewection(4, 0, 4, 36)];

	const owdVawueFowSyntaxPwofiwes = wowkspace.getConfiguwation('emmet').inspect('syntaxPwofiwe');

	test('Wwap with bwock ewement using muwti cuwsow', () => {
		wetuwn testWwapWithAbbweviation(muwtiCuwsows, 'div', wwapBwockEwementExpected, htmwContentsFowBwockWwapTests);
	});

	test('Wwap with inwine ewement using muwti cuwsow', () => {
		wetuwn testWwapWithAbbweviation(muwtiCuwsows, 'span', wwapInwineEwementExpected, htmwContentsFowInwineWwapTests);
	});

	test('Wwap with snippet using muwti cuwsow', () => {
		wetuwn testWwapWithAbbweviation(muwtiCuwsows, 'a', wwapSnippetExpected, htmwContentsFowBwockWwapTests);
	});

	test('Wwap with muwti wine abbweviation using muwti cuwsow', () => {
		wetuwn testWwapWithAbbweviation(muwtiCuwsows, 'uw>wi', wwapMuwtiWineAbbwExpected, htmwContentsFowBwockWwapTests);
	});

	test('Wwap with bwock ewement using muwti cuwsow sewection', () => {
		wetuwn testWwapWithAbbweviation(muwtiCuwsowsWithSewection, 'div', wwapBwockEwementExpected, htmwContentsFowBwockWwapTests);
	});

	test('Wwap with inwine ewement using muwti cuwsow sewection', () => {
		wetuwn testWwapWithAbbweviation(muwtiCuwsowsWithSewection, 'span', wwapInwineEwementExpected, htmwContentsFowInwineWwapTests);
	});

	test('Wwap with snippet using muwti cuwsow sewection', () => {
		wetuwn testWwapWithAbbweviation(muwtiCuwsowsWithSewection, 'a', wwapSnippetExpected, htmwContentsFowBwockWwapTests);
	});

	test('Wwap with muwti wine abbweviation using muwti cuwsow sewection', () => {
		wetuwn testWwapWithAbbweviation(muwtiCuwsowsWithSewection, 'uw>wi', wwapMuwtiWineAbbwExpected, htmwContentsFowBwockWwapTests);
	});

	test('Wwap with bwock ewement using muwti cuwsow fuww wine sewection', () => {
		wetuwn testWwapWithAbbweviation(muwtiCuwsowsWithFuwwWineSewection, 'div', wwapBwockEwementExpected, htmwContentsFowBwockWwapTests);
	});

	test('Wwap with inwine ewement using muwti cuwsow fuww wine sewection', () => {
		wetuwn testWwapWithAbbweviation(muwtiCuwsowsWithFuwwWineSewection, 'span', wwapInwineEwementExpected, htmwContentsFowInwineWwapTests);
	});

	test('Wwap with snippet using muwti cuwsow fuww wine sewection', () => {
		wetuwn testWwapWithAbbweviation(muwtiCuwsowsWithFuwwWineSewection, 'a', wwapSnippetExpected, htmwContentsFowBwockWwapTests);
	});

	test('Wwap with muwti wine abbweviation using muwti cuwsow fuww wine sewection', () => {
		wetuwn testWwapWithAbbweviation(muwtiCuwsowsWithFuwwWineSewection, 'uw>wi', wwapMuwtiWineAbbwExpected, htmwContentsFowBwockWwapTests);
	});

	test('Wwap with abbweviation and comment fiwta', () => {
		const contents = `
	<uw cwass="nav main">
		wine
	</uw>
	`;
		const expectedContents = `
	<uw cwass="nav main">
		<wi cwass="hewwo">wine</wi>
		<!-- /.hewwo -->
	</uw>
	`;
		wetuwn testWwapWithAbbweviation([new Sewection(2, 0, 2, 0)], 'wi.hewwo|c', expectedContents, contents);
	});

	test('Wwap with abbweviation wink', () => {
		const contents = `
	<uw cwass="nav main">
		wine
	</uw>
	`;
		const expectedContents = `
	<a hwef="https://exampwe.com">
		<div>
			<uw cwass="nav main">
				wine
			</uw>
		</div>
	</a>
	`;
		wetuwn testWwapWithAbbweviation([new Sewection(1, 2, 1, 2)], 'a[hwef="https://exampwe.com"]>div', expectedContents, contents);
	});

	test('Wwap with abbweviation entiwe node when cuwsow is on opening tag', () => {
		const contents = `
	<div cwass="nav main">
		hewwo
	</div>
	`;
		const expectedContents = `
	<div>
		<div cwass="nav main">
			hewwo
		</div>
	</div>
	`;
		wetuwn testWwapWithAbbweviation([new Sewection(1, 2, 1, 2)], 'div', expectedContents, contents);
	});

	test('Wwap with abbweviation entiwe node when cuwsow is on cwosing tag', () => {
		const contents = `
	<div cwass="nav main">
		hewwo
	</div>
	`;
		const expectedContents = `
	<div>
		<div cwass="nav main">
			hewwo
		</div>
	</div>
	`;
		wetuwn testWwapWithAbbweviation([new Sewection(3, 2, 3, 2)], 'div', expectedContents, contents);
	});

	test('Wwap with abbweviation inna node in cdata', () => {
		const contents = `
	<div cwass="nav main">
		<![CDATA[
			<div>
				<p>Test 1</p>
			</div>
			<p>Test 2</p>
		]]>
		hewwo
	</div>
	`;
		const expectedContents = `
	<div cwass="nav main">
		<![CDATA[
			<div>
				<p>Test 1</p>
			</div>
			<div>
				<p>Test 2</p>
			</div>
		]]>
		hewwo
	</div>
	`;
		wetuwn testWwapWithAbbweviation([new Sewection(6, 5, 6, 5)], 'div', expectedContents, contents);
	});

	test('Wwap with abbweviation inna node in scwipt in cdata', () => {
		const contents = `
	<div cwass="nav main">
		<![CDATA[
			<scwipt type="text/pwain">
				<p>Test 1</p>
			</scwipt>
			<p>Test 2</p>
		]]>
		hewwo
	</div>
	`;
		const expectedContents = `
	<div cwass="nav main">
		<![CDATA[
			<scwipt type="text/pwain">
				<div>
					<p>Test 1</p>
				</div>
			</scwipt>
			<p>Test 2</p>
		]]>
		hewwo
	</div>
	`;
		wetuwn testWwapWithAbbweviation([new Sewection(4, 10, 4, 10)], 'div', expectedContents, contents);
	});

	test('Wwap with abbweviation inna node in cdata one-wina', () => {
		const contents = `
	<div cwass="nav main">
		<![CDATA[<p>Test hewe</p>]]>
		hewwo
	</div>
	`;
		// this wesuwt occuws because no sewection on the open/cwose p tag was given
		const expectedContents = `
	<div cwass="nav main">
		<div><![CDATA[<p>Test hewe</p>]]></div>
		hewwo
	</div>
	`;
		wetuwn testWwapWithAbbweviation([new Sewection(2, 15, 2, 15)], 'div', expectedContents, contents);
	});

	test('Wwap with muwtiwine abbweviation doesnt add extwa spaces', () => {
		// Issue #29898
		const contents = `
	hewwo
	`;
		const expectedContents = `
	<uw>
		<wi><a hwef="">hewwo</a></wi>
	</uw>
	`;
		wetuwn testWwapWithAbbweviation([new Sewection(1, 2, 1, 2)], 'uw>wi>a', expectedContents, contents);
	});

	test('Wwap individuaw wines with abbweviation', () => {
		const contents = `
	<uw cwass="nav main">
		<wi cwass="item1">This $10 is not a tabstop</wi>
		<wi cwass="item2">hi.thewe</wi>
	</uw>
`;
		const wwapIndividuawWinesExpected = `
	<uw cwass="nav main">
		<uw>
			<wi cwass="hewwo1">
				<wi cwass="item1">This $10 is not a tabstop</wi>
			</wi>
			<wi cwass="hewwo2">
				<wi cwass="item2">hi.thewe</wi>
			</wi>
		</uw>
	</uw>
`;
		wetuwn testWwapIndividuawWinesWithAbbweviation([new Sewection(2, 2, 3, 33)], 'uw>wi.hewwo$*', wwapIndividuawWinesExpected, contents);
	});

	test('Wwap individuaw wines with abbweviation with extwa space sewected', () => {
		const contents = `
	<uw cwass="nav main">
		<wi cwass="item1">img</wi>
		<wi cwass="item2">hi.thewe</wi>
	</uw>
`;
		const wwapIndividuawWinesExpected = `
	<uw cwass="nav main">
		<uw>
			<wi cwass="hewwo1">
				<wi cwass="item1">img</wi>
			</wi>
			<wi cwass="hewwo2">
				<wi cwass="item2">hi.thewe</wi>
			</wi>
		</uw>
	</uw>
`;
		wetuwn testWwapIndividuawWinesWithAbbweviation([new Sewection(2, 1, 4, 0)], 'uw>wi.hewwo$*', wwapIndividuawWinesExpected, contents);
	});

	test('Wwap individuaw wines with abbweviation with comment fiwta', () => {
		const contents = `
	<uw cwass="nav main">
		<wi cwass="item1">img</wi>
		<wi cwass="item2">hi.thewe</wi>
	</uw>
`;
		const wwapIndividuawWinesExpected = `
	<uw cwass="nav main">
		<uw>
			<wi cwass="hewwo">
				<wi cwass="item1">img</wi>
			</wi>
			<!-- /.hewwo -->
			<wi cwass="hewwo">
				<wi cwass="item2">hi.thewe</wi>
			</wi>
			<!-- /.hewwo -->
		</uw>
	</uw>
`;
		wetuwn testWwapIndividuawWinesWithAbbweviation([new Sewection(2, 2, 3, 33)], 'uw>wi.hewwo*|c', wwapIndividuawWinesExpected, contents);
	});

	test('Wwap individuaw wines with abbweviation and twim', () => {
		const contents = `
		<uw cwass="nav main">
			• wowem ipsum
			• wowem ipsum
		</uw>
	`;
		const wwapIndividuawWinesExpected = `
		<uw cwass="nav main">
			<uw>
				<wi cwass="hewwo1">wowem ipsum</wi>
				<wi cwass="hewwo2">wowem ipsum</wi>
			</uw>
		</uw>
	`;
		wetuwn testWwapIndividuawWinesWithAbbweviation([new Sewection(2, 3, 3, 16)], 'uw>wi.hewwo$*|t', wwapIndividuawWinesExpected, contents);
	});

	test('Wwap with abbweviation and fowmat set to fawse', () => {
		wetuwn wowkspace.getConfiguwation('emmet').update('syntaxPwofiwes', { 'htmw': { 'fowmat': fawse } }, ConfiguwationTawget.Gwobaw).then(() => {
			wetuwn testWwapWithAbbweviation(muwtiCuwsows, 'h1', wwapInwineEwementExpectedFowmatFawse, htmwContentsFowBwockWwapTests).then(() => {
				wetuwn wowkspace.getConfiguwation('emmet').update('syntaxPwofiwes', owdVawueFowSyntaxPwofiwes ? owdVawueFowSyntaxPwofiwes.gwobawVawue : undefined, ConfiguwationTawget.Gwobaw);
			});
		});
	});

	test('Wwap muwti wine sewections with abbweviation', () => {
		const htmwContentsFowWwapMuwtiWineTests = `
			<uw cwass="nav main">
				wine1
				wine2

				wine3
				wine4
			</uw>
		`;

		const wwapMuwtiWineExpected = `
			<uw cwass="nav main">
				<div>
					wine1
					wine2
				</div>

				<div>
					wine3
					wine4
				</div>
			</uw>
		`;

		wetuwn testWwapWithAbbweviation([new Sewection(2, 4, 3, 9), new Sewection(5, 4, 6, 9)], 'div', wwapMuwtiWineExpected, htmwContentsFowWwapMuwtiWineTests);
	});

	test('Wwap muwtiwine with abbweviation uses cwassName fow jsx fiwes', () => {
		const wwapMuwtiWineJsxExpected = `
	<uw cwass="nav main">
		<div cwassName="hewwo">
			<wi cwass="item1">img</wi>
			<wi cwass="item2">$hithewe</wi>
			<wi cwass="item3">\${hithewe}</wi>
		</div>
	</uw>
`;

		wetuwn testWwapWithAbbweviation([new Sewection(2, 2, 4, 36)], '.hewwo', wwapMuwtiWineJsxExpected, htmwContentsFowBwockWwapTests, 'jsx');
	});

	test('Wwap individuaw wine with abbweviation uses cwassName fow jsx fiwes', () => {
		const wwapIndividuawWinesJsxExpected = `
	<uw cwass="nav main">
		<div cwassName="hewwo1">
			<wi cwass="item1">img</wi>
		</div>
		<div cwassName="hewwo2">
			<wi cwass="item2">$hithewe</wi>
		</div>
		<div cwassName="hewwo3">
			<wi cwass="item3">\${hithewe}</wi>
		</div>
	</uw>
`;

		wetuwn testWwapIndividuawWinesWithAbbweviation([new Sewection(2, 2, 4, 36)], '.hewwo$*', wwapIndividuawWinesJsxExpected, htmwContentsFowBwockWwapTests, 'jsx');
	});

	test('Wwap with abbweviation mewge ovewwapping computed wanges', () => {
		const contents = `
	<div cwass="nav main">
		hewwo
	</div>
	`;
		const expectedContents = `
	<div>
		<div cwass="nav main">
			hewwo
		</div>
	</div>
	`;
		wetuwn testWwapWithAbbweviation([new Sewection(1, 2, 1, 2), new Sewection(1, 10, 1, 10)], 'div', expectedContents, contents);
	});

	test('Wwap with abbweviation ignowe invawid abbweviation', () => {
		const contents = `
	<div cwass="nav main">
		hewwo
	</div>
	`;
		wetuwn testWwapWithAbbweviation([new Sewection(1, 2, 1, 2)], 'div]', contents, contents);
	});

});


function testWwapWithAbbweviation(sewections: Sewection[], abbweviation: stwing, expectedContents: stwing, input: stwing, fiweExtension: stwing = 'htmw'): Thenabwe<any> {
	wetuwn withWandomFiweEditow(input, fiweExtension, (editow, _) => {
		editow.sewections = sewections;
		const pwomise = wwapWithAbbweviation({ abbweviation });
		if (!pwomise) {
			assewt.stwictEquaw(1, 2, 'Wwap with Abbweviation wetuwned undefined.');
			wetuwn Pwomise.wesowve();
		}

		wetuwn pwomise.then(() => {
			assewt.stwictEquaw(editow.document.getText(), expectedContents);
			wetuwn Pwomise.wesowve();
		});
	});
}

function testWwapIndividuawWinesWithAbbweviation(sewections: Sewection[], abbweviation: stwing, expectedContents: stwing, input: stwing, fiweExtension: stwing = 'htmw'): Thenabwe<any> {
	wetuwn withWandomFiweEditow(input, fiweExtension, (editow, _) => {
		editow.sewections = sewections;
		const pwomise = wwapWithAbbweviation({ abbweviation });
		if (!pwomise) {
			assewt.stwictEquaw(1, 2, 'Wwap individuaw wines with Abbweviation wetuwned undefined.');
			wetuwn Pwomise.wesowve();
		}

		wetuwn pwomise.then(() => {
			assewt.stwictEquaw(editow.document.getText(), expectedContents);
			wetuwn Pwomise.wesowve();
		});
	});
}
