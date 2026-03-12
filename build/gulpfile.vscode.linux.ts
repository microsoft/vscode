/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import gulp from 'gulp';
import replace from 'gulp-replace';
import rename from 'gulp-rename';
import es from 'event-stream';
import vfs from 'vinyl-fs';
import { rimraf } from './lib/util.ts';
import { getVersion } from './lib/getVersion.ts';
import * as task from './lib/task.ts';
import packageJson from '../package.json' with { type: 'json' };
import product from '../product.json' with { type: 'json' };
import { getDependencies } from './linux/dependencies-generator.ts';
import { recommendedDeps as debianRecommendedDependencies } from './linux/debian/dep-lists.ts';
import * as path from 'path';
import * as cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const root = path.dirname(import.meta.dirname);
const commit = getVersion(root);

const linuxPackageRevision = Math.floor(new Date().getTime() / 1000);

function getDebPackageArch(arch: string): string {
	switch (arch) {
		case 'x64': return 'amd64';
		case 'armhf': return 'armhf';
		case 'arm64': return 'arm64';
		default: throw new Error(`Unknown arch: ${arch}`);
	}
}

function prepareDebPackage(arch: string) {
	const binaryDir = '../VSCode-linux-' + arch;
	const debArch = getDebPackageArch(arch);
	const destination = '.build/linux/deb/' + debArch + '/' + product.applicationName + '-' + debArch;

	return async function () {
		const dependencies = await getDependencies('deb', binaryDir, product.applicationName, debArch);

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
			function () {
				const that = this;
				gulp.src('resources/linux/debian/control.template', { base: '.' })
					.pipe(replace('@@NAME@@', product.applicationName))
					.pipe(replace('@@VERSION@@', packageJson.version + '-' + linuxPackageRevision))
					.pipe(replace('@@ARCHITECTURE@@', debArch))
					.pipe(replace('@@DEPENDS@@', dependencies.join(', ')))
					.pipe(replace('@@RECOMMENDS@@', debianRecommendedDependencies.join(', ')))
					.pipe(replace('@@INSTALLEDSIZE@@', Math.ceil(size / 1024).toString()))
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
			.pipe(rename('DEBIAN/postinst'));

		const templates = gulp.src('resources/linux/debian/templates.template', { base: '.' })
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(rename('DEBIAN/templates'));

		const all = es.merge(control, templates, postinst, postrm, prerm, desktops, appdata, workspaceMime, icon, bash_completion, zsh_completion, code);

		return all.pipe(vfs.dest(destination));
	};
}

function buildDebPackage(arch: string) {
	const debArch = getDebPackageArch(arch);
	const cwd = `.build/linux/deb/${debArch}`;

	return async () => {
		await exec(`chmod 755 ${product.applicationName}-${debArch}/DEBIAN/postinst ${product.applicationName}-${debArch}/DEBIAN/prerm ${product.applicationName}-${debArch}/DEBIAN/postrm`, { cwd });
		await exec('mkdir -p deb', { cwd });
		await exec(`fakeroot dpkg-deb -Zxz -b ${product.applicationName}-${debArch} deb`, { cwd });
	};
}

function getRpmBuildPath(rpmArch: string): string {
	return '.build/linux/rpm/' + rpmArch + '/rpmbuild';
}

function getRpmPackageArch(arch: string): string {
	switch (arch) {
		case 'x64': return 'x86_64';
		case 'armhf': return 'armv7hl';
		case 'arm64': return 'aarch64';
		default: throw new Error(`Unknown arch: ${arch}`);
	}
}

function prepareRpmPackage(arch: string) {
	const binaryDir = '../VSCode-linux-' + arch;
	const rpmArch = getRpmPackageArch(arch);
	const stripBinary = process.env['STRIP'] ?? '/usr/bin/strip';

	return async function () {
		const dependencies = await getDependencies('rpm', binaryDir, product.applicationName, rpmArch);

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

		const spec = gulp.src('resources/linux/rpm/code.spec.template', { base: '.' })
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(replace('@@NAME_LONG@@', product.nameLong))
			.pipe(replace('@@ICON@@', product.linuxIconName))
			.pipe(replace('@@VERSION@@', packageJson.version))
			.pipe(replace('@@RELEASE@@', linuxPackageRevision.toString()))
			.pipe(replace('@@ARCHITECTURE@@', rpmArch))
			.pipe(replace('@@LICENSE@@', product.licenseName))
			.pipe(replace('@@QUALITY@@', (product as typeof product & { quality?: string }).quality || '@@QUALITY@@'))
			.pipe(replace('@@UPDATEURL@@', (product as typeof product & { updateUrl?: string }).updateUrl || '@@UPDATEURL@@'))
			.pipe(replace('@@DEPENDENCIES@@', dependencies.join(', ')))
			.pipe(replace('@@STRIP@@', stripBinary))
			.pipe(rename('SPECS/' + product.applicationName + '.spec'));

		const specIcon = gulp.src('resources/linux/rpm/code.xpm', { base: '.' })
			.pipe(rename('SOURCES/' + product.applicationName + '.xpm'));

		const all = es.merge(code, desktops, appdata, workspaceMime, icon, bash_completion, zsh_completion, spec, specIcon);

		return all.pipe(vfs.dest(getRpmBuildPath(rpmArch)));
	};
}

function buildRpmPackage(arch: string) {
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

function getSnapBuildPath(arch: string): string {
	return `.build/linux/snap/${arch}/${product.applicationName}-${arch}`;
}

function prepareSnapPackage(arch: string) {
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
			.pipe(replace('@@VERSION@@', commit!.substr(0, 8)))
			// Possible run-on values https://snapcraft.io/docs/architectures
			.pipe(replace('@@ARCHITECTURE@@', arch === 'x64' ? 'amd64' : arch))
			.pipe(rename('snap/snapcraft.yaml'));

		const electronLaunch = gulp.src('resources/linux/snap/electron-launch', { base: '.' })
			.pipe(rename('electron-launch'));

		const all = es.merge(desktops, icon, code, snapcraft, electronLaunch);

		return all.pipe(vfs.dest(destination));
	};
}

function buildSnapPackage(arch: string) {
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
