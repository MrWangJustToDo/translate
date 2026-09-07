const baseLint = require("project-tool/baseLint");
const reactLint = require("project-tool/reactLint");

module.exports = [
  ...baseLint,
  {
    ignores: [
      "dist",
      "dev",
      "scripts",
      "node_modules",
      ".pnpm-store",
      ".output",
      ".wxt",
      "**/.wxt",
      "eslint.config.cjs",
      "tmp",
      "examples/extensions/**",
      ".agents/**",
    ],
  },
  {
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: [
            "./tsconfig.json",
            "./packages/core/tsconfig.json",
            "./packages/app/tsconfig.json",
            "./packages/cli/tsconfig.json",
            "./packages/node/tsconfig.json",
            "./packages/server/tsconfig.json",
            "./packages/extension/tsconfig.json",
            "./packages/mcp-server/tsconfig.json",
          ],
        },
      },
    },
  },
  {
    rules: {
      "max-lines": ["error", { max: 800, skipBlankLines: true }],
    },
  },
  // React config for app, cli, and extension packages
  {
    files: ["packages/app/src/**/*.{ts,tsx}", "packages/cli/src/**/*.{ts,tsx}", "packages/extension/**/*.{ts,tsx}"],
    ...reactLint.reduce((acc, config) => {
      return {
        ...acc,
        ...config,
        plugins: { ...acc.plugins, ...config.plugins },
        rules: { ...acc.rules, ...config.rules },
        settings: { ...acc.settings, ...config.settings },
      };
    }, {}),
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
  },
  // Node.js test files and validation scripts use console/setTimeout from node environment
  {
    files: [
      "packages/app/test/**",
      "packages/app/scripts/**",
      "packages/core/scripts/**",
      "packages/node/scripts/**",
      "packages/server/scripts/**",
      "packages/im-bridge/scripts/**",
    ],
    languageOptions: {
      globals: {
        console: "readonly",
        setTimeout: "readonly",
        URL: "readonly",
        process: "readonly",
        Buffer: "readonly",
        Response: "readonly",
      },
    },
    // validate scripts import their package's dist entry (e.g. ../dist/index.mjs);
    // the index.mjs segment is required for ESM resolution but trips the rule.
    rules: {
      "import/no-useless-path-segments": "off",
    },
  },
  // Relax rules for packages/app — uses reactivity-store patterns where:
  // - getActions() returns stable refs (exhaustive-deps false positives)
  // - refs are read during render for perf optimization
  // - async setState in effects is the intended pattern for initialization
  {
    files: ["packages/app/src/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Extension components also use async bootstrap patterns in effects
  {
    files: ["packages/extension/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
];
