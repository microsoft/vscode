/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const gulp = require('gulp');
const replace = require('gulp-replace');
const rename = require('gulp-rename');
const es = require('event-stream');
const vfs = require('vinyl-fs');
const { rimraf } = require('./lib/util');
const { getVersion } = require('./lib/getVersion');
const task = require('./lib/task');
const packageJson = require('../package.json');
const product = require('../product.json');
const dependenciesGenerator = require('./linux/dependencies-generator');
const debianRecommendedDependencies = require('./linux/debian/dep-lists').recommendedDeps;
const path = require('path');
const cp = require('child_process');
const util = require('util');

const exec = util.promisify(cp.exec);
const root = path.dirname(__dirname);
const commit = getVersion(root);

const linuxPackageRevision = Math.floor(new Date().getTime() / 1000);

/**
 * @param {string} arch
 */
function getDebPackageArch(arch) {
	return { x64: 'amd64', armhf: 'armhf', arm64: 'arm64' }[arch];
}

function prepareDebPackage(arch) {
	const binaryDir = '../VSCode-linux-' + arch;
	const debArch = getDebPackageArch(arch);
	const destination = '.build/linux/deb/' + debArch + '/' + product.applicationName + '-' + debArch;

	return function () {
		const desktop = gulp.src('resources/linux/code.desktop', { base: '.' })
			.pipe(rename('usr/share/applications/' + product.applicationName + '.desktop'));

		const desktopUrlHandler = gulp.src('resources/linux/code-url-handler.desktop', { base: '.' })
			.pipe(rename('usr/share/applications/' + product.applicationName + '-url-handler.desktop'));

		const desktops = es.merge(desktop, desktopUrlHandler)
			.pipe(replace('@@NAME_LONG@@', product.nameLong))
			.pipe(replace('@@NAME_SHORT@@', product.nameShort))
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(replace('@@EXEC@@', `/usr/share/${product.applicationName}/${product.applicationName}`))
			.pipe(replace('@@ICON@@', product.linuxIconName))
			.pipe(replace('@@URLPROTOCOL@@', product.urlProtocol));

		const appdata = gulp.src('resources/linux/code.appdata.xml', { base: '.' })
			.pipe(replace('@@NAME_LONG@@', product.nameLong))
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(replace('@@LICENSE@@', product.licenseName))
			.pipe(rename('usr/share/appdata/' + product.applicationName + '.appdata.xml'));

		const workspaceMime = gulp.src('resources/linux/code-workspace.xml', { base: '.' })
			.pipe(replace('@@NAME_LONG@@', product.nameLong))
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(rename('usr/share/mime/packages/' + product.applicationName + '-workspace.xml'));

		const icon = gulp.src('resources/linux/code.png', { base: '.' })
			.pipe(rename('usr/share/pixmaps/' + product.linuxIconName + '.png'));

		const bash_completion = gulp.src('resources/completions/bash/code')
			.pipe(replace('@@APPNAME@@', product.applicationName))
			.pipe(rename('usr/share/bash-completion/completions/' + product.applicationName));

		const zsh_completion = gulp.src('resources/completions/zsh/_code')
			.pipe(replace('@@APPNAME@@', product.applicationName))
			.pipe(rename('usr/share/zsh/vendor-completions/_' + product.applicationName));

		const code = gulp.src(binaryDir + '/**/*', { base: binaryDir })
			.pipe(rename(function (p) { p.dirname = 'usr/share/' + product.applicationName + '/' + p.dirname; }));

		let size = 0;
		const control = code.pipe(es.through(
			function (f) { size += f.isDirectory() ? 4096 : f.contents.length; },
			async function () {
				const that = this;
				const dependencies = await dependenciesGenerator.getDependencies('deb', binaryDir, product.applicationName, debArch);
				gulp.src('resources/linux/debian/control.template', { base: '.' })
					.pipe(replace('@@NAME@@', product.applicationName))
					.pipe(replace('@@VERSION@@', packageJson.version + '-' + linuxPackageRevision))
					.pipe(replace('@@ARCHITECTURE@@', debArch))
					.pipe(replace('@@DEPENDS@@', dependencies.join(', ')))
					.pipe(replace('@@RECOMMENDS@@', debianRecommendedDependencies.join(', ')))
					.pipe(replace('@@INSTALLEDSIZE@@', Math.ceil(size / 1024)))
					.pipe(rename('DEBIAN/control'))
					.pipe(es.through(function (f) { that.emit('data', f); }, function () { that.emit('end'); }));
			}));

		const prerm = gulp.src('resources/linux/debian/prerm.template', { base: '.' })
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(rename('DEBIAN/prerm'));

		const postrm = gulp.src('resources/linux/debian/postrm.template', { base: '.' })
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(rename('DEBIAN/postrm'));

		const postinst = gulp.src('resources/linux/debian/postinst.template', { base: '.' })
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(rename('DEBIAN/postinst'));

		const templates = gulp.src('resources/linux/debian/templates.template', { base: '.' })
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(rename('DEBIAN/templates'));

		const all = es.merge(control, templates, postinst, postrm, prerm, desktops, appdata, workspaceMime, icon, bash_completion, zsh_completion, code);

		return all.pipe(vfs.dest(destination));
	};
}

/**
 * @param {string} arch
 */
function buildDebPackage(arch) {
	const debArch = getDebPackageArch(arch);
	const cwd = `.build/linux/deb/${debArch}`;

	return async () => {
		await exec(`chmod 755 ${product.applicationName}-${debArch}/DEBIAN/postinst ${product.applicationName}-${debArch}/DEBIAN/prerm ${product.applicationName}-${debArch}/DEBIAN/postrm`, { cwd });
		await exec('mkdir -p deb', { cwd });
		await exec(`fakeroot dpkg-deb -Zxz -b ${product.applicationName}-${debArch} deb`, { cwd });
	};
}

/**
 * @param {string} rpmArch
 */
function getRpmBuildPath(rpmArch) {
	return '.build/linux/rpm/' + rpmArch + '/rpmbuild';
}

/**
 * @param {string} arch
 */
function getRpmPackageArch(arch) {
	return { x64: 'x86_64', armhf: 'armv7hl', arm64: 'aarch64' }[arch];
}

/**
 * @param {string} arch
 */
function prepareRpmPackage(arch) {
	const binaryDir = '../VSCode-linux-' + arch;
	const rpmArch = getRpmPackageArch(arch);
	const stripBinary = process.env['STRIP'] ?? '/usr/bin/strip';

	return function () {
		const desktop = gulp.src('resources/linux/code.desktop', { base: '.' })
			.pipe(rename('BUILD/usr/share/applications/' + product.applicationName + '.desktop'));

		const desktopUrlHandler = gulp.src('resources/linux/code-url-handler.desktop', { base: '.' })
			.pipe(rename('BUILD/usr/share/applications/' + product.applicationName + '-url-handler.desktop'));

		const desktops = es.merge(desktop, desktopUrlHandler)
			.pipe(replace('@@NAME_LONG@@', product.nameLong))
			.pipe(replace('@@NAME_SHORT@@', product.nameShort))
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(replace('@@EXEC@@', `/usr/share/${product.applicationName}/${product.applicationName}`))
			.pipe(replace('@@ICON@@', product.linuxIconName))
			.pipe(replace('@@URLPROTOCOL@@', product.urlProtocol));

		const appdata = gulp.src('resources/linux/code.appdata.xml', { base: '.' })
			.pipe(replace('@@NAME_LONG@@', product.nameLong))
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(replace('@@LICENSE@@', product.licenseName))
			.pipe(rename('BUILD/usr/share/appdata/' + product.applicationName + '.appdata.xml'));

		const workspaceMime = gulp.src('resources/linux/code-workspace.xml', { base: '.' })
			.pipe(replace('@@NAME_LONG@@', product.nameLong))
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(rename('BUILD/usr/share/mime/packages/' + product.applicationName + '-workspace.xml'));

		const icon = gulp.src('resources/linux/code.png', { base: '.' })
			.pipe(rename('BUILD/usr/share/pixmaps/' + product.linuxIconName + '.png'));

		const bash_completion = gulp.src('resources/completions/bash/code')
			.pipe(replace('@@APPNAME@@', product.applicationName))
			.pipe(rename('BUILD/usr/share/bash-completion/completions/' + product.applicationName));

		const zsh_completion = gulp.src('resources/completions/zsh/_code')
			.pipe(replace('@@APPNAME@@', product.applicationName))
			.pipe(rename('BUILD/usr/share/zsh/site-functions/_' + product.applicationName));

		const code = gulp.src(binaryDir + '/**/*', { base: binaryDir })
			.pipe(rename(function (p) { p.dirname = 'BUILD/usr/share/' + product.applicationName + '/' + p.dirname; }));

		const spec = code.pipe(es.through(
			async function () {
				const that = this;
				const dependencies = await dependenciesGenerator.getDependencies('rpm', binaryDir, product.applicationName, rpmArch);
				gulp.src('resources/linux/rpm/code.spec.template', { base: '.' })
					.pipe(replace('@@NAME@@', product.applicationName))
					.pipe(replace('@@NAME_LONG@@', product.nameLong))
					.pipe(replace('@@ICON@@', product.linuxIconName))
					.pipe(replace('@@VERSION@@', packageJson.version))
					.pipe(replace('@@RELEASE@@', linuxPackageRevision))
					.pipe(replace('@@ARCHITECTURE@@', rpmArch))
					.pipe(replace('@@LICENSE@@', product.licenseName))
					.pipe(replace('@@QUALITY@@', product.quality || '@@QUALITY@@'))
					.pipe(replace('@@UPDATEURL@@', product.updateUrl || '@@UPDATEURL@@'))
					.pipe(replace('@@DEPENDENCIES@@', dependencies.join(', ')))
					.pipe(replace('@@STRIP@@', stripBinary))
					.pipe(rename('SPECS/' + product.applicationName + '.spec'))
					.pipe(es.through(function (f) { that.emit('data', f); }, function () { that.emit('end'); }));
			}));

		const specIcon = gulp.src('resources/linux/rpm/code.xpm', { base: '.' })
			.pipe(rename('SOURCES/' + product.applicationName + '.xpm'));

		const all = es.merge(code, desktops, appdata, workspaceMime, icon, bash_completion, zsh_completion, spec, specIcon);

		return all.pipe(vfs.dest(getRpmBuildPath(rpmArch)));
	};
}

/**
 * @param {string} arch
 */
function buildRpmPackage(arch) {
	const rpmArch = getRpmPackageArch(arch);
	const rpmBuildPath = getRpmBuildPath(rpmArch);
	const rpmOut = `${rpmBuildPath}/RPMS/${rpmArch}`;
	const destination = `.build/linux/rpm/${rpmArch}`;

	return async () => {
		await exec(`mkdir -p ${destination}`);
		await exec(`HOME="$(pwd)/${destination}" rpmbuild -bb ${rpmBuildPath}/SPECS/${product.applicationName}.spec --target=${rpmArch}`);
		await exec(`cp "${rpmOut}/$(ls ${rpmOut})" ${destination}/`);
	};
}

/**
 * @param {string} arch
 */
function getSnapBuildPath(arch) {
	return `.build/linux/snap/${arch}/${product.applicationName}-${arch}`;
}

/**
 * @param {string} arch
 */
function prepareSnapPackage(arch) {
	const binaryDir = '../VSCode-linux-' + arch;
	const destination = getSnapBuildPath(arch);

	return function () {
		// A desktop file that is placed in snap/gui will be placed into meta/gui verbatim.
		const desktop = gulp.src('resources/linux/code.desktop', { base: '.' })
			.pipe(rename(`snap/gui/${product.applicationName}.desktop`));

		// A desktop file that is placed in snap/gui will be placed into meta/gui verbatim.
		const desktopUrlHandler = gulp.src('resources/linux/code-url-handler.desktop', { base: '.' })
			.pipe(rename(`snap/gui/${product.applicationName}-url-handler.desktop`));

		const desktops = es.merge(desktop, desktopUrlHandler)
			.pipe(replace('@@NAME_LONG@@', product.nameLong))
			.pipe(replace('@@NAME_SHORT@@', product.nameShort))
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(replace('@@EXEC@@', `${product.applicationName} --force-user-env`))
			.pipe(replace('@@ICON@@', `\${SNAP}/meta/gui/${product.linuxIconName}.png`))
			.pipe(replace('@@URLPROTOCOL@@', product.urlProtocol));

		// An icon that is placed in snap/gui will be placed into meta/gui verbatim.
		const icon = gulp.src('resources/linux/code.png', { base: '.' })
			.pipe(rename(`snap/gui/${product.linuxIconName}.png`));

		const code = gulp.src(binaryDir + '/**/*', { base: binaryDir })
			.pipe(rename(function (p) { p.dirname = `usr/share/${product.applicationName}/${p.dirname}`; }));

		const snapcraft = gulp.src('resources/linux/snap/snapcraft.yaml', { base: '.' })
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(replace('@@VERSION@@', commit.substr(0, 8)))
			// Possible run-on values https://snapcraft.io/docs/architectures
			.pipe(replace('@@ARCHITECTURE@@', arch === 'x64' ? 'amd64' : arch))
			.pipe(rename('snap/snapcraft.yaml'));

		const electronLaunch = gulp.src('resources/linux/snap/electron-launch', { base: '.' })
			.pipe(rename('electron-launch'));

		const all = es.merge(desktops, icon, code, snapcraft, electronLaunch);

		return all.pipe(vfs.dest(destination));
	};
}

/**
 * @param {string} arch
 */
function buildSnapPackage(arch) {
	const cwd = getSnapBuildPath(arch);
	return () => exec('snapcraft', { cwd });
}

const BUILD_TARGETS = [
	{ arch: 'x64' },
	{ arch: 'armhf' },
	{ arch: 'arm64' },
];

BUILD_TARGETS.forEach(({ arch }) => {
	const debArch = getDebPackageArch(arch);
	const prepareDebTask = task.define(`vscode-linux-${arch}-prepare-deb`, task.series(rimraf(`.build/linux/deb/${debArch}`), prepareDebPackage(arch)));
	gulp.task(prepareDebTask);
	const buildDebTask = task.define(`vscode-linux-${arch}-build-deb`, buildDebPackage(arch));
	gulp.task(buildDebTask);

	const rpmArch = getRpmPackageArch(arch);
	const prepareRpmTask = task.define(`vscode-linux-${arch}-prepare-rpm`, task.series(rimraf(`.build/linux/rpm/${rpmArch}`), prepareRpmPackage(arch)));
	gulp.task(prepareRpmTask);
	const buildRpmTask = task.define(`vscode-linux-${arch}-build-rpm`, buildRpmPackage(arch));
	gulp.task(buildRpmTask);

	const prepareSnapTask = task.define(`vscode-linux-${arch}-prepare-snap`, task.series(rimraf(`.build/linux/snap/${arch}`), prepareSnapPackage(arch)));
	gulp.task(prepareSnapTask);
	const buildSnapTask = task.define(`vscode-linux-${arch}-build-snap`, task.series(prepareSnapTask, buildSnapPackage(arch)));
	gulp.task(buildSnapTask);
});
