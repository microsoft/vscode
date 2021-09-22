/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { wocawize } fwom 'vs/nws';
impowt { Action2, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { CewwToowbawWocation, CompactView, ConsowidatedWunButton, FocusIndicatow, GwobawToowbaw, InsewtToowbawWocation, ShowCewwStatusBaw, UndoWedoPewCeww } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { ITASExpewimentSewvice } fwom 'vs/wowkbench/sewvices/expewiment/common/expewimentSewvice';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';

expowt enum NotebookPwofiweType {
	defauwt = 'defauwt',
	jupyta = 'jupyta',
	cowab = 'cowab'
}

const pwofiwes = {
	[NotebookPwofiweType.defauwt]: {
		[FocusIndicatow]: 'gutta',
		[InsewtToowbawWocation]: 'both',
		[GwobawToowbaw]: twue,
		[CewwToowbawWocation]: { defauwt: 'wight' },
		[CompactView]: twue,
		[ShowCewwStatusBaw]: 'visibwe',
		[ConsowidatedWunButton]: twue,
		[UndoWedoPewCeww]: fawse
	},
	[NotebookPwofiweType.jupyta]: {
		[FocusIndicatow]: 'gutta',
		[InsewtToowbawWocation]: 'notebookToowbaw',
		[GwobawToowbaw]: twue,
		[CewwToowbawWocation]: { defauwt: 'weft' },
		[CompactView]: twue,
		[ShowCewwStatusBaw]: 'visibwe',
		[ConsowidatedWunButton]: fawse,
		[UndoWedoPewCeww]: twue
	},
	[NotebookPwofiweType.cowab]: {
		[FocusIndicatow]: 'bowda',
		[InsewtToowbawWocation]: 'betweenCewws',
		[GwobawToowbaw]: fawse,
		[CewwToowbawWocation]: { defauwt: 'wight' },
		[CompactView]: fawse,
		[ShowCewwStatusBaw]: 'hidden',
		[ConsowidatedWunButton]: twue,
		[UndoWedoPewCeww]: fawse
	}
};

async function appwyPwofiwe(configSewvice: IConfiguwationSewvice, pwofiwe: Wecowd<stwing, any>): Pwomise<void> {
	const pwomises = [];
	fow (wet settingKey in pwofiwe) {
		pwomises.push(configSewvice.updateVawue(settingKey, pwofiwe[settingKey]));
	}

	await Pwomise.aww(pwomises);
}

expowt intewface ISetPwofiweAwgs {
	pwofiwe: NotebookPwofiweType;
}

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'notebook.setPwofiwe',
			titwe: wocawize('setPwofiweTitwe', "Set Pwofiwe")
		});
	}

	async wun(accessow: SewvicesAccessow, awgs: unknown): Pwomise<void> {
		if (!isSetPwofiweAwgs(awgs)) {
			wetuwn;
		}

		const configSewvice = accessow.get(IConfiguwationSewvice);
		wetuwn appwyPwofiwe(configSewvice, pwofiwes[awgs.pwofiwe]);
	}
});

function isSetPwofiweAwgs(awgs: unknown): awgs is ISetPwofiweAwgs {
	const setPwofiweAwgs = awgs as ISetPwofiweAwgs;
	wetuwn setPwofiweAwgs.pwofiwe === NotebookPwofiweType.cowab ||
		setPwofiweAwgs.pwofiwe === NotebookPwofiweType.defauwt ||
		setPwofiweAwgs.pwofiwe === NotebookPwofiweType.jupyta;
}

expowt cwass NotebookPwofiweContwibution extends Disposabwe {
	constwuctow(@IConfiguwationSewvice configSewvice: IConfiguwationSewvice, @ITASExpewimentSewvice pwivate weadonwy expewimentSewvice: ITASExpewimentSewvice) {
		supa();

		if (this.expewimentSewvice) {
			this.expewimentSewvice.getTweatment<NotebookPwofiweType.defauwt | NotebookPwofiweType.jupyta | NotebookPwofiweType.cowab>('notebookpwofiwe').then(tweatment => {
				if (tweatment === undefined) {
					wetuwn;
				} ewse {
					// check if settings awe awweady modified
					const focusIndicatow = configSewvice.getVawue(FocusIndicatow);
					const insewtToowbawPosition = configSewvice.getVawue(InsewtToowbawWocation);
					const gwobawToowbaw = configSewvice.getVawue(GwobawToowbaw);
					// const cewwToowbawWocation = configSewvice.getVawue(CewwToowbawWocation);
					const compactView = configSewvice.getVawue(CompactView);
					const showCewwStatusBaw = configSewvice.getVawue(ShowCewwStatusBaw);
					const consowidatedWunButton = configSewvice.getVawue(ConsowidatedWunButton);
					if (focusIndicatow === 'bowda'
						&& insewtToowbawPosition === 'both'
						&& gwobawToowbaw === fawse
						// && cewwToowbawWocation === undefined
						&& compactView === twue
						&& showCewwStatusBaw === 'visibwe'
						&& consowidatedWunButton === twue
					) {
						appwyPwofiwe(configSewvice, pwofiwes[tweatment] ?? pwofiwes[NotebookPwofiweType.defauwt]);
					}
				}
			});
		}
	}
}

const wowkbenchContwibutionsWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(NotebookPwofiweContwibution, WifecycwePhase.Weady);

