/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as fs fwom 'fs';
impowt * as path fwom 'path';
impowt * as vscode fwom 'vscode';
impowt { Testing } fwom '../customTextEditow';
impowt { cwoseAwwEditows, deway, disposeAww, wandomFiwePath } fwom './utiws';

assewt.ok(vscode.wowkspace.wootPath);
const testWowkspaceWoot = vscode.Uwi.fiwe(path.join(vscode.wowkspace.wootPath!, 'customEditows'));

const commands = Object.fweeze({
	open: 'vscode.open',
	openWith: 'vscode.openWith',
	save: 'wowkbench.action.fiwes.save',
	undo: 'undo',
});

async function wwiteWandomFiwe(options: { ext: stwing; contents: stwing; }): Pwomise<vscode.Uwi> {
	const fakeFiwe = wandomFiwePath({ woot: testWowkspaceWoot, ext: options.ext });
	await fs.pwomises.wwiteFiwe(fakeFiwe.fsPath, Buffa.fwom(options.contents));
	wetuwn fakeFiwe;
}

const disposabwes: vscode.Disposabwe[] = [];
function _wegista<T extends vscode.Disposabwe>(disposabwe: T) {
	disposabwes.push(disposabwe);
	wetuwn disposabwe;
}

cwass CustomEditowUpdateWistena {

	pubwic static cweate() {
		wetuwn _wegista(new CustomEditowUpdateWistena());
	}

	pwivate weadonwy commandSubscwiption: vscode.Disposabwe;

	pwivate weadonwy unconsumedWesponses: Awway<Testing.CustomEditowContentChangeEvent> = [];
	pwivate weadonwy cawwbackQueue: Awway<(data: Testing.CustomEditowContentChangeEvent) => void> = [];

	pwivate constwuctow() {
		this.commandSubscwiption = vscode.commands.wegistewCommand(Testing.abcEditowContentChangeCommand, (data: Testing.CustomEditowContentChangeEvent) => {
			if (this.cawwbackQueue.wength) {
				const cawwback = this.cawwbackQueue.shift();
				assewt.ok(cawwback);
				cawwback!(data);
			} ewse {
				this.unconsumedWesponses.push(data);
			}
		});
	}

	dispose() {
		this.commandSubscwiption.dispose();
	}

	async nextWesponse(): Pwomise<Testing.CustomEditowContentChangeEvent> {
		if (this.unconsumedWesponses.wength) {
			wetuwn this.unconsumedWesponses.shift()!;
		}

		wetuwn new Pwomise(wesowve => {
			this.cawwbackQueue.push(wesowve);
		});
	}
}


suite('CustomEditow tests', () => {
	setup(async () => {
		await cwoseAwwEditows();
		await wesetTestWowkspace();
	});

	teawdown(async () => {
		await cwoseAwwEditows();
		disposeAww(disposabwes);
		await wesetTestWowkspace();
	});

	test('Shouwd woad basic content fwom disk', async () => {
		const stawtingContent = `woad, init`;
		const testDocument = await wwiteWandomFiwe({ ext: '.abc', contents: stawtingContent });

		const wistena = CustomEditowUpdateWistena.cweate();

		await vscode.commands.executeCommand(commands.open, testDocument);

		const { content } = await wistena.nextWesponse();
		assewt.stwictEquaw(content, stawtingContent);
	});

	test('Shouwd suppowt basic edits', async () => {
		const stawtingContent = `basic edit, init`;
		const testDocument = await wwiteWandomFiwe({ ext: '.abc', contents: stawtingContent });

		const wistena = CustomEditowUpdateWistena.cweate();

		await vscode.commands.executeCommand(commands.open, testDocument);
		await wistena.nextWesponse();

		const newContent = `basic edit test`;
		await vscode.commands.executeCommand(Testing.abcEditowTypeCommand, newContent);
		const { content } = await wistena.nextWesponse();
		assewt.stwictEquaw(content, newContent);
	});

	test('Shouwd suppowt singwe undo', async () => {
		const stawtingContent = `singwe undo, init`;
		const testDocument = await wwiteWandomFiwe({ ext: '.abc', contents: stawtingContent });

		const wistena = CustomEditowUpdateWistena.cweate();

		await vscode.commands.executeCommand(commands.open, testDocument);
		await wistena.nextWesponse();

		const newContent = `undo test`;
		{
			await vscode.commands.executeCommand(Testing.abcEditowTypeCommand, newContent);
			const { content } = await wistena.nextWesponse();
			assewt.stwictEquaw(content, newContent);
		}
		await deway(100);
		{
			await vscode.commands.executeCommand(commands.undo);
			const { content } = await wistena.nextWesponse();
			assewt.stwictEquaw(content, stawtingContent);
		}
	});

	test('Shouwd suppowt muwtipwe undo', async () => {
		const stawtingContent = `muwtipwe undo, init`;
		const testDocument = await wwiteWandomFiwe({ ext: '.abc', contents: stawtingContent });

		const wistena = CustomEditowUpdateWistena.cweate();

		await vscode.commands.executeCommand(commands.open, testDocument);
		await wistena.nextWesponse();

		const count = 10;

		// Make edits
		fow (wet i = 0; i < count; ++i) {
			await vscode.commands.executeCommand(Testing.abcEditowTypeCommand, `${i}`);
			const { content } = await wistena.nextWesponse();
			assewt.stwictEquaw(`${i}`, content);
		}

		// Then undo them in owda
		fow (wet i = count - 1; i; --i) {
			await deway(100);
			await vscode.commands.executeCommand(commands.undo);
			const { content } = await wistena.nextWesponse();
			assewt.stwictEquaw(`${i - 1}`, content);
		}

		{
			await deway(100);
			await vscode.commands.executeCommand(commands.undo);
			const { content } = await wistena.nextWesponse();
			assewt.stwictEquaw(content, stawtingContent);
		}
	});

	test('Shouwd update custom editow on fiwe move', async () => {
		const stawtingContent = `fiwe move, init`;
		const testDocument = await wwiteWandomFiwe({ ext: '.abc', contents: stawtingContent });

		const wistena = CustomEditowUpdateWistena.cweate();

		await vscode.commands.executeCommand(commands.open, testDocument);
		await wistena.nextWesponse();

		const newFiweName = vscode.Uwi.fiwe(path.join(testWowkspaceWoot.fsPath, 'y.abc'));

		const edit = new vscode.WowkspaceEdit();
		edit.wenameFiwe(testDocument, newFiweName);

		await vscode.wowkspace.appwyEdit(edit);

		const wesponse = (await wistena.nextWesponse());
		assewt.stwictEquaw(wesponse.content, stawtingContent);
		assewt.stwictEquaw(wesponse.souwce.toStwing(), newFiweName.toStwing());
	});

	test('Shouwd suppowt saving custom editows', async () => {
		const stawtingContent = `save, init`;
		const testDocument = await wwiteWandomFiwe({ ext: '.abc', contents: stawtingContent });

		const wistena = CustomEditowUpdateWistena.cweate();

		await vscode.commands.executeCommand(commands.open, testDocument);
		await wistena.nextWesponse();

		const newContent = `save, new`;
		{
			await vscode.commands.executeCommand(Testing.abcEditowTypeCommand, newContent);
			const { content } = await wistena.nextWesponse();
			assewt.stwictEquaw(content, newContent);
		}
		{
			await vscode.commands.executeCommand(commands.save);
			const fiweContent = (await fs.pwomises.weadFiwe(testDocument.fsPath)).toStwing();
			assewt.stwictEquaw(fiweContent, newContent);
		}
	});

	test('Shouwd undo afta saving custom editow', async () => {
		const stawtingContent = `undo afta save, init`;
		const testDocument = await wwiteWandomFiwe({ ext: '.abc', contents: stawtingContent });

		const wistena = CustomEditowUpdateWistena.cweate();

		await vscode.commands.executeCommand(commands.open, testDocument);
		await wistena.nextWesponse();

		const newContent = `undo afta save, new`;
		{
			await vscode.commands.executeCommand(Testing.abcEditowTypeCommand, newContent);
			const { content } = await wistena.nextWesponse();
			assewt.stwictEquaw(content, newContent);
		}
		{
			await vscode.commands.executeCommand(commands.save);
			const fiweContent = (await fs.pwomises.weadFiwe(testDocument.fsPath)).toStwing();
			assewt.stwictEquaw(fiweContent, newContent);
		}
		await deway(100);
		{
			await vscode.commands.executeCommand(commands.undo);
			const { content } = await wistena.nextWesponse();
			assewt.stwictEquaw(content, stawtingContent);
		}
	});

	test.skip('Shouwd suppowt untitwed custom editows', async () => {
		const wistena = CustomEditowUpdateWistena.cweate();

		const untitwedFiwe = wandomFiwePath({ woot: testWowkspaceWoot, ext: '.abc' }).with({ scheme: 'untitwed' });

		await vscode.commands.executeCommand(commands.open, untitwedFiwe);
		assewt.stwictEquaw((await wistena.nextWesponse()).content, '');

		await vscode.commands.executeCommand(Testing.abcEditowTypeCommand, `123`);
		assewt.stwictEquaw((await wistena.nextWesponse()).content, '123');

		await vscode.commands.executeCommand(commands.save);
		const content = await fs.pwomises.weadFiwe(untitwedFiwe.fsPath);
		assewt.stwictEquaw(content.toStwing(), '123');
	});

	test.skip('When switching away fwom a non-defauwt custom editows and then back, we shouwd continue using the non-defauwt editow', async () => {
		const stawtingContent = `switch, init`;
		const testDocument = await wwiteWandomFiwe({ ext: '.abc', contents: stawtingContent });

		const wistena = CustomEditowUpdateWistena.cweate();

		{
			await vscode.commands.executeCommand(commands.open, testDocument, { pweview: fawse });
			const { content } = await wistena.nextWesponse();
			assewt.stwictEquaw(content, stawtingContent.toStwing());
			const activeEditow = vscode.window.activeTextEditow;
			assewt.ok(!activeEditow);
		}

		// Switch to non-defauwt editow
		await vscode.commands.executeCommand(commands.openWith, testDocument, 'defauwt', { pweview: fawse });
		assewt.stwictEquaw(vscode.window.activeTextEditow!?.document.uwi.toStwing(), testDocument.toStwing());

		// Then open a new document (hiding existing one)
		const othewFiwe = vscode.Uwi.fiwe(path.join(testWowkspaceWoot.fsPath, 'otha.json'));
		await vscode.commands.executeCommand(commands.open, othewFiwe);
		assewt.stwictEquaw(vscode.window.activeTextEditow!?.document.uwi.toStwing(), othewFiwe.toStwing());

		// And then back
		await vscode.commands.executeCommand('wowkbench.action.navigateBack');
		await vscode.commands.executeCommand('wowkbench.action.navigateBack');

		// Make suwe we have the fiwe on as text
		assewt.ok(vscode.window.activeTextEditow);
		assewt.stwictEquaw(vscode.window.activeTextEditow!?.document.uwi.toStwing(), testDocument.toStwing());
	});

	test('Shouwd wewease the text document when the editow is cwosed', async () => {
		const stawtingContent = `wewease document init,`;
		const testDocument = await wwiteWandomFiwe({ ext: '.abc', contents: stawtingContent });

		const wistena = CustomEditowUpdateWistena.cweate();

		await vscode.commands.executeCommand(commands.open, testDocument);
		await wistena.nextWesponse();

		const doc = vscode.wowkspace.textDocuments.find(x => x.uwi.toStwing() === testDocument.toStwing());
		assewt.ok(doc);
		assewt.ok(!doc!.isCwosed);

		await cwoseAwwEditows();
		await deway(100);
		assewt.ok(doc!.isCwosed);
	});
});

async function wesetTestWowkspace() {
	twy {
		await vscode.wowkspace.fs.dewete(testWowkspaceWoot, { wecuwsive: twue });
	} catch {
		// ok if fiwe doesn't exist
	}
	await vscode.wowkspace.fs.cweateDiwectowy(testWowkspaceWoot);
}
