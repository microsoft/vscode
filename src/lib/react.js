/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

define(['./react.raw'], function(React) {

	if (!React.isProxy) {
		// Patch the real React to prevent immutable fields when handling events asynchronously
		var wrapFormElement = function(ctor, displayName) {
			return React.createClass({
				getDisplayName: function() {
					return displayName;
				},

				getInitialState: function() {
					return {
						value: this.props.value
					};
				},

				onChange: function(e) {
					this.setState({
						value: e.target.value
					});
					if (this.props.onChange) {
						this.props.onChange(e);
					}
				},

				componentWillReceiveProps: function(newProps) {
					this.setState({
						value: newProps.value
					});
				},

				render: function() {
					var clone = {};
					for (var key in this.props) {
						if (this.props.hasOwnProperty(key)) {
							clone[key] = this.props[key];
						}
					}
					clone.value = this.state.value;
					clone.onChange = this.onChange;
					return ctor(clone);
				}
			});
		}
		React.DOM.input = React.createFactory(wrapFormElement(React.DOM.input, 'input'));
		React.DOM.textarea = React.createFactory(wrapFormElement(React.DOM.textarea, 'textarea'));
		React.DOM.option = React.createFactory(wrapFormElement(React.DOM.option, 'option'));
	}
	if (typeof React.DOM.webview === 'undefined') {
		if (typeof self.process !== 'undefined') {
			React.DOM.webview = React.createFactory(React.createClass({
				componentDidMount: function() {
					var webview = document.createElement('webview');
					webview.src = this.props.src;
					var el = this.getDOMNode();
					el.appendChild(webview);
				},

				render: function() {
					return React.DOM.div();
				}
			}));
		} else {
			React.DOM.webview = React.createFactory(React.createClass({
				render: function() {
					return React.DOM.iframe({
						src: this.props.src
					});
				}
			}));
		}
	}

	var exports = React;

	// Utils for easy usage of React in TS
	exports.BaseComponent = function() { };
	exports.createFactoryForTS = function(klass) {
		var r = {};
		for (var p in klass) {
			if (p !== 'constructor' && klass.hasOwnProperty(p) && typeof klass[p] === 'function') {
				r[p] = klass[p];
			}
		}
		return React.createFactory(React.createClass(r));
	}

	return exports;
});