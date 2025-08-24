/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './rConfigurationStep.css';

import React, { PropsWithChildren, useEffect, useState } from 'react';

import { useNewFolderFlowContext } from '../../newFolderFlowContext.js';
import { NewFolderFlowStepProps } from '../../interfaces/newFolderFlowStepProps.js';
import { localize } from '../../../../../nls.js';
import { FlowFormattedText, FlowFormattedTextType } from '../flowFormattedText.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { OKCancelBackNextActionBar } from '../../../erdosComponents/erdosModalDialog/components/okCancelBackNextActionBar.js';
export const RConfigurationStep = (props: PropsWithChildren<NewFolderFlowStepProps>) => {
	const context = useNewFolderFlowContext();

	const [interpreters, setInterpreters] = useState(context.interpreters);
	const [selectedInterpreter, setSelectedInterpreter] = useState(context.selectedRuntime);
	const [preferredInterpreter, setPreferredInterpreter] = useState(context.preferredInterpreter);
	const [minimumRVersion, setMinimumRVersion] = useState(context.minimumRVersion);

	useEffect(() => {
		const disposableStore = new DisposableStore();

		disposableStore.add(context.onUpdateInterpreterState(() => {
			setInterpreters(context.interpreters);
			setSelectedInterpreter(context.selectedRuntime);
			setPreferredInterpreter(context.preferredInterpreter);
			setMinimumRVersion(context.minimumRVersion);
		}));

		return () => disposableStore.dispose();
	}, [context]);

	const canProceed = selectedInterpreter !== undefined;

	const onAccept = () => {
		context.selectedRuntime = selectedInterpreter;
		props.accept();
	};

	return (
		<div className='r-configuration-step'>
			<div className='r-configuration-step-title'>
				{localize(
					'erdos.rConfigurationStep.title',
					"R Configuration"
				)}
			</div>

			{interpreters && interpreters.length > 0 && (
				<div className='interpreter-section'>
					<label>
						{localize(
							'erdos.rConfigurationStep.interpreter',
							"R Interpreter"
						)}
					</label>
					<select
						value={selectedInterpreter?.runtimeId || ''}
						onChange={(e) => {
							const interpreter = interpreters.find(i => i.runtimeId === e.target.value);
							setSelectedInterpreter(interpreter);
							context.selectedRuntime = interpreter;
						}}
					>
						<option value=''>
							{localize('erdos.rConfigurationStep.selectInterpreter', "Select an interpreter")}
						</option>
						{interpreters.map(interpreter => (
							<option key={interpreter.runtimeId} value={interpreter.runtimeId}>
								{interpreter.languageName} {interpreter.languageVersion} ({interpreter.runtimePath})
							</option>
						))}
					</select>
					{preferredInterpreter && selectedInterpreter?.runtimeId === preferredInterpreter.runtimeId && (
						<FlowFormattedText type={FlowFormattedTextType.Info}>
							{localize(
								'erdos.rConfigurationStep.preferredInterpreter',
								"This is your preferred R interpreter."
							)}
						</FlowFormattedText>
					)}
				</div>
			)}

			{minimumRVersion && (
				<FlowFormattedText type={FlowFormattedTextType.Info}>
					{localize(
						'erdos.rConfigurationStep.minimumVersion',
						"Minimum R version required: {0}",
						minimumRVersion
					)}
				</FlowFormattedText>
			)}

			<div className='renv-section'>
				<label>
					<input
						type='checkbox'
						checked={context.useRenv || false}
						onChange={(e) => context.useRenv = e.target.checked}
					/>
					{localize(
						'erdos.rConfigurationStep.useRenv',
						"Use renv for package management"
					)}
				</label>
			</div>

			<OKCancelBackNextActionBar
				backButtonConfig={{ onClick: props.back }}
				cancelButtonConfig={{ onClick: props.cancel }}
				okButtonConfig={{
					onClick: onAccept,
					disable: !canProceed,
					title: localize('erdos.create', "Create")
				}}
			/>
		</div>
	);
};
