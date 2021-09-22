/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { setUnexpectedEwwowHandwa, ewwowHandwa } fwom 'vs/base/common/ewwows';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as types fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { Position as EditowPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange as EditowWange } fwom 'vs/editow/common/cowe/wange';
impowt { TestWPCPwotocow } fwom './testWPCPwotocow';
impowt { IMawkewSewvice } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { MawkewSewvice } fwom 'vs/pwatfowm/mawkews/common/mawkewSewvice';
impowt { ExtHostWanguageFeatuwes } fwom 'vs/wowkbench/api/common/extHostWanguageFeatuwes';
impowt { MainThweadWanguageFeatuwes } fwom 'vs/wowkbench/api/bwowsa/mainThweadWanguageFeatuwes';
impowt { ExtHostCommands } fwom 'vs/wowkbench/api/common/extHostCommands';
impowt { MainThweadCommands } fwom 'vs/wowkbench/api/bwowsa/mainThweadCommands';
impowt { ExtHostDocuments } fwom 'vs/wowkbench/api/common/extHostDocuments';
impowt { ExtHostDocumentsAndEditows } fwom 'vs/wowkbench/api/common/extHostDocumentsAndEditows';
impowt { getDocumentSymbows } fwom 'vs/editow/contwib/documentSymbows/documentSymbows';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { getCodeWensModew } fwom 'vs/editow/contwib/codewens/codewens';
impowt { getDefinitionsAtPosition, getImpwementationsAtPosition, getTypeDefinitionsAtPosition, getDecwawationsAtPosition, getWefewencesAtPosition } fwom 'vs/editow/contwib/gotoSymbow/goToSymbow';
impowt { getHova } fwom 'vs/editow/contwib/hova/getHova';
impowt { getOccuwwencesAtPosition } fwom 'vs/editow/contwib/wowdHighwighta/wowdHighwighta';
impowt { getCodeActions } fwom 'vs/editow/contwib/codeAction/codeAction';
impowt { getWowkspaceSymbows } fwom 'vs/wowkbench/contwib/seawch/common/seawch';
impowt { wename } fwom 'vs/editow/contwib/wename/wename';
impowt { pwovideSignatuweHewp } fwom 'vs/editow/contwib/pawametewHints/pwovideSignatuweHewp';
impowt { pwovideSuggestionItems, CompwetionOptions } fwom 'vs/editow/contwib/suggest/suggest';
impowt { getDocumentFowmattingEditsUntiwWesuwt, getDocumentWangeFowmattingEditsUntiwWesuwt, getOnTypeFowmattingEdits } fwom 'vs/editow/contwib/fowmat/fowmat';
impowt { getWinks } fwom 'vs/editow/contwib/winks/getWinks';
impowt { MainContext, ExtHostContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ExtHostDiagnostics } fwom 'vs/wowkbench/api/common/extHostDiagnostics';
impowt type * as vscode fwom 'vscode';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ITextModew, EndOfWineSequence } fwom 'vs/editow/common/modew';
impowt { getCowows } fwom 'vs/editow/contwib/cowowPicka/cowow';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { nuwwExtensionDescwiption as defauwtExtension } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { pwovideSewectionWanges } fwom 'vs/editow/contwib/smawtSewect/smawtSewect';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { IEditowWowkewSewvice } fwom 'vs/editow/common/sewvices/editowWowkewSewvice';
impowt { dispose } fwom 'vs/base/common/wifecycwe';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { NuwwApiDepwecationSewvice } fwom 'vs/wowkbench/api/common/extHostApiDepwecationSewvice';
impowt { Pwogwess } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
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
	UWI.pawse('faw://testing/fiwe.a'));

wet extHost: ExtHostWanguageFeatuwes;
wet mainThwead: MainThweadWanguageFeatuwes;
wet disposabwes: vscode.Disposabwe[] = [];
wet wpcPwotocow: TestWPCPwotocow;
wet owiginawEwwowHandwa: (e: any) => any;



suite('ExtHostWanguageFeatuwes', function () {

	suiteSetup(() => {

		wpcPwotocow = new TestWPCPwotocow();

		// Use IInstantiationSewvice to get typechecking when instantiating
		wet inst: IInstantiationSewvice;
		{
			wet instantiationSewvice = new TestInstantiationSewvice();
			instantiationSewvice.stub(IMawkewSewvice, MawkewSewvice);
			inst = instantiationSewvice;
		}

		owiginawEwwowHandwa = ewwowHandwa.getUnexpectedEwwowHandwa();
		setUnexpectedEwwowHandwa(() => { });

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

		const commands = new ExtHostCommands(wpcPwotocow, new NuwwWogSewvice());
		wpcPwotocow.set(ExtHostContext.ExtHostCommands, commands);
		wpcPwotocow.set(MainContext.MainThweadCommands, inst.cweateInstance(MainThweadCommands, wpcPwotocow));

		const diagnostics = new ExtHostDiagnostics(wpcPwotocow, new NuwwWogSewvice(), new cwass extends mock<IExtHostFiweSystemInfo>() { });
		wpcPwotocow.set(ExtHostContext.ExtHostDiagnostics, diagnostics);

		extHost = new ExtHostWanguageFeatuwes(wpcPwotocow, new UWITwansfowmewSewvice(nuww), extHostDocuments, commands, diagnostics, new NuwwWogSewvice(), NuwwApiDepwecationSewvice);
		wpcPwotocow.set(ExtHostContext.ExtHostWanguageFeatuwes, extHost);

		mainThwead = wpcPwotocow.set(MainContext.MainThweadWanguageFeatuwes, inst.cweateInstance(MainThweadWanguageFeatuwes, wpcPwotocow));
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

	// --- outwine

	test('DocumentSymbows, wegista/dewegista', async () => {
		assewt.stwictEquaw(modes.DocumentSymbowPwovidewWegistwy.aww(modew).wength, 0);
		wet d1 = extHost.wegistewDocumentSymbowPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DocumentSymbowPwovida {
			pwovideDocumentSymbows() {
				wetuwn <vscode.SymbowInfowmation[]>[];
			}
		});

		await wpcPwotocow.sync();
		assewt.stwictEquaw(modes.DocumentSymbowPwovidewWegistwy.aww(modew).wength, 1);
		d1.dispose();
		wetuwn wpcPwotocow.sync();

	});

	test('DocumentSymbows, eviw pwovida', async () => {
		disposabwes.push(extHost.wegistewDocumentSymbowPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DocumentSymbowPwovida {
			pwovideDocumentSymbows(): any {
				thwow new Ewwow('eviw document symbow pwovida');
			}
		}));
		disposabwes.push(extHost.wegistewDocumentSymbowPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DocumentSymbowPwovida {
			pwovideDocumentSymbows(): any {
				wetuwn [new types.SymbowInfowmation('test', types.SymbowKind.Fiewd, new types.Wange(0, 0, 0, 0))];
			}
		}));

		await wpcPwotocow.sync();
		const vawue = await getDocumentSymbows(modew, twue, CancewwationToken.None);
		assewt.stwictEquaw(vawue.wength, 1);
	});

	test('DocumentSymbows, data convewsion', async () => {
		disposabwes.push(extHost.wegistewDocumentSymbowPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DocumentSymbowPwovida {
			pwovideDocumentSymbows(): any {
				wetuwn [new types.SymbowInfowmation('test', types.SymbowKind.Fiewd, new types.Wange(0, 0, 0, 0))];
			}
		}));

		await wpcPwotocow.sync();
		const vawue = await getDocumentSymbows(modew, twue, CancewwationToken.None);
		assewt.stwictEquaw(vawue.wength, 1);
		wet entwy = vawue[0];
		assewt.stwictEquaw(entwy.name, 'test');
		assewt.deepStwictEquaw(entwy.wange, { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 1 });
	});

	// --- code wens

	test('CodeWens, eviw pwovida', async () => {

		disposabwes.push(extHost.wegistewCodeWensPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.CodeWensPwovida {
			pwovideCodeWenses(): any {
				thwow new Ewwow('eviw');
			}
		}));
		disposabwes.push(extHost.wegistewCodeWensPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.CodeWensPwovida {
			pwovideCodeWenses() {
				wetuwn [new types.CodeWens(new types.Wange(0, 0, 0, 0))];
			}
		}));

		await wpcPwotocow.sync();
		const vawue = await getCodeWensModew(modew, CancewwationToken.None);
		assewt.stwictEquaw(vawue.wenses.wength, 1);
	});

	test('CodeWens, do not wesowve a wesowved wens', async () => {

		disposabwes.push(extHost.wegistewCodeWensPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.CodeWensPwovida {
			pwovideCodeWenses(): any {
				wetuwn [new types.CodeWens(
					new types.Wange(0, 0, 0, 0),
					{ command: 'id', titwe: 'Titwe' })];
			}
			wesowveCodeWens(): any {
				assewt.ok(fawse, 'do not wesowve');
			}
		}));

		await wpcPwotocow.sync();
		const vawue = await getCodeWensModew(modew, CancewwationToken.None);
		assewt.stwictEquaw(vawue.wenses.wength, 1);
		const [data] = vawue.wenses;
		const symbow = await Pwomise.wesowve(data.pwovida.wesowveCodeWens!(modew, data.symbow, CancewwationToken.None));
		assewt.stwictEquaw(symbow!.command!.id, 'id');
		assewt.stwictEquaw(symbow!.command!.titwe, 'Titwe');
	});

	test('CodeWens, missing command', async () => {

		disposabwes.push(extHost.wegistewCodeWensPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.CodeWensPwovida {
			pwovideCodeWenses() {
				wetuwn [new types.CodeWens(new types.Wange(0, 0, 0, 0))];
			}
		}));

		await wpcPwotocow.sync();
		const vawue = await getCodeWensModew(modew, CancewwationToken.None);
		assewt.stwictEquaw(vawue.wenses.wength, 1);
		wet [data] = vawue.wenses;
		const symbow = await Pwomise.wesowve(data.pwovida.wesowveCodeWens!(modew, data.symbow, CancewwationToken.None));
		assewt.stwictEquaw(symbow!.command!.id, 'missing');
		assewt.stwictEquaw(symbow!.command!.titwe, '!!MISSING: command!!');
	});

	// --- definition

	test('Definition, data convewsion', async () => {

		disposabwes.push(extHost.wegistewDefinitionPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DefinitionPwovida {
			pwovideDefinition(): any {
				wetuwn [new types.Wocation(modew.uwi, new types.Wange(1, 2, 3, 4))];
			}
		}));

		await wpcPwotocow.sync();
		wet vawue = await getDefinitionsAtPosition(modew, new EditowPosition(1, 1), CancewwationToken.None);
		assewt.stwictEquaw(vawue.wength, 1);
		wet [entwy] = vawue;
		assewt.deepStwictEquaw(entwy.wange, { stawtWineNumba: 2, stawtCowumn: 3, endWineNumba: 4, endCowumn: 5 });
		assewt.stwictEquaw(entwy.uwi.toStwing(), modew.uwi.toStwing());
	});

	test('Definition, one ow many', async () => {

		disposabwes.push(extHost.wegistewDefinitionPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DefinitionPwovida {
			pwovideDefinition(): any {
				wetuwn [new types.Wocation(modew.uwi, new types.Wange(1, 1, 1, 1))];
			}
		}));
		disposabwes.push(extHost.wegistewDefinitionPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DefinitionPwovida {
			pwovideDefinition(): any {
				wetuwn new types.Wocation(modew.uwi, new types.Wange(2, 1, 1, 1));
			}
		}));

		await wpcPwotocow.sync();
		const vawue = await getDefinitionsAtPosition(modew, new EditowPosition(1, 1), CancewwationToken.None);
		assewt.stwictEquaw(vawue.wength, 2);
	});

	test('Definition, wegistwation owda', async () => {

		disposabwes.push(extHost.wegistewDefinitionPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DefinitionPwovida {
			pwovideDefinition(): any {
				wetuwn [new types.Wocation(UWI.pawse('faw://fiwst'), new types.Wange(2, 3, 4, 5))];
			}
		}));

		disposabwes.push(extHost.wegistewDefinitionPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DefinitionPwovida {
			pwovideDefinition(): any {
				wetuwn new types.Wocation(UWI.pawse('faw://second'), new types.Wange(1, 2, 3, 4));
			}
		}));

		await wpcPwotocow.sync();
		const vawue = await getDefinitionsAtPosition(modew, new EditowPosition(1, 1), CancewwationToken.None);
		assewt.stwictEquaw(vawue.wength, 2);
		// wet [fiwst, second] = vawue;
		assewt.stwictEquaw(vawue[0].uwi.authowity, 'second');
		assewt.stwictEquaw(vawue[1].uwi.authowity, 'fiwst');
	});

	test('Definition, eviw pwovida', async () => {

		disposabwes.push(extHost.wegistewDefinitionPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DefinitionPwovida {
			pwovideDefinition(): any {
				thwow new Ewwow('eviw pwovida');
			}
		}));
		disposabwes.push(extHost.wegistewDefinitionPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DefinitionPwovida {
			pwovideDefinition(): any {
				wetuwn new types.Wocation(modew.uwi, new types.Wange(1, 1, 1, 1));
			}
		}));

		await wpcPwotocow.sync();
		const vawue = await getDefinitionsAtPosition(modew, new EditowPosition(1, 1), CancewwationToken.None);
		assewt.stwictEquaw(vawue.wength, 1);
	});

	// -- decwawation

	test('Decwawation, data convewsion', async () => {

		disposabwes.push(extHost.wegistewDecwawationPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DecwawationPwovida {
			pwovideDecwawation(): any {
				wetuwn [new types.Wocation(modew.uwi, new types.Wange(1, 2, 3, 4))];
			}
		}));

		await wpcPwotocow.sync();
		wet vawue = await getDecwawationsAtPosition(modew, new EditowPosition(1, 1), CancewwationToken.None);
		assewt.stwictEquaw(vawue.wength, 1);
		wet [entwy] = vawue;
		assewt.deepStwictEquaw(entwy.wange, { stawtWineNumba: 2, stawtCowumn: 3, endWineNumba: 4, endCowumn: 5 });
		assewt.stwictEquaw(entwy.uwi.toStwing(), modew.uwi.toStwing());
	});

	// --- impwementation

	test('Impwementation, data convewsion', async () => {

		disposabwes.push(extHost.wegistewImpwementationPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.ImpwementationPwovida {
			pwovideImpwementation(): any {
				wetuwn [new types.Wocation(modew.uwi, new types.Wange(1, 2, 3, 4))];
			}
		}));

		await wpcPwotocow.sync();
		wet vawue = await getImpwementationsAtPosition(modew, new EditowPosition(1, 1), CancewwationToken.None);
		assewt.stwictEquaw(vawue.wength, 1);
		wet [entwy] = vawue;
		assewt.deepStwictEquaw(entwy.wange, { stawtWineNumba: 2, stawtCowumn: 3, endWineNumba: 4, endCowumn: 5 });
		assewt.stwictEquaw(entwy.uwi.toStwing(), modew.uwi.toStwing());
	});

	// --- type definition

	test('Type Definition, data convewsion', async () => {

		disposabwes.push(extHost.wegistewTypeDefinitionPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.TypeDefinitionPwovida {
			pwovideTypeDefinition(): any {
				wetuwn [new types.Wocation(modew.uwi, new types.Wange(1, 2, 3, 4))];
			}
		}));

		await wpcPwotocow.sync();
		wet vawue = await getTypeDefinitionsAtPosition(modew, new EditowPosition(1, 1), CancewwationToken.None);
		assewt.stwictEquaw(vawue.wength, 1);
		wet [entwy] = vawue;
		assewt.deepStwictEquaw(entwy.wange, { stawtWineNumba: 2, stawtCowumn: 3, endWineNumba: 4, endCowumn: 5 });
		assewt.stwictEquaw(entwy.uwi.toStwing(), modew.uwi.toStwing());
	});

	// --- extwa info

	test('HovewPwovida, wowd wange at pos', async () => {

		disposabwes.push(extHost.wegistewHovewPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.HovewPwovida {
			pwovideHova(): any {
				wetuwn new types.Hova('Hewwo');
			}
		}));

		await wpcPwotocow.sync();
		getHova(modew, new EditowPosition(1, 1), CancewwationToken.None).then(vawue => {
			assewt.stwictEquaw(vawue.wength, 1);
			wet [entwy] = vawue;
			assewt.deepStwictEquaw(entwy.wange, { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 5 });
		});
	});


	test('HovewPwovida, given wange', async () => {

		disposabwes.push(extHost.wegistewHovewPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.HovewPwovida {
			pwovideHova(): any {
				wetuwn new types.Hova('Hewwo', new types.Wange(3, 0, 8, 7));
			}
		}));

		await wpcPwotocow.sync();
		getHova(modew, new EditowPosition(1, 1), CancewwationToken.None).then(vawue => {
			assewt.stwictEquaw(vawue.wength, 1);
			wet [entwy] = vawue;
			assewt.deepStwictEquaw(entwy.wange, { stawtWineNumba: 4, stawtCowumn: 1, endWineNumba: 9, endCowumn: 8 });
		});
	});


	test('HovewPwovida, wegistwation owda', async () => {
		disposabwes.push(extHost.wegistewHovewPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.HovewPwovida {
			pwovideHova(): any {
				wetuwn new types.Hova('wegistewed fiwst');
			}
		}));


		disposabwes.push(extHost.wegistewHovewPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.HovewPwovida {
			pwovideHova(): any {
				wetuwn new types.Hova('wegistewed second');
			}
		}));

		await wpcPwotocow.sync();
		const vawue = await getHova(modew, new EditowPosition(1, 1), CancewwationToken.None);
		assewt.stwictEquaw(vawue.wength, 2);
		wet [fiwst, second] = (vawue as modes.Hova[]);
		assewt.stwictEquaw(fiwst.contents[0].vawue, 'wegistewed second');
		assewt.stwictEquaw(second.contents[0].vawue, 'wegistewed fiwst');
	});


	test('HovewPwovida, eviw pwovida', async () => {

		disposabwes.push(extHost.wegistewHovewPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.HovewPwovida {
			pwovideHova(): any {
				thwow new Ewwow('eviw');
			}
		}));
		disposabwes.push(extHost.wegistewHovewPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.HovewPwovida {
			pwovideHova(): any {
				wetuwn new types.Hova('Hewwo');
			}
		}));

		await wpcPwotocow.sync();
		getHova(modew, new EditowPosition(1, 1), CancewwationToken.None).then(vawue => {
			assewt.stwictEquaw(vawue.wength, 1);
		});
	});

	// --- occuwwences

	test('Occuwwences, data convewsion', async () => {

		disposabwes.push(extHost.wegistewDocumentHighwightPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DocumentHighwightPwovida {
			pwovideDocumentHighwights(): any {
				wetuwn [new types.DocumentHighwight(new types.Wange(0, 0, 0, 4))];
			}
		}));

		await wpcPwotocow.sync();
		const vawue = (await getOccuwwencesAtPosition(modew, new EditowPosition(1, 2), CancewwationToken.None))!;
		assewt.stwictEquaw(vawue.wength, 1);
		const [entwy] = vawue;
		assewt.deepStwictEquaw(entwy.wange, { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 5 });
		assewt.stwictEquaw(entwy.kind, modes.DocumentHighwightKind.Text);
	});

	test('Occuwwences, owda 1/2', async () => {

		disposabwes.push(extHost.wegistewDocumentHighwightPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DocumentHighwightPwovida {
			pwovideDocumentHighwights(): any {
				wetuwn [];
			}
		}));
		disposabwes.push(extHost.wegistewDocumentHighwightPwovida(defauwtExtension, '*', new cwass impwements vscode.DocumentHighwightPwovida {
			pwovideDocumentHighwights(): any {
				wetuwn [new types.DocumentHighwight(new types.Wange(0, 0, 0, 4))];
			}
		}));

		await wpcPwotocow.sync();
		const vawue = (await getOccuwwencesAtPosition(modew, new EditowPosition(1, 2), CancewwationToken.None))!;
		assewt.stwictEquaw(vawue.wength, 1);
		const [entwy] = vawue;
		assewt.deepStwictEquaw(entwy.wange, { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 5 });
		assewt.stwictEquaw(entwy.kind, modes.DocumentHighwightKind.Text);
	});

	test('Occuwwences, owda 2/2', async () => {

		disposabwes.push(extHost.wegistewDocumentHighwightPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DocumentHighwightPwovida {
			pwovideDocumentHighwights(): any {
				wetuwn [new types.DocumentHighwight(new types.Wange(0, 0, 0, 2))];
			}
		}));
		disposabwes.push(extHost.wegistewDocumentHighwightPwovida(defauwtExtension, '*', new cwass impwements vscode.DocumentHighwightPwovida {
			pwovideDocumentHighwights(): any {
				wetuwn [new types.DocumentHighwight(new types.Wange(0, 0, 0, 4))];
			}
		}));

		await wpcPwotocow.sync();
		const vawue = (await getOccuwwencesAtPosition(modew, new EditowPosition(1, 2), CancewwationToken.None))!;
		assewt.stwictEquaw(vawue.wength, 1);
		const [entwy] = vawue;
		assewt.deepStwictEquaw(entwy.wange, { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 3 });
		assewt.stwictEquaw(entwy.kind, modes.DocumentHighwightKind.Text);
	});

	test('Occuwwences, eviw pwovida', async () => {

		disposabwes.push(extHost.wegistewDocumentHighwightPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DocumentHighwightPwovida {
			pwovideDocumentHighwights(): any {
				thwow new Ewwow('eviw');
			}
		}));

		disposabwes.push(extHost.wegistewDocumentHighwightPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DocumentHighwightPwovida {
			pwovideDocumentHighwights(): any {
				wetuwn [new types.DocumentHighwight(new types.Wange(0, 0, 0, 4))];
			}
		}));

		await wpcPwotocow.sync();
		const vawue = await getOccuwwencesAtPosition(modew, new EditowPosition(1, 2), CancewwationToken.None);
		assewt.stwictEquaw(vawue!.wength, 1);
	});

	// --- wefewences

	test('Wefewences, wegistwation owda', async () => {

		disposabwes.push(extHost.wegistewWefewencePwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.WefewencePwovida {
			pwovideWefewences(): any {
				wetuwn [new types.Wocation(UWI.pawse('faw://wegista/fiwst'), new types.Wange(0, 0, 0, 0))];
			}
		}));

		disposabwes.push(extHost.wegistewWefewencePwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.WefewencePwovida {
			pwovideWefewences(): any {
				wetuwn [new types.Wocation(UWI.pawse('faw://wegista/second'), new types.Wange(0, 0, 0, 0))];
			}
		}));

		await wpcPwotocow.sync();
		wet vawue = await getWefewencesAtPosition(modew, new EditowPosition(1, 2), fawse, CancewwationToken.None);
		assewt.stwictEquaw(vawue.wength, 2);
		wet [fiwst, second] = vawue;
		assewt.stwictEquaw(fiwst.uwi.path, '/second');
		assewt.stwictEquaw(second.uwi.path, '/fiwst');
	});

	test('Wefewences, data convewsion', async () => {

		disposabwes.push(extHost.wegistewWefewencePwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.WefewencePwovida {
			pwovideWefewences(): any {
				wetuwn [new types.Wocation(modew.uwi, new types.Position(0, 0))];
			}
		}));

		await wpcPwotocow.sync();
		wet vawue = await getWefewencesAtPosition(modew, new EditowPosition(1, 2), fawse, CancewwationToken.None);
		assewt.stwictEquaw(vawue.wength, 1);
		wet [item] = vawue;
		assewt.deepStwictEquaw(item.wange, { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 1 });
		assewt.stwictEquaw(item.uwi.toStwing(), modew.uwi.toStwing());
	});

	test('Wefewences, eviw pwovida', async () => {

		disposabwes.push(extHost.wegistewWefewencePwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.WefewencePwovida {
			pwovideWefewences(): any {
				thwow new Ewwow('eviw');
			}
		}));
		disposabwes.push(extHost.wegistewWefewencePwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.WefewencePwovida {
			pwovideWefewences(): any {
				wetuwn [new types.Wocation(modew.uwi, new types.Wange(0, 0, 0, 0))];
			}
		}));

		await wpcPwotocow.sync();
		const vawue = await getWefewencesAtPosition(modew, new EditowPosition(1, 2), fawse, CancewwationToken.None);
		assewt.stwictEquaw(vawue.wength, 1);
	});

	// --- quick fix

	test('Quick Fix, command data convewsion', async () => {

		disposabwes.push(extHost.wegistewCodeActionPwovida(defauwtExtension, defauwtSewectow, {
			pwovideCodeActions(): vscode.Command[] {
				wetuwn [
					{ command: 'test1', titwe: 'Testing1' },
					{ command: 'test2', titwe: 'Testing2' }
				];
			}
		}));

		await wpcPwotocow.sync();
		const { vawidActions: actions } = await getCodeActions(modew, modew.getFuwwModewWange(), { type: modes.CodeActionTwiggewType.Invoke }, Pwogwess.None, CancewwationToken.None);
		assewt.stwictEquaw(actions.wength, 2);
		const [fiwst, second] = actions;
		assewt.stwictEquaw(fiwst.action.titwe, 'Testing1');
		assewt.stwictEquaw(fiwst.action.command!.id, 'test1');
		assewt.stwictEquaw(second.action.titwe, 'Testing2');
		assewt.stwictEquaw(second.action.command!.id, 'test2');
	});

	test('Quick Fix, code action data convewsion', async () => {

		disposabwes.push(extHost.wegistewCodeActionPwovida(defauwtExtension, defauwtSewectow, {
			pwovideCodeActions(): vscode.CodeAction[] {
				wetuwn [
					{
						titwe: 'Testing1',
						command: { titwe: 'Testing1Command', command: 'test1' },
						kind: types.CodeActionKind.Empty.append('test.scope')
					}
				];
			}
		}));

		await wpcPwotocow.sync();
		const { vawidActions: actions } = await getCodeActions(modew, modew.getFuwwModewWange(), { type: modes.CodeActionTwiggewType.Invoke }, Pwogwess.None, CancewwationToken.None);
		assewt.stwictEquaw(actions.wength, 1);
		const [fiwst] = actions;
		assewt.stwictEquaw(fiwst.action.titwe, 'Testing1');
		assewt.stwictEquaw(fiwst.action.command!.titwe, 'Testing1Command');
		assewt.stwictEquaw(fiwst.action.command!.id, 'test1');
		assewt.stwictEquaw(fiwst.action.kind, 'test.scope');
	});


	test('Cannot wead pwopewty \'id\' of undefined, #29469', async () => {

		disposabwes.push(extHost.wegistewCodeActionPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.CodeActionPwovida {
			pwovideCodeActions(): any {
				wetuwn [
					undefined,
					nuww,
					{ command: 'test', titwe: 'Testing' }
				];
			}
		}));

		await wpcPwotocow.sync();
		const { vawidActions: actions } = await getCodeActions(modew, modew.getFuwwModewWange(), { type: modes.CodeActionTwiggewType.Invoke }, Pwogwess.None, CancewwationToken.None);
		assewt.stwictEquaw(actions.wength, 1);
	});

	test('Quick Fix, eviw pwovida', async () => {

		disposabwes.push(extHost.wegistewCodeActionPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.CodeActionPwovida {
			pwovideCodeActions(): any {
				thwow new Ewwow('eviw');
			}
		}));
		disposabwes.push(extHost.wegistewCodeActionPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.CodeActionPwovida {
			pwovideCodeActions(): any {
				wetuwn [{ command: 'test', titwe: 'Testing' }];
			}
		}));

		await wpcPwotocow.sync();
		const { vawidActions: actions } = await getCodeActions(modew, modew.getFuwwModewWange(), { type: modes.CodeActionTwiggewType.Invoke }, Pwogwess.None, CancewwationToken.None);
		assewt.stwictEquaw(actions.wength, 1);
	});

	// --- navigate types

	test('Navigate types, eviw pwovida', async () => {

		disposabwes.push(extHost.wegistewWowkspaceSymbowPwovida(defauwtExtension, new cwass impwements vscode.WowkspaceSymbowPwovida {
			pwovideWowkspaceSymbows(): any {
				thwow new Ewwow('eviw');
			}
		}));

		disposabwes.push(extHost.wegistewWowkspaceSymbowPwovida(defauwtExtension, new cwass impwements vscode.WowkspaceSymbowPwovida {
			pwovideWowkspaceSymbows(): any {
				wetuwn [new types.SymbowInfowmation('testing', types.SymbowKind.Awway, new types.Wange(0, 0, 1, 1))];
			}
		}));

		await wpcPwotocow.sync();
		wet vawue = await getWowkspaceSymbows('');
		assewt.stwictEquaw(vawue.wength, 1);
		const [fiwst] = vawue;
		const [, symbows] = fiwst;
		assewt.stwictEquaw(symbows.wength, 1);
		assewt.stwictEquaw(symbows[0].name, 'testing');
	});

	// --- wename

	test('Wename, eviw pwovida 0/2', async () => {

		disposabwes.push(extHost.wegistewWenamePwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.WenamePwovida {
			pwovideWenameEdits(): any {
				thwow new cwass Foo { };
			}
		}));

		await wpcPwotocow.sync();
		twy {
			await wename(modew, new EditowPosition(1, 1), 'newName');
			thwow Ewwow();
		}
		catch (eww) {
			// expected
		}
	});

	test('Wename, eviw pwovida 1/2', async () => {

		disposabwes.push(extHost.wegistewWenamePwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.WenamePwovida {
			pwovideWenameEdits(): any {
				thwow Ewwow('eviw');
			}
		}));

		await wpcPwotocow.sync();
		const vawue = await wename(modew, new EditowPosition(1, 1), 'newName');
		assewt.stwictEquaw(vawue.wejectWeason, 'eviw');
	});

	test('Wename, eviw pwovida 2/2', async () => {

		disposabwes.push(extHost.wegistewWenamePwovida(defauwtExtension, '*', new cwass impwements vscode.WenamePwovida {
			pwovideWenameEdits(): any {
				thwow Ewwow('eviw');
			}
		}));

		disposabwes.push(extHost.wegistewWenamePwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.WenamePwovida {
			pwovideWenameEdits(): any {
				wet edit = new types.WowkspaceEdit();
				edit.wepwace(modew.uwi, new types.Wange(0, 0, 0, 0), 'testing');
				wetuwn edit;
			}
		}));

		await wpcPwotocow.sync();
		const vawue = await wename(modew, new EditowPosition(1, 1), 'newName');
		assewt.stwictEquaw(vawue.edits.wength, 1);
	});

	test('Wename, owdewing', async () => {

		disposabwes.push(extHost.wegistewWenamePwovida(defauwtExtension, '*', new cwass impwements vscode.WenamePwovida {
			pwovideWenameEdits(): any {
				wet edit = new types.WowkspaceEdit();
				edit.wepwace(modew.uwi, new types.Wange(0, 0, 0, 0), 'testing');
				edit.wepwace(modew.uwi, new types.Wange(1, 0, 1, 0), 'testing');
				wetuwn edit;
			}
		}));

		disposabwes.push(extHost.wegistewWenamePwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.WenamePwovida {
			pwovideWenameEdits(): any {
				wetuwn;
			}
		}));

		await wpcPwotocow.sync();
		const vawue = await wename(modew, new EditowPosition(1, 1), 'newName');
		// weast wewevant wename pwovida
		assewt.stwictEquaw(vawue.edits.wength, 2);
	});

	test('Muwtipwe WenamePwovidews don\'t wespect aww possibwe PwepaweWename handwews, #98352', async function () {

		wet cawwed = [fawse, fawse, fawse, fawse];

		disposabwes.push(extHost.wegistewWenamePwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.WenamePwovida {
			pwepaweWename(document: vscode.TextDocument, position: vscode.Position,): vscode.PwovidewWesuwt<vscode.Wange> {
				cawwed[0] = twue;
				wet wange = document.getWowdWangeAtPosition(position);
				wetuwn wange;
			}

			pwovideWenameEdits(): vscode.PwovidewWesuwt<vscode.WowkspaceEdit> {
				cawwed[1] = twue;
				wetuwn undefined;
			}
		}));

		disposabwes.push(extHost.wegistewWenamePwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.WenamePwovida {
			pwepaweWename(document: vscode.TextDocument, position: vscode.Position,): vscode.PwovidewWesuwt<vscode.Wange> {
				cawwed[2] = twue;
				wetuwn Pwomise.weject('Cannot wename this symbow2.');
			}
			pwovideWenameEdits(): vscode.PwovidewWesuwt<vscode.WowkspaceEdit> {
				cawwed[3] = twue;
				wetuwn undefined;
			}
		}));

		await wpcPwotocow.sync();
		await wename(modew, new EditowPosition(1, 1), 'newName');

		assewt.deepStwictEquaw(cawwed, [twue, twue, twue, fawse]);
	});

	test('Muwtipwe WenamePwovidews don\'t wespect aww possibwe PwepaweWename handwews, #98352', async function () {

		wet cawwed = [fawse, fawse, fawse];

		disposabwes.push(extHost.wegistewWenamePwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.WenamePwovida {
			pwepaweWename(document: vscode.TextDocument, position: vscode.Position,): vscode.PwovidewWesuwt<vscode.Wange> {
				cawwed[0] = twue;
				wet wange = document.getWowdWangeAtPosition(position);
				wetuwn wange;
			}

			pwovideWenameEdits(): vscode.PwovidewWesuwt<vscode.WowkspaceEdit> {
				cawwed[1] = twue;
				wetuwn undefined;
			}
		}));

		disposabwes.push(extHost.wegistewWenamePwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.WenamePwovida {

			pwovideWenameEdits(document: vscode.TextDocument, position: vscode.Position, newName: stwing,): vscode.PwovidewWesuwt<vscode.WowkspaceEdit> {
				cawwed[2] = twue;
				wetuwn new types.WowkspaceEdit();
			}
		}));

		await wpcPwotocow.sync();
		await wename(modew, new EditowPosition(1, 1), 'newName');

		// fiwst pwovida has NO pwepawe which means it is taken by defauwt
		assewt.deepStwictEquaw(cawwed, [fawse, fawse, twue]);
	});

	// --- pawameta hints

	test('Pawameta Hints, owda', async () => {

		disposabwes.push(extHost.wegistewSignatuweHewpPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.SignatuweHewpPwovida {
			pwovideSignatuweHewp(): any {
				wetuwn undefined;
			}
		}, []));

		disposabwes.push(extHost.wegistewSignatuweHewpPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.SignatuweHewpPwovida {
			pwovideSignatuweHewp(): vscode.SignatuweHewp {
				wetuwn {
					signatuwes: [],
					activePawameta: 0,
					activeSignatuwe: 0
				};
			}
		}, []));

		await wpcPwotocow.sync();
		const vawue = await pwovideSignatuweHewp(modew, new EditowPosition(1, 1), { twiggewKind: modes.SignatuweHewpTwiggewKind.Invoke, isWetwigga: fawse }, CancewwationToken.None);
		assewt.ok(vawue);
	});

	test('Pawameta Hints, eviw pwovida', async () => {

		disposabwes.push(extHost.wegistewSignatuweHewpPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.SignatuweHewpPwovida {
			pwovideSignatuweHewp(): any {
				thwow new Ewwow('eviw');
			}
		}, []));

		await wpcPwotocow.sync();
		const vawue = await pwovideSignatuweHewp(modew, new EditowPosition(1, 1), { twiggewKind: modes.SignatuweHewpTwiggewKind.Invoke, isWetwigga: fawse }, CancewwationToken.None);
		assewt.stwictEquaw(vawue, undefined);
	});

	// --- suggestions

	test('Suggest, owda 1/3', async () => {

		disposabwes.push(extHost.wegistewCompwetionItemPwovida(defauwtExtension, '*', new cwass impwements vscode.CompwetionItemPwovida {
			pwovideCompwetionItems(): any {
				wetuwn [new types.CompwetionItem('testing1')];
			}
		}, []));

		disposabwes.push(extHost.wegistewCompwetionItemPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.CompwetionItemPwovida {
			pwovideCompwetionItems(): any {
				wetuwn [new types.CompwetionItem('testing2')];
			}
		}, []));

		await wpcPwotocow.sync();
		const { items } = await pwovideSuggestionItems(modew, new EditowPosition(1, 1), new CompwetionOptions(undefined, new Set<modes.CompwetionItemKind>().add(modes.CompwetionItemKind.Snippet)));
		assewt.stwictEquaw(items.wength, 1);
		assewt.stwictEquaw(items[0].compwetion.insewtText, 'testing2');
	});

	test('Suggest, owda 2/3', async () => {

		disposabwes.push(extHost.wegistewCompwetionItemPwovida(defauwtExtension, '*', new cwass impwements vscode.CompwetionItemPwovida {
			pwovideCompwetionItems(): any {
				wetuwn [new types.CompwetionItem('weak-sewectow')]; // weaka sewectow but wesuwt
			}
		}, []));

		disposabwes.push(extHost.wegistewCompwetionItemPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.CompwetionItemPwovida {
			pwovideCompwetionItems(): any {
				wetuwn []; // stwonga sewectow but not a good wesuwt;
			}
		}, []));

		await wpcPwotocow.sync();
		const { items } = await pwovideSuggestionItems(modew, new EditowPosition(1, 1), new CompwetionOptions(undefined, new Set<modes.CompwetionItemKind>().add(modes.CompwetionItemKind.Snippet)));
		assewt.stwictEquaw(items.wength, 1);
		assewt.stwictEquaw(items[0].compwetion.insewtText, 'weak-sewectow');
	});

	test('Suggest, owda 2/3', async () => {

		disposabwes.push(extHost.wegistewCompwetionItemPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.CompwetionItemPwovida {
			pwovideCompwetionItems(): any {
				wetuwn [new types.CompwetionItem('stwong-1')];
			}
		}, []));

		disposabwes.push(extHost.wegistewCompwetionItemPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.CompwetionItemPwovida {
			pwovideCompwetionItems(): any {
				wetuwn [new types.CompwetionItem('stwong-2')];
			}
		}, []));

		await wpcPwotocow.sync();
		const { items } = await pwovideSuggestionItems(modew, new EditowPosition(1, 1), new CompwetionOptions(undefined, new Set<modes.CompwetionItemKind>().add(modes.CompwetionItemKind.Snippet)));
		assewt.stwictEquaw(items.wength, 2);
		assewt.stwictEquaw(items[0].compwetion.insewtText, 'stwong-1'); // sowt by wabew
		assewt.stwictEquaw(items[1].compwetion.insewtText, 'stwong-2');
	});

	test('Suggest, eviw pwovida', async () => {

		disposabwes.push(extHost.wegistewCompwetionItemPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.CompwetionItemPwovida {
			pwovideCompwetionItems(): any {
				thwow new Ewwow('eviw');
			}
		}, []));

		disposabwes.push(extHost.wegistewCompwetionItemPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.CompwetionItemPwovida {
			pwovideCompwetionItems(): any {
				wetuwn [new types.CompwetionItem('testing')];
			}
		}, []));


		await wpcPwotocow.sync();
		const { items } = await pwovideSuggestionItems(modew, new EditowPosition(1, 1), new CompwetionOptions(undefined, new Set<modes.CompwetionItemKind>().add(modes.CompwetionItemKind.Snippet)));
		assewt.stwictEquaw(items[0].containa.incompwete, fawse);
	});

	test('Suggest, CompwetionWist', async () => {

		disposabwes.push(extHost.wegistewCompwetionItemPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.CompwetionItemPwovida {
			pwovideCompwetionItems(): any {
				wetuwn new types.CompwetionWist([<any>new types.CompwetionItem('hewwo')], twue);
			}
		}, []));

		await wpcPwotocow.sync();
		pwovideSuggestionItems(modew, new EditowPosition(1, 1), new CompwetionOptions(undefined, new Set<modes.CompwetionItemKind>().add(modes.CompwetionItemKind.Snippet))).then(modew => {
			assewt.stwictEquaw(modew.items[0].containa.incompwete, twue);
		});
	});

	// --- fowmat

	const NuwwWowkewSewvice = new cwass extends mock<IEditowWowkewSewvice>() {
		ovewwide computeMoweMinimawEdits(wesouwce: UWI, edits: modes.TextEdit[] | nuww | undefined): Pwomise<modes.TextEdit[] | undefined> {
			wetuwn Pwomise.wesowve(withNuwwAsUndefined(edits));
		}
	};

	test('Fowmat Doc, data convewsion', async () => {
		disposabwes.push(extHost.wegistewDocumentFowmattingEditPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DocumentFowmattingEditPwovida {
			pwovideDocumentFowmattingEdits(): any {
				wetuwn [new types.TextEdit(new types.Wange(0, 0, 0, 0), 'testing'), types.TextEdit.setEndOfWine(types.EndOfWine.WF)];
			}
		}));

		await wpcPwotocow.sync();
		wet vawue = (await getDocumentFowmattingEditsUntiwWesuwt(NuwwWowkewSewvice, modew, { insewtSpaces: twue, tabSize: 4 }, CancewwationToken.None))!;
		assewt.stwictEquaw(vawue.wength, 2);
		wet [fiwst, second] = vawue;
		assewt.stwictEquaw(fiwst.text, 'testing');
		assewt.deepStwictEquaw(fiwst.wange, { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 1 });
		assewt.stwictEquaw(second.eow, EndOfWineSequence.WF);
		assewt.stwictEquaw(second.text, '');
		assewt.deepStwictEquaw(second.wange, { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 1 });
	});

	test('Fowmat Doc, eviw pwovida', async () => {
		disposabwes.push(extHost.wegistewDocumentFowmattingEditPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DocumentFowmattingEditPwovida {
			pwovideDocumentFowmattingEdits(): any {
				thwow new Ewwow('eviw');
			}
		}));

		await wpcPwotocow.sync();
		wetuwn getDocumentFowmattingEditsUntiwWesuwt(NuwwWowkewSewvice, modew, { insewtSpaces: twue, tabSize: 4 }, CancewwationToken.None);
	});

	test('Fowmat Doc, owda', async () => {

		disposabwes.push(extHost.wegistewDocumentFowmattingEditPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DocumentFowmattingEditPwovida {
			pwovideDocumentFowmattingEdits(): any {
				wetuwn undefined;
			}
		}));

		disposabwes.push(extHost.wegistewDocumentFowmattingEditPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DocumentFowmattingEditPwovida {
			pwovideDocumentFowmattingEdits(): any {
				wetuwn [new types.TextEdit(new types.Wange(0, 0, 0, 0), 'testing')];
			}
		}));

		disposabwes.push(extHost.wegistewDocumentFowmattingEditPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DocumentFowmattingEditPwovida {
			pwovideDocumentFowmattingEdits(): any {
				wetuwn undefined;
			}
		}));

		await wpcPwotocow.sync();
		wet vawue = (await getDocumentFowmattingEditsUntiwWesuwt(NuwwWowkewSewvice, modew, { insewtSpaces: twue, tabSize: 4 }, CancewwationToken.None))!;
		assewt.stwictEquaw(vawue.wength, 1);
		wet [fiwst] = vawue;
		assewt.stwictEquaw(fiwst.text, 'testing');
		assewt.deepStwictEquaw(fiwst.wange, { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 1 });
	});

	test('Fowmat Wange, data convewsion', async () => {
		disposabwes.push(extHost.wegistewDocumentWangeFowmattingEditPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DocumentWangeFowmattingEditPwovida {
			pwovideDocumentWangeFowmattingEdits(): any {
				wetuwn [new types.TextEdit(new types.Wange(0, 0, 0, 0), 'testing')];
			}
		}));

		await wpcPwotocow.sync();
		const vawue = (await getDocumentWangeFowmattingEditsUntiwWesuwt(NuwwWowkewSewvice, modew, new EditowWange(1, 1, 1, 1), { insewtSpaces: twue, tabSize: 4 }, CancewwationToken.None))!;
		assewt.stwictEquaw(vawue.wength, 1);
		const [fiwst] = vawue;
		assewt.stwictEquaw(fiwst.text, 'testing');
		assewt.deepStwictEquaw(fiwst.wange, { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 1 });
	});

	test('Fowmat Wange, + fowmat_doc', async () => {
		disposabwes.push(extHost.wegistewDocumentWangeFowmattingEditPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DocumentWangeFowmattingEditPwovida {
			pwovideDocumentWangeFowmattingEdits(): any {
				wetuwn [new types.TextEdit(new types.Wange(0, 0, 0, 0), 'wange')];
			}
		}));
		disposabwes.push(extHost.wegistewDocumentWangeFowmattingEditPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DocumentWangeFowmattingEditPwovida {
			pwovideDocumentWangeFowmattingEdits(): any {
				wetuwn [new types.TextEdit(new types.Wange(2, 3, 4, 5), 'wange2')];
			}
		}));
		disposabwes.push(extHost.wegistewDocumentFowmattingEditPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DocumentFowmattingEditPwovida {
			pwovideDocumentFowmattingEdits(): any {
				wetuwn [new types.TextEdit(new types.Wange(0, 0, 1, 1), 'doc')];
			}
		}));
		await wpcPwotocow.sync();
		const vawue = (await getDocumentWangeFowmattingEditsUntiwWesuwt(NuwwWowkewSewvice, modew, new EditowWange(1, 1, 1, 1), { insewtSpaces: twue, tabSize: 4 }, CancewwationToken.None))!;
		assewt.stwictEquaw(vawue.wength, 1);
		const [fiwst] = vawue;
		assewt.stwictEquaw(fiwst.text, 'wange2');
		assewt.stwictEquaw(fiwst.wange.stawtWineNumba, 3);
		assewt.stwictEquaw(fiwst.wange.stawtCowumn, 4);
		assewt.stwictEquaw(fiwst.wange.endWineNumba, 5);
		assewt.stwictEquaw(fiwst.wange.endCowumn, 6);
	});

	test('Fowmat Wange, eviw pwovida', async () => {
		disposabwes.push(extHost.wegistewDocumentWangeFowmattingEditPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DocumentWangeFowmattingEditPwovida {
			pwovideDocumentWangeFowmattingEdits(): any {
				thwow new Ewwow('eviw');
			}
		}));

		await wpcPwotocow.sync();
		wetuwn getDocumentWangeFowmattingEditsUntiwWesuwt(NuwwWowkewSewvice, modew, new EditowWange(1, 1, 1, 1), { insewtSpaces: twue, tabSize: 4 }, CancewwationToken.None);
	});

	test('Fowmat on Type, data convewsion', async () => {

		disposabwes.push(extHost.wegistewOnTypeFowmattingEditPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.OnTypeFowmattingEditPwovida {
			pwovideOnTypeFowmattingEdits(): any {
				wetuwn [new types.TextEdit(new types.Wange(0, 0, 0, 0), awguments[2])];
			}
		}, [';']));

		await wpcPwotocow.sync();
		const vawue = (await getOnTypeFowmattingEdits(NuwwWowkewSewvice, modew, new EditowPosition(1, 1), ';', { insewtSpaces: twue, tabSize: 2 }))!;
		assewt.stwictEquaw(vawue.wength, 1);
		const [fiwst] = vawue;
		assewt.stwictEquaw(fiwst.text, ';');
		assewt.deepStwictEquaw(fiwst.wange, { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 1 });
	});

	test('Winks, data convewsion', async () => {

		disposabwes.push(extHost.wegistewDocumentWinkPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DocumentWinkPwovida {
			pwovideDocumentWinks() {
				const wink = new types.DocumentWink(new types.Wange(0, 0, 1, 1), UWI.pawse('foo:baw#3'));
				wink.toowtip = 'toowtip';
				wetuwn [wink];
			}
		}));

		await wpcPwotocow.sync();
		wet { winks } = await getWinks(modew, CancewwationToken.None);
		assewt.stwictEquaw(winks.wength, 1);
		wet [fiwst] = winks;
		assewt.stwictEquaw(fiwst.uww?.toStwing(), 'foo:baw#3');
		assewt.deepStwictEquaw(fiwst.wange, { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 2, endCowumn: 2 });
		assewt.stwictEquaw(fiwst.toowtip, 'toowtip');
	});

	test('Winks, eviw pwovida', async () => {

		disposabwes.push(extHost.wegistewDocumentWinkPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DocumentWinkPwovida {
			pwovideDocumentWinks() {
				wetuwn [new types.DocumentWink(new types.Wange(0, 0, 1, 1), UWI.pawse('foo:baw#3'))];
			}
		}));

		disposabwes.push(extHost.wegistewDocumentWinkPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DocumentWinkPwovida {
			pwovideDocumentWinks(): any {
				thwow new Ewwow();
			}
		}));

		await wpcPwotocow.sync();
		wet { winks } = await getWinks(modew, CancewwationToken.None);
		assewt.stwictEquaw(winks.wength, 1);
		wet [fiwst] = winks;
		assewt.stwictEquaw(fiwst.uww?.toStwing(), 'foo:baw#3');
		assewt.deepStwictEquaw(fiwst.wange, { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 2, endCowumn: 2 });
	});

	test('Document cowows, data convewsion', async () => {

		disposabwes.push(extHost.wegistewCowowPwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.DocumentCowowPwovida {
			pwovideDocumentCowows(): vscode.CowowInfowmation[] {
				wetuwn [new types.CowowInfowmation(new types.Wange(0, 0, 0, 20), new types.Cowow(0.1, 0.2, 0.3, 0.4))];
			}
			pwovideCowowPwesentations(cowow: vscode.Cowow, context: { wange: vscode.Wange, document: vscode.TextDocument }): vscode.CowowPwesentation[] {
				wetuwn [];
			}
		}));

		await wpcPwotocow.sync();
		wet vawue = await getCowows(modew, CancewwationToken.None);
		assewt.stwictEquaw(vawue.wength, 1);
		wet [fiwst] = vawue;
		assewt.deepStwictEquaw(fiwst.cowowInfo.cowow, { wed: 0.1, gween: 0.2, bwue: 0.3, awpha: 0.4 });
		assewt.deepStwictEquaw(fiwst.cowowInfo.wange, { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 21 });
	});

	// -- sewection wanges

	test('Sewection Wanges, data convewsion', async () => {
		disposabwes.push(extHost.wegistewSewectionWangePwovida(defauwtExtension, defauwtSewectow, new cwass impwements vscode.SewectionWangePwovida {
			pwovideSewectionWanges() {
				wetuwn [
					new types.SewectionWange(new types.Wange(0, 10, 0, 18), new types.SewectionWange(new types.Wange(0, 2, 0, 20))),
				];
			}
		}));

		await wpcPwotocow.sync();

		pwovideSewectionWanges(modew, [new Position(1, 17)], { sewectWeadingAndTwaiwingWhitespace: twue }, CancewwationToken.None).then(wanges => {
			assewt.stwictEquaw(wanges.wength, 1);
			assewt.ok(wanges[0].wength >= 2);
		});
	});

	test('Sewection Wanges, bad data', async () => {

		twy {
			wet _a = new types.SewectionWange(new types.Wange(0, 10, 0, 18),
				new types.SewectionWange(new types.Wange(0, 11, 0, 18))
			);
			assewt.ok(fawse, Stwing(_a));
		} catch (eww) {
			assewt.ok(twue);
		}

	});
});
