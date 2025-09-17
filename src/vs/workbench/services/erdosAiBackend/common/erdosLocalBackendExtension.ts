/*---------------------------------------------------------------------------------------------
 * Copyright (c) Lotas Inc. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// Type definitions for the Erdos Local Backend Extension service
export interface IErdosLocalBackendExtensionService {
    context: any; // VSCode ExtensionContext
    getApiKey(provider: 'anthropic' | 'openai'): Promise<string | undefined>;
    isBYOKEnabled(provider: 'anthropic' | 'openai'): Promise<boolean>;
    processStreamingQuery(
        messages: any[],
        provider: string,
        model: string,
        temperature: number,
        requestId: string,
        contextData: any,
        onData: (data: any) => void,
        onError: (error: Error) => void,
        onComplete: () => void
    ): Promise<void>;
}

// Global interface extension
declare global {
    var erdosLocalBackendService: IErdosLocalBackendExtensionService | undefined;
}
