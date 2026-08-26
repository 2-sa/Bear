const SAFE_DIRECTORY = /^[a-zA-Z0-9._-]+$/;

export async function writeTempTextFile(
  directoryName: string,
  fileName: string,
  contents: string,
  options?: { persistent?: boolean },
): Promise<string> {
  if (!SAFE_DIRECTORY.test(directoryName)) throw new Error("Unsafe temporary directory name");
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
  if (!safeFileName || safeFileName === "." || safeFileName === "..") {
    throw new Error("Unsafe temporary file name");
  }
  const path = await import("@tauri-apps/api/path");
  const fs = await import("@tauri-apps/plugin-fs");
  const root = options?.persistent ? await path.appDataDir() : await path.tempDir();
  const directory = await path.join(root, directoryName);
  await fs.mkdir(directory, { recursive: true });
  const filePath = await path.join(directory, safeFileName);
  await fs.writeTextFile(filePath, contents);
  return filePath;
}
