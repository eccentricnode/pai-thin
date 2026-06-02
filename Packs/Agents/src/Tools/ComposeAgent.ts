#!/usr/bin/env bun

/**
 * ComposeAgent - Dynamic Agent Composition from Traits
 *
 * Composes specialized agents on-the-fly by combining traits.
 * Merges base traits (ships with PAI) with user customizations.
 *
 * Configuration files:
 *   Base:  ~/.claude/skills/Agents/Data/Traits.yaml
 *   User:  ~/.claude/PAI/USER/SKILLCUSTOMIZATIONS/Agents/Traits.yaml
 *
 * Usage:
 *   # Infer traits from task description
 *   bun run ComposeAgent.ts --task "Review this security architecture"
 *
 *   # Specify traits explicitly
 *   bun run ComposeAgent.ts --traits "security,skeptical,thorough"
 *
 *   # Output formats
 *   bun run ComposeAgent.ts --task "..." --output json
 *   bun run ComposeAgent.ts --task "..." --output prompt (default)
 *
 *   # List available traits
 *   bun run ComposeAgent.ts --list
 *
 * @version 2.0.0
 */

import { parseArgs } from "util";
import { readFileSync, existsSync, readdirSync, unlinkSync, mkdirSync, writeFileSync } from "fs";
import { parse as parseYaml } from "yaml";
import Handlebars from "handlebars";

// Paths
const HOME = process.env.HOME || "~";
const BASE_TRAITS_PATH = `${HOME}/.claude/skills/Agents/Data/Traits.yaml`;
const USER_TRAITS_PATH = `${HOME}/.claude/PAI/USER/SKILLCUSTOMIZATIONS/Agents/Traits.yaml`;
const TEMPLATE_PATH = `${HOME}/.claude/skills/Agents/Templates/DynamicAgent.hbs`;
const CUSTOM_AGENTS_DIR = `${HOME}/.claude/custom-agents`;

// Types
interface ProsodySettings {
  stability: number;
  similarity_boost: number;
  style: number;
  speed: number;
  use_speaker_boost: boolean;
  volume: number;
}

interface TraitDefinition {
  name: string;
  description: string;
  prompt_fragment?: string;
  keywords?: string[];
}

interface VoiceMapping {
  traits: string[];
  voice: string;
  voice_id?: string;
  reason?: string;
}

interface VoiceRegistryEntry {
  voice_id: string;
  characteristics: string[];
  description: string;
  prosody?: ProsodySettings;
  // Legacy flat fields (for backwards compatibility)
  stability?: number;
  similarity_boost?: number;
}

interface TraitsData {
  expertise: Record<string, TraitDefinition>;
  personality: Record<string, TraitDefinition>;
  approach: Record<string, TraitDefinition>;
  voice_mappings: {
    default: string;
    default_voice_id: string;
    voice_registry: Record<string, VoiceRegistryEntry>;
    mappings: VoiceMapping[];
    fallbacks: Record<string, string>;
  };
  examples: Record<string, { description: string; traits: string[] }>;
}

interface ComposedAgent {
  name: string;
  traits: string[];
  expertise: TraitDefinition[];
  personality: TraitDefinition[];
  approach: TraitDefinition[];
  voice: string;
  voiceId: string;
  voiceReason: string;
  voiceSettings: ProsodySettings;
  color: string;
  prompt: string;
}

// Color palette for custom agents - vibrant, distinguishable colors
const AGENT_COLOR_PALETTE = [
  "#FF6B35", // Coral Orange
  "#4ECDC4", // Teal
  "#9B59B6", // Purple
  "#2ECC71", // Emerald
  "#E74C3C", // Red
  "#3498DB", // Blue
  "#F39C12", // Orange
  "#1ABC9C", // Turquoise
  "#E91E63", // Pink
  "#00BCD4", // Cyan
  "#8BC34A", // Light Green
  "#FF5722", // Deep Orange
  "#673AB7", // Deep Purple
  "#009688", // Teal Dark
  "#FFC107", // Amber
];

// Default prosody settings
const DEFAULT_PROSODY: ProsodySettings = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0,
  speed: 1.0,
  use_speaker_boost: true,
  volume: 0.8,
};

/**
 * Deep merge two objects (user overrides base)
 */
function deepMerge<T extends Record<string, unknown>>(base: T, user: Partial<T>): T {
  const result = { ...base };

  for (const key of Object.keys(user) as (keyof T)[]) {
    const userVal = user[key];
    const baseVal = base[key];

    if (
      userVal !== undefined &&
      typeof userVal === "object" &&
      userVal !== null &&
      !Array.isArray(userVal) &&
      typeof baseVal === "object" &&
      baseVal !== null &&
      !Array.isArray(baseVal)
    ) {
      // Recursively merge objects
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        userVal as Record<string, unknown>
      ) as T[keyof T];
    } else if (userVal !== undefined) {
      // User value overrides base
      result[key] = userVal as T[keyof T];
    }
  }

  return result;
}

/**
 * Merge arrays by concatenating (for mappings)
 */
function mergeArrays<T>(base: T[], user: T[]): T[] {
  return [...base, ...user];
}

/**
 * Load and merge traits from base + user YAML files
 */
function loadTraits(): TraitsData {
  // Load base traits (required)
  if (!existsSync(BASE_TRAITS_PATH)) {
    console.error(`Error: Base traits file not found at ${BASE_TRAITS_PATH}`);
    process.exit(1);
  }
  const baseContent = readFileSync(BASE_TRAITS_PATH, "utf-8");
  const base = parseYaml(baseContent) as TraitsData;

  // Load user traits (optional)
  if (existsSync(USER_TRAITS_PATH)) {
    const userContent = readFileSync(USER_TRAITS_PATH, "utf-8");
    const user = parseYaml(userContent) as Partial<TraitsData>;

    // Merge each section
    const merged: TraitsData = {
      expertise: deepMerge(base.expertise || {}, user.expertise || {}),
      personality: deepMerge(base.personality || {}, user.personality || {}),
      approach: deepMerge(base.approach || {}, user.approach || {}),
      voice_mappings: {
        default: user.voice_mappings?.default || base.voice_mappings?.default || "{PRINCIPAL.NAME}",
        default_voice_id:
          user.voice_mappings?.default_voice_id ||
          base.voice_mappings?.default_voice_id ||
          "",
        voice_registry: deepMerge(
          base.voice_mappings?.voice_registry || {},
          user.voice_mappings?.voice_registry || {}
        ),
        mappings: mergeArrays(
          base.voice_mappings?.mappings || [],
          user.voice_mappings?.mappings || []
        ),
        fallbacks: deepMerge(
          base.voice_mappings?.fallbacks || {},
          user.voice_mappings?.fallbacks || {}
        ),
      },
      examples: deepMerge(base.examples || {}, user.examples || {}),
    };

    return merged;
  }

  return base;
}

/**
 * Load and compile the agent template
 */
function loadTemplate(): HandlebarsTemplateDelegate {
  if (!existsSync(TEMPLATE_PATH)) {
    console.error(`Error: Template file not found at ${TEMPLATE_PATH}`);
    process.exit(1);
  }
  const content = readFileSync(TEMPLATE_PATH, "utf-8");
  return Handlebars.compile(content);
}

/**
 * Infer appropriate traits from a task description
 */
function inferTraitsFromTask(task: string, traits: TraitsData): string[] {
  const inferred: string[] = [];
  const taskLower = task.toLowerCase();

  // Check expertise keywords
  for (const [key, def] of Object.entries(traits.expertise)) {
    if (def.keywords?.some((kw) => taskLower.includes(kw.toLowerCase()))) {
      inferred.push(key);
    }
  }

  // Check personality keywords
  for (const [key, def] of Object.entries(traits.personality)) {
    if (def.keywords?.some((kw) => taskLower.includes(kw.toLowerCase()))) {
      inferred.push(key);
    }
  }

  // Check approach keywords
  for (const [key, def] of Object.entries(traits.approach)) {
    if (def.keywords?.some((kw) => taskLower.includes(kw.toLowerCase()))) {
      inferred.push(key);
    }
  }

  // Apply smart defaults if categories are missing
  const hasExpertise = inferred.some((t) => traits.expertise[t]);
  const hasPersonality = inferred.some((t) => traits.personality[t]);
  const hasApproach = inferred.some((t) => traits.approach[t]);

  if (!hasPersonality) inferred.push("analytical");
  if (!hasApproach) inferred.push("thorough");
  if (!hasExpertise) inferred.push("research");

  return [...new Set(inferred)];
}

/**
 * Get prosody settings from voice registry entry
 */
function getProsody(entry: VoiceRegistryEntry | undefined): ProsodySettings {
  if (!entry) return DEFAULT_PROSODY;

  // Check for new prosody object first
  if (entry.prosody) {
    return {
      stability: entry.prosody.stability ?? DEFAULT_PROSODY.stability,
      similarity_boost: entry.prosody.similarity_boost ?? DEFAULT_PROSODY.similarity_boost,
      style: entry.prosody.style ?? DEFAULT_PROSODY.style,
      speed: entry.prosody.speed ?? DEFAULT_PROSODY.speed,
      use_speaker_boost: entry.prosody.use_speaker_boost ?? DEFAULT_PROSODY.use_speaker_boost,
      volume: (entry.prosody as any).volume ?? DEFAULT_PROSODY.volume,
    };
  }

  // Fall back to legacy flat fields
  return {
    stability: entry.stability ?? DEFAULT_PROSODY.stability,
    similarity_boost: entry.similarity_boost ?? DEFAULT_PROSODY.similarity_boost,
    style: DEFAULT_PROSODY.style,
    speed: DEFAULT_PROSODY.speed,
    use_speaker_boost: DEFAULT_PROSODY.use_speaker_boost,
    volume: DEFAULT_PROSODY.volume,
  };
}

/**
 * Resolve voice based on trait combination
 */
function resolveVoice(
  traitKeys: string[],
  traits: TraitsData
): { voice: string; voiceId: string; reason: string; voiceSettings: ProsodySettings } {
  const mappings = traits.voice_mappings;
  const registry = mappings.voice_registry || {};

  const getVoiceId = (voiceName: string, fallbackId?: string): string => {
    if (registry[voiceName]?.voice_id) {
      return registry[voiceName].voice_id;
    }
    return fallbackId || mappings.default_voice_id || "";
  };

  // Check explicit combination mappings first
  const matchedMappings = mappings.mappings
    .map((m) => ({
      ...m,
      matchCount: m.traits.filter((t) => traitKeys.includes(t)).length,
      isFullMatch: m.traits.every((t) => traitKeys.includes(t)),
    }))
    .filter((m) => m.isFullMatch)
    .sort((a, b) => b.matchCount - a.matchCount);

  if (matchedMappings.length > 0) {
    const best = matchedMappings[0];
    const voiceName = best.voice;
    return {
      voice: voiceName,
      voiceId: best.voice_id || getVoiceId(voiceName),
      reason: best.reason || `Matched traits: ${best.traits.join(", ")}`,
      voiceSettings: getProsody(registry[voiceName]),
    };
  }

  // Check fallbacks
  for (const trait of traitKeys) {
    if (mappings.fallbacks[trait]) {
      const voiceName = mappings.fallbacks[trait];
      const voiceIdKey = `${trait}_voice_id`;
      const fallbackVoiceId = mappings.fallbacks[voiceIdKey] as string | undefined;
      return {
        voice: voiceName,
        voiceId: fallbackVoiceId || getVoiceId(voiceName),
        reason: `Fallback for trait: ${trait}`,
        voiceSettings: getProsody(registry[voiceName]),
      };
    }
  }

  // Default
  return {
    voice: mappings.default,
    voiceId: mappings.default_voice_id || "",
    reason: "Default voice (no specific mapping matched)",
    voiceSettings: getProsody(registry[mappings.default]),
  };
}

/**
 * Generate a unique color for an agent based on trait combination
 * Uses a hash of the sorted traits to ensure consistent color per combination
 */
function generateAgentColor(traitKeys: string[]): string {
  // Create a hash from the sorted traits
  const sortedTraits = [...traitKeys].sort().join(",");
  let hash = 0;
  for (let i = 0; i < sortedTraits.length; i++) {
    const char = sortedTraits.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Use absolute value and modulo to get palette index
  const index = Math.abs(hash) % AGENT_COLOR_PALETTE.length;
  return AGENT_COLOR_PALETTE[index];
}

/**
 * Compose an agent from traits
 */
function composeAgent(
  traitKeys: string[],
  task: string,
  traits: TraitsData,
  timing?: string
): ComposedAgent {
  const expertise: TraitDefinition[] = [];
  const personality: TraitDefinition[] = [];
  const approach: TraitDefinition[] = [];

  for (const key of traitKeys) {
    if (traits.expertise[key]) expertise.push(traits.expertise[key]);
    if (traits.personality[key]) personality.push(traits.personality[key]);
    if (traits.approach[key]) approach.push(traits.approach[key]);
  }

  const nameParts: string[] = [];
  if (expertise.length) nameParts.push(expertise[0].name);
  if (personality.length) nameParts.push(personality[0].name);
  if (approach.length) nameParts.push(approach[0].name);
  const name = nameParts.length > 0 ? nameParts.join(" ") : "Dynamic Agent";

  const { voice, voiceId, reason: voiceReason, voiceSettings } = resolveVoice(traitKeys, traits);
  const color = generateAgentColor(traitKeys);

  // Compute timing data for template
  const validTimings = ['fast', 'standard', 'deep'];
  const timingValue = timing && validTimings.includes(timing) ? timing : undefined;
  const timingData = timingValue ? {
    timing: timingValue,
    isFast: timingValue === 'fast',
    isStandard: timingValue === 'standard',
    isDeep: timingValue === 'deep',
  } : {};

  const template = loadTemplate();
  const prompt = template({
    name,
    task,
    expertise,
    personality,
    approach,
    voice,
    voiceId,
    voiceSettings,
    color,
    ...timingData,
  });

  return {
    name,
    traits: traitKeys,
    expertise,
    personality,
    approach,
    voice,
    voiceId,
    voiceReason,
    voiceSettings,
    color,
    prompt,
  };
}

/**
 * List all available traits
 */
function listTraits(traits: TraitsData): void {
  console.log("AVAILABLE TRAITS (base + user merged)\n");

  console.log("EXPERTISE (domain knowledge):");
  for (const [key, def] of Object.entries(traits.expertise)) {
    console.log(`  ${key.padEnd(15)} - ${def.name}`);
  }

  console.log("\nPERSONALITY (behavior style):");
  for (const [key, def] of Object.entries(traits.personality)) {
    console.log(`  ${key.padEnd(15)} - ${def.name}`);
  }

  console.log("\nAPPROACH (work style):");
  for (const [key, def] of Object.entries(traits.approach)) {
    console.log(`  ${key.padEnd(15)} - ${def.name}`);
  }

  console.log("\nVOICES AVAILABLE:");
  const registry = traits.voice_mappings?.voice_registry || {};
  for (const [name, entry] of Object.entries(registry)) {
    const prosody = getProsody(entry);
    console.log(`  ${name.padEnd(12)} - ${entry.description}`);
    console.log(`               stability:${prosody.stability} style:${prosody.style} speed:${prosody.speed} volume:${prosody.volume}`);
  }

  if (traits.examples && Object.keys(traits.examples).length > 0) {
    console.log("\nEXAMPLE COMPOSITIONS:");
    for (const [key, example] of Object.entries(traits.examples)) {
      console.log(`  ${key.padEnd(18)} - ${example.description}`);
      console.log(`                      traits: ${example.traits.join(", ")}`);
    }
  }
}

/**
 * Generate a URL-safe slug from a name
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/**
 * Save a composed agent to ~/.claude/custom-agents/{slug}.md
 *
 * Produces a CLAUDE CODE COMPATIBLE agent file that can be:
 * 1. Copied to ~/.claude/agents/ and used as a built-in agent
 * 2. Loaded via --load for re-composition with a new task
 *
 * The body is a complete system prompt matching built-in agent format.
 */
function saveAgent(agent: ComposedAgent): string {
  mkdirSync(CUSTOM_AGENTS_DIR, { recursive: true });

  const slug = slugify(agent.name);
  const filePath = `${CUSTOM_AGENTS_DIR}/${slug}.md`;
  const today = new Date().toISOString().split("T")[0];

  // Generate meaningful persona title from traits (e.g., "The Skeptical Security Expert")
  const titleParts: string[] = [];
  if (agent.personality.length) titleParts.push(agent.personality[0].name);
  if (agent.expertise.length) titleParts.push(agent.expertise[0].name);
  const personaTitle =
    titleParts.length > 0 ? "The " + titleParts.join(" ") : "Custom Specialist";

  // Generate meaningful background from trait descriptions (flatten newlines for YAML)
  const flatten = (s: string) => s.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  const bgParts: string[] = [];
  for (const e of agent.expertise) bgParts.push(flatten(e.description));
  for (const p of agent.personality) bgParts.push(flatten(p.description));
  for (const a of agent.approach) bgParts.push(flatten(a.description));
  const personaBackground =
    bgParts
      .join(". ")
      .replace(/\.\./g, ".")
      .replace(/\. *$/, "") + "." || "Composed specialist agent.";

  // Generate meaningful description
  const expertiseNames = agent.expertise.map((e) => e.name);
  const personalityNames = agent.personality.map((p) => p.name.toLowerCase());
  const description =
    expertiseNames.length > 0
      ? `${agent.name} — ${expertiseNames.join(" and ")} with ${personalityNames.join(", ")} approach.`
      : `${agent.name} — custom agent with ${personalityNames.join(", ")} approach.`;

  // Build Claude Code compatible body
  const body = buildSavedAgentBody(agent, personaTitle, slug);

  const content = `---
name: "${agent.name}"
description: "${description.replace(/"/g, '\\"')}"
model: opus
color: "${agent.color}"
voiceId: "${agent.voiceId}"
voice:
  stability: ${agent.voiceSettings.stability}
  similarity_boost: ${agent.voiceSettings.similarity_boost}
  style: ${agent.voiceSettings.style}
  speed: ${agent.voiceSettings.speed}
  use_speaker_boost: ${agent.voiceSettings.use_speaker_boost}
  volume: ${agent.voiceSettings.volume}
persona:
  name: "${agent.name}"
  title: "${personaTitle.replace(/"/g, '\\"')}"
  background: "${personaBackground.replace(/"/g, '\\"')}"
custom_agent: true
created: "${today}"
traits: [${agent.traits.map((t) => `"${t}"`).join(", ")}]
source: "ComposeAgent"
permissions:
  allow:
    - "Bash"
    - "Read(*)"
    - "Write(*)"
    - "Edit(*)"
    - "MultiEdit(*)"
    - "Grep(*)"
    - "Glob(*)"
    - "WebFetch(domain:*)"
    - "WebSearch"
    - "mcp__*"
    - "TodoWrite(*)"
---

${body}
`;

  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

/**
 * Build a Claude Code compatible agent body (system prompt).
 *
 * Matches the structural format of built-in agents in ~/.claude/agents/*.md:
 * - Character heading with name and archetype
 * - Domain expertise, personality, approach sections
 * - Startup sequence, voice notifications, output format
 * - Core identity and key practices
 */
function buildSavedAgentBody(
  agent: ComposedAgent,
  personaTitle: string,
  slug: string
): string {
  const vs = agent.voiceSettings;

  const expertiseBlock = agent.expertise.length
    ? agent.expertise
        .map((e) => `### ${e.name}\n\n${e.description}`)
        .join("\n\n")
    : "";

  const personalityBlock = agent.personality.length
    ? agent.personality
        .map((p) => `- **${p.name}**: ${p.description}`)
        .join("\n")
    : "";

  const approachBlock = agent.approach.length
    ? agent.approach.map((a) => `- **${a.name}**: ${a.description}`).join("\n")
    : "";

  const identityList = [
    ...agent.expertise.map((e) => `- **${e.name}**: ${e.description}`),
    ...agent.personality.map((p) => `- **${p.name}**: ${p.description}`),
  ].join("\n");

  const combinedList = [
    ...agent.expertise.map((e) => `- ${e.name}`),
    ...agent.personality.map((p) => `- ${p.name} approach`),
    ...agent.approach.map((a) => `- ${a.name} methodology`),
  ].join("\n");

  return `# Character: ${agent.name} — "${personaTitle}"

**Real Name**: ${agent.name}
**Character Archetype**: "${personaTitle}"
**Voice Settings**: Stability ${vs.stability}, Similarity Boost ${vs.similarity_boost}, Speed ${vs.speed}

${expertiseBlock ? `## Domain Expertise\n\n${expertiseBlock}\n` : ""}
## Personality

${personalityBlock}

## Working Approach

${approachBlock}

---

# 🚨 MANDATORY STARTUP SEQUENCE - DO THIS FIRST 🚨

**BEFORE ANY WORK, YOU MUST:**

1. **Send voice notification that you're loading:**
\`\`\`bash