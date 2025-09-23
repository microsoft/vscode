(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('d3-selection'), require('d3-dispatch'), require('d3-transition'), require('d3-timer'), require('d3-interpolate'), require('d3-zoom'), require('@hpcc-js/wasm'), require('d3-format'), require('d3-path')) :
  typeof define === 'function' && define.amd ? define(['exports', 'd3-selection', 'd3-dispatch', 'd3-transition', 'd3-timer', 'd3-interpolate', 'd3-zoom', '@hpcc-js/wasm', 'd3-format', 'd3-path'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["d3-graphviz"] = {}, global.d3, global.d3, global.d3, global.d3, global.d3, global.d3, global["@hpcc-js/wasm"], global.d3, global.d3));
})(this, (function (exports, d3, d3Dispatch, d3Transition, d3Timer, d3Interpolate, d3Zoom, wasm, d3Format, d3Path) { 'use strict';

  function _interopNamespace(e) {
    if (e && e.__esModule) return e;
    var n = Object.create(null);
    if (e) {
      Object.keys(e).forEach(function (k) {
        if (k !== 'default') {
          var d = Object.getOwnPropertyDescriptor(e, k);
          Object.defineProperty(n, k, d.get ? d : {
            enumerable: true,
            get: function () { return e[k]; }
          });
        }
      });
    }
    n["default"] = e;
    return Object.freeze(n);
  }

  var d3__namespace = /*#__PURE__*/_interopNamespace(d3);

  function _defineProperty(obj, key, value) {
    if (key in obj) {
      Object.defineProperty(obj, key, {
        value: value,
        enumerable: true,
        configurable: true,
        writable: true
      });
    } else {
      obj[key] = value;
    }

    return obj;
  }

  function _toConsumableArray(arr) {
    return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _unsupportedIterableToArray(arr) || _nonIterableSpread();
  }

  function _arrayWithoutHoles(arr) {
    if (Array.isArray(arr)) return _arrayLikeToArray(arr);
  }

  function _iterableToArray(iter) {
    if (typeof Symbol !== "undefined" && iter[Symbol.iterator] != null || iter["@@iterator"] != null) return Array.from(iter);
  }

  function _unsupportedIterableToArray(o, minLen) {
    if (!o) return;
    if (typeof o === "string") return _arrayLikeToArray(o, minLen);
    var n = Object.prototype.toString.call(o).slice(8, -1);
    if (n === "Object" && o.constructor) n = o.constructor.name;
    if (n === "Map" || n === "Set") return Array.from(o);
    if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen);
  }

  function _arrayLikeToArray(arr, len) {
    if (len == null || len > arr.length) len = arr.length;

    for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i];

    return arr2;
  }

  function _nonIterableSpread() {
    throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
  }

  function extractElementData(element) {
    var datum = {};
    var tag = element.node().nodeName;
    datum.tag = tag;

    if (tag == '#text') {
      datum.text = element.text();
    } else if (tag == '#comment') {
      datum.comment = element.text();
    }

    datum.attributes = {};
    var attributes = element.node().attributes;

    if (attributes) {
      for (var i = 0; i < attributes.length; i++) {
        var attribute = attributes[i];
        var name = attribute.name;
        var value = attribute.value;
        datum.attributes[name] = value;
      }
    }

    var transform = element.node().transform;

    if (transform && transform.baseVal.numberOfItems != 0) {
      var matrix = transform.baseVal.consolidate().matrix;
      datum.translation = {
        x: matrix.e,
        y: matrix.f
      };
      datum.scale = matrix.a;
    }

    if (tag == 'ellipse') {
      datum.center = {
        x: datum.attributes.cx,
        y: datum.attributes.cy
      };
    }

    if (tag == 'polygon') {
      var points = element.attr('points').split(' ');
      var x = points.map(function (p) {
        return p.split(',')[0];
      });
      var y = points.map(function (p) {
        return p.split(',')[1];
      });
      var xmin = Math.min.apply(null, x);
      var xmax = Math.max.apply(null, x);
      var ymin = Math.min.apply(null, y);
      var ymax = Math.max.apply(null, y);
      var bbox = {
        x: xmin,
        y: ymin,
        width: xmax - xmin,
        height: ymax - ymin
      };
      datum.bbox = bbox;
      datum.center = {
        x: (xmin + xmax) / 2,
        y: (ymin + ymax) / 2
      };
    }

    if (tag == 'path') {
      var d = element.attr('d');
      var points = d.split(/[A-Z ]/);
      points.shift();
      var x = points.map(function (p) {
        return +p.split(',')[0];
      });
      var y = points.map(function (p) {
        return +p.split(',')[1];
      });
      var xmin = Math.min.apply(null, x);
      var xmax = Math.max.apply(null, x);
      var ymin = Math.min.apply(null, y);
      var ymax = Math.max.apply(null, y);
      var bbox = {
        x: xmin,
        y: ymin,
        width: xmax - xmin,
        height: ymax - ymin
      };
      datum.bbox = bbox;
      datum.center = {
        x: (xmin + xmax) / 2,
        y: (ymin + ymax) / 2
      };
      datum.totalLength = element.node().getTotalLength();
    }

    if (tag == 'text') {
      datum.center = {
        x: element.attr('x'),
        y: element.attr('y')
      };
    }

    if (tag == '#text') {
      datum.text = element.text();
    } else if (tag == '#comment') {
      datum.comment = element.text();
    }

    return datum;
  }
  function extractAllElementsData(element) {
    var datum = extractElementData(element);
    datum.children = [];
    var children = d3__namespace.selectAll(element.node().childNodes);
    children.each(function () {
      var childData = extractAllElementsData(d3__namespace.select(this));
      childData.parent = datum;
      datum.children.push(childData);
    });
    return datum;
  }
  function createElement(data) {
    if (data.tag == '#text') {
      return document.createTextNode("");
    } else if (data.tag == '#comment') {
      return document.createComment(data.comment);
    } else {
      return document.createElementNS('http://www.w3.org/2000/svg', data.tag);
    }
  }
  function createElementWithAttributes(data) {
    var elementNode = createElement(data);
    var element = d3__namespace.select(elementNode);
    var attributes = data.attributes;

    for (var _i = 0, _Object$keys = Object.keys(attributes); _i < _Object$keys.length; _i++) {
      var attributeName = _Object$keys[_i];
      var attributeValue = attributes[attributeName];
      element.attr(attributeName, attributeValue);
    }

    return elementNode;
  }
  function replaceElement(element, data) {
    var parent = d3__namespace.select(element.node().parentNode);
    var newElementNode = createElementWithAttributes(data);
    var newElement = parent.insert(function () {
      return newElementNode;
    }, function () {
      return element.node();
    });
    element.remove();
    return newElement;
  }
  function insertElementData(element, datum) {
    element.datum(datum);
    element.data([datum], function (d) {
      return d.key;
    });
  }
  function insertAllElementsData(element, datum) {
    insertElementData(element, datum);
    var children = d3__namespace.selectAll(element.node().childNodes);
    children.each(function (d, i) {
      insertAllElementsData(d3__namespace.select(this), datum.children[i]);
    });
  }

  function insertChildren(element, index) {
    var children = element.selectAll(function () {
      return element.node().childNodes;
    });
    children = children.data(function (d) {
      return d.children;
    }, function (d) {
      return d.tag + '-' + index;
    });
    var childrenEnter = children.enter().append(function (d) {
      return createElement(d);
    });
    var childrenExit = children.exit();
    childrenExit = childrenExit.remove();
    children = childrenEnter.merge(children);
    var childTagIndexes = {};
    children.each(function (childData) {
      var childTag = childData.tag;

      if (childTagIndexes[childTag] == null) {
        childTagIndexes[childTag] = 0;
      }

      var childIndex = childTagIndexes[childTag]++;
      attributeElement.call(this, childData, childIndex);
    });
  }

  function attributeElement(data) {
    var index = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
    var element = d3__namespace.select(this);
    data.tag;
    var attributes = data.attributes;
    var currentAttributes = element.node().attributes;

    if (currentAttributes) {
      for (var i = 0; i < currentAttributes.length; i++) {
        var currentAttribute = currentAttributes[i];
        var name = currentAttribute.name;

        if (name.split(':')[0] != 'xmlns' && currentAttribute.namespaceURI) {
          var namespaceURIParts = currentAttribute.namespaceURI.split('/');
          var namespace = namespaceURIParts[namespaceURIParts.length - 1];
          name = namespace + ':' + name;
        }

        if (!(name in attributes)) {
          attributes[name] = null;
        }
      }
    }

    for (var _i2 = 0, _Object$keys2 = Object.keys(attributes); _i2 < _Object$keys2.length; _i2++) {
      var attributeName = _Object$keys2[_i2];
      element.attr(attributeName, attributes[attributeName]);
    }

    if (data.text) {
      element.text(data.text);
    }

    insertChildren(element, index);
  }

  function shallowCopyObject(obj) {
    return Object.assign({}, obj);
  }
  function roundTo2Decimals(x) {
    return Math.round(x * 100.0) / 100.0;
  }

  function zoom (enable) {
    this._options.zoom = enable;

    if (this._options.zoom && !this._zoomBehavior) {
      createZoomBehavior.call(this);
    } else if (!this._options.zoom && this._zoomBehavior) {
      this._zoomSelection.on(".zoom", null);

      this._zoomBehavior = null;
    }

    return this;
  }
  function createZoomBehavior() {
    var graphvizInstance = this;

    function zoomed(event) {
      var g = d3__namespace.select(svg.node().querySelector("g"));
      g.attr('transform', event.transform);

      graphvizInstance._dispatch.call('zoom', graphvizInstance);
    }

    var root = this._selection;
    var svg = d3__namespace.select(root.node().querySelector("svg"));

    if (svg.size() == 0) {
      return this;
    }

    this._zoomSelection = svg;
    var zoomBehavior = d3Zoom.zoom().scaleExtent(this._options.zoomScaleExtent).translateExtent(this._options.zoomTranslateExtent).interpolate(d3Interpolate.interpolate).on("zoom", zoomed);
    this._zoomBehavior = zoomBehavior;
    var g = d3__namespace.select(svg.node().querySelector("g"));
    svg.call(zoomBehavior);

    if (!this._active) {
      translateZoomBehaviorTransform.call(this, g);
    }

    this._originalTransform = d3Zoom.zoomTransform(svg.node());
    return this;
  }
  function getTranslatedZoomTransform(selection) {
    // Get the current zoom transform for the top level svg and
    // translate it uniformly with the given selection, using the
    // difference between the translation specified in the selection's
    // data and it's saved previous translation. The selection is
    // normally the top level g element of the graph.
    var oldTranslation = this._translation;
    var oldScale = this._scale;
    var newTranslation = selection.datum().translation;
    var newScale = selection.datum().scale;
    var t = d3Zoom.zoomTransform(this._zoomSelection.node());

    if (oldTranslation) {
      t = t.scale(1 / oldScale);
      t = t.translate(-oldTranslation.x, -oldTranslation.y);
    }

    t = t.translate(newTranslation.x, newTranslation.y);
    t = t.scale(newScale);
    return t;
  }
  function translateZoomBehaviorTransform(selection) {
    // Translate the current zoom transform for the top level svg
    // uniformly with the given selection, using the difference
    // between the translation specified in the selection's data and
    // it's saved previous translation. The selection is normally the
    // top level g element of the graph.
    this._zoomBehavior.transform(this._zoomSelection, getTranslatedZoomTransform.call(this, selection)); // Save the selections's new translation and scale.


    this._translation = selection.datum().translation;
    this._scale = selection.datum().scale; // Set the original zoom transform to the translation and scale specified in
    // the selection's data.

    this._originalTransform = d3Zoom.zoomIdentity.translate(selection.datum().translation.x, selection.datum().translation.y).scale(selection.datum().scale);
  }
  function resetZoom(transition) {
    // Reset the zoom transform to the original zoom transform.
    var selection = this._zoomSelection;

    if (transition) {
      selection = selection.transition(transition);
    }

    selection.call(this._zoomBehavior.transform, this._originalTransform);
    return this;
  }
  function zoomScaleExtent(extent) {
    this._options.zoomScaleExtent = extent;
    return this;
  }
  function zoomTranslateExtent(extent) {
    this._options.zoomTranslateExtent = extent;
    return this;
  }
  function zoomBehavior() {
    return this._zoomBehavior || null;
  }
  function zoomSelection() {
    return this._zoomSelection || null;
  }

  function pathTween(points, d1) {
    return function () {
      var pointInterpolators = points.map(function (p) {
        return d3Interpolate.interpolate([p[0][0], p[0][1]], [p[1][0], p[1][1]]);
      });
      return function (t) {
        return t < 1 ? "M" + pointInterpolators.map(function (p) {
          return p(t);
        }).join("L") : d1;
      };
    };
  }
  function pathTweenPoints(node, d1, precision, precisionIsRelative) {
    var path0 = node;
    var path1 = path0.cloneNode();
    var n0 = path0.getTotalLength();
    var n1 = (path1.setAttribute("d", d1), path1).getTotalLength(); // Uniform sampling of distance based on specified precision.

    var distances = [0];
    var i = 0;
    var dt = precisionIsRelative ? precision : precision / Math.max(n0, n1);

    while ((i += dt) < 1) {
      distances.push(i);
    }

    distances.push(1); // Compute point-interpolators at each distance.

    var points = distances.map(function (t) {
      var p0 = path0.getPointAtLength(t * n0);
      var p1 = path1.getPointAtLength(t * n1);
      return [[p0.x, p0.y], [p1.x, p1.y]];
    });
    return points;
  }

  function data () {
    return this._data || null;
  }
  function isEdgeElementParent(datum) {
    return datum.attributes["class"] == 'edge' || datum.tag == 'a' && datum.parent.tag == 'g' && datum.parent.parent.attributes["class"] == 'edge';
  }
  function isEdgeElement(datum) {
    return datum.parent && isEdgeElementParent(datum.parent);
  }
  function getEdgeGroup(datum) {
    if (datum.parent.attributes["class"] == 'edge') {
      return datum.parent;
    } else {
      // datum.parent.tag == 'g' && datum.parent.parent.tag == 'g' && datum.parent.parent.parent.attributes.class == 'edge'
      return datum.parent.parent.parent;
    }
  }
  function getEdgeTitle(datum) {
    return getEdgeGroup(datum).children.find(function (e) {
      return e.tag == 'title';
    });
  }

  function render (callback) {
    if (this._busy) {
      this._queue.push(this.render.bind(this, callback));

      return this;
    }

    this._dispatch.call('renderStart', this);

    if (this._transitionFactory) {
      d3Timer.timeout(function () {
        // Decouple from time spent. See https://github.com/d3/d3-timer/issues/27
        this._transition = d3Transition.transition(this._transitionFactory());

        _render.call(this, callback);
      }.bind(this), 0);
    } else {
      _render.call(this, callback);
    }

    return this;
  }

  function _render(callback) {
    var transitionInstance = this._transition;
    var fade = this._options.fade && transitionInstance != null;
    var tweenPaths = this._options.tweenPaths;
    var tweenShapes = this._options.tweenShapes;
    var convertEqualSidedPolygons = this._options.convertEqualSidedPolygons;
    var growEnteringEdges = this._options.growEnteringEdges && transitionInstance != null;
    var attributer = this._attributer;
    var graphvizInstance = this;

    function insertChildren(element) {
      var children = element.selectAll(function () {
        return element.node().childNodes;
      });
      children = children.data(function (d) {
        return d.children;
      }, function (d) {
        return d.key;
      });
      var childrenEnter = children.enter().append(function (d) {
        var element = createElement(d);

        if (d.tag == '#text' && fade) {
          element.nodeValue = d.text;
        }

        return element;
      });

      if (fade || growEnteringEdges && isEdgeElementParent(element.datum())) {
        var childElementsEnter = childrenEnter.filter(function (d) {
          return d.tag[0] == '#' ? null : this;
        }).each(function (d) {
          var childEnter = d3__namespace.select(this);

          for (var _i = 0, _Object$keys = Object.keys(d.attributes); _i < _Object$keys.length; _i++) {
            var attributeName = _Object$keys[_i];
            var attributeValue = d.attributes[attributeName];
            childEnter.attr(attributeName, attributeValue);
          }
        });
        childElementsEnter.filter(function (d) {
          return d.tag == 'svg' || d.tag == 'g' ? null : this;
        }).style("opacity", 0.0);
      }

      var childrenExit = children.exit();

      if (attributer) {
        childrenExit.each(attributer);
      }

      if (transitionInstance) {
        childrenExit = childrenExit.transition(transitionInstance);

        if (fade) {
          childrenExit.filter(function (d) {
            return d.tag[0] == '#' ? null : this;
          }).style("opacity", 0.0);
        }
      }

      childrenExit = childrenExit.remove();
      children = childrenEnter.merge(children);
      children.each(attributeElement);
    }

    function attributeElement(data) {
      var element = d3__namespace.select(this);

      if (data.tag == "svg") {
        var options = graphvizInstance._options;

        if (options.width != null || options.height != null) {
          var width = options.width;
          var height = options.height;

          if (width == null) {
            width = data.attributes.width.replace('pt', '') * 4 / 3;
          } else {
            element.attr("width", width);
            data.attributes.width = width;
          }

          if (height == null) {
            height = data.attributes.height.replace('pt', '') * 4 / 3;
          } else {
            element.attr("height", height);
            data.attributes.height = height;
          }

          if (!options.fit) {
            element.attr("viewBox", "0 0 ".concat(width * 3 / 4 / options.scale, " ").concat(height * 3 / 4 / options.scale));
            data.attributes.viewBox = "0 0 ".concat(width * 3 / 4 / options.scale, " ").concat(height * 3 / 4 / options.scale);
          }
        }

        if (options.scale != 1 && (options.fit || options.width == null && options.height == null)) {
          width = data.attributes.viewBox.split(' ')[2];
          height = data.attributes.viewBox.split(' ')[3];
          element.attr("viewBox", "0 0 ".concat(width / options.scale, " ").concat(height / options.scale));
          data.attributes.viewBox = "0 0 ".concat(width / options.scale, " ").concat(height / options.scale);
        }
      }

      if (attributer) {
        element.each(attributer);
      }

      var tag = data.tag;
      var attributes = data.attributes;
      var currentAttributes = element.node().attributes;

      if (currentAttributes) {
        for (var i = 0; i < currentAttributes.length; i++) {
          var currentAttribute = currentAttributes[i];
          var name = currentAttribute.name;

          if (name.split(':')[0] != 'xmlns' && currentAttribute.namespaceURI) {
            var namespaceURIParts = currentAttribute.namespaceURI.split('/');
            var namespace = namespaceURIParts[namespaceURIParts.length - 1];
            name = namespace + ':' + name;
          }

          if (!(name in attributes)) {
            attributes[name] = null;
          }
        }
      }

      var convertShape = false;
      var convertPrevShape = false;

      if (tweenShapes && transitionInstance) {
        if ((this.nodeName == 'polygon' || this.nodeName == 'ellipse') && data.alternativeOld) {
          convertPrevShape = true;
        }

        if ((tag == 'polygon' || tag == 'ellipse') && data.alternativeNew) {
          convertShape = true;
        }

        if (this.nodeName == 'polygon' && tag == 'polygon' && data.alternativeOld) {
          var prevData = extractElementData(element);
          var prevPoints = prevData.attributes.points;

          if (!convertEqualSidedPolygons) {
            var nPrevPoints = prevPoints.split(' ').length;
            var points = data.attributes.points;
            var nPoints = points.split(' ').length;

            if (nPoints == nPrevPoints) {
              convertShape = false;
              convertPrevShape = false;
            }
          }
        }

        if (convertPrevShape) {
          var prevPathData = data.alternativeOld;
          var pathElement = replaceElement(element, prevPathData);
          pathElement.data([data], function () {
            return data.key;
          });
          element = pathElement;
        }

        if (convertShape) {
          var newPathData = data.alternativeNew;
          tag = 'path';
          attributes = newPathData.attributes;
        }
      }

      var elementTransition = element;

      if (transitionInstance) {
        elementTransition = elementTransition.transition(transitionInstance);

        if (fade) {
          elementTransition.filter(function (d) {
            return d.tag[0] == '#' ? null : this;
          }).style("opacity", 1.0);
        }

        elementTransition.filter(function (d) {
          return d.tag[0] == '#' ? null : this;
        }).on("end", function (d) {
          d3__namespace.select(this).attr('style', d && d.attributes && d.attributes.style || null);
        });
      }

      var growThisPath = growEnteringEdges && tag == 'path' && data.offset;

      if (growThisPath) {
        var totalLength = data.totalLength;
        element.attr("stroke-dasharray", totalLength + " " + totalLength).attr("stroke-dashoffset", totalLength).attr('transform', 'translate(' + data.offset.x + ',' + data.offset.y + ')');
        attributes["stroke-dashoffset"] = 0;
        attributes['transform'] = 'translate(0,0)';
        elementTransition.attr("stroke-dashoffset", attributes["stroke-dashoffset"]).attr('transform', attributes['transform']).on("start", function () {
          d3__namespace.select(this).style('opacity', null);
        }).on("end", function () {
          d3__namespace.select(this).attr('stroke-dashoffset', null).attr('stroke-dasharray', null).attr('transform', null);
        });
      }

      var moveThisPolygon = growEnteringEdges && tag == 'polygon' && isEdgeElement(data) && data.offset && data.parent.children[3].tag == 'path';

      if (moveThisPolygon) {
        var edgePath = d3__namespace.select(element.node().parentNode.querySelector("path"));
        var p0 = edgePath.node().getPointAtLength(0);
        var p1 = edgePath.node().getPointAtLength(data.totalLength);
        var p2 = edgePath.node().getPointAtLength(data.totalLength - 1);
        var angle1 = Math.atan2(p1.y - p2.y, p1.x - p2.x) * 180 / Math.PI;
        var x = p0.x - p1.x + data.offset.x;
        var y = p0.y - p1.y + data.offset.y;
        element.attr('transform', 'translate(' + x + ',' + y + ')');
        elementTransition.attrTween("transform", function () {
          return function (t) {
            var p = edgePath.node().getPointAtLength(data.totalLength * t);
            var p2 = edgePath.node().getPointAtLength(data.totalLength * t + 1);
            var angle = Math.atan2(p2.y - p.y, p2.x - p.x) * 180 / Math.PI - angle1;
            x = p.x - p1.x + data.offset.x * (1 - t);
            y = p.y - p1.y + data.offset.y * (1 - t);
            return 'translate(' + x + ',' + y + ') rotate(' + angle + ' ' + p1.x + ' ' + p1.y + ')';
          };
        }).on("start", function () {
          d3__namespace.select(this).style('opacity', null);
        }).on("end", function () {
          d3__namespace.select(this).attr('transform', null);
        });
      }

      var tweenThisPath = tweenPaths && transitionInstance && tag == 'path' && element.attr('d') != null;

      for (var _i2 = 0, _Object$keys2 = Object.keys(attributes); _i2 < _Object$keys2.length; _i2++) {
        var attributeName = _Object$keys2[_i2];
        var attributeValue = attributes[attributeName];

        if (tweenThisPath && attributeName == 'd') {
          var points = (data.alternativeOld || data).points;

          if (points) {
            elementTransition.attrTween("d", pathTween(points, attributeValue));
          }
        } else {
          if (attributeName == 'transform' && data.translation) {
            if (transitionInstance) {
              var onEnd = elementTransition.on("end");
              elementTransition.on("start", function () {
                if (graphvizInstance._zoomBehavior) {
                  // Update the transform to transition to, just before the transition starts
                  // in order to catch changes between the transition scheduling to its start.
                  elementTransition.tween("attr.transform", function () {
                    var node = this;
                    return function (t) {
                      node.setAttribute("transform", d3Interpolate.interpolateTransformSvg(d3Zoom.zoomTransform(graphvizInstance._zoomSelection.node()).toString(), getTranslatedZoomTransform.call(graphvizInstance, element).toString())(t));
                    };
                  });
                }
              }).on("end", function () {
                onEnd.call(this); // Update the zoom transform to the new translated transform

                if (graphvizInstance._zoomBehavior) {
                  translateZoomBehaviorTransform.call(graphvizInstance, element);
                }
              });
            } else {
              if (graphvizInstance._zoomBehavior) {
                // Update the transform attribute to set with the current pan translation
                translateZoomBehaviorTransform.call(graphvizInstance, element);
                attributeValue = getTranslatedZoomTransform.call(graphvizInstance, element).toString();
              }
            }
          }

          elementTransition.attr(attributeName, attributeValue);
        }
      }

      if (convertShape) {
        elementTransition.on("end", function (d, i, nodes) {
          pathElement = d3__namespace.select(this);
          var newElement = replaceElement(pathElement, d);
          newElement.data([d], function () {
            return d.key;
          });
        });
      }

      if (data.text) {
        elementTransition.text(data.text);
      }

      insertChildren(element);
    }

    var root = this._selection;

    if (transitionInstance != null) {
      // Ensure original SVG shape elements are restored after transition before rendering new graph
      var jobs = this._jobs;

      if (graphvizInstance._active) {
        jobs.push(null);
        return this;
      } else {
        root.transition(transitionInstance).transition().duration(0).on("end", function () {
          graphvizInstance._active = false;

          if (jobs.length != 0) {
            jobs.shift();
            graphvizInstance.render();
          }
        });
        this._active = true;
      }
    }

    if (transitionInstance != null) {
      root.transition(transitionInstance).on("start", function () {
        graphvizInstance._dispatch.call('transitionStart', graphvizInstance);
      }).on("end", function () {
        graphvizInstance._dispatch.call('transitionEnd', graphvizInstance);
      }).transition().duration(0).on("start", function () {
        graphvizInstance._dispatch.call('restoreEnd', graphvizInstance);

        graphvizInstance._dispatch.call('end', graphvizInstance);

        if (callback) {
          callback.call(graphvizInstance);
        }
      });
    }

    var data = this._data;
    var svg = root.selectAll("svg").data([data], function (d) {
      return d.key;
    });
    svg = svg.enter().append("svg").merge(svg);
    attributeElement.call(svg.node(), data);

    if (this._options.zoom && !this._zoomBehavior) {
      createZoomBehavior.call(this);
    }

    graphvizInstance._dispatch.call('renderEnd', graphvizInstance);

    if (transitionInstance == null) {
      this._dispatch.call('end', this);

      if (callback) {
        callback.call(this);
      }
    }

    return this;
  }

  function graphvizVersion () {
    return this._graphvizVersion;
  }

  function convertToPathData(originalData, guideData) {
    if (originalData.tag == 'polygon') {
      var newData = shallowCopyObject(originalData);
      newData.tag = 'path';
      var originalAttributes = originalData.attributes;
      var newAttributes = shallowCopyObject(originalAttributes);
      var newPointsString = originalAttributes.points;

      if (guideData.tag == 'polygon') {
        var bbox = originalData.bbox;
        bbox.cx = bbox.x + bbox.width / 2;
        bbox.cy = bbox.y + bbox.height / 2;
        var pointsString = originalAttributes.points;
        var pointStrings = pointsString.split(' ');
        var normPoints = pointStrings.map(function (p) {
          var xy = p.split(',');
          return [xy[0] - bbox.cx, xy[1] - bbox.cy];
        });
        var x0 = normPoints[normPoints.length - 1][0];
        var y0 = normPoints[normPoints.length - 1][1];

        for (var i = 0; i < normPoints.length; i++, x0 = x1, y0 = y1) {
          var x1 = normPoints[i][0];
          var y1 = normPoints[i][1];
          var dx = x1 - x0;
          var dy = y1 - y0;

          if (dy == 0) {
            continue;
          } else {
            var x2 = x0 - y0 * dx / dy;
          }

          if (0 <= x2 && x2 < Infinity && (x0 <= x2 && x2 <= x1 || x1 <= x2 && x2 <= x0)) {
            break;
          }
        }

        var newPointStrings = [[bbox.cx + x2, bbox.cy + 0].join(',')];
        newPointStrings = newPointStrings.concat(pointStrings.slice(i));
        newPointStrings = newPointStrings.concat(pointStrings.slice(0, i));
        newPointsString = newPointStrings.join(' ');
      }

      newAttributes['d'] = 'M' + newPointsString + 'z';
      delete newAttributes.points;
      newData.attributes = newAttributes;
    } else
      /* if (originalData.tag == 'ellipse') */
      {
        var newData = shallowCopyObject(originalData);
        newData.tag = 'path';
        var originalAttributes = originalData.attributes;
        var newAttributes = shallowCopyObject(originalAttributes);
        var cx = originalAttributes.cx;
        var cy = originalAttributes.cy;
        var rx = originalAttributes.rx;
        var ry = originalAttributes.ry;

        if (guideData.tag == 'polygon') {
          var bbox = guideData.bbox;
          bbox.cx = bbox.x + bbox.width / 2;
          bbox.cy = bbox.y + bbox.height / 2;
          var p = guideData.attributes.points.split(' ')[0].split(',');
          var sx = p[0];
          var sy = p[1];
          var dx = sx - bbox.cx;
          var dy = sy - bbox.cy;
          var l = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
          var cosA = dx / l;
          var sinA = -dy / l;
        } else {
          // if (guideData.tag == 'path') {
          // FIXME: add support for getting start position from path
          var cosA = 1;
          var sinA = 0;
        }

        var x1 = rx * cosA;
        var y1 = -ry * sinA;
        var x2 = rx * -cosA;
        var y2 = -ry * -sinA;
        var dx = x2 - x1;
        var dy = y2 - y1;
        newAttributes['d'] = 'M ' + cx + ' ' + cy + ' m ' + x1 + ',' + y1 + ' a ' + rx + ',' + ry + ' 0 1,0 ' + dx + ',' + dy + ' a ' + rx + ',' + ry + ' 0 1,0 ' + -dx + ',' + -dy + 'z';
        delete newAttributes.cx;
        delete newAttributes.cy;
        delete newAttributes.rx;
        delete newAttributes.ry;
        newData.attributes = newAttributes;
      }

    return newData;
  }
  function translatePointsAttribute(pointsString, x, y) {
    var pointStrings = pointsString.split(' ');
    var points = pointStrings.map(function (p) {
      return p.split(',');
    });
    var points = pointStrings.map(function (p) {
      return [roundTo2Decimals(+x + +p.split(',')[0]), roundTo2Decimals(+y + +p.split(',')[1])];
    });
    var pointStrings = points.map(function (p) {
      return p.join(',');
    });
    var pointsString = pointStrings.join(' ');
    return pointsString;
  }
  function translateDAttribute(d, x, y) {
    var pointStrings = d.split(/[A-Z ]/);
    pointStrings.shift();
    var commands = d.split(/[^[A-Z ]+/);
    var points = pointStrings.map(function (p) {
      return p.split(',');
    });
    var points = pointStrings.map(function (p) {
      return [roundTo2Decimals(+x + +p.split(',')[0]), roundTo2Decimals(+y + +p.split(',')[1])];
    });
    var pointStrings = points.map(function (p) {
      return p.join(',');
    });
    d = commands.reduce(function (arr, v, i) {
      return arr.concat(v, pointStrings[i]);
    }, []).join('');
    return d;
  }

  function initViz() {
    var _this = this;

    // force JIT compilation of @hpcc-js/wasm
    try {
      wasm.graphviz.layout("", "svg", "dot").then(function () {
        wasm.graphvizSync().then(function (graphviz1) {
          _this.layoutSync = graphviz1.layout.bind(graphviz1);

          if (_this._worker == null) {
            _this._dispatch.call("initEnd", _this);
          }

          if (_this._afterInit) {
            _this._afterInit();
          }
        });
      });
    } catch (error) {}

    if (this._worker != null) {
      var vizURL = this._vizURL;
      var graphvizInstance = this;

      this._workerPort.onmessage = function (event) {
        var callback = graphvizInstance._workerCallbacks.shift();

        callback.call(graphvizInstance, event);
      };

      if (!vizURL.match(/^https?:\/\/|^\/\//i)) {
        // Local URL. Prepend with local domain to be usable in web worker
        vizURL = new window.URL(vizURL, document.location.href).href;
      }

      postMessage.call(this, {
        type: "layout",
        dot: "",
        engine: 'dot',
        vizURL: vizURL
      }, function (event) {
        switch (event.data.type) {
                }
      });
      postMessage.call(this, {
        type: "version"
      }, function (event) {
        switch (event.data.type) {
          case "version":
            graphvizInstance._graphvizVersion = event.data.version;

            graphvizInstance._dispatch.call("initEnd", this);

            break;
        }
      });
    }
  }

  function postMessage(message, callback) {
    this._workerCallbacks.push(callback);

    this._workerPort.postMessage(message);
  }

  function layout(src, engine, vizOptions, callback) {
    if (this._worker) {
      postMessage.call(this, {
        type: "layout",
        dot: src,
        engine: engine,
        options: vizOptions
      }, function (event) {
        callback.call(this, event.data);
      });
    } else {
      try {
        var svgDoc = this.layoutSync(src, "svg", engine, vizOptions);
        callback.call(this, {
          type: 'done',
          svg: svgDoc
        });
      } catch (error) {
        callback.call(this, {
          type: 'error',
          error: error.message
        });
      }
    }
  }
  function dot (src, callback) {
    var graphvizInstance = this;
    this._worker;
    var engine = this._options.engine;
    var images = this._images;

    this._dispatch.call("start", this);

    this._busy = true;

    this._dispatch.call("layoutStart", this);

    var vizOptions = {
      images: images
    };

    if (!this._worker && this.layoutSync == null) {
      this._afterInit = this.dot.bind(this, src, callback);
      return this;
    }

    this.layout(src, engine, vizOptions, function (data) {
      switch (data.type) {
        case "error":
          if (graphvizInstance._onerror) {
            graphvizInstance._onerror(data.error);
          } else {
            throw data.error.message;
          }

          break;

        case "done":
          var svgDoc = data.svg;
          layoutDone.call(this, svgDoc, callback);
          break;
      }
    });
    return this;
  }

  function layoutDone(svgDoc, callback) {
    var keyMode = this._options.keyMode;
    var tweenPaths = this._options.tweenPaths;
    var tweenShapes = this._options.tweenShapes;

    if (typeof this._options.tweenPrecision == 'string' && this._options.tweenPrecision.includes('%')) {
      var tweenPrecision = +this._options.tweenPrecision.split('%')[0] / 100;

      var tweenPrecisionIsRelative = this._options.tweenPrecision.includes('%');
    } else {
      var tweenPrecision = this._options.tweenPrecision;
      var tweenPrecisionIsRelative = false;
    }

    var growEnteringEdges = this._options.growEnteringEdges;
    var dictionary = {};
    var prevDictionary = this._dictionary || {};
    var nodeDictionary = {};
    var prevNodeDictionary = this._nodeDictionary || {};

    function setKey(datum, index) {
      var tag = datum.tag;

      if (keyMode == 'index') {
        datum.key = index;
      } else if (tag[0] != '#') {
        if (keyMode == 'id') {
          datum.key = datum.attributes.id;
        } else if (keyMode == 'title') {
          var title = datum.children.find(function (childData) {
            return childData.tag == 'title';
          });

          if (title) {
            if (title.children.length > 0) {
              datum.key = title.children[0].text;
            } else {
              datum.key = '';
            }
          }
        }
      }

      if (datum.key == null) {
        if (tweenShapes) {
          if (tag == 'ellipse' || tag == 'polygon') {
            tag = 'path';
          }
        }

        datum.key = tag + '-' + index;
      }
    }

    function setId(datum, parentData) {
      var id = (parentData ? parentData.id + '.' : '') + datum.key;
      datum.id = id;
    }

    function addToDictionary(datum) {
      dictionary[datum.id] = datum;
    }

    function calculateAlternativeShapeData(datum, prevDatum) {
      if (tweenShapes && datum.id in prevDictionary) {
        if ((prevDatum.tag == 'polygon' || prevDatum.tag == 'ellipse' || prevDatum.tag == 'path') && (prevDatum.tag != datum.tag || datum.tag == 'polygon')) {
          if (prevDatum.tag != 'path') {
            datum.alternativeOld = convertToPathData(prevDatum, datum);
          }

          if (datum.tag != 'path') {
            datum.alternativeNew = convertToPathData(datum, prevDatum);
          }
        }
      }
    }

    function calculatePathTweenPoints(datum, prevDatum) {
      if (tweenPaths && prevDatum && (prevDatum.tag == 'path' || datum.alternativeOld && datum.alternativeOld.tag == 'path')) {
        var attribute_d = (datum.alternativeNew || datum).attributes.d;

        if (datum.alternativeOld) {
          var oldNode = createElementWithAttributes(datum.alternativeOld);
        } else {
          var oldNode = createElementWithAttributes(prevDatum);
        }

        (datum.alternativeOld || (datum.alternativeOld = {})).points = pathTweenPoints(oldNode, attribute_d, tweenPrecision, tweenPrecisionIsRelative);
      }
    }

    function postProcessDataPass1Local(datum) {
      var index = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      var parentData = arguments.length > 2 ? arguments[2] : undefined;
      setKey(datum, index);
      setId(datum, parentData);
      var id = datum.id;
      var prevDatum = prevDictionary[id];
      addToDictionary(datum);
      calculateAlternativeShapeData(datum, prevDatum);
      calculatePathTweenPoints(datum, prevDatum);
      var childTagIndexes = {};
      datum.children.forEach(function (childData) {
        var childTag = childData.tag;

        if (childTag == 'ellipse' || childTag == 'polygon') {
          childTag = 'path';
        }

        if (childTagIndexes[childTag] == null) {
          childTagIndexes[childTag] = 0;
        }

        var childIndex = childTagIndexes[childTag]++;
        postProcessDataPass1Local(childData, childIndex, datum);
      });
    }

    function addToNodeDictionary(datum) {
      var tag = datum.tag;

      if (growEnteringEdges && datum.parent) {
        if (datum.parent.attributes["class"] == 'node') {
          if (tag == 'title') {
            if (datum.children.length > 0) {
              var child = datum.children[0];
              var nodeId = child.text;
            } else {
              var nodeId = '';
            }

            nodeDictionary[nodeId] = datum.parent;
          }
        }
      }
    }

    function extractGrowingEdgesData(datum) {
      var id = datum.id;
      var tag = datum.tag;
      var prevDatum = prevDictionary[id];

      if (growEnteringEdges && !prevDatum && datum.parent) {
        if (isEdgeElement(datum)) {
          if (tag == 'path' || tag == 'polygon') {
            if (tag == 'polygon') {
              var path = datum.parent.children.find(function (e) {
                return e.tag == 'path';
              });

              if (path) {
                datum.totalLength = path.totalLength;
              }
            }

            var title = getEdgeTitle(datum);
            var child = title.children[0];
            var nodeIds = child.text.split('->');

            if (nodeIds.length != 2) {
              nodeIds = child.text.split('--');
            }

            var startNodeId = nodeIds[0];
            var startNode = nodeDictionary[startNodeId];
            var prevStartNode = prevNodeDictionary[startNodeId];

            if (prevStartNode) {
              var i = startNode.children.findIndex(function (element, index) {
                return element.tag == 'g';
              });

              if (i >= 0) {
                var j = startNode.children[i].children.findIndex(function (element, index) {
                  return element.tag == 'a';
                });
                startNode = startNode.children[i].children[j];
              }

              var i = prevStartNode.children.findIndex(function (element, index) {
                return element.tag == 'g';
              });

              if (i >= 0) {
                var j = prevStartNode.children[i].children.findIndex(function (element, index) {
                  return element.tag == 'a';
                });
                prevStartNode = prevStartNode.children[i].children[j];
              }

              var startShapes = startNode.children;

              for (var i = 0; i < startShapes.length; i++) {
                if (startShapes[i].tag == 'polygon' || startShapes[i].tag == 'ellipse' || startShapes[i].tag == 'path' || startShapes[i].tag == 'text') {
                  var startShape = startShapes[i];
                  break;
                }
              }

              var prevStartShapes = prevStartNode.children;

              for (var i = 0; i < prevStartShapes.length; i++) {
                if (prevStartShapes[i].tag == 'polygon' || prevStartShapes[i].tag == 'ellipse' || prevStartShapes[i].tag == 'path' || prevStartShapes[i].tag == 'text') {
                  var prevStartShape = prevStartShapes[i];
                  break;
                }
              }

              if (prevStartShape && startShape) {
                datum.offset = {
                  x: prevStartShape.center.x - startShape.center.x,
                  y: prevStartShape.center.y - startShape.center.y
                };
              } else {
                datum.offset = {
                  x: 0,
                  y: 0
                };
              }
            }
          }
        }
      }
    }

    function postProcessDataPass2Global(datum) {
      addToNodeDictionary(datum);
      extractGrowingEdgesData(datum);
      datum.children.forEach(function (childData) {
        postProcessDataPass2Global(childData);
      });
    }

    this._dispatch.call("layoutEnd", this);

    var newDoc = d3__namespace.select(document.createDocumentFragment()).append('div');
    var parser = new window.DOMParser();
    var doc = parser.parseFromString(svgDoc, "image/svg+xml");
    newDoc.append(function () {
      return doc.documentElement;
    });
    var newSvg = newDoc.select('svg');
    var data = extractAllElementsData(newSvg);

    this._dispatch.call('dataExtractEnd', this);

    postProcessDataPass1Local(data);

    this._dispatch.call('dataProcessPass1End', this);

    postProcessDataPass2Global(data);

    this._dispatch.call('dataProcessPass2End', this);

    this._data = data;
    this._dictionary = dictionary;
    this._nodeDictionary = nodeDictionary;

    this._extractData = function (element, childIndex, parentData) {
      var data = extractAllElementsData(element);
      postProcessDataPass1Local(data, childIndex, parentData);
      postProcessDataPass2Global(data);
      return data;
    };

    this._busy = false;

    this._dispatch.call('dataProcessEnd', this);

    if (callback) {
      callback.call(this);
    }

    if (this._queue.length > 0) {
      var job = this._queue.shift();

      job.call(this);
    }
  }

  function renderDot (src, callback) {
    var graphvizInstance = this;
    this.dot(src, render);

    function render() {
      graphvizInstance.render(callback);
    }

    return this;
  }

  function transition (name) {
    if (name instanceof Function) {
      this._transitionFactory = name;
    } else {
      this._transition = d3Transition.transition(name);
    }

    return this;
  }
  function active(name) {
    var root = this._selection;
    var svg = root.selectWithoutDataPropagation("svg");

    if (svg.size() != 0) {
      return d3Transition.active(svg.node(), name);
    } else {
      return null;
    }
  }

  function options (options) {
    if (typeof options == 'undefined') {
      return Object.assign({}, this._options);
    } else {
      for (var _i = 0, _Object$keys = Object.keys(options); _i < _Object$keys.length; _i++) {
        var option = _Object$keys[_i];
        this._options[option] = options[option];
      }

      return this;
    }
  }

  function width (width) {
    this._options.width = width;
    return this;
  }

  function height (height) {
    this._options.height = height;
    return this;
  }

  function scale (scale) {
    this._options.scale = scale;
    return this;
  }

  function fit (fit) {
    this._options.fit = fit;
    return this;
  }

  function attributer (callback) {
    this._attributer = callback;
    return this;
  }

  function engine (engine) {
    this._options.engine = engine;
    return this;
  }

  function images (path, width, height) {
    this._images.push({
      path: path,
      width: width,
      height: height
    });

    return this;
  }

  function keyMode (keyMode) {
    if (!this._keyModes.has(keyMode)) {
      throw Error('Illegal keyMode: ' + keyMode);
    }

    if (keyMode != this._options.keyMode && this._data != null) {
      throw Error('Too late to change keyMode');
    }

    this._options.keyMode = keyMode;
    return this;
  }

  function fade (enable) {
    this._options.fade = enable;
    return this;
  }

  function tweenPaths (enable) {
    this._options.tweenPaths = enable;
    return this;
  }

  function tweenShapes (enable) {
    this._options.tweenShapes = enable;

    if (enable) {
      this._options.tweenPaths = true;
    }

    return this;
  }

  function convertEqualSidedPolygons (enable) {
    this._options.convertEqualSidedPolygons = enable;
    return this;
  }

  function tweenPrecision (precision) {
    this._options.tweenPrecision = precision;
    return this;
  }

  function growEnteringEdges (enable) {
    this._options.growEnteringEdges = enable;
    return this;
  }

  function on (typenames, callback) {
    this._dispatch.on(typenames, callback);

    return this;
  }

  function onerror (callback) {
    this._onerror = callback;
    return this;
  }

  function logEvents (enable) {
    var _this = this;

    var t0 = Date.now();
    var times = {};
    var eventTypes = this._eventTypes;
    var maxEventTypeLength = Math.max.apply(Math, _toConsumableArray(eventTypes.map(function (eventType) {
      return eventType.length;
    })));

    var _loop = function _loop(i) {
      var eventType = eventTypes[i];
      times[eventType] = [];
      graphvizInstance = _this;

      _this.on(eventType + '.log', enable ? function () {
        var t = Date.now();
        var seqNo = times[eventType].length;
        times[eventType].push(t);
        var string = '';
        string += 'Event ';
        string += d3Format.format(' >2')(i) + ' ';
        string += eventType + ' '.repeat(maxEventTypeLength - eventType.length);
        string += d3Format.format(' >5')(t - t0) + ' ';

        if (eventType != 'initEnd') {
          string += d3Format.format(' >5')(t - times['start'][seqNo]);
        }

        if (eventType == 'dataProcessEnd') {
          string += ' prepare                 ' + d3Format.format(' >5')(t - times['layoutEnd'][seqNo]);
        }

        if (eventType == 'renderEnd' && graphvizInstance._transition) {
          string += ' transition start margin ' + d3Format.format(' >5')(graphvizInstance._transition.delay() - (t - times['renderStart'][seqNo]));
          expectedDelay = graphvizInstance._transition.delay();
          expectedDuration = graphvizInstance._transition.duration();
        }

        if (eventType == 'transitionStart') {
          var actualDelay = t - times['renderStart'][seqNo];
          string += ' transition delay        ' + d3Format.format(' >5')(t - times['renderStart'][seqNo]);
          string += ' expected ' + d3Format.format(' >5')(expectedDelay);
          string += ' diff ' + d3Format.format(' >5')(actualDelay - expectedDelay);
        }

        if (eventType == 'transitionEnd') {
          var actualDuration = t - times['transitionStart'][seqNo];
          string += ' transition duration     ' + d3Format.format(' >5')(actualDuration);
          string += ' expected ' + d3Format.format(' >5')(expectedDuration);
          string += ' diff ' + d3Format.format(' >5')(actualDuration - expectedDuration);
        }

        console.log(string);
        t0 = t;
      } : null);
    };

    for (var i = 0; i < eventTypes.length; i++) {
      var graphvizInstance;
      var expectedDelay;
      var expectedDuration;

      _loop(i);
    }

    return this;
  }

  function destroy () {
    delete this._selection.node().__graphviz__;

    if (this._worker) {
      this._workerPortClose();
    }

    return this;
  }

  function rotate(x, y, cosA, sinA) {
    // (x + j * y) * (cosA + j * sinA) = x * cosA - y * sinA + j * (x * sinA + y * cosA)
    y = -y;
    sinA = -sinA;
    var _ref = [x * cosA - y * sinA, x * sinA + y * cosA];
    x = _ref[0];
    y = _ref[1];
    y = -y;
    return [x, y];
  }

  function drawEdge(x1, y1, x2, y2, attributes) {
    var options = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : {};
    attributes = Object.assign({}, attributes);

    if (attributes.style && attributes.style.includes('invis')) {
      var newEdge = d3__namespace.select(null);
    } else {
      var root = this._selection;
      var svg = root.selectWithoutDataPropagation("svg");
      var graph0 = svg.selectWithoutDataPropagation("g");
      var newEdge0 = createEdge.call(this, attributes);
      var edgeData = extractAllElementsData(newEdge0);
      var newEdge = graph0.append('g').data([edgeData]);
      attributeElement.call(newEdge.node(), edgeData);

      _updateEdge.call(this, newEdge, x1, y1, x2, y2, attributes, options);
    }

    this._drawnEdge = {
      g: newEdge,
      x1: x1,
      y1: y1,
      x2: x2,
      y2: y2,
      attributes: attributes
    };
    return this;
  }
  function updateDrawnEdge(x1, y1, x2, y2) {
    var attributes = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : {};
    var options = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : {};

    if (!this._drawnEdge) {
      throw Error('No edge has been drawn');
    }

    var edge = this._drawnEdge.g;
    attributes = Object.assign(this._drawnEdge.attributes, attributes);
    this._drawnEdge.x1 = x1;
    this._drawnEdge.y1 = y1;
    this._drawnEdge.x2 = x2;
    this._drawnEdge.y2 = y2;

    if (edge.empty() && !(attributes.style && attributes.style.includes('invis'))) {
      var root = this._selection;
      var svg = root.selectWithoutDataPropagation("svg");
      var graph0 = svg.selectWithoutDataPropagation("g");
      var edge = graph0.append('g');
      this._drawnEdge.g = edge;
    }

    if (!edge.empty()) {
      _updateEdge.call(this, edge, x1, y1, x2, y2, attributes, options);
    }

    return this;
  }

  function _updateEdge(edge, x1, y1, x2, y2, attributes, options) {
    var newEdge = createEdge.call(this, attributes);
    var edgeData = extractAllElementsData(newEdge);
    edge.data([edgeData]);
    attributeElement.call(edge.node(), edgeData);

    _moveEdge(edge, x1, y1, x2, y2, attributes, options);
  }

  function _moveEdge(edge, x1, y1, x2, y2, attributes, options) {
    var shortening = options.shortening || 0;
    var arrowHeadLength = 10;
    var arrowHeadWidth = 7;
    var margin = 0.1;
    var arrowHeadPoints = [[0, -arrowHeadWidth / 2], [arrowHeadLength, 0], [0, arrowHeadWidth / 2], [0, -arrowHeadWidth / 2]];
    var dx = x2 - x1;
    var dy = y2 - y1;
    var length = Math.sqrt(dx * dx + dy * dy);

    if (length == 0) {
      var cosA = 1;
      var sinA = 0;
    } else {
      var cosA = dx / length;
      var sinA = dy / length;
    }

    x2 = x1 + (length - shortening - arrowHeadLength - margin) * cosA;
    y2 = y1 + (length - shortening - arrowHeadLength - margin) * sinA;

    if (attributes.URL || attributes.tooltip) {
      var a = edge.selectWithoutDataPropagation("g").selectWithoutDataPropagation("a");
      var line = a.selectWithoutDataPropagation("path");
      var arrowHead = a.selectWithoutDataPropagation("polygon");
    } else {
      var line = edge.selectWithoutDataPropagation("path");
      var arrowHead = edge.selectWithoutDataPropagation("polygon");
    }

    var path1 = d3Path.path();
    path1.moveTo(x1, y1);
    path1.lineTo(x2, y2);
    line.attr("d", path1);
    x2 = x1 + (length - shortening - arrowHeadLength) * cosA;
    y2 = y1 + (length - shortening - arrowHeadLength) * sinA;

    for (var i = 0; i < arrowHeadPoints.length; i++) {
      var point = arrowHeadPoints[i];
      arrowHeadPoints[i] = rotate(point[0], point[1], cosA, sinA);
    }

    for (var i = 0; i < arrowHeadPoints.length; i++) {
      var point = arrowHeadPoints[i];
      arrowHeadPoints[i] = [x2 + point[0], y2 + point[1]];
    }

    var allPoints = [];

    for (var i = 0; i < arrowHeadPoints.length; i++) {
      var point = arrowHeadPoints[i];
      allPoints.push(point.join(','));
    }

    var pointsAttr = allPoints.join(' ');
    arrowHead.attr("points", pointsAttr);
    return this;
  }

  function moveDrawnEdgeEndPoint(x2, y2) {
    var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

    if (!this._drawnEdge) {
      throw Error('No edge has been drawn');
    }

    var edge = this._drawnEdge.g;
    var x1 = this._drawnEdge.x1;
    var y1 = this._drawnEdge.y1;
    var attributes = this._drawnEdge.attributes;
    this._drawnEdge.x2 = x2;
    this._drawnEdge.y2 = y2;

    _moveEdge(edge, x1, y1, x2, y2, attributes, options);

    return this;
  }
  function removeDrawnEdge() {
    if (!this._drawnEdge) {
      return this;
    }

    var edge = this._drawnEdge.g;
    edge.remove();
    this._drawnEdge = null;
    return this;
  }
  function insertDrawnEdge(name) {
    if (!this._drawnEdge) {
      throw Error('No edge has been drawn');
    }

    var edge = this._drawnEdge.g;

    if (edge.empty()) {
      return this;
    }

    this._drawnEdge.attributes;
    var title = edge.selectWithoutDataPropagation("title");
    title.text(name);
    var root = this._selection;
    var svg = root.selectWithoutDataPropagation("svg");
    var graph0 = svg.selectWithoutDataPropagation("g");
    var graph0Datum = graph0.datum();

    var edgeData = this._extractData(edge, graph0Datum.children.length, graph0.datum());

    graph0Datum.children.push(edgeData);
    insertAllElementsData(edge, edgeData);
    this._drawnEdge = null;
    return this;
  }
  function drawnEdgeSelection() {
    if (this._drawnEdge) {
      return this._drawnEdge.g;
    } else {
      return d3__namespace.select(null);
    }
  }

  function createEdge(attributes) {
    var attributesString = '';

    for (var _i = 0, _Object$keys = Object.keys(attributes); _i < _Object$keys.length; _i++) {
      var name = _Object$keys[_i];

      if (attributes[name] != null) {
        attributesString += ' "' + name + '"="' + attributes[name] + '"';
      }
    }

    var dotSrc = 'digraph {a -> b [' + attributesString + ']}';
    var svgDoc = this.layoutSync(dotSrc, 'svg', 'dot');
    var parser = new window.DOMParser();
    var doc = parser.parseFromString(svgDoc, "image/svg+xml");
    var newDoc = d3__namespace.select(document.createDocumentFragment()).append(function () {
      return doc.documentElement;
    });
    var edge = newDoc.select('.edge');
    return edge;
  }

  function drawNode(x, y, nodeId) {
    var attributes = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
    var options = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : {};
    attributes = Object.assign({}, attributes);

    if (attributes.style && attributes.style.includes('invis')) {
      var newNode = d3__namespace.select(null);
    } else {
      var root = this._selection;
      var svg = root.selectWithoutDataPropagation("svg");
      var graph0 = svg.selectWithoutDataPropagation("g");
      var newNode0 = createNode.call(this, nodeId, attributes);
      var nodeData = extractAllElementsData(newNode0);
      var newNode = graph0.append('g').data([nodeData]);
      attributeElement.call(newNode.node(), nodeData);

      _updateNode.call(this, newNode, x, y, nodeId, attributes, options);
    }

    this._drawnNode = {
      g: newNode,
      nodeId: nodeId,
      x: x,
      y: y,
      attributes: attributes
    };
    return this;
  }
  function updateDrawnNode(x, y, nodeId) {
    var attributes = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
    var options = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : {};

    if (!this._drawnNode) {
      throw Error('No node has been drawn');
    }

    var node = this._drawnNode.g;

    if (nodeId == null) {
      nodeId = this._drawnNode.nodeId;
    }

    attributes = Object.assign(this._drawnNode.attributes, attributes);
    this._drawnNode.nodeId = nodeId;
    this._drawnNode.x = x;
    this._drawnNode.y = y;

    if (node.empty() && !(attributes.style && attributes.style.includes('invis'))) {
      var root = this._selection;
      var svg = root.selectWithoutDataPropagation("svg");
      var graph0 = svg.selectWithoutDataPropagation("g");
      var node = graph0.append('g');
      this._drawnNode.g = node;
    }

    if (!node.empty()) {
      _updateNode.call(this, node, x, y, nodeId, attributes, options);
    }

    return this;
  }

  function _updateNode(node, x, y, nodeId, attributes, options) {
    var newNode = createNode.call(this, nodeId, attributes);
    var nodeData = extractAllElementsData(newNode);
    node.data([nodeData]);
    attributeElement.call(node.node(), nodeData);

    _moveNode(node, x, y, attributes);

    return this;
  }

  function _moveNode(node, x, y, attributes, options) {
    if (attributes.URL || attributes.tooltip) {
      var subParent = node.selectWithoutDataPropagation("g").selectWithoutDataPropagation("a");
    } else {
      var subParent = node;
    }

    var svgElements = subParent.selectAll('ellipse,polygon,path,polyline');
    var text = node.selectWithoutDataPropagation("text");

    if (svgElements.size() != 0) {
      var bbox = svgElements.node().getBBox();
      bbox.cx = bbox.x + bbox.width / 2;
      bbox.cy = bbox.y + bbox.height / 2;
    } else if (text.size() != 0) {
      bbox = {
        x: +text.attr('x'),
        y: +text.attr('y'),
        width: 0,
        height: 0,
        cx: +text.attr('x'),
        cy: +text.attr('y')
      };
    }

    svgElements.each(function (data, index) {
      var svgElement = d3__namespace.select(this);

      if (svgElement.attr("cx")) {
        svgElement.attr("cx", roundTo2Decimals(x)).attr("cy", roundTo2Decimals(y));
      } else if (svgElement.attr("points")) {
        var pointsString = svgElement.attr('points').trim();
        svgElement.attr("points", translatePointsAttribute(pointsString, x - bbox.cx, y - bbox.cy));
      } else {
        var d = svgElement.attr('d');
        svgElement.attr("d", translateDAttribute(d, x - bbox.cx, y - bbox.cy));
      }
    });

    if (text.size() != 0) {
      text.attr("x", roundTo2Decimals(+text.attr("x") + x - bbox.cx)).attr("y", roundTo2Decimals(+text.attr("y") + y - bbox.cy));
    }

    return this;
  }

  function moveDrawnNode(x, y) {

    if (!this._drawnNode) {
      throw Error('No node has been drawn');
    }

    var node = this._drawnNode.g;
    var attributes = this._drawnNode.attributes;
    this._drawnNode.x = x;
    this._drawnNode.y = y;

    if (!node.empty()) {
      _moveNode(node, x, y, attributes);
    }

    return this;
  }
  function removeDrawnNode() {
    if (!this._drawnNode) {
      return this;
    }

    var node = this._drawnNode.g;

    if (!node.empty()) {
      node.remove();
    }

    this._drawnNode = null;
    return this;
  }
  function insertDrawnNode(nodeId) {
    if (!this._drawnNode) {
      throw Error('No node has been drawn');
    }

    if (nodeId == null) {
      nodeId = this._drawnNode.nodeId;
    }

    var node = this._drawnNode.g;

    if (node.empty()) {
      return this;
    }

    var attributes = this._drawnNode.attributes;
    var title = node.selectWithoutDataPropagation("title");
    title.text(nodeId);

    if (attributes.URL || attributes.tooltip) {
      var ga = node.selectWithoutDataPropagation("g");
      var a = ga.selectWithoutDataPropagation("a");
      a.selectWithoutDataPropagation('ellipse,polygon,path,polyline');
      var text = a.selectWithoutDataPropagation('text');
    } else {
      node.selectWithoutDataPropagation('ellipse,polygon,path,polyline');
      var text = node.selectWithoutDataPropagation('text');
    }

    text.text(attributes.label || nodeId);
    var root = this._selection;
    var svg = root.selectWithoutDataPropagation("svg");
    var graph0 = svg.selectWithoutDataPropagation("g");
    var graph0Datum = graph0.datum();

    var nodeData = this._extractData(node, graph0Datum.children.length, graph0.datum());

    graph0Datum.children.push(nodeData);
    insertAllElementsData(node, nodeData);
    this._drawnNode = null;
    return this;
  }
  function drawnNodeSelection() {
    if (this._drawnNode) {
      return this._drawnNode.g;
    } else {
      return d3__namespace.select(null);
    }
  }

  function createNode(nodeId, attributes) {
    var attributesString = '';

    for (var _i = 0, _Object$keys = Object.keys(attributes); _i < _Object$keys.length; _i++) {
      var name = _Object$keys[_i];

      if (attributes[name] != null) {
        attributesString += ' "' + name + '"="' + attributes[name] + '"';
      }
    }

    var dotSrc = 'graph {"' + nodeId + '" [' + attributesString + ']}';
    var svgDoc = this.layoutSync(dotSrc, 'svg', 'dot');
    var parser = new window.DOMParser();
    var doc = parser.parseFromString(svgDoc, "image/svg+xml");
    var newDoc = d3__namespace.select(document.createDocumentFragment()).append(function () {
      return doc.documentElement;
    });
    var node = newDoc.select('.node');
    return node;
  }

  /* This file is excluded from coverage because the intrumented code
   * translates "self" which gives a reference error.
   */

  /* istanbul ignore next */
  function workerCodeBody(port) {
    self.document = {}; // Workaround for "ReferenceError: document is not defined" in hpccWasm

    port.addEventListener('message', function (event) {
      var hpccWasm = self["@hpcc-js/wasm"];

      if (hpccWasm == undefined && event.data.vizURL) {
        importScripts(event.data.vizURL);
        hpccWasm = self["@hpcc-js/wasm"];
        hpccWasm.wasmFolder(event.data.vizURL.match(/.*\//)[0]); // This is an alternative workaround where wasmFolder() is not needed
        //                                    document = {currentScript: {src: event.data.vizURL}};
      }

      if (event.data.type == "version") {
        hpccWasm.graphvizVersion().then(function (version) {
          port.postMessage({
            type: "version",
            version: version
          });
        });
        return;
      }

      hpccWasm.graphviz.layout(event.data.dot, "svg", event.data.engine, event.data.options).then(function (svg) {
        if (svg) {
          port.postMessage({
            type: "done",
            svg: svg
          });
        } else if (event.data.vizURL) {
          port.postMessage({
            type: "init"
          });
        } else {
          port.postMessage({
            type: "skip"
          });
        }
      })["catch"](function (error) {
        port.postMessage({
          type: "error",
          error: error.message
        });
      });
    });
  }
  /* istanbul ignore next */

  function workerCode() {
    var port = self;
    workerCodeBody(port);
  }
  /* istanbul ignore next */

  function sharedWorkerCode() {
    self.onconnect = function (e) {
      var port = e.ports[0];
      workerCodeBody(port);
      port.start();
    };
  }

  var _graphviz$prototype;
  function Graphviz(selection, options) {
    var _this = this;

    this._options = {
      useWorker: true,
      useSharedWorker: false,
      engine: 'dot',
      keyMode: 'title',
      fade: true,
      tweenPaths: true,
      tweenShapes: true,
      convertEqualSidedPolygons: true,
      tweenPrecision: 1,
      growEnteringEdges: true,
      zoom: true,
      zoomScaleExtent: [0.1, 10],
      zoomTranslateExtent: [[-Infinity, -Infinity], [+Infinity, +Infinity]],
      width: null,
      height: null,
      scale: 1,
      fit: false
    };

    if (options instanceof Object) {
      for (var _i = 0, _Object$keys = Object.keys(options); _i < _Object$keys.length; _i++) {
        var option = _Object$keys[_i];
        this._options[option] = options[option];
      }
    } else if (typeof options == 'boolean') {
      this._options.useWorker = options;
    }

    var useWorker = this._options.useWorker;
    var useSharedWorker = this._options.useSharedWorker;

    if (typeof Worker == 'undefined') {
      useWorker = false;
    }

    if (typeof SharedWorker == 'undefined') {
      useSharedWorker = false;
    }

    if (useWorker || useSharedWorker) {
      var scripts = d3__namespace.selectAll('script');
      var vizScript = scripts.filter(function () {
        return d3__namespace.select(this).attr('type') == 'javascript/worker' || d3__namespace.select(this).attr('src') && d3__namespace.select(this).attr('src').match(/.*\/@hpcc-js\/wasm/);
      });

      if (vizScript.size() == 0) {
        console.warn('No script tag of type "javascript/worker" was found and "useWorker" is true. Not using web worker.');
        useWorker = false;
        useSharedWorker = false;
      } else {
        this._vizURL = vizScript.attr('src');

        if (!this._vizURL) {
          console.warn('No "src" attribute of was found on the "javascript/worker" script tag and "useWorker" is true. Not using web worker.');
          useWorker = false;
          useSharedWorker = false;
        }
      }
    }

    if (useSharedWorker) {
      var url = 'data:application/javascript;base64,' + btoa(workerCodeBody.toString() + '(' + sharedWorkerCode.toString() + ')()');
      this._worker = this._worker = new SharedWorker(url);
      this._workerPort = this._worker.port;
      this._workerPortClose = this._worker.port.close.bind(this._workerPort);

      this._worker.port.start();

      this._workerCallbacks = [];
    } else if (useWorker) {
      var blob = new Blob([workerCodeBody.toString() + '(' + workerCode.toString() + ')()']);
      var blobURL = window.URL.createObjectURL(blob);
      this._worker = new Worker(blobURL);
      this._workerPort = this._worker;
      this._workerPortClose = this._worker.terminate.bind(this._worker);
      this._workerCallbacks = [];
    } else {
      wasm.graphvizVersion().then(function (version) {
        _this._graphvizVersion = version;
      }.bind(this));
    }

    this._selection = selection;
    this._active = false;
    this._busy = false;
    this._jobs = [];
    this._queue = [];
    this._keyModes = new Set(['title', 'id', 'tag-index', 'index']);
    this._images = [];
    this._translation = undefined;
    this._scale = undefined;
    this._eventTypes = ['initEnd', 'start', 'layoutStart', 'layoutEnd', 'dataExtractEnd', 'dataProcessPass1End', 'dataProcessPass2End', 'dataProcessEnd', 'renderStart', 'renderEnd', 'transitionStart', 'transitionEnd', 'restoreEnd', 'end', 'zoom'];
    this._dispatch = d3Dispatch.dispatch.apply(void 0, _toConsumableArray(this._eventTypes));
    initViz.call(this);
    selection.node().__graphviz__ = this;
  }
  function graphviz(selector, options) {
    var g = d3__namespace.select(selector).graphviz(options);
    return g;
  }
  Graphviz.prototype = graphviz.prototype = (_graphviz$prototype = {
    constructor: Graphviz,
    engine: engine,
    addImage: images,
    keyMode: keyMode,
    fade: fade,
    tweenPaths: tweenPaths,
    tweenShapes: tweenShapes,
    convertEqualSidedPolygons: convertEqualSidedPolygons,
    tweenPrecision: tweenPrecision,
    growEnteringEdges: growEnteringEdges,
    zoom: zoom,
    resetZoom: resetZoom,
    zoomBehavior: zoomBehavior,
    zoomSelection: zoomSelection,
    zoomScaleExtent: zoomScaleExtent,
    zoomTranslateExtent: zoomTranslateExtent,
    render: render,
    layout: layout,
    dot: dot,
    data: data,
    renderDot: renderDot,
    transition: transition,
    active: active,
    options: options,
    width: width,
    height: height,
    scale: scale,
    fit: fit,
    attributer: attributer,
    on: on,
    onerror: onerror,
    logEvents: logEvents,
    destroy: destroy,
    drawEdge: drawEdge,
    updateDrawnEdge: updateDrawnEdge,
    moveDrawnEdgeEndPoint: moveDrawnEdgeEndPoint,
    insertDrawnEdge: insertDrawnEdge,
    removeDrawnEdge: removeDrawnEdge
  }, _defineProperty(_graphviz$prototype, "removeDrawnEdge", removeDrawnEdge), _defineProperty(_graphviz$prototype, "drawnEdgeSelection", drawnEdgeSelection), _defineProperty(_graphviz$prototype, "drawnEdgeSelection", drawnEdgeSelection), _defineProperty(_graphviz$prototype, "drawNode", drawNode), _defineProperty(_graphviz$prototype, "updateDrawnNode", updateDrawnNode), _defineProperty(_graphviz$prototype, "moveDrawnNode", moveDrawnNode), _defineProperty(_graphviz$prototype, "insertDrawnNode", insertDrawnNode), _defineProperty(_graphviz$prototype, "removeDrawnNode", removeDrawnNode), _defineProperty(_graphviz$prototype, "removeDrawnNode", removeDrawnNode), _defineProperty(_graphviz$prototype, "drawnNodeSelection", drawnNodeSelection), _defineProperty(_graphviz$prototype, "drawnNodeSelection", drawnNodeSelection), _defineProperty(_graphviz$prototype, "graphvizVersion", graphvizVersion), _graphviz$prototype);

  function selection_graphviz (options) {
    var g = this.node().__graphviz__;

    if (g) {
      g.options(options); // Ensure a possible new initEnd event handler is attached before calling it

      d3Timer.timeout(function () {
        g._dispatch.call("initEnd", this);
      }.bind(this), 0);
    } else {
      g = new Graphviz(this, options);
    }

    return g;
  }

  function selection_selectWithoutDataPropagation (name) {
    return d3__namespace.select(this.size() > 0 ? this.node().querySelector(name) : null);
  }

  d3.selection.prototype.graphviz = selection_graphviz;
  d3.selection.prototype.selectWithoutDataPropagation = selection_selectWithoutDataPropagation;

  exports.graphviz = graphviz;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=d3-graphviz.js.map
