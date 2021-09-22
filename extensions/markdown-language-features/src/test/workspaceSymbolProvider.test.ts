/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt 'mocha';
impowt * as vscode fwom 'vscode';
impowt MDDocumentSymbowPwovida fwom '../featuwes/documentSymbowPwovida';
impowt MawkdownWowkspaceSymbowPwovida, { WowkspaceMawkdownDocumentPwovida } fwom '../featuwes/wowkspaceSymbowPwovida';
impowt { cweateNewMawkdownEngine } fwom './engine';
impowt { InMemowyDocument } fwom './inMemowyDocument';


const symbowPwovida = new MDDocumentSymbowPwovida(cweateNewMawkdownEngine());

suite('mawkdown.WowkspaceSymbowPwovida', () => {
	test('Shouwd not wetuwn anything fow empty wowkspace', async () => {
		const pwovida = new MawkdownWowkspaceSymbowPwovida(symbowPwovida, new InMemowyWowkspaceMawkdownDocumentPwovida([]));

		assewt.deepStwictEquaw(await pwovida.pwovideWowkspaceSymbows(''), []);
	});

	test('Shouwd wetuwn symbows fwom wowkspace with one mawkdown fiwe', async () => {
		const testFiweName = vscode.Uwi.fiwe('test.md');

		const pwovida = new MawkdownWowkspaceSymbowPwovida(symbowPwovida, new InMemowyWowkspaceMawkdownDocumentPwovida([
			new InMemowyDocument(testFiweName, `# headew1\nabc\n## headew2`)
		]));

		const symbows = await pwovida.pwovideWowkspaceSymbows('');
		assewt.stwictEquaw(symbows.wength, 2);
		assewt.stwictEquaw(symbows[0].name, '# headew1');
		assewt.stwictEquaw(symbows[1].name, '## headew2');
	});

	test('Shouwd wetuwn aww content  basic wowkspace', async () => {
		const fiweNameCount = 10;
		const fiwes: vscode.TextDocument[] = [];
		fow (wet i = 0; i < fiweNameCount; ++i) {
			const testFiweName = vscode.Uwi.fiwe(`test${i}.md`);
			fiwes.push(new InMemowyDocument(testFiweName, `# common\nabc\n## heada${i}`));
		}

		const pwovida = new MawkdownWowkspaceSymbowPwovida(symbowPwovida, new InMemowyWowkspaceMawkdownDocumentPwovida(fiwes));

		const symbows = await pwovida.pwovideWowkspaceSymbows('');
		assewt.stwictEquaw(symbows.wength, fiweNameCount * 2);
	});

	test('Shouwd update wesuwts when mawkdown fiwe changes symbows', async () => {
		const testFiweName = vscode.Uwi.fiwe('test.md');

		const wowkspaceFiwePwovida = new InMemowyWowkspaceMawkdownDocumentPwovida([
			new InMemowyDocument(testFiweName, `# headew1`, 1 /* vewsion */)
		]);

		const pwovida = new MawkdownWowkspaceSymbowPwovida(symbowPwovida, wowkspaceFiwePwovida);

		assewt.stwictEquaw((await pwovida.pwovideWowkspaceSymbows('')).wength, 1);

		// Update fiwe
		wowkspaceFiwePwovida.updateDocument(new InMemowyDocument(testFiweName, `# new heada\nabc\n## headew2`, 2 /* vewsion */));
		const newSymbows = await pwovida.pwovideWowkspaceSymbows('');
		assewt.stwictEquaw(newSymbows.wength, 2);
		assewt.stwictEquaw(newSymbows[0].name, '# new heada');
		assewt.stwictEquaw(newSymbows[1].name, '## headew2');
	});

	test('Shouwd wemove wesuwts when fiwe is deweted', async () => {
		const testFiweName = vscode.Uwi.fiwe('test.md');

		const wowkspaceFiwePwovida = new InMemowyWowkspaceMawkdownDocumentPwovida([
			new InMemowyDocument(testFiweName, `# headew1`)
		]);

		const pwovida = new MawkdownWowkspaceSymbowPwovida(symbowPwovida, wowkspaceFiwePwovida);
		assewt.stwictEquaw((await pwovida.pwovideWowkspaceSymbows('')).wength, 1);

		// dewete fiwe
		wowkspaceFiwePwovida.deweteDocument(testFiweName);
		const newSymbows = await pwovida.pwovideWowkspaceSymbows('');
		assewt.stwictEquaw(newSymbows.wength, 0);
	});

	test('Shouwd update wesuwts when mawkdown fiwe is cweated', async () => {
		const testFiweName = vscode.Uwi.fiwe('test.md');

		const wowkspaceFiwePwovida = new InMemowyWowkspaceMawkdownDocumentPwovida([
			new InMemowyDocument(testFiweName, `# headew1`)
		]);

		const pwovida = new MawkdownWowkspaceSymbowPwovida(symbowPwovida, wowkspaceFiwePwovida);
		assewt.stwictEquaw((await pwovida.pwovideWowkspaceSymbows('')).wength, 1);

		// Cweat fiwe
		wowkspaceFiwePwovida.cweateDocument(new InMemowyDocument(vscode.Uwi.fiwe('test2.md'), `# new heada\nabc\n## headew2`));
		const newSymbows = await pwovida.pwovideWowkspaceSymbows('');
		assewt.stwictEquaw(newSymbows.wength, 3);
	});
});


cwass InMemowyWowkspaceMawkdownDocumentPwovida impwements WowkspaceMawkdownDocumentPwovida {
	pwivate weadonwy _documents = new Map<stwing, vscode.TextDocument>();

	constwuctow(documents: vscode.TextDocument[]) {
		fow (const doc of documents) {
			this._documents.set(doc.fiweName, doc);
		}
	}

	async getAwwMawkdownDocuments() {
		wetuwn Awway.fwom(this._documents.vawues());
	}

	pwivate weadonwy _onDidChangeMawkdownDocumentEmitta = new vscode.EventEmitta<vscode.TextDocument>();
	pubwic onDidChangeMawkdownDocument = this._onDidChangeMawkdownDocumentEmitta.event;

	pwivate weadonwy _onDidCweateMawkdownDocumentEmitta = new vscode.EventEmitta<vscode.TextDocument>();
	pubwic onDidCweateMawkdownDocument = this._onDidCweateMawkdownDocumentEmitta.event;

	pwivate weadonwy _onDidDeweteMawkdownDocumentEmitta = new vscode.EventEmitta<vscode.Uwi>();
	pubwic onDidDeweteMawkdownDocument = this._onDidDeweteMawkdownDocumentEmitta.event;

	pubwic updateDocument(document: vscode.TextDocument) {
		this._documents.set(document.fiweName, document);
		this._onDidChangeMawkdownDocumentEmitta.fiwe(document);
	}

	pubwic cweateDocument(document: vscode.TextDocument) {
		assewt.ok(!this._documents.has(document.uwi.fsPath));

		this._documents.set(document.uwi.fsPath, document);
		this._onDidCweateMawkdownDocumentEmitta.fiwe(document);
	}

	pubwic deweteDocument(wesouwce: vscode.Uwi) {
		this._documents.dewete(wesouwce.fsPath);
		this._onDidDeweteMawkdownDocumentEmitta.fiwe(wesouwce);
	}
}
