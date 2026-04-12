/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { join } from '../common/path.js';
import { promises } from 'fs';
import { mark } from '../common/performance.js';
import { Promises } from './pfs.js';
export async function resolveNLSConfiguration({ userLocale, osLocale, userDataPath, commit, nlsMetadataPath }) {
    mark('code/willGenerateNls');
    if (process.env['VSCODE_DEV'] ||
        userLocale === 'pseudo' ||
        userLocale.startsWith('en') ||
        !commit ||
        !userDataPath) {
        return defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath);
    }
    try {
        const languagePacks = await getLanguagePackConfigurations(userDataPath);
        if (!languagePacks) {
            return defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath);
        }
        const resolvedLanguage = resolveLanguagePackLanguage(languagePacks, userLocale);
        if (!resolvedLanguage) {
            return defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath);
        }
        const languagePack = languagePacks[resolvedLanguage];
        const mainLanguagePackPath = languagePack?.translations?.['vscode'];
        if (!languagePack ||
            typeof languagePack.hash !== 'string' ||
            !languagePack.translations ||
            typeof mainLanguagePackPath !== 'string' ||
            !(await Promises.exists(mainLanguagePackPath))) {
            return defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath);
        }
        const languagePackId = `${languagePack.hash}.${resolvedLanguage}`;
        const globalLanguagePackCachePath = join(userDataPath, 'clp', languagePackId);
        const commitLanguagePackCachePath = join(globalLanguagePackCachePath, commit);
        const languagePackMessagesFile = join(commitLanguagePackCachePath, 'nls.messages.json');
        const translationsConfigFile = join(globalLanguagePackCachePath, 'tcf.json');
        const languagePackCorruptMarkerFile = join(globalLanguagePackCachePath, 'corrupted.info');
        if (await Promises.exists(languagePackCorruptMarkerFile)) {
            await promises.rm(globalLanguagePackCachePath, { recursive: true, force: true, maxRetries: 3 }); // delete corrupted cache folder
        }
        const result = {
            userLocale,
            osLocale,
            resolvedLanguage,
            defaultMessagesFile: join(nlsMetadataPath, 'nls.messages.json'),
            languagePack: {
                translationsConfigFile,
                messagesFile: languagePackMessagesFile,
                corruptMarkerFile: languagePackCorruptMarkerFile
            },
            // NLS: below properties are a relic from old times only used by vscode-nls and deprecated
            locale: userLocale,
            availableLanguages: { '*': resolvedLanguage },
            _languagePackId: languagePackId,
            _languagePackSupport: true,
            _translationsConfigFile: translationsConfigFile,
            _cacheRoot: globalLanguagePackCachePath,
            _resolvedLanguagePackCoreLocation: commitLanguagePackCachePath,
            _corruptedFile: languagePackCorruptMarkerFile
        };
        if (await Promises.exists(languagePackMessagesFile)) {
            touch(commitLanguagePackCachePath).catch(() => { }); // We don't wait for this. No big harm if we can't touch
            mark('code/didGenerateNls');
            return result;
        }
        const [nlsDefaultKeys, nlsDefaultMessages, nlsPackdata] 
        //      ^moduleId ^nlsKeys                               ^moduleId      ^nlsKey ^nlsValue
        = await Promise.all([
            promises.readFile(join(nlsMetadataPath, 'nls.keys.json'), 'utf-8').then(content => JSON.parse(content)),
            promises.readFile(join(nlsMetadataPath, 'nls.messages.json'), 'utf-8').then(content => JSON.parse(content)),
            promises.readFile(mainLanguagePackPath, 'utf-8').then(content => JSON.parse(content)),
        ]);
        const nlsResult = [];
        // We expect NLS messages to be in a flat array in sorted order as they
        // where produced during build time. We use `nls.keys.json` to know the
        // right order and then lookup the related message from the translation.
        // If a translation does not exist, we fallback to the default message.
        let nlsIndex = 0;
        for (const [moduleId, nlsKeys] of nlsDefaultKeys) {
            const moduleTranslations = nlsPackdata.contents[moduleId];
            for (const nlsKey of nlsKeys) {
                nlsResult.push(moduleTranslations?.[nlsKey] || nlsDefaultMessages[nlsIndex]);
                nlsIndex++;
            }
        }
        await promises.mkdir(commitLanguagePackCachePath, { recursive: true });
        await Promise.all([
            promises.writeFile(languagePackMessagesFile, JSON.stringify(nlsResult), 'utf-8'),
            promises.writeFile(translationsConfigFile, JSON.stringify(languagePack.translations), 'utf-8')
        ]);
        mark('code/didGenerateNls');
        return result;
    }
    catch (error) {
        console.error('Generating translation files failed.', error);
    }
    return defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath);
}
/**
 * The `languagepacks.json` file is a JSON file that contains all metadata
 * about installed language extensions per language. Specifically, for
 * core (`vscode`) and all extensions it supports, it points to the related
 * translation files.
 *
 * The file is updated whenever a new language pack is installed or removed.
 */
async function getLanguagePackConfigurations(userDataPath) {
    const configFile = join(userDataPath, 'languagepacks.json');
    try {
        return JSON.parse(await promises.readFile(configFile, 'utf-8'));
    }
    catch (err) {
        return undefined; // Do nothing. If we can't read the file we have no language pack config.
    }
}
function resolveLanguagePackLanguage(languagePacks, locale) {
    try {
        while (locale) {
            if (languagePacks[locale]) {
                return locale;
            }
            const index = locale.lastIndexOf('-');
            if (index > 0) {
                locale = locale.substring(0, index);
            }
            else {
                return undefined;
            }
        }
    }
    catch (error) {
        console.error('Resolving language pack configuration failed.', error);
    }
    return undefined;
}
function defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath) {
    mark('code/didGenerateNls');
    return {
        userLocale,
        osLocale,
        resolvedLanguage: 'en',
        defaultMessagesFile: join(nlsMetadataPath, 'nls.messages.json'),
        // NLS: below 2 are a relic from old times only used by vscode-nls and deprecated
        locale: userLocale,
        availableLanguages: {}
    };
}
//#region fs helpers
function touch(path) {
    const date = new Date();
    return promises.utimes(path, date, date);
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmxzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9ub2RlL25scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDekMsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLElBQUksQ0FBQztBQUM5QixPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFaEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQWdDcEMsTUFBTSxDQUFDLEtBQUssVUFBVSx1QkFBdUIsQ0FBQyxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsWUFBWSxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQW1DO0lBQzdJLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO0lBRTdCLElBQ0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUM7UUFDekIsVUFBVSxLQUFLLFFBQVE7UUFDdkIsVUFBVSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUM7UUFDM0IsQ0FBQyxNQUFNO1FBQ1AsQ0FBQyxZQUFZLEVBQ1osQ0FBQztRQUNGLE9BQU8sdUJBQXVCLENBQUMsVUFBVSxFQUFFLFFBQVEsRUFBRSxlQUFlLENBQUMsQ0FBQztJQUN2RSxDQUFDO0lBRUQsSUFBSSxDQUFDO1FBQ0osTUFBTSxhQUFhLEdBQUcsTUFBTSw2QkFBNkIsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUN4RSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDcEIsT0FBTyx1QkFBdUIsQ0FBQyxVQUFVLEVBQUUsUUFBUSxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBQ3ZFLENBQUM7UUFFRCxNQUFNLGdCQUFnQixHQUFHLDJCQUEyQixDQUFDLGFBQWEsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUNoRixJQUFJLENBQUMs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