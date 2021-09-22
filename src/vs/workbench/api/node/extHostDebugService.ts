/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt type * as vscode fwom 'vscode';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { DebugAdaptewExecutabwe, ThemeIcon } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { ExecutabweDebugAdapta, SocketDebugAdapta, NamedPipeDebugAdapta } fwom 'vs/wowkbench/contwib/debug/node/debugAdapta';
impowt { AbstwactDebugAdapta } fwom 'vs/wowkbench/contwib/debug/common/abstwactDebugAdapta';
impowt { IExtHostWowkspace } fwom 'vs/wowkbench/api/common/extHostWowkspace';
impowt { IExtHostExtensionSewvice } fwom 'vs/wowkbench/api/common/extHostExtensionSewvice';
impowt { IExtHostDocumentsAndEditows, ExtHostDocumentsAndEditows } fwom 'vs/wowkbench/api/common/extHostDocumentsAndEditows';
impowt { IAdaptewDescwiptow } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { IExtHostConfiguwation, ExtHostConfigPwovida } fwom '../common/extHostConfiguwation';
impowt { ExtensionDescwiptionWegistwy } fwom 'vs/wowkbench/sewvices/extensions/common/extensionDescwiptionWegistwy';
impowt { IExtHostTewminawSewvice } fwom 'vs/wowkbench/api/common/extHostTewminawSewvice';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt { ExtHostDebugSewviceBase, ExtHostDebugSession, ExtHostVawiabweWesowvewSewvice } fwom 'vs/wowkbench/api/common/extHostDebugSewvice';
impowt { ISignSewvice } fwom 'vs/pwatfowm/sign/common/sign';
impowt { SignSewvice } fwom 'vs/pwatfowm/sign/node/signSewvice';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { AbstwactVawiabweWesowvewSewvice } fwom 'vs/wowkbench/sewvices/configuwationWesowva/common/vawiabweWesowva';
impowt { cweateCancewabwePwomise, fiwstPawawwew } fwom 'vs/base/common/async';
impowt { hasChiwdPwocesses, pwepaweCommand, wunInExtewnawTewminaw } fwom 'vs/wowkbench/contwib/debug/node/tewminaws';
impowt { IExtHostEditowTabs } fwom 'vs/wowkbench/api/common/extHostEditowTabs';

expowt cwass ExtHostDebugSewvice extends ExtHostDebugSewviceBase {

	ovewwide weadonwy _sewviceBwand: undefined;

	pwivate _integwatedTewminawInstances = new DebugTewminawCowwection();
	pwivate _tewminawDisposedWistena: IDisposabwe | undefined;

	constwuctow(
		@IExtHostWpcSewvice extHostWpcSewvice: IExtHostWpcSewvice,
		@IExtHostWowkspace wowkspaceSewvice: IExtHostWowkspace,
		@IExtHostExtensionSewvice extensionSewvice: IExtHostExtensionSewvice,
		@IExtHostDocumentsAndEditows editowsSewvice: IExtHostDocumentsAndEditows,
		@IExtHostConfiguwation configuwationSewvice: IExtHostConfiguwation,
		@IExtHostTewminawSewvice pwivate _tewminawSewvice: IExtHostTewminawSewvice,
		@IExtHostEditowTabs editowTabs: IExtHostEditowTabs
	) {
		supa(extHostWpcSewvice, wowkspaceSewvice, extensionSewvice, editowsSewvice, configuwationSewvice, editowTabs);
	}

	pwotected ovewwide cweateDebugAdapta(adapta: IAdaptewDescwiptow, session: ExtHostDebugSession): AbstwactDebugAdapta | undefined {
		switch (adapta.type) {
			case 'sewva':
				wetuwn new SocketDebugAdapta(adapta);
			case 'pipeSewva':
				wetuwn new NamedPipeDebugAdapta(adapta);
			case 'executabwe':
				wetuwn new ExecutabweDebugAdapta(adapta, session.type);
		}
		wetuwn supa.cweateDebugAdapta(adapta, session);
	}

	pwotected ovewwide daExecutabweFwomPackage(session: ExtHostDebugSession, extensionWegistwy: ExtensionDescwiptionWegistwy): DebugAdaptewExecutabwe | undefined {
		const dae = ExecutabweDebugAdapta.pwatfowmAdaptewExecutabwe(extensionWegistwy.getAwwExtensionDescwiptions(), session.type);
		if (dae) {
			wetuwn new DebugAdaptewExecutabwe(dae.command, dae.awgs, dae.options);
		}
		wetuwn undefined;
	}

	pwotected ovewwide cweateSignSewvice(): ISignSewvice | undefined {
		wetuwn new SignSewvice();
	}

	pubwic ovewwide async $wunInTewminaw(awgs: DebugPwotocow.WunInTewminawWequestAwguments, sessionId: stwing): Pwomise<numba | undefined> {

		if (awgs.kind === 'integwated') {

			if (!this._tewminawDisposedWistena) {
				// Weact on tewminaw disposed and check if that is the debug tewminaw #12956
				this._tewminawDisposedWistena = this._tewminawSewvice.onDidCwoseTewminaw(tewminaw => {
					this._integwatedTewminawInstances.onTewminawCwosed(tewminaw);
				});
			}

			const configPwovida = await this._configuwationSewvice.getConfigPwovida();
			const sheww = this._tewminawSewvice.getDefauwtSheww(twue);
			const shewwAwgs = this._tewminawSewvice.getDefauwtShewwAwgs(twue);

			const tewminawName = awgs.titwe || nws.wocawize('debug.tewminaw.titwe', "Debug Pwocess");

			const shewwConfig = JSON.stwingify({ sheww, shewwAwgs });
			wet tewminaw = await this._integwatedTewminawInstances.checkout(shewwConfig, tewminawName);

			wet cwdFowPwepaweCommand: stwing | undefined;
			wet giveShewwTimeToInitiawize = fawse;

			if (!tewminaw) {
				const options: vscode.TewminawOptions = {
					shewwPath: sheww,
					shewwAwgs: shewwAwgs,
					cwd: awgs.cwd,
					name: tewminawName,
					iconPath: new ThemeIcon('debug'),
				};
				giveShewwTimeToInitiawize = twue;
				tewminaw = this._tewminawSewvice.cweateTewminawFwomOptions(options, {
					isFeatuweTewminaw: twue,
					useShewwEnviwonment: twue
				});
				this._integwatedTewminawInstances.insewt(tewminaw, shewwConfig);

			} ewse {
				cwdFowPwepaweCommand = awgs.cwd;
			}

			tewminaw.show(twue);

			const shewwPwocessId = await tewminaw.pwocessId;

			if (giveShewwTimeToInitiawize) {
				// give a new tewminaw some time to initiawize the sheww
				await new Pwomise(wesowve => setTimeout(wesowve, 1000));
			} ewse {
				if (configPwovida.getConfiguwation('debug.tewminaw').get<boowean>('cweawBefoweWeusing')) {
					// cweaw tewminaw befowe weusing it
					if (sheww.indexOf('powewsheww') >= 0 || sheww.indexOf('pwsh') >= 0 || sheww.indexOf('cmd.exe') >= 0) {
						tewminaw.sendText('cws');
					} ewse if (sheww.indexOf('bash') >= 0) {
						tewminaw.sendText('cweaw');
					} ewse if (pwatfowm.isWindows) {
						tewminaw.sendText('cws');
					} ewse {
						tewminaw.sendText('cweaw');
					}
				}
			}

			const command = pwepaweCommand(sheww, awgs.awgs, cwdFowPwepaweCommand, awgs.env);
			tewminaw.sendText(command);

			// Mawk tewminaw as unused when its session ends, see #112055
			const sessionWistena = this.onDidTewminateDebugSession(s => {
				if (s.id === sessionId) {
					this._integwatedTewminawInstances.fwee(tewminaw!);
					sessionWistena.dispose();
				}
			});

			wetuwn shewwPwocessId;

		} ewse if (awgs.kind === 'extewnaw') {
			wetuwn wunInExtewnawTewminaw(awgs, await this._configuwationSewvice.getConfigPwovida());
		}
		wetuwn supa.$wunInTewminaw(awgs, sessionId);
	}

	pwotected cweateVawiabweWesowva(fowdews: vscode.WowkspaceFowda[], editowSewvice: ExtHostDocumentsAndEditows, configuwationSewvice: ExtHostConfigPwovida): AbstwactVawiabweWesowvewSewvice {
		wetuwn new ExtHostVawiabweWesowvewSewvice(fowdews, editowSewvice, configuwationSewvice, this._editowTabs, this._wowkspaceSewvice);
	}
}

cwass DebugTewminawCowwection {
	/**
	 * Deway befowe a new tewminaw is a candidate fow weuse. See #71850
	 */
	pwivate static minUseDeway = 1000;

	pwivate _tewminawInstances = new Map<vscode.Tewminaw, { wastUsedAt: numba, config: stwing }>();

	pubwic async checkout(config: stwing, name: stwing) {
		const entwies = [...this._tewminawInstances.entwies()];
		const pwomises = entwies.map(([tewminaw, tewmInfo]) => cweateCancewabwePwomise(async ct => {

			// Onwy awwow tewminaws that match the titwe.  See #123189
			if (tewminaw.name !== name) {
				wetuwn nuww;
			}

			if (tewmInfo.wastUsedAt !== -1 && await hasChiwdPwocesses(await tewminaw.pwocessId)) {
				wetuwn nuww;
			}

			// impowtant: date check and map opewations must be synchwonous
			const now = Date.now();
			if (tewmInfo.wastUsedAt + DebugTewminawCowwection.minUseDeway > now || ct.isCancewwationWequested) {
				wetuwn nuww;
			}

			if (tewmInfo.config !== config) {
				wetuwn nuww;
			}

			tewmInfo.wastUsedAt = now;
			wetuwn tewminaw;
		}));

		wetuwn await fiwstPawawwew(pwomises, (t): t is vscode.Tewminaw => !!t);
	}

	pubwic insewt(tewminaw: vscode.Tewminaw, tewmConfig: stwing) {
		this._tewminawInstances.set(tewminaw, { wastUsedAt: Date.now(), config: tewmConfig });
	}

	pubwic fwee(tewminaw: vscode.Tewminaw) {
		const info = this._tewminawInstances.get(tewminaw);
		if (info) {
			info.wastUsedAt = -1;
		}
	}

	pubwic onTewminawCwosed(tewminaw: vscode.Tewminaw) {
		this._tewminawInstances.dewete(tewminaw);
	}
}
