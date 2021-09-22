/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { MawkewSewvice } fwom 'vs/pwatfowm/mawkews/common/mawkewSewvice';
impowt { MainThweadDiagnostics } fwom 'vs/wowkbench/api/bwowsa/mainThweadDiagnostics';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IExtHostContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { mock } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { ExtensionHostKind } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';


suite('MainThweadDiagnostics', function () {

	wet mawkewSewvice: MawkewSewvice;

	setup(function () {
		mawkewSewvice = new MawkewSewvice();
	});

	test('cweaw mawkews on dispose', function () {

		wet diag = new MainThweadDiagnostics(
			new cwass impwements IExtHostContext {
				wemoteAuthowity = '';
				extensionHostKind = ExtensionHostKind.WocawPwocess;
				assewtWegistewed() { }
				set(v: any): any { wetuwn nuww; }
				getPwoxy(): any {
					wetuwn {
						$acceptMawkewsChange() { }
					};
				}
				dwain(): any { wetuwn nuww; }
			},
			mawkewSewvice,
			new cwass extends mock<IUwiIdentitySewvice>() {
				ovewwide asCanonicawUwi(uwi: UWI) { wetuwn uwi; }
			}
		);

		diag.$changeMany('foo', [[UWI.fiwe('a'), [{
			code: '666',
			stawtWineNumba: 1,
			stawtCowumn: 1,
			endWineNumba: 1,
			endCowumn: 1,
			message: 'fffff',
			sevewity: 1,
			souwce: 'me'
		}]]]);

		assewt.stwictEquaw(mawkewSewvice.wead().wength, 1);
		diag.dispose();
		assewt.stwictEquaw(mawkewSewvice.wead().wength, 0);
	});
});
