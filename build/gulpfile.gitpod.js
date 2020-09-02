/*!--------------------------------------------------------
* Copyright (C) Gitpod. All rights reserved.
*--------------------------------------------------------*/

'use strict';

const promisify = require('util').promisify;
const cp = require('child_process');
const argv = require('yargs').argv;
const vsce = require('vsce');
const gulp = require('gulp');
const path = require('path');
const es = require('event-stream');
const util = require('./lib/util');
const task = require('./lib/task');
const rename = require('gulp-rename');
const ext = require('./lib/extensions');

gulp.task(task.define('watch-init', require('./lib/compilation').watchTask('out', false)));

const extensionsPath = path.join(path.dirname(__dirname), 'extensions');
const marketplaceExtensions = ['gitpod-remote'];
const outMarketplaceExtensions = 'out-gitpod-marketplace';
const cleanMarketplaceExtensions = task.define('clean-gitpod-marketplace-extensions', util.rimraf(outMarketplaceExtensions));
const bumpMarketplaceExtensions = task.define('bump-marketplace-extensions', () => {
	if ('new-version' in argv && argv['new-version']) {
		const newVersion = argv['new-version'];
		console.log(newVersion);
		return Promise.allSettled(marketplaceExtensions.map(async extensionName => {
			const { stderr } = await promisify(cp.exec)(`yarn version --new-version ${newVersion} --cwd ${path.join(extensionsPath, extensionName)} --no-git-tag-version`, { encoding: 'utf8' });
			if (stderr) {
				throw new Error('failed to bump up version: ' + stderr);
			}
		}));
	}
});
const bundleMarketplaceExtensions = task.define('bundle-gitpod-marketplace-extensions', task.series(
	cleanMarketplaceExtensions,
	bumpMarketplaceExtensions,
	() =>
		ext.minifyExtensionResources(
			es.merge(
				...marketplaceExtensions.map(extensionName =>
					ext.fromLocal(path.join(extensionsPath, extensionName), false)
						.pipe(rename(p => p.dirname = `${extensionName}/${p.dirname}`))
				)
			)
		).pipe(gulp.dest(outMarketplaceExtensions))
));
gulp.task(bundleMarketplaceExtensions);
const publishMarketplaceExtensions = task.define('publish-gitpod-marketplace-extensions', task.series(
	bundleMarketplaceExtensions,
	() => Promise.allSettled(marketplaceExtensions.map(extensionName => {
		vsce.publish({
			cwd: path.join(outMarketplaceExtensions, extensionName)
		});
	}))
));
gulp.task(publishMarketplaceExtensions);
const packageMarketplaceExtensions = task.define('package-gitpod-marketplace-extensions', task.series(
	bundleMarketplaceExtensions,
	() => Promise.allSettled(marketplaceExtensions.map(extensionName => {
		vsce.createVSIX({
			cwd: path.join(outMarketplaceExtensions, extensionName)
		});
	}))
));
gulp.task(packageMarketplaceExtensions);
for (const extensionName of marketplaceExtensions) {
	const cleanExtension = task.define('gitpod:clean-extension:' + extensionName, util.rimraf(path.join(outMarketplaceExtensions, extensionName)));
	const bumpExtension = task.define('gitpod:bump-extension:' + extensionName, async () => {
		if ('new-version' in argv && argv['new-version']) {
			const newVersion = argv['new-version'];
			const { stderr } = await promisify(cp.exec)(`yarn version --new-version ${newVersion} --cwd ${path.join(extensionsPath, extensionName)} --no-git-tag-version`, { encoding: 'utf8' });
			if (stderr) {
				throw new Error('failed to bump up version: ' + stderr);
			}
		}
	});
	const bundleExtension = task.define('gitpod:bundle-extension:' + extensionName, task.series(
		cleanExtension,
		bumpExtension,
		() =>
			ext.minifyExtensionResources(
				ext.fromLocal(path.join(extensionsPath, extensionName), false)
					.pipe(rename(p => p.dirname = `${extensionName}/${p.dirname}`))
			).pipe(gulp.dest(outMarketplaceExtensions))
	));
	gulp.task(bundleExtension);
	const publishExtension = task.define('gitpod:publish-extension:' + extensionName, task.series(
		bundleExtension,
		() => vsce.publish({
			cwd: path.join(outMarketplaceExtensions, extensionName)
		})
	));
	gulp.task(publishExtension);
	const packageExtension = task.define('gitpod:package-extension:' + extensionName, task.series(
		bundleExtension,
		() => vsce.createVSIX({
			cwd: path.join(outMarketplaceExtensions, extensionName)
		})
	));
	gulp.task(packageExtension);
}
