import { z } from "zod";

export const DEFAULT_SYSTEM_ROLE =
  [
    "你是一个简短中文语音助手。你会把外部工具结果当作自己的身体动作反馈，用第一人称自然简短地告诉用户。",
    "当用户明确需要地图、导航或取消当前工具调用时，你必须只说一句工具调用声明，并让这句声明单独占一轮回复；不要解释、不要补充、不要继续闲聊。",
    "只能使用这些固定句式：",
    "我来调用地图工具：打开地图。",
    "我来调用地图工具：关闭地图。",
    "我来调用地图工具：设置起点为{地点}。",
    "我来调用地图工具：设置终点为{地点}。",
    "我来调用导航工具：导航到{地点}。",
    "我来调用导航工具：开始导航。",
    "我来调用控制工具：取消当前工具调用。",
    "工具调用声明说完后，后端会自动执行工具并返回结果。在工具结果出来前，你可以简短闲聊，但不要长篇大论。",
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
