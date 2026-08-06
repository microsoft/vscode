/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Button, Field, Input, MessageBar, MessageBarBody, MessageBarTitle, Spinner, Text } from '@fluentui/react-components';
import { Play16Regular, Stop16Regular } from '@fluentui/react-icons';
import * as mobx from 'mobx';
import * as mobxlite from 'mobx-react-lite';
import * as React from 'react';
import { AdhocRequestOptions } from '../stores/adhocRequestOptions';
import { AdhocRequestSender, AdhocRequestState } from '../stores/adhocRequestSender';
import { AdhocRequestEditor } from './adhocRequestEditor';

type Props = {
	adhocRequestOptions: AdhocRequestOptions;
	adhocRequestSender: AdhocRequestSender;
};

export const AdhocRequestView = mobxlite.observer(({ adhocRequestOptions, adhocRequestSender }: Props) => {

	const isRunning = adhocRequestSender.state === AdhocRequestState.Running;

	const handleModelChange = React.useCallback((e: React.FormEvent<HTMLInputElement>) => {
		mobx.runInAction(() => {
			adhocRequestOptions.model.value = (e.target as HTMLInputElement).value;
		});
	}, [adhocRequestOptions.model]);

	const handleSystemChange = React.useCallback((value: string) => {
		mobx.runInAction(() => {
			adhocRequestOptions.systemMessage.value = value;
		});
	}, [adhocRequestOptions.systemMessage]);

	const handleUserChange = React.useCallback((value: string) => {
		mobx.runInAction(() => {
			adhocRequestOptions.userMessage.value = value;
		});
	}, [adhocRequestOptions.userMessage]);

	const handleSendStop = React.useCallback(() => {
		if (isRunning) {
			adhocRequestSender.cancel();
		} else {
			adhocRequestSender.send({
				system: adhocRequestOptions.systemMessage.value,
				user: adhocRequestOptions.userMessage.value,
				model: adhocRequestOptions.model.value,
			});
		}
	}, [isRunning, adhocRequestSender, adhocRequestOptions]);

	const canSend = adhocRequestOptions.model.value.trim().length > 0 && adhocRequestOptions.userMessage.value.trim().length > 0;

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px 12px' }}>
			<div style={{ display: 'flex', alignItems: 'end', gap: '12px' }}>
				<Field label='Model' style={{ minWidth: '280px' }}>
					<Input
						placeholder='e.g. gpt-4.1'
						value={adhocRequestOptions.model.value}
						onChange={handleModelChange}
						disabled={isRunning}
					/>
				</Field>
				<Button
					appearance={isRunning ? 'secondary' : 'primary'}
					icon={isRunning ? <Stop16Regular /> : <Play16Regular />}
					iconPosition='before'
					onClick={handleSendStop}
					disabled={!isRunning && !canSend}
				>
					{isRunning ? 'Stop' : 'Send'}
				</Button>
				{isRunning && <Spinner size='tiny' label='Sending…' />}
			</div>

			<Field label='System message'>
				<AdhocRequestEditor
					value={adhocRequestOptions.systemMessage.value}
					languageId='markdown'
					onChange={handleSystemChange}
				/>
			</Field>

			<Field label='User message'>
				<AdhocRequestEditor
					value={adhocRequestOptions.userMessage.value}
					languageId='markdown'
					autoFocus
					onChange={handleUserChange}
				/>
			</Field>

			<div>
				<Text weight='semibold'>Response</Text>
				{adhocRequestSender.state === AdhocRequestState.Error && adhocRequestSender.error !== undefined && (
					<MessageBar intent='error' layout='singleline'>
						<MessageBarBody>
							<MessageBarTitle>Request failed</MessageBarTitle>
							<pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{adhocRequestSender.error}</pre>
						</MessageBarBody>
					</MessageBar>
				)}
				<AdhocRequestEditor
					value={adhocRequestSender.response}
					languageId='markdown'
					readOnly
					initialHeight={280}
				/>
			</div>
		</div>
	);
});
