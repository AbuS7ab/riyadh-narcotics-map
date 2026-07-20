const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const runner = path.join(__dirname, "..", "scripts", "run-staging-authorization.mjs");
const completeEnvironment = {
    ...process.env,
    STAGING_CONFIRMATION: "narco-compliance-staging",
    SUPABASE_STAGING_URL: "https://stagingexample.supabase.co",
    SUPABASE_STAGING_ANON_KEY: "test-key",
    STAGING_ADMIN_EMAIL: "admin@example.test",
    STAGING_ADMIN_PASSWORD: "test-password",
    STAGING_COMMITTEE_A_EMAIL: "committee-a@example.test",
    STAGING_COMMITTEE_A_PASSWORD: "test-password",
    STAGING_COMMITTEE_B_EMAIL: "committee-b@example.test",
    STAGING_COMMITTEE_B_PASSWORD: "test-password",
    STAGING_VIEWER_EMAIL: "viewer@example.test",
    STAGING_VIEWER_PASSWORD: "test-password"
};

test("staging authorization runner refuses the production Supabase project", () => {
    const result = spawnSync(process.execPath, [runner], {
        cwd: path.join(__dirname, ".."),
        env: {
            ...completeEnvironment,
            SUPABASE_STAGING_URL: "https://gzrdvjpzxaslvqbxloal.supabase.co"
        },
        encoding: "utf8"
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /refusing to run authorization tests against the production/i);
});

test("staging authorization runner requires an explicit staging confirmation", () => {
    const result = spawnSync(process.execPath, [runner], {
        cwd: path.join(__dirname, ".."),
        env: {
            ...completeEnvironment,
            STAGING_CONFIRMATION: ""
        },
        encoding: "utf8"
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /STAGING_CONFIRMATION=narco-compliance-staging/);
});
