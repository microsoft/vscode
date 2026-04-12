/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { parse } from '../../../base/common/glob.js';
import { Mimes } from '../../../base/common/mime.js';
import { Schemas } from '../../../base/common/network.js';
import { basename, posix } from '../../../base/common/path.js';
import { DataUri } from '../../../base/common/resources.js';
import { endsWithIgnoreCase, equals, startsWithUTF8BOM } from '../../../base/common/strings.js';
import { PLAINTEXT_LANGUAGE_ID } from '../languages/modesRegistry.js';
let registeredAssociations = [];
let nonUserRegisteredAssociations = [];
let userRegisteredAssociations = [];
/**
 * Associate a language to the registry (platform).
 * * **NOTE**: This association will lose over associations registered using `registerConfiguredLanguageAssociation`.
 * * **NOTE**: Use `clearPlatformLanguageAssociations` to remove all associations registered using this function.
 */
export function registerPlatformLanguageAssociation(association, warnOnOverwrite = false) {
    _registerLanguageAssociation(association, false, warnOnOverwrite);
}
/**
 * Associate a language to the registry (configured).
 * * **NOTE**: This association will win over associations registered using `registerPlatformLanguageAssociation`.
 * * **NOTE**: Use `clearConfiguredLanguageAssociations` to remove all associations registered using this function.
 */
export function registerConfiguredLanguageAssociation(association) {
    _registerLanguageAssociation(association, true, false);
}
function _registerLanguageAssociation(association, userConfigured, warnOnOverwrite) {
    // Register
    const associationItem = toLanguageAssociationItem(association, userConfigured);
    registeredAssociations.push(associationItem);
    if (!associationItem.userConfigured) {
        nonUserRegisteredAssociations.push(associationItem);
    }
    else {
        userRegisteredAssociations.push(associationItem);
    }
    // Check for conflicts unless this is a user configured association
    if (warnOnOverwrite && !associationItem.userConfigured) {
        registeredAssociations.forEach(a => {
            if (a.mime === associationItem.mime || a.userConfigured) {
                return; // same mime or userConfigured is ok
            }
            if (associationItem.extension && a.extension === associationItem.extension) {
                console.warn(`Overwriting extension <<${associationItem.extension}>> to now point to mime <<${associationItem.mime}>>`);
            }
            if (associationItem.filename && a.filename === associationItem.filename) {
                console.warn(`Overwriting filename <<${associationItem.filename}>> to now point to mime <<${associationItem.mime}>>`);
            }
            if (associationItem.filepattern && a.filepattern === associationItem.filepattern) {
                console.warn(`Overwriting filepattern <<${associationItem.filepattern}>> to now point to mime <<${associationItem.mime}>>`);
            }
            if (associationItem.firstline && a.firstline === associationItem.firstline) {
                console.warn(`Overwriting firstline <<${associationItem.firstline}>> to now point to mime <<${associationItem.mime}>>`);
            }
        });
    }
}
function toLanguageAssociationItem(association, userConfigured) {
    return {
        id: association.id,
        mime: association.mime,
        filename: association.filename,
        extension: association.extension,
        filepattern: association.filepattern,
        firstline: association.firstline,
        userConfigured: userConfigured,
        filepatternParsed: association.filepattern ? parse(association.filepattern, { ignoreCase: true }) : undefined,
        filepatternOnPath: association.filepattern ? association.filepattern.indexOf(posix.sep) >= 0 : false
    };
}
/**
 * Clear language associations from the registry (platform).
 */
export function clearPlatformLanguageAssociations() {
    registeredAssociations = registeredAssociations.filter(a => a.userConfigured);
    nonUserRegisteredAssociations = [];
}
/**
 * Clear language associations from the registry (configured).
 */
export function clearConfiguredLanguageAssociations() {
    registeredAssociations = registeredAssociations.filter(a => !a.userConfigured);
    userRegisteredAssociations = [];
}
/**
 * Given a file, return the best matching mime types for it
 * based on the registered language associations.
 */
export function getMimeTypes(resource, firstLine) {
    return getAssociations(resource, firstLine).map(item => item.mime);
}
/**
 * @see `getMimeTypes`
 */
export function getLanguageIds(resource, firstLine) {
    return getAssociations(resource, firstLine).map(item => item.id);
}
function getAssociations(resource, firstLine) {
    let path;
    if (resource) {
        switch (resource.scheme) {
            case Schemas.file:
                path = resource.fsPath;
                break;
            case Schemas.data: {
                const metadata = DataUri.parseMetaData(resource);
                path = metadata.get(DataUri.META_DATA_LABEL);
                break;
            }
            case Schemas.vscodeNotebookCell:
                // File path not relevant for language detection of cell
                path = undefined;
                break;
            default:
                path = resource.path;
        }
    }
    if (!path) {
        return [{ id: 'unknown', mime: Mimes.unknown }];
    }
    path = path.toLowerCase();
    const filename = basename(path);
    // 1.) User configured mappings have highest priority
    const configuredLanguage = getAssociationByPath(path, filename, userRegisteredAssociations);
    if (configuredLanguage) {
        return [configuredLanguage, { id: PLAINTEXT_LANGUAGE_ID, mime: Mimes.text }];
    }
    // 2.) Registered mappings have middle priority
    const registeredLanguage = getAssociationByPath(path, filename, nonUserRegisteredAssociations);
    if (registeredLanguage) {
        return [registeredLanguage, { id: PLAINTEXT_LANGUAGE_ID, mime: Mimes.text }];
    }
    // 3.) Firstline has lowest priority
    if (firstLine) {
        const firstlineLanguage = getAssociationByFirstline(firstLine);
        if (firstlineLanguage) {
            return [firstlineLanguage, { id: PLAINTEXT_LANGUAGE_ID, mime: Mimes.text }];
        }
    }
    return [{ id: 'unknown', mime: Mimes.unknown }];
}
function getAssociationByPath(path, filename, associations) {
    let filenameMatch = undefined;
    let patternMatch = undefined;
    let extensionMatch = undefined;
    // We want to prioritize associations based on the order they are registered so that the last registered
    // association wins over all other. This is for https://github.com/microsoft/vscode/issues/20074
    for (let i = associations.length - 1; i >= 0; i--) {
        const association = associations[i];
        // First exact name match
        if (equals(filename, association.filename, true)) {
            filenameMatch = association;
            break; // take it!
        }
        // Longest pattern match
        if (association.filepattern) {
            if (!patternMatch || association.filepattern.length > patternMatch.filepattern.length) {
                const target = association.filepatternOnPath ? path : filename; // match on full path if pattern contains path separator
                if (association.filepatternParsed?.(target)) {
                    patternMatch = association;
                }
            }
        }
        // Longest extension match
        if (association.extension) {
            if (!extensionMatch || association.extension.length > extensionMatch.extension.length) {
                if (endsWithIgnoreCase(filename, association.extension)) {
                    extensionMatch = association;
                }
            }
        }
    }
    // 1.) Exact name match has second highest priority
    if (filenameMatch) {
        return filenameMatch;
    }
    // 2.) Match on pattern
    if (patternMatch) {
        return patternMatch;
    }
    // 3.) Match on extension comes next
    if (extensionMatch) {
        return extensionMatch;
    }
    return undefined;
}
function getAssociationByFirstline(firstLine) {
    if (startsWithUTF8BOM(firstLine)) {
        firstLine = firstLine.substring(1);
    }
    if (firstLine.length > 0) {
        // We want to prioritize associations based on the order they are registered so that the last registered
        // association wins over all other. This is for https://github.com/microsoft/vscode/issues/20074
        for (let i = registeredAssociations.length - 1; i >= 0; i--) {
            const association = registeredAssociations[i];
            if (!association.firstline) {
                continue;
            }
            const matches = firstLine.match(association.firstline);
            if (matches && matches.length > 0) {
                return association;
            }
        }
    }
    return undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VzQXNzb2NpYXRpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZXNBc3NvY2lhdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFpQixLQUFLLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNwRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDckQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDL0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUVoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQWlCdEUsSUFBSSxzQkFBc0IsR0FBK0IsRUFBRSxDQUFDO0FBQzVELElBQUksNkJBQTZCLEdBQStCLEVBQUUsQ0FBQztBQUNuRSxJQUFJLDBCQUEwQixHQUErQixFQUFFLENBQUM7QUFFaEU7Ozs7R0FJRztBQUNILE1BQU0sVUFBVSxtQ0FBbUMsQ0FBQyxXQUFpQyxFQUFFLGVBQWUsR0FBRyxLQUFLO0lBQzdHLDRCQUE0QixDQUFDLFdBQVcsRUFBRSxLQUFLLEVBQUUsZUFBZSxDQUFDLENBQUM7QUFDbkUsQ0FBQztBQUVEOzs7O0dBSUc7QUFDSCxNQUFNLFVBQVUscUNBQXFDLENBQUMsV0FBaUM7SUFDdEYsNEJBQTRCLENBQUMsV0FBVyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztBQUN4RCxDQUFDO0FBRUQsU0FBUyw0QkFB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