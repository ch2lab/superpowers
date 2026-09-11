# superpowers (ch2lab fork) — OpenCode V2

Fork of [obra/superpowers](https://github.com/obra/superpowers) that adds an
**OpenCode V2 plugin** (`.opencode/plugins/superpowers-v2.js`). Upstream (through
v6.3.0) only ships a V1-style plugin, which OpenCode 2 refuses to load.

This fork changes exactly three files relative to upstream `dev`:

| File | Change |
|---|---|
| `.opencode/plugins/superpowers-v2.js` | new — V2 plugin: registers `skills/` via `ctx.skill.transform`, injects the `using-superpowers` bootstrap via `ctx.session.hook('prompt')` (self-healing after compaction) |
| `package.json` | `main` → `.opencode/plugins/superpowers-v2.js` |
| `V2-FORK-README.md` | new — this file |

Everything else (skills, V1 plugin for other harnesses, hooks) is untouched
upstream content, so rebasing onto upstream stays nearly conflict-free.

## Install (per machine)

`opencode.jsonc` (global `~/.config/opencode/opencode.jsonc` or project-level):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "superpowers@git+https://github.com/ch2lab/superpowers.git#main"
  ]
}
```

Restart OpenCode. The plugin registers all skills natively; no `skills` config
array and no symlinks needed.

Pin a specific commit instead of `#main` for stability:
`superpowers@git+https://github.com/ch2lab/superpowers.git#<sha>`.

Windows note: some OpenCode builds have issues with `git+https` package specs
(upstream documents this too). If the plugin fails to install, install with
system npm and point the config at the local path:

```powershell
npm install superpowers@git+https://github.com/ch2lab/superpowers.git#main --prefix "$HOME\.config\opencode"
```

```jsonc
{ "plugins": ["~/.config/opencode/node_modules/superpowers"] }
```

## Syncing with upstream

The fork tracks upstream `dev` (where active development happens).

```bash
git fetch upstream
git checkout v2
git merge upstream/dev     # conflicts expected: none (delta touches disjoint files)
git push fork v2:main
```

Machines pick up the new state by reinstalling/clearing the plugin cache
(`#main` moves; pinned SHAs need an explicit bump).

## When this fork can be retired

If upstream ships its own V2 plugin (watch `.opencode/` and `package.json` on
`upstream/dev`), delete `superpowers-v2.js`, restore `main` in `package.json`,
and move all machines back to the upstream package.
