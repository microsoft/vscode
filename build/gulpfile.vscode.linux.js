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
const packageJson = require('../package.json');
const product = require('../product.json');

function getDebPackageArch(arch) {
	return { x64: 'amd64', ia32: 'i386', arm: 'armhf' }[arch];
}

const linuxPackageRevision = Math.floor(new Date().getTime() / 1000);

function prepareDebPackage(arch) {
	const binaryDir = '../VSCode-linux-' + arch;
	const debArch = getDebPackageArch(arch);
	const destination = '.build/linux/deb/' + debArch + '/' + product.applicationName + '-' + debArch;

	return function () {
		const desktop = gulp.src('resources/linux/code.desktop', { base: '.' })
			.pipe(replace('@@NAME_LONG@@', product.nameLong))
			.pipe(replace('@@NAME_SHORT@@', product.nameShort))
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(rename('usr/share/applications/' + product.applicationName + '.desktop'));

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

		const all = es.merge(control, postinst, postrm, prerm, desktop, icon, code);

		return all.pipe(vfs.dest(destination));
	};
}

function buildDebPackage(arch) {
	const debArch = getDebPackageArch(arch);
	return shell.task([
		'chmod 755 ' + product.applicationName + '-' + debArch + '/DEBIAN/postinst ' + product.applicationName + '-' + debArch + '/DEBIAN/prerm',
		'mkdir -p deb',
		'fakeroot dpkg-deb -b ' + product.applicationName + '-' + debArch + ' deb',
		'dpkg-scanpackages deb /dev/null > Packages'
	], { cwd: '.build/linux/deb/' + debArch});
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
			.pipe(rename('BUILD/usr/share/applications/' + product.applicationName + '.desktop'));

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
			.pipe(replace('@@QUALITY@@', product.quality || '@@QUALITY@@'))
			.pipe(replace('@@UPDATEURL@@', product.updateUrl || '@@UPDATEURL@@'))
			.pipe(rename('SPECS/' + product.applicationName + '.spec'));

		const specIcon = gulp.src('resources/linux/rpm/code.xpm', { base: '.' })
			.pipe(rename('SOURCES/' + product.applicationName + '.xpm'));

		const all = es.merge(code, desktop, icon, spec, specIcon);

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
		'cp "' + rpmOut + '/$(ls ' + rpmOut + ')" ' + destination + '/',
		'createrepo ' + destination
	]);
}

gulp.task('clean-vscode-linux-ia32-deb', util.rimraf('.build/linux/deb/i386'));
gulp.task('clean-vscode-linux-x64-deb', util.rimraf('.build/linux/deb/amd64'));
gulp.task('clean-vscode-linux-arm-deb', util.rimraf('.build/linux/deb/armhf'));
gulp.task('clean-vscode-linux-ia32-rpm', util.rimraf('.build/linux/rpm/i386'));
gulp.task('clean-vscode-linux-x64-rpm', util.rimraf('.build/linux/rpm/x86_64'));
gulp.task('clean-vscode-linux-arm-rpm', util.rimraf('.build/linux/rpm/armhf'));

gulp.task('vscode-linux-ia32-prepare-deb', ['clean-vscode-linux-ia32-deb', 'vscode-linux-ia32-min'], prepareDebPackage('ia32'));
gulp.task('vscode-linux-x64-prepare-deb', ['clean-vscode-linux-x64-deb', 'vscode-linux-x64-min'], prepareDebPackage('x64'));
gulp.task('vscode-linux-arm-prepare-deb', ['clean-vscode-linux-arm-deb', 'vscode-linux-arm-min'], prepareDebPackage('armhf'));
gulp.task('vscode-linux-ia32-build-deb', ['vscode-linux-ia32-prepare-deb'], buildDebPackage('ia32'));
gulp.task('vscode-linux-x64-build-deb', ['vscode-linux-x64-prepare-deb'], buildDebPackage('x64'));
gulp.task('vscode-linux-arm-build-deb', ['vscode-linux-arm-prepare-deb'], buildDebPackage('armhf'));

gulp.task('vscode-linux-ia32-prepare-rpm', ['clean-vscode-linux-ia32-rpm', 'vscode-linux-ia32-min'], prepareRpmPackage('ia32'));
gulp.task('vscode-linux-x64-prepare-rpm', ['clean-vscode-linux-x64-rpm', 'vscode-linux-x64-min'], prepareRpmPackage('x64'));
gulp.task('vscode-linux-arm-prepare-rpm', ['clean-vscode-linux-arm-rpm', 'vscode-linux-arm-min'], prepareRpmPackage('armhf'));
gulp.task('vscode-linux-ia32-build-rpm', ['vscode-linux-ia32-prepare-rpm'], buildRpmPackage('ia32'));
gulp.task('vscode-linux-x64-build-rpm', ['vscode-linux-x64-prepare-rpm'], buildRpmPackage('x64'));
gulp.task('vscode-linux-arm-build-rpm', ['vscode-linux-arm-prepare-rpm'], buildRpmPackage('armhf'));
