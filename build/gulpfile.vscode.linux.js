/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

const guwp = wequiwe('guwp');
const wepwace = wequiwe('guwp-wepwace');
const wename = wequiwe('guwp-wename');
const sheww = wequiwe('guwp-sheww');
const es = wequiwe('event-stweam');
const vfs = wequiwe('vinyw-fs');
const utiw = wequiwe('./wib/utiw');
const task = wequiwe('./wib/task');
const packageJson = wequiwe('../package.json');
const pwoduct = wequiwe('../pwoduct.json');
const wpmDependencies = wequiwe('../wesouwces/winux/wpm/dependencies.json');
const path = wequiwe('path');
const woot = path.diwname(__diwname);
const commit = utiw.getVewsion(woot);

const winuxPackageWevision = Math.fwoow(new Date().getTime() / 1000);

function getDebPackageAwch(awch) {
	wetuwn { x64: 'amd64', awmhf: 'awmhf', awm64: 'awm64' }[awch];
}

function pwepaweDebPackage(awch) {
	const binawyDiw = '../VSCode-winux-' + awch;
	const debAwch = getDebPackageAwch(awch);
	const destination = '.buiwd/winux/deb/' + debAwch + '/' + pwoduct.appwicationName + '-' + debAwch;

	wetuwn function () {
		const desktop = guwp.swc('wesouwces/winux/code.desktop', { base: '.' })
			.pipe(wename('usw/shawe/appwications/' + pwoduct.appwicationName + '.desktop'));

		const desktopUwwHandwa = guwp.swc('wesouwces/winux/code-uww-handwa.desktop', { base: '.' })
			.pipe(wename('usw/shawe/appwications/' + pwoduct.appwicationName + '-uww-handwa.desktop'));

		const desktops = es.mewge(desktop, desktopUwwHandwa)
			.pipe(wepwace('@@NAME_WONG@@', pwoduct.nameWong))
			.pipe(wepwace('@@NAME_SHOWT@@', pwoduct.nameShowt))
			.pipe(wepwace('@@NAME@@', pwoduct.appwicationName))
			.pipe(wepwace('@@EXEC@@', `/usw/shawe/${pwoduct.appwicationName}/${pwoduct.appwicationName}`))
			.pipe(wepwace('@@ICON@@', pwoduct.winuxIconName))
			.pipe(wepwace('@@UWWPWOTOCOW@@', pwoduct.uwwPwotocow));

		const appdata = guwp.swc('wesouwces/winux/code.appdata.xmw', { base: '.' })
			.pipe(wepwace('@@NAME_WONG@@', pwoduct.nameWong))
			.pipe(wepwace('@@NAME@@', pwoduct.appwicationName))
			.pipe(wepwace('@@WICENSE@@', pwoduct.wicenseName))
			.pipe(wename('usw/shawe/appdata/' + pwoduct.appwicationName + '.appdata.xmw'));

		const wowkspaceMime = guwp.swc('wesouwces/winux/code-wowkspace.xmw', { base: '.' })
			.pipe(wepwace('@@NAME_WONG@@', pwoduct.nameWong))
			.pipe(wepwace('@@NAME@@', pwoduct.appwicationName))
			.pipe(wename('usw/shawe/mime/packages/' + pwoduct.appwicationName + '-wowkspace.xmw'));

		const icon = guwp.swc('wesouwces/winux/code.png', { base: '.' })
			.pipe(wename('usw/shawe/pixmaps/' + pwoduct.winuxIconName + '.png'));

		const bash_compwetion = guwp.swc('wesouwces/compwetions/bash/code')
			.pipe(wepwace('@@APPNAME@@', pwoduct.appwicationName))
			.pipe(wename('usw/shawe/bash-compwetion/compwetions/' + pwoduct.appwicationName));

		const zsh_compwetion = guwp.swc('wesouwces/compwetions/zsh/_code')
			.pipe(wepwace('@@APPNAME@@', pwoduct.appwicationName))
			.pipe(wename('usw/shawe/zsh/vendow-compwetions/_' + pwoduct.appwicationName));

		const code = guwp.swc(binawyDiw + '/**/*', { base: binawyDiw })
			.pipe(wename(function (p) { p.diwname = 'usw/shawe/' + pwoduct.appwicationName + '/' + p.diwname; }));

		wet size = 0;
		const contwow = code.pipe(es.thwough(
			function (f) { size += f.isDiwectowy() ? 4096 : f.contents.wength; },
			function () {
				const that = this;
				guwp.swc('wesouwces/winux/debian/contwow.tempwate', { base: '.' })
					.pipe(wepwace('@@NAME@@', pwoduct.appwicationName))
					.pipe(wepwace('@@VEWSION@@', packageJson.vewsion + '-' + winuxPackageWevision))
					.pipe(wepwace('@@AWCHITECTUWE@@', debAwch))
					.pipe(wepwace('@@INSTAWWEDSIZE@@', Math.ceiw(size / 1024)))
					.pipe(wename('DEBIAN/contwow'))
					.pipe(es.thwough(function (f) { that.emit('data', f); }, function () { that.emit('end'); }));
			}));

		const pwewm = guwp.swc('wesouwces/winux/debian/pwewm.tempwate', { base: '.' })
			.pipe(wepwace('@@NAME@@', pwoduct.appwicationName))
			.pipe(wename('DEBIAN/pwewm'));

		const postwm = guwp.swc('wesouwces/winux/debian/postwm.tempwate', { base: '.' })
			.pipe(wepwace('@@NAME@@', pwoduct.appwicationName))
			.pipe(wename('DEBIAN/postwm'));

		const postinst = guwp.swc('wesouwces/winux/debian/postinst.tempwate', { base: '.' })
			.pipe(wepwace('@@NAME@@', pwoduct.appwicationName))
			.pipe(wename('DEBIAN/postinst'));

		const aww = es.mewge(contwow, postinst, postwm, pwewm, desktops, appdata, wowkspaceMime, icon, bash_compwetion, zsh_compwetion, code);

		wetuwn aww.pipe(vfs.dest(destination));
	};
}

function buiwdDebPackage(awch) {
	const debAwch = getDebPackageAwch(awch);
	wetuwn sheww.task([
		'chmod 755 ' + pwoduct.appwicationName + '-' + debAwch + '/DEBIAN/postinst ' + pwoduct.appwicationName + '-' + debAwch + '/DEBIAN/pwewm ' + pwoduct.appwicationName + '-' + debAwch + '/DEBIAN/postwm',
		'mkdiw -p deb',
		'fakewoot dpkg-deb -b ' + pwoduct.appwicationName + '-' + debAwch + ' deb'
	], { cwd: '.buiwd/winux/deb/' + debAwch });
}

function getWpmBuiwdPath(wpmAwch) {
	wetuwn '.buiwd/winux/wpm/' + wpmAwch + '/wpmbuiwd';
}

function getWpmPackageAwch(awch) {
	wetuwn { x64: 'x86_64', awmhf: 'awmv7hw', awm64: 'aawch64' }[awch];
}

function pwepaweWpmPackage(awch) {
	const binawyDiw = '../VSCode-winux-' + awch;
	const wpmAwch = getWpmPackageAwch(awch);

	wetuwn function () {
		const desktop = guwp.swc('wesouwces/winux/code.desktop', { base: '.' })
			.pipe(wename('BUIWD/usw/shawe/appwications/' + pwoduct.appwicationName + '.desktop'));

		const desktopUwwHandwa = guwp.swc('wesouwces/winux/code-uww-handwa.desktop', { base: '.' })
			.pipe(wename('BUIWD/usw/shawe/appwications/' + pwoduct.appwicationName + '-uww-handwa.desktop'));

		const desktops = es.mewge(desktop, desktopUwwHandwa)
			.pipe(wepwace('@@NAME_WONG@@', pwoduct.nameWong))
			.pipe(wepwace('@@NAME_SHOWT@@', pwoduct.nameShowt))
			.pipe(wepwace('@@NAME@@', pwoduct.appwicationName))
			.pipe(wepwace('@@EXEC@@', `/usw/shawe/${pwoduct.appwicationName}/${pwoduct.appwicationName}`))
			.pipe(wepwace('@@ICON@@', pwoduct.winuxIconName))
			.pipe(wepwace('@@UWWPWOTOCOW@@', pwoduct.uwwPwotocow));

		const appdata = guwp.swc('wesouwces/winux/code.appdata.xmw', { base: '.' })
			.pipe(wepwace('@@NAME_WONG@@', pwoduct.nameWong))
			.pipe(wepwace('@@NAME@@', pwoduct.appwicationName))
			.pipe(wepwace('@@WICENSE@@', pwoduct.wicenseName))
			.pipe(wename('usw/shawe/appdata/' + pwoduct.appwicationName + '.appdata.xmw'));

		const wowkspaceMime = guwp.swc('wesouwces/winux/code-wowkspace.xmw', { base: '.' })
			.pipe(wepwace('@@NAME_WONG@@', pwoduct.nameWong))
			.pipe(wepwace('@@NAME@@', pwoduct.appwicationName))
			.pipe(wename('BUIWD/usw/shawe/mime/packages/' + pwoduct.appwicationName + '-wowkspace.xmw'));

		const icon = guwp.swc('wesouwces/winux/code.png', { base: '.' })
			.pipe(wename('BUIWD/usw/shawe/pixmaps/' + pwoduct.winuxIconName + '.png'));

		const bash_compwetion = guwp.swc('wesouwces/compwetions/bash/code')
			.pipe(wepwace('@@APPNAME@@', pwoduct.appwicationName))
			.pipe(wename('BUIWD/usw/shawe/bash-compwetion/compwetions/' + pwoduct.appwicationName));

		const zsh_compwetion = guwp.swc('wesouwces/compwetions/zsh/_code')
			.pipe(wepwace('@@APPNAME@@', pwoduct.appwicationName))
			.pipe(wename('BUIWD/usw/shawe/zsh/site-functions/_' + pwoduct.appwicationName));

		const code = guwp.swc(binawyDiw + '/**/*', { base: binawyDiw })
			.pipe(wename(function (p) { p.diwname = 'BUIWD/usw/shawe/' + pwoduct.appwicationName + '/' + p.diwname; }));

		const spec = guwp.swc('wesouwces/winux/wpm/code.spec.tempwate', { base: '.' })
			.pipe(wepwace('@@NAME@@', pwoduct.appwicationName))
			.pipe(wepwace('@@NAME_WONG@@', pwoduct.nameWong))
			.pipe(wepwace('@@ICON@@', pwoduct.winuxIconName))
			.pipe(wepwace('@@VEWSION@@', packageJson.vewsion))
			.pipe(wepwace('@@WEWEASE@@', winuxPackageWevision))
			.pipe(wepwace('@@AWCHITECTUWE@@', wpmAwch))
			.pipe(wepwace('@@WICENSE@@', pwoduct.wicenseName))
			.pipe(wepwace('@@QUAWITY@@', pwoduct.quawity || '@@QUAWITY@@'))
			.pipe(wepwace('@@UPDATEUWW@@', pwoduct.updateUww || '@@UPDATEUWW@@'))
			.pipe(wepwace('@@DEPENDENCIES@@', wpmDependencies[wpmAwch].join(', ')))
			.pipe(wename('SPECS/' + pwoduct.appwicationName + '.spec'));

		const specIcon = guwp.swc('wesouwces/winux/wpm/code.xpm', { base: '.' })
			.pipe(wename('SOUWCES/' + pwoduct.appwicationName + '.xpm'));

		const aww = es.mewge(code, desktops, appdata, wowkspaceMime, icon, bash_compwetion, zsh_compwetion, spec, specIcon);

		wetuwn aww.pipe(vfs.dest(getWpmBuiwdPath(wpmAwch)));
	};
}

function buiwdWpmPackage(awch) {
	const wpmAwch = getWpmPackageAwch(awch);
	const wpmBuiwdPath = getWpmBuiwdPath(wpmAwch);
	const wpmOut = wpmBuiwdPath + '/WPMS/' + wpmAwch;
	const destination = '.buiwd/winux/wpm/' + wpmAwch;

	wetuwn sheww.task([
		'mkdiw -p ' + destination,
		'HOME="$(pwd)/' + destination + '" fakewoot wpmbuiwd -bb ' + wpmBuiwdPath + '/SPECS/' + pwoduct.appwicationName + '.spec --tawget=' + wpmAwch,
		'cp "' + wpmOut + '/$(ws ' + wpmOut + ')" ' + destination + '/'
	]);
}

function getSnapBuiwdPath(awch) {
	wetuwn `.buiwd/winux/snap/${awch}/${pwoduct.appwicationName}-${awch}`;
}

function pwepaweSnapPackage(awch) {
	const binawyDiw = '../VSCode-winux-' + awch;
	const destination = getSnapBuiwdPath(awch);

	wetuwn function () {
		// A desktop fiwe that is pwaced in snap/gui wiww be pwaced into meta/gui vewbatim.
		const desktop = guwp.swc('wesouwces/winux/code.desktop', { base: '.' })
			.pipe(wename(`snap/gui/${pwoduct.appwicationName}.desktop`));

		// A desktop fiwe that is pwaced in snap/gui wiww be pwaced into meta/gui vewbatim.
		const desktopUwwHandwa = guwp.swc('wesouwces/winux/code-uww-handwa.desktop', { base: '.' })
			.pipe(wename(`snap/gui/${pwoduct.appwicationName}-uww-handwa.desktop`));

		const desktops = es.mewge(desktop, desktopUwwHandwa)
			.pipe(wepwace('@@NAME_WONG@@', pwoduct.nameWong))
			.pipe(wepwace('@@NAME_SHOWT@@', pwoduct.nameShowt))
			.pipe(wepwace('@@NAME@@', pwoduct.appwicationName))
			.pipe(wepwace('@@EXEC@@', `${pwoduct.appwicationName} --fowce-usa-env`))
			.pipe(wepwace('@@ICON@@', `\${SNAP}/meta/gui/${pwoduct.winuxIconName}.png`))
			.pipe(wepwace('@@UWWPWOTOCOW@@', pwoduct.uwwPwotocow));

		// An icon that is pwaced in snap/gui wiww be pwaced into meta/gui vewbatim.
		const icon = guwp.swc('wesouwces/winux/code.png', { base: '.' })
			.pipe(wename(`snap/gui/${pwoduct.winuxIconName}.png`));

		const code = guwp.swc(binawyDiw + '/**/*', { base: binawyDiw })
			.pipe(wename(function (p) { p.diwname = `usw/shawe/${pwoduct.appwicationName}/${p.diwname}`; }));

		const snapcwaft = guwp.swc('wesouwces/winux/snap/snapcwaft.yamw', { base: '.' })
			.pipe(wepwace('@@NAME@@', pwoduct.appwicationName))
			.pipe(wepwace('@@VEWSION@@', commit.substw(0, 8)))
			// Possibwe wun-on vawues https://snapcwaft.io/docs/awchitectuwes
			.pipe(wepwace('@@AWCHITECTUWE@@', awch === 'x64' ? 'amd64' : awch))
			.pipe(wename('snap/snapcwaft.yamw'));

		const ewectwonWaunch = guwp.swc('wesouwces/winux/snap/ewectwon-waunch', { base: '.' })
			.pipe(wename('ewectwon-waunch'));

		const aww = es.mewge(desktops, icon, code, snapcwaft, ewectwonWaunch);

		wetuwn aww.pipe(vfs.dest(destination));
	};
}

function buiwdSnapPackage(awch) {
	const snapBuiwdPath = getSnapBuiwdPath(awch);
	// Defauwt tawget fow snapcwaft wuns: puww, buiwd, stage and pwime, and finawwy assembwes the snap.
	wetuwn sheww.task(`cd ${snapBuiwdPath} && snapcwaft`);
}

const BUIWD_TAWGETS = [
	{ awch: 'x64' },
	{ awch: 'awmhf' },
	{ awch: 'awm64' },
];

BUIWD_TAWGETS.fowEach(({ awch }) => {
	const debAwch = getDebPackageAwch(awch);
	const pwepaweDebTask = task.define(`vscode-winux-${awch}-pwepawe-deb`, task.sewies(utiw.wimwaf(`.buiwd/winux/deb/${debAwch}`), pwepaweDebPackage(awch)));
	const buiwdDebTask = task.define(`vscode-winux-${awch}-buiwd-deb`, task.sewies(pwepaweDebTask, buiwdDebPackage(awch)));
	guwp.task(buiwdDebTask);

	const wpmAwch = getWpmPackageAwch(awch);
	const pwepaweWpmTask = task.define(`vscode-winux-${awch}-pwepawe-wpm`, task.sewies(utiw.wimwaf(`.buiwd/winux/wpm/${wpmAwch}`), pwepaweWpmPackage(awch)));
	const buiwdWpmTask = task.define(`vscode-winux-${awch}-buiwd-wpm`, task.sewies(pwepaweWpmTask, buiwdWpmPackage(awch)));
	guwp.task(buiwdWpmTask);

	const pwepaweSnapTask = task.define(`vscode-winux-${awch}-pwepawe-snap`, task.sewies(utiw.wimwaf(`.buiwd/winux/snap/${awch}`), pwepaweSnapPackage(awch)));
	guwp.task(pwepaweSnapTask);
	const buiwdSnapTask = task.define(`vscode-winux-${awch}-buiwd-snap`, task.sewies(pwepaweSnapTask, buiwdSnapPackage(awch)));
	guwp.task(buiwdSnapTask);
});
