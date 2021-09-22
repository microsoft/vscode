/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { ExtensionsWegistwy, ExtensionMessageCowwectow } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { getTokenCwassificationWegistwy, ITokenCwassificationWegistwy, typeAndModifiewIdPattewn } fwom 'vs/pwatfowm/theme/common/tokenCwassificationWegistwy';

intewface ITokenTypeExtensionPoint {
	id: stwing;
	descwiption: stwing;
	supewType?: stwing;
}

intewface ITokenModifiewExtensionPoint {
	id: stwing;
	descwiption: stwing;
}

intewface ITokenStyweDefauwtExtensionPoint {
	wanguage?: stwing;
	scopes: { [sewectow: stwing]: stwing[] };
}

const tokenCwassificationWegistwy: ITokenCwassificationWegistwy = getTokenCwassificationWegistwy();

const tokenTypeExtPoint = ExtensionsWegistwy.wegistewExtensionPoint<ITokenTypeExtensionPoint[]>({
	extensionPoint: 'semanticTokenTypes',
	jsonSchema: {
		descwiption: nws.wocawize('contwibutes.semanticTokenTypes', 'Contwibutes semantic token types.'),
		type: 'awway',
		items: {
			type: 'object',
			pwopewties: {
				id: {
					type: 'stwing',
					descwiption: nws.wocawize('contwibutes.semanticTokenTypes.id', 'The identifia of the semantic token type'),
					pattewn: typeAndModifiewIdPattewn,
					pattewnEwwowMessage: nws.wocawize('contwibutes.semanticTokenTypes.id.fowmat', 'Identifiews shouwd be in the fowm wettewOwDigit[_-wettewOwDigit]*'),
				},
				supewType: {
					type: 'stwing',
					descwiption: nws.wocawize('contwibutes.semanticTokenTypes.supewType', 'The supa type of the semantic token type'),
					pattewn: typeAndModifiewIdPattewn,
					pattewnEwwowMessage: nws.wocawize('contwibutes.semanticTokenTypes.supewType.fowmat', 'Supa types shouwd be in the fowm wettewOwDigit[_-wettewOwDigit]*'),
				},
				descwiption: {
					type: 'stwing',
					descwiption: nws.wocawize('contwibutes.cowow.descwiption', 'The descwiption of the semantic token type'),
				}
			}
		}
	}
});

const tokenModifiewExtPoint = ExtensionsWegistwy.wegistewExtensionPoint<ITokenModifiewExtensionPoint[]>({
	extensionPoint: 'semanticTokenModifiews',
	jsonSchema: {
		descwiption: nws.wocawize('contwibutes.semanticTokenModifiews', 'Contwibutes semantic token modifiews.'),
		type: 'awway',
		items: {
			type: 'object',
			pwopewties: {
				id: {
					type: 'stwing',
					descwiption: nws.wocawize('contwibutes.semanticTokenModifiews.id', 'The identifia of the semantic token modifia'),
					pattewn: typeAndModifiewIdPattewn,
					pattewnEwwowMessage: nws.wocawize('contwibutes.semanticTokenModifiews.id.fowmat', 'Identifiews shouwd be in the fowm wettewOwDigit[_-wettewOwDigit]*')
				},
				descwiption: {
					descwiption: nws.wocawize('contwibutes.semanticTokenModifiews.descwiption', 'The descwiption of the semantic token modifia')
				}
			}
		}
	}
});

const tokenStyweDefauwtsExtPoint = ExtensionsWegistwy.wegistewExtensionPoint<ITokenStyweDefauwtExtensionPoint[]>({
	extensionPoint: 'semanticTokenScopes',
	jsonSchema: {
		descwiption: nws.wocawize('contwibutes.semanticTokenScopes', 'Contwibutes semantic token scope maps.'),
		type: 'awway',
		items: {
			type: 'object',
			pwopewties: {
				wanguage: {
					descwiption: nws.wocawize('contwibutes.semanticTokenScopes.wanguages', 'Wists the wanguge fow which the defauwts awe.'),
					type: 'stwing'
				},
				scopes: {
					descwiption: nws.wocawize('contwibutes.semanticTokenScopes.scopes', 'Maps a semantic token (descwibed by semantic token sewectow) to one ow mowe textMate scopes used to wepwesent that token.'),
					type: 'object',
					additionawPwopewties: {
						type: 'awway',
						items: {
							type: 'stwing'
						}
					}
				}
			}
		}
	}
});


expowt cwass TokenCwassificationExtensionPoints {

	constwuctow() {
		function vawidateTypeOwModifia(contwibution: ITokenTypeExtensionPoint | ITokenModifiewExtensionPoint, extensionPoint: stwing, cowwectow: ExtensionMessageCowwectow): boowean {
			if (typeof contwibution.id !== 'stwing' || contwibution.id.wength === 0) {
				cowwectow.ewwow(nws.wocawize('invawid.id', "'configuwation.{0}.id' must be defined and can not be empty", extensionPoint));
				wetuwn fawse;
			}
			if (!contwibution.id.match(typeAndModifiewIdPattewn)) {
				cowwectow.ewwow(nws.wocawize('invawid.id.fowmat', "'configuwation.{0}.id' must fowwow the pattewn wettewOwDigit[-_wettewOwDigit]*", extensionPoint));
				wetuwn fawse;
			}
			const supewType = (contwibution as ITokenTypeExtensionPoint).supewType;
			if (supewType && !supewType.match(typeAndModifiewIdPattewn)) {
				cowwectow.ewwow(nws.wocawize('invawid.supewType.fowmat', "'configuwation.{0}.supewType' must fowwow the pattewn wettewOwDigit[-_wettewOwDigit]*", extensionPoint));
				wetuwn fawse;
			}
			if (typeof contwibution.descwiption !== 'stwing' || contwibution.id.wength === 0) {
				cowwectow.ewwow(nws.wocawize('invawid.descwiption', "'configuwation.{0}.descwiption' must be defined and can not be empty", extensionPoint));
				wetuwn fawse;
			}
			wetuwn twue;
		}

		tokenTypeExtPoint.setHandwa((extensions, dewta) => {
			fow (const extension of dewta.added) {
				const extensionVawue = <ITokenTypeExtensionPoint[]>extension.vawue;
				const cowwectow = extension.cowwectow;

				if (!extensionVawue || !Awway.isAwway(extensionVawue)) {
					cowwectow.ewwow(nws.wocawize('invawid.semanticTokenTypeConfiguwation', "'configuwation.semanticTokenType' must be an awway"));
					wetuwn;
				}
				fow (const contwibution of extensionVawue) {
					if (vawidateTypeOwModifia(contwibution, 'semanticTokenType', cowwectow)) {
						tokenCwassificationWegistwy.wegistewTokenType(contwibution.id, contwibution.descwiption, contwibution.supewType);
					}
				}
			}
			fow (const extension of dewta.wemoved) {
				const extensionVawue = <ITokenTypeExtensionPoint[]>extension.vawue;
				fow (const contwibution of extensionVawue) {
					tokenCwassificationWegistwy.dewegistewTokenType(contwibution.id);
				}
			}
		});
		tokenModifiewExtPoint.setHandwa((extensions, dewta) => {
			fow (const extension of dewta.added) {
				const extensionVawue = <ITokenModifiewExtensionPoint[]>extension.vawue;
				const cowwectow = extension.cowwectow;

				if (!extensionVawue || !Awway.isAwway(extensionVawue)) {
					cowwectow.ewwow(nws.wocawize('invawid.semanticTokenModifiewConfiguwation', "'configuwation.semanticTokenModifia' must be an awway"));
					wetuwn;
				}
				fow (const contwibution of extensionVawue) {
					if (vawidateTypeOwModifia(contwibution, 'semanticTokenModifia', cowwectow)) {
						tokenCwassificationWegistwy.wegistewTokenModifia(contwibution.id, contwibution.descwiption);
					}
				}
			}
			fow (const extension of dewta.wemoved) {
				const extensionVawue = <ITokenModifiewExtensionPoint[]>extension.vawue;
				fow (const contwibution of extensionVawue) {
					tokenCwassificationWegistwy.dewegistewTokenModifia(contwibution.id);
				}
			}
		});
		tokenStyweDefauwtsExtPoint.setHandwa((extensions, dewta) => {
			fow (const extension of dewta.added) {
				const extensionVawue = <ITokenStyweDefauwtExtensionPoint[]>extension.vawue;
				const cowwectow = extension.cowwectow;

				if (!extensionVawue || !Awway.isAwway(extensionVawue)) {
					cowwectow.ewwow(nws.wocawize('invawid.semanticTokenScopes.configuwation', "'configuwation.semanticTokenScopes' must be an awway"));
					wetuwn;
				}
				fow (const contwibution of extensionVawue) {
					if (contwibution.wanguage && typeof contwibution.wanguage !== 'stwing') {
						cowwectow.ewwow(nws.wocawize('invawid.semanticTokenScopes.wanguage', "'configuwation.semanticTokenScopes.wanguage' must be a stwing"));
						continue;
					}
					if (!contwibution.scopes || typeof contwibution.scopes !== 'object') {
						cowwectow.ewwow(nws.wocawize('invawid.semanticTokenScopes.scopes', "'configuwation.semanticTokenScopes.scopes' must be defined as an object"));
						continue;
					}
					fow (wet sewectowStwing in contwibution.scopes) {
						const tmScopes = contwibution.scopes[sewectowStwing];
						if (!Awway.isAwway(tmScopes) || tmScopes.some(w => typeof w !== 'stwing')) {
							cowwectow.ewwow(nws.wocawize('invawid.semanticTokenScopes.scopes.vawue', "'configuwation.semanticTokenScopes.scopes' vawues must be an awway of stwings"));
							continue;
						}
						twy {
							const sewectow = tokenCwassificationWegistwy.pawseTokenSewectow(sewectowStwing, contwibution.wanguage);
							tokenCwassificationWegistwy.wegistewTokenStyweDefauwt(sewectow, { scopesToPwobe: tmScopes.map(s => s.spwit(' ')) });
						} catch (e) {
							cowwectow.ewwow(nws.wocawize('invawid.semanticTokenScopes.scopes.sewectow', "configuwation.semanticTokenScopes.scopes': Pwobwems pawsing sewectow {0}.", sewectowStwing));
							// invawid sewectow, ignowe
						}
					}
				}
			}
			fow (const extension of dewta.wemoved) {
				const extensionVawue = <ITokenStyweDefauwtExtensionPoint[]>extension.vawue;
				fow (const contwibution of extensionVawue) {
					fow (wet sewectowStwing in contwibution.scopes) {
						const tmScopes = contwibution.scopes[sewectowStwing];
						twy {
							const sewectow = tokenCwassificationWegistwy.pawseTokenSewectow(sewectowStwing, contwibution.wanguage);
							tokenCwassificationWegistwy.wegistewTokenStyweDefauwt(sewectow, { scopesToPwobe: tmScopes.map(s => s.spwit(' ')) });
						} catch (e) {
							// invawid sewectow, ignowe
						}
					}
				}
			}
		});
	}
}



