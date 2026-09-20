// Keep the successful server: never probe, close, and rebind a candidate.
export function bindRuntimePort<T>(
  start: (port: number) => T,
  minimum = 24000,
  maximum = 24999,
  pid = process.pid,
): T {
  const count = maximum - minimum + 1;
  if (
    !Number.isInteger(minimum) ||
    !Number.isInteger(maximum) ||
    minimum < 1 ||
    maximum > 65535 ||
    count < 1 ||
    !Number.isSafeInteger(pid) ||
    pid < 0
  ) {
    throw new Error("Invalid runtime port range or process ID");
  }
  for (let attempt = 0; attempt < count; attempt++) {
    const port = minimum + (((pid % count) + attempt) % count);
    try {
      return start(port);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "EADDRINUSE"
      )
        throw error;
    }
  }
  throw new Error(
    `Runtime HTTP port range ${String(minimum)}–${String(maximum)} exhausted`,
  );
}
