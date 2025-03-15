/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, IDisposable, markAsSingleton, toDisposable } from '../../../base/common/lifecycle.js';
import * as strings from '../../../base/common/strings.js';
import { ITextModel } from '../model.js';
import { DEFAULT_WORD_REGEXP, ensureValidWordDefinition } from '../core/wordHelper.js';
import { EnterAction, FoldingRules, IAutoClosingPair, IndentationRule, LanguageConfiguration, AutoClosingPairs, CharacterPair, ExplicitLanguageConfiguration } from './languageConfiguration.js';
import { CharacterPairSupport } from './supports/characterPair.js';
import { BracketElectricCharacterSupport } from './supports/electricCharacter.js';
import { IndentRulesSupport } from './supports/indentRules.js';
import { OnEnterSupport } from './supports/onEnter.js';
import { RichEditBrackets } from './supports/richEditBrackets.js';
import { EditorAutoIndentStrategy } from '../config/editorOptions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { ILanguageService } from './language.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { PLAINTEXT_LANGUAGE_ID } from './modesRegistry.js';
import { LanguageBracketsConfiguration } from './supports/languageBracketsConfiguration.js';

/**
 * Interface used to support insertion of mode specific comments.
 */
export interface ICommentsConfiguration {
	lineCommentToken?: string;
	lineCommentTokenColumn?: number;
	blockCommentStartToken?: string;
	blockCommentEndToken?: string;
}

export interface ILanguageConfigurationService {
	readonly _serviceBrand: undefined;

	onDidChange: Event<LanguageConfigurationServiceChangeEvent>;

	/**
	 * @param priority Use a higher number for higher priority
	 */
	register(languageId: string, configuration: LanguageConfiguration, priority?: number): IDisposable;

	getLanguageConfiguration(languageId: string): ResolvedLanguageConfiguration;

}

export class LanguageConfigurationServiceChangeEvent {
	constructor(public readonly languageId: string | undefined) { }

	public affects(languageId: string): boolean {
		return !this.languageId ? true : this.languageId === languageId;
	}
}

export const ILanguageConfigurationService = createDecorator<ILanguageConfigurationService>('languageConfigurationService');

export class LanguageConfigurationService extends Disposable implements ILanguageConfigurationService {
	_serviceBrand: undefined;

	private readonly _registry = this._register(new LanguageConfigurationRegistry());

	private readonly onDidChangeEmitter = this._register(new Emitter<LanguageConfigurationServiceChangeEvent>());
	public readonly onDidChange = this.onDidChangeEmitter.event;

	private readonly configurations = new Map<string, ResolvedLanguageConfiguration>();

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILanguageService private readonly languageService: ILanguageService
	) {
		super();

		const languageConfigKeys = new Set(Object.values(customizedLanguageConfigKeys));

		this._register(this.configurationService.onDidChangeConfiguration((e) => {
			const globalConfigChanged = e.change.keys.some((k) =>
				languageConfigKeys.has(k)
			);
			const localConfigChanged = e.change.overrides
				.filter(([overrideLangName, keys]) =>
					keys.some((k) => languageConfigKeys.has(k))
				)
				.map(([overrideLangName]) => overrideLangName);

			if (globalConfigChanged) {
				this.configurations.clear();
				this.onDidChangeEmitter.fire(new LanguageConfigurationServiceChangeEvent(undefined));
			} else {
				for (const languageId of localConfigChanged) {
					if (this.languageService.isRegisteredLanguageId(languageId)) {
						this.configurations.delete(languageId);
						this.onDidChangeEmitter.fire(new LanguageConfigurationServiceChangeEvent(languageId));
					}
				}
			}
		}));

		this._register(this._registry.onDidChange((e) => {
			this.configurations.delete(e.languageId);
			this.onDidChangeEmitter.fire(new LanguageConfigurationServiceChangeEvent(e.languageId));
		}));
	}

	public register(languageId: string, configuration: LanguageConfiguration, priority?: number): IDisposable {
		return this._registry.register(languageId, configuration, priority);
	}

	public getLanguageConfiguration(languageId: string): ResolvedLanguageConfiguration {
		let result = this.configurations.get(languageId);
		if (!result) {
			result = computeConfig(languageId, this._registry, this.configurationService, this.languageService);
			this.configurations.set(languageId, result);
		}
		return result;
	}
}

function computeConfig(
	languageId: string,
	registry: LanguageConfigurationRegistry,
	configurationService: IConfigurationService,
	languageService: ILanguageService,
): ResolvedLanguageConfiguration {
	let languageConfig = registry.getLanguageConfiguration(languageId);

	if (!languageConfig) {
		if (!languageService.isRegisteredLanguageId(languageId)) {
			// this happens for the null language, which can be returned by monarch.
			// Instead of throwing an error, we just return a default config.
			return new ResolvedLanguageConfiguration(languageId, {});
		}
		languageConfig = new ResolvedLanguageConfiguration(languageId, {});
	}

	const customizedConfig = getCustomizedLanguageConfig(languageConfig.languageId, configurationService);
	const data = combineLanguageConfigurations([languageConfig.underlyingConfig, customizedConfig]);
	const config = new ResolvedLanguageConfiguration(languageConfig.languageId, data);
	return config;
}

const customizedLanguageConfigKeys = {
	brackets: 'editor.language.brackets',
	colorizedBracketPairs: 'editor.language.colorizedBracketPairs'
};

function getCustomizedLanguageConfig(languageId: string, configurationService: IConfigurationService): LanguageConfiguration {
	const brackets = configurationService.getValue(customizedLanguageConfigKeys.brackets, {
		overrideIdentifier: languageId,
	});

	const colorizedBracketPairs = configurationService.getValue(customizedLanguageConfigKeys.colorizedBracketPairs, {
		overrideIdentifier: languageId,
	});

	return {
		brackets: validateBracketPairs(brackets),
		colorizedBracketPairs: validateBracketPairs(colorizedBracketPairs),
	};
}

function validateBracketPairs(data: unknown): CharacterPair[] | undefined {
	if (!Array.isArray(data)) {
		return undefined;
	}
	return data.map(pair => {
		if (!Array.isArray(pair) || pair.length !== 2) {
			return undefined;
		}
		return [pair[0], pair[1]] as CharacterPair;
	}).filter((p): p is CharacterPair => !!p);
}

export function getIndentationAtPosition(model: ITextModel, lineNumber: number, column: number): string {
	const lineText = model.getLineContent(lineNumber);
	let indentation = strings.getLeadingWhitespace(lineText);
	if (indentation.length > column - 1) {
		indentation = indentation.substring(0, column - 1);
	}
	return indentation;
}

class ComposedLanguageConfiguration {
	private readonly _entries: LanguageConfigurationContribution[];
	private _order: number;
	private _resolved: ResolvedLanguageConfiguration | null = null;

	constructor(public readonly languageId: string) {
		this._entries = [];
		this._order = 0;
		this._resolved = null;
	}

	public register(
		configuration: LanguageConfiguration,
		priority: number
	): IDisposable {
		const entry = new LanguageConfigurationContribution(
			configuration,
			priority,
			++this._order
		);
		this._entries.push(entry);
		this._resolved = null;
		return markAsSingleton(toDisposable(() => {
			for (let i = 0; i < this._entries.length; i++) {
				if (this._entries[i] === entry) {
					this._entries.splice(i, 1);
					this._resolved = null;
					break;
				}
			}
		}));
	}

	public getResolvedConfiguration(): ResolvedLanguageConfiguration | null {
		if (!this._resolved) {
			const config = this._resolve();
			if (config) {
				this._resolved = new ResolvedLanguageConfiguration(
					this.languageId,
					config
				);
			}
		}
		return this._resolved;
	}

	private _resolve(): LanguageConfiguration | null {
		if (this._entries.length === 0) {
			return null;
		}
		this._entries.sort(LanguageConfigurationContribution.cmp);
		return combineLanguageConfigurations(this._entries.map(e => e.configuration));
	}
}

function combineLanguageConfigurations(configs: LanguageConfiguration[]): LanguageConfiguration {
	let result: ExplicitLanguageConfiguration = {
		comments: undefined,
		brackets: undefined,
		wordPattern: undefined,
		indentationRules: undefined,
		onEnterRules: undefined,
		autoClosingPairs: undefined,
		surroundingPairs: undefined,
		autoCloseBefore: undefined,
		folding: undefined,
		colorizedBracketPairs: undefined,
		__electricCharacterSupport: undefined,
	};
	for (const entry of configs) {
		result = {
			comments: entry.comments || result.comments,
			brackets: entry.brackets || result.brackets,
			wordPattern: entry.wordPattern || result.wordPattern,
			indentationRules: entry.indentationRules || result.indentationRules,
			onEnterRules: entry.onEnterRules || result.onEnterRules,
			autoClosingPairs: entry.autoClosingPairs || result.autoClosingPairs,
			surroundingPairs: entry.surroundingPairs || result.surroundingPairs,
			autoCloseBefore: entry.autoCloseBefore || result.autoCloseBefore,
			folding: entry.folding || result.folding,
			colorizedBracketPairs: entry.colorizedBracketPairs || result.colorizedBracketPairs,
			__electricCharacterSupport: entry.__electricCharacterSupport || result.__electricCharacterSupport,
		};
	}

	return result;
}

class LanguageConfigurationContribution {
	constructor(
		public readonly configuration: LanguageConfiguration,
		public readonly priority: number,
		public readonly order: number
	) { }

	public static cmp(a: LanguageConfigurationContribution, b: LanguageConfigurationContribution) {
		if (a.priority === b.priority) {
			// higher order last
			return a.order - b.order;
		}
		// higher priority last
		return a.priority - b.priority;
	}
}

export class LanguageConfigurationChangeEvent {
	constructor(public readonly languageId: string) { }
}

export class LanguageConfigurationRegistry extends Disposable {
	private readonly _entries = new Map<string, ComposedLanguageConfiguration>();

	private readonly _onDidChange = this._register(new Emitter<LanguageConfigurationChangeEvent>());
	public readonly onDidChange: Event<LanguageConfigurationChangeEvent> = this._onDidChange.event;

	constructor() {
		super();
		this._register(this.register(PLAINTEXT_LANGUAGE_ID, {
			brackets: [
				['(', ')'],
				['[', ']'],
				['{', '}'],
			],
			surroundingPairs: [
				{ open: '{', close: '}' },
				{ open: '[', close: ']' },
				{ open: '(', close: ')' },
				{ open: '<', close: '>' },
				{ open: '\"', close: '\"' },
				{ open: '\'', close: '\'' },
				{ open: '`', close: '`' },
			],
			colorizedBracketPairs: [],
			folding: {
				offSide: true
			}
		}, 0));
	}

	/**
	 * @param priority Use a higher number for higher priority
	 */
	public register(languageId: string, configuration: LanguageConfiguration, priority: number = 0): IDisposable {
		let entries = this._entries.get(languageId);
		if (!entries) {
			entries = new ComposedLanguageConfiguration(languageId);
			this._entries.set(languageId, entries);
		}

		const disposable = entries.register(configuration, priority);
		this._onDidChange.fire(new LanguageConfigurationChangeEvent(languageId));

		return markAsSingleton(toDisposable(() => {
			disposable.dispose();
			this._onDidChange.fire(new LanguageConfigurationChangeEvent(languageId));
		}));
	}

	public getLanguageConfiguration(languageId: string): ResolvedLanguageConfiguration | null {
		const entries = this._entries.get(languageId);
		return entries?.getResolvedConfiguration() || null;
	}
}

/**
 * Immutable.
*/
export class ResolvedLanguageConfiguration {
	private _brackets: RichEditBrackets | null;
	private _electricCharacter: BracketElectricCharacterSupport | null;
	private readonly _onEnterSupport: OnEnterSupport | null;

	public readonly comments: ICommentsConfiguration | null;
	public readonly characterPair: CharacterPairSupport;
	public readonly wordDefinition: RegExp;
	public readonly indentRulesSupport: IndentRulesSupport | null;
	public readonly indentationRules: IndentationRule | undefined;
	public readonly foldingRules: FoldingRules;
	public readonly bracketsNew: LanguageBracketsConfiguration;

	constructor(
		public readonly languageId: string,
		public readonly underlyingConfig: LanguageConfiguration
	) {
		this._brackets = null;
		this._electricCharacter = null;
		this._onEnterSupport =
			this.underlyingConfig.brackets ||
				this.underlyingConfig.indentationRules ||
				this.underlyingConfig.onEnterRules
				? new OnEnterSupport(this.underlyingConfig)
				: null;
		this.comments = ResolvedLanguageConfiguration._handleComments(this.underlyingConfig);
		this.characterPair = new CharacterPairSupport(this.underlyingConfig);

		this.wordDefinition = this.underlyingConfig.wordPattern || DEFAULT_WORD_REGEXP;
		this.indentationRules = this.underlyingConfig.indentationRules;
		if (this.underlyingConfig.indentationRules) {
			this.indentRulesSupport = new IndentRulesSupport(
				this.underlyingConfig.indentationRules
			);
		} else {
			this.indentRulesSupport = null;
		}
		this.foldingRules = this.underlyingConfig.folding || {};

		this.bracketsNew = new LanguageBracketsConfiguration(
			languageId,
			this.underlyingConfig
		);
	}

	public getWordDefinition(): RegExp {
		return ensureValidWordDefinition(this.wordDefinition);
	}

	public get brackets(): RichEditBrackets | null {
		if (!this._brackets && this.underlyingConfig.brackets) {
			this._brackets = new RichEditBrackets(
				this.languageId,
				this.underlyingConfig.brackets
			);
		}
		return this._brackets;
	}

	public get electricCharacter(): BracketElectricCharacterSupport | null {
		if (!this._electricCharacter) {
			this._electricCharacter = new BracketElectricCharacterSupport(
				this.brackets
			);
		}
		return this._electricCharacter;
	}

	public onEnter(
		autoIndent: EditorAutoIndentStrategy,
		previousLineText: string,
		beforeEnterText: string,
		afterEnterText: string
	): EnterAction | null {
		if (!this._onEnterSupport) {
			return null;
		}
		return this._onEnterSupport.onEnter(
			autoIndent,
			previousLineText,
			beforeEnterText,
			afterEnterText
		);
	}

	public getAutoClosingPairs(): AutoClosingPairs {
		return new AutoClosingPairs(this.characterPair.getAutoClosingPairs());
	}

	public getAutoCloseBeforeSet(forQuotes: boolean): string {
		return this.characterPair.getAutoCloseBeforeSet(forQuotes);
	}

	public getSurroundingPairs(): IAutoClosingPair[] {
		return this.characterPair.getSurroundingPairs();
	}

	private static _handleComments(
		conf: LanguageConfiguration
	): ICommentsConfiguration | null {
		const commentRule = conf.comments;
		if (!commentRule) {
			return null;
		}

		// comment configuration
		const comments: ICommentsConfiguration = {};

		if (commentRule.lineComment) {
			comments.lineCommentToken = commentRule.lineComment;
		}
		if (commentRule.blockComment) {
			const [blockStart, blockEnd] = commentRule.blockComment;
			comments.blockCommentStartToken = blockStart;
			comments.blockCommentEndToken = blockEnd;
		}
		if (typeof commentRule.lineCommentTokenColumn !== 'undefined' && commentRule.lineCommentTokenColumn !== null) {
			comments.lineCommentTokenColumn = commentRule.lineCommentTokenColumn;
		}

		return comments;
	}
}

registerSingleton(ILanguageConfigurationService, LanguageConfigurationService, InstantiationType.Delayed);
