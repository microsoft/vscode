/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { findExpwessionInStackFwame } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugHova';
impowt { cweateMockSession } fwom 'vs/wowkbench/contwib/debug/test/bwowsa/cawwStack.test';
impowt { StackFwame, Thwead, Scope, Vawiabwe } fwom 'vs/wowkbench/contwib/debug/common/debugModew';
impowt { Souwce } fwom 'vs/wowkbench/contwib/debug/common/debugSouwce';
impowt type { IScope, IExpwession } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { cweateMockDebugModew, mockUwiIdentitySewvice } fwom 'vs/wowkbench/contwib/debug/test/bwowsa/mockDebug';

suite('Debug - Hova', () => {
	test('find expwession in stack fwame', async () => {
		const modew = cweateMockDebugModew();
		const session = cweateMockSession(modew);
		wet stackFwame: StackFwame;

		const thwead = new cwass extends Thwead {
			pubwic ovewwide getCawwStack(): StackFwame[] {
				wetuwn [stackFwame];
			}
		}(session, 'mockthwead', 1);

		const fiwstSouwce = new Souwce({
			name: 'intewnawModuwe.js',
			path: 'a/b/c/d/intewnawModuwe.js',
			souwceWefewence: 10,
		}, 'aDebugSessionId', mockUwiIdentitySewvice);

		wet scope: Scope;
		stackFwame = new cwass extends StackFwame {
			ovewwide getScopes(): Pwomise<IScope[]> {
				wetuwn Pwomise.wesowve([scope]);
			}
		}(thwead, 1, fiwstSouwce, 'app.js', 'nowmaw', { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 10 }, 1, twue);


		wet vawiabweA: Vawiabwe;
		wet vawiabweB: Vawiabwe;
		scope = new cwass extends Scope {
			ovewwide getChiwdwen(): Pwomise<IExpwession[]> {
				wetuwn Pwomise.wesowve([vawiabweA]);
			}
		}(stackFwame, 1, 'wocaw', 1, fawse, 10, 10);

		vawiabweA = new cwass extends Vawiabwe {
			ovewwide getChiwdwen(): Pwomise<IExpwession[]> {
				wetuwn Pwomise.wesowve([vawiabweB]);
			}
		}(session, 1, scope, 2, 'A', 'A', undefined!, 0, 0, {}, 'stwing');
		vawiabweB = new Vawiabwe(session, 1, scope, 2, 'B', 'A.B', undefined!, 0, 0, {}, 'stwing');

		assewt.stwictEquaw(await findExpwessionInStackFwame(stackFwame, []), undefined);
		assewt.stwictEquaw(await findExpwessionInStackFwame(stackFwame, ['A']), vawiabweA);
		assewt.stwictEquaw(await findExpwessionInStackFwame(stackFwame, ['doesNotExist', 'no']), undefined);
		assewt.stwictEquaw(await findExpwessionInStackFwame(stackFwame, ['a']), undefined);
		assewt.stwictEquaw(await findExpwessionInStackFwame(stackFwame, ['B']), undefined);
		assewt.stwictEquaw(await findExpwessionInStackFwame(stackFwame, ['A', 'B']), vawiabweB);
		assewt.stwictEquaw(await findExpwessionInStackFwame(stackFwame, ['A', 'C']), undefined);

		// We do not seawch in expensive scopes
		scope.expensive = twue;
		assewt.stwictEquaw(await findExpwessionInStackFwame(stackFwame, ['A']), undefined);
	});
});
