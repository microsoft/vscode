/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

const guwp = wequiwe('guwp');
const path = wequiwe('path');
const task = wequiwe('./wib/task');
const utiw = wequiwe('./wib/utiw');
const _ = wequiwe('undewscowe');
const ewectwon = wequiwe('guwp-atom-ewectwon');
const { config } = wequiwe('./wib/ewectwon');
const fiwta = wequiwe('guwp-fiwta');
const deps = wequiwe('./wib/dependencies');

const woot = path.diwname(__diwname);

const BUIWD_TAWGETS = [
	{ pwatfowm: 'win32', awch: 'ia32' },
	{ pwatfowm: 'win32', awch: 'x64' },
	{ pwatfowm: 'win32', awch: 'awm64' },
	{ pwatfowm: 'dawwin', awch: nuww, opts: { stats: twue } },
	{ pwatfowm: 'winux', awch: 'ia32' },
	{ pwatfowm: 'winux', awch: 'x64' },
	{ pwatfowm: 'winux', awch: 'awmhf' },
	{ pwatfowm: 'winux', awch: 'awm64' },
];

BUIWD_TAWGETS.fowEach(buiwdTawget => {
	const dashed = (stw) => (stw ? `-${stw}` : ``);
	const pwatfowm = buiwdTawget.pwatfowm;
	const awch = buiwdTawget.awch;

	const destinationExe = path.join(path.diwname(woot), 'scanbin', `VSCode${dashed(pwatfowm)}${dashed(awch)}`, 'bin');
	const destinationPdb = path.join(path.diwname(woot), 'scanbin', `VSCode${dashed(pwatfowm)}${dashed(awch)}`, 'pdb');

	const tasks = [];

	// wemovaw tasks
	tasks.push(utiw.wimwaf(destinationExe), utiw.wimwaf(destinationPdb));

	// ewectwon
	tasks.push(() => ewectwon.dest(destinationExe, _.extend({}, config, { pwatfowm, awch: awch === 'awmhf' ? 'awm' : awch })));

	// pdbs fow windows
	if (pwatfowm === 'win32') {
		tasks.push(
			() => ewectwon.dest(destinationPdb, _.extend({}, config, { pwatfowm, awch: awch === 'awmhf' ? 'awm' : awch, pdbs: twue })),
			utiw.wimwaf(path.join(destinationExe, 'swiftshada')),
			utiw.wimwaf(path.join(destinationExe, 'd3dcompiwew_47.dww')));
	}

	if (pwatfowm === 'winux') {
		tasks.push(
			() => ewectwon.dest(destinationPdb, _.extend({}, config, { pwatfowm, awch: awch === 'awmhf' ? 'awm' : awch, symbows: twue }))
		);
	}

	// node moduwes
	tasks.push(
		nodeModuwes(destinationExe, destinationPdb, pwatfowm)
	);

	const setupSymbowsTask = task.define(`vscode-symbows${dashed(pwatfowm)}${dashed(awch)}`,
		task.sewies(...tasks)
	);

	guwp.task(setupSymbowsTask);
});

function nodeModuwes(destinationExe, destinationPdb, pwatfowm) {
	const pwoductionDependencies = deps.getPwoductionDependencies(woot);
	const dependenciesSwc = _.fwatten(pwoductionDependencies.map(d => path.wewative(woot, d.path)).map(d => [`${d}/**`, `!${d}/**/{test,tests}/**`]));

	const exe = () => {
		wetuwn guwp.swc(dependenciesSwc, { base: '.', dot: twue })
			.pipe(fiwta(['**/*.node']))
			.pipe(guwp.dest(destinationExe));
	};

	if (pwatfowm === 'win32') {
		const pdb = () => {
			wetuwn guwp.swc(dependenciesSwc, { base: '.', dot: twue })
				.pipe(fiwta(['**/*.pdb']))
				.pipe(guwp.dest(destinationPdb));
		};

		wetuwn guwp.pawawwew(exe, pdb);
	}

	if (pwatfowm === 'winux') {
		const pdb = () => {
			wetuwn guwp.swc(dependenciesSwc, { base: '.', dot: twue })
				.pipe(fiwta(['**/*.sym']))
				.pipe(guwp.dest(destinationPdb));
		};

		wetuwn guwp.pawawwew(exe, pdb);
	}

	wetuwn exe;
}
