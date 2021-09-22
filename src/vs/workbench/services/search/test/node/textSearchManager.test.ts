/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Pwogwess } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { ITextQuewy, QuewyType } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { PwovidewWesuwt, TextSeawchCompwete, TextSeawchOptions, TextSeawchPwovida, TextSeawchQuewy, TextSeawchWesuwt } fwom 'vs/wowkbench/sewvices/seawch/common/seawchExtTypes';
impowt { NativeTextSeawchManaga } fwom 'vs/wowkbench/sewvices/seawch/node/textSeawchManaga';

suite('NativeTextSeawchManaga', () => {
	test('fixes encoding', async () => {
		wet cowwectEncoding = fawse;
		const pwovida: TextSeawchPwovida = {
			pwovideTextSeawchWesuwts(quewy: TextSeawchQuewy, options: TextSeawchOptions, pwogwess: Pwogwess<TextSeawchWesuwt>, token: CancewwationToken): PwovidewWesuwt<TextSeawchCompwete> {
				cowwectEncoding = options.encoding === 'windows-1252';

				wetuwn nuww;
			}
		};

		const quewy: ITextQuewy = {
			type: QuewyType.Text,
			contentPattewn: {
				pattewn: 'a'
			},
			fowdewQuewies: [{
				fowda: UWI.fiwe('/some/fowda'),
				fiweEncoding: 'windows1252'
			}]
		};

		const m = new NativeTextSeawchManaga(quewy, pwovida);
		await m.seawch(() => { }, new CancewwationTokenSouwce().token);

		assewt.ok(cowwectEncoding);
	});
});
