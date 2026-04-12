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
import { Action } from '../../../base/common/actions.js';
import { isCancellationError } from '../../../base/common/errors.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { localize } from '../../../nls.js';
import { INotificationService, Severity } from '../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../platform/opener/common/opener.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { defaultExternalUriOpenerId } from '../../contrib/externalUriOpener/common/configuration.js';
import { ContributedExternalUriOpenersStore } from '../../contrib/externalUriOpener/common/contributedOpeners.js';
import { IExternalUriOpenerService } from '../../contrib/externalUriOpener/common/externalUriOpenerService.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
let MainThreadUriOpeners = class MainThreadUriOpeners extends Disposable {
    constructor(context, storageService, externalUriOpenerService, extensionService, openerService, notificationService) {
        super();
        this.extensionService = extensionService;
        this.openerService = openerService;
        this.notificationService = notificationService;
        this._registeredOpeners = new Map();
        this.proxy = context.getProxy(ExtHostContext.ExtHostUriOpeners);
        this._register(externalUriOpenerService.registerExternalOpenerProvider(this));
        this._contributedExternalUriOpenersStore = this._register(new ContributedExternalUriOpenersStore(storageService, extensionService));
    }
    async *getOpeners(targetUri) {
        // Currently we only allow openers for http and https urls
        if (targetUri.scheme !== Schemas.http && targetUri.scheme !== Schemas.https) {
            return;
        }
        await this.extensionService.activateByEvent(`onOpenExternalUri:${targetUri.scheme}`);
        for (const [id, openerMetadata] of this._registeredOpeners) {
            if (openerMetadata.schemes.has(targetUri.scheme)) {
                yield this.createOpener(id, openerMetadata);
            }
        }
    }
    createOpener(id, metadata) {
        return {
            id: id,
            label: metadata.label,
            canOpen: (uri, token) => {
                return this.proxy.$canOpenUri(id, uri, token);
            },
            openExternalUri: async (uri, ctx, token) => {
                try {
                    await this.proxy.$openUri(id, { resolvedUri: uri, sourceUri: ctx.sourceUri }, token);
                }
                catch (e) {
                    if (!isCancellationError(e)) {
                        const openDefaultAction = new Action('default', localize('openerFailedUseDefault', "Open using default opener"), undefined, undefined, async () => {
                            await this.openerService.open(uri, {
                                allowTunneling: false,
                                allowContributedOpeners: defaultExternalUriOpenerId,
                            });
                        });
                        openDefaultAction.tooltip = uri.toString();
                        this.notificationService.notify({
                            severity: Severity.Error,
                            message: localize({
                                key: 'openerFailedMessage',
                                comment: ['{0} is the id of the opener. {1} is the url being opened.'],
                            }, 'Could not open uri with \'{0}\': {1}', id, e.toString()),
                            actions: {
                                primary: [
                                    openDefaultAction
                                ]
                            }
                        });
                    }
                }
                return true;
            },
        };
    }
    async $registerUriOpener(id, schemes, extensionId, label) {
        if (this._registeredOpeners.has(id)) {
            throw new Error(`Opener with id '${id}' already registered`);
        }
        this._registeredOpeners.set(id, {
            schemes: new Set(schemes),
            label,
            extensionId,
        });
        this._contributedExternalUriOpenersStore.didRegisterOpener(id, extensionId.value);
    }
    async $unregisterUriOpener(id) {
        this._registeredOpeners.delete(id);
        this._contributedExternalUriOpenersStore.delete(id);
    }
    dispose() {
        super.dispose();
        this._registeredOpeners.clear();
    }
};
MainThreadUriOpeners = __decorate([
    extHostNamedCustomer(MainContext.MainThreadUriOpeners),
    __param(1, IStorageService),
    __param(2, IExternalUriOpenerService),
    __param(3, IExtensionService),
    __param(4, IOpenerService),
    __param(5, INotificationService)
], MainThreadUriOpeners);
export { MainThreadUriOpeners };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZFVyaU9wZW5lcnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvbWFpblRocmVhZFVyaU9wZW5lcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFMUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRTNDLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxRQUFRLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN2RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDM0UsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxjQUFjLEVBQTBCLFdBQVcsRUFBNkIsTUFBTSwrQkFBK0IsQ0FBQztBQUMvSCxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNyRyxPQUFPLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUNsSCxPQUFPLEVBQStDLHlCQUF5QixFQUFFLE1BQU0sb0VBQW9FLENBQUM7QUFDNUosT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbkYsT0FBTyxFQUFFLG9CQUFvQixFQUFtQixNQUFNLHNEQUFzRCxDQUFDO0FBU3RHLElBQU0sb0JBQW9CLEdBQTFCLE1BQU0sb0JBQXFCLFNBQVEsVUFBVTtJQU1u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