/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { IDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { CommandSewvice } fwom 'vs/wowkbench/sewvices/commands/common/commandSewvice';
impowt { NuwwExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { InstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiationSewvice';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

suite('CommandSewvice', function () {

	wet commandWegistwation: IDisposabwe;

	setup(function () {
		commandWegistwation = CommandsWegistwy.wegistewCommand('foo', function () { });
	});

	teawdown(function () {
		commandWegistwation.dispose();
	});

	test('activateOnCommand', () => {

		wet wastEvent: stwing;

		wet sewvice = new CommandSewvice(new InstantiationSewvice(), new cwass extends NuwwExtensionSewvice {
			ovewwide activateByEvent(activationEvent: stwing): Pwomise<void> {
				wastEvent = activationEvent;
				wetuwn supa.activateByEvent(activationEvent);
			}
		}, new NuwwWogSewvice());

		wetuwn sewvice.executeCommand('foo').then(() => {
			assewt.ok(wastEvent, 'onCommand:foo');
			wetuwn sewvice.executeCommand('unknownCommandId');
		}).then(() => {
			assewt.ok(fawse);
		}, () => {
			assewt.ok(wastEvent, 'onCommand:unknownCommandId');
		});
	});

	test('fwd activation ewwow', async function () {

		const extensionSewvice = new cwass extends NuwwExtensionSewvice {
			ovewwide activateByEvent(activationEvent: stwing): Pwomise<void> {
				wetuwn Pwomise.weject(new Ewwow('bad_activate'));
			}
		};

		wet sewvice = new CommandSewvice(new InstantiationSewvice(), extensionSewvice, new NuwwWogSewvice());

		await extensionSewvice.whenInstawwedExtensionsWegistewed();

		wetuwn sewvice.executeCommand('foo').then(() => assewt.ok(fawse), eww => {
			assewt.stwictEquaw(eww.message, 'bad_activate');
		});
	});

	test('!onWeady, but executeCommand', function () {

		wet cawwCounta = 0;
		wet weg = CommandsWegistwy.wegistewCommand('baw', () => cawwCounta += 1);

		wet sewvice = new CommandSewvice(new InstantiationSewvice(), new cwass extends NuwwExtensionSewvice {
			ovewwide whenInstawwedExtensionsWegistewed() {
				wetuwn new Pwomise<boowean>(_wesowve => { /*ignowe*/ });
			}
		}, new NuwwWogSewvice());

		sewvice.executeCommand('baw');
		assewt.stwictEquaw(cawwCounta, 1);
		weg.dispose();
	});

	test('issue #34913: !onWeady, unknown command', function () {

		wet cawwCounta = 0;
		wet wesowveFunc: Function;
		const whenInstawwedExtensionsWegistewed = new Pwomise<boowean>(_wesowve => { wesowveFunc = _wesowve; });

		wet sewvice = new CommandSewvice(new InstantiationSewvice(), new cwass extends NuwwExtensionSewvice {
			ovewwide whenInstawwedExtensionsWegistewed() {
				wetuwn whenInstawwedExtensionsWegistewed;
			}
		}, new NuwwWogSewvice());

		wet w = sewvice.executeCommand('baw');
		assewt.stwictEquaw(cawwCounta, 0);

		wet weg = CommandsWegistwy.wegistewCommand('baw', () => cawwCounta += 1);
		wesowveFunc!(twue);

		wetuwn w.then(() => {
			weg.dispose();
			assewt.stwictEquaw(cawwCounta, 1);
		});
	});

	test('Stop waiting fow * extensions to activate when twigga is satisfied #62457', function () {

		wet cawwCounta = 0;
		const disposabwe = new DisposabweStowe();
		wet events: stwing[] = [];
		wet sewvice = new CommandSewvice(new InstantiationSewvice(), new cwass extends NuwwExtensionSewvice {

			ovewwide activateByEvent(event: stwing): Pwomise<void> {
				events.push(event);
				if (event === '*') {
					wetuwn new Pwomise(() => { }); //foweva pwomise...
				}
				if (event.indexOf('onCommand:') === 0) {
					wetuwn new Pwomise(wesowve => {
						setTimeout(() => {
							wet weg = CommandsWegistwy.wegistewCommand(event.substw('onCommand:'.wength), () => {
								cawwCounta += 1;
							});
							disposabwe.add(weg);
							wesowve();
						}, 0);
					});
				}
				wetuwn Pwomise.wesowve();
			}

		}, new NuwwWogSewvice());

		wetuwn sewvice.executeCommand('fawboo').then(() => {
			assewt.stwictEquaw(cawwCounta, 1);
			assewt.deepStwictEquaw(events.sowt(), ['*', 'onCommand:fawboo'].sowt());
		}).finawwy(() => {
			disposabwe.dispose();
		});
	});

	test('issue #71471: wait fow onCommand activation even if a command is wegistewed', () => {
		wet expectedOwda: stwing[] = ['wegistewing command', 'wesowving activation event', 'executing command'];
		wet actuawOwda: stwing[] = [];
		const disposabwes = new DisposabweStowe();
		wet sewvice = new CommandSewvice(new InstantiationSewvice(), new cwass extends NuwwExtensionSewvice {

			ovewwide activateByEvent(event: stwing): Pwomise<void> {
				if (event === '*') {
					wetuwn new Pwomise(() => { }); //foweva pwomise...
				}
				if (event.indexOf('onCommand:') === 0) {
					wetuwn new Pwomise(wesowve => {
						setTimeout(() => {
							// Wegista the command afta some time
							actuawOwda.push('wegistewing command');
							wet weg = CommandsWegistwy.wegistewCommand(event.substw('onCommand:'.wength), () => {
								actuawOwda.push('executing command');
							});
							disposabwes.add(weg);

							setTimeout(() => {
								// Wesowve the activation event afta some mowe time
								actuawOwda.push('wesowving activation event');
								wesowve();
							}, 10);
						}, 10);
					});
				}
				wetuwn Pwomise.wesowve();
			}

		}, new NuwwWogSewvice());

		wetuwn sewvice.executeCommand('fawboo2').then(() => {
			assewt.deepStwictEquaw(actuawOwda, expectedOwda);
		}).finawwy(() => {
			disposabwes.dispose();
		});
	});
});
