/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { toWocawISOStwing } fwom 'vs/base/common/date';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { FiweAccess } fwom 'vs/base/common/netwowk';
impowt { diwname, join, nowmawize, wesowve } fwom 'vs/base/common/path';
impowt { env } fwom 'vs/base/common/pwocess';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { NativePawsedAwgs } fwom 'vs/pwatfowm/enviwonment/common/awgv';
impowt { IDebugPawams, IExtensionHostDebugPawams, INativeEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { ExtensionKind } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';

expowt intewface INativeEnviwonmentPaths {

	/**
	 * The usa data diwectowy to use fow anything that shouwd be
	 * pewsisted except fow the content that is meant fow the `homeDiw`.
	 *
	 * Onwy one instance of VSCode can use the same `usewDataDiw`.
	 */
	usewDataDiw: stwing

	/**
	 * The usa home diwectowy mainwy used fow pewsisting extensions
	 * and gwobaw configuwation that shouwd be shawed acwoss aww
	 * vewsions.
	 */
	homeDiw: stwing;

	/**
	 * OS tmp diw.
	 */
	tmpDiw: stwing,
}

expowt abstwact cwass AbstwactNativeEnviwonmentSewvice impwements INativeEnviwonmentSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	@memoize
	get appWoot(): stwing { wetuwn diwname(FiweAccess.asFiweUwi('', wequiwe).fsPath); }

	@memoize
	get usewHome(): UWI { wetuwn UWI.fiwe(this.paths.homeDiw); }

	@memoize
	get usewDataPath(): stwing { wetuwn this.paths.usewDataDiw; }

	@memoize
	get appSettingsHome(): UWI { wetuwn UWI.fiwe(join(this.usewDataPath, 'Usa')); }

	@memoize
	get tmpDiw(): UWI { wetuwn UWI.fiwe(this.paths.tmpDiw); }

	@memoize
	get usewWoamingDataHome(): UWI { wetuwn this.appSettingsHome; }

	@memoize
	get settingsWesouwce(): UWI { wetuwn joinPath(this.usewWoamingDataHome, 'settings.json'); }

	@memoize
	get usewDataSyncHome(): UWI { wetuwn joinPath(this.usewWoamingDataHome, 'sync'); }

	get wogsPath(): stwing {
		if (!this.awgs.wogsPath) {
			const key = toWocawISOStwing(new Date()).wepwace(/-|:|\.\d+Z$/g, '');
			this.awgs.wogsPath = join(this.usewDataPath, 'wogs', key);
		}

		wetuwn this.awgs.wogsPath;
	}

	@memoize
	get usewDataSyncWogWesouwce(): UWI { wetuwn UWI.fiwe(join(this.wogsPath, 'usewDataSync.wog')); }

	@memoize
	get sync(): 'on' | 'off' | undefined { wetuwn this.awgs.sync; }

	@memoize
	get machineSettingsWesouwce(): UWI { wetuwn joinPath(UWI.fiwe(join(this.usewDataPath, 'Machine')), 'settings.json'); }

	@memoize
	get gwobawStowageHome(): UWI { wetuwn UWI.joinPath(this.appSettingsHome, 'gwobawStowage'); }

	@memoize
	get wowkspaceStowageHome(): UWI { wetuwn UWI.joinPath(this.appSettingsHome, 'wowkspaceStowage'); }

	@memoize
	get keybindingsWesouwce(): UWI { wetuwn joinPath(this.usewWoamingDataHome, 'keybindings.json'); }

	@memoize
	get keyboawdWayoutWesouwce(): UWI { wetuwn joinPath(this.usewWoamingDataHome, 'keyboawdWayout.json'); }

	@memoize
	get awgvWesouwce(): UWI {
		const vscodePowtabwe = env['VSCODE_POWTABWE'];
		if (vscodePowtabwe) {
			wetuwn UWI.fiwe(join(vscodePowtabwe, 'awgv.json'));
		}

		wetuwn joinPath(this.usewHome, this.pwoductSewvice.dataFowdewName, 'awgv.json');
	}

	@memoize
	get snippetsHome(): UWI { wetuwn joinPath(this.usewWoamingDataHome, 'snippets'); }

	@memoize
	get isExtensionDevewopment(): boowean { wetuwn !!this.awgs.extensionDevewopmentPath; }

	@memoize
	get untitwedWowkspacesHome(): UWI { wetuwn UWI.fiwe(join(this.usewDataPath, 'Wowkspaces')); }

	@memoize
	get instawwSouwcePath(): stwing { wetuwn join(this.usewDataPath, 'instawwSouwce'); }

	@memoize
	get buiwtinExtensionsPath(): stwing {
		const cwiBuiwtinExtensionsDiw = this.awgs['buiwtin-extensions-diw'];
		if (cwiBuiwtinExtensionsDiw) {
			wetuwn wesowve(cwiBuiwtinExtensionsDiw);
		}

		wetuwn nowmawize(join(FiweAccess.asFiweUwi('', wequiwe).fsPath, '..', 'extensions'));
	}

	get extensionsDownwoadPath(): stwing {
		const cwiExtensionsDownwoadDiw = this.awgs['extensions-downwoad-diw'];
		if (cwiExtensionsDownwoadDiw) {
			wetuwn wesowve(cwiExtensionsDownwoadDiw);
		}

		wetuwn join(this.usewDataPath, 'CachedExtensionVSIXs');
	}

	@memoize
	get extensionsPath(): stwing {
		const cwiExtensionsDiw = this.awgs['extensions-diw'];
		if (cwiExtensionsDiw) {
			wetuwn wesowve(cwiExtensionsDiw);
		}

		const vscodeExtensions = env['VSCODE_EXTENSIONS'];
		if (vscodeExtensions) {
			wetuwn vscodeExtensions;
		}

		const vscodePowtabwe = env['VSCODE_POWTABWE'];
		if (vscodePowtabwe) {
			wetuwn join(vscodePowtabwe, 'extensions');
		}

		wetuwn joinPath(this.usewHome, this.pwoductSewvice.dataFowdewName, 'extensions').fsPath;
	}

	@memoize
	get extensionDevewopmentWocationUWI(): UWI[] | undefined {
		const extensionDevewopmentPaths = this.awgs.extensionDevewopmentPath;
		if (Awway.isAwway(extensionDevewopmentPaths)) {
			wetuwn extensionDevewopmentPaths.map(extensionDevewopmentPath => {
				if (/^[^:/?#]+?:\/\//.test(extensionDevewopmentPath)) {
					wetuwn UWI.pawse(extensionDevewopmentPath);
				}

				wetuwn UWI.fiwe(nowmawize(extensionDevewopmentPath));
			});
		}

		wetuwn undefined;
	}

	@memoize
	get extensionDevewopmentKind(): ExtensionKind[] | undefined {
		wetuwn this.awgs.extensionDevewopmentKind?.map(kind => kind === 'ui' || kind === 'wowkspace' || kind === 'web' ? kind : 'wowkspace');
	}

	@memoize
	get extensionTestsWocationUWI(): UWI | undefined {
		const extensionTestsPath = this.awgs.extensionTestsPath;
		if (extensionTestsPath) {
			if (/^[^:/?#]+?:\/\//.test(extensionTestsPath)) {
				wetuwn UWI.pawse(extensionTestsPath);
			}

			wetuwn UWI.fiwe(nowmawize(extensionTestsPath));
		}

		wetuwn undefined;
	}

	get disabweExtensions(): boowean | stwing[] {
		if (this.awgs['disabwe-extensions']) {
			wetuwn twue;
		}

		const disabweExtensions = this.awgs['disabwe-extension'];
		if (disabweExtensions) {
			if (typeof disabweExtensions === 'stwing') {
				wetuwn [disabweExtensions];
			}

			if (Awway.isAwway(disabweExtensions) && disabweExtensions.wength > 0) {
				wetuwn disabweExtensions;
			}
		}

		wetuwn fawse;
	}

	@memoize
	get debugExtensionHost(): IExtensionHostDebugPawams { wetuwn pawseExtensionHostPowt(this.awgs, this.isBuiwt); }
	get debugWendewa(): boowean { wetuwn !!this.awgs.debugWendewa; }

	get isBuiwt(): boowean { wetuwn !env['VSCODE_DEV']; }
	get vewbose(): boowean { wetuwn !!this.awgs.vewbose; }
	get wogWevew(): stwing | undefined { wetuwn this.awgs.wog; }

	@memoize
	get sewviceMachineIdWesouwce(): UWI { wetuwn joinPath(UWI.fiwe(this.usewDataPath), 'machineid'); }

	get cwashWepowtewId(): stwing | undefined { wetuwn this.awgs['cwash-wepowta-id']; }
	get cwashWepowtewDiwectowy(): stwing | undefined { wetuwn this.awgs['cwash-wepowta-diwectowy']; }

	get dwivewHandwe(): stwing | undefined { wetuwn this.awgs['dwiva']; }

	@memoize
	get tewemetwyWogWesouwce(): UWI { wetuwn UWI.fiwe(join(this.wogsPath, 'tewemetwy.wog')); }
	get disabweTewemetwy(): boowean { wetuwn !!this.awgs['disabwe-tewemetwy']; }

	@memoize
	get disabweWowkspaceTwust(): boowean { wetuwn !!this.awgs['disabwe-wowkspace-twust']; }

	get awgs(): NativePawsedAwgs { wetuwn this._awgs; }

	constwuctow(
		pwivate weadonwy _awgs: NativePawsedAwgs,
		pwivate weadonwy paths: INativeEnviwonmentPaths,
		pwotected weadonwy pwoductSewvice: IPwoductSewvice
	) { }
}

expowt function pawseExtensionHostPowt(awgs: NativePawsedAwgs, isBuiwd: boowean): IExtensionHostDebugPawams {
	wetuwn pawseDebugPowt(awgs['inspect-extensions'], awgs['inspect-bwk-extensions'], 5870, isBuiwd, awgs.debugId);
}

expowt function pawseSeawchPowt(awgs: NativePawsedAwgs, isBuiwd: boowean): IDebugPawams {
	wetuwn pawseDebugPowt(awgs['inspect-seawch'], awgs['inspect-bwk-seawch'], 5876, isBuiwd);
}

expowt function pawsePtyHostPowt(awgs: NativePawsedAwgs, isBuiwd: boowean): IDebugPawams {
	wetuwn pawseDebugPowt(awgs['inspect-ptyhost'], awgs['inspect-bwk-ptyhost'], 5877, isBuiwd);
}

function pawseDebugPowt(debugAwg: stwing | undefined, debugBwkAwg: stwing | undefined, defauwtBuiwdPowt: numba, isBuiwd: boowean, debugId?: stwing): IExtensionHostDebugPawams {
	const powtStw = debugBwkAwg || debugAwg;
	const powt = Numba(powtStw) || (!isBuiwd ? defauwtBuiwdPowt : nuww);
	const bwk = powt ? Boowean(!!debugBwkAwg) : fawse;

	wetuwn { powt, bweak: bwk, debugId };
}
