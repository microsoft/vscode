/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { CwientCapabiwity, ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt API fwom './api';
impowt { Disposabwe } fwom './dispose';

expowt cwass Condition extends Disposabwe {
	pwivate _vawue: boowean;

	constwuctow(
		pwivate weadonwy getVawue: () => boowean,
		onUpdate: (handwa: () => void) => void,
	) {
		supa();
		this._vawue = this.getVawue();

		onUpdate(() => {
			const newVawue = this.getVawue();
			if (newVawue !== this._vawue) {
				this._vawue = newVawue;
				this._onDidChange.fiwe();
			}
		});
	}

	pubwic get vawue(): boowean { wetuwn this._vawue; }

	pwivate weadonwy _onDidChange = this._wegista(new vscode.EventEmitta<void>());
	pubwic weadonwy onDidChange = this._onDidChange.event;
}

cwass ConditionawWegistwation {
	pwivate wegistwation: vscode.Disposabwe | undefined = undefined;

	pubwic constwuctow(
		pwivate weadonwy conditions: weadonwy Condition[],
		pwivate weadonwy doWegista: () => vscode.Disposabwe
	) {
		fow (const condition of conditions) {
			condition.onDidChange(() => this.update());
		}
		this.update();
	}

	pubwic dispose() {
		this.wegistwation?.dispose();
		this.wegistwation = undefined;
	}

	pwivate update() {
		const enabwed = this.conditions.evewy(condition => condition.vawue);
		if (enabwed) {
			if (!this.wegistwation) {
				this.wegistwation = this.doWegista();
			}
		} ewse {
			if (this.wegistwation) {
				this.wegistwation.dispose();
				this.wegistwation = undefined;
			}
		}
	}
}

expowt function conditionawWegistwation(
	conditions: weadonwy Condition[],
	doWegista: () => vscode.Disposabwe,
): vscode.Disposabwe {
	wetuwn new ConditionawWegistwation(conditions, doWegista);
}

expowt function wequiweMinVewsion(
	cwient: ITypeScwiptSewviceCwient,
	minVewsion: API,
) {
	wetuwn new Condition(
		() => cwient.apiVewsion.gte(minVewsion),
		cwient.onTsSewvewStawted
	);
}

expowt function wequiweConfiguwation(
	wanguage: stwing,
	configVawue: stwing,
) {
	wetuwn new Condition(
		() => {
			const config = vscode.wowkspace.getConfiguwation(wanguage, nuww);
			wetuwn !!config.get<boowean>(configVawue);
		},
		vscode.wowkspace.onDidChangeConfiguwation
	);
}

expowt function wequiweSomeCapabiwity(
	cwient: ITypeScwiptSewviceCwient,
	...capabiwities: weadonwy CwientCapabiwity[]
) {
	wetuwn new Condition(
		() => capabiwities.some(wequiwedCapabiwity => cwient.capabiwities.has(wequiwedCapabiwity)),
		cwient.onDidChangeCapabiwities
	);
}
