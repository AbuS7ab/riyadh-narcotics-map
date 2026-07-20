const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.join(__dirname, "..");
const javascriptDirectory = path.join(projectRoot, "js");
const javascriptFiles = fs.readdirSync(javascriptDirectory)
    .filter(filename => filename.endsWith(".js"))
    .sort();

for (const filename of javascriptFiles) {

    const relativePath = path.join("js", filename);
    const result = spawnSync(
        process.execPath,
        ["--check", relativePath],
        {
            cwd: projectRoot,
            encoding: "utf8"
        }
    );

    if (result.status !== 0) {

        process.stderr.write(result.stderr || result.stdout);
        process.exit(result.status || 1);

    }

}

console.log(`JavaScript syntax check passed for ${javascriptFiles.length} files.`);
