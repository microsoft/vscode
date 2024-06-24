/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Connection, Disposable, DocumentFormattingRequest, DocumentRangeFormattingRequest, LanguageServer, NotificationType, RequestType } from '@volar/language-server';
import { Emitter } from 'vscode-jsonrpc';
import { fetchHTMLDataProviders } from './customData';
import { htmlLanguagePlugin } from './modes/languagePlugin';
import { createHtmlProject } from './modes/project';
import { getLanguageServicePlugins } from './modes/languageServicePlugins';

namespace CustomDataChangedNotification {
	export const type: NotificationType<string[]> = new NotificationType('html/customDataChanged');
}

namespace CustomDataContent {
	export const type: RequestType<string, string, any> = new RequestType('html/customDataContent');
}

export interface CustomDataRequestService {
	getContent(uri: string): Promise<string>;
}

export function startServer(server: LanguageServer, connection: Connection) {

	let clientSnippetSupport = false;
	let dynamicFormatterRegistration = false;
	let formatterMaxNumberOfEdits = Number.MAX_VALUE;
	let dataPaths: string[];
	let formatterRegistrations: Promise<Disposable>[] | null = null;

	const customDataChangedEmitter = new Emitter<void>();
	const customDataRequestService: CustomDataRequestService = {
		getContent(uri: string) {
			return connection.sendRequest(CustomDataContent.type, uri);
		}
	};

	// The settings have changed. Is send on server activation as well.
	server.onDidChangeConfiguration(async () => {
		// dynamically enable & disable the formatter
		if (dynamicFormatterRegistration) {
			const enableFormatter = await server.getConfiguration<boolean>('html.format.enable');
			if (enableFormatter) {
				if (!formatterRegistrations) {
					const documentSelector = [{ language: 'html' }, { language: 'handlebars' }];
					formatterRegistrations = [
						connection.client.register(DocumentRangeFormattingRequest.type, { documentSelector }),
						connection.client.register(DocumentFormattingRequest.type, { documentSelector })
					];
				}
			} else if (formatterRegistrations) {
				formatterRegistrations.forEach(p => p.then(r => r.dispose()));
				formatterRegistrations = null;
			}
		}
	});


	connection.onInitialize(params => {
		const initializationOptions = params.initializationOptions as any || {};

		dataPaths = initializationOptions?.dataPaths || [];

		function getClientCapability<T>(name: string, def: T) {
			const keys = name.split('.');
			let c: any = params.capabilities;
			for (let i = 0; c && i < keys.length; i++) {
				if (!c.hasOwnProperty(keys[i])) {
					return def;
				}
				c = c[keys[i]];
			}
			return c;
		}

		clientSnippetSupport = getClientCapability('textDocument.completion.completionItem.snippetSupport', false);
		dynamicFormatterRegistration = getClientCapability('textDocument.rangeFormatting.dynamicRegistration', false) && (typeof initializationOptions?.provideFormatter !== 'boolean');
		formatterMaxNumberOfEdits = initializationOptions?.customCapabilities?.rangeFormatting?.editLimit || Number.MAX_VALUE;

		const supportsDiagnosticPull = getClientCapability('textDocument.diagnostic', undefined);

		const initializeResult = server.initialize(
			params,
			createHtmlProject([htmlLanguagePlugin]),
			getLanguageServicePlugins({
				supportedLanguages: initializationOptions?.embeddedLanguages || { css: true, javascript: true },
				getCustomData: () => fetchHTMLDataProviders(dataPaths, customDataRequestService),
				onDidChangeCustomData: listener => customDataChangedEmitter.event(listener),
				formatterMaxNumberOfEdits,
			}),
			{ pullModelDiagnostics: supportsDiagnosticPull }
		);

		if (!initializationOptions?.provideFormatter) {
			initializeResult.capabilities.documentRangeFormattingProvider = undefined;
			initializeResult.capabilities.documentFormattingProvider = undefined;
		}
		if (!clientSnippetSupport) {
			initializeResult.capabilities.completionProvider = undefined;
		}

		return initializeResult;
	});

	connection.onInitialized(server.initialized);

	connection.onShutdown(server.shutdown);

	connection.onNotification(CustomDataChangedNotification.type, newDataPaths => {
		dataPaths = newDataPaths;
		customDataChangedEmitter.fire();
	});

	connection.listen();
}
