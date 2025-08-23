// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { IDisposableRegistry, IExtensionContext } from './common/types';
import { IServiceContainer, IServiceManager } from './ioc/types';

/**
 * The global extension state needed by components.
 *
 */
export type ExtensionState = {
    context: IExtensionContext;
    disposables: IDisposableRegistry;
    // For now we include the objects dealing with inversify (IOC)
    // registration.  These will be removed later.
    legacyIOC: {
        serviceManager: IServiceManager;
        serviceContainer: IServiceContainer;
    };
};

/**
 * The result of activating a component of the extension.
 *
 * Getting this value means the component has reached a state where it
 * may be used by the rest of the extension.
 *
 * If the component started any non-critical activation-related
 * operations during activation then the "fullyReady" property will only
 * resolve once all those operations complete.
 *
 * The component may have also started long-running background helpers.
 * Those are not exposed here.
 */
export type ActivationResult = {
    fullyReady: Promise<void>;
};
