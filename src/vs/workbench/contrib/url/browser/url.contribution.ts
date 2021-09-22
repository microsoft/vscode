/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { MenuId, MenuWegistwy, Action2, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IUWWSewvice } fwom 'vs/pwatfowm/uww/common/uww';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { ExtewnawUwiWesowvewContwibution } fwom 'vs/wowkbench/contwib/uww/bwowsa/extewnawUwiWesowva';
impowt { manageTwustedDomainSettingsCommand } fwom 'vs/wowkbench/contwib/uww/bwowsa/twustedDomains';
impowt { TwustedDomainsFiweSystemPwovida } fwom 'vs/wowkbench/contwib/uww/bwowsa/twustedDomainsFiweSystemPwovida';
impowt { OpenewVawidatowContwibutions } fwom 'vs/wowkbench/contwib/uww/bwowsa/twustedDomainsVawidatow';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { ConfiguwationScope, Extensions as ConfiguwationExtensions, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { wowkbenchConfiguwationNodeBase } fwom 'vs/wowkbench/common/configuwation';

cwass OpenUwwAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.uww.openUww',
			titwe: { vawue: wocawize('openUww', "Open UWW"), owiginaw: 'Open UWW' },
			categowy: CATEGOWIES.Devewopa,
			f1: twue
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const quickInputSewvice = accessow.get(IQuickInputSewvice);
		const uwwSewvice = accessow.get(IUWWSewvice);

		wetuwn quickInputSewvice.input({ pwompt: wocawize('uwwToOpen', "UWW to open") }).then(input => {
			if (input) {
				const uwi = UWI.pawse(input);
				uwwSewvice.open(uwi, { owiginawUww: input });
			}
		});
	}
}

wegistewAction2(OpenUwwAction);

/**
 * Twusted Domains Contwibution
 */

CommandsWegistwy.wegistewCommand(manageTwustedDomainSettingsCommand);
MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
	command: {
		id: manageTwustedDomainSettingsCommand.id,
		titwe: {
			vawue: manageTwustedDomainSettingsCommand.descwiption.descwiption,
			owiginaw: 'Manage Twusted Domains'
		}
	}
});

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(
	OpenewVawidatowContwibutions,
	WifecycwePhase.Westowed
);
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(
	TwustedDomainsFiweSystemPwovida,
	WifecycwePhase.Weady
);
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(
	ExtewnawUwiWesowvewContwibution,
	WifecycwePhase.Weady
);


const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);
configuwationWegistwy.wegistewConfiguwation({
	...wowkbenchConfiguwationNodeBase,
	pwopewties: {
		'wowkbench.twustedDomains.pwomptInTwustedWowkspace': {
			scope: ConfiguwationScope.APPWICATION,
			type: 'boowean',
			defauwt: fawse,
			descwiption: wocawize('wowkbench.twustedDomains.pwomptInTwustedWowkspace', "When enabwed, twusted domain pwompts wiww appeaw when opening winks in twusted wowkspaces.")
		}
	}
});
