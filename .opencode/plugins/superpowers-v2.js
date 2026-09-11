/**
 * Superpowers plugin for OpenCode V2.
 *
 * The V1 plugin (superpowers.js) uses the legacy V1 plugin API (named export +
 * experimental.chat.messages.transform), which OpenCode 2 refuses to load
 * ("Plugin must export a default definition with an id and an effect or setup
 * function"). This file is the V2 equivalent and does the same two jobs:
 *
 *   1. Register all skills from the co-located skills/ directory via
 *      ctx.skill.transform (V2 native skill discovery — no config edits needed).
 *   2. Inject the using-superpowers bootstrap at request time via the
 *      "context" session hook. Like the V1 plugin, this is NOT persisted: the
 *      outgoing model request carries the bootstrap in its system instructions,
 *      but the conversation history is never modified, so nothing appears in
 *      the TUI/session log and there is no visible mid-session injection.
 *      Because the hook runs before every agent-loop model call, it also
 *      self-heals: if the bootstrap disappears from context (e.g. after
 *      compaction), the next model call silently carries it again.
 *
 * Fork-local addition: it only exists while upstream has no V2 plugin. If
 * upstream ships one, delete this file and restore package.json `main` to the
 * upstream entry.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.resolve(__dirname, '../../skills');
const MARKER = 'You have superpowers.';

/** Extract {frontmatter, body} from SKILL.md content. */
function parseSkill(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: content };
  const frontmatter = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) {
      const key = line.slice(0, i).trim();
      const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (key) frontmatter[key] = value;
    }
  }
  return { frontmatter, body: m[2] };
}

// ---- bootstrap (cached; SKILL.md does not change during a session) ----
let bootstrapCache; // undefined = not yet loaded, null = unavailable

function getBootstrap() {
  if (bootstrapCache !== undefined) return bootstrapCache;
  try {
    const { body } = parseSkill(
      fs.readFileSync(path.join(SKILLS_DIR, 'using-superpowers', 'SKILL.md'), 'utf8'),
    );
    const toolMapping = `**Tool Mapping for OpenCode:**
When skills request actions, substitute OpenCode equivalents:
- Create or update todos → \`todowrite\`
- \`Subagent (general-purpose):\` → \`subagent\` with \`agent: "general"\` (or \`"explore"\` for codebase exploration)
- Invoke a skill → OpenCode's native \`skill\` tool
- Read files → \`read\`
- Create, edit, or delete files → \`edit\` / \`write\`
- Run shell commands → \`shell\`
- Search files → \`grep\`, \`glob\`
- Fetch a URL → \`webfetch\`

Use OpenCode's native \`skill\` tool to list and load skills.`;
    bootstrapCache = `<EXTREMELY_IMPORTANT>
${MARKER}

**IMPORTANT: The using-superpowers skill content is included below. It is ALREADY LOADED - you are currently following it. Do NOT use the skill tool to load "using-superpowers" again - that would be redundant.**

${body}

${toolMapping}
</EXTREMELY_IMPORTANT>`;
  } catch {
    bootstrapCache = null;
  }
  return bootstrapCache;
}

/** Read all skills from the co-located skills/ directory. */
function discoverSkills() {
  const skills = [];
  for (const entry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(SKILLS_DIR, entry.name, 'SKILL.md');
    let raw;
    try {
      raw = fs.readFileSync(skillPath, 'utf8');
    } catch {
      continue; // no SKILL.md in this directory
    }
    const { frontmatter } = parseSkill(raw);
    const name = frontmatter.name || entry.name;
    skills.push({
      id: name.toLowerCase(),
      name,
      description: frontmatter.description || '',
      location: skillPath,
      content: raw,
    });
  }
  return skills;
}

export default {
  id: 'superpowers-v2',
  async setup(ctx) {
    // 1) Register skills with the V2 skill system
    try {
      const skills = discoverSkills();
      await ctx.skill.transform((editor) => {
        for (const s of skills) editor.add(s);
      });
    } catch (err) {
      console.warn(`[superpowers-v2] skill auto-registration failed: ${err.message}`);
      console.warn(`[superpowers-v2] fallback: add "skills": ["${SKILLS_DIR}"] to opencode.jsonc`);
    }

    // 2) Bootstrap injection — request-time, non-persistent (V1-equivalent)
    const bootstrap = getBootstrap();
    if (!bootstrap) {
      console.warn('[superpowers-v2] bootstrap unavailable (using-superpowers/SKILL.md missing); injection disabled');
      return;
    }
    // Runs before every agent-loop model call; the edit applies only to the
    // outgoing request, not to persisted history. Skip when the session
    // already carries the bootstrap in its messages (e.g. sessions created
    // by the legacy prompt-hook bridge, which persisted it into the first
    // user message) to avoid a double dose.
    await ctx.session.hook('context', (event) => {
      try {
        if (event.messages.some((m) => JSON.stringify(m).includes(MARKER))) return;
        event.system.push({ text: bootstrap });
      } catch {
        // never break a model call over bootstrap injection
      }
    });
  },
};
