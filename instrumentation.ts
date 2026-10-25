// Next.js calls register() once when a server instance starts.
export async function register() {
  // Only in the Node.js runtime: the code below uses the DB and the file system.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { resumeInterruptedWork } = await import("./src/lib/startup");
    // Not awaited: indexing can take long and must not delay startup.
    void resumeInterruptedWork();
  }
}
