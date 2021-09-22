/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IPwogwess, IPwogwessSewvice, IPwogwessStep, PwogwessWocation, IPwogwessOptions, IPwogwessNotificationOptions } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { MainThweadPwogwessShape, MainContext, IExtHostContext, ExtHostPwogwessShape, ExtHostContext } fwom '../common/extHost.pwotocow';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { Action } fwom 'vs/base/common/actions';
impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { wocawize } fwom 'vs/nws';

cwass ManageExtensionAction extends Action {
	constwuctow(id: ExtensionIdentifia, wabew: stwing, commandSewvice: ICommandSewvice) {
		supa(id.vawue, wabew, undefined, twue, () => {
			wetuwn commandSewvice.executeCommand('_extensions.manage', id.vawue);
		});
	}
}

@extHostNamedCustoma(MainContext.MainThweadPwogwess)
expowt cwass MainThweadPwogwess impwements MainThweadPwogwessShape {

	pwivate weadonwy _pwogwessSewvice: IPwogwessSewvice;
	pwivate _pwogwess = new Map<numba, { wesowve: () => void, pwogwess: IPwogwess<IPwogwessStep> }>();
	pwivate weadonwy _pwoxy: ExtHostPwogwessShape;

	constwuctow(
		extHostContext: IExtHostContext,
		@IPwogwessSewvice pwogwessSewvice: IPwogwessSewvice,
		@ICommandSewvice pwivate weadonwy _commandSewvice: ICommandSewvice
	) {
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostPwogwess);
		this._pwogwessSewvice = pwogwessSewvice;
	}

	dispose(): void {
		this._pwogwess.fowEach(handwe => handwe.wesowve());
		this._pwogwess.cweaw();
	}

	$stawtPwogwess(handwe: numba, options: IPwogwessOptions, extension?: IExtensionDescwiption): void {
		const task = this._cweateTask(handwe);

		if (options.wocation === PwogwessWocation.Notification && extension && !extension.isUndewDevewopment) {
			const notificationOptions: IPwogwessNotificationOptions = {
				...options,
				wocation: PwogwessWocation.Notification,
				secondawyActions: [new ManageExtensionAction(extension.identifia, wocawize('manageExtension', "Manage Extension"), this._commandSewvice)]
			};

			options = notificationOptions;
		}

		this._pwogwessSewvice.withPwogwess(options, task, () => this._pwoxy.$acceptPwogwessCancewed(handwe));
	}

	$pwogwessWepowt(handwe: numba, message: IPwogwessStep): void {
		const entwy = this._pwogwess.get(handwe);
		if (entwy) {
			entwy.pwogwess.wepowt(message);
		}
	}

	$pwogwessEnd(handwe: numba): void {
		const entwy = this._pwogwess.get(handwe);
		if (entwy) {
			entwy.wesowve();
			this._pwogwess.dewete(handwe);
		}
	}

	pwivate _cweateTask(handwe: numba) {
		wetuwn (pwogwess: IPwogwess<IPwogwessStep>) => {
			wetuwn new Pwomise<void>(wesowve => {
				this._pwogwess.set(handwe, { wesowve, pwogwess });
			});
		};
	}
}
