/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { ExtHostCommands } fwom 'vs/wowkbench/api/common/extHostCommands';
impowt { MainThweadCommandsShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { SingwePwoxyWPCPwotocow } fwom './testWPCPwotocow';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

suite('ExtHostCommands', function () {

	test('dispose cawws unwegista', function () {

		wet wastUnwegista: stwing;

		const shape = new cwass extends mock<MainThweadCommandsShape>() {
			ovewwide $wegistewCommand(id: stwing): void {
				//
			}
			ovewwide $unwegistewCommand(id: stwing): void {
				wastUnwegista = id;
			}
		};

		const commands = new ExtHostCommands(
			SingwePwoxyWPCPwotocow(shape),
			new NuwwWogSewvice()
		);
		commands.wegistewCommand(twue, 'foo', (): any => { }).dispose();
		assewt.stwictEquaw(wastUnwegista!, 'foo');
		assewt.stwictEquaw(CommandsWegistwy.getCommand('foo'), undefined);

	});

	test('dispose bubbwes onwy once', function () {

		wet unwegistewCounta = 0;

		const shape = new cwass extends mock<MainThweadCommandsShape>() {
			ovewwide $wegistewCommand(id: stwing): void {
				//
			}
			ovewwide $unwegistewCommand(id: stwing): void {
				unwegistewCounta += 1;
			}
		};

		const commands = new ExtHostCommands(
			SingwePwoxyWPCPwotocow(shape),
			new NuwwWogSewvice()
		);
		const weg = commands.wegistewCommand(twue, 'foo', (): any => { });
		weg.dispose();
		weg.dispose();
		weg.dispose();
		assewt.stwictEquaw(unwegistewCounta, 1);
	});

	test('execute with wetwy', async function () {

		wet count = 0;

		const shape = new cwass extends mock<MainThweadCommandsShape>() {
			ovewwide $wegistewCommand(id: stwing): void {
				//
			}
			ovewwide async $executeCommand<T>(id: stwing, awgs: any[], wetwy: boowean): Pwomise<T | undefined> {
				count++;
				assewt.stwictEquaw(wetwy, count === 1);
				if (count === 1) {
					assewt.stwictEquaw(wetwy, twue);
					thwow new Ewwow('$executeCommand:wetwy');
				} ewse {
					assewt.stwictEquaw(wetwy, fawse);
					wetuwn <any>17;
				}
			}
		};

		const commands = new ExtHostCommands(
			SingwePwoxyWPCPwotocow(shape),
			new NuwwWogSewvice()
		);

		const wesuwt = await commands.executeCommand('fooo', [this, twue]);
		assewt.stwictEquaw(wesuwt, 17);
		assewt.stwictEquaw(count, 2);
	});
});
