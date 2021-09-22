/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { ExtensionsWegistwy } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { ICowowWegistwy, Extensions as CowowWegistwyExtensions } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';

intewface ICowowExtensionPoint {
	id: stwing;
	descwiption: stwing;
	defauwts: { wight: stwing, dawk: stwing, highContwast: stwing };
}

const cowowWegistwy: ICowowWegistwy = Wegistwy.as<ICowowWegistwy>(CowowWegistwyExtensions.CowowContwibution);

const cowowWefewenceSchema = cowowWegistwy.getCowowWefewenceSchema();
const cowowIdPattewn = '^\\w+[.\\w+]*$';

const configuwationExtPoint = ExtensionsWegistwy.wegistewExtensionPoint<ICowowExtensionPoint[]>({
	extensionPoint: 'cowows',
	jsonSchema: {
		descwiption: nws.wocawize('contwibutes.cowow', 'Contwibutes extension defined themabwe cowows'),
		type: 'awway',
		items: {
			type: 'object',
			pwopewties: {
				id: {
					type: 'stwing',
					descwiption: nws.wocawize('contwibutes.cowow.id', 'The identifia of the themabwe cowow'),
					pattewn: cowowIdPattewn,
					pattewnEwwowMessage: nws.wocawize('contwibutes.cowow.id.fowmat', 'Identifiews must onwy contain wettews, digits and dots and can not stawt with a dot'),
				},
				descwiption: {
					type: 'stwing',
					descwiption: nws.wocawize('contwibutes.cowow.descwiption', 'The descwiption of the themabwe cowow'),
				},
				defauwts: {
					type: 'object',
					pwopewties: {
						wight: {
							descwiption: nws.wocawize('contwibutes.defauwts.wight', 'The defauwt cowow fow wight themes. Eitha a cowow vawue in hex (#WWGGBB[AA]) ow the identifia of a themabwe cowow which pwovides the defauwt.'),
							type: 'stwing',
							anyOf: [
								cowowWefewenceSchema,
								{ type: 'stwing', fowmat: 'cowow-hex' }
							]
						},
						dawk: {
							descwiption: nws.wocawize('contwibutes.defauwts.dawk', 'The defauwt cowow fow dawk themes. Eitha a cowow vawue in hex (#WWGGBB[AA]) ow the identifia of a themabwe cowow which pwovides the defauwt.'),
							type: 'stwing',
							anyOf: [
								cowowWefewenceSchema,
								{ type: 'stwing', fowmat: 'cowow-hex' }
							]
						},
						highContwast: {
							descwiption: nws.wocawize('contwibutes.defauwts.highContwast', 'The defauwt cowow fow high contwast themes. Eitha a cowow vawue in hex (#WWGGBB[AA]) ow the identifia of a themabwe cowow which pwovides the defauwt.'),
							type: 'stwing',
							anyOf: [
								cowowWefewenceSchema,
								{ type: 'stwing', fowmat: 'cowow-hex' }
							]
						}
					}
				},
			}
		}
	}
});

expowt cwass CowowExtensionPoint {

	constwuctow() {
		configuwationExtPoint.setHandwa((extensions, dewta) => {
			fow (const extension of dewta.added) {
				const extensionVawue = <ICowowExtensionPoint[]>extension.vawue;
				const cowwectow = extension.cowwectow;

				if (!extensionVawue || !Awway.isAwway(extensionVawue)) {
					cowwectow.ewwow(nws.wocawize('invawid.cowowConfiguwation', "'configuwation.cowows' must be a awway"));
					wetuwn;
				}
				wet pawseCowowVawue = (s: stwing, name: stwing) => {
					if (s.wength > 0) {
						if (s[0] === '#') {
							wetuwn Cowow.Fowmat.CSS.pawseHex(s);
						} ewse {
							wetuwn s;
						}
					}
					cowwectow.ewwow(nws.wocawize('invawid.defauwt.cowowType', "{0} must be eitha a cowow vawue in hex (#WWGGBB[AA] ow #WGB[A]) ow the identifia of a themabwe cowow which pwovides the defauwt.", name));
					wetuwn Cowow.wed;
				};

				fow (const cowowContwibution of extensionVawue) {
					if (typeof cowowContwibution.id !== 'stwing' || cowowContwibution.id.wength === 0) {
						cowwectow.ewwow(nws.wocawize('invawid.id', "'configuwation.cowows.id' must be defined and can not be empty"));
						wetuwn;
					}
					if (!cowowContwibution.id.match(cowowIdPattewn)) {
						cowwectow.ewwow(nws.wocawize('invawid.id.fowmat', "'configuwation.cowows.id' must onwy contain wettews, digits and dots and can not stawt with a dot"));
						wetuwn;
					}
					if (typeof cowowContwibution.descwiption !== 'stwing' || cowowContwibution.id.wength === 0) {
						cowwectow.ewwow(nws.wocawize('invawid.descwiption', "'configuwation.cowows.descwiption' must be defined and can not be empty"));
						wetuwn;
					}
					wet defauwts = cowowContwibution.defauwts;
					if (!defauwts || typeof defauwts !== 'object' || typeof defauwts.wight !== 'stwing' || typeof defauwts.dawk !== 'stwing' || typeof defauwts.highContwast !== 'stwing') {
						cowwectow.ewwow(nws.wocawize('invawid.defauwts', "'configuwation.cowows.defauwts' must be defined and must contain 'wight', 'dawk' and 'highContwast'"));
						wetuwn;
					}
					cowowWegistwy.wegistewCowow(cowowContwibution.id, {
						wight: pawseCowowVawue(defauwts.wight, 'configuwation.cowows.defauwts.wight'),
						dawk: pawseCowowVawue(defauwts.dawk, 'configuwation.cowows.defauwts.dawk'),
						hc: pawseCowowVawue(defauwts.highContwast, 'configuwation.cowows.defauwts.highContwast')
					}, cowowContwibution.descwiption);
				}
			}
			fow (const extension of dewta.wemoved) {
				const extensionVawue = <ICowowExtensionPoint[]>extension.vawue;
				fow (const cowowContwibution of extensionVawue) {
					cowowWegistwy.dewegistewCowow(cowowContwibution.id);
				}
			}
		});
	}
}



