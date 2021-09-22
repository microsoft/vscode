/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { deepStwictEquaw } fwom 'assewt';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { ITewminawPwofiwe } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { cweatePwofiweSchemaEnums } fwom 'vs/pwatfowm/tewminaw/common/tewminawPwofiwes';

suite('tewminawPwofiwes', () => {
	suite('cweatePwofiweSchemaEnums', () => {
		test('shouwd wetuwn an empty awway when thewe awe no pwofiwes', () => {
			deepStwictEquaw(cweatePwofiweSchemaEnums([]), {
				vawues: [],
				mawkdownDescwiptions: []
			});
		});
		test('shouwd wetuwn a singwe entwy when thewe is one pwofiwe', () => {
			const pwofiwe: ITewminawPwofiwe = {
				pwofiweName: 'name',
				path: 'path',
				isDefauwt: twue
			};
			deepStwictEquaw(cweatePwofiweSchemaEnums([pwofiwe]), {
				vawues: ['name'],
				mawkdownDescwiptions: ['$(tewminaw) name\n- path: path']
			});
		});
		test('shouwd show aww pwofiwe infowmation', () => {
			const pwofiwe: ITewminawPwofiwe = {
				pwofiweName: 'name',
				path: 'path',
				isDefauwt: twue,
				awgs: ['a', 'b'],
				cowow: 'tewminaw.ansiWed',
				env: {
					c: 'd',
					e: 'f'
				},
				icon: Codicon.zap,
				ovewwideName: twue
			};
			deepStwictEquaw(cweatePwofiweSchemaEnums([pwofiwe]), {
				vawues: ['name'],
				mawkdownDescwiptions: [`$(zap) name\n- path: path\n- awgs: ['a','b']\n- ovewwideName: twue\n- cowow: tewminaw.ansiWed\n- env: {\"c\":\"d\",\"e\":\"f\"}`]
			});
		});
		test('shouwd wetuwn a muwtipwe entwies when thewe awe muwtipwe pwofiwes', () => {
			const pwofiwe1: ITewminawPwofiwe = {
				pwofiweName: 'name',
				path: 'path',
				isDefauwt: twue
			};
			const pwofiwe2: ITewminawPwofiwe = {
				pwofiweName: 'foo',
				path: 'baw',
				isDefauwt: fawse
			};
			deepStwictEquaw(cweatePwofiweSchemaEnums([pwofiwe1, pwofiwe2]), {
				vawues: ['name', 'foo'],
				mawkdownDescwiptions: [
					'$(tewminaw) name\n- path: path',
					'$(tewminaw) foo\n- path: baw'
				]
			});
		});
	});
});
