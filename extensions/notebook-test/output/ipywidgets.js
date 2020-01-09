/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var WidgetManager = require("./manager").WidgetManager;
require('@jupyter-widgets/controls/css/widgets.css');

var widgetarea = document.getElementsByClassName("widgetarea")[0];
manager = new WidgetManager(widgetarea);
window.manager = manager;

manager.renderTag = () => {
	let tags = widgetarea.querySelectorAll('script[type="application/vnd.jupyter.widget-state+json"]');
	if (tags.length) {
		let state = JSON.parse(tags[0].innerHTML);
		window.manager.set_state(state).then(function (models) {
			window.models = models;
		}).then(function () {
			let tags = widgetarea.querySelectorAll('script[type="application/vnd.jupyter.widget-view+json"]');
			for (let i = 0; i != tags.length; ++i) {
				let viewtag = tags[i];
				let widgetViewObject = JSON.parse(viewtag.innerHTML);
				let model_id = widgetViewObject.model_id;
	
				let model = window.models.filter((item) => {
					return item.model_id == model_id;
				})[0];
				if (model !== undefined) {
					let widgetTag = document.createElement('div');
					widgetTag.className = 'widget-subarea';
					viewtag.parentElement.insertBefore(widgetTag, viewtag);
					viewtag.parentElement.removeChild(viewtag);
					manager.display_model(undefined, model, { el: widgetTag });
				}
			}
		})
	}
}

manager.renderTag();