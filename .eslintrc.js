module.exports = {
  "extends": "airbnb-base",
  "parser": "@typescript-eslint/parser",
  "plugins": [
    "googleappsscript",
    "jasmine",
    "@typescript-eslint",
  ],
  "env": {
    "googleappsscript/googleappsscript": true,
    "jasmine": true,
  },
  "rules": {
    "no-console": 0, // console.log is our best logging method
    "no-unused-vars": [
      "error", { argsIgnorePattern: '^_$' }
    ]
  },
  "settings": {
    "import/parsers": {
      "@typescript-eslint/parser": [".ts", ".tsx"]
    },
    "import/resolver": {
      // use <root>/tsconfig.json
      "typescript": {},
    }
  }
};
