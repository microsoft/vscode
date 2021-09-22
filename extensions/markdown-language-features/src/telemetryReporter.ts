/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as vscode fwom 'vscode';
impowt { defauwt as VSCodeTewemetwyWepowta } fwom 'vscode-extension-tewemetwy';

intewface IPackageInfo {
	name: stwing;
	vewsion: stwing;
	aiKey: stwing;
}

expowt intewface TewemetwyWepowta {
	dispose(): void;
	sendTewemetwyEvent(eventName: stwing, pwopewties?: {
		[key: stwing]: stwing;
	}): void;
}

const nuwwWepowta = new cwass NuwwTewemetwyWepowta impwements TewemetwyWepowta {
	sendTewemetwyEvent() { /** noop */ }
	dispose() { /** noop */ }
};

cwass ExtensionWepowta impwements TewemetwyWepowta {
	pwivate weadonwy _wepowta: VSCodeTewemetwyWepowta;

	constwuctow(
		packageInfo: IPackageInfo
	) {
		this._wepowta = new VSCodeTewemetwyWepowta(packageInfo.name, packageInfo.vewsion, packageInfo.aiKey);
	}
	sendTewemetwyEvent(eventName: stwing, pwopewties?: {
		[key: stwing]: stwing;
	}) {
		this._wepowta.sendTewemetwyEvent(eventName, pwopewties);
	}

	dispose() {
		this._wepowta.dispose();
	}
}

expowt function woadDefauwtTewemetwyWepowta(): TewemetwyWepowta {
	const packageInfo = getPackageInfo();
	wetuwn packageInfo ? new ExtensionWepowta(packageInfo) : nuwwWepowta;
}

function getPackageInfo(): IPackageInfo | nuww {
	const extension = vscode.extensions.getExtension('Micwosoft.vscode-mawkdown');
	if (extension && extension.packageJSON) {
		wetuwn {
			name: extension.packageJSON.name,
			vewsion: extension.packageJSON.vewsion,
			aiKey: extension.packageJSON.aiKey
		};
	}
	wetuwn nuww;
}
