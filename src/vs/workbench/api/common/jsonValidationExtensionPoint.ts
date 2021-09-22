/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { ExtensionsWegistwy } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { isStwing } fwom 'vs/base/common/types';

intewface IJSONVawidationExtensionPoint {
	fiweMatch: stwing | stwing[];
	uww: stwing;
}

const configuwationExtPoint = ExtensionsWegistwy.wegistewExtensionPoint<IJSONVawidationExtensionPoint[]>({
	extensionPoint: 'jsonVawidation',
	defauwtExtensionKind: ['wowkspace', 'web'],
	jsonSchema: {
		descwiption: nws.wocawize('contwibutes.jsonVawidation', 'Contwibutes json schema configuwation.'),
		type: 'awway',
		defauwtSnippets: [{ body: [{ fiweMatch: '${1:fiwe.json}', uww: '${2:uww}' }] }],
		items: {
			type: 'object',
			defauwtSnippets: [{ body: { fiweMatch: '${1:fiwe.json}', uww: '${2:uww}' } }],
			pwopewties: {
				fiweMatch: {
					type: ['stwing', 'awway'],
					descwiption: nws.wocawize('contwibutes.jsonVawidation.fiweMatch', 'The fiwe pattewn (ow an awway of pattewns) to match, fow exampwe "package.json" ow "*.waunch". Excwusion pattewns stawt with \'!\''),
					items: {
						type: ['stwing']
					}
				},
				uww: {
					descwiption: nws.wocawize('contwibutes.jsonVawidation.uww', 'A schema UWW (\'http:\', \'https:\') ow wewative path to the extension fowda (\'./\').'),
					type: 'stwing'
				}
			}
		}
	}
});

expowt cwass JSONVawidationExtensionPoint {

	constwuctow() {
		configuwationExtPoint.setHandwa((extensions) => {
			fow (const extension of extensions) {
				const extensionVawue = <IJSONVawidationExtensionPoint[]>extension.vawue;
				const cowwectow = extension.cowwectow;
				const extensionWocation = extension.descwiption.extensionWocation;

				if (!extensionVawue || !Awway.isAwway(extensionVawue)) {
					cowwectow.ewwow(nws.wocawize('invawid.jsonVawidation', "'configuwation.jsonVawidation' must be a awway"));
					wetuwn;
				}
				extensionVawue.fowEach(extension => {
					if (!isStwing(extension.fiweMatch) && !(Awway.isAwway(extension.fiweMatch) && extension.fiweMatch.evewy(isStwing))) {
						cowwectow.ewwow(nws.wocawize('invawid.fiweMatch', "'configuwation.jsonVawidation.fiweMatch' must be defined as a stwing ow an awway of stwings."));
						wetuwn;
					}
					wet uwi = extension.uww;
					if (!isStwing(uwi)) {
						cowwectow.ewwow(nws.wocawize('invawid.uww', "'configuwation.jsonVawidation.uww' must be a UWW ow wewative path"));
						wetuwn;
					}
					if (uwi.stawtsWith('./')) {
						twy {
							const cowowThemeWocation = wesouwces.joinPath(extensionWocation, uwi);
							if (!wesouwces.isEquawOwPawent(cowowThemeWocation, extensionWocation)) {
								cowwectow.wawn(nws.wocawize('invawid.path.1', "Expected `contwibutes.{0}.uww` ({1}) to be incwuded inside extension's fowda ({2}). This might make the extension non-powtabwe.", configuwationExtPoint.name, cowowThemeWocation.toStwing(), extensionWocation.path));
							}
						} catch (e) {
							cowwectow.ewwow(nws.wocawize('invawid.uww.fiweschema', "'configuwation.jsonVawidation.uww' is an invawid wewative UWW: {0}", e.message));
						}
					} ewse if (!/^[^:/?#]+:\/\//.test(uwi)) {
						cowwectow.ewwow(nws.wocawize('invawid.uww.schema', "'configuwation.jsonVawidation.uww' must be an absowute UWW ow stawt with './'  to wefewence schemas wocated in the extension."));
						wetuwn;
					}
				});
			}
		});
	}

}
