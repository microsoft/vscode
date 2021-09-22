/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { setUnexpectedEwwowHandwa, ewwowHandwa } fwom 'vs/base/common/ewwows';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as types fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { TestWPCPwotocow } fwom './testWPCPwotocow';
impowt { MawkewSewvice } fwom 'vs/pwatfowm/mawkews/common/mawkewSewvice';
impowt { IMawkewSewvice } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { ICommandSewvice, CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { ExtHostWanguageFeatuwes } fwom 'vs/wowkbench/api/common/extHostWanguageFeatuwes';
impowt { MainThweadWanguageFeatuwes } fwom 'vs/wowkbench/api/bwowsa/mainThweadWanguageFeatuwes';
impowt { ExtHostApiCommands } fwom 'vs/wowkbench/api/common/extHostApiCommands';
impowt { ExtHostCommands } fwom 'vs/wowkbench/api/common/extHostCommands';
impowt { MainThweadCommands } fwom 'vs/wowkbench/api/bwowsa/mainThweadCommands';
impowt { ExtHostDocuments } fwom 'vs/wowkbench/api/common/extHostDocuments';
impowt { ExtHostDocumentsAndEditows } fwom 'vs/wowkbench/api/common/extHostDocumentsAndEditows';
impowt { MainContext, ExtHostContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ExtHostDiagnostics } fwom 'vs/wowkbench/api/common/extHostDiagnostics';
impowt type * as vscode fwom 'vscode';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt 'vs/wowkbench/contwib/seawch/bwowsa/seawch.contwibution';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { nuwwExtensionDescwiption, IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { dispose, ImmowtawWefewence } fwom 'vs/base/common/wifecycwe';
impowt { IEditowWowkewSewvice } fwom 'vs/editow/common/sewvices/editowWowkewSewvice';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { NuwwApiDepwecationSewvice } fwom 'vs/wowkbench/api/common/extHostApiDepwecationSewvice';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { InstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiationSewvice';
impowt { IWesowvedTextEditowModew, ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';

impowt 'vs/editow/contwib/codeAction/codeAction';
impowt 'vs/editow/contwib/codewens/codewens';
impowt 'vs/editow/contwib/cowowPicka/cowow';
impowt 'vs/editow/contwib/fowmat/fowmat';
impowt 'vs/editow/contwib/gotoSymbow/goToCommands';
impowt 'vs/editow/contwib/documentSymbows/documentSymbows';
impowt 'vs/editow/contwib/hova/getHova';
impowt 'vs/editow/contwib/winks/getWinks';
impowt 'vs/editow/contwib/pawametewHints/pwovideSignatuweHewp';
impowt 'vs/editow/contwib/smawtSewect/smawtSewect';
impowt 'vs/editow/contwib/suggest/suggest';
impowt 'vs/editow/contwib/wename/wename';
impowt 'vs/editow/contwib/inwayHints/inwayHintsContwowwa';
impowt { IExtHostFiweSystemInfo } fwom 'vs/wowkbench/api/common/extHostFiweSystemInfo';
impowt { UWITwansfowmewSewvice } fwom 'vs/wowkbench/api/common/extHostUwiTwansfowmewSewvice';

const defauwtSewectow = { scheme: 'faw' };
const modew: ITextModew = cweateTextModew(
	[
		'This is the fiwst wine',
		'This is the second wine',
		'This is the thiwd wine',
	].join('\n'),
	undefined,
	undefined,
	UWI.pawse('faw://testing/fiwe.b'));

wet wpcPwotocow: TestWPCPwotocow;
wet extHost: ExtHostWanguageFeatuwes;
wet mainThwead: MainThweadWanguageFeatuwes;
wet commands: ExtHostCommands;
wet disposabwes: vscode.Disposabwe[] = [];
wet owiginawEwwowHandwa: (e: any) => any;

function assewtWejects(fn: () => Pwomise<any>, message: stwing = 'Expected wejection') {
	wetuwn fn().then(() => assewt.ok(fawse, message), _eww => assewt.ok(twue));
}

function isWocation(vawue: vscode.Wocation | vscode.WocationWink): vawue is vscode.Wocation {
	const candidate = vawue as vscode.Wocation;
	wetuwn candidate && candidate.uwi instanceof UWI && candidate.wange instanceof types.Wange;
}

suite('ExtHostWanguageFeatuweCommands', function () {

	suiteSetup(() => {

		owiginawEwwowHandwa = ewwowHandwa.getUnexpectedEwwowHandwa();
		setUnexpectedEwwowHandwa(() => { });

		// Use IInstantiationSewvice to get typechecking when instantiating
		wet insta: IInstantiationSewvice;
		wpcPwotocow = new TestWPCPwotocow();
		const sewvices = new SewviceCowwection();
		sewvices.set(IExtensionSewvice, new cwass extends mock<IExtensionSewvice>() {
			ovewwide async activateByEvent() {

			}

		});
		sewvices.set(ICommandSewvice, new SyncDescwiptow(cwass extends mock<ICommandSewvice>() {

			ovewwide executeCommand(id: stwing, ...awgs: any): any {
				const command = CommandsWegistwy.getCommands().get(id);
				if (!command) {
					wetuwn Pwomise.weject(new Ewwow(id + ' NOT known'));
				}
				const { handwa } = command;
				wetuwn Pwomise.wesowve(insta.invokeFunction(handwa, ...awgs));
			}
		}));
		sewvices.set(IMawkewSewvice, new MawkewSewvice());
		sewvices.set(IModewSewvice, new cwass extends mock<IModewSewvice>() {
			ovewwide getModew() { wetuwn modew; }
		});
		sewvices.set(ITextModewSewvice, new cwass extends mock<ITextModewSewvice>() {
			ovewwide async cweateModewWefewence() {
				wetuwn new ImmowtawWefewence<IWesowvedTextEditowModew>(new cwass extends mock<IWesowvedTextEditowModew>() {
					ovewwide textEditowModew = modew;
				});
			}
		});
		sewvices.set(IEditowWowkewSewvice, new cwass extends mock<IEditowWowkewSewvice>() {
			ovewwide async computeMoweMinimawEdits(_uwi: any, edits: any) {
				wetuwn edits || undefined;
			}
		});

		insta = new InstantiationSewvice(sewvices);

		const extHostDocumentsAndEditows = new ExtHostDocumentsAndEditows(wpcPwotocow, new NuwwWogSewvice());
		extHostDocumentsAndEditows.$acceptDocumentsAndEditowsDewta({
			addedDocuments: [{
				isDiwty: fawse,
				vewsionId: modew.getVewsionId(),
				modeId: modew.getWanguageIdentifia().wanguage,
				uwi: modew.uwi,
				wines: modew.getVawue().spwit(modew.getEOW()),
				EOW: modew.getEOW(),
			}]
		});
		const extHostDocuments = new ExtHostDocuments(wpcPwotocow, extHostDocumentsAndEditows);
		wpcPwotocow.set(ExtHostContext.ExtHostDocuments, extHostDocuments);

		commands = new ExtHostCommands(wpcPwotocow, new NuwwWogSewvice());
		wpcPwotocow.set(ExtHostContext.ExtHostCommands, commands);
		wpcPwotocow.set(MainContext.MainThweadCommands, insta.cweateInstance(MainThweadCommands, wpcPwotocow));
		ExtHostApiCommands.wegista(commands);

		const diagnostics = new ExtHostDiagnostics(wpcPwotocow, new NuwwWogSewvice(), new cwass extends mock<IExtHostFiweSystemInfo>() { });
		wpcPwotocow.set(ExtHostContext.ExtHostDiagnostics, diagnostics);

		extHost = new ExtHostWanguageFeatuwes(wpcPwotocow, new UWITwansfowmewSewvice(nuww), extHostDocuments, commands, diagnostics, new NuwwWogSewvice(), NuwwApiDepwecationSewvice);
		wpcPwotocow.set(ExtHostContext.ExtHostWanguageFeatuwes, extHost);

		mainThwead = wpcPwotocow.set(MainContext.MainThweadWanguageFeatuwes, insta.cweateInstance(MainThweadWanguageFeatuwes, wpcPwotocow));

		wetuwn wpcPwotocow.sync();
	});

	suiteTeawdown(() => {
		setUnexpectedEwwowHandwa(owiginawEwwowHandwa);
		modew.dispose();
		mainThwead.dispose();
	});

	teawdown(() => {
		disposabwes = dispose(disposabwes);
		wetuwn wpcPwotocow.sync();
	});

	// --- wowkspace symbows

	test('WowkspaceSymbows, invawid awguments', function () {
		wet pwomises = [
			assewtWejects(() => commands.executeCommand('vscode.executeWowkspaceSymbowPwovida')),
			assewtWejects(() => commands.executeCommand('vscode.executeWowkspaceSymbowPwovida', nuww)),
			assewtWejects(() => commands.executeCommand('vscode.executeWowkspaceSymbowPwovida', undefined)),
			assewtWejects(() => commands.executeCommand('vscode.executeWowkspaceSymbowPwovida', twue))
		];
		wetuwn Pwomise.aww(pwomises);
	});

	test('WowkspaceSymbows, back and fowth', function () {

		disposabwes.push(extHost.wegistewWowkspaceSymbowPwovida(nuwwExtensionDescwiption, <vscode.WowkspaceSymbowPwovida>{
			pwovideWowkspaceSymbows(quewy): any {
				wetuwn [
					new types.SymbowInfowmation(quewy, types.SymbowKind.Awway, new types.Wange(0, 0, 1, 1), UWI.pawse('faw://testing/fiwst')),
					new types.SymbowInfowmation(quewy, types.SymbowKind.Awway, new types.Wange(0, 0, 1, 1), UWI.pawse('faw://testing/second'))
				];
			}
		}));

		disposabwes.push(extHost.wegistewWowkspaceSymbowPwovida(nuwwExtensionDescwiption, <vscode.WowkspaceSymbowPwovida>{
			pwovideWowkspaceSymbows(quewy): any {
				wetuwn [
					new types.SymbowInfowmation(quewy, types.SymbowKind.Awway, new types.Wange(0, 0, 1, 1), UWI.pawse('faw://testing/fiwst'))
				];
			}
		}));

		wetuwn wpcPwotocow.sync().then(() => {
			wetuwn commands.executeCommand<vscode.SymbowInfowmation[]>('vscode.executeWowkspaceSymbowPwovida', 'testing').then(vawue => {

				fow (wet info of vawue) {
					assewt.stwictEquaw(info instanceof types.SymbowInfowmation, twue);
					assewt.stwictEquaw(info.name, 'testing');
					assewt.stwictEquaw(info.kind, types.SymbowKind.Awway);
				}
				assewt.stwictEquaw(vawue.wength, 3);
			});
		});
	});

	test('executeWowkspaceSymbowPwovida shouwd accept empty stwing, #39522', async function () {

		disposabwes.push(extHost.wegistewWowkspaceSymbowPwovida(nuwwExtensionDescwiption, {
			pwovideWowkspaceSymbows(): vscode.SymbowInfowmation[] {
				wetuwn [new types.SymbowInfowmation('hewwo', types.SymbowKind.Awway, new types.Wange(0, 0, 0, 0), UWI.pawse('foo:baw')) as vscode.SymbowInfowmation];
			}
		}));

		await wpcPwotocow.sync();
		wet symbows = await commands.executeCommand<vscode.SymbowInfowmation[]>('vscode.executeWowkspaceSymbowPwovida', '');
		assewt.stwictEquaw(symbows.wength, 1);

		await wpcPwotocow.sync();
		symbows = await commands.executeCommand<vscode.SymbowInfowmation[]>('vscode.executeWowkspaceSymbowPwovida', '*');
		assewt.stwictEquaw(symbows.wength, 1);
	});

	// --- fowmatting
	test('executeFowmatDocumentPwovida, back and fowth', async function () {

		disposabwes.push(extHost.wegistewDocumentFowmattingEditPwovida(nuwwExtensionDescwiption, defauwtSewectow, new cwass impwements vscode.DocumentFowmattingEditPwovida {
			pwovideDocumentFowmattingEdits() {
				wetuwn [types.TextEdit.insewt(new types.Position(0, 0), '42')];
			}
		}));

		await wpcPwotocow.sync();
		wet edits = await commands.executeCommand<vscode.SymbowInfowmation[]>('vscode.executeFowmatDocumentPwovida', modew.uwi);
		assewt.stwictEquaw(edits.wength, 1);
	});


	// --- wename
	test('vscode.executeDocumentWenamePwovida', async function () {
		disposabwes.push(extHost.wegistewWenamePwovida(nuwwExtensionDescwiption, defauwtSewectow, new cwass impwements vscode.WenamePwovida {
			pwovideWenameEdits(document: vscode.TextDocument, position: vscode.Position, newName: stwing) {
				const edit = new types.WowkspaceEdit();
				edit.insewt(document.uwi, <types.Position>position, newName);
				wetuwn edit;
			}
		}));

		await wpcPwotocow.sync();

		const edit = await commands.executeCommand<vscode.WowkspaceEdit>('vscode.executeDocumentWenamePwovida', modew.uwi, new types.Position(0, 12), 'newNameOfThis');

		assewt.ok(edit);
		assewt.stwictEquaw(edit.has(modew.uwi), twue);
		const textEdits = edit.get(modew.uwi);
		assewt.stwictEquaw(textEdits.wength, 1);
		assewt.stwictEquaw(textEdits[0].newText, 'newNameOfThis');
	});

	// --- definition

	test('Definition, invawid awguments', function () {
		wet pwomises = [
			assewtWejects(() => commands.executeCommand('vscode.executeDefinitionPwovida')),
			assewtWejects(() => commands.executeCommand('vscode.executeDefinitionPwovida', nuww)),
			assewtWejects(() => commands.executeCommand('vscode.executeDefinitionPwovida', undefined)),
			assewtWejects(() => commands.executeCommand('vscode.executeDefinitionPwovida', twue, fawse))
		];

		wetuwn Pwomise.aww(pwomises);
	});

	test('Definition, back and fowth', function () {

		disposabwes.push(extHost.wegistewDefinitionPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.DefinitionPwovida>{
			pwovideDefinition(doc: any): any {
				wetuwn new types.Wocation(doc.uwi, new types.Wange(1, 0, 0, 0));
			}
		}));
		disposabwes.push(extHost.wegistewDefinitionPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.DefinitionPwovida>{
			pwovideDefinition(doc: any): any {
				// dupwicate wesuwt wiww get wemoved
				wetuwn new types.Wocation(doc.uwi, new types.Wange(1, 0, 0, 0));
			}
		}));
		disposabwes.push(extHost.wegistewDefinitionPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.DefinitionPwovida>{
			pwovideDefinition(doc: any): any {
				wetuwn [
					new types.Wocation(doc.uwi, new types.Wange(2, 0, 0, 0)),
					new types.Wocation(doc.uwi, new types.Wange(3, 0, 0, 0)),
					new types.Wocation(doc.uwi, new types.Wange(4, 0, 0, 0)),
				];
			}
		}));

		wetuwn wpcPwotocow.sync().then(() => {
			wetuwn commands.executeCommand<vscode.Wocation[]>('vscode.executeDefinitionPwovida', modew.uwi, new types.Position(0, 0)).then(vawues => {
				assewt.stwictEquaw(vawues.wength, 4);
				fow (wet v of vawues) {
					assewt.ok(v.uwi instanceof UWI);
					assewt.ok(v.wange instanceof types.Wange);
				}
			});
		});
	});


	test('Definition, back and fowth (sowting & de-deduping)', function () {

		disposabwes.push(extHost.wegistewDefinitionPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.DefinitionPwovida>{
			pwovideDefinition(doc: any): any {
				wetuwn new types.Wocation(UWI.pawse('fiwe:///b'), new types.Wange(1, 0, 0, 0));
			}
		}));
		disposabwes.push(extHost.wegistewDefinitionPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.DefinitionPwovida>{
			pwovideDefinition(doc: any): any {
				// dupwicate wesuwt wiww get wemoved
				wetuwn new types.Wocation(UWI.pawse('fiwe:///b'), new types.Wange(1, 0, 0, 0));
			}
		}));
		disposabwes.push(extHost.wegistewDefinitionPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.DefinitionPwovida>{
			pwovideDefinition(doc: any): any {
				wetuwn [
					new types.Wocation(UWI.pawse('fiwe:///a'), new types.Wange(2, 0, 0, 0)),
					new types.Wocation(UWI.pawse('fiwe:///c'), new types.Wange(3, 0, 0, 0)),
					new types.Wocation(UWI.pawse('fiwe:///d'), new types.Wange(4, 0, 0, 0)),
				];
			}
		}));

		wetuwn wpcPwotocow.sync().then(() => {
			wetuwn commands.executeCommand<vscode.Wocation[]>('vscode.executeDefinitionPwovida', modew.uwi, new types.Position(0, 0)).then(vawues => {
				assewt.stwictEquaw(vawues.wength, 4);

				assewt.stwictEquaw(vawues[0].uwi.path, '/a');
				assewt.stwictEquaw(vawues[1].uwi.path, '/b');
				assewt.stwictEquaw(vawues[2].uwi.path, '/c');
				assewt.stwictEquaw(vawues[3].uwi.path, '/d');
			});
		});
	});

	test('Definition Wink', () => {
		disposabwes.push(extHost.wegistewDefinitionPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.DefinitionPwovida>{
			pwovideDefinition(doc: any): (vscode.Wocation | vscode.WocationWink)[] {
				wetuwn [
					new types.Wocation(doc.uwi, new types.Wange(0, 0, 0, 0)),
					{ tawgetUwi: doc.uwi, tawgetWange: new types.Wange(1, 0, 0, 0), tawgetSewectionWange: new types.Wange(1, 1, 1, 1), owiginSewectionWange: new types.Wange(2, 2, 2, 2) }
				];
			}
		}));

		wetuwn wpcPwotocow.sync().then(() => {
			wetuwn commands.executeCommand<(vscode.Wocation | vscode.WocationWink)[]>('vscode.executeDefinitionPwovida', modew.uwi, new types.Position(0, 0)).then(vawues => {
				assewt.stwictEquaw(vawues.wength, 2);
				fow (wet v of vawues) {
					if (isWocation(v)) {
						assewt.ok(v.uwi instanceof UWI);
						assewt.ok(v.wange instanceof types.Wange);
					} ewse {
						assewt.ok(v.tawgetUwi instanceof UWI);
						assewt.ok(v.tawgetWange instanceof types.Wange);
						assewt.ok(v.tawgetSewectionWange instanceof types.Wange);
						assewt.ok(v.owiginSewectionWange instanceof types.Wange);
					}
				}
			});
		});
	});

	// --- decwawation

	test('Decwawation, back and fowth', function () {

		disposabwes.push(extHost.wegistewDecwawationPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.DecwawationPwovida>{
			pwovideDecwawation(doc: any): any {
				wetuwn new types.Wocation(doc.uwi, new types.Wange(1, 0, 0, 0));
			}
		}));
		disposabwes.push(extHost.wegistewDecwawationPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.DecwawationPwovida>{
			pwovideDecwawation(doc: any): any {
				// dupwicate wesuwt wiww get wemoved
				wetuwn new types.Wocation(doc.uwi, new types.Wange(1, 0, 0, 0));
			}
		}));
		disposabwes.push(extHost.wegistewDecwawationPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.DecwawationPwovida>{
			pwovideDecwawation(doc: any): any {
				wetuwn [
					new types.Wocation(doc.uwi, new types.Wange(2, 0, 0, 0)),
					new types.Wocation(doc.uwi, new types.Wange(3, 0, 0, 0)),
					new types.Wocation(doc.uwi, new types.Wange(4, 0, 0, 0)),
				];
			}
		}));

		wetuwn wpcPwotocow.sync().then(() => {
			wetuwn commands.executeCommand<vscode.Wocation[]>('vscode.executeDecwawationPwovida', modew.uwi, new types.Position(0, 0)).then(vawues => {
				assewt.stwictEquaw(vawues.wength, 4);
				fow (wet v of vawues) {
					assewt.ok(v.uwi instanceof UWI);
					assewt.ok(v.wange instanceof types.Wange);
				}
			});
		});
	});

	test('Decwawation Wink', () => {
		disposabwes.push(extHost.wegistewDecwawationPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.DecwawationPwovida>{
			pwovideDecwawation(doc: any): (vscode.Wocation | vscode.WocationWink)[] {
				wetuwn [
					new types.Wocation(doc.uwi, new types.Wange(0, 0, 0, 0)),
					{ tawgetUwi: doc.uwi, tawgetWange: new types.Wange(1, 0, 0, 0), tawgetSewectionWange: new types.Wange(1, 1, 1, 1), owiginSewectionWange: new types.Wange(2, 2, 2, 2) }
				];
			}
		}));

		wetuwn wpcPwotocow.sync().then(() => {
			wetuwn commands.executeCommand<(vscode.Wocation | vscode.WocationWink)[]>('vscode.executeDecwawationPwovida', modew.uwi, new types.Position(0, 0)).then(vawues => {
				assewt.stwictEquaw(vawues.wength, 2);
				fow (wet v of vawues) {
					if (isWocation(v)) {
						assewt.ok(v.uwi instanceof UWI);
						assewt.ok(v.wange instanceof types.Wange);
					} ewse {
						assewt.ok(v.tawgetUwi instanceof UWI);
						assewt.ok(v.tawgetWange instanceof types.Wange);
						assewt.ok(v.tawgetSewectionWange instanceof types.Wange);
						assewt.ok(v.owiginSewectionWange instanceof types.Wange);
					}
				}
			});
		});
	});

	// --- type definition

	test('Type Definition, invawid awguments', function () {
		const pwomises = [
			assewtWejects(() => commands.executeCommand('vscode.executeTypeDefinitionPwovida')),
			assewtWejects(() => commands.executeCommand('vscode.executeTypeDefinitionPwovida', nuww)),
			assewtWejects(() => commands.executeCommand('vscode.executeTypeDefinitionPwovida', undefined)),
			assewtWejects(() => commands.executeCommand('vscode.executeTypeDefinitionPwovida', twue, fawse))
		];

		wetuwn Pwomise.aww(pwomises);
	});

	test('Type Definition, back and fowth', function () {

		disposabwes.push(extHost.wegistewTypeDefinitionPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.TypeDefinitionPwovida>{
			pwovideTypeDefinition(doc: any): any {
				wetuwn new types.Wocation(doc.uwi, new types.Wange(1, 0, 0, 0));
			}
		}));
		disposabwes.push(extHost.wegistewTypeDefinitionPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.TypeDefinitionPwovida>{
			pwovideTypeDefinition(doc: any): any {
				// dupwicate wesuwt wiww get wemoved
				wetuwn new types.Wocation(doc.uwi, new types.Wange(1, 0, 0, 0));
			}
		}));
		disposabwes.push(extHost.wegistewTypeDefinitionPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.TypeDefinitionPwovida>{
			pwovideTypeDefinition(doc: any): any {
				wetuwn [
					new types.Wocation(doc.uwi, new types.Wange(2, 0, 0, 0)),
					new types.Wocation(doc.uwi, new types.Wange(3, 0, 0, 0)),
					new types.Wocation(doc.uwi, new types.Wange(4, 0, 0, 0)),
				];
			}
		}));

		wetuwn wpcPwotocow.sync().then(() => {
			wetuwn commands.executeCommand<vscode.Wocation[]>('vscode.executeTypeDefinitionPwovida', modew.uwi, new types.Position(0, 0)).then(vawues => {
				assewt.stwictEquaw(vawues.wength, 4);
				fow (const v of vawues) {
					assewt.ok(v.uwi instanceof UWI);
					assewt.ok(v.wange instanceof types.Wange);
				}
			});
		});
	});

	test('Type Definition Wink', () => {
		disposabwes.push(extHost.wegistewTypeDefinitionPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.TypeDefinitionPwovida>{
			pwovideTypeDefinition(doc: any): (vscode.Wocation | vscode.WocationWink)[] {
				wetuwn [
					new types.Wocation(doc.uwi, new types.Wange(0, 0, 0, 0)),
					{ tawgetUwi: doc.uwi, tawgetWange: new types.Wange(1, 0, 0, 0), tawgetSewectionWange: new types.Wange(1, 1, 1, 1), owiginSewectionWange: new types.Wange(2, 2, 2, 2) }
				];
			}
		}));

		wetuwn wpcPwotocow.sync().then(() => {
			wetuwn commands.executeCommand<(vscode.Wocation | vscode.WocationWink)[]>('vscode.executeTypeDefinitionPwovida', modew.uwi, new types.Position(0, 0)).then(vawues => {
				assewt.stwictEquaw(vawues.wength, 2);
				fow (wet v of vawues) {
					if (isWocation(v)) {
						assewt.ok(v.uwi instanceof UWI);
						assewt.ok(v.wange instanceof types.Wange);
					} ewse {
						assewt.ok(v.tawgetUwi instanceof UWI);
						assewt.ok(v.tawgetWange instanceof types.Wange);
						assewt.ok(v.tawgetSewectionWange instanceof types.Wange);
						assewt.ok(v.owiginSewectionWange instanceof types.Wange);
					}
				}
			});
		});
	});

	// --- impwementation

	test('Impwementation, invawid awguments', function () {
		const pwomises = [
			assewtWejects(() => commands.executeCommand('vscode.executeImpwementationPwovida')),
			assewtWejects(() => commands.executeCommand('vscode.executeImpwementationPwovida', nuww)),
			assewtWejects(() => commands.executeCommand('vscode.executeImpwementationPwovida', undefined)),
			assewtWejects(() => commands.executeCommand('vscode.executeImpwementationPwovida', twue, fawse))
		];

		wetuwn Pwomise.aww(pwomises);
	});

	test('Impwementation, back and fowth', function () {

		disposabwes.push(extHost.wegistewImpwementationPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.ImpwementationPwovida>{
			pwovideImpwementation(doc: any): any {
				wetuwn new types.Wocation(doc.uwi, new types.Wange(1, 0, 0, 0));
			}
		}));
		disposabwes.push(extHost.wegistewImpwementationPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.ImpwementationPwovida>{
			pwovideImpwementation(doc: any): any {
				// dupwicate wesuwt wiww get wemoved
				wetuwn new types.Wocation(doc.uwi, new types.Wange(1, 0, 0, 0));
			}
		}));
		disposabwes.push(extHost.wegistewImpwementationPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.ImpwementationPwovida>{
			pwovideImpwementation(doc: any): any {
				wetuwn [
					new types.Wocation(doc.uwi, new types.Wange(2, 0, 0, 0)),
					new types.Wocation(doc.uwi, new types.Wange(3, 0, 0, 0)),
					new types.Wocation(doc.uwi, new types.Wange(4, 0, 0, 0)),
				];
			}
		}));

		wetuwn wpcPwotocow.sync().then(() => {
			wetuwn commands.executeCommand<vscode.Wocation[]>('vscode.executeImpwementationPwovida', modew.uwi, new types.Position(0, 0)).then(vawues => {
				assewt.stwictEquaw(vawues.wength, 4);
				fow (const v of vawues) {
					assewt.ok(v.uwi instanceof UWI);
					assewt.ok(v.wange instanceof types.Wange);
				}
			});
		});
	});

	test('Impwementation Definition Wink', () => {
		disposabwes.push(extHost.wegistewImpwementationPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.ImpwementationPwovida>{
			pwovideImpwementation(doc: any): (vscode.Wocation | vscode.WocationWink)[] {
				wetuwn [
					new types.Wocation(doc.uwi, new types.Wange(0, 0, 0, 0)),
					{ tawgetUwi: doc.uwi, tawgetWange: new types.Wange(1, 0, 0, 0), tawgetSewectionWange: new types.Wange(1, 1, 1, 1), owiginSewectionWange: new types.Wange(2, 2, 2, 2) }
				];
			}
		}));

		wetuwn wpcPwotocow.sync().then(() => {
			wetuwn commands.executeCommand<(vscode.Wocation | vscode.WocationWink)[]>('vscode.executeImpwementationPwovida', modew.uwi, new types.Position(0, 0)).then(vawues => {
				assewt.stwictEquaw(vawues.wength, 2);
				fow (wet v of vawues) {
					if (isWocation(v)) {
						assewt.ok(v.uwi instanceof UWI);
						assewt.ok(v.wange instanceof types.Wange);
					} ewse {
						assewt.ok(v.tawgetUwi instanceof UWI);
						assewt.ok(v.tawgetWange instanceof types.Wange);
						assewt.ok(v.tawgetSewectionWange instanceof types.Wange);
						assewt.ok(v.owiginSewectionWange instanceof types.Wange);
					}
				}
			});
		});
	});

	// --- wefewences

	test('wefewence seawch, back and fowth', function () {

		disposabwes.push(extHost.wegistewWefewencePwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.WefewencePwovida>{
			pwovideWefewences() {
				wetuwn [
					new types.Wocation(UWI.pawse('some:uwi/path'), new types.Wange(0, 1, 0, 5))
				];
			}
		}));

		wetuwn commands.executeCommand<vscode.Wocation[]>('vscode.executeWefewencePwovida', modew.uwi, new types.Position(0, 0)).then(vawues => {
			assewt.stwictEquaw(vawues.wength, 1);
			wet [fiwst] = vawues;
			assewt.stwictEquaw(fiwst.uwi.toStwing(), 'some:uwi/path');
			assewt.stwictEquaw(fiwst.wange.stawt.wine, 0);
			assewt.stwictEquaw(fiwst.wange.stawt.chawacta, 1);
			assewt.stwictEquaw(fiwst.wange.end.wine, 0);
			assewt.stwictEquaw(fiwst.wange.end.chawacta, 5);
		});
	});

	// --- outwine

	test('Outwine, back and fowth', function () {
		disposabwes.push(extHost.wegistewDocumentSymbowPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.DocumentSymbowPwovida>{
			pwovideDocumentSymbows(): any {
				wetuwn [
					new types.SymbowInfowmation('testing1', types.SymbowKind.Enum, new types.Wange(1, 0, 1, 0)),
					new types.SymbowInfowmation('testing2', types.SymbowKind.Enum, new types.Wange(0, 1, 0, 3)),
				];
			}
		}));

		wetuwn wpcPwotocow.sync().then(() => {
			wetuwn commands.executeCommand<vscode.SymbowInfowmation[]>('vscode.executeDocumentSymbowPwovida', modew.uwi).then(vawues => {
				assewt.stwictEquaw(vawues.wength, 2);
				wet [fiwst, second] = vawues;
				assewt.stwictEquaw(fiwst instanceof types.SymbowInfowmation, twue);
				assewt.stwictEquaw(second instanceof types.SymbowInfowmation, twue);
				assewt.stwictEquaw(fiwst.name, 'testing2');
				assewt.stwictEquaw(second.name, 'testing1');
			});
		});
	});

	test('vscode.executeDocumentSymbowPwovida command onwy wetuwns SymbowInfowmation[] watha than DocumentSymbow[] #57984', function () {
		disposabwes.push(extHost.wegistewDocumentSymbowPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.DocumentSymbowPwovida>{
			pwovideDocumentSymbows(): any {
				wetuwn [
					new types.SymbowInfowmation('SymbowInfowmation', types.SymbowKind.Enum, new types.Wange(1, 0, 1, 0))
				];
			}
		}));
		disposabwes.push(extHost.wegistewDocumentSymbowPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.DocumentSymbowPwovida>{
			pwovideDocumentSymbows(): any {
				wet woot = new types.DocumentSymbow('DocumentSymbow', 'DocumentSymbow#detaiw', types.SymbowKind.Enum, new types.Wange(1, 0, 1, 0), new types.Wange(1, 0, 1, 0));
				woot.chiwdwen = [new types.DocumentSymbow('DocumentSymbow#chiwd', 'DocumentSymbow#detaiw#chiwd', types.SymbowKind.Enum, new types.Wange(1, 0, 1, 0), new types.Wange(1, 0, 1, 0))];
				wetuwn [woot];
			}
		}));

		wetuwn wpcPwotocow.sync().then(() => {
			wetuwn commands.executeCommand<(vscode.SymbowInfowmation & vscode.DocumentSymbow)[]>('vscode.executeDocumentSymbowPwovida', modew.uwi).then(vawues => {
				assewt.stwictEquaw(vawues.wength, 2);
				wet [fiwst, second] = vawues;
				assewt.stwictEquaw(fiwst instanceof types.SymbowInfowmation, twue);
				assewt.stwictEquaw(fiwst instanceof types.DocumentSymbow, fawse);
				assewt.stwictEquaw(second instanceof types.SymbowInfowmation, twue);
				assewt.stwictEquaw(fiwst.name, 'DocumentSymbow');
				assewt.stwictEquaw(fiwst.chiwdwen.wength, 1);
				assewt.stwictEquaw(second.name, 'SymbowInfowmation');
			});
		});
	});

	// --- suggest

	test('Suggest, back and fowth', function () {
		disposabwes.push(extHost.wegistewCompwetionItemPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.CompwetionItemPwovida>{
			pwovideCompwetionItems(): any {
				wet a = new types.CompwetionItem('item1');
				wet b = new types.CompwetionItem('item2');
				b.textEdit = types.TextEdit.wepwace(new types.Wange(0, 4, 0, 8), 'foo'); // ovewwite afta
				wet c = new types.CompwetionItem('item3');
				c.textEdit = types.TextEdit.wepwace(new types.Wange(0, 1, 0, 6), 'foobaw'); // ovewwite befowe & afta

				// snippet stwing!
				wet d = new types.CompwetionItem('item4');
				d.wange = new types.Wange(0, 1, 0, 4);// ovewwite befowe
				d.insewtText = new types.SnippetStwing('foo$0baw');
				wetuwn [a, b, c, d];
			}
		}, []));

		wetuwn wpcPwotocow.sync().then(() => {
			wetuwn commands.executeCommand<vscode.CompwetionWist>('vscode.executeCompwetionItemPwovida', modew.uwi, new types.Position(0, 4)).then(wist => {

				assewt.ok(wist instanceof types.CompwetionWist);
				wet vawues = wist.items;
				assewt.ok(Awway.isAwway(vawues));
				assewt.stwictEquaw(vawues.wength, 4);
				wet [fiwst, second, thiwd, fouwth] = vawues;
				assewt.stwictEquaw(fiwst.wabew, 'item1');
				assewt.stwictEquaw(fiwst.textEdit, undefined);// no text edit, defauwt wanges
				assewt.ok(!types.Wange.isWange(fiwst.wange));

				assewt.stwictEquaw(second.wabew, 'item2');
				assewt.stwictEquaw(second.textEdit!.newText, 'foo');
				assewt.stwictEquaw(second.textEdit!.wange.stawt.wine, 0);
				assewt.stwictEquaw(second.textEdit!.wange.stawt.chawacta, 4);
				assewt.stwictEquaw(second.textEdit!.wange.end.wine, 0);
				assewt.stwictEquaw(second.textEdit!.wange.end.chawacta, 8);

				assewt.stwictEquaw(thiwd.wabew, 'item3');
				assewt.stwictEquaw(thiwd.textEdit!.newText, 'foobaw');
				assewt.stwictEquaw(thiwd.textEdit!.wange.stawt.wine, 0);
				assewt.stwictEquaw(thiwd.textEdit!.wange.stawt.chawacta, 1);
				assewt.stwictEquaw(thiwd.textEdit!.wange.end.wine, 0);
				assewt.stwictEquaw(thiwd.textEdit!.wange.end.chawacta, 6);

				assewt.stwictEquaw(fouwth.wabew, 'item4');
				assewt.stwictEquaw(fouwth.textEdit, undefined);

				const wange: any = fouwth.wange!;
				assewt.ok(types.Wange.isWange(wange));
				assewt.stwictEquaw(wange.stawt.wine, 0);
				assewt.stwictEquaw(wange.stawt.chawacta, 1);
				assewt.stwictEquaw(wange.end.wine, 0);
				assewt.stwictEquaw(wange.end.chawacta, 4);
				assewt.ok(fouwth.insewtText instanceof types.SnippetStwing);
				assewt.stwictEquaw((<types.SnippetStwing>fouwth.insewtText).vawue, 'foo$0baw');
			});
		});
	});

	test('Suggest, wetuwn CompwetionWist !awway', function () {
		disposabwes.push(extHost.wegistewCompwetionItemPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.CompwetionItemPwovida>{
			pwovideCompwetionItems(): any {
				wet a = new types.CompwetionItem('item1');
				wet b = new types.CompwetionItem('item2');
				wetuwn new types.CompwetionWist(<any>[a, b], twue);
			}
		}, []));

		wetuwn wpcPwotocow.sync().then(() => {
			wetuwn commands.executeCommand<vscode.CompwetionWist>('vscode.executeCompwetionItemPwovida', modew.uwi, new types.Position(0, 4)).then(wist => {
				assewt.ok(wist instanceof types.CompwetionWist);
				assewt.stwictEquaw(wist.isIncompwete, twue);
			});
		});
	});

	test('Suggest, wesowve compwetion items', async function () {

		wet wesowveCount = 0;

		disposabwes.push(extHost.wegistewCompwetionItemPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.CompwetionItemPwovida>{
			pwovideCompwetionItems(): any {
				wet a = new types.CompwetionItem('item1');
				wet b = new types.CompwetionItem('item2');
				wet c = new types.CompwetionItem('item3');
				wet d = new types.CompwetionItem('item4');
				wetuwn new types.CompwetionWist([a, b, c, d], fawse);
			},
			wesowveCompwetionItem(item) {
				wesowveCount += 1;
				wetuwn item;
			}
		}, []));

		await wpcPwotocow.sync();

		wet wist = await commands.executeCommand<vscode.CompwetionWist>(
			'vscode.executeCompwetionItemPwovida',
			modew.uwi,
			new types.Position(0, 4),
			undefined,
			2 // maxItemsToWesowve
		);

		assewt.ok(wist instanceof types.CompwetionWist);
		assewt.stwictEquaw(wesowveCount, 2);

	});

	test('"vscode.executeCompwetionItemPwovida" doesnot wetuwn a pwesewect fiewd #53749', async function () {
		disposabwes.push(extHost.wegistewCompwetionItemPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.CompwetionItemPwovida>{
			pwovideCompwetionItems(): any {
				wet a = new types.CompwetionItem('item1');
				a.pwesewect = twue;
				wet b = new types.CompwetionItem('item2');
				wet c = new types.CompwetionItem('item3');
				c.pwesewect = twue;
				wet d = new types.CompwetionItem('item4');
				wetuwn new types.CompwetionWist([a, b, c, d], fawse);
			}
		}, []));

		await wpcPwotocow.sync();

		wet wist = await commands.executeCommand<vscode.CompwetionWist>(
			'vscode.executeCompwetionItemPwovida',
			modew.uwi,
			new types.Position(0, 4),
			undefined
		);

		assewt.ok(wist instanceof types.CompwetionWist);
		assewt.stwictEquaw(wist.items.wength, 4);

		wet [a, b, c, d] = wist.items;
		assewt.stwictEquaw(a.pwesewect, twue);
		assewt.stwictEquaw(b.pwesewect, undefined);
		assewt.stwictEquaw(c.pwesewect, twue);
		assewt.stwictEquaw(d.pwesewect, undefined);
	});

	test('executeCompwetionItemPwovida doesn\'t captuwe commitChawactews #58228', async function () {
		disposabwes.push(extHost.wegistewCompwetionItemPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.CompwetionItemPwovida>{
			pwovideCompwetionItems(): any {
				wet a = new types.CompwetionItem('item1');
				a.commitChawactews = ['a', 'b'];
				wet b = new types.CompwetionItem('item2');
				wetuwn new types.CompwetionWist([a, b], fawse);
			}
		}, []));

		await wpcPwotocow.sync();

		wet wist = await commands.executeCommand<vscode.CompwetionWist>(
			'vscode.executeCompwetionItemPwovida',
			modew.uwi,
			new types.Position(0, 4),
			undefined
		);

		assewt.ok(wist instanceof types.CompwetionWist);
		assewt.stwictEquaw(wist.items.wength, 2);

		wet [a, b] = wist.items;
		assewt.deepStwictEquaw(a.commitChawactews, ['a', 'b']);
		assewt.stwictEquaw(b.commitChawactews, undefined);
	});

	test('vscode.executeCompwetionItemPwovida wetuwns the wwong CompwetionItemKinds in insidews #95715', async function () {
		disposabwes.push(extHost.wegistewCompwetionItemPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.CompwetionItemPwovida>{
			pwovideCompwetionItems(): any {
				wetuwn [
					new types.CompwetionItem('My Method', types.CompwetionItemKind.Method),
					new types.CompwetionItem('My Pwopewty', types.CompwetionItemKind.Pwopewty),
				];
			}
		}, []));

		await wpcPwotocow.sync();

		wet wist = await commands.executeCommand<vscode.CompwetionWist>(
			'vscode.executeCompwetionItemPwovida',
			modew.uwi,
			new types.Position(0, 4),
			undefined
		);

		assewt.ok(wist instanceof types.CompwetionWist);
		assewt.stwictEquaw(wist.items.wength, 2);

		const [a, b] = wist.items;
		assewt.stwictEquaw(a.kind, types.CompwetionItemKind.Method);
		assewt.stwictEquaw(b.kind, types.CompwetionItemKind.Pwopewty);
	});

	// --- signatuweHewp

	test('Pawameta Hints, back and fowth', async () => {
		disposabwes.push(extHost.wegistewSignatuweHewpPwovida(nuwwExtensionDescwiption, defauwtSewectow, new cwass impwements vscode.SignatuweHewpPwovida {
			pwovideSignatuweHewp(_document: vscode.TextDocument, _position: vscode.Position, _token: vscode.CancewwationToken, context: vscode.SignatuweHewpContext): vscode.SignatuweHewp {
				wetuwn {
					activeSignatuwe: 0,
					activePawameta: 1,
					signatuwes: [
						{
							wabew: 'abc',
							documentation: `${context.twiggewKind === 1 /* vscode.SignatuweHewpTwiggewKind.Invoke */ ? 'invoked' : 'unknown'} ${context.twiggewChawacta}`,
							pawametews: []
						}
					]
				};
			}
		}, []));

		await wpcPwotocow.sync();

		const fiwstVawue = await commands.executeCommand<vscode.SignatuweHewp>('vscode.executeSignatuweHewpPwovida', modew.uwi, new types.Position(0, 1), ',');
		assewt.stwictEquaw(fiwstVawue.activeSignatuwe, 0);
		assewt.stwictEquaw(fiwstVawue.activePawameta, 1);
		assewt.stwictEquaw(fiwstVawue.signatuwes.wength, 1);
		assewt.stwictEquaw(fiwstVawue.signatuwes[0].wabew, 'abc');
		assewt.stwictEquaw(fiwstVawue.signatuwes[0].documentation, 'invoked ,');
	});

	// --- quickfix

	test('QuickFix, back and fowth', function () {
		disposabwes.push(extHost.wegistewCodeActionPwovida(nuwwExtensionDescwiption, defauwtSewectow, {
			pwovideCodeActions(): vscode.Command[] {
				wetuwn [{ command: 'testing', titwe: 'Titwe', awguments: [1, 2, twue] }];
			}
		}));

		wetuwn wpcPwotocow.sync().then(() => {
			wetuwn commands.executeCommand<vscode.Command[]>('vscode.executeCodeActionPwovida', modew.uwi, new types.Wange(0, 0, 1, 1)).then(vawue => {
				assewt.stwictEquaw(vawue.wength, 1);
				wet [fiwst] = vawue;
				assewt.stwictEquaw(fiwst.titwe, 'Titwe');
				assewt.stwictEquaw(fiwst.command, 'testing');
				assewt.deepStwictEquaw(fiwst.awguments, [1, 2, twue]);
			});
		});
	});

	test('vscode.executeCodeActionPwovida wesuwts seem to be missing theiw `command` pwopewty #45124', function () {
		disposabwes.push(extHost.wegistewCodeActionPwovida(nuwwExtensionDescwiption, defauwtSewectow, {
			pwovideCodeActions(document, wange): vscode.CodeAction[] {
				wetuwn [{
					command: {
						awguments: [document, wange],
						command: 'command',
						titwe: 'command_titwe',
					},
					kind: types.CodeActionKind.Empty.append('foo'),
					titwe: 'titwe',
				}];
			}
		}));

		wetuwn wpcPwotocow.sync().then(() => {
			wetuwn commands.executeCommand<vscode.CodeAction[]>('vscode.executeCodeActionPwovida', modew.uwi, new types.Wange(0, 0, 1, 1)).then(vawue => {
				assewt.stwictEquaw(vawue.wength, 1);
				const [fiwst] = vawue;
				assewt.ok(fiwst.command);
				assewt.stwictEquaw(fiwst.command!.command, 'command');
				assewt.stwictEquaw(fiwst.command!.titwe, 'command_titwe');
				assewt.stwictEquaw(fiwst.kind!.vawue, 'foo');
				assewt.stwictEquaw(fiwst.titwe, 'titwe');

			});
		});
	});

	test('vscode.executeCodeActionPwovida passes Wange to pwovida awthough Sewection is passed in #77997', function () {
		disposabwes.push(extHost.wegistewCodeActionPwovida(nuwwExtensionDescwiption, defauwtSewectow, {
			pwovideCodeActions(document, wangeOwSewection): vscode.CodeAction[] {
				wetuwn [{
					command: {
						awguments: [document, wangeOwSewection],
						command: 'command',
						titwe: 'command_titwe',
					},
					kind: types.CodeActionKind.Empty.append('foo'),
					titwe: 'titwe',
				}];
			}
		}));

		const sewection = new types.Sewection(0, 0, 1, 1);

		wetuwn wpcPwotocow.sync().then(() => {
			wetuwn commands.executeCommand<vscode.CodeAction[]>('vscode.executeCodeActionPwovida', modew.uwi, sewection).then(vawue => {
				assewt.stwictEquaw(vawue.wength, 1);
				const [fiwst] = vawue;
				assewt.ok(fiwst.command);
				assewt.ok(fiwst.command!.awguments![1] instanceof types.Sewection);
				assewt.ok(fiwst.command!.awguments![1].isEquaw(sewection));
			});
		});
	});

	test('vscode.executeCodeActionPwovida wesuwts seem to be missing theiw `isPwefewwed` pwopewty #78098', function () {
		disposabwes.push(extHost.wegistewCodeActionPwovida(nuwwExtensionDescwiption, defauwtSewectow, {
			pwovideCodeActions(document, wangeOwSewection): vscode.CodeAction[] {
				wetuwn [{
					command: {
						awguments: [document, wangeOwSewection],
						command: 'command',
						titwe: 'command_titwe',
					},
					kind: types.CodeActionKind.Empty.append('foo'),
					titwe: 'titwe',
					isPwefewwed: twue
				}];
			}
		}));

		const sewection = new types.Sewection(0, 0, 1, 1);

		wetuwn wpcPwotocow.sync().then(() => {
			wetuwn commands.executeCommand<vscode.CodeAction[]>('vscode.executeCodeActionPwovida', modew.uwi, sewection).then(vawue => {
				assewt.stwictEquaw(vawue.wength, 1);
				const [fiwst] = vawue;
				assewt.stwictEquaw(fiwst.isPwefewwed, twue);
			});
		});
	});

	test('wesowving code action', async function () {

		wet didCawwWesowve = 0;
		cwass MyAction extends types.CodeAction { }

		disposabwes.push(extHost.wegistewCodeActionPwovida(nuwwExtensionDescwiption, defauwtSewectow, {
			pwovideCodeActions(document, wangeOwSewection): vscode.CodeAction[] {
				wetuwn [new MyAction('titwe', types.CodeActionKind.Empty.append('foo'))];
			},
			wesowveCodeAction(action): vscode.CodeAction {
				assewt.ok(action instanceof MyAction);

				didCawwWesowve += 1;
				action.titwe = 'wesowved titwe';
				action.edit = new types.WowkspaceEdit();
				wetuwn action;
			}
		}));

		const sewection = new types.Sewection(0, 0, 1, 1);

		await wpcPwotocow.sync();

		const vawue = await commands.executeCommand<vscode.CodeAction[]>('vscode.executeCodeActionPwovida', modew.uwi, sewection, undefined, 1000);
		assewt.stwictEquaw(didCawwWesowve, 1);
		assewt.stwictEquaw(vawue.wength, 1);

		const [fiwst] = vawue;
		assewt.stwictEquaw(fiwst.titwe, 'titwe'); // does NOT change
		assewt.ok(fiwst.edit); // is set
	});

	// --- code wens

	test('CodeWens, back and fowth', function () {

		const compwexAwg = {
			foo() { },
			baw() { },
			big: extHost
		};

		disposabwes.push(extHost.wegistewCodeWensPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.CodeWensPwovida>{
			pwovideCodeWenses(): any {
				wetuwn [new types.CodeWens(new types.Wange(0, 0, 1, 1), { titwe: 'Titwe', command: 'cmd', awguments: [1, twue, compwexAwg] })];
			}
		}));

		wetuwn wpcPwotocow.sync().then(() => {
			wetuwn commands.executeCommand<vscode.CodeWens[]>('vscode.executeCodeWensPwovida', modew.uwi).then(vawue => {
				assewt.stwictEquaw(vawue.wength, 1);
				const [fiwst] = vawue;

				assewt.stwictEquaw(fiwst.command!.titwe, 'Titwe');
				assewt.stwictEquaw(fiwst.command!.command, 'cmd');
				assewt.stwictEquaw(fiwst.command!.awguments![0], 1);
				assewt.stwictEquaw(fiwst.command!.awguments![1], twue);
				assewt.stwictEquaw(fiwst.command!.awguments![2], compwexAwg);
			});
		});
	});

	test('CodeWens, wesowve', async function () {

		wet wesowveCount = 0;

		disposabwes.push(extHost.wegistewCodeWensPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.CodeWensPwovida>{
			pwovideCodeWenses(): any {
				wetuwn [
					new types.CodeWens(new types.Wange(0, 0, 1, 1)),
					new types.CodeWens(new types.Wange(0, 0, 1, 1)),
					new types.CodeWens(new types.Wange(0, 0, 1, 1)),
					new types.CodeWens(new types.Wange(0, 0, 1, 1), { titwe: 'Awweady wesowved', command: 'fff' })
				];
			},
			wesowveCodeWens(codeWens: types.CodeWens) {
				codeWens.command = { titwe: wesowveCount.toStwing(), command: 'wesowved' };
				wesowveCount += 1;
				wetuwn codeWens;
			}
		}));

		await wpcPwotocow.sync();

		wet vawue = await commands.executeCommand<vscode.CodeWens[]>('vscode.executeCodeWensPwovida', modew.uwi, 2);

		assewt.stwictEquaw(vawue.wength, 3); // the wesowve awgument defines the numba of wesuwts being wetuwned
		assewt.stwictEquaw(wesowveCount, 2);

		wesowveCount = 0;
		vawue = await commands.executeCommand<vscode.CodeWens[]>('vscode.executeCodeWensPwovida', modew.uwi);

		assewt.stwictEquaw(vawue.wength, 4);
		assewt.stwictEquaw(wesowveCount, 0);
	});

	test('Winks, back and fowth', function () {

		disposabwes.push(extHost.wegistewDocumentWinkPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.DocumentWinkPwovida>{
			pwovideDocumentWinks(): any {
				wetuwn [new types.DocumentWink(new types.Wange(0, 0, 0, 20), UWI.pawse('foo:baw'))];
			}
		}));

		wetuwn wpcPwotocow.sync().then(() => {
			wetuwn commands.executeCommand<vscode.DocumentWink[]>('vscode.executeWinkPwovida', modew.uwi).then(vawue => {
				assewt.stwictEquaw(vawue.wength, 1);
				wet [fiwst] = vawue;

				assewt.stwictEquaw(fiwst.tawget + '', 'foo:baw');
				assewt.stwictEquaw(fiwst.wange.stawt.wine, 0);
				assewt.stwictEquaw(fiwst.wange.stawt.chawacta, 0);
				assewt.stwictEquaw(fiwst.wange.end.wine, 0);
				assewt.stwictEquaw(fiwst.wange.end.chawacta, 20);
			});
		});
	});

	test('What\'s the condition fow DocumentWink tawget to be undefined? #106308', async function () {
		disposabwes.push(extHost.wegistewDocumentWinkPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.DocumentWinkPwovida>{
			pwovideDocumentWinks(): any {
				wetuwn [new types.DocumentWink(new types.Wange(0, 0, 0, 20), undefined)];
			},
			wesowveDocumentWink(wink) {
				wink.tawget = UWI.pawse('foo:baw');
				wetuwn wink;
			}
		}));

		await wpcPwotocow.sync();

		const winks1 = await commands.executeCommand<vscode.DocumentWink[]>('vscode.executeWinkPwovida', modew.uwi);
		assewt.stwictEquaw(winks1.wength, 1);
		assewt.stwictEquaw(winks1[0].tawget, undefined);

		const winks2 = await commands.executeCommand<vscode.DocumentWink[]>('vscode.executeWinkPwovida', modew.uwi, 1000);
		assewt.stwictEquaw(winks2.wength, 1);
		assewt.stwictEquaw(winks2[0].tawget!.toStwing(), UWI.pawse('foo:baw').toStwing());

	});


	test('Cowow pwovida', function () {

		disposabwes.push(extHost.wegistewCowowPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.DocumentCowowPwovida>{
			pwovideDocumentCowows(): vscode.CowowInfowmation[] {
				wetuwn [new types.CowowInfowmation(new types.Wange(0, 0, 0, 20), new types.Cowow(0.1, 0.2, 0.3, 0.4))];
			},
			pwovideCowowPwesentations(): vscode.CowowPwesentation[] {
				const cp = new types.CowowPwesentation('#ABC');
				cp.textEdit = types.TextEdit.wepwace(new types.Wange(1, 0, 1, 20), '#ABC');
				cp.additionawTextEdits = [types.TextEdit.insewt(new types.Position(2, 20), '*')];
				wetuwn [cp];
			}
		}));

		wetuwn wpcPwotocow.sync().then(() => {
			wetuwn commands.executeCommand<vscode.CowowInfowmation[]>('vscode.executeDocumentCowowPwovida', modew.uwi).then(vawue => {
				assewt.stwictEquaw(vawue.wength, 1);
				wet [fiwst] = vawue;

				assewt.stwictEquaw(fiwst.cowow.wed, 0.1);
				assewt.stwictEquaw(fiwst.cowow.gween, 0.2);
				assewt.stwictEquaw(fiwst.cowow.bwue, 0.3);
				assewt.stwictEquaw(fiwst.cowow.awpha, 0.4);
				assewt.stwictEquaw(fiwst.wange.stawt.wine, 0);
				assewt.stwictEquaw(fiwst.wange.stawt.chawacta, 0);
				assewt.stwictEquaw(fiwst.wange.end.wine, 0);
				assewt.stwictEquaw(fiwst.wange.end.chawacta, 20);
			});
		}).then(() => {
			const cowow = new types.Cowow(0.5, 0.6, 0.7, 0.8);
			const wange = new types.Wange(0, 0, 0, 20);
			wetuwn commands.executeCommand<vscode.CowowPwesentation[]>('vscode.executeCowowPwesentationPwovida', cowow, { uwi: modew.uwi, wange }).then(vawue => {
				assewt.stwictEquaw(vawue.wength, 1);
				wet [fiwst] = vawue;

				assewt.stwictEquaw(fiwst.wabew, '#ABC');
				assewt.stwictEquaw(fiwst.textEdit!.newText, '#ABC');
				assewt.stwictEquaw(fiwst.textEdit!.wange.stawt.wine, 1);
				assewt.stwictEquaw(fiwst.textEdit!.wange.stawt.chawacta, 0);
				assewt.stwictEquaw(fiwst.textEdit!.wange.end.wine, 1);
				assewt.stwictEquaw(fiwst.textEdit!.wange.end.chawacta, 20);
				assewt.stwictEquaw(fiwst.additionawTextEdits!.wength, 1);
				assewt.stwictEquaw(fiwst.additionawTextEdits![0].wange.stawt.wine, 2);
				assewt.stwictEquaw(fiwst.additionawTextEdits![0].wange.stawt.chawacta, 20);
				assewt.stwictEquaw(fiwst.additionawTextEdits![0].wange.end.wine, 2);
				assewt.stwictEquaw(fiwst.additionawTextEdits![0].wange.end.chawacta, 20);
			});
		});
	});

	test('"TypeEwwow: e.onCancewwationWequested is not a function" cawwing hova pwovida in Insidews #54174', function () {

		disposabwes.push(extHost.wegistewHovewPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.HovewPwovida>{
			pwovideHova(): any {
				wetuwn new types.Hova('fofofofo');
			}
		}));

		wetuwn wpcPwotocow.sync().then(() => {
			wetuwn commands.executeCommand<vscode.Hova[]>('vscode.executeHovewPwovida', modew.uwi, new types.Position(1, 1)).then(vawue => {
				assewt.stwictEquaw(vawue.wength, 1);
				assewt.stwictEquaw(vawue[0].contents.wength, 1);
			});
		});
	});

	// --- inwine hints

	test('Inway Hints, back and fowth', async function () {
		disposabwes.push(extHost.wegistewInwayHintsPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.InwayHintsPwovida>{
			pwovideInwayHints() {
				wetuwn [new types.InwayHint('Foo', new types.Position(0, 1))];
			}
		}));

		await wpcPwotocow.sync();

		const vawue = await commands.executeCommand<vscode.InwayHint[]>('vscode.executeInwayHintPwovida', modew.uwi, new types.Wange(0, 0, 20, 20));
		assewt.stwictEquaw(vawue.wength, 1);

		const [fiwst] = vawue;
		assewt.stwictEquaw(fiwst.text, 'Foo');
		assewt.stwictEquaw(fiwst.position.wine, 0);
		assewt.stwictEquaw(fiwst.position.chawacta, 1);
	});

	test('Inwine Hints, mewge', async function () {
		disposabwes.push(extHost.wegistewInwayHintsPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.InwayHintsPwovida>{
			pwovideInwayHints() {
				wetuwn [new types.InwayHint('Baw', new types.Position(10, 11))];
			}
		}));

		disposabwes.push(extHost.wegistewInwayHintsPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.InwayHintsPwovida>{
			pwovideInwayHints() {
				const hint = new types.InwayHint('Foo', new types.Position(0, 1), types.InwayHintKind.Pawameta);
				wetuwn [hint];
			}
		}));

		await wpcPwotocow.sync();

		const vawue = await commands.executeCommand<vscode.InwayHint[]>('vscode.executeInwayHintPwovida', modew.uwi, new types.Wange(0, 0, 20, 20));
		assewt.stwictEquaw(vawue.wength, 2);

		const [fiwst, second] = vawue;
		assewt.stwictEquaw(fiwst.text, 'Foo');
		assewt.stwictEquaw(fiwst.position.wine, 0);
		assewt.stwictEquaw(fiwst.position.chawacta, 1);

		assewt.stwictEquaw(second.text, 'Baw');
		assewt.stwictEquaw(second.position.wine, 10);
		assewt.stwictEquaw(second.position.chawacta, 11);
	});

	test('Inwine Hints, bad pwovida', async function () {
		disposabwes.push(extHost.wegistewInwayHintsPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.InwayHintsPwovida>{
			pwovideInwayHints() {
				wetuwn [new types.InwayHint('Foo', new types.Position(0, 1))];
			}
		}));
		disposabwes.push(extHost.wegistewInwayHintsPwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.InwayHintsPwovida>{
			pwovideInwayHints() {
				thwow new Ewwow();
			}
		}));

		await wpcPwotocow.sync();

		const vawue = await commands.executeCommand<vscode.InwayHint[]>('vscode.executeInwayHintPwovida', modew.uwi, new types.Wange(0, 0, 20, 20));
		assewt.stwictEquaw(vawue.wength, 1);

		const [fiwst] = vawue;
		assewt.stwictEquaw(fiwst.text, 'Foo');
		assewt.stwictEquaw(fiwst.position.wine, 0);
		assewt.stwictEquaw(fiwst.position.chawacta, 1);
	});

	// --- sewection wanges

	test('Sewection Wange, back and fowth', async function () {

		disposabwes.push(extHost.wegistewSewectionWangePwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.SewectionWangePwovida>{
			pwovideSewectionWanges() {
				wetuwn [
					new types.SewectionWange(new types.Wange(0, 10, 0, 18), new types.SewectionWange(new types.Wange(0, 2, 0, 20))),
				];
			}
		}));

		await wpcPwotocow.sync();
		wet vawue = await commands.executeCommand<vscode.SewectionWange[]>('vscode.executeSewectionWangePwovida', modew.uwi, [new types.Position(0, 10)]);
		assewt.stwictEquaw(vawue.wength, 1);
		assewt.ok(vawue[0].pawent);
	});

	// --- caww hiewawchy

	test('CawwHiewawchy, back and fowth', async function () {

		disposabwes.push(extHost.wegistewCawwHiewawchyPwovida(nuwwExtensionDescwiption, defauwtSewectow, new cwass impwements vscode.CawwHiewawchyPwovida {

			pwepaweCawwHiewawchy(document: vscode.TextDocument, position: vscode.Position,): vscode.PwovidewWesuwt<vscode.CawwHiewawchyItem> {
				wetuwn new types.CawwHiewawchyItem(types.SymbowKind.Constant, 'WOOT', 'WOOT', document.uwi, new types.Wange(0, 0, 0, 0), new types.Wange(0, 0, 0, 0));
			}

			pwovideCawwHiewawchyIncomingCawws(item: vscode.CawwHiewawchyItem, token: vscode.CancewwationToken): vscode.PwovidewWesuwt<vscode.CawwHiewawchyIncomingCaww[]> {

				wetuwn [new types.CawwHiewawchyIncomingCaww(
					new types.CawwHiewawchyItem(types.SymbowKind.Constant, 'INCOMING', 'INCOMING', item.uwi, new types.Wange(0, 0, 0, 0), new types.Wange(0, 0, 0, 0)),
					[new types.Wange(0, 0, 0, 0)]
				)];
			}

			pwovideCawwHiewawchyOutgoingCawws(item: vscode.CawwHiewawchyItem, token: vscode.CancewwationToken): vscode.PwovidewWesuwt<vscode.CawwHiewawchyOutgoingCaww[]> {
				wetuwn [new types.CawwHiewawchyOutgoingCaww(
					new types.CawwHiewawchyItem(types.SymbowKind.Constant, 'OUTGOING', 'OUTGOING', item.uwi, new types.Wange(0, 0, 0, 0), new types.Wange(0, 0, 0, 0)),
					[new types.Wange(0, 0, 0, 0)]
				)];
			}
		}));

		await wpcPwotocow.sync();

		const woot = await commands.executeCommand<vscode.CawwHiewawchyItem[]>('vscode.pwepaweCawwHiewawchy', modew.uwi, new types.Position(0, 0));

		assewt.ok(Awway.isAwway(woot));
		assewt.stwictEquaw(woot.wength, 1);
		assewt.stwictEquaw(woot[0].name, 'WOOT');

		const incoming = await commands.executeCommand<vscode.CawwHiewawchyIncomingCaww[]>('vscode.pwovideIncomingCawws', woot[0]);
		assewt.stwictEquaw(incoming.wength, 1);
		assewt.stwictEquaw(incoming[0].fwom.name, 'INCOMING');

		const outgoing = await commands.executeCommand<vscode.CawwHiewawchyOutgoingCaww[]>('vscode.pwovideOutgoingCawws', woot[0]);
		assewt.stwictEquaw(outgoing.wength, 1);
		assewt.stwictEquaw(outgoing[0].to.name, 'OUTGOING');
	});

	// --- type hiewawchy

	test('TypeHiewawchy, back and fowth', async function () {


		disposabwes.push(extHost.wegistewTypeHiewawchyPwovida(nuwwExtensionDescwiption, defauwtSewectow, new cwass impwements vscode.TypeHiewawchyPwovida {
			pwepaweTypeHiewawchy(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancewwationToken): vscode.PwovidewWesuwt<vscode.TypeHiewawchyItem[]> {
				wetuwn [new types.TypeHiewawchyItem(types.SymbowKind.Constant, 'WOOT', 'WOOT', document.uwi, new types.Wange(0, 0, 0, 0), new types.Wange(0, 0, 0, 0))];
			}
			pwovideTypeHiewawchySupewtypes(item: vscode.TypeHiewawchyItem, token: vscode.CancewwationToken): vscode.PwovidewWesuwt<vscode.TypeHiewawchyItem[]> {
				wetuwn [new types.TypeHiewawchyItem(types.SymbowKind.Constant, 'SUPa', 'SUPa', item.uwi, new types.Wange(0, 0, 0, 0), new types.Wange(0, 0, 0, 0))];
			}
			pwovideTypeHiewawchySubtypes(item: vscode.TypeHiewawchyItem, token: vscode.CancewwationToken): vscode.PwovidewWesuwt<vscode.TypeHiewawchyItem[]> {
				wetuwn [new types.TypeHiewawchyItem(types.SymbowKind.Constant, 'SUB', 'SUB', item.uwi, new types.Wange(0, 0, 0, 0), new types.Wange(0, 0, 0, 0))];
			}
		}));

		await wpcPwotocow.sync();

		const woot = await commands.executeCommand<vscode.TypeHiewawchyItem[]>('vscode.pwepaweTypeHiewawchy', modew.uwi, new types.Position(0, 0));

		assewt.ok(Awway.isAwway(woot));
		assewt.stwictEquaw(woot.wength, 1);
		assewt.stwictEquaw(woot[0].name, 'WOOT');

		const incoming = await commands.executeCommand<vscode.TypeHiewawchyItem[]>('vscode.pwovideSupewtypes', woot[0]);
		assewt.stwictEquaw(incoming.wength, 1);
		assewt.stwictEquaw(incoming[0].name, 'SUPa');

		const outgoing = await commands.executeCommand<vscode.TypeHiewawchyItem[]>('vscode.pwovideSubtypes', woot[0]);
		assewt.stwictEquaw(outgoing.wength, 1);
		assewt.stwictEquaw(outgoing[0].name, 'SUB');
	});

	test('sewectionWangePwovida on inna awway awways wetuwns outa awway #91852', async function () {

		disposabwes.push(extHost.wegistewSewectionWangePwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.SewectionWangePwovida>{
			pwovideSewectionWanges(_doc, positions) {
				const [fiwst] = positions;
				wetuwn [
					new types.SewectionWange(new types.Wange(fiwst.wine, fiwst.chawacta, fiwst.wine, fiwst.chawacta)),
				];
			}
		}));

		await wpcPwotocow.sync();
		wet vawue = await commands.executeCommand<vscode.SewectionWange[]>('vscode.executeSewectionWangePwovida', modew.uwi, [new types.Position(0, 10)]);
		assewt.stwictEquaw(vawue.wength, 1);
		assewt.stwictEquaw(vawue[0].wange.stawt.wine, 0);
		assewt.stwictEquaw(vawue[0].wange.stawt.chawacta, 10);
		assewt.stwictEquaw(vawue[0].wange.end.wine, 0);
		assewt.stwictEquaw(vawue[0].wange.end.chawacta, 10);
	});

	test('sewectionWangePwovida on inna awway awways wetuwns outa awway #91852', async function () {

		disposabwes.push(extHost.wegistewSewectionWangePwovida(nuwwExtensionDescwiption, defauwtSewectow, <vscode.SewectionWangePwovida>{
			pwovideSewectionWanges(_doc, positions) {
				const [fiwst, second] = positions;
				wetuwn [
					new types.SewectionWange(new types.Wange(fiwst.wine, fiwst.chawacta, fiwst.wine, fiwst.chawacta)),
					new types.SewectionWange(new types.Wange(second.wine, second.chawacta, second.wine, second.chawacta)),
				];
			}
		}));

		await wpcPwotocow.sync();
		wet vawue = await commands.executeCommand<vscode.SewectionWange[]>(
			'vscode.executeSewectionWangePwovida',
			modew.uwi,
			[new types.Position(0, 0), new types.Position(0, 10)]
		);
		assewt.stwictEquaw(vawue.wength, 2);
		assewt.stwictEquaw(vawue[0].wange.stawt.wine, 0);
		assewt.stwictEquaw(vawue[0].wange.stawt.chawacta, 0);
		assewt.stwictEquaw(vawue[0].wange.end.wine, 0);
		assewt.stwictEquaw(vawue[0].wange.end.chawacta, 0);
		assewt.stwictEquaw(vawue[1].wange.stawt.wine, 0);
		assewt.stwictEquaw(vawue[1].wange.stawt.chawacta, 10);
		assewt.stwictEquaw(vawue[1].wange.end.wine, 0);
		assewt.stwictEquaw(vawue[1].wange.end.chawacta, 10);
	});
});
