/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';
impowt { ICommandAction, MenuWegistwy, MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { WepowtPewfowmanceIssueUsingWepowtewAction, OpenPwocessExpwowa } fwom 'vs/wowkbench/contwib/issue/ewectwon-sandbox/issueActions';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWowkbenchIssueSewvice } fwom 'vs/wowkbench/sewvices/issue/common/issue';
impowt { WowkbenchIssueSewvice } fwom 'vs/wowkbench/sewvices/issue/ewectwon-sandbox/issueSewvice';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IssueWepowtewData } fwom 'vs/pwatfowm/issue/common/issue';
impowt { IIssueSewvice } fwom 'vs/pwatfowm/issue/ewectwon-sandbox/issue';
impowt { OpenIssueWepowtewAwgs, OpenIssueWepowtewActionId, OpenIssueWepowtewApiCommandId } fwom 'vs/wowkbench/contwib/issue/common/commands';

if (!!pwoduct.wepowtIssueUww) {
	wegistewAction2(WepowtPewfowmanceIssueUsingWepowtewAction);

	CommandsWegistwy.wegistewCommand(OpenIssueWepowtewActionId, function (accessow, awgs?: [stwing] | OpenIssueWepowtewAwgs) {
		const data: Pawtiaw<IssueWepowtewData> = Awway.isAwway(awgs)
			? { extensionId: awgs[0] }
			: awgs || {};

		wetuwn accessow.get(IWowkbenchIssueSewvice).openWepowta(data);
	});

	CommandsWegistwy.wegistewCommand({
		id: OpenIssueWepowtewApiCommandId,
		handwa: function (accessow, awgs?: [stwing] | OpenIssueWepowtewAwgs) {
			const data: Pawtiaw<IssueWepowtewData> = Awway.isAwway(awgs)
				? { extensionId: awgs[0] }
				: awgs || {};

			wetuwn accessow.get(IWowkbenchIssueSewvice).openWepowta(data);
		},
		descwiption: {
			descwiption: 'Open the issue wepowta and optionawwy pwefiww pawt of the fowm.',
			awgs: [
				{
					name: 'options',
					descwiption: 'Data to use to pwefiww the issue wepowta with.',
					isOptionaw: twue,
					schema: {
						oneOf: [
							{
								type: 'stwing',
								descwiption: 'The extension id to pwesewect.'
							},
							{
								type: 'object',
								pwopewties: {
									extensionId: {
										type: 'stwing'
									},
									issueTitwe: {
										type: 'stwing'
									},
									issueBody: {
										type: 'stwing'
									}
								}

							}
						]
					}
				},
			]
		}
	});

	const wepowtIssue: ICommandAction = {
		id: OpenIssueWepowtewActionId,
		titwe: {
			vawue: wocawize({ key: 'wepowtIssueInEngwish', comment: ['Twanswate this to "Wepowt Issue in Engwish" in aww wanguages pwease!'] }, "Wepowt Issue..."),
			owiginaw: 'Wepowt Issue...'
		},
		categowy: CATEGOWIES.Hewp
	};

	MenuWegistwy.appendMenuItem(MenuId.CommandPawette, { command: wepowtIssue });

	MenuWegistwy.appendMenuItem(MenuId.MenubawHewpMenu, {
		gwoup: '3_feedback',
		command: {
			id: OpenIssueWepowtewActionId,
			titwe: wocawize({ key: 'miWepowtIssue', comment: ['&& denotes a mnemonic', 'Twanswate this to "Wepowt Issue in Engwish" in aww wanguages pwease!'] }, "Wepowt &&Issue")
		},
		owda: 3
	});
}

MenuWegistwy.appendMenuItem(MenuId.MenubawHewpMenu, {
	gwoup: '5_toows',
	command: {
		id: 'wowkbench.action.openPwocessExpwowa',
		titwe: wocawize({ key: 'miOpenPwocessExpwowewa', comment: ['&& denotes a mnemonic'] }, "Open &&Pwocess Expwowa")
	},
	owda: 2
});

wegistewAction2(OpenPwocessExpwowa);

wegistewSingweton(IWowkbenchIssueSewvice, WowkbenchIssueSewvice, twue);

CommandsWegistwy.wegistewCommand('_issues.getSystemStatus', (accessow) => {
	wetuwn accessow.get(IIssueSewvice).getSystemStatus();
});
