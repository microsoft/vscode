/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentSelector } from 'vscode-languageclient';
import { Event, EventEmitter, extensions } from 'vscode';

/**
 * HTML language participant contribution.
 */
interface LanguageParticipantContribution {
	/**
	 * The id of the language which participates with the HTML language server.
	 */
	languageId: string;
	/**
	 * true if the language activates the auto insertion and false otherwise.
	 */
	autoInsert?: boolean;
}

export interface LanguageParticipants {
	readonly onDidChange: Event<void>;
	readonly documentSelector: DocumentSelector;
	useAutoInsert(languageId: string): boolean;
	dispose(): void;
}

export function getLanguageParticipants(): LanguageParticipants {
	const onDidChangeEmmiter = new EventEmitter<void>();
	let languages = new Set<string>();
	let autoInsert = new Set<string>();

	function update() {
		const oldLanguages = languages, oldAutoInsert = autoInsert;

		languages = new Set();
		languages.add('html');
		autoInsert = new Set();
		autoInsert.add('html');

		for (const extension of extensions.allAcrossExtensionHosts) {
			const htmlLanguages = extension.packageJSON?.contributes?.htmlLanguages as LanguageParticipantContribution[];
			if (Array.isArray(htmlLanguages)) {
				for (const htmlLanguage of htmlLanguages) {
					const languageId = htmlLanguage.languageId;
					if (typeof languageId === 'string') {
						languages.add(languageId);
						if (htmlLanguage.autoInsert !== false) {
							autoInsert.add(languageId);
						}
					}
				}
			}
		}
		return !isEqualSet(languages, oldLanguages) || !isEqualSet(oldLanguages, oldAutoInsert);
	}
	update();

	const changeListener = extensions.onDidChange(_ => {
		if (update()) {
			onDidChangeEmmiter.fire();
		}
	});

	return {
		onDidChange: onDidChangeEmmiter.event,
		get documentSelector() { return Array.from(languages); },
		useAutoInsert(languageId: string) { return autoInsert.has(languageId); },
		dispose: () => changeListener.dispose()
	};
}

function isEqualSet<T>(s1: Set<T>, s2: Set<T>) {
	if (s1.size !== s2.size) {
		return false;
	}
	for (const e of s1) {
		if (!s2.has(e)) {
			return false;
		}
	}
	return true;
}
