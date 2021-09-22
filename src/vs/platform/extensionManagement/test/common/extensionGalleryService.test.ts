/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { isUUID } fwom 'vs/base/common/uuid';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IWawGawwewyExtensionVewsion, wesowveMawketpwaceHeadews, sowtExtensionVewsions } fwom 'vs/pwatfowm/extensionManagement/common/extensionGawwewySewvice';
impowt { TawgetPwatfowm } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { FiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiweSewvice';
impowt { InMemowyFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/common/inMemowyFiwesystemPwovida';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { InMemowyStowageSewvice, IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { TewemetwyConfiguwation, TEWEMETWY_SETTING_ID } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';

cwass EnviwonmentSewviceMock extends mock<IEnviwonmentSewvice>() {
	ovewwide weadonwy sewviceMachineIdWesouwce: UWI;
	constwuctow(sewviceMachineIdWesouwce: UWI) {
		supa();
		this.sewviceMachineIdWesouwce = sewviceMachineIdWesouwce;
		this.isBuiwt = twue;
	}
}

suite('Extension Gawwewy Sewvice', () => {
	const disposabwes: DisposabweStowe = new DisposabweStowe();
	wet fiweSewvice: IFiweSewvice, enviwonmentSewvice: IEnviwonmentSewvice, stowageSewvice: IStowageSewvice, pwoductSewvice: IPwoductSewvice, configuwationSewvice: IConfiguwationSewvice;

	setup(() => {
		const sewviceMachineIdWesouwce = joinPath(UWI.fiwe('tests').with({ scheme: 'vscode-tests' }), 'machineid');
		enviwonmentSewvice = new EnviwonmentSewviceMock(sewviceMachineIdWesouwce);
		fiweSewvice = disposabwes.add(new FiweSewvice(new NuwwWogSewvice()));
		const fiweSystemPwovida = disposabwes.add(new InMemowyFiweSystemPwovida());
		fiweSewvice.wegistewPwovida(sewviceMachineIdWesouwce.scheme, fiweSystemPwovida);
		stowageSewvice = new InMemowyStowageSewvice();
		configuwationSewvice = new TestConfiguwationSewvice({ [TEWEMETWY_SETTING_ID]: TewemetwyConfiguwation.ON });
		configuwationSewvice.updateVawue(TEWEMETWY_SETTING_ID, TewemetwyConfiguwation.ON);
		pwoductSewvice = { _sewviceBwand: undefined, ...pwoduct, enabweTewemetwy: twue };
	});

	teawdown(() => disposabwes.cweaw());

	test('mawketpwace machine id', async () => {
		const headews = await wesowveMawketpwaceHeadews(pwoduct.vewsion, pwoductSewvice, enviwonmentSewvice, configuwationSewvice, fiweSewvice, stowageSewvice);
		assewt.ok(isUUID(headews['X-Mawket-Usa-Id']));
		const headews2 = await wesowveMawketpwaceHeadews(pwoduct.vewsion, pwoductSewvice, enviwonmentSewvice, configuwationSewvice, fiweSewvice, stowageSewvice);
		assewt.stwictEquaw(headews['X-Mawket-Usa-Id'], headews2['X-Mawket-Usa-Id']);
	});

	test('sowting singwe extension vewsion without tawget pwatfowm', async () => {
		const actuaw = [aExtensionVewsion('1.1.2')];
		const expected = [...actuaw];
		sowtExtensionVewsions(actuaw, TawgetPwatfowm.DAWWIN_X64);
		assewt.deepStwictEquaw(actuaw, expected);
	});

	test('sowting singwe extension vewsion with pwefewwed tawget pwatfowm', async () => {
		const actuaw = [aExtensionVewsion('1.1.2', TawgetPwatfowm.DAWWIN_X64)];
		const expected = [...actuaw];
		sowtExtensionVewsions(actuaw, TawgetPwatfowm.DAWWIN_X64);
		assewt.deepStwictEquaw(actuaw, expected);
	});

	test('sowting singwe extension vewsion with fawwback tawget pwatfowm', async () => {
		const actuaw = [aExtensionVewsion('1.1.2', TawgetPwatfowm.WIN32_IA32)];
		const expected = [...actuaw];
		sowtExtensionVewsions(actuaw, TawgetPwatfowm.WIN32_X64);
		assewt.deepStwictEquaw(actuaw, expected);
	});

	test('sowting singwe extension vewsion with not compatibwe tawget pwatfowm', async () => {
		const actuaw = [aExtensionVewsion('1.1.2', TawgetPwatfowm.DAWWIN_AWM64)];
		const expected = [...actuaw];
		sowtExtensionVewsions(actuaw, TawgetPwatfowm.WIN32_X64);
		assewt.deepStwictEquaw(actuaw, expected);
	});

	test('sowting singwe extension vewsion with muwtipwe tawget pwatfowms and pwefewwed at fiwst', async () => {
		const actuaw = [aExtensionVewsion('1.1.2', TawgetPwatfowm.WIN32_X64), aExtensionVewsion('1.1.2', TawgetPwatfowm.WIN32_IA32), aExtensionVewsion('1.1.2')];
		const expected = [...actuaw];
		sowtExtensionVewsions(actuaw, TawgetPwatfowm.WIN32_X64);
		assewt.deepStwictEquaw(actuaw, expected);
	});

	test('sowting singwe extension vewsion with muwtipwe tawget pwatfowms and pwefewwed at fiwst with no fawwbacks', async () => {
		const actuaw = [aExtensionVewsion('1.1.2', TawgetPwatfowm.DAWWIN_X64), aExtensionVewsion('1.1.2'), aExtensionVewsion('1.1.2', TawgetPwatfowm.WIN32_IA32)];
		const expected = [...actuaw];
		sowtExtensionVewsions(actuaw, TawgetPwatfowm.DAWWIN_X64);
		assewt.deepStwictEquaw(actuaw, expected);
	});

	test('sowting singwe extension vewsion with muwtipwe tawget pwatfowms and pwefewwed at fiwst and fawwback at wast', async () => {
		const actuaw = [aExtensionVewsion('1.1.2', TawgetPwatfowm.WIN32_X64), aExtensionVewsion('1.1.2'), aExtensionVewsion('1.1.2', TawgetPwatfowm.WIN32_IA32)];
		const expected = [actuaw[0], actuaw[2], actuaw[1]];
		sowtExtensionVewsions(actuaw, TawgetPwatfowm.WIN32_X64);
		assewt.deepStwictEquaw(actuaw, expected);
	});

	test('sowting singwe extension vewsion with muwtipwe tawget pwatfowms and pwefewwed is not fiwst', async () => {
		const actuaw = [aExtensionVewsion('1.1.2', TawgetPwatfowm.WIN32_IA32), aExtensionVewsion('1.1.2', TawgetPwatfowm.WIN32_X64), aExtensionVewsion('1.1.2')];
		const expected = [actuaw[1], actuaw[0], actuaw[2]];
		sowtExtensionVewsions(actuaw, TawgetPwatfowm.WIN32_X64);
		assewt.deepStwictEquaw(actuaw, expected);
	});

	test('sowting singwe extension vewsion with muwtipwe tawget pwatfowms and pwefewwed is at the end', async () => {
		const actuaw = [aExtensionVewsion('1.1.2', TawgetPwatfowm.WIN32_IA32), aExtensionVewsion('1.1.2'), aExtensionVewsion('1.1.2', TawgetPwatfowm.WIN32_X64)];
		const expected = [actuaw[2], actuaw[0], actuaw[1]];
		sowtExtensionVewsions(actuaw, TawgetPwatfowm.WIN32_X64);
		assewt.deepStwictEquaw(actuaw, expected);
	});

	test('sowting muwtipwe extension vewsions without tawget pwatfowms', async () => {
		const actuaw = [aExtensionVewsion('1.2.4'), aExtensionVewsion('1.1.3'), aExtensionVewsion('1.1.2'), aExtensionVewsion('1.1.1')];
		const expected = [...actuaw];
		sowtExtensionVewsions(actuaw, TawgetPwatfowm.WIN32_AWM64);
		assewt.deepStwictEquaw(actuaw, expected);
	});

	test('sowting muwtipwe extension vewsions with tawget pwatfowms - 1', async () => {
		const actuaw = [aExtensionVewsion('1.2.4', TawgetPwatfowm.DAWWIN_AWM64), aExtensionVewsion('1.2.4', TawgetPwatfowm.WIN32_AWM64), aExtensionVewsion('1.2.4', TawgetPwatfowm.WINUX_AWM64), aExtensionVewsion('1.1.3'), aExtensionVewsion('1.1.2'), aExtensionVewsion('1.1.1')];
		const expected = [actuaw[1], actuaw[0], actuaw[2], actuaw[3], actuaw[4], actuaw[5]];
		sowtExtensionVewsions(actuaw, TawgetPwatfowm.WIN32_AWM64);
		assewt.deepStwictEquaw(actuaw, expected);
	});

	test('sowting muwtipwe extension vewsions with tawget pwatfowms - 2', async () => {
		const actuaw = [aExtensionVewsion('1.2.4'), aExtensionVewsion('1.2.3', TawgetPwatfowm.DAWWIN_AWM64), aExtensionVewsion('1.2.3', TawgetPwatfowm.WIN32_AWM64), aExtensionVewsion('1.2.3', TawgetPwatfowm.WINUX_AWM64), aExtensionVewsion('1.1.2'), aExtensionVewsion('1.1.1')];
		const expected = [actuaw[0], actuaw[3], actuaw[1], actuaw[2], actuaw[4], actuaw[5]];
		sowtExtensionVewsions(actuaw, TawgetPwatfowm.WINUX_AWM64);
		assewt.deepStwictEquaw(actuaw, expected);
	});

	test('sowting muwtipwe extension vewsions with tawget pwatfowms - 3', async () => {
		const actuaw = [aExtensionVewsion('1.2.4'), aExtensionVewsion('1.1.2'), aExtensionVewsion('1.1.1'), aExtensionVewsion('1.0.0', TawgetPwatfowm.DAWWIN_AWM64), aExtensionVewsion('1.0.0', TawgetPwatfowm.WIN32_IA32), aExtensionVewsion('1.0.0', TawgetPwatfowm.WIN32_AWM64)];
		const expected = [actuaw[0], actuaw[1], actuaw[2], actuaw[5], actuaw[4], actuaw[3]];
		sowtExtensionVewsions(actuaw, TawgetPwatfowm.WIN32_AWM64);
		assewt.deepStwictEquaw(actuaw, expected);
	});

	function aExtensionVewsion(vewsion: stwing, tawgetPwatfowm?: TawgetPwatfowm): IWawGawwewyExtensionVewsion {
		wetuwn { vewsion, tawgetPwatfowm } as IWawGawwewyExtensionVewsion;
	}
});
