# Gameplay configuration (POKÉ PORTAL)

Instances that run the POKÉ PORTAL mod (`wyzi-cobble-portal`) get a **Gameplay** tab in the portal.
It appears when `<instance>/config/wyzi-poke-portal/` exists.

| Section | File | What it holds |
|---|---|---|
| Quests | `quests.json` | daily / weekly / progression quests, daily count, daily-completion bonus |
| Achievements | `achievements.json` | one-time achievements by category |
| Prices | `portal.json` | Pokémon service prices (shiny, IV, EV, nature, ability, friendship) |
| | `spawn_boosts.json` | spawn / shiny / form boost offers, durations, prices, legendary cap |
| | `legendary_shop.json` | summoning items, price, region needed to unlock |
| Starter | `starter.json` | first-starter perks (shiny, IVs, hidden ability) and the one-time starter kit + CobbleDollars |
| Advanced | any of the above + `gym_tiers.json` | raw JSON editor |

Rewards and prices are whole CobbleDollar amounts stored as strings.

## Saving is live

**Save & apply** does the following:

1. Checks the shape (allow-listed file name, JSON type, required keys; quest IDs unique; rewards whole numbers).
2. Copies the current file to `<file>.portal-prev`.
3. Writes the new file atomically.
4. If the server is running, sends `poke reload` over RCON.

The mod validates every file on reload. For a file it rejects, the **previous valid settings stay active**. The editor shows the exact error and the "files rejected" badge.

The mod writes the per-file results to `_status.json`. They are also printed as `[wyzi-reload] <file> = ok|error: …` lines.

When the server is stopped, the files are saved and loaded at the next start; no restart is needed for any change.

In game, operators can run `/poke reload` for the same result.

## Permissions

The portal (group `wyziportal`) has read-only ACLs on the instance directory. Its only write access is a read/write ACL (plus default ACL) on `config/wyzi-poke-portal/`, set by `deploy/install-cobbleverse.sh`.

The portal API cannot read or write any other path. It never runs commands other than `poke reload`.
