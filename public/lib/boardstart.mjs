// Start-up on the proxy's board (/data/play/board.json): whether to use it, and
// what its file says that the home and the 彩券 card read. The file's
// own shape and age rule are the kit's (play-boardfile.mjs); nothing here
// prices a pick, places a bet or settles one.

// The file, with the kit that reads it, when it can be used now; null otherwise
// (missing, unreadable, older than 30 minutes, another shape version, or the
// kit's file not loading): start-up then runs as before, the saved board and
// the per-league reads.
// `packJson` hands back the device's copy of any age when the read fails, so
// the age is the file's own (`built`), never trust in the read.
export async function readBoard({ packJson, loadKit = () => import('../kit/play-boardfile.mjs'), timeout = 4_000, now = Date.now() } = {}) {
  try {
    const [file, mod] = await Promise.all([Promise.resolve().then(() => packJson('play/board.json', { ttl: 60_000, timeout })).catch(() => null), Promise.resolve().then(loadKit).catch(() => null)]);
    // (A board with no game is not one to open on: the phone's own read tells.)
    return file && mod?.boardUsable(file, now) && file.games.length ? { file, mod } : null;
  } catch {
    return null;
  }
}

// The lottery's feed, only when whole (the next draws and the jackpots carried
// over); with one part missing the phone's own two reads run.
export function boardLottery(file) {
  const lottery = file?.lottery;
  return lottery?.upcoming && lottery?.latest ? lottery : null;
}
