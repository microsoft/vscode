/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * External interfaces for integration into code-server over IPC.
 */
export interface CodeServerConfiguration {
	authed: boolean
	base: string
	csStaticBase: string
	disableUpdateCheck: boolean
	logLevel: number
}


export type Query = { [key: string]: string | string[] | undefined | Query | Query[] };

export interface SocketMessage {
	type: 'socket'
	query: Query
	permessageDeflate: boolean
}

export interface CliMessage {
	type: 'cli'
	// args: Args
}

export interface OpenCommandPipeArgs {
	type: 'open'
	fileURIs?: string[]
	folderURIs: string[]
	forceNewWindow?: boolean
	diffMode?: boolean
	addMode?: boolean
	gotoLineMode?: boolean
	forceReuseWindow?: boolean
	waitMarkerFilePath?: string
}

export type CodeServerMessage = SocketMessage | CliMessage;

export interface ReadyMessage {
	type: 'ready'
}

export interface OptionsMessage {
	id: string
	type: 'options'
	// options: WorkbenchOptions
}

export type VscodeMessage = ReadyMessage | OptionsMessage;

// export interface Args {
// 	'user-data-dir'?: string

// 	'enable-proposed-api'?: string[]
// 	'extensions-dir'?: string
// 	'builtin-extensions-dir'?: string
// 	'extra-extensions-dir'?: string[]
// 	'extra-builtin-extensions-dir'?: string[]
// 	'ignore-last-opened'?: boolean

// 	locale?: string

// 	log?: string
// 	verbose?: boolean

// 	_: string[]
// }

export interface UriComponents {
	readonly scheme: string
	readonly authority: string
	readonly path: string
	readonly query: string
	readonly fragment: string
}

export interface WorkbenchOptionsMessage {
	id: string
}
