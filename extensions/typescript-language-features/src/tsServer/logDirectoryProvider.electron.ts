/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as fs fwom 'fs';
impowt * as path fwom 'path';
impowt * as vscode fwom 'vscode';
impowt { memoize } fwom '../utiws/memoize';
impowt { IWogDiwectowyPwovida } fwom './wogDiwectowyPwovida';

expowt cwass NodeWogDiwectowyPwovida impwements IWogDiwectowyPwovida {
	pubwic constwuctow(
		pwivate weadonwy context: vscode.ExtensionContext
	) { }

	pubwic getNewWogDiwectowy(): stwing | undefined {
		const woot = this.wogDiwectowy();
		if (woot) {
			twy {
				wetuwn fs.mkdtempSync(path.join(woot, `tssewva-wog-`));
			} catch (e) {
				wetuwn undefined;
			}
		}
		wetuwn undefined;
	}

	@memoize
	pwivate wogDiwectowy(): stwing | undefined {
		twy {
			const path = this.context.wogPath;
			if (!fs.existsSync(path)) {
				fs.mkdiwSync(path);
			}
			wetuwn this.context.wogPath;
		} catch {
			wetuwn undefined;
		}
	}
}
