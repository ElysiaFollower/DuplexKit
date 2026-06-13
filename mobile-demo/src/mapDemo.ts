import type { AppToolName, MapDemoState, ToolRequest } from "./types";

export function applyToolRequest(state: MapDemoState, request: ToolRequest): MapDemoState {
  const place = request.args?.place?.trim();
  switch (request.tool) {
    case "map.open":
      return {
        ...state,
        visible: true,
        navigating: false,
        lastTool: request.tool,
        lastResult: "地图已打开"
      };
    case "map.close":
      return {
        visible: false,
        navigating: false,
        lastTool: request.tool,
        lastResult: "地图已关闭"
      };
    case "map.set_origin":
      return {
        ...state,
        visible: true,
        origin: place || "起点",
        lastTool: request.tool,
        lastResult: `起点已设置为${place || "起点"}`
      };
    case "map.set_destination":
      return {
        ...state,
        visible: true,
        destination: place || "终点",
        lastTool: request.tool,
        lastResult: `终点已设置为${place || "终点"}`
      };
    case "navigation.start":
      return {
        ...state,
        visible: true,
        destination: place || state.destination || "当前终点",
        navigating: true,
        lastTool: request.tool,
        lastResult: `导航已启动，目的地是${place || state.destination || "当前终点"}`
      };
    default:
      return state;
  }
}

export function toolResultFor(request: ToolRequest, state: MapDemoState) {
  const place = request.args?.place?.trim();
  const destination = place || state.destination || "当前终点";
  const messages: Record<AppToolName, { summary: string; visibleResult: string }> = {
    "map.open": {
      summary: "地图已打开",
      visibleResult: "移动 demo 正方形地图已显示"
    },
    "map.close": {
      summary: "地图已关闭",
      visibleResult: "移动 demo 正方形地图已关闭"
    },
    "map.set_origin": {
      summary: `起点已设置为${place || "起点"}`,
      visibleResult: `正方形左上角已标记起点：${place || "起点"}`
    },
    "map.set_destination": {
      summary: `终点已设置为${place || "终点"}`,
      visibleResult: `正方形右下角已标记终点：${place || "终点"}`
    },
    "navigation.start": {
      summary: `导航已启动，目的地是${destination}`,
      visibleResult: `正方形地图已高亮导航路线：${destination}`
    }
  };

  return messages[request.tool];
}
