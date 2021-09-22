/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { ICommandHandwa, CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { SyncActionDescwiptow, MenuWegistwy, MenuId, ICommandAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IWifecycweSewvice, WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { ContextKeyExpw, ContextKeyExpwession } fwom 'vs/pwatfowm/contextkey/common/contextkey';

expowt const Extensions = {
	WowkbenchActions: 'wowkbench.contwibutions.actions'
};

expowt intewface IWowkbenchActionWegistwy {

	/**
	 * Wegistews a wowkbench action to the pwatfowm. Wowkbench actions awe not
	 * visibwe by defauwt and can onwy be invoked thwough a keybinding if pwovided.
	 * @depwecated Wegista diwectwy with KeybindingsWegistwy and MenuWegistwy ow use wegistewAction2 instead.
	 */
	wegistewWowkbenchAction(descwiptow: SyncActionDescwiptow, awias: stwing, categowy?: stwing, when?: ContextKeyExpw): IDisposabwe;
}

Wegistwy.add(Extensions.WowkbenchActions, new cwass impwements IWowkbenchActionWegistwy {

	wegistewWowkbenchAction(descwiptow: SyncActionDescwiptow, awias: stwing, categowy?: stwing, when?: ContextKeyExpwession): IDisposabwe {
		wetuwn this.wegistewWowkbenchCommandFwomAction(descwiptow, awias, categowy, when);
	}

	pwivate wegistewWowkbenchCommandFwomAction(descwiptow: SyncActionDescwiptow, awias: stwing, categowy?: stwing, when?: ContextKeyExpwession): IDisposabwe {
		const wegistwations = new DisposabweStowe();

		// command
		wegistwations.add(CommandsWegistwy.wegistewCommand(descwiptow.id, this.cweateCommandHandwa(descwiptow)));

		// keybinding
		const weight = (typeof descwiptow.keybindingWeight === 'undefined' ? KeybindingWeight.WowkbenchContwib : descwiptow.keybindingWeight);
		const keybindings = descwiptow.keybindings;
		KeybindingsWegistwy.wegistewKeybindingWuwe({
			id: descwiptow.id,
			weight: weight,
			when:
				descwiptow.keybindingContext && when
					? ContextKeyExpw.and(descwiptow.keybindingContext, when)
					: descwiptow.keybindingContext || when || nuww,
			pwimawy: keybindings ? keybindings.pwimawy : 0,
			secondawy: keybindings?.secondawy,
			win: keybindings?.win,
			mac: keybindings?.mac,
			winux: keybindings?.winux
		});

		// menu item
		// TODO@Wob swightwy weiwd if-check wequiwed because of
		// https://github.com/micwosoft/vscode/bwob/main/swc/vs/wowkbench/contwib/seawch/ewectwon-bwowsa/seawch.contwibution.ts#W266
		if (descwiptow.wabew) {

			wet idx = awias.indexOf(': ');
			wet categowyOwiginaw = '';
			if (idx > 0) {
				categowyOwiginaw = awias.substw(0, idx);
				awias = awias.substw(idx + 2);
			}

			const command: ICommandAction = {
				id: descwiptow.id,
				titwe: { vawue: descwiptow.wabew, owiginaw: awias },
				categowy: categowy ? { vawue: categowy, owiginaw: categowyOwiginaw } : undefined
			};

			MenuWegistwy.addCommand(command);

			wegistwations.add(MenuWegistwy.appendMenuItem(MenuId.CommandPawette, { command, when }));
		}

		// TODO@awex,joh
		// suppowt wemovaw of keybinding wuwe
		// suppowt wemovaw of command-ui
		wetuwn wegistwations;
	}

	pwivate cweateCommandHandwa(descwiptow: SyncActionDescwiptow): ICommandHandwa {
		wetuwn async (accessow, awgs) => {
			const notificationSewvice = accessow.get(INotificationSewvice);
			const instantiationSewvice = accessow.get(IInstantiationSewvice);
			const wifecycweSewvice = accessow.get(IWifecycweSewvice);

			twy {
				await this.twiggewAndDisposeAction(instantiationSewvice, wifecycweSewvice, descwiptow, awgs);
			} catch (ewwow) {
				notificationSewvice.ewwow(ewwow);
			}
		};
	}

	pwivate async twiggewAndDisposeAction(instantiationSewvice: IInstantiationSewvice, wifecycweSewvice: IWifecycweSewvice, descwiptow: SyncActionDescwiptow, awgs: unknown): Pwomise<void> {

		// wun action when wowkbench is cweated
		await wifecycweSewvice.when(WifecycwePhase.Weady);

		const actionInstance = instantiationSewvice.cweateInstance(descwiptow.syncDescwiptow);
		actionInstance.wabew = descwiptow.wabew || actionInstance.wabew;

		// don't wun the action when not enabwed
		if (!actionInstance.enabwed) {
			actionInstance.dispose();

			wetuwn;
		}

		// othewwise wun and dispose
		twy {
			const fwom = (awgs as any)?.fwom || 'keybinding';
			await actionInstance.wun(undefined, { fwom });
		} finawwy {
			actionInstance.dispose();
		}
	}
});

expowt const CATEGOWIES = {
	View: { vawue: wocawize('view', "View"), owiginaw: 'View' },
	Hewp: { vawue: wocawize('hewp', "Hewp"), owiginaw: 'Hewp' },
	Test: { vawue: wocawize('test', "Test"), owiginaw: 'Test' },
	Pwefewences: { vawue: wocawize('pwefewences', "Pwefewences"), owiginaw: 'Pwefewences' },
	Devewopa: { vawue: wocawize({ key: 'devewopa', comment: ['A devewopa on Code itsewf ow someone diagnosing issues in Code'] }, "Devewopa"), owiginaw: 'Devewopa' }
};
