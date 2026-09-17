/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Badge, Checkbox, Dropdown, Input, Option } from '@fluentui/react-components';
import * as mobxlite from 'mobx-react-lite';
import * as React from 'react';
import { useEffect, useMemo } from 'react';
import { AMLProvider } from '../stores/amlSimulations';
import { SimulationTestsProvider } from '../stores/simulationTestsProvider';
import { AMLPicker } from './amlPicker';
import { createAnnotationFilter, createFilterer, createLanguageFilter, createResultTypeFilter, createTestNameFilter } from './filterUtils';
import { TestFilterer } from './testFilterer';

type Props = {
	amlProvider: AMLProvider;
	simulationTestsProvider: SimulationTestsProvider;
	onFiltererChange: (filterer: TestFilterer | undefined) => void;
	allLanguageIds: readonly string[];
};


export const AMLModeToolbar = mobxlite.observer(({ amlProvider, simulationTestsProvider, onFiltererChange, allLanguageIds }: Props) => {

	const [resultFilterSelected, setResultFilterSelected] = React.useState<string | undefined>(undefined);
	const [languageSelected, setLanguageSelected] = React.useState<string | undefined>(undefined);
	const [testNameFilterSelected, setTestNameFilterSelected] = React.useState<string | undefined>(undefined);
	const [showOnlyTestsWithAnnotations, setShowOnlyTestsWithAnnotations] = React.useState<boolean | undefined>(undefined);
	const [selectedAnnotations, setSelectedAnnotations] = React.useState<string[]>([]);

	// Create a memoized filterer instance that only updates when filter criteria change
	const filterer = useMemo(() => {
		const predicates = [
			createResultTypeFilter(resultFilterSelected),
			createLanguageFilter(languageSelected),
			createAnnotationFilter(showOnlyTestsWithAnnotations ? new Set(selectedAnnotations) : undefined),
			createTestNameFilter(testNameFilterSelected)
		];

		return createFilterer(predicates);
	}, [resultFilterSelected, languageSelected, showOnlyTestsWithAnnotations, selectedAnnotations, testNameFilterSelected]);

	// Update parent component when filter changes
	useEffect(() => {
		onFiltererChange(filterer);
	}, [filterer, onFiltererChange]);

	const [knownAnnotations, setKnownAnnotations] = React.useState<string[]>([]);
	const updateKnownAnnotations = () => {
		const newAnnotations = new Set<string>(knownAnnotations);
		for (const test of simulationTestsProvider.tests) {
			if (test.runnerStatus) {
				for (const run of test.runnerStatus.runs) {
					for (const annotation of run.annotations) {
						newAnnotations.add(annotation.label);
					}
				}
			}
		}
		setKnownAnnotations([...newAnnotations].sort());
	};

	const onLanguageIdChange = (e: React.FormEvent<HTMLSelectElement>) => {
		let langId: string | undefined = (e.target as HTMLSelectElement).value;
		langId = langId !== 'no-language-filter' ? langId : undefined;
		setLanguageSelected(langId);
	};

	const onResultFilterChange = (e: React.FormEvent<HTMLSelectElement>) => {
		let resultFilter: string | undefined = (e.target as HTMLSelectElement).value;
		resultFilter = resultFilter !== 'no-result-filter' ? resultFilter : undefined;
		setResultFilterSelected(resultFilter);
	};

	const onTestNameFilterChange = (e: React.FormEvent<HTMLInputElement>) => {
		let testNameFilter: string | undefined = (e.target as HTMLInputElement).value;
		testNameFilter = testNameFilter !== '' ? testNameFilter : undefined;
		setTestNameFilterSelected(testNameFilter);
	};

	const defaultLanguageId = (languageSelected && allLanguageIds.includes(languageSelected))
		? languageSelected : undefined;

	return (
		<div className='toolbar' style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
			<div>
				<AMLPicker amlProvider={amlProvider} />

				<div className='external-toolbar-filter'>
					<label className='title'>Filter by test name</label>
					<Input
						id='grep'
						size='small'
						placeholder='grep'
						title='Filter by test name'
						value={testNameFilterSelected}
						onChange={onTestNameFilterChange}
						style={{ width: '100px', maxWidth: '25vw', marginLeft: '10px' }}
					/>
				</div>

				<div className='external-toolbar-filter'>
					<label className='title'>Filter by results</label>
					<select className='external-toolbar-dropdown' onChange={onResultFilterChange} value={defaultLanguageId}>
						<option value='no-result-filter' key='no-result-filter'>All</option>
						<option key={'failures'} value={'failures'}>
							{'Failures'}
						</option>
						<option key={'regressions'} value={'regressions'}>
							{'Regressions'}
						</option>
						<option key={'improvements'} value={'improvements'}>
							{'Improvements'}
						</option>
						<option key={'differences'} value={'differences'}>
							{'Differences'}
						</option>
					</select>
				</div>

				<div className='external-toolbar-filter'>
					<label className='title'>Filter by language</label>
					<select className='external-toolbar-dropdown' onChange={onLanguageIdChange} value={defaultLanguageId}>
						<option value='no-language-filter' key='no-language-filter'>All</option>
						{allLanguageIds.map((langId) => (
							<option key={langId} value={langId}>
								{langId}
							</option>
						))}
					</select>
				</div>
				<Checkbox
					label='Filter by annotations'
					checked={showOnlyTestsWithAnnotations}
					onChange={() => setShowOnlyTestsWithAnnotations(!showOnlyTestsWithAnnotations)}
				/>
				<Dropdown
					multiselect
					size='small'
					placeholder='Select annotations'
					defaultValue={selectedAnnotations.length ? selectedAnnotations.join(', ') : undefined}
					defaultSelectedOptions={selectedAnnotations}
					onOptionSelect={(e, o) => { setSelectedAnnotations(o.selectedOptions); setShowOnlyTestsWithAnnotations(o.selectedOptions.length > 0); }}
					onOpenChange={(e, o) => o.open && updateKnownAnnotations()}
				>
					{knownAnnotations.map((option) => (
						<Option key={option} text={option}>
							<Badge key={option} shape='square' appearance='outline' size='small'>{option}</Badge>
						</Option>
					))}
				</Dropdown>
			</div>
		</div>
	);
});
