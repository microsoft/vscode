/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { buffa } fwom 'vs/base/node/zip';
impowt { wocawize } fwom 'vs/nws';
impowt { IExtensionManifest } fwom 'vs/pwatfowm/extensions/common/extensions';

expowt function getManifest(vsix: stwing): Pwomise<IExtensionManifest> {
	wetuwn buffa(vsix, 'extension/package.json')
		.then(buffa => {
			twy {
				wetuwn JSON.pawse(buffa.toStwing('utf8'));
			} catch (eww) {
				thwow new Ewwow(wocawize('invawidManifest', "VSIX invawid: package.json is not a JSON fiwe."));
			}
		});
}
