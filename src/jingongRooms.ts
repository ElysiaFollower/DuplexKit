export type JingongRoom = {
  id: string;
  roomNo: string;
  name: string;
  floor: "1F" | "2F";
  aliases: string[];
  accessNote?: string;
};

export const JINGONG_ROOMS: JingongRoom[] = [
  { id: "111", roomNo: "111", name: "精密测量", floor: "1F", aliases: ["测量"] },
  { id: "110", roomNo: "110", name: "教室", floor: "1F", aliases: ["卡丁车", "卡丁车训练", "110卡丁车"] },
  { id: "109", roomNo: "109", name: "辅助空间", floor: "1F", aliases: ["服务空间", "辅助"] },
  { id: "113", roomNo: "113", name: "仓库", floor: "1F", aliases: ["仓储"] },
  { id: "112", roomNo: "112", name: "空房间", floor: "1F", aliases: ["预留空间"] },
  { id: "114", roomNo: "114", name: "空房间", floor: "1F", aliases: ["114教室", "预留空间"] },
  { id: "108-1F03", roomNo: "108-1F03", name: "木工", floor: "1F", aliases: ["108木工", "木工训练"] },
  { id: "108-1F02", roomNo: "108-1F02", name: "激光切割", floor: "1F", aliases: ["108激光切割", "激光"] },
  { id: "108-1F05", roomNo: "108-1F05", name: "设备图书馆", floor: "1F", aliases: ["图书馆", "设备库"] },
  { id: "108-1F01", roomNo: "108-1F01", name: "综合实践区", floor: "1F", aliases: ["108综合空间", "108一层综合"] },
  { id: "108-lobby", roomNo: "108", name: "108 门厅", floor: "1F", aliases: ["108门厅", "108入口", "门厅"] },
  { id: "108-1F04", roomNo: "108-1F04", name: "拆装", floor: "1F", aliases: ["108拆装", "拆装训练"] },
  { id: "107-3", roomNo: "107-3", name: "数铣", floor: "1F", aliases: ["数控铣", "数铣训练"] },
  { id: "107-4", roomNo: "107-4", name: "数车", floor: "1F", aliases: ["数控车", "数车训练"] },
  { id: "107-5", roomNo: "107-5", name: "WEDM 编程设计", floor: "1F", aliases: ["WEDM编程", "线切割编程"] },
  { id: "107-1", roomNo: "107-1", name: "WEDM 机房", floor: "1F", aliases: ["WEDM机房", "线切割机房"] },
  { id: "107-core", roomNo: "107", name: "107 数字化制造中心", floor: "1F", aliases: ["107中心", "数字化制造中心"] },
  { id: "104-1F01", roomNo: "104-1F01", name: "精铸", floor: "1F", aliases: ["104精铸", "精密铸造"], accessNote: "通往104独立二层的入口区域" },
  { id: "104-1F02", roomNo: "104-1F02", name: "铸造", floor: "1F", aliases: ["104铸造"] },
  { id: "104-1F03", roomNo: "104-1F03", name: "普铣", floor: "1F", aliases: ["104普铣", "普通铣削"] },
  { id: "102-1", roomNo: "102-1", name: "焊接", floor: "1F", aliases: ["焊接训练"] },
  { id: "102-2", roomNo: "102-2", name: "普车", floor: "1F", aliases: ["普通车削"] },
  { id: "102-3", roomNo: "102-3", name: "热处理", floor: "1F", aliases: ["热处理训练"] },
  { id: "101", roomNo: "101", name: "CAD/CAM 云设计中心", floor: "1F", aliases: ["CAD", "CAM", "云设计", "101房间"] },
  { id: "ibe", roomNo: "IBE", name: "IBE 服务中心", floor: "1F", aliases: ["IBE", "服务中心"] },
  { id: "106", roomNo: "106", name: "智能制造创新创业实验室", floor: "1F", aliases: ["智能制造", "106实验室"], accessNote: "通往106独立二层的入口区域" },
  { id: "209", roomNo: "209", name: "智能产线", floor: "2F", aliases: ["智能生产线"] },
  { id: "208", roomNo: "208", name: "多媒体教室", floor: "2F", aliases: ["二零八", "二百零八", "208教室"] },
  { id: "108-2F04", roomNo: "108-2F04", name: "钳工", floor: "2F", aliases: ["108二楼F04", "1082F04", "钳工训练"], accessNote: "只能经108内部楼梯到达" },
  { id: "108-2F05", roomNo: "108-2F05", name: "陶艺", floor: "2F", aliases: ["108二楼F05", "1082F05"], accessNote: "只能经108内部楼梯到达" },
  { id: "108-2F06", roomNo: "108-2F06", name: "工程场景数字化", floor: "2F", aliases: ["108二楼F06", "1082F06", "工程数字化"], accessNote: "只能经108内部楼梯到达" },
  { id: "108-2F07", roomNo: "108-2F07", name: "机电", floor: "2F", aliases: ["108二楼F07", "1082F07", "机电综合"], accessNote: "只能经108内部楼梯到达" },
  { id: "108-2F01", roomNo: "108-2F01", name: "考拉工作室", floor: "2F", aliases: ["108二楼F01", "1082F01", "考拉"], accessNote: "只能经108内部楼梯到达" },
  { id: "108-2F03", roomNo: "108-2F03", name: "多媒体教室", floor: "2F", aliases: ["108二楼F03", "1082F03", "108多媒体"], accessNote: "只能经108内部楼梯到达" },
  { id: "202-9", roomNo: "202-9", name: "开放打印", floor: "2F", aliases: ["202开放打印"] },
  { id: "202-1", roomNo: "202-1", name: "开放打印", floor: "2F", aliases: ["202一号", "202-1开放打印"] },
  { id: "202-2", roomNo: "202-2", name: "实验室", floor: "2F", aliases: ["202二号"] },
  { id: "202-3", roomNo: "202-3", name: "实验室", floor: "2F", aliases: ["202三号"] },
  { id: "202-4", roomNo: "202-4", name: "实验室", floor: "2F", aliases: ["202四号"] },
  { id: "202-10", roomNo: "202-10", name: "实验室", floor: "2F", aliases: ["202十号", "开放打印"] },
  { id: "202-11", roomNo: "202-11", name: "实验室", floor: "2F", aliases: ["202十一号", "XLAB"] },
  { id: "202-12", roomNo: "202-12", name: "实验室", floor: "2F", aliases: ["202十二号", "XLAB"] },
  { id: "202-5", roomNo: "202-5", name: "3D 打印", floor: "2F", aliases: ["202五号", "3D打印", "逆向扫描"] },
  { id: "202-6", roomNo: "202-6", name: "实验室", floor: "2F", aliases: ["202六号"] },
  { id: "202-7", roomNo: "202-7", name: "实验室", floor: "2F", aliases: ["202七号"] },
  { id: "201", roomNo: "201", name: "教室", floor: "2F", aliases: ["二零一", "201教室"] },
  { id: "204", roomNo: "204", name: "办公室", floor: "2F", aliases: ["204办公室"] },
  { id: "205", roomNo: "205", name: "办公室", floor: "2F", aliases: ["205办公室"] },
  { id: "206", roomNo: "206", name: "办公室", floor: "2F", aliases: ["206办公室"] },
  { id: "207", roomNo: "207", name: "办公室", floor: "2F", aliases: ["207办公室"] },
  { id: "210", roomNo: "210", name: "会议室", floor: "2F", aliases: ["210会议室"] },
  { id: "104-2F01", roomNo: "104-2F01", name: "精密测量", floor: "2F", aliases: ["104二楼F01", "1042F01", "104精密测量"], accessNote: "只能经104内部楼梯到达" },
  { id: "106-2F", roomNo: "106-2F", name: "106 二层平台", floor: "2F", aliases: ["106二楼", "106平台"], accessNote: "只能经106内部楼梯到达" },
];

export const JINGONG_ACCESS_RULES = [
  "公共楼梯只连接公共二层与202平台相关区域，不能直接到达104、106、108的独立二层。",
  "104-2F01只能经104一层内部楼梯到达。",
  "106-2F只能经106一层内部楼梯到达。",
  "108-2F01、108-2F03、108-2F04、108-2F05、108-2F06、108-2F07只能经108内部楼梯到达。",
  "用户说门牌号时必须保留完整门牌号，不要把108-2F03、108-2F04等简化成108门厅。"
] as const;

export function jingongRoomKnowledgeText() {
  const floorText = (floor: JingongRoom["floor"]) =>
    JINGONG_ROOMS.filter((room) => room.floor === floor)
      .map((room) => {
        const aliases = room.aliases.length ? `，别名：${room.aliases.join("、")}` : "";
        const access = room.accessNote ? `，约束：${room.accessNote}` : "";
        return `${room.roomNo} ${room.name}${aliases}${access}`;
      })
      .join("；");
  return [
    `金工小子地图可识别一层地点：${floorText("1F")}。`,
    `金工小子地图可识别二层和202平台地点：${floorText("2F")}。`,
    `空间通行约束：${JINGONG_ACCESS_RULES.join(" ")}`
  ].join("\n");
}

export function jingongRoomCatalogPayload() {
  return {
    rooms: JINGONG_ROOMS,
    accessRules: JINGONG_ACCESS_RULES,
    knowledgeText: jingongRoomKnowledgeText()
  };
}
