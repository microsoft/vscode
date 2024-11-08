/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter, Event } from '../../../../base/common/event.js';
import { splitGlobAware } from '../../../../base/common/glob.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IObservableValue, MutableObservableValue } from './observableValue.js';
import { StoredValue } from './storedValue.js';
import { namespaceTestTag } from './testTypes.js';

export interface ITestExplorerFilterState {
	_serviceBrand: undefined;

	/** Current filter text */
	readonly text: IObservableValue<string>;

	/** Test ID the user wants to reveal in the explorer */
	readonly reveal: ISettableObservable<string | undefined>;

	/** A test was selected in the explorer. */
	readonly onDidSelectTestInExplorer: Event<string | undefined>;

	/** Event that fires when {@link focusInput} is invoked. */
	readonly onDidRequestInputFocus: Event<void>;

	/**
	 * Glob list to filter for based on the {@link text}
	 */
	readonly globList: readonly { include: boolean; text: string }[];

	/**
	 * The user requested to filter including tags.
	 */
	readonly includeTags: ReadonlySet<string>;

	/**
	 * The user requested to filter excluding tags.
	 */
	readonly excludeTags: ReadonlySet<string>;

	/**
	 * Whether fuzzy searching is enabled.
	 */
	readonly fuzzy: MutableObservableValue<boolean>;

	/**
	 * Focuses the filter input in the test explorer view.
	 */
	focusInput(): void;

	/**
	 * Replaces the filter {@link text}.
	 */
	setText(text: string): void;

	/**
	 * Sets whether the {@link text} is filtering for a special term.
	 */
	isFilteringFor(term: TestFilterTerm): boolean;

	/**
	 * Sets whether the {@link text} includes a special filter term.
	 */
	toggleFilteringFor(term: TestFilterTerm, shouldFilter?: boolean): void;

	/**
	 * Called when a test in the test explorer is selected.
	 */
	didSelectTestInExplorer(testId: string): void;
}

export const ITestExplorerFilterState = createDecorator<ITestExplorerFilterState>('testingFilterState');

const tagRe = /!?@([^ ,:]+)/g;
const trimExtraWhitespace = (str: string) => str.replace(/\s\s+/g, ' ').trim();

export class TestExplorerFilterState extends Disposable implements ITestExplorerFilterState {
	declare _serviceBrand: undefined;
	private readonly focusEmitter = new Emitter<void>();
	/**
	 * Mapping of terms to whether they're included in the text.
	 */
	private termFilterState: { [K in TestFilterTerm]?: true } = {};

	/** @inheritdoc */
	public globList: { include: boolean; text: string }[] = [];

	/** @inheritdoc */
	public includeTags = new Set<string>();

	/** @inheritdoc */
	public excludeTags = new Set<string>();

	/** @inheritdoc */
	public readonly text = this._register(new MutableObservableValue(''));

	/** @inheritdoc */
	public readonly fuzzy = this._register(MutableObservableValue.stored(new StoredValue<boolean>({
		key: 'testHistoryFuzzy',
		scope: StorageScope.PROFILE,
		target: StorageTarget.USER,
	}, this.storageService), false));

	public readonly reveal: ISettableObservable<string | undefined> = observableValue('TestExplorerFilterState.reveal', undefined);

	public readonly onDidRequestInputFocus = this.focusEmitter.event;

	private selectTestInExplorerEmitter = this._register(new Emitter<string | undefined>());
	public readonly onDidSelectTestInExplorer = this.selectTestInExplorerEmitter.event;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
	}

	/** @inheritdoc */
	public didSelectTestInExplorer(testId: string) {
		this.selectTestInExplorerEmitter.fire(testId);
	}

	/** @inheritdoc */
	public focusInput() {
		this.focusEmitter.fire();
	}

	/** @inheritdoc */
	public setText(text: string) {
		if (text === this.text.value) {
			return;
		}

		this.termFilterState = {};
		this.globList = [];
		this.includeTags.clear();
		this.excludeTags.clear();

		let globText = '';
		let lastIndex = 0;
		for (const match of text.matchAll(tagRe)) {
			let nextIndex = match.index + match[0].length;

			const tag = match[0];
			if (allTestFilterTerms.includes(tag as TestFilterTerm)) {
				this.termFilterState[tag as TestFilterTerm] = true;
			}

			// recognize and parse @ctrlId:tagId or quoted like @ctrlId:"tag \\"id"
			if (text[nextIndex] === ':') {
				nextIndex++;

				let delimiter = text[nextIndex];
				if (delimiter !== `"` && delimiter !== `'`) {
					delimiter = ' ';
				} else {
					nextIndex++;
				}

				let tagId = '';
				while (nextIndex < text.length && text[nextIndex] !== delimiter) {
					if (text[nextIndex] === '\\') {
						tagId += text[nextIndex + 1];
						nextIndex += 2;
					} else {
						tagId += text[nextIndex];
						nextIndex++;
					}
				}

				if (match[0].startsWith('!')) {
					this.excludeTags.add(namespaceTestTag(match[1], tagId));
				} else {
					this.includeTags.add(namespaceTestTag(match[1], tagId));
				}
				nextIndex++;
			}

			globText += text.slice(lastIndex, match.index);
			lastIndex = nextIndex;
		}

		globText += text.slice(lastIndex).trim();

		if (globText.length) {
			for (const filter of splitGlobAware(globText, ',').map(s => s.trim()).filter(s => !!s.length)) {
				if (filter.startsWith('!')) {
					this.globList.push({ include: false, text: filter.slice(1).toLowerCase() });
				} else {
					this.globList.push({ include: true, text: filter.toLowerCase() });
				}
			}
		}

		this.text.value = text; // purposely afterwards so everything is updated when the change event happen
	}

	/** @inheritdoc */
	public isFilteringFor(term: TestFilterTerm) {
		return !!this.termFilterState[term];
	}

	/** @inheritdoc */
	public toggleFilteringFor(term: TestFilterTerm, shouldFilter?: boolean) {
		const text = this.text.value.trim();
		if (shouldFilter !== false && !this.termFilterState[term]) {
			this.setText(text ? `${text} ${term}` : term);
		} else if (shouldFilter !== true && this.termFilterState[term]) {
			this.setText(trimExtraWhitespace(text.replace(term, '')));
		}
	}
}

export const enum TestFilterTerm {
	Failed = '@failed',
	Executed = '@executed',
	CurrentDoc = '@doc',
	OpenedFiles = '@openedFiles',
	Hidden = '@hidden',
}

const allTestFilterTerms: readonly TestFilterTerm[] = [
	TestFilterTerm.Failed,
	TestFilterTerm.Executed,
	TestFilterTerm.CurrentDoc,
	TestFilterTerm.OpenedFiles,
	TestFilterTerm.Hidden,
];
