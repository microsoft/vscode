/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const gulp = require('gulp');
const replace = require('gulp-replace');
const rename = require('gulp-rename');
const shell = require('gulp-shell');
const es = require('event-stream');
const vfs = require('vinyl-fs');
const util = require('./lib/util');
// @ts-ignore Microsoft/TypeScript#21262 complains about a require of a JSON file
const packageJson = require('../package.json');
// @ts-ignore Microsoft/TypeScript#21262 complains about a require of a JSON file
const product = require('../product.json');
// @ts-ignore Microsoft/TypeScript#21262 complains about a require of a JSON file
const rpmDependencies = require('../resources/linux/rpm/dependencies.json');

const linuxPackageRevision = Math.floor(new Date().getTime() / 1000);

function getDebPackageArch(arch) {
	return { x64: 'amd64', ia32: 'i386', arm: 'armhf' }[arch];
}

function prepareDebPackage(arch) {
	const binaryDir = '../VSCode-linux-' + arch;
	const debArch = getDebPackageArch(arch);
	const destination = '.build/linux/deb/' + debArch + '/' + product.applicationName + '-' + debArch;

	return function () {
		const desktop = gulp.src('resources/linux/code.desktop', { base: '.' })
			.pipe(replace('@@NAME_LONG@@', product.nameLong))
			.pipe(replace('@@NAME_SHORT@@', product.nameShort))
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(replace('@@ICON@@', product.applicationName))
			.pipe(rename('usr/share/applications/' + product.applicationName + '.desktop'));

		const appdata = gulp.src('resources/linux/code.appdata.xml', { base: '.' })
			.pipe(replace('@@NAME_LONG@@', product.nameLong))
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(replace('@@LICENSE@@', product.licenseName))
			.pipe(rename('usr/share/appdata/' + product.applicationName + '.appdata.xml'));

		const icon = gulp.src('resources/linux/code.png', { base: '.' })
			.pipe(rename('usr/share/pixmaps/' + product.applicationName + '.png'));

		const code = gulp.src(binaryDir + '/**/*', { base: binaryDir })
			.pipe(rename(function (p) { p.dirname = 'usr/share/' + product.applicationName + '/' + p.dirname; }));

		let size = 0;
		const control = code.pipe(es.through(
			function (f) { size += f.isDirectory() ? 4096 : f.contents.length; },
			function () {
				const that = this;
				gulp.src('resources/linux/debian/control.template', { base: '.' })
					.pipe(replace('@@NAME@@', product.applicationName))
					.pipe(replace('@@VERSION@@', packageJson.version + '-' + linuxPackageRevision))
					.pipe(replace('@@ARCHITECTURE@@', debArch))
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
			.pipe(replace('@@ARCHITECTURE@@', debArch))
			.pipe(replace('@@QUALITY@@', product.quality || '@@QUALITY@@'))
			.pipe(replace('@@UPDATEURL@@', product.updateUrl || '@@UPDATEURL@@'))
			.pipe(rename('DEBIAN/postinst'));

		const all = es.merge(control, postinst, postrm, prerm, desktop, appdata, icon, code);

		return all.pipe(vfs.dest(destination));
	};
}

function buildDebPackage(arch) {
	const debArch = getDebPackageArch(arch);
	return shell.task([
		'chmod 755 ' + product.applicationName + '-' + debArch + '/DEBIAN/postinst ' + product.applicationName + '-' + debArch + '/DEBIAN/prerm ' + product.applicationName + '-' + debArch + '/DEBIAN/postrm',
		'mkdir -p deb',
		'fakeroot dpkg-deb -b ' + product.applicationName + '-' + debArch + ' deb'
	], { cwd: '.build/linux/deb/' + debArch });
}

function getRpmBuildPath(rpmArch) {
	return '.build/linux/rpm/' + rpmArch + '/rpmbuild';
}

function getRpmPackageArch(arch) {
	return { x64: 'x86_64', ia32: 'i386', arm: 'armhf' }[arch];
}

function prepareRpmPackage(arch) {
	const binaryDir = '../VSCode-linux-' + arch;
	const rpmArch = getRpmPackageArch(arch);

	return function () {
		const desktop = gulp.src('resources/linux/code.desktop', { base: '.' })
			.pipe(replace('@@NAME_LONG@@', product.nameLong))
			.pipe(replace('@@NAME_SHORT@@', product.nameShort))
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(replace('@@ICON@@', product.applicationName))
			.pipe(rename('BUILD/usr/share/applications/' + product.applicationName + '.desktop'));

		const appdata = gulp.src('resources/linux/code.appdata.xml', { base: '.' })
			.pipe(replace('@@NAME_LONG@@', product.nameLong))
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(replace('@@LICENSE@@', product.licenseName))
			.pipe(rename('usr/share/appdata/' + product.applicationName + '.appdata.xml'));

		const icon = gulp.src('resources/linux/code.png', { base: '.' })
			.pipe(rename('BUILD/usr/share/pixmaps/' + product.applicationName + '.png'));

		const code = gulp.src(binaryDir + '/**/*', { base: binaryDir })
			.pipe(rename(function (p) { p.dirname = 'BUILD/usr/share/' + product.applicationName + '/' + p.dirname; }));

		const spec = gulp.src('resources/linux/rpm/code.spec.template', { base: '.' })
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(replace('@@NAME_LONG@@', product.nameLong))
			.pipe(replace('@@VERSION@@', packageJson.version))
			.pipe(replace('@@RELEASE@@', linuxPackageRevision))
			.pipe(replace('@@ARCHITECTURE@@', rpmArch))
			.pipe(replace('@@LICENSE@@', product.licenseName))
			.pipe(replace('@@QUALITY@@', product.quality || '@@QUALITY@@'))
			.pipe(replace('@@UPDATEURL@@', product.updateUrl || '@@UPDATEURL@@'))
			.pipe(replace('@@DEPENDENCIES@@', rpmDependencies[rpmArch].join(', ')))
			.pipe(rename('SPECS/' + product.applicationName + '.spec'));

		const specIcon = gulp.src('resources/linux/rpm/code.xpm', { base: '.' })
			.pipe(rename('SOURCES/' + product.applicationName + '.xpm'));

		const all = es.merge(code, desktop, appdata, icon, spec, specIcon);

		return all.pipe(vfs.dest(getRpmBuildPath(rpmArch)));
	};
}

function buildRpmPackage(arch) {
	const rpmArch = getRpmPackageArch(arch);
	const rpmBuildPath = getRpmBuildPath(rpmArch);
	const rpmOut = rpmBuildPath + '/RPMS/' + rpmArch;
	const destination = '.build/linux/rpm/' + rpmArch;

	return shell.task([
		'mkdir -p ' + destination,
		'HOME="$(pwd)/' + destination + '" fakeroot rpmbuild -bb ' + rpmBuildPath + '/SPECS/' + product.applicationName + '.spec --target=' + rpmArch,
		'cp "' + rpmOut + '/$(ls ' + rpmOut + ')" ' + destination + '/'
	]);
}
function getSnapBuildPath(arch) {
	return `.build/linux/snap/${arch}/${product.applicationName}-${arch}`;
}

function prepareSnapPackage(arch) {
	const binaryDir = '../VSCode-linux-' + arch;
	const destination = getSnapBuildPath(arch);

	return function () {
		const desktop = gulp.src('resources/linux/code.desktop', { base: '.' })
			.pipe(replace('@@NAME_LONG@@', product.nameLong))
			.pipe(replace('@@NAME_SHORT@@', product.nameShort))
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(replace('@@ICON@@', `/usr/share/pixmaps/${product.applicationName}.png`))
			.pipe(rename(`usr/share/applications/${product.applicationName}.desktop`));

		const icon = gulp.src('resources/linux/code.png', { base: '.' })
			.pipe(rename(`usr/share/pixmaps/${product.applicationName}.png`));

		const code = gulp.src(binaryDir + '/**/*', { base: binaryDir })
			.pipe(rename(function (p) { p.dirname = `usr/share/${product.applicationName}/${p.dirname}`; }));

		const snapcraft = gulp.src('resources/linux/snap/snapcraft.yaml', { base: '.' })
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(replace('@@VERSION@@', `${packageJson.version}-${linuxPackageRevision}`))
			.pipe(rename('snap/snapcraft.yaml'));

		const snapUpdate = gulp.src('resources/linux/snap/snapUpdate.sh', { base: '.' })
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(rename(`usr/share/${product.applicationName}/snapUpdate.sh`));

		const electronLaunch = gulp.src('resources/linux/snap/electron-launch', { base: '.' })
			.pipe(rename('electron-launch'));

		const all = es.merge(desktop, icon, code, snapcraft, electronLaunch, snapUpdate);

		return all.pipe(vfs.dest(destination));
	};
}

function buildSnapPackage(arch) {
	const snapBuildPath = getSnapBuildPath(arch);
	const snapFilename = `${product.applicationName}-${packageJson.version}-${linuxPackageRevision}-${arch}.snap`;
	return shell.task([
		`chmod a+x ${snapBuildPath}/electron-launch ${snapBuildPath}/usr/share/${product.applicationName}/snapUpdate.sh`,
		`snapcraft --version`,
		`cd ${snapBuildPath} && snapcraft snap --output ../${snapFilename}`
	]);
}

gulp.task('clean-vscode-linux-ia32-deb', util.rimraf('.build/linux/deb/i386'));
gulp.task('clean-vscode-linux-x64-deb', util.rimraf('.build/linux/deb/amd64'));
gulp.task('clean-vscode-linux-arm-deb', util.rimraf('.build/linux/deb/armhf'));
gulp.task('clean-vscode-linux-ia32-rpm', util.rimraf('.build/linux/rpm/i386'));
gulp.task('clean-vscode-linux-x64-rpm', util.rimraf('.build/linux/rpm/x86_64'));
gulp.task('clean-vscode-linux-arm-rpm', util.rimraf('.build/linux/rpm/armhf'));
gulp.task('clean-vscode-linux-ia32-snap', util.rimraf('.build/linux/snap/x64'));
gulp.task('clean-vscode-linux-x64-snap', util.rimraf('.build/linux/snap/x64'));
gulp.task('clean-vscode-linux-arm-snap', util.rimraf('.build/linux/snap/x64'));
gulp.task('clean-vscode-linux-ia32-flatpak', util.rimraf('.build/linux/flatpak/i386'));
gulp.task('clean-vscode-linux-x64-flatpak', util.rimraf('.build/linux/flatpak/x86_64'));
gulp.task('clean-vscode-linux-arm-flatpak', util.rimraf('.build/linux/flatpak/arm'));

gulp.task('vscode-linux-ia32-prepare-deb', ['clean-vscode-linux-ia32-deb'], prepareDebPackage('ia32'));
gulp.task('vscode-linux-x64-prepare-deb', ['clean-vscode-linux-x64-deb'], prepareDebPackage('x64'));
gulp.task('vscode-linux-arm-prepare-deb', ['clean-vscode-linux-arm-deb'], prepareDebPackage('arm'));
gulp.task('vscode-linux-ia32-build-deb', ['vscode-linux-ia32-prepare-deb'], buildDebPackage('ia32'));
gulp.task('vscode-linux-x64-build-deb', ['vscode-linux-x64-prepare-deb'], buildDebPackage('x64'));
gulp.task('vscode-linux-arm-build-deb', ['vscode-linux-arm-prepare-deb'], buildDebPackage('arm'));

gulp.task('vscode-linux-ia32-prepare-rpm', ['clean-vscode-linux-ia32-rpm'], prepareRpmPackage('ia32'));
gulp.task('vscode-linux-x64-prepare-rpm', ['clean-vscode-linux-x64-rpm'], prepareRpmPackage('x64'));
gulp.task('vscode-linux-arm-prepare-rpm', ['clean-vscode-linux-arm-rpm'], prepareRpmPackage('arm'));
gulp.task('vscode-linux-ia32-build-rpm', ['vscode-linux-ia32-prepare-rpm'], buildRpmPackage('ia32'));
gulp.task('vscode-linux-x64-build-rpm', ['vscode-linux-x64-prepare-rpm'], buildRpmPackage('x64'));
gulp.task('vscode-linux-arm-build-rpm', ['vscode-linux-arm-prepare-rpm'], buildRpmPackage('arm'));

gulp.task('vscode-linux-ia32-prepare-snap', ['clean-vscode-linux-ia32-snap'], prepareSnapPackage('ia32'));
gulp.task('vscode-linux-x64-prepare-snap', ['clean-vscode-linux-x64-snap'], prepareSnapPackage('x64'));
gulp.task('vscode-linux-arm-prepare-snap', ['clean-vscode-linux-arm-snap'], prepareSnapPackage('arm'));
gulp.task('vscode-linux-ia32-build-snap', ['vscode-linux-ia32-prepare-snap'], buildSnapPackage('ia32'));
gulp.task('vscode-linux-x64-build-snap', ['vscode-linux-x64-prepare-snap'], buildSnapPackage('x64'));
gulp.task('vscode-linux-arm-build-snap', ['vscode-linux-arm-prepare-snap'], buildSnapPackage('arm'));
