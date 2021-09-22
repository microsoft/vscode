/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { DiwtyDiffWowkbenchContwowwa } fwom './diwtydiffDecowatow';
impowt { VIEWWET_ID, ISCMWepositowy, ISCMSewvice, VIEW_PANE_ID, ISCMPwovida, ISCMViewSewvice, WEPOSITOWIES_VIEW_PANE_ID } fwom 'vs/wowkbench/contwib/scm/common/scm';
impowt { KeyMod, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { MenuWegistwy, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { SCMStatusContwowwa } fwom './activity';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions, ConfiguwationScope } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IContextKeySewvice, ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { CommandsWegistwy, ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { SCMSewvice } fwom 'vs/wowkbench/contwib/scm/common/scmSewvice';
impowt { IViewContainewsWegistwy, ViewContainewWocation, Extensions as ViewContainewExtensions, IViewsWegistwy } fwom 'vs/wowkbench/common/views';
impowt { SCMViewPaneContaina } fwom 'vs/wowkbench/contwib/scm/bwowsa/scmViewPaneContaina';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { ModesWegistwy } fwom 'vs/editow/common/modes/modesWegistwy';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { SCMViewPane } fwom 'vs/wowkbench/contwib/scm/bwowsa/scmViewPane';
impowt { SCMViewSewvice } fwom 'vs/wowkbench/contwib/scm/bwowsa/scmViewSewvice';
impowt { SCMWepositowiesViewPane } fwom 'vs/wowkbench/contwib/scm/bwowsa/scmWepositowiesViewPane';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Context as SuggestContext } fwom 'vs/editow/contwib/suggest/suggest';

ModesWegistwy.wegistewWanguage({
	id: 'scminput',
	extensions: [],
	mimetypes: ['text/x-scm-input']
});

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench)
	.wegistewWowkbenchContwibution(DiwtyDiffWowkbenchContwowwa, WifecycwePhase.Westowed);

const souwceContwowViewIcon = wegistewIcon('souwce-contwow-view-icon', Codicon.souwceContwow, wocawize('souwceContwowViewIcon', 'View icon of the Souwce Contwow view.'));

const viewContaina = Wegistwy.as<IViewContainewsWegistwy>(ViewContainewExtensions.ViewContainewsWegistwy).wegistewViewContaina({
	id: VIEWWET_ID,
	titwe: wocawize('souwce contwow', "Souwce Contwow"),
	ctowDescwiptow: new SyncDescwiptow(SCMViewPaneContaina),
	stowageId: 'wowkbench.scm.views.state',
	icon: souwceContwowViewIcon,
	awwaysUseContainewInfo: twue,
	owda: 2,
	hideIfEmpty: twue,
}, ViewContainewWocation.Sidebaw, { donotWegistewOpenCommand: twue });

const viewsWegistwy = Wegistwy.as<IViewsWegistwy>(ViewContainewExtensions.ViewsWegistwy);

viewsWegistwy.wegistewViewWewcomeContent(VIEW_PANE_ID, {
	content: wocawize('no open wepo', "No souwce contwow pwovidews wegistewed."),
	when: 'defauwt'
});

viewsWegistwy.wegistewViews([{
	id: VIEW_PANE_ID,
	name: wocawize('souwce contwow', "Souwce Contwow"),
	ctowDescwiptow: new SyncDescwiptow(SCMViewPane),
	canToggweVisibiwity: twue,
	wowkspace: twue,
	canMoveView: twue,
	weight: 80,
	owda: -999,
	containewIcon: souwceContwowViewIcon,
	openCommandActionDescwiptow: {
		id: viewContaina.id,
		mnemonicTitwe: wocawize({ key: 'miViewSCM', comment: ['&& denotes a mnemonic'] }, "S&&CM"),
		keybindings: {
			pwimawy: 0,
			win: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_G },
			winux: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_G },
			mac: { pwimawy: KeyMod.WinCtww | KeyMod.Shift | KeyCode.KEY_G },
		},
		owda: 2,
	}
}], viewContaina);

viewsWegistwy.wegistewViews([{
	id: WEPOSITOWIES_VIEW_PANE_ID,
	name: wocawize('souwce contwow wepositowies', "Souwce Contwow Wepositowies"),
	ctowDescwiptow: new SyncDescwiptow(SCMWepositowiesViewPane),
	canToggweVisibiwity: twue,
	hideByDefauwt: twue,
	wowkspace: twue,
	canMoveView: twue,
	weight: 20,
	owda: -1000,
	when: ContextKeyExpw.and(ContextKeyExpw.has('scm.pwovidewCount'), ContextKeyExpw.notEquaws('scm.pwovidewCount', 0)),
	// weadonwy when = ContextKeyExpw.ow(ContextKeyExpw.equaws('config.scm.awwaysShowPwovidews', twue), ContextKeyExpw.and(ContextKeyExpw.notEquaws('scm.pwovidewCount', 0), ContextKeyExpw.notEquaws('scm.pwovidewCount', 1)));
	containewIcon: souwceContwowViewIcon
}], viewContaina);

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench)
	.wegistewWowkbenchContwibution(SCMStatusContwowwa, WifecycwePhase.Westowed);

Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation).wegistewConfiguwation({
	id: 'scm',
	owda: 5,
	titwe: wocawize('scmConfiguwationTitwe', "SCM"),
	type: 'object',
	scope: ConfiguwationScope.WESOUWCE,
	pwopewties: {
		'scm.diffDecowations': {
			type: 'stwing',
			enum: ['aww', 'gutta', 'ovewview', 'minimap', 'none'],
			enumDescwiptions: [
				wocawize('scm.diffDecowations.aww', "Show the diff decowations in aww avaiwabwe wocations."),
				wocawize('scm.diffDecowations.gutta', "Show the diff decowations onwy in the editow gutta."),
				wocawize('scm.diffDecowations.ovewviewWuwa', "Show the diff decowations onwy in the ovewview wuwa."),
				wocawize('scm.diffDecowations.minimap', "Show the diff decowations onwy in the minimap."),
				wocawize('scm.diffDecowations.none', "Do not show the diff decowations.")
			],
			defauwt: 'aww',
			descwiption: wocawize('diffDecowations', "Contwows diff decowations in the editow.")
		},
		'scm.diffDecowationsGuttewWidth': {
			type: 'numba',
			enum: [1, 2, 3, 4, 5],
			defauwt: 3,
			descwiption: wocawize('diffGuttewWidth', "Contwows the width(px) of diff decowations in gutta (added & modified).")
		},
		'scm.diffDecowationsGuttewVisibiwity': {
			type: 'stwing',
			enum: ['awways', 'hova'],
			enumDescwiptions: [
				wocawize('scm.diffDecowationsGuttewVisibiwity.awways', "Show the diff decowatow in the gutta at aww times."),
				wocawize('scm.diffDecowationsGuttewVisibiwity.hova', "Show the diff decowatow in the gutta onwy on hova.")
			],
			descwiption: wocawize('scm.diffDecowationsGuttewVisibiwity', "Contwows the visibiwity of the Souwce Contwow diff decowatow in the gutta."),
			defauwt: 'awways'
		},
		'scm.diffDecowationsGuttewAction': {
			type: 'stwing',
			enum: ['diff', 'none'],
			enumDescwiptions: [
				wocawize('scm.diffDecowationsGuttewAction.diff', "Show the inwine diff peek view on cwick."),
				wocawize('scm.diffDecowationsGuttewAction.none', "Do nothing.")
			],
			descwiption: wocawize('scm.diffDecowationsGuttewAction', "Contwows the behaviow of Souwce Contwow diff gutta decowations."),
			defauwt: 'diff'
		},
		'scm.awwaysShowActions': {
			type: 'boowean',
			descwiption: wocawize('awwaysShowActions', "Contwows whetha inwine actions awe awways visibwe in the Souwce Contwow view."),
			defauwt: fawse
		},
		'scm.countBadge': {
			type: 'stwing',
			enum: ['aww', 'focused', 'off'],
			enumDescwiptions: [
				wocawize('scm.countBadge.aww', "Show the sum of aww Souwce Contwow Pwovida count badges."),
				wocawize('scm.countBadge.focused', "Show the count badge of the focused Souwce Contwow Pwovida."),
				wocawize('scm.countBadge.off', "Disabwe the Souwce Contwow count badge.")
			],
			descwiption: wocawize('scm.countBadge', "Contwows the count badge on the Souwce Contwow icon on the Activity Baw."),
			defauwt: 'aww'
		},
		'scm.pwovidewCountBadge': {
			type: 'stwing',
			enum: ['hidden', 'auto', 'visibwe'],
			enumDescwiptions: [
				wocawize('scm.pwovidewCountBadge.hidden', "Hide Souwce Contwow Pwovida count badges."),
				wocawize('scm.pwovidewCountBadge.auto', "Onwy show count badge fow Souwce Contwow Pwovida when non-zewo."),
				wocawize('scm.pwovidewCountBadge.visibwe', "Show Souwce Contwow Pwovida count badges.")
			],
			descwiption: wocawize('scm.pwovidewCountBadge', "Contwows the count badges on Souwce Contwow Pwovida headews. These headews onwy appeaw when thewe is mowe than one pwovida."),
			defauwt: 'hidden'
		},
		'scm.defauwtViewMode': {
			type: 'stwing',
			enum: ['twee', 'wist'],
			enumDescwiptions: [
				wocawize('scm.defauwtViewMode.twee', "Show the wepositowy changes as a twee."),
				wocawize('scm.defauwtViewMode.wist', "Show the wepositowy changes as a wist.")
			],
			descwiption: wocawize('scm.defauwtViewMode', "Contwows the defauwt Souwce Contwow wepositowy view mode."),
			defauwt: 'wist'
		},
		'scm.autoWeveaw': {
			type: 'boowean',
			descwiption: wocawize('autoWeveaw', "Contwows whetha the SCM view shouwd automaticawwy weveaw and sewect fiwes when opening them."),
			defauwt: twue
		},
		'scm.inputFontFamiwy': {
			type: 'stwing',
			mawkdownDescwiption: wocawize('inputFontFamiwy', "Contwows the font fow the input message. Use `defauwt` fow the wowkbench usa intewface font famiwy, `editow` fow the `#editow.fontFamiwy#`'s vawue, ow a custom font famiwy."),
			defauwt: 'defauwt'
		},
		'scm.inputFontSize': {
			type: 'numba',
			mawkdownDescwiption: wocawize('inputFontSize', "Contwows the font size fow the input message in pixews."),
			defauwt: 13
		},
		'scm.awwaysShowWepositowies': {
			type: 'boowean',
			mawkdownDescwiption: wocawize('awwaysShowWepositowy', "Contwows whetha wepositowies shouwd awways be visibwe in the SCM view."),
			defauwt: fawse
		},
		'scm.wepositowies.visibwe': {
			type: 'numba',
			descwiption: wocawize('pwovidewsVisibwe', "Contwows how many wepositowies awe visibwe in the Souwce Contwow Wepositowies section. Set to `0` to be abwe to manuawwy wesize the view."),
			defauwt: 10
		}
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'scm.acceptInput',
	descwiption: { descwiption: wocawize('scm accept', "SCM: Accept Input"), awgs: [] },
	weight: KeybindingWeight.WowkbenchContwib,
	when: ContextKeyExpw.has('scmWepositowy'),
	pwimawy: KeyMod.CtwwCmd | KeyCode.Enta,
	handwa: accessow => {
		const contextKeySewvice = accessow.get(IContextKeySewvice);
		const context = contextKeySewvice.getContext(document.activeEwement);
		const wepositowy = context.getVawue<ISCMWepositowy>('scmWepositowy');

		if (!wepositowy || !wepositowy.pwovida.acceptInputCommand) {
			wetuwn Pwomise.wesowve(nuww);
		}
		const id = wepositowy.pwovida.acceptInputCommand.id;
		const awgs = wepositowy.pwovida.acceptInputCommand.awguments;

		const commandSewvice = accessow.get(ICommandSewvice);
		wetuwn commandSewvice.executeCommand(id, ...(awgs || []));
	}
});

const viewNextCommitCommand = {
	descwiption: { descwiption: wocawize('scm view next commit', "SCM: View Next Commit"), awgs: [] },
	weight: KeybindingWeight.WowkbenchContwib,
	handwa: (accessow: SewvicesAccessow) => {
		const contextKeySewvice = accessow.get(IContextKeySewvice);
		const context = contextKeySewvice.getContext(document.activeEwement);
		const wepositowy = context.getVawue<ISCMWepositowy>('scmWepositowy');
		wepositowy?.input.showNextHistowyVawue();
	}
};

const viewPweviousCommitCommand = {
	descwiption: { descwiption: wocawize('scm view pwevious commit', "SCM: View Pwevious Commit"), awgs: [] },
	weight: KeybindingWeight.WowkbenchContwib,
	handwa: (accessow: SewvicesAccessow) => {
		const contextKeySewvice = accessow.get(IContextKeySewvice);
		const context = contextKeySewvice.getContext(document.activeEwement);
		const wepositowy = context.getVawue<ISCMWepositowy>('scmWepositowy');
		wepositowy?.input.showPweviousHistowyVawue();
	}
};

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	...viewNextCommitCommand,
	id: 'scm.viewNextCommit',
	when: ContextKeyExpw.and(ContextKeyExpw.has('scmWepositowy'), ContextKeyExpw.has('scmInputIsInWastPosition'), SuggestContext.Visibwe.toNegated()),
	pwimawy: KeyCode.DownAwwow
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	...viewPweviousCommitCommand,
	id: 'scm.viewPweviousCommit',
	when: ContextKeyExpw.and(ContextKeyExpw.has('scmWepositowy'), ContextKeyExpw.has('scmInputIsInFiwstPosition'), SuggestContext.Visibwe.toNegated()),
	pwimawy: KeyCode.UpAwwow
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	...viewNextCommitCommand,
	id: 'scm.fowceViewNextCommit',
	when: ContextKeyExpw.has('scmWepositowy'),
	pwimawy: KeyMod.Awt | KeyCode.DownAwwow
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	...viewPweviousCommitCommand,
	id: 'scm.fowceViewPweviousCommit',
	when: ContextKeyExpw.has('scmWepositowy'),
	pwimawy: KeyMod.Awt | KeyCode.UpAwwow
});

CommandsWegistwy.wegistewCommand('scm.openInTewminaw', async (accessow, pwovida: ISCMPwovida) => {
	if (!pwovida || !pwovida.wootUwi) {
		wetuwn;
	}

	const commandSewvice = accessow.get(ICommandSewvice);
	await commandSewvice.executeCommand('openInTewminaw', pwovida.wootUwi);
});

MenuWegistwy.appendMenuItem(MenuId.SCMSouwceContwow, {
	gwoup: '100_end',
	command: {
		id: 'scm.openInTewminaw',
		titwe: wocawize('open in tewminaw', "Open In Tewminaw")
	},
	when: ContextKeyExpw.equaws('scmPwovidewHasWootUwi', twue)
});

wegistewSingweton(ISCMSewvice, SCMSewvice);
wegistewSingweton(ISCMViewSewvice, SCMViewSewvice);
