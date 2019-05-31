/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextMateService } from 'vs/workbench/services/textMate/common/textMateService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { AbstractTextMateService } from 'vs/workbench/services/textMate/browser/abstractTextMateService';
import * as vscodeTextmate from 'vscode-textmate';
import * as onigasm from 'onigasm-umd';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export class TextMateService extends AbstractTextMateService {

	constructor(
		@IModeService modeService: IModeService,
		@IWorkbenchThemeService themeService: IWorkbenchThemeService,
		@IFileService fileService: IFileService,
		@INotificationService notificationService: INotificationService,
		@ILogService logService: ILogService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(modeService, themeService, fileService, notificationService, logService, configurationService);
	}

	protected _loadVSCodeTextmate(): Promise<typeof import('vscode-textmate')> {
		return import('vscode-textmate');
	}

	protected _getRegistryOptions(parseRawGrammar: (content: string, filePath: string) => vscodeTextmate.IRawGrammar): vscodeTextmate.RegistryOptions {
		const result = super._getRegistryOptions(parseRawGrammar);
		result.getOnigLib = () => loadOnigasm();
		return result;
	}
}

let onigasmPromise: Promise<vscodeTextmate.IOnigLib> | null = null;
async function loadOnigasm(): Promise<vscodeTextmate.IOnigLib> {
	if (!onigasmPromise) {
		onigasmPromise = doLoadOnigasm();
	}
	return onigasmPromise;
}

async function doLoadOnigasm(): Promise<vscodeTextmate.IOnigLib> {
	const wasmBytes = await loadOnigasmWASM();
	await onigasm.loadWASM(wasmBytes);
	return {
		createOnigScanner(patterns: string[]) { return new onigasm.OnigScanner(patterns); },
		createOnigString(s: string) { return new onigasm.OnigString(s); }
	};
}

async function loadOnigasmWASM(): Promise<ArrayBuffer> {
	const wasmPath = require.toUrl('onigasm-umd/../onigasm.wasm');
	const response = await fetch(wasmPath);
	const bytes = await response.arrayBuffer();
	return bytes;
}

registerSingleton(ITextMateService, TextMateService);
