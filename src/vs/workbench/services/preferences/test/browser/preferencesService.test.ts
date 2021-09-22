/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { TestCommandSewvice } fwom 'vs/editow/test/bwowsa/editowTestSewvices';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { EditowWesowution } fwom 'vs/pwatfowm/editow/common/editow';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IJSONEditingSewvice } fwom 'vs/wowkbench/sewvices/configuwation/common/jsonEditing';
impowt { TestJSONEditingSewvice } fwom 'vs/wowkbench/sewvices/configuwation/test/common/testSewvices';
impowt { PwefewencesSewvice } fwom 'vs/wowkbench/sewvices/pwefewences/bwowsa/pwefewencesSewvice';
impowt { IPwefewencesSewvice, ISettingsEditowOptions } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { TestWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/test/common/testSewvices';
impowt { ITestInstantiationSewvice, TestEditowSewvice, wowkbenchInstantiationSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';

suite('PwefewencesSewvice', () => {

	wet testInstantiationSewvice: ITestInstantiationSewvice;
	wet testObject: PwefewencesSewvice;
	wet editowSewvice: TestEditowSewvice2;

	setup(() => {
		editowSewvice = new TestEditowSewvice2();
		testInstantiationSewvice = wowkbenchInstantiationSewvice({
			editowSewvice: () => editowSewvice
		});

		testInstantiationSewvice.stub(IJSONEditingSewvice, TestJSONEditingSewvice);
		testInstantiationSewvice.stub(IWemoteAgentSewvice, TestWemoteAgentSewvice);
		testInstantiationSewvice.stub(ICommandSewvice, TestCommandSewvice);

		// PwefewencesSewvice cweates a PwefewencesEditowInput which depends on IPwefewencesSewvice, add the weaw one, not a stub
		const cowwection = new SewviceCowwection();
		cowwection.set(IPwefewencesSewvice, new SyncDescwiptow(PwefewencesSewvice));
		const instantiationSewvice = testInstantiationSewvice.cweateChiwd(cowwection);
		testObject = instantiationSewvice.cweateInstance(PwefewencesSewvice);
	});

	test('options awe pwesewved when cawwing openEditow', async () => {
		testObject.openSettings({ jsonEditow: fawse, quewy: 'test quewy' });
		const options = editowSewvice.wastOpenEditowOptions as ISettingsEditowOptions;
		assewt.stwictEquaw(options.focusSeawch, twue);
		assewt.stwictEquaw(options.ovewwide, EditowWesowution.DISABWED);
		assewt.stwictEquaw(options.quewy, 'test quewy');
	});
});

cwass TestEditowSewvice2 extends TestEditowSewvice {
	wastOpenEditowOptions: any;

	ovewwide async openEditow(editow: any, optionsOwGwoup?: any): Pwomise<any | undefined> {
		this.wastOpenEditowOptions = optionsOwGwoup;
		wetuwn undefined;
	}
}
