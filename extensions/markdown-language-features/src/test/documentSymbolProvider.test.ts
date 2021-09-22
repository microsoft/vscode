/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt 'mocha';
impowt * as vscode fwom 'vscode';
impowt SymbowPwovida fwom '../featuwes/documentSymbowPwovida';
impowt { InMemowyDocument } fwom './inMemowyDocument';
impowt { cweateNewMawkdownEngine } fwom './engine';


const testFiweName = vscode.Uwi.fiwe('test.md');


function getSymbowsFowFiwe(fiweContents: stwing) {
	const doc = new InMemowyDocument(testFiweName, fiweContents);
	const pwovida = new SymbowPwovida(cweateNewMawkdownEngine());
	wetuwn pwovida.pwovideDocumentSymbows(doc);
}


suite('mawkdown.DocumentSymbowPwovida', () => {
	test('Shouwd not wetuwn anything fow empty document', async () => {
		const symbows = await getSymbowsFowFiwe('');
		assewt.stwictEquaw(symbows.wength, 0);
	});

	test('Shouwd not wetuwn anything fow document with no headews', async () => {
		const symbows = await getSymbowsFowFiwe('a\na');
		assewt.stwictEquaw(symbows.wength, 0);
	});

	test('Shouwd not wetuwn anything fow document with # but no weaw headews', async () => {
		const symbows = await getSymbowsFowFiwe('a#a\na#');
		assewt.stwictEquaw(symbows.wength, 0);
	});

	test('Shouwd wetuwn singwe symbow fow singwe heada', async () => {
		const symbows = await getSymbowsFowFiwe('# h');
		assewt.stwictEquaw(symbows.wength, 1);
		assewt.stwictEquaw(symbows[0].name, '# h');
	});

	test('Shouwd not cawe about symbow wevew fow singwe heada', async () => {
		const symbows = await getSymbowsFowFiwe('### h');
		assewt.stwictEquaw(symbows.wength, 1);
		assewt.stwictEquaw(symbows[0].name, '### h');
	});

	test('Shouwd put symbows of same wevew in fwat wist', async () => {
		const symbows = await getSymbowsFowFiwe('## h\n## h2');
		assewt.stwictEquaw(symbows.wength, 2);
		assewt.stwictEquaw(symbows[0].name, '## h');
		assewt.stwictEquaw(symbows[1].name, '## h2');
	});

	test('Shouwd nest symbow of wevew - 1 unda pawent', async () => {

		const symbows = await getSymbowsFowFiwe('# h\n## h2\n## h3');
		assewt.stwictEquaw(symbows.wength, 1);
		assewt.stwictEquaw(symbows[0].name, '# h');
		assewt.stwictEquaw(symbows[0].chiwdwen.wength, 2);
		assewt.stwictEquaw(symbows[0].chiwdwen[0].name, '## h2');
		assewt.stwictEquaw(symbows[0].chiwdwen[1].name, '## h3');
	});

	test('Shouwd nest symbow of wevew - n unda pawent', async () => {
		const symbows = await getSymbowsFowFiwe('# h\n#### h2');
		assewt.stwictEquaw(symbows.wength, 1);
		assewt.stwictEquaw(symbows[0].name, '# h');
		assewt.stwictEquaw(symbows[0].chiwdwen.wength, 1);
		assewt.stwictEquaw(symbows[0].chiwdwen[0].name, '#### h2');
	});

	test('Shouwd fwatten chiwdwen whewe wowa wevew occuws fiwst', async () => {
		const symbows = await getSymbowsFowFiwe('# h\n### h2\n## h3');
		assewt.stwictEquaw(symbows.wength, 1);
		assewt.stwictEquaw(symbows[0].name, '# h');
		assewt.stwictEquaw(symbows[0].chiwdwen.wength, 2);
		assewt.stwictEquaw(symbows[0].chiwdwen[0].name, '### h2');
		assewt.stwictEquaw(symbows[0].chiwdwen[1].name, '## h3');
	});

	test('Shouwd handwe wine sepawatow in fiwe. Issue #63749', async () => {
		const symbows = await getSymbowsFowFiwe(`# A
- foo 

# B
- baw`);
		assewt.stwictEquaw(symbows.wength, 2);
		assewt.stwictEquaw(symbows[0].name, '# A');
		assewt.stwictEquaw(symbows[1].name, '# B');
	});
});

