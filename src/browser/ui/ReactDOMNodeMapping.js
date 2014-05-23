/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactDOMNodeMapping
 */

"use strict";

var DOMProperty = require('DOMProperty');
var ExecutionEnvironment = require('ExecutionEnvironment');
var ReactDOMNodeHandle = require('ReactDOMNodeHandle');

var ReactDOMNodeHandleMapping = require('ReactDOMNodeHandleMapping');
var ReactDOMNodeHandleTypes = require('ReactDOMNodeHandleTypes');
var ReactEventEmitter = require('ReactEventEmitter');
var ReactInstanceHandles = require('ReactInstanceHandles');

var containsNode = require('containsNode');
var invariant = require('invariant');

var SEPARATOR = ReactInstanceHandles.SEPARATOR;

var ATTR_NAME = DOMProperty.ID_ATTRIBUTE_NAME;
var nodeCache = {};

var ELEMENT_NODE_TYPE = 1;
var DOC_NODE_TYPE = 9;

var idSeed = 0;
// Like getElementById(), except supports elements not in the document.
var reactContainers = {};

/** Mapping from reactRootID to `container` nodes. */
var containersByReactRootID = {};

function registerContainerDOMNode(domNode) {
  reactContainers[domNode.id] = domNode;
}

// Used to store breadth-first search state in findComponentRoot.
var findComponentRootReusableArray = [];

if (__DEV__) {
  /** __DEV__-only mapping from reactRootID to root elements. */
  var rootElementsByReactRootID = {};
}

function getReactRootID(container) {
  return getID(container.firstChild);
}

/**
 * Accessing node[ATTR_NAME] or calling getAttribute(ATTR_NAME) on a form
 * element can return its control whose name or ID equals ATTR_NAME. All
 * DOM nodes support `getAttributeNode` but this can also get called on
 * other objects so just return '' if we're given something other than a
 * DOM node (such as window).
 *
 * @param {?DOMElement|DOMWindow|DOMDocument|DOMTextNode} node DOM node.
 * @return {string} ID of the supplied `domNode`.
 */
function getID(node) {
  var id = internalGetID(node);
  if (id) {
    if (nodeCache.hasOwnProperty(id)) {
      var cached = nodeCache[id];
      if (cached !== node) {
        invariant(
          !isValid(cached, id),
          'ReactDOMNodeMapping: Two valid but unequal nodes with the same `%s`: %s',
          ATTR_NAME, id
        );

        nodeCache[id] = node;
      }
    } else {
      nodeCache[id] = node;
    }
  }

  return id;
}

function internalGetID(node) {
  // If node is something like a window, document, or text node, none of
  // which support attributes or a .getAttribute method, gracefully return
  // the empty string, as if the attribute were missing.
  return node && node.getAttribute && node.getAttribute(ATTR_NAME) || '';
}

/**
 * Sets the React-specific ID of the given node.
 *
 * @param {DOMElement} node The DOM node whose ID will be set.
 * @param {string} id The value of the ID attribute.
 */
function setID(node, id) {
  var oldID = internalGetID(node);
  if (oldID !== id) {
    delete nodeCache[oldID];
  }
  node.setAttribute(ATTR_NAME, id);
  nodeCache[id] = node;
}

/**
 * Finds the node with the supplied React-generated DOM ID.
 *
 * @param {string} id A React-generated DOM ID.
 * @return {DOMElement} DOM node with the suppled `id`.
 * @internal
 */
function getNode(id) {
  if (!nodeCache.hasOwnProperty(id) || !isValid(nodeCache[id], id)) {
    nodeCache[id] = ReactDOMNodeMapping.findReactNodeByID(id);
  }
  return nodeCache[id];
}

/**
 * A node is "valid" if it is contained by a currently mounted container.
 *
 * This means that the node does not have to be contained by a document in
 * order to be considered valid.
 *
 * @param {?DOMElement} node The candidate DOM node.
 * @param {string} id The expected ID of the node.
 * @return {boolean} Whether the node is contained by a mounted container.
 */
function isValid(node, id) {
  if (node) {
    invariant(
      internalGetID(node) === id,
      'ReactDOMNodeMapping: Unexpected modification of `%s`',
      ATTR_NAME
    );

    var container = ReactDOMNodeMapping.findReactContainerForID(id);
    if (container && containsNode(container, node)) {
      return true;
    }
  }

  return false;
}

/**
 * Causes the cache to forget about one React-specific ID.
 *
 * @param {string} id The ID to forget.
 */
function purgeID(id) {
  delete nodeCache[id];
}

var deepestNodeSoFar = null;
function findDeepestCachedAncestorImpl(ancestorID) {
  var ancestor = nodeCache[ancestorID];
  if (ancestor && isValid(ancestor, ancestorID)) {
    deepestNodeSoFar = ancestor;
  } else {
    // This node isn't populated in the cache, so presumably none of its
    // descendants are. Break out of the loop.
    return false;
  }
}

/**
 * Return the deepest cached node whose ID is a prefix of `targetID`.
 */
function findDeepestCachedAncestor(targetID) {
  deepestNodeSoFar = null;
  ReactInstanceHandles.traverseAncestors(
    targetID,
    findDeepestCachedAncestorImpl
  );

  var foundNode = deepestNodeSoFar;
  deepestNodeSoFar = null;
  return foundNode;
}

/**
 * Mounting is the process of initializing a React component by creatings its
 * representative DOM elements and inserting them into a supplied `container`.
 * Any prior content inside `container` is destroyed in the process.
 *
 *   ReactMount.renderComponent(
 *     component,
 *     document.getElementById('container')
 *   );
 *
 *   <div id="container">                   <-- Supplied `container`.
 *     <div data-reactid=".3">              <-- Rendered reactRoot of React
 *       // ...                                 component.
 *     </div>
 *   </div>
 *
 * Inside of `container`, the first element rendered is the "reactRoot".
 */
var ReactDOMNodeMapping = {
  /** Time spent generating markup. */
  totalInstantiationTime: 0,

  /** Time spent inserting markup into the DOM. */
  totalInjectionTime: 0,

  /** Whether support for touch events should be initialized. */
  useTouchEvents: false,

  getReactRootElementInContainer: function(container) {
    if (!container) {
      return null;
    }

    if (container.nodeType === DOC_NODE_TYPE) {
      return container.documentElement;
    } else {
      return container.firstChild;
    }
  },

  /**
   * Register a component into the instance map and starts scroll value
   * monitoring
   * @param {ReactComponent} nextComponent component instance to render
   * @param {DOMElement} container container to render into
   * @return {string} reactRoot ID prefix
   */
  registerComponentInContainer: function(reactRootID, containerHandle) {
    var container = ReactDOMNodeMapping.resolveDOMNodeHandle(containerHandle);

    invariant(
      container && (
        container.nodeType === ELEMENT_NODE_TYPE ||
        container.nodeType === DOC_NODE_TYPE
      ),
      '_registerComponent(...): Target container is not a DOM element.'
    );

    ReactEventEmitter.ensureScrollValueMonitoring();

    containersByReactRootID[reactRootID] = container;
    return reactRootID;
  },

  /**
   * Finds the container DOM element that contains React component to which the
   * supplied DOM `id` belongs.
   *
   * @param {string} id The ID of an element rendered by a React component.
   * @return {?DOMElement} DOM element that contains the `id`.
   */
  findReactContainerForID: function(id) {
    var reactRootID = ReactInstanceHandles.getReactRootIDFromNodeID(id);
    var container = containersByReactRootID[reactRootID];

    if (__DEV__) {
      var rootElement = rootElementsByReactRootID[reactRootID];
      if (rootElement && rootElement.parentNode !== container) {
        invariant(
          // Call internalGetID here because getID calls isValid which calls
          // findReactContainerForID (this function).
          internalGetID(rootElement) === reactRootID,
          'ReactDOMNodeMapping: Root element ID differed from reactRootID.'
        );

        var containerChild = container.firstChild;
        if (containerChild &&
            reactRootID === internalGetID(containerChild)) {
          // If the container has a new child with the same ID as the old
          // root element, then rootElementsByReactRootID[reactRootID] is
          // just stale and needs to be updated. The case that deserves a
          // warning is when the container is empty.
          rootElementsByReactRootID[reactRootID] = containerChild;
        } else {
          console.warn(
            'ReactDOMNodeMapping: Root element has been removed from its original ' +
            'container. New container:', rootElement.parentNode
          );
        }
      }
    }

    return container;
  },

  /**
   * Finds an element rendered by React with the supplied ID.
   *
   * @param {string} id ID of a DOM node in the React component.
   * @return {DOMElement} Root DOM node of the React component.
   */
  findReactNodeByID: function(id) {
    var reactRoot = ReactDOMNodeMapping.findReactContainerForID(id);
    return ReactDOMNodeMapping.findComponentRoot(reactRoot, id);
  },

  /**
   * True if the supplied `node` is rendered by React.
   *
   * @param {*} node DOM Element to check.
   * @return {boolean} True if the DOM Element appears to be rendered by React.
   * @internal
   */
  isRenderedByReact: function(node) {
    if (node.nodeType !== 1) {
      // Not a DOMElement, therefore not a React component
      return false;
    }
    var id = ReactDOMNodeMapping.getID(node);
    return id ? id.charAt(0) === SEPARATOR : false;
  },

  /**
   * Traverses up the ancestors of the supplied node to find a node that is a
   * DOM representation of a React component.
   *
   * @param {*} node
   * @return {?DOMEventTarget}
   * @internal
   */
  getFirstReactDOM: function(node) {
    var current = node;
    while (current && current.parentNode !== current) {
      if (ReactDOMNodeMapping.isRenderedByReact(current)) {
        return current;
      }
      current = current.parentNode;
    }
    return null;
  },

  /**
   * Finds a node with the supplied `targetID` inside of the supplied
   * `ancestorNode`.  Exploits the ID naming scheme to perform the search
   * quickly.
   *
   * @param {DOMEventTarget} ancestorNode Search from this root.
   * @pararm {string} targetID ID of the DOM representation of the component.
   * @return {DOMEventTarget} DOM node with the supplied `targetID`.
   * @internal
   */
  findComponentRoot: function(ancestorNode, targetID) {
    var firstChildren = findComponentRootReusableArray;
    var childIndex = 0;

    var deepestAncestor = findDeepestCachedAncestor(targetID) || ancestorNode;

    firstChildren[0] = deepestAncestor.firstChild;
    firstChildren.length = 1;

    while (childIndex < firstChildren.length) {
      var child = firstChildren[childIndex++];
      var targetChild;

      while (child) {
        var childID = ReactDOMNodeMapping.getID(child);
        if (childID) {
          // Even if we find the node we're looking for, we finish looping
          // through its siblings to ensure they're cached so that we don't have
          // to revisit this node again. Otherwise, we make n^2 calls to getID
          // when visiting the many children of a single node in order.

          if (targetID === childID) {
            targetChild = child;
          } else if (ReactInstanceHandles.isAncestorIDOf(childID, targetID)) {
            // If we find a child whose ID is an ancestor of the given ID,
            // then we can be sure that we only want to search the subtree
            // rooted at this child, so we can throw out the rest of the
            // search state.
            firstChildren.length = childIndex = 0;
            firstChildren.push(child.firstChild);
          }

        } else {
          // If this child had no ID, then there's a chance that it was
          // injected automatically by the browser, as when a `<table>`
          // element sprouts an extra `<tbody>` child as a side effect of
          // `.innerHTML` parsing. Optimistically continue down this
          // branch, but not before examining the other siblings.
          firstChildren.push(child.firstChild);
        }

        child = child.nextSibling;
      }

      if (targetChild) {
        // Emptying firstChildren/findComponentRootReusableArray is
        // not necessary for correctness, but it helps the GC reclaim
        // any nodes that were left at the end of the search.
        firstChildren.length = 0;

        return targetChild;
      }
    }

    firstChildren.length = 0;

    invariant(
      false,
      'findComponentRoot(..., %s): Unable to find element. This probably ' +
      'means the DOM was unexpectedly mutated (e.g., by the browser), ' +
      'usually due to forgetting a <tbody> when using tables or nesting <p> ' +
      'or <a> tags. Try inspecting the child nodes of the element with React ' +
      'ID `%s`.',
      targetID,
      ReactDOMNodeMapping.getID(ancestorNode)
    );
  },

  // Called remotely
  unmountComponentAtHandle: function(containerHandle) {
    ReactDOMNodeMapping.unmountComponentAtNode(
      ReactDOMNodeMapping.resolveDOMNodeHandle(containerHandle)
    );
  },

  /**
   * Unmounts and destroys the React component rendered in the `container`.
   *
   * @param {DOMElement} container DOM element containing a React component.
   * @return {boolean} True if a component was found in and unmounted from
   *                   `container`
   */
  unmountComponentAtNode: function(container) {
    invariant(
      container && (
        container.nodeType === ELEMENT_NODE_TYPE ||
        container.nodeType === DOC_NODE_TYPE
      ),
      'unmountComponentAtNode(...): Target container is not a DOM element.'
    );

    var containerHandle = ReactDOMNodeMapping.getHandleForContainer(container);
    delete reactContainers[containerHandle.id];

    var reactRootID = ReactDOMNodeHandleMapping.unmountComponentAtNode(containerHandle);
    if (__DEV__) {
      delete rootElementsByReactRootID[reactRootID];
    }
    if (reactRootID) {
      delete containersByReactRootID[reactRootID]
      ReactDOMNodeMapping._unmountNode(container);
    }
  },

  /**
   * Unmounts a component and removes it from the DOM.
   *
   * @param {ReactComponent} instance React component instance.
   * @param {DOMElement} container DOM element to unmount from.
   * @final
   * @internal
   * @see {ReactDOMNodeMapping.unmountComponentAtNode}
   */
  _unmountNode: function(container) {
    if (container.nodeType === DOC_NODE_TYPE) {
      container = container.documentElement;
    }

    // http://jsperf.com/emptying-a-node
    while (container.lastChild) {
      container.removeChild(container.lastChild);
    }
  },

  getInstanceFromContainer: function(container) {
    invariant(
      container && (
        container.nodeType === ELEMENT_NODE_TYPE ||
        container.nodeType === DOC_NODE_TYPE
      ),
      'getInstanceFromContainer(...): Target container is not a DOM element.'
    );

    return ReactDOMNodeHandleMapping.getInstanceFromContainer(
      ReactDOMNodeMapping.getHandleForContainer(container)
    );
  },

  recordRootElementForTransplantWarning: function(container) {
    if (__DEV__) {
      // Record the root element in case it later gets transplanted.
      rootElementsByReactRootID[getReactRootID(container)] =
        ReactDOMNodeMapping.getReactRootElementInContainer(container);
    }
  },

  resolveDOMNodeHandle: function(handle) {
    invariant(
      ExecutionEnvironment.canUseDOM,
      'Cannot resolveHandle() in a worker!'
    );


    if (handle.type === ReactDOMNodeHandleTypes.REACT_ID_TOP_LEVEL) {
      var container = ReactDOMNodeMapping.findReactContainerForID(handle.reactID);
      if (container) {
        return container.nodeType === ELEMENT_NODE_TYPE ?
          container.ownerDocument :
          container;
      }
      return null;
    } else if (handle.type === ReactDOMNodeHandleTypes.REACT_ID) {
      return ReactDOMNodeMapping.getNode(handle.reactID);
    } else {
      invariant(
        handle.type === ReactDOMNodeHandleTypes.CONTAINER,
        'Invalid handle type: %s',
        handle.type
      );
      var container = reactContainers[handle.id];
      if (!container) {
        container = reactContainers[handle.id] = document.getElementById(
          handle.id
        );
      }
      return container;
    }
  },

  getHandleForContainer: function(domNode) {
    if (!domNode.id) {
      domNode.id = '.rC_'  + (idSeed++);
    }
    
    registerContainerDOMNode(domNode);

    return ReactDOMNodeHandle.getHandleForContainerID(domNode.id);
  },

  // Called remotely; see ReactDOMNodeMappingRemote
  registerContainerHandle: function(handle) {
    var domNode = ReactDOMNodeMapping.resolveDOMNodeHandle(handle);
    registerContainerDOMNode(domNode);
  },

  /**
   * React ID utilities.
   */

  getReactRootID: getReactRootID,

  getID: getID,

  setID: setID,

  getNode: getNode,

  purgeID: purgeID
};

module.exports = ReactDOMNodeMapping;
