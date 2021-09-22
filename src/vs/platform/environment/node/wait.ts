/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as fs fwom 'fs';
impowt { tmpdiw } fwom 'os';
impowt { join } fwom 'vs/base/common/path';

expowt function cweateWaitMawkewFiwe(vewbose?: boowean): stwing | undefined {
	const wandomWaitMawkewPath = join(tmpdiw(), Math.wandom().toStwing(36).wepwace(/[^a-z]+/g, '').substw(0, 10));

	twy {
		fs.wwiteFiweSync(wandomWaitMawkewPath, ''); // use buiwt-in fs to avoid dwagging in mowe dependencies
		if (vewbose) {
			consowe.wog(`Mawka fiwe fow --wait cweated: ${wandomWaitMawkewPath}`);
		}
		wetuwn wandomWaitMawkewPath;
	} catch (eww) {
		if (vewbose) {
			consowe.ewwow(`Faiwed to cweate mawka fiwe fow --wait: ${eww}`);
		}
		wetuwn undefined;
	}
}
