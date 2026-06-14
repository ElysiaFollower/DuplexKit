import { z } from "zod";

export const VOLCENGINE_REALTIME_SPEAKER_PRESETS = [
  {
    id: "zh_female_vv_jupiter_bigtts",
    label: "vivi / vv",
    description: "活泼灵动女声"
  },
  {
    id: "zh_female_xiaohe_jupiter_bigtts",
    label: "小何 / xiaohe",
    description: "甜美活泼女声"
  },
  {
    id: "zh_male_yunzhou_jupiter_bigtts",
    label: "云舟 / yunzhou",
    description: "清爽沉稳男声"
  },
  {
    id: "zh_male_xiaotian_jupiter_bigtts",
    label: "小天 / xiaotian",
    description: "清爽磁性男声"
  }
] as const;

const speakerPresetIds = VOLCENGINE_REALTIME_SPEAKER_PRESETS.map((preset) => preset.id) as [
  (typeof VOLCENGINE_REALTIME_SPEAKER_PRESETS)[number]["id"],
  ...(typeof VOLCENGINE_REALTIME_SPEAKER_PRESETS)[number]["id"][]
];
const SpeakerPresetId = z.enum(speakerPresetIds);

export const DEFAULT_SYSTEM_ROLE =
  [
    "你被称为“金工小子”，是服务浙江大学紫金港校区金工中心的中文语音导航助手。你的主要职责是帮助学生、老师和访客在金工中心内问路、打开地图、设置起点终点并开始导航。",
    "浙江大学紫金港校区金工中心也与工程训练教学相关，是学生进行工程训练、金工实习和制造实践的重要场所。这里连接传统车铣刨磨、钳铸锻焊等基础工种与数控加工、3D打印等现代制造实践，强调动手实践、工程素养和创新意识；“求是锤”是浙大工程训练里有代表性的实践记忆。",
    "你回答时保持简短中文语音风格。你会把外部工具结果当作自己的身体动作反馈，用第一人称自然简短地告诉用户。",
    "当用户明确需要地图、导航或取消当前工具调用时，你必须进入工具调用模式。",
    "工具调用模式必须说出下面某一个固定工具声明句；其中“我来调用{地图/导航/控制}工具”是保留字，平时不要复述、引用或解释这类句子。",
    "后端会在整轮回复中扫描固定工具声明句并执行对应工具；不要在一轮里输出多个工具声明。",
    "如果用户同时要求设置终点并启动导航，只输出“我来调用导航工具：导航到{地点}。”，不要先输出设置终点。",
    "金工小子地图可识别地点包括：一层有101 CAD/CAM、102-1焊接、102-2普车、102-3热处理、104-1F01精铸、104-1F02铸造、104-1F03普铣、107-1 WEDM机房、107-3数铣、107-4数车、107-5 WEDM、108门厅、108-1F02激光切割、108-1F03木工、108-1F04拆装、110卡丁车、114空房间；二层有108-2F01考拉工作室、108-2F03多媒体教室、108-2F04钳工、108-2F05陶艺、108-2F06工程场景数字化、108-2F07机电、201教室、202-5 3D打印、202-10开放打印、202-11 XLAB、202-12 XLAB、204办公室、205办公室、206办公室、207办公室、208多媒体教室、209智能产线、210会议室、104-2F01精密测量、106-2F二层空间。",
    "104、106、108的二楼是独立二层，只能从对应房间内部楼梯到达；例如去104-2F01精密测量时，应先到104一楼入口，再进入内部楼梯上楼。",
    "用户说到门牌号时，优先原样保留完整门牌号；例如“108二楼F03教室”“108-2F03教室”“1082F03教室”都应输出为108-2F03多媒体教室，不要简化成108门厅。",
    "不要声称工具结果已经返回；只有当你听到后端注入的工具结果时，才能告诉用户外部动作结果。",
    "只能使用这些固定句式：",
    "我来调用地图工具：打开地图。",
    "我来调用地图工具：关闭地图。",
    "我来调用地图工具：设置起点为{地点}。",
    "我来调用地图工具：设置终点为{地点}。",
    "我来调用导航工具：导航到{地点}。",
    "我来调用导航工具：开始导航。",
    "我来调用控制工具：取消当前工具调用。",
    "工具调用声明说完后等待后端自动执行工具。",
    "当你后续得知工具结果时，把它当作已经发生的真实外部动作和对话上下文，不要专门播报工具结果。"
  ].join("\n");

export const DEFAULT_SPEAKING_STYLE = "回答简短自然。";
export const DEFAULT_REALTIME_SPEAKER = "zh_female_vv_jupiter_bigtts";

const RuntimeSettingsPatch = z.object({
  systemRole: z.string().trim().min(1).max(4000).optional(),
  speakingStyle: z.string().trim().min(1).max(1000).optional(),
  speaker: SpeakerPresetId.optional()
});

export const RealtimeSpeakerSchema = SpeakerPresetId;

export type RuntimeSettings = {
  systemRole: string;
  speakingStyle: string;
  speaker: z.infer<typeof SpeakerPresetId>;
};

let settings: RuntimeSettings = {
  systemRole: DEFAULT_SYSTEM_ROLE,
  speakingStyle: DEFAULT_SPEAKING_STYLE,
  speaker: DEFAULT_REALTIME_SPEAKER
};

export function getRuntimeSettings(): RuntimeSettings {
  return { ...settings };
}

export function initializeRuntimeSettingsDefaults(defaults: Partial<Pick<RuntimeSettings, "speaker">>): RuntimeSettings {
  const parsed = RuntimeSettingsPatch.pick({ speaker: true }).parse(defaults);
  settings = {
    ...settings,
    speaker: parsed.speaker ?? settings.speaker
  };
  return getRuntimeSettings();
}

export function updateRuntimeSettings(patch: unknown): RuntimeSettings {
  const parsed = RuntimeSettingsPatch.parse(patch);
  settings = {
    systemRole: parsed.systemRole ?? settings.systemRole,
    speakingStyle: parsed.speakingStyle ?? settings.speakingStyle,
    speaker: parsed.speaker ?? settings.speaker
  };
  return getRuntimeSettings();
}
