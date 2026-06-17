/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Dropdown, Input, Option, OptionOnSelectData, SelectionEvents } from '@fluentui/react-components';
import { Edit16Regular } from '@fluentui/react-icons';
import * as mobxlite from 'mobx-react-lite';
import * as React from 'react';
import { SimulationRunsProvider } from '../stores/simulationBaseline';
import { useInternalToolbarPickerStyles } from './pickerStyle';

type Props = {
	simulationRunsProvider: SimulationRunsProvider;
	outputFolderName: string;
	onChange: (selected: string | undefined) => void;
	disabled?: boolean;
};

export const CurrentRunPicker = mobxlite.observer(({ simulationRunsProvider, onChange, disabled, outputFolderName }: Props) => {
	const [isRenameDialogOpen, setIsRenameDialogOpen] = React.useState(false);
	const [newName, setNewName] = React.useState('');
	const [runToRename, setRunToRename] = React.useState<string>('');

	const id = 'currentRunPicker';
	const styles = useInternalToolbarPickerStyles();

	const handleRenameClick = (runName: string) => {
		setRunToRename(runName);
		setNewName(runName);
		setIsRenameDialogOpen(true);
	};

	const handleRenameConfirm = async () => {
		if (runToRename && newName) {
			const success = await simulationRunsProvider.renameRun(runToRename, newName);
			if (success) {
				onChange(newName);
			}
		}
		setIsRenameDialogOpen(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleRenameConfirm();
		}
	};

	return (
		<div className={styles.root}>
			<label htmlFor={id}>Current run</label>
			<div style={{ display: 'flex', alignItems: 'center' }}>
				<Dropdown
					aria-labelledby={id}
					clearable={outputFolderName !== ''}
					disabled={disabled}
					placeholder='Select a run'
					size='small'
					selectedOptions={[outputFolderName]}
					value={outputFolderName}
					onOptionSelect={(_e: SelectionEvents, { optionValue }: OptionOnSelectData) => onChange(optionValue)}
				>
					{simulationRunsProvider.runs.map((run) => (
						<Option key={run.name} value={run.name} text={run.friendlyName}>
							<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
								<span>{run.friendlyName}</span>
								<Button
									icon={<Edit16Regular />}
									appearance='subtle'
									size='small'
									onClick={(e) => {
										e.stopPropagation();
										handleRenameClick(run.name);
									}}
								/>
							</div>
						</Option>
					))}
				</Dropdown>
			</div>

			<Dialog open={isRenameDialogOpen} onOpenChange={(_, { open }) => setIsRenameDialogOpen(open)}>
				<DialogSurface>
					<DialogBody>
						<DialogTitle>Rename Run</DialogTitle>
						<DialogContent>
							<Input
								value={newName}
								onChange={(e) => setNewName(e.target.value)}
								placeholder='Enter new name'
								onKeyDown={handleKeyDown}
							/>
						</DialogContent>
						<DialogActions>
							<Button appearance='secondary' onClick={() => setIsRenameDialogOpen(false)}>Cancel</Button>
							<Button appearance='primary' onClick={handleRenameConfirm}>Rename ↵</Button>
						</DialogActions>
					</DialogBody>
				</DialogSurface>
			</Dialog>
		</div>
	);
});
