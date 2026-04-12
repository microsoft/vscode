/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MainContext } from './extHost.protocol.js';
import * as typeConvert from './extHostTypeConverters.js';
import { StandardTokenType, Range, LanguageStatusSeverity } from './extHostTypes.js';
import Severity from '../../../base/common/severity.js';
import { disposableTimeout } from '../../../base/common/async.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { checkProposedApiEnabled } from '../../services/extensions/common/extensions.js';
export class ExtHostLanguages {
    constructor(mainContext, _documents, _commands, _uriTransformer) {
        this._documents = _documents;
        this._commands = _commands;
        this._uriTransformer = _uriTransformer;
        this._languageIds = [];
        this._handlePool = 0;
        this._ids = new Set();
        this._proxy = mainContext.getProxy(MainContext.MainThreadLanguages);
    }
    $acceptLanguageIds(ids) {
        this._languageIds = ids;
    }
    async getLanguages() {
        return this._languageIds.slice(0);
    }
    async changeLanguage(uri, languageId) {
        await this._proxy.$changeLanguage(uri, languageId);
        const data = this._documents.getDocumentData(uri);
        if (!data) {
            throw new Error(`document '${uri.toString()}' NOT found`);
        }
        return data.document;
    }
    async tokenAtPosition(document, position) {
        const versionNow = document.version;
        const pos = typeConvert.Position.from(position);
        const info = await this._proxy.$tokensAtPosition(document.uri, pos);
        const defaultRange = {
            type: StandardTokenType.Other,
            range: document.getWordRangeAtPosition(position) ?? new Range(position.line, position.character, position.line, position.character)
        };
        if (!info) {
            // no result
            return defaultRange;
        }
        const result = {
            range: typeConvert.Range.to(info.range),
            type: typeConvert.TokenType.to(info.type)
        };
        if (!result.range.contains(position)) {
            // bogous result
            return defaultRange;
        }
        if (versionNow !== document.version) {
            // concurrent change
            return defaultRange;
        }
        return result;
    }
    createLanguageStatusItem(extension, id, selector) {
        const handle = this._handlePool++;
        const proxy = this._proxy;
        const ids = this._ids;
        // enforce extension unique identifier
        const fullyQualifiedId = `${extension.identifier.value}/${id}`;
        if (ids.has(fullyQualifiedId)) {
            throw new Error(`LanguageStatusItem with id '${id}' ALREADY exists`);
        }
        ids.add(fullyQualifiedId);
        const data = {
            selector,
            id,
            name: extension.displayName ?? extension.name,
            severity: LanguageStatusSeverity.Information,
            command: undefined,
            text: '',
            detail: '',
            busy: false
        };
        let soonHandle;
        const commandDisposables = new DisposableStore();
        const updateAsync = () => {
            soonHandle?.dispose();
            if (!ids.has(fullyQualifiedId)) {
                console.warn(`LanguageStatusItem (${id}) from ${extension.identifier.value} has been disposed and CANNOT be updated anymore`);
                return; // disposed in the meantime
            }
            soonHandle = disposableTimeout(() => {
                commandDisposables.clear();
                this._proxy.$setLanguageStatus(handle, {
                    id: fullyQualifiedId,
                    name: data.name ?? extension.displayName ?? extension.name,
                    source: extension.displayName ?? extension.name,
                    selector: typeConvert.DocumentSelector.from(data.selector, this._uriTransformer),
                    label: data.text,
                    detail: data.detail ?? '',
                    severity: data.severity === LanguageStatusSeverity.Error ? Severity.Error : data.severity === LanguageStatusSeverity.Warning ? Severity.Warning : Severity.Info,
                    command: data.command && this._commands.toInternal(data.command, commandDisposables),
                    accessibilityInfo: data.accessibilityInformation,
                    busy: data.busy
                });
            }, 0);
        };
        const result = {
            dispose() {
                commandDisposables.dispose();
                soonHandle?.dispose();
                proxy.$removeLanguageStatus(handle);
                ids.delete(fullyQualifiedId);
            },
            get id() {
                return data.id;
            },
            get name() {
                return data.name;
            },
            set name(value) {
                data.name = value;
                updateAsync();
            },
            get selector() {
                return data.selector;
            },
            set selector(value) {
                data.selector = value;
                updateAsync();
            },
            get text() {
                return data.text;
            },
            set text(value) {
                data.text = value;
                updateAsync();
            },
            set text2(value) {
                checkProposedApiEnabled(extension, 'languageStatusText');
                data.text = value;
                updateAsync();
            },
            get text2() {
                checkProposedApiEnabled(extension, 'languageStatusText');
                return data.text;
            },
            get detail() {
                return data.detail;
            },
            set detail(value) {
                data.detail = value;
                updateAsync();
            },
            get severity() {
                return data.severity;
            },
            set severity(value) {
                data.severity = value;
                updateAsync();
            },
            get accessibilityInformation() {
                return data.accessibilityInformation;
            },
            set accessibilityInformation(value) {
                data.accessibilityInformation = value;
                updateAsync();
            },
            get command() {
                return data.command;
            },
            set command(value) {
                data.command = value;
                updateAsync();
            },
            get busy() {
                return data.busy;
            },
            set busy(value) {
                data.busy = value;
                updateAsync();
            }
        };
        updateAsync();
        return result;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdExhbmd1YWdlcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RMYW5ndWFnZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBaUUsTUFBTSx1QkFBdUIsQ0FBQztBQUduSCxPQUFPLEtBQUssV0FBVyxNQUFNLDRCQUE0QixDQUFDO0FBQzFELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxLQUFLLEVBQVksc0JBQXNCLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUMvRixPQUFPLFFBQVEsTUFBTSxrQ0FBa0MsQ0FBQztBQUN4RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNsRSxPQUFPLEVBQUUsZUFBZSxFQUFlLE1BQU0sbUNBQW1DLENBQUM7QUFJakYsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFekYsTUFBTSxPQUFPLGdCQUFnQjtJQU01QixZQUNDLFdBQXlCLEVBQ1IsVUFBNEIsRUFDNUIsU0FBNEIsRUFDNUIsZUFBNEM7UUFGNUMsZUFBVSxHQUFWLFVBQVUsQ0FBa0I7UUFDNUIsY0FBUyxHQUFULFNBQVMsQ0FBbUI7UUFDNUIsb0JBQWUsR0FBZixlQUFlLENBQTZCO1FBTnRELGlCQUFZLEdBQWEsRUFBRSxDQUFDO1FBdUQ1QixnQkFBVyxHQUFXLENBQUMsQ0FBQztRQUN4QixTQUFJLEdBQUcsSUFBSSxHQUFHLEVBQVUsQ0FBQztRQWhEaEMsSUFBSSxDQUFDLE1BQU0sR0FBRyxXQUFXLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0lBQ3JFLENBQUM7SUFFRCxrQkFBa0IsQ0FBQyxHQUFhO1FBQy9CLElBQUksQ0FBQyxZQUFZLEdBQUcsR0FBRyxDQUFDO0lB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