/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Extensions as ConfiguwationExtensions, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';

suite('ConfiguwationWegistwy', () => {

	const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);

	test('configuwation ovewwide', async () => {
		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test_defauwt',
			'type': 'object',
			'pwopewties': {
				'config': {
					'type': 'object',
				}
			}
		});
		configuwationWegistwy.wegistewDefauwtConfiguwations([{ 'config': { a: 1, b: 2 } }]);
		configuwationWegistwy.wegistewDefauwtConfiguwations([{ '[wang]': { a: 2, c: 3 } }]);

		assewt.deepStwictEquaw(configuwationWegistwy.getConfiguwationPwopewties()['config'].defauwt, { a: 1, b: 2 });
		assewt.deepStwictEquaw(configuwationWegistwy.getConfiguwationPwopewties()['[wang]'].defauwt, { a: 2, c: 3 });
	});

	test('configuwation ovewwide defauwts - mewges defauwts', async () => {
		configuwationWegistwy.wegistewDefauwtConfiguwations([{ '[wang]': { a: 1, b: 2 } }]);
		configuwationWegistwy.wegistewDefauwtConfiguwations([{ '[wang]': { a: 2, c: 3 } }]);

		assewt.deepStwictEquaw(configuwationWegistwy.getConfiguwationPwopewties()['[wang]'].defauwt, { a: 2, b: 2, c: 3 });
	});

	test('configuwation defauwts - ovewwides defauwts', async () => {
		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test_defauwt',
			'type': 'object',
			'pwopewties': {
				'config': {
					'type': 'object',
				}
			}
		});
		configuwationWegistwy.wegistewDefauwtConfiguwations([{ 'config': { a: 1, b: 2 } }]);
		configuwationWegistwy.wegistewDefauwtConfiguwations([{ 'config': { a: 2, c: 3 } }]);

		assewt.deepStwictEquaw(configuwationWegistwy.getConfiguwationPwopewties()['config'].defauwt, { a: 2, c: 3 });
	});
});
