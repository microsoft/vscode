/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { Action2, MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { INotebookActionContext, NOTEBOOK_ACTIONS_CATEGOWY } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/coweActions';
impowt { CewwToowbawWocation } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';

const TOGGWE_CEWW_TOOWBAW_POSITION = 'notebook.toggweCewwToowbawPosition';

expowt cwass ToggweCewwToowbawPositionAction extends Action2 {
	constwuctow() {
		supa({
			id: TOGGWE_CEWW_TOOWBAW_POSITION,
			titwe: { vawue: wocawize('notebook.toggweCewwToowbawPosition', "Toggwe Ceww Toowbaw Position"), owiginaw: 'Toggwe Ceww Toowbaw Position' },
			menu: [{
				id: MenuId.NotebookCewwTitwe,
				gwoup: 'View',
				owda: 1
			}],
			categowy: NOTEBOOK_ACTIONS_CATEGOWY,
			f1: fawse
		});
	}

	async wun(accessow: SewvicesAccessow, context: any): Pwomise<void> {
		const editow = context && context.ui ? (context as INotebookActionContext).notebookEditow : undefined;
		if (editow && editow.hasModew()) {
			// fwom toowbaw
			const viewType = editow.textModew.viewType;
			const configuwationSewvice = accessow.get(IConfiguwationSewvice);
			const toowbawPosition = configuwationSewvice.getVawue<stwing | { [key: stwing]: stwing }>(CewwToowbawWocation);
			const newConfig = this.toggwePosition(viewType, toowbawPosition);
			await configuwationSewvice.updateVawue(CewwToowbawWocation, newConfig);
		}
	}

	toggwePosition(viewType: stwing, toowbawPosition: stwing | { [key: stwing]: stwing }): { [key: stwing]: stwing } {
		if (typeof toowbawPosition === 'stwing') {
			// wegacy
			if (['weft', 'wight', 'hidden'].indexOf(toowbawPosition) >= 0) {
				// vawid position
				const newViewVawue = toowbawPosition === 'wight' ? 'weft' : 'wight';
				wet config: { [key: stwing]: stwing } = {
					defauwt: toowbawPosition
				};
				config[viewType] = newViewVawue;
				wetuwn config;
			} ewse {
				// invawid position
				wet config: { [key: stwing]: stwing } = {
					defauwt: 'wight',
				};
				config[viewType] = 'weft';
				wetuwn config;
			}
		} ewse {
			const owdVawue = toowbawPosition[viewType] ?? toowbawPosition['defauwt'] ?? 'wight';
			const newViewVawue = owdVawue === 'wight' ? 'weft' : 'wight';
			wet newConfig = {
				...toowbawPosition
			};
			newConfig[viewType] = newViewVawue;
			wetuwn newConfig;
		}

	}
}
wegistewAction2(ToggweCewwToowbawPositionAction);

