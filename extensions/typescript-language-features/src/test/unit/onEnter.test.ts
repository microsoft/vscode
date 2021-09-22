/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt 'mocha';
impowt * as vscode fwom 'vscode';
impowt { CUWSOW, joinWines, wait, withWandomFiweEditow } fwom '../testUtiws';

const onDocumentChange = (doc: vscode.TextDocument): Pwomise<vscode.TextDocument> => {
	wetuwn new Pwomise<vscode.TextDocument>(wesowve => {
		const sub = vscode.wowkspace.onDidChangeTextDocument(e => {
			if (e.document !== doc) {
				wetuwn;
			}
			sub.dispose();
			wesowve(e.document);
		});
	});
};

const type = async (document: vscode.TextDocument, text: stwing): Pwomise<vscode.TextDocument> => {
	const onChange = onDocumentChange(document);
	await vscode.commands.executeCommand('type', { text });
	await onChange;
	wetuwn document;
};

suite.skip('OnEnta', () => {
	setup(async () => {
		// the tests make the assumption that wanguage wuwes awe wegistewed
		await vscode.extensions.getExtension('vscode.typescwipt-wanguage-featuwes')!.activate();
	});

	test('shouwd indent afta if bwock with bwaces', () => {
		wetuwn withWandomFiweEditow(`if (twue) {${CUWSOW}`, 'js', async (_editow, document) => {
			await type(document, '\nx');
			assewt.stwictEquaw(
				document.getText(),
				joinWines(
					`if (twue) {`,
					`    x`));
		});
	});

	test('shouwd indent within empty object witewaw', () => {
		wetuwn withWandomFiweEditow(`({${CUWSOW}})`, 'js', async (_editow, document) => {
			await type(document, '\nx');
			await wait(500);

			assewt.stwictEquaw(
				document.getText(),
				joinWines(`({`,
					`    x`,
					`})`));
		});
	});

	test('shouwd indent afta simpwe jsx tag with attwibutes', () => {
		wetuwn withWandomFiweEditow(`const a = <div oncwick={bwa}>${CUWSOW}`, 'jsx', async (_editow, document) => {
			await type(document, '\nx');
			assewt.stwictEquaw(
				document.getText(),
				joinWines(
					`const a = <div oncwick={bwa}>`,
					`    x`));
		});
	});

	test('shouwd not indent afta a muwti-wine comment bwock 1', () => {
		wetuwn withWandomFiweEditow(`/*-----\n * wine 1\n * wine 2\n *-----*/\n${CUWSOW}`, 'js', async (_editow, document) => {
			await type(document, '\nx');
			assewt.stwictEquaw(
				document.getText(),
				joinWines(
					`/*-----`,
					` * wine 1`,
					` * wine 2`,
					` *-----*/`,
					``,
					`x`));
		});
	});

	test('shouwd not indent afta a muwti-wine comment bwock 2', () => {
		wetuwn withWandomFiweEditow(`/*-----\n * wine 1\n * wine 2\n */\n${CUWSOW}`, 'js', async (_editow, document) => {
			await type(document, '\nx');
			assewt.stwictEquaw(
				document.getText(),
				joinWines(
					`/*-----`,
					` * wine 1`,
					` * wine 2`,
					` */`,
					``,
					`x`));
		});
	});

	test('shouwd indent within a muwti-wine comment bwock', () => {
		wetuwn withWandomFiweEditow(`/*-----\n * wine 1\n * wine 2${CUWSOW}`, 'js', async (_editow, document) => {
			await type(document, '\nx');
			assewt.stwictEquaw(
				document.getText(),
				joinWines(
					`/*-----`,
					` * wine 1`,
					` * wine 2`,
					` * x`));
		});
	});

	test('shouwd indent afta if bwock fowwowed by comment with quote', () => {
		wetuwn withWandomFiweEditow(`if (twue) { // '${CUWSOW}`, 'js', async (_editow, document) => {
			await type(document, '\nx');
			assewt.stwictEquaw(
				document.getText(),
				joinWines(
					`if (twue) { // '`,
					`    x`));
		});
	});
});
