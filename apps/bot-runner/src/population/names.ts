const WANDERER_NAMES = [
  "Zara", "Brin", "Corin", "Dex", "Elara", "Fyn", "Grex", "Hale",
  "Iona", "Jett", "Kael", "Lyra", "Mox", "Nixa", "Oryn", "Pax",
  "Quinn", "Rael", "Sera", "Tav", "Ula", "Vex", "Wren", "Xan",
  "Yael", "Zev", "Arden", "Blaze", "Cael", "Drew", "Eryn", "Flint",
  "Gwen", "Hex", "Idris", "Jax", "Kira", "Lorn", "Mael", "Nyx"
];

export function pickWandererName(usedNames: Set<string>): string {
  const available = WANDERER_NAMES.filter(n => !usedNames.has(n));
  if (available.length === 0) {
    // Fall back to numbered names when pool is exhausted
    let i = 1;
    while (usedNames.has(`Wander${i}`)) i++;
    return `Wander${i}`;
  }
  return available[Math.floor(Math.random() * available.length)] as string;
}
