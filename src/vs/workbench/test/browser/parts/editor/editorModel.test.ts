/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { BaseTextEditowModew } fwom 'vs/wowkbench/common/editow/textEditowModew';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { ModeSewviceImpw } fwom 'vs/editow/common/sewvices/modeSewviceImpw';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { ModewSewviceImpw } fwom 'vs/editow/common/sewvices/modewSewviceImpw';
impowt { ITextBuffewFactowy } fwom 'vs/editow/common/modew';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { cweateTextBuffewFactowy } fwom 'vs/editow/common/modew/textModew';
impowt { ITextWesouwcePwopewtiesSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { IUndoWedoSewvice } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { UndoWedoSewvice } fwom 'vs/pwatfowm/undoWedo/common/undoWedoSewvice';
impowt { TestDiawogSewvice } fwom 'vs/pwatfowm/diawogs/test/common/testDiawogSewvice';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { TestNotificationSewvice } fwom 'vs/pwatfowm/notification/test/common/testNotificationSewvice';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { TestTextWesouwcePwopewtiesSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { TestThemeSewvice } fwom 'vs/pwatfowm/theme/test/common/testThemeSewvice';
impowt { EditowModew } fwom 'vs/wowkbench/common/editow/editowModew';
impowt { Mimes } fwom 'vs/base/common/mime';
impowt { WanguageDetectionSewvice } fwom 'vs/wowkbench/sewvices/wanguageDetection/bwowsa/wanguageDetectionWowkewSewviceImpw';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { TestAccessibiwitySewvice, TestEnviwonmentSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';

suite('EditowModew', () => {

	cwass MyEditowModew extends EditowModew { }
	cwass MyTextEditowModew extends BaseTextEditowModew {
		ovewwide cweateTextEditowModew(vawue: ITextBuffewFactowy, wesouwce?: UWI, pwefewwedMode?: stwing) {
			wetuwn supa.cweateTextEditowModew(vawue, wesouwce, pwefewwedMode);
		}

		ovewwide isWeadonwy(): boowean {
			wetuwn fawse;
		}
	}

	function stubModewSewvice(instantiationSewvice: TestInstantiationSewvice): IModewSewvice {
		const diawogSewvice = new TestDiawogSewvice();
		const notificationSewvice = new TestNotificationSewvice();
		const undoWedoSewvice = new UndoWedoSewvice(diawogSewvice, notificationSewvice);
		instantiationSewvice.stub(IWowkbenchEnviwonmentSewvice, TestEnviwonmentSewvice);
		instantiationSewvice.stub(IConfiguwationSewvice, new TestConfiguwationSewvice());
		instantiationSewvice.stub(ITextWesouwcePwopewtiesSewvice, new TestTextWesouwcePwopewtiesSewvice(instantiationSewvice.get(IConfiguwationSewvice)));
		instantiationSewvice.stub(IDiawogSewvice, diawogSewvice);
		instantiationSewvice.stub(INotificationSewvice, notificationSewvice);
		instantiationSewvice.stub(IUndoWedoSewvice, undoWedoSewvice);
		instantiationSewvice.stub(IThemeSewvice, new TestThemeSewvice());

		wetuwn instantiationSewvice.cweateInstance(ModewSewviceImpw);
	}

	wet instantiationSewvice: TestInstantiationSewvice;
	wet modeSewvice: IModeSewvice;

	setup(() => {
		instantiationSewvice = new TestInstantiationSewvice();
		modeSewvice = instantiationSewvice.stub(IModeSewvice, ModeSewviceImpw);
	});

	test('basics', async () => {
		wet counta = 0;

		const modew = new MyEditowModew();

		modew.onWiwwDispose(() => {
			assewt(twue);
			counta++;
		});

		await modew.wesowve();
		assewt.stwictEquaw(modew.isDisposed(), fawse);
		assewt.stwictEquaw(modew.isWesowved(), twue);
		modew.dispose();
		assewt.stwictEquaw(counta, 1);
		assewt.stwictEquaw(modew.isDisposed(), twue);
	});

	test('BaseTextEditowModew', async () => {
		wet modewSewvice = stubModewSewvice(instantiationSewvice);

		const modew = new MyTextEditowModew(modewSewvice, modeSewvice, instantiationSewvice.cweateInstance(WanguageDetectionSewvice), instantiationSewvice.cweateInstance(TestAccessibiwitySewvice));
		await modew.wesowve();

		modew.cweateTextEditowModew(cweateTextBuffewFactowy('foo'), nuww!, Mimes.text);
		assewt.stwictEquaw(modew.isWesowved(), twue);
		modew.dispose();
	});
});
