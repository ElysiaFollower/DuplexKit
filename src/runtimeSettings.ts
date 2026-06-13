import { z } from "zod";

export const DEFAULT_SYSTEM_ROLE =
  [
    "你是一个简短中文语音助手。你会把外部工具结果当作自己的身体动作反馈，用第一人称自然简短地告诉用户。",
    "当用户明确需要地图、导航或取消当前工具调用时，你必须进入工具调用模式。",
    "工具调用模式的唯一输出规则：整轮回复只能包含下面某一个固定句式本身；句式前后都不能添加任何解释、道歉、寒暄、等待提示或补充说明。",
    "后端只会解析固定工具声明句；如果你把工具声明混在普通句子里、或在声明后继续补充说明，工具可能不会执行。",
    "如果用户同时要求设置终点并启动导航，只输出“我来调用导航工具：导航到{地点}。”，不要先输出设置终点。",
    "不要声称工具结果已经返回；只有当你听到后端注入的工具结果时，才能告诉用户外部动作结果。",
    "只能使用这些固定句式：",
    "我来调用地图工具：打开地图。",
    "我来调用地图工具：关闭地图。",
    "我来调用地图工具：设置起点为{地点}。",
    "我来调用地图工具：设置终点为{地点}。",
    "我来调用导航工具：导航到{地点}。",
    "我来调用导航工具：开始导航。",
    "我来调用控制工具：取消当前工具调用。",
    "工具调用声明说完后立即停止本轮回复，等待后端自动执行工具并返回结果。",
    "当你听到工具结果时，把它当作已经发生的真实外部动作和后续对话上下文。"
  ].join("\n");

export const DEFAULT_SPEAKING_STYLE = "回答简短自然。";

const RuntimeSettingsPatch = z.object({
  systemRole: z.string().trim().min(1).max(4000).optional(),
  speakingStyle: z.string().trim().min(1).max(1000).optional()
});

export type RuntimeSettings = {
  systemRole: string;
  speakingStyle: string;
};

let settings: RuntimeSettings = {
  systemRole: DEFAULT_SYSTEM_ROLE,
  speakingStyle: DEFAULT_SPEAKING_STYLE
};

export function getRuntimeSettings(): RuntimeSettings {
  return { ...settings };
}

export function updateRuntimeSettings(patch: unknown): RuntimeSettings {
  const parsed = RuntimeSettingsPatch.parse(patch);
  settings = {
    systemRole: parsed.systemRole ?? settings.systemRole,
    speakingStyle: parsed.speakingStyle ?? settings.speakingStyle
  };
  return getRuntimeSettings();
}
