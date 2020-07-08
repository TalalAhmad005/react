// @flow

export const LABEL_SIZE = 80;
export const LABEL_FONT_SIZE = 11;
export const MARKER_HEIGHT = 20;
export const MARKER_TICK_HEIGHT = 8;
export const MARKER_FONT_SIZE = 10;
export const MARKER_GUTTER_SIZE = 4;
export const MARKER_TEXT_PADDING = 8;
export const BAR_HEIGHT = 16;
export const BAR_HORIZONTAL_SPACING = 1;
export const BAR_SPACER_SIZE = 6;
export const EVENT_SIZE = 6; // TODO: What's the difference between this and REACT_EVENT_SIZE?
export const MIN_BAR_WIDTH = 1;
export const SECTION_GUTTER_SIZE = 4;

export const INTERVAL_TIMES = [
  1,
  2,
  5,
  10,
  20,
  50,
  100,
  200,
  500,
  1000,
  2000,
  5000,
];
export const MIN_INTERVAL_SIZE_PX = 70;
export const MAX_INTERVAL_SIZE_PX = 140;

export const MOVE_WHEEL_DELTA_THRESHOLD = 1;
export const ZOOM_WHEEL_DELTA_THRESHOLD = 1;
export const MIN_ZOOM_LEVEL = 0.25;
export const MAX_ZOOM_LEVEL = 1000;

export const REACT_PRIORITIES = ['unscheduled', 'high', 'normal', 'low'];

export const ROW_CSS_PIXELS_HEIGHT = 16;
export const TEXT_CSS_PIXELS_OFFSET_START = 3;
export const TEXT_CSS_PIXELS_OFFSET_TOP = 11;
export const FONT_SIZE = 10;
export const BORDER_OPACITY = 0.4;

export const REACT_GUTTER_SIZE = 0; //Increase to add vertical padding to lanes 
export const REACT_EVENT_ROW_PADDING = 4;
export const REACT_EVENT_SIZE = 6;
export const REACT_WORK_SIZE = 9;
export const REACT_EVENT_BORDER_SIZE = 1;
export const REACT_WORK_BORDER_SIZE = 1;

export const FLAMECHART_FONT_SIZE = 10;
export const FLAMECHART_FRAME_HEIGHT = 16;
export const FLAMECHART_TEXT_PADDING = 3;

export const LABEL_FIXED_WIDTH = LABEL_SIZE + REACT_WORK_BORDER_SIZE;
export const HEADER_HEIGHT_FIXED = MARKER_HEIGHT + REACT_WORK_BORDER_SIZE;
export const EVENT_ROW_HEIGHT_FIXED =
  REACT_EVENT_ROW_PADDING + REACT_EVENT_SIZE + REACT_EVENT_ROW_PADDING;

export const COLORS = Object.freeze({
  BACKGROUND: '#ffffff',
  FLAME_GRAPH: '#fff79f',
  FLAME_GRAPH_HOVER: '#ffe900',
  OTHER_SCRIPT: '#fff791',
  OTHER_SCRIPT_HOVER: '#ffea00',
  PRIORITY_BACKGROUND: '#ededf0',
  PRIORITY_BORDER: '#d7d7db',
  PRIORITY_LABEL: '#272727',
  REACT_IDLE: '#edf6ff',
  REACT_IDLE_SELECTED: '#EDF6FF',
  REACT_IDLE_HOVER: '#EDF6FF',
  REACT_RENDER: '#9fc3f3',
  REACT_RENDER_SELECTED: '#64A9F5',
  REACT_RENDER_HOVER: '#298ff6',
  REACT_COMMIT: '#ff718e',
  REACT_COMMIT_SELECTED: '#FF5277',
  REACT_COMMIT_HOVER: '#ff335f',
  REACT_LAYOUT_EFFECTS: '#c49edd',
  REACT_LAYOUT_EFFECTS_SELECTED: '#934FC1',
  REACT_LAYOUT_EFFECTS_HOVER: '#6200a4',
  REACT_PASSIVE_EFFECTS: '#c49edd',
  REACT_PASSIVE_EFFECTS_SELECTED: '#934FC1',
  REACT_PASSIVE_EFFECTS_HOVER: '#6200a4',
  REACT_SCHEDULE: '#9fc3f3',
  REACT_SCHEDULE_HOVER: '#298ff6',
  REACT_SCHEDULE_CASCADING: '#ff718e',
  REACT_SCHEDULE_CASCADING_HOVER: '#ff335f',
  REACT_SUSPEND: '#a6e59f',
  REACT_SUSPEND_HOVER: '#13bc00',
  REACT_WORK_BORDER: '#ffffff',
  TIME_MARKER_LINE: '#CAD6DE',
  TIME_MARKER_LABEL: '#18212b',
});
