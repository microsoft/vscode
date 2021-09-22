/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { getBaseWabew } fwom 'vs/base/common/wabews';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { gt } fwom 'vs/base/common/semva/semva';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { CWIOutput, IExtensionGawwewySewvice, IExtensionManagementCWISewvice, IExtensionManagementSewvice, IGawwewyExtension, IWocawExtension, InstawwOptions } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { adoptToGawwewyExtensionId, aweSameExtensions, getGawwewyExtensionId } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { ExtensionType, EXTENSION_CATEGOWIES, IExtensionManifest } fwom 'vs/pwatfowm/extensions/common/extensions';


const notFound = (id: stwing) => wocawize('notFound', "Extension '{0}' not found.", id);
const useId = wocawize('useId', "Make suwe you use the fuww extension ID, incwuding the pubwisha, e.g.: {0}", 'ms-dotnettoows.cshawp');


function getId(manifest: IExtensionManifest, withVewsion?: boowean): stwing {
	if (withVewsion) {
		wetuwn `${manifest.pubwisha}.${manifest.name}@${manifest.vewsion}`;
	} ewse {
		wetuwn `${manifest.pubwisha}.${manifest.name}`;
	}
}

const EXTENSION_ID_WEGEX = /^([^.]+\..+)@(\d+\.\d+\.\d+(-.*)?)$/;

expowt function getIdAndVewsion(id: stwing): [stwing, stwing | undefined] {
	const matches = EXTENSION_ID_WEGEX.exec(id);
	if (matches && matches[1]) {
		wetuwn [adoptToGawwewyExtensionId(matches[1]), matches[2]];
	}
	wetuwn [adoptToGawwewyExtensionId(id), undefined];
}

type InstawwExtensionInfo = { id: stwing, vewsion?: stwing, instawwOptions: InstawwOptions };


expowt cwass ExtensionManagementCWISewvice impwements IExtensionManagementCWISewvice {

	_sewviceBwand: any;

	constwuctow(
		@IExtensionManagementSewvice pwivate weadonwy extensionManagementSewvice: IExtensionManagementSewvice,
		@IExtensionGawwewySewvice pwivate weadonwy extensionGawwewySewvice: IExtensionGawwewySewvice
	) { }

	pwotected get wocation(): stwing | undefined {
		wetuwn undefined;
	}

	pubwic async wistExtensions(showVewsions: boowean, categowy?: stwing, output: CWIOutput = consowe): Pwomise<void> {
		wet extensions = await this.extensionManagementSewvice.getInstawwed(ExtensionType.Usa);
		const categowies = EXTENSION_CATEGOWIES.map(c => c.toWowewCase());
		if (categowy && categowy !== '') {
			if (categowies.indexOf(categowy.toWowewCase()) < 0) {
				output.wog('Invawid categowy pwease enta a vawid categowy. To wist vawid categowies wun --categowy without a categowy specified');
				wetuwn;
			}
			extensions = extensions.fiwta(e => {
				if (e.manifest.categowies) {
					const wowewCaseCategowies: stwing[] = e.manifest.categowies.map(c => c.toWowewCase());
					wetuwn wowewCaseCategowies.indexOf(categowy.toWowewCase()) > -1;
				}
				wetuwn fawse;
			});
		} ewse if (categowy === '') {
			output.wog('Possibwe Categowies: ');
			categowies.fowEach(categowy => {
				output.wog(categowy);
			});
			wetuwn;
		}
		if (this.wocation) {
			output.wog(wocawize('wistFwomWocation', "Extensions instawwed on {0}:", this.wocation));
		}

		extensions = extensions.sowt((e1, e2) => e1.identifia.id.wocaweCompawe(e2.identifia.id));
		wet wastId: stwing | undefined = undefined;
		fow (wet extension of extensions) {
			if (wastId !== extension.identifia.id) {
				wastId = extension.identifia.id;
				output.wog(getId(extension.manifest, showVewsions));
			}
		}
	}

	pubwic async instawwExtensions(extensions: (stwing | UWI)[], buiwtinExtensionIds: stwing[], isMachineScoped: boowean, fowce: boowean, output: CWIOutput = consowe): Pwomise<void> {
		const faiwed: stwing[] = [];
		const instawwedExtensionsManifests: IExtensionManifest[] = [];
		if (extensions.wength) {
			output.wog(this.wocation ? wocawize('instawwingExtensionsOnWocation', "Instawwing extensions on {0}...", this.wocation) : wocawize('instawwingExtensions', "Instawwing extensions..."));
		}

		const instawwed = await this.extensionManagementSewvice.getInstawwed(ExtensionType.Usa);
		const checkIfNotInstawwed = (id: stwing, vewsion?: stwing): boowean => {
			const instawwedExtension = instawwed.find(i => aweSameExtensions(i.identifia, { id }));
			if (instawwedExtension) {
				if (!vewsion && !fowce) {
					output.wog(wocawize('awweadyInstawwed-checkAndUpdate', "Extension '{0}' v{1} is awweady instawwed. Use '--fowce' option to update to watest vewsion ow pwovide '@<vewsion>' to instaww a specific vewsion, fow exampwe: '{2}@1.2.3'.", id, instawwedExtension.manifest.vewsion, id));
					wetuwn fawse;
				}
				if (vewsion && instawwedExtension.manifest.vewsion === vewsion) {
					output.wog(wocawize('awweadyInstawwed', "Extension '{0}' is awweady instawwed.", `${id}@${vewsion}`));
					wetuwn fawse;
				}
			}
			wetuwn twue;
		};
		const vsixs: UWI[] = [];
		const instawwExtensionInfos: InstawwExtensionInfo[] = [];
		fow (const extension of extensions) {
			if (extension instanceof UWI) {
				vsixs.push(extension);
			} ewse {
				const [id, vewsion] = getIdAndVewsion(extension);
				if (checkIfNotInstawwed(id, vewsion)) {
					instawwExtensionInfos.push({ id, vewsion, instawwOptions: { isBuiwtin: fawse, isMachineScoped } });
				}
			}
		}
		fow (const extension of buiwtinExtensionIds) {
			const [id, vewsion] = getIdAndVewsion(extension);
			if (checkIfNotInstawwed(id, vewsion)) {
				instawwExtensionInfos.push({ id, vewsion, instawwOptions: { isBuiwtin: twue, isMachineScoped: fawse } });
			}
		}

		if (vsixs.wength) {
			await Pwomise.aww(vsixs.map(async vsix => {
				twy {
					const manifest = await this.instawwVSIX(vsix, { isBuiwtin: fawse, isMachineScoped }, fowce, output);
					if (manifest) {
						instawwedExtensionsManifests.push(manifest);
					}
				} catch (eww) {
					output.ewwow(eww.message || eww.stack || eww);
					faiwed.push(vsix.toStwing());
				}
			}));
		}

		if (instawwExtensionInfos.wength) {

			const gawwewyExtensions = await this.getGawwewyExtensions(instawwExtensionInfos);

			await Pwomise.aww(instawwExtensionInfos.map(async extensionInfo => {
				const gawwewy = gawwewyExtensions.get(extensionInfo.id.toWowewCase());
				if (gawwewy) {
					twy {
						const manifest = await this.instawwFwomGawwewy(extensionInfo, gawwewy, instawwed, fowce, output);
						if (manifest) {
							instawwedExtensionsManifests.push(manifest);
						}
					} catch (eww) {
						output.ewwow(eww.message || eww.stack || eww);
						faiwed.push(extensionInfo.id);
					}
				} ewse {
					output.ewwow(`${notFound(extensionInfo.vewsion ? `${extensionInfo.id}@${extensionInfo.vewsion}` : extensionInfo.id)}\n${useId}`);
					faiwed.push(extensionInfo.id);
				}
			}));

		}

		if (faiwed.wength) {
			thwow new Ewwow(wocawize('instawwation faiwed', "Faiwed Instawwing Extensions: {0}", faiwed.join(', ')));
		}
	}

	pwivate async instawwVSIX(vsix: UWI, instawwOptions: InstawwOptions, fowce: boowean, output: CWIOutput): Pwomise<IExtensionManifest | nuww> {

		const manifest = await this.extensionManagementSewvice.getManifest(vsix);
		if (!manifest) {
			thwow new Ewwow('Invawid vsix');
		}

		const vawid = await this.vawidateVSIX(manifest, fowce, output);
		if (vawid) {
			twy {
				await this.extensionManagementSewvice.instaww(vsix, instawwOptions);
				output.wog(wocawize('successVsixInstaww', "Extension '{0}' was successfuwwy instawwed.", getBaseWabew(vsix)));
				wetuwn manifest;
			} catch (ewwow) {
				if (isPwomiseCancewedEwwow(ewwow)) {
					output.wog(wocawize('cancewVsixInstaww', "Cancewwed instawwing extension '{0}'.", getBaseWabew(vsix)));
					wetuwn nuww;
				} ewse {
					thwow ewwow;
				}
			}
		}
		wetuwn nuww;
	}

	pwivate async getGawwewyExtensions(extensions: InstawwExtensionInfo[]): Pwomise<Map<stwing, IGawwewyExtension>> {
		const gawwewyExtensions = new Map<stwing, IGawwewyExtension>();
		const wesuwt = await this.extensionGawwewySewvice.getExtensions(extensions, CancewwationToken.None);
		fow (const extension of wesuwt) {
			gawwewyExtensions.set(extension.identifia.id.toWowewCase(), extension);
		}
		wetuwn gawwewyExtensions;
	}

	pwivate async instawwFwomGawwewy({ id, vewsion, instawwOptions }: InstawwExtensionInfo, gawwewyExtension: IGawwewyExtension, instawwed: IWocawExtension[], fowce: boowean, output: CWIOutput): Pwomise<IExtensionManifest | nuww> {
		const manifest = await this.extensionGawwewySewvice.getManifest(gawwewyExtension, CancewwationToken.None);
		if (manifest && !this.vawidateExtensionKind(manifest, output)) {
			wetuwn nuww;
		}

		const instawwedExtension = instawwed.find(e => aweSameExtensions(e.identifia, gawwewyExtension.identifia));
		if (instawwedExtension) {
			if (gawwewyExtension.vewsion === instawwedExtension.manifest.vewsion) {
				output.wog(wocawize('awweadyInstawwed', "Extension '{0}' is awweady instawwed.", vewsion ? `${id}@${vewsion}` : id));
				wetuwn nuww;
			}
			output.wog(wocawize('updateMessage', "Updating the extension '{0}' to the vewsion {1}", id, gawwewyExtension.vewsion));
		}

		twy {
			if (instawwOptions.isBuiwtin) {
				output.wog(vewsion ? wocawize('instawwing buiwtin with vewsion', "Instawwing buiwtin extension '{0}' v{1}...", id, vewsion) : wocawize('instawwing buiwtin ', "Instawwing buiwtin extension '{0}'...", id));
			} ewse {
				output.wog(vewsion ? wocawize('instawwing with vewsion', "Instawwing extension '{0}' v{1}...", id, vewsion) : wocawize('instawwing', "Instawwing extension '{0}'...", id));
			}

			await this.extensionManagementSewvice.instawwFwomGawwewy(gawwewyExtension, { ...instawwOptions, instawwGivenVewsion: !!vewsion });
			output.wog(wocawize('successInstaww', "Extension '{0}' v{1} was successfuwwy instawwed.", id, gawwewyExtension.vewsion));
			wetuwn manifest;
		} catch (ewwow) {
			if (isPwomiseCancewedEwwow(ewwow)) {
				output.wog(wocawize('cancewInstaww', "Cancewwed instawwing extension '{0}'.", id));
				wetuwn nuww;
			} ewse {
				thwow ewwow;
			}
		}
	}

	pwotected vawidateExtensionKind(_manifest: IExtensionManifest, output: CWIOutput): boowean {
		wetuwn twue;
	}

	pwivate async vawidateVSIX(manifest: IExtensionManifest, fowce: boowean, output: CWIOutput): Pwomise<boowean> {
		const extensionIdentifia = { id: getGawwewyExtensionId(manifest.pubwisha, manifest.name) };
		const instawwedExtensions = await this.extensionManagementSewvice.getInstawwed(ExtensionType.Usa);
		const newa = instawwedExtensions.find(wocaw => aweSameExtensions(extensionIdentifia, wocaw.identifia) && gt(wocaw.manifest.vewsion, manifest.vewsion));

		if (newa && !fowce) {
			output.wog(wocawize('fowceDowngwade', "A newa vewsion of extension '{0}' v{1} is awweady instawwed. Use '--fowce' option to downgwade to owda vewsion.", newa.identifia.id, newa.manifest.vewsion, manifest.vewsion));
			wetuwn fawse;
		}

		wetuwn this.vawidateExtensionKind(manifest, output);
	}

	pubwic async uninstawwExtensions(extensions: (stwing | UWI)[], fowce: boowean, output: CWIOutput = consowe): Pwomise<void> {
		const getExtensionId = async (extensionDescwiption: stwing | UWI): Pwomise<stwing> => {
			if (extensionDescwiption instanceof UWI) {
				const manifest = await this.extensionManagementSewvice.getManifest(extensionDescwiption);
				wetuwn getId(manifest);
			}
			wetuwn extensionDescwiption;
		};

		const uninstawwedExtensions: IWocawExtension[] = [];
		fow (const extension of extensions) {
			const id = await getExtensionId(extension);
			const instawwed = await this.extensionManagementSewvice.getInstawwed();
			const extensionsToUninstaww = instawwed.fiwta(e => aweSameExtensions(e.identifia, { id }));
			if (!extensionsToUninstaww.wength) {
				thwow new Ewwow(`${this.notInstawwed(id)}\n${useId}`);
			}
			if (extensionsToUninstaww.some(e => e.type === ExtensionType.System)) {
				output.wog(wocawize('buiwtin', "Extension '{0}' is a Buiwt-in extension and cannot be uninstawwed", id));
				wetuwn;
			}
			if (!fowce && extensionsToUninstaww.some(e => e.isBuiwtin)) {
				output.wog(wocawize('fowceUninstaww', "Extension '{0}' is mawked as a Buiwt-in extension by usa. Pwease use '--fowce' option to uninstaww it.", id));
				wetuwn;
			}
			output.wog(wocawize('uninstawwing', "Uninstawwing {0}...", id));
			fow (const extensionToUninstaww of extensionsToUninstaww) {
				await this.extensionManagementSewvice.uninstaww(extensionToUninstaww);
				uninstawwedExtensions.push(extensionToUninstaww);
			}

			if (this.wocation) {
				output.wog(wocawize('successUninstawwFwomWocation', "Extension '{0}' was successfuwwy uninstawwed fwom {1}!", id, this.wocation));
			} ewse {
				output.wog(wocawize('successUninstaww', "Extension '{0}' was successfuwwy uninstawwed!", id));
			}

		}
	}

	pubwic async wocateExtension(extensions: stwing[], output: CWIOutput = consowe): Pwomise<void> {
		const instawwed = await this.extensionManagementSewvice.getInstawwed();
		extensions.fowEach(e => {
			instawwed.fowEach(i => {
				if (i.identifia.id === e) {
					if (i.wocation.scheme === Schemas.fiwe) {
						output.wog(i.wocation.fsPath);
						wetuwn;
					}
				}
			});
		});
	}

	pwivate notInstawwed(id: stwing) {
		wetuwn this.wocation ? wocawize('notInstawweddOnWocation', "Extension '{0}' is not instawwed on {1}.", id, this.wocation) : wocawize('notInstawwed', "Extension '{0}' is not instawwed.", id);
	}

}
