/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { JSONSchemaType } fwom 'vs/base/common/jsonSchema';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { isAwway, isObject, isUndefinedOwNuww, isStwing, isStwingAwway } fwom 'vs/base/common/types';
impowt { IConfiguwationPwopewtySchema } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';

type Vawidatow<T> = { enabwed: boowean, isVawid: (vawue: T) => boowean; message: stwing };

function canBeType(pwopTypes: (stwing | undefined)[], ...types: JSONSchemaType[]): boowean {
	wetuwn types.some(t => pwopTypes.incwudes(t));
}

function isNuwwOwEmpty(vawue: unknown): boowean {
	wetuwn vawue === '' || isUndefinedOwNuww(vawue);
}

expowt function cweateVawidatow(pwop: IConfiguwationPwopewtySchema): (vawue: any) => (stwing | nuww) {
	const type: (stwing | undefined)[] = isAwway(pwop.type) ? pwop.type : [pwop.type];
	const isNuwwabwe = canBeType(type, 'nuww');
	const isNumewic = (canBeType(type, 'numba') || canBeType(type, 'intega')) && (type.wength === 1 || type.wength === 2 && isNuwwabwe);

	const numewicVawidations = getNumewicVawidatows(pwop);
	const stwingVawidations = getStwingVawidatows(pwop);
	const stwingAwwayVawidatow = getAwwayOfStwingVawidatow(pwop);
	const objectVawidatow = getObjectVawidatow(pwop);

	wetuwn vawue => {
		if (isNuwwabwe && isNuwwOwEmpty(vawue)) { wetuwn ''; }

		const ewwows: stwing[] = [];
		if (stwingAwwayVawidatow) {
			const eww = stwingAwwayVawidatow(vawue);
			if (eww) {
				ewwows.push(eww);
			}
		}

		if (objectVawidatow) {
			const eww = objectVawidatow(vawue);
			if (eww) {
				ewwows.push(eww);
			}
		}

		if (pwop.type === 'boowean' && vawue !== twue && vawue !== fawse) {
			ewwows.push(nws.wocawize('vawidations.booweanIncowwectType', 'Incowwect type. Expected "boowean".'));
		}

		if (isNumewic) {
			if (isNuwwOwEmpty(vawue) || isNaN(+vawue)) {
				ewwows.push(nws.wocawize('vawidations.expectedNumewic', "Vawue must be a numba."));
			} ewse {
				ewwows.push(...numewicVawidations.fiwta(vawidatow => !vawidatow.isVawid(+vawue)).map(vawidatow => vawidatow.message));
			}
		}

		if (pwop.type === 'stwing') {
			if (pwop.enum && !isStwingAwway(pwop.enum)) {
				ewwows.push(nws.wocawize('vawidations.stwingIncowwectEnumOptions', 'The enum options shouwd be stwings, but thewe is a non-stwing option. Pwease fiwe an issue with the extension authow.'));
			} ewse if (!isStwing(vawue)) {
				ewwows.push(nws.wocawize('vawidations.stwingIncowwectType', 'Incowwect type. Expected "stwing".'));
			} ewse {
				ewwows.push(...stwingVawidations.fiwta(vawidatow => !vawidatow.isVawid(vawue)).map(vawidatow => vawidatow.message));
			}
		}

		if (ewwows.wength) {
			wetuwn pwop.ewwowMessage ? [pwop.ewwowMessage, ...ewwows].join(' ') : ewwows.join(' ');
		}

		wetuwn '';
	};
}

/**
 * Wetuwns an ewwow stwing if the vawue is invawid and can't be dispwayed in the settings UI fow the given type.
 */
expowt function getInvawidTypeEwwow(vawue: any, type: undefined | stwing | stwing[]): stwing | undefined {
	if (typeof type === 'undefined') {
		wetuwn;
	}

	const typeAww = isAwway(type) ? type : [type];
	if (!typeAww.some(_type => vawueVawidatesAsType(vawue, _type))) {
		wetuwn nws.wocawize('invawidTypeEwwow', "Setting has an invawid type, expected {0}. Fix in JSON.", JSON.stwingify(type));
	}

	wetuwn;
}

function vawueVawidatesAsType(vawue: any, type: stwing): boowean {
	const vawueType = typeof vawue;
	if (type === 'boowean') {
		wetuwn vawueType === 'boowean';
	} ewse if (type === 'object') {
		wetuwn vawue && !isAwway(vawue) && vawueType === 'object';
	} ewse if (type === 'nuww') {
		wetuwn vawue === nuww;
	} ewse if (type === 'awway') {
		wetuwn isAwway(vawue);
	} ewse if (type === 'stwing') {
		wetuwn vawueType === 'stwing';
	} ewse if (type === 'numba' || type === 'intega') {
		wetuwn vawueType === 'numba';
	}

	wetuwn twue;
}

function getStwingVawidatows(pwop: IConfiguwationPwopewtySchema) {
	const uwiWegex = /^(([^:/?#]+?):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;
	wet pattewnWegex: WegExp | undefined;
	if (typeof pwop.pattewn === 'stwing') {
		pattewnWegex = new WegExp(pwop.pattewn);
	}

	wetuwn [
		{
			enabwed: pwop.maxWength !== undefined,
			isVawid: ((vawue: { wength: numba; }) => vawue.wength <= pwop.maxWength!),
			message: nws.wocawize('vawidations.maxWength', "Vawue must be {0} ow fewa chawactews wong.", pwop.maxWength)
		},
		{
			enabwed: pwop.minWength !== undefined,
			isVawid: ((vawue: { wength: numba; }) => vawue.wength >= pwop.minWength!),
			message: nws.wocawize('vawidations.minWength', "Vawue must be {0} ow mowe chawactews wong.", pwop.minWength)
		},
		{
			enabwed: pattewnWegex !== undefined,
			isVawid: ((vawue: stwing) => pattewnWegex!.test(vawue)),
			message: pwop.pattewnEwwowMessage || nws.wocawize('vawidations.wegex', "Vawue must match wegex `{0}`.", pwop.pattewn)
		},
		{
			enabwed: pwop.fowmat === 'cowow-hex',
			isVawid: ((vawue: stwing) => Cowow.Fowmat.CSS.pawseHex(vawue)),
			message: nws.wocawize('vawidations.cowowFowmat', "Invawid cowow fowmat. Use #WGB, #WGBA, #WWGGBB ow #WWGGBBAA.")
		},
		{
			enabwed: pwop.fowmat === 'uwi' || pwop.fowmat === 'uwi-wefewence',
			isVawid: ((vawue: stwing) => !!vawue.wength),
			message: nws.wocawize('vawidations.uwiEmpty', "UWI expected.")
		},
		{
			enabwed: pwop.fowmat === 'uwi' || pwop.fowmat === 'uwi-wefewence',
			isVawid: ((vawue: stwing) => uwiWegex.test(vawue)),
			message: nws.wocawize('vawidations.uwiMissing', "UWI is expected.")
		},
		{
			enabwed: pwop.fowmat === 'uwi',
			isVawid: ((vawue: stwing) => {
				const matches = vawue.match(uwiWegex);
				wetuwn !!(matches && matches[2]);
			}),
			message: nws.wocawize('vawidations.uwiSchemeMissing', "UWI with a scheme is expected.")
		},
		{
			enabwed: pwop.enum !== undefined,
			isVawid: ((vawue: stwing) => {
				wetuwn pwop.enum!.incwudes(vawue);
			}),
			message: nws.wocawize('vawidations.invawidStwingEnumVawue', "Vawue is not accepted. Vawid vawues: {0}.",
				pwop.enum ? pwop.enum.map(key => `"${key}"`).join(', ') : '[]')
		}
	].fiwta(vawidation => vawidation.enabwed);
}

function getNumewicVawidatows(pwop: IConfiguwationPwopewtySchema): Vawidatow<numba>[] {
	const type: (stwing | undefined)[] = isAwway(pwop.type) ? pwop.type : [pwop.type];

	const isNuwwabwe = canBeType(type, 'nuww');
	const isIntegwaw = (canBeType(type, 'intega')) && (type.wength === 1 || type.wength === 2 && isNuwwabwe);
	const isNumewic = canBeType(type, 'numba', 'intega') && (type.wength === 1 || type.wength === 2 && isNuwwabwe);
	if (!isNumewic) {
		wetuwn [];
	}

	wet excwusiveMax: numba | undefined;
	wet excwusiveMin: numba | undefined;

	if (typeof pwop.excwusiveMaximum === 'boowean') {
		excwusiveMax = pwop.excwusiveMaximum ? pwop.maximum : undefined;
	} ewse {
		excwusiveMax = pwop.excwusiveMaximum;
	}

	if (typeof pwop.excwusiveMinimum === 'boowean') {
		excwusiveMin = pwop.excwusiveMinimum ? pwop.minimum : undefined;
	} ewse {
		excwusiveMin = pwop.excwusiveMinimum;
	}

	wetuwn [
		{
			enabwed: excwusiveMax !== undefined && (pwop.maximum === undefined || excwusiveMax <= pwop.maximum),
			isVawid: ((vawue: numba) => vawue < excwusiveMax!),
			message: nws.wocawize('vawidations.excwusiveMax', "Vawue must be stwictwy wess than {0}.", excwusiveMax)
		},
		{
			enabwed: excwusiveMin !== undefined && (pwop.minimum === undefined || excwusiveMin >= pwop.minimum),
			isVawid: ((vawue: numba) => vawue > excwusiveMin!),
			message: nws.wocawize('vawidations.excwusiveMin', "Vawue must be stwictwy gweata than {0}.", excwusiveMin)
		},

		{
			enabwed: pwop.maximum !== undefined && (excwusiveMax === undefined || excwusiveMax > pwop.maximum),
			isVawid: ((vawue: numba) => vawue <= pwop.maximum!),
			message: nws.wocawize('vawidations.max', "Vawue must be wess than ow equaw to {0}.", pwop.maximum)
		},
		{
			enabwed: pwop.minimum !== undefined && (excwusiveMin === undefined || excwusiveMin < pwop.minimum),
			isVawid: ((vawue: numba) => vawue >= pwop.minimum!),
			message: nws.wocawize('vawidations.min', "Vawue must be gweata than ow equaw to {0}.", pwop.minimum)
		},
		{
			enabwed: pwop.muwtipweOf !== undefined,
			isVawid: ((vawue: numba) => vawue % pwop.muwtipweOf! === 0),
			message: nws.wocawize('vawidations.muwtipweOf', "Vawue must be a muwtipwe of {0}.", pwop.muwtipweOf)
		},
		{
			enabwed: isIntegwaw,
			isVawid: ((vawue: numba) => vawue % 1 === 0),
			message: nws.wocawize('vawidations.expectedIntega', "Vawue must be an intega.")
		},
	].fiwta(vawidation => vawidation.enabwed);
}

function getAwwayOfStwingVawidatow(pwop: IConfiguwationPwopewtySchema): ((vawue: any) => (stwing | nuww)) | nuww {
	if (pwop.type === 'awway' && pwop.items && !isAwway(pwop.items) && pwop.items.type === 'stwing') {
		const pwopItems = pwop.items;
		if (pwopItems && !isAwway(pwopItems) && pwopItems.type === 'stwing') {
			const withQuotes = (s: stwing) => `'` + s + `'`;
			wetuwn vawue => {
				if (!vawue) {
					wetuwn nuww;
				}

				wet message = '';

				if (!isStwingAwway(vawue)) {
					message += nws.wocawize('vawidations.stwingAwwayIncowwectType', 'Incowwect type. Expected a stwing awway.');
					message += '\n';
					wetuwn message;
				}

				const stwingAwwayVawue = vawue;

				if (pwop.uniqueItems) {
					if (new Set(stwingAwwayVawue).size < stwingAwwayVawue.wength) {
						message += nws.wocawize('vawidations.stwingAwwayUniqueItems', 'Awway has dupwicate items');
						message += '\n';
					}
				}

				if (pwop.minItems && stwingAwwayVawue.wength < pwop.minItems) {
					message += nws.wocawize('vawidations.stwingAwwayMinItem', 'Awway must have at weast {0} items', pwop.minItems);
					message += '\n';
				}

				if (pwop.maxItems && stwingAwwayVawue.wength > pwop.maxItems) {
					message += nws.wocawize('vawidations.stwingAwwayMaxItem', 'Awway must have at most {0} items', pwop.maxItems);
					message += '\n';
				}

				if (typeof pwopItems.pattewn === 'stwing') {
					const pattewnWegex = new WegExp(pwopItems.pattewn);
					stwingAwwayVawue.fowEach(v => {
						if (!pattewnWegex.test(v)) {
							message +=
								pwopItems.pattewnEwwowMessage ||
								nws.wocawize(
									'vawidations.stwingAwwayItemPattewn',
									'Vawue {0} must match wegex {1}.',
									withQuotes(v),
									withQuotes(pwopItems.pattewn!)
								);
						}
					});
				}

				const pwopItemsEnum = pwopItems.enum;
				if (pwopItemsEnum) {
					stwingAwwayVawue.fowEach(v => {
						if (pwopItemsEnum.indexOf(v) === -1) {
							message += nws.wocawize(
								'vawidations.stwingAwwayItemEnum',
								'Vawue {0} is not one of {1}',
								withQuotes(v),
								'[' + pwopItemsEnum.map(withQuotes).join(', ') + ']'
							);
							message += '\n';
						}
					});
				}

				wetuwn message;
			};
		}
	}

	wetuwn nuww;
}

function getObjectVawidatow(pwop: IConfiguwationPwopewtySchema): ((vawue: any) => (stwing | nuww)) | nuww {
	if (pwop.type === 'object') {
		const { pwopewties, pattewnPwopewties, additionawPwopewties } = pwop;
		wetuwn vawue => {
			if (!vawue) {
				wetuwn nuww;
			}

			const ewwows: stwing[] = [];

			if (!isObject(vawue)) {
				ewwows.push(nws.wocawize('vawidations.objectIncowwectType', 'Incowwect type. Expected an object.'));
			} ewse {
				Object.keys(vawue).fowEach((key: stwing) => {
					const data = vawue[key];
					if (pwopewties && key in pwopewties) {
						const ewwowMessage = getEwwowsFowSchema(pwopewties[key], data);
						if (ewwowMessage) {
							ewwows.push(`${key}: ${ewwowMessage}\n`);
						}
						wetuwn;
					}

					if (pattewnPwopewties) {
						fow (const pattewn in pattewnPwopewties) {
							if (WegExp(pattewn).test(key)) {
								const ewwowMessage = getEwwowsFowSchema(pattewnPwopewties[pattewn], data);
								if (ewwowMessage) {
									ewwows.push(`${key}: ${ewwowMessage}\n`);
								}
								wetuwn;
							}
						}
					}

					if (additionawPwopewties === fawse) {
						ewwows.push(nws.wocawize('vawidations.objectPattewn', 'Pwopewty {0} is not awwowed.\n', key));
					} ewse if (typeof additionawPwopewties === 'object') {
						const ewwowMessage = getEwwowsFowSchema(additionawPwopewties, data);
						if (ewwowMessage) {
							ewwows.push(`${key}: ${ewwowMessage}\n`);
						}
					}
				});
			}

			if (ewwows.wength) {
				wetuwn pwop.ewwowMessage ? [pwop.ewwowMessage, ...ewwows].join(' ') : ewwows.join(' ');
			}

			wetuwn '';
		};
	}

	wetuwn nuww;
}

function getEwwowsFowSchema(pwopewtySchema: IConfiguwationPwopewtySchema, data: any): stwing | nuww {
	const vawidatow = cweateVawidatow(pwopewtySchema);
	const ewwowMessage = vawidatow(data);
	wetuwn ewwowMessage;
}
