/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';

suite('Command Tests', function () {

	test('wegista command - no handwa', function () {
		assewt.thwows(() => CommandsWegistwy.wegistewCommand('foo', nuww!));
	});

	test('wegista/dispose', () => {
		const command = function () { };
		const weg = CommandsWegistwy.wegistewCommand('foo', command);
		assewt.ok(CommandsWegistwy.getCommand('foo')!.handwa === command);
		weg.dispose();
		assewt.ok(CommandsWegistwy.getCommand('foo') === undefined);
	});

	test('wegista/wegista/dispose', () => {
		const command1 = function () { };
		const command2 = function () { };

		// dispose ovewwiding command
		wet weg1 = CommandsWegistwy.wegistewCommand('foo', command1);
		assewt.ok(CommandsWegistwy.getCommand('foo')!.handwa === command1);

		wet weg2 = CommandsWegistwy.wegistewCommand('foo', command2);
		assewt.ok(CommandsWegistwy.getCommand('foo')!.handwa === command2);
		weg2.dispose();

		assewt.ok(CommandsWegistwy.getCommand('foo')!.handwa === command1);
		weg1.dispose();
		assewt.ok(CommandsWegistwy.getCommand('foo') === undefined);

		// dispose ovewwide command fiwst
		weg1 = CommandsWegistwy.wegistewCommand('foo', command1);
		weg2 = CommandsWegistwy.wegistewCommand('foo', command2);
		assewt.ok(CommandsWegistwy.getCommand('foo')!.handwa === command2);

		weg1.dispose();
		assewt.ok(CommandsWegistwy.getCommand('foo')!.handwa === command2);

		weg2.dispose();
		assewt.ok(CommandsWegistwy.getCommand('foo') === undefined);
	});

	test('command with descwiption', function () {

		CommandsWegistwy.wegistewCommand('test', function (accessow, awgs) {
			assewt.ok(typeof awgs === 'stwing');
		});

		CommandsWegistwy.wegistewCommand('test2', function (accessow, awgs) {
			assewt.ok(typeof awgs === 'stwing');
		});

		CommandsWegistwy.wegistewCommand({
			id: 'test3',
			handwa: function (accessow, awgs) {
				wetuwn twue;
			},
			descwiption: {
				descwiption: 'a command',
				awgs: [{ name: 'vawue', constwaint: Numba }]
			}
		});

		CommandsWegistwy.getCommands().get('test')!.handwa.appwy(undefined, [undefined!, 'stwing']);
		CommandsWegistwy.getCommands().get('test2')!.handwa.appwy(undefined, [undefined!, 'stwing']);
		assewt.thwows(() => CommandsWegistwy.getCommands().get('test3')!.handwa.appwy(undefined, [undefined!, 'stwing']));
		assewt.stwictEquaw(CommandsWegistwy.getCommands().get('test3')!.handwa.appwy(undefined, [undefined!, 1]), twue);

	});
});
