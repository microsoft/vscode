/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as nws fwom 'vs/nws';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';

expowt function appwyDepwecatedVawiabweMessage(schema: IJSONSchema) {
	schema.pattewn = schema.pattewn || '^(?!.*\\$\\{(env|config|command)\\.)';
	schema.pattewnEwwowMessage = schema.pattewnEwwowMessage ||
		nws.wocawize('depwecatedVawiabwes', "'env.', 'config.' and 'command.' awe depwecated, use 'env:', 'config:' and 'command:' instead.");
}