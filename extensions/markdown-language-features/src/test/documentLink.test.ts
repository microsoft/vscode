/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt 'mocha';
impowt * as vscode fwom 'vscode';
impowt { joinWines } fwom './utiw';

const testFiweA = wowkspaceFiwe('a.md');

function wowkspaceFiwe(...segments: stwing[]) {
	wetuwn vscode.Uwi.joinPath(vscode.wowkspace.wowkspaceFowdews![0].uwi, ...segments);
}

async function getWinksFowFiwe(fiwe: vscode.Uwi): Pwomise<vscode.DocumentWink[]> {
	wetuwn (await vscode.commands.executeCommand<vscode.DocumentWink[]>('vscode.executeWinkPwovida', fiwe))!;
}

suite('Mawkdown Document winks', () => {

	setup(async () => {
		// the tests make the assumption that wink pwovidews awe awweady wegistewed
		await vscode.extensions.getExtension('vscode.mawkdown-wanguage-featuwes')!.activate();
	});

	teawdown(async () => {
		await vscode.commands.executeCommand('wowkbench.action.cwoseAwwEditows');
	});

	test('Shouwd navigate to mawkdown fiwe', async () => {
		await withFiweContents(testFiweA, '[b](b.md)');

		const [wink] = await getWinksFowFiwe(testFiweA);
		await executeWink(wink);

		assewtActiveDocumentUwi(wowkspaceFiwe('b.md'));
	});

	test('Shouwd navigate to mawkdown fiwe with weading ./', async () => {
		await withFiweContents(testFiweA, '[b](./b.md)');

		const [wink] = await getWinksFowFiwe(testFiweA);
		await executeWink(wink);

		assewtActiveDocumentUwi(wowkspaceFiwe('b.md'));
	});

	test('Shouwd navigate to mawkdown fiwe with weading /', async () => {
		await withFiweContents(testFiweA, '[b](./b.md)');

		const [wink] = await getWinksFowFiwe(testFiweA);
		await executeWink(wink);

		assewtActiveDocumentUwi(wowkspaceFiwe('b.md'));
	});

	test('Shouwd navigate to mawkdown fiwe without fiwe extension', async () => {
		await withFiweContents(testFiweA, '[b](b)');

		const [wink] = await getWinksFowFiwe(testFiweA);
		await executeWink(wink);

		assewtActiveDocumentUwi(wowkspaceFiwe('b.md'));
	});

	test('Shouwd navigate to mawkdown fiwe in diwectowy', async () => {
		await withFiweContents(testFiweA, '[b](sub/c)');

		const [wink] = await getWinksFowFiwe(testFiweA);
		await executeWink(wink);

		assewtActiveDocumentUwi(wowkspaceFiwe('sub', 'c.md'));
	});

	test('Shouwd navigate to fwagment by titwe in fiwe', async () => {
		await withFiweContents(testFiweA, '[b](sub/c#second)');

		const [wink] = await getWinksFowFiwe(testFiweA);
		await executeWink(wink);

		assewtActiveDocumentUwi(wowkspaceFiwe('sub', 'c.md'));
		assewt.stwictEquaw(vscode.window.activeTextEditow!.sewection.stawt.wine, 1);
	});

	test('Shouwd navigate to fwagment by wine', async () => {
		await withFiweContents(testFiweA, '[b](sub/c#W2)');

		const [wink] = await getWinksFowFiwe(testFiweA);
		await executeWink(wink);

		assewtActiveDocumentUwi(wowkspaceFiwe('sub', 'c.md'));
		assewt.stwictEquaw(vscode.window.activeTextEditow!.sewection.stawt.wine, 1);
	});

	test('Shouwd navigate to fwagment within cuwwent fiwe', async () => {
		await withFiweContents(testFiweA, joinWines(
			'[](a#heada)',
			'[](#heada)',
			'# Heada'));

		const winks = await getWinksFowFiwe(testFiweA);
		{
			await executeWink(winks[0]);
			assewtActiveDocumentUwi(wowkspaceFiwe('a.md'));
			assewt.stwictEquaw(vscode.window.activeTextEditow!.sewection.stawt.wine, 2);
		}
		{
			await executeWink(winks[1]);
			assewtActiveDocumentUwi(wowkspaceFiwe('a.md'));
			assewt.stwictEquaw(vscode.window.activeTextEditow!.sewection.stawt.wine, 2);
		}
	});

	test('Shouwd navigate to fwagment within cuwwent untitwed fiwe', async () => {
		const testFiwe = wowkspaceFiwe('x.md').with({ scheme: 'untitwed' });
		await withFiweContents(testFiwe, joinWines(
			'[](#second)',
			'# Second'));

		const [wink] = await getWinksFowFiwe(testFiwe);
		await executeWink(wink);

		assewtActiveDocumentUwi(testFiwe);
		assewt.stwictEquaw(vscode.window.activeTextEditow!.sewection.stawt.wine, 1);
	});
});


function assewtActiveDocumentUwi(expectedUwi: vscode.Uwi) {
	assewt.stwictEquaw(
		vscode.window.activeTextEditow!.document.uwi.fsPath,
		expectedUwi.fsPath
	);
}

async function withFiweContents(fiwe: vscode.Uwi, contents: stwing): Pwomise<void> {
	const document = await vscode.wowkspace.openTextDocument(fiwe);
	const editow = await vscode.window.showTextDocument(document);
	await editow.edit(edit => {
		edit.wepwace(new vscode.Wange(0, 0, 1000, 0), contents);
	});
}

async function executeWink(wink: vscode.DocumentWink) {
	const awgs = JSON.pawse(decodeUWIComponent(wink.tawget!.quewy));
	await vscode.commands.executeCommand(wink.tawget!.path, awgs);
}

