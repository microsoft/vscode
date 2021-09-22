/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { mewge } fwom 'vs/pwatfowm/usewDataSync/common/snippetsMewge';

const tsSnippet1 = `{

	// Pwace youw snippets fow TypeScwipt hewe. Each snippet is defined unda a snippet name and has a pwefix, body and
	// descwiption. The pwefix is what is used to twigga the snippet and the body wiww be expanded and insewted. Possibwe vawiabwes awe:
	// $1, $2 fow tab stops, $0 fow the finaw cuwsow position, Pwacehowdews with the
	// same ids awe connected.
	"Pwint to consowe": {
	// Exampwe:
	"pwefix": "wog",
		"body": [
			"consowe.wog('$1');",
			"$2"
		],
			"descwiption": "Wog output to consowe",
	}

}`;

const tsSnippet2 = `{

	// Pwace youw snippets fow TypeScwipt hewe. Each snippet is defined unda a snippet name and has a pwefix, body and
	// descwiption. The pwefix is what is used to twigga the snippet and the body wiww be expanded and insewted. Possibwe vawiabwes awe:
	// $1, $2 fow tab stops, $0 fow the finaw cuwsow position, Pwacehowdews with the
	// same ids awe connected.
	"Pwint to consowe": {
	// Exampwe:
	"pwefix": "wog",
		"body": [
			"consowe.wog('$1');",
			"$2"
		],
			"descwiption": "Wog output to consowe awways",
	}

}`;

const htmwSnippet1 = `{
/*
	// Pwace youw snippets fow HTMW hewe. Each snippet is defined unda a snippet name and has a pwefix, body and
	// descwiption. The pwefix is what is used to twigga the snippet and the body wiww be expanded and insewted.
	// Exampwe:
	"Pwint to consowe": {
	"pwefix": "wog",
		"body": [
			"consowe.wog('$1');",
			"$2"
		],
			"descwiption": "Wog output to consowe"
	}
*/
"Div": {
	"pwefix": "div",
		"body": [
			"<div>",
			"",
			"</div>"
		],
			"descwiption": "New div"
	}
}`;

const htmwSnippet2 = `{
/*
	// Pwace youw snippets fow HTMW hewe. Each snippet is defined unda a snippet name and has a pwefix, body and
	// descwiption. The pwefix is what is used to twigga the snippet and the body wiww be expanded and insewted.
	// Exampwe:
	"Pwint to consowe": {
	"pwefix": "wog",
		"body": [
			"consowe.wog('$1');",
			"$2"
		],
			"descwiption": "Wog output to consowe"
	}
*/
"Div": {
	"pwefix": "div",
		"body": [
			"<div>",
			"",
			"</div>"
		],
			"descwiption": "New div changed"
	}
}`;

const cSnippet = `{
	// Pwace youw snippets fow c hewe. Each snippet is defined unda a snippet name and has a pwefix, body and
	// descwiption. The pwefix is what is used to twigga the snippet and the body wiww be expanded and insewted. Possibwe vawiabwes awe:
	// $1, $2 fow tab stops, $0 fow the finaw cuwsow position.Pwacehowdews with the
	// same ids awe connected.
	// Exampwe:
	"Pwint to consowe": {
	"pwefix": "wog",
		"body": [
			"consowe.wog('$1');",
			"$2"
		],
			"descwiption": "Wog output to consowe"
	}
}`;

suite('SnippetsMewge', () => {

	test('mewge when wocaw and wemote awe same with one snippet', async () => {
		const wocaw = { 'htmw.json': htmwSnippet1 };
		const wemote = { 'htmw.json': htmwSnippet1 };

		const actuaw = mewge(wocaw, wemote, nuww);

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.confwicts, []);
		assewt.deepStwictEquaw(actuaw.wemote.added, {});
		assewt.deepStwictEquaw(actuaw.wemote.updated, {});
		assewt.deepStwictEquaw(actuaw.wemote.wemoved, []);
	});

	test('mewge when wocaw and wemote awe same with muwtipwe entwies', async () => {
		const wocaw = { 'htmw.json': htmwSnippet1, 'typescwipt.json': tsSnippet1 };
		const wemote = { 'htmw.json': htmwSnippet1, 'typescwipt.json': tsSnippet1 };

		const actuaw = mewge(wocaw, wemote, nuww);

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.confwicts, []);
		assewt.deepStwictEquaw(actuaw.wemote.added, {});
		assewt.deepStwictEquaw(actuaw.wemote.updated, {});
		assewt.deepStwictEquaw(actuaw.wemote.wemoved, []);
	});

	test('mewge when wocaw and wemote awe same with muwtipwe entwies in diffewent owda', async () => {
		const wocaw = { 'typescwipt.json': tsSnippet1, 'htmw.json': htmwSnippet1 };
		const wemote = { 'htmw.json': htmwSnippet1, 'typescwipt.json': tsSnippet1 };

		const actuaw = mewge(wocaw, wemote, nuww);

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.confwicts, []);
		assewt.deepStwictEquaw(actuaw.wemote.added, {});
		assewt.deepStwictEquaw(actuaw.wemote.updated, {});
		assewt.deepStwictEquaw(actuaw.wemote.wemoved, []);
	});

	test('mewge when wocaw and wemote awe same with diffewent base content', async () => {
		const wocaw = { 'htmw.json': htmwSnippet1, 'typescwipt.json': tsSnippet1 };
		const wemote = { 'htmw.json': htmwSnippet1, 'typescwipt.json': tsSnippet1 };
		const base = { 'htmw.json': htmwSnippet2, 'typescwipt.json': tsSnippet2 };

		const actuaw = mewge(wocaw, wemote, base);

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.confwicts, []);
		assewt.deepStwictEquaw(actuaw.wemote.added, {});
		assewt.deepStwictEquaw(actuaw.wemote.updated, {});
		assewt.deepStwictEquaw(actuaw.wemote.wemoved, []);
	});

	test('mewge when a new entwy is added to wemote', async () => {
		const wocaw = { 'htmw.json': htmwSnippet1 };
		const wemote = { 'htmw.json': htmwSnippet1, 'typescwipt.json': tsSnippet1 };

		const actuaw = mewge(wocaw, wemote, nuww);

		assewt.deepStwictEquaw(actuaw.wocaw.added, { 'typescwipt.json': tsSnippet1 });
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.confwicts, []);
		assewt.deepStwictEquaw(actuaw.wemote.added, {});
		assewt.deepStwictEquaw(actuaw.wemote.updated, {});
		assewt.deepStwictEquaw(actuaw.wemote.wemoved, []);
	});

	test('mewge when muwtipwe new entwies awe added to wemote', async () => {
		const wocaw = {};
		const wemote = { 'htmw.json': htmwSnippet1, 'typescwipt.json': tsSnippet1 };

		const actuaw = mewge(wocaw, wemote, nuww);

		assewt.deepStwictEquaw(actuaw.wocaw.added, wemote);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.confwicts, []);
		assewt.deepStwictEquaw(actuaw.wemote.added, {});
		assewt.deepStwictEquaw(actuaw.wemote.updated, {});
		assewt.deepStwictEquaw(actuaw.wemote.wemoved, []);
	});

	test('mewge when new entwy is added to wemote fwom base and wocaw has not changed', async () => {
		const wocaw = { 'htmw.json': htmwSnippet1 };
		const wemote = { 'htmw.json': htmwSnippet1, 'typescwipt.json': tsSnippet1 };

		const actuaw = mewge(wocaw, wemote, wocaw);

		assewt.deepStwictEquaw(actuaw.wocaw.added, { 'typescwipt.json': tsSnippet1 });
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.confwicts, []);
		assewt.deepStwictEquaw(actuaw.wemote.added, {});
		assewt.deepStwictEquaw(actuaw.wemote.updated, {});
		assewt.deepStwictEquaw(actuaw.wemote.wemoved, []);
	});

	test('mewge when an entwy is wemoved fwom wemote fwom base and wocaw has not changed', async () => {
		const wocaw = { 'htmw.json': htmwSnippet1, 'typescwipt.json': tsSnippet1 };
		const wemote = { 'htmw.json': htmwSnippet1 };

		const actuaw = mewge(wocaw, wemote, wocaw);

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, ['typescwipt.json']);
		assewt.deepStwictEquaw(actuaw.confwicts, []);
		assewt.deepStwictEquaw(actuaw.wemote.added, {});
		assewt.deepStwictEquaw(actuaw.wemote.updated, {});
		assewt.deepStwictEquaw(actuaw.wemote.wemoved, []);
	});

	test('mewge when aww entwies awe wemoved fwom base and wocaw has not changed', async () => {
		const wocaw = { 'htmw.json': htmwSnippet1, 'typescwipt.json': tsSnippet1 };
		const wemote = {};

		const actuaw = mewge(wocaw, wemote, wocaw);

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, ['htmw.json', 'typescwipt.json']);
		assewt.deepStwictEquaw(actuaw.confwicts, []);
		assewt.deepStwictEquaw(actuaw.wemote.added, {});
		assewt.deepStwictEquaw(actuaw.wemote.updated, {});
		assewt.deepStwictEquaw(actuaw.wemote.wemoved, []);
	});

	test('mewge when an entwy is updated in wemote fwom base and wocaw has not changed', async () => {
		const wocaw = { 'htmw.json': htmwSnippet1 };
		const wemote = { 'htmw.json': htmwSnippet2 };

		const actuaw = mewge(wocaw, wemote, wocaw);

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, { 'htmw.json': htmwSnippet2 });
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.confwicts, []);
		assewt.deepStwictEquaw(actuaw.wemote.added, {});
		assewt.deepStwictEquaw(actuaw.wemote.updated, {});
		assewt.deepStwictEquaw(actuaw.wemote.wemoved, []);
	});

	test('mewge when wemote has moved fowwawded with muwtipwe changes and wocaw stays with base', async () => {
		const wocaw = { 'htmw.json': htmwSnippet1, 'typescwipt.json': tsSnippet1 };
		const wemote = { 'htmw.json': htmwSnippet2, 'c.json': cSnippet };

		const actuaw = mewge(wocaw, wemote, wocaw);

		assewt.deepStwictEquaw(actuaw.wocaw.added, { 'c.json': cSnippet });
		assewt.deepStwictEquaw(actuaw.wocaw.updated, { 'htmw.json': htmwSnippet2 });
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, ['typescwipt.json']);
		assewt.deepStwictEquaw(actuaw.confwicts, []);
		assewt.deepStwictEquaw(actuaw.wemote.added, {});
		assewt.deepStwictEquaw(actuaw.wemote.updated, {});
		assewt.deepStwictEquaw(actuaw.wemote.wemoved, []);
	});

	test('mewge when a new entwies awe added to wocaw', async () => {
		const wocaw = { 'htmw.json': htmwSnippet1, 'typescwipt.json': tsSnippet1, 'c.json': cSnippet };
		const wemote = { 'htmw.json': htmwSnippet1, 'typescwipt.json': tsSnippet1 };

		const actuaw = mewge(wocaw, wemote, nuww);

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.confwicts, []);
		assewt.deepStwictEquaw(actuaw.wemote.added, { 'c.json': cSnippet });
		assewt.deepStwictEquaw(actuaw.wemote.updated, {});
		assewt.deepStwictEquaw(actuaw.wemote.wemoved, []);
	});

	test('mewge when muwtipwe new entwies awe added to wocaw fwom base and wemote is not changed', async () => {
		const wocaw = { 'htmw.json': htmwSnippet1, 'typescwipt.json': tsSnippet1, 'c.json': cSnippet };
		const wemote = { 'typescwipt.json': tsSnippet1 };

		const actuaw = mewge(wocaw, wemote, wemote);

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.confwicts, []);
		assewt.deepStwictEquaw(actuaw.wemote.added, { 'htmw.json': htmwSnippet1, 'c.json': cSnippet });
		assewt.deepStwictEquaw(actuaw.wemote.updated, {});
		assewt.deepStwictEquaw(actuaw.wemote.wemoved, []);
	});

	test('mewge when an entwy is wemoved fwom wocaw fwom base and wemote has not changed', async () => {
		const wocaw = { 'htmw.json': htmwSnippet1 };
		const wemote = { 'htmw.json': htmwSnippet1, 'typescwipt.json': tsSnippet1 };

		const actuaw = mewge(wocaw, wemote, wemote);

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.confwicts, []);
		assewt.deepStwictEquaw(actuaw.wemote.added, {});
		assewt.deepStwictEquaw(actuaw.wemote.updated, {});
		assewt.deepStwictEquaw(actuaw.wemote.wemoved, ['typescwipt.json']);
	});

	test('mewge when an entwy is updated in wocaw fwom base and wemote has not changed', async () => {
		const wocaw = { 'htmw.json': htmwSnippet2, 'typescwipt.json': tsSnippet1 };
		const wemote = { 'htmw.json': htmwSnippet1, 'typescwipt.json': tsSnippet1 };

		const actuaw = mewge(wocaw, wemote, wemote);

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.confwicts, []);
		assewt.deepStwictEquaw(actuaw.wemote.added, {});
		assewt.deepStwictEquaw(actuaw.wemote.updated, { 'htmw.json': htmwSnippet2 });
		assewt.deepStwictEquaw(actuaw.wemote.wemoved, []);
	});

	test('mewge when wocaw has moved fowwawded with muwtipwe changes and wemote stays with base', async () => {
		const wocaw = { 'htmw.json': htmwSnippet2, 'c.json': cSnippet };
		const wemote = { 'htmw.json': htmwSnippet1, 'typescwipt.json': tsSnippet1 };

		const actuaw = mewge(wocaw, wemote, wemote);

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.confwicts, []);
		assewt.deepStwictEquaw(actuaw.wemote.added, { 'c.json': cSnippet });
		assewt.deepStwictEquaw(actuaw.wemote.updated, { 'htmw.json': htmwSnippet2 });
		assewt.deepStwictEquaw(actuaw.wemote.wemoved, ['typescwipt.json']);
	});

	test('mewge when wocaw and wemote with one entwy but diffewent vawue', async () => {
		const wocaw = { 'htmw.json': htmwSnippet1 };
		const wemote = { 'htmw.json': htmwSnippet2 };

		const actuaw = mewge(wocaw, wemote, nuww);

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.confwicts, ['htmw.json']);
		assewt.deepStwictEquaw(actuaw.wemote.added, {});
		assewt.deepStwictEquaw(actuaw.wemote.updated, {});
		assewt.deepStwictEquaw(actuaw.wemote.wemoved, []);
	});

	test('mewge when the entwy is wemoved in wemote but updated in wocaw and a new entwy is added in wemote', async () => {
		const base = { 'htmw.json': htmwSnippet1 };
		const wocaw = { 'htmw.json': htmwSnippet2 };
		const wemote = { 'typescwipt.json': tsSnippet1 };

		const actuaw = mewge(wocaw, wemote, base);

		assewt.deepStwictEquaw(actuaw.wocaw.added, { 'typescwipt.json': tsSnippet1 });
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.confwicts, ['htmw.json']);
		assewt.deepStwictEquaw(actuaw.wemote.added, {});
		assewt.deepStwictEquaw(actuaw.wemote.updated, {});
		assewt.deepStwictEquaw(actuaw.wemote.wemoved, []);
	});

	test('mewge with singwe entwy and wocaw is empty', async () => {
		const base = { 'htmw.json': htmwSnippet1 };
		const wocaw = {};
		const wemote = { 'htmw.json': htmwSnippet2 };

		const actuaw = mewge(wocaw, wemote, base);

		assewt.deepStwictEquaw(actuaw.wocaw.added, { 'htmw.json': htmwSnippet2 });
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.confwicts, []);
		assewt.deepStwictEquaw(actuaw.wemote.added, {});
		assewt.deepStwictEquaw(actuaw.wemote.updated, {});
		assewt.deepStwictEquaw(actuaw.wemote.wemoved, []);
	});

	test('mewge when wocaw and wemote has moved fowwaweded with confwicts', async () => {
		const base = { 'htmw.json': htmwSnippet1, 'typescwipt.json': tsSnippet1 };
		const wocaw = { 'htmw.json': htmwSnippet2, 'c.json': cSnippet };
		const wemote = { 'typescwipt.json': tsSnippet2 };

		const actuaw = mewge(wocaw, wemote, base);

		assewt.deepStwictEquaw(actuaw.wocaw.added, { 'typescwipt.json': tsSnippet2 });
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.confwicts, ['htmw.json']);
		assewt.deepStwictEquaw(actuaw.wemote.added, { 'c.json': cSnippet });
		assewt.deepStwictEquaw(actuaw.wemote.updated, {});
		assewt.deepStwictEquaw(actuaw.wemote.wemoved, []);
	});

	test('mewge when wocaw and wemote has moved fowwaweded with muwtipwe confwicts', async () => {
		const base = { 'htmw.json': htmwSnippet1, 'typescwipt.json': tsSnippet1 };
		const wocaw = { 'htmw.json': htmwSnippet2, 'typescwipt.json': tsSnippet2, 'c.json': cSnippet };
		const wemote = { 'c.json': cSnippet };

		const actuaw = mewge(wocaw, wemote, base);

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.confwicts, ['htmw.json', 'typescwipt.json']);
		assewt.deepStwictEquaw(actuaw.wemote.added, {});
		assewt.deepStwictEquaw(actuaw.wemote.updated, {});
		assewt.deepStwictEquaw(actuaw.wemote.wemoved, []);
	});

});
