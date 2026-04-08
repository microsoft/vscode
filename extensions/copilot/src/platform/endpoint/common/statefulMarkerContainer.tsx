/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, Raw } from '@vscode/prompt-tsx';
import { CustomDataPartMimeTypes } from './endpointTypes';

/**
 * A type representing a stateful marker that can be stored in an opaque part in raw chat messages.
 */
interface IStatefulMarkerContainer {
	type: typeof CustomDataPartMimeTypes.StatefulMarker;
	value: StatefulMarkerWithModel;
}

type StatefulMarkerWithModel = { modelId: string; marker: string };

export interface IStatefulMarkerContainerProps extends BasePromptElementProps {
	statefulMarker: StatefulMarkerWithModel;
}

/**
 * Helper to store the statefulMarker as part of a prompt-tsx assistant message
 */
export class StatefulMarkerContainer extends PromptElement<IStatefulMarkerContainerProps> {
	render() {
		const { statefulMarker } = this.props;
		const container = { type: CustomDataPartMimeTypes.StatefulMarker, value: statefulMarker };
		return <opaque value={container} />;
	}
}

/**
 * Check whether an opaque content part is a StatefulMarkerContainer and retrieve the stateful marker if so
 */
export function rawPartAsStatefulMarker(part: Raw.ChatCompletionContentPartOpaque): StatefulMarkerWithModel | undefined {
	const value = part.value;
	if (!value || typeof value !== 'object') {
		return;
	}

	const data = value as IStatefulMarkerContainer;
	if (data.type === CustomDataPartMimeTypes.StatefulMarker && typeof data.value === 'object') {
		return data.value;
	}
	return;
}

export function encodeStatefulMarker(modelId: string, marker: string): Uint8Array {
	return new TextEncoder().encode(modelId + '\\' + marker);
}

export function decodeStatefulMarker(data: Uint8Array): StatefulMarkerWithModel {
	const decoded = new TextDecoder().decode(data);
	const [modelId, marker] = decoded.split('\\');
	return { modelId, marker };
}

/** Gets stateful markers from the messages, from the most to least recent */
export function* getAllStatefulMarkersAndIndicies(messages: readonly Raw.ChatMessage[]) {
	for (let idx = messages.length - 1; idx >= 0; idx--) {
		const message = messages[idx];
		if (message.role === Raw.ChatRole.Assistant) {
			for (const part of message.content) {
				if (part.type === Raw.ChatCompletionContentPartKind.Opaque) {
					const statefulMarker = rawPartAsStatefulMarker(part);
					if (statefulMarker) {
						yield { statefulMarker: statefulMarker, index: idx };
					}
				}
			}
		}
	}
	return undefined;
}

export function getStatefulMarkerAndIndex(modelId: string, messages: readonly Raw.ChatMessage[]): { statefulMarker: string; index: number } | undefined {
	for (const marker of getAllStatefulMarkersAndIndicies(messages)) {
		if (marker.statefulMarker.modelId === modelId) {
			return { statefulMarker: marker.statefulMarker.marker, index: marker.index };
		}
	}
	return undefined;
}