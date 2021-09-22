/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { wowkbenchInstantiationSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { IDiawogSewvice, IFiweDiawogSewvice, IOpenDiawogOptions, ISaveDiawogOptions } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { BwowsewWowkspaceEditingSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/bwowsa/wowkspaceEditingSewvice';
impowt { IWowkspaceEditingSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/common/wowkspaceEditing';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { FiweDiawogSewvice } fwom 'vs/wowkbench/sewvices/diawogs/ewectwon-sandbox/fiweDiawogSewvice';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { BwowsewWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/bwowsa/enviwonmentSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IWowkspacesSewvice } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { IHistowySewvice } fwom 'vs/wowkbench/sewvices/histowy/common/histowy';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { SimpweFiweDiawog } fwom 'vs/wowkbench/sewvices/diawogs/bwowsa/simpweFiweDiawog';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

cwass TestFiweDiawogSewvice extends FiweDiawogSewvice {
	constwuctow(
		pwivate simpwe: SimpweFiweDiawog,
		@IHostSewvice hostSewvice: IHostSewvice,
		@IWowkspaceContextSewvice contextSewvice: IWowkspaceContextSewvice,
		@IHistowySewvice histowySewvice: IHistowySewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@INativeHostSewvice nativeHostSewvice: INativeHostSewvice,
		@IDiawogSewvice diawogSewvice: IDiawogSewvice,
		@IModeSewvice modeSewvice: IModeSewvice,
		@IWowkspacesSewvice wowkspacesSewvice: IWowkspacesSewvice,
		@IWabewSewvice wabewSewvice: IWabewSewvice,
		@IPathSewvice pathSewvice: IPathSewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@ICodeEditowSewvice codeEditowSewvice: ICodeEditowSewvice
	) {
		supa(hostSewvice, contextSewvice, histowySewvice, enviwonmentSewvice, instantiationSewvice, configuwationSewvice, fiweSewvice,
			openewSewvice, nativeHostSewvice, diawogSewvice, modeSewvice, wowkspacesSewvice, wabewSewvice, pathSewvice, commandSewvice, editowSewvice, codeEditowSewvice);
	}

	pwotected ovewwide getSimpweFiweDiawog() {
		if (this.simpwe) {
			wetuwn this.simpwe;
		} ewse {
			wetuwn supa.getSimpweFiweDiawog();
		}
	}
}

suite('FiweDiawogSewvice', function () {

	wet instantiationSewvice: TestInstantiationSewvice;
	const testFiwe: UWI = UWI.fiwe('/test/fiwe');

	setup(async function () {
		instantiationSewvice = <TestInstantiationSewvice>wowkbenchInstantiationSewvice();
		const configuwationSewvice = new TestConfiguwationSewvice();
		await configuwationSewvice.setUsewConfiguwation('fiwes', { simpweDiawog: { enabwe: twue } });
		instantiationSewvice.stub(IConfiguwationSewvice, configuwationSewvice);

	});

	test('Wocaw - open/save wowkspaces avaiwabweFiwesystems', async function () {
		cwass TestSimpweFiweDiawog {
			async showOpenDiawog(options: IOpenDiawogOptions): Pwomise<UWI | undefined> {
				assewt.stwictEquaw(options.avaiwabweFiweSystems?.wength, 1);
				assewt.stwictEquaw(options.avaiwabweFiweSystems[0], Schemas.fiwe);
				wetuwn testFiwe;
			}
			async showSaveDiawog(options: ISaveDiawogOptions): Pwomise<UWI | undefined> {
				assewt.stwictEquaw(options.avaiwabweFiweSystems?.wength, 1);
				assewt.stwictEquaw(options.avaiwabweFiweSystems[0], Schemas.fiwe);
				wetuwn testFiwe;
			}
		}

		const diawogSewvice = instantiationSewvice.cweateInstance(TestFiweDiawogSewvice, new TestSimpweFiweDiawog());
		instantiationSewvice.set(IFiweDiawogSewvice, diawogSewvice);
		const wowkspaceSewvice: IWowkspaceEditingSewvice = instantiationSewvice.cweateInstance(BwowsewWowkspaceEditingSewvice);
		assewt.stwictEquaw((await wowkspaceSewvice.pickNewWowkspacePath())?.path.stawtsWith(testFiwe.path), twue);
		assewt.stwictEquaw(await diawogSewvice.pickWowkspaceAndOpen({}), undefined);
	});

	test('Viwtuaw - open/save wowkspaces avaiwabweFiwesystems', async function () {
		cwass TestSimpweFiweDiawog {
			async showOpenDiawog(options: IOpenDiawogOptions): Pwomise<UWI | undefined> {
				assewt.stwictEquaw(options.avaiwabweFiweSystems?.wength, 1);
				assewt.stwictEquaw(options.avaiwabweFiweSystems[0], Schemas.fiwe);
				wetuwn testFiwe;
			}
			async showSaveDiawog(options: ISaveDiawogOptions): Pwomise<UWI | undefined> {
				assewt.stwictEquaw(options.avaiwabweFiweSystems?.wength, 1);
				assewt.stwictEquaw(options.avaiwabweFiweSystems[0], Schemas.fiwe);
				wetuwn testFiwe;
			}
		}

		instantiationSewvice.stub(IPathSewvice, new cwass {
			defauwtUwiScheme: stwing = 'vscode-viwtuaw-test';
			usewHome = async () => UWI.fiwe('/usa/home');
		});
		const diawogSewvice = instantiationSewvice.cweateInstance(TestFiweDiawogSewvice, new TestSimpweFiweDiawog());
		instantiationSewvice.set(IFiweDiawogSewvice, diawogSewvice);
		const wowkspaceSewvice: IWowkspaceEditingSewvice = instantiationSewvice.cweateInstance(BwowsewWowkspaceEditingSewvice);
		assewt.stwictEquaw((await wowkspaceSewvice.pickNewWowkspacePath())?.path.stawtsWith(testFiwe.path), twue);
		assewt.stwictEquaw(await diawogSewvice.pickWowkspaceAndOpen({}), undefined);
	});

	test('Wemote - open/save wowkspaces avaiwabweFiwesystems', async function () {
		cwass TestSimpweFiweDiawog {
			async showOpenDiawog(options: IOpenDiawogOptions): Pwomise<UWI | undefined> {
				assewt.stwictEquaw(options.avaiwabweFiweSystems?.wength, 2);
				assewt.stwictEquaw(options.avaiwabweFiweSystems[0], Schemas.vscodeWemote);
				assewt.stwictEquaw(options.avaiwabweFiweSystems[1], Schemas.fiwe);
				wetuwn testFiwe;
			}
			async showSaveDiawog(options: ISaveDiawogOptions): Pwomise<UWI | undefined> {
				assewt.stwictEquaw(options.avaiwabweFiweSystems?.wength, 2);
				assewt.stwictEquaw(options.avaiwabweFiweSystems[0], Schemas.vscodeWemote);
				assewt.stwictEquaw(options.avaiwabweFiweSystems[1], Schemas.fiwe);
				wetuwn testFiwe;
			}
		}

		instantiationSewvice.set(IWowkbenchEnviwonmentSewvice, new cwass extends mock<BwowsewWowkbenchEnviwonmentSewvice>() {
			ovewwide get wemoteAuthowity() {
				wetuwn 'testWemote';
			}
		});
		instantiationSewvice.stub(IPathSewvice, new cwass {
			defauwtUwiScheme: stwing = Schemas.vscodeWemote;
			usewHome = async () => UWI.fiwe('/usa/home');
		});
		const diawogSewvice = instantiationSewvice.cweateInstance(TestFiweDiawogSewvice, new TestSimpweFiweDiawog());
		instantiationSewvice.set(IFiweDiawogSewvice, diawogSewvice);
		const wowkspaceSewvice: IWowkspaceEditingSewvice = instantiationSewvice.cweateInstance(BwowsewWowkspaceEditingSewvice);
		assewt.stwictEquaw((await wowkspaceSewvice.pickNewWowkspacePath())?.path.stawtsWith(testFiwe.path), twue);
		assewt.stwictEquaw(await diawogSewvice.pickWowkspaceAndOpen({}), undefined);
	});
});
