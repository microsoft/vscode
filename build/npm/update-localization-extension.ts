/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as i18n from '../lib/i18n.ts';
import fs from 'fs';
import path from 'path';
import gulp from 'gulp';
import vfs from 'vinyl-fs';
import rimraf from 'rimraf';
import minimist from 'minimist';

interface Options {
	_: string[];
	location?: string;
	externalExtensionsLocation?: string;
}

interface PackageJson {
	contributes?: {
		localizations?: Localization[];
	};
}

interface Localization {
	languageId: string;
	languageName: string;
	localizedLanguageName: string;
	translations?: Array<{ id: string; path: string }>;
}

interface TranslationPath {
	id: string;
	resourceName: string;
}

function update(options: Options) {
	const idOrPath = options._[0];
	if (!idOrPath) {
		throw new Error('Argument must be the location of the localization extension.');
	}
	const location = options.location;
	if (location !== undefined && !fs.existsSync(location)) {
		throw new Error(`${location} doesn't exist.`);
	}
	const externalExtensionsLocation = options.externalExtensionsLocation;
	if (externalExtensionsLocation !== undefined && !fs.existsSync(externalExtensionsLocation)) {
		throw new Error(`${externalExtensionsLocation} doesn't exist.`);
	}
	let locExtFolder: string = idOrPath;
	if (/^\w{2,3}(-\w+)?$/.test(idOrPath)) {
		locExtFolder = path.join('..', 'vscode-loc', 'i18n', `vscode-language-pack-${idOrPath}`);
	}
	const locExtStat = fs.statSync(locExtFolder);
	if (!locExtStat || !locExtStat.isDirectory) {
		throw new Error('No directory found at ' + idOrPath);
	}
	const packageJSON = JSON.parse(fs.readFileSync(path.join(locExtFolder, 'package.json')).toString()) as PackageJson;
	const contributes = packageJSON['contributes'];
	if (!contributes) {
		throw new Error('The extension must define a "localizations" contribution in the "package.json"');
	}
	const localizations = contributes['localizations'];
	if (!localizations) {
		throw new Error('The extension must define a "localizations" contribution of type array in the "package.json"');
	}

	localizations.forEach(function (localization) {
		if (!localization.languageId || !localization.languageName || !localization.localizedLanguageName) {
			throw new Error('Each localization contribution must define "languageId", "languageName" and "localizedLanguageName" properties.');
		}
		let languageId = localization.languageId;
		const translationDataFolder = path.join(locExtFolder, 'translations');

		switch (languageId) {
			case 'zh-cn':
				languageId = 'zh-Hans';
				break;
			case 'zh-tw':
				languageId = 'zh-Hant';
				break;
			case 'pt-br':
				languageId = 'pt-BR';
				break;
		}

		if (fs.existsSync(translationDataFolder) && fs.existsSync(path.join(translationDataFolder, 'main.i18n.json'))) {
			console.log('Clearing  \'' + translationDataFolder + '\'...');
			rimraf.sync(translationDataFolder);
		}

		console.log(`Importing translations for ${languageId} form '${location}' to '${translationDataFolder}' ...`);
		let translationPaths: TranslationPath[] | undefined = [];
		gulp.src([
			path.join(location!, '**', languageId, '*.xlf'),
			...i18n.EXTERNAL_EXTENSIONS.map((extensionId: string) => path.join(externalExtensionsLocation!, extensionId, languageId, '*-new.xlf'))
		], { silent: false })
			.pipe(i18n.prepareI18nPackFiles(translationPaths))
			.on('error', (error: unknown) => {
				console.log(`Error occurred while importing translations:`);
				translationPaths = undefined;
				if (Array.isArray(error)) {
					error.forEach(console.log);
				} else if (error) {
					console.log(error);
				} else {
					console.log('Unknown error');
				}
			})
			.pipe(vfs.dest(translationDataFolder))
			.on('end', function () {
				if (translationPaths !== undefined) {
					localization.translations = [];
					for (const tp of translationPaths) {
						localization.translations.push({ id: tp.id, path: `./translations/${tp.resourceName}` });
					}
					fs.writeFileSync(path.join(locExtFolder, 'package.json'), JSON.stringify(packageJSON, null, '\t') + '\n');
				}
			});
	});
}
if (path.basename(process.argv[1]) === 'update-localization-extension.js') {
	const options = minimist(process.argv.slice(2), {
		string: ['location', 'externalExtensionsLocation']
	}) as Options;
	update(options);
}
