/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Attachment } from '@github/copilot/sdk';
import * as l10n from '@vscode/l10n';
import type { ChatPromptReference } from 'vscode';
import { isLocation } from '../../../../util/common/types';
import { coalesce } from '../../../../util/vs/base/common/arrays';
import { Codicon } from '../../../../util/vs/base/common/codicons';
import { ResourceSet } from '../../../../util/vs/base/common/map';
import { basename } from '../../../../util/vs/base/common/resources';
import { isNumber, isString } from '../../../../util/vs/base/common/types';
import { URI } from '../../../../util/vs/base/common/uri';
import { Range as InternalRange } from '../../../../util/vs/editor/common/core/range';
import { SymbolKind } from '../../../../util/vs/workbench/api/common/extHostTypes/symbolInformation';
import { ChatReferenceDiagnostic, Diagnostic, DiagnosticRelatedInformation, DiagnosticSeverity, Range, Uri } from '../../../../vscodeTypes';
import { PromptFileIdPrefix } from '../../../prompt/common/chatVariablesCollection';

/**
 * Converts a ChatPromptReference into a PromptVariable entry that is used in VS code.
 */
export function convertReferenceToVariable(ref: ChatPromptReference, attachments: readonly Attachment[]) {
	const value = ref.value;
	const range = ref.range ? { start: ref.range[0], endExclusive: ref.range[1] } : undefined;

	if (value && value instanceof ChatReferenceDiagnostic && Array.isArray(value.diagnostics) && value.diagnostics.length && value.diagnostics[0][1].length) {
		const marker = DiagnosticConverter.from(value.diagnostics[0][1][0]);
		const refValue = {
			filterRange: { startLineNumber: marker.startLineNumber, startColumn: marker.startColumn, endLineNumber: marker.endLineNumber, endColumn: marker.endColumn },
			filterSeverity: marker.severity,
			filterUri: value.diagnostics[0][0],
			problemMessage: value.diagnostics[0][1][0].message
		};
		return IDiagnosticVariableEntryFilterData.toEntry(refValue);
	}

	if (isLocation(ref.value) && ref.name.startsWith(`sym:`)) {
		return {
			id: ref.id,
			name: ref.name,
			fullName: ref.name.substring(4),
			value: { uri: ref.value.uri, range: toInternalRange(ref.value.range) },
			// We never send this information to extensions, so default to Property
			symbolKind: SymbolKind.Property,
			// We never send this information to extensions, so default to Property
			icon: Codicon.symbolProperty,
			kind: 'symbol',
			range,
		};
	}

	if (URI.isUri(value) && ref.name.startsWith(`prompt:`) &&
		ref.id.startsWith(PromptFileIdPrefix) &&
		ref.id.endsWith(value.toString())) {
		return {
			id: ref.id,
			name: `prompt:${basename(value)}`,
			value,
			kind: 'promptFile',
			modelDescription: 'Prompt instructions file',
			isRoot: true,
			automaticallyAdded: false,
			range,
		};
	}

	const folders = new ResourceSet(attachments.filter(att => att.type === 'directory').map(att => URI.file(att.path)));
	const isFile = URI.isUri(value) || isLocation(value);
	const isFolder = URI.isUri(value) && (value.path.endsWith('/') || folders.has(value));
	return {
		id: ref.id,
		name: ref.name,
		value,
		modelDescription: ref.modelDescription,
		range,
		kind: isFolder ? 'directory' as const : isFile ? 'file' as const : 'generic' as const
	};
}

function toInternalRange(range: Range): InternalRange {
	return new InternalRange(range.start.line + 1, range.start.character + 1, range.end.line + 1, range.end.character + 1);
}

namespace DiagnosticTagConverter {

	/**
	 * Additional metadata about the type of a diagnostic.
	 */
	export enum DiagnosticTag {
		/**
		 * Unused or unnecessary code.
		 *
		 * Diagnostics with this tag are rendered faded out. The amount of fading
		 * is controlled by the `"editorUnnecessaryCode.opacity"` theme color. For
		 * example, `"editorUnnecessaryCode.opacity": "#000000c0"` will render the
		 * code with 75% opacity. For high contrast themes, use the
		 * `"editorUnnecessaryCode.border"` theme color to underline unnecessary code
		 * instead of fading it out.
		 */
		Unnecessary = 1,

		/**
		 * Deprecated or obsolete code.
		 *
		 * Diagnostics with this tag are rendered with a strike through.
		 */
		Deprecated = 2,
	}
	export const enum MarkerTag {
		Unnecessary = 1,
		Deprecated = 2
	}


	export function from(value: DiagnosticTag) {

		switch (value) {
			case DiagnosticTag.Unnecessary:
				return MarkerTag.Unnecessary;
			case DiagnosticTag.Deprecated:
				return MarkerTag.Deprecated;
			default:
				return undefined;
		}
	}
}


namespace IDiagnosticVariableEntryFilterData {
	export const icon = Codicon.error;

	export function fromMarker(marker: Record<string, unknown>) {
		return {
			filterUri: marker.resource,
			owner: marker.owner,
			problemMessage: marker.message,
			filterRange: { startLineNumber: marker.startLineNumber, endLineNumber: marker.endLineNumber, startColumn: marker.startColumn, endColumn: marker.endColumn }
		};
	}

	export function toEntry(data: Record<string, unknown>) {
		return {
			id: id(data),
			name: label(data),
			icon,
			value: data,
			kind: 'diagnostic',
			...data,
		};
	}

	export function id(data: Record<string, unknown> & { filterRange?: InternalRange }) {
		return [data.filterUri, data.owner, data.filterSeverity, data.filterRange?.startLineNumber, data.filterRange?.startColumn].join(':');
	}

	export function label(data: Record<string, unknown> & { problemMessage?: string; filterUri?: Uri }) {
		const enum TrimThreshold {
			MaxChars = 30,
			MaxSpaceLookback = 10,
		}
		if (data.problemMessage) {
			if (data.problemMessage.length < TrimThreshold.MaxChars) {
				return data.problemMessage;
			}

			// Trim the message, on a space if it would not lose too much
			// data (MaxSpaceLookback) or just blindly otherwise.
			const lastSpace = data.problemMessage.lastIndexOf(' ', TrimThreshold.MaxChars);
			if (lastSpace === -1 || lastSpace + TrimThreshold.MaxSpaceLookback < TrimThreshold.MaxChars) {
				return data.problemMessage.substring(0, TrimThreshold.MaxChars) + '…';
			}
			return data.problemMessage.substring(0, lastSpace) + '…';
		}
		let labelStr = l10n.t("All Problems");
		if (data.filterUri) {
			labelStr = l10n.t("Problems in {0}", basename(data.filterUri));
		}

		return labelStr;
	}
}

namespace DiagnosticConverter {
	export function from(value: Diagnostic) {
		let code: string | { value: string; target: Uri } | undefined;

		if (value.code) {
			if (isString(value.code) || isNumber(value.code)) {
				code = String(value.code);
			} else {
				code = {
					value: String(value.code.value),
					target: value.code.target,
				};
			}
		}

		return {
			...toInternalRange(value.range),
			message: value.message,
			source: value.source,
			code,
			severity: DiagnosticSeverityConverter.from(value.severity),
			relatedInformation: value.relatedInformation && value.relatedInformation.map(DiagnosticRelatedInformationConverter.from),
			tags: Array.isArray(value.tags) ? coalesce(value.tags.map(DiagnosticTagConverter.from)) : undefined,
		};
	}
}

namespace DiagnosticRelatedInformationConverter {
	export function from(value: DiagnosticRelatedInformation) {
		return {
			...toInternalRange(value.location.range),
			message: value.message,
			resource: value.location.uri
		};
	}
}

namespace DiagnosticSeverityConverter {
	export enum MarkerSeverity {
		Hint = 1,
		Info = 2,
		Warning = 4,
		Error = 8,
	}

	export function from(value: number): MarkerSeverity {
		switch (value) {
			case DiagnosticSeverity.Error:
				return MarkerSeverity.Error;
			case DiagnosticSeverity.Warning:
				return MarkerSeverity.Warning;
			case DiagnosticSeverity.Information:
				return MarkerSeverity.Info;
			case DiagnosticSeverity.Hint:
				return MarkerSeverity.Hint;
		}
		return MarkerSeverity.Error;
	}
}
