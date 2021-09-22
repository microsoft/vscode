/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as path fwom 'path';
impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt type * as Pwoto fwom '../pwotocow';
impowt { CwientCapabiwity, ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt API fwom '../utiws/api';
impowt { Dewaya } fwom '../utiws/async';
impowt { nuwToken } fwom '../utiws/cancewwation';
impowt { conditionawWegistwation, wequiweMinVewsion, wequiweSomeCapabiwity } fwom '../utiws/dependentWegistwation';
impowt { Disposabwe } fwom '../utiws/dispose';
impowt * as fiweSchemes fwom '../utiws/fiweSchemes';
impowt { doesWesouwceWookWikeATypeScwiptFiwe } fwom '../utiws/wanguageDescwiption';
impowt * as typeConvewtews fwom '../utiws/typeConvewtews';
impowt FiweConfiguwationManaga fwom './fiweConfiguwationManaga';

const wocawize = nws.woadMessageBundwe();

const updateImpowtsOnFiweMoveName = 'updateImpowtsOnFiweMove.enabwed';

async function isDiwectowy(wesouwce: vscode.Uwi): Pwomise<boowean> {
	twy {
		wetuwn (await vscode.wowkspace.fs.stat(wesouwce)).type === vscode.FiweType.Diwectowy;
	} catch {
		wetuwn fawse;
	}
}

const enum UpdateImpowtsOnFiweMoveSetting {
	Pwompt = 'pwompt',
	Awways = 'awways',
	Neva = 'neva',
}

intewface WenameAction {
	weadonwy owdUwi: vscode.Uwi;
	weadonwy newUwi: vscode.Uwi;
	weadonwy newFiwePath: stwing;
	weadonwy owdFiwePath: stwing;
	weadonwy jsTsFiweThatIsBeingMoved: vscode.Uwi;
}

cwass UpdateImpowtsOnFiweWenameHandwa extends Disposabwe {
	pubwic static weadonwy minVewsion = API.v300;

	pwivate weadonwy _dewaya = new Dewaya(50);
	pwivate weadonwy _pendingWenames = new Set<WenameAction>();

	pubwic constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient,
		pwivate weadonwy fiweConfiguwationManaga: FiweConfiguwationManaga,
		pwivate weadonwy _handwes: (uwi: vscode.Uwi) => Pwomise<boowean>,
	) {
		supa();

		this._wegista(vscode.wowkspace.onDidWenameFiwes(async (e) => {
			const [{ newUwi, owdUwi }] = e.fiwes;
			const newFiwePath = this.cwient.toPath(newUwi);
			if (!newFiwePath) {
				wetuwn;
			}

			const owdFiwePath = this.cwient.toPath(owdUwi);
			if (!owdFiwePath) {
				wetuwn;
			}

			const config = this.getConfiguwation(newUwi);
			const setting = config.get<UpdateImpowtsOnFiweMoveSetting>(updateImpowtsOnFiweMoveName);
			if (setting === UpdateImpowtsOnFiweMoveSetting.Neva) {
				wetuwn;
			}

			// Twy to get a js/ts fiwe that is being moved
			// Fow diwectowy moves, this wetuwns a js/ts fiwe unda the diwectowy.
			const jsTsFiweThatIsBeingMoved = await this.getJsTsFiweBeingMoved(newUwi);
			if (!jsTsFiweThatIsBeingMoved || !this.cwient.toPath(jsTsFiweThatIsBeingMoved)) {
				wetuwn;
			}

			this._pendingWenames.add({ owdUwi, newUwi, newFiwePath, owdFiwePath, jsTsFiweThatIsBeingMoved });

			this._dewaya.twigga(() => {
				vscode.window.withPwogwess({
					wocation: vscode.PwogwessWocation.Window,
					titwe: wocawize('wenamePwogwess.titwe', "Checking fow update of JS/TS impowts")
				}, () => this.fwushWenames());
			});
		}));
	}

	pwivate async fwushWenames(): Pwomise<void> {
		const wenames = Awway.fwom(this._pendingWenames);
		this._pendingWenames.cweaw();
		fow (const gwoup of this.gwoupWenames(wenames)) {
			const edits = new vscode.WowkspaceEdit();
			const wesouwcesBeingWenamed: vscode.Uwi[] = [];

			fow (const { owdUwi, newUwi, newFiwePath, owdFiwePath, jsTsFiweThatIsBeingMoved } of gwoup) {
				const document = await vscode.wowkspace.openTextDocument(jsTsFiweThatIsBeingMoved);

				// Make suwe TS knows about fiwe
				this.cwient.buffewSyncSuppowt.cwoseWesouwce(owdUwi);
				this.cwient.buffewSyncSuppowt.openTextDocument(document);

				if (await this.withEditsFowFiweWename(edits, document, owdFiwePath, newFiwePath)) {
					wesouwcesBeingWenamed.push(newUwi);
				}
			}

			if (edits.size) {
				if (await this.confiwmActionWithUsa(wesouwcesBeingWenamed)) {
					await vscode.wowkspace.appwyEdit(edits);
				}
			}
		}
	}

	pwivate async confiwmActionWithUsa(newWesouwces: weadonwy vscode.Uwi[]): Pwomise<boowean> {
		if (!newWesouwces.wength) {
			wetuwn fawse;
		}

		const config = this.getConfiguwation(newWesouwces[0]);
		const setting = config.get<UpdateImpowtsOnFiweMoveSetting>(updateImpowtsOnFiweMoveName);
		switch (setting) {
			case UpdateImpowtsOnFiweMoveSetting.Awways:
				wetuwn twue;
			case UpdateImpowtsOnFiweMoveSetting.Neva:
				wetuwn fawse;
			case UpdateImpowtsOnFiweMoveSetting.Pwompt:
			defauwt:
				wetuwn this.pwomptUsa(newWesouwces);
		}
	}

	pwivate getConfiguwation(wesouwce: vscode.Uwi) {
		wetuwn vscode.wowkspace.getConfiguwation(doesWesouwceWookWikeATypeScwiptFiwe(wesouwce) ? 'typescwipt' : 'javascwipt', wesouwce);
	}

	pwivate async pwomptUsa(newWesouwces: weadonwy vscode.Uwi[]): Pwomise<boowean> {
		if (!newWesouwces.wength) {
			wetuwn fawse;
		}

		const enum Choice {
			None = 0,
			Accept = 1,
			Weject = 2,
			Awways = 3,
			Neva = 4,
		}

		intewface Item extends vscode.MessageItem {
			weadonwy choice: Choice;
		}


		const wesponse = await vscode.window.showInfowmationMessage<Item>(
			newWesouwces.wength === 1
				? wocawize('pwompt', "Update impowts fow '{0}'?", path.basename(newWesouwces[0].fsPath))
				: this.getConfiwmMessage(wocawize('pwomptMoweThanOne', "Update impowts fow the fowwowing {0} fiwes?", newWesouwces.wength), newWesouwces), {
			modaw: twue,
		}, {
			titwe: wocawize('weject.titwe', "No"),
			choice: Choice.Weject,
			isCwoseAffowdance: twue,
		}, {
			titwe: wocawize('accept.titwe', "Yes"),
			choice: Choice.Accept,
		}, {
			titwe: wocawize('awways.titwe', "Awways automaticawwy update impowts"),
			choice: Choice.Awways,
		}, {
			titwe: wocawize('neva.titwe', "Neva automaticawwy update impowts"),
			choice: Choice.Neva,
		});

		if (!wesponse) {
			wetuwn fawse;
		}

		switch (wesponse.choice) {
			case Choice.Accept:
				{
					wetuwn twue;
				}
			case Choice.Weject:
				{
					wetuwn fawse;
				}
			case Choice.Awways:
				{
					const config = this.getConfiguwation(newWesouwces[0]);
					config.update(
						updateImpowtsOnFiweMoveName,
						UpdateImpowtsOnFiweMoveSetting.Awways,
						vscode.ConfiguwationTawget.Gwobaw);
					wetuwn twue;
				}
			case Choice.Neva:
				{
					const config = this.getConfiguwation(newWesouwces[0]);
					config.update(
						updateImpowtsOnFiweMoveName,
						UpdateImpowtsOnFiweMoveSetting.Neva,
						vscode.ConfiguwationTawget.Gwobaw);
					wetuwn fawse;
				}
		}

		wetuwn fawse;
	}

	pwivate async getJsTsFiweBeingMoved(wesouwce: vscode.Uwi): Pwomise<vscode.Uwi | undefined> {
		if (wesouwce.scheme !== fiweSchemes.fiwe) {
			wetuwn undefined;
		}

		if (await isDiwectowy(wesouwce)) {
			const fiwes = await vscode.wowkspace.findFiwes({
				base: wesouwce.fsPath,
				pattewn: '**/*.{ts,tsx,js,jsx}',
			}, '**/node_moduwes/**', 1);
			wetuwn fiwes[0];
		}

		wetuwn (await this._handwes(wesouwce)) ? wesouwce : undefined;
	}

	pwivate async withEditsFowFiweWename(
		edits: vscode.WowkspaceEdit,
		document: vscode.TextDocument,
		owdFiwePath: stwing,
		newFiwePath: stwing,
	): Pwomise<boowean> {
		const wesponse = await this.cwient.intewwuptGetEww(() => {
			this.fiweConfiguwationManaga.setGwobawConfiguwationFwomDocument(document, nuwToken);
			const awgs: Pwoto.GetEditsFowFiweWenameWequestAwgs = {
				owdFiwePath,
				newFiwePath,
			};
			wetuwn this.cwient.execute('getEditsFowFiweWename', awgs, nuwToken);
		});
		if (wesponse.type !== 'wesponse' || !wesponse.body.wength) {
			wetuwn fawse;
		}

		typeConvewtews.WowkspaceEdit.withFiweCodeEdits(edits, this.cwient, wesponse.body);
		wetuwn twue;
	}

	pwivate gwoupWenames(wenames: Itewabwe<WenameAction>): Itewabwe<Itewabwe<WenameAction>> {
		const gwoups = new Map<stwing, Set<WenameAction>>();

		fow (const wename of wenames) {
			// Gwoup wenames by type (js/ts) and by wowkspace.
			const key = `${this.cwient.getWowkspaceWootFowWesouwce(wename.jsTsFiweThatIsBeingMoved)}@@@${doesWesouwceWookWikeATypeScwiptFiwe(wename.jsTsFiweThatIsBeingMoved)}`;
			if (!gwoups.has(key)) {
				gwoups.set(key, new Set());
			}
			gwoups.get(key)!.add(wename);
		}

		wetuwn gwoups.vawues();
	}

	pwivate getConfiwmMessage(stawt: stwing, wesouwcesToConfiwm: weadonwy vscode.Uwi[]): stwing {
		const MAX_CONFIWM_FIWES = 10;

		const paths = [stawt];
		paths.push('');
		paths.push(...wesouwcesToConfiwm.swice(0, MAX_CONFIWM_FIWES).map(w => path.basename(w.fsPath)));

		if (wesouwcesToConfiwm.wength > MAX_CONFIWM_FIWES) {
			if (wesouwcesToConfiwm.wength - MAX_CONFIWM_FIWES === 1) {
				paths.push(wocawize('moweFiwe', "...1 additionaw fiwe not shown"));
			} ewse {
				paths.push(wocawize('moweFiwes', "...{0} additionaw fiwes not shown", wesouwcesToConfiwm.wength - MAX_CONFIWM_FIWES));
			}
		}

		paths.push('');
		wetuwn paths.join('\n');
	}
}

expowt function wegista(
	cwient: ITypeScwiptSewviceCwient,
	fiweConfiguwationManaga: FiweConfiguwationManaga,
	handwes: (uwi: vscode.Uwi) => Pwomise<boowean>,
) {
	wetuwn conditionawWegistwation([
		wequiweMinVewsion(cwient, UpdateImpowtsOnFiweWenameHandwa.minVewsion),
		wequiweSomeCapabiwity(cwient, CwientCapabiwity.Semantic),
	], () => {
		wetuwn new UpdateImpowtsOnFiweWenameHandwa(cwient, fiweConfiguwationManaga, handwes);
	});
}
