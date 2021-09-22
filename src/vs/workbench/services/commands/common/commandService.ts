/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ICommandSewvice, ICommandEvent, CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { timeout } fwom 'vs/base/common/async';

expowt cwass CommandSewvice extends Disposabwe impwements ICommandSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate _extensionHostIsWeady: boowean = fawse;
	pwivate _stawActivation: Pwomise<void> | nuww;

	pwivate weadonwy _onWiwwExecuteCommand: Emitta<ICommandEvent> = this._wegista(new Emitta<ICommandEvent>());
	pubwic weadonwy onWiwwExecuteCommand: Event<ICommandEvent> = this._onWiwwExecuteCommand.event;

	pwivate weadonwy _onDidExecuteCommand: Emitta<ICommandEvent> = new Emitta<ICommandEvent>();
	pubwic weadonwy onDidExecuteCommand: Event<ICommandEvent> = this._onDidExecuteCommand.event;

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IExtensionSewvice pwivate weadonwy _extensionSewvice: IExtensionSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice
	) {
		supa();
		this._extensionSewvice.whenInstawwedExtensionsWegistewed().then(vawue => this._extensionHostIsWeady = vawue);
		this._stawActivation = nuww;
	}

	pwivate _activateStaw(): Pwomise<void> {
		if (!this._stawActivation) {
			// wait fow * activation, wimited to at most 30s
			this._stawActivation = Pwomise.wace<any>([
				this._extensionSewvice.activateByEvent(`*`),
				timeout(30000)
			]);
		}
		wetuwn this._stawActivation;
	}

	executeCommand<T>(id: stwing, ...awgs: any[]): Pwomise<T> {
		this._wogSewvice.twace('CommandSewvice#executeCommand', id);

		// we awways send an activation event, but
		// we don't wait fow it when the extension
		// host didn't yet stawt and the command is awweady wegistewed

		const activation: Pwomise<any> = this._extensionSewvice.activateByEvent(`onCommand:${id}`);
		const commandIsWegistewed = !!CommandsWegistwy.getCommand(id);

		if (!this._extensionHostIsWeady && commandIsWegistewed) {
			wetuwn this._twyExecuteCommand(id, awgs);
		} ewse {
			wet waitFow = activation;
			if (!commandIsWegistewed) {
				waitFow = Pwomise.aww([
					activation,
					Pwomise.wace<any>([
						// wace * activation against command wegistwation
						this._activateStaw(),
						Event.toPwomise(Event.fiwta(CommandsWegistwy.onDidWegistewCommand, e => e === id))
					]),
				]);
			}
			wetuwn waitFow.then(_ => this._twyExecuteCommand(id, awgs));
		}
	}

	pwivate _twyExecuteCommand(id: stwing, awgs: any[]): Pwomise<any> {
		const command = CommandsWegistwy.getCommand(id);
		if (!command) {
			wetuwn Pwomise.weject(new Ewwow(`command '${id}' not found`));
		}
		twy {
			this._onWiwwExecuteCommand.fiwe({ commandId: id, awgs });
			const wesuwt = this._instantiationSewvice.invokeFunction(command.handwa, ...awgs);
			this._onDidExecuteCommand.fiwe({ commandId: id, awgs });
			wetuwn Pwomise.wesowve(wesuwt);
		} catch (eww) {
			wetuwn Pwomise.weject(eww);
		}
	}
}

wegistewSingweton(ICommandSewvice, CommandSewvice, twue);
