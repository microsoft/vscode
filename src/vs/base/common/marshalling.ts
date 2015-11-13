/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import objects = require('vs/base/common/objects');
import types = require('vs/base/common/types');

export interface IMarshallingContribution {

	canSerialize(obj:any): boolean;

	serialize(obj:any, serialize:(obj:any)=>any): any;

	canDeserialize(obj:any): boolean;

	deserialize(obj:any, deserialize:(obj:any)=>any): any;

}

var marshallingContributions:IMarshallingContribution[] = [];

export function registerMarshallingContribution(contribution:IMarshallingContribution): void {
	marshallingContributions.push(contribution);
}

var currentDynamicContrib:IMarshallingContribution = null;

export function canSerialize(obj: any): boolean {
	for (let contrib of marshallingContributions) {
		if (contrib.canDeserialize(obj)) {
			return true;
		}
	}
	if (currentDynamicContrib && currentDynamicContrib.canSerialize(obj)) {
		return true;
	}
}

export function serialize(obj:any): any {
	return objects.cloneAndChange(obj, (orig:any) => {
		if (typeof orig === 'object') {
			for (var i = 0; i < marshallingContributions.length; i++) {
				var contrib = marshallingContributions[i];
				if (contrib.canSerialize(orig)) {
					return contrib.serialize(orig, serialize);
				}
			}
			if (currentDynamicContrib && currentDynamicContrib.canSerialize(orig)) {
				return currentDynamicContrib.serialize(orig, serialize);
			}
		}
		return undefined;
	});
}

export function deserialize(obj:any): any {
	return objects.cloneAndChange(obj, (orig:any) => {
		if (types.isObject(orig)) {
			for (var i = 0; i < marshallingContributions.length; i++) {
				var contrib = marshallingContributions[i];
				if (contrib.canDeserialize(orig)) {
					return contrib.deserialize(orig, deserialize);
				}
			}
			if (currentDynamicContrib && currentDynamicContrib.canDeserialize(orig)) {
				return currentDynamicContrib.deserialize(orig, deserialize);
			}
		}
		return undefined;
	});
}

// RegExp marshaller

interface ISerializedRegExp {
	$isRegExp: boolean;
	source: string;
	flags: string;
}

registerMarshallingContribution({

	canSerialize: (obj:any): boolean => {
		return obj instanceof RegExp;
	},

	serialize: (regex:RegExp, serialize:(obj:any)=>any): ISerializedRegExp => {
		var flags = '';

		if (regex.global) {
			flags += 'g';
		} else if (regex.ignoreCase) {
			flags += 'i';
		} else if (regex.multiline) {
			flags += 'm';
		}

		return {
			$isRegExp: true,
			source: regex.source,
			flags: flags
		};
	},

	canDeserialize: (obj:ISerializedRegExp): boolean => {
		return obj.$isRegExp;
	},

	deserialize: (obj:ISerializedRegExp, deserialize:(obj:any)=>any): any => {
		return new RegExp(obj.source, obj.flags);
	}

});

export function marshallObject(obj:any, dynamicContrib:IMarshallingContribution = null): string {
	currentDynamicContrib = dynamicContrib;
	var r = JSON.stringify(serialize(obj));
	currentDynamicContrib = null;
	return r;
}

export function demarshallObject(serialized:string, dynamicContrib:IMarshallingContribution = null): any {
	currentDynamicContrib = dynamicContrib;
	var r = deserialize(JSON.parse(serialized));
	currentDynamicContrib = null;
	return r;
}