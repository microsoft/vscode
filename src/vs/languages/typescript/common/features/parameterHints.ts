/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import strings = require('vs/base/common/strings');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import converter = require('vs/languages/typescript/common/features/converter');
import previewer = require('vs/languages/typescript/common/features/previewer');

export function compute(languageService: ts.LanguageService, resource: URI, position: EditorCommon.IPosition): Modes.IParameterHints {

	var filename = resource.toString(),
		sourceFile = languageService.getSourceFile(filename),
		offset = converter.getOffset(sourceFile, position),
		info = languageService.getSignatureHelpItems(filename, offset);

	if (!info) {
		return null;
	}

	var ret = <Modes.IParameterHints> {
		currentSignature: info.selectedItemIndex,
		currentParameter: info.argumentIndex,
		signatures: []
	};

	info.items.forEach(item => {

		var signature = <Modes.ISignature> {
			label: strings.empty,
			documentation: null,
			parameters: []
		};

		signature.label += previewer.plain(item.prefixDisplayParts);
		item.parameters.forEach((p, i, a) => {
			var label = previewer.plain(p.displayParts);
			var parameter = <Modes.IParameter> {
				label: label,
				documentation: previewer.plain(p.documentation),
				signatureLabelOffset: signature.label.length,
				signatureLabelEnd: signature.label.length + label.length
			};
			signature.label += label;
			signature.parameters.push(parameter);
			if(i < a.length - 1) {
				signature.label += previewer.plain(item.separatorDisplayParts);
			}
		});
		signature.label += previewer.plain(item.suffixDisplayParts);
		ret.signatures.push(signature);
	});

	return ret;
}
