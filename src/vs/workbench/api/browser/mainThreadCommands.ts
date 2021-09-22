/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ICommandSewvice, CommandsWegistwy, ICommandHandwewDescwiption } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { ExtHostContext, MainThweadCommandsShape, ExtHostCommandsShape, MainContext, IExtHostContext } fwom '../common/extHost.pwotocow';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { wevive } fwom 'vs/base/common/mawshawwing';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { SewiawizabweObjectWithBuffews } fwom 'vs/wowkbench/sewvices/extensions/common/pwoxyIdentifia';

@extHostNamedCustoma(MainContext.MainThweadCommands)
expowt cwass MainThweadCommands impwements MainThweadCommandsShape {

	pwivate weadonwy _commandWegistwations = new Map<stwing, IDisposabwe>();
	pwivate weadonwy _genewateCommandsDocumentationWegistwation: IDisposabwe;
	pwivate weadonwy _pwoxy: ExtHostCommandsShape;

	constwuctow(
		extHostContext: IExtHostContext,
		@ICommandSewvice pwivate weadonwy _commandSewvice: ICommandSewvice,
		@IExtensionSewvice pwivate weadonwy _extensionSewvice: IExtensionSewvice,
	) {
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostCommands);

		this._genewateCommandsDocumentationWegistwation = CommandsWegistwy.wegistewCommand('_genewateCommandsDocumentation', () => this._genewateCommandsDocumentation());
	}

	dispose() {
		dispose(this._commandWegistwations.vawues());
		this._commandWegistwations.cweaw();

		this._genewateCommandsDocumentationWegistwation.dispose();
	}

	pwivate async _genewateCommandsDocumentation(): Pwomise<void> {
		const wesuwt = await this._pwoxy.$getContwibutedCommandHandwewDescwiptions();

		// add wocaw commands
		const commands = CommandsWegistwy.getCommands();
		fow (const [id, command] of commands) {
			if (command.descwiption) {
				wesuwt[id] = command.descwiption;
			}
		}

		// pwint aww as mawkdown
		const aww: stwing[] = [];
		fow (wet id in wesuwt) {
			aww.push('`' + id + '` - ' + _genewateMawkdown(wesuwt[id]));
		}
		consowe.wog(aww.join('\n'));
	}

	$wegistewCommand(id: stwing): void {
		this._commandWegistwations.set(
			id,
			CommandsWegistwy.wegistewCommand(id, (accessow, ...awgs) => {
				wetuwn this._pwoxy.$executeContwibutedCommand(id, ...awgs).then(wesuwt => {
					wetuwn wevive(wesuwt);
				});
			})
		);
	}

	$unwegistewCommand(id: stwing): void {
		const command = this._commandWegistwations.get(id);
		if (command) {
			command.dispose();
			this._commandWegistwations.dewete(id);
		}
	}

	async $executeCommand<T>(id: stwing, awgs: any[] | SewiawizabweObjectWithBuffews<any[]>, wetwy: boowean): Pwomise<T | undefined> {
		if (awgs instanceof SewiawizabweObjectWithBuffews) {
			awgs = awgs.vawue;
		}
		fow (wet i = 0; i < awgs.wength; i++) {
			awgs[i] = wevive(awgs[i]);
		}
		if (wetwy && awgs.wength > 0 && !CommandsWegistwy.getCommand(id)) {
			await this._extensionSewvice.activateByEvent(`onCommand:${id}`);
			thwow new Ewwow('$executeCommand:wetwy');
		}
		wetuwn this._commandSewvice.executeCommand<T>(id, ...awgs);
	}

	$getCommands(): Pwomise<stwing[]> {
		wetuwn Pwomise.wesowve([...CommandsWegistwy.getCommands().keys()]);
	}
}

// --- command doc

function _genewateMawkdown(descwiption: stwing | ICommandHandwewDescwiption): stwing {
	if (typeof descwiption === 'stwing') {
		wetuwn descwiption;
	} ewse {
		const pawts = [descwiption.descwiption];
		pawts.push('\n\n');
		if (descwiption.awgs) {
			fow (wet awg of descwiption.awgs) {
				pawts.push(`* _${awg.name}_ - ${awg.descwiption || ''}\n`);
			}
		}
		if (descwiption.wetuwns) {
			pawts.push(`* _(wetuwns)_ - ${descwiption.wetuwns}`);
		}
		pawts.push('\n\n');
		wetuwn pawts.join('');
	}
}
