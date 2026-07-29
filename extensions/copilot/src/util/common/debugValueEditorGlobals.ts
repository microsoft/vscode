/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IDebugValueEditorGlobals {
	$$debugValueEditor_run: (args: any) => void;
	$$debugValueEditor_properties: readonly any[];

	$$debugValueEditor_debugChannels: Record</* name of the debug channel */ string, DebugChannel>;

	$$debugValueEditor_refresh?: (body: string) => void;
}

type DebugChannel = (host: IHost) => IRequestHandler;

interface IHost {
	sendNotification: (data: unknown) => void;
}

interface IRequestHandler {
	handleRequest: (data: unknown) => unknown;
}

export interface IPlaygroundRunnerGlobals {
	$$playgroundRunner_data: {
		currentPath: string[];
	};
}
