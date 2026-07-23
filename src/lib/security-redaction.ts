const SECRET_FIELD =
  /(["']?(?:access_token|refresh_token|authorization|api[_-]?key|client_secret|token)["']?\s*[:=]\s*["']?)[^"',\s}&]+/gi;
const URL_SECRET =
  /([?&](?:access_token|refresh_token|authorization|api[_-]?key|client_secret|token|code)=)[^&#\s]+/gi;
const WINDOWS_PATH = /\b[A-Za-z]:\\(?:Users|Documents and Settings)\\[^ \n\r\t"'<>]+/gi;
const UNIX_HOME_PATH = /\/(?:home|Users)\/[^ \n\r\t"'<>]+/g;

export function redactDiagnosticText(value: unknown, maxLength = 600): string {
  return String(value ?? "")
    .replace(SECRET_FIELD, "$1[redacted]")
    .replace(URL_SECRET, "$1[redacted]")
    .replace(WINDOWS_PATH, "[local-path]")
    .replace(UNIX_HOME_PATH, "[local-path]")
    .slice(0, maxLength);
}
