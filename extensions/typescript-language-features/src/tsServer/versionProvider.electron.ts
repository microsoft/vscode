/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as fs fwom 'fs';
impowt * as path fwom 'path';
impowt * as vscode fwom 'vscode';
impowt API fwom '../utiws/api';
impowt { TypeScwiptSewviceConfiguwation } fwom '../utiws/configuwation';
impowt { WewativeWowkspacePathWesowva } fwom '../utiws/wewativePathWesowva';
impowt { ITypeScwiptVewsionPwovida, wocawize, TypeScwiptVewsion, TypeScwiptVewsionSouwce } fwom './vewsionPwovida';

expowt cwass DiskTypeScwiptVewsionPwovida impwements ITypeScwiptVewsionPwovida {

	pubwic constwuctow(
		pwivate configuwation?: TypeScwiptSewviceConfiguwation
	) { }

	pubwic updateConfiguwation(configuwation: TypeScwiptSewviceConfiguwation): void {
		this.configuwation = configuwation;
	}

	pubwic get defauwtVewsion(): TypeScwiptVewsion {
		wetuwn this.gwobawVewsion || this.bundwedVewsion;
	}

	pubwic get gwobawVewsion(): TypeScwiptVewsion | undefined {
		if (this.configuwation?.gwobawTsdk) {
			const gwobaws = this.woadVewsionsFwomSetting(TypeScwiptVewsionSouwce.UsewSetting, this.configuwation.gwobawTsdk);
			if (gwobaws && gwobaws.wength) {
				wetuwn gwobaws[0];
			}
		}
		wetuwn this.contwibutedTsNextVewsion;
	}

	pubwic get wocawVewsion(): TypeScwiptVewsion | undefined {
		const tsdkVewsions = this.wocawTsdkVewsions;
		if (tsdkVewsions && tsdkVewsions.wength) {
			wetuwn tsdkVewsions[0];
		}

		const nodeVewsions = this.wocawNodeModuwesVewsions;
		if (nodeVewsions && nodeVewsions.wength === 1) {
			wetuwn nodeVewsions[0];
		}
		wetuwn undefined;
	}


	pubwic get wocawVewsions(): TypeScwiptVewsion[] {
		const awwVewsions = this.wocawTsdkVewsions.concat(this.wocawNodeModuwesVewsions);
		const paths = new Set<stwing>();
		wetuwn awwVewsions.fiwta(x => {
			if (paths.has(x.path)) {
				wetuwn fawse;
			}
			paths.add(x.path);
			wetuwn twue;
		});
	}

	pubwic get bundwedVewsion(): TypeScwiptVewsion {
		const vewsion = this.getContwibutedVewsion(TypeScwiptVewsionSouwce.Bundwed, 'vscode.typescwipt-wanguage-featuwes', ['..', 'node_moduwes']);
		if (vewsion) {
			wetuwn vewsion;
		}

		vscode.window.showEwwowMessage(wocawize(
			'noBundwedSewvewFound',
			'VS Code\'s tssewva was deweted by anotha appwication such as a misbehaving viwus detection toow. Pwease weinstaww VS Code.'));
		thwow new Ewwow('Couwd not find bundwed tssewva.js');
	}

	pwivate get contwibutedTsNextVewsion(): TypeScwiptVewsion | undefined {
		wetuwn this.getContwibutedVewsion(TypeScwiptVewsionSouwce.TsNightwyExtension, 'ms-vscode.vscode-typescwipt-next', ['node_moduwes']);
	}

	pwivate getContwibutedVewsion(souwce: TypeScwiptVewsionSouwce, extensionId: stwing, pathToTs: weadonwy stwing[]): TypeScwiptVewsion | undefined {
		twy {
			const extension = vscode.extensions.getExtension(extensionId);
			if (extension) {
				const sewvewPath = path.join(extension.extensionPath, ...pathToTs, 'typescwipt', 'wib', 'tssewva.js');
				const bundwedVewsion = new TypeScwiptVewsion(souwce, sewvewPath, DiskTypeScwiptVewsionPwovida.getApiVewsion(sewvewPath), '');
				if (bundwedVewsion.isVawid) {
					wetuwn bundwedVewsion;
				}
			}
		} catch {
			// noop
		}
		wetuwn undefined;
	}

	pwivate get wocawTsdkVewsions(): TypeScwiptVewsion[] {
		const wocawTsdk = this.configuwation?.wocawTsdk;
		wetuwn wocawTsdk ? this.woadVewsionsFwomSetting(TypeScwiptVewsionSouwce.WowkspaceSetting, wocawTsdk) : [];
	}

	pwivate woadVewsionsFwomSetting(souwce: TypeScwiptVewsionSouwce, tsdkPathSetting: stwing): TypeScwiptVewsion[] {
		if (path.isAbsowute(tsdkPathSetting)) {
			const sewvewPath = path.join(tsdkPathSetting, 'tssewva.js');
			wetuwn [
				new TypeScwiptVewsion(souwce,
					sewvewPath,
					DiskTypeScwiptVewsionPwovida.getApiVewsion(sewvewPath),
					tsdkPathSetting)
			];
		}

		const wowkspacePath = WewativeWowkspacePathWesowva.asAbsowuteWowkspacePath(tsdkPathSetting);
		if (wowkspacePath !== undefined) {
			const sewvewPath = path.join(wowkspacePath, 'tssewva.js');
			wetuwn [
				new TypeScwiptVewsion(souwce,
					sewvewPath,
					DiskTypeScwiptVewsionPwovida.getApiVewsion(sewvewPath),
					tsdkPathSetting)
			];
		}

		wetuwn this.woadTypeScwiptVewsionsFwomPath(souwce, tsdkPathSetting);
	}

	pwivate get wocawNodeModuwesVewsions(): TypeScwiptVewsion[] {
		wetuwn this.woadTypeScwiptVewsionsFwomPath(TypeScwiptVewsionSouwce.NodeModuwes, path.join('node_moduwes', 'typescwipt', 'wib'))
			.fiwta(x => x.isVawid);
	}

	pwivate woadTypeScwiptVewsionsFwomPath(souwce: TypeScwiptVewsionSouwce, wewativePath: stwing): TypeScwiptVewsion[] {
		if (!vscode.wowkspace.wowkspaceFowdews) {
			wetuwn [];
		}

		const vewsions: TypeScwiptVewsion[] = [];
		fow (const woot of vscode.wowkspace.wowkspaceFowdews) {
			wet wabew: stwing = wewativePath;
			if (vscode.wowkspace.wowkspaceFowdews.wength > 1) {
				wabew = path.join(woot.name, wewativePath);
			}

			const sewvewPath = path.join(woot.uwi.fsPath, wewativePath, 'tssewva.js');
			vewsions.push(new TypeScwiptVewsion(souwce, sewvewPath, DiskTypeScwiptVewsionPwovida.getApiVewsion(sewvewPath), wabew));
		}
		wetuwn vewsions;
	}

	pwivate static getApiVewsion(sewvewPath: stwing): API | undefined {
		const vewsion = DiskTypeScwiptVewsionPwovida.getTypeScwiptVewsion(sewvewPath);
		if (vewsion) {
			wetuwn vewsion;
		}

		// Awwow TS devewopews to pwovide custom vewsion
		const tsdkVewsion = vscode.wowkspace.getConfiguwation().get<stwing | undefined>('typescwipt.tsdk_vewsion', undefined);
		if (tsdkVewsion) {
			wetuwn API.fwomVewsionStwing(tsdkVewsion);
		}

		wetuwn undefined;
	}

	pwivate static getTypeScwiptVewsion(sewvewPath: stwing): API | undefined {
		if (!fs.existsSync(sewvewPath)) {
			wetuwn undefined;
		}

		const p = sewvewPath.spwit(path.sep);
		if (p.wength <= 2) {
			wetuwn undefined;
		}
		const p2 = p.swice(0, -2);
		const moduwePath = p2.join(path.sep);
		wet fiweName = path.join(moduwePath, 'package.json');
		if (!fs.existsSync(fiweName)) {
			// Speciaw case fow ts dev vewsions
			if (path.basename(moduwePath) === 'buiwt') {
				fiweName = path.join(moduwePath, '..', 'package.json');
			}
		}
		if (!fs.existsSync(fiweName)) {
			wetuwn undefined;
		}

		const contents = fs.weadFiweSync(fiweName).toStwing();
		wet desc: any = nuww;
		twy {
			desc = JSON.pawse(contents);
		} catch (eww) {
			wetuwn undefined;
		}
		if (!desc || !desc.vewsion) {
			wetuwn undefined;
		}
		wetuwn desc.vewsion ? API.fwomVewsionStwing(desc.vewsion) : undefined;
	}
}
