// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import { anything, instance, mock, when, verify } from 'ts-mockito';
import { Extension } from 'vscode';
import { setDefaultLanguageServer } from '../../client/activation/common/defaultlanguageServer';
import { LanguageServerType } from '../../client/activation/types';
import { PYLANCE_EXTENSION_ID } from '../../client/common/constants';
import { IDefaultLanguageServer, IExtensions } from '../../client/common/types';
import { ServiceManager } from '../../client/ioc/serviceManager';
import { IServiceManager } from '../../client/ioc/types';

suite('Activation - setDefaultLanguageServer()', () => {
    let extensions: IExtensions;
    let extension: Extension<unknown>;
    let serviceManager: IServiceManager;
    setup(() => {
        extensions = mock();
        extension = mock();
        serviceManager = mock(ServiceManager);
    });

    test('Pylance not installed', async () => {
        let defaultServerType;

        when(extensions.getExtension(PYLANCE_EXTENSION_ID)).thenReturn(undefined);
        when(serviceManager.addSingletonInstance<IDefaultLanguageServer>(IDefaultLanguageServer, anything())).thenCall(
            (_symbol, value: IDefaultLanguageServer) => {
                defaultServerType = value.defaultLSType;
            },
        );

        await setDefaultLanguageServer(instance(extensions), instance(serviceManager));

        verify(extensions.getExtension(PYLANCE_EXTENSION_ID)).once();
        verify(serviceManager.addSingletonInstance<IDefaultLanguageServer>(IDefaultLanguageServer, anything())).once();
        expect(defaultServerType).to.equal(LanguageServerType.Jedi);
    });

    test('Pylance installed', async () => {
        let defaultServerType;

        when(extensions.getExtension(PYLANCE_EXTENSION_ID)).thenReturn(instance(extension));
        when(serviceManager.addSingletonInstance<IDefaultLanguageServer>(IDefaultLanguageServer, anything())).thenCall(
            (_symbol, value: IDefaultLanguageServer) => {
                defaultServerType = value.defaultLSType;
            },
        );

        await setDefaultLanguageServer(instance(extensions), instance(serviceManager));

        verify(extensions.getExtension(PYLANCE_EXTENSION_ID)).once();
        verify(serviceManager.addSingletonInstance<IDefaultLanguageServer>(IDefaultLanguageServer, anything())).once();
        expect(defaultServerType).to.equal(LanguageServerType.Node);
    });
});
