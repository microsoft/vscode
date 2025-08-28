/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { PropsWithChildren, useEffect, useState } from 'react';

import { useNewFolderFlowContext } from '../../newFolderFlowContext.js';
import { NewFolderFlowStepProps } from '../../interfaces/newFolderFlowStepProps.js';
import { localize } from '../../../../../nls.js';
import { EnvironmentSetupType } from '../../interfaces/newFolderFlowEnums.js';
import { FlowFormattedText, FlowFormattedTextType } from '../flowFormattedText.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { OKCancelBackNextActionBar } from '../../../erdosComponents/erdosModalDialog/components/okCancelBackNextActionBar.js';


export const PythonEnvironmentStep = (props: PropsWithChildren<NewFolderFlowStepProps>) => {
	const context = useNewFolderFlowContext();

	const [envSetupType, setEnvSetupType] = useState(context.pythonEnvSetupType);
	const [envProviders, setEnvProviders] = useState(context.pythonEnvProviders);
	const [envProviderId, setEnvProviderId] = useState(context.pythonEnvProvider);
	const [interpreters, setInterpreters] = useState(context.interpreters);
	const [selectedInterpreter, setSelectedInterpreter] = useState(context.selectedRuntime);
	const [willInstallIpykernel, setWillInstallIpykernel] = useState(context.installIpykernel ?? false);

	useEffect(() => {
		const disposableStore = new DisposableStore();

		disposableStore.add(context.onUpdateInterpreterState(() => {
			setEnvProviders(context.pythonEnvProviders);
			setInterpreters(context.interpreters);
			setSelectedInterpreter(context.selectedRuntime);
			setSelectedInterpreter(context.preferredInterpreter);
			setWillInstallIpykernel(context.installIpykernel ?? false);
		}));

		return () => disposableStore.dispose();
	}, [context]);

	const canProceed = selectedInterpreter !== undefined;

	const onAccept = () => {
		context.pythonEnvSetupType = envSetupType;
		context.pythonEnvProvider = envProviderId;
		context.selectedRuntime = selectedInterpreter;
		props.accept();
	};

	return (
		<div className='python-environment-step'>
			<div className='python-environment-step-title'>
				{localize(
					'erdos.pythonEnvironmentStep.title',
					"Python Environment"
				)}
			</div>

			<div className='environment-setup-section'>
				<label>
					<input
						type='radio'
						name='envSetup'
						checked={envSetupType === EnvironmentSetupType.NewEnvironment}
						onChange={() => {
							setEnvSetupType(EnvironmentSetupType.NewEnvironment);
							context.pythonEnvSetupType = EnvironmentSetupType.NewEnvironment;
						}}
					/>
					{localize(
						'erdos.pythonEnvironmentStep.newEnvironment',
						"Create new environment"
					)}
				</label>
				<label>
					<input
						type='radio'
						name='envSetup'
						checked={envSetupType === EnvironmentSetupType.ExistingEnvironment}
						onChange={() => {
							setEnvSetupType(EnvironmentSetupType.ExistingEnvironment);
							context.pythonEnvSetupType = EnvironmentSetupType.ExistingEnvironment;
						}}
					/>
					{localize(
						'erdos.pythonEnvironmentStep.existingEnvironment',
						"Use existing environment"
					)}
				</label>
			</div>

			{envSetupType === EnvironmentSetupType.NewEnvironment && envProviders && (
				<div className='environment-provider-section'>
					<label>
						{localize(
							'erdos.pythonEnvironmentStep.provider',
							"Environment Provider"
						)}
					</label>
					<select
						value={envProviderId || ''}
						onChange={(e) => {
							setEnvProviderId(e.target.value);
							context.pythonEnvProvider = e.target.value;
						}}
					>
						{envProviders.map(provider => (
							<option key={provider.id} value={provider.id}>
								{provider.name}
							</option>
						))}
					</select>
				</div>
			)}

			{interpreters && interpreters.length > 0 && (
				<div className='interpreter-section'>
					<label>
						{localize(
							'erdos.pythonEnvironmentStep.interpreter',
							"Python Interpreter"
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
							{localize('erdos.pythonEnvironmentStep.selectInterpreter', "Select an interpreter")}
						</option>
						{interpreters.map(interpreter => (
							<option key={interpreter.runtimeId} value={interpreter.runtimeId}>
								{interpreter.languageName} {interpreter.languageVersion} ({interpreter.runtimePath})
							</option>
						))}
					</select>
				</div>
			)}

			{willInstallIpykernel && (
				<FlowFormattedText type={FlowFormattedTextType.Info}>
					{localize(
						'erdos.pythonEnvironmentStep.ipykernelInfo',
						"ipykernel will be installed to enable Jupyter notebook support."
					)}
				</FlowFormattedText>
			)}

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
