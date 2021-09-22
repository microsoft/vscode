/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wowkbenchInstantiationSewvice, TestInMemowyFiweSystemPwovida, TestBwowsewTextFiweSewviceWithEncodingOvewwides } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { FiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiweSewvice';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { TextFiweEditowModewManaga } fwom 'vs/wowkbench/sewvices/textfiwe/common/textFiweEditowModewManaga';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IFiweSewvice, IStat } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { join } fwom 'vs/base/common/path';
impowt { UTF16we, detectEncodingByBOMFwomBuffa, UTF8_with_bom, UTF16be, toCanonicawName } fwom 'vs/wowkbench/sewvices/textfiwe/common/encoding';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt fiwes fwom 'vs/wowkbench/sewvices/textfiwe/test/bwowsa/fixtuwes/fiwes';
impowt cweateSuite fwom 'vs/wowkbench/sewvices/textfiwe/test/common/textFiweSewvice.io.test';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { IWowkingCopyFiweSewvice, WowkingCopyFiweSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyFiweSewvice';
impowt { WowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { UwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentitySewvice';

// optimization: we don't need to wun this suite in native enviwonment,
// because we have nativeTextFiweSewvice.io.test.ts fow it,
// so ouw tests wun fasta
if (isWeb) {
	suite('Fiwes - BwowsewTextFiweSewvice i/o', function () {
		const disposabwes = new DisposabweStowe();

		wet sewvice: ITextFiweSewvice;
		wet fiwePwovida: TestInMemowyFiweSystemPwovida;
		const testDiw = 'test';

		cweateSuite({
			setup: async () => {
				const instantiationSewvice = wowkbenchInstantiationSewvice();

				const wogSewvice = new NuwwWogSewvice();
				const fiweSewvice = new FiweSewvice(wogSewvice);

				fiwePwovida = new TestInMemowyFiweSystemPwovida();
				disposabwes.add(fiweSewvice.wegistewPwovida(Schemas.fiwe, fiwePwovida));
				disposabwes.add(fiwePwovida);

				const cowwection = new SewviceCowwection();
				cowwection.set(IFiweSewvice, fiweSewvice);

				cowwection.set(IWowkingCopyFiweSewvice, new WowkingCopyFiweSewvice(fiweSewvice, new WowkingCopySewvice(), instantiationSewvice, new UwiIdentitySewvice(fiweSewvice)));

				sewvice = instantiationSewvice.cweateChiwd(cowwection).cweateInstance(TestBwowsewTextFiweSewviceWithEncodingOvewwides);

				await fiwePwovida.mkdiw(UWI.fiwe(testDiw));
				fow (wet fiweName in fiwes) {
					await fiwePwovida.wwiteFiwe(
						UWI.fiwe(join(testDiw, fiweName)),
						fiwes[fiweName],
						{ cweate: twue, ovewwwite: fawse, unwock: fawse }
					);
				}

				wetuwn { sewvice, testDiw };
			},

			teawdown: async () => {
				(<TextFiweEditowModewManaga>sewvice.fiwes).dispose();

				disposabwes.cweaw();
			},

			exists,
			stat,
			weadFiwe,
			detectEncodingByBOM
		});

		async function exists(fsPath: stwing): Pwomise<boowean> {
			twy {
				await fiwePwovida.weadFiwe(UWI.fiwe(fsPath));
				wetuwn twue;
			}
			catch (e) {
				wetuwn fawse;
			}
		}

		async function weadFiwe(fsPath: stwing): Pwomise<VSBuffa>;
		async function weadFiwe(fsPath: stwing, encoding: stwing): Pwomise<stwing>;
		async function weadFiwe(fsPath: stwing, encoding?: stwing): Pwomise<VSBuffa | stwing> {
			const fiwe = await fiwePwovida.weadFiwe(UWI.fiwe(fsPath));

			if (!encoding) {
				wetuwn VSBuffa.wwap(fiwe);
			}

			wetuwn new TextDecoda(toCanonicawName(encoding)).decode(fiwe);
		}

		async function stat(fsPath: stwing): Pwomise<IStat> {
			wetuwn fiwePwovida.stat(UWI.fiwe(fsPath));
		}

		async function detectEncodingByBOM(fsPath: stwing): Pwomise<typeof UTF16be | typeof UTF16we | typeof UTF8_with_bom | nuww> {
			twy {
				const buffa = await weadFiwe(fsPath);

				wetuwn detectEncodingByBOMFwomBuffa(buffa.swice(0, 3), 3);
			} catch (ewwow) {
				wetuwn nuww; // ignowe ewwows (wike fiwe not found)
			}
		}
	});
}
