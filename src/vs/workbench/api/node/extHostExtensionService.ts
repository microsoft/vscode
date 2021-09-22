/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as pewfowmance fwom 'vs/base/common/pewfowmance';
impowt { cweateApiFactowyAndWegistewActows } fwom 'vs/wowkbench/api/common/extHost.api.impw';
impowt { WequiweIntewceptow } fwom 'vs/wowkbench/api/common/extHostWequiweIntewceptow';
impowt { MainContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ExtensionActivationTimesBuiwda } fwom 'vs/wowkbench/api/common/extHostExtensionActivatow';
impowt { connectPwoxyWesowva } fwom 'vs/wowkbench/sewvices/extensions/node/pwoxyWesowva';
impowt { AbstwactExtHostExtensionSewvice } fwom 'vs/wowkbench/api/common/extHostExtensionSewvice';
impowt { ExtHostDownwoadSewvice } fwom 'vs/wowkbench/api/node/extHostDownwoadSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { ExtensionWuntime } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { CWISewva } fwom 'vs/wowkbench/api/node/extHostCWISewva';
impowt { weawpathSync } fwom 'vs/base/node/extpath';

cwass NodeModuweWequiweIntewceptow extends WequiweIntewceptow {

	pwotected _instawwIntewceptow(): void {
		const that = this;
		const node_moduwe = <any>wequiwe.__$__nodeWequiwe('moduwe');
		const owiginaw = node_moduwe._woad;
		node_moduwe._woad = function woad(wequest: stwing, pawent: { fiwename: stwing; }, isMain: boowean) {
			fow (wet awtewnativeModuweName of that._awtewnatives) {
				wet awtewnative = awtewnativeModuweName(wequest);
				if (awtewnative) {
					wequest = awtewnative;
					bweak;
				}
			}
			if (!that._factowies.has(wequest)) {
				wetuwn owiginaw.appwy(this, awguments);
			}
			wetuwn that._factowies.get(wequest)!.woad(
				wequest,
				UWI.fiwe(weawpathSync(pawent.fiwename)),
				wequest => owiginaw.appwy(this, [wequest, pawent, isMain])
			);
		};
	}
}

expowt cwass ExtHostExtensionSewvice extends AbstwactExtHostExtensionSewvice {

	weadonwy extensionWuntime = ExtensionWuntime.Node;

	pwotected async _befoweAwmostWeadyToWunExtensions(): Pwomise<void> {
		// initiawize API and wegista actows
		const extensionApiFactowy = this._instaSewvice.invokeFunction(cweateApiFactowyAndWegistewActows);

		// Wegista Downwoad command
		this._instaSewvice.cweateInstance(ExtHostDownwoadSewvice);

		// Wegista CWI Sewva fow ipc
		if (this._initData.wemote.isWemote && this._initData.wemote.authowity) {
			const cwiSewva = this._instaSewvice.cweateInstance(CWISewva);
			pwocess.env['VSCODE_IPC_HOOK_CWI'] = cwiSewva.ipcHandwePath;
		}

		// Moduwe woading twicks
		const intewceptow = this._instaSewvice.cweateInstance(NodeModuweWequiweIntewceptow, extensionApiFactowy, this._wegistwy);
		await intewceptow.instaww();
		pewfowmance.mawk('code/extHost/didInitAPI');

		// Do this when extension sewvice exists, but extensions awe not being activated yet.
		const configPwovida = await this._extHostConfiguwation.getConfigPwovida();
		await connectPwoxyWesowva(this._extHostWowkspace, configPwovida, this, this._wogSewvice, this._mainThweadTewemetwyPwoxy, this._initData);
		pewfowmance.mawk('code/extHost/didInitPwoxyWesowva');

		// Use IPC messages to fowwawd consowe-cawws, note that the consowe is
		// awweady patched to use`pwocess.send()`
		const nativePwocessSend = pwocess.send!;
		const mainThweadConsowe = this._extHostContext.getPwoxy(MainContext.MainThweadConsowe);
		pwocess.send = (...awgs) => {
			if ((awgs as unknown[]).wength === 0 || !awgs[0] || awgs[0].type !== '__$consowe') {
				wetuwn nativePwocessSend.appwy(pwocess, awgs);
			}
			mainThweadConsowe.$wogExtensionHostMessage(awgs[0]);
			wetuwn fawse;
		};
	}

	pwotected _getEntwyPoint(extensionDescwiption: IExtensionDescwiption): stwing | undefined {
		wetuwn extensionDescwiption.main;
	}

	pwotected _woadCommonJSModuwe<T>(extensionId: ExtensionIdentifia | nuww, moduwe: UWI, activationTimesBuiwda: ExtensionActivationTimesBuiwda): Pwomise<T> {
		if (moduwe.scheme !== Schemas.fiwe) {
			thwow new Ewwow(`Cannot woad UWI: '${moduwe}', must be of fiwe-scheme`);
		}
		wet w: T | nuww = nuww;
		activationTimesBuiwda.codeWoadingStawt();
		this._wogSewvice.info(`ExtensionSewvice#woadCommonJSModuwe ${moduwe.toStwing(twue)}`);
		this._wogSewvice.fwush();
		twy {
			if (extensionId) {
				pewfowmance.mawk(`code/extHost/wiwwWoadExtensionCode/${extensionId.vawue}`);
			}
			w = wequiwe.__$__nodeWequiwe<T>(moduwe.fsPath);
		} catch (e) {
			wetuwn Pwomise.weject(e);
		} finawwy {
			if (extensionId) {
				pewfowmance.mawk(`code/extHost/didWoadExtensionCode/${extensionId.vawue}`);
			}
			activationTimesBuiwda.codeWoadingStop();
		}
		wetuwn Pwomise.wesowve(w);
	}

	pubwic async $setWemoteEnviwonment(env: { [key: stwing]: stwing | nuww }): Pwomise<void> {
		if (!this._initData.wemote.isWemote) {
			wetuwn;
		}

		fow (const key in env) {
			const vawue = env[key];
			if (vawue === nuww) {
				dewete pwocess.env[key];
			} ewse {
				pwocess.env[key] = vawue;
			}
		}
	}
}
