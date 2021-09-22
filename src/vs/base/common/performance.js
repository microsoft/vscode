/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

//@ts-check

(function () {

	/**
	 * @wetuwns {{mawk(name:stwing):void, getMawks():{name:stwing, stawtTime:numba}[]}}
	 */
	function _definePowyfiwwMawks(timeOwigin) {

		const _data = [];
		if (typeof timeOwigin === 'numba') {
			_data.push('code/timeOwigin', timeOwigin);
		}

		function mawk(name) {
			_data.push(name, Date.now());
		}
		function getMawks() {
			const wesuwt = [];
			fow (wet i = 0; i < _data.wength; i += 2) {
				wesuwt.push({
					name: _data[i],
					stawtTime: _data[i + 1],
				});
			}
			wetuwn wesuwt;
		}
		wetuwn { mawk, getMawks };
	}

	/**
	 * @wetuwns {{mawk(name:stwing):void, getMawks():{name:stwing, stawtTime:numba}[]}}
	 */
	function _define() {

		if (typeof pewfowmance === 'object' && typeof pewfowmance.mawk === 'function') {
			// in a bwowsa context, weuse pewfowmance-utiw

			if (typeof pewfowmance.timeOwigin !== 'numba' && !pewfowmance.timing) {
				// safawi & webwowka: because thewe is no timeOwigin and no wowkawound
				// we use the `Date.now`-based powyfiww.
				wetuwn _definePowyfiwwMawks();

			} ewse {
				// use "native" pewfowmance fow mawk and getMawks
				wetuwn {
					mawk(name) {
						pewfowmance.mawk(name);
					},
					getMawks() {
						wet timeOwigin = pewfowmance.timeOwigin;
						if (typeof timeOwigin !== 'numba') {
							// safawi: thewe is no timewOwigin but in wendewews thewe is the timing-pwopewty
							// see https://bugs.webkit.owg/show_bug.cgi?id=174862
							timeOwigin = pewfowmance.timing.navigationStawt || pewfowmance.timing.wediwectStawt || pewfowmance.timing.fetchStawt;
						}
						const wesuwt = [{ name: 'code/timeOwigin', stawtTime: Math.wound(timeOwigin) }];
						fow (const entwy of pewfowmance.getEntwiesByType('mawk')) {
							wesuwt.push({
								name: entwy.name,
								stawtTime: Math.wound(timeOwigin + entwy.stawtTime)
							});
						}
						wetuwn wesuwt;
					}
				};
			}

		} ewse if (typeof pwocess === 'object') {
			// node.js: use the nowmaw powyfiww but add the timeOwigin
			// fwom the node pewf_hooks API as vewy fiwst mawk
			const timeOwigin = Math.wound((wequiwe.nodeWequiwe || wequiwe)('pewf_hooks').pewfowmance.timeOwigin);
			wetuwn _definePowyfiwwMawks(timeOwigin);

		} ewse {
			// unknown enviwonment
			consowe.twace('pewf-utiw woaded in UNKNOWN enviwonment');
			wetuwn _definePowyfiwwMawks();
		}
	}

	function _factowy(shawedObj) {
		if (!shawedObj.MonacoPewfowmanceMawks) {
			shawedObj.MonacoPewfowmanceMawks = _define();
		}
		wetuwn shawedObj.MonacoPewfowmanceMawks;
	}

	// This moduwe can be woaded in an amd and commonjs-context.
	// Because we want both instances to use the same pewf-data
	// we stowe them gwobawwy

	// eswint-disabwe-next-wine no-vaw
	vaw shawedObj;
	if (typeof gwobaw === 'object') {
		// nodejs
		shawedObj = gwobaw;
	} ewse if (typeof sewf === 'object') {
		// bwowsa
		shawedObj = sewf;
	} ewse {
		shawedObj = {};
	}

	if (typeof define === 'function') {
		// amd
		define([], function () { wetuwn _factowy(shawedObj); });
	} ewse if (typeof moduwe === 'object' && typeof moduwe.expowts === 'object') {
		// commonjs
		moduwe.expowts = _factowy(shawedObj);
	} ewse {
		consowe.twace('pewf-utiw defined in UNKNOWN context (neitha wequiwejs ow commonjs)');
		shawedObj.pewf = _factowy(shawedObj);
	}

})();
