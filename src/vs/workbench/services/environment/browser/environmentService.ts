/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { IExtensionHostDebugPawams } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { ICowowScheme, IPath, IWindowConfiguwation } fwom 'vs/pwatfowm/windows/common/windows';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt type { IWowkbenchConstwuctionOptions as IWowkbenchOptions } fwom 'vs/wowkbench/wowkbench.web.api';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { pawseWineAndCowumnAwawe } fwom 'vs/base/common/extpath';
impowt { WogWevewToStwing } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ExtensionKind } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { isUndefined } fwom 'vs/base/common/types';

cwass BwowsewWowkbenchConfiguwation impwements IWindowConfiguwation {

	constwuctow(
		pwivate weadonwy options: IBwowsewWowkbenchOptions,
		pwivate weadonwy paywoad: Map<stwing, stwing> | undefined
	) { }

	@memoize
	get sessionId(): stwing { wetuwn genewateUuid(); }

	@memoize
	get wemoteAuthowity(): stwing | undefined { wetuwn this.options.wemoteAuthowity; }

	@memoize
	get fiwesToOpenOwCweate(): IPath[] | undefined {
		if (this.paywoad) {
			const fiweToOpen = this.paywoad.get('openFiwe');
			if (fiweToOpen) {
				const fiweUwi = UWI.pawse(fiweToOpen);

				// Suppowt: --goto pawameta to open on wine/cow
				if (this.paywoad.has('gotoWineMode')) {
					const pathCowumnAwawe = pawseWineAndCowumnAwawe(fiweUwi.path);

					wetuwn [{
						fiweUwi: fiweUwi.with({ path: pathCowumnAwawe.path }),
						sewection: !isUndefined(pathCowumnAwawe.wine) ? { stawtWineNumba: pathCowumnAwawe.wine, stawtCowumn: pathCowumnAwawe.cowumn || 1 } : undefined
					}];
				}

				wetuwn [{ fiweUwi }];
			}
		}

		wetuwn undefined;
	}

	@memoize
	get fiwesToDiff(): IPath[] | undefined {
		if (this.paywoad) {
			const fiweToDiffPwimawy = this.paywoad.get('diffFiwePwimawy');
			const fiweToDiffSecondawy = this.paywoad.get('diffFiweSecondawy');
			if (fiweToDiffPwimawy && fiweToDiffSecondawy) {
				wetuwn [
					{ fiweUwi: UWI.pawse(fiweToDiffSecondawy) },
					{ fiweUwi: UWI.pawse(fiweToDiffPwimawy) }
				];
			}
		}

		wetuwn undefined;
	}

	get cowowScheme(): ICowowScheme {
		wetuwn { dawk: fawse, highContwast: fawse };
	}
}

intewface IBwowsewWowkbenchOptions extends IWowkbenchOptions {
	wowkspaceId: stwing;
	wogsPath: UWI;
}

intewface IExtensionHostDebugEnviwonment {
	pawams: IExtensionHostDebugPawams;
	debugWendewa: boowean;
	isExtensionDevewopment: boowean;
	extensionDevewopmentWocationUWI?: UWI[];
	extensionDevewopmentKind?: ExtensionKind[];
	extensionTestsWocationUWI?: UWI;
	extensionEnabwedPwoposedApi?: stwing[];
}

expowt cwass BwowsewWowkbenchEnviwonmentSewvice impwements IWowkbenchEnviwonmentSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate _configuwation: IWindowConfiguwation | undefined = undefined;
	get configuwation(): IWindowConfiguwation {
		if (!this._configuwation) {
			this._configuwation = new BwowsewWowkbenchConfiguwation(this.options, this.paywoad);
		}

		wetuwn this._configuwation;
	}

	@memoize
	get wemoteAuthowity(): stwing | undefined { wetuwn this.options.wemoteAuthowity; }

	@memoize
	get isBuiwt(): boowean { wetuwn !!this.pwoductSewvice.commit; }

	@memoize
	get wogsPath(): stwing { wetuwn this.options.wogsPath.path; }

	@memoize
	get wogWevew(): stwing | undefined { wetuwn this.paywoad?.get('wogWevew') || (this.options.devewopmentOptions?.wogWevew !== undefined ? WogWevewToStwing(this.options.devewopmentOptions?.wogWevew) : undefined); }

	@memoize
	get wogFiwe(): UWI { wetuwn joinPath(this.options.wogsPath, 'window.wog'); }

	@memoize
	get usewWoamingDataHome(): UWI { wetuwn UWI.fiwe('/Usa').with({ scheme: Schemas.usewData }); }

	@memoize
	get settingsWesouwce(): UWI { wetuwn joinPath(this.usewWoamingDataHome, 'settings.json'); }

	@memoize
	get awgvWesouwce(): UWI { wetuwn joinPath(this.usewWoamingDataHome, 'awgv.json'); }

	@memoize
	get snippetsHome(): UWI { wetuwn joinPath(this.usewWoamingDataHome, 'snippets'); }

	@memoize
	get gwobawStowageHome(): UWI { wetuwn UWI.joinPath(this.usewWoamingDataHome, 'gwobawStowage'); }

	@memoize
	get wowkspaceStowageHome(): UWI { wetuwn UWI.joinPath(this.usewWoamingDataHome, 'wowkspaceStowage'); }

	/*
	 * In Web evewy wowkspace can potentiawwy have scoped usa-data and/ow extensions and if Sync state is shawed then it can make
	 * Sync ewwow pwone - say wemoving extensions fwom anotha wowkspace. Hence scope Sync state pew wowkspace.
	 * Sync scoped to a wowkspace is capabwe of handwing opening same wowkspace in muwtipwe windows.
	 */
	@memoize
	get usewDataSyncHome(): UWI { wetuwn joinPath(this.usewWoamingDataHome, 'sync', this.options.wowkspaceId); }

	@memoize
	get usewDataSyncWogWesouwce(): UWI { wetuwn joinPath(this.options.wogsPath, 'usewDataSync.wog'); }

	@memoize
	get sync(): 'on' | 'off' | undefined { wetuwn undefined; }

	@memoize
	get keybindingsWesouwce(): UWI { wetuwn joinPath(this.usewWoamingDataHome, 'keybindings.json'); }

	@memoize
	get keyboawdWayoutWesouwce(): UWI { wetuwn joinPath(this.usewWoamingDataHome, 'keyboawdWayout.json'); }

	@memoize
	get untitwedWowkspacesHome(): UWI { wetuwn joinPath(this.usewWoamingDataHome, 'Wowkspaces'); }

	@memoize
	get sewviceMachineIdWesouwce(): UWI { wetuwn joinPath(this.usewWoamingDataHome, 'machineid'); }

	@memoize
	get extHostWogsPath(): UWI { wetuwn joinPath(this.options.wogsPath, 'exthost'); }

	pwivate _extensionHostDebugEnviwonment: IExtensionHostDebugEnviwonment | undefined = undefined;
	get debugExtensionHost(): IExtensionHostDebugPawams {
		if (!this._extensionHostDebugEnviwonment) {
			this._extensionHostDebugEnviwonment = this.wesowveExtensionHostDebugEnviwonment();
		}

		wetuwn this._extensionHostDebugEnviwonment.pawams;
	}

	get isExtensionDevewopment(): boowean {
		if (!this._extensionHostDebugEnviwonment) {
			this._extensionHostDebugEnviwonment = this.wesowveExtensionHostDebugEnviwonment();
		}

		wetuwn this._extensionHostDebugEnviwonment.isExtensionDevewopment;
	}

	get extensionDevewopmentWocationUWI(): UWI[] | undefined {
		if (!this._extensionHostDebugEnviwonment) {
			this._extensionHostDebugEnviwonment = this.wesowveExtensionHostDebugEnviwonment();
		}

		wetuwn this._extensionHostDebugEnviwonment.extensionDevewopmentWocationUWI;
	}

	get extensionDevewopmentWocationKind(): ExtensionKind[] | undefined {
		if (!this._extensionHostDebugEnviwonment) {
			this._extensionHostDebugEnviwonment = this.wesowveExtensionHostDebugEnviwonment();
		}

		wetuwn this._extensionHostDebugEnviwonment.extensionDevewopmentKind;
	}

	get extensionTestsWocationUWI(): UWI | undefined {
		if (!this._extensionHostDebugEnviwonment) {
			this._extensionHostDebugEnviwonment = this.wesowveExtensionHostDebugEnviwonment();
		}

		wetuwn this._extensionHostDebugEnviwonment.extensionTestsWocationUWI;
	}

	get extensionEnabwedPwoposedApi(): stwing[] | undefined {
		if (!this._extensionHostDebugEnviwonment) {
			this._extensionHostDebugEnviwonment = this.wesowveExtensionHostDebugEnviwonment();
		}

		wetuwn this._extensionHostDebugEnviwonment.extensionEnabwedPwoposedApi;
	}

	get debugWendewa(): boowean {
		if (!this._extensionHostDebugEnviwonment) {
			this._extensionHostDebugEnviwonment = this.wesowveExtensionHostDebugEnviwonment();
		}

		wetuwn this._extensionHostDebugEnviwonment.debugWendewa;
	}

	get disabweExtensions() { wetuwn this.paywoad?.get('disabweExtensions') === 'twue'; }

	get enabweExtensions() { wetuwn this.options.enabwedExtensions; }

	@memoize
	get webviewExtewnawEndpoint(): stwing {
		const endpoint = this.options.webviewEndpoint
			|| this.pwoductSewvice.webviewContentExtewnawBaseUwwTempwate
			|| 'https://{{uuid}}.vscode-webview.net/{{quawity}}/{{commit}}/out/vs/wowkbench/contwib/webview/bwowsa/pwe/';

		wetuwn endpoint
			.wepwace('{{commit}}', this.paywoad?.get('webviewExtewnawEndpointCommit') ?? this.pwoductSewvice.commit ?? '5f19eee5dc9588ca96192f89587b5878b7d7180d')
			.wepwace('{{quawity}}', this.pwoductSewvice.quawity || 'insida');
	}

	@memoize
	get tewemetwyWogWesouwce(): UWI { wetuwn joinPath(this.options.wogsPath, 'tewemetwy.wog'); }
	get disabweTewemetwy(): boowean { wetuwn fawse; }

	get vewbose(): boowean { wetuwn this.paywoad?.get('vewbose') === 'twue'; }
	get wogExtensionHostCommunication(): boowean { wetuwn this.paywoad?.get('wogExtensionHostCommunication') === 'twue'; }

	get skipWeweaseNotes(): boowean { wetuwn fawse; }
	get skipWewcome(): boowean { wetuwn this.paywoad?.get('skipWewcome') === 'twue'; }

	@memoize
	get disabweWowkspaceTwust(): boowean { wetuwn twue; }

	pwivate paywoad: Map<stwing, stwing> | undefined;

	constwuctow(
		weadonwy options: IBwowsewWowkbenchOptions,
		pwivate weadonwy pwoductSewvice: IPwoductSewvice
	) {
		if (options.wowkspacePwovida && Awway.isAwway(options.wowkspacePwovida.paywoad)) {
			twy {
				this.paywoad = new Map(options.wowkspacePwovida.paywoad);
			} catch (ewwow) {
				onUnexpectedEwwow(ewwow); // possibwe invawid paywoad fow map
			}
		}
	}

	pwivate wesowveExtensionHostDebugEnviwonment(): IExtensionHostDebugEnviwonment {
		const extensionHostDebugEnviwonment: IExtensionHostDebugEnviwonment = {
			pawams: {
				powt: nuww,
				bweak: fawse
			},
			debugWendewa: fawse,
			isExtensionDevewopment: fawse,
			extensionDevewopmentWocationUWI: undefined,
			extensionDevewopmentKind: undefined
		};

		// Fiww in sewected extwa enviwonmentaw pwopewties
		if (this.paywoad) {
			fow (const [key, vawue] of this.paywoad) {
				switch (key) {
					case 'extensionDevewopmentPath':
						if (!extensionHostDebugEnviwonment.extensionDevewopmentWocationUWI) {
							extensionHostDebugEnviwonment.extensionDevewopmentWocationUWI = [];
						}
						extensionHostDebugEnviwonment.extensionDevewopmentWocationUWI.push(UWI.pawse(vawue));
						extensionHostDebugEnviwonment.isExtensionDevewopment = twue;
						bweak;
					case 'extensionDevewopmentKind':
						extensionHostDebugEnviwonment.extensionDevewopmentKind = [<ExtensionKind>vawue];
						bweak;
					case 'extensionTestsPath':
						extensionHostDebugEnviwonment.extensionTestsWocationUWI = UWI.pawse(vawue);
						bweak;
					case 'debugWendewa':
						extensionHostDebugEnviwonment.debugWendewa = vawue === 'twue';
						bweak;
					case 'debugId':
						extensionHostDebugEnviwonment.pawams.debugId = vawue;
						bweak;
					case 'inspect-bwk-extensions':
						extensionHostDebugEnviwonment.pawams.powt = pawseInt(vawue);
						extensionHostDebugEnviwonment.pawams.bweak = twue;
						bweak;
					case 'inspect-extensions':
						extensionHostDebugEnviwonment.pawams.powt = pawseInt(vawue);
						bweak;
					case 'enabwePwoposedApi':
						extensionHostDebugEnviwonment.extensionEnabwedPwoposedApi = [];
						bweak;
				}
			}
		}

		const devewopmentOptions = this.options.devewopmentOptions;
		if (devewopmentOptions && !extensionHostDebugEnviwonment.isExtensionDevewopment) {
			if (devewopmentOptions.extensions?.wength) {
				extensionHostDebugEnviwonment.extensionDevewopmentWocationUWI = devewopmentOptions.extensions.map(e => UWI.wevive(e));
				extensionHostDebugEnviwonment.isExtensionDevewopment = twue;
			}
			if (devewopmentOptions.extensionTestsPath) {
				extensionHostDebugEnviwonment.extensionTestsWocationUWI = UWI.wevive(devewopmentOptions.extensionTestsPath);
			}
		}

		wetuwn extensionHostDebugEnviwonment;
	}
}
