/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {DOMEventName} from '../events/DOMEventNames';
import type {Fiber, FiberRoot} from 'react-reconciler/src/ReactInternalTypes';
import type {
  BoundingRect,
  IntersectionObserverOptions,
  ObserveVisibleRectsCallback,
} from 'react-reconciler/src/ReactTestSelectors';
import type {ReactScopeInstance} from 'shared/ReactTypes';

import {
  precacheFiberNode,
  updateFiberProps,
  getClosestInstanceFromNode,
  getFiberFromScopeInstance,
  getInstanceFromNode as getInstanceFromNodeDOMTree,
  isContainerMarkedAsRoot,
} from './ReactDOMComponentTree';
export {detachDeletedInstance} from './ReactDOMComponentTree';
import {hasRole} from './DOMAccessibilityRoles';
import {
  createElement,
  createTextNode,
  setInitialProperties,
  diffProperties,
  updateProperties,
  resetProperties,
  diffHydratedProperties,
  diffHydratedText,
  trapClickOnNonInteractiveElement,
  checkForUnmatchedText,
  warnForDeletedHydratableElement,
  warnForDeletedHydratableText,
  warnForInsertedHydratedElement,
  warnForInsertedHydratedText,
  getOwnerDocumentFromRootContainer,
} from './ReactDOMComponent';
import {getSelectionInformation, restoreSelection} from './ReactInputSelection';
import setTextContent from './setTextContent';
import {validateDOMNesting, updatedAncestorInfo} from './validateDOMNesting';
import {
  isEnabled as ReactBrowserEventEmitterIsEnabled,
  setEnabled as ReactBrowserEventEmitterSetEnabled,
  getEventPriority,
} from '../events/ReactDOMEventListener';
import {getChildNamespace} from '../shared/DOMNamespaces';
import {
  ELEMENT_NODE,
  TEXT_NODE,
  COMMENT_NODE,
  DOCUMENT_NODE,
  DOCUMENT_FRAGMENT_NODE,
} from '../shared/HTMLNodeType';
import dangerousStyleValue from '../shared/dangerousStyleValue';

import {retryIfBlockedOn} from '../events/ReactDOMEventReplaying';

import {
  enableCreateEventHandleAPI,
  enableScopeAPI,
  enableFloat,
  enableHostSingletons,
} from 'shared/ReactFeatureFlags';
import {
  HostComponent,
  HostSingleton,
  HostText,
  HostPortal,
  HostRoot,
} from 'react-reconciler/src/ReactWorkTags';
import {listenToAllSupportedEvents} from '../events/DOMPluginEventSystem';

import {DefaultEventPriority} from 'react-reconciler/src/ReactEventPriorities';

// TODO: Remove this deep import when we delete the legacy root API
import {ConcurrentMode, NoMode} from 'react-reconciler/src/ReactTypeOfMode';

export type Type = string;
export type Props = {
  autoFocus?: boolean,
  children?: mixed,
  disabled?: boolean,
  hidden?: boolean,
  suppressHydrationWarning?: boolean,
  dangerouslySetInnerHTML?: mixed,
  style?: {display?: string, ...},
  bottom?: null | number,
  left?: null | number,
  right?: null | number,
  top?: null | number,
  ...
};
export type EventTargetChildElement = {
  type: string,
  props: null | {
    style?: {
      position?: string,
      zIndex?: number,
      bottom?: string,
      left?: string,
      right?: string,
      top?: string,
      ...
    },
    ...
  },
  ...
};
export type Container =
  | (Element & {_reactRootContainer?: FiberRoot, ...})
  | (Document & {_reactRootContainer?: FiberRoot, ...})
  | (DocumentFragment & {_reactRootContainer?: FiberRoot, ...});
export type Instance = Element;
export type InstanceSibling = Node;
export type TextInstance = Text;
export type SuspenseInstance = Comment & {_reactRetry?: () => void, ...};
export type HydratableInstance = Instance | TextInstance | SuspenseInstance;
export type PublicInstance = Element | Text;
type HostContextDev = {
  namespace: string,
  ancestorInfo: mixed,
  ...
};
type HostContextProd = string;
export type HostContext = HostContextDev | HostContextProd;
export type UpdatePayload = Array<mixed>;
export type ChildSet = void; // Unused
export type TimeoutHandle = TimeoutID;
export type NoTimeout = -1;
export type RendererInspectionConfig = $ReadOnly<{||}>;

type SelectionInformation = {|
  focusedElem: null | HTMLElement,
  selectionRange: mixed,
|};

const SUPPRESS_HYDRATION_WARNING = 'suppressHydrationWarning';

const SUSPENSE_START_DATA = '$';
const SUSPENSE_END_DATA = '/$';
const SUSPENSE_PENDING_START_DATA = '$?';
const SUSPENSE_FALLBACK_START_DATA = '$!';

const STYLE = 'style';

let eventsEnabled: ?boolean = null;
let selectionInformation: null | SelectionInformation = null;

export * from 'react-reconciler/src/ReactFiberHostConfigWithNoPersistence';

export function getRootHostContext(
  rootContainerInstance: Container,
): HostContext {
  let type;
  let namespace;
  const nodeType = rootContainerInstance.nodeType;
  switch (nodeType) {
    case DOCUMENT_NODE:
    case DOCUMENT_FRAGMENT_NODE: {
      type = nodeType === DOCUMENT_NODE ? '#document' : '#fragment';
      const root = (rootContainerInstance: any).documentElement;
      namespace = root ? root.namespaceURI : getChildNamespace(null, '');
      break;
    }
    default: {
      const container: any =
        nodeType === COMMENT_NODE
          ? rootContainerInstance.parentNode
          : rootContainerInstance;
      const ownNamespace = container.namespaceURI || null;
      type = container.tagName;
      namespace = getChildNamespace(ownNamespace, type);
      break;
    }
  }
  if (__DEV__) {
    const validatedTag = type.toLowerCase();
    const ancestorInfo = updatedAncestorInfo(null, validatedTag);
    return {namespace, ancestorInfo};
  }
  return namespace;
}

export function getChildHostContext(
  parentHostContext: HostContext,
  type: string,
): HostContext {
  if (__DEV__) {
    const parentHostContextDev = ((parentHostContext: any): HostContextDev);
    const namespace = getChildNamespace(parentHostContextDev.namespace, type);
    const ancestorInfo = updatedAncestorInfo(
      parentHostContextDev.ancestorInfo,
      type,
    );
    return {namespace, ancestorInfo};
  }
  const parentNamespace = ((parentHostContext: any): HostContextProd);
  return getChildNamespace(parentNamespace, type);
}

export function getPublicInstance(instance: Instance): * {
  return instance;
}

export function prepareForCommit(containerInfo: Container): Object | null {
  eventsEnabled = ReactBrowserEventEmitterIsEnabled();
  selectionInformation = getSelectionInformation();
  let activeInstance = null;
  if (enableCreateEventHandleAPI) {
    const focusedElem = selectionInformation.focusedElem;
    if (focusedElem !== null) {
      activeInstance = getClosestInstanceFromNode(focusedElem);
    }
  }
  ReactBrowserEventEmitterSetEnabled(false);
  return activeInstance;
}

export function beforeActiveInstanceBlur(internalInstanceHandle: Object): void {
  if (enableCreateEventHandleAPI) {
    ReactBrowserEventEmitterSetEnabled(true);
    dispatchBeforeDetachedBlur(
      (selectionInformation: any).focusedElem,
      internalInstanceHandle,
    );
    ReactBrowserEventEmitterSetEnabled(false);
  }
}

export function afterActiveInstanceBlur(): void {
  if (enableCreateEventHandleAPI) {
    ReactBrowserEventEmitterSetEnabled(true);
    dispatchAfterDetachedBlur((selectionInformation: any).focusedElem);
    ReactBrowserEventEmitterSetEnabled(false);
  }
}

export function resetAfterCommit(containerInfo: Container): void {
  restoreSelection(selectionInformation);
  ReactBrowserEventEmitterSetEnabled(eventsEnabled);
  eventsEnabled = null;
  selectionInformation = null;
}

export function createInstance(
  type: string,
  props: Props,
  rootContainerInstance: Container,
  hostContext: HostContext,
  internalInstanceHandle: Object,
): Instance {
  let parentNamespace: string;
  if (__DEV__) {
    // TODO: take namespace into account when validating.
    const hostContextDev = ((hostContext: any): HostContextDev);
    validateDOMNesting(type, null, hostContextDev.ancestorInfo);
    if (
      typeof props.children === 'string' ||
      typeof props.children === 'number'
    ) {
      const string = '' + props.children;
      const ownAncestorInfo = updatedAncestorInfo(
        hostContextDev.ancestorInfo,
        type,
      );
      validateDOMNesting(null, string, ownAncestorInfo);
    }
    parentNamespace = hostContextDev.namespace;
  } else {
    parentNamespace = ((hostContext: any): HostContextProd);
  }
  const domElement: Instance = createElement(
    type,
    props,
    rootContainerInstance,
    parentNamespace,
  );
  precacheFiberNode(internalInstanceHandle, domElement);
  updateFiberProps(domElement, props);
  return domElement;
}

export function appendInitialChild(
  parentInstance: Instance,
  child: Instance | TextInstance,
): void {
  parentInstance.appendChild(child);
}

export function finalizeInitialChildren(
  domElement: Instance,
  type: string,
  props: Props,
  hostContext: HostContext,
): boolean {
  setInitialProperties(domElement, type, props);
  switch (type) {
    case 'button':
    case 'input':
    case 'select':
    case 'textarea':
      return !!props.autoFocus;
    case 'img':
      return true;
    default:
      return false;
  }
}

export function prepareUpdate(
  domElement: Instance,
  type: string,
  oldProps: Props,
  newProps: Props,
  hostContext: HostContext,
): null | Array<mixed> {
  if (__DEV__) {
    const hostContextDev = ((hostContext: any): HostContextDev);
    if (
      typeof newProps.children !== typeof oldProps.children &&
      (typeof newProps.children === 'string' ||
        typeof newProps.children === 'number')
    ) {
      const string = '' + newProps.children;
      const ownAncestorInfo = updatedAncestorInfo(
        hostContextDev.ancestorInfo,
        type,
      );
      validateDOMNesting(null, string, ownAncestorInfo);
    }
  }
  return diffProperties(domElement, type, oldProps, newProps);
}

export function shouldSetTextContent(type: string, props: Props): boolean {
  return (
    type === 'textarea' ||
    type === 'noscript' ||
    typeof props.children === 'string' ||
    typeof props.children === 'number' ||
    (typeof props.dangerouslySetInnerHTML === 'object' &&
      props.dangerouslySetInnerHTML !== null &&
      props.dangerouslySetInnerHTML.__html != null)
  );
}

export function createTextInstance(
  text: string,
  rootContainerInstance: Container,
  hostContext: HostContext,
  internalInstanceHandle: Object,
): TextInstance {
  if (__DEV__) {
    const hostContextDev = ((hostContext: any): HostContextDev);
    validateDOMNesting(null, text, hostContextDev.ancestorInfo);
  }
  const textNode: TextInstance = createTextNode(text, rootContainerInstance);
  precacheFiberNode(internalInstanceHandle, textNode);
  return textNode;
}

export function getCurrentEventPriority(): * {
  const currentEvent = window.event;
  if (currentEvent === undefined) {
    return DefaultEventPriority;
  }
  return getEventPriority(currentEvent.type);
}

export const isPrimaryRenderer = true;
export const warnsIfNotActing = true;
// This initialization code may run even on server environments
// if a component just imports ReactDOM (e.g. for findDOMNode).
// Some environments might not have setTimeout or clearTimeout.
export const scheduleTimeout: any =
  typeof setTimeout === 'function' ? setTimeout : (undefined: any);
export const cancelTimeout: any =
  typeof clearTimeout === 'function' ? clearTimeout : (undefined: any);
export const noTimeout = -1;
const localPromise = typeof Promise === 'function' ? Promise : undefined;

export function getInstanceFromNode(node: HTMLElement): null | Object {
  return getClosestInstanceFromNode(node) || null;
}

export function preparePortalMount(portalInstance: Instance): void {
  listenToAllSupportedEvents(portalInstance);
}

export function prepareScopeUpdate(
  scopeInstance: ReactScopeInstance,
  internalInstanceHandle: Object,
): void {
  if (enableScopeAPI) {
    precacheFiberNode(internalInstanceHandle, scopeInstance);
  }
}

export function getInstanceFromScope(
  scopeInstance: ReactScopeInstance,
): null | Object {
  if (enableScopeAPI) {
    return getFiberFromScopeInstance(scopeInstance);
  }
  return null;
}

// -------------------
//     Microtasks
// -------------------
export const supportsMicrotasks = true;
export const scheduleMicrotask: any =
  typeof queueMicrotask === 'function'
    ? queueMicrotask
    : typeof localPromise !== 'undefined'
    ? callback =>
        localPromise
          .resolve(null)
          .then(callback)
          .catch(handleErrorInNextTick)
    : scheduleTimeout; // TODO: Determine the best fallback here.

function handleErrorInNextTick(error) {
  setTimeout(() => {
    throw error;
  });
}

// -------------------
//     Mutation
// -------------------

export const supportsMutation = true;

export function commitMount(
  domElement: Instance,
  type: string,
  newProps: Props,
  internalInstanceHandle: Object,
): void {
  // Despite the naming that might imply otherwise, this method only
  // fires if there is an `Update` effect scheduled during mounting.
  // This happens if `finalizeInitialChildren` returns `true` (which it
  // does to implement the `autoFocus` attribute on the client). But
  // there are also other cases when this might happen (such as patching
  // up text content during hydration mismatch). So we'll check this again.
  switch (type) {
    case 'button':
    case 'input':
    case 'select':
    case 'textarea':
      if (newProps.autoFocus) {
        ((domElement: any):
          | HTMLButtonElement
          | HTMLInputElement
          | HTMLSelectElement
          | HTMLTextAreaElement).focus();
      }
      return;
    case 'img': {
      if ((newProps: any).src) {
        ((domElement: any): HTMLImageElement).src = (newProps: any).src;
      }
      return;
    }
  }
}

export function commitUpdate(
  domElement: Instance,
  updatePayload: Array<mixed>,
  type: string,
  oldProps: Props,
  newProps: Props,
  internalInstanceHandle: Object,
): void {
  // Apply the diff to the DOM node.
  updateProperties(domElement, updatePayload, type, oldProps, newProps);
  // Update the props handle so that we know which props are the ones with
  // with current event handlers.
  updateFiberProps(domElement, newProps);
}

export function resetTextContent(domElement: Instance): void {
  setTextContent(domElement, '');
}

export function commitTextUpdate(
  textInstance: TextInstance,
  oldText: string,
  newText: string,
): void {
  textInstance.nodeValue = newText;
}

export function appendChild(
  parentInstance: Instance,
  child: Instance | TextInstance,
): void {
  parentInstance.appendChild(child);
}

export function appendChildToContainer(
  container: Container,
  child: Instance | TextInstance,
): void {
  let parentNode;
  if (container.nodeType === COMMENT_NODE) {
    parentNode = (container.parentNode: any);
    parentNode.insertBefore(child, container);
  } else {
    parentNode = container;
    parentNode.appendChild(child);
  }
  // This container might be used for a portal.
  // If something inside a portal is clicked, that click should bubble
  // through the React tree. However, on Mobile Safari the click would
  // never bubble through the *DOM* tree unless an ancestor with onclick
  // event exists. So we wouldn't see it and dispatch it.
  // This is why we ensure that non React root containers have inline onclick
  // defined.
  // https://github.com/facebook/react/issues/11918
  const reactRootContainer = container._reactRootContainer;
  if (
    (reactRootContainer === null || reactRootContainer === undefined) &&
    parentNode.onclick === null
  ) {
    // TODO: This cast may not be sound for SVG, MathML or custom elements.
    trapClickOnNonInteractiveElement(((parentNode: any): HTMLElement));
  }
}

export function insertBefore(
  parentInstance: Instance,
  child: Instance | TextInstance,
  beforeChild: InstanceSibling,
): void {
  parentInstance.insertBefore(child, beforeChild);
}

export function insertInContainerBefore(
  container: Container,
  child: Instance | TextInstance,
  beforeChild: InstanceSibling,
): void {
  if (container.nodeType === COMMENT_NODE) {
    (container.parentNode: any).insertBefore(child, beforeChild);
  } else {
    container.insertBefore(child, beforeChild);
  }
}

function createEvent(type: DOMEventName, bubbles: boolean): Event {
  const event = document.createEvent('Event');
  event.initEvent(((type: any): string), bubbles, false);
  return event;
}

function dispatchBeforeDetachedBlur(
  target: HTMLElement,
  internalInstanceHandle: Object,
): void {
  if (enableCreateEventHandleAPI) {
    const event = createEvent('beforeblur', true);
    // Dispatch "beforeblur" directly on the target,
    // so it gets picked up by the event system and
    // can propagate through the React internal tree.
    // $FlowFixMe: internal field
    event._detachedInterceptFiber = internalInstanceHandle;
    target.dispatchEvent(event);
  }
}

function dispatchAfterDetachedBlur(target: HTMLElement): void {
  if (enableCreateEventHandleAPI) {
    const event = createEvent('afterblur', false);
    // So we know what was detached, make the relatedTarget the
    // detached target on the "afterblur" event.
    (event: any).relatedTarget = target;
    // Dispatch the event on the document.
    document.dispatchEvent(event);
  }
}

export function removeChild(
  parentInstance: Instance,
  child: Instance | TextInstance | SuspenseInstance,
): void {
  parentInstance.removeChild(child);
}

export function removeChildFromContainer(
  container: Container,
  child: Instance | TextInstance | SuspenseInstance,
): void {
  if (container.nodeType === COMMENT_NODE) {
    (container.parentNode: any).removeChild(child);
  } else {
    container.removeChild(child);
  }
}

export function clearSuspenseBoundary(
  parentInstance: Instance,
  suspenseInstance: SuspenseInstance,
): void {
  let node = suspenseInstance;
  // Delete all nodes within this suspense boundary.
  // There might be nested nodes so we need to keep track of how
  // deep we are and only break out when we're back on top.
  let depth = 0;
  do {
    const nextNode = node.nextSibling;
    parentInstance.removeChild(node);
    if (nextNode && nextNode.nodeType === COMMENT_NODE) {
      const data = ((nextNode: any).data: string);
      if (data === SUSPENSE_END_DATA) {
        if (depth === 0) {
          parentInstance.removeChild(nextNode);
          // Retry if any event replaying was blocked on this.
          retryIfBlockedOn(suspenseInstance);
          return;
        } else {
          depth--;
        }
      } else if (
        data === SUSPENSE_START_DATA ||
        data === SUSPENSE_PENDING_START_DATA ||
        data === SUSPENSE_FALLBACK_START_DATA
      ) {
        depth++;
      }
    }
    node = nextNode;
  } while (node);
  // TODO: Warn, we didn't find the end comment boundary.
  // Retry if any event replaying was blocked on this.
  retryIfBlockedOn(suspenseInstance);
}

export function clearSuspenseBoundaryFromContainer(
  container: Container,
  suspenseInstance: SuspenseInstance,
): void {
  if (container.nodeType === COMMENT_NODE) {
    clearSuspenseBoundary((container.parentNode: any), suspenseInstance);
  } else if (container.nodeType === ELEMENT_NODE) {
    clearSuspenseBoundary((container: any), suspenseInstance);
  } else {
    // Document nodes should never contain suspense boundaries.
  }
  // Retry if any event replaying was blocked on this.
  retryIfBlockedOn(container);
}

export function hideInstance(instance: Instance): void {
  // TODO: Does this work for all element types? What about MathML? Should we
  // pass host context to this method?
  instance = ((instance: any): HTMLElement);
  const style = instance.style;
  if (typeof style.setProperty === 'function') {
    style.setProperty('display', 'none', 'important');
  } else {
    style.display = 'none';
  }
}

export function hideTextInstance(textInstance: TextInstance): void {
  textInstance.nodeValue = '';
}

export function unhideInstance(instance: Instance, props: Props): void {
  instance = ((instance: any): HTMLElement);
  const styleProp = props[STYLE];
  const display =
    styleProp !== undefined &&
    styleProp !== null &&
    styleProp.hasOwnProperty('display')
      ? styleProp.display
      : null;
  instance.style.display = dangerousStyleValue('display', display);
}

export function unhideTextInstance(
  textInstance: TextInstance,
  text: string,
): void {
  textInstance.nodeValue = text;
}

export function clearContainer(container: Container): void {
  if (enableHostSingletons) {
    if (container.nodeType === ELEMENT_NODE) {
      switch (((container: any): Element).tagName.toLowerCase()) {
        case 'html':
        case 'head':
        case 'body': {
          clearSingletonInstance(container);
          break;
        }
        default: {
          ((container: any): Element).textContent = '';
        }
      }
    }
    // Implicitly if the container is of type Document we rely on the Persistent HostComponent
    // semantics to clear these nodes appropriately when being placed so no ahead of time
    // clearing is necessary
  } else {
    if (container.nodeType === ELEMENT_NODE) {
      ((container: any): Element).textContent = '';
    } else if (container.nodeType === DOCUMENT_NODE) {
      if (container.documentElement) {
        container.removeChild(container.documentElement);
      }
    }
  }
}

// -------------------
//     Hydration
// -------------------

export const supportsHydration = true;

export function isHydratableResource(type: string, props: Props) {
  if (enableFloat) {
    return (
      type === 'link' &&
      typeof (props: any).precedence === 'string' &&
      (props: any).rel === 'stylesheet'
    );
  }
  return false;
}

export function canHydrateInstance(
  instance: HydratableInstance,
  type: string,
  props: Props,
): null | Instance {
  if (
    instance.nodeType !== ELEMENT_NODE ||
    type.toLowerCase() !== instance.nodeName.toLowerCase()
  ) {
    return null;
  }
  // This has now been refined to an element node.
  return ((instance: any): Instance);
}

export function canHydrateTextInstance(
  instance: HydratableInstance,
  text: string,
): null | TextInstance {
  if (text === '' || instance.nodeType !== TEXT_NODE) {
    // Empty strings are not parsed by HTML so there won't be a correct match here.
    return null;
  }
  // This has now been refined to a text node.
  return ((instance: any): TextInstance);
}

export function canHydrateSuspenseInstance(
  instance: HydratableInstance,
): null | SuspenseInstance {
  if (instance.nodeType !== COMMENT_NODE) {
    // Empty strings are not parsed by HTML so there won't be a correct match here.
    return null;
  }
  // This has now been refined to a suspense node.
  return ((instance: any): SuspenseInstance);
}

export function isSuspenseInstancePending(instance: SuspenseInstance) {
  return instance.data === SUSPENSE_PENDING_START_DATA;
}

export function isSuspenseInstanceFallback(instance: SuspenseInstance) {
  return instance.data === SUSPENSE_FALLBACK_START_DATA;
}

export function getSuspenseInstanceFallbackErrorDetails(
  instance: SuspenseInstance,
): {digest: ?string, message?: string, stack?: string} {
  const dataset =
    instance.nextSibling && ((instance.nextSibling: any): HTMLElement).dataset;
  let digest, message, stack;
  if (dataset) {
    digest = dataset.dgst;
    if (__DEV__) {
      message = dataset.msg;
      stack = dataset.stck;
    }
  }
  if (__DEV__) {
    return {
      message,
      digest,
      stack,
    };
  } else {
    // Object gets DCE'd if constructed in tail position and matches callsite destructuring
    return {
      digest,
    };
  }

  // let value = {message: undefined, hash: undefined};
  // const nextSibling = instance.nextSibling;
  // if (nextSibling) {
  //   const dataset = ((nextSibling: any): HTMLTemplateElement).dataset;
  //   value.message = dataset.msg;
  //   value.hash = dataset.hash;
  //   if (__DEV__) {
  //     value.stack = dataset.stack;
  //   }
  // }
  // return value;
}

export function registerSuspenseInstanceRetry(
  instance: SuspenseInstance,
  callback: () => void,
) {
  instance._reactRetry = callback;
}

function getNextHydratable(node) {
  // Skip non-hydratable nodes.
  for (; node != null; node = ((node: any): Node).nextSibling) {
    const nodeType = node.nodeType;
    if (enableHostSingletons) {
      if (nodeType === ELEMENT_NODE) {
        if (
          ((node: any): Element).tagName === 'LINK' &&
          ((node: any): Element).hasAttribute('data-rprec')
        ) {
          continue;
        }
        break;
      }
      if (nodeType === TEXT_NODE) {
        break;
      }
    } else {
      if (nodeType === ELEMENT_NODE || nodeType === TEXT_NODE) {
        break;
      }
    }
    if (nodeType === COMMENT_NODE) {
      const nodeData = (node: any).data;
      if (
        nodeData === SUSPENSE_START_DATA ||
        nodeData === SUSPENSE_FALLBACK_START_DATA ||
        nodeData === SUSPENSE_PENDING_START_DATA
      ) {
        break;
      }
      if (nodeData === SUSPENSE_END_DATA) {
        return null;
      }
    }
  }
  return (node: any);
}

export function getNextHydratableSibling(
  instance: HydratableInstance,
): null | HydratableInstance {
  return getNextHydratable(instance.nextSibling);
}

export function getFirstHydratableChild(
  parentInstance: Instance,
): null | HydratableInstance {
  return getNextHydratable(parentInstance.firstChild);
}

export function getFirstHydratableChildWithinContainer(
  parentContainer: Container,
): null | HydratableInstance {
  return getNextHydratable(parentContainer.firstChild);
}

export function getFirstHydratableChildWithinSuspenseInstance(
  parentInstance: SuspenseInstance,
): null | HydratableInstance {
  return getNextHydratable(parentInstance.nextSibling);
}

export function hydrateInstance(
  instance: Instance,
  type: string,
  props: Props,
  hostContext: HostContext,
  internalInstanceHandle: Object,
  shouldWarnDev: boolean,
): null | Array<mixed> {
  precacheFiberNode(internalInstanceHandle, instance);
  // TODO: Possibly defer this until the commit phase where all the events
  // get attached.
  updateFiberProps(instance, props);
  let parentNamespace: string;
  if (__DEV__) {
    const hostContextDev = ((hostContext: any): HostContextDev);
    parentNamespace = hostContextDev.namespace;
  } else {
    parentNamespace = ((hostContext: any): HostContextProd);
  }

  // TODO: Temporary hack to check if we're in a concurrent root. We can delete
  // when the legacy root API is removed.
  const isConcurrentMode =
    ((internalInstanceHandle: Fiber).mode & ConcurrentMode) !== NoMode;

  return diffHydratedProperties(
    instance,
    type,
    props,
    parentNamespace,
    isConcurrentMode,
    shouldWarnDev,
  );
}

export function hydrateTextInstance(
  textInstance: TextInstance,
  text: string,
  internalInstanceHandle: Object,
  shouldWarnDev: boolean,
): boolean {
  precacheFiberNode(internalInstanceHandle, textInstance);

  // TODO: Temporary hack to check if we're in a concurrent root. We can delete
  // when the legacy root API is removed.
  const isConcurrentMode =
    ((internalInstanceHandle: Fiber).mode & ConcurrentMode) !== NoMode;

  return diffHydratedText(textInstance, text, isConcurrentMode);
}

export function hydrateSuspenseInstance(
  suspenseInstance: SuspenseInstance,
  internalInstanceHandle: Object,
) {
  precacheFiberNode(internalInstanceHandle, suspenseInstance);
}

export function getMatchingResourceInstance(
  type: string,
  props: Props,
  rootHostContainer: Container,
): ?Instance {
  if (enableHostSingletons) {
    switch (type) {
      case 'link': {
        if (typeof (props: any).href !== 'string') {
          return null;
        }
        const selector = `link[rel="stylesheet"][data-rprec][href="${
          (props: any).href
        }"]`;
        const link = getOwnerDocumentFromRootContainer(
          rootHostContainer,
        ).querySelector(selector);
        if (__DEV__) {
          const allLinks = getOwnerDocumentFromRootContainer(
            rootHostContainer,
          ).querySelectorAll(selector);
          if (allLinks.length > 1) {
            console.error(
              'Stylesheet resources need a unique representation in the DOM while hydrating' +
                ' and more than one matching DOM Node was found. To fix, ensure you are only' +
                ' rendering one stylesheet link with an href attribute of "%s".',
              (props: any).href,
            );
          }
        }
        return link;
      }
    }
  }
  return null;
}

export function getNextHydratableInstanceAfterSuspenseInstance(
  suspenseInstance: SuspenseInstance,
): null | HydratableInstance {
  let node = suspenseInstance.nextSibling;
  // Skip past all nodes within this suspense boundary.
  // There might be nested nodes so we need to keep track of how
  // deep we are and only break out when we're back on top.
  let depth = 0;
  while (node) {
    if (node.nodeType === COMMENT_NODE) {
      const data = ((node: any).data: string);
      if (data === SUSPENSE_END_DATA) {
        if (depth === 0) {
          return getNextHydratableSibling((node: any));
        } else {
          depth--;
        }
      } else if (
        data === SUSPENSE_START_DATA ||
        data === SUSPENSE_FALLBACK_START_DATA ||
        data === SUSPENSE_PENDING_START_DATA
      ) {
        depth++;
      }
    }
    node = node.nextSibling;
  }
  // TODO: Warn, we didn't find the end comment boundary.
  return null;
}

// Returns the SuspenseInstance if this node is a direct child of a
// SuspenseInstance. I.e. if its previous sibling is a Comment with
// SUSPENSE_x_START_DATA. Otherwise, null.
export function getParentSuspenseInstance(
  targetInstance: Node,
): null | SuspenseInstance {
  let node = targetInstance.previousSibling;
  // Skip past all nodes within this suspense boundary.
  // There might be nested nodes so we need to keep track of how
  // deep we are and only break out when we're back on top.
  let depth = 0;
  while (node) {
    if (node.nodeType === COMMENT_NODE) {
      const data = ((node: any).data: string);
      if (
        data === SUSPENSE_START_DATA ||
        data === SUSPENSE_FALLBACK_START_DATA ||
        data === SUSPENSE_PENDING_START_DATA
      ) {
        if (depth === 0) {
          return ((node: any): SuspenseInstance);
        } else {
          depth--;
        }
      } else if (data === SUSPENSE_END_DATA) {
        depth++;
      }
    }
    node = node.previousSibling;
  }
  return null;
}

export function commitHydratedContainer(container: Container): void {
  // Retry if any event replaying was blocked on this.
  retryIfBlockedOn(container);
}

export function commitHydratedSuspenseInstance(
  suspenseInstance: SuspenseInstance,
): void {
  // Retry if any event replaying was blocked on this.
  retryIfBlockedOn(suspenseInstance);
}

// @TODO remove this function once float lands and hydrated tail nodes
// are controlled by HostSingleton fibers
export function shouldDeleteUnhydratedTailInstances(
  parentType: string,
): boolean {
  return parentType !== 'head' && parentType !== 'body';
}

export function didNotMatchHydratedContainerTextInstance(
  parentContainer: Container,
  textInstance: TextInstance,
  text: string,
  isConcurrentMode: boolean,
  shouldWarnDev: boolean,
) {
  checkForUnmatchedText(
    textInstance.nodeValue,
    text,
    isConcurrentMode,
    shouldWarnDev,
  );
}

export function didNotMatchHydratedTextInstance(
  parentType: string,
  parentProps: Props,
  parentInstance: Instance,
  textInstance: TextInstance,
  text: string,
  isConcurrentMode: boolean,
  shouldWarnDev: boolean,
) {
  if (parentProps[SUPPRESS_HYDRATION_WARNING] !== true) {
    checkForUnmatchedText(
      textInstance.nodeValue,
      text,
      isConcurrentMode,
      shouldWarnDev,
    );
  }
}

export function didNotHydrateInstanceWithinContainer(
  parentContainer: Container,
  instance: HydratableInstance,
) {
  if (__DEV__) {
    if (instance.nodeType === ELEMENT_NODE) {
      warnForDeletedHydratableElement(parentContainer, (instance: any));
    } else if (instance.nodeType === COMMENT_NODE) {
      // TODO: warnForDeletedHydratableSuspenseBoundary
    } else {
      warnForDeletedHydratableText(parentContainer, (instance: any));
    }
  }
}

export function didNotHydrateInstanceWithinSuspenseInstance(
  parentInstance: SuspenseInstance,
  instance: HydratableInstance,
) {
  if (__DEV__) {
    // $FlowFixMe: Only Element or Document can be parent nodes.
    const parentNode: Element | Document | null = parentInstance.parentNode;
    if (parentNode !== null) {
      if (instance.nodeType === ELEMENT_NODE) {
        warnForDeletedHydratableElement(parentNode, (instance: any));
      } else if (instance.nodeType === COMMENT_NODE) {
        // TODO: warnForDeletedHydratableSuspenseBoundary
      } else {
        warnForDeletedHydratableText(parentNode, (instance: any));
      }
    }
  }
}

export function didNotHydrateInstance(
  parentType: string,
  parentProps: Props,
  parentInstance: Instance,
  instance: HydratableInstance,
  isConcurrentMode: boolean,
) {
  if (__DEV__) {
    if (isConcurrentMode || parentProps[SUPPRESS_HYDRATION_WARNING] !== true) {
      if (instance.nodeType === ELEMENT_NODE) {
        warnForDeletedHydratableElement(parentInstance, (instance: any));
      } else if (instance.nodeType === COMMENT_NODE) {
        // TODO: warnForDeletedHydratableSuspenseBoundary
      } else {
        warnForDeletedHydratableText(parentInstance, (instance: any));
      }
    }
  }
}

export function didNotFindHydratableInstanceWithinContainer(
  parentContainer: Container,
  type: string,
  props: Props,
) {
  if (__DEV__) {
    warnForInsertedHydratedElement(parentContainer, type, props);
  }
}

export function didNotFindHydratableTextInstanceWithinContainer(
  parentContainer: Container,
  text: string,
) {
  if (__DEV__) {
    warnForInsertedHydratedText(parentContainer, text);
  }
}

export function didNotFindHydratableSuspenseInstanceWithinContainer(
  parentContainer: Container,
) {
  if (__DEV__) {
    // TODO: warnForInsertedHydratedSuspense(parentContainer);
  }
}

export function didNotFindHydratableInstanceWithinSuspenseInstance(
  parentInstance: SuspenseInstance,
  type: string,
  props: Props,
) {
  if (__DEV__) {
    // $FlowFixMe: Only Element or Document can be parent nodes.
    const parentNode: Element | Document | null = parentInstance.parentNode;
    if (parentNode !== null)
      warnForInsertedHydratedElement(parentNode, type, props);
  }
}

export function didNotFindHydratableTextInstanceWithinSuspenseInstance(
  parentInstance: SuspenseInstance,
  text: string,
) {
  if (__DEV__) {
    // $FlowFixMe: Only Element or Document can be parent nodes.
    const parentNode: Element | Document | null = parentInstance.parentNode;
    if (parentNode !== null) warnForInsertedHydratedText(parentNode, text);
  }
}

export function didNotFindHydratableSuspenseInstanceWithinSuspenseInstance(
  parentInstance: SuspenseInstance,
) {
  if (__DEV__) {
    // const parentNode: Element | Document | null = parentInstance.parentNode;
    // TODO: warnForInsertedHydratedSuspense(parentNode);
  }
}

export function didNotFindHydratableInstance(
  parentType: string,
  parentProps: Props,
  parentInstance: Instance,
  type: string,
  props: Props,
  isConcurrentMode: boolean,
) {
  if (__DEV__) {
    if (isConcurrentMode || parentProps[SUPPRESS_HYDRATION_WARNING] !== true) {
      warnForInsertedHydratedElement(parentInstance, type, props);
    }
  }
}

export function didNotFindHydratableTextInstance(
  parentType: string,
  parentProps: Props,
  parentInstance: Instance,
  text: string,
  isConcurrentMode: boolean,
) {
  if (__DEV__) {
    if (isConcurrentMode || parentProps[SUPPRESS_HYDRATION_WARNING] !== true) {
      warnForInsertedHydratedText(parentInstance, text);
    }
  }
}

export function didNotFindHydratableSuspenseInstance(
  parentType: string,
  parentProps: Props,
  parentInstance: Instance,
) {
  if (__DEV__) {
    // TODO: warnForInsertedHydratedSuspense(parentInstance);
  }
}

export function errorHydratingContainer(parentContainer: Container): void {
  if (__DEV__) {
    // TODO: This gets logged by onRecoverableError, too, so we should be
    // able to remove it.
    console.error(
      'An error occurred during hydration. The server HTML was replaced with client content in <%s>.',
      parentContainer.nodeName.toLowerCase(),
    );
  }
}

export function acquireSingletonInstance(
  type: string,
  props: Props,
  rootContainerInstance: Container,
  hostContext: HostContext,
): Instance {
  if (__DEV__) {
    // TODO: take namespace into account when validating.
    const hostContextDev = ((hostContext: any): HostContextDev);
    validateDOMNesting(type, null, hostContextDev.ancestorInfo);
  }
  const ownerDocument = getOwnerDocumentFromRootContainer(
    rootContainerInstance,
  );
  // For the three persistent Host Components that exist in DOM it is necessary for there to
  // always be a documentElement. With normal html parsing this will always be the case but
  // with pathological manipulation the document can end up in a state where no documentElement
  // exists. We create it here if missing so we can treat it as an invariant.
  // It is important to note that thi dom mutation and others in this function happen
  // in render rather than commit. This is tolerable because they only happen in degenerate cases
  if (!ownerDocument.documentElement) {
    ownerDocument.append(ownerDocument.createElement('html'));
  }
  switch (type) {
    case 'html': {
      // We ensure this exists just above
      return ((ownerDocument.documentElement: any): HTMLHtmlElement);
    }
    case 'head': {
      if (!ownerDocument.head) {
        ownerDocument.insertBefore(
          ownerDocument.createElement('head'),
          ownerDocument.firstChild,
        );
      }
      // We ensure this exists just above
      return ((ownerDocument.head: any): HTMLHeadElement);
    }
    case 'body': {
      if (!ownerDocument.body) {
        ownerDocument.appendChild(ownerDocument.createElement('body'));
      }
      // We ensure this exists just above
      return ((ownerDocument.body: any): HTMLBodyElement);
    }
    default: {
      throw new Error(
        'acquireSingletonInstance was called with an element type that is not supported. This is a bug in React.',
      );
    }
  }
}

export function resetSingletonInstance(
  type: string,
  props: Props,
  instance: Instance,
  internalInstanceHandle: Object,
): void {
  if (__DEV__) {
    switch (type) {
      case 'html':
      case 'head':
      case 'body': {
        break;
      }
      default: {
        console.error(
          'commitSingletonPlacement was called with an element type that is not supported. This is a bug in React.',
        );
      }
    }
  }

  clearSingletonInstance(instance);
  resetProperties(instance, type, props);
  precacheFiberNode(internalInstanceHandle, instance);
  updateFiberProps(instance, props);
}

export function getInsertionEdge(parent: Instance): ?InstanceSibling {
  if (enableHostSingletons) {
    let node = null;
    let nextNode = parent.lastChild;
    let fallbackNode;
    while (nextNode != null) {
      const fiber = getInstanceFromNodeDOMTree(nextNode);
      if (fiber) {
        // We intentionally start with fiber rather than fiber.return because we want to
        // account whether the node we found is the root itself. This comes into play
        // when you portal into the same element that contains the HostRoot
        let parentFiber = fiber;
        while (parentFiber !== null) {
          if (
            (parentFiber.tag === HostComponent &&
              parentFiber.stateNode === parent) ||
            ((parentFiber.tag === HostPortal || parentFiber.tag === HostRoot) &&
              parentFiber.stateNode.containerInfo === parent)
          ) {
            return node;
          }
          if (fallbackNode === undefined && parentFiber.tag === HostRoot) {
            // When we find out first Fiber Node we capture the preceding Node to use as a fallback
            // This is because we want to append to sibling fiber trees but prepend non-fiber trees
            // If we don't end up finding an explicit insertion point based on existing siblings
            fallbackNode = fallbackNode || node;
          }
          parentFiber = parentFiber.return;
        }
      }

      node = nextNode;
      nextNode = nextNode.previousSibling;
    }
    // We return the fallbackNode if we found one (the Node following the first React owned Node)
    // Otherwise we return the first Node in the list of Siblings
    return fallbackNode !== undefined ? fallbackNode : node;
  }
  return null;
}

export function clearSingletonInstance(instance: Instance) {
  const tagName = instance.tagName.toLowerCase();
  switch (tagName) {
    case 'html': {
      return;
    }
    case 'head':
    case 'body': {
      let node = instance.firstChild;
      while (node) {
        const nextNode = node.nextSibling;
        const nodeName = node.nodeName;
        if (
          nodeName === 'STYLE' ||
          (nodeName === 'LINK' &&
            ((node: any): HTMLLinkElement).rel.toLowerCase() === 'stylesheet')
        ) {
          // retain these nodes
        } else {
          instance.removeChild(node);
        }
        node = nextNode;
      }
      return;
    }
    default: {
      throw new Error(
        'clearSingletonInstance was called with an element type that is not supported. this is a bug in React.',
      );
    }
  }
}

// -------------------
//     Test Selectors
// -------------------

export const supportsTestSelectors = true;

export function findFiberRoot(node: Instance): null | FiberRoot {
  const stack = [node];
  let index = 0;
  while (index < stack.length) {
    const current = stack[index++];
    if (isContainerMarkedAsRoot(current)) {
      return ((getInstanceFromNodeDOMTree(current): any): FiberRoot);
    }
    stack.push(...current.children);
  }
  return null;
}

export function getBoundingRect(node: Instance): BoundingRect {
  const rect = node.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export function matchAccessibilityRole(node: Instance, role: string): boolean {
  if (hasRole(node, role)) {
    return true;
  }

  return false;
}

export function getTextContent(fiber: Fiber): string | null {
  switch (fiber.tag) {
    case HostSingleton:
    case HostComponent:
      let textContent = '';
      const childNodes = fiber.stateNode.childNodes;
      for (let i = 0; i < childNodes.length; i++) {
        const childNode = childNodes[i];
        if (childNode.nodeType === Node.TEXT_NODE) {
          textContent += childNode.textContent;
        }
      }
      return textContent;
    case HostText:
      return fiber.stateNode.textContent;
  }

  return null;
}

export function isHiddenSubtree(fiber: Fiber): boolean {
  return (
    (fiber.tag === HostComponent ||
      (enableHostSingletons ? fiber.tag === HostSingleton : false)) &&
    fiber.memoizedProps.hidden === true
  );
}

export function setFocusIfFocusable(node: Instance): boolean {
  // The logic for determining if an element is focusable is kind of complex,
  // and since we want to actually change focus anyway- we can just skip it.
  // Instead we'll just listen for a "focus" event to verify that focus was set.
  //
  // We could compare the node to document.activeElement after focus,
  // but this would not handle the case where application code managed focus to automatically blur.
  let didFocus = false;
  const handleFocus = () => {
    didFocus = true;
  };

  const element = ((node: any): HTMLElement);
  try {
    element.addEventListener('focus', handleFocus);
    (element.focus || HTMLElement.prototype.focus).call(element);
  } finally {
    element.removeEventListener('focus', handleFocus);
  }

  return didFocus;
}

type RectRatio = {
  ratio: number,
  rect: BoundingRect,
};

export function setupIntersectionObserver(
  targets: Array<Instance>,
  callback: ObserveVisibleRectsCallback,
  options?: IntersectionObserverOptions,
): {|
  disconnect: () => void,
  observe: (instance: Instance) => void,
  unobserve: (instance: Instance) => void,
|} {
  const rectRatioCache: Map<Instance, RectRatio> = new Map();
  targets.forEach(target => {
    rectRatioCache.set(target, {
      rect: getBoundingRect(target),
      ratio: 0,
    });
  });

  const handleIntersection = (entries: Array<IntersectionObserverEntry>) => {
    entries.forEach(entry => {
      const {boundingClientRect, intersectionRatio, target} = entry;
      rectRatioCache.set(target, {
        rect: {
          x: boundingClientRect.left,
          y: boundingClientRect.top,
          width: boundingClientRect.width,
          height: boundingClientRect.height,
        },
        ratio: intersectionRatio,
      });
    });

    callback(Array.from(rectRatioCache.values()));
  };

  const observer = new IntersectionObserver(handleIntersection, options);
  targets.forEach(target => {
    observer.observe((target: any));
  });

  return {
    disconnect: () => observer.disconnect(),
    observe: target => {
      rectRatioCache.set(target, {
        rect: getBoundingRect(target),
        ratio: 0,
      });
      observer.observe((target: any));
    },
    unobserve: target => {
      rectRatioCache.delete(target);
      observer.unobserve((target: any));
    },
  };
}

// -------------------
//     Singletons
// -------------------

export const supportsSingletons = true;

export function isHostSingletonInstance(
  instance: Instance | Container,
): boolean {
  if (instance.nodeType === ELEMENT_NODE) {
    return isHostSingletonType(instance.tagName.toLowerCase());
  }
  return false;
}

import {isHostSingletonType} from './ReactDOMComponent';
export {isHostSingletonType};
