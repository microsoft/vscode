/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Badge, Text, Tooltip } from '@fluentui/react-components';
import * as mobxlite from 'mobx-react-lite';
import * as React from 'react';
import { coalesce } from '../../../../src/util/vs/base/common/arrays';
import { assertType } from '../../../../src/util/vs/base/common/types';
import { ISerialisedChatMessage, ISerialisedChatResponse, InterceptedRequest } from '../../shared/sharedTypes';
import { DiffEditor } from './diffEditor';
import { Editor } from './editor';
import { isToolCall } from '../utils/utils';
import { Raw } from '@vscode/prompt-tsx';

type Props = {
	readonly request: InterceptedRequest;
	readonly title?: string;
	readonly baselineRequest: InterceptedRequest | undefined;
	readonly idx: number;
	readonly expand: boolean;
};

export const RequestView = mobxlite.observer(({ request, title, baselineRequest, idx, expand }: Props) => {

	const [expanded, setExpanded] = React.useState(expand);

	function renderResponse(response: ISerialisedChatResponse): string {
		if (response.type === 'success') {
			const parts = [response.value?.join('\n-----\n')];
			parts.push(request.response.copilotFunctionCalls?.map(c => {
				let argsStr = c.arguments;
				try {
					const parsedArgs = JSON.parse(c.arguments);
					argsStr = JSON.stringify(parsedArgs, undefined, 2);
				} catch (e) { }
				return `🛠️ ${c.name} (${c.id}) ${argsStr}`;
			}).join('\n'));
			return coalesce(parts).join('\n');
		} else if (response.type === 'length' && response.truncatedValue) {
			return response.truncatedValue;
		} else {
			return '<NO REPLY>\n' + JSON.stringify(response);
		}
	}

	const currentRunRenderedMessages = renderRequestMessages(request.requestMessages);
	const baselineRunRenderedMessages = baselineRequest ? renderRequestMessages(baselineRequest.requestMessages) : undefined;

	const requestChangeInfo = baselineRequest && (
		<Tooltip content={'Below compares two requests - one from "Compare against" run and one from "Current run"'} relationship={'label'}>
			<Text weight='bold'>{currentRunRenderedMessages === baselineRunRenderedMessages
				? '(not changed)'
				: '(changed)'}</Text>
		</Tooltip>
	);

	return (
		<div className='request-container'>
			<div className='title' onClick={() => setExpanded(!expanded)}>
				{expanded ? '▼' : '▶'} {isToolCall(request) ? 'Tool Call' : 'Chat Request'} #{idx + 1} {title ? `- ${title}` : ``} - {getRequestStats(request)} {requestChangeInfo}
				{request.model && <Badge title='Chat model used for request' color='informative' size='small'>{request.model}</Badge>}
			</div>
			{
				!expanded
					? null
					: (
						<div className='request-details' style={{ borderLeft: '1px solid #ccc', marginLeft: '7px', paddingLeft: '5px' }}>
							<h3>Request to Model</h3>
							{baselineRequest && <Text size={300}>Left editor - request from "Compare against" run, Right editor - request from "Current run"</Text>}
							<div style={{ marginLeft: '-10px' }}>
								{
									baselineRequest
										? (
											assertType(baselineRunRenderedMessages, 'must be non-undefined as long as `baselineRequest` is defined'),
											<DiffEditor original={baselineRunRenderedMessages} modified={currentRunRenderedMessages} languageId='markdown' />
										)
										: <Editor lineNumbers={false} languageId='markdown' contents={currentRunRenderedMessages} />
								}
							</div>
							<h3>Response from Model</h3>
							{baselineRequest && <Text size={300}>Left editor - response from "Compare against" run, Right editor - response from "Current run"</Text>}
							<div style={{ marginLeft: '-10px' }}>
								<div className='reply'>
									{
										baselineRequest
											? <DiffEditor languageId='markdown' original={renderResponse(baselineRequest.response)} modified={renderResponse(request.response)} />
											: ((request.response.type === 'success' && request.response.value !== undefined) || (request.response.type === 'length' && request.response.truncatedValue !== undefined)
												? <Editor lineNumbers={false} languageId='markdown' contents={renderResponse(request.response)} />
												: <div >{renderResponse(request.response)}</div>)
									}
								</div>
							</div>
						</div>
					)
			}
		</div>
	);
});

function getRequestStats({ response }: InterceptedRequest) {
	const result = [];
	result.push(`(${response.type}`);
	if (response.type === 'success') {
		if (response.isCacheHit === true) {
			result.push('cache hit');
			if (response.cacheMetadata) {
				result.push(`original fetch: ${response.cacheMetadata.requestTime.replace('T', ' ').substring(0, 19)}`);
				result.push(`duration: ${response.cacheMetadata.requestDuration} ms`);
			}
		} else {
			if (response.isCacheHit === false) {
				result.push('cache miss');
			}
			result.push('server fetch');
			if (response.cacheMetadata) {
				result.push(`duration: ${response.cacheMetadata.requestDuration} ms`);
			}
		}
	}
	return result.join(', ') + ')';
}

function renderRequestMessages(messages: string | ISerialisedChatMessage[]): string {
	return Array.isArray(messages) ? renderChatMessages(messages) : messages;
}

function renderChatMessages(messages: ISerialisedChatMessage[]): string {
	const messageSeparator = '\n---------------------------------------------------------\n';
	const roleSeparator = '\n------\n';
	return (
		messageSeparator +
		messages
			.map(m => {
				const parts: string[] = [];
				if (m.tool_call_id) {
					parts.push(`🛠️ ${m.tool_call_id}`);
				}
				if (Array.isArray(m.content)) {
					m.content.forEach(c => {
						if (c.type === Raw.ChatCompletionContentPartKind.Text) {
							parts.push(c.text);
						} else {
							parts.push(`${JSON.stringify(c)}`);
						}
					});
				} else {
					parts.push(m.content);
				}

				if (m.tool_calls) {
					parts.push(m.tool_calls.map(c => {
						let argsStr = c.function.arguments;
						try {
							const parsedArgs = JSON.parse(c.function.arguments);
							argsStr = JSON.stringify(parsedArgs, undefined, 2);
						} catch (e) { }
						return `🛠️ ${c.function.name} (${c.id}) ${argsStr}`;
					}).join('\n'));
				}
				const content = coalesce(parts).join('\n');
				return `${m.role.toUpperCase()}:${roleSeparator}${content}`;
			})
			.join(messageSeparator)
	).trim();
}
