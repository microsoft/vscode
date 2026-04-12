/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Event } from '../../../../base/common/event.js';
import { parse } from '../../../../base/common/json.js';
import { FileType, IFileService } from '../../../../platform/files/common/files.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { readTrustedDomains, TRUSTED_DOMAINS_CONTENT_STORAGE_KEY, TRUSTED_DOMAINS_STORAGE_KEY } from './trustedDomains.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
const TRUSTED_DOMAINS_SCHEMA = 'trustedDomains';
const TRUSTED_DOMAINS_STAT = {
    type: FileType.File,
    ctime: Date.now(),
    mtime: Date.now(),
    size: 0
};
const CONFIG_HELP_TEXT_PRE = `// Links matching one or more entries in the list below can be opened without link protection.
// The following examples show what entries can look like:
// - "https://microsoft.com": Matches this specific domain using https
// - "https://microsoft.com:8080": Matches this specific domain on this port using https
// - "https://microsoft.com:*": Matches this specific domain on any port using https
// - "https://microsoft.com/foo": Matches https://microsoft.com/foo and https://microsoft.com/foo/bar,
//   but not https://microsoft.com/foobar or https://microsoft.com/bar
// - "https://*.microsoft.com": Match all domains ending in "microsoft.com" using https
// - "microsoft.com": Match this specific domain using either http or https
// - "*.microsoft.com": Match all domains ending in "microsoft.com" using either http or https
// - "http://192.168.0.1: Matches this specific IP using http
// - "http://192.168.0.*: Matches all IP's with this prefix using http
// - "*": Match all domains using either http or https
//
`;
const CONFIG_HELP_TEXT_AFTER = `//
// You can use the "Manage Trusted Domains" command to open this file.
// Save this file to apply the trusted domains rules.
`;
const CONFIG_PLACEHOLDER_TEXT = `[
	// "https://microsoft.com"
]`;
function computeTrustedDomainContent(defaultTrustedDomains, trustedDomains, configuring) {
    let content = CONFIG_HELP_TEXT_PRE;
    if (defaultTrustedDomains.length > 0) {
        content += `// By default, VS Code trusts "localhost" as well as the following domains:\n`;
        defaultTrustedDomains.forEach(d => {
            content += `// - "${d}"\n`;
        });
    }
    else {
        content += `// By default, VS Code trusts "localhost".\n`;
    }
    content += CONFIG_HELP_TEXT_AFTER;
    content += configuring ? `\n// Currently configuring trust for ${configuring}\n` : '';
    if (trustedDomains.length === 0) {
        content += CONFIG_PLACEHOLDER_TEXT;
    }
    else {
        content += JSON.stringify(trustedDomains, null, 2);
    }
    return content;
}
let TrustedDomainsFileSystemProvider = class TrustedDomainsFileSystemProvider {
    static { this.ID = 'workbench.contrib.trustedDomainsFileSystemProvider'; }
    constructor(fileService, storageService, instantiationService) {
        this.fileService = fileService;
        this.storageService = storageService;
        this.instantiationService = instantiationService;
        this.capabilities = 2 /* FileSystemProviderCapabilities.FileReadWrite */;
        this.onDidChangeCapabilities = Event.None;
        this.onDidChangeFile = Event.None;
        this.fileService.registerProvider(TRUSTED_DOMAINS_SCHEMA, this);
    }
    stat(resource) {
        return Promise.resolve(TRUSTED_DOMAINS_STAT);
    }
    async readFile(resource) {
        let trustedDomainsContent = this.storageService.get(TRUSTED_DOMAINS_CONTENT_STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
        const configuring = resource.fragment;
        const { defaultTrustedDomains, trustedDomains } = await this.instantiationService.invokeFunction(readTrustedDomains);
        if (!trustedDomainsContent ||
            trustedDomainsContent.indexOf(CONFIG_HELP_TEXT_PRE) === -1 ||
            trustedDomainsContent.indexOf(CONFIG_HELP_TEXT_AFTER) === -1 ||
            trustedDomainsContent.indexOf(configuring ?? '') === -1 ||
            [...defaultTrustedDomains, ...trustedDomains].some(d => !assertReturnsDefined(trustedDomainsContent).includes(d))) {
            trustedDomainsContent = computeTrustedDomainContent(defaultTrustedDomains, trustedDomains, configuring);
        }
        const buffer = VSBuffer.fromString(trustedDomainsContent).buffer;
        return buffer;
    }
    writeFile(resource, content, opts) {
        try {
            const trustedDomainsContent = VSBuffer.wrap(content).toString();
            const trustedDomains = parse(trustedDomainsContent);
            this.storageService.store(TRUSTED_DOMAINS_CONTENT_STORAGE_KEY, trustedDomainsContent, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
            this.storageService.store(TRUSTED_DOMAINS_STORAGE_KEY, JSON.stringify(trustedDomains) || '', -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
        }
        catch (err) { }
        return Promise.resolve();
    }
    watch(resource, opts) {
        return {
            dispose() {
                return;
            }
        };
    }
    mkdir(resource) {
        return Promise.resolve(undefined);
    }
    readdir(resource) {
        return Promise.resolve(undefined);
    }
    delete(resource, opts) {
        return Promise.resolve(undefined);
    }
    rename(from, to, opts) {
        return Promise.resolve(undefined);
    }
};
TrustedDomainsFileSystemProvider = __decorate([
    __param(0, IFileService),
    __param(1, IStorageService),
    __param(2, IInstantiationService)
], TrustedDomainsFileSystemProvider);
export { TrustedDomainsFileSystemProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJ1c3RlZERvbWFpbnNGaWxlU3lzdGVtUHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi91cmwvYnJvd3Nlci90cnVzdGVkRG9tYWluc0ZpbGVTeXN0ZW1Qcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBR3hELE9BQU8sRUFBNkUsUUFBUSxFQUFxQixZQUFZLEVBQXdFLE1BQU0sNENBQTRDLENBQUM7QUFDeFAsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxnREFBZ0QsQ0FBQztBQUU5RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLGtCQUFrQixFQUFFLG1DQUFtQyxFQUFFLDJCQUEyQixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDM0gsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDeEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFbkcsTUFBTSxzQkFBc0IsR0FBRyxnQkFBZ0IsQ0FBQztBQUVoRCxNQUFNLG9CQUFvQixHQUFVO0lBQ25DLElBQUksRUFBRSxRQUFRLENBQUMsSUFBSTtJQUNuQixLQUFLLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRTtJQUNqQixLQUFLLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRTtJQUNqQixJQUFJLEVBQUUsQ0FBQztDQUNQLENBQUM7QUFFRixNQUFNLG9CQUFvQixHQUFHOzs7Ozs7Ozs7Ozs7OztDQWM1QixDQUFDO0FBRUYsTUFBTSxzQkFBc0IsR0FBRzs7O0NBRzlCLENBQUM7QUFFRixNQUFNLHVCQUF1QixHQUFHOztFQUU5QixDQUFDO0FBRUgsU0FBUywyQkFBMkIsQ0FBQyxxQkFBK0IsRUFBRSxjQUF3QixFQUFFLFdBQW9CO0lBQ25ILElBQUksT0FBTyxHQUFHLG9CQUFvQixDQUFDO0lBRW5DLElBQUkscUJBQXFCLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ3RDLE9BQU8sSUFBSSwrRUFBK0UsQ0FBQztRQUMzRixxQkFBcUIsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDakMsT0FBTyxJQUFJLFNBQVMsQ0FBQyxLQUFLLENBQUM7UUFDNUIsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO1NBQU0sQ0FBQztRQUNQLE9BQU8sSUFBSSw4Q0FBOEMsQ0FBQztJQUMzRCxDQUFDO0lBRUQsT0FBTyxJQUFJLHNCQUFzQixDQUFDO0lBRWxDLE9BQU8sSUFBSSxXQUFXLENBQUMsQ0FBQyxDQUFDLHdDQUF3QyxXQUFXLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBRXRGLElBQUksY0FBYyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUNqQyxPQUFPLElBQUksdUJBQXVCLENBQUM7SUFDcEMsQ0FBQztTQUFNLENBQUM7UUFDUCxPQUFPLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxjQUFjLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3BELENBQUM7SUFFRCxPQUFPLE9BQU8sQ0FBQztBQUNoQixDQUFDO0FBRU0sSUFBTSxnQ0FBZ0MsR0FBdEMsTUFBTSxnQ0FBZ0M7YUFFNUIsT0FBRSxHQUFHLG9EQUFvRCxBQUF2RCxDQUF3RDtJQU8xRSxZQUNlLFdBQTBDLEVBQ3ZDLGNBQWdELEVBQzFDLG9CQUE0RDtRQUZwRCxnQkFBVyxHQUFYLFdBQVcsQ0FBYztRQUN0QixtQkFBYyxHQUFkLGNBQWMsQ0FBaUI7UUFDekIseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtRQVIzRSxpQkFBWSx3REFBZ0Q7UUFFNUQsNEJBQXVCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUNyQyxvQkFBZSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFPckMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxzQkFBc0IsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNqRSxDQUFDO0lBRUQsSUFBSSxDQUFDLFFBQWE7UUFDakIsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLG9CQUFvQixDQUFDLENBQUM7SUFDOUMsQ0FBQztJQUVELEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBYTtRQUMzQixJQUFJLHFCQUFxQixHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUNsRCxtQ0FBbUMsb0NBRW5DLENBQUM7UUFFRixNQUFNLFdBQVcsR0FBdUIsUUFBUSxDQUFDLFFBQVEsQ0FBQztRQUUxRCxNQUFNLEVBQUUscUJBQXFCLEVBQUUsY0FBYyxFQUFFLEdBQUcsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDckgsSUFDQyxDQUFDLHFCQUFxQjtZQUN0QixxQkFBcUIsQ0FBQyxPQUFPLENBQUMsb0JBQW9CLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDMUQscUJBQXFCLENBQUMsT0FBTyxDQUFDLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzVELHFCQUFxQixDQUFDLE9BQU8sQ0FBQyxXQUFXLElBQUksRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3ZELENBQUMsR0FBRyxxQkFBcUIsRUFBRSxHQUFHLGNBQWMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsb0JBQW9CLENBQUMscUJBQXFCLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFDaEgsQ0FBQztZQUNGLHFCQUFxQixHQUFHLDJCQUEyQixDQUFDLHFCQUFxQixFQUFFLGNBQWMsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUN6RyxDQUFDO1FBRUQsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLFVBQVUsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUNqRSxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFFRCxTQUFTLENBQUMsUUFBYSxFQUFFLE9BQW1CLEVBQUUsSUFBdUI7UUFDcEUsSUFBSSxDQUFDO1lBQ0osTUFBTSxxQkFBcUIsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2hFLE1BQU0sY0FBYyxHQUFHLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1lBRXBELElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLG1DQUFtQyxFQUFFLHFCQUFxQixnRUFBK0MsQ0FBQztZQUNwSSxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FDeEIsMkJBQTJCLEVBQzNCLElBQUksQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxnRUFHcEMsQ0FBQztRQUNILENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVqQixPQUFPLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUMxQixDQUFDO0lBRUQsS0FBSyxDQUFDLFFBQWEsRUFBRSxJQUFtQjtRQUN2QyxPQUFPO1lBQ04sT0FBTztnQkFDTixPQUFPO1lBQ1IsQ0FBQztTQUNELENBQUM7SUFDSCxDQUFDO0lBQ0QsS0FBSyxDQUFDLFFBQWE7UUFDbEIsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLFNBQVUsQ0FBQyxDQUFDO0lBQ3BDLENBQUM7SUFDRCxPQUFPLENBQUMsUUFBYTtRQUNwQixPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBVSxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUNELE1BQU0sQ0FBQyxRQUFhLEVBQUUsSUFBd0I7UUFDN0MsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLFNBQVUsQ0FBQyxDQUFDO0lBQ3BDLENBQUM7SUFDRCxNQUFNLENBQUMsSUFBUyxFQUFFLEVBQU8sRUFBRSxJQUEyQjtRQUNyRCxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBVSxDQUFDLENBQUM7SUFDcEMsQ0FBQzs7QUEvRVcsZ0NBQWdDO0lBVTFDLFdBQUEsWUFBWSxDQUFBO0lBQ1osV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLHFCQUFxQixDQUFBO0dBWlgsZ0NBQWdDLENBZ0Y1QyJ9