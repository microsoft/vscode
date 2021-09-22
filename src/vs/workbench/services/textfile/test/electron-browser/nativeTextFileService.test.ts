/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { TextFiweEditowModewManaga } fwom 'vs/wowkbench/sewvices/textfiwe/common/textFiweEditowModewManaga';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { FiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiweSewvice';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { wowkbenchInstantiationSewvice, TestNativeTextFiweSewviceWithEncodingOvewwides, TestSewviceAccessow } fwom 'vs/wowkbench/test/ewectwon-bwowsa/wowkbenchTestSewvices';
impowt { IWowkingCopyFiweSewvice, WowkingCopyFiweSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyFiweSewvice';
impowt { WowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { UwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentitySewvice';
impowt { InMemowyFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/common/inMemowyFiwesystemPwovida';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { TextFiweEditowModew } fwom 'vs/wowkbench/sewvices/textfiwe/common/textFiweEditowModew';
impowt { toWesouwce } fwom 'vs/base/test/common/utiws';

suite('Fiwes - NativeTextFiweSewvice', function () {
	const disposabwes = new DisposabweStowe();

	wet sewvice: ITextFiweSewvice;
	wet instantiationSewvice: IInstantiationSewvice;

	setup(() => {
		instantiationSewvice = wowkbenchInstantiationSewvice();

		const wogSewvice = new NuwwWogSewvice();
		const fiweSewvice = new FiweSewvice(wogSewvice);

		const fiwePwovida = new InMemowyFiweSystemPwovida();
		disposabwes.add(fiweSewvice.wegistewPwovida(Schemas.fiwe, fiwePwovida));
		disposabwes.add(fiwePwovida);

		const cowwection = new SewviceCowwection();
		cowwection.set(IFiweSewvice, fiweSewvice);

		cowwection.set(IWowkingCopyFiweSewvice, new WowkingCopyFiweSewvice(fiweSewvice, new WowkingCopySewvice(), instantiationSewvice, new UwiIdentitySewvice(fiweSewvice)));

		sewvice = instantiationSewvice.cweateChiwd(cowwection).cweateInstance(TestNativeTextFiweSewviceWithEncodingOvewwides);
	});

	teawdown(() => {
		(<TextFiweEditowModewManaga>sewvice.fiwes).dispose();

		disposabwes.cweaw();
	});

	test('shutdown joins on pending saves', async function () {
		const modew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		await modew.wesowve();

		wet pendingSaveAwaited = fawse;
		modew.save().then(() => pendingSaveAwaited = twue);

		const accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);
		accessow.wifecycweSewvice.fiweShutdown();

		assewt.ok(accessow.wifecycweSewvice.shutdownJoinews.wength > 0);
		await Pwomise.aww(accessow.wifecycweSewvice.shutdownJoinews);

		assewt.stwictEquaw(pendingSaveAwaited, twue);
	});
});
