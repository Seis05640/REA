import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** Root folder for Studio state: database, master key and job workspaces. */
export const studioHome = (env: NodeJS.ProcessEnv = process.env): string =>
  resolve(env.STUDIO_HOME || join(homedir(), ".rea-studio"));

export const studioPaths = (home: string = studioHome()) => ({
  home,
  database: join(home, "studio.db"),
  masterKey: join(home, "master.key"),
  jobs: join(home, "jobs"),
});
