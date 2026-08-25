import React, { useEffect, useReducer, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/* ============================================================
   INCENSION CORE V5.1 (MULTI-STREAM DETERMINISTIC EDITION)
   ============================================================ */

const SAVE_KEY = "@incension_living_world_v5";
const WORLD_VERSION = "5.1.0";
const WORLD_SEED = 4291;

/* ============================================================
   1. ISOLATED SUB-SYSTEM DETERMINISTIC RNG
   ============================================================ */

class DeterministicRNG {
  constructor(seed = WORLD_SEED, state = null) {
    this.initialSeed = seed >>> 0;
    this.seed = state !== null ? state >>> 0 : this.initialSeed;
    this.callCount = 0;
  }

  next() {
    this.callCount += 1;
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  d(sides) {
    if (sides <= 0) return 0;
    return Math.floor(this.next() * sides) + 1;
  }

  range(min, max) {
    if (max <= min) return min;
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  chance(percent) {
    return this.next() * 100 < percent;
  }

  choice(array) {
    if (!array || array.length === 0) return null;
    return array[Math.floor(this.next() * array.length)];
  }

  serialize() {
    return {
      initialSeed: this.initialSeed,
      currentState: this.seed >>> 0,
      callCount: this.callCount,
    };
  }

  static deserialize(data) {
    const instance = new DeterministicRNG(data.initialSeed, data.currentState);
    instance.callCount = data.callCount || 0;
    return instance;
  }
}

// Master + Sub-system streams to prevent combat actions from ruining economic determinism
const masterRng = new DeterministicRNG(WORLD_SEED);
const rngStreams = {
  npc: new DeterministicRNG(WORLD_SEED + 101),
  faction: new DeterministicRNG(WORLD_SEED + 202),
  economy: new DeterministicRNG(WORLD_SEED + 303),
  ecology: new DeterministicRNG(WORLD_SEED + 404),
  threat: new DeterministicRNG(WORLD_SEED + 505),
  event: new DeterministicRNG(WORLD_SEED + 606),
  combat: new DeterministicRNG(WORLD_SEED + 707)
};

function serializeAllRNG() {
  return {
    master: masterRng.serialize(),
    streams: Object.fromEntries(
      Object.entries(rngStreams).map(([key, value]) => [key, value.serialize()])
    )
  };
}

function restoreAllRNG(data) {
  if (!data) return;
  if (data.master) {
    const restored = DeterministicRNG.deserialize(data.master);
    masterRng.seed = restored.seed;
    masterRng.callCount = restored.callCount;
  }
  if (data.streams) {
    Object.entries(data.streams).forEach(([key, saved]) => {
      if (!rngStreams[key]) return;
      const restored = DeterministicRNG.deserialize(saved);
      rngStreams[key].seed = restored.seed;
      rngStreams[key].callCount = restored.callCount;
    });
  }
}

/* ============================================================
   2. INTENT PARSER
   ============================================================ */

class IntentParser {
  static parse(input) {
    const text = input.trim();
    if (!text) return { rawInput: "", totalSteps: 0, actionQueue: [] };

    const clauses = text
      .split(/[,;.]|\band\b|\bthen\b/i)
      .map((c) => c.trim())
      .filter(Boolean);

    const steps = clauses.map((clause, index) => {
      const lower = clause.toLowerCase();
      let type = "CUSTOM";
      let verb = "EXECUTE";
      let target = "ENVIRONMENT";

      if (/\b(sneak|hide|stealth|conceal|crawl|silently)\b/.test(lower)) {
        type = "STEALTH"; verb = "INFILTRATE";
      } else if (/\b(climb|move|run|approach|jump|travel|flee|retreat)\b/.test(lower)) {
        type = "MOVEMENT"; verb = "REPOSITION";
      } else if (/\b(attack|strike|hit|shoot|stab|slash|destroy|kill|rip|overload)\b/.test(lower)) {
        type = "ATTACK"; verb = "EXECUTE_STRIKE";
      } else if (/\b(scan|look|investigate|examine|search|observe|study|inspect)\b/.test(lower)) {
        type = "INVESTIGATE"; verb = "PERCEIVE";
      } else if (/\b(cast|use|channel|sprout|activate|manifest|syntax)\b/.test(lower)) {
        type = "ABILITY"; verb = "MANIFEST_SYNTAX";
      } else if (/\b(talk|speak|ask|say|negotiate|persuade|threaten)\b/.test(lower)) {
        type = "SOCIAL"; verb = "COMMUNICATE";
      }

      if (/\b(drone|enemy|guard|soldier|monster|beast|commander)\b/.test(lower)) target = "HOSTILE";
      else if (/\b(tower|wall|bridge|door|gate|cover|structure)\b/.test(lower)) target = "STRUCTURE";
      else if (/\b(code|syntax|matrix|core|node|archive)\b/.test(lower)) target = "ECO_SYNTAX";
      else if (/\b(kael|seraphine|vael|npc|person|merchant)\b/.test(lower)) target = "NPC";

      return { stepIndex: index + 1, type, verb, target, rawClause: clause };
    });

    return { rawInput: input, totalSteps: steps.length, actionQueue: steps };
  }
}

/* ============================================================
   3. INITIAL WORLD SCHEMA
   ============================================================ */

function createInitialWorldState() {
  return {
    meta: {
      schemaVersion: WORLD_VERSION,
      seed: WORLD_SEED,
      tickCount: 0,
      lastSimulatedTime: Date.now(),
      activeAct: "ACT I // THE SCATTERED SPARK",
    },
    time: {
      year: 1, month: 9, season: "AUTUMN", day: 183, hour: 8, minute: 0, timeOfDay: "MORNING",
    },
    environment: {
      stability: 82, wildwood: 24, energy: 12, corruption: 5, weather: "LIGHT DEBRIS SHOWER",
    },
    player: {
      id: "player_fasa", name: "Fasa Maki", title: "THE UNWRITTEN ANOMALY",
      role: "Reality-Bending Eco-Syntax User", location: "Sector 09",
      hp: 120, maxHp: 120, stamina: 100, maxStamina: 100, atk: 25, def: 12,
      affinity: "LIQUID EMERALD ECO-SYNTAX",
      abilities: ["System-Init", "Sprout_Lattice_V1", "Void_Rip_V2"],
      gold: 150,
      reputation: { Sovereign: -20, Archivists: 15, Horizon: 5 },
    },
    inventory: [
      { id: "i1", name: "Cracked Void Blade", type: "WEAPON", bonus: 15, equipped: true },
      { id: "i2", name: "Emerald Syntax Armor", type: "ARMOR", bonus: 40, equipped: true },
      { id: "i3", name: "Maki Beacon Transponder", type: "ACCESSORY", bonus: 10, equipped: false },
    ],
    locations: {
      "Sector 09": { danger: 30, prosperity: 65, control: "The Archivists", fortified: false },
      "Upper Perimeter": { danger: 85, prosperity: 90, control: "The Sovereign Network", fortified: true },
      "Deep Void": { danger: 60, prosperity: 40, control: "The Horizon Fleet", fortified: false },
    },
    npcs: [
      {
        id: "npc1", name: "Kael Vance", role: "Iron Guild Quartermaster", location: "Sector 09", alive: true,
        needs: { food: 80, security: 60, gold: 40 },
        goals: ["Stockpile Iron Ore", "Monitor Sovereign Patrols"],
        currentActivity: "Working at Forge",
        relationships: { player: { trust: 50, fear: 10, respect: 40, hatred: 0 } },
        memories: [],
      },
      {
        id: "npc2", name: "Seraphine Vane", role: "Sovereign Drone Handler", location: "Upper Perimeter", alive: true,
        needs: { food: 90, security: 90, gold: 10 },
        goals: ["Scan for Maki Biomass", "Maintain Drone Telemetry"],
        currentActivity: "Patrolling Perimeter",
        relationships: { player: { trust: 0, fear: 70, respect: 20, hatred: 60 } },
        memories: [],
      },
    ],
    factions: [
      {
        id: "f1", name: "The Sovereign Network", status: "HOSTILE", power: 85, territory: "Upper Perimeter",
        resources: { iron: 400, food: 200, energy: 900 },
        relations: { f2: { hostility: 80, trust: 10 }, f3: { hostility: 50, trust: 30 } },
      },
      {
        id: "f2", name: "The Archivists", status: "FRIENDLY", power: 40, territory: "Sector 09",
        resources: { iron: 120, food: 350, energy: 200 },
        relations: { f1: { hostility: 80, trust: 10 }, f3: { hostility: 20, trust: 60 } },
      },
      {
        id: "f3", name: "The Horizon Fleet", status: "REVERED", power: 65, territory: "Deep Void",
        resources: { iron: 250, food: 150, energy: 500 },
        relations: { f1: { hostility: 50, trust: 30 }, f2: { hostility: 20, trust: 60 } },
      },
    ],
    wars: [
      {
        id: "war_1", attackerId: "f1", defenderId: "f2", contestedLocation: "Sector 09",
        intensity: 65, status: "ACTIVE", frontlineLog: ["Sovereign strike teams probed Sector 09 defenses."]
      }
    ],
    economy: {
      resources: { food: 100, iron: 45, energyCores: 12 },
      marketPrices: { food: 2, iron: 5, energyCores: 25 },
      production: { food: 5, iron: 3, energyCores: 1 },
    },
    ecology: {
      prey: 120, predators: 35, glitchSprouts: 18, apexPredator: "Wildwood Root-Beast",
    },
    threats: [
      { id: "t1", title: "SOVEREIGN PERIMETER SWEEP", severity: "HIGH", progress: 40, location: "Upper Perimeter", active: true },
      { id: "t2", title: "WILDWOOD ROOT INTRUSION", severity: "MEDIUM", progress: 15, location: "Sector 09", active: true },
    ],
    nemesis: {
      id: "nemesis_1", name: "Purge-Unit Vael", type: "Sovereign Commander", power: 45, location: "Upper Perimeter",
      status: "TRACKING TARGET", encountered: false, grudgeLevel: 20, adaptations: [],
    },
    rumors: [
      { text: "The Iron Guild is buying raw iron ore at double market rate.", truth: true, source: "Kael Vance" },
    ],
    eventsHistory: [],
    objectives: [{ id: "o1", text: "Locate the Prime Core anchor point", complete: false }],
    worldFlags: { kaelKilled: false, bridgeDestroyed: false, archivistsAlerted: false },
    chronicle: [
      { type: "system", text: "⚡ INCENSION CORE V5.1 ONLINE." },
      { type: "story", text: "The Fractured Expanse drifts beneath a sky that no longer obeys ordinary physics." },
      { type: "gm", text: "👁️ THE GAME MASTER: The world is already moving. What will you do?" },
    ],
  };
}

/* ============================================================
   4. WORLD REDUCER
   ============================================================ */

function worldReducer(state, action) {
  switch (action.type) {
    case "ADVANCE_TIME": {
      let { year, month, season, day, hour, minute } = state.time;
      minute += action.payload.minutes;

      while (minute >= 60) { minute -= 60; hour++; }
      while (hour >= 24) { hour -= 24; day++; }
      while (day > 360) { day -= 360; year++; }

      const timeOfDay = hour >= 5 && hour < 12 ? "MORNING" : hour >= 12 && hour < 17 ? "AFTERNOON" : hour >= 17 && hour < 21 ? "EVENING" : "NIGHT";
      const monthIndex = Math.floor((day - 1) / 30);
      const seasons = ["WINTER", "WINTER", "SPRING", "SPRING", "SPRING", "SUMMER", "SUMMER", "SUMMER", "AUTUMN", "AUTUMN", "AUTUMN", "WINTER"];
      season = seasons[monthIndex % seasons.length];
      month = (monthIndex % 12) + 1;

      return {
        ...state,
        meta: {
          ...state.meta,
          tickCount: state.meta.tickCount + 1,
          lastSimulatedTime: Date.now()
        },
        time: { year, month, season, day, hour, minute, timeOfDay },
      };
    }

    case "UPDATE_NPC":
      return {
        ...state,
        npcs: state.npcs.map((npc) => npc.id === action.payload.id ? { ...npc, ...action.payload.updates } : npc),
      };

    case "UPDATE_FACTIONS":
      return { ...state, factions: action.payload };

    case "UPDATE_WARS":
      return { ...state, wars: action.payload };

    case "UPDATE_LOCATION_CONTROL": {
      const { locationId, newControl, dangerIncrease } = action.payload;
      const currentLoc = state.locations[locationId];
      if (!currentLoc) return state;
      return {
        ...state,
        locations: {
          ...state.locations,
          [locationId]: { ...currentLoc, control: newControl, danger: Math.min(100, currentLoc.danger + dangerIncrease) }
        }
      };
    }

    case "UPDATE_ECONOMY":
      return { ...state, economy: action.payload };

    case "UPDATE_ECOLOGY":
      return { ...state, ecology: action.payload };

    case "UPDATE_ENVIRONMENT":
      return { ...state, environment: { ...state.environment, ...action.payload } };

    case "UPDATE_THREATS":
      return { ...state, threats: action.payload };

    case "UPDATE_NEMESIS":
      return { ...state, nemesis: { ...state.nemesis, ...action.payload } };

    case "UPDATE_PLAYER":
      return { ...state, player: { ...state.player, ...action.payload } };

    case "RECORD_EVENT":
      return {
        ...state,
        eventsHistory: [action.payload, ...state.eventsHistory],
        chronicle: [...state.chronicle, { type: "system", text: `⚡ [${action.payload.timestamp}] ${action.payload.title}: ${action.payload.desc}` }],
      };

    case "APPEND_CHRONICLE":
      return { ...state, chronicle: [...state.chronicle, action.payload] };

    case "SET_WORLD_STATE":
      return action.payload;

    default:
      return state;
  }
}

/* ============================================================
   5. SUB-SYSTEM SIMULATION ENGINES
   ============================================================ */

function simulateNPCs(state, dispatch) {
  const rng = rngStreams.npc;
  state.npcs.forEach((npc) => {
    if (!npc.alive) return;

    const foodNeed = Math.max(0, npc.needs.food - rng.range(1, 4));
    const securityNeed = Math.max(0, npc.needs.security - rng.range(0, 2));
    let activity = npc.currentActivity;

    if (foodNeed < 30) activity = "SEARCHING FOR FOOD";
    else if (securityNeed < 30) activity = "SEEKING SAFETY";
    else if (rng.chance(20)) {
      activity = rng.choice(["PATROLLING", "TRADING", "RESEARCHING", "WORKING", "RESTING"]);
    }

    dispatch({
      type: "UPDATE_NPC",
      payload: { id: npc.id, updates: { currentActivity: activity, needs: { ...npc.needs, food: foodNeed, security: securityNeed } } },
    });
  });
}

function simulateFactionsAndWars(state, dispatch) {
  const rng = rngStreams.faction;
  const updatedFactions = state.factions.map((faction) => {
    let powerChange = rng.range(-2, 2);
    const resources = faction.resources || { food: 100, iron: 100, energy: 100 };

    return {
      ...faction,
      power: Math.max(10, Math.min(100, faction.power + powerChange)),
      resources: {
        food: Math.max(0, resources.food + rng.range(-8, 5)),
        iron: Math.max(0, resources.iron + rng.range(-6, 6)),
        energy: Math.max(0, resources.energy + rng.range(-10, 8)),
      },
    };
  });

  dispatch({ type: "UPDATE_FACTIONS", payload: updatedFactions });

  // War Resolution Engine
  if (state.wars && state.wars.length > 0) {
    const updatedWars = state.wars.map(war => {
      if (war.status !== "ACTIVE") return war;
      const attacker = updatedFactions.find(f => f.id === war.attackerId);
      const defender = updatedFactions.find(f => f.id === war.defenderId);
      const location = state.locations[war.contestedLocation];

      if (!attacker || !defender || !location) return war;

      const attackVal = attacker.power + rng.range(-5, 10);
      const defenseVal = defender.power + (location.fortified ? 20 : 0) + rng.range(-5, 5);

      if (attackVal > defenseVal + 25) {
        dispatch({
          type: "UPDATE_LOCATION_CONTROL",
          payload: { locationId: war.contestedLocation, newControl: attacker.name, dangerIncrease: 15 }
        });
        dispatch({
          type: "APPEND_CHRONICLE",
          payload: { type: "world", text: `🚩 TERRITORY CONQUEST: ${attacker.name} broke defensive lines and seized control of ${war.contestedLocation}!` }
        });
      }
      return war;
    });
    dispatch({ type: "UPDATE_WARS", payload: updatedWars });
  }
}

function simulateEconomy(state, dispatch) {
  const rng = rngStreams.economy;
  const economy = state.economy;

  const resources = {
    food: Math.max(0, economy.resources.food + economy.production.food + rng.range(-5, 4)),
    iron: Math.max(0, economy.resources.iron + economy.production.iron + rng.range(-4, 3)),
    energyCores: Math.max(0, economy.resources.energyCores + economy.production.energyCores + rng.range(-1, 1)),
  };

  const marketPrices = {
    food: Math.max(1, economy.marketPrices.food + (resources.food < 50 ? 1 : rng.range(-1, 1))),
    iron: Math.max(1, economy.marketPrices.iron + (resources.iron < 30 ? 1 : rng.range(-1, 1))),
    energyCores: Math.max(5, economy.marketPrices.energyCores + (resources.energyCores < 8 ? 2 : rng.range(-2, 2))),
  };

  dispatch({ type: "UPDATE_ECONOMY", payload: { ...economy, resources, marketPrices } });
}

function simulateEcology(state, dispatch) {
  const rng = rngStreams.ecology;
  const ecology = state.ecology;

  let prey = ecology.prey + rng.range(-4, 6);
  let predators = ecology.predators + rng.range(-2, 3);
  let sprouts = ecology.glitchSprouts + rng.range(-1, 3);

  if (prey < 40) predators -= 3;
  if (prey > 150) predators += 3;

  dispatch({
    type: "UPDATE_ECOLOGY",
    payload: { prey: Math.max(0, prey), predators: Math.max(0, predators), glitchSprouts: Math.max(0, sprouts), apexPredator: predators > 50 ? "Greater Wildwood Devourer" : "Wildwood Root-Beast" },
  });
}

function simulateThreats(state, dispatch) {
  const rng = rngStreams.threat;
  const threats = state.threats.map((threat) => {
    const danger = state.locations?.[threat.location]?.danger || 50;
    return { ...threat, progress: Math.min(100, threat.progress + rng.range(0, Math.max(1, Math.floor(danger / 30)))) };
  });

  const active = threats.filter((t) => t.progress < 100);
  dispatch({ type: "UPDATE_THREATS", payload: active });
}

function simulateNemesis(state, dispatch) {
  const rng = rngStreams.threat;
  const nemesis = state.nemesis;
  let grudge = nemesis.grudgeLevel + (state.meta.tickCount % 3 === 0 ? rng.range(0, 3) : 0);

  dispatch({
    type: "UPDATE_NEMESIS",
    payload: { grudgeLevel: Math.min(100, grudge), status: grudge > 70 ? "ACTIVE HUNT" : "TRACKING TARGET" },
  });
}

function triggerFailureCausality(state, dispatch, damage = 6) {
  const stability = Math.max(0, state.environment.stability - damage);
  dispatch({ type: "UPDATE_ENVIRONMENT", payload: { stability } });

  if (stability < 50) {
    const economy = state.economy;
    dispatch({
      type: "UPDATE_ECONOMY",
      payload: { ...economy, marketPrices: { food: economy.marketPrices.food + 2, iron: economy.marketPrices.iron + 4, energyCores: economy.marketPrices.energyCores } },
    });
    dispatch({ type: "APPEND_CHRONICLE", payload: { type: "system", text: "⚡ CAUSALITY RIPPLE: Environmental instability increased food and iron market prices." } });
  }
}

/* ============================================================
   6. SIMULATION ORCHESTRATOR
   ============================================================ */

function simulationTick(dispatch, getState, minutes = 60) {
  dispatch({ type: "ADVANCE_TIME", payload: { minutes } });

  let state = getState();
  simulateNPCs(state, dispatch);

  state = getState();
  simulateFactionsAndWars(state, dispatch);

  state = getState();
  simulateEconomy(state, dispatch);

  state = getState();
  simulateEcology(state, dispatch);

  state = getState();
  simulateThreats(state, dispatch);

  state = getState();
  simulateNemesis(state, dispatch);

  if (rngStreams.event.chance(7)) {
    const events = [
      { title: "SOVEREIGN SWEEP", desc: "Drone formations scanned outer sectors." },
      { title: "ECO-SYNTAX SPROUT", desc: "Emerald syntax cluster emerged in Sector 09." },
    ];
    const event = rngStreams.event.choice(events);
    dispatch({
      type: "RECORD_EVENT",
      payload: { ...event, timestamp: `Y${state.time.year} D${state.time.day} ${String(state.time.hour).padStart(2, "0")}:00` },
    });
  }
}

/* ============================================================
   7. ACTION RESOLUTION & PERSISTENCE
   ============================================================ */

function processPlayerAction(input, dispatch, getState) {
  const parsed = IntentParser.parse(input);
  if (parsed.totalSteps === 0) return;

  const logs = [];
  const combatRng = rngStreams.combat;

  for (const step of parsed.actionQueue) {
    let roll = combatRng.d(20);
    let modifier = step.type === "ATTACK" ? Math.floor(getState().player.atk / 10) : 0;
    const total = roll + modifier;
    const success = total >= 10 || roll === 20;

    logs.push(`STEP ${step.stepIndex} // ${step.type} // ${success ? "SUCCESS" : "FAILURE"} // ROLL ${roll}+${modifier}`);

    if (!success) {
      triggerFailureCausality(getState(), dispatch, 6);
    }
  }

  dispatch({ type: "APPEND_CHRONICLE", payload: { type: "gm", text: `> INTENT: ${input}` } });
  logs.forEach((log) => dispatch({ type: "APPEND_CHRONICLE", payload: { type: "system", text: `> ${log}` } }));

  simulationTick(dispatch, getState, 60);
}

async function saveGame(state) {
  try {
    const payload = {
      version: WORLD_VERSION,
      worldState: state,
      rngState: serializeAllRNG(),
      savedAt: Date.now(),
    };
    await AsyncStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.log("SAVE ERROR", error);
  }
}

async function loadGame() {
  try {
    const json = await AsyncStorage.getItem(SAVE_KEY);
    if (!json) return null;
    const data = JSON.parse(json);
    if (data.rngState) restoreAllRNG(data.rngState);
    return data.worldState;
  } catch (error) {
    console.log("LOAD ERROR", error);
    return null;
  }
}

function processOfflineTime(dispatch, getState) {
  const state = getState();
  const elapsed = Date.now() - state.meta.lastSimulatedTime;
  const elapsedMinutes = Math.floor(elapsed / 60000);
  const minutes = Math.min(2880, elapsedMinutes);

  if (minutes < 10) return;
  const hours = Math.floor(minutes / 60);

  for (let i = 0; i < hours; i++) {
    simulationTick(dispatch, getState, 60);
  }

  dispatch({
    type: "APPEND_CHRONICLE",
    payload: { type: "system", text: `⚡ OFFLINE SIMULATION: ${hours} hours of world activity occurred while away.` },
  });
}

/* ============================================================
   8. UI COMPONENTS & MAIN APP
   ============================================================ */

function HeaderHUD({ state }) {
  const p = state.player;
  return (
    <View style={styles.header}>
      <Text style={styles.logo}>INCENSION</Text>
      <Text style={styles.subtitle}>LIVING WORLD ENGINE V5.1</Text>
      <View style={styles.hudRow}>
        <Text style={styles.hudText}>HP {p.hp}/{p.maxHp}</Text>
        <Text style={styles.hudText}>STA {p.stamina}</Text>
        <Text style={styles.hudText}>⚡ {state.environment.energy}</Text>
        <Text style={styles.hudText}>STAB {state.environment.stability}%</Text>
      </View>
      <Text style={styles.time}>
        Y{state.time.year} // D{state.time.day} // {String(state.time.hour).padStart(2, "0")}:{String(state.time.minute).padStart(2, "0")} // {state.time.season}
      </Text>
    </View>
  );
}

function ChronicleTab({ state, input, setInput, execute }) {
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.chronicle} contentContainerStyle={{ paddingBottom: 20 }}>
        {state.chronicle.slice().reverse().map((entry, index) => (
          <View key={index} style={styles.logBox}>
            <Text style={[styles.logText, entry.type === "gm" && styles.gmText, entry.type === "world" && styles.worldText]}>
              {entry.text}
            </Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.inputArea}>
        <TextInput
          value={input} onChangeText={setInput} placeholder="What do you do?" placeholderTextColor="#555" style={styles.input} multiline
        />
        <TouchableOpacity onPress={execute} style={styles.executeButton}>
          <Text style={styles.executeText}>EXECUTE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function WorldTab({ state }) {
  return (
    <ScrollView>
      <Text style={styles.sectionTitle}>WORLD STATUS</Text>
      <Stat label="Stability" value={`${state.environment.stability}%`} />
      <Stat label="Corruption" value={`${state.environment.corruption}%`} />
      <Stat label="Prey / Predators" value={`${state.ecology.prey} / ${state.ecology.predators}`} />
      <Stat label="Apex Predator" value={state.ecology.apexPredator} />
      <Text style={styles.sectionTitle}>ACTIVE THREATS</Text>
      {state.threats.map((t) => (
        <View key={t.id} style={styles.card}>
          <Text style={styles.cardTitle}>{t.title}</Text>
          <Text style={styles.cardText}>Location: {t.location} | Severity: {t.severity} | Progress: {t.progress}%</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function FactionsTab({ state }) {
  return (
    <ScrollView>
      <Text style={styles.sectionTitle}>FACTIONS & TERRITORY</Text>
      {state.factions.map((f) => (
        <View key={f.id} style={styles.card}>
          <Text style={styles.cardTitle}>{f.name}</Text>
          <Text style={styles.cardText}>Power: {f.power} | Status: {f.status} | Territory: {f.territory}</Text>
          <Text style={styles.cardText}>Resources: Food {f.resources.food} | Iron {f.resources.iron} | Energy {f.resources.energy}</Text>
        </View>
      ))}
      <Text style={styles.sectionTitle}>NEMESIS STATUS</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{state.nemesis.name}</Text>
        <Text style={styles.cardText}>Power: {state.nemesis.power} | Grudge: {state.nemesis.grudgeLevel} | Status: {state.nemesis.status}</Text>
      </View>
    </ScrollView>
  );
}

function CharacterTab({ state }) {
  const p = state.player;
  return (
    <ScrollView>
      <Text style={styles.sectionTitle}>{p.name}</Text>
      <View style={styles.card}>
        <Text style={styles.cardText}>{p.title} • {p.role}</Text>
        <Text style={styles.cardText}>Location: {p.location} | HP: {p.hp}/{p.maxHp} | Gold: {p.gold}</Text>
        <Text style={styles.cardText}>Affinity: {p.affinity}</Text>
      </View>
      <Text style={styles.sectionTitle}>ABILITIES</Text>
      {p.abilities.map((a) => (
        <View key={a} style={styles.card}><Text style={styles.cardText}>◈ {a}</Text></View>
      ))}
    </ScrollView>
  );
}

function DebugTab({ state, forceTick }) {
  return (
    <ScrollView>
      <Text style={styles.sectionTitle}>ENGINE DEBUG</Text>
      <Text style={styles.cardText}>Version: {WORLD_VERSION} | Ticks: {state.meta.tickCount}</Text>
      <TouchableOpacity onPress={forceTick} style={styles.debugButton}>
        <Text style={styles.executeText}>FORCE 1 HOUR TICK</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.cardText}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(worldReducer, undefined, createInitialWorldState);
  const [tab, setTab] = useState("CHRONICLE");
  const [input, setInput] = useState("");

  const stateRef = useRef(state);
  stateRef.current = state;
  const getState = () => stateRef.current;

  useEffect(() => {
    let mounted = true;
    async function initialize() {
      const saved = await loadGame();
      if (!mounted) return;
      if (saved) {
        dispatch({ type: "SET_WORLD_STATE", payload: saved });
        setTimeout(() => processOfflineTime(dispatch, getState), 100);
      }
    }
    initialize();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => saveGame(state), 500);
    return () => clearTimeout(timer);
  }, [state]);

  function executeAction() {
    if (!input.trim()) return;
    processPlayerAction(input, dispatch, getState);
    setInput("");
  }

  function forceTick() {
    simulationTick(dispatch, getState, 60);
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <HeaderHUD state={state} />
        <View style={styles.tabs}>
          {["CHRONICLE", "CHARACTER", "FACTIONS", "WORLD", "DEBUG"].map((name) => (
            <TouchableOpacity key={name} onPress={() => setTab(name)} style={[styles.tab, tab === name && styles.activeTab]}>
              <Text style={[styles.tabText, tab === name && styles.activeTabText]}>{name}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.body}>
          {tab === "CHRONICLE" && <ChronicleTab state={state} input={input} setInput={setInput} execute={executeAction} />}
          {tab === "CHARACTER" && <CharacterTab state={state} />}
          {tab === "FACTIONS" && <FactionsTab state={state} />}
          {tab === "WORLD" && <WorldTab state={state} />}
          {tab === "DEBUG" && <DebugTab state={state} forceTick={forceTick} />}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ============================================================
   STYLES
   ============================================================ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050505" },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#222" },
  logo: { color: "#00ff88", fontSize: 24, fontWeight: "900", letterSpacing: 4 },
  subtitle: { color: "#666", fontSize: 9, letterSpacing: 2, marginTop: 2 },
  hudRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  hudText: { color: "#ddd", fontSize: 11, fontWeight: "bold" },
  time: { color: "#777", fontSize: 10, marginTop: 8 },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#222" },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  activeTab: { borderBottomWidth: 2, borderBottomColor: "#00ff88" },
  tabText: { color: "#555", fontSize: 9, fontWeight: "bold" },
  activeTabText: { color: "#00ff88" },
  body: { flex: 1, padding: 12 },
  chronicle: { flex: 1 },
  logBox: { marginBottom: 8, padding: 10, backgroundColor: "#0b0b0b", borderLeftWidth: 2, borderLeftColor: "#222" },
  logText: { color: "#aaa", fontSize: 13, lineHeight: 20 },
  gmText: { color: "#00ff88" },
  worldText: { color: "#ffcc66" },
  inputArea: { paddingTop: 8 },
  input: { minHeight: 50, maxHeight: 100, backgroundColor: "#101010", borderWidth: 1, borderColor: "#292929", borderRadius: 6, color: "#fff", padding: 12, fontSize: 14 },
  executeButton: { marginTop: 8, padding: 12, backgroundColor: "#00aa66", borderRadius: 6, alignItems: "center" },
  executeText: { color: "#000", fontWeight: "900", letterSpacing: 1 },
  sectionTitle: { color: "#00ff88", fontSize: 15, fontWeight: "900", marginTop: 10, marginBottom: 10, letterSpacing: 2 },
  card: { backgroundColor: "#0d0d0d", borderWidth: 1, borderColor: "#222", padding: 12, marginBottom: 8, borderRadius: 5 },
  cardTitle: { color: "#fff", fontSize: 14, fontWeight: "bold", marginBottom: 4 },
  cardText: { color: "#aaa", fontSize: 12, lineHeight: 18 },
  stat: { backgroundColor: "#0d0d0d", padding: 12, marginBottom: 6, flexDirection: "row", justifyContent: "space-between" },
  statValue: { color: "#00ff88", fontWeight: "bold" },
  debugButton: { marginTop: 16, padding: 14, backgroundColor: "#333", alignItems: "center" },
});