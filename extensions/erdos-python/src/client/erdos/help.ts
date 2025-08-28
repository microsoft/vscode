/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as erdos from 'erdos';
import * as vscode from 'vscode';
import { LanguageClient, Position, RequestType, VersionedTextDocumentIdentifier } from 'vscode-languageclient/node';

interface HelpTopicParams {
    textDocument: VersionedTextDocumentIdentifier;
    position: Position;
}

interface HelpTopicResponse {
    topic: string;
}

export namespace HelpTopicRequest {
    export const type: RequestType<HelpTopicParams, HelpTopicResponse | undefined, any> = new RequestType(
        'erdos/textDocument/helpTopic',
    );
}

export class PythonHelpTopicProvider implements erdos.HelpTopicProvider {
    private readonly _client: LanguageClient;

    constructor(readonly client: LanguageClient) {
        this._client = client;
    }

    async provideHelpTopic(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
    ): Promise<string | undefined> {
        const params: HelpTopicParams = {
            textDocument: this._client.code2ProtocolConverter.asVersionedTextDocumentIdentifier(document),
            position: this._client.code2ProtocolConverter.asPosition(position),
        };

        const response = await this._client.sendRequest(HelpTopicRequest.type, params, token);
        return response?.topic;
    }
}
