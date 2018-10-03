/* eslint "react/no-find-dom-node": "off" */

import React from 'react';
import ReactDOM from 'react-dom';
import TestUtils from 'react-addons-test-utils';

import {Footer} from './footer';

describe('Footer', () => {
  it('should be a footer', () => {
    const footer = TestUtils.renderIntoDocument(<Footer/>);
    const footerNode = ReactDOM.findDOMNode(footer);
    expect(footerNode.tagName).toEqual('FOOTER');
  });
});
