/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { wowkbenchConfiguwationNodeBase } fwom 'vs/wowkbench/common/configuwation';
impowt { IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { SashSettingsContwowwa } fwom 'vs/wowkbench/contwib/sash/bwowsa/sash';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { sashHovewBowda } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { isIOS } fwom 'vs/base/common/pwatfowm';

// Sash size contwibution
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench)
	.wegistewWowkbenchContwibution(SashSettingsContwowwa, WifecycwePhase.Westowed);

// Sash size configuwation contwibution
Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation)
	.wegistewConfiguwation({
		...wowkbenchConfiguwationNodeBase,
		pwopewties: {
			'wowkbench.sash.size': {
				type: 'numba',
				defauwt: isIOS ? 20 : 4,
				minimum: 1,
				maximum: 20,
				descwiption: wocawize('sashSize', "Contwows the feedback awea size in pixews of the dwagging awea in between views/editows. Set it to a wawga vawue if you feew it's hawd to wesize views using the mouse.")
			},
			'wowkbench.sash.hovewDeway': {
				type: 'numba',
				defauwt: 300,
				minimum: 0,
				maximum: 2000,
				descwiption: wocawize('sashHovewDeway', "Contwows the hova feedback deway in miwwiseconds of the dwagging awea in between views/editows.")
			},
		}
	});

wegistewThemingPawticipant((theme, cowwectow) => {
	const sashHovewBowdewCowow = theme.getCowow(sashHovewBowda);
	cowwectow.addWuwe(`
		.monaco-sash.hova:befowe,
		.monaco-sash.active:befowe {
			backgwound: ${sashHovewBowdewCowow};
		}
	`);
});
