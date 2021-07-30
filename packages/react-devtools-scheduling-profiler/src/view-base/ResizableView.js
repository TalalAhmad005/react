/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {
  DoubleClickInteraction,
  Interaction,
  MouseDownInteraction,
  MouseMoveInteraction,
  MouseUpInteraction,
} from './useCanvasInteraction';
import type {Rect, Size} from './geometry';
import type {ViewRefs} from './Surface';

import {BORDER_SIZE, COLORS} from '../content-views/constants';
import {Surface} from './Surface';
import {View} from './View';
import {rectContainsPoint} from './geometry';
import {noopLayout} from './layouter';
import {clamp} from './utils/clamp';

type ResizeBarState = 'normal' | 'hovered' | 'dragging';

type ResizingState = $ReadOnly<{|
  /** Distance between top of resize bar and mouseY */
  cursorOffsetInBarFrame: number,
  /** Mouse's vertical coordinates relative to canvas */
  mouseY: number,
|}>;

type LayoutState = $ReadOnly<{|
  /** Resize bar's vertical position relative to resize view's frame.origin.y */
  barOffsetY: number,
|}>;

const RESIZE_BAR_SIZE = 8;
const RESIZE_BAR_DOT_RADIUS = 1;
const RESIZE_BAR_DOT_SPACING = 4;

// TODO (ResizableView) Draw borders on top and bottom in case two bars are collapsed next to each other.
class ResizeBar extends View {
  _intrinsicContentSize: Size = {
    width: 0,
    height: RESIZE_BAR_SIZE,
  };

  _interactionState: ResizeBarState = 'normal';

  desiredSize() {
    return this._intrinsicContentSize;
  }

  draw(context: CanvasRenderingContext2D, viewRefs: ViewRefs) {
    const {visibleArea} = this;
    const {x, y} = visibleArea.origin;
    const {width, height} = visibleArea.size;

    const isActive =
      this._interactionState === 'dragging' ||
      (this._interactionState === 'hovered' && viewRefs.activeView === null);

    context.fillStyle = isActive
      ? COLORS.REACT_RESIZE_BAR_ACTIVE
      : COLORS.REACT_RESIZE_BAR;
    context.fillRect(x, y, width, height);

    context.fillStyle = COLORS.REACT_RESIZE_BAR_BORDER;
    context.fillRect(x, y, width, BORDER_SIZE);
    context.fillRect(x, y + height - BORDER_SIZE, width, BORDER_SIZE);

    const horizontalCenter = x + width / 2;
    const verticalCenter = y + height / 2;

    // Draw resize bar dots
    context.beginPath();
    context.fillStyle = COLORS.REACT_RESIZE_BAR_DOT;
    context.arc(
      horizontalCenter,
      verticalCenter,
      RESIZE_BAR_DOT_RADIUS,
      0,
      2 * Math.PI,
    );
    context.arc(
      horizontalCenter + RESIZE_BAR_DOT_SPACING,
      verticalCenter,
      RESIZE_BAR_DOT_RADIUS,
      0,
      2 * Math.PI,
    );
    context.arc(
      horizontalCenter - RESIZE_BAR_DOT_SPACING,
      verticalCenter,
      RESIZE_BAR_DOT_RADIUS,
      0,
      2 * Math.PI,
    );
    context.fill();
  }

  _setInteractionState(state: ResizeBarState) {
    if (this._interactionState === state) {
      return;
    }
    this._interactionState = state;
    this.setNeedsDisplay();
  }

  _handleMouseDown(interaction: MouseDownInteraction, viewRefs: ViewRefs) {
    const cursorInView = rectContainsPoint(
      interaction.payload.location,
      this.frame,
    );
    if (cursorInView) {
      this._setInteractionState('dragging');
      viewRefs.activeView = this;
    }
  }

  _handleMouseMove(interaction: MouseMoveInteraction, viewRefs: ViewRefs) {
    const cursorInView = rectContainsPoint(
      interaction.payload.location,
      this.frame,
    );

    if (cursorInView || viewRefs.activeView === this) {
      this.currentCursor = 'ns-resize';
    }
    if (cursorInView) {
      viewRefs.hoveredView = this;
    }

    if (this._interactionState === 'dragging') {
      return;
    }
    this._setInteractionState(cursorInView ? 'hovered' : 'normal');
  }

  _handleMouseUp(interaction: MouseUpInteraction, viewRefs: ViewRefs) {
    const cursorInView = rectContainsPoint(
      interaction.payload.location,
      this.frame,
    );
    if (this._interactionState === 'dragging') {
      this._setInteractionState(cursorInView ? 'hovered' : 'normal');
    }

    if (viewRefs.activeView === this) {
      viewRefs.activeView = null;
    }
  }

  handleInteraction(interaction: Interaction, viewRefs: ViewRefs) {
    switch (interaction.type) {
      case 'mousedown':
        this._handleMouseDown(interaction, viewRefs);
        return;
      case 'mousemove':
        this._handleMouseMove(interaction, viewRefs);
        return;
      case 'mouseup':
        this._handleMouseUp(interaction, viewRefs);
        return;
    }
  }
}

export class ResizableView extends View {
  _canvasRef: {current: HTMLCanvasElement | null};
  _resizingState: ResizingState | null = null;
  _layoutState: LayoutState;
  _resizeBar: ResizeBar;
  _subview: View;

  constructor(
    surface: Surface,
    frame: Rect,
    subview: View,
    canvasRef: {current: HTMLCanvasElement | null},
  ) {
    super(surface, frame, noopLayout);

    this._canvasRef = canvasRef;

    this._subview = subview;
    this._resizeBar = new ResizeBar(surface, frame);

    this.addSubview(this._subview);
    this.addSubview(this._resizeBar);

    // TODO (ResizableView) Allow subviews to specify default sizes.
    // Maybe that or set some % based default so all panels are visible to begin with.
    const subviewDesiredSize = subview.desiredSize();
    this._layoutState = {
      barOffsetY: subviewDesiredSize ? subviewDesiredSize.height : 0,
    };
  }

  desiredSize() {
    const resizeBarDesiredSize = this._resizeBar.desiredSize();
    const subviewDesiredSize = this._subview.desiredSize();

    const subviewDesiredWidth = subviewDesiredSize
      ? subviewDesiredSize.width
      : 0;

    return {
      width: Math.max(subviewDesiredWidth, resizeBarDesiredSize.width),
      height: this._layoutState.barOffsetY + resizeBarDesiredSize.height,
    };
  }

  layoutSubviews() {
    this._updateLayoutState();
    this._updateSubviewFrames();

    super.layoutSubviews();
  }

  // TODO (ResizableView) Change ResizeBar view style slightly when fully collapsed.
  // TODO (ResizableView) Double click on ResizeBar to collapse/toggle.
  _updateLayoutState() {
    const {frame, _resizingState} = this;

    // TODO (ResizableView) Allow subviews to specify min size too.
    // Allow bar to travel to bottom of the visible area of this view but no further
    const subviewDesiredSize = this._subview.desiredSize();
    const maxBarOffset = subviewDesiredSize.height;

    let proposedBarOffsetY = this._layoutState.barOffsetY;
    // Update bar offset if dragging bar
    if (_resizingState) {
      const {mouseY, cursorOffsetInBarFrame} = _resizingState;
      proposedBarOffsetY = mouseY - frame.origin.y - cursorOffsetInBarFrame;
    }

    this._layoutState = {
      ...this._layoutState,
      barOffsetY: clamp(0, maxBarOffset, proposedBarOffsetY),
    };
  }

  _updateSubviewFrames() {
    const {
      frame: {
        origin: {x, y},
        size: {width},
      },
      _layoutState: {barOffsetY},
    } = this;

    const resizeBarDesiredSize = this._resizeBar.desiredSize();

    let currentY = y;

    this._subview.setFrame({
      origin: {x, y: currentY},
      size: {width, height: barOffsetY},
    });
    currentY += this._subview.frame.size.height;

    this._resizeBar.setFrame({
      origin: {x, y: currentY},
      size: {width, height: resizeBarDesiredSize.height},
    });
    currentY += this._resizeBar.frame.size.height;
  }

  _handleDoubleClick(interaction: DoubleClickInteraction) {
    const cursorInView = rectContainsPoint(
      interaction.payload.location,
      this.frame,
    );
    if (cursorInView) {
      if (this._layoutState.barOffsetY === 0) {
        // TODO (ResizableView) Allow subviews to specify min size too.
        // Allow bar to travel to bottom of the visible area of this view but no further
        const subviewDesiredSize = this._subview.desiredSize();
        const maxBarOffset = subviewDesiredSize.height;

        this._layoutState = {
          ...this._layoutState,
          barOffsetY: maxBarOffset,
        };
      } else {
        this._layoutState = {
          ...this._layoutState,
          barOffsetY: 0,
        };
      }
      this.setNeedsDisplay();
    }
  }

  _handleMouseDown(interaction: MouseDownInteraction) {
    const cursorLocation = interaction.payload.location;
    const resizeBarFrame = this._resizeBar.frame;
    if (rectContainsPoint(cursorLocation, resizeBarFrame)) {
      const mouseY = cursorLocation.y;
      this._resizingState = {
        cursorOffsetInBarFrame: mouseY - resizeBarFrame.origin.y,
        mouseY,
      };
    }
  }

  _handleMouseMove(interaction: MouseMoveInteraction) {
    const {_resizingState} = this;
    if (_resizingState) {
      this._resizingState = {
        ..._resizingState,
        mouseY: interaction.payload.location.y,
      };
      this.setNeedsDisplay();
    }
  }

  _handleMouseUp(interaction: MouseUpInteraction) {
    if (this._resizingState) {
      this._resizingState = null;
    }
  }

  _didGrab: boolean = false;

  getCursorActiveSubView(interaction: Interaction): View | null {
    const cursorLocation = interaction.payload.location;
    const resizeBarFrame = this._resizeBar.frame;
    if (rectContainsPoint(cursorLocation, resizeBarFrame)) {
      return this;
    } else {
      return null;
    }
  }

  handleInteraction(interaction: Interaction, viewRefs: ViewRefs) {
    switch (interaction.type) {
      case 'double-click':
        this._handleDoubleClick(interaction);
        return;
      case 'mousedown':
        this._handleMouseDown(interaction);
        return;
      case 'mousemove':
        this._handleMouseMove(interaction);
        return;
      case 'mouseup':
        this._handleMouseUp(interaction);
        return;
    }
  }
}
