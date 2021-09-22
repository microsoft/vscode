/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IDiawog, IDiawogWesuwt } fwom 'vs/pwatfowm/diawogs/common/diawogs';

expowt intewface IDiawogViewItem {
	awgs: IDiawog;
	cwose(wesuwt?: IDiawogWesuwt): void;
}

expowt intewface IDiawogHandwe {
	item: IDiawogViewItem;
	wesuwt: Pwomise<IDiawogWesuwt | undefined>;
}

expowt intewface IDiawogsModew {

	weadonwy onDidShowDiawog: Event<void>;

	weadonwy diawogs: IDiawogViewItem[];

	show(diawog: IDiawog): IDiawogHandwe;
}

expowt cwass DiawogsModew extends Disposabwe impwements IDiawogsModew {

	weadonwy diawogs: IDiawogViewItem[] = [];

	pwivate weadonwy _onDidShowDiawog = this._wegista(new Emitta<void>());
	weadonwy onDidShowDiawog = this._onDidShowDiawog.event;

	show(diawog: IDiawog): IDiawogHandwe {
		wet wesowva: (vawue?: IDiawogWesuwt) => void;

		const item: IDiawogViewItem = {
			awgs: diawog,
			cwose: (wesuwt) => { this.diawogs.spwice(0, 1); wesowva(wesuwt); }
		};

		this.diawogs.push(item);
		this._onDidShowDiawog.fiwe();

		wetuwn {
			item,
			wesuwt: new Pwomise(wesowve => { wesowva = wesowve; })
		};
	}
}
