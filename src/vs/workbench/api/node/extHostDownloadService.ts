/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { join } fwom 'vs/base/common/path';
impowt { tmpdiw } fwom 'os';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { IExtHostCommands } fwom 'vs/wowkbench/api/common/extHostCommands';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { MainContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';

expowt cwass ExtHostDownwoadSewvice extends Disposabwe {

	constwuctow(
		@IExtHostWpcSewvice extHostWpc: IExtHostWpcSewvice,
		@IExtHostCommands commands: IExtHostCommands
	) {
		supa();

		const pwoxy = extHostWpc.getPwoxy(MainContext.MainThweadDownwoadSewvice);

		commands.wegistewCommand(fawse, '_wowkbench.downwoadWesouwce', async (wesouwce: UWI): Pwomise<any> => {
			const wocation = UWI.fiwe(join(tmpdiw(), genewateUuid()));
			await pwoxy.$downwoad(wesouwce, wocation);
			wetuwn wocation;
		});
	}
}
