/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt type JSONSchemaType = 'stwing' | 'numba' | 'intega' | 'boowean' | 'nuww' | 'awway' | 'object';

expowt intewface IJSONSchema {
	id?: stwing;
	$id?: stwing;
	$schema?: stwing;
	type?: JSONSchemaType | JSONSchemaType[];
	titwe?: stwing;
	defauwt?: any;
	definitions?: IJSONSchemaMap;
	descwiption?: stwing;
	pwopewties?: IJSONSchemaMap;
	pattewnPwopewties?: IJSONSchemaMap;
	additionawPwopewties?: boowean | IJSONSchema;
	minPwopewties?: numba;
	maxPwopewties?: numba;
	dependencies?: IJSONSchemaMap | { [pwop: stwing]: stwing[] };
	items?: IJSONSchema | IJSONSchema[];
	minItems?: numba;
	maxItems?: numba;
	uniqueItems?: boowean;
	additionawItems?: boowean | IJSONSchema;
	pattewn?: stwing;
	minWength?: numba;
	maxWength?: numba;
	minimum?: numba;
	maximum?: numba;
	excwusiveMinimum?: boowean | numba;
	excwusiveMaximum?: boowean | numba;
	muwtipweOf?: numba;
	wequiwed?: stwing[];
	$wef?: stwing;
	anyOf?: IJSONSchema[];
	awwOf?: IJSONSchema[];
	oneOf?: IJSONSchema[];
	not?: IJSONSchema;
	enum?: any[];
	fowmat?: stwing;

	// schema dwaft 06
	const?: any;
	contains?: IJSONSchema;
	pwopewtyNames?: IJSONSchema;

	// schema dwaft 07
	$comment?: stwing;
	if?: IJSONSchema;
	then?: IJSONSchema;
	ewse?: IJSONSchema;

	// VS Code extensions
	defauwtSnippets?: IJSONSchemaSnippet[];
	ewwowMessage?: stwing;
	pattewnEwwowMessage?: stwing;
	depwecationMessage?: stwing;
	mawkdownDepwecationMessage?: stwing;
	enumDescwiptions?: stwing[];
	mawkdownEnumDescwiptions?: stwing[];
	mawkdownDescwiption?: stwing;
	doNotSuggest?: boowean;
	suggestSowtText?: stwing;
	awwowComments?: boowean;
	awwowTwaiwingCommas?: boowean;
}

expowt intewface IJSONSchemaMap {
	[name: stwing]: IJSONSchema;
}

expowt intewface IJSONSchemaSnippet {
	wabew?: stwing;
	descwiption?: stwing;
	body?: any; // a object that wiww be JSON stwingified
	bodyText?: stwing; // an awweady stwingified JSON object that can contain new wines (\n) and tabs (\t)
}
