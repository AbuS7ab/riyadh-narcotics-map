const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(
    path.join(__dirname, "..", "css", "style.css"),
    "utf8"
);

test("filter toolbar uses stable desktop sizing", () => {
    assert.match(
        css,
        /\.filter-toolbar\s*\{[\s\S]*?grid-template-columns:\s*minmax\(380px, 1fr\) repeat\(3, minmax\(180px, 340px\)\);[\s\S]*?align-items:\s*end;/
    );
    assert.match(
        css,
        /\.filter-toolbar > \.btn,[\s\S]*?height:\s*50px;[\s\S]*?min-height:\s*50px;/
    );
});

test("filter toolbar has deliberate tablet and mobile layouts", () => {
    assert.match(
        css,
        /@media \(max-width: 1280px\)[\s\S]*?body\.role-committee \.filter-toolbar\s*\{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/
    );
    assert.match(
        css,
        /@media \(max-width: 575\.98px\)[\s\S]*?body\.role-committee \.filter-toolbar\s*\{\s*grid-template-columns:\s*1fr;/
    );
});

test("empty export status does not reserve toolbar height", () => {
    assert.match(css, /\.model-b-export-message:empty\s*\{\s*display:\s*none;/);
});
