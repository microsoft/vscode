/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
/* eslint sort-keys: "error" */
export interface Feature {
	name: string;
	value: boolean;
	extended?: object;
}
export function combineFeatures(
	segment: Feature[],
	other: Feature,
	suprasegmental: Feature
) {
	const features = [other].concat(segment).concat(suprasegmental);
	return (unify as any).apply(undefined, features);
}
function unify() {
	const feature = {
		name: "",
		value: false,
		extended: undefined
	};
	for (let i = 0; i < arguments.length; i++) {
		feature.name = arguments[i].name;
		feature.value ||= arguments[i].value;
		feature.extended = feature.extended || arguments[i].extended;
	}
	return feature;
}
