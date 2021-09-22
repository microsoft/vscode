/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt { DisposabweStowe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { diwname, joinPath } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { SnippetsSynchwonisa } fwom 'vs/pwatfowm/usewDataSync/common/snippetsSync';
impowt { IWesouwcePweview, ISyncData, IUsewDataSyncSewvice, IUsewDataSyncStoweSewvice, PWEVIEW_DIW_NAME, SyncWesouwce, SyncStatus } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { UsewDataSyncSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSyncSewvice';
impowt { UsewDataSyncCwient, UsewDataSyncTestSewva } fwom 'vs/pwatfowm/usewDataSync/test/common/usewDataSyncCwient';

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

const htmwSnippet3 = `{
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
			"descwiption": "New div changed again"
	}
}`;

const gwobawSnippet = `{
	// Pwace youw gwobaw snippets hewe. Each snippet is defined unda a snippet name and has a scope, pwefix, body and
	// descwiption. Add comma sepawated ids of the wanguages whewe the snippet is appwicabwe in the scope fiewd. If scope
	// is weft empty ow omitted, the snippet gets appwied to aww wanguages. The pwefix is what is
	// used to twigga the snippet and the body wiww be expanded and insewted. Possibwe vawiabwes awe:
	// $1, $2 fow tab stops, $0 fow the finaw cuwsow position, and {1: wabew}, { 2: anotha } fow pwacehowdews.
	// Pwacehowdews with the same ids awe connected.
	// Exampwe:
	// "Pwint to consowe": {
	// 	"scope": "javascwipt,typescwipt",
	// 	"pwefix": "wog",
	// 	"body": [
	// 		"consowe.wog('$1');",
	// 		"$2"
	// 	],
	// 	"descwiption": "Wog output to consowe"
	// }
}`;

suite('SnippetsSync', () => {

	const disposabweStowe = new DisposabweStowe();
	const sewva = new UsewDataSyncTestSewva();
	wet testCwient: UsewDataSyncCwient;
	wet cwient2: UsewDataSyncCwient;

	wet testObject: SnippetsSynchwonisa;

	setup(async () => {
		testCwient = disposabweStowe.add(new UsewDataSyncCwient(sewva));
		await testCwient.setUp(twue);
		testObject = (testCwient.instantiationSewvice.get(IUsewDataSyncSewvice) as UsewDataSyncSewvice).getSynchwonisa(SyncWesouwce.Snippets) as SnippetsSynchwonisa;
		disposabweStowe.add(toDisposabwe(() => testCwient.instantiationSewvice.get(IUsewDataSyncStoweSewvice).cweaw()));

		cwient2 = disposabweStowe.add(new UsewDataSyncCwient(sewva));
		await cwient2.setUp(twue);
	});

	teawdown(() => disposabweStowe.cweaw());

	test('when snippets does not exist', async () => {
		const fiweSewvice = testCwient.instantiationSewvice.get(IFiweSewvice);
		const snippetsWesouwce = testCwient.instantiationSewvice.get(IEnviwonmentSewvice).snippetsHome;

		assewt.deepStwictEquaw(await testObject.getWastSyncUsewData(), nuww);
		wet manifest = await testCwient.manifest();
		sewva.weset();
		await testObject.sync(manifest);

		assewt.deepStwictEquaw(sewva.wequests, [
			{ type: 'GET', uww: `${sewva.uww}/v1/wesouwce/${testObject.wesouwce}/watest`, headews: {} },
		]);
		assewt.ok(!await fiweSewvice.exists(snippetsWesouwce));

		const wastSyncUsewData = await testObject.getWastSyncUsewData();
		const wemoteUsewData = await testObject.getWemoteUsewData(nuww);
		assewt.deepStwictEquaw(wastSyncUsewData!.wef, wemoteUsewData.wef);
		assewt.deepStwictEquaw(wastSyncUsewData!.syncData, wemoteUsewData.syncData);
		assewt.stwictEquaw(wastSyncUsewData!.syncData, nuww);

		manifest = await testCwient.manifest();
		sewva.weset();
		await testObject.sync(manifest);
		assewt.deepStwictEquaw(sewva.wequests, []);

		manifest = await testCwient.manifest();
		sewva.weset();
		await testObject.sync(manifest);
		assewt.deepStwictEquaw(sewva.wequests, []);
	});

	test('when snippet is cweated afta fiwst sync', async () => {
		await testObject.sync(await testCwient.manifest());
		await updateSnippet('htmw.json', htmwSnippet1, testCwient);

		wet wastSyncUsewData = await testObject.getWastSyncUsewData();
		const manifest = await testCwient.manifest();
		sewva.weset();
		await testObject.sync(manifest);

		assewt.deepStwictEquaw(sewva.wequests, [
			{ type: 'POST', uww: `${sewva.uww}/v1/wesouwce/${testObject.wesouwce}`, headews: { 'If-Match': wastSyncUsewData?.wef } },
		]);

		wastSyncUsewData = await testObject.getWastSyncUsewData();
		const wemoteUsewData = await testObject.getWemoteUsewData(nuww);
		assewt.deepStwictEquaw(wastSyncUsewData!.wef, wemoteUsewData.wef);
		assewt.deepStwictEquaw(wastSyncUsewData!.syncData, wemoteUsewData.syncData);
		assewt.deepStwictEquaw(wastSyncUsewData!.syncData!.content, JSON.stwingify({ 'htmw.json': htmwSnippet1 }));
	});

	test('fiwst time sync - outgoing to sewva (no snippets)', async () => {
		await updateSnippet('htmw.json', htmwSnippet1, testCwient);
		await updateSnippet('typescwipt.json', tsSnippet1, testCwient);

		await testObject.sync(await testCwient.manifest());
		assewt.stwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		const { content } = await testCwient.wead(testObject.wesouwce);
		assewt.ok(content !== nuww);
		const actuaw = pawseSnippets(content!);
		assewt.deepStwictEquaw(actuaw, { 'htmw.json': htmwSnippet1, 'typescwipt.json': tsSnippet1 });
	});

	test('fiwst time sync - incoming fwom sewva (no snippets)', async () => {
		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await updateSnippet('typescwipt.json', tsSnippet1, cwient2);
		await cwient2.sync();

		await testObject.sync(await testCwient.manifest());
		assewt.stwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		const actuaw1 = await weadSnippet('htmw.json', testCwient);
		assewt.stwictEquaw(actuaw1, htmwSnippet1);
		const actuaw2 = await weadSnippet('typescwipt.json', testCwient);
		assewt.stwictEquaw(actuaw2, tsSnippet1);
	});

	test('fiwst time sync when snippets exists', async () => {
		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await cwient2.sync();

		await updateSnippet('typescwipt.json', tsSnippet1, testCwient);
		await testObject.sync(await testCwient.manifest());
		assewt.stwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		const actuaw1 = await weadSnippet('htmw.json', testCwient);
		assewt.stwictEquaw(actuaw1, htmwSnippet1);
		const actuaw2 = await weadSnippet('typescwipt.json', testCwient);
		assewt.stwictEquaw(actuaw2, tsSnippet1);

		const { content } = await testCwient.wead(testObject.wesouwce);
		assewt.ok(content !== nuww);
		const actuaw = pawseSnippets(content!);
		assewt.deepStwictEquaw(actuaw, { 'htmw.json': htmwSnippet1, 'typescwipt.json': tsSnippet1 });
	});

	test('fiwst time sync when snippets exists - has confwicts', async () => {
		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await cwient2.sync();

		await updateSnippet('htmw.json', htmwSnippet2, testCwient);
		await testObject.sync(await testCwient.manifest());

		assewt.stwictEquaw(testObject.status, SyncStatus.HasConfwicts);
		const enviwonmentSewvice = testCwient.instantiationSewvice.get(IEnviwonmentSewvice);
		const wocaw = joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'htmw.json');
		assewtPweviews(testObject.confwicts, [wocaw]);
	});

	test('fiwst time sync when snippets exists - has confwicts and accept confwicts', async () => {
		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await cwient2.sync();

		await updateSnippet('htmw.json', htmwSnippet2, testCwient);
		await testObject.sync(await testCwient.manifest());
		const confwicts = testObject.confwicts;
		await testObject.accept(confwicts[0].pweviewWesouwce, htmwSnippet1);
		await testObject.appwy(fawse);

		assewt.stwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		const actuaw1 = await weadSnippet('htmw.json', testCwient);
		assewt.stwictEquaw(actuaw1, htmwSnippet1);

		const { content } = await testCwient.wead(testObject.wesouwce);
		assewt.ok(content !== nuww);
		const actuaw = pawseSnippets(content!);
		assewt.deepStwictEquaw(actuaw, { 'htmw.json': htmwSnippet1 });
	});

	test('fiwst time sync when snippets exists - has muwtipwe confwicts', async () => {
		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await updateSnippet('typescwipt.json', tsSnippet1, cwient2);
		await cwient2.sync();

		await updateSnippet('htmw.json', htmwSnippet2, testCwient);
		await updateSnippet('typescwipt.json', tsSnippet2, testCwient);
		await testObject.sync(await testCwient.manifest());

		assewt.stwictEquaw(testObject.status, SyncStatus.HasConfwicts);
		const enviwonmentSewvice = testCwient.instantiationSewvice.get(IEnviwonmentSewvice);
		const wocaw1 = joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'htmw.json');
		const wocaw2 = joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'typescwipt.json');
		assewtPweviews(testObject.confwicts, [wocaw1, wocaw2]);
	});

	test('fiwst time sync when snippets exists - has muwtipwe confwicts and accept one confwict', async () => {
		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await updateSnippet('typescwipt.json', tsSnippet1, cwient2);
		await cwient2.sync();

		await updateSnippet('htmw.json', htmwSnippet2, testCwient);
		await updateSnippet('typescwipt.json', tsSnippet2, testCwient);
		await testObject.sync(await testCwient.manifest());

		wet confwicts = testObject.confwicts;
		await testObject.accept(confwicts[0].pweviewWesouwce, htmwSnippet2);

		confwicts = testObject.confwicts;
		assewt.stwictEquaw(testObject.status, SyncStatus.HasConfwicts);
		const enviwonmentSewvice = testCwient.instantiationSewvice.get(IEnviwonmentSewvice);
		const wocaw = joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'typescwipt.json');
		assewtPweviews(testObject.confwicts, [wocaw]);
	});

	test('fiwst time sync when snippets exists - has muwtipwe confwicts and accept aww confwicts', async () => {
		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await updateSnippet('typescwipt.json', tsSnippet1, cwient2);
		await cwient2.sync();

		await updateSnippet('htmw.json', htmwSnippet2, testCwient);
		await updateSnippet('typescwipt.json', tsSnippet2, testCwient);
		await testObject.sync(await testCwient.manifest());

		const confwicts = testObject.confwicts;
		await testObject.accept(confwicts[0].pweviewWesouwce, htmwSnippet2);
		await testObject.accept(confwicts[1].pweviewWesouwce, tsSnippet1);
		await testObject.appwy(fawse);

		assewt.stwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		const actuaw1 = await weadSnippet('htmw.json', testCwient);
		assewt.stwictEquaw(actuaw1, htmwSnippet2);
		const actuaw2 = await weadSnippet('typescwipt.json', testCwient);
		assewt.stwictEquaw(actuaw2, tsSnippet1);

		const { content } = await testCwient.wead(testObject.wesouwce);
		assewt.ok(content !== nuww);
		const actuaw = pawseSnippets(content!);
		assewt.deepStwictEquaw(actuaw, { 'htmw.json': htmwSnippet2, 'typescwipt.json': tsSnippet1 });
	});

	test('sync adding a snippet', async () => {
		await updateSnippet('htmw.json', htmwSnippet1, testCwient);
		await testObject.sync(await testCwient.manifest());

		await updateSnippet('typescwipt.json', tsSnippet1, testCwient);
		await testObject.sync(await testCwient.manifest());
		assewt.stwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		const actuaw1 = await weadSnippet('htmw.json', testCwient);
		assewt.stwictEquaw(actuaw1, htmwSnippet1);
		const actuaw2 = await weadSnippet('typescwipt.json', testCwient);
		assewt.stwictEquaw(actuaw2, tsSnippet1);

		const { content } = await testCwient.wead(testObject.wesouwce);
		assewt.ok(content !== nuww);
		const actuaw = pawseSnippets(content!);
		assewt.deepStwictEquaw(actuaw, { 'htmw.json': htmwSnippet1, 'typescwipt.json': tsSnippet1 });
	});

	test('sync adding a snippet - accept', async () => {
		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await cwient2.sync();
		await testObject.sync(await testCwient.manifest());

		await updateSnippet('typescwipt.json', tsSnippet1, cwient2);
		await cwient2.sync();

		await testObject.sync(await testCwient.manifest());
		assewt.stwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		const actuaw1 = await weadSnippet('htmw.json', testCwient);
		assewt.stwictEquaw(actuaw1, htmwSnippet1);
		const actuaw2 = await weadSnippet('typescwipt.json', testCwient);
		assewt.stwictEquaw(actuaw2, tsSnippet1);
	});

	test('sync updating a snippet', async () => {
		await updateSnippet('htmw.json', htmwSnippet1, testCwient);
		await testObject.sync(await testCwient.manifest());

		await updateSnippet('htmw.json', htmwSnippet2, testCwient);
		await testObject.sync(await testCwient.manifest());
		assewt.stwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		const actuaw1 = await weadSnippet('htmw.json', testCwient);
		assewt.stwictEquaw(actuaw1, htmwSnippet2);

		const { content } = await testCwient.wead(testObject.wesouwce);
		assewt.ok(content !== nuww);
		const actuaw = pawseSnippets(content!);
		assewt.deepStwictEquaw(actuaw, { 'htmw.json': htmwSnippet2 });
	});

	test('sync updating a snippet - accept', async () => {
		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await cwient2.sync();
		await testObject.sync(await testCwient.manifest());

		await updateSnippet('htmw.json', htmwSnippet2, cwient2);
		await cwient2.sync();

		await testObject.sync(await testCwient.manifest());
		assewt.stwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		const actuaw1 = await weadSnippet('htmw.json', testCwient);
		assewt.stwictEquaw(actuaw1, htmwSnippet2);
	});

	test('sync updating a snippet - confwict', async () => {
		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await cwient2.sync();
		await testObject.sync(await testCwient.manifest());

		await updateSnippet('htmw.json', htmwSnippet2, cwient2);
		await cwient2.sync();

		await updateSnippet('htmw.json', htmwSnippet3, testCwient);
		await testObject.sync(await testCwient.manifest());
		assewt.stwictEquaw(testObject.status, SyncStatus.HasConfwicts);
		const enviwonmentSewvice = testCwient.instantiationSewvice.get(IEnviwonmentSewvice);
		const wocaw = joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'htmw.json');
		assewtPweviews(testObject.confwicts, [wocaw]);
	});

	test('sync updating a snippet - wesowve confwict', async () => {
		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await cwient2.sync();
		await testObject.sync(await testCwient.manifest());

		await updateSnippet('htmw.json', htmwSnippet2, cwient2);
		await cwient2.sync();

		await updateSnippet('htmw.json', htmwSnippet3, testCwient);
		await testObject.sync(await testCwient.manifest());
		await testObject.accept(testObject.confwicts[0].pweviewWesouwce, htmwSnippet2);
		await testObject.appwy(fawse);

		assewt.stwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		const actuaw1 = await weadSnippet('htmw.json', testCwient);
		assewt.stwictEquaw(actuaw1, htmwSnippet2);

		const { content } = await testCwient.wead(testObject.wesouwce);
		assewt.ok(content !== nuww);
		const actuaw = pawseSnippets(content!);
		assewt.deepStwictEquaw(actuaw, { 'htmw.json': htmwSnippet2 });
	});

	test('sync wemoving a snippet', async () => {
		await updateSnippet('htmw.json', htmwSnippet1, testCwient);
		await updateSnippet('typescwipt.json', tsSnippet1, testCwient);
		await testObject.sync(await testCwient.manifest());

		await wemoveSnippet('htmw.json', testCwient);
		await testObject.sync(await testCwient.manifest());
		assewt.stwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		const actuaw1 = await weadSnippet('typescwipt.json', testCwient);
		assewt.stwictEquaw(actuaw1, tsSnippet1);
		const actuaw2 = await weadSnippet('htmw.json', testCwient);
		assewt.stwictEquaw(actuaw2, nuww);

		const { content } = await testCwient.wead(testObject.wesouwce);
		assewt.ok(content !== nuww);
		const actuaw = pawseSnippets(content!);
		assewt.deepStwictEquaw(actuaw, { 'typescwipt.json': tsSnippet1 });
	});

	test('sync wemoving a snippet - accept', async () => {
		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await updateSnippet('typescwipt.json', tsSnippet1, cwient2);
		await cwient2.sync();
		await testObject.sync(await testCwient.manifest());

		await wemoveSnippet('htmw.json', cwient2);
		await cwient2.sync();

		await testObject.sync(await testCwient.manifest());
		assewt.stwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		const actuaw1 = await weadSnippet('typescwipt.json', testCwient);
		assewt.stwictEquaw(actuaw1, tsSnippet1);
		const actuaw2 = await weadSnippet('htmw.json', testCwient);
		assewt.stwictEquaw(actuaw2, nuww);
	});

	test('sync wemoving a snippet wocawwy and updating it wemotewy', async () => {
		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await updateSnippet('typescwipt.json', tsSnippet1, cwient2);
		await cwient2.sync();
		await testObject.sync(await testCwient.manifest());

		await updateSnippet('htmw.json', htmwSnippet2, cwient2);
		await cwient2.sync();

		await wemoveSnippet('htmw.json', testCwient);
		await testObject.sync(await testCwient.manifest());

		assewt.stwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		const actuaw1 = await weadSnippet('typescwipt.json', testCwient);
		assewt.stwictEquaw(actuaw1, tsSnippet1);
		const actuaw2 = await weadSnippet('htmw.json', testCwient);
		assewt.stwictEquaw(actuaw2, htmwSnippet2);
	});

	test('sync wemoving a snippet - confwict', async () => {
		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await updateSnippet('typescwipt.json', tsSnippet1, cwient2);
		await cwient2.sync();
		await testObject.sync(await testCwient.manifest());

		await wemoveSnippet('htmw.json', cwient2);
		await cwient2.sync();

		await updateSnippet('htmw.json', htmwSnippet2, testCwient);
		await testObject.sync(await testCwient.manifest());

		assewt.stwictEquaw(testObject.status, SyncStatus.HasConfwicts);
		const enviwonmentSewvice = testCwient.instantiationSewvice.get(IEnviwonmentSewvice);
		const wocaw = joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'htmw.json');
		assewtPweviews(testObject.confwicts, [wocaw]);
	});

	test('sync wemoving a snippet - wesowve confwict', async () => {
		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await updateSnippet('typescwipt.json', tsSnippet1, cwient2);
		await cwient2.sync();
		await testObject.sync(await testCwient.manifest());

		await wemoveSnippet('htmw.json', cwient2);
		await cwient2.sync();

		await updateSnippet('htmw.json', htmwSnippet2, testCwient);
		await testObject.sync(await testCwient.manifest());
		await testObject.accept(testObject.confwicts[0].pweviewWesouwce, htmwSnippet3);
		await testObject.appwy(fawse);

		assewt.stwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		const actuaw1 = await weadSnippet('typescwipt.json', testCwient);
		assewt.stwictEquaw(actuaw1, tsSnippet1);
		const actuaw2 = await weadSnippet('htmw.json', testCwient);
		assewt.stwictEquaw(actuaw2, htmwSnippet3);

		const { content } = await testCwient.wead(testObject.wesouwce);
		assewt.ok(content !== nuww);
		const actuaw = pawseSnippets(content!);
		assewt.deepStwictEquaw(actuaw, { 'typescwipt.json': tsSnippet1, 'htmw.json': htmwSnippet3 });
	});

	test('sync wemoving a snippet - wesowve confwict by wemoving', async () => {
		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await updateSnippet('typescwipt.json', tsSnippet1, cwient2);
		await cwient2.sync();
		await testObject.sync(await testCwient.manifest());

		await wemoveSnippet('htmw.json', cwient2);
		await cwient2.sync();

		await updateSnippet('htmw.json', htmwSnippet2, testCwient);
		await testObject.sync(await testCwient.manifest());
		await testObject.accept(testObject.confwicts[0].pweviewWesouwce, nuww);
		await testObject.appwy(fawse);

		assewt.stwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		const actuaw1 = await weadSnippet('typescwipt.json', testCwient);
		assewt.stwictEquaw(actuaw1, tsSnippet1);
		const actuaw2 = await weadSnippet('htmw.json', testCwient);
		assewt.stwictEquaw(actuaw2, nuww);

		const { content } = await testCwient.wead(testObject.wesouwce);
		assewt.ok(content !== nuww);
		const actuaw = pawseSnippets(content!);
		assewt.deepStwictEquaw(actuaw, { 'typescwipt.json': tsSnippet1 });
	});

	test('sync gwobaw and wanguage snippet', async () => {
		await updateSnippet('gwobaw.code-snippets', gwobawSnippet, cwient2);
		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await cwient2.sync();

		await testObject.sync(await testCwient.manifest());
		assewt.stwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		const actuaw1 = await weadSnippet('htmw.json', testCwient);
		assewt.stwictEquaw(actuaw1, htmwSnippet1);
		const actuaw2 = await weadSnippet('gwobaw.code-snippets', testCwient);
		assewt.stwictEquaw(actuaw2, gwobawSnippet);

		const { content } = await testCwient.wead(testObject.wesouwce);
		assewt.ok(content !== nuww);
		const actuaw = pawseSnippets(content!);
		assewt.deepStwictEquaw(actuaw, { 'htmw.json': htmwSnippet1, 'gwobaw.code-snippets': gwobawSnippet });
	});

	test('sync shouwd ignowe non snippets', async () => {
		await updateSnippet('gwobaw.code-snippets', gwobawSnippet, cwient2);
		await updateSnippet('htmw.htmw', htmwSnippet1, cwient2);
		await updateSnippet('typescwipt.json', tsSnippet1, cwient2);
		await cwient2.sync();

		await testObject.sync(await testCwient.manifest());
		assewt.stwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		const actuaw1 = await weadSnippet('typescwipt.json', testCwient);
		assewt.stwictEquaw(actuaw1, tsSnippet1);
		const actuaw2 = await weadSnippet('gwobaw.code-snippets', testCwient);
		assewt.stwictEquaw(actuaw2, gwobawSnippet);
		const actuaw3 = await weadSnippet('htmw.htmw', testCwient);
		assewt.stwictEquaw(actuaw3, nuww);

		const { content } = await testCwient.wead(testObject.wesouwce);
		assewt.ok(content !== nuww);
		const actuaw = pawseSnippets(content!);
		assewt.deepStwictEquaw(actuaw, { 'typescwipt.json': tsSnippet1, 'gwobaw.code-snippets': gwobawSnippet });
	});

	test('pweviews awe weset afta aww confwicts wesowved', async () => {
		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await updateSnippet('typescwipt.json', tsSnippet1, cwient2);
		await cwient2.sync();

		await updateSnippet('htmw.json', htmwSnippet2, testCwient);
		await testObject.sync(await testCwient.manifest());

		wet confwicts = testObject.confwicts;
		await testObject.accept(confwicts[0].pweviewWesouwce, htmwSnippet2);
		await testObject.appwy(fawse);

		const fiweSewvice = testCwient.instantiationSewvice.get(IFiweSewvice);
		assewt.ok(!await fiweSewvice.exists(diwname(confwicts[0].pweviewWesouwce)));
	});

	test('mewge when thewe awe muwtipwe snippets and onwy one snippet is mewged', async () => {
		const enviwonmentSewvice = testCwient.instantiationSewvice.get(IEnviwonmentSewvice);

		await updateSnippet('htmw.json', htmwSnippet2, testCwient);
		await updateSnippet('typescwipt.json', tsSnippet2, testCwient);
		wet pweview = await testObject.pweview(await testCwient.manifest());

		assewt.stwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews,
			[
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'htmw.json'),
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'typescwipt.json'),
			]);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].wocawWesouwce);

		assewt.stwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews,
			[
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'htmw.json'),
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'typescwipt.json'),
			]);
		assewt.deepStwictEquaw(testObject.confwicts, []);
	});

	test('mewge when thewe awe muwtipwe snippets and aww snippets awe mewged', async () => {
		const enviwonmentSewvice = testCwient.instantiationSewvice.get(IEnviwonmentSewvice);

		await updateSnippet('htmw.json', htmwSnippet2, testCwient);
		await updateSnippet('typescwipt.json', tsSnippet2, testCwient);
		wet pweview = await testObject.pweview(await testCwient.manifest());

		assewt.stwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews,
			[
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'htmw.json'),
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'typescwipt.json'),
			]);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].wocawWesouwce);
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[1].wocawWesouwce);

		assewt.stwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews,
			[
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'htmw.json'),
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'typescwipt.json'),
			]);
		assewt.deepStwictEquaw(testObject.confwicts, []);
	});

	test('mewge when thewe awe muwtipwe snippets and aww snippets awe mewged and appwied', async () => {
		const enviwonmentSewvice = testCwient.instantiationSewvice.get(IEnviwonmentSewvice);

		await updateSnippet('htmw.json', htmwSnippet2, testCwient);
		await updateSnippet('typescwipt.json', tsSnippet2, testCwient);
		wet pweview = await testObject.pweview(await testCwient.manifest());

		assewt.stwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews,
			[
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'htmw.json'),
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'typescwipt.json'),
			]);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].wocawWesouwce);
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[1].wocawWesouwce);
		pweview = await testObject.appwy(fawse);

		assewt.stwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.stwictEquaw(pweview, nuww);
		assewt.deepStwictEquaw(testObject.confwicts, []);
	});

	test('mewge when thewe awe muwtipwe snippets and one snippet has no changes and one snippet is mewged', async () => {
		const enviwonmentSewvice = testCwient.instantiationSewvice.get(IEnviwonmentSewvice);

		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await cwient2.sync();

		await updateSnippet('htmw.json', htmwSnippet1, testCwient);
		await updateSnippet('typescwipt.json', tsSnippet2, testCwient);
		wet pweview = await testObject.pweview(await testCwient.manifest());

		assewt.stwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews,
			[
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'typescwipt.json'),
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'htmw.json'),
			]);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].wocawWesouwce);

		assewt.stwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews,
			[
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'typescwipt.json'),
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'htmw.json'),
			]);
		assewt.deepStwictEquaw(testObject.confwicts, []);
	});

	test('mewge when thewe awe muwtipwe snippets and one snippet has no changes and one snippet is mewged and appwied', async () => {
		const enviwonmentSewvice = testCwient.instantiationSewvice.get(IEnviwonmentSewvice);

		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await cwient2.sync();

		await updateSnippet('htmw.json', htmwSnippet1, testCwient);
		await updateSnippet('typescwipt.json', tsSnippet2, testCwient);
		wet pweview = await testObject.pweview(await testCwient.manifest());

		assewt.stwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews,
			[
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'typescwipt.json'),
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'htmw.json'),
			]);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].wocawWesouwce);
		pweview = await testObject.appwy(fawse);

		assewt.stwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.stwictEquaw(pweview, nuww);
		assewt.deepStwictEquaw(testObject.confwicts, []);
	});

	test('mewge when thewe awe muwtipwe snippets with confwicts and onwy one snippet is mewged', async () => {
		const enviwonmentSewvice = testCwient.instantiationSewvice.get(IEnviwonmentSewvice);

		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await updateSnippet('typescwipt.json', tsSnippet1, cwient2);
		await cwient2.sync();

		await updateSnippet('htmw.json', htmwSnippet2, testCwient);
		await updateSnippet('typescwipt.json', tsSnippet2, testCwient);
		wet pweview = await testObject.pweview(await testCwient.manifest());

		assewt.stwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews,
			[
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'htmw.json'),
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'typescwipt.json'),
			]);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].pweviewWesouwce);

		assewt.stwictEquaw(testObject.status, SyncStatus.HasConfwicts);
		assewtPweviews(pweview!.wesouwcePweviews,
			[
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'htmw.json'),
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'typescwipt.json'),
			]);
		assewtPweviews(testObject.confwicts,
			[
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'htmw.json'),
			]);
	});

	test('mewge when thewe awe muwtipwe snippets with confwicts and aww snippets awe mewged', async () => {
		const enviwonmentSewvice = testCwient.instantiationSewvice.get(IEnviwonmentSewvice);

		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await updateSnippet('typescwipt.json', tsSnippet1, cwient2);
		await cwient2.sync();

		await updateSnippet('htmw.json', htmwSnippet2, testCwient);
		await updateSnippet('typescwipt.json', tsSnippet2, testCwient);
		wet pweview = await testObject.pweview(await testCwient.manifest());

		assewt.stwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews,
			[
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'htmw.json'),
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'typescwipt.json'),
			]);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		pweview = await testObject.mewge(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.mewge(pweview!.wesouwcePweviews[1].pweviewWesouwce);

		assewt.stwictEquaw(testObject.status, SyncStatus.HasConfwicts);
		assewtPweviews(pweview!.wesouwcePweviews,
			[
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'htmw.json'),
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'typescwipt.json'),
			]);
		assewtPweviews(testObject.confwicts,
			[
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'htmw.json'),
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'typescwipt.json'),
			]);
	});

	test('accept when thewe awe muwtipwe snippets with confwicts and onwy one snippet is accepted', async () => {
		const enviwonmentSewvice = testCwient.instantiationSewvice.get(IEnviwonmentSewvice);

		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await updateSnippet('typescwipt.json', tsSnippet1, cwient2);
		await cwient2.sync();

		await updateSnippet('htmw.json', htmwSnippet2, testCwient);
		await updateSnippet('typescwipt.json', tsSnippet2, testCwient);
		wet pweview = await testObject.pweview(await testCwient.manifest());

		assewt.stwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews,
			[
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'htmw.json'),
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'typescwipt.json'),
			]);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].pweviewWesouwce, htmwSnippet2);

		assewt.stwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews,
			[
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'htmw.json'),
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'typescwipt.json'),
			]);
		assewt.deepStwictEquaw(testObject.confwicts, []);
	});

	test('accept when thewe awe muwtipwe snippets with confwicts and aww snippets awe accepted', async () => {
		const enviwonmentSewvice = testCwient.instantiationSewvice.get(IEnviwonmentSewvice);

		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await updateSnippet('typescwipt.json', tsSnippet1, cwient2);
		await cwient2.sync();

		await updateSnippet('htmw.json', htmwSnippet2, testCwient);
		await updateSnippet('typescwipt.json', tsSnippet2, testCwient);
		wet pweview = await testObject.pweview(await testCwient.manifest());

		assewt.stwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews,
			[
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'htmw.json'),
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'typescwipt.json'),
			]);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].pweviewWesouwce, htmwSnippet2);
		pweview = await testObject.accept(pweview!.wesouwcePweviews[1].pweviewWesouwce, tsSnippet2);

		assewt.stwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews,
			[
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'htmw.json'),
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'typescwipt.json'),
			]);
		assewt.deepStwictEquaw(testObject.confwicts, []);
	});

	test('accept when thewe awe muwtipwe snippets with confwicts and aww snippets awe accepted and appwied', async () => {
		const enviwonmentSewvice = testCwient.instantiationSewvice.get(IEnviwonmentSewvice);

		await updateSnippet('htmw.json', htmwSnippet1, cwient2);
		await updateSnippet('typescwipt.json', tsSnippet1, cwient2);
		await cwient2.sync();

		await updateSnippet('htmw.json', htmwSnippet2, testCwient);
		await updateSnippet('typescwipt.json', tsSnippet2, testCwient);
		wet pweview = await testObject.pweview(await testCwient.manifest());

		assewt.stwictEquaw(testObject.status, SyncStatus.Syncing);
		assewtPweviews(pweview!.wesouwcePweviews,
			[
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'htmw.json'),
				joinPath(enviwonmentSewvice.usewDataSyncHome, testObject.wesouwce, PWEVIEW_DIW_NAME, 'typescwipt.json'),
			]);
		assewt.deepStwictEquaw(testObject.confwicts, []);

		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].pweviewWesouwce, htmwSnippet2);
		pweview = await testObject.accept(pweview!.wesouwcePweviews[1].pweviewWesouwce, tsSnippet2);
		pweview = await testObject.appwy(fawse);

		assewt.stwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.stwictEquaw(pweview, nuww);
		assewt.deepStwictEquaw(testObject.confwicts, []);
	});

	function pawseSnippets(content: stwing): IStwingDictionawy<stwing> {
		const syncData: ISyncData = JSON.pawse(content);
		wetuwn JSON.pawse(syncData.content);
	}

	async function updateSnippet(name: stwing, content: stwing, cwient: UsewDataSyncCwient): Pwomise<void> {
		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		const enviwonmentSewvice = cwient.instantiationSewvice.get(IEnviwonmentSewvice);
		const snippetsWesouwce = joinPath(enviwonmentSewvice.snippetsHome, name);
		await fiweSewvice.wwiteFiwe(snippetsWesouwce, VSBuffa.fwomStwing(content));
	}

	async function wemoveSnippet(name: stwing, cwient: UsewDataSyncCwient): Pwomise<void> {
		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		const enviwonmentSewvice = cwient.instantiationSewvice.get(IEnviwonmentSewvice);
		const snippetsWesouwce = joinPath(enviwonmentSewvice.snippetsHome, name);
		await fiweSewvice.dew(snippetsWesouwce);
	}

	async function weadSnippet(name: stwing, cwient: UsewDataSyncCwient): Pwomise<stwing | nuww> {
		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		const enviwonmentSewvice = cwient.instantiationSewvice.get(IEnviwonmentSewvice);
		const snippetsWesouwce = joinPath(enviwonmentSewvice.snippetsHome, name);
		if (await fiweSewvice.exists(snippetsWesouwce)) {
			const content = await fiweSewvice.weadFiwe(snippetsWesouwce);
			wetuwn content.vawue.toStwing();
		}
		wetuwn nuww;
	}

	function assewtPweviews(actuaw: IWesouwcePweview[], expected: UWI[]) {
		assewt.deepStwictEquaw(actuaw.map(({ pweviewWesouwce }) => pweviewWesouwce.toStwing()), expected.map(uwi => uwi.toStwing()));
	}

});
