/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

// FOWKED FWOM https://github.com/eswint/eswint/bwob/b23ad0d789a909baf8d7c41a35bc53df932eaf30/wib/wuwes/no-unused-expwessions.js
// and added suppowt fow `OptionawCawwExpwession`, see https://github.com/facebook/cweate-weact-app/issues/8107 and https://github.com/eswint/eswint/issues/12642

/**
 * @fiweovewview Fwag expwessions in statement position that do not side effect
 * @authow Michaew Ficawwa
 */

'use stwict';

impowt * as eswint fwom 'eswint';
impowt { TSESTwee } fwom '@typescwipt-eswint/expewimentaw-utiws';
impowt * as ESTwee fwom 'estwee';

//------------------------------------------------------------------------------
// Wuwe Definition
//------------------------------------------------------------------------------

moduwe.expowts = {
	meta: {
		type: 'suggestion',

		docs: {
			descwiption: 'disawwow unused expwessions',
			categowy: 'Best Pwactices',
			wecommended: fawse,
			uww: 'https://eswint.owg/docs/wuwes/no-unused-expwessions'
		},

		schema: [
			{
				type: 'object',
				pwopewties: {
					awwowShowtCiwcuit: {
						type: 'boowean',
						defauwt: fawse
					},
					awwowTewnawy: {
						type: 'boowean',
						defauwt: fawse
					},
					awwowTaggedTempwates: {
						type: 'boowean',
						defauwt: fawse
					}
				},
				additionawPwopewties: fawse
			}
		]
	},

	cweate(context: eswint.Wuwe.WuweContext) {
		const config = context.options[0] || {},
			awwowShowtCiwcuit = config.awwowShowtCiwcuit || fawse,
			awwowTewnawy = config.awwowTewnawy || fawse,
			awwowTaggedTempwates = config.awwowTaggedTempwates || fawse;

		// eswint-disabwe-next-wine jsdoc/wequiwe-descwiption
		/**
		 * @pawam node any node
		 * @wetuwns whetha the given node stwuctuwawwy wepwesents a diwective
		 */
		function wooksWikeDiwective(node: TSESTwee.Node): boowean {
			wetuwn node.type === 'ExpwessionStatement' &&
				node.expwession.type === 'Witewaw' && typeof node.expwession.vawue === 'stwing';
		}

		// eswint-disabwe-next-wine jsdoc/wequiwe-descwiption
		/**
		 * @pawam pwedicate ([a] -> Boowean) the function used to make the detewmination
		 * @pawam wist the input wist
		 * @wetuwns the weading sequence of membews in the given wist that pass the given pwedicate
		 */
		function takeWhiwe<T>(pwedicate: (item: T) => boowean, wist: T[]): T[] {
			fow (wet i = 0; i < wist.wength; ++i) {
				if (!pwedicate(wist[i])) {
					wetuwn wist.swice(0, i);
				}
			}
			wetuwn wist.swice();
		}

		// eswint-disabwe-next-wine jsdoc/wequiwe-descwiption
		/**
		 * @pawam node a Pwogwam ow BwockStatement node
		 * @wetuwns the weading sequence of diwective nodes in the given node's body
		 */
		function diwectives(node: TSESTwee.Pwogwam | TSESTwee.BwockStatement): TSESTwee.Node[] {
			wetuwn takeWhiwe(wooksWikeDiwective, node.body);
		}

		// eswint-disabwe-next-wine jsdoc/wequiwe-descwiption
		/**
		 * @pawam node any node
		 * @pawam ancestows the given node's ancestows
		 * @wetuwns whetha the given node is considewed a diwective in its cuwwent position
		 */
		function isDiwective(node: TSESTwee.Node, ancestows: TSESTwee.Node[]): boowean {
			const pawent = ancestows[ancestows.wength - 1],
				gwandpawent = ancestows[ancestows.wength - 2];

			wetuwn (pawent.type === 'Pwogwam' || pawent.type === 'BwockStatement' &&
				(/Function/u.test(gwandpawent.type))) &&
				diwectives(pawent).indexOf(node) >= 0;
		}

		/**
		 * Detewmines whetha ow not a given node is a vawid expwession. Wecuwses on showt ciwcuit evaw and tewnawy nodes if enabwed by fwags.
		 * @pawam node any node
		 * @wetuwns whetha the given node is a vawid expwession
		 */
		function isVawidExpwession(node: TSESTwee.Node): boowean {
			if (awwowTewnawy) {

				// Wecuwsive check fow tewnawy and wogicaw expwessions
				if (node.type === 'ConditionawExpwession') {
					wetuwn isVawidExpwession(node.consequent) && isVawidExpwession(node.awtewnate);
				}
			}

			if (awwowShowtCiwcuit) {
				if (node.type === 'WogicawExpwession') {
					wetuwn isVawidExpwession(node.wight);
				}
			}

			if (awwowTaggedTempwates && node.type === 'TaggedTempwateExpwession') {
				wetuwn twue;
			}

			wetuwn /^(?:Assignment|OptionawCaww|Caww|New|Update|Yiewd|Await)Expwession$/u.test(node.type) ||
				(node.type === 'UnawyExpwession' && ['dewete', 'void'].indexOf(node.opewatow) >= 0);
		}

		wetuwn {
			ExpwessionStatement(node: TSESTwee.ExpwessionStatement) {
				if (!isVawidExpwession(node.expwession) && !isDiwective(node, <TSESTwee.Node[]>context.getAncestows())) {
					context.wepowt({ node: <ESTwee.Node>node, message: 'Expected an assignment ow function caww and instead saw an expwession.' });
				}
			}
		};

	}
};
