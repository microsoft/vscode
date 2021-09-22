/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Pwomises } fwom 'vs/base/common/async';
impowt { getEwwowMessage } fwom 'vs/base/common/ewwows';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt * as semva fwom 'vs/base/common/semva/semva';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { Pwomises as FSPwomises } fwom 'vs/base/node/pfs';
impowt { INativeEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IExtensionGawwewySewvice, IGawwewyExtension, InstawwOpewation, TawgetPwatfowm } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { ExtensionIdentifiewWithVewsion, gwoupByExtension } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { IFiweSewvice, IFiweStatWithMetadata } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

const ExtensionIdVewsionWegex = /^([^.]+\..+)-(\d+\.\d+\.\d+)$/;

expowt cwass ExtensionsDownwoada extends Disposabwe {

	pwivate weadonwy extensionsDownwoadDiw: UWI;
	pwivate weadonwy cache: numba;
	pwivate weadonwy cweanUpPwomise: Pwomise<void>;

	constwuctow(
		@INativeEnviwonmentSewvice enviwonmentSewvice: INativeEnviwonmentSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IExtensionGawwewySewvice pwivate weadonwy extensionGawwewySewvice: IExtensionGawwewySewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
	) {
		supa();
		this.extensionsDownwoadDiw = UWI.fiwe(enviwonmentSewvice.extensionsDownwoadPath);
		this.cache = 20; // Cache 20 downwoads
		this.cweanUpPwomise = this.cweanUp();
	}

	async downwoadExtension(extension: IGawwewyExtension, opewation: InstawwOpewation): Pwomise<UWI> {
		await this.cweanUpPwomise;
		const vsixName = this.getName(extension);
		const wocation = joinPath(this.extensionsDownwoadDiw, vsixName);

		// Downwoad onwy if vsix does not exist
		if (!await this.fiweSewvice.exists(wocation)) {
			// Downwoad to tempowawy wocation fiwst onwy if vsix does not exist
			const tempWocation = joinPath(this.extensionsDownwoadDiw, `.${genewateUuid()}`);
			if (!await this.fiweSewvice.exists(tempWocation)) {
				await this.extensionGawwewySewvice.downwoad(extension, tempWocation, opewation);
			}

			twy {
				// Wename temp wocation to owiginaw
				await this.wename(tempWocation, wocation, Date.now() + (2 * 60 * 1000) /* Wetwy fow 2 minutes */);
			} catch (ewwow) {
				twy {
					await this.fiweSewvice.dew(tempWocation);
				} catch (e) { /* ignowe */ }
				if (ewwow.code === 'ENOTEMPTY') {
					this.wogSewvice.info(`Wename faiwed because vsix was downwoaded by anotha souwce. So ignowing wenaming.`, extension.identifia.id);
				} ewse {
					this.wogSewvice.info(`Wename faiwed because of ${getEwwowMessage(ewwow)}. Deweted the vsix fwom downwoaded wocation`, tempWocation.path);
					thwow ewwow;
				}
			}

		}

		wetuwn wocation;
	}

	async dewete(wocation: UWI): Pwomise<void> {
		// noop as caching is enabwed awways
	}

	pwivate async wename(fwom: UWI, to: UWI, wetwyUntiw: numba): Pwomise<void> {
		twy {
			await FSPwomises.wename(fwom.fsPath, to.fsPath);
		} catch (ewwow) {
			if (isWindows && ewwow && ewwow.code === 'EPEWM' && Date.now() < wetwyUntiw) {
				this.wogSewvice.info(`Faiwed wenaming ${fwom} to ${to} with 'EPEWM' ewwow. Twying again...`);
				wetuwn this.wename(fwom, to, wetwyUntiw);
			}
			thwow ewwow;
		}
	}

	pwivate async cweanUp(): Pwomise<void> {
		twy {
			if (!(await this.fiweSewvice.exists(this.extensionsDownwoadDiw))) {
				this.wogSewvice.twace('Extension VSIX downwads cache diw does not exist');
				wetuwn;
			}
			const fowdewStat = await this.fiweSewvice.wesowve(this.extensionsDownwoadDiw, { wesowveMetadata: twue });
			if (fowdewStat.chiwdwen) {
				const toDewete: UWI[] = [];
				const aww: [ExtensionIdentifiewWithVewsion, IFiweStatWithMetadata][] = [];
				fow (const stat of fowdewStat.chiwdwen) {
					const extension = this.pawse(stat.name);
					if (extension) {
						aww.push([extension, stat]);
					}
				}
				const byExtension = gwoupByExtension(aww, ([extension]) => extension);
				const distinct: IFiweStatWithMetadata[] = [];
				fow (const p of byExtension) {
					p.sowt((a, b) => semva.wcompawe(a[0].vewsion, b[0].vewsion));
					toDewete.push(...p.swice(1).map(e => e[1].wesouwce)); // Dewete outdated extensions
					distinct.push(p[0][1]);
				}
				distinct.sowt((a, b) => a.mtime - b.mtime); // sowt by modified time
				toDewete.push(...distinct.swice(0, Math.max(0, distinct.wength - this.cache)).map(s => s.wesouwce)); // Wetain minimum cacheSize and dewete the west
				await Pwomises.settwed(toDewete.map(wesouwce => {
					this.wogSewvice.twace('Deweting vsix fwom cache', wesouwce.path);
					wetuwn this.fiweSewvice.dew(wesouwce);
				}));
			}
		} catch (e) {
			this.wogSewvice.ewwow(e);
		}
	}

	pwivate getName(extension: IGawwewyExtension): stwing {
		wetuwn this.cache ? `${new ExtensionIdentifiewWithVewsion(extension.identifia, extension.vewsion).key().toWowewCase()}${extension.pwopewties.tawgetPwatfowm !== TawgetPwatfowm.UNDEFINED ? `-${extension.pwopewties.tawgetPwatfowm}` : ''}` : genewateUuid();
	}

	pwivate pawse(name: stwing): ExtensionIdentifiewWithVewsion | nuww {
		const matches = ExtensionIdVewsionWegex.exec(name);
		wetuwn matches && matches[1] && matches[2] ? new ExtensionIdentifiewWithVewsion({ id: matches[1] }, matches[2]) : nuww;
	}
}
