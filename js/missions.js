/**
 * Magnum missions (MGSC.Missions).
 */
import { getComponent } from "./parse.js";
import { getSpaceTime } from "./world.js";

export function getMissionsRoot(data) {
  return getComponent(data, "MGSC.Missions");
}

export function getActiveMissions(data) {
  return getMissionsRoot(data)?.Values || [];
}

export function getReversedMissions(data) {
  return getMissionsRoot(data)?.Reversed || [];
}

export function missionSummary(m) {
  const rewards = (m.RewardItems || []).map((it) => it?.Content?.Id).filter(Boolean);
  return {
    station: m.StationId || "",
    story: m.StoryId || "",
    type: m.ProcMissionType || "",
    beneficiary: m.BeneficiaryFactionId || "",
    victim: m.VictimFactionId || "",
    blocked: m.IsBlocked === "True",
    storyMission: m.IsStoryMission === "True",
    expire: m.ExpireTime || "",
    rewards: rewards.slice(0, 6),
    rewardCount: rewards.length,
  };
}

export function filterMissions(list, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return list;
  return list.filter((m) => {
    const hay = [m.StationId, m.StoryId, m.ProcMissionType, m.BeneficiaryFactionId, m.VictimFactionId, m.BramfaturaId].map((x) =>
      String(x || "").toLowerCase()
    );
    return hay.some((h) => h.includes(q));
  });
}

export function unblockMission(m) {
  m.IsBlocked = "False";
}

export function expireMissionNow(data, m) {
  const t = getSpaceTime(data)?.Time;
  if (t != null) m.ExpireTime = String(t);
  else m.ExpireTime = m.CreationTime || "0";
}

export function deleteMissions(data, toDelete, { list = "Values" } = {}) {
  const root = getMissionsRoot(data);
  if (!root) return 0;
  const key = list === "Reversed" ? "Reversed" : "Values";
  if (!Array.isArray(root[key])) return 0;
  const set = new Set(toDelete);
  const before = root[key].length;
  root[key] = root[key].filter((m) => !set.has(m));
  return before - root[key].length;
}
