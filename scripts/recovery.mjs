import { parseArgs } from "node:util";
import {
  createBackup,
  generateRecoveryKey,
  restoreBackup,
} from "../server/recovery.mjs";

const help = `Offline recovery commands (explicit paths; no key values on the command line):
  node scripts/recovery.mjs keygen --recovery-key /private/key-folder/recovery.key
  node scripts/recovery.mjs backup --data /private/data-folder --master-key /private/data-folder/master.key --recovery-key /private/key-folder/recovery.key --archive /private/archive-folder/backup.enc
  node scripts/recovery.mjs restore --archive /private/archive-folder/backup.enc --recovery-key /private/key-folder/recovery.key --destination /private/restore-parent/NEW-directory
Directories must already exist with mode 0700; restore creates only its NEW destination.
Backups contain the database and master key, NOT environment credentials or loose exports.
Keep the recovery key separate and offline. Read docs/SECURITY-RECOVERY.md before real use.`;
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      data: { type: "string" },
      "master-key": { type: "string" },
      "recovery-key": { type: "string" },
      archive: { type: "string" },
      destination: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) console.log(help);
  else {
    const command = positionals[0];
    const required = {
      keygen: ["recovery-key"],
      backup: ["data", "master-key", "recovery-key", "archive"],
      restore: ["archive", "recovery-key", "destination"],
    }[command];
    if (
      positionals.length !== 1 ||
      !required ||
      required.some((k) => !values[k]) ||
      Object.keys(values).some((k) => !required.includes(k))
    )
      throw new Error(help);
    const result =
      command === "keygen"
        ? generateRecoveryKey(values["recovery-key"])
        : command === "backup"
          ? await createBackup({
              dataDirectory: values.data,
              masterKeyFile: values["master-key"],
              recoveryKeyFile: values["recovery-key"],
              archiveFile: values.archive,
            })
          : restoreBackup({
              archiveFile: values.archive,
              recoveryKeyFile: values["recovery-key"],
              destination: values.destination,
            });
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  // Never echo archive contents or credential values, including SQLite diagnostics.
  console.error(
    error.message === help
      ? help
      : "Recovery failed. Check paths, private permissions, key and archive integrity. No existing destination was overwritten.",
  );
  process.exitCode = 1;
}
