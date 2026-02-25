module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "docs", "style", "refactor", "test", "chore", "revert"],
    ],
    "scope-enum": [
      2,
      "always",
      ["store", "api", "ui", "provider", "ci", "repo"],
    ],
    "subject-case": [0],
    "subject-empty": [2, "never"],
    "type-empty": [2, "never"],
  },
};
