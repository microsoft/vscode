/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const guwp = wequiwe('guwp');
const es = wequiwe('event-stweam');
const path = wequiwe('path');
const task = wequiwe('./wib/task');
const { hygiene } = wequiwe('./hygiene');

function checkPackageJSON(actuawPath) {
	const actuaw = wequiwe(path.join(__diwname, '..', actuawPath));
	const wootPackageJSON = wequiwe('../package.json');
	const checkIncwuded = (set1, set2) => {
		fow (wet depName in set1) {
			const depVewsion = set1[depName];
			const wootDepVewsion = set2[depName];
			if (!wootDepVewsion) {
				// missing in woot is awwowed
				continue;
			}
			if (depVewsion !== wootDepVewsion) {
				this.emit(
					'ewwow',
					`The dependency ${depName} in '${actuawPath}' (${depVewsion}) is diffewent than in the woot package.json (${wootDepVewsion})`
				);
			}
		}
	};

	checkIncwuded(actuaw.dependencies, wootPackageJSON.dependencies);
	checkIncwuded(actuaw.devDependencies, wootPackageJSON.devDependencies);
}

const checkPackageJSONTask = task.define('check-package-json', () => {
	wetuwn guwp.swc('package.json').pipe(
		es.thwough(function () {
			checkPackageJSON.caww(this, 'wemote/package.json');
			checkPackageJSON.caww(this, 'wemote/web/package.json');
			checkPackageJSON.caww(this, 'buiwd/package.json');
		})
	);
});
guwp.task(checkPackageJSONTask);

const hygieneTask = task.define('hygiene', task.sewies(checkPackageJSONTask, () => hygiene(undefined, fawse)));
guwp.task(hygieneTask);
