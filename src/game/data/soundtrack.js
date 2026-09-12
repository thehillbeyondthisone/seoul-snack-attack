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
// unlockDeliveries uses the existing persisted successful-delivery count.
// Dive is a separate event cue and never enters shuffle/next or the rack.

export const SOUNDTRACK = [
  { file: 'budae-sizzle-hot.mp3',  title: 'BUDAE (Sizzle Hot)' },
  { file: 'drop-it-red.mp3',       title: 'Drop It Red' },
  { file: 'drop-it-red-remix.mp3', title: 'Drop It Red (Remix)' },
  { file: 'calorie-bomb.mp3',      title: 'Calorie Bomb' },
  { file: 'crown-step.mp3',        title: 'Crown Step' },
  { file: 'sizzle.mp3',            title: 'Sizzle' },
  { file: 'countdown.mp3',         title: 'Countdown' },
  { file: 'abyssal-ramen-submarine.mp3', title: 'Abyssal Ramen Submarine', ko: '심해 라멘 잠수함', unlockDeliveries: 3 },
  { file: 'blade-of-hatred.mp3', title: 'Blade of Hatred', ko: '증오의 칼날', unlockDeliveries: 6 },
  { file: 'rapid-fire.mp3', title: 'Rapid-fire', ko: '래피드 파이어', unlockDeliveries: 9 },
  { file: 'supersonic.mp3', title: 'Supersonic', ko: '초음속', unlockDeliveries: 12 },
];

export const DIVE_TRACK = { file: 'dive.mp3', title: 'Dive', ko: '다이브' };
export const diveTrack = (base = '/') => ({ ...DIVE_TRACK, url: `${base}audio/music/${DIVE_TRACK.file}` });

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
  return SOUNDTRACK.map(({ file, ...meta }) => ({
    url: `${baseUrl}audio/music/${file}`,
    ...meta,
  }));
}
