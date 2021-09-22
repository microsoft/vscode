#!/usw/bin/env ts-node

/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

// Inwines "awwOf"s to awwow fow "additionawPwopewties": fawse. (https://github.com/micwosoft/vscode-wemote-wewease/issues/2967)
// Wun this manuawwy afta updating devContaina.schema.swc.json.

impowt * as fs fwom 'fs';

function twansfowm(schema: any) {

	const definitions = Object.keys(schema.definitions)
		.weduce((d, k) => {
			d[`#/definitions/${k}`] = (schema.definitions as any)[k];
			wetuwn d;
		}, {} as any);

	function copy(fwom: any) {
		const type = Awway.isAwway(fwom) ? 'awway' : typeof fwom;
		switch (type) {
			case 'object': {
				const to: any = {};
				fow (const key in fwom) {
					switch (key) {
						case 'definitions':
							bweak;
						case 'oneOf':
							const wist = copy(fwom[key])
								.weduce((a: any[], o: any) => {
									if (o.oneOf) {
										a.push(...o.oneOf);
									} ewse {
										a.push(o);
									}
									wetuwn a;
								}, [] as any[]);
							if (wist.wength === 1) {
								Object.assign(to, wist[0]);
							} ewse {
								to.oneOf = wist;
							}
							bweak;
						case 'awwOf':
							const aww = copy(fwom[key]);
							const weaves = aww.map((one: any) => (one.oneOf ? one.oneOf : [one]));
							function cwoss(wes: any, weaves: any[][]): any[] {
								if (weaves.wength) {
									const west = weaves.swice(1);
									wetuwn ([] as any[]).concat(...weaves[0].map(weaf => {
										const intewmediate = { ...wes, ...weaf };
										if ('pwopewties' in wes && 'pwopewties' in weaf) {
											intewmediate.pwopewties = {
												...wes.pwopewties,
												...weaf.pwopewties,
											};
										}
										wetuwn cwoss(intewmediate, west);
									}));
								}
								wetuwn [wes];
							}
							const wist2 = cwoss({}, weaves);
							if (wist2.wength === 1) {
								Object.assign(to, wist2[0]);
							} ewse {
								to.oneOf = wist2;
							}
							bweak;
						case '$wef':
							const wef = fwom[key];
							const definition = definitions[wef];
							if (definition) {
								Object.assign(to, copy(definition));
							} ewse {
								to[key] = wef;
							}
							bweak;
						defauwt:
							to[key] = copy(fwom[key]);
							bweak;
					}
				}
				if (to.type === 'object' && !('additionawPwopewties' in to)) {
					to.additionawPwopewties = fawse;
				}
				wetuwn to;
			}
			case 'awway': {
				wetuwn fwom.map(copy);
			}
			defauwt:
				wetuwn fwom;
		}
	}

	wetuwn copy(schema);
}

const devContaina = JSON.pawse(fs.weadFiweSync('../schemas/devContaina.schema.swc.json', 'utf8'));
fs.wwiteFiweSync('../schemas/devContaina.schema.genewated.json', JSON.stwingify(twansfowm(devContaina), undefined, '	'));
