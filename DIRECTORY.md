# Directory and deployment map

The repository root is split by purpose so runtime media, source media, and
unused material cannot be confused.

| Path | Purpose | Upload to SiteGround? |
| --- | --- | --- |
| `dist/` | Complete production build created by `npm run build` | **Yes — upload its contents only** |
| `public/` | Canonical browser-ready media copied into `dist/` by Vite | No; it is already included in `dist/` |
| `src/` | Game source code | No |
| `tools/` | Asset pipeline and validation scripts | No |
| `_source-assets/` | Large editable originals currently used by the asset pipeline | No |
| `_staging/unused/` | Unused media library, duplicate audio, and old logs | No |
| `node_modules/` | Local development dependencies | No |

## Runtime media

```text
public/
  assets/
    world/       city model
    vehicles/    playable vehicle models and rig metadata
    props/       prop packs and catalog
    district/    storefront/diorama models and textures
    food/        order-display models
  audio/
    music/       web-ready soundtrack MP3s
```

All browser references use these locations. Filenames are lowercase and
hyphenated where they are hand-managed. `BUDAE (Sizzle Hot)` is playlist entry
zero and a changed playlist resets to entry zero once, so existing local saves
also hear it first after this update.

## Local media

`_source-assets/` contains only inputs used to regenerate current runtime
assets. `_staging/unused/` is deliberately disconnected from code and build
scripts. Both directories are gitignored and should be backed up separately if
their originals need to be retained.

## SiteGround upload

Run:

```text
npm.cmd run build
npm.cmd run check
```

Then upload every item *inside* `dist/` directly into SiteGround's
`public_html`. Do not upload the outer `dist` folder or any other project
directory.
