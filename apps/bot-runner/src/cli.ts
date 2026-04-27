export function requireFlag(argv: string[], flag: string): string {
  const flagIndex = argv.findIndex((arg) => arg === flag);

  if (flagIndex === -1) {
    throw new Error(`Missing required argument: ${flag} <value>`);
  }

  const value = argv[flagIndex + 1];
  if (!value) {
    throw new Error(`Missing value after ${flag}`);
  }

  return value;
}

export function optionalFlag(argv: string[], flag: string): string | undefined {
  const flagIndex = argv.findIndex((arg) => arg === flag);

  if (flagIndex === -1) {
    return undefined;
  }

  return argv[flagIndex + 1];
}
