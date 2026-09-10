// Seoul Snack Attack — car stereo playlist.
//
// THIS ARRAY IS THE PLAY ORDER. Move a line to move the track; the stereo plays
// top to bottom and NEXT/PREV walk this list. The first entry is what starts
// when the player unlocks audio, so whatever you want heard first goes first.
//
// To add a track:
//   1. put the .mp3 in public/audio/music/  <- the SOURCE. Not dist/.
//      dist/audio/music/ is generated, and `npm run build` empties it, so a
//      file that lives only there is deleted by the next build.
//   2. lowercase-and-hyphens for the filename — it becomes part of a URL.
//   3. add a line below, in the position you want it played.
//
// `file` is the name inside public/audio/music/; `title` is what the HUD shows.
//
// BONUS-TRACK HOOK (not yet implemented): a track may carry `locked: true` —
// the cassette deck then renders its tape card dimmed and refuses to insert it
// until an unlocking system (progression, codes, saves) starts clearing that
// flag. Nothing sets `locked` today; it is reserved by convention.

export const SOUNDTRACK = [
  { file: 'budae-sizzle-hot.mp3',  title: 'BUDAE (Sizzle Hot)' },
  { file: 'drop-it-red.mp3',       title: 'Drop It Red' },
  { file: 'drop-it-red-remix.mp3', title: 'Drop It Red (Remix)' },
  { file: 'calorie-bomb.mp3',      title: 'Calorie Bomb' },
  { file: 'crown-step.mp3',        title: 'Crown Step' },
  { file: 'sizzle.mp3',            title: 'Sizzle' },
  { file: 'supersonic-fire.mp3',   title: 'Supersonic Fire' },
  { file: 'rapid-fire-cover.mp3',  title: 'Rapid Fire (Cover)' },
  { file: 'countdown.mp3',         title: 'Countdown' },
];

/**
 * Resolve the playlist against the Vite base path.
 *
 * Kept here rather than at the call site so the array above stays pure data —
 * a list anyone can reorder without knowing what `import.meta.env.BASE_URL` is
 * or why it matters (it is what makes the game work when served from a
 * subdirectory rather than a domain root).
 *
 * @param {string} baseUrl typically `import.meta.env.BASE_URL`
 */
export function soundtrackTracks(baseUrl = '/') {
  // `locked` passes through untouched so the deck's bonus-track hook sees it.
  return SOUNDTRACK.map(({ file, title, locked }) => ({
    url: `${baseUrl}audio/music/${file}`,
    title,
    ...(locked ? { locked: true } : {}),
  }));
}
