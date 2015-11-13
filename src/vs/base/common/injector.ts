/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
	
import Assert = require('vs/base/common/assert');
import Types = require('vs/base/common/types');

var inject = 'inject';
var injectLen = inject.length;

export class Container {
	
	private map:{[name:string]:any;};
	private parent:Container;
	
	constructor() {
		this.map = {};
		this.parent = null;
	}
	
	public setParent(parent:Container):void {
		this.parent = parent;
	}
	
	public registerService(target:string, service:any):any {
		Assert.ok(!Types.isUndefinedOrNull(target));
		Assert.ok(!Types.isUndefinedOrNull(service));
		
		this.map[target.toLowerCase()] = service;
		
		return service;
	}
	
	// injects the denoted services to the target
	public injectTo(target:any):boolean {
		Assert.ok(!Types.isUndefinedOrNull(target));
		
		// Support arrays
		var didInjectAtLeastOnce = false;
		if (Types.isArray(target)) {
			target.forEach((element:any) => {
				didInjectAtLeastOnce = this.injectTo(element) || didInjectAtLeastOnce;
			});
			return didInjectAtLeastOnce;
		}
		
		// inject services one by one
		for (var key in target) {
			if(key.indexOf(inject) !== 0) {
				continue;
			}
			
			var element = target[key];
			if(!Types.isFunction(element)) {
				continue;
			}
			
			key = key.substring(injectLen).toLowerCase();
			var service = this.findService(key, target);
			if(Types.isUndefinedOrNull(service)) {
				continue;
			}
			
			// call inject function
			element.apply(target, [service]);
			didInjectAtLeastOnce = true;				
		}
		
		return didInjectAtLeastOnce;
	}
	
	public createChild():Container {
		var childContainer = new Container();
		childContainer.setParent(this);
		
		return childContainer;
	}
	
	public findService(key:string, target:any=null):any {
		var result = this.map[key];
		if((Types.isUndefinedOrNull(result) || target === result) && this.parent !== null) {
			result = this.parent.findService(key, target);
		}
		
		return result;
	}
	
	public dispose():void {
		this.map = null;
		this.parent = null;
	}
}
