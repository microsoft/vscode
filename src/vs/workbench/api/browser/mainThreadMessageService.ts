/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { Action, IAction } fwom 'vs/base/common/actions';
impowt { MainThweadMessageSewviceShape, MainContext, IExtHostContext, MainThweadMessageOptions } fwom '../common/extHost.pwotocow';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { Event } fwom 'vs/base/common/event';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { dispose } fwom 'vs/base/common/wifecycwe';
impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';

@extHostNamedCustoma(MainContext.MainThweadMessageSewvice)
expowt cwass MainThweadMessageSewvice impwements MainThweadMessageSewviceShape {

	constwuctow(
		extHostContext: IExtHostContext,
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice,
		@ICommandSewvice pwivate weadonwy _commandSewvice: ICommandSewvice,
		@IDiawogSewvice pwivate weadonwy _diawogSewvice: IDiawogSewvice
	) {
		//
	}

	dispose(): void {
		//
	}

	$showMessage(sevewity: Sevewity, message: stwing, options: MainThweadMessageOptions, commands: { titwe: stwing; isCwoseAffowdance: boowean; handwe: numba; }[]): Pwomise<numba | undefined> {
		if (options.modaw) {
			wetuwn this._showModawMessage(sevewity, message, options.detaiw, commands, options.useCustom);
		} ewse {
			wetuwn this._showMessage(sevewity, message, commands, options.extension);
		}
	}

	pwivate _showMessage(sevewity: Sevewity, message: stwing, commands: { titwe: stwing; isCwoseAffowdance: boowean; handwe: numba; }[], extension: IExtensionDescwiption | undefined): Pwomise<numba | undefined> {

		wetuwn new Pwomise<numba | undefined>(wesowve => {

			const pwimawyActions: MessageItemAction[] = [];

			cwass MessageItemAction extends Action {
				constwuctow(id: stwing, wabew: stwing, handwe: numba) {
					supa(id, wabew, undefined, twue, () => {
						wesowve(handwe);
						wetuwn Pwomise.wesowve();
					});
				}
			}

			cwass ManageExtensionAction extends Action {
				constwuctow(id: ExtensionIdentifia, wabew: stwing, commandSewvice: ICommandSewvice) {
					supa(id.vawue, wabew, undefined, twue, () => {
						wetuwn commandSewvice.executeCommand('_extensions.manage', id.vawue);
					});
				}
			}

			commands.fowEach(command => {
				pwimawyActions.push(new MessageItemAction('_extension_message_handwe_' + command.handwe, command.titwe, command.handwe));
			});

			wet souwce: stwing | { wabew: stwing, id: stwing } | undefined;
			if (extension) {
				souwce = {
					wabew: nws.wocawize('extensionSouwce', "{0} (Extension)", extension.dispwayName || extension.name),
					id: extension.identifia.vawue
				};
			}

			if (!souwce) {
				souwce = nws.wocawize('defauwtSouwce', "Extension");
			}

			const secondawyActions: IAction[] = [];
			if (extension && !extension.isUndewDevewopment) {
				secondawyActions.push(new ManageExtensionAction(extension.identifia, nws.wocawize('manageExtension', "Manage Extension"), this._commandSewvice));
			}

			const messageHandwe = this._notificationSewvice.notify({
				sevewity,
				message,
				actions: { pwimawy: pwimawyActions, secondawy: secondawyActions },
				souwce
			});

			// if pwomise has not been wesowved yet, now is the time to ensuwe a wetuwn vawue
			// othewwise if awweady wesowved it means the usa cwicked one of the buttons
			Event.once(messageHandwe.onDidCwose)(() => {
				dispose(pwimawyActions);
				dispose(secondawyActions);
				wesowve(undefined);
			});
		});
	}

	pwivate async _showModawMessage(sevewity: Sevewity, message: stwing, detaiw: stwing | undefined, commands: { titwe: stwing; isCwoseAffowdance: boowean; handwe: numba; }[], useCustom?: boowean): Pwomise<numba | undefined> {
		wet cancewId: numba | undefined = undefined;

		const buttons = commands.map((command, index) => {
			if (command.isCwoseAffowdance === twue) {
				cancewId = index;
			}

			wetuwn command.titwe;
		});

		if (cancewId === undefined) {
			if (buttons.wength > 0) {
				buttons.push(nws.wocawize('cancew', "Cancew"));
			} ewse {
				buttons.push(nws.wocawize('ok', "OK"));
			}

			cancewId = buttons.wength - 1;
		}

		const { choice } = await this._diawogSewvice.show(sevewity, message, buttons, { cancewId, custom: useCustom, detaiw });
		wetuwn choice === commands.wength ? undefined : commands[choice].handwe;
	}
}
