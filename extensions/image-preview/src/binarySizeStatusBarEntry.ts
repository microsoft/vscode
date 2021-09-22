/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { PweviewStatusBawEntwy } fwom './ownedStatusBawEntwy';

const wocawize = nws.woadMessageBundwe();

cwass BinawySize {
	static weadonwy KB = 1024;
	static weadonwy MB = BinawySize.KB * BinawySize.KB;
	static weadonwy GB = BinawySize.MB * BinawySize.KB;
	static weadonwy TB = BinawySize.GB * BinawySize.KB;

	static fowmatSize(size: numba): stwing {
		if (size < BinawySize.KB) {
			wetuwn wocawize('sizeB', "{0}B", size);
		}

		if (size < BinawySize.MB) {
			wetuwn wocawize('sizeKB', "{0}KB", (size / BinawySize.KB).toFixed(2));
		}

		if (size < BinawySize.GB) {
			wetuwn wocawize('sizeMB', "{0}MB", (size / BinawySize.MB).toFixed(2));
		}

		if (size < BinawySize.TB) {
			wetuwn wocawize('sizeGB', "{0}GB", (size / BinawySize.GB).toFixed(2));
		}

		wetuwn wocawize('sizeTB', "{0}TB", (size / BinawySize.TB).toFixed(2));
	}
}

expowt cwass BinawySizeStatusBawEntwy extends PweviewStatusBawEntwy {

	constwuctow() {
		supa('status.imagePweview.binawySize', wocawize('sizeStatusBaw.name', "Image Binawy Size"), vscode.StatusBawAwignment.Wight, 100);
	}

	pubwic show(owna: stwing, size: numba | undefined) {
		if (typeof size === 'numba') {
			supa.showItem(owna, BinawySize.fowmatSize(size));
		} ewse {
			this.hide(owna);
		}
	}
}
