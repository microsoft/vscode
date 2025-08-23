// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import {
    CancellationToken,
    LanguageModelTextPart,
    LanguageModelTool,
    LanguageModelToolInvocationOptions,
    LanguageModelToolInvocationPrepareOptions,
    LanguageModelToolResult,
    PreparedToolInvocation,
    Uri,
    workspace,
} from 'vscode';
import { IResourceReference, isCancellationError, resolveFilePath } from './utils';
import { ErrorWithTelemetrySafeReason } from '../common/errors/errorUtils';
import { sendTelemetryEvent } from '../telemetry';
import { EventName } from '../telemetry/constants';

export abstract class BaseTool<T extends IResourceReference> implements LanguageModelTool<T> {
    constructor(private readonly toolName: string) {}

    async invoke(
        options: LanguageModelToolInvocationOptions<T>,
        token: CancellationToken,
    ): Promise<LanguageModelToolResult> {
        if (!workspace.isTrusted) {
            return new LanguageModelToolResult([
                new LanguageModelTextPart('Cannot use this tool in an untrusted workspace.'),
            ]);
        }
        let error: Error | undefined;
        const resource = resolveFilePath(options.input.resourcePath);
        try {
            return await this.invokeImpl(options, resource, token);
        } catch (ex) {
            error = ex as any;
            throw ex;
        } finally {
            const isCancelled = token.isCancellationRequested || (error ? isCancellationError(error) : false);
            const failed = !!error || isCancelled;
            const failureCategory = isCancelled
                ? 'cancelled'
                : error
                ? error instanceof ErrorWithTelemetrySafeReason
                    ? error.telemetrySafeReason
                    : 'error'
                : undefined;
            sendTelemetryEvent(EventName.INVOKE_TOOL, undefined, {
                toolName: this.toolName,
                failed,
                failureCategory,
            });
        }
    }
    protected abstract invokeImpl(
        options: LanguageModelToolInvocationOptions<T>,
        resource: Uri | undefined,
        token: CancellationToken,
    ): Promise<LanguageModelToolResult>;

    async prepareInvocation(
        options: LanguageModelToolInvocationPrepareOptions<T>,
        token: CancellationToken,
    ): Promise<PreparedToolInvocation> {
        const resource = resolveFilePath(options.input.resourcePath);
        return this.prepareInvocationImpl(options, resource, token);
    }

    protected abstract prepareInvocationImpl(
        options: LanguageModelToolInvocationPrepareOptions<T>,
        resource: Uri | undefined,
        token: CancellationToken,
    ): Promise<PreparedToolInvocation>;
}
