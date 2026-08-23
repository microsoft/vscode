/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// The following code was moved from config.ts into here to break the cyclic dependencies

import { createServiceIdentifier } from '../../../../../../util/common/services';
import { IInstantiationService } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { BlockMode } from '../../../../../completions/common/config';
import { isSupportedLanguageId } from '../../../prompt/src/parse';
import { ConfigKey, getConfig } from '../config';
import { ICompletionsFeaturesService } from '../experiments/featuresService';
import { TelemetryWithExp } from '../telemetry';
import { BlockTrimmer } from './blockTrimmer';
import { StatementTree } from './statementTree';

export const ICompletionsBlockModeConfig = createServiceIdentifier<ICompletionsBlockModeConfig>('ICompletionsBlockModeConfig');
export interface ICompletionsBlockModeConfig {
	readonly _serviceBrand: undefined;
	forLanguage(languageId: string, telemetryData: TelemetryWithExp): BlockMode;
}

export class ConfigBlockModeConfig implements ICompletionsBlockModeConfig {
	declare _serviceBrand: undefined;
	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICompletionsFeaturesService private readonly featuresService: ICompletionsFeaturesService,
	) { }

	forLanguage(languageId: string, telemetryData: TelemetryWithExp): BlockMode {
		const overrideBlockMode = this.featuresService.overrideBlockMode(telemetryData);
		if (overrideBlockMode) {
			return toApplicableBlockMode(overrideBlockMode, languageId);
		}
		const progressiveReveal = this.featuresService.enableProgressiveReveal(telemetryData);
		const config = this.instantiationService.invokeFunction(getConfig, ConfigKey.AlwaysRequestMultiline);
		if (config ?? progressiveReveal) {
			return toApplicableBlockMode(BlockMode.MoreMultiline, languageId);
		}

		if (BlockTrimmer.isTrimmedByDefault(languageId)) {
			return toApplicableBlockMode(BlockMode.MoreMultiline, languageId);
		}
		// special casing once cancellations based on tree-sitter propagate to
		// the proxy.
		if (languageId === 'ruby') {
			return BlockMode.Parsing;
		}
		// For existing multiline languages use standard tree-sitter based parsing
		// plus proxy-side trimming
		if (isSupportedLanguageId(languageId)) {
			return BlockMode.ParsingAndServer;
		}
		return BlockMode.Server;
	}
}

function blockModeRequiresTreeSitter(blockMode: BlockMode): boolean {
	return [BlockMode.Parsing, BlockMode.ParsingAndServer, BlockMode.MoreMultiline].includes(blockMode);
}

/**
 * Prevents tree-sitter parsing from being applied to languages we don't include
 * parsers for.
 */
function toApplicableBlockMode(blockMode: BlockMode, languageId: string): BlockMode {
	if (blockMode === BlockMode.MoreMultiline && StatementTree.isSupported(languageId)) {
		return blockMode;
	}
	if (blockModeRequiresTreeSitter(blockMode) && !isSupportedLanguageId(languageId)) {
		return BlockMode.Server;
	}
	return blockMode;
}
