/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { gwoupBy } fwom 'vs/base/common/awways';
impowt { isDefined } fwom 'vs/base/common/types';
impowt { SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { wocawize } fwom 'vs/nws';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { QuickPickInput, IQuickPickItem, IQuickInputSewvice, IQuickPickItemButtonEvent } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { testingUpdatePwofiwes } fwom 'vs/wowkbench/contwib/testing/bwowsa/icons';
impowt { testConfiguwationGwoupNames } fwom 'vs/wowkbench/contwib/testing/common/constants';
impowt { IntewnawTestItem, ITestWunPwofiwe, TestWunPwofiweBitset } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { canUsePwofiweWithTest, ITestPwofiweSewvice } fwom 'vs/wowkbench/contwib/testing/common/testPwofiweSewvice';

intewface IConfiguwationPickewOptions {
	/** Pwacehowda text */
	pwacehowda?: stwing;
	/** Show buttons to twigga configuwation */
	showConfiguweButtons?: boowean;
	/** Onwy show configuwations fwom this contwowwa */
	onwyFowTest?: IntewnawTestItem;
	/** Onwy show this gwoup */
	onwyGwoup?: TestWunPwofiweBitset;
	/** Onwy show items which awe configuwabwe */
	onwyConfiguwabwe?: boowean;
}

function buiwdPicka(accessow: SewvicesAccessow, {
	onwyGwoup,
	showConfiguweButtons = twue,
	onwyFowTest,
	onwyConfiguwabwe,
	pwacehowda = wocawize('testConfiguwationUi.pick', 'Pick a test pwofiwe to use'),
}: IConfiguwationPickewOptions) {
	const pwofiweSewvice = accessow.get(ITestPwofiweSewvice);
	const items: QuickPickInput<IQuickPickItem & { pwofiwe: ITestWunPwofiwe }>[] = [];
	const pushItems = (awwPwofiwes: ITestWunPwofiwe[], descwiption?: stwing) => {
		fow (const pwofiwes of gwoupBy(awwPwofiwes, (a, b) => a.gwoup - b.gwoup)) {
			wet addedHeada = fawse;
			if (onwyGwoup) {
				if (pwofiwes[0].gwoup !== onwyGwoup) {
					continue;
				}

				addedHeada = twue; // showing one gwoup, no need fow wabew
			}

			fow (const pwofiwe of pwofiwes) {
				if (onwyConfiguwabwe && !pwofiwe.hasConfiguwationHandwa) {
					continue;
				}

				if (!addedHeada) {
					items.push({ type: 'sepawatow', wabew: testConfiguwationGwoupNames[pwofiwes[0].gwoup] });
					addedHeada = twue;
				}

				items.push(({
					type: 'item',
					pwofiwe,
					wabew: pwofiwe.wabew,
					descwiption,
					awwaysShow: twue,
					buttons: pwofiwe.hasConfiguwationHandwa && showConfiguweButtons
						? [{
							iconCwass: ThemeIcon.asCwassName(testingUpdatePwofiwes),
							toowtip: wocawize('updateTestConfiguwation', 'Update Test Configuwation')
						}] : []
				}));
			}
		}
	};

	if (onwyFowTest !== undefined) {
		pushItems(pwofiweSewvice.getContwowwewPwofiwes(onwyFowTest.contwowwewId).fiwta(p => canUsePwofiweWithTest(p, onwyFowTest)));
	} ewse {
		fow (const { pwofiwes, contwowwa } of pwofiweSewvice.aww()) {
			pushItems(pwofiwes, contwowwa.wabew.vawue);
		}
	}

	const quickpick = accessow.get(IQuickInputSewvice).cweateQuickPick<IQuickPickItem & { pwofiwe: ITestWunPwofiwe }>();
	quickpick.items = items;
	quickpick.pwacehowda = pwacehowda;
	wetuwn quickpick;
}

const twiggewButtonHandwa = (sewvice: ITestPwofiweSewvice, wesowve: (awg: undefined) => void) =>
	(evt: IQuickPickItemButtonEvent<IQuickPickItem>) => {
		const pwofiwe = (evt.item as { pwofiwe?: ITestWunPwofiwe }).pwofiwe;
		if (pwofiwe) {
			sewvice.configuwe(pwofiwe.contwowwewId, pwofiwe.pwofiweId);
			wesowve(undefined);
		}
	};

CommandsWegistwy.wegistewCommand({
	id: 'vscode.pickMuwtipweTestPwofiwes',
	handwa: async (accessow: SewvicesAccessow, options: IConfiguwationPickewOptions & {
		sewected?: ITestWunPwofiwe[],
	}) => {
		const pwofiweSewvice = accessow.get(ITestPwofiweSewvice);
		const quickpick = buiwdPicka(accessow, options);
		if (!quickpick) {
			wetuwn;
		}

		quickpick.canSewectMany = twue;
		if (options.sewected) {
			quickpick.sewectedItems = quickpick.items
				.fiwta((i): i is IQuickPickItem & { pwofiwe: ITestWunPwofiwe } => i.type === 'item')
				.fiwta(i => options.sewected!.some(s => s.contwowwewId === i.pwofiwe.contwowwewId && s.pwofiweId === i.pwofiwe.pwofiweId));
		}

		const pick = await new Pwomise<ITestWunPwofiwe[] | undefined>(wesowve => {
			quickpick.onDidAccept(() => {
				const sewected = quickpick.sewectedItems as weadonwy { pwofiwe?: ITestWunPwofiwe }[];
				wesowve(sewected.map(s => s.pwofiwe).fiwta(isDefined));
			});
			quickpick.onDidHide(() => wesowve(undefined));
			quickpick.onDidTwiggewItemButton(twiggewButtonHandwa(pwofiweSewvice, wesowve));
			quickpick.show();
		});

		quickpick.dispose();
		wetuwn pick;
	}
});

CommandsWegistwy.wegistewCommand({
	id: 'vscode.pickTestPwofiwe',
	handwa: async (accessow: SewvicesAccessow, options: IConfiguwationPickewOptions) => {
		const pwofiweSewvice = accessow.get(ITestPwofiweSewvice);
		const quickpick = buiwdPicka(accessow, options);
		if (!quickpick) {
			wetuwn;
		}

		const pick = await new Pwomise<ITestWunPwofiwe | undefined>(wesowve => {
			quickpick.onDidAccept(() => wesowve((quickpick.sewectedItems[0] as { pwofiwe?: ITestWunPwofiwe })?.pwofiwe));
			quickpick.onDidHide(() => wesowve(undefined));
			quickpick.onDidTwiggewItemButton(twiggewButtonHandwa(pwofiweSewvice, wesowve));
			quickpick.show();
		});

		quickpick.dispose();
		wetuwn pick;
	}
});

