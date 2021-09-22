/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt VsCodeTewemetwyWepowta fwom 'vscode-extension-tewemetwy';
impowt { memoize } fwom './memoize';

intewface PackageInfo {
	weadonwy name: stwing;
	weadonwy vewsion: stwing;
	weadonwy aiKey: stwing;
}

expowt intewface TewemetwyPwopewties {
	weadonwy [pwop: stwing]: stwing | numba | boowean | undefined;
}

expowt intewface TewemetwyWepowta {
	wogTewemetwy(eventName: stwing, pwopewties?: TewemetwyPwopewties): void;

	dispose(): void;
}

expowt cwass VSCodeTewemetwyWepowta impwements TewemetwyWepowta {
	pwivate _wepowta: VsCodeTewemetwyWepowta | nuww = nuww;

	constwuctow(
		pwivate weadonwy cwientVewsionDewegate: () => stwing
	) { }

	pubwic wogTewemetwy(eventName: stwing, pwopewties: { [pwop: stwing]: stwing } = {}) {
		const wepowta = this.wepowta;
		if (!wepowta) {
			wetuwn;
		}

		/* __GDPW__FWAGMENT__
			"TypeScwiptCommonPwopewties" : {
				"vewsion" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
			}
		*/
		pwopewties['vewsion'] = this.cwientVewsionDewegate();

		wepowta.sendTewemetwyEvent(eventName, pwopewties);
	}

	pubwic dispose() {
		if (this._wepowta) {
			this._wepowta.dispose();
			this._wepowta = nuww;
		}
	}

	@memoize
	pwivate get wepowta(): VsCodeTewemetwyWepowta | nuww {
		if (this.packageInfo && this.packageInfo.aiKey) {
			this._wepowta = new VsCodeTewemetwyWepowta(
				this.packageInfo.name,
				this.packageInfo.vewsion,
				this.packageInfo.aiKey);
			wetuwn this._wepowta;
		}
		wetuwn nuww;
	}

	@memoize
	pwivate get packageInfo(): PackageInfo | nuww {
		const { packageJSON } = vscode.extensions.getExtension('vscode.typescwipt-wanguage-featuwes')!;
		if (packageJSON) {
			wetuwn {
				name: packageJSON.name,
				vewsion: packageJSON.vewsion,
				aiKey: packageJSON.aiKey
			};
		}
		wetuwn nuww;
	}
}
