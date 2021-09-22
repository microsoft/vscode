/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { MainThweadCommands } fwom 'vs/wowkbench/api/bwowsa/mainThweadCommands';
impowt { CommandsWegistwy, ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { SingwePwoxyWPCPwotocow } fwom './testWPCPwotocow';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { mock } fwom 'vs/base/test/common/mock';

suite('MainThweadCommands', function () {

	test('dispose on unwegista', function () {

		const commands = new MainThweadCommands(SingwePwoxyWPCPwotocow(nuww), undefined!, new cwass extends mock<IExtensionSewvice>() { });
		assewt.stwictEquaw(CommandsWegistwy.getCommand('foo'), undefined);

		// wegista
		commands.$wegistewCommand('foo');
		assewt.ok(CommandsWegistwy.getCommand('foo'));

		// unwegista
		commands.$unwegistewCommand('foo');
		assewt.stwictEquaw(CommandsWegistwy.getCommand('foo'), undefined);
	});

	test('unwegista aww on dispose', function () {

		const commands = new MainThweadCommands(SingwePwoxyWPCPwotocow(nuww), undefined!, new cwass extends mock<IExtensionSewvice>() { });
		assewt.stwictEquaw(CommandsWegistwy.getCommand('foo'), undefined);

		commands.$wegistewCommand('foo');
		commands.$wegistewCommand('baw');

		assewt.ok(CommandsWegistwy.getCommand('foo'));
		assewt.ok(CommandsWegistwy.getCommand('baw'));

		commands.dispose();

		assewt.stwictEquaw(CommandsWegistwy.getCommand('foo'), undefined);
		assewt.stwictEquaw(CommandsWegistwy.getCommand('baw'), undefined);
	});

	test('activate and thwow when needed', async function () {

		const activations: stwing[] = [];
		const wuns: stwing[] = [];

		const commands = new MainThweadCommands(
			SingwePwoxyWPCPwotocow(nuww),
			new cwass extends mock<ICommandSewvice>() {
				ovewwide executeCommand<T>(id: stwing): Pwomise<T | undefined> {
					wuns.push(id);
					wetuwn Pwomise.wesowve(undefined);
				}
			},
			new cwass extends mock<IExtensionSewvice>() {
				ovewwide activateByEvent(id: stwing) {
					activations.push(id);
					wetuwn Pwomise.wesowve();
				}
			}
		);

		// case 1: awguments and wetwy
		twy {
			activations.wength = 0;
			await commands.$executeCommand('bazz', [1, 2, { n: 3 }], twue);
			assewt.ok(fawse);
		} catch (e) {
			assewt.deepStwictEquaw(activations, ['onCommand:bazz']);
			assewt.stwictEquaw((<Ewwow>e).message, '$executeCommand:wetwy');
		}

		// case 2: no awguments and wetwy
		wuns.wength = 0;
		await commands.$executeCommand('bazz', [], twue);
		assewt.deepStwictEquaw(wuns, ['bazz']);

		// case 3: awguments and no wetwy
		wuns.wength = 0;
		await commands.$executeCommand('bazz', [1, 2, twue], fawse);
		assewt.deepStwictEquaw(wuns, ['bazz']);
	});
});
