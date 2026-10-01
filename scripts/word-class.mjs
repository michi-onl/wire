// Prints W_SET for src/rank.ts: the characters of [\p{L}\p{N}_] in the
// blocks below, as ranges. Python `\w` reads the same characters there.
//   node scripts/word-class.mjs
const BLOCKS = [
  [0x0000, 0x052f], // Latin, Greek, Cyrillic
  [0x3040, 0x9fff], // kana, CJK
  [0xac00, 0xd7a3], // Hangul
];
const word = /^[\p{L}\p{N}_]$/u;
const esc = (c) => (/[0-9A-Za-z_]/.test(String.fromCharCode(c))
  ? String.fromCharCode(c) : "\\u" + c.toString(16).toUpperCase().padStart(4, "0"));
const out = [];
for (const [lo, hi] of BLOCKS) {
  let start = -1;
  for (let c = lo; c <= hi + 1; c++) {
    const w = c <= hi && word.test(String.fromCharCode(c));
    if (w && start < 0) start = c;
    if (!w && start >= 0) {
      out.push(start === c - 1 ? esc(start) : `${esc(start)}-${esc(c - 1)}`);
      start = -1;
    }
  }
}
console.log(out.join(""));
