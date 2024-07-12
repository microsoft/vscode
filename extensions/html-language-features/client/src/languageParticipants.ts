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
	hasLanguage(languageId: string): boolean;
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
			const htmlLanguageParticipants = extension.packageJSON?.contributes?.htmlLanguageParticipants as LanguageParticipantContribution[];
			if (Array.isArray(htmlLanguageParticipants)) {
				for (const htmlLanguageParticipant of htmlLanguageParticipants) {
					const languageId = htmlLanguageParticipant.languageId;
					if (typeof languageId === 'string') {
						languages.add(languageId);
						if (htmlLanguageParticipant.autoInsert !== false) {
							autoInsert.add(languageId);
						}
					}
				}
			}
		}
		return !isEqualSet(languages, oldLanguages) || !isEqualSet(autoInsert, oldAutoInsert);
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
		hasLanguage(languageId: string) { return languages.has(languageId); },
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
