/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { PropsWithChildren, useState } from 'react';

import { useNewFolderFlowContext } from './newFolderFlowContext.js';
import { NewFolderFlowStep } from './interfaces/newFolderFlowEnums.js';
import { NewFolderFlowStepLookup } from './interfaces/newFolderFlowStepLookup.js';

interface NewFolderFlowStepContainerProps {
	cancel: () => void;
	accept: () => void;
}

export const NewFolderFlowStepContainer = (props: PropsWithChildren<NewFolderFlowStepContainerProps>) => {
	const context = useNewFolderFlowContext();
	const [currentStep, setCurrentStep] = useState(() => context.currentStep);
	const FlowStep = NewFolderFlowStepLookup[currentStep];

	const nextHandler = (step: NewFolderFlowStep) => {
		setCurrentStep(context.goToNextStep(step));
	};

	const backHandler = () => {
		setCurrentStep(context.goToPreviousStep());
	};

	return (
		<FlowStep accept={props.accept} back={backHandler} cancel={props.cancel} next={nextHandler} />
	);
};
