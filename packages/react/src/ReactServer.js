/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// Patch fetch
import './ReactFetch';

export {default as __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED} from './ReactSharedInternalsServer';

export {default as __SECRET_SERVER_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED} from './ReactServerSharedInternals';

import {forEach, map, count, toArray, only} from './ReactChildren';
import {
  REACT_FRAGMENT_TYPE,
  REACT_PROFILER_TYPE,
  REACT_STRICT_MODE_TYPE,
  REACT_SUSPENSE_TYPE,
} from 'shared/ReactSymbols';
import {cloneElement, createElement, isValidElement} from './ReactElement';
import {createRef} from './ReactCreateRef';
import {createServerContext} from './ReactServerContext';
import {
  use,
  useId,
  useCallback,
  useContext,
  useDebugValue,
  useMemo,
} from './ReactHooks';
import {forwardRef} from './ReactForwardRef';
import {lazy} from './ReactLazy';
import {memo} from './ReactMemo';
import {cache} from './ReactCacheServer';
import {startTransition} from './ReactStartTransition';
import version from 'shared/ReactVersion';

const Children = {
  map,
  forEach,
  count,
  toArray,
  only,
};

export {
  Children,
  REACT_FRAGMENT_TYPE as Fragment,
  REACT_PROFILER_TYPE as Profiler,
  REACT_STRICT_MODE_TYPE as StrictMode,
  REACT_SUSPENSE_TYPE as Suspense,
  cloneElement,
  createElement,
  createRef,
  createServerContext,
  use,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  cache,
  startTransition,
  useId,
  useCallback,
  useContext,
  useDebugValue,
  useMemo,
  version,
};
