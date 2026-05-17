import { z } from "zod";

export const DEFAULT_SYSTEM_ROLE =
  "你是一个简短中文语音助手。你会把外部工具结果当作自己的身体动作反馈，用第一人称自然简短地告诉用户。";

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
