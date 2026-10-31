# 5h burn

A Claude Code mod that puts a smoke above your prompt and burns it down as you use your
5-hour usage limit.

- **The burn is your limit.** The stick shortens as the 5-hour window is used up. The percent
  is printed on the filter (or the cigar's band, or the pipe's bowl): amber from 70%, a
  pulsing red from 90%. At 100% only the filter is left. When the window resets, a fresh one
  waits to be lit.
- **The model picks the smoke.** Fable gets a wizard's pipe that blows smoke rings, Opus a
  cigar, Sonnet a cigarette, Haiku a slim.
- **Effort is the heat.** Low is a thin thread of smoke; Max billows, with sparks from High up.
  It smokes harder while Claude is working.
- **Hover it to take a drag.** The ember flares and it exhales, and a card shows the reset
  countdown, the model and the effort.
- **Two hidden modes.** Max effort while Claude works throws an *inferno* of sparks. Put
  "ultrathink" in a prompt and the smoke goes *cosmic* for that turn: a violet nebula with stars.
- **A mini one in the footer**, beside the model name, drawn in block characters.
- **`/cigarette`** opens a bigger version in a side pane.

v2 redrew everything: matte paper and printed cork, a cigar with a mottled leaf, raised veins,
a capped head and a proper band, ash that builds up, a living ember, and smoke that rises as a
thin stream and breaks into curls. It also costs less to animate than v1.

The 5-hour reading comes from Claude's own responses, so it shows on a Claude subscription
and refreshes with each response in the session. Other sessions spend the same limit; when the
reading is more than ten minutes old, the hover card says how old it is.

## Install

At the prompt of a terminal session:

```
/plugin install cigarette --marketplace lazydevpro/claude-cigarette
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```
claude plugin install cigarette --marketplace lazydevpro/claude-cigarette
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then
**Plugins**, **Add marketplace** with `lazydevpro/claude-cigarette`, then **Add plugin**.

Already have v1? `claude plugin update cigarette`, then `/reload-plugins`.

Needs a Claude Code build with mods (function hooks), 2.1.309 or later. The mod API is in
early access and may change between releases.

## Develop

```
claude plugin validate .
claude plugin test .
```

The drawing is one pure function, `cigaretteSvg(look, layout)` in `hooks/cigarette.ts`; the
hooks module is `hooks/register.tsx`.
