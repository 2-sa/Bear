const SAFE_DIRECTORY = /^[a-zA-Z0-9._-]+$/;

async function writeScopedTextFile(
  root: string,
  directoryName: string,
  fileName: string,
  contents: string,
): Promise<string> {
  if (!SAFE_DIRECTORY.test(directoryName)) throw new Error("Unsafe temporary directory name");
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
  if (!safeFileName || safeFileName === "." || safeFileName === "..") {
    throw new Error("Unsafe temporary file name");
  }
  const path = await import("@tauri-apps/api/path");
  const fs = await import("@tauri-apps/plugin-fs");
  const directory = await path.join(root, directoryName);
  await fs.mkdir(directory, { recursive: true });
  const filePath = await path.join(directory, safeFileName);
  await fs.writeTextFile(filePath, contents);
  return filePath;
}

export async function writeTempTextFile(
  directoryName: string,
  fileName: string,
  contents: string,
): Promise<string> {
  const path = await import("@tauri-apps/api/path");
  return writeScopedTextFile(await path.tempDir(), directoryName, fileName, contents);
}

export async function writeAppDataTextFile(
  directoryName: string,
  fileName: string,
  contents: string,
): Promise<string> {
  const path = await import("@tauri-apps/api/path");
  return writeScopedTextFile(await path.appDataDir(), directoryName, fileName, contents);
}
